import { withAdminSession } from './admin-session-fixture.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createAdminSeed as rawBaseSeed, commitAdminState, persistModelAction, parseAdminState as baseParseAdminState } from '../src/admin-v2/store.js';
import { normalizeCataloguePrice, cataloguePriceDraft, cataloguePurchasePrice, catalogueMoneyDisplay } from '../src/admin-v2/provider-catalogue-pricing.js';
import { providerCataloguePrice } from '../src/admin-v2/moma-catalogue-prices.js';

const modelId = 'ZHIPU/GLM-5.1';
const draft = { modelId, discountFactor: '0.8', scenarios: [{ name: ' 输入 ', unit: '百万 Token', currency: 'CNY', listPrice: '1.25' }, { name: '输出', unit: '百万 Token', currency: 'CNY', listPrice: '5' }] };
const action = (values = draft, objectId = 'provider-moma') => ({ type: 'modelOperations', operation: 'provider', data: { operation: 'cataloguePrice', objectId, values } });
const discountAction = (discountFactor, id = modelId, objectId = 'provider-moma') => ({ type: 'modelOperations', operation: 'provider', data: { operation: 'catalogueDiscount', objectId, values: { modelId: id, discountFactor } } });
const provider = state => state.providers.find(item => item.id === 'provider-moma');

test('billing conditions distinguish tiers and persist without rewriting existing unconditioned quotes', () => {
  const scenarios = ['输入长度 < 32K', '输入长度 ≥ 32K'].map(condition => ({ ...draft.scenarios[0], condition }));
  const entry = normalizeCataloguePrice({ ...draft, scenarios });
  assert.deepEqual(entry.scenarios.map(item => item.condition), scenarios.map(item => item.condition));
  const saved = commitAdminState(commitAdminState(createAdminSeed(), discountAction('0.8')), action({ ...draft, scenarios }));
  assert.deepEqual(provider(parseAdminState(JSON.stringify(saved))).catalogPricing[0], entry);
  assert.deepEqual(normalizeCataloguePrice({ ...cataloguePriceDraft(entry), modelId }), entry);
  assert.equal(Object.hasOwn(normalizeCataloguePrice(draft).scenarios[0], 'condition'), false);
  for (const condition of ['bad\ncondition', 'x'.repeat(161), 1, {}]) assert.throws(() => normalizeCataloguePrice({ ...draft, scenarios: [{ ...scenarios[0], condition }] }), /适用条件/);
  assert.throws(() => normalizeCataloguePrice({ ...draft, scenarios: [scenarios[0], { ...scenarios[0], condition: ' 输入长度 < 32K ' }] }), /不可重复/);
});

test('catalogue prices use exact decimal conversion and apply each model discount after six-place rounding', () => {
  const entry = normalizeCataloguePrice(draft);
  assert.equal(entry.discountFactor, 800000);
  assert.equal(entry.scenarios[0].name, '输入');
  assert.deepEqual(entry.scenarios.map(item => cataloguePurchasePrice(item.listPrice, entry.discountFactor)), [1000000, 4000000]);
  assert.equal(cataloguePurchasePrice(100000, 200000), 20000);
  assert.equal(cataloguePurchasePrice(1, 500000), 1);
  assert.equal(cataloguePurchasePrice(1, 499999), 0);
  assert.equal(cataloguePurchasePrice(Number.MAX_SAFE_INTEGER, 1000000), Number.MAX_SAFE_INTEGER);
  const large = { ...entry, scenarios: [{ name: '大额', unit: '张', currency: 'CNY', listPrice: Number.MAX_SAFE_INTEGER }] };
  assert.deepEqual(normalizeCataloguePrice({ ...cataloguePriceDraft(large), modelId }), large);
  assert.equal(catalogueMoneyDisplay(Number.MAX_SAFE_INTEGER), '9,007,199,254.740991');
  assert.equal(catalogueMoneyDisplay(0), '0.00');
  assert.equal(catalogueMoneyDisplay(1), '0.000001');
  assert.equal(catalogueMoneyDisplay(null), '—');
});

