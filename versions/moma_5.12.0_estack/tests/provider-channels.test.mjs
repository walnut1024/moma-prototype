import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminSeed as baseSeed, commitAdminState, parseAdminState, persistModelAction } from '../src/admin-v2/store.js';
import { catalogueChannels, channelBlockReason, channelPriceRows, channelRouteRefs, channelPriceDraft, channelLinkedModels } from '../src/admin-v2/provider-channels.js';
import { catalogueConnections } from '../src/admin-v2/provider-model-connections.js';
import { providerApiKeysDraft } from '../src/admin-v2/provider-management.js';
import { routingServices, routingChannels, serviceRoute, routeSourceVersion, validateRouteConfig, routingStatus } from '../src/admin-v2/service-routing.js';
import { activeSupplyPrice } from '../src/admin-v2/model-management.js';
import { connectionFingerprint } from '../src/admin-v2/connection-state.js';

const providerId = 'provider-cmss', modelId = 'deepseek-v4-pro';
const operation = (name, values, owner = providerId) => ({ type: 'modelOperations', operation: 'provider', data: { operation: name, objectId: owner, values: { modelId, ...values } } });
const provider = state => state.providers.find(item => item.id === providerId);
const channels = state => catalogueChannels(state, provider(state), modelId);
const service = state => { state.models.find(item=>item.id==='model-1').serviceMode='standard'; return routingServices(state).find(item => item.modelId === 'model-1' && item.mode === 'standard'); };
const associateChannel=(state,channel)=>{const svc=service(state);return commitAdminState(state,{type:'modelOperations',operation:'associateServiceChannels',modelId:svc.modelId,data:{providerId,catalogueModelId:modelId,channelIds:[channel.id],confirmedIdentity:true,expectedUpdatedAt:svc.model.updatedAt}});};
const price = [{ name: '输入', listPrice: '1.5', unit: '百万 Token', currency: 'CNY' }, { name: '输出', listPrice: '4', unit: '百万 Token', currency: 'CNY' }];
const draft = { name: '转售渠道', origin: 'resale', upstreamProvider: '已披露服务商', upstreamModelId: 'upstream-v4', protocol: 'OpenAI', baseUrl: 'https://resale.example.invalid/v1/chat/completions', scenarios: price };
async function prepared() {
  const seed = createAdminSeed();
  const endpoint = seed.endpoints.find(item => item.id === 'endpoint-ds');
  endpoint.baseUrl = 'https://api.deepseek.com/v1/chat/completions';
  endpoint.connectionTest = { ...endpoint.connectionTest, fingerprint: connectionFingerprint(endpoint) };
  const keys = await providerApiKeysDraft(['sk-local-channel-only-00000001']);
  const state = commitAdminState(seed, operation('addApiKeys', keys));
  return { state, value: { ...draft } };
}
const add = (state, value) => commitAdminState(state, operation('channelSave', value));
const change = (state, name, channel, values = {}) => commitAdminState(state, operation(name, { channelId: channel.id, ...values }));
const addBatch = (state, rows) => commitAdminState(state, { type: 'modelOperations', operation: 'providerChannelBatch', data: { providerId, modelId, channels: rows } });
function ready(state, channel) {
  if (!channel.endpoint.apiKeys?.length && !channel.endpoint.credentialRef) state = commitAdminState(state, operation('connectionKeys', { endpointId: channel.endpointId, apiKeys: [provider(state).apiKeys[0]], confirmed: true }));
  state = change(state, 'channelTest', channel, { scenario: 'success' });
  return change(state, 'channelEnable', channels(state).find(item => item.id === channel.id));
}
const untouched = (before, after) => {
  for (const key of ['models', 'modelSupplies', 'supplyPrices', 'modelSalePrices', 'modelTemplates', 'serviceRoutes']) assert.deepEqual(after[key], before[key], key);
};

