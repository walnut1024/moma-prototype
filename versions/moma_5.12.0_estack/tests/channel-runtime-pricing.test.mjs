import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAdminState, createAdminSeed, commitAdminState } from '../src/admin-v2/store.js';
import { simulateRequest } from '../src/admin-v2/domain.js';
import { supplierChannelAssociations } from '../src/admin-v2/supplier-resources.js';
import { activeSupplyPrice, priceItems, modelSupplies } from '../src/admin-v2/model-management.js';
import { serviceChannelCosts, availableServiceChannels } from '../src/admin-v2/service-workspace.js';
import { routingServices, routingChannels, validateRouteConfig } from '../src/admin-v2/service-routing.js';
import { connectionKeys, connectionCredentialsReady, connectionFingerprint, connectionBlockReason } from '../src/admin-v2/connection-state.js';
import { catalogueChannels, channelFingerprint, channelQualification } from '../src/admin-v2/provider-channels.js';
import { enterpriseGrant } from '../src/admin-v2/enterprise.js';
import { providerCatalogueIds } from '../src/admin-v2/moma-provider.js';

const providerId = 'provider-moma';
const owner = state => state.providers.find(row => row.id === providerId);
const price = amount => [{ name: '输入 Token', unit: '百万 Token', currency: 'CNY', listPrice: String(amount) }];
const transact = (state, operation, data) => commitAdminState(state, { type: 'modelOperations', operation, data });
const provider = (state, operation, values) => transact(state, 'provider', { operation, objectId: providerId, values });
const mapping = (state, endpointId) => supplierChannelAssociations(state, owner(state), endpointId)[0];
function fixture(count = 2) {
  let state = parseAdminState(null);
  const model = state.models.find(row => row.id === 'model-2');
  model.serviceMode = 'standard'; model.callsEnabled = true; model.listingStatus = '已上架'; model.openScope = 'all';
  state.modelSupplies = state.modelSupplies.filter(row => row.modelId !== model.id);
  const supplies = [];
  for (let index = 0; index < count; index++) {
    const name = `运行报价渠道 ${index + 1}`;
    state = provider(state, 'supplierChannelCreate', { name, interfaceType: 'openai', protocol: 'OpenAI', baseUrl: `https://runtime-${index}.example.invalid/v1`, authMode: 'group', keyGroupId: 'default', models: [{ libraryId: model.id, upstreamModelId: `runtime-model-${index}`, scenarios: price(index + 1) }] });
    const ep = state.endpoints.find(row => row.name === name), row = mapping(state, ep.id), selected = { endpointId: ep.id, associationIds: [row.id] };
    state = provider(state, 'supplierModelsTest', selected); state = provider(state, 'supplierModelsEnable', selected);
    const supply = { id: `runtime-supply-${index}`, modelId: model.id, endpointId: ep.id, catalogueModelId: row.modelId, upstreamModelId: row.upstreamModelId, status: '已启用', validationStatus: '通过', capabilities: { ...model.capabilities } };
    state.modelSupplies.push(supply); supplies.push(supply);
  }
  const liveModel = state.models.find(row => row.id === model.id);
  const sale = { id: 'runtime-sale', modelId: model.id, scope: 'model', serviceModeRevision: liveModel.serviceModeRevision || 0, status: '已发布', version: 1, effectiveAt: new Date(Date.now() - 10000).toISOString(), items: [{ name: '输入', unit: '百万 Token', currency: 'CNY', amount: 8000000 }, { name: '输出', unit: '百万 Token', currency: 'CNY', amount: 16000000 }] };
  state.modelSalePrices.push(sale);
  state.serviceRoutes = state.serviceRoutes.filter(row => row.serviceId !== 'standard:' + model.id);
  state.serviceRoutes.push({ id: 'runtime-route', serviceId: 'standard:' + model.id, activeVersion: 1, versions: [{ version: 1, config: { strategy: 'fixed', autoFailover: true, channels: supplies.slice(0, 2).map(row => ({ supplyId: row.id, enabled: true })) } }] });
  const key = state.apiKeys.find(row => row.status === '有效' && state.grants.some(grant => grant.subjectId === row.id));
  key.modelIds = [...new Set([...key.modelIds, model.id])]; state.limits = state.limits.filter(row => row.scopeId !== key.id);
  const grant = state.grants.find(row => row.subjectId === key.id); grant.limit = 1000000000; grant.used = 0;
  const tenantGrant = enterpriseGrant(state, key.tenantId);
  if (tenantGrant) { tenantGrant.modelIds = [...new Set([...tenantGrant.modelIds, model.id])]; tenantGrant.limit = 1000000000; tenantGrant.used = 0; }
  return { state, modelId: model.id, keyId: key.id, supplies };
}
function publishPrice(state, endpointId, amount, expiresAt = null, effectiveAt) {
  const row = mapping(state, endpointId), data = { providerId, endpointId, associationId: row.id, expectedPriceRevision: row.procurementRevision || 0, scenarios: price(amount), effectiveAt, expiresAt };
  return transact(state, 'channelProcurementPublish', { ...data, confirmed: true });
}
const call = (fixture, state = fixture.state, patch = {}) => simulateRequest(state, { requestId: crypto.randomUUID(), keyId: fixture.keyId, modelId: fixture.modelId, ...patch });

