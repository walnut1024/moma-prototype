import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthFlowScene, authFlowScenes } from '../src/auth-flow-scenes.mjs';
import { AUTH_INVITE, authRoute, registerAuthAccount, queryAuthApplication, submitAuthApplication, activateAuthAccount, loginAuthAccount, acceptAuthInvite, availableAuthSpaces, matchesAuthPassword } from '../src/auth-state.mjs';
const proof = (identity, type, purpose) => ({ identity, type, code: '123456', challenge: { identity, type, purpose, code: '123456', issuedAt: Date.now(), attempts: 0 } });

test('collection routes and personal registration use independent state', async () => {
  assert.equal(authRoute('#/auth/flows?scene=personal'), 'flows');
  for (const scene of authFlowScenes) assert.ok(authRoute(`#/auth/${scene.route}`));
  const first = await createAuthFlowScene('personal');
  const registered = registerAuthAccount(first.state, { phone: first.phone });
  assert.equal(registered.accounts.length, 1);
  assert.equal(loginAuthAccount(registered, first.phone, 'personal').activeSpace, 'personal');
  assert.equal((await createAuthFlowScene('personal')).state.accounts.length, 0);
  await assert.rejects(createAuthFlowScene('unknown'), /有效/);
});

test('supplement and closed scenes allow resubmission without changing identities', async () => {
  for (const scene of ['supplement', 'closed', 'pending']) {
    const { state } = await createAuthFlowScene(scene), record = state.applications[0];
    const queried = queryAuthApplication(state, record.id, proof(record.contactIdentity, record.contactType, 'application'));
    assert.equal(queried.status, record.status);
    if (scene === 'pending') continue;
    const updated = submitAuthApplication(state, { ...record, contactName: '陈宁' }, proof(record.contactIdentity, record.contactType, 'enterprise'), scene === 'supplement' ? record.id : null);
    assert.equal(updated.applications.at(-1).status, '待处理');
    assert.equal(updated.accounts.length, 0);
    assert.equal(updated.memberships.length, 0);
    assert.equal(updated.applications.length, scene === 'supplement' ? 1 : 2);
  }
});

test('approved scene continues through activation and enterprise password login', async () => {
  const { state } = await createAuthFlowScene('approved');
  const user = state.accounts[0], type = user.activation.type;
  const active = await activateAuthAccount(state, user.activation.token, proof(user[type], type, 'activate'), 'Account2026!');
  assert.equal(await matchesAuthPassword('Account2026!', active.accounts[0].credential), true);
  assert.equal(loginAuthAccount(active, user[type], 'enterprise').activeSpace, 'collection-qinghe');
  assert.equal(active.memberships.length, 1);
});

test('enterprise login scene uses an active credential and its own membership', async () => {
  const { state, phone: identity, params } = await createAuthFlowScene('enterprise-login');
  assert.equal(params, '?type=enterprise');
  assert.equal(state.currentUserId, null);
  assert.equal(await matchesAuthPassword('Account2026!', state.accounts[0].credential), true);
  assert.equal(await matchesAuthPassword('wrong-password', state.accounts[0].credential), false);
  assert.equal(loginAuthAccount(state, identity, 'enterprise').activeSpace, 'collection-qinghe');
  assert.equal((await createAuthFlowScene('enterprise-login')).state.currentUserId, null);
});

test('member invitation and multiple-space selection retain membership boundaries', async () => {
  const invitation = await createAuthFlowScene('invite');
  const joined = acceptAuthInvite(registerAuthAccount(invitation.state, { phone: invitation.phone }), AUTH_INVITE.id);
  assert.equal(joined.activeSpace, AUTH_INVITE.enterpriseId);
  const multiple = await createAuthFlowScene('spaces');
  const authenticated = loginAuthAccount(multiple.state, multiple.phone, 'enterprise');
  assert.equal(authenticated.activeSpace, null);
  assert.equal(availableAuthSpaces(authenticated).length, 3);
  assert.equal(multiple.state.currentUserId, null);
});
