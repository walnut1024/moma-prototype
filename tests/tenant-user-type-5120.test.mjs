import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tenantUserAccess } from '../versions/moma_5.12.0_estack/src/tenant-user-type.mjs';
import { AUTH_INVITE, emptyAuthState, registerAuthAccount, loginAuthAccount, acceptAuthInvite } from '../versions/moma_5.12.0_estack/src/auth-state.mjs';

const registered = registerAuthAccount(emptyAuthState(), { phone: AUTH_INVITE.phone });
const joined = acceptAuthInvite(registered, AUTH_INVITE.id, Date.parse('2026-10-13T10:00:00+08:00'));
test('anonymous preview distinguishes enterprise and personal without modifying account data', () => {
  const state = emptyAuthState(), before = JSON.stringify(state);
  assert.deepEqual(tenantUserAccess(state, 'personal'), { userType: 'personal', canViewOrganization: false });
  assert.deepEqual(tenantUserAccess(state, 'enterprise'), { userType: 'enterprise', canViewOrganization: true });
  assert.equal(JSON.stringify(state), before);
});
test('actual personal login wins over enterprise preview; enterprise login needs an accessible space', () => {
  const personal = loginAuthAccount(joined, AUTH_INVITE.phone, 'personal');
  assert.deepEqual(tenantUserAccess(personal, 'enterprise'), { userType: 'personal', canViewOrganization: false });
  const enterprise = loginAuthAccount(joined, AUTH_INVITE.phone, 'enterprise');
  assert.deepEqual(tenantUserAccess(enterprise, 'personal'), { userType: 'enterprise', canViewOrganization: true });
  assert.equal(tenantUserAccess({ ...enterprise, activeSpace: null }, 'enterprise').canViewOrganization, false);
  assert.equal(tenantUserAccess({ ...enterprise, activeSpace: 'unknown-space' }, 'enterprise').canViewOrganization, false);
});
test('personal-only, suspended and frozen enterprise identities cannot expose organization pages', () => {
  assert.equal(tenantUserAccess(loginAuthAccount(registered, AUTH_INVITE.phone, 'personal'), 'enterprise').canViewOrganization, false);
  for (const memberships of [[], joined.memberships.map(member => ({ ...member, status: '待加入' })), joined.memberships.map(member => ({ ...member, enterpriseFrozen: true }))]) {
    assert.equal(tenantUserAccess({ ...joined, memberships }, 'enterprise').canViewOrganization, false);
  }
  const suspended = { ...joined, accounts: joined.accounts.map(account => ({ ...account, status: '已停用' })) };
  assert.equal(tenantUserAccess(suspended, 'enterprise').canViewOrganization, false);
});