test('versioned procurement drives every commercial gate and expiry cannot restore an older price', t => {
  const base = Date.now(); t.mock.timers.enable({ apis: ['Date'], now: base });
  const f = fixture(1), ep = f.supplies[0].endpointId;
  const state = publishPrice(f.state, ep, 3, new Date(base + 2000).toISOString());
  let row = mapping(state, ep);
  assert.equal(serviceChannelCosts(row)[0].amount, 3000000);
  assert.equal(priceItems(activeSupplyPrice(state, f.supplies[0].id), state.models.find(item => item.id === f.modelId))[0].amount, 3000000);
  assert.equal(availableServiceChannels(state, owner(state), row.modelId).find(item => item.id === row.id).reason, '');
  t.mock.timers.tick(2000); row = mapping(state, ep);
  assert.deepEqual(row.pricing.scenarios, []); assert.deepEqual(serviceChannelCosts(row), []);
  assert.equal(activeSupplyPrice(state, f.supplies[0].id), null);
  assert.equal(availableServiceChannels(state, owner(state), row.modelId).find(item => item.id === row.id).reason, '采购价待配置');
  const service = routingServices(state).find(item => item.modelId === f.modelId);
  assert.equal(routingChannels(state, service)[0].available, false);
  assert.equal(call(f, state).request.httpStatus, 503);
});

test('new requests bind their procurement version while earlier requests keep exact price and sale snapshots', () => {
  const f = fixture(1), ep = f.supplies[0].endpointId;
  const firstState = publishPrice(f.state, ep, 3), first = call(f, firstState);
  assert.equal(first.request.httpStatus, 200);
  const firstSnapshot = structuredClone(first.request.procurementSnapshot);
  assert.ok(first.request.procurementVersionId); assert.equal(firstSnapshot.items[0].amount, 3000000);
  assert.equal(first.request.priceVersionId, 'runtime-sale'); assert.equal(first.request.priceSnapshot.items[0].amount, 8000000);
  const secondState = publishPrice(first.state, ep, 7), second = call(f, secondState);
  assert.equal(second.request.procurementSnapshot.items[0].amount, 7000000);
  assert.notEqual(second.request.procurementVersionId, first.request.procurementVersionId);
  assert.equal(second.request.priceVersionId, first.request.priceVersionId);
  assert.deepEqual(secondState.requests.find(row => row.id === first.request.id).procurementSnapshot, firstSnapshot);
  secondState.modelSalePrices.find(row => row.id === 'runtime-sale').items[0].amount = 1;
  assert.equal(first.request.priceSnapshot.items[0].amount, 8000000);
});

