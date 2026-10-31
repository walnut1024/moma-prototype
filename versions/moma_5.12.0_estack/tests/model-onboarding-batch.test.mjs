import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAdminState, createAdminSeed, commitAdminState, persistModelAction } from '../src/admin-v2/store.js';
import { supplierChannelAssociations } from '../src/admin-v2/supplier-resources.js';
import { channelBlockReason, channelUrl, channelInterfaceIssue } from '../src/admin-v2/provider-channels.js';
import { connectionTestPassed } from '../src/admin-v2/connection-state.js';
import { availableServiceChannels } from '../src/admin-v2/service-workspace.js';
import { modelSupplies, activeSupplyPrice } from '../src/admin-v2/model-management.js';
import { providerCatalogueIds } from '../src/admin-v2/moma-provider.js';

const providerId = 'provider-moma';
const owner = state => state.providers.find(row => row.id === providerId);
const action = (operation, values, id = providerId) => ({ type: 'modelOperations', operation: 'provider', data: { operation, objectId: id, values } });
const run = (state, operation, values, id) => commitAdminState(state, action(operation, values, id));
const models = [{ libraryId: 'model-2', upstreamModelId: 'vendor/GLM-5.2:v2', scenarios: [] }, { libraryId: 'model-6', upstreamModelId: 'vendor/bge-large', scenarios: [] }];
const draft = { name: '批量接入测试', interfaceType: 'openai', addressMode: 'base', protocol: 'OpenAI', baseUrl: 'https://batch.example.invalid/v1', taskUrls: {}, authMode: 'group', keyGroupId: 'default', models };
const endpoint = state => state.endpoints.find(row => row.name === draft.name);
const mappings = state => supplierChannelAssociations(state, owner(state), endpoint(state).id);
const selection = state => ({ endpointId: endpoint(state).id, associationIds: mappings(state).map(row => row.id) });
const unchangedServices = (before, after) => { for (const field of ['models', 'modelSupplies', 'serviceRoutes', 'modelSalePrices', 'supplyPrices']) assert.deepEqual(after[field], before[field], field); };

test('one connection atomically creates multiple canonical mappings with unknown prices and task-specific URLs', () => {
  const state = parseAdminState(null), before = structuredClone(state);
  const next = run(state, 'supplierChannelCreate', draft), ep = endpoint(next), rows = mappings(next);
  assert.equal(next.endpoints.length, state.endpoints.length + 1);
  assert.equal(ep.addressMode, 'base'); assert.equal(ep.status, '草稿');
  assert.equal(rows.length, 2); assert.ok(rows.every(row => !row.enabled && !row.health && row.pricing.scenarios.length === 0));
  assert.deepEqual(new Set(rows.map(row => row.upstreamModelId)), new Set(models.map(row => row.upstreamModelId)));
  assert.equal(channelUrl(owner(next), rows.find(row => row.upstreamModelId === models[0].upstreamModelId)), draft.baseUrl + '/chat/completions');
  assert.equal(channelUrl(owner(next), rows.find(row => row.upstreamModelId === models[1].upstreamModelId)), draft.baseUrl + '/embeddings');
  assert.ok(owner(next).catalogModels.some(row => row.libraryId === 'model-6'));
  assert.deepEqual(state, before); unchangedServices(state, next);
  assert.equal(mappings(parseAdminState(JSON.stringify(next))).length, 2);
});

test('single-element models use the atomic batch path and old top-level model inputs are rejected', () => {
  const state = parseAdminState(null);
  const connection = { name: draft.name, protocol: 'OpenAI', baseUrl: 'https://single.example.invalid/v1/chat/completions', keyGroupId: 'default' };
  const next = run(state, 'supplierChannelCreate', { ...connection, models: [models[0]] });
  assert.equal(mappings(next).length, 1);
  assert.equal(channelUrl(owner(next), mappings(next)[0]), 'https://single.example.invalid/v1/chat/completions');
  assert.throws(() => run(state, 'supplierChannelCreate', { ...connection, ...models[0] }), /请选择 1–50 个模型/);
});

