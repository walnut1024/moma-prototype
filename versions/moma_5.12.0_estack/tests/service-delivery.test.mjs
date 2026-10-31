import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminSeed, parseAdminState, serializeAdminState, loadAdminState, STORAGE_KEY } from '../src/admin-v2/store.js';
import { completeServiceProviderExample } from '../src/admin-v2/service-review-cases.js';
import { prepareSupplierReviewCases } from '../src/admin-v2/supplier-review-cases.js';
import { publicationChecks } from '../src/admin-v2/model-management.js';
import { activeProviderPrice, providerServices, serviceDirectoryModels } from '../src/admin-v2/service-workspace.js';
import { routingServices, routingChannels, serviceRoute, activeRouteVersion, validateRouteConfig } from '../src/admin-v2/service-routing.js';

const legacy = () => prepareSupplierReviewCases(createAdminSeed());
const addedModel = (before, after) => after.models.find(model => !before.models.some(row => row.id === model.id));
const preserveRecords = (before, after) => {
  for (const [collection, records] of Object.entries(before)) {
    if (!Array.isArray(records)) continue;
    for (const row of records) assert.deepEqual(after[collection].find(item => item.id === row.id), row, `${collection}: ${row.id}`);
  }
};
const memoryStorage = state => {
  let raw = serializeAdminState(state), writes = 0;
  return {
    getItem(key) { assert.equal(key, STORAGE_KEY); return raw; },
    setItem(key, value) { assert.equal(key, STORAGE_KEY); raw = value; writes++; },
    get raw() { return raw; },
    get writes() { return writes; },
  };
};

test('delivery completion appends one independent provider service without changing legacy records or hiding five models', () => {
  const source = legacy(), before = structuredClone(source);
  const oldIds = serviceDirectoryModels(source).map(model => model.id);
  const next = completeServiceProviderExample(source), model = addedModel(source, next);
  assert.deepEqual(source, before);
  preserveRecords(source, next);
  assert.ok(model);
  assert.equal(next.models.length, source.models.length + 1);
  assert.equal(model.name, 'Qwen3.8 Max');
  assert.ok(model.id.startsWith('service-delivery'));
  assert.equal(model.serviceManaged, true);
  assert.equal(model.serviceReviewCase, undefined);
  assert.equal(model.serviceMode, 'provider');
  assert.equal(next.serviceProviderExampleVersion, 1);
  const visible = new Set(serviceDirectoryModels(next).map(row => row.id));
  assert.ok(visible.has(model.id));
  assert.ok(oldIds.every(id => visible.has(id)));
});

test('new provider example has independent public IDs, prices and valid supplier-isolated routes', () => {
  const source = legacy(), state = completeServiceProviderExample(source), model = addedModel(source, state);
  const providers = providerServices(model);
  assert.ok(providers.length >= 2);
  assert.equal(new Set(providers.map(row => row.callId)).size, providers.length);
  assert.ok(providers.every(row => row.callId && activeProviderPrice(state, model.id, row.providerId)?.items.length));
  const checks=publicationChecks(state,model);
  assert.ok(checks.filter(check=>check.tab!=='platform').every(check=>check.passed));
  assert.equal(checks.find(check=>check.tab==='platform').passed,false);
  const services = routingServices(state).filter(service => service.modelId === model.id);
  assert.equal(services.length, providers.length);
  for (const service of services) {
    const channels = routingChannels(state, service), version = activeRouteVersion(serviceRoute(state, service.id));
    assert.ok(channels.length);
    assert.ok(channels.every(channel => channel.provider.id === service.providerId && channel.available));
    assert.ok(version);
    assert.doesNotThrow(() => validateRouteConfig(state, service, version.config));
  }
});

test('an already configured visible provider service only gets the one-time marker', () => {
  const source = parseAdminState(null), before = structuredClone(source);
  assert.ok(serviceDirectoryModels(source).some(model => model.serviceMode === 'provider' && publicationChecks(source, model).filter(check=>check.tab!=='platform').every(check => check.passed)));
  const state = completeServiceProviderExample(source);
  preserveRecords(before, state);
  for (const [collection, records] of Object.entries(before)) if (Array.isArray(records)) assert.equal(state[collection].length, records.length, collection);
  assert.equal(state.serviceProviderExampleVersion, 1);
  assert.deepEqual(source, before);
});

