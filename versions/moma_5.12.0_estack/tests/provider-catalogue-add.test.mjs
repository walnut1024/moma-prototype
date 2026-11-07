import { withAdminSession } from './admin-session-fixture.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createAdminSeed as baseCreateAdminSeed, commitAdminState, persistModelAction, parseAdminState as baseParseAdminState } from '../src/admin-v2/store.js';
import { providerCatalogueIds, providerCatalogueModel } from '../src/admin-v2/moma-provider.js';
import { catalogueChannels } from '../src/admin-v2/provider-channels.js';
import { SUPPLIER_MODEL_TYPES } from '../src/admin-v2/provider-management.js';
import { providerCataloguePrice } from '../src/admin-v2/moma-catalogue-prices.js';
import { cataloguePurchasePrice } from '../src/admin-v2/provider-catalogue-pricing.js';
const draft = { protocol: 'OpenAI', apiUrl: 'https://catalogue.example.invalid/v1/chat/completions', modelId: ' New-Complete-Model ', modelType: 'text', channelName: '国内渠道', modelName: '模型显示名称', discountFactor: '0.8', scenarios: [{ name: '输入 Token', listPrice: '1.25', unit: '百万 Token', currency: 'CNY' }, { name: '输出 Token', listPrice: '0', unit: '百万 Token', currency: 'CNY' }] };
const action = (values = draft, objectId = 'provider-moma') => ({ type: 'modelOperations', operation: 'provider', data: { operation: 'catalogueAdd', objectId, values } });
const provider = state => state.providers.find(item => item.id === 'provider-moma');

test('one save appends a case-preserved model and all quote rows atomically, persists discount and keeps platform objects intact', () => {
  const seed = createAdminSeed(), before = JSON.stringify(seed);let saved = before;
  const state = persistModelAction(seed, action(), { getItem: () => saved, setItem: (_, value) => { saved = value; } });
  assert.equal(providerCatalogueIds(provider(state)).length, providerCatalogueIds(provider(seed)).length + 1);
  assert.ok(providerCatalogueIds(provider(state)).includes('New-Complete-Model'));
  const entry = providerCataloguePrice(provider(state), 'New-Complete-Model');
  assert.equal(entry.discountFactor, 800000);
  assert.deepEqual(entry.scenarios.map(row => row.listPrice), [1250000, 0]);
  assert.deepEqual(providerCatalogueModel(provider(state), 'New-Complete-Model'), { modelId: 'New-Complete-Model', name: '模型显示名称', type: 'text' });
  const channel = provider(state).catalogConnections.find(item => item.modelId === 'New-Complete-Model');
  assert.equal(channel.name, '国内渠道');
  assert.equal(state.endpoints.find(item => item.id === channel.endpointId).baseUrl, draft.apiUrl);
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
    ...['bad/id', 'bad_id', '中文', '-model', 'model-', 'model--id'].map(modelId => ({ ...draft, modelId })),
    ...['', ' ', 'x'.repeat(61), 'a\nb'].map(channelName => ({ ...draft, channelName })),
    { ...draft, modelName: 'x'.repeat(101) }, { ...draft, modelName: 'a\nb' }, { ...draft, providerId: 'provider-kimi-official' },
    { ...draft, modelType: '' }, { ...draft, modelType: 'unknown' }, { ...draft, modelType: 'constructor' }, { ...draft, modelType: undefined },
    { ...draft, scenarios: [] }, { ...draft, scenarios: [{ ...draft.scenarios[0], listPrice: '' }] }, { ...draft, scenarios: [{ ...draft.scenarios[0], name: '' }] }, { ...draft, scenarios: [{ ...draft.scenarios[0], unit: '' }] },
    { ...draft, scenarios: [draft.scenarios[0], draft.scenarios[0]] }, { ...draft, scenarios: [{ ...draft.scenarios[0], listPrice: '-1' }] }, { ...draft, scenarios: [{ ...draft.scenarios[0], listPrice: '1.1234567' }] },
    { ...draft, discountFactor: '1.01' }, { ...draft, discountFactor: '-0.1' }, { ...draft, scenarios: [{ name: '资源包', unit: '包', currency: 'CNY', listPrice: '1' }] }
  ];
  for (const value of cases) { assert.throws(() => commitAdminState(seed, action(value)));assert.equal(JSON.stringify(seed), before); }
  assert.throws(() => commitAdminState(seed, action(draft, 'missing')), /服务商不存在/);
});

