import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminSeed, commitAdminState, parseAdminState } from '../src/admin-v2/store.js';
import { supplierListingRows, supplierBatchEntry, supplierPublishEntry, previewSupplierBatch, listingPreferences, rememberListing, selectedCatalogueIds, rememberCatalogueSelection, listingAddress, validListingReturn, LISTING_PREFERENCES_KEY } from '../src/admin-v2/supplier-listing.js';
import { markedUpItems } from '../src/admin-v2/provider-catalogue-pricing.js';
import { activeSupplyPrice, procurementVersion } from '../src/admin-v2/model-management.js';
const op = (state, operation, data) => commitAdminState(state, { type: 'modelOperations', operation, data });
function fixture() {
  let state = op(createAdminSeed(), 'providerRegistration', { provider: { name: '批量供应商', code: 'batch-supplier', sourceType: 'thirdParty', catalogModelIds: ['batch-model-a', 'batch-model-b'] }, connections: [{ name: '批量接入', protocol: 'OpenAI', baseUrl: 'https://batch.example.invalid/v1', credentialRef: 'env:BATCH_TEST_KEY', timeoutSeconds: 60 }] });
  const provider = state.providers.find(item => item.code === 'batch-supplier'), endpoint = state.endpoints.find(item => item.providerId === provider.id);
  state = op(state, 'checkConnection', { endpointId: endpoint.id });
  for (const code of ['batch-model-a', 'batch-model-b']) {
    state = op(state, 'provider', { operation: 'cataloguePrice', objectId: provider.id, values: { modelId: code, scenarios: [{ name: '输入', unit: '百万 Token', currency: 'CNY', listPrice: '1' }, { name: '输出', unit: '百万 Token', currency: 'CNY', listPrice: '2' }] } });
    state = op(state, 'templateSave', { modelId: code, name: code, description: '批量上架模型资料。', type: 'text', profile: { author: '测试作者', tasks: ['对话'], inputModalities: ['文本'], outputModalities: ['文本'] }, capabilities: { context: 8192, output: 1024, streaming: false, tools: false } });
  }
  const current = state.providers.find(item => item.id === provider.id);
  const entries = supplierListingRows(state, current).map(row => ({ ...supplierBatchEntry(state, row), endpointId: endpoint.id, prices: markedUpItems(row.costs, '20') }));
  return { state, providerId: provider.id, entries };
}
function prepared() {
  const { state, providerId, entries } = fixture();
  return { state: op(state, 'prepareSupplierBatch', { providerId, items: entries }), providerId };
}
const publication = (state, providerId) => supplierListingRows(state, state.providers.find(item => item.id === providerId)).map(supplierPublishEntry);

test('supplier view includes unregistered directory models and uses exact canonical identities', () => {
  const { state, providerId } = fixture(), provider = state.providers.find(item => item.id === providerId);
  const rows = supplierListingRows(state, provider);
  assert.equal(rows.length, 2); assert.ok(rows.every(row => !row.model && row.master && !row.supply));
  const renamed = structuredClone(state); renamed.modelTemplates.find(item => item.modelId === 'batch-model-a').name = '可重复的展示名称';
  assert.equal(supplierListingRows(renamed, provider)[0].master.modelId, rows[0].master.modelId);
  provider.catalogModelIds.push('different-upstream');
  assert.equal(supplierListingRows(state, provider).find(row => row.catalogueModelId === 'different-upstream').master, undefined);
});

test('batch drafts persist without creating models, enabling services or publishing prices', () => {
  const { state, providerId, entries } = fixture();
  const saved = op(state, 'saveSupplierBatch', { providerId, items: entries.map(entry => ({ ...entry, prices: [{ amount: '' }] })) });
  assert.deepEqual(saved.models, state.models); assert.deepEqual(saved.modelSupplies, state.modelSupplies); assert.deepEqual(saved.modelSalePrices, state.modelSalePrices);
  const restored = parseAdminState(JSON.stringify(saved));
  assert.equal(restored.modelOnboardings.filter(item => item.providerId === providerId).length, 2);
  assert.equal(supplierBatchEntry(restored, supplierListingRows(restored, restored.providers.find(item => item.id === providerId))[0]).prices[0].amount, '');
  const scoped = op(state, 'saveSupplierBatch', { providerId, items: entries.map(entry => ({ ...entry, listingScope: { openScope: 'selected', tenantIds: [state.tenants[0].id] } })) });
  const cleared = op(scoped, 'saveSupplierBatch', { providerId, items: supplierListingRows(scoped, scoped.providers.find(item => item.id === providerId)).map(row => ({ ...supplierBatchEntry(scoped, row), listingScope: null })) });
  assert.ok(cleared.modelOnboardings.filter(item => item.providerId === providerId).every(item => item.listingScope === null));
});

