import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { API_PREFIX } from '../api-path.js';
import { startLocalBackend } from '../database/local-runtime.js';
import { adminSections, canAccessPage, commercialPage, isOrganizationPage } from '../src/admin-v2/navigation.mjs';
import { deploymentLicense } from '../src/deployment-license.mjs';

test('tenant management is shared and resource management requires the system administrator', () => {
  const internal = deploymentLicense({ MOMA_LICENSE_EDITION: 'internal' });
  const commercial = deploymentLicense({ MOMA_LICENSE_EDITION: 'commercial' });
  const commercialGroup = adminSections.find(row=>row.id==='commerce');
  const licensedItems = commercialGroup.items.filter(item=>commercialPage(item.children[0][0]));
  assert.deepEqual(licensedItems.map(row=>row.label), ['模型售卖','套餐管理','套餐数据','协议管理']);
  assert(!adminSections.some(row=>row.id==='organization'));
  assert(canAccessPage('平台管理员','projects',commercial));
  assert(canAccessPage('平台管理员','organization-members',internal));
  assert(!canAccessPage('运营人员','projects',commercial));
  assert(canAccessPage('运营人员','projects',commercial,new URLSearchParams('tenant=customer-a')));
  assert(!canAccessPage('运维人员','projects',commercial,new URLSearchParams('tenant=customer-a')));
  assert(!canAccessPage('运维人员','organization-members',internal));
  assert(isOrganizationPage('tenants', true));
  assert(isOrganizationPage('projects', true));
  assert(!isOrganizationPage('projects', false));
  assert(!isOrganizationPage('orders', false));
  assert.equal(canAccessPage('运营人员', 'customer-analysis', internal), false);
  assert(canAccessPage('运营人员', 'model-market', internal));
  assert(canAccessPage('运营人员', 'tenants', internal));
  for (const id of ['model-prices', 'orders', 'bills', 'metering', 'package-production', 'package-data', 'business-analysis']) {
    assert(commercialPage(id));
    assert.equal(canAccessPage('平台管理员', id, internal), false);
    assert.equal(canAccessPage('运营人员', id, commercial), true);
  }
  assert.equal(canAccessPage('运营人员', 'license', commercial), false);
  assert.equal(deploymentLicense({ MOMA_LICENSE_EDITION:'unknown' }).commerceWritable, false);
  assert.equal(deploymentLicense({ MOMA_LICENSE_EDITION:'commercial', MOMA_LICENSE_EXPIRES_AT:'invalid' }).commerceWritable, false);
});

for (const spec of [
  { edition:'internal', status:'active', packages:403 },
  { edition:'commercial', status:'expired', packages:200, expires:'2000-01-01T00:00:00Z' },
]) {
  test(`D1 retains shared model access and restricts commercial writes for ${spec.edition}/${spec.status}`, async () => {
    const accessCode = randomBytes(12).toString('hex');
    const loginHashes = { 'admin-001':createHash('sha256').update(accessCode).digest('hex') };
    const { runtime } = await startLocalBackend({ demo:true, loginHashes,
      licenseEdition:spec.edition, licenseExpiresAt:spec.expires });
    let cookie;
    const request = async (path, body) => {
      const response = await runtime.dispatchFetch('https://example.test' + API_PREFIX + path, {
        ...(body ? { method:'POST', body:JSON.stringify(body) } : {}),
        headers: { ...(cookie ? { cookie } : {}), ...(body ? { origin:'https://example.test',
          'content-type':'application/json','x-moma-request':'1' } : {}) },
      });
      return { status:response.status, body:await response.json(), cookie:response.headers.get('set-cookie') };
    };
    try {
      const { body:license } = await request('/deployment/license');
      assert.equal(license.edition,spec.edition);
      assert.equal(license.status,spec.status);
      assert.equal(license.commerceWritable,false);
      const login = await request('/auth/login', { accountId:'admin-001', accessCode });
      assert.equal(login.status,200);
      cookie=login.cookie.split(';')[0];
      assert.equal((await request('/model-operations')).status,200);
      assert.equal((await request('/health')).body.schemaVersion,19);
      assert.equal((await request('/package-management')).status,spec.packages);
      assert.equal((await request('/package-management/commands',{})).body.error.code,'LICENSE_REQUIRED');
      for (const operation of ['startSales', 'pauseSales', 'salesSettings', 'commercialPublish']) {
        const denied = await request('/model-operations/commands', { action:{type:'modelOperations',operation} });
        assert.equal(denied.status,403);
        assert.equal(denied.body.error.code,'LICENSE_REQUIRED');
      }
      if (spec.edition === 'internal') {
        const scope = await request('/model-operations/commands', {
          action:{ type:'modelOperations', operation:'marketCardSetStatus', data:{ listing_stage:'gray', scope:{ tenantIds:['another-tenant'] } } },
        });
        assert.equal(scope.status,403);
        assert.deepEqual((await request('/market/catalogue')).body.services, []);
      }
    } finally { await runtime.dispose(); }
  });
}
