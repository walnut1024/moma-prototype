import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAdminState, createAdminSeed, commitAdminState } from '../src/admin-v2/store.js';
import { withAdminSession } from './admin-session-fixture.mjs';
import { planProviderIntake, exportProviderJson, PROVIDER_JSON_TEMPLATE } from '../src/admin-v2/provider-intake.js';
import { providerRemovalPlan } from '../src/admin-v2/provider-removal.js';
import { routingServices, routingChannels, routeSourceVersion } from '../src/admin-v2/service-routing.js';
import { serviceDirectoryRows } from '../src/admin-v2/service-directory.js';
import { connectionFingerprint } from '../src/admin-v2/connection-state.js';

const op = (state, operation, data) => commitAdminState(state, { type: 'modelOperations', operation, data });
const document = () => structuredClone(PROVIDER_JSON_TEMPLATE);
function intake(state, file = document()) { return op(state, 'providerIntake', { document: file, confirmed: true }); }
function removal(state, target, operation = 'providerRemovalCommit') {
  return op(state, operation, { target, expectedSignature: providerRemovalPlan(state, target).signature, confirmed: true });
}
function fixture() {
  const before = withAdminSession(parseAdminState(null)), file = document();
  file.provider.models[0].mappings[0].procurement = { scenarios: [{ name: '输入 Token', listPrice: '0', unit: '百万 Token', currency: 'CNY' }] };
  const state = intake(before, file), provider = state.providers.find(row => row.code === file.provider.code);
  return { before, state, provider, target: { providerId: provider.id } };
}

test('intake stores one complete provider atomically, preserves zero cost, capacity and unrelated materials', () => {
  const { before, state, provider } = fixture(), channel = provider.catalogConnections[0];
  assert.deepEqual(before.modelTemplates, state.modelTemplates.filter(row => before.modelTemplates.some(old => old.id === row.id)));
  assert.equal(channel.capacityLimits.tpm, 10000000);
  assert.equal(channel.procurementVersions.at(-1).pricing.scenarios[0].listPrice, 0);
  assert.equal(channel.enabled, false);
  assert.equal(state.endpoints.find(row => row.id === channel.endpointId).status, '草稿');
  assert.deepEqual(state.models, before.models);
  assert.deepEqual(state.modelSalePrices, before.modelSalePrices);
  assert.equal(state.providers.filter(row => row.code === 'example-provider').length, 1);
  assert.throws(() => intake(state), /名称已存在|编码/);
});

test('JSON validation rejects foreign connections, duplicate models, invalid capacity and secrets without partial state', () => {
  const state = withAdminSession(parseAdminState(null)), before = structuredClone(state);
  for (const change of [
    file => { file.provider.models[0].mappings[0].connection_id = 'missing'; },
    file => { file.provider.models.push(structuredClone(file.provider.models[0])); },
    file => { file.provider.models[0].mappings[0].capacity_limits.rpm = -1; },
    file => { file.provider.connections[0].api_key = 'not-allowed'; },
  ]) {
    const file = document(); change(file);
    const plan = planProviderIntake(state, file);
    assert.ok(plan.errors.length);
    assert.throws(() => intake(state, file));
    assert.deepEqual(state, before);
  }
  assert.throws(() => planProviderIntake(state, { provider: { ...document().provider, id: 'foreign-id' } }), /不填写本地/);
  assert.throws(() => intake({ ...state, currentRole: '只读审计员' }), /无权/);
});

test('provider removal preserves materials, purchase versions, audit history and allows same-code fresh intake', () => {
  const { state, provider, target } = fixture(), before = structuredClone(state), quote = provider.catalogConnections[0].procurementVersions;
  assert.equal(providerRemovalPlan(state, target).ready, true);
  const next = removal(state, target), archived = next.providers.find(row => row.id === provider.id);
  assert.ok(archived.deletedAt);
  assert.deepEqual(next.modelTemplates, before.modelTemplates);
  assert.deepEqual(archived.catalogConnections[0].procurementVersions, quote);
  for (const key of ['models', 'modelSalePrices', 'supplyPrices', 'serviceRoutes']) assert.deepEqual(next[key], before[key]);
  for (const audit of before.audits) assert.deepEqual(next.audits.find(row => row.id === audit.id), audit);
  const exported = exportProviderJson(state, provider);
  assert.equal(exported.provider.id, undefined);
  const restored = intake(next, exported), owner = restored.providers.find(row => row.id === provider.id);
  assert.equal(owner.deletedAt, null);
  assert.equal(owner.catalogConnections.filter(row => !row.deletedAt).length, 1);
  assert.equal(owner.catalogConnections.filter(row => row.deletedAt).length, 1);
  assert.deepEqual(owner.catalogConnections.find(row => row.deletedAt).procurementVersions, quote);
  assert.equal(owner.catalogConnections.find(row => !row.deletedAt).enabled, false);
  assert.deepEqual(restored.modelTemplates, next.modelTemplates);
});

