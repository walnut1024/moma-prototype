import test from 'node:test';
import assert from 'node:assert/strict';
import { withAdminSession } from './admin-session-fixture.mjs';
import { parseAdminState, commitAdminState, persistModelAction, serializeAdminState, STORAGE_KEY } from '../src/admin-v2/store.js';
import { guidedOnboarding, pendingGuidedOnboardings } from '../src/admin-v2/guided-onboarding.js';
import { providerApiKeysDraft } from '../src/admin-v2/provider-management.js';
import { connectionFingerprint } from '../src/admin-v2/connection-state.js';
import { onboardingApi, prepareServerChannel } from '../src/admin-v2/onboarding-client.js';
import { setMockScenario, setMockRuntimeState, getMockServiceSnapshots } from '../src/admin-v2/mock-onboarding-service.js';
import { serviceModelDraft, modelAuthors } from '../src/admin-v2/model-profile.js';
import { modelSaleRevision, providerPriceRevision } from '../src/admin-v2/service-workspace.js';
import { routingServices, routeSourceVersion, emptyRouteConfig } from '../src/admin-v2/service-routing.js';
import { platformCandidatePlan, runPlatformTrial, recoverPlatformTrial } from '../src/admin-v2/platform-service-client.js';
import { channelFingerprint } from '../src/admin-v2/provider-channels.js';