test('expired primary moves only to a previously allowed valid channel and keeps the customer sale price', t => {
  const base = Date.now(); t.mock.timers.enable({ apis: ['Date'], now: base });
  const f = fixture(3), state = publishPrice(f.state, f.supplies[0].endpointId, 3, new Date(base + 1000).toISOString());
  t.mock.timers.tick(1000);
  const result = call(f, state).request;
  assert.equal(result.httpStatus, 200); assert.equal(result.endpointId, f.supplies[1].endpointId);
  assert.equal(result.priceVersionId, 'runtime-sale'); assert.equal(result.procurementSnapshot.items[0].amount, 2000000);
  assert.notEqual(result.endpointId, f.supplies[2].endpointId);
});

test('timeouts cannot fall back outside the published set or use an expired permitted backup', t => {
  const base = Date.now(); t.mock.timers.enable({ apis: ['Date'], now: base });
  const f = fixture(3), state = publishPrice(f.state, f.supplies[1].endpointId, 3, new Date(base + 1000).toISOString());
  t.mock.timers.tick(1000);
  const result = call(f, state, { forceTimeout: true });
  assert.equal(result.request.httpStatus, 504); assert.equal(result.request.attempts.at(-1).error, 'fallback_unavailable');
  assert.ok(!result.request.attempts.some(row => row.endpointId === f.supplies[2].endpointId));
  assert.equal(result.request.attempts[0].procurementSnapshot.supplyId, f.supplies[0].id);
  assert.equal(result.state.grants.find(row => row.subjectId === f.keyId).used, 0);
});

test('each permitted attempt records the selected quote and the final supplier remains traceable', () => {
  const f = fixture(2), result = call(f, f.state, { forceTimeout: true }).request;
  assert.equal(result.httpStatus, 200); assert.equal(result.attempts.length, 2);
  assert.equal(result.attempts[0].procurementSnapshot.items[0].amount, 1000000);
  assert.equal(result.attempts[1].procurementSnapshot.items[0].amount, 2000000);
  assert.equal(result.supplyId, f.supplies[1].id); assert.equal(result.procurementSnapshot.providerId, providerId);
});

test('scheduled procurement is read at request start and does not change an already recorded request', t => {
  const base = Date.now(); t.mock.timers.enable({ apis: ['Date'], now: base });
  const f = fixture(1), state = publishPrice(f.state, f.supplies[0].endpointId, 4, null, new Date(base + 1000).toISOString());
  const first = call(f, state); assert.equal(first.request.procurementSnapshot.items[0].amount, 1000000);
  t.mock.timers.tick(1000);
  const second = call(f, first.state); assert.equal(second.request.procurementSnapshot.items[0].amount, 4000000);
  assert.equal(second.state.requests.find(row => row.id === first.request.id).procurementSnapshot.items[0].amount, 1000000);
});

test('revocation remains a hard stop even if an old toggle re-enables the credential metadata', () => {
  const f = fixture(1), key = owner(f.state).apiKeys.find(row => row.id === owner(f.state).defaultApiKeyId);
  let state = transact(f.state, 'credentialEmergencyRevoke', { providerId, keyId: key.id, expectedFingerprint: key.fingerprint, confirmed: true });
  state = provider(state, 'toggleApiKey', { keyId: key.id, expectedFingerprint: key.fingerprint, enabled: true, confirmed: true });
  const ep = state.endpoints.find(row => row.id === f.supplies[0].endpointId);
  assert.ok(owner(state).apiKeys.find(row => row.id === key.id).revokedAt);
  assert.equal(connectionKeys(ep, owner(state)).length, 0); assert.equal(connectionCredentialsReady(ep, owner(state)), false);
  assert.ok(connectionKeys(ep, owner(state), true).some(row => row.id === key.id));
  ep.status = '运行中'; ep.connectionTest = { result: '通过', fingerprint: connectionFingerprint(ep) };
  for (const supply of state.modelSupplies.filter(row => row.endpointId === ep.id)) { supply.status = '已启用'; supply.validationStatus = '通过'; }
  for (const row of owner(state).catalogConnections.filter(row => row.endpointId === ep.id)) {
    row.enabled = true; row.health = { result: '通过', fingerprint: channelFingerprint({ ...row, endpoint: ep }) };
  }
  assert.match(connectionBlockReason(ep, owner(state)), /撤销/);
  assert.equal(call(f, state).request.httpStatus, 503);
});

