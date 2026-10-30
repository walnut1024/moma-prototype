import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminSeed, commitAdminState, parseAdminState, persistModelAction } from '../src/admin-v2/store.js';
import { officialSupplyRecords } from '../src/admin-v2/official-supply-catalogue.js';
import { catalogueChannels, channelAddresses, channelPriceDraft } from '../src/admin-v2/provider-channels.js';
import { displayedCatalogueIds, providerCatalogueIds } from '../src/admin-v2/moma-provider.js';
import { providerApiKeysDraft } from '../src/admin-v2/provider-management.js';

const act = (operation, owner, values = {}) => ({ type: 'modelOperations', operation: 'provider', data: { operation, objectId: owner, values } });
const provider = (state, id = 'provider-deepseek-official') => state.providers.find(item => item.id === id);
const channel = state => catalogueChannels(state, provider(state), 'deepseek-v4-pro')[0];
const edit = (state, item, patch = {}) => commitAdminState(state, act('channelSave', item.endpoint.providerId, { modelId: item.modelId, channelId: item.id, name: item.name, origin: item.origin, upstreamProvider: item.upstreamProvider, upstreamModelId: item.upstreamModelId, ...channelAddresses(provider(state, item.endpoint.providerId), item)[0], apiAddresses: channelAddresses(provider(state, item.endpoint.providerId), item), scenarios: channelPriceDraft(item), ...patch }));

test('official catalogue has a real two-region Kimi case, two DeepSeek protocols and distinct image/video billing', () => {
  const seed = createAdminSeed(), kimi = provider(seed, 'provider-kimi-official');
  const channels = catalogueChannels(seed, kimi, 'kimi-k3');
  assert.equal(channels.length, 2);
  assert.deepEqual(channels.map(item => new URL(item.endpoint.baseUrl).hostname), ['api.moonshot.cn', 'api.moonshot.ai']);
  assert.equal(channels[0].pricing.scenarios.length, 5);
  assert.ok(channels.every(item => item.pricing.scenarios.every(row => row.listPrice === null)));
  const deepseek = channel(seed);
  assert.deepEqual(channelAddresses(provider(seed), deepseek).map(item => item.protocol), ['OpenAI', 'Anthropic']);
  assert.equal(deepseek.pricing.scenarios[0].listPrice, 22000);
  assert.equal(deepseek.pricing.scenarios[0].currency, 'USD');
  const ark = provider(seed, 'provider-ark-official');
  const image = catalogueChannels(seed, ark, 'doubao-seedream-5-0-flash-260915')[0];
  assert.deepEqual(image.pricing.scenarios.map(row => [row.unit, row.listPrice]), [['张', 0], ['张', 120000]]);
  assert.equal(catalogueChannels(seed, ark, 'doubao-seedance-2-0-260128')[0].pricing.scenarios.length, 4);
  for (const item of officialSupplyRecords().providers.flatMap(p => p.catalogConnections)) {
    assert.ok(item.source.startsWith('https://')); assert.equal(item.enabled, false);
  }
});

test('representative MoMA view hides repetitive built-ins without changing stored catalogue, custom models or linked models', () => {
  const seed = createAdminSeed(), moma = provider(seed, 'provider-moma'), before = structuredClone(seed);
  assert.equal(displayedCatalogueIds(moma, seed).length, 3);
  assert.ok(providerCatalogueIds(moma).length > 50);
  assert.deepEqual(seed, before);
  const custom = { ...moma, catalogModelIds: [...moma.catalogModelIds, 'custom-model'] };
  assert.ok(displayedCatalogueIds(custom, seed).includes('custom-model'));
});

test('explicit official load is additive, idempotent and retains existing modified records and histories', () => {
  const seed = createAdminSeed(), stripped = { ...seed, providers: seed.providers.filter(p => !p.id.endsWith('-official')), endpoints: seed.endpoints.filter(p => !p.id.startsWith('endpoint-official-')) };
  const loaded = commitAdminState(stripped, act('officialCatalogue', 'provider-moma'));
  assert.ok(provider(loaded));
  const before = structuredClone(loaded);
  provider(loaded).name = '用户修改名称';
  const twice = commitAdminState(loaded, act('officialCatalogue', 'provider-moma'));
  assert.equal(provider(twice).name, '用户修改名称');
  assert.equal(twice.providers.length, loaded.providers.length);
  for (const key of ['models', 'modelSupplies', 'supplyPrices', 'modelSalePrices', 'serviceRoutes']) assert.deepEqual(twice[key], before[key]);
});

test('protocol-address editing validates every address atomically and retains secondary addresses in persistence', () => {
  const seed = createAdminSeed(), item = channel(seed), before = structuredClone(seed);
  for (const apiAddresses of [[], [{ protocol: 'OpenAI', baseUrl: item.endpoint.baseUrl }, { protocol: 'Anthropic', baseUrl: 'http://public.invalid' }], [{ protocol: 'OpenAI', baseUrl: item.endpoint.baseUrl }, { protocol: 'OpenAI', baseUrl: 'https://api.invalid/second' }]]) assert.throws(() => edit(seed, item, { apiAddresses }));
  assert.deepEqual(seed, before);
  const addresses = channelAddresses(provider(seed), item).map(a => a.protocol === 'Anthropic' ? { ...a, baseUrl: 'https://api.deepseek.com/anthropic/v1/messages-new' } : a);
  const saved = edit(seed, item, { apiAddresses: addresses });
  assert.deepEqual(channelAddresses(provider(saved), channel(saved)), addresses);
  assert.deepEqual(channelAddresses(provider(parseAdminState(JSON.stringify(saved))), channel(parseAdminState(JSON.stringify(saved)))), addresses);
});