test('occupied delivery IDs and public call IDs are preserved while the example receives distinct identities', () => {
  const source = legacy();
  source.providers.push({ ...source.providers[0], id: 'service-delivery-provider-existing' });
  source.models.push({ ...source.models[0], id: 'custom-service-collision', modelId: 'qwen3.8-max-provider-1', serviceProviders: [{ providerId: source.providers[0].id, callId: 'qwen3.8-max-provider-2-aliyun', status: '已关联' }] });
  const originalIds = new Set(source.models.flatMap(model => [model.modelId, ...providerServices(model).map(entry => entry.callId)]));
  const state = completeServiceProviderExample(source), model = addedModel(source, state);
  preserveRecords(source, state);
  assert.equal(originalIds.has(model.modelId), false);
  assert.ok(providerServices(model).every(entry => !originalIds.has(entry.callId)));
  for (const [collection, records] of Object.entries(source)) {
    if (!Array.isArray(records)) continue;
    assert.equal(new Set(state[collection].map(row => row.id)).size, state[collection].length, collection);
  }
});

test('existing storage persists completion and revision once, with identical second-load records', () => {
  const source = legacy(), storage = memoryStorage(source);
  const first = loadAdminState(storage);
  assert.equal(first.storageError, undefined);
  assert.equal(first.revision, source.revision + 1);
  assert.equal(storage.writes, 1);
  assert.equal(JSON.parse(storage.raw).serviceProviderExampleVersion, 1);
  const saved = storage.raw, second = loadAdminState(storage);
  assert.deepEqual(second, first);
  assert.equal(storage.raw, saved);
  assert.equal(storage.writes, 1);
});

test('deleting the independently added model after completion never recreates it', () => {
  const source = legacy(), completed = completeServiceProviderExample(source), model = addedModel(source, completed);
  completed.models = completed.models.filter(row => row.id !== model.id);
  const before = structuredClone(completed), storage = memoryStorage(completed);
  const persisted = parseAdminState(storage.raw);
  assert.deepEqual(completeServiceProviderExample(completed), before);
  const loaded = loadAdminState(storage);
  assert.equal(loaded.models.some(row => row.id === model.id), false);
  assert.equal(loaded.serviceProviderExampleVersion, 1);
  assert.equal(storage.writes, 0);
  preserveRecords(persisted, loaded);
});

test('later manual mode, provider, price and route edits are not repaired on reload', () => {
  const source = legacy(), completed = completeServiceProviderExample(source), model = addedModel(source, completed);
  model.name = '手工调整的服务';
  model.serviceMode = 'standard';
  model.serviceProviders = [];
  completed.modelSalePrices.find(price => price.modelId === model.id).items[0].amount = 123456;
  for (const route of completed.serviceRoutes.filter(row => row.serviceId.includes(model.id))) route.activeVersion = 0;
  const storage = memoryStorage(completed), persisted = parseAdminState(storage.raw), loaded = loadAdminState(storage);
  preserveRecords(persisted, loaded);
  assert.equal(loaded.models.length, persisted.models.length);
  assert.equal(storage.writes, 0);
});

test('storage failure returns original parsed records with an error and no partial completion', () => {
  const source = legacy(), raw = JSON.stringify(source), original = parseAdminState(raw);
  let writes = 0;
  const storage = {
    getItem: () => raw,
    setItem() { writes++; throw new Error('存储空间不足'); },
  };
  const state = loadAdminState(storage);
  assert.ok(state.storageError);
  assert.equal(writes, 1);
  assert.deepEqual({ ...state, storageError: undefined }, { ...original, storageError: undefined });
  assert.equal(state.models.length, source.models.length);
  assert.equal(state.serviceProviderExampleVersion, undefined);
});

test('concurrent raw revision change aborts completion without overwriting the other tab', () => {
  const source = legacy(), raw = JSON.stringify(source), incoming = JSON.stringify({ ...source, revision: source.revision + 1 });
  let reads = 0, writes = 0;
  const storage = { getItem: () => ++reads === 1 ? raw : incoming, setItem: () => { writes++; } };
  const state = loadAdminState(storage), original = parseAdminState(raw);
  assert.ok(state.storageError);
  assert.equal(writes, 0);
  assert.deepEqual({ ...state, storageError: undefined }, { ...original, storageError: undefined });
  assert.equal(state.serviceProviderExampleVersion, undefined);
});