const run = (state, operation, data, modelId) => { const next = commitAdminState(state, { type: 'modelOperations', operation, data, modelId }); setMockRuntimeState(next); return next; };
const costs = [{ name: '输入 Token', unit: '百万 Token', currency: 'CNY', condition: '', listPrice: '1' }, { name: '输出 Token', unit: '百万 Token', currency: 'CNY', condition: '', listPrice: '0' }];
function environment(t) {
  const records = new Map(), storage = { getItem: key => records.get(key) ?? null, setItem: (key, value) => records.set(key, value), removeItem: key => records.delete(key) };
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  t.after(() => descriptor ? Object.defineProperty(globalThis, 'localStorage', descriptor) : delete globalThis.localStorage);
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: Date.parse('2026-10-31T04:00:00Z') });
  t.mock.method(globalThis, 'fetch', () => assert.fail('Local onboarding must not call an upstream'));
  setMockScenario('success');
  setMockRuntimeState(null); t.after(() => setMockRuntimeState(null));
  return storage;
}
async function connected(t, {supplyOnly=false,intent='onboard',baseState,providerId,libraryId}={}) {
  let state = baseState || withAdminSession(parseAdminState(null));
  const value = { newProvider: { name: '接入流程验证供应商' }, name: '新手渠道', interfaceType: 'openai', baseUrl: 'https://novice.example.invalid/v1', authMode: 'group', keyGroupId: 'default', taskUrls: {}, adapterOptions: {} };
  if(providerId){delete value.newProvider;value.providerId=providerId;value.name='新增供应'+crypto.randomUUID().slice(0,8);}
  const rows = [{ id: 'one-model', newModel: { modelId: 'guided-chat-v1', name: '接入流程验证模型', type: 'text' }, upstreamModelId: 'vendor/actual-chat', selected: true, confirmed: true, scenarios: costs }];
  if(libraryId){delete rows[0].newModel;rows[0].libraryId=libraryId;rows[0].upstreamModelId='vendor/backup-chat';}
  state = run(state, 'channelDraftSave', { guided: true, value, rows, step: 1, intent });
  const id = state.audits[0].objectId;
  state = run(state, 'channelQuickCreate', { draftId: id, expectedDraftRevision: 1, ...(providerId?{providerId}:{newProvider:value.newProvider,newApiKey:(await providerApiKeysDraft(['mock-guided-onboarding-only-key'])).apiKeys[0]}), values: { ...value, models: rows.map(({ libraryId,newModel, upstreamModelId, scenarios }) => ({ libraryId,newModel, upstreamModelId, scenarios })) } });
  let context = guidedOnboarding(state, id);
  assert.equal(context.step, 1); assert.equal(context.draft.createdAssociationIds.length, 1);
  const channel = await prepareServerChannel(context.provider, context.endpoint);
  const request = { operationId: crypto.randomUUID(), channelId: channel.id, models: [{ id: context.master.id, associationId: context.association.id, upstreamModelId: context.association.upstreamModelId, type: 'text' }] };
  const job = { providerId: context.provider.id, endpointId: context.endpoint.id, operationId: request.operationId, serverChannelId: channel.id, signature: connectionFingerprint(context.endpoint), associationIds: [context.association.id], request };
  state = run(state, 'channelTestEvidenceJob', job);
  const started = await onboardingApi('/tests', { method: 'POST', body: request });
  state = run(state, 'channelTestEvidenceJob', { ...job, batchId: started.id }); t.mock.timers.tick(2000);
  const batch = await onboardingApi(`/tests/${started.id}`); assert.equal(batch.items[0].status, 'passed');
  state = run(state, 'channelTestEvidenceReceipt', { providerId: context.provider.id, endpointId: context.endpoint.id, batch });
  assert.equal(guidedOnboarding(state, id).step, 1, 'test does not imply enable');
  context = guidedOnboarding(state, id);
  state = run(state, 'provider', { operation: 'supplierModelsEnable', objectId: context.provider.id, values: { endpointId: context.endpoint.id, associationIds: [context.association.id] } });
  context = guidedOnboarding(state, id);
  assert.equal(context.step, 1);assert.equal(context.supplyReady,false);
  state=run(state,'channelProcurementPublish',{confirmed:true,providerId:context.provider.id,endpointId:context.endpoint.id,associationId:context.association.id,expectedPriceRevision:0,scenarios:costs,effectiveAt:new Date().toISOString()});
  context=guidedOnboarding(state,id);
  context=guidedOnboarding(state,id);
  assert.equal(context.step, intent==='reserve'?1:2); if(!libraryId)assert.equal(context.model, undefined);
  if(supplyOnly)return {state,id};
  const values = { ...serviceModelDraft(context.master), modelId: 'guided-public-chat', author: modelAuthors(state)[0], releaseDate: '2026-10-31', inputModalities: ['文本'], outputModalities: ['文本'],tasks:['对话'], description: '新手完成接入的文本模型。' };
  state = run(state, 'guidedProfileSave', { draftId: id, expectedDraftRevision: context.draft.draftRevision, values });
  context = guidedOnboarding(state, id);
  assert.equal(context.model.templateId, context.master.id);
  assert.equal(context.model.listingStatus, '已下架');
  return { state, id };
}
function sales(state, id, mode = 'standard') {
  const { draft, model, association, provider } = guidedOnboarding(state, id);
  return { draftId: id, expectedDraftRevision: draft.draftRevision, expectedUpdatedAt: model.updatedAt, expectedPriceRevision: association.procurementRevision || 0, expectedSaleVersion: modelSaleRevision(state, model.id), expectedProviderSaleVersion: providerPriceRevision(state, model.id, provider.id), serviceMode: mode, callId: 'novice/guided-chat', costs, prices: costs.map(({ listPrice, ...item }) => ({ ...item, amount: listPrice === '0' ? '0' : '2' })), openScope: 'selected', tenantIds: ['tenant-gov'], confirmed: true };
}

