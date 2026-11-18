import test from 'node:test';
import assert from 'node:assert/strict';
import { credentialRotationChannels } from '../src/admin-v2/credential-rotation-scope.js';

const fixture = () => ({ provider: { id: 'supplier', defaultApiKeyId: 'old-major', apiKeys: [{ id: 'old-major' }, { id: 'new-secondary' }], apiKeyGroups: [{ id: 'default', name: '默认组', keyIds: ['old-major', 'new-secondary'] }] }, state: { endpoints: [{ id: 'shared-group', providerId: 'supplier', authMode: 'group', keyGroupId: 'default' }, { id: 'shared-inherit', providerId: 'supplier', authMode: 'inherit' }, { id: 'specific-new', providerId: 'supplier', authMode: 'specific', apiKeyId: 'new-secondary' }, { id: 'deleted', providerId: 'supplier', authMode: 'specific', apiKeyId: 'new-secondary', deletedAt: '2026-10-31' }, { id: 'foreign', providerId: 'other', authMode: 'specific', apiKeyId: 'new-secondary' }] } });
test('rotation separates the old group major from a secondary key used only by one specific channel', () => {
  const { provider, state } = fixture(), original = structuredClone({ provider, state });
  assert.deepEqual(credentialRotationChannels(state, provider, 'old-major').map(row => row.id), ['shared-group', 'shared-inherit']);
  assert.deepEqual(credentialRotationChannels(state, provider, 'new-secondary').map(row => row.id), ['specific-new']);
  assert.deepEqual({ provider, state }, original);
});
test('a disabled or revoked major stays in the rotation scope and never makes a secondary key a shared target', () => {
  const { provider, state } = fixture(); provider.apiKeys[0].status = 'disabled'; provider.apiKeys[0].revokedAt = '2026-10-31';
  assert.deepEqual(credentialRotationChannels(state, provider, 'old-major').map(row => row.id), ['shared-group', 'shared-inherit']);
  assert.deepEqual(credentialRotationChannels(state, provider, 'new-secondary').map(row => row.id), ['specific-new']);
});

test('legacy aliases join rotation by fingerprint while distinct saved IDs keep their own bindings', () => {
  const { provider, state } = fixture(), [major, secondary] = provider.apiKeys;
  major.fingerprint = secondary.fingerprint = 'a'.repeat(64);
  state.endpoints.push(
    { id: 'same-value-other-key', providerId: provider.id, apiKeys: [secondary] },
    { id: 'legacy-alias', providerId: provider.id, apiKeys: [{ ...major, id: 'legacy-key' }] },
  );
  assert.deepEqual(credentialRotationChannels(state, provider, major.id).map(row => row.id), ['shared-group', 'shared-inherit', 'legacy-alias']);
});