test('batch channel creation commits once, keeps independent prices and preserves existing supply data', () => {
  const state = createAdminSeed(), before = structuredClone(state), original = channels(state);
  const rows = [draft, { ...draft, name: '第二渠道', origin: 'direct', protocol: 'Anthropic', baseUrl: 'https://second.example.invalid/v1/messages', scenarios: [{ name: '输入', listPrice: '0', unit: '百万 Token', currency: 'USD' }] }];
  const next = addBatch(state, rows), saved = channels(next);
  assert.equal(saved.length, original.length + 2);
  assert.equal(next.revision, state.revision + 1); assert.equal(next.audits.length, state.audits.length + 1);
  const second = saved.find(item => item.name === '第二渠道');
  assert.equal(second.endpoint.protocol, 'Anthropic'); assert.equal(second.pricing.scenarios[0].listPrice, 0);
  assert.equal(second.pricing.scenarios[0].currency, 'USD'); assert.equal(second.enabled, false);
  assert.deepEqual(saved.find(item => item.name === draft.name).pricing, channels(add(state, draft)).find(item => item.name === draft.name).pricing);
  assert.ok(original.every(item => saved.some(row => row.id === item.id)));
  untouched(state, next); assert.deepEqual(state, before);
  assert.equal(channels(parseAdminState(JSON.stringify(next))).length, saved.length);
});

test('batch validates later rows against earlier rows without partial persistence', () => {
  const state = createAdminSeed(), before = structuredClone(state);
  for (const [row, message] of [
    [{ ...draft, name: '第二渠道', baseUrl: 'bad-url' }, /第 2 行.*地址/],
    [{ ...draft, baseUrl: 'https://second.example.invalid/v1/chat/completions' }, /第 2 行.*名称不可重复/],
    [{ ...draft, name: '第二渠道' }, /第 2 行.*调用配置相同/],
    [{ ...draft, name: '第二渠道', baseUrl: 'https://second.example.invalid/v1/chat/completions', scenarios: [{ ...price[0], listPrice: '-1' }] }, /第 2 行/],
    [{ ...draft, channelId: channels(state)[0].id }, /第 2 行.*仅支持新渠道/],
  ]) { assert.throws(() => addBatch(state, [draft, row]), message); assert.deepEqual(state, before); }
  assert.throws(() => addBatch(state, []), /1–20/);
  assert.throws(() => addBatch(state, Array(21).fill(draft)), /1–20/);
  const rows = Array.from({ length: 20 - channels(state).length + 1 }, (_, index) => ({ ...draft, name: `渠道 ${index}`, upstreamModelId: `upstream-${index}` }));
  assert.throws(() => addBatch(state, rows), /最多配置 20/); assert.deepEqual(state, before);
});

test('channel association uses exact provider, catalogue, endpoint and upstream identity without mixing siblings', () => {
  const seed = createAdminSeed(), owner = provider(seed), channel = channels(seed)[0];
  const linked = seed.modelSupplies.find(item => item.endpointId === channel.endpointId && (item.catalogueModelId || item.upstreamModelId) === modelId);
  assert.ok(linked);
  assert.ok(channelLinkedModels(seed, owner, channel).some(model => model.id === linked.modelId));
  for (const patch of [{ endpointId: 'different' }, { upstreamModelId: 'different' }, { modelId: 'different' }, { endpointId: null }]) assert.deepEqual(channelLinkedModels(seed, owner, { ...channel, ...patch }), []);
  assert.deepEqual(channelLinkedModels(seed, { ...owner, id: 'different' }, channel), []);
  assert.deepEqual(channelLinkedModels(seed, owner, null), []);
  const removed = { ...seed, modelSupplies: seed.modelSupplies.map(item => ({ ...item, status: '已移除' })) };
  assert.deepEqual(channelLinkedModels(removed, owner, channel), []);
  assert.equal(channelLinkedModels({ ...seed, modelSupplies: [...seed.modelSupplies, linked] }, owner, channel).filter(model => model.id === linked.modelId).length, 1);
});

test('new catalogue models get one unenabled named channel; old records are only read and names preserve identity', () => {
  const seed = createAdminSeed(), before = structuredClone(seed), old = channels(seed);
  assert.ok(old.length); assert.deepEqual(seed, before);
  const added = commitAdminState(seed, operation('catalogueAdd', { modelId: 'new-model', modelType: 'text', channelName: '国内渠道', modelName: '模型显示名称', protocol: 'OpenAI', apiUrl: 'https://new.example.invalid/v1/chat/completions', scenarios: price }));
  const defaults = catalogueChannels(added, provider(added), 'new-model');
  assert.equal(defaults.length, 1); assert.equal(defaults[0].name, '国内渠道'); assert.equal(defaults[0].enabled, false);
  assert.equal(catalogueChannels(parseAdminState(JSON.stringify(added)), provider(added), 'new-model')[0].id, defaults[0].id);
  const imported = commitAdminState(seed, operation('catalogueImport', { mode: 'batch', text: 'batch-one\nbatch-two' }));
  assert.equal(catalogueChannels(imported, provider(imported), 'batch-one').length, 0);
  assert.equal(catalogueChannels(imported, provider(imported), 'batch-two').length, 0);
});

