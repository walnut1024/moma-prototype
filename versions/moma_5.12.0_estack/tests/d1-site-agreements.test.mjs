import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomBytes } from 'node:crypto';
import { startLocalBackend } from '../database/local-runtime.js';
import { agreementFromHash, agreementHref } from '../src/agreement-route.mjs';

const prefix = '/api/v1';

test('public agreement URLs select exactly one document', () => {
  assert.equal(agreementFromHash(new URL(agreementHref('terms'), 'https://example.test').hash), 'terms');
  assert.equal(agreementFromHash(new URL(agreementHref('privacy'), 'https://example.test').hash), 'privacy');
  assert.equal(agreementFromHash('#/agreements/constructor'), null);
  assert.equal(agreementFromHash('#/admin-2/site-configuration'), null);
});

test('only a private site administrator may publish, and anonymous visitors read the saved revision', async t => {
  const oldSetting = process.env.VITE_MOMA_PRIVATE_SITE;
  t.after(() => {
    if (oldSetting === undefined) delete process.env.VITE_MOMA_PRIVATE_SITE;
    else process.env.VITE_MOMA_PRIVATE_SITE = oldSetting;
  });
  const origin = 'https://example.test';
  const path = '/site-agreements';
  process.env.VITE_MOMA_PRIVATE_SITE = '0';
  const publicBuild = await startLocalBackend();
  try {
    assert.equal((await publicBuild.runtime.dispatchFetch(origin + prefix + path)).status, 404);
  } finally {
    await publicBuild.runtime.dispose();
  }

  process.env.VITE_MOMA_PRIVATE_SITE = '1';
  const accessCode = randomBytes(18).toString('hex');
  const hash = createHash('sha256').update(accessCode).digest('hex');
  const local = await startLocalBackend({ loginHashes: { 'admin-001': hash, 'admin-003': hash } });
  t.after(() => local.runtime.dispose());
  await local.db.prepare("INSERT OR IGNORE INTO admin_accounts(id,name,role,enabled) VALUES('admin-003','运营测试','运营人员',1)").run();
  async function request(endpoint, { body, cookie, requestOrigin = origin } = {}) {
    const response = await local.runtime.dispatchFetch(origin + prefix + endpoint, {
      method: body ? 'POST' : 'GET',
      headers: { ...(cookie ? { cookie } : {}), ...(body ? { origin: requestOrigin, 'x-moma-request': '1', 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  const login = async accountId => {
    const result = await request('/auth/login', { body: { accountId, accessCode } });
    assert.equal(result.status, 200);
    return result.cookie;
  };
  const administrator = await login('admin-001');
  const operator = await login('admin-003');
  const body = { expectedRevision: 0, agreements: { terms: { text: '测试协议', url: '' }, privacy: { text: '', url: 'https://example.test/privacy' } } };
  assert.deepEqual((await request(path)).data, { revision: 0, agreements: {} });
  assert.equal((await request(path, { body })).status, 401);
  assert.equal((await request(path, { body, cookie: operator })).status, 403);
  assert.equal((await request(path, { body, cookie: administrator, requestOrigin: 'https://other.test' })).status, 403);
  const invalid = { ...body, agreements: { ...body.agreements, privacy: { text: '', url: 'javascript:alert(1)' } } };
  assert.equal((await request(path, { body: invalid, cookie: administrator })).status, 400);
  const writes = await Promise.all([1, 2].map(() => request(path, { body, cookie: administrator })));
  assert.deepEqual(writes.map(result => result.status).sort(), [200, 409]);
  assert.deepEqual((await request(path)).data, { revision: 1, agreements: body.agreements });
});
