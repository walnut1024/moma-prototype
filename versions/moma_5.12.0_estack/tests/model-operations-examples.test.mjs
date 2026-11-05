import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { parseAdminState, commitAdminState, prepareModelOperationsExamples, serializeAdminState, STORAGE_KEY } from '../src/admin-v2/store.js';
import { withAdminSession } from './admin-session-fixture.mjs';
import { MODEL_OPERATIONS_EXAMPLES, MODEL_OPERATIONS_SUPPLIERS, MODEL_OPERATIONS_EXAMPLE_ID } from '../src/admin-v2/model-operations-examples.js';
import { modelLibrary, libraryRecord } from '../src/admin-v2/model-library.js';
import { catalogueChannels } from '../src/admin-v2/provider-channels.js';
import { supplierDirectory } from '../src/admin-v2/moma-provider.js';
import { serviceChannelCosts, serviceDirectoryModels } from '../src/admin-v2/service-workspace.js';

const seed = () => withAdminSession(parseAdminState(null));
const action = { type: 'modelOperations', operation: 'prepareModelOperationsExamples', data: { confirmed: true } };
beforeEach(t => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage'), records = new Map();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: key => records.get(key) ?? null, setItem: (key, value) => records.set(key, value) } });
  t.after(() => descriptor ? Object.defineProperty(globalThis, 'localStorage', descriptor) : delete globalThis.localStorage);
  t.mock.method(globalThis, 'fetch', () => assert.fail('Mock data preparation must not call an upstream'));
});
function storageFor(state) {
  let raw = serializeAdminState(state);
  return { writes: 0, getItem: key => key === STORAGE_KEY ? raw : null, setItem(key, value) { assert.equal(key, STORAGE_KEY); this.writes++; raw = value; } };
}

test('the requested 11 canonical models have exactly 5 suppliers, 6 new channels and 27 explicit relationships', () => {
  const state = seed(), before = structuredClone(state), next = commitAdminState(state, action);
  const models = modelLibrary(next).filter(row => MODEL_OPERATIONS_EXAMPLES.some(spec => spec.code === row.modelId.toLowerCase()));
  assert.equal(models.length, 11); assert.deepEqual(state, before);
  assert.equal(next.endpoints.filter(row => row.id.startsWith('mock-channel-')).length, 6);
  const suppliers = MODEL_OPERATIONS_SUPPLIERS.map(spec => next.providers.find(row => row.id === spec.id));
  assert.deepEqual(suppliers.map(row => row.name), ['移动云 MoMA', 'DeepSeek', '智谱', '月之暗面', '稀宇科技MiniMax']);
  const entries = suppliers.flatMap(row => row.catalogConnections.filter(item => item.id.startsWith('mock-association-')).map(item => ({ ...item, provider: row })));
  assert.equal(entries.length, 27);
  assert.equal(entries.filter(row => row.provider.id === 'provider-moma' && row.origin === 'direct').length, 8);
  assert.equal(entries.filter(row => row.provider.id === 'provider-moma' && row.origin === 'resale').length, 11);
  assert.equal(entries.filter(row => row.provider.id !== 'provider-moma').length, 8);
  const moma = supplierDirectory(next).find(row => row.id === 'provider-moma');
  for (const spec of MODEL_OPERATIONS_EXAMPLES) assert.ok(moma.catalogModelIds.some(code => code.toLowerCase() === spec.code), `${spec.name} remains visible in the actual supplier directory`);
  for (const spec of MODEL_OPERATIONS_EXAMPLES) {
    const master = models.find(row => row.modelId.toLowerCase() === spec.code);
    assert.equal(master.profile.releaseDate || '', spec.date); assert.equal(master.profile.author, spec.author);
    assert.ok(serviceDirectoryModels(next).some(row => libraryRecord(next, row.id)?.id === master.id));
    const links = entries.filter(row => row.provider.catalogModels.some(item => item.modelId === row.modelId && item.libraryId === master.id));
    assert.equal(links.length, spec.resaleOnly ? 1 : 3, spec.name);
    if (spec.resaleOnly) assert.equal(links[0].origin, 'resale');
    const previous = modelLibrary(before).find(row => row.modelId.toLowerCase() === spec.code);
    if (previous) assert.equal(master.id, previous.id, 'exact model code reuses the stable master');
  }
  const flash = models.find(row => row.modelId === 'deepseek-v4-flash');
  assert.equal(flash.profile.parameters, 284); assert.equal(flash.profile.activeParameters, 13);
  const qwen = models.find(row => row.modelId === 'qwen3.6-flash');
  assert.equal(qwen.profile.releaseDate, ''); assert.match(qwen.profile.detailDescription, /未单独核实/);
  assert.deepEqual(next.modelSalePrices, before.modelSalePrices); assert.deepEqual(next.supplyPrices, before.supplyPrices); assert.deepEqual(next.serviceRoutes, before.serviceRoutes);
  assert.deepEqual(next.modelOnboardings, before.modelOnboardings); assert.deepEqual(next.apiKeys, before.apiKeys); assert.deepEqual(next.orders, before.orders);
  for (const model of next.models.filter(row => !before.models.some(old => old.id === row.id))) {
    assert.equal(model.callsEnabled, false); assert.equal(model.serviceMode, null); assert.equal(model.visibility, '内部');
    assert.deepEqual(model.tenantIds, []); assert.equal(model.platformPublications, undefined); assert.equal(model.capabilities.tools == null, true);
  }
});

