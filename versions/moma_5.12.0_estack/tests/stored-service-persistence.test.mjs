import { legacySupplierState } from './legacy-supplier-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAdminState, serializeAdminState, loadAdminState, STORAGE_KEY } from '../src/admin-v2/store.js';

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

test('existing storage no longer auto-inserts superseded provider examples', () => {
  const source = legacySupplierState(), storage = memoryStorage(source);
  const first = loadAdminState(storage);
  assert.equal(first.storageError, undefined);
  assert.equal(first.revision, source.revision);
  assert.equal(storage.writes, 0);
  assert.equal(first.serviceProviderExampleVersion, undefined);
  assert.deepEqual(loadAdminState(storage), first);
});

test('later manual mode, provider, price and route edits are not repaired on reload', () => {
  const completed = legacySupplierState();
  const model = completed.models.find(row => row.serviceMode === 'provider');
  assert.ok(model);
  model.name = '手工调整的服务';
  model.serviceMode = 'standard';
  model.serviceProviders = [];
  const price = completed.modelSalePrices.find(row => row.modelId === model.id && row.items?.length);
  assert.ok(price);
  price.items[0].amount = 123456;
  for (const route of completed.serviceRoutes.filter(row => row.serviceId.includes(model.id))) route.activeVersion = 0;
  const storage = memoryStorage(completed), persisted = parseAdminState(storage.raw), loaded = loadAdminState(storage);
  preserveRecords(persisted, loaded);
  assert.equal(loaded.models.length, persisted.models.length);
  assert.equal(storage.writes, 0);
});

test('storage failure returns original parsed records with an error and no partial completion', () => {
  const source = legacySupplierState(); delete source.adminSession; const raw = JSON.stringify(source), original = parseAdminState(raw);
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
  const source = legacySupplierState(); delete source.adminSession; const raw = JSON.stringify(source), incoming = JSON.stringify({ ...source, revision: source.revision + 1 });
  let reads = 0, writes = 0;
  const storage = { getItem: () => ++reads === 1 ? raw : incoming, setItem: () => { writes++; } };
  const state = loadAdminState(storage), original = parseAdminState(raw);
  assert.ok(state.storageError);
  assert.equal(writes, 0);
  assert.deepEqual({ ...state, storageError: undefined }, { ...original, storageError: undefined });
  assert.equal(state.serviceProviderExampleVersion, undefined);
});