test('missing discounts default to one, missing prices stay pending, and zero remains configured', () => {
  const missing = normalizeCataloguePrice({ ...draft, discountFactor: '', scenarios: [{ ...draft.scenarios[0], listPrice: '' }] });
  assert.equal(missing.discountFactor, 1000000);
  assert.equal(missing.scenarios[0].listPrice, null);
  assert.equal(cataloguePurchasePrice(0, null), 0);
  assert.equal(cataloguePurchasePrice(1250000), 1250000);
  assert.equal(cataloguePriceDraft().discountFactor, '1');
  assert.equal(cataloguePriceDraft({ discountFactor: null }).discountFactor, '1');
  assert.equal(cataloguePurchasePrice(null, 0), null);
  assert.equal(cataloguePurchasePrice(0, 800000), 0);
  assert.equal(cataloguePurchasePrice(100, 0), 0);
  assert.equal(cataloguePriceDraft({ discountFactor: 0, scenarios: [{ name: '免费', unit: '张', currency: 'CNY', listPrice: 0 }] }).scenarios[0].listPrice, '0');
  assert.deepEqual(normalizeCataloguePrice({ modelId, discountFactor: '', scenarios: [] }), { modelId, discountFactor: 1000000, scenarios: [] });
});

test('invalid amounts, discount bounds, duplicate scenarios and foreign catalogue IDs cannot commit partially', () => {
  const seed = createAdminSeed(), before = JSON.stringify(seed);
  for (const value of ['-1', '1e3', 'NaN', '0.0000001', '9007199254.740992']) assert.throws(() => commitAdminState(seed, action({ ...draft, scenarios: [{ ...draft.scenarios[0], listPrice: value }] })), /目录价/);
  for (const value of ['-0.1', '1.1', '0.1234567', 'abc']) assert.throws(() => commitAdminState(seed, discountAction(value)), /折扣系数/);
  for (const scenarios of [[{ name: '', unit: '张', currency: 'CNY', listPrice: '1' }], [{ ...draft.scenarios[0], unit: '无效\n单位' }], [draft.scenarios[0], draft.scenarios[0]], Array(101).fill(draft.scenarios[0])]) assert.throws(() => commitAdminState(seed, action({ ...draft, scenarios })), /计费项|计费单位/);
  assert.throws(() => commitAdminState(seed, action({ ...draft, modelId: 'missing' })), /目录/);
  assert.throws(() => commitAdminState(seed, action(draft, 'missing')), /不存在/);
  assert.equal(JSON.stringify(seed), before);
});

test('model-specific pricing persists across reload and profile edits without repricing live supplies', () => {
  const seed = createAdminSeed(), before = JSON.stringify(seed);
  let saved = before;
  const storage = { getItem: () => saved, setItem: (_, value) => { saved = value; } };
  let state = persistModelAction(seed, action(), storage);
  state = persistModelAction(state, discountAction('0.8'), storage);
  state = persistModelAction(state, action({ ...draft, modelId: 'ZHIPU/GLM-5.2', discountFactor: '0.6' }), storage);
  state = persistModelAction(state, discountAction('0.6', 'ZHIPU/GLM-5.2'), storage);
  state = parseAdminState(saved);
  assert.deepEqual(provider(state).catalogPricing.map(item => item.discountFactor), [800000, 600000]);
  const original = structuredClone(provider(state).catalogPricing);
  state = commitAdminState(state, { type: 'modelOperations', operation: 'providerRegistration', data: { providerId: 'provider-moma', provider: { ...provider(state), contact: '定价测试', catalogModelIds: [...provider(state).catalogModelIds, 'New/Model'] } } });
  assert.deepEqual(provider(state).catalogPricing, original);
  state = commitAdminState(state, { type: 'modelOperations', operation: 'provider', data: { operation: 'catalogueImport', objectId: 'provider-moma', values: { mode: 'batch', text: 'New/Model' } } });
  state = commitAdminState(state, discountAction('0.5'));
  assert.equal(provider(state).catalogPricing.length, 2);
  assert.equal(provider(state).catalogPricing.find(item => item.modelId === modelId).discountFactor, 500000);
  assert.equal(provider(state).catalogPricing.find(item => item.modelId === 'ZHIPU/GLM-5.2').discountFactor, 600000);
  state = commitAdminState(state, action({ ...draft, modelId: 'New/Model' }));
  state = commitAdminState(state, { type: 'modelOperations', operation: 'providerRegistration', data: { providerId: 'provider-moma', provider: { ...provider(state), catalogModelIds: provider(state).catalogModelIds.filter(id => id !== 'New/Model') } } });
  assert.equal(provider(state).catalogPricing.length, 3);
  assert.ok(provider(state).catalogModelIds.includes('New/Model'));
  for (const collection of ['endpoints', 'modelSupplies', 'supplyPrices', 'modelSalePrices', 'apiKeys']) assert.deepEqual(state[collection], seed[collection]);
  assert.equal(JSON.stringify(seed), before);
});

