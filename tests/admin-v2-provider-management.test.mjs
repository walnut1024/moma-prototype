import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminSeed, commitAdminState, persistProviderAction, parseAdminState, STORAGE_KEY } from '../src/admin-v2/store.js';
import { availableSupplies } from '../src/admin-v2/model-management.js';
import { connectionTestCurrent, providerFacts, providerImpact } from '../src/admin-v2/provider-management.js';

const act = (state, operation, objectId, data = {}) => commitAdminState(state, { type: 'providerOperation', operation, objectId, data });
const config = { providerId: 'provider-cmss', name: '测试接入', protocol: 'OpenAI', baseUrl: 'https://test.demo.invalid/v1', credentialRef: 'env:PROVIDER_KEY', capacity: 1000, timeoutSeconds: 60 };

test('provider facts use live supply mappings and availability rather than endpoint modelIds', () => {
  const state = createAdminSeed();
  const provider = state.providers.find(item => item.id === 'provider-cmss');
  const facts = providerFacts(state, provider);
  assert.equal(facts.endpoints.length, 1);
  assert.ok(facts.available.some(model => model.id === 'model-1'));
  state.endpoints[0].modelIds.push('orphan-id');
  assert.equal(providerFacts(state, provider).models.length, facts.models.length);
  provider.status = '停用';
  assert.equal(providerFacts(state, provider).available.length, 0);
});

test('create preserves existing data, checks names and commits a stable ID with audit', () => {
  const state = createAdminSeed();
  const next = act(state, 'create', null, { name: ' 新供应商 ', sourceType: 'thirdParty', integrationType: 'Token 聚合服务' });
  assert.equal(next.providers[0].name, '新供应商');
  assert.match(next.providers[0].id, /^provider-/);
  assert.deepEqual(next.models, state.models);
  assert.equal(next.audits[0].objectId, next.providers[0].id);
  assert.throws(() => act(next, 'create', null, { name: '新供应商', sourceType: 'thirdParty', integrationType: 'Token 聚合服务' }), /已存在/);
  assert.throws(() => act(next, 'profile', 'provider-cmss', { name: '江苏移动', sourceType: 'selfHosted', integrationType: '自有推理服务' }), /不能变更/);
});

test('addresses reject embedded credentials, query secrets, invalid schemes and real keys', () => {
  const state = createAdminSeed();
  for (const baseUrl of ['file:///etc/passwd', 'http://remote.demo.invalid', 'https://user:pass@demo.invalid', 'https://demo.invalid?api_key=123', 'https://demo.invalid#token']) {
    assert.throws(() => act(state, 'connection', null, { ...config, baseUrl }));
  }
  assert.throws(() => act(state, 'connection', null, { ...config, credentialRef: 'sk-real-secret' }), /真实密钥/);
  assert.throws(() => act(state, 'connection', null, { ...config, capacity: 1.5 }), /正整数/);
  assert.throws(() => act(state, 'connection', null, { ...config, timeoutSeconds: 601 }), /600/);
  const next = act(state, 'connection', null, { ...config, providerId: 'provider-self', baseUrl: 'http://inference.demo.invalid/v1' });
  assert.equal(next.endpoints[0].baseUrl, 'http://inference.demo.invalid/v1');
  assert.equal(next.endpoints[0].health, null);
});

