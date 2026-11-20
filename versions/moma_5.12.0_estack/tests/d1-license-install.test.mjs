import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { startLocalBackend } from '../database/local-runtime.js';

const origin = 'https://example.test';
import { API_PREFIX as prefix } from '../api-path.js';
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');

test('only platform administrators can install verified deployment licenses atomically', async () => {
  const accessCode = randomBytes(16).toString('hex');
  const hash = createHash('sha256').update(accessCode).digest('hex');
  const keys = await crypto.subtle.generateKey({ name:'ECDSA', namedCurve:'P-256' }, true, ['sign','verify']);
  const publicKey = await crypto.subtle.exportKey('jwk', keys.publicKey);
  const now = Math.floor(Date.now()/1000);
  const token = async (edition, claims = {}) => {
    const message = encode({alg:'ES256'}) + '.' + encode({
      aud:'test-deployment', edition, jti:'QA-license', sub:'测试授权对象', nbf:now-30, exp:now+3600, ...claims,
    });
    const signature = await crypto.subtle.sign({ name:'ECDSA', hash:'SHA-256' }, keys.privateKey, Buffer.from(message));
    return message + '.' + Buffer.from(signature).toString('base64url');
  };
  const { runtime, db } = await startLocalBackend({ demo:true, licenseEdition:'commercial',
    loginHashes:{ 'admin-001':hash, 'admin-002':hash }, licensePublicKey:JSON.stringify(publicKey), licenseDeploymentId:'test-deployment' });
  const request = async (path, { body, cookie, from=origin } = {}) => {
    const response = await runtime.dispatchFetch(origin + prefix + path, {
      ...(body ? { method:'POST', body:JSON.stringify(body) } : {}),
      headers:{ ...(cookie ? {cookie} : {}), ...(body ? {origin:from,'content-type':'application/json','x-moma-request':'1'} : {}) },
    });
    return {status:response.status, data:await response.json(), cookie:response.headers.get('set-cookie')?.split(';')[0]};
  };
  const licensePath = '/deployment/license';
  const detailsPath = licensePath + '?details=1';
  const login = async accountId => {
    const result = await request('/auth/login', {body:{accountId,accessCode}});
    assert.equal(result.status,200);
    return result.cookie;
  };

  try {
    const valid = await token('commercial');
    const invalid = valid.slice(0,valid.lastIndexOf('.')+1) + Buffer.alloc(64).toString('base64url');
    const initial = {license:valid, expectedRevision:0};
    assert.equal((await request(licensePath,{body:initial})).status,401);
    assert.equal((await request(detailsPath)).status,401);
    const operator = await login('admin-002');
    assert.equal((await request(licensePath,{body:initial,cookie:operator})).status,403);
    const cookie = await login('admin-001');
    assert.equal((await request(licensePath,{body:initial,cookie,from:'https://elsewhere.test'})).status,403);
    const apply = (body) => request(licensePath,{body,cookie});
    const saved = await apply(initial);
    assert.equal(saved.status,200);
    assert.equal(saved.data.revision,1);
    assert.equal(saved.data.licensedTo,'测试授权对象');
    assert.equal(saved.data.license.commerceWritable,true);
    const publicStatus = await request(licensePath);
    assert.deepEqual(publicStatus.data,saved.data.license);
    assert.equal((await apply(initial)).data.error.code,'REVISION_CONFLICT');

    for (const [license, error] of [
      [invalid, 'INVALID_LICENSE'],
      [await token('internal',{aud:'other-deployment'}), 'LICENSE_DEPLOYMENT_MISMATCH'],
      [await token('internal',{nbf:now-60,exp:now-1}), 'LICENSE_OUTSIDE_VALIDITY'],
      [await token('internal',{nbf:now+60}), 'LICENSE_OUTSIDE_VALIDITY'],
    ]) {
      assert.equal((await apply({license,expectedRevision:1})).data.error.code,error);
    }
    const downgrade = {license:await token('internal',{jti:'QA-internal'}),expectedRevision:1};
    assert.equal((await apply(downgrade)).data.error.code,'LICENSE_SCOPE_REDUCTION');
    assert.deepEqual((await request(detailsPath,{cookie})).data,saved.data);

    const replaced = await apply({...downgrade,confirmReduction:true});
    assert.equal(replaced.status,200);
    assert.equal(replaced.data.revision,2);
    assert.equal(replaced.data.license.commercial,false);
    assert.equal((await request('/package-management',{cookie})).status,403);
    const persisted = await db.prepare("SELECT payload_json FROM simulation_records WHERE kind='deployment-license'").first('payload_json');
    assert.equal(JSON.parse(persisted).licenseId,'QA-internal');
    assert(!persisted.includes(downgrade.license));
  } finally {
    await runtime.dispose();
  }
});
