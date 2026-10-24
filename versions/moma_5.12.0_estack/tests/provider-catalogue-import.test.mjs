import assert from 'node:assert/strict';
import test from 'node:test';
import { createAdminSeed, commitAdminState, persistModelAction, parseAdminState } from '../src/admin-v2/store.js';
import { providerCatalogueIds } from '../src/admin-v2/moma-provider.js';

const action = (text, mode = 'batch', objectId = 'provider-moma') => ({ type: 'modelOperations', operation: 'provider', data: { operation: 'catalogueImport', objectId, values: { text, mode } } });
const provider = state => state.providers.find(p => p.id === 'provider-moma');

test('batch imports append independently, preserve pricing and reload without changing platform models', () => {
  const seed = createAdminSeed(), before = JSON.stringify(seed);
  let saved = before;
  const storage = { getItem: () => saved, setItem: (_, value) => { saved = value; } };
  let state = persistModelAction(seed, action(' Model/Alpha ', 'batch'), storage);
  const price = { modelId: 'Model/Alpha', discountFactor: '0.8', scenarios: [{ name: '输入 Token', unit: '百万 Token', currency: 'CNY', listPrice: '1.25' }] };
  state = persistModelAction(state, { type: 'modelOperations', operation: 'provider', data: { operation: 'cataloguePrice', objectId: 'provider-moma', values: price } }, storage);
  const priced = structuredClone(provider(state));
  state = persistModelAction(state, action('Model/Alpha\r\nModel/Beta\n\nModel/Beta\nmodel/alpha'), storage);
  assert.deepEqual(provider(state).catalogModelIds, [...providerCatalogueIds(seed.providers.find(p => p.id === 'provider-moma')), 'Model/Alpha', 'Model/Beta', 'model/alpha']);
  assert.deepEqual(provider(state).catalogPricing, priced.catalogPricing);
  assert.deepEqual(parseAdminState(saved).providers, state.providers);
  for (const collection of ['models', 'endpoints', 'modelSupplies', 'supplyPrices', 'modelSalePrices', 'apiKeys']) assert.deepEqual(state[collection], seed[collection]);
  for (const item of seed.providers.filter(p => p.id !== 'provider-moma')) assert.deepEqual(state.providers.find(p => p.id === item.id), item);
  assert.equal(JSON.stringify(seed), before);
});

test('invalid, duplicate-only and oversized imports fail atomically', () => {
  const seed = createAdminSeed(), before = JSON.stringify(seed), existing = providerCatalogueIds(provider(seed))[0];
  for (const text of ['', ' \n ', existing, 'valid\ninvalid model', 'x'.repeat(201)]) assert.throws(() => commitAdminState(seed, action(text)), /请输入|均已存在|有效 Model ID/);
  assert.throws(() => commitAdminState(seed, action('One\nTwo', 'single')), /请选择/);
  assert.throws(() => commitAdminState(seed, action('One', 'unknown')), /请选择/);
  assert.throws(() => commitAdminState(seed, action('One', 'batch', 'missing')), /供应商不存在/);
  assert.throws(() => commitAdminState(seed, action(Array.from({ length: 2001 }, (_, index) => `Extra/${index}`).join('\n'))), /最多 2000/);
  assert.equal(JSON.stringify(seed), before);
});

test('basic profile updates cannot overwrite imported catalogue entries or saved model prices', () => {
  const seed = createAdminSeed(), staleProfile = structuredClone(provider(seed));
  let state = commitAdminState(seed, action('Keep/Model', 'batch'));
  const pricing = [{ modelId: 'Keep/Model', discountFactor: 800000, scenarios: [] }];
  provider(state).catalogPricing = pricing;
  state = commitAdminState(state, { type: 'modelOperations', operation: 'providerRegistration', data: { providerId: 'provider-moma', provider: { ...staleProfile, contact: '测试联系人', catalogModelIds: [] } } });
  assert.ok(provider(state).catalogModelIds.includes('Keep/Model'));
  assert.deepEqual(provider(state).catalogPricing, pricing);
  assert.equal(provider(state).contact, '测试联系人');
});

test('imports retain role, revision and storage-failure protections without changing caller state', () => {
  const seed = createAdminSeed(), before = JSON.stringify(seed), input = action('Test/Model', 'batch');
  assert.throws(() => commitAdminState({ ...seed, currentRole: '运维人员' }, input), /无权/);
  assert.throws(() => persistModelAction(seed, input, { getItem: () => JSON.stringify({ ...seed, revision: seed.revision + 1 }), setItem: () => assert.fail('must not write') }), /数据已变化/);
  assert.throws(() => persistModelAction(seed, input, { getItem: () => before, setItem: () => { throw new Error('quota'); } }), /quota/);
  assert.equal(JSON.stringify(seed), before);
});