test('full supplier onboarding supports connection testing and separate model mapping validation', () => {
  let state = act(createAdminSeed(), 'connection', null, config);
  const endpoint = state.endpoints[0];
  assert.throws(() => act(state, 'enableConnection', endpoint.id), /先通过/);
  state = act(state, 'testConnection', endpoint.id, { scenario: '鉴权失败' });
  assert.equal(state.endpoints[0].connectionTest.result, '失败');
  assert.throws(() => act(state, 'enableConnection', endpoint.id), /先通过/);
  state = act(state, 'testConnection', endpoint.id, { scenario: '成功' });
  state = act(state, 'enableConnection', endpoint.id);
  state = act(state, 'supply', 'provider-cmss', { providerId: 'provider-cmss', modelId: 'model-1', endpointId: endpoint.id, upstreamModelId: 'ds-supplier', capabilities: { context: 1048576, output: 8192, streaming: true } });
  const supply = state.modelSupplies[0];
  assert.equal(supply.status, '已停用');
  assert.throws(() => act(state, 'enableSupply', 'provider-cmss', { providerId: 'provider-cmss', id: supply.id }), /验证通过/);
  state = act(state, 'verify', 'provider-cmss', { providerId: 'provider-cmss', id: supply.id, result: '通过' });
  state = act(state, 'enableSupply', 'provider-cmss', { providerId: 'provider-cmss', id: supply.id });
  assert.ok(availableSupplies(state, 'model-1').some(item => item.id === supply.id));
  assert.throws(() => act(state, 'disableSupply', 'provider-self', { providerId: 'provider-self', id: supply.id }), /不属于/);
});

test('connection reconfiguration atomically suspends and invalidates related supply validation only', () => {
  let state = createAdminSeed();
  state = act(state, 'testConnection', 'endpoint-ds', { scenario: '成功' });
  assert.equal(connectionTestCurrent(state.endpoints.find(item => item.id === 'endpoint-ds')), true);
  const before = structuredClone(state);
  const next = act(state, 'connection', 'endpoint-ds', { ...config, baseUrl: 'https://changed.demo.invalid/v1' });
  assert.equal(next.endpoints.find(item => item.id === 'endpoint-ds').status, '停用');
  assert.equal(next.endpoints.find(item => item.id === 'endpoint-ds').connectionTest, null);
  for (const supply of next.modelSupplies) {
    if (supply.endpointId === 'endpoint-ds') { assert.equal(supply.validationStatus, '待验证'); assert.equal(supply.status, '已停用'); }
    else assert.deepEqual(supply, before.modelSupplies.find(item => item.id === supply.id));
  }
  assert.deepEqual(next.models, before.models);
  assert.throws(() => act(next, 'enableConnection', 'endpoint-ds'), /先通过/);
});

test('disable impact reports routes, fallback references and models that lose all supply', () => {
  const state = createAdminSeed();
  const impact = providerImpact(state, 'provider-self');
  assert.equal(impact.routes.length, 2);
  assert.equal(impact.fallbacks.length, 1);
  assert.ok(impact.exposed.some(model => model.id === 'model-2'));
  assert.throws(() => act(state, 'disableProvider', 'provider-self'), /确认/);
  const next = act(state, 'disableProvider', 'provider-self', { confirmed: true });
  assert.equal(availableSupplies(next, 'model-2').length, 0);
  assert.deepEqual(next.routes, state.routes);
  assert.deepEqual(next.endpoints, state.endpoints);
});

test('provider operations reject every unauthorized role and do not bypass cross-provider ownership', () => {
  const state = createAdminSeed();
  for (const role of ['运营人员', '财务人员', '安全管理员', '只读观察员']) {
    assert.throws(() => commitAdminState(state, { type: 'providerOperation', operation: 'testConnection', objectId: 'endpoint-ds', data: { scenario: '成功' } }, role), /无权/);
  }
  assert.doesNotThrow(() => commitAdminState(state, { type: 'providerOperation', operation: 'testConnection', objectId: 'endpoint-ds', data: { scenario: '成功' } }, '运维人员'));
  assert.throws(() => act(state, 'connection', 'endpoint-ds', { ...config, providerId: 'provider-self' }), /不属于/);
});

test('synchronous persistence refuses stale revisions and write failures without returning success', () => {
  const state = createAdminSeed(), action = { type: 'providerOperation', operation: 'disableProvider', objectId: 'provider-self', data: { confirmed: true } };
  const storage = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const adapter = { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) };
  const next = persistProviderAction(state, action, adapter);
  assert.equal(JSON.parse(storage.get(STORAGE_KEY)).providers.find(item => item.id === 'provider-self').status, '停用');
  assert.throws(() => persistProviderAction(state, action, adapter), /数据已变化/);
  assert.throws(() => persistProviderAction(next, action, { getItem: adapter.getItem, setItem: () => { throw new Error('磁盘写入失败'); } }), /磁盘写入失败/);
  assert.equal(state.providers.find(item => item.id === 'provider-self').status, '已启用');
});

