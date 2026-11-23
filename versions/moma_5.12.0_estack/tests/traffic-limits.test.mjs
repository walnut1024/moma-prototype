import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminSeed, parseAdminState, serializeAdminState, STORAGE_KEY } from '../src/admin-v2/store.js';
import { commitAdminState } from '../src/admin-v2/state-transaction.js';
import { accountTraffic, effectiveTraffic, trafficAccounts, trafficProjects } from '../src/admin-v2/traffic-limits.js';
import { parseTrafficRate, trafficRateText } from '../src/admin-v2/traffic-rates.js';
import { emptyAuthState, persistAuthState, registerAuthAccount } from '../src/auth-state.mjs';
import { withAdminSession } from './admin-session-fixture.mjs';

const pair = rpm => ({ rpm, tpm: rpm * 1000 });

test('personal signup and enterprise onboarding use the current global default', () => {
  let state = withAdminSession(createAdminSeed());
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
  const personal = state.tenants.find(tenant => tenant.id === 'personal:' + registered.currentUserId);
  const accounts = trafficAccounts(state);
  assert.ok(accounts.find(user => user.id === owner.id).tenants.some(tenant => tenant.id === 'traffic-test-company'));
  assert.ok(accounts.find(user => user.id === personal.ownerId).tenants.some(tenant => tenant.id === personal.id));
  const accountIds = [owner.id, personal.ownerId];
  for (const id of accountIds) {
    assert.ok(trafficAccounts(state).some(account => account.id === id));
    const policy = accountTraffic({ rules: [] }, id);
    assert.equal(policy.limit, null);
    assert.equal(effectiveTraffic({ global: pair(10), rules: [] }, policy).hit.limit.rpm, 10);
    assert.equal(effectiveTraffic({ global: pair(15), rules: [] }, policy).hit.limit.rpm, 15);
  }
});

test('members of one tenant have independent limits and a user in two tenants appears once', () => {
  const state = {
    users: [{ id: 'alice' }, { id: 'bob' }],
    tenants: [{ id: 'company', type: '企业', ownerId: 'alice' }, { id: 'personal', type: '个人', ownerId: 'alice' }],
    memberships: [
      { id: 'member-a', userId: 'alice', tenantId: 'company', status: '正常' },
      { id: 'member-b', userId: 'bob', tenantId: 'company', status: '正常' },
    ],
    projects: [
      { id: 'private', tenantId: 'personal', ownerId: 'alice' },
      { id: 'shared', tenantId: 'company', memberRoles: { 'member-b': '项目成员' } },
      { id: 'other', tenantId: 'company', memberRoles: {} },
    ],
  };
  const [alice, bob] = trafficAccounts(state);
  assert.deepEqual(alice.tenants.map(row => row.id), ['company', 'personal']);
  assert.deepEqual(bob.tenants.map(row => row.id), ['company']);
  assert.deepEqual(trafficProjects(state, bob).map(row => row.id), ['shared']);
  const settings = { rules: [{ scope: 'account', objectId: alice.id, ...pair(10) }] };
  assert.equal(accountTraffic(settings, alice.id).limit.rpm, 10);
  assert.equal(accountTraffic(settings, bob.id).limit, null);
});

test('unread model limits do not imply an effective per-model limit', () => {
  const policy = { limit: pair(10), exceptions: [] };
  assert.equal(effectiveTraffic(undefined, policy, 'model-id').finalLimit, undefined);
  assert.deepEqual(effectiveTraffic(undefined, policy).finalLimit, policy.limit);
});

test('TPM uses millions in the form and stores exact positive whole tokens', () => {
  for (const [value, million] of [[1, '0.000001'], [200, '0.0002'], [3_000_000, '3'], [Number.MAX_SAFE_INTEGER, '9007199254.740991']]) {
    assert.equal(trafficRateText(value, 'tpm'), million);
    assert.equal(parseTrafficRate(million, 'tpm'), value);
  }
  assert.equal(trafficRateText(3_000_000_000, 'tpm', true), '3,000');
  assert.equal(trafficRateText(null, 'tpm', true), '—');
  for (const value of ['0', '-1', '0.0000001', '1e6', '9007199254.740992', '']) assert.equal(parseTrafficRate(value, 'tpm'), null);
  assert.equal(parseTrafficRate('3.5', 'rpm'), null);
});
