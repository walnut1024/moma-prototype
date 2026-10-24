import assert from 'node:assert/strict';
import test from 'node:test';
import { createAdminSeed, commitAdminState, persistModelAction, parseAdminState } from '../src/admin-v2/store.js';
import { providerCatalogueIds, providerCatalogueModel } from '../src/admin-v2/moma-provider.js';
import { MODEL_TYPES } from '../src/admin-v2/model-management.js';
import { providerCataloguePrice } from '../src/admin-v2/moma-catalogue-prices.js';
import { cataloguePurchasePrice } from '../src/admin-v2/provider-catalogue-pricing.js';
const draft = { protocol: 'OpenAI', baseUrl: 'https://catalogue.example.invalid/v1', modelId: ' New/Complete-Model ', modelType: 'text', endpoint: '/v1/chat/completions', discountFactor: '0.8', scenarios: [{ name: '输入 Token', listPrice: '1.25', unit: '百万 Token', currency: 'CNY' }, { name: '输出 Token', listPrice: '0', unit: '百万 Token', currency: 'CNY' }] };
const action = (values = draft, objectId = 'provider-moma') => ({ type: 'modelOperations', operation: 'provider', data: { operation: 'catalogueAdd', objectId, values } });
const provider = state => state.providers.find(item => item.id === 'provider-moma');

test('one save appends a case-preserved model and all quote rows atomically, persists discount and keeps platform objects intact', () => {
  const seed = createAdminSeed(), before = JSON.stringify(seed);let saved = before;
  const state = persistModelAction(seed, action(), { getItem: () => saved, setItem: (_, value) => { saved = value; } });
  assert.equal(providerCatalogueIds(provider(state)).length, providerCatalogueIds(provider(seed)).length + 1);
  assert.ok(providerCatalogueIds(provider(state)).includes('New/Complete-Model'));
  const entry = providerCataloguePrice(provider(state), 'New/Complete-Model');
  assert.equal(entry.discountFactor, 800000);
  assert.deepEqual(entry.scenarios.map(row => row.listPrice), [1250000, 0]);
  assert.deepEqual(providerCatalogueModel(provider(state), 'New/Complete-Model'), { modelId: 'New/Complete-Model', type: 'text', endpoint: '/v1/chat/completions' });
  assert.equal(cataloguePurchasePrice(entry.scenarios[0].listPrice, entry.discountFactor), 1000000);
  assert.equal(cataloguePurchasePrice(entry.scenarios[1].listPrice, entry.discountFactor), 0);
  assert.deepEqual(parseAdminState(saved).providers, state.providers);
  for (const collection of ['models', 'modelSupplies', 'supplyPrices', 'modelSalePrices', 'apiKeys']) assert.deepEqual(state[collection], seed[collection]);
  for (const item of seed.providers.filter(item => item.id !== 'provider-moma')) assert.deepEqual(state.providers.find(next => next.id === item.id), item);
  assert.deepEqual(provider(state).catalogPricing.slice(0, -1), provider(seed).catalogPricing || []);
  assert.equal(JSON.stringify(seed), before);
});

test('blank/duplicate identities, incomplete or duplicate billing rows, invalid money and discounts never append a partial model', () => {
  const seed = createAdminSeed(), before = JSON.stringify(seed), existing = providerCatalogueIds(provider(seed))[0];
  const cases = [
    { ...draft, modelId: '' }, { ...draft, modelId: existing }, { ...draft, modelId: 'bad model' }, { ...draft, modelId: 'x'.repeat(201) },
    { ...draft, modelType: '' }, { ...draft, modelType: 'unknown' }, { ...draft, modelType: 'constructor' }, { ...draft, modelType: undefined },
    { ...draft, scenarios: [] }, { ...draft, scenarios: [{ ...draft.scenarios[0], listPrice: '' }] }, { ...draft, scenarios: [{ ...draft.scenarios[0], name: '' }] }, { ...draft, scenarios: [{ ...draft.scenarios[0], unit: '' }] },
    { ...draft, scenarios: [draft.scenarios[0], draft.scenarios[0]] }, { ...draft, scenarios: [{ ...draft.scenarios[0], listPrice: '-1' }] }, { ...draft, scenarios: [{ ...draft.scenarios[0], listPrice: '1.1234567' }] },
    { ...draft, discountFactor: '1.01' }, { ...draft, discountFactor: '-0.1' }, { ...draft, scenarios: [{ name: '资源包', unit: '包', currency: 'CNY', listPrice: '1' }] }
  ];
  for (const value of cases) { assert.throws(() => commitAdminState(seed, action(value)));assert.equal(JSON.stringify(seed), before); }
  assert.throws(() => commitAdminState(seed, action(draft, 'missing')), /供应商不存在/);
});