test('catalogue saves preserve permissions, concurrent revision checks and failed-storage drafts', () => {
  const seed = createAdminSeed(), before = JSON.stringify(seed);
  assert.throws(() => commitAdminState({ ...seed, currentRole: '运维人员' }, action()), /无权/);
  assert.throws(() => persistModelAction(seed, action(), { getItem: () => JSON.stringify({ ...seed, revision: seed.revision + 1 }), setItem: () => assert.fail('must not write') }), /数据已变化/);
  assert.throws(() => persistModelAction(seed, action(), { getItem: () => before, setItem: () => { throw new Error('quota'); } }), /quota/);
  assert.equal(JSON.stringify(seed), before);
});

test('each scenario keeps its currency through discounts, reload and dictionary edits with no conversion', () => {
  const values = { ...draft, scenarios: ['CNY', 'EUR'].map(currency => ({ name: '输入', unit: '百万 Token', currency, listPrice: '1.25' })) };
  let state = commitAdminState(createAdminSeed(), { type: 'modelOperations', operation: 'tariffDictionary', data: { operation: 'save', kind: 'currency', name: '欧元', englishName: 'Euro', code: 'EUR' } });
  const currencyId = state.tariffDictionary.find(item => item.code === 'EUR').id;
  state = commitAdminState(state, action(values));
  state = commitAdminState(state, discountAction('0.8'));
  const entry = provider(state).catalogPricing[0];
  assert.deepEqual(entry.scenarios.map(item => [item.currency, cataloguePurchasePrice(item.listPrice, entry.discountFactor)]), [['CNY', 1000000], ['EUR', 1000000]]);
  state = commitAdminState(state, { type: 'modelOperations', operation: 'tariffDictionary', data: { operation: 'save', id: currencyId, name: '欧元报价', englishName: 'Euro', code: 'EUR' } });
  state = commitAdminState(state, { type: 'modelOperations', operation: 'tariffDictionary', data: { operation: 'status', id: currencyId, status: '已停用' } });
  assert.deepEqual(provider(parseAdminState(JSON.stringify(state))).catalogPricing[0], entry);
  assert.deepEqual(provider(commitAdminState(state, action(values))).catalogPricing[0], entry);
  for (const currency of [undefined, '', 'usd', 'ZZZ']) assert.throws(() => commitAdminState(state, action({ ...values, scenarios: [{ ...values.scenarios[0], currency }] })), /货币代码/);
});

test('discount and list-price operations ignore unrelated draft fields and preserve the latest counterpart', () => {
  let state = commitAdminState(createAdminSeed(), action());
  const original = structuredClone(provider(state).catalogPricing[0].scenarios);
  const input = discountAction('0.8');
  input.data.values.scenarios = [{ name: 'invalid' }];
  state = commitAdminState(state, input);
  assert.deepEqual(provider(state).catalogPricing[0].scenarios, original);
  state = commitAdminState(state, discountAction('0.6'));
  state = commitAdminState(state, action({ ...draft, discountFactor: '0.8', scenarios: [{ ...draft.scenarios[0], listPrice: '2' }] }));
  assert.equal(provider(state).catalogPricing[0].discountFactor, 600000);
  assert.equal(provider(state).catalogPricing[0].scenarios[0].listPrice, 2000000);
  assert.equal(cataloguePurchasePrice(2000000, 600000), 1200000);
  for (const [value, expected] of [['0', 0], ['1', 1000000], ['', 1000000]]) {
    const prices = structuredClone(provider(state).catalogPricing[0].scenarios);
    state = commitAdminState(state, discountAction(value));
    assert.equal(provider(state).catalogPricing[0].discountFactor, expected);
    assert.deepEqual(provider(state).catalogPricing[0].scenarios, prices);
  }
});

