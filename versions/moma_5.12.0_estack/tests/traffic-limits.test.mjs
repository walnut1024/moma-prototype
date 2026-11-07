import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminSeed, parseAdminState, persistAdminAction, serializeAdminState, STORAGE_KEY } from '../src/admin-v2/store.js';
import { commitAdminState } from '../src/admin-v2/state-transaction.js';
import { accountTraffic, effectiveTraffic, trafficModels, trafficSettings } from '../src/admin-v2/traffic-limits.js';
import { emptyAuthState, persistAuthState, registerAuthAccount } from '../src/auth-state.mjs';
import { canAccessPage } from '../src/admin-v2/navigation.mjs';
import { withAdminSession } from './admin-session-fixture.mjs';

const pair = rpm => ({ rpm, tpm: rpm * 1000 });
const command = (state, operation, data, id) => ({ type: 'trafficOperation', operation, data, id, expectedRevision: state.revision });

test('batch edits and resets are atomic, persist, and preserve model exceptions and the model cap', () => {
  let state = withAdminSession(createAdminSeed());
  const [model, other] = trafficModels(state);
  const tenant = state.tenants.find(row => row.type === '个人');
  const company = state.tenants.find(row => row.type === '企业');
  const accountIds = [tenant.id, company.id];
  state.settings.trafficLimits = { global: pair(10), models: [], tiers: [{ id: 'legacy', limit: pair(20) }] };
  tenant.trafficPolicy = { tierId: 'legacy', limit: null, exceptions: [] };
  const values = new Map([[STORAGE_KEY, serializeAdminState(state)]]);
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const apply = (operation, data, id) => { state = persistAdminAction(state, command(state, operation, data, id), storage); };
  assert.equal(effectiveTraffic(trafficSettings(state), accountTraffic(tenant)).hit.limit.rpm, 10);
  apply('model', pair(80), model.id);
  const exceptions = [{ modelId: model.id, ...pair(40) }];
  apply('exceptions', { exceptions }, tenant.id);
  const stale = command(state, 'batchAccounts', { accountIds, limit: null });
  apply('batchAccounts', { accountIds, limit: pair(30) });
  assert.throws(() => persistAdminAction(state, stale, storage), /数据已变化/);
  const raw = storage.getItem(STORAGE_KEY);
  assert.throws(() => apply('model', pair(1.5), model.id), /正整数/);
  assert.throws(() => apply('exceptions', { exceptions: [...exceptions, ...exceptions] }, tenant.id), /一条特例/);
  assert.throws(() => apply('batchAccounts', { accountIds: [tenant.id, 'missing'], limit: pair(50) }), /账号已变化/);
  assert.throws(() => apply('batchAccounts', { accountIds: [tenant.id, tenant.id], limit: null }), /不重复/);
  assert.equal(storage.getItem(STORAGE_KEY), raw);
  state = parseAdminState(raw);
  assert.equal(state.audits[0].action, '批量修改账号限流额度');
  const stored = accountTraffic(state.tenants.find(row => row.id === tenant.id));
  const settings = trafficSettings(state);
  const result = effectiveTraffic(settings, stored, model.id);
  assert.equal(result.hit.id, 'exception');
  assert.equal(result.hit.limit.rpm, 40);
  assert.equal(result.modelLimit.rpm, 80);
  assert.equal(effectiveTraffic(settings, stored, other.id).hit.limit.rpm, 30);
  assert.equal(accountTraffic(state.tenants.find(row => row.id === company.id)).limit.rpm, 30);
  apply('batchAccounts', { accountIds, limit: null });
  const reset = accountTraffic(state.tenants.find(row => row.id === tenant.id));
  assert.deepEqual(reset.exceptions, exceptions);
  assert.equal(effectiveTraffic(settings, reset, other.id).hit.limit.rpm, 10);
  assert.equal(accountTraffic(state.tenants.find(row => row.id === company.id)).limit, null);
  assert.equal(trafficSettings(state).tiers[0].id, 'legacy');
  assert.throws(() => commitAdminState(state, command(state, 'model', pair(80), model.id), '运维人员'), /无权/);
  assert.equal(canAccessPage('运维人员', 'traffic-limits'), false);
  assert.equal(canAccessPage('运营人员', 'traffic-limits'), true);
});

test('personal signup and enterprise onboarding use the current global default', () => {
  let state = withAdminSession(createAdminSeed());
  state = commitAdminState(state, command(state, 'defaults', { global: pair(10) }));
  const owner = state.users.find(user => user.status === '正常');
  state = commitAdminState(state, {
    type: 'enterprise', operation: 'create', ids: { tenant: 'traffic-test-company', member: 'traffic-test-member', organization: 'traffic-test-org' },
    data: { accountMode: 'existing', userId: owner.id, phone: '13800000000', companyName: '测试企业', taxId: 'TEST2026',
      countryRegion: '中国', province: '江苏省', contactName: '测试联系人', contactPhone: '13800000000', type: '企业' },
  });
  const values = new Map([[STORAGE_KEY, serializeAdminState(state)]]);
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const auth = emptyAuthState();
  const registered = persistAuthState(auth, registerAuthAccount(auth, { phone: '13800001234' }), storage);
  state = parseAdminState(storage.getItem(STORAGE_KEY));
  state = commitAdminState(state, command(state, 'defaults', { global: pair(15) }));
  const accountIds = ['traffic-test-company', `personal:${registered.currentUserId}`];
  for (const id of accountIds) {
    const policy = accountTraffic(state.tenants.find(row => row.id === id));
    assert.equal(policy.limit, null);
    assert.equal(effectiveTraffic(trafficSettings(state), policy).hit.limit.rpm, 15);
  }
});