test('test history records actual selected credential IDs and configuration revision', () => {
  const f = fixture(1), row = mapping(f.state, f.supplies[0].endpointId);
  assert.deepEqual(row.health.credentialIds, [owner(f.state).defaultApiKeyId]);
  assert.equal(row.health.configurationRevision, 0);
  assert.equal(row.testHistory.at(-1).id, row.health.id);
});

test('a stopped or absent service route prevents calls without deleting supply or customer pricing', () => {
  const f = fixture(1), before = structuredClone(f.state.modelSalePrices);
  f.state.serviceRoutes.find(row => row.id === 'runtime-route').activeVersion = 0;
  assert.equal(call(f).request.httpStatus, 503); assert.deepEqual(f.state.modelSalePrices, before);
  assert.equal(catalogueChannels(f.state, owner(f.state), mapping(f.state, f.supplies[0].endpointId).modelId).length > 0, true);
});

test('explicitly managing a legacy implicit quote preserves its stable identity and actual procurement baseline', t => {
  const base = Date.now(); t.mock.timers.enable({ apis: ['Date'], now: base });
  const initial = createAdminSeed(), source = modelSupplies(initial, 'catalog-demo-kimi').find(row => providerCatalogueIds(row.provider).includes(row.catalogueModelId || row.upstreamModelId));
  const model = initial.models.find(row => row.id === source.modelId), originalCost = priceItems(activeSupplyPrice(initial, source.id), model);
  const originalMapping = supplierChannelAssociations(initial, source.provider, source.endpointId).find(row => row.upstreamModelId === source.upstreamModelId);
  assert.ok(originalCost.length); assert.ok(!source.provider.catalogConnections?.some(row => row.id === originalMapping.id));
  const data = { providerId: source.provider.id, endpointId: source.endpointId, associationId: originalMapping.id, expectedPriceRevision: 0, scenarios: price(9), effectiveAt: new Date(base + 1000).toISOString(), expiresAt: new Date(base + 2000).toISOString() };
  const draft = transact(initial, 'channelProcurementPublish', { ...data, confirmed: true });
  const stored = draft.providers.find(row => row.id === source.provider.id).catalogConnections.find(row => row.id === originalMapping.id);
  assert.equal(stored.endpointId, source.endpointId); assert.equal(stored.upstreamModelId, source.upstreamModelId);
  assert.deepEqual(priceItems(activeSupplyPrice(draft, source.id), model), originalCost);
  for (const field of ['modelSupplies', 'endpoints', 'models', 'modelSalePrices', 'supplyPrices', 'serviceRoutes']) assert.deepEqual(draft[field], initial[field], field);
  const published = draft;
  assert.deepEqual(priceItems(activeSupplyPrice(published, source.id), model), originalCost);
  t.mock.timers.tick(1000);
  assert.equal(priceItems(activeSupplyPrice(published, source.id), model)[0].amount, 9000000);
  t.mock.timers.tick(1000);
  assert.equal(activeSupplyPrice(published, source.id), null);
  const provider = published.providers.find(row => row.id === source.provider.id);
  const channel = availableServiceChannels(published, provider, originalMapping.modelId).find(row => row.id === originalMapping.id);
  assert.equal(channel.reason, '采购价待配置');
  assert.ok(published.supplyPrices.some(row => row.supplyId === source.id));
});