test('unprovided upstream IDs, quotes, addresses and credentials stay unknown in the actual supply projection', () => {
  const next = commitAdminState(seed(), action);
  for (const endpoint of next.endpoints.filter(row => row.id.startsWith('mock-channel-'))) {
    assert.equal(endpoint.baseUrl, ''); assert.equal(endpoint.apiKeyId, ''); assert.equal(endpoint.connectionTest, null);
    const provider = next.providers.find(row => row.id === endpoint.providerId);
    for (const row of provider.catalogConnections.filter(row => row.endpointId === endpoint.id)) {
      const projected = catalogueChannels(next, provider, row.modelId).find(item => item.id === row.id);
      assert.equal(projected.upstreamModelId, ''); assert.equal(projected.enabled, false); assert.equal(projected.health, null);
      assert.deepEqual(serviceChannelCosts(projected), []);
    }
  }
});

test('explicit preparation persists once and never recreates removed fixture resources or resets later edits on replay or reload', () => {
  const storage = storageFor(seed());
  assert.equal(prepareModelOperationsExamples(storage), true); assert.equal(storage.writes, 1);
  let current = JSON.parse(storage.getItem(STORAGE_KEY));
  current.providers.find(row => row.id === 'provider-moma').name = '自己维护的供应商名称';
  const removed = current.endpoints.find(row => row.id.startsWith('mock-channel-minimax'));
  current.endpoints = current.endpoints.filter(row => row.id !== removed.id);
  current.providers.find(row => row.id === removed.providerId).catalogConnections = [];
  storage.setItem(STORAGE_KEY, serializeAdminState(current)); const writes = storage.writes;
  assert.equal(prepareModelOperationsExamples(storage), false); assert.equal(storage.writes, writes);
  const restored = parseAdminState(storage.getItem(STORAGE_KEY));
  assert.equal(restored.providers.find(row => row.id === 'provider-moma').name, '自己维护的供应商名称');
  assert.equal(restored.endpoints.some(row => row.id === removed.id), false);
  const replay = commitAdminState(restored, action);
  assert.deepEqual(replay.models, restored.models); assert.deepEqual(replay.providers, restored.providers); assert.deepEqual(replay.endpoints, restored.endpoints);
  assert.ok(replay.audits.some(row => row.objectId === MODEL_OPERATIONS_EXAMPLE_ID));
});

test('identity conflicts and unfinished material drafts reject the entire mock batch without partial changes', () => {
  const cases = [
    state => state.endpoints.push({ id: 'mock-channel-moma-resale', providerId: 'foreign' }),
    state => state.providers.push({ id: 'provider-minimax-direct', code: 'foreign', name: '已有供应商' }),
    state => { state.models.find(row => row.modelId === 'glm-5.2').materialDraft = { id: 'keep-draft' }; },
    state => state.modelTemplates.push({ ...structuredClone(state.models.find(row => row.modelId === 'glm-5.2')), id: 'different-master', modelId: 'GLM-5.2' }),
  ];
  for (const change of cases) {
    const state = seed(); change(state); const before = structuredClone(state);
    assert.throws(() => commitAdminState(state, action)); assert.deepEqual(state, before);
  }
  assert.throws(() => commitAdminState(seed(), { ...action, data: {} }), /确认/);
});

test('mock preparation respects permission, storage failure and revision conflicts', () => {
  const state = seed(), storage = storageFor(state), raw = storage.getItem(STORAGE_KEY);
  const quota = { ...storage, setItem() { throw new Error('quota'); } };
  assert.throws(() => prepareModelOperationsExamples(quota), /quota/); assert.equal(storage.getItem(STORAGE_KEY), raw);
  const readOnly = structuredClone(state); readOnly.adminSession = { accountId: 'admin-002' };
  assert.throws(() => prepareModelOperationsExamples(storageFor(readOnly)), /无权/);
  let reads = 0;
  const concurrent = { ...storage, getItem(key) { if (key !== STORAGE_KEY) return null; return ++reads === 1 ? raw : JSON.stringify({ ...state, revision: state.revision + 1 }); } };
  assert.throws(() => prepareModelOperationsExamples(concurrent), /数据已变化/); assert.equal(storage.getItem(STORAGE_KEY), raw);
});