test('testing an alternate protocol never verifies or enables the default route', async () => {
  let seed = createAdminSeed();
  const item = channel(seed), keys = await providerApiKeysDraft(['sk-local-protocol-test-only-12345']);
  seed = commitAdminState(seed, act('addApiKeys', item.endpoint.providerId, keys));
  seed = commitAdminState(seed, act('connectionKeys', item.endpoint.providerId, { endpointId: item.endpointId, apiKeys: provider(seed).apiKeys, confirmed: true }));
  const saved = commitAdminState(seed, act('channelTest', item.endpoint.providerId, { modelId: item.modelId, channelId: item.id, addressIndex: 1, scenario: 'success' }));
  assert.equal(channel(saved).health, null);
  assert.equal(channel(saved).protocolTests.Anthropic.protocol, 'Anthropic');
  assert.equal(channel(saved).protocolTests.Anthropic.baseUrl, 'https://api.deepseek.com/anthropic/v1/messages');
  assert.equal(channel(saved).enabled, false);
  assert.throws(() => commitAdminState(saved, act('channelTest', item.endpoint.providerId, { modelId: item.modelId, channelId: item.id, addressIndex: 7, scenario: 'success' })), /协议地址/);
});

test('channel and model removal require confirmation, retain history and never resurrect implicit channels', () => {
  const seed = createAdminSeed(), owner = provider(seed, 'provider-kimi-official'), item = catalogueChannels(seed, owner, 'kimi-k3')[0];
  assert.throws(() => commitAdminState(seed, act('channelDelete', owner.id, { modelId: 'kimi-k3', channelId: item.id })), /确认/);
  const deleted = commitAdminState(seed, act('channelDelete', owner.id, { modelId: 'kimi-k3', channelId: item.id, confirmed: true }));
  assert.equal(catalogueChannels(deleted, provider(deleted, owner.id), 'kimi-k3').length, 1);
  assert.ok(provider(deleted, owner.id).catalogConnections.find(c => c.id === item.id).deletedAt);
  assert.throws(() => commitAdminState(deleted, act('catalogueRemove', owner.id, { modelId: 'kimi-k3', confirmed: true })), /请先删除.*全部渠道/);
  const remaining = catalogueChannels(deleted, provider(deleted, owner.id), 'kimi-k3')[0];
  const cleared = commitAdminState(deleted, act('channelDelete', owner.id, { modelId: 'kimi-k3', channelId: remaining.id, confirmed: true }));
  const removed = commitAdminState(cleared, act('catalogueRemove', owner.id, { modelId: 'kimi-k3', confirmed: true }));
  assert.deepEqual(providerCatalogueIds(provider(removed, owner.id)), []);
  assert.deepEqual(removed.modelSalePrices, seed.modelSalePrices);
  assert.deepEqual(removed.endpoints, seed.endpoints);
  const linked = { ...seed, modelSupplies: [...seed.modelSupplies, { id: 'guarded-supply', modelId: seed.models[0].id, catalogueModelId: item.modelId, upstreamModelId: item.upstreamModelId, endpointId: item.endpointId, status: '已停用' }] };
  assert.throws(() => commitAdminState(linked, act('channelDelete', owner.id, { modelId: 'kimi-k3', channelId: item.id, confirmed: true })), /关联服务/);
  const draft = { ...seed, modelSupplies: [...seed.modelSupplies, { id: 'old-supply-reference', modelId: seed.models[0].id, catalogueModelId: item.modelId, upstreamModelId: item.upstreamModelId, endpointId: item.endpointId, status: '已移除' }], serviceRoutes: [{ id: 'draft-route', versions: [], draft: { config: { channels: [{ supplyId: 'old-supply-reference', enabled: false }] } } }] };
  assert.throws(() => commitAdminState(draft, act('channelDelete', owner.id, { modelId: 'kimi-k3', channelId: item.id, confirmed: true })), /关联服务或路由/);
});

test('official loading and deletion keep role, stale revision and failed-storage protections', () => {
  const seed = createAdminSeed(), action = act('officialCatalogue', 'provider-moma');
  assert.throws(() => commitAdminState({ ...seed, currentRole: '运维人员' }, action), /无权/);
  assert.throws(() => persistModelAction(seed, action, { getItem: () => JSON.stringify({ ...seed, revision: seed.revision + 1 }), setItem: () => assert.fail() }), /数据已变化/);
  assert.throws(() => persistModelAction(seed, action, { getItem: () => JSON.stringify(seed), setItem: () => { throw new Error('quota'); } }), /quota/);
});
