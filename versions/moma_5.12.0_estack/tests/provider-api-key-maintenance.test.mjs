import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminSeed, commitAdminState, persistModelAction, parseAdminState } from '../src/admin-v2/store.js';
import { providerApiKeysDraft, providerApiKeyRows, providerApiKeyName, connectionFingerprint } from '../src/admin-v2/provider-management.js';

const secrets = ['local-prototype-key-alpha-0001', 'local-prototype-key-beta-0002', 'local-prototype-key-rotated-0003'];
const op = (state, operation, values, providerId = 'provider-moma') => commitAdminState(state, { type: 'modelOperations', operation: 'provider', data: { operation, objectId: providerId, values } });
const providerOf = state => state.providers.find(item => item.id === 'provider-moma');
async function fixture() {
  const state = op(createAdminSeed(), 'addApiKeys', await providerApiKeysDraft(secrets.slice(0, 2)));
  const provider = providerOf(state), key = provider.apiKeys[0];
  const endpoint = state.endpoints.find(item => item.providerId === provider.id);
  endpoint.apiKeys = [{ ...key }]; endpoint.status = '运行中'; endpoint.credentialRef = 'env:EXISTING_KEY';
  endpoint.connectionTest = { result: '通过', fingerprint: connectionFingerprint(endpoint) };
  const second = { ...structuredClone(endpoint), id: 'second-key-endpoint', apiKeys: [{ ...key, id: 'second-key-record' }] };
  state.endpoints.push(second);
  for (const ep of [endpoint, second]) state.modelSupplies.push({ ...structuredClone(state.modelSupplies[0]), id: 'key-supply-' + ep.id, endpointId: ep.id, status: '已启用', validationStatus: '通过' });
  return { state, provider, key, endpoints: [endpoint, second], input: { keyId: key.id, expectedFingerprint: key.fingerprint } };
}

test('the list deduplicates shared credential references, preserves scopes and assigns stable automatic names', async () => {
  const { state, provider, key } = await fixture(), before = structuredClone(state);
  const rows = providerApiKeyRows(state, provider);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].endpoints.length, 2);
  assert.equal(rows[0].apiKey.id, key.id);
  assert.equal(providerApiKeyName(rows[0].apiKey), 'API 密钥 1');
  assert.equal(providerApiKeyName(rows[1].apiKey), 'API 密钥 2');
  const legacy = { ...key }; delete legacy.name;
  const name = providerApiKeyName(legacy);
  assert.equal(providerApiKeyName(legacy), name);
  assert.deepEqual(state, before);
});

test('adding one credential never renames existing records and rejects a key already present only at an endpoint', async () => {
  const { state, provider, key } = await fixture();
  const next = op(state, 'addApiKeys', await providerApiKeysDraft([secrets[2]]));
  assert.deepEqual(providerOf(next).apiKeys.slice(0, 2), provider.apiKeys);
  assert.equal(providerOf(next).apiKeys[2].name, 'API 密钥 3');
  provider.apiKeys = provider.apiKeys.filter(item => item.id !== key.id);
  assert.throws(() => op(state, 'addApiKeys', { apiKeys: [key] }), /相同的 API 密钥/);
});

test('rotating a referenced key requires confirmation, updates all copies in place and invalidates associated models', async () => {
  const { state, provider, key, endpoints, input } = await fixture(), before = structuredClone(state);
  const apiKey = (await providerApiKeysDraft([secrets[2]])).apiKeys[0];
  assert.throws(() => op(state, 'editApiKey', { ...input, apiKey }), /确认/);
  const next = op(state, 'editApiKey', { ...input, apiKey, confirmed: true });
  const current = providerOf(next).apiKeys[0];
  assert.equal(current.id, key.id); assert.equal(current.name, key.name); assert.equal(current.createdAt, key.createdAt);
  assert.equal(current.fingerprint, apiKey.fingerprint);
  for (const endpoint of endpoints) {
    const changed = next.endpoints.find(item => item.id === endpoint.id);
    assert.equal(changed.apiKeys[0].id, endpoint.apiKeys[0].id);
    assert.equal(changed.apiKeys[0].fingerprint, apiKey.fingerprint);
    assert.equal(changed.apiKeys[0].name, key.name);
    assert.equal(changed.credentialRef, endpoint.credentialRef);
    assert.equal(changed.baseUrl, endpoint.baseUrl);
    assert.equal(changed.status, '停用'); assert.equal(changed.connectionTest, null);
    assert.ok(next.modelSupplies.filter(item => item.endpointId === endpoint.id).every(item => item.validationStatus === '待验证' && item.status === '已停用'));
  }
  assert.deepEqual(providerOf(next).apiKeys[1], provider.apiKeys[1]);
  for (const name of ['models', 'supplyPrices', 'modelSalePrices', 'routes', 'serviceRoutes']) assert.deepEqual(next[name], before[name]);
  assert.deepEqual(state, before);
  for (const secret of secrets) assert.ok(!JSON.stringify(next).includes(secret));
});

