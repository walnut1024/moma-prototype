import test from 'node:test';
import assert from 'node:assert/strict';
import { credentialRotationScope, credentialRotationChannels } from '../src/admin-v2/credential-rotation-scope.js';

const fixture = () => ({ provider: { id: 'supplier', defaultApiKeyId: 'old-major', apiKeys: [{ id: 'old-major' }, { id: 'new-secondary' }], apiKeyGroups: [{ id: 'default', name: '默认组', keyIds: ['old-major', 'new-secondary'] }] }, state: { endpoints: [{ id: 'shared-group', providerId: 'supplier', authMode: 'group', keyGroupId: 'default' }, { id: 'shared-inherit', providerId: 'supplier', authMode: 'inherit' }, { id: 'specific-new', providerId: 'supplier', authMode: 'specific', apiKeyId: 'new-secondary' }, { id: 'deleted', providerId: 'supplier', authMode: 'specific', apiKeyId: 'new-secondary', deletedAt: '2026-10-31' }, { id: 'foreign', providerId: 'other', authMode: 'specific', apiKeyId: 'new-secondary' }] } });
test('rotation separates the old group major from a secondary key used only by one specific channel', () => {
  const { provider, state } = fixture(), original = structuredClone({ provider, state });
  const old = credentialRotationScope(state, provider, 'old-major'), replacement = credentialRotationScope(state, provider, 'new-secondary');
  assert.deepEqual(old.shared.map(row => row.id), ['shared-group', 'shared-inherit']); assert.deepEqual(old.specific, []);
  assert.deepEqual(replacement.specific.map(row => row.id), ['specific-new']); assert.deepEqual(replacement.shared, []);
  assert.deepEqual(credentialRotationChannels(state, provider, 'new-secondary').map(row => row.id), ['specific-new']);
  assert.deepEqual({ provider, state }, original);
});
test('a disabled or revoked major stays in the rotation scope and never makes a secondary key a shared target', () => {
  const { provider, state } = fixture(); provider.apiKeys[0].status = 'disabled'; provider.apiKeys[0].revokedAt = '2026-10-31';
  assert.deepEqual(credentialRotationScope(state, provider, 'old-major').shared.map(row => row.id), ['shared-group', 'shared-inherit']);
  assert.deepEqual(credentialRotationScope(state, provider, 'new-secondary').shared, []);
});

test('an opened rotation retains its explicit route and endpoint IDs after its own successful binding change', async () => {
  const { credentialRotationOpening } = await import('../src/admin-v2/credential-rotation-scope.js');
  const { provider, state } = fixture(), groupOpening = credentialRotationOpening(state, provider, 'old-major'), specificOpening = credentialRotationOpening(state, provider, 'new-secondary');
  provider.apiKeys.push({ id: 'next-key' }); provider.defaultApiKeyId = 'next-key'; provider.apiKeyGroups[0].keyIds = ['next-key', 'old-major', 'new-secondary']; state.endpoints.find(row => row.id === 'specific-new').apiKeyId = 'next-key';
  assert.equal(credentialRotationOpening(state, provider, 'old-major').route, 'plain');
  assert.equal(credentialRotationOpening(state, provider, 'new-secondary').route, 'plain');
  assert.equal(groupOpening.route, 'group'); assert.deepEqual(groupOpening.sharedIds, ['shared-group', 'shared-inherit']);
  assert.equal(specificOpening.route, 'specific'); assert.deepEqual(specificOpening.specificIds, ['specific-new']);
});
