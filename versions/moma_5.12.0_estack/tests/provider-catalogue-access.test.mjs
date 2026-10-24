import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminSeed, commitAdminState, persistModelAction, parseAdminState } from '../src/admin-v2/store.js';
import { catalogueConnections } from '../src/admin-v2/provider-model-connections.js';
import { providerCataloguePrice } from '../src/admin-v2/moma-catalogue-prices.js';
const providerId = 'provider-moma', modelId = 'Access/New-Model';
const draft = { modelId, modelType: 'text', endpoint: '/v1/chat/completions', protocol: 'OpenAI', baseUrl: 'https://model.example.invalid/v1', discountFactor: '1', scenarios: [{ name: '输入 Token', listPrice: '0', unit: '百万 Token', currency: 'CNY' }] };
const action = (values = draft, operation = 'catalogueAdd') => ({ type: 'modelOperations', operation: 'provider', data: { operation, objectId: providerId, values } });
const owner = state => state.providers.find(item => item.id === providerId);

test('adding a model atomically saves its protocol, access address and quote without requiring or writing API keys', () => {
  const seed = createAdminSeed(), before = JSON.stringify(seed); let saved = before;
  const next = persistModelAction(seed, action(), { getItem: () => saved, setItem: (_, value) => { saved = value; } });
  const state = parseAdminState(saved), connections = catalogueConnections(state, owner(state), modelId);
  assert.equal(connections.length, 1); assert.equal(connections[0].protocol, 'OpenAI');
  assert.equal(connections[0].baseUrl, draft.baseUrl); assert.equal(connections[0].status, '草稿');
  assert.deepEqual(connections[0].apiKeys, []); assert.equal(connections[0].credentialRef, '');
  assert.equal(providerCataloguePrice(owner(state), modelId).scenarios[0].listPrice, 0);
  for (const endpoint of seed.endpoints) assert.deepEqual(state.endpoints.find(item => item.id === endpoint.id), endpoint);
  for (const key of ['models', 'modelSupplies', 'supplyPrices', 'modelSalePrices', 'apiKeys']) assert.deepEqual(next[key], seed[key]);
  assert.equal(JSON.stringify(seed), before);
});

test('the saved model address can be edited without changing the model ID, quote or credential data', () => {
  const original = commitAdminState(createAdminSeed(), action()), endpoint = catalogueConnections(original, owner(original), modelId)[0];
  const updated = commitAdminState(original, action({ modelId, endpointId: endpoint.id, protocol: '其他', baseUrl: 'https://changed.example.invalid/service' }, 'catalogueConnection'));
  const restored = parseAdminState(JSON.stringify(updated)), changed = catalogueConnections(restored, owner(restored), modelId)[0];
  assert.equal(changed.id, endpoint.id); assert.equal(changed.protocol, '其他');
  assert.equal(changed.baseUrl, 'https://changed.example.invalid/service');
  assert.deepEqual(owner(restored).catalogModelIds, owner(original).catalogModelIds);
  assert.deepEqual(owner(restored).catalogPricing, owner(original).catalogPricing);
  assert.deepEqual(changed.apiKeys, endpoint.apiKeys); assert.equal(restored.endpoints.length, original.endpoints.length);
});

test('missing/invalid access fields, duplicate model, permission, conflict and storage errors never leave partial records', () => {
  const state = createAdminSeed(), before = JSON.stringify(state);
  for (const patch of [{ protocol: '' }, { protocol: 'unknown' }, { baseUrl: '' }, { baseUrl: undefined }, { baseUrl: 'http://third.example.invalid' }, { baseUrl: 'https://user:pass@example.invalid/v1' }, { baseUrl: 'https://example.invalid/v1?key=secret' }]) {
    assert.throws(() => commitAdminState(state, action({ ...draft, ...patch })));
    assert.equal(JSON.stringify(state), before);
  }
  const next = commitAdminState(state, action());
  assert.throws(() => commitAdminState(next, action()), /已在供应商目录/);
  assert.throws(() => commitAdminState({ ...state, currentRole: '运维人员' }, action()), /无权/);
  assert.throws(() => persistModelAction(state, action(), { getItem: () => JSON.stringify({ ...state, revision: state.revision + 1 }), setItem: () => assert.fail('must not write') }), /数据已变化/);
  assert.throws(() => persistModelAction(state, action(), { getItem: () => before, setItem: () => { throw Error('quota'); } }), /quota/);
  assert.equal(JSON.stringify(state), before);
});