for (const mode of ['standard', 'provider']) test(`${mode}: one exact model completes source → connection → sales → route → validated publication → explicit listing`, async t => {
  const storage = environment(t); let { state, id } = await connected(t);
  let context = guidedOnboarding(state, id);
  state = run(state, 'guidedServiceConfigure', sales(state, id, mode), context.model.id);
  context = guidedOnboarding(state, id);
  assert.ok(context.supply); assert.equal(context.model.serviceMode, mode); assert.equal(context.step, 2);
  const service = routingServices(state).find(row => row.modelId === context.model.id);
  state = run(state, 'guidedRouteSave', { draftId:id,expectedDraftRevision:context.draft.draftRevision,serviceId: service.id, expectedVersion: 0, sourceVersion: routeSourceVersion(state, service), config: { ...emptyRouteConfig(service), channels: [{ supplyId: context.supply.id, enabled: true, groupId: 'P1', weight: 100, priority: 1 }] } });
  context = guidedOnboarding(state, id); assert.equal(context.step, 3); assert.ok(context.serviceReady);
  state = withAdminSession(parseAdminState(serializeAdminState(state)));
  context = guidedOnboarding(state, id); assert.equal(context.step, 3, 'saved resources restore actual progress');
  storage.setItem(STORAGE_KEY, serializeAdminState(state));
  const listing = { type: 'modelOperation', operation: 'publish', modelId: context.model.id, data: {} };
  assert.throws(() => persistModelAction(state, listing, storage), /路由|平台试调用/);
  const plan = platformCandidatePlan(context.candidateState, context.model, { serviceId: service.id, tenantIds: ['tenant-gov'], supplyIds: [context.supply.id] });
  const trial = await runPlatformTrial(plan); assert.equal(trial.result.billingReady, true); assert.equal(guidedOnboarding(state, id).listed, false);
  assert.equal(getMockServiceSnapshots().find(row=>row.id===trial.service.id).published,null);
  assert.equal(state.serviceRoutes.find(row=>row.serviceId===service.id).activeVersion,1);
  const action={type:'modelOperations',operation:'guidedPublish',modelId:context.model.id,data:{draftId:id,expectedDraftRevision:context.draft.draftRevision,serviceId:service.id,mockServiceId:trial.service.id,expectedMockRevision:trial.service.revision,publishedVersion:trial.service.candidateVersion,expectedFingerprint:trial.publicationFingerprint,operationId:crypto.randomUUID(),confirmed:true}};
  const raw=storage.getItem(STORAGE_KEY),mock=JSON.stringify(getMockServiceSnapshots());
  assert.throws(()=>persistModelAction(state,action,{...storage,setItem(){throw Error('quota');}}),/quota/);
  assert.equal(storage.getItem(STORAGE_KEY),raw);assert.equal(JSON.stringify(getMockServiceSnapshots()),mock);
  state=persistModelAction(state,action,storage);
  const publication=structuredClone(getMockServiceSnapshots());
  const replay=persistModelAction(state,action,storage);assert.deepEqual(replay.models,state.models);assert.deepEqual(getMockServiceSnapshots(),publication);
  assert.equal(guidedOnboarding(state, id).listed, true); assert.equal(pendingGuidedOnboardings(state).length, 0);
  const unfinished=structuredClone(state);delete unfinished.modelOnboardings.find(row=>row.id===id).completion;
  assert.equal(guidedOnboarding(unfinished,id).completed,false,'an already live service cannot replace this task’s explicit completion');
  const downlisted=commitAdminState(state,{type:'modelOperation',operation:'unlist',modelId:context.model.id,data:{}});
  assert.equal(guidedOnboarding(downlisted,id).completed,true,'later maintenance does not reopen a completed task');
  assert.equal(JSON.stringify(state).includes('mock-guided-onboarding-only-key'), false);
  const online=guidedOnboarding(state,id),originalModel=structuredClone(online.model),prices=structuredClone(state.modelSalePrices),oldRoutes=structuredClone(state.serviceRoutes);
  const reserve=await connected(t,{baseState:state,providerId:online.provider.id,libraryId:online.master.id,supplyOnly:true,intent:'reserve'});state=reserve.state;
  let standby=guidedOnboarding(state,reserve.id);assert.equal(standby.supplyReady,true);assert.equal(standby.supply,undefined);assert.equal(standby.completed,false);
  state=run(state,'guidedReserveComplete',{draftId:reserve.id,expectedDraftRevision:standby.draft.draftRevision});assert.equal(guidedOnboarding(state,reserve.id).completed,true);
  assert.deepEqual(state.models.find(row=>row.id===originalModel.id),originalModel);assert.deepEqual(state.modelSalePrices,prices);assert.deepEqual(state.serviceRoutes,oldRoutes);
  standby=guidedOnboarding(state,reserve.id);
  const reuseValue={providerId:standby.provider.id,name:standby.endpoint.name,interfaceType:standby.endpoint.interfaceType,baseUrl:standby.endpoint.baseUrl};
  const rows=[{id:'activate',libraryId:standby.master.id,upstreamModelId:standby.association.upstreamModelId,scenarios:[]}];
  state=run(state,'channelDraftSave',{guided:true,intent:'activate',value:reuseValue,rows,step:1});const activeId=state.audits[0].objectId;
  const endpointCount=state.endpoints.length,mappingCount=state.providers.find(row=>row.id===standby.provider.id).catalogConnections.length;
  state=run(state,'channelQuickCreate',{providerId:standby.provider.id,draftId:activeId,expectedDraftRevision:1,values:{endpointId:standby.endpoint.id,models:rows.map(({libraryId,upstreamModelId})=>({libraryId,upstreamModelId}))}});
  assert.equal(state.endpoints.length,endpointCount);assert.equal(state.providers.find(row=>row.id===standby.provider.id).catalogConnections.length,mappingCount);
  let active=guidedOnboarding(state,activeId);assert.equal(active.completed,false,'old listed service is not the completion of this supply task');
  state=run(state,'guidedSupplyAttach',{draftId:activeId,expectedDraftRevision:active.draft.draftRevision});active=guidedOnboarding(state,activeId);
  const targetService=active.service,route=state.serviceRoutes.find(row=>row.serviceId===targetService.id),existing=route.versions.find(row=>row.version===route.activeVersion).config;
  state=run(state,'guidedRouteSave',{draftId:activeId,expectedDraftRevision:active.draft.draftRevision,serviceId:targetService.id,expectedVersion:route.activeVersion,sourceVersion:routeSourceVersion(state,targetService),config:{...existing,strategy:'fixed',autoFailover:true,channels:[{supplyId:active.supply.id,enabled:true,groupId:'P1',priority:1,weight:100}]}});
  assert.equal(state.serviceRoutes.find(row=>row.serviceId===targetService.id).versions.length,route.versions.length+1);
  active=guidedOnboarding(state,activeId);assert.equal(active.completed,false);assert.equal(active.serviceReady,true,JSON.stringify({issue:active.candidateIssue,checks:active.checks.filter(row=>!row.passed)}));
  assert.equal(active.step,3);
  storage.setItem(STORAGE_KEY,serializeAdminState(state));
  const activePlan=platformCandidatePlan(active.candidateState,active.model,{serviceId:targetService.id,tenantIds:originalModel.tenantIds,supplyIds:active.candidateState.serviceRoutes.find(row=>row.serviceId===targetService.id).versions.at(-1).config.channels.map(row=>row.supplyId)});
  const activeTrial=await runPlatformTrial(activePlan),restored=recoverPlatformTrial(activePlan);assert.ok(restored);assert.equal(restored.result.traceId,activeTrial.result.traceId);
  const apply={type:'modelOperations',operation:'guidedPublish',modelId:active.model.id,data:{draftId:activeId,expectedDraftRevision:active.draft.draftRevision,serviceId:targetService.id,mockServiceId:activeTrial.service.id,expectedMockRevision:activeTrial.service.revision,publishedVersion:activeTrial.service.candidateVersion,expectedFingerprint:activeTrial.publicationFingerprint,operationId:crypto.randomUUID(),confirmed:true}};
  const mainBefore=storage.getItem(STORAGE_KEY),mockBefore=JSON.stringify(getMockServiceSnapshots());
  const broken={...storage,setItem(key,value){if(key==='moma-5120-model-onboarding-mock-v1')throw Error('mock quota');storage.setItem(key,value);}};
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:broken});assert.throws(()=>persistModelAction(state,apply,broken),/mock quota/);Object.defineProperty(globalThis,'localStorage',{configurable:true,value:storage});
  assert.equal(storage.getItem(STORAGE_KEY),mainBefore);assert.equal(JSON.stringify(getMockServiceSnapshots()),mockBefore);
  state=persistModelAction(state,apply,storage);assert.equal(guidedOnboarding(state,activeId).completed,true);assert.deepEqual(state.modelSalePrices,prices);
  const final=state.models.find(row=>row.id===originalModel.id);assert.equal(final.openScope,originalModel.openScope);assert.deepEqual(final.tenantIds,originalModel.tenantIds);assert.equal(final.serviceMode,mode);

});