test('discount edits preserve official defaults, pending prices, permissions and persistence boundaries', () => {
  const seed = createAdminSeed(), before = JSON.stringify(seed);
  const input = discountAction('0.8');
  const state = commitAdminState(seed, input);
  assert.ok(provider(state).catalogPricing[0].scenarios.length > 0);
  for (const collection of ['endpoints', 'modelSupplies', 'supplyPrices', 'modelSalePrices', 'apiKeys']) assert.deepEqual(state[collection], seed[collection]);
  assert.deepEqual(provider(parseAdminState(JSON.stringify(state))).catalogPricing, provider(state).catalogPricing);
  assert.throws(() => commitAdminState(seed, discountAction('0.8', 'missing')), /目录/);
  assert.throws(() => commitAdminState(seed, discountAction('0.8', modelId, 'missing')), /不存在/);
  assert.throws(() => commitAdminState({ ...seed, currentRole: '运维人员' }, input), /无权/);
  assert.throws(() => persistModelAction(seed, input, { getItem: () => JSON.stringify({ ...seed, revision: seed.revision + 1 }), setItem: () => assert.fail('must not write') }), /数据已变化/);
  assert.throws(() => persistModelAction(seed, input, { getItem: () => before, setItem: () => { throw new Error('quota'); } }), /quota/);
  const imported = commitAdminState(seed, { type: 'modelOperations', operation: 'provider', data: { operation: 'catalogueImport', objectId: 'provider-moma', values: { mode: 'batch', text: 'Pending/Model' } } });
  const pending = commitAdminState(imported, discountAction('0.8', 'Pending/Model'));
  assert.deepEqual(provider(pending).catalogPricing.find(item => item.modelId === 'Pending/Model'), { modelId: 'Pending/Model', discountFactor: 800000, scenarios: [] });
  assert.equal(JSON.stringify(seed), before);
});

test('all suppliers and added models default to one without changing explicit discounts or stored records', () => {
  for (const factor of [undefined, null, 0, 800000, 1000000]) {
    const seed = createAdminSeed();
    const row = provider(seed);
    row.catalogPricing = [{ modelId, discountFactor: factor, scenarios: [{ name: '输入 Token', unit: '百万 Token', currency: 'CNY', listPrice: 1250000 }] }];
    const before = JSON.stringify(seed), expected = factor ?? 1000000;
    assert.equal(providerCataloguePrice(row, modelId).discountFactor, expected);
    assert.equal(providerCataloguePrice({ ...row, id: 'custom-provider', catalogModelIds: [modelId, 'New/Model'] }, modelId).discountFactor, expected);
    assert.deepEqual(providerCataloguePrice({ id: 'custom-provider', catalogModelIds: ['New/Model'] }, 'New/Model'), { modelId: 'New/Model', discountFactor: 1000000, scenarios: [] });
    assert.equal(JSON.stringify(seed), before);
    const saved = commitAdminState(seed, action());
    assert.equal(provider(saved).catalogPricing[0].discountFactor, expected);
    assert.equal(cataloguePurchasePrice(provider(saved).catalogPricing[0].scenarios[0].listPrice, expected), factor === 0 ? 0 : factor === 800000 ? 1000000 : 1250000);
    assert.equal(JSON.stringify(seed), before);
  }
  const seed = createAdminSeed();
  const added = commitAdminState(seed, { type: 'modelOperations', operation: 'provider', data: { operation: 'catalogueImport', objectId: 'provider-moma', values: { mode: 'batch', text: 'Added/One\nAdded/Two' } } });
  for (const id of ['Added/One', 'Added/Two']) {
    const entry = providerCataloguePrice(provider(added), id);
    assert.equal(entry.discountFactor, 1000000);
    assert.equal(cataloguePriceDraft(entry).discountFactor, '1');
    assert.deepEqual(entry.scenarios, []);
  }
});

function createAdminSeed() { const state = baseSeed(); state.modelTemplates.push(...["New/Model","Pending/Model","Added/One","Added/Two"].map(code => ({ id: "test-library-" + code, modelId: code, name: code, type: "text", capabilities: {}, profile: {} }))); return state; }

function baseSeed(...args) { return withAdminSession(rawBaseSeed(...args)); }
function parseAdminState(...args) { return withAdminSession(baseParseAdminState(...args)); }
