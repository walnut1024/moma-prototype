import assert from 'node:assert/strict';
import test from 'node:test';
import { createAdminSeed, commitAdminState, persistModelAction, parseAdminState } from '../src/admin-v2/store.js';
import { providerApiKeysDraft, PROVIDER_API_KEY_LIMIT, maskProviderApiKey, providerModelConnectivityTest, MODEL_CONNECTIVITY_SCENARIOS } from '../src/admin-v2/provider-management.js';

const first = 'sk-test-only-provider-key-0001', second = 'sk-test-only-provider-key-0002', third = 'sk-test-only-provider-key-0003';
const action = (values, objectId = 'provider-moma') => ({ type: 'modelOperations', operation: 'provider', data: { operation: 'addApiKeys', objectId, values } });

test('batch keys persist atomically in primary/backup order using only masked metadata', async () => {
  const seed = createAdminSeed(), before = JSON.stringify(seed);
  const draft = await providerApiKeysDraft([` ${first} `, '', second]);
  assert.equal(draft.apiKeys[0].maskedKey, 'sk-t••••••••0001');
  assert.equal(maskProviderApiKey('short'), '••••••••');
  assert.deepEqual(await providerApiKeysDraft([first, second]), draft);
  let saved;
  const storage = { getItem: () => saved || before, setItem: (_, value) => { saved = value; } };
  let state = persistModelAction(seed, action(draft), storage);
  const initial = state.providers.find(p => p.id === 'provider-moma').apiKeys;
  assert.equal(initial.length, 2);
  state = persistModelAction(state, action(await providerApiKeysDraft([third])), storage);
  const restored = parseAdminState(saved), keys = restored.providers.find(p => p.id === 'provider-moma').apiKeys;
  assert.equal(keys.length, 3);
  assert.deepEqual(keys.slice(0, 2), initial);
  assert.equal(new Set(keys.map(k => k.id)).size, 3);
  assert.deepEqual(keys.map(k => k.maskedKey), ['sk-t••••••••0001', 'sk-t••••••••0002', 'sk-t••••••••0003']);
  assert.ok(keys.every(k => /^[a-f0-9]{64}$/.test(k.fingerprint)));
  for (const secret of [first, second, third]) assert.ok(!saved.includes(secret));
  for (const collection of ['endpoints', 'modelSupplies', 'supplyPrices', 'modelSalePrices', 'apiKeys']) assert.deepEqual(state[collection], seed[collection]);
  assert.equal(JSON.stringify(seed), before);
  const provider = restored.providers.find(p => p.id === 'provider-moma');
  const edited = commitAdminState(restored, { type: 'modelOperations', operation: 'provider', data: { operation: 'profile', objectId: provider.id, values: { ...provider, contact: '客户经理' } } });
  assert.deepEqual(edited.providers.find(p => p.id === provider.id).apiKeys, keys);
});

test('duplicates within the batch or supplier reject the entire save; other suppliers stay independent', async () => {
  await assert.rejects(providerApiKeysDraft([first, ` ${first} `]), /相同的 API Key/);
  const draft = await providerApiKeysDraft([first]);
  const state = commitAdminState(createAdminSeed(), action(draft)), before = JSON.stringify(state);
  assert.throws(() => commitAdminState(state, action(draft)), /相同的 API Key/);
  assert.throws(() => commitAdminState(state, action({ apiKeys: [...draft.apiKeys, ...draft.apiKeys] })), /相同的 API Key/);
  assert.throws(() => commitAdminState(state, action(draft, 'missing')), /供应商不存在/);
  const other = state.providers.find(p => p.id !== 'provider-moma');
  const next = commitAdminState(state, action(draft, other.id));
  assert.equal(next.providers.find(p => p.id === other.id).apiKeys.length, 1);
  const mixed = await providerApiKeysDraft([second, first]);
  assert.throws(() => commitAdminState(state, action(mixed)), /相同的 API Key/);
  assert.equal(JSON.stringify(state), before);
});

test('invalid input and malformed or unmasked batch payloads never commit', async () => {
  for (const value of ['short', 'sk-key with spaces', 'sk-key\nnew-line', '密钥密钥密钥密钥密钥密钥', 'a'.repeat(513)]) await assert.rejects(providerApiKeysDraft([first, value]), /第 2 条 API Key/);
  for (const values of [[], ['', '  ']]) await assert.rejects(providerApiKeysDraft(values), /至少输入/);
  const state = createAdminSeed(), before = JSON.stringify(state), draft = await providerApiKeysDraft([first]);
  for (const values of [{}, { apiKeys: [] }, { apiKeys: [null] }, { apiKeys: [...draft.apiKeys, { ...draft.apiKeys[0], maskedKey: first }] }, { apiKeys: [{ ...draft.apiKeys[0], fingerprint: '' }] }]) assert.throws(() => commitAdminState(state, action(values)), /配置无效/);
  assert.equal(JSON.stringify(state), before);
});

test('batch and accumulated limits are enforced without partial writes', async () => {
  const values = Array.from({ length: PROVIDER_API_KEY_LIMIT }, (_, index) => `sk-test-only-limit-${String(index).padStart(4, '0')}`);
  await assert.rejects(providerApiKeysDraft([...values, first]), /最多配置 20/);
  const state = commitAdminState(createAdminSeed(), action(await providerApiKeysDraft(values))), before = JSON.stringify(state);
  assert.equal(state.providers.find(p => p.id === 'provider-moma').apiKeys.length, PROVIDER_API_KEY_LIMIT);
  const extra = await providerApiKeysDraft([first]);
  assert.throws(() => commitAdminState(state, action(extra)), /最多配置 20/);
  assert.equal(JSON.stringify(state), before);
});

