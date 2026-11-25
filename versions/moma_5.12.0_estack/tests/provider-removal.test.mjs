import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAdminState, createAdminSeed, commitAdminState } from '../src/admin-v2/store.js';
import { withAdminSession } from './admin-session-fixture.mjs';
import { modelCatalogue } from '../src/admin-v2/model-library.js';
import { providerRemovalPlan } from '../src/admin-v2/provider-removal.js';
import { routingServices, routingChannels, routeSourceVersion } from '../src/admin-v2/service-routing.js';
import { serviceDirectoryRows } from '../src/admin-v2/service-directory.js';
import { connectionFingerprint } from '../src/admin-v2/connection-state.js';

const op = (state, operation, data) => commitAdminState(state, { type: 'modelOperations', operation, data });
function removal(state, target, operation = 'providerRemovalCommit') {
  return op(state, operation, { target, expectedSignature: providerRemovalPlan(state, target).signature, confirmed: true });
}
const profile = { name: '删除测试服务商', code: 'provider-removal-fixture', sourceType: 'thirdParty' };
function fixture(modelCount = 1) {
  const base = withAdminSession(parseAdminState(null));
  const created = op(base, 'provider', { operation: 'create', values: profile });
  const providerId = created.providers.find(row => row.code === profile.code).id;
  const owner = state => state.providers.find(row => row.id === providerId);
  const models = modelCatalogue(base).filter(row => row.type === 'text').slice(0, modelCount)
    .map((row, index) => ({ libraryId: row.id, upstreamModelId: 'fixture-model-' + index }));
  const connected = op(created, 'provider', { operation: 'supplierChannelCreate', objectId: providerId, values: {
    name: '删除测试连接', baseUrl: 'https://api.example.com/v1', protocol: 'OpenAI', interfaceType: 'openai',
    authMode: 'inherit', models,
  } });
  const { id: associationId, endpointId } = owner(connected).catalogConnections[0];
  const channel = { providerId, endpointId, associationId };
  const priced = op(connected, 'channelProcurementPublish', { ...channel, expectedPriceRevision: 0, confirmed: true,
    scenarios: [{ name: '输入 Token', listPrice: '0', unit: '百万 Token', currency: 'CNY' }],
  });
  const state = op(priced, 'channelCapacitySave', { ...channel, expectedCapacityRevision: 0, limits: { tpm: 10000000 } });
  return { state, provider: owner(state), target: { providerId } };
}

test('the built-in MoMA provider cannot be removed as a whole', () => {
  const { state } = fixture();
  const target = { providerId: 'provider-moma' };
  const before = structuredClone(state);
  assert.throws(() => providerRemovalPlan(state, target), /内置服务商不可删除/);
  for (const operation of ['providerRemovalPrepare', 'providerRemovalCommit']) {
    assert.throws(() => op(state, operation, { target, confirmed: true }), /内置服务商不可删除/);
  }
  assert.deepEqual(state, before);
});

test('provider removal preserves materials, purchase versions and audit history', () => {
  const { state, provider, target } = fixture(), before = structuredClone(state), quote = provider.catalogConnections[0].procurementVersions;
  assert.equal(providerRemovalPlan(state, target).ready, true);
  const next = removal(state, target), archived = next.providers.find(row => row.id === provider.id);
  assert.ok(archived.deletedAt);
  assert.deepEqual(next.modelTemplates, before.modelTemplates);
  assert.deepEqual(archived.catalogConnections[0].procurementVersions, quote);
  for (const key of ['models', 'modelSalePrices', 'supplyPrices', 'serviceRoutes']) assert.deepEqual(next[key], before[key]);
  for (const audit of before.audits) assert.deepEqual(next.audits.find(row => row.id === audit.id), audit);
});

test('two-step removal stops and withdraws the selected offer, not sibling channels; stale commits fail', () => {
  const { state, provider, target } = fixture(), model = state.models[0], channel = provider.catalogConnections[0];
  Object.assign(model, { serviceMode: 'provider', callsEnabled: true, listingStatus: '已上架', releaseStage: 'formal',
    serviceProviders: [{ providerId: provider.id, channelId: channel.id, channelName: '目标连接', callId: 'target-call', status: '已关联', callsEnabled: true, listingStage: 'gray' },
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
  assert.equal(next.models[0].serviceProviders[0].channelUnavailableReason, '连接未接入');
  assert.deepEqual(next.models[0].serviceProviders[1], sibling);
  assert.deepEqual(next.modelTemplates, master);
  assert.equal(serviceDirectoryRows([next.models[0]], next).find(row => row.callId === 'target-call').stopReason, '连接未接入');
  const resumed = structuredClone(next.models[0]); resumed.serviceProviders[0].callsEnabled = true;
  assert.equal(serviceDirectoryRows([resumed], next).find(row => row.callId === 'target-call').stopReason, '');
});

test('removing one shared connection mapping keeps siblings; pending tests block both steps', () => {
  const { state: next, provider } = fixture(2);
  const [channel, sibling] = provider.catalogConnections, endpoint = next.endpoints.find(row => row.id === channel.endpointId);
  const target = { providerId: provider.id, endpointId: endpoint.id, associationId: channel.id };
  endpoint.serverTestJobs = [{ operationId: 'pending', associationIds: [channel.id] }];
  assert.ok(providerRemovalPlan(next, target).blockers.length);
  assert.throws(() => removal(next, target, 'providerRemovalPrepare'), /未完成检测/);
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

test('removing a registered supplier model preserves its provider, connection and model material', () => {
  const { state, provider } = fixture();
  const channel = provider.catalogConnections[0];
  const next = op(state, 'provider', { operation: 'catalogueRemove', objectId: provider.id,
    values: { modelId: channel.modelId, expectedUpdatedAt: provider.updatedAt ?? null, confirmed: true } });
  const saved = next.providers.find(row => row.id === provider.id);
  assert.ok(saved.removedCatalogModelIds.includes(channel.modelId));
  assert.ok(!saved.deletedAt);
  assert.ok(!next.endpoints.find(row => row.id === channel.endpointId).deletedAt);
  assert.deepEqual(saved.catalogConnections, provider.catalogConnections);
  assert.deepEqual(next.modelTemplates, state.modelTemplates);
});

test('deleting a connection preserves its supplier registration and procurement history', () => {
  const { state, provider } = fixture();
  const channel = provider.catalogConnections[0];
  const next = removal(state, { providerId: provider.id, endpointId: channel.endpointId });
  const owner = next.providers.find(row => row.id === provider.id);
  assert(next.endpoints.find(row => row.id === channel.endpointId).deletedAt);
  assert.deepEqual(owner.catalogModelIds, provider.catalogModelIds);
  assert.deepEqual(owner.catalogModels, provider.catalogModels);
  assert.deepEqual(owner.removedCatalogModelIds, provider.removedCatalogModelIds);
  assert.deepEqual(owner.catalogConnections.find(row => row.id === channel.id).procurementVersions, channel.procurementVersions);
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