test('sales validation is atomic and rejects missing money, stale revisions, changed mode and mismatched task identity', async t => {
  environment(t); let { state, id } = await connected(t); const context = guidedOnboarding(state, id), before = structuredClone(state), valid = sales(state, id);
  for (const patch of [{ prices: valid.prices.map(row => ({ ...row, amount: '' })) }, { prices: valid.prices.map(row => ({ ...row, currency: 'USD' })) }, { expectedPriceRevision: 100 }, { expectedUpdatedAt: 'stale' }, { confirmed: false }, { draftId: 'another-task' }, { openScope: 'selected', tenantIds: [] }]) {
    assert.throws(() => run(state, 'guidedServiceConfigure', { ...valid, ...patch }, context.model.id)); assert.deepEqual(state, before);
  }
  assert.throws(() => run(state, 'guidedServiceConfigure', valid, 'another-model'), /不匹配/);
  const live = structuredClone(state); live.models.find(row => row.id === context.model.id).listingStatus = '已上架';
  assert.equal(guidedOnboarding(live, id).listed, false, 'an already listed model does not complete a new channel task');
  assert.throws(() => run(live, 'guidedServiceConfigure', valid, context.model.id), /已上架服务/);
  state = run(state, 'guidedServiceConfigure', valid, context.model.id);
  assert.throws(() => run(state, 'guidedServiceConfigure', { ...sales(state, id), serviceMode: 'provider' }, context.model.id), /不能.*重置/);
  assert.deepEqual(state.serviceRoutes, before.serviceRoutes, 'configuring a new channel never replaces existing routes');
  const configured = guidedOnboarding(state, id);
  state = run(state, 'guidedProfileSave', { draftId: id, expectedDraftRevision: configured.draft.draftRevision, values: { ...serviceModelDraft(configured.model), context: '8', contextUnit: 'K', expectedUpdatedAt: configured.model.updatedAt } }, configured.model.id);
  assert.equal(guidedOnboarding(state, id).supply.validationStatus, '待验证');
  state = run(state, 'guidedServiceConfigure', sales(state, id), configured.model.id);
  assert.equal(guidedOnboarding(state, id).supply.validationStatus, '通过');
  assert.equal(guidedOnboarding(state, id).supply.capabilities.context, 8192);
});