test('batch saves retain role, revision and failed-storage protections', async () => {
  const state = createAdminSeed(), before = JSON.stringify(state), add = action(await providerApiKeysDraft([first, second]));
  assert.throws(() => commitAdminState({ ...state, currentRole: '运维人员' }, add), /无权/);
  assert.throws(() => persistModelAction(state, add, { getItem: () => JSON.stringify({ ...state, revision: state.revision + 1 }), setItem: () => assert.fail('must not write') }), /数据已变化/);
  assert.throws(() => persistModelAction(state, add, { getItem: () => before, setItem: () => { throw new Error('quota'); } }), /quota/);
  assert.equal(JSON.stringify(state), before);
});

test('model connectivity previews target one key, model and address without changing saved state', async () => {
  const state = commitAdminState(createAdminSeed(), action(await providerApiKeysDraft([first, second])));
  const provider = state.providers.find(item => item.id === 'provider-moma'), endpoint = state.endpoints.find(item => item.providerId === provider.id);
  const before = JSON.stringify(state);
  for (const key of provider.apiKeys) {
    const result = providerModelConnectivityTest(state, { providerId: provider.id, keyId: key.id, endpointId: endpoint.id, modelId: 'DeepSeek-R1', upstreamId: 'deepseek-r1', prompt: '请回复 OK', scenario: 'success' });
    assert.equal(result.result, '通过');
    assert.equal(result.simulated, true);
    assert.equal(result.keyId, key.id);
    assert.equal(result.endpointId, endpoint.id);
    assert.equal(result.upstreamId, 'deepseek-r1');
    assert.equal(result.modelId, 'DeepSeek-R1');
    assert.equal(result.status, 200);
    assert.equal(result.response.choices[0].message.content, 'OK');
    assert.ok(!JSON.stringify(result).includes(first));
  }
  assert.equal(JSON.stringify(state), before);
});

test('model previews reject invalid identities, model-address links and request fields', async () => {
  const state = commitAdminState(createAdminSeed(), action(await providerApiKeysDraft([first])));
  const provider = state.providers.find(item => item.id === 'provider-moma'), endpoint = state.endpoints.find(item => item.providerId === provider.id), key = provider.apiKeys[0];
  const request = { providerId: provider.id, keyId: key.id, endpointId: endpoint.id, modelId: 'DeepSeek-R1', upstreamId: 'DeepSeek-R1', prompt: '请回复 OK', scenario: 'success' };
  assert.throws(() => providerModelConnectivityTest(state, { ...request, keyId: 'missing' }), /API Key 不存在/);
  assert.throws(() => providerModelConnectivityTest(state, { ...request, endpointId: state.endpoints.find(item => item.providerId !== provider.id).id }), /当前供应商/);
  for (const patch of [{ baseUrl: 'bad' }, { baseUrl: 'http://example.com/v1' }, { baseUrl: 'https://user:pass@example.com' }, { baseUrl: 'https://example.com?key=secret' }, { protocol: 'invalid' }]) {
    const invalid = { ...state, endpoints: state.endpoints.map(item => item.id === endpoint.id ? { ...item, ...patch } : item) };
    assert.throws(() => providerModelConnectivityTest(invalid, request), /地址无效|协议无效/);
  }
  for (const patch of [{ modelId: 'missing' }, { upstreamId: '' }, { upstreamId: 'bad id' }, { upstreamId: 'a'.repeat(201) }, { prompt: '' }, { prompt: 'a'.repeat(2001) }, { scenario: '__proto__' }]) assert.throws(() => providerModelConnectivityTest(state, { ...request, ...patch }), /目录模型|Model ID|测试内容|预览状态/);
  const addressKey = (await providerApiKeysDraft([second])).apiKeys[0];
  const addressState = { ...state, endpoints: state.endpoints.map(item => item.id === endpoint.id ? { ...item, apiKeys: [addressKey] } : item) };
  assert.equal(providerModelConnectivityTest(addressState, { ...request, keyId: addressKey.id }).result, '通过');
  const linked = { ...addressState, providers: addressState.providers.map(item => item.id === provider.id ? { ...item, catalogConnections: [{ modelId: request.modelId, endpointId: endpoint.id }] } : item), endpoints: [...addressState.endpoints, { ...endpoint, id: 'other-address', apiKeys: [] }] };
  assert.throws(() => providerModelConnectivityTest(linked, { ...request, endpointId: 'other-address' }), /模型不匹配/);
  assert.throws(() => providerModelConnectivityTest(linked, { ...request, keyId: addressKey.id, endpointId: 'other-address' }), /API Key 不存在/);
});

test('all result previews expose distinct success, authentication, model and timeout feedback', async () => {
  const state = commitAdminState(createAdminSeed(), action(await providerApiKeysDraft([first])));
  const provider = state.providers.find(item => item.id === 'provider-moma'), endpoint = state.endpoints.find(item => item.providerId === provider.id), before = JSON.stringify(state);
  const statuses = { success: 200, unauthorized: 401, unavailable: 404, timeout: null };
  for (const scenario of Object.keys(MODEL_CONNECTIVITY_SCENARIOS)) {
    const result = providerModelConnectivityTest(state, { providerId: provider.id, keyId: provider.apiKeys[0].id, endpointId: endpoint.id, modelId: 'DeepSeek-R1', upstreamId: 'DeepSeek-R1', prompt: '请回复 OK', scenario });
    assert.equal(result.status, statuses[scenario]);
    assert.equal(result.result, scenario === 'success' ? '通过' : '失败');
    assert.equal(result.simulated, true);
    assert.equal(result.title, MODEL_CONNECTIVITY_SCENARIOS[scenario]);
    if (scenario !== 'success') { assert.ok(result.response.error.code); assert.ok(result.hint); }
  }
  assert.equal(JSON.stringify(state), before);
});
