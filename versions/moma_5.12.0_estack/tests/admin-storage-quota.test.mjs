import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminSeed, loadAdminState, parseAdminState, persistAdminAction, serializeAdminState, STORAGE_KEY } from '../src/admin-v2/store.js';

const clock = Date.parse('2026-10-28T08:00:00+08:00');
const quota = 1_000_000;
const derived = row => row.id?.startsWith('usage-demo-');
const fixture = () => {
  const state = createAdminSeed();
  state.models[0].name = '客户手工保留的模型名称';
  state.requests.push({ ...structuredClone(state.requests[0]), id: 'customer-real-request', requestId: 'customer_real_request', userId: 'customer-user-id', usage: { input: 123, output: 45 } });
  return state;
};
const memoryStorage = (state, limit = quota) => {
  const values = new Map([[STORAGE_KEY, JSON.stringify(state)], ['other-version-data', '保留其他版本的原始数据']]);
  const error = new Error('The quota has been exceeded.');
  error.name = 'QuotaExceededError';
  let writes = 0;
  return {
    getItem: key => values.get(key) ?? null,
    setItem(key, value) {
      assert.equal(key, STORAGE_KEY);
      if (value.length > limit) throw error;
      values.set(key, value);
      writes++;
    },
    get raw() { return values.get(STORAGE_KEY); },
    get writes() { return writes; },
    error,
  };
};

test('legacy state exceeding the write quota loads without losing business records and regenerates usage once', t => {
  t.mock.method(Date, 'now', () => clock);
  const source = fixture(), storage = memoryStorage(source);
  assert.ok(storage.raw.length > 2_400_000);
  const loaded = loadAdminState(storage);
  assert.equal(loaded.storageError, undefined);
  assert.equal(storage.writes, 1);
  assert.ok(storage.raw.length < quota);
  assert.equal(loaded.models.find(row => row.id === source.models[0].id).name, source.models[0].name);
  assert.deepEqual(loaded.requests.find(row => row.id === 'customer-real-request'), source.requests.find(row => row.id === 'customer-real-request'));
  assert.equal(storage.getItem('other-version-data'), '保留其他版本的原始数据');
  assert.deepEqual(loaded.requests.filter(derived), source.requests.filter(derived));
  assert.ok(loaded.requests.filter(derived).length > 3_000);
  assert.equal(JSON.parse(storage.raw).requests.some(derived), false);
  const saved = storage.raw, again = loadAdminState(storage);
  assert.equal(again.storageError, undefined);
  assert.equal(storage.writes, 1);
  assert.equal(storage.raw, saved);
  assert.equal(again.revision, loaded.revision);
  assert.deepEqual(again.requests, loaded.requests);
  assert.deepEqual(parseAdminState(saved).requests, loaded.requests);
});

test('transactions stay within quota while retaining requests and rejecting a stale revision', t => {
  t.mock.method(Date, 'now', () => clock);
  const storage = memoryStorage(fixture()), loaded = loadAdminState(storage);
  assert.equal(loaded.storageError, undefined);
  const next = persistAdminAction(loaded, { type: 'setSettings', changes: { environmentLabel: '客户手工工作区' } }, storage);
  assert.equal(next.revision, loaded.revision + 1);
  assert.equal(storage.writes, 2);
  assert.ok(storage.raw.length < quota);
  assert.equal(JSON.parse(storage.raw).settings.environmentLabel, '客户手工工作区');
  assert.deepEqual(next.requests, loaded.requests);
  assert.deepEqual(parseAdminState(storage.raw).requests, next.requests);
  const incoming = JSON.parse(storage.raw);
  incoming.revision++;
  storage.setItem(STORAGE_KEY, JSON.stringify(incoming));
  const otherTabRaw = storage.raw, writes = storage.writes;
  assert.throws(() => persistAdminAction(next, { type: 'setRole', role: '运营人员' }, storage), /数据已变化/);
  assert.equal(storage.raw, otherTabRaw);
  assert.equal(storage.writes, writes);
  assert.equal(storage.getItem('other-version-data'), '保留其他版本的原始数据');
});