test('preparation checks all billing items while leaving sales, endpoint and service states unchanged', () => {
  const { state, providerId, entries } = fixture();
  const next = op(state, 'prepareSupplierBatch', { providerId, items: entries });
  assert.equal(next.models.length, state.models.length + 2); assert.deepEqual(next.modelSalePrices, state.modelSalePrices);
  for (const draft of next.modelOnboardings.filter(item => item.providerId === providerId)) {
    const supply = next.modelSupplies.find(item => item.id === draft.supplyId), model = next.models.find(item => item.id === draft.modelId);
    assert.equal(model.listingStatus, '已下架'); assert.equal(supply.status, '已停用'); assert.equal(supply.salesEnabled, false); assert.equal(supply.validationStatus, '通过');
    assert.equal(draft.sourceVersion, procurementVersion(activeSupplyPrice(next, supply.id))); assert.equal(draft.prices.length, 2);
  }
  assert.deepEqual(next.endpoints.filter(item => item.providerId !== providerId), state.endpoints.filter(item => item.providerId !== providerId));
});

test('final batch confirmation without service modes rejects all publication effects atomically', () => {
  const { state, providerId } = prepared(), before=structuredClone(state);
  assert.throws(()=>op(state, 'publishSupplierBatch', { providerId, items: publication(state, providerId) }),/服务模式/);
  assert.deepEqual(state,before);
  const drafts = state.modelOnboardings.filter(item => item.providerId === providerId);
  assert.ok(drafts.every(item => item.status !== '已完成'));
  for (const draft of drafts) {
    assert.equal(state.models.find(item => item.id === draft.modelId).listingStatus, '已下架');
    assert.equal(state.modelSupplies.find(item => item.id === draft.supplyId).salesEnabled, false);
    assert.ok(!state.modelSalePrices.some(item => item.supplyId === draft.supplyId));
    assert.deepEqual(draft.prices.map(item => Number(item.amount)), [1.2, 2.4]);
  }
});

test('historical unsubmitted prices are not restored and direct batch failure is atomic', () => {
  const { state, providerId } = prepared(), before = structuredClone(state);
  const entries = supplierListingRows(state, state.providers.find(item => item.id === providerId)).map(row => supplierBatchEntry(state, row));
  assert.ok(entries.every(entry => entry.prices.every(item => item.amount === '')));
  assert.throws(() => op(state, 'submitSupplierBatch', { providerId, items: entries }), /售价必填/);
  assert.deepEqual(state, before);
  const ready = fixture(), snapshot = structuredClone(ready.state);
  assert.throws(() => op(ready.state, 'submitSupplierBatch', { providerId: ready.providerId, items: ready.entries }), /服务模式/);
  assert.deepEqual(ready.state, snapshot);
});

test('failed final confirmation leaves proposed scopes in drafts without changing any existing model', () => {
  const { state, providerId, entries } = fixture(), tenantId = state.tenants[0].id;
  const prepared = op(state, 'prepareSupplierBatch', { providerId, items: entries.map(entry => ({ ...entry, listingScope: { openScope: 'selected', tenantIds: [tenantId] } })) });
  const drafts = prepared.modelOnboardings.filter(item => item.providerId === providerId);
  assert.ok(drafts.every(draft => prepared.models.find(model => model.id === draft.modelId).openScope === 'all'));
  const before=structuredClone(prepared);
  assert.throws(()=>op(prepared, 'publishSupplierBatch', { providerId, items: publication(prepared, providerId) }),/服务模式/);
  assert.deepEqual(prepared,before);assert.ok(drafts.every(draft=>draft.listingScope.openScope==='selected' && draft.listingScope.tenantIds[0]===tenantId));
  assert.deepEqual(prepared.models.filter(model => state.models.some(old => old.id === model.id)), state.models);
});