test('empty discount is one, explicit zero remains zero and catalogue IDs remain case-sensitive', () => {
  const seed = createAdminSeed();let state = commitAdminState(seed, action({ ...draft, discountFactor: '' }));
  assert.equal(providerCataloguePrice(provider(state), 'New-Complete-Model').discountFactor, 1000000);
  state = commitAdminState(state, action({ ...draft, modelId: 'new-complete-model', discountFactor: '0' }));
  const entry = providerCataloguePrice(provider(state), 'new-complete-model');assert.equal(entry.discountFactor, 0);assert.equal(cataloguePurchasePrice(entry.scenarios[0].listPrice, entry.discountFactor), 0);
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
  for (const type of Object.keys(SUPPLIER_MODEL_TYPES)) state = commitAdminState(state, action({ ...draft, modelId: `Types-${type}`, modelType: type }));
  state = parseAdminState(JSON.stringify(state));
  for (const type of Object.keys(SUPPLIER_MODEL_TYPES)) assert.equal(providerCatalogueModel(provider(state), `Types-${type}`).type, type);
  const original = structuredClone(provider(state).catalogModels);
  state = commitAdminState(state, { type: 'modelOperations', operation: 'provider', data: { operation: 'cataloguePrice', objectId: 'provider-moma', values: { modelId: 'Types-visual', modelType: 'text', scenarios: draft.scenarios } } });
  state = commitAdminState(state, { type: 'modelOperations', operation: 'provider', data: { operation: 'catalogueDiscount', objectId: 'provider-moma', values: { modelId: 'Types-visual', discountFactor: '0.4' } } });
  state = commitAdminState(state, { type: 'modelOperations', operation: 'providerRegistration', data: { providerId: 'provider-moma', provider: { ...provider(state), contact: '目录字段验证' } } });
  assert.deepEqual(provider(state).catalogModels, original);
  assert.equal(providerCatalogueModel(provider(state), 'types-image'), undefined);
});

test('full API URLs are saved once on the named channel without concatenation or altering existing connections', () => {
  const seed = createAdminSeed(); let state = seed;
  const endpoints = ['https://api.example.com/v1/chat/completions', 'https://api.example.com/Models/Generate', 'https://api.example.com/v1/images/generations'];
  for (const [index, apiUrl] of endpoints.entries()) state = commitAdminState(state, action({ ...draft, modelId: `Endpoint-${index}`, apiUrl: ` ${apiUrl} ` }));
  state = parseAdminState(JSON.stringify(state));
  endpoints.forEach((apiUrl, index) => {
    const channel = provider(state).catalogConnections.find(item => item.modelId === `Endpoint-${index}`);
    assert.equal(state.endpoints.find(item => item.id === channel.endpointId).baseUrl, apiUrl);
    assert.equal(providerCatalogueModel(provider(state), `Endpoint-${index}`).endpoint, undefined);
  });
  for (const endpoint of seed.endpoints) assert.deepEqual(state.endpoints.find(item => item.id === endpoint.id), endpoint);
  assert.equal(state.endpoints.length, seed.endpoints.length + endpoints.length);
  assert.deepEqual(state.modelSupplies, seed.modelSupplies);
});

test('relative paths, base URLs and malformed API URLs reject identity, channel and pricing atomically', () => {
  const seed = createAdminSeed(), before = JSON.stringify(seed);
  for (const apiUrl of ['', undefined, 1, {}, '/v1/chat/completions', 'https://api.example.com', 'https://api.example.com/v1', 'v1/chat/completions', '//example.com/v1', 'https:/example.com/v1', 'ftp://example.com/v1', 'javascript:alert(1)', 'https://user:pass@example.com/v1/chat/completions', 'https://example.com/v1/chat completions', 'https://example.com/v1/\ncompletions', 'https://example.com/v1/\u0000completions', 'https://example.com/v1/\\completions', 'https://example.com/v1/chat#fragment', 'https://example.com/' + 'x'.repeat(2048)]) {
    assert.throws(() => commitAdminState(seed, action({ ...draft, apiUrl })));
    assert.equal(JSON.stringify(seed), before);
  }
});

test('language protocol is OpenAI only; other six-category choices use the exact API URL without a language protocol', () => {
  const seed = createAdminSeed();
  assert.throws(() => commitAdminState(seed, action({ ...draft, protocol: 'Anthropic' })), /仅支持 OpenAI/);
  const defaulted = commitAdminState(seed, action({ ...draft, protocol: undefined, modelName: '' }));
  assert.equal(providerCatalogueModel(provider(defaulted), 'New-Complete-Model').name, 'New-Complete-Model');
  const languageChannel = provider(defaulted).catalogConnections.find(item => item.modelId === 'New-Complete-Model');
  assert.equal(defaulted.endpoints.find(item => item.id === languageChannel.endpointId).protocol, 'OpenAI');
  const visual = commitAdminState(seed, action({ ...draft, modelType: 'visual', apiUrl: 'https://api.example.com/v1/images/generations' }));
  const visualChannel = provider(visual).catalogConnections.find(item => item.modelId === 'New-Complete-Model');
  assert.equal(visual.endpoints.find(item => item.id === visualChannel.endpointId).protocol, '其他');
});

test('deleted model identities cannot silently create an invisible duplicate or overwrite historical metadata', () => {
  const original = commitAdminState(createAdminSeed(), action());
  const channel = catalogueChannels(original, provider(original), 'New-Complete-Model')[0];
  const unlinked = commitAdminState(original, { type: 'modelOperations', operation: 'provider', data: { operation: 'channelDelete', objectId: 'provider-moma', values: { modelId: 'New-Complete-Model', channelId: channel.id, confirmed: true } } });
  const removed = commitAdminState(unlinked, { type: 'modelOperations', operation: 'provider', data: { operation: 'catalogueRemove', objectId: 'provider-moma', values: { modelId: 'New-Complete-Model', confirmed: true } } });
  const before = structuredClone(removed);
  assert.throws(() => commitAdminState(removed, action()), /历史记录/);
  assert.deepEqual(removed, before);
});

function createAdminSeed(...args) { return withAdminSession(baseCreateAdminSeed(...args)); }
function parseAdminState(...args) { return withAdminSession(baseParseAdminState(...args)); }