test('manual diagnostic failure blocks new activation and publication while frozen live qualification keeps serving', () => {
  const f = fixture(1), ep = f.supplies[0].endpointId, original = mapping(f.state, ep), qualified = structuredClone(original.qualification);
  const failed = provider(f.state, 'supplierModelsTest', { endpointId: ep, associationIds: [original.id], scenarios: { [original.id]: 'unauthorized' } });
  const current = mapping(failed, ep), service = routingServices(failed).find(row => row.modelId === f.modelId);
  assert.equal(current.health.result, '失败'); assert.deepEqual(current.qualification, qualified);
  assert.equal(routingChannels(failed, service)[0].available, false);
  assert.equal(routingChannels(failed, service, Date.now(), { runtime: true })[0].available, true);
  assert.throws(() => provider(failed, 'supplierModelsEnable', { endpointId: ep, associationIds: [original.id] }), /健康检测/);
  assert.throws(() => validateRouteConfig(failed, service, { strategy: 'fixed', autoFailover: true, channels: [{ supplyId: f.supplies[0].id, enabled: true, weight: 100 }] }), /密钥|健康|检测|渠道/);
  assert.equal(call(f, failed).request.httpStatus, 200);
  const connectionFailed = provider(f.state, 'supplierModelTest', { endpointId: ep, associationId: original.id, modelId: original.modelId, scenario: '鉴权失败' });
  const currentEndpoint = connectionFailed.endpoints.find(row => row.id === ep);
  assert.equal(currentEndpoint.connectionTest.result, '失败');
  assert.equal(currentEndpoint.connectionQualification.result, '通过');
  assert.equal(call(f, connectionFailed).request.httpStatus, 200);
});

test('an existing enabled matching success may be retained on explicit retest without fabricating evidence', () => {
  const f = fixture(1), ep = f.supplies[0].endpointId, raw = owner(f.state).catalogConnections.find(row => row.endpointId === ep);
  delete raw.qualification; delete f.state.endpoints.find(row => row.id === ep).connectionQualification;
  const projected = mapping(f.state, ep), before = structuredClone(f.state), evidence = structuredClone(projected.health);
  assert.equal(channelQualification(projected), projected.health); assert.deepEqual(f.state, before);
  assert.equal(channelQualification({ ...projected, enabled: false }), null);
  const failed = provider(f.state, 'supplierModelsTest', { endpointId: ep, associationIds: [projected.id], scenarios: { [projected.id]: 'timeout' } });
  assert.equal(mapping(failed, ep).qualification.id, evidence.id);
  assert.equal(mapping(failed, ep).qualification.testedAt, evidence.testedAt);
  assert.equal(call(f, failed).request.httpStatus, 200);
});

test('a pending test blocks new enable and route publication while existing qualified requests continue', () => {
  const f = fixture(1), ep = f.state.endpoints.find(row => row.id === f.supplies[0].endpointId), row = mapping(f.state, ep.id);
  ep.serverTestJobs = [{ operationId: 'pending-mock', batchId: 'mock-batch', signature: connectionFingerprint(ep), associationIds: [row.id] }];
  const service = routingServices(f.state).find(item => item.modelId === f.modelId);
  assert.equal(routingChannels(f.state, service)[0].reason, '当前模型测试尚未完成');
  assert.throws(() => provider(f.state, 'supplierModelsEnable', { endpointId: ep.id, associationIds: [row.id] }), /尚未完成/);
  assert.throws(() => provider(f.state, 'supplierChannelEnable', { endpointId: ep.id }), /尚未完成/);
  assert.throws(() => validateRouteConfig(f.state, service, { strategy: 'fixed', autoFailover: true, channels: [{ supplyId: f.supplies[0].id, enabled: true, weight: 100 }] }), /测试尚未完成/);
  assert.equal(call(f).request.httpStatus, 200);
  ep.serverTestJobs[0].receivedAt = new Date().toISOString();
  assert.equal(routingChannels(f.state, service)[0].available, true);
});

// These scenarios exercise the platform call path, not independent chart fixtures.
import { businessFacts, businessSummary, businessGroups, supplyGroups, operationFacts, analysisFilters } from '../src/admin-v2/operations-analysis.js';
import { usagePreset } from '../src/admin-v2/usage-analysis.js';
const measured = (state, request) => businessFacts(state, operationFacts({...state,requests:[request]},usagePreset('today'),analysisFilters()))[0];