test('bad identities, foreign connections, duplicate entries and invalid prices reject the whole batch atomically', () => {
  const { state, providerId, entries } = fixture(), before = structuredClone(state);
  for (const items of [[entries[0], entries[0]], entries.map((entry, i) => i ? { ...entry, endpointId: state.endpoints.find(item => item.providerId !== providerId).id } : entry), entries.map((entry, i) => i ? { ...entry, prices: entry.prices.slice(1) } : entry), entries.map((entry, i) => i ? { ...entry, catalogueModelId: 'foreign-model' } : entry), entries.map((entry, i) => i ? { ...entry, libraryRevision: 'stale' } : entry)]) {
    assert.throws(() => op(state, 'prepareSupplierBatch', { providerId, items })); assert.deepEqual(state, before);
  }
});

test('preview separates ready and blocked rows without mutating records; readiness does not bypass final revisions', () => {
  const { state, providerId, entries } = fixture(), before = structuredClone(state);
  const preview = previewSupplierBatch(state, 'prepareSupplierBatch', providerId, entries.map((entry, i) => i ? { ...entry, prices: [] } : entry));
  assert.equal(preview.ready.length, 1); assert.equal(preview.blocked.length, 1); assert.ok(preview.blocked[0].reason); assert.deepEqual(state, before);
  const prepared = op(state, 'prepareSupplierBatch', { providerId, items: preview.ready });
  const items = publication(prepared, providerId).filter(item => item.draftId);
  assert.throws(() => op(prepared, 'publishSupplierBatch', { providerId, items: items.map(item => ({ ...item, draftRevision: 'stale' })) }), /修订|变化/);
  assert.throws(() => op({ ...prepared, currentRole: '运维人员' }, 'publishSupplierBatch', { providerId, items }), /无权/);
});

test('rechecking procurement revisions preserves updated draft prices while the service mode still blocks publication', () => {
  const { state, providerId } = prepared(); const entries = publication(state, providerId);
  const changed = op(state, 'provider', { operation: 'cataloguePrice', objectId: providerId, values: { modelId: 'batch-model-a', scenarios: [{ name: '输入', unit: '百万 Token', currency: 'CNY', listPrice: '3' }, { name: '输出', unit: '百万 Token', currency: 'CNY', listPrice: '2' }] } });
  const before = structuredClone(changed);
  assert.throws(() => op(changed, 'publishSupplierBatch', { providerId, items: entries }), /报价已变化/); assert.deepEqual(changed, before);
  const refreshed = supplierListingRows(changed, changed.providers.find(item => item.id === providerId)).map(row => ({ ...supplierBatchEntry(changed, { ...row, draft: null }), draftId: row.draft.id, prices: markedUpItems(row.costs, '20') }));
  const rechecked = op(changed, 'prepareSupplierBatch', { providerId, items: refreshed });
  const recheckedBefore=structuredClone(rechecked);
  assert.throws(()=>op(rechecked, 'publishSupplierBatch', { providerId, items: publication(rechecked, providerId) }),/服务模式/);
  assert.deepEqual(rechecked,recheckedBefore);
  const drafts=rechecked.modelOnboardings.filter(item=>item.providerId===providerId);
  assert.ok(drafts.every(item=>item.status!=='已完成' && rechecked.models.find(model=>model.id===item.modelId).listingStatus==='已下架'));
  assert.deepEqual(drafts.find(item=>item.catalogueModelId==='batch-model-a').prices.map(item=>Number(item.amount)),[3.6,2.4]);
});

test('view preferences and selections are version-scoped, preserve separate filters and tolerate unavailable storage', () => {
  const values = new Map(), storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) }, provider = { id: 'p', catalogModelIds: ['a', 'b'] };
  const address = listingAddress(new URLSearchParams('q=Qwen&page=3&model=private&view=price&supplier=p'), 'models');
  assert.equal(new URLSearchParams(address.split('?')[1]).get('model'), 'private');
  assert.equal(new URLSearchParams(address.split('?')[1]).has('view'), false);
  rememberListing(storage, { perspective: 'suppliers', models: { address, scrollY: 500 } });
  rememberCatalogueSelection(storage, provider, ['a', 'foreign', 'a']);
  assert.deepEqual(selectedCatalogueIds(storage, provider), ['a']); assert.equal(listingPreferences(storage).models.address, address);
  assert.ok(LISTING_PREFERENCES_KEY.includes('5120')); assert.equal(validListingReturn('https://external.invalid'), null); assert.equal(validListingReturn('#/admin-2/listing-other'), null);
  assert.deepEqual(listingPreferences({ getItem() { throw Error('blocked'); } }), {});
  assert.doesNotThrow(() => rememberListing({ getItem() { return '{bad'; }, setItem() { throw Error('quota'); } }, { perspective: 'models' }));
});