test('invalid later rows, duplicate identities and unsupported tasks reject the entire batch without writes', () => {
  const state = parseAdminState(null), before = structuredClone(state);
  const invalid = [[], null, Array(51).fill(models[0]), [models[0], { ...models[1], libraryId: 'missing' }], [models[0], models[0]], [models[0], { ...models[1], upstreamModelId: models[0].upstreamModelId }], [models[0], { ...models[1], upstreamModelId: 'bad\u0000model' }], [models[0], { ...models[1], scenarios: [{ name: '输入 Token', listPrice: '-1', unit: '百万 Token', currency: 'CNY' }] }], [models[0], { ...models[1], libraryId: 'model-15' }]];
  for (const entries of invalid) {
    assert.throws(() => run(state, 'supplierChannelCreate', { ...draft, models: entries }));
    assert.deepEqual(state, before);
  }
});

test('new channel creation rejects existing resource IDs and foreign credential groups', () => {
  const state = parseAdminState(null);
  for (const patch of [{ endpointId: state.endpoints[0].id }, { associationId: 'existing' }, { keyGroupId: 'foreign-group' }]) assert.throws(() => run(state, 'supplierChannelCreate', { ...draft, ...patch }));
  assert.throws(() => run(state, 'supplierChannelCreate', { ...draft, interfaceType: undefined, addressMode: 'base' }), /完整接口路径/);
});

test('unknown prices stay unknown through technical test and enable and cannot fall back to catalogue offers', () => {
  const initial = parseAdminState(null), created = run(initial, 'supplierChannelCreate', draft);
  const tested = run(created, 'supplierModelsTest', selection(created));
  assert.ok(mappings(tested).every(row => row.health.result === '通过' && row.health.simulated));
  assert.equal(endpoint(tested).status, '草稿'); assert.ok(mappings(tested).every(row => !row.enabled));
  const enabled = run(tested, 'supplierModelsEnable', selection(tested));
  assert.equal(endpoint(enabled).status, '运行中'); assert.ok(connectionTestPassed(endpoint(enabled)));
  for (const row of mappings(enabled)) {
    assert.equal(row.enabled, true); assert.equal(channelBlockReason(owner(enabled), row), '');
    assert.equal(row.pricing.scenarios.length, 0);
    assert.equal(availableServiceChannels(enabled, owner(enabled), row.modelId).find(item => item.id === row.id).reason, '采购价待配置');
  }
  unchangedServices(initial, enabled);
});

test('legacy supply-scoped procurement remains a valid source for existing implicit channels', () => {
  const state = createAdminSeed();
  const supply = modelSupplies(state, 'catalog-demo-kimi').find(row => providerCatalogueIds(row.provider).includes(row.catalogueModelId || row.upstreamModelId));
  const catalogueId = supply.catalogueModelId || supply.upstreamModelId;
  assert.ok(activeSupplyPrice(state, supply.id));
  const channel = availableServiceChannels(state, supply.provider, catalogueId).find(row => row.endpointId === supply.endpointId);
  assert.equal(channel.managed, false); assert.equal(channel.pricing.scenarios.length, 0);
  assert.equal(channel.reason, '');
  const before = structuredClone(state.supplyPrices);
  availableServiceChannels(state, supply.provider, catalogueId);
  assert.deepEqual(state.supplyPrices, before);
});

test('explicit free procurement is a complete price and is distinguished from missing procurement', () => {
  let state = run(parseAdminState(null), 'supplierChannelCreate', { ...draft, models: [{ ...models[0], scenarios: [{ name: '输入 Token', listPrice: '0', unit: '百万 Token', currency: 'CNY' }] }] });
  state = run(state, 'supplierModelsTest', selection(state)); state = run(state, 'supplierModelsEnable', selection(state));
  const row = mappings(state)[0];
  assert.equal(row.pricing.scenarios[0].listPrice, 0);
  assert.equal(availableServiceChannels(state, owner(state), row.modelId).find(item => item.id === row.id).reason, '');
});