test('adding independent channels preserves existing mappings, quotes, sales, routes and original channels', async () => {
  const { state, value } = await prepared(), before = structuredClone(state), original = channels(state);
  const next = add(state, value), rows = channels(next);
  assert.equal(rows.length, original.length + 1);
  assert.ok(rows.some(item => item.id === original[0].id));
  const added = rows.find(item => item.name === value.name);
  assert.equal(added.endpoint.baseUrl, value.baseUrl); assert.equal(added.upstreamModelId, value.upstreamModelId);
  assert.equal(added.origin, 'resale'); assert.equal(added.upstreamProvider, value.upstreamProvider);
  assert.equal(added.enabled, false); assert.deepEqual(added.endpoint.apiKeys, []);
  assert.deepEqual(provider(next).catalogPricing, provider(state).catalogPricing);
  assert.deepEqual(state, before); untouched(state, next);
  assert.equal(catalogueConnections(next, provider(next), modelId).length, original.length + 1);
  const restored = parseAdminState(JSON.stringify(next));
  assert.equal(channels(restored).find(item => item.id === added.id).endpoint.baseUrl, value.baseUrl);
});

test('adding a second channel never replaces a historical model connection without a channel ID', async () => {
  const { state, value } = await prepared(), endpoint = state.endpoints.find(item => item.providerId === providerId);
  const legacy = { modelId, endpointId: endpoint.id };
  provider(state).catalogConnections = [legacy];
  const before = structuredClone(state), next = add(state, value);
  assert.equal(channels(next).length, 2);
  assert.deepEqual(provider(next).catalogConnections.find(item => item.endpointId === endpoint.id), legacy);
  assert.deepEqual(state, before);
});

test('identical call configurations cannot be split using source labels or names; Model ID can distinguish a channel', async () => {
  const { state, value } = await prepared(), saved = add(state, value), before = structuredClone(saved);
  assert.throws(() => add(saved, { ...value, name: '自营渠道', origin: 'direct' }), /调用配置相同/);
  assert.deepEqual(saved, before);
  const bound = ready(saved, channels(saved).find(item => item.name === value.name));
  assert.throws(() => add(bound, { ...value, name: '缺少密钥也不能拆成新渠道' }), /调用配置相同/);
  const next = add(saved, { ...value, name: '另一模型标识渠道', upstreamModelId: 'upstream-v4-special' });
  assert.equal(channels(next).length, channels(saved).length + 1);
});

test('health checks, explicit enable, failed checks and stale credentials gate global availability', async () => {
  const { state, value } = await prepared(); let next = add(state, value), channel = channels(next).find(item => item.name === value.name);
  assert.throws(() => change(next, 'channelEnable', channel), /健康检测/);
  next = commitAdminState(next, operation('connectionKeys', { endpointId: channel.endpointId, apiKeys: [provider(next).apiKeys[0]], confirmed: true }));
  next = change(next, 'channelTest', channel, { scenario: 'unauthorized' });
  assert.equal(channels(next).find(item => item.id === channel.id).health.status, 401);
  assert.throws(() => change(next, 'channelEnable', channels(next).find(item => item.id === channel.id)), /健康检测/);
  next = ready(next, channel); channel = channels(next).find(item => item.id === channel.id);
  assert.equal(channelBlockReason(provider(next), channel), '');
  const stale = { ...channel, endpoint: { ...channel.endpoint, baseUrl: 'https://changed.example.invalid' } };
  assert.match(channelBlockReason(provider(next), stale), /配置已变化/);
});