test('unfinished profile and sales cannot be saved as drafts and leave completed resources unchanged',async t=>{
 environment(t);const {state,id}=await connected(t),context=guidedOnboarding(state,id),before=structuredClone(state);
 const values={...serviceModelDraft(context.model),description:'未提交输入'};
 assert.throws(()=>run(state,'guidedDraftSave',{id,expectedRevision:context.draft.draftRevision,section:'profile',values}),/未知/);
 assert.deepEqual(state,before);
});

test('guided source requires exactly one model and cannot create channels or services while saving a draft', () => {
  const state = withAdminSession(parseAdminState(null));
  const value = { providerId: 'provider-moma', name: '一个模型渠道', interfaceType: 'openai', baseUrl: '' };
  const row = { id: 'r1', libraryId: 'model-2', upstreamModelId: 'vendor/model', scenarios: [] };
  assert.throws(() => run(state, 'channelDraftSave', { guided: true, value, rows: [row, { ...row, id: 'r2' }] }), /仅配置一个模型/);
  const saved = run(state, 'channelDraftSave', { guided: true, value, rows: [row] });
  const draft = saved.modelOnboardings.find(row => row.guided);
  assert.equal(guidedOnboarding(saved, draft.id).step, 0); assert.equal(pendingGuidedOnboardings(saved).length, 0);
  assert.deepEqual(saved.endpoints, state.endpoints); assert.deepEqual(saved.models, state.models);
});

