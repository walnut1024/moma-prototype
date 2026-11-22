import test from 'node:test';
import assert from 'node:assert/strict';
import { legacySupplierState } from './legacy-supplier-fixture.mjs';
import { commitAdminState } from '../src/admin-v2/store.js';
import { connectionKeys, connectionTestPassed } from '../src/admin-v2/connection-state.js';
import { providerApiKeysDraft } from '../src/admin-v2/provider-management.js';

test('a standalone key leaves existing channel credentials and evidence intact, and can be selected for a new channel', async () => {
  const state = legacySupplierState();
  const provider = state.providers.find(row => row.id === 'provider-moma');
  const [first, second, third] = provider.apiKeys;
  provider.apiKeyGroups = [
    { id: 'default', name: 'Default', keyIds: [first.id, second.id] },
    { id: 'dedicated', name: 'Dedicated', keyIds: [third.id] },
  ];
  const endpoints = state.endpoints.filter(row => row.providerId === provider.id);
  for (const [index, endpoint] of endpoints.entries()) Object.assign(endpoint, {
    authMode: 'group', keyGroupId: index === 0 ? 'default' : 'dedicated',
  });
  const before = endpoints.map(endpoint => ({
    endpoint,
    keys: connectionKeys(endpoint, provider, true).map(key => key.id),
    active: connectionKeys(endpoint, provider).map(key => key.id),
    tested: connectionTestPassed(endpoint),
  }));
  const run = (current, operation, data) => commitAdminState(current, { type: 'modelOperations', operation, data });
  const secret = 'fixture-standalone-key-only-123456';
  const { apiKeys } = await providerApiKeysDraft([secret]);
  const next = run(state, 'provider', { operation: 'addApiKeys', objectId: provider.id, values: { apiKeys, standalone: true } });
  const owner = next.providers.find(row => row.id === provider.id);
  const added = owner.apiKeys.find(key => key.fingerprint === apiKeys[0].fingerprint);
  assert(added);
  assert.deepEqual(owner.apiKeyGroups, provider.apiKeyGroups);
  for (const entry of before) {
    const endpoint = next.endpoints.find(row => row.id === entry.endpoint.id);
    assert.deepEqual(endpoint, entry.endpoint);
    assert.deepEqual(connectionKeys(endpoint, owner, true).map(key => key.id), entry.keys);
    assert.deepEqual(connectionKeys(endpoint, owner).map(key => key.id), entry.active);
    assert.equal(connectionTestPassed(endpoint), entry.tested);
  }
  assert(!JSON.stringify(next).includes(secret));
  const create = {
    providerId: provider.id, protocol: 'OpenAI', interfaceType: 'openai',
    baseUrl: 'https://direct.example.invalid/v1', authMode: 'specific', apiKeyId: added.id,
    rows: [{ creationId: crypto.randomUUID(), name: '直接绑定测试', keys: [] }],
  };
  assert.throws(() => run(next, 'channelDirectoryCreate', { ...create, apiKeyId: 'foreign-key' }), /可用密钥/);
  const saved = run(next, 'channelDirectoryCreate', create);
  const bound = saved.endpoints.find(row => row.name === '直接绑定测试');
  assert.equal(bound.authMode, 'specific');
  assert.deepEqual(connectionKeys(bound, owner).map(key => key.id), [added.id]);
  assert(!bound.keyGroupId);
  const current = endpoints[0];
  const edit = {
    providerId: provider.id, endpointId: current.id, baseUrl: current.baseUrl,
    expectedUpdatedAt: current.updatedAt, expectedProviderUpdatedAt: owner.updatedAt,
    prepareConnection: true, allAssociations: true, apiKeyId: added.id,
  };
  const draft = run(next, 'supplierChannelEdit', edit).endpoints.find(row => row.id === current.id);
  assert.equal(draft.authMode, current.authMode);
  assert.equal(draft.candidateConfiguration.config.authMode, 'specific');
  assert.equal(draft.candidateConfiguration.config.apiKeyId, added.id);
  assert.equal(draft.candidateConfiguration.config.keyGroupId, '');
});
