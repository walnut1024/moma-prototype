import test from 'node:test';
import assert from 'node:assert/strict';
import { SERVICE_WORKSPACE_TABS, serviceWorkspaceTab } from '../src/admin-v2/service-workspace-panels.js';
import { createAdminSeed, commitAdminState, persistModelAction, STORAGE_KEY } from '../src/admin-v2/store.js';
import { withAdminSession } from './admin-session-fixture.mjs';
import { modelOperationHistory, modelOperationTarget, MODEL_OPERATION_NAMES } from '../src/admin-v2/model-operation-history.js';
import { commercialTaskBase } from '../src/admin-v2/service-workspace.js';

const run = (state, operation, modelId, data = {}) => commitAdminState(state, { type: 'modelOperations', operation, modelId, data });
function providerFixture() {
  let state = withAdminSession(createAdminSeed());
  const model = state.models[0], provider = state.providers.find(row => row.status === '已启用');
  model.serviceMode = 'provider'; model.serviceProviders = []; model.listingStatus = '已下架';
  state = run(state, 'associateServiceProvider', model.id, { providerId: provider.id, expectedUpdatedAt: model.updatedAt });
  return { state, modelId: model.id, providerId: provider.id };
}

test('five workspace tabs resolve metadata, mapping, pricing and contextual task links', () => {
  assert.deepEqual(SERVICE_WORKSPACE_TABS.map(row => row[1]), ['模型卡片', '路由及映射', '售价与开放范围', 'API 调用指南', '操作记录']);
  for (const [params, expected] of [[{}, 'materials'], [{panel:'editMetadata'}, 'materials'], [{panel:'routing'}, 'routing'], [{panel:'associate'}, 'routing'], [{panel:'guide'}, 'guide'], [{panel:'guide',providerChannels:'p',routeProvider:'p'}, 'guide'], [{providerAdd:'1'}, 'routing'], [{identityProvider:'p'}, 'routing'], [{providerAssociate:'1'}, 'routing'], [{panel:'pricing'}, 'pricing'], [{providerEdit:'p'}, 'pricing'], [{panel:'history'}, 'history']]) assert.equal(serviceWorkspaceTab(new URLSearchParams(params)), expected);
});

test('provider call-ID mapping is independent of prices, routes, resources and customer scope', () => {
  let {state, modelId, providerId} = providerFixture();
  const before = structuredClone(state), model = state.models.find(row => row.id === modelId);
  state = run(state, 'configureServiceIdentity', modelId, {providerId,callId:'moma/identity-only',expectedUpdatedAt:model.updatedAt});
  assert.equal(state.models.find(row => row.id === modelId).serviceProviders[0].callId, 'moma/identity-only');
  for (const key of ['modelSalePrices','serviceRoutes','providers','endpoints','modelSupplies','orders','grants']) assert.deepEqual(state[key],before[key]);
  assert.deepEqual(state.models.find(row => row.id === modelId).commercialDrafts, model.commercialDrafts);
  assert.equal(state.models.find(row => row.id === modelId).listingStatus, '已下架');
  for (const callId of ['', 'bad id', model.modelId]) assert.throws(() => run(before,'configureServiceIdentity',modelId,{providerId,callId,expectedUpdatedAt:model.updatedAt}));
  const current = state.models.find(row => row.id === modelId); current.listingStatus='已上架';
  assert.throws(()=>run(state,'configureServiceIdentity',modelId,{providerId,callId:'another-id',expectedUpdatedAt:current.updatedAt}),/下架/);
  assert.throws(()=>run(before,'configureServiceIdentity',modelId,{providerId,callId:'valid-id',expectedUpdatedAt:'stale'}),/并发/);
});

test('publishing a price cannot carry a call-ID change into a different service', () => {
  let {state,modelId,providerId} = providerFixture();
  let model = state.models.find(row=>row.id===modelId);
  state=run(state,'configureServiceIdentity',modelId,{providerId,callId:'moma/identity-price',expectedUpdatedAt:model.updatedAt});
  model=state.models.find(row=>row.id===modelId);
  const before=structuredClone(state);
  assert.throws(()=>run(state,'commercialPublish',modelId,{kind:'price',providerId,expectedBase:commercialTaskBase(state,model,'price',providerId),value:{callId:'sneaked/identity',items:[{name:'输入 Token',condition:'',unit:'百万 Token',currency:'CNY',amount:'2'}]},confirmed:true}),/调用 ID/);
  assert.deepEqual(state,before);
});