test('operational revenue follows the unified service while procurement follows the selected channel', t => {
 const base=Date.now();t.mock.timers.enable({apis:['Date'],now:base});const f=fixture(2);
 const s=publishPrice(f.state,f.supplies[0].endpointId,3,new Date(base+1000).toISOString());
 const first=call(f,s,{usage:{input:1000000,output:0,cached:0}});t.mock.timers.tick(1000);
 const second=call(f,first.state,{usage:{input:1000000,output:0,cached:0}});t.mock.timers.tick(1);
 const facts=[measured(second.state,first.request),measured(second.state,second.request)];
 assert.deepEqual(facts.map(r=>r.sale?.amount),[8,8]);assert.deepEqual(facts.map(r=>r.cost?.amount),[3,2]);
 assert.equal(businessGroups(second.state,facts).length,1);assert.equal(businessSummary(facts,'CNY').profit,11);
 assert.equal(first.request.serviceId,second.request.serviceId);assert.notEqual(first.request.endpointId,second.request.endpointId);
});
test('a failover keeps known service revenue but leaves total procurement and profit pending if the failed attempt lacks usage', t => {
 const base=Date.now();t.mock.timers.enable({apis:['Date'],now:base});const f=fixture(2),result=call(f,f.state,{forceTimeout:true,usage:{input:1000000,output:0,cached:0}});t.mock.timers.tick(1);
 const fact=measured(result.state,result.request);assert.equal(fact.sale.amount,8);assert.equal(fact.cost,null);assert.equal(fact.profit,null);assert.equal(fact.purchases.length,2);assert.equal(fact.purchases[0].cost,null);assert.equal(fact.purchases[1].cost.amount,2);
 const summary=businessSummary([fact],'CNY');assert.equal(summary.income,8);assert.equal(summary.cost,2);assert.equal(summary.profit,null);assert.equal(summary.costPending,1);
 const channels=supplyGroups(result.state,operationFacts({...result.state,requests:[result.request]},usagePreset('today'),analysisFilters()),true);assert.equal(channels.reduce((n,r)=>n+r.failedAttempts,0),1);assert.equal(channels.reduce((n,r)=>n+r.calls,0),1);
});
test('operating history uses recorded sales and procurement snapshots after both prices change', t => {
 const base=Date.now();t.mock.timers.enable({apis:['Date'],now:base});const f=fixture(1),s=publishPrice(f.state,f.supplies[0].endpointId,3);
 const first=call(f,s,{usage:{input:1000000,output:0,cached:0}});t.mock.timers.tick(1000);
 const next=publishPrice(first.state,f.supplies[0].endpointId,7);next.modelSalePrices.push({...next.modelSalePrices.find(p=>p.id==='runtime-sale'),id:'runtime-sale-v2',version:2,effectiveAt:new Date(Date.now()).toISOString(),items:[{name:'输入',unit:'百万 Token',currency:'CNY',amount:12000000},{name:'输出',unit:'百万 Token',currency:'CNY',amount:16000000}]});
 const second=call(f,next,{usage:{input:1000000,output:0,cached:0}});t.mock.timers.tick(1);
 for(const price of second.state.modelSalePrices)price.items?.forEach(item=>{item.amount=99000000;});
 const facts=[measured(second.state,first.request),measured(second.state,second.request)];assert.deepEqual(facts.map(r=>r.sale?.amount),[8,12]);assert.deepEqual(facts.map(r=>r.cost?.amount),[3,7]);assert.equal(businessSummary(facts,'CNY').profit,10);
});
test('gateway checks are operational tests and cannot inflate accrued customer revenue', t => {
 const base=Date.now();t.mock.timers.enable({apis:['Date'],now:base});const f=fixture(1),result=call(f,f.state,{purpose:'gateway-test'});t.mock.timers.tick(1);
 assert.equal(businessFacts(result.state,operationFacts({...result.state,requests:[result.request]},usagePreset('today'),analysisFilters())).length,0);
});