test('empty discount is one, explicit zero remains zero and catalogue IDs remain case-sensitive', () => {
  const seed = createAdminSeed();let state = commitAdminState(seed, action({ ...draft, discountFactor: '' }));
  assert.equal(providerCataloguePrice(provider(state), 'New/Complete-Model').discountFactor, 1000000);
  state = commitAdminState(state, action({ ...draft, modelId: 'new/complete-model', discountFactor: '0' }));
  const entry = providerCataloguePrice(provider(state), 'new/complete-model');assert.equal(entry.discountFactor, 0);assert.equal(cataloguePurchasePrice(entry.scenarios[0].listPrice, entry.discountFactor), 0);
});

test('catalogue cap, role, revision and storage failure checks preserve both identity and quote records', () => {
  const seed = createAdminSeed(), before = JSON.stringify(seed);
  assert.throws(() => commitAdminState({ ...seed, currentRole: '运维人员' }, action()), /无权/);
  assert.throws(() => persistModelAction(seed, action(), { getItem: () => JSON.stringify({ ...seed, revision: seed.revision + 1 }), setItem: () => assert.fail('must not write') }), /数据已变化/);
  assert.throws(() => persistModelAction(seed, action(), { getItem: () => before, setItem: () => { throw new Error('quota'); } }), /quota/);
  const full = structuredClone(seed), other = full.providers.find(item => item.id !== 'provider-moma');other.catalogModelIds = Array.from({ length: 2000 }, (_, i) => `Model/${i}`);
  assert.throws(() => commitAdminState(full, action(draft, other.id)), /最多 2000/);
  assert.equal(JSON.stringify(seed), before);
});

test('all model types persist by exact catalogue ID and unrelated price or profile saves preserve metadata', () => {
  let state = createAdminSeed();
  for (const type of Object.keys(MODEL_TYPES)) state = commitAdminState(state, action({ ...draft, modelId: `Types/${type}`, modelType: type }));
  state = parseAdminState(JSON.stringify(state));
  for (const type of Object.keys(MODEL_TYPES)) assert.equal(providerCatalogueModel(provider(state), `Types/${type}`).type, type);
  const original = structuredClone(provider(state).catalogModels);
  state = commitAdminState(state, { type: 'modelOperations', operation: 'provider', data: { operation: 'cataloguePrice', objectId: 'provider-moma', values: { modelId: 'Types/image', modelType: 'text', scenarios: draft.scenarios } } });
  state = commitAdminState(state, { type: 'modelOperations', operation: 'provider', data: { operation: 'catalogueDiscount', objectId: 'provider-moma', values: { modelId: 'Types/image', discountFactor: '0.4' } } });
  state = commitAdminState(state, { type: 'modelOperations', operation: 'providerRegistration', data: { providerId: 'provider-moma', provider: { ...provider(state), contact: '目录字段验证' } } });
  assert.deepEqual(provider(state).catalogModels, original);
  assert.equal(providerCatalogueModel(provider(state), 'types/image'), undefined);
});

test('Endpoint paths and full HTTP URLs retain exact case and query strings without altering existing supplier connections', () => {
  const seed = createAdminSeed(); let state = seed;
  const endpoints = ['/v1/chat/completions', '/Models/Generate?api-version=2026-10-01', 'https://api.example.com/v1/images/generations', 'http://127.0.0.1:8000/v1/embeddings'];
  for (const [index, endpoint] of endpoints.entries()) state = commitAdminState(state, action({ ...draft, modelId: `Endpoint/${index}`, endpoint: ` ${endpoint} ` }));
  state = parseAdminState(JSON.stringify(state));
  endpoints.forEach((endpoint, index) => assert.equal(providerCatalogueModel(provider(state), `Endpoint/${index}`).endpoint, endpoint));
  for (const endpoint of seed.endpoints) assert.deepEqual(state.endpoints.find(item => item.id === endpoint.id), endpoint);
  assert.equal(state.endpoints.length, seed.endpoints.length + endpoints.length);
  assert.deepEqual(state.modelSupplies, seed.modelSupplies);
});

test('invalid Endpoint values reject identity, metadata and pricing atomically', () => {
  const seed = createAdminSeed(), before = JSON.stringify(seed);
  for (const endpoint of ['', undefined, 1, {}, 'v1/chat/completions', '//example.com/v1', 'https:/example.com/v1', 'ftp://example.com/v1', 'javascript:alert(1)', 'https://user:pass@example.com/v1', '/v1/chat completions', '/v1/\ncompletions', '/v1/\u0000completions', '/v1/\\completions', '/v1/chat#fragment', '/' + 'x'.repeat(2048)]) {
    assert.throws(() => commitAdminState(seed, action({ ...draft, endpoint })), /Endpoint/);
    assert.equal(JSON.stringify(seed), before);
  }
});
