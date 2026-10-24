import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tenantUserAccess } from '../src/tenant-user-type.mjs';
import { AUTH_INVITE, emptyAuthState, registerAuthAccount, loginAuthAccount, acceptAuthInvite } from '../src/auth-state.mjs';

const registered = registerAuthAccount(emptyAuthState(), { phone: AUTH_INVITE.phone });
const joined = acceptAuthInvite(registered, AUTH_INVITE.id, Date.parse('2026-10-13T10:00:00+08:00'));
test('anonymous preview distinguishes enterprise and personal without modifying account data', () => {
  const state = emptyAuthState(), before = JSON.stringify(state);
  assert.deepEqual(tenantUserAccess(state, 'personal'), { userType: 'personal', canViewCallLogs: false });
  assert.deepEqual(tenantUserAccess(state, 'enterprise'), { userType: 'enterprise', canViewCallLogs: true });
  assert.equal(JSON.stringify(state), before);
});
test('actual personal login wins over enterprise preview; enterprise login needs an accessible space', () => {
  const personal = loginAuthAccount(joined, AUTH_INVITE.phone, 'personal');
  assert.deepEqual(tenantUserAccess(personal, 'enterprise'), { userType: 'personal', canViewCallLogs: false });
  const enterprise = loginAuthAccount(joined, AUTH_INVITE.phone, 'enterprise');
  assert.deepEqual(tenantUserAccess(enterprise, 'personal'), { userType: 'enterprise', canViewCallLogs: true });
  assert.equal(tenantUserAccess({ ...enterprise, activeSpace: null }, 'enterprise').canViewCallLogs, false);
  assert.equal(tenantUserAccess({ ...enterprise, activeSpace: 'unknown-space' }, 'enterprise').canViewCallLogs, false);
});
test('personal-only, suspended and frozen enterprise identities cannot expose call logs', () => {
  assert.equal(tenantUserAccess(loginAuthAccount(registered, AUTH_INVITE.phone, 'personal'), 'enterprise').canViewCallLogs, false);
  for (const memberships of [[], joined.memberships.map(member => ({ ...member, status: '待加入' })), joined.memberships.map(member => ({ ...member, enterpriseFrozen: true }))]) {
    assert.equal(tenantUserAccess({ ...joined, memberships }, 'enterprise').canViewCallLogs, false);
  }
  const suspended = { ...joined, accounts: joined.accounts.map(account => ({ ...account, status: '已停用' })) };
  assert.equal(tenantUserAccess(suspended, 'enterprise').canViewCallLogs, false);
});
