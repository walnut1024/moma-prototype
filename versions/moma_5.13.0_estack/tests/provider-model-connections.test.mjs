import assert from 'node:assert/strict';
import test from 'node:test';
import { createAdminSeed, commitAdminState, parseAdminState, persistModelAction } from '../src/admin-v2/store.js';
import { catalogueConnections, connectionCatalogueIds } from '../src/admin-v2/provider-model-connections.js';
import { providerApiKeysDraft } from '../src/admin-v2/provider-management.js';
import { connectionTestPassed } from '../src/admin-v2/connection-state.js';
const providerId = 'provider-moma', modelId = 'DeepSeek-R1';
const action = (operation, values, objectId = providerId) => ({ type: 'modelOperations', operation: 'provider', data: { operation, objectId, values } });
const run = (state, operation, data) => commitAdminState(state, { type: 'modelOperations', operation, data });
const configure = (state, values = {}) => commitAdminState(state, action('catalogueConnection', { modelId, protocol: 'OpenAI', baseUrl: 'https://new.example.invalid/v1', ...values }));

test('catalogue address is explicit, model-scoped, persisted and leaves prices, keys and other versions intact', () => {
  const seed = createAdminSeed(), before = JSON.stringify(seed), provider = seed.providers.find(p => p.id === providerId);
  assert.equal(catalogueConnections(seed, provider, modelId).length, 0);
  const saved = configure(seed), restored = parseAdminState(JSON.stringify(saved)), next = restored.providers.find(p => p.id === providerId);
  const endpoints = catalogueConnections(restored, next, modelId);
  assert.equal(endpoints.length, 1); assert.equal(endpoints[0].baseUrl, 'https://new.example.invalid/v1');
  assert.equal(endpoints[0].protocol, 'OpenAI'); assert.equal(endpoints[0].status, '草稿');
  assert.deepEqual(endpoints[0].apiKeys, []);
  assert.deepEqual(connectionCatalogueIds(restored, next, endpoints[0].id), [modelId]);
  assert.equal(catalogueConnections(restored, next, 'DeepSeek-V3').length, 0);
  assert.deepEqual(next.catalogPricing, provider.catalogPricing);
  for (const key of ['modelSupplies', 'supplyPrices', 'modelSalePrices', 'models']) assert.deepEqual(saved[key], seed[key]);
  assert.equal(JSON.stringify(seed), before);
  const existing = seed.endpoints.find(item => item.providerId === providerId);
  const reused = configure(seed, { endpointId: existing.id, baseUrl: existing.baseUrl + '/' });
  assert.deepEqual(reused.endpoints, seed.endpoints);
  assert.equal(catalogueConnections(reused, reused.providers.find(p => p.id === providerId), modelId)[0].id, existing.id);
  assert.throws(() => run(saved, 'checkConnection', { endpointId: endpoints[0].id }), /API Key/);
});

test('keys can be maintained separately; shared address edits require confirmation and invalidate checks', async () => {
  let state = configure(createAdminSeed());
  const owner = () => state.providers.find(p => p.id === providerId), ep = catalogueConnections(state, owner(), modelId)[0];
  const keys = await providerApiKeysDraft(['sk-local-only-model-key-0001']);
  assert.throws(() => commitAdminState(state, action('connectionKeys', { ...keys, endpointId: ep.id })), /确认/);
  state = commitAdminState(state, action('connectionKeys', { ...keys, endpointId: ep.id, confirmed: true }));
  state = run(state, 'checkConnection', { endpointId: ep.id });
  assert.ok(connectionTestPassed(state.endpoints.find(e => e.id === ep.id)));
  state = configure(state, { modelId: 'DeepSeek-V3', endpointId: ep.id });
  const before = JSON.stringify(state);
  assert.throws(() => configure(state, { endpointId: ep.id, baseUrl: 'https://changed.example.invalid/v1' }), /确认/);
  assert.equal(JSON.stringify(state), before);
  state = configure(state, { endpointId: ep.id, baseUrl: 'https://changed.example.invalid/v1', confirmed: true });
  const changed = state.endpoints.find(e => e.id === ep.id);
  assert.equal(changed.connectionTest, null); assert.equal(changed.status, '停用');
  assert.equal(changed.apiKeys.length, 1);
  assert.equal(catalogueConnections(state, owner(), 'DeepSeek-V3')[0].baseUrl, changed.baseUrl);
  state = commitAdminState(state, action('connectionKeys', { apiKeys: [], credentialRef: '', endpointId: ep.id, confirmed: true }));
  assert.throws(() => run(state, 'checkConnection', { endpointId: ep.id }), /API Key/);
  assert.ok(!JSON.stringify(state).includes('sk-local-only-model-key-0001'));
});

test('existing exact supply links are shown, ambiguous links stay explicit, and confirmed rebinding preserves old endpoints', () => {
  let state = createAdminSeed();
  const provider = state.providers.find(p => p.id === providerId), first = state.endpoints.find(e => e.providerId === providerId), second = { ...first, id: 'second-model-connection', baseUrl: 'https://second.example.invalid/v1' };
  state = { ...state, endpoints: [...state.endpoints, second], modelSupplies: [...state.modelSupplies, { id: 'linked-one', modelId: 'model-1', endpointId: first.id, catalogueModelId: modelId, status: '已启用', validationStatus: '通过' }, { id: 'linked-two', modelId: 'model-1', endpointId: second.id, upstreamModelId: modelId, status: '已启用', validationStatus: '通过' }] };
  assert.equal(catalogueConnections(state, provider, modelId).length, 2);
  assert.throws(() => configure(state, { endpointId: second.id, baseUrl: second.baseUrl }), /确认/);
  const saved = configure(state, { endpointId: second.id, baseUrl: second.baseUrl, confirmed: true });
  assert.equal(saved.endpoints.length, state.endpoints.length);
  assert.deepEqual(saved.endpoints.find(e => e.id === first.id), first);
  assert.equal(saved.modelSupplies.find(s => s.id === 'linked-one').endpointId, second.id);
  assert.equal(saved.modelSupplies.find(s => s.id === 'linked-one').validationStatus, '待验证');
  assert.equal(catalogueConnections(saved, saved.providers.find(p => p.id === providerId), modelId).length, 1);
});

test('invalid URL, cross-supplier reference, unknown model, permission, revision and storage failures never partially save', () => {
  const state = createAdminSeed(), before = JSON.stringify(state);
  for (const baseUrl of ['', 'http://third-party.example.invalid', 'https://user:pass@example.invalid', 'javascript:alert(1)', 'https://example.invalid?secret=x']) assert.throws(() => configure(state, { baseUrl }));
  assert.throws(() => configure(state, { endpointId: state.endpoints.find(e => e.providerId !== providerId).id }), /不属于/);
  assert.throws(() => configure(state, { modelId: 'not-in-catalogue' }), /不在供应商目录/);
  assert.throws(() => configure({ ...state, currentRole: '运维人员' }), /无权/);
  const request = action('catalogueConnection', { modelId, protocol: 'OpenAI', baseUrl: 'https://valid.example.invalid/v1' });
  assert.throws(() => persistModelAction(state, request, { getItem: () => JSON.stringify({ ...state, revision: state.revision + 1 }), setItem: () => assert.fail() }), /数据已变化/);
  assert.throws(() => persistModelAction(state, request, { getItem: () => before, setItem: () => { throw new Error('quota'); } }), /quota/);
  assert.equal(JSON.stringify(state), before);
});
