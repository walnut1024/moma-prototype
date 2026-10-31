import assert from 'node:assert/strict';
import test from 'node:test';
import { createAdminSeed, commitAdminState, persistModelAction, parseAdminState } from '../src/admin-v2/store.js';
import { cataloguePriceDraft, cataloguePurchasePrice, cataloguePurchasePriceInput, normalizeCataloguePrice, markedUpItems } from '../src/admin-v2/provider-catalogue-pricing.js';
import { providerCataloguePrice } from '../src/admin-v2/moma-catalogue-prices.js';
import { canonicalMomaScenarios } from '../src/admin-v2/moma-billing-items.js';
import { activeSupplyPrice, activeSupplySalePrice, procurementVersion, latestSaleRevision } from '../src/admin-v2/model-management.js';

const modelId = 'Purchase-Editable';
const row = { name: '输入 Token', unit: '百万 Token', currency: 'CNY', listPrice: '4' };
const draft = { protocol: 'OpenAI', apiUrl: 'https://catalogue.example.invalid/v1/chat/completions', modelId, modelType: 'text', channelName: '国内渠道', modelName: '模型显示名称', discountFactor: '0.8', scenarios: [row, { ...row, name: '输出 Token', purchasePrice: '2.9' }, { ...row, name: '缓存读取 Token', purchasePrice: '0' }] };
const action = (operation, values) => ({ type: 'modelOperations', operation: 'provider', data: { operation, objectId: 'provider-moma', values } });
const quote = state => providerCataloguePrice(state.providers.find(item => item.id === 'provider-moma'), modelId);
const effective = entry => entry.scenarios.map(item => cataloguePurchasePrice(item.listPrice, entry.discountFactor, item.purchasePrice));

test('platform cost maintenance changes only cost overrides and retains supplier prices, discount, identity and history', () => {
  const state = commitAdminState(createAdminSeed(), action('catalogueAdd', draft)), before = structuredClone(state), current = quote(state);
  const scenarios = cataloguePriceDraft(current).scenarios.map(item => ({ ...item, listPrice: '999', purchasePrice: '1.234567' }));
  const next = commitAdminState(state, action('catalogueCost', { modelId, discountFactor: '0.1', scenarios }));
  assert.equal(quote(next).discountFactor, current.discountFactor);
  assert.deepEqual(quote(next).scenarios.map(({ purchasePrice, ...item }) => item), current.scenarios.map(({ purchasePrice, ...item }) => item));
  assert.deepEqual(effective(quote(next)), [1234567, 1234567, 1234567]);
  assert.equal(next.audits[0].action, '修改采购价');
  for (const key of ['models', 'modelSupplies', 'supplyPrices', 'modelSalePrices', 'endpoints', 'routes', 'serviceRoutes']) assert.deepEqual(next[key], state[key]);
  assert.deepEqual(state, before);
});

test('clearing a platform-cost override restores calculation while zero remains an explicit manual value', () => {
  const state = commitAdminState(createAdminSeed(), action('catalogueAdd', draft));
  const scenarios = cataloguePriceDraft(quote(state)).scenarios.map((item, index) => ({ ...item, purchasePrice: index ? '0' : '' }));
  const next = commitAdminState(state, action('catalogueCost', { modelId, scenarios }));
  assert.deepEqual(effective(quote(next)), [3200000, 0, 0]);
  assert.equal(Object.hasOwn(quote(next).scenarios[0], 'purchasePrice'), false);
  const discounted = commitAdminState(next, action('catalogueDiscount', { modelId, discountFactor: '0.5' }));
  assert.deepEqual(effective(quote(discounted)), [2000000, 0, 0]);
});

test('stale or malformed platform cost rows reject atomically without changing the supplier directory', () => {
  const state = commitAdminState(createAdminSeed(), action('catalogueAdd', draft)), before = structuredClone(state);
  const rows = cataloguePriceDraft(quote(state)).scenarios;
  for (const scenarios of [null, rows.slice(1), [rows[0], rows[0], rows[2]], [null, ...rows.slice(1)], rows.map((item, index) => index ? item : { ...item, unit: '千次' }), rows.map(item => ({ ...item, purchasePrice: '-1' }))]) assert.throws(() => commitAdminState(state, action('catalogueCost', { modelId, scenarios })));
  assert.deepEqual(state, before);
});