test('routes independently reference same-supplier channels with weights and never auto-join them', async () => {
  const { state, value } = await prepared(); let next = add(state, value), channel = channels(next).find(item => item.name === value.name);
  next = ready(next, channel);
  assert.ok(!routingChannels(next,service(next)).some(item=>item.channelId===channel.id));
  next=associateChannel(next,channel);
  const svc = service(next), candidates = routingChannels(next, svc), newChannel = candidates.find(item => item.channelId === channel.id);
  assert.ok(newChannel?.available); assert.equal(newChannel.upstreamModelId, value.upstreamModelId);
  const old = candidates.find(item => item.provider.id === providerId && item.id !== newChannel.id && item.available);
  assert.ok(old); assert.equal(serviceRoute(next, svc.id), undefined);
  const config = { strategy: 'weighted', autoFailover: true, channels: [{ supplyId: old.id, enabled: true, weight: 70 }, { supplyId: newChannel.id, enabled: true, weight: 30 }] };
  assert.equal(validateRouteConfig(next, svc, config).channels.length, 2);
  next = commitAdminState(next, { type: 'modelOperations', operation: 'serviceRoutePublish', data: { serviceId: svc.id, expectedVersion: 0, sourceVersion: routeSourceVersion(next, svc), config } });
  assert.equal(channelRouteRefs(next, provider(next), channels(next).find(item => item.id === channel.id)).length, 1);
  const before = structuredClone(next), active = serviceRoute(next, svc.id);
  assert.throws(() => change(next, 'channelDisable', channel), /确认/);
  next = change(next, 'channelDisable', channel, { confirmed: true });
  assert.equal(routingStatus(next, svc).label, '需调整');
  assert.deepEqual(serviceRoute(next, svc.id), active);
  assert.deepEqual(next.modelSalePrices, before.modelSalePrices);
  assert.equal(routingChannels(next, svc).find(item => item.id === old.id).available, true);
});

test('cost updates are channel-specific, retain health and expose exact ranges only within identical billing units', async () => {
  const { state, value } = await prepared(); let next = add(state, value), channel = channels(next).find(item => item.name === value.name);
  next = ready(next, channel); channel = channels(next).find(item => item.id === channel.id);
  next=associateChannel(next,channel);
  const svc = service(next), revision = routeSourceVersion(next, svc), before = structuredClone(next);
  next = change(next, 'channelPrice', channel, { scenarios: channelPriceDraft(channel).map(item => ({ ...item, listPrice: '0' })) });
  const edited = channels(next).find(item => item.id === channel.id);
  assert.deepEqual(edited.health, channel.health); assert.equal(edited.enabled, true);
  assert.notEqual(routeSourceVersion(next, svc), revision); untouched(before, next);
  assert.deepEqual(provider(next).catalogPricing, provider(before).catalogPricing);
  const rows = channelPriceRows([{ pricing: { scenarios: [{ name: '输入', unit: '百万 Token', currency: 'CNY', listPrice: 1000000 }] } }, { pricing: { scenarios: [{ name: '输入', unit: '百万 Token', currency: 'CNY', listPrice: 2000000 }, { name: '输入', unit: '千 Token', currency: 'CNY', listPrice: 0 }] } }], {});
  assert.deepEqual(rows.map(item => [item.unit, item.minimum, item.maximum, item.incomplete]), [['百万 Token', 1000000, 2000000, false], ['千 Token', 0, 0, true]]);
});

test('invalid channel edits reject atomically, including foreign keys, URL secrets and malformed cost precision', async () => {
  const { state, value } = await prepared(), before = structuredClone(state);
  for (const patch of [{ name: '' }, { origin: 'fake' }, { upstreamModelId: 'bad model' }, { baseUrl: 'http://public.example.invalid' }, { baseUrl: 'https://u:pass@example.invalid' }, { baseUrl: 'https://example.invalid/?key=secret' }, { protocol: 'invalid' }, { scenarios: [] }, { scenarios: [{ ...price[0], listPrice: '1.0000001' }] }]) assert.throws(() => add(state, { ...value, ...patch }));
  assert.throws(() => add(state, { ...value, modelId: 'unknown-model' }), /不存在/);
  assert.deepEqual(state, before);
});

test('channel configuration saves without key fields and cannot replace or clear existing credentials', async () => {
  const { state, value } = await prepared();
  const withoutKey = value;
  let next = add(state, withoutKey), channel = channels(next).find(item => item.name === value.name);
  assert.deepEqual(channel.endpoint.apiKeys, []);
  next = ready(next, channel); channel = channels(next).find(item => item.id === channel.id);
  const saved = add(next, { ...withoutKey, channelId: channel.id, name: '改名渠道', keyFingerprints: ['foreign'], keepCredentialRef: false });
  const updated = channels(saved).find(item => item.id === channel.id);
  assert.deepEqual(updated.endpoint.apiKeys, channel.endpoint.apiKeys);
  assert.equal(updated.endpoint.credentialRef, channel.endpoint.credentialRef);
  assert.deepEqual(updated.health, channel.health);
  assert.equal(updated.enabled, true);
  const legacy = channels(state)[0];
  const referenced = add(state, { ...withoutKey, channelId: legacy.id, name: '保留凭证引用', protocol: legacy.endpoint.protocol, baseUrl: legacy.endpoint.baseUrl, upstreamModelId: legacy.upstreamModelId, keepCredentialRef: false });
  assert.equal(channels(referenced).find(item => item.id === legacy.id).endpoint.credentialRef, legacy.endpoint.credentialRef);
});

