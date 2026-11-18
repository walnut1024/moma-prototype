import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { startLocalBackend } from '../database/local-runtime.js';

const password = 'Test@' + randomBytes(12).toString('hex');
const hash = createHash('sha256').update(password).digest('hex');
let local;
before(async () => {
  local = await startLocalBackend({ demo:true, loginHashes:{'admin-001':hash,'admin-002':hash,'tenant-gov':hash} });
}, { timeout:30000 });
after(async () => { await local?.runtime.dispose(); });

async function request(path, { method='GET', body, cookie } = {}) {
  const response = await local.runtime.dispatchFetch('https://moma.test/api/5120' + path, { method,
    headers:{ ...(cookie ? {cookie} : {}), ...(method === 'POST' ? {'origin':'https://moma.test','x-moma-request':'1','content-type':'application/json'} : {}) },
    ...(body === undefined ? {} : {body:JSON.stringify(body)}) });
  return {status:response.status, data:await response.json(), cookies:response.headers.getSetCookie()};
}
async function signIn(identifier, cookie) {
  const result = await request('/auth/sign-in', {method:'POST', body:{identifier,accessCode:password}, cookie});
  assert.equal(result.status,200,JSON.stringify(result.data));
  return {...result, cookie:result.cookies.find(value => !value.includes('Max-Age=0')).split(';')[0]};
}

test('one sign-in cookie authorizes every backend module and preserves server identity', async () => {
  const login = await signIn('admin-001');
  assert.equal(login.data.account.loginCode,'admin-001');
  for (const path of ['/auth/me','/model-operations','/package-management','/traffic-limits','/audit-logs']) {
    assert.equal((await request(path,{cookie:login.cookie})).status,200,path);
  }
  assert.equal((await request('/auth/me',{cookie:login.cookie})).data.account.id,login.data.account.id);
  assert.equal((await request('/auth/me')).status,401);
});

test('insufficient permission is 403 and never turns into another login flow', async () => {
  const login = await signIn('admin-002');
  assert.equal(login.data.account.role,'运维人员');
  assert.equal((await request('/auth/me',{cookie:login.cookie})).status,200);
  for (const path of ['/model-operations','/package-management','/traffic-limits','/audit-logs']) {
    assert.equal((await request(path,{cookie:login.cookie})).status,403,path);
  }
  const forged = await request('/auth/sign-in',{method:'POST',body:{identifier:'admin-002',accessCode:password,role:'平台管理员'}});
  assert.equal(forged.status,400);
});

test('account switching revokes the previous identity, and unified logout clears both session types', async () => {
  const admin = await signIn('admin-001');
  const market = await signIn('tenant-gov',admin.cookie);
  assert.equal((await request('/auth/me',{cookie:admin.cookie})).status,401);
  assert.equal((await request('/market/catalogue',{cookie:market.cookie})).data.tenant.id,'tenant-gov');
  const nextAdmin = await signIn('admin-001',market.cookie);
  assert.equal((await request('/market/catalogue',{cookie:market.cookie})).data.tenant,null);
  const logout = await request('/auth/logout',{method:'POST',body:{},cookie:nextAdmin.cookie});
  assert.equal(logout.status,200);
  assert.equal(logout.cookies.length,2);
  assert(logout.cookies.every(value => value.includes('Max-Age=0')));
  assert.equal((await request('/auth/me',{cookie:nextAdmin.cookie})).status,401);
  assert.equal((await request('/auth/logout',{method:'POST',body:{}})).status,200);
});

test('disabled accounts cannot establish a new unified session', async () => {
  await local.db.prepare("UPDATE admin_accounts SET enabled=0 WHERE COALESCE(login_code,id)='admin-002'").run();
  const result = await request('/auth/sign-in',{method:'POST',body:{identifier:'admin-002',accessCode:password}});
  assert.equal(result.status,401);
  assert.equal(result.cookies.length,0);
});