test('platform-cost edits keep operator permissions, concurrent revision and failed-storage protection', () => {
  const state = commitAdminState(createAdminSeed(), action('catalogueAdd', draft));
  const edit = action('catalogueCost', { modelId, scenarios: cataloguePriceDraft(quote(state)).scenarios.map(item => ({ ...item, purchasePrice: '2' })) });
  const before = JSON.stringify(state);
  assert.throws(() => commitAdminState({ ...state, currentRole: '运维人员' }, edit), /无权/);
  assert.throws(() => persistModelAction(state, edit, { getItem: () => JSON.stringify({ ...state, revision: state.revision + 1 }), setItem: () => assert.fail('must not write') }), /数据已变化/);
  assert.throws(() => persistModelAction(state, edit, { getItem: () => before, setItem: () => { throw new Error('quota'); } }), /quota/);
  assert.equal(JSON.stringify(state), before);
});

test('purchase defaults calculate exactly before a billing item is selected, while manual values including zero stay editable', () => {
  assert.equal(cataloguePurchasePriceInput({ listPrice: '4' }, '0.8'), '3.2');
  assert.equal(cataloguePurchasePriceInput({ listPrice: '0.000001' }, '0.5'), '0.000001');
  assert.equal(cataloguePurchasePriceInput({ listPrice: '' }, '1'), '');
  assert.equal(cataloguePurchasePriceInput({ listPrice: '4', purchasePrice: '0' }, '0.8'), '0');
  assert.equal(cataloguePurchasePriceInput({ listPrice: '4', purchasePrice: '' }, '0.8'), '');
  assert.equal(cataloguePurchasePriceInput({ listPrice: '4', purchasePrice: '2.' }, '0.8'), '2.');
  const entry = normalizeCataloguePrice(draft);
  assert.deepEqual(effective(entry), [3200000, 2900000, 0]);
  assert.deepEqual(normalizeCataloguePrice({ modelId, ...cataloguePriceDraft(entry) }), entry);
  assert.equal(Object.hasOwn(entry.scenarios[0], 'purchasePrice'), false);
  assert.equal(cataloguePurchasePrice(1, 0, Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER);
  assert.equal(cataloguePurchasePrice(4000000, 800000, 1234567), 1234567);
});

test('adding, reloading and changing discounts or list prices retain manual costs; clearing restores automatic pricing', () => {
  const seed = createAdminSeed(), before = JSON.stringify(seed); let saved = before;
  const storage = { getItem: () => saved, setItem: (_, value) => { saved = value; } };
  let state = persistModelAction(seed, action('catalogueAdd', draft), storage);
  assert.deepEqual(effective(quote(parseAdminState(saved))), [3200000, 2900000, 0]);
  state = persistModelAction(state, action('catalogueDiscount', { modelId, discountFactor: '0.5' }), storage);
  assert.deepEqual(effective(quote(state)), [2000000, 2900000, 0]);
  const edited = cataloguePriceDraft(quote(state));
  state = persistModelAction(state, action('cataloguePrice', { modelId, scenarios: edited.scenarios.map(item => ({ ...item, listPrice: '8' })) }), storage);
  assert.deepEqual(effective(quote(state)), [4000000, 2900000, 0]);
  state = persistModelAction(state, action('cataloguePrice', { modelId, scenarios: cataloguePriceDraft(quote(state)).scenarios.map(item => ({ ...item, purchasePrice: '' })) }), storage);
  assert.deepEqual(effective(quote(parseAdminState(saved))), [4000000, 4000000, 4000000]);
  assert.ok(quote(state).scenarios.every(item => !Object.hasOwn(item, 'purchasePrice')));
  for (const key of ['models', 'modelSupplies', 'supplyPrices', 'modelSalePrices']) assert.deepEqual(state[key], seed[key]);
  assert.equal(JSON.stringify(seed), before);
});

test('manual price equal to the default remains manual after a later discount change', () => {
  let state = commitAdminState(createAdminSeed(), action('catalogueAdd', { ...draft, scenarios: [{ ...row, purchasePrice: '3.2' }] }));
  state = commitAdminState(state, action('catalogueDiscount', { modelId, discountFactor: '0' }));
  assert.deepEqual(effective(quote(state)), [3200000]);
});

test('invalid manual money and failed commits never create partial records', () => {
  const seed = createAdminSeed(), before = JSON.stringify(seed);
  for (const purchasePrice of ['-1', 'NaN', '1e3', '0.1234567', '9007199254.740992', 1]) {
    assert.throws(() => commitAdminState(seed, action('catalogueAdd', { ...draft, scenarios: [{ ...row, purchasePrice }] })), /平台成本/);
  }
  for (const value of [-1, 0.1, NaN, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => cataloguePurchasePrice(1, 1, value), /平台成本/);
  assert.throws(() => commitAdminState(seed, action('catalogueAdd', { ...draft, scenarios: [{ ...row, listPrice: '', purchasePrice: '1' }] })), /目录价/);
  assert.throws(() => commitAdminState({ ...seed, currentRole: '运维人员' }, action('catalogueAdd', draft)), /无权/);
  assert.throws(() => persistModelAction(seed, action('catalogueAdd', draft), { getItem: () => JSON.stringify({ ...seed, revision: seed.revision + 1 }), setItem: () => assert.fail('must not write') }), /数据已变化/);
  assert.throws(() => persistModelAction(seed, action('catalogueAdd', draft), { getItem: () => before, setItem: () => { throw Error('quota'); } }), /quota/);
  assert.equal(JSON.stringify(seed), before);
});

test('procurement references manual costs, markup uses them and published sale snapshots stay immutable', () => {
  let state = commitAdminState(createAdminSeed(), action('catalogueAdd', draft));
  const model = state.models[0], supply = state.modelSupplies.find(item => item.modelId === model.id);
  const endpoint = state.endpoints.find(item => item.id === supply.endpointId);
  state = { ...state, endpoints: state.endpoints.map(item => item.id === endpoint.id ? { ...item, providerId: 'provider-moma' } : item), modelSupplies: state.modelSupplies.map(item => item.id === supply.id ? { ...item, catalogueModelId: modelId } : item) };
  const cost = activeSupplyPrice(state, supply.id);
  assert.deepEqual(cost.items.map(item => item.amount), [3200000, 2900000, 0]);
  assert.deepEqual(markedUpItems(cost.items, '50').map(item => item.amount), ['4.8', '4.35', '0']);
  state = commitAdminState(state, { type: 'modelOperations', operation: 'reprice', modelId: model.id, data: { supplyId: supply.id, items: cost.items.map(item => ({ ...item, amount: '6' })), sourceVersion: procurementVersion(cost), expectedSaleVersion: latestSaleRevision(state, supply.id) } });
  const sale = structuredClone(activeSupplySalePrice(state, model.id, supply.id)), oldQuote = JSON.parse(sale.sourceVersion);
  assert.deepEqual(effective(oldQuote), [3200000, 2900000, 0]);
  state = commitAdminState(state, action('catalogueDiscount', { modelId, discountFactor: '0.5' }));
  assert.deepEqual(activeSupplyPrice(state, supply.id).items.map(item => item.amount), [2000000, 2900000, 0]);
  assert.notEqual(procurementVersion(activeSupplyPrice(state, supply.id)), sale.sourceVersion);
  assert.deepEqual(state.modelSalePrices.find(item => item.id === sale.id), sale);
  const source = procurementVersion(activeSupplyPrice(state, supply.id));
  state = commitAdminState(state, action('cataloguePrice', { modelId, scenarios: cataloguePriceDraft(quote(state)).scenarios.map(item => ({ ...item, purchasePrice: '1.234567' })) }));
  assert.deepEqual(activeSupplyPrice(state, supply.id).items.map(item => item.amount), [1234567, 1234567, 1234567]);
  assert.notEqual(procurementVersion(activeSupplyPrice(state, supply.id)), source);
  assert.deepEqual(state.modelSalePrices.find(item => item.id === sale.id), sale);
});

test('canonical billing labels preserve conflicting manual prices and distinguish manual from automatic rows', () => {
  const base = { unit: '百万 Token', currency: 'CNY', listPrice: 4000000 };
  const modes = [{ ...base, name: '输出 Token（思考）', purchasePrice: 2 }, { ...base, name: '输出 Token（非思考）', purchasePrice: 3 }];
  assert.deepEqual(canonicalMomaScenarios(modes), modes);
  assert.equal(canonicalMomaScenarios(modes.map(item => ({ ...item, purchasePrice: 2 }))).length, 1);
  const mixed = [{ ...base, name: '输出 Token（思考）' }, { ...base, name: '输出 Token（非思考）', purchasePrice: 4000000 }];
  assert.deepEqual(canonicalMomaScenarios(mixed), mixed);
  const conditions = [{ ...base, name: '输入 Token', condition: '自营按量·移动云；输入tokens', purchasePrice: 1 }, { ...base, name: '输入 Token', condition: '合作按量；输入', purchasePrice: 2 }];
  assert.deepEqual(canonicalMomaScenarios(conditions), conditions);
});