test('editing one channel retains siblings, invalidates only its check and requires shared-address impact confirmation', async () => {
  const { state, value } = await prepared(); let next = add(state, value), added = channels(next).find(item => item.name === value.name);
  next = ready(next, added);
  const current = channels(next).find(item => item.id === added.id), sibling = channels(next).find(item => item.id !== current.id);
  const edited = add(next, { ...value, channelId: current.id, upstreamModelId: 'changed-upstream-model' });
  assert.equal(channels(edited).find(item => item.id === current.id).enabled, false);
  assert.equal(channels(edited).find(item => item.id === current.id).health, null);
  assert.deepEqual(channels(edited).find(item => item.id === sibling.id), sibling);
  const original = channels(next).find(item => item.id === sibling.id), before = structuredClone(next);
  assert.throws(() => add(next, { ...value, channelId: original.id, name: original.name, baseUrl: 'https://shared-edit.example.invalid/v1/chat/completions' }), /确认/);
  assert.deepEqual(next, before);
});

test('channel costs feed the mapped current procurement view without rewriting published or historical price records', async () => {
  const { state } = await prepared(), original = channels(state)[0];
  const before = structuredClone(state), supply = state.modelSupplies.find(item => item.modelId === 'model-1' && item.endpointId === original.endpointId);
  const next = change(state, 'channelPrice', original, { scenarios: price.map(item => ({ ...item, purchasePrice: '999' })) });
  assert.deepEqual(activeSupplyPrice(next, supply.id).items.map(item => item.amount), [1500000, 4000000]);
  assert.deepEqual(next.supplyPrices, before.supplyPrices);
  assert.deepEqual(next.modelSalePrices, before.modelSalePrices);
  assert.deepEqual(next.modelSupplies, before.modelSupplies);
  const svc = service(next), candidate = routingChannels(next, svc).find(item => item.id === supply.id);
  assert.equal(candidate.channelId, original.id); assert.equal(candidate.available, true);
});

test('non-call edits preserve existing endpoint defaults and model checks instead of rewriting shared connections', async () => {
  const { state, value } = await prepared(); let next = add(state, value), channel = channels(next).find(item => item.name === value.name);
  next = ready(next, channel); channel = channels(next).find(item => item.id === channel.id);
  const saved = add(next, { ...value, channelId: channel.id, name: '渠道新名称', origin: 'undisclosed', scenarios: price.map(item => ({ ...item, listPrice: '2' })) });
  assert.deepEqual(saved.endpoints, next.endpoints); assert.deepEqual(saved.modelSupplies, next.modelSupplies);
  assert.equal(channels(saved).find(item => item.id === channel.id).enabled, true);
  assert.deepEqual(channels(saved).find(item => item.id === channel.id).health, channel.health);
});

test('channel maintenance respects role, stale revisions and failed storage without partial endpoint creation', async () => {
  const { state, value } = await prepared(), before = JSON.stringify(state);
  for (const action of [operation('channelSave', value), { type: 'modelOperations', operation: 'providerChannelBatch', data: { providerId, modelId, channels: [value, { ...value, name: '第二渠道', upstreamModelId: 'second-model' }] } }]) {
    assert.throws(() => commitAdminState({ ...state, currentRole: '运维人员' }, action), /无权/);
    assert.throws(() => persistModelAction(state, action, { getItem: () => JSON.stringify({ ...state, revision: state.revision + 1 }), setItem: () => assert.fail() }), /数据已变化/);
    assert.throws(() => persistModelAction(state, action, { getItem: () => before, setItem: () => { throw new Error('quota'); } }), /quota/);
  }
  assert.equal(JSON.stringify(state), before);
});

function createAdminSeed() { const state = baseSeed(); state.modelTemplates.push(...["batch-one","batch-two"].map(code => ({ id: "test-library-" + code, modelId: code, name: code, type: "text", capabilities: {}, profile: {} }))); return state; }