test('deletion requires confirmation and removes only the selected credential and its references', async () => {
  const { state, provider, endpoints, input } = await fixture();
  assert.throws(() => op(state, 'deleteApiKey', input), /确认/);
  const next = op(state, 'deleteApiKey', { ...input, confirmed: true });
  assert.deepEqual(providerOf(next).apiKeys, [provider.apiKeys[1]]);
  assert.equal(providerApiKeyRows(next, providerOf(next)).length, 1);
  for (const endpoint of endpoints) {
    const changed = next.endpoints.find(item => item.id === endpoint.id);
    assert.deepEqual(changed.apiKeys, []);
    assert.equal(changed.credentialRef, endpoint.credentialRef);
    assert.equal(changed.id, endpoint.id);
  }
  assert.equal(next.endpoints.length, state.endpoints.length);
  assert.equal(next.modelSupplies.length, state.modelSupplies.length);
});

test('editing an unbound key has no effect on unrelated connection validation or original names', async () => {
  const { state, provider } = await fixture(), key = provider.apiKeys[1];
  const apiKey = (await providerApiKeysDraft([secrets[2]])).apiKeys[0];
  const next = op(state, 'editApiKey', { keyId: key.id, expectedFingerprint: key.fingerprint, apiKey });
  assert.deepEqual(next.endpoints, state.endpoints); assert.deepEqual(next.modelSupplies, state.modelSupplies);
  assert.equal(providerOf(next).apiKeys[1].name, key.name);
});

test('stale, foreign, duplicate and malformed changes fail atomically', async () => {
  const { state, provider, input } = await fixture(), before = structuredClone(state);
  const apiKey = (await providerApiKeysDraft([secrets[2]])).apiKeys[0];
  for (const values of [{ ...input, keyId: 'missing' }, { ...input, expectedFingerprint: 'stale' }, { ...input, apiKey: null }, { ...input, apiKey: { ...apiKey, maskedKey: secrets[2] } }, { ...input, apiKey: provider.apiKeys[1] }]) assert.throws(() => op(state, 'editApiKey', { apiKey, confirmed: true, ...values }));
  assert.throws(() => op(state, 'deleteApiKey', { ...input, confirmed: true }, 'provider-self'), /已变化|不存在/);
  assert.deepEqual(state, before);
});

test('key maintenance keeps role, revision, storage-failure and masked persistence boundaries', async () => {
  const { state, input } = await fixture(), apiKey = (await providerApiKeysDraft([secrets[2]])).apiKeys[0];
  const action = { type: 'modelOperations', operation: 'provider', data: { operation: 'editApiKey', objectId: 'provider-moma', values: { ...input, apiKey, confirmed: true } } };
  for (const currentRole of ['运维人员', '只读观察员']) assert.throws(() => commitAdminState({ ...state, currentRole }, action), /无权/);
  const before = JSON.stringify(state);
  assert.throws(() => persistModelAction(state, action, { getItem: () => JSON.stringify({ ...state, revision: state.revision + 1 }), setItem: () => assert.fail('must not write') }), /数据已变化/);
  assert.throws(() => persistModelAction(state, action, { getItem: () => before, setItem: () => { throw new Error('quota'); } }), /quota/);
  let saved;
  const next = persistModelAction(state, action, { getItem: () => before, setItem: (_, value) => { saved = value; } });
  for (const secret of secrets) assert.ok(!saved.includes(secret));
  assert.deepEqual(parseAdminState(saved).providers, next.providers);
  assert.equal(JSON.stringify(state), before);
});