test('two-step removal stops and withdraws the selected offer, not sibling channels; stale commits fail', () => {
  const { state, provider, target } = fixture(), model = state.models[0], channel = provider.catalogConnections[0];
  Object.assign(model, { serviceMode: 'provider', callsEnabled: true, listingStatus: '已上架', releaseStage: 'formal',
    serviceProviders: [{ providerId: provider.id, channelId: channel.id, channelName: '目标渠道', callId: 'target-call', status: '已关联', callsEnabled: true, listingStage: 'gray' },
      { providerId: 'other-provider', channelId: 'other-channel', callId: 'sibling-call', status: '已关联', callsEnabled: true, listingStage: 'formal' }] });
  const sibling = structuredClone(model.serviceProviders[1]), master = structuredClone(state.modelTemplates);
  assert.equal(providerRemovalPlan(state, target).ready, false);
  assert.throws(() => removal(state, target), /先停服/);
  const prepared = removal(state, target, 'providerRemovalPrepare'), plan = providerRemovalPlan(prepared, target);
  assert.equal(plan.ready, true);
  assert.equal(prepared.models[0].serviceProviders[0].callsEnabled, false);
  assert.equal(prepared.models[0].serviceProviders[0].listingStage, 'withdrawn');
  assert.equal(prepared.models[0].callsEnabled, true);
  assert.deepEqual(prepared.models[0].serviceProviders[1], sibling);
  assert.equal(prepared.models[0].listingStatus, '已上架');
  const concurrent = structuredClone(prepared); concurrent.models[0].serviceProviders[0].callsEnabled = true;
  assert.throws(() => op(concurrent, 'providerRemovalCommit', { target, expectedSignature: plan.signature, confirmed: true }), /变化/);
  const next = removal(prepared, target);
  assert.equal(next.models[0].serviceProviders[0].channelUnavailableReason, '渠道未接入');
  assert.deepEqual(next.models[0].serviceProviders[1], sibling);
  assert.deepEqual(next.modelTemplates, master);
  assert.equal(serviceDirectoryRows([next.models[0]], next).find(row => row.callId === 'target-call').stopReason, '渠道未接入');
  const resumed = structuredClone(next.models[0]); resumed.serviceProviders[0].callsEnabled = true;
  assert.equal(serviceDirectoryRows([resumed], next).find(row => row.callId === 'target-call').stopReason, '');
});

test('removing one shared connection mapping keeps siblings; pending tests block both steps', () => {
  const state = withAdminSession(parseAdminState(null)), file = document();
  file.provider.models.push({ ...structuredClone(file.provider.models[0]), canonical_slug: 'another-model', model_name: '另一个模型',
    mappings: [{ connection_id: 'openai', upstream_model_id: 'another-model' }] });
  const next = intake(state, file), provider = next.providers.find(row => row.code === 'example-provider');
  const [channel, sibling] = provider.catalogConnections, endpoint = next.endpoints.find(row => row.id === channel.endpointId);
  const target = { providerId: provider.id, endpointId: endpoint.id, associationId: channel.id };
  endpoint.serverTestJobs = [{ operationId: 'pending', associationIds: [channel.id] }];
  assert.ok(providerRemovalPlan(next, target).blockers.length);
  assert.throws(() => removal(next, target), /未完成检测/);
  endpoint.serverTestJobs = [];
  const removed = removal(next, target);
  assert.equal(removed.endpoints.find(row => row.id === endpoint.id).deletedAt, undefined);
  assert.deepEqual(removed.providers.find(row => row.id === provider.id).catalogConnections.find(row => row.id === sibling.id), sibling);
});