test('shared channel history freezes affected models and retains them after unlinking', () => {
  let state=withAdminSession(createAdminSeed());
  const supply=state.modelSupplies[0], model=state.models.find(row=>row.id===supply.modelId), unrelated=state.models.find(row=>!state.modelSupplies.some(link=>link.modelId===row.id && link.endpointId===supply.endpointId));
  assert.ok(model);assert.ok(unrelated);
  state=commitAdminState(state,{type:'update',collection:'endpoints',id:supply.endpointId,changes:{name:'共享渠道重命名'}});
  const event=state.audits[0];assert.ok(event.relatedModelIds.includes(model.id));assert.equal(event.relatedModelIds.includes(unrelated.id),false);
  assert.match(event.objectLabel,/渠道/);
  state.modelSupplies=state.modelSupplies.filter(link=>link.modelId!==model.id);
  assert.ok(modelOperationHistory(state,model).some(row=>row.id===event.id));
  state.modelSupplies.push({...supply,id:'later-link',modelId:unrelated.id});
  assert.equal(modelOperationHistory(state,unrelated).some(row=>row.id===event.id),false);
});

test('operation history includes shared material and has no silent 100-row cutoff', () => {
  const state=withAdminSession(createAdminSeed()), model=state.models[0];model.templateId='shared-master';
  state.audits=Array.from({length:150},(_,index)=>({id:'event-'+index,objectId: index===0?'shared-master':model.id,createdAt:new Date(2026,0,1,0,index).toISOString(),action:'资料维护',result:'成功'}));
  const records=modelOperationHistory(state,model);assert.equal(records.length,150);assert.equal(records[0].id,'event-149');assert.ok(records.some(row=>row.id==='event-0'));
});

test('historical records use recorded model identities rather than current supply associations', () => {
  const state=withAdminSession(createAdminSeed()), supply=state.modelSupplies[0], model=state.models.find(row=>row.id===supply.modelId);
  state.audits=[
    {id:'old-endpoint',objectId:supply.endpointId,after:[{type:'update',collection:'endpoints',id:supply.endpointId,changes:{name:'历史渠道'}}]},
    {id:'old-supply',objectId:supply.id,after:[{type:'add',collection:'modelSupplies',record:{...supply}}]},
    {id:'old-route',objectId:'route-id',after:[{type:'add',collection:'serviceRoutes',record:{serviceId:`standard:${model.id}`}}]},
  ];
  assert.deepEqual(modelOperationHistory(state,model).map(row=>row.id),['old-supply','old-route']);
});

test('failed workspace operations resolve model, shared material and routing identities without treating channels as models', () => {
  const state=withAdminSession(createAdminSeed()), model=state.models[0], master=state.modelTemplates[0];
  assert.equal(modelOperationTarget(state,model.id,{}),model.id);
  assert.equal(modelOperationTarget(state,undefined,{id:master.id}),master.id);
  for(const serviceId of [`standard:${model.id}`,`provider:${model.id}:provider-a`])assert.equal(modelOperationTarget(state,undefined,{serviceId}),model.id);
  assert.equal(modelOperationTarget(state,undefined,{id:state.endpoints[0].id}),undefined);
  assert.equal(modelOperationTarget(state,undefined,{serviceId:'standard:missing-model'}),undefined);
  assert.equal(MODEL_OPERATION_NAMES.serviceRoutePublish,'发布路由');
});

test('failure auditing stores a result without storing inputs or changing effective model configuration', () => {
  const state=withAdminSession(createAdminSeed()), model=state.models[0], before=structuredClone(state);
  const next=run(state,'recordFailedOperation',model.id,{operation:'templatePublish',reason:'资料版本已变化',apiKey:'NEVER-STORE-THIS'});
  for (const key of ['models','modelTemplates','modelSalePrices','modelSupplies','serviceRoutes','orders']) assert.deepEqual(next[key],before[key]);
  assert.equal(next.audits[0].result,'失败');assert.equal(next.audits[0].reason,'资料版本已变化');assert.equal(next.audits[0].action,'发布模型资料');assert.equal(JSON.stringify(next.audits[0]).includes('NEVER-STORE-THIS'),false);
  assert.throws(()=>run({...state,currentRole:'运维人员'},'recordFailedOperation',model.id,{operation:'publish',reason:'失败'}),/无权/);
  const raw=JSON.stringify(state),storage={getItem:key=>key===STORAGE_KEY?raw:null,setItem(){throw Error('quota');}};
  assert.throws(()=>persistModelAction(state,{type:'modelOperations',operation:'recordFailedOperation',modelId:model.id,data:{operation:'publish',reason:'失败'}},storage),/quota/);
  assert.deepEqual(state,before);
});