test('correcting an unbound upstream ID invalidates enablement and evidence while preserving canonical identity and prices', async t => {
  environment(t); let { state, id } = await connected(t); const context = guidedOnboarding(state, id), before = structuredClone(state);
  const data = { draftId: id, expectedDraftRevision: context.draft.draftRevision, expectedFingerprint: channelFingerprint(context.channel), upstreamModelId: 'vendor/corrected-chat', confirmed: true };
  assert.throws(() => run(state, 'guidedUpstreamSave', { ...data, upstreamModelId: 'bad id' }), /不能包含空白/);
  assert.throws(() => run(state, 'guidedUpstreamSave', { ...data, expectedFingerprint: 'stale' }), /已变化/);
  const next = run(state, 'guidedUpstreamSave', data), corrected = guidedOnboarding(next, id);
  assert.equal(corrected.step, 1); assert.equal(corrected.association.upstreamModelId, data.upstreamModelId); assert.equal(corrected.channel.enabled, false); assert.equal(corrected.channel.health, null);
  assert.deepEqual(corrected.master, context.master); assert.deepEqual(next.models, before.models); assert.deepEqual(next.modelSalePrices, before.modelSalePrices); assert.deepEqual(next.supplyPrices, before.supplyPrices);
  state = run(state, 'guidedServiceConfigure', sales(state, id), context.model.id);
  const bound = guidedOnboarding(state, id);
  assert.throws(() => run(state, 'guidedUpstreamSave', { ...data, expectedDraftRevision: bound.draft.draftRevision, expectedFingerprint: channelFingerprint(bound.channel) }), /已关联服务/);
});

test('reusing an existing channel creates one exact task association without replacing other model access', async t => {
  environment(t); let { state, id: firstId } = await connected(t); const first = guidedOnboarding(state, firstId), endpoints = structuredClone(state.endpoints);
  const value = { providerId: first.provider.id, name: first.endpoint.name, interfaceType: first.endpoint.interfaceType, baseUrl: first.endpoint.baseUrl, authMode: 'group', keyGroupId: 'default' };
  const rows = [{ id: 'second-model', newModel: { modelId: 'guided-second-model', type: 'text' }, upstreamModelId: 'vendor/second-model', scenarios: [], selected: true, confirmed: true }];
  state = run(state, 'channelDraftSave', { guided: true, value, rows, endpointId: first.endpoint.id, step: 1 });
  const id = state.audits[0].objectId;
  state = run(state, 'channelQuickCreate', { providerId: first.provider.id, draftId: id, expectedDraftRevision: 1, values: { endpointId: first.endpoint.id, models: rows.map(({ newModel, upstreamModelId }) => ({ newModel, upstreamModelId })) } });
  const second = guidedOnboarding(state, id);
  assert.equal(second.endpoint.id, first.endpoint.id); assert.deepEqual(state.endpoints, endpoints);
  assert.equal(second.draft.createdAssociationIds.length, 1); assert.notEqual(second.association.id, first.association.id);
  assert.equal(second.master.modelId, 'guided-second-model'); assert.equal(second.step, 1); assert.equal(second.model, undefined);
  assert.equal(guidedOnboarding(state, firstId).channel.enabled, true); assert.equal(guidedOnboarding(state, firstId).connectionIssue, '');
});