test('attention cannot bypass missing, failed or stale connection tests in either model entry point', () => {
  for (const check of [null, { result: '失败' }, { result: '通过', fingerprint: 'old-config' }]) {
    const state = createAdminSeed(), endpoint = state.endpoints.find(item => item.id === 'endpoint-kimi');
    endpoint.connectionTest = check;
    const supply = state.modelSupplies.find(item => item.endpointId === endpoint.id);
    supply.validationStatus = '通过'; supply.status = '已启用';
    assert.equal(availableSupplies(state, supply.modelId).some(item => item.id === supply.id), false);
    assert.throws(() => act(state, 'verify', endpoint.providerId, { providerId: endpoint.providerId, id: supply.id, result: '通过' }), /连接测试/);
    assert.throws(() => commitAdminState(state, { type: 'modelOperation', operation: 'verify', modelId: supply.modelId, data: { id: supply.id, result: '通过' } }), /连接测试/);
    assert.throws(() => act(state, 'enableSupply', endpoint.providerId, { providerId: endpoint.providerId, id: supply.id }), /测试通过/);
  }
});

test('connection checks and enablement remain separate, and missing RPM stays unconfigured', () => {
  let state = act(createAdminSeed(), 'connection', null, { ...config, capacity: '' });
  const endpoint = state.endpoints[0];
  assert.equal(endpoint.capacity, null);
  state = act(state, 'testConnection', endpoint.id, { scenario: '成功' });
  state = act(state, 'supply', 'provider-cmss', { providerId: 'provider-cmss', endpointId: endpoint.id, modelId: 'model-1', upstreamModelId: 'draft-ds', capabilities: { context: 16384, output: 8192 } });
  const supply = state.modelSupplies[0];
  assert.throws(() => act(state, 'verify', 'provider-cmss', { providerId: 'provider-cmss', id: supply.id, result: '通过' }), /启用接入/);
  state = act(state, 'enableConnection', endpoint.id);
  state = act(state, 'verify', 'provider-cmss', { providerId: 'provider-cmss', id: supply.id, result: '通过' });
  assert.equal(availableSupplies(state, 'model-1').some(item => item.id === supply.id), false);
  state = act(state, 'enableSupply', 'provider-cmss', { providerId: 'provider-cmss', id: supply.id });
  assert.equal(availableSupplies(state, 'model-1').some(item => item.id === supply.id), true);
  state = act(state, 'testConnection', endpoint.id, { scenario: '超时' });
  assert.equal(availableSupplies(state, 'model-1').some(item => item.id === supply.id), false);
});

test('disable impact does not claim an already unavailable model will lose supply', () => {
  const state = createAdminSeed();
  for (const endpoint of state.endpoints) endpoint.connectionTest = null;
  assert.equal(providerImpact(state, 'provider-self').exposed.length, 0);
});


test('restoring stored endpoints never invents passing connection tests', () => {
  const state = createAdminSeed();
  for (const endpoint of state.endpoints) delete endpoint.connectionTest;
  const restored = parseAdminState(JSON.stringify(state));
  assert.deepEqual(restored.endpoints, state.endpoints);
  assert.equal(providerFacts(restored, restored.providers.find(item => item.id === 'provider-cmss')).available.length, 0);
  assert.equal(restored.modelSupplies.find(item => item.id === 'supply-glm53-1').status, '已启用');
});

test('editing a mapping cannot move an existing supply from another provider or connection', () => {
  const state = createAdminSeed();
  assert.throws(() => act(state, 'supply', 'provider-cmss', { providerId:'provider-cmss', id:'supply-glm53-2', modelId:'model-glm53', endpointId:'endpoint-ds', upstreamModelId:'hijack', capabilities:{context:131072,output:8192} }), /不能更换接入/);
});
