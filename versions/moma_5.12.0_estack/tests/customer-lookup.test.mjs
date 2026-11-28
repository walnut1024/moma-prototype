import assert from 'node:assert/strict';
import test from 'node:test';
import { beijing, demoCallUser, demoTenants, lookupDemoTenants } from '../src/admin-v2/customer-analysis-demo.js';

test('tenant lookup accepts the stable tenant ID and its displayed alias without conflating user IDs', () => {
  const tenant = lookupDemoTenants('tenantId', ' DEMO-7 ')[0];
  assert.equal(tenant.name, beijing);
  assert.equal(tenant.liveTokens, '179.00');
  assert.deepEqual(lookupDemoTenants('tenantId', tenant.displayId), [tenant]);
  assert.deepEqual(lookupDemoTenants('tenantId', demoCallUser.id), []);
  assert.deepEqual(lookupDemoTenants('tenantId', 'demo-'), []);
  assert.deepEqual(lookupDemoTenants('userId', tenant.id), []);
});

test('a matched demo caller resolves to the tenant that owns the available sample', () => {
  const tenant = demoTenants.find(({ name }) => name === beijing);
  assert.deepEqual(lookupDemoTenants('userId', demoCallUser.id), [tenant]);
  assert.deepEqual(lookupDemoTenants('userId', demoCallUser.label), [tenant]);
  assert.deepEqual(lookupDemoTenants('userId', 'CIDC-U-4342fc'), []);
});

test('name search returns unique tenants and preserves absent realtime samples', () => {
  const matches = lookupDemoTenants('tenantName', ' 公司 ');
  assert(matches.length > 1);
  assert.equal(new Set(matches.map(tenant => tenant.id)).size, matches.length);
  assert.equal(lookupDemoTenants('tenantName', '广州极飞')[0].liveTokens, undefined);
  assert.deepEqual(lookupDemoTenants('tenantName', '不存在的演示租户'), []);
  assert.deepEqual(lookupDemoTenants('tenantName', '   '), []);
});
