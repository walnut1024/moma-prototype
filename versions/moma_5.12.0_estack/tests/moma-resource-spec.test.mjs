import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { MOMA_PROVIDER, providerCatalogueIds } from '../src/admin-v2/moma-provider.js';
import { MOMA_CATALOGUE_PRICES, providerCataloguePrice } from '../src/admin-v2/moma-catalogue-prices.js';
import { cataloguePriceDraft } from '../src/admin-v2/provider-catalogue-pricing.js';
import { tariffDictionaryEntries, tariffScenarioUnit } from '../src/admin-v2/tariff-dictionary.js';
import { createAdminSeed, commitAdminState } from '../src/admin-v2/store.js';

const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/moma-resource-spec-v5-20260920.json', import.meta.url)));
const millionths = value => { const [whole, fraction = ''] = value.split('.'); return Number(BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0'))); };
const sorted = rows => rows.map(row => JSON.stringify(row)).sort();

test('all 277 workbook rows map to the exact model, billing quantity, unit and price', () => {
  const state = createAdminSeed(), entries = tariffDictionaryEntries(state);
  assert.equal(fixture.models.length, 83);
  assert.equal(fixture.models.reduce((count, model) => count + model.rows.length, 0), 277);
  assert.equal(new Set(fixture.models.map(model => model.catalogueId)).size, 83);
  for (const model of fixture.models) {
    assert.ok(providerCatalogueIds(MOMA_PROVIDER).includes(model.catalogueId), model.catalogueId);
    const expected = model.rows.map(([row, , name, unit, price]) => {
      assert.ok(entries.some(item => item.kind === 'scenario' && item.name === name), `G${row}: ${name}`);
      assert.equal(tariffScenarioUnit(state, name), unit, `H${row}`);
      // Equal-price thinking modes share one quote in the existing catalogue contract.
      if (model.catalogueId === 'Qwen3.5-35B-A3B') name = name.replace(/，(?:非思考|思考)）/, '）');
      return [name, unit, 'CNY', millionths(price)];
    });
    const actual = providerCataloguePrice(MOMA_PROVIDER, model.catalogueId).scenarios;
    assert.deepEqual(sorted(actual.map(row => [row.name, row.unit, row.currency, row.listPrice])), [...new Set(sorted(expected))], model.catalogueId);
    assert.equal(MOMA_CATALOGUE_PRICES[model.catalogueId].source, fixture.source);
    assert.ok(actual.every(row => !row.condition), model.catalogueId);
  }
});

test('self-operated and UCloud DeepSeek V3.2 offers remain separate and save through the existing transaction', () => {
  const state = createAdminSeed(), provider = state.providers.find(item => item.id === MOMA_PROVIDER.id);
  const self = providerCataloguePrice(provider, 'DeepSeek-V3.2'), partner = providerCataloguePrice(provider, 'deepseek-v3.2');
  assert.equal(self.scenarios.find(row => row.name === '输出 Token').listPrice, 8000000);
  assert.equal(partner.scenarios.find(row => row.name === '输出 Token').listPrice, 3000000);
  assert.equal(partner.scenarios.find(row => row.name === '缓存读取 Token').listPrice, 400000);
  const before = JSON.stringify(state);
  const saved = commitAdminState(state, { type: 'modelOperations', operation: 'provider', data: { operation: 'cataloguePrice', objectId: provider.id, values: { modelId: partner.modelId, ...cataloguePriceDraft(partner) } } });
  const savedProvider = saved.providers.find(item => item.id === provider.id);
  assert.deepEqual(providerCataloguePrice(savedProvider, partner.modelId), partner);
  assert.deepEqual(providerCataloguePrice(savedProvider, self.modelId), self);
  for (const key of ['modelSupplies', 'supplyPrices', 'modelSalePrices', 'endpoints', 'apiKeys']) assert.deepEqual(saved[key], state[key]);
  assert.equal(JSON.stringify(state), before);
});

test('new billing definitions are available in saved dictionaries without replacing saved quotes', () => {
  const state = createAdminSeed(), provider = state.providers.find(item => item.id === MOMA_PROVIDER.id);
  state.tariffDictionary = state.tariffDictionary.filter(item => !item.name.includes('夜间') && !item.name.includes('512K'));
  const configured = { modelId: 'DeepSeek-V4-Flash-0731', discountFactor: 800000, scenarios: [{ name: '已约定输入 Token', unit: '百万 Token', currency: 'CNY', listPrice: 1230000 }] };
  provider.catalogPricing = [configured];
  const before = JSON.stringify(state), entries = tariffDictionaryEntries(state);
  for (const name of ['输入 Token（夜间）', '输入 Token（输入长度 (0,128K]，夜间）', '输入 Token（输入长度 (0,512K]）']) assert.ok(entries.some(item => item.name === name));
  assert.deepEqual(providerCataloguePrice(provider, configured.modelId), configured);
  assert.equal(JSON.stringify(state), before);
});