test('partial batch test failures are stored individually and block atomic batch enable', () => {
  const created = run(parseAdminState(null), 'supplierChannelCreate', draft), ids = selection(created);
  const tested = run(created, 'supplierModelsTest', { ...ids, scenarios: { [ids.associationIds[1]]: 'unauthorized' } });
  assert.equal(mappings(tested).find(row => row.id === ids.associationIds[0]).health.result, '通过');
  assert.equal(mappings(tested).find(row => row.id === ids.associationIds[1]).health.status, 401);
  assert.ok(mappings(tested).every(row => !row.enabled));
  const before = structuredClone(tested);
  assert.throws(() => run(tested, 'supplierModelsEnable', ids), /健康检测/); assert.deepEqual(tested, before);
  const enabled = run(tested, 'supplierModelsEnable', { ...ids, associationIds: [ids.associationIds[0]] });
  assert.equal(mappings(enabled).find(row => row.id === ids.associationIds[0]).enabled, true);
  assert.equal(mappings(enabled).find(row => row.id === ids.associationIds[1]).enabled, false);
});

test('missing credentials produce per-model failure results without enabling or deleting saved configuration', () => {
  const created = run(parseAdminState(null), 'supplierChannelCreate', draft);
  owner(created).apiKeys.forEach(key => { key.status = 'disabled'; });
  const tested = run(created, 'supplierModelsTest', selection(created));
  assert.equal(mappings(tested).length, 2);
  assert.ok(mappings(tested).every(row => row.health.result === '失败' && /凭证/.test(row.health.message) && !row.enabled));
  assert.equal(endpoint(tested).status, '草稿');
});

test('retesting a model failure prevents an earlier success from qualifying for enable', () => {
  let state = run(parseAdminState(null), 'supplierChannelCreate', draft);
  state = run(state, 'supplierModelsTest', selection(state));
  const ids = selection(state), fail = ids.associationIds[0];
  state = run(state, 'supplierModelsTest', { endpointId: ids.endpointId, associationIds: [fail], scenarios: { [fail]: 'unavailable' } });
  assert.throws(() => run(state, 'supplierModelsEnable', { endpointId: ids.endpointId, associationIds: [fail] }), /健康检测/);
});

test('batch actions reject duplicate IDs, foreign endpoints, foreign associations and empty selections', () => {
  const state = run(parseAdminState(null), 'supplierChannelCreate', draft), ids = selection(state);
  const other = supplierChannelAssociations(state, owner(state)).find(row => row.endpointId !== ids.endpointId);
  for (const operation of ['supplierModelsTest', 'supplierModelsEnable']) {
    for (const associationIds of [[], null, [ids.associationIds[0], ids.associationIds[0]], [other.id], Array(51).fill('x')]) assert.throws(() => run(state, operation, { ...ids, associationIds }));
    assert.throws(() => run(state, operation, ids, 'provider-zhipu-direct'), /渠道/);
  }
});

test('adding models to an existing channel preserves existing checks, prices, activation and services', () => {
  let state = run(parseAdminState(null), 'supplierChannelCreate', { ...draft, models: [models[0]] });
  state = run(state, 'supplierModelsTest', selection(state)); state = run(state, 'supplierModelsEnable', selection(state));
  const previous = structuredClone(mappings(state)[0]), originalEndpoint = structuredClone(endpoint(state));
  const next = run(state, 'supplierModelsAdd', { endpointId: endpoint(state).id, models: [models[1]] });
  assert.deepEqual(mappings(next).find(row => row.id === previous.id), previous);
  assert.deepEqual(endpoint(next), originalEndpoint);
  assert.equal(mappings(next).find(row => row.upstreamModelId === models[1].upstreamModelId).enabled, false);
  unchangedServices(state, next);
  assert.throws(() => run(next, 'supplierModelsAdd', { endpointId: endpoint(next).id, models: [models[0]] }), /已关联/);
  assert.throws(() => run(next, 'supplierModelsAdd', { endpointId: endpoint(next).id, models: [{ libraryId: 'model-4', upstreamModelId: models[0].upstreamModelId }] }), /不可重复/);
});