test('an insufficient quota keeps the original raw data and propagates the transaction write error', t => {
  t.mock.method(Date, 'now', () => clock);
  const source = fixture(), storage = memoryStorage(source, 128), raw = storage.raw;
  const failed = loadAdminState(storage);
  assert.equal(failed.storageError, storage.error.message);
  assert.equal(storage.raw, raw);
  assert.equal(storage.writes, 0);
  assert.equal(failed.models.find(row => row.id === source.models[0].id).name, source.models[0].name);
  assert.deepEqual(failed.requests.find(row => row.id === 'customer-real-request'), source.requests.find(row => row.id === 'customer-real-request'));
  const readable = parseAdminState(raw), before = JSON.stringify(readable);
  assert.throws(() => persistAdminAction(readable, { type: 'setSettings', changes: { environmentLabel: '不能提交的修改' } }, storage), error => error === storage.error);
  assert.equal(JSON.stringify(readable), before);
  assert.equal(storage.raw, raw);
  assert.equal(storage.writes, 0);
  assert.equal(storage.getItem('other-version-data'), '保留其他版本的原始数据');
});

test('an already prepared legacy state compacts once and keeps all business and unknown extension fields', t => {
  t.mock.method(Date, 'now', () => clock);
  const source = fixture();
  source.supplierReviewVersion = 1;
  source.serviceProviderExampleVersion = 1;
  source.revision = 42;
  source.customerExtension = { note: '客户扩展字段保留', flags: [false, true], nested: { zero: 0, empty: '' } };
  source.models[0].customerProfile = { tags: ['人工配置'], enabled: false };
  const business = JSON.parse(JSON.stringify({ ...source, requests: source.requests.filter(row => !derived(row)) }));
  assert.deepEqual(JSON.parse(serializeAdminState(source)), business);
  const storage = memoryStorage(source), loaded = loadAdminState(storage);
  assert.equal(loaded.storageError, undefined);
  assert.equal(loaded.revision, source.revision + 1);
  assert.equal(storage.writes, 1);
  assert.ok(storage.raw.length < quota);
  assert.deepEqual(JSON.parse(storage.raw), { ...business, revision: loaded.revision });
  assert.deepEqual(loaded.requests.filter(derived), source.requests.filter(derived));
  assert.deepEqual(loaded.customerExtension, source.customerExtension);
  assert.deepEqual(loaded.models[0].customerProfile, source.models[0].customerProfile);
  const saved = storage.raw, again = loadAdminState(storage);
  assert.equal(storage.writes, 1);
  assert.equal(storage.raw, saved);
  assert.deepEqual(again, loaded);
  assert.deepEqual(parseAdminState(serializeAdminState(loaded)), loaded);
  assert.equal(storage.getItem('other-version-data'), '保留其他版本的原始数据');
  const insufficient = memoryStorage(source, 128), originalRaw = insufficient.raw;
  const failed = loadAdminState(insufficient);
  assert.equal(failed.storageError, insufficient.error.message);
  assert.equal(failed.revision, source.revision);
  assert.equal(insufficient.raw, originalRaw);
  assert.equal(insufficient.writes, 0);
  assert.deepEqual(failed.customerExtension, source.customerExtension);
});

test('prepared records retain the parser fallback for non-array or missing requests without rewriting storage', t => {
  t.mock.method(Date, 'now', () => clock);
  for (const requests of [{}, 'legacy-invalid-requests', undefined]) {
    const source = fixture();
    source.supplierReviewVersion = 1;
    source.serviceProviderExampleVersion = 1;
    source.revision = 42;
    if (requests === undefined) delete source.requests;
    else source.requests = requests;
    const storage = memoryStorage(source), raw = storage.raw;
    const parsed = parseAdminState(raw), loaded = loadAdminState(storage);
    assert.equal(loaded.storageError, undefined);
    assert.deepEqual(loaded, parsed);
    assert.equal(loaded.models.find(row => row.id === source.models[0].id).name, source.models[0].name);
    assert.equal(loaded.revision, source.revision);
    assert.equal(storage.raw, raw);
    assert.equal(storage.writes, 0);
    assert.equal(storage.getItem('other-version-data'), '保留其他版本的原始数据');
  }
});