test('unified service retains a validated alternative route and immutable old versions', () => {
  let state = withAdminSession(createAdminSeed());
  state.routes = []; state.fallbacks = [];
  const model = state.models.find(row => row.id === 'model-1'); model.serviceMode = 'standard'; model.callsEnabled = true; model.listingStatus = '已上架';
  for (const endpoint of state.endpoints.filter(e => state.modelSupplies.some(s => s.modelId === model.id && s.endpointId === e.id))) {
    endpoint.baseUrl = endpoint.baseUrl.replace(/\/$/, '') + '/chat/completions';
    endpoint.connectionTest = { fingerprint: connectionFingerprint(endpoint), result: '通过', testedAt: '2026-01-01' };
  }
  let service = routingServices(state).find(row => row.modelId === model.id);
  const channels = routingChannels(state, service).filter(row => row.available);
  assert.ok(channels.length >= 2);
  const config = { strategy: 'weighted', channels: channels.slice(0, 2).map(row => ({ supplyId: row.id, enabled: true, weight: 50 })) };
  state = op(state, 'serviceRoutePublish', { serviceId: service.id, expectedVersion: 0, sourceVersion: routeSourceVersion(state, service), config });
  const old = structuredClone(state.serviceRoutes.find(r => r.serviceId === service.id).versions);
  const target = { providerId: channels[0].provider.id };
  const prepared = removal(state, target, 'providerRemovalPrepare');
  assert.equal(providerRemovalPlan(prepared, target).ready, true);
  assert.equal(prepared.models.find(row => row.id === model.id).callsEnabled, true);
  const route = prepared.serviceRoutes.find(row => row.serviceId === service.id);
  assert.deepEqual(route.versions.slice(0, old.length), old);
  assert.equal(route.versions.at(-1).config.channels.length, 1);
  const next = removal(prepared, target);
  assert.equal(next.models.find(row => row.id === model.id).callsEnabled, true);
  assert.deepEqual(next.modelTemplates, state.modelTemplates);
});

test('large intake previews 500 models against one connection without mutating the source state', () => {
  const state = withAdminSession(parseAdminState(null)), before = JSON.stringify(state), file = document();
  file.provider.models = Array.from({ length: 500 }, (_, i) => ({ canonical_slug: 'bulk-' + i, model_name: '批量模型 ' + i, model_type: 'text', model_info: {},
    mappings: [{ connection_id: 'openai', upstream_model_id: 'bulk-' + i }] }));
  const plan = planProviderIntake(state, file);
  assert.deepEqual(plan.errors, []);
  assert.equal(plan.modelCount, 500); assert.equal(plan.channels.length, 500); assert.equal(plan.connections.length, 1);
  assert.equal(JSON.stringify(state), before);
  assert.equal(plan.changes.filter(row => row.collection === 'providers').length, 1);
});

test('removing a registered supplier model preserves its provider, connection and model material', () => {
  const { state, provider } = fixture();
  const channel = provider.catalogConnections[0];
  const next = removal(state, { providerId: provider.id, catalogueId: channel.modelId });
  const saved = next.providers.find(row => row.id === provider.id);
  assert.ok(saved.removedCatalogModelIds.includes(channel.modelId));
  assert.ok(!saved.deletedAt);
  assert.ok(!next.endpoints.find(row => row.id === channel.endpointId).deletedAt);
  assert.deepEqual(next.modelTemplates, state.modelTemplates);
});

test('supplier Excel rows preserve protocol-specific URLs through registration and edit', async () => {
  const { excelOffers, offerHeaders } = await import('../src/admin-v2/supplier-offer-fields.js');
  const { state, provider } = fixture();
  const rows = [offerHeaders,
    ['供应名称','vendor-chat','offer-test','文本','OpenAI Chat Completions','https://chat.example/v1/chat/completions'],
    ['供应名称','vendor-responses','offer-test','文本','OpenAI Responses','https://responses.example/v1/responses']];
  const offers = excelOffers(rows,provider);
  const save = (state,offers) => op(state,'supplierOffersSave',{providerId:provider.id,offers});
  const saved = save(state,offers);
  const entry = state => state.providers.find(p => p.id === provider.id).catalogModels.find(m => m.modelId === 'offer-test');
  assert.deepEqual(entry(saved).offerFields,offers[0]);
  const edited = save(saved,[{...offers[0],name:'新名称'}]);
  assert.equal(entry(edited).offerFields.name,'新名称');
  assert.equal(entry(edited).libraryId,entry(saved).libraryId);
  rows[2][5] = rows[1][5];
  assert.throws(() => excelOffers(rows,provider),/匹配/);
});