test('restoring a stopped channel enables only selected mappings rather than reviving all siblings', () => {
  let state = run(parseAdminState(null), 'supplierChannelCreate', draft);
  state = run(state, 'supplierModelsTest', selection(state)); state = run(state, 'supplierModelsEnable', selection(state));
  endpoint(state).status = '停用';
  const ids = selection(state), next = run(state, 'supplierModelsEnable', { ...ids, associationIds: [ids.associationIds[0]] });
  assert.equal(endpoint(next).status, '运行中');
  assert.equal(mappings(next).find(row => row.id === ids.associationIds[0]).enabled, true);
  assert.equal(mappings(next).find(row => row.id === ids.associationIds[1]).enabled, false);
});

test('editing explicit base-address channels retains interface fields and invalidates only affected evidence', () => {
  let state = run(parseAdminState(null), 'supplierChannelCreate', draft);
  state = run(state, 'supplierModelsTest', selection(state));
  const next = run(state, 'supplierChannelSave', { endpointId: endpoint(state).id, mode: 'address', protocol: 'OpenAI', baseUrl: 'https://edited.example.invalid/api/v1', confirmed: true });
  assert.equal(endpoint(next).interfaceType, 'openai'); assert.equal(endpoint(next).addressMode, 'base');
  assert.ok(mappings(next).every(row => !row.health));
  assert.ok(mappings(next).find(row => row.upstreamModelId === models[1].upstreamModelId).apiAddresses[0].baseUrl.endsWith('/embeddings'));
});

test('batch creation and enable preserve role, revision and storage failure boundaries', () => {
  const state = parseAdminState(null), before = structuredClone(state);
  assert.throws(() => run({ ...state, currentRole: '运维人员' }, 'supplierChannelCreate', draft), /无权/);
  assert.throws(() => persistModelAction(state, action('supplierChannelCreate', draft), { getItem: () => JSON.stringify({ ...state, revision: state.revision + 1 }), setItem: () => assert.fail() }), /数据已变化/);
  assert.throws(() => persistModelAction(state, action('supplierChannelCreate', draft), { getItem: () => JSON.stringify(state), setItem: () => { throw Error('disk full'); } }), /disk full/);
  assert.deepEqual(state, before);
});

test('only self-hosted suppliers can create channels without authentication', () => {
  const initial = parseAdminState(null);
  assert.throws(() => run(initial, 'supplierChannelCreate', { ...draft, authMode: 'none' }), /自有推理/);
  const created = run(initial, 'create', { name: '本地供给', code: 'batch-self-hosted', sourceType: 'selfHosted', description: '' }, null), id = created.audits[0].objectId;
  const state = run(created, 'supplierChannelCreate', { ...draft, authMode: 'none', baseUrl: 'http://inference.example.invalid/v1', models: [models[0]] }, id);
  const ep = state.endpoints.find(row => row.name === draft.name);
  assert.equal(ep.authMode, 'none'); assert.equal(ep.allowHttp, true);
});

test('an incompatible later metadata change remains readable and blocks the mapping instead of crashing the catalogue', () => {
  const state = run(parseAdminState(null), 'supplierChannelCreate', { ...draft, models: [models[0]] });
  const entry = owner(state).catalogModels.find(row => row.libraryId === models[0].libraryId);
  entry.type = 'rerank';
  const row = mappings(state)[0];
  assert.equal(channelUrl(owner(state), row), '');
  assert.match(channelInterfaceIssue(owner(state), row), /不支持/);
  assert.match(channelBlockReason(owner(state), row), /不支持/);
});
