import { withAdminSession } from './admin-session-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminSeed as baseCreateAdminSeed, commitAdminState, parseAdminState as baseParseAdminState, persistModelAction } from '../src/admin-v2/store.js';
import { activeModelSalePrice, activeProviderPrice, modelSaleRevision, providerPriceRevision, providerServices } from '../src/admin-v2/service-workspace.js';
import { modelSupplies, publicationChecks } from '../src/admin-v2/model-management.js';

const action = (model, serviceMode, expectedUpdatedAt = model.updatedAt) => ({ type: 'modelOperations', operation: 'serviceMode', modelId: model.id, data: { serviceMode, expectedUpdatedAt } });
const setup = () => {
  const state = createAdminSeed(), model = state.models.find(item => item.listingStatus === '已下架');
  assert.ok(model);
  return { state, model };
};

test('unknown persisted service modes cannot bypass required-mode publication checks', () => {
  const {state,model}=setup();model.serviceMode='unknown';
  assert.deepEqual(publicationChecks(state,model).filter(check=>!check.passed && check.tab==='serviceMode').map(check=>check.label),['服务模式无效，请重新选择']);
  assert.throws(()=>commitAdminState(state,{type:'modelOperation',operation:'publish',modelId:model.id,data:{}}),/服务模式无效/);
});

test('initial service mode selection preserves all existing business fields', () => {
  for (const serviceMode of ['standard', 'provider']) {
    const {state,model}=setup();
    const before = structuredClone(state), next = commitAdminState(state, action(model, serviceMode));
    const saved = next.models.find(item => item.id === model.id);
    assert.deepEqual(saved, { ...model, serviceMode, accessGeneration: (model.accessGeneration || 0) + 1, requestGeneration: (model.requestGeneration || 0) + 1, updatedAt: saved.updatedAt });
    for (const key of Object.keys(state).filter(key => !['models', 'modelData', 'initialData', 'audits', 'revision', 'updatedAt'].includes(key))) assert.deepEqual(next[key], state[key]);
    assert.ok(next.modelData.userIds.models.includes(model.id));
    assert.deepEqual(state, before);
    assert.equal(parseAdminState(JSON.stringify(next)).models.find(item => item.id === model.id).serviceMode, serviceMode);
  }
});

const priceItems=[{name:'输入',condition:'',unit:'百万 Token',currency:'CNY',amount:2000000}];
function configured() {
  const state=createAdminSeed(),supply=state.modelSupplies.find(item=>item.status!=='已移除'),model=state.models.find(item=>item.id===supply.modelId),provider=state.providers.find(item=>item.id===state.endpoints.find(item=>item.id===supply.endpointId).providerId);
  model.serviceMode='standard';model.listingStatus='已下架';
  model.serviceProviders=[{providerId:provider.id,code:provider.code,callId:'mode-reset-provider',status:'已关联'}];
  const version={version:1,config:{strategy:'weighted',channels:[{supplyId:supply.id,enabled:true,weight:100,priority:1}],autoFailover:true},publishedAt:'2026-01-01T00:00:00Z'};
  state.serviceRoutes.push({id:'mode-reset-route',serviceId:`standard:${model.id}`,activeVersion:1,draft:structuredClone(version.config),draftUpdatedAt:'2026-01-01',versions:[version]}, {id:'mode-reset-provider-route',serviceId:`provider:${model.id}:${provider.id}`,activeVersion:1,draft:structuredClone(version.config),versions:[structuredClone(version)]}, {id:'unrelated-route',serviceId:`standard:${model.id}-other`,activeVersion:1,versions:[structuredClone(version)]});
  state.modelSalePrices.push({id:'mode-reset-model-price',modelId:model.id,scope:'model',items:priceItems,version:999,status:'已发布',effectiveAt:'2026-01-01T00:00:00Z'},{id:'mode-reset-provider-price',modelId:model.id,providerId:provider.id,scope:'provider',items:priceItems,version:999,status:'已发布',effectiveAt:'2026-01-01T00:00:00Z'});
  return {state,model,provider};
}
test('mode reset requires explicit confirmation and rejects the same mode without changing data',()=>{
  const {state,model}=configured(),before=structuredClone(state);
  assert.throws(()=>commitAdminState(state,action(model,'provider')),/请确认模型下架/);
  const forged=action(model,'provider');forged.data.confirmedReset='true';assert.throws(()=>commitAdminState(state,forged),/请确认模型下架/);
  assert.throws(()=>commitAdminState(state,action(model,'standard')),/不同的服务模式/);
  assert.deepEqual(state,before);
});
test('confirmed mode reset detaches only this model and stops its routes while preserving resource and price history',()=>{
  const {state,model,provider}=configured(),before=structuredClone(state),pending=action(model,'provider');pending.data.confirmedReset=true;
  const next=commitAdminState(state,pending),saved=next.models.find(item=>item.id===model.id);
  assert.equal(saved.serviceMode,'provider');assert.equal(saved.serviceModeRevision,1);assert.equal(saved.listingStatus,'已下架');
  assert.equal(modelSupplies(next,model.id).length,0);assert.equal(providerServices(saved).length,0);
  for (const supply of next.modelSupplies.filter(item=>item.modelId===model.id)) {assert.equal(supply.status,'已移除');assert.equal(supply.salesEnabled,false);}
  for (const route of next.serviceRoutes.filter(item=>['mode-reset-route','mode-reset-provider-route'].includes(item.id))) {assert.equal(route.activeVersion,0);assert.equal(route.draft,null);assert.deepEqual(route.versions,state.serviceRoutes.find(item=>item.id===route.id).versions);}
  assert.deepEqual(next.serviceRoutes.find(item=>item.id==='unrelated-route'),state.serviceRoutes.find(item=>item.id==='unrelated-route'));
  assert.deepEqual(next.modelSupplies.filter(item=>item.modelId!==model.id),state.modelSupplies.filter(item=>item.modelId!==model.id));
  for (const key of ['providers','endpoints','supplyPrices','modelSalePrices','orders','requests','apiKeys']) assert.deepEqual(next[key],state[key]);
  assert.equal(activeModelSalePrice(next,model.id),undefined);assert.equal(activeProviderPrice(next,model.id,provider.id),undefined);
  assert.equal(publicationChecks(next,saved).some(check=>!check.passed),true);
  const refreshed=parseAdminState(JSON.stringify(next));assert.equal(refreshed.models.find(item=>item.id===model.id).serviceModeRevision,1);assert.equal(modelSupplies(refreshed,model.id).length,0);
  assert.deepEqual(state,before);
});
test('switching back never revives earlier prices and newly configured prices use the new mode revision',()=>{
  const {state,model,provider}=configured();let current=state;
  const switchTo=serviceMode=>{const saved=current.models.find(item=>item.id===model.id),pending=action(saved,serviceMode);pending.data.confirmedReset=true;current=commitAdminState(current,pending);};
  switchTo('provider');
  let saved=current.models.find(item=>item.id===model.id);
  current=commitAdminState(current,{type:'modelOperations',operation:'associateServiceProvider',modelId:model.id,data:{providerId:provider.id,expectedUpdatedAt:saved.updatedAt}});
  saved=current.models.find(item=>item.id===model.id);
  current=commitAdminState(current,{type:'modelOperations',operation:'configureServiceProvider',modelId:model.id,data:{providerId:provider.id,callId:'mode-reset-new-call',items:[{...priceItems[0],amount:'3'}],expectedUpdatedAt:saved.updatedAt,expectedSaleVersion:providerPriceRevision(current,model.id,provider.id)}});
  assert.equal(activeProviderPrice(current,model.id,provider.id).serviceModeRevision,1);
  switchTo('standard');assert.equal(activeModelSalePrice(current,model.id),undefined);assert.equal(activeProviderPrice(current,model.id,provider.id),undefined);
  saved=current.models.find(item=>item.id===model.id);
  current=commitAdminState(current,{type:'modelOperations',operation:'unifiedPrice',modelId:model.id,data:{items:[{...priceItems[0],amount:'4'}],expectedUpdatedAt:saved.updatedAt,expectedSaleVersion:modelSaleRevision(current,model.id)}});
  assert.equal(activeModelSalePrice(current,model.id).serviceModeRevision,2);assert.equal(activeModelSalePrice(current,model.id).items[0].amount,4000000);
  for (const price of state.modelSalePrices) assert.deepEqual(current.modelSalePrices.find(item=>item.id===price.id),price);
});

test('a confirmed mode switch atomically delists the model and clears its active and draft routing', () => {
  const {state,model}=configured();Object.assign(model,{listingStatus:'已上架',visibility:'公开',callsEnabled:true,status:'运行中'});
  const before=structuredClone(state),pending=action(model,'provider');
  assert.throws(()=>commitAdminState(state,pending),/请确认模型下架/);
  assert.deepEqual(state,before);
  pending.data.confirmedReset=true;
  const next=commitAdminState(state,pending),saved=next.models.find(item=>item.id===model.id);
  assert.equal(saved.serviceMode,'provider');assert.equal(saved.listingStatus,'已下架');assert.equal(saved.callsEnabled,false);assert.equal(saved.status,'停用');
  assert.equal(modelSupplies(next,model.id).length,0);assert.equal(providerServices(saved).length,0);
  for(const route of next.serviceRoutes.filter(item=>['mode-reset-route','mode-reset-provider-route'].includes(item.id))){assert.equal(route.activeVersion,0);assert.equal(route.draft,null);assert.deepEqual(route.versions,state.serviceRoutes.find(item=>item.id===route.id).versions);}
  for(const key of ['providers','endpoints','supplyPrices','modelSalePrices','orders','requests','apiKeys'])assert.deepEqual(next[key],state[key],key);
  assert.deepEqual(state,before);
});

test('a listed legacy model without a service mode requires confirmation before initial selection delists it', () => {
  const state=createAdminSeed(),model=state.models.find(item=>item.listingStatus==='已上架');delete model.serviceMode;
  const before=structuredClone(state),pending=action(model,'standard');
  assert.throws(()=>commitAdminState(state,pending),/请确认模型下架/);
  pending.data.confirmedReset=true;
  const next=commitAdminState(state,pending),saved=next.models.find(item=>item.id===model.id);
  assert.equal(saved.serviceMode,'standard');assert.equal(saved.listingStatus,'已下架');assert.equal(saved.callsEnabled,false);
  for(const key of ['providers','endpoints','supplyPrices','modelSalePrices','orders','requests','apiKeys'])assert.deepEqual(next[key],state[key],key);
  assert.deepEqual(state,before);
});

test('saving rechecks listing state after the configuration dialog was opened', () => {
  const { state, model } = setup(), pending = action(model, 'standard');
  model.listingStatus = '已上架';
  assert.throws(() => commitAdminState(state, pending), /请确认模型下架/);
  assert.equal(model.serviceMode, undefined);
});

test('service mode rejects multiple values, unknown modes, invalid states and stale revisions', () => {
  const { state, model } = setup(), before = structuredClone(state);
  for (const mode of ['', 'invalid', ['standard', 'provider'], ['provider'], null, '__proto__']) assert.throws(() => commitAdminState(state, action(model, mode)), /一种有效/);
  assert.throws(() => commitAdminState(state, action(model, 'standard', 'stale')), /并发修订/);
  assert.throws(() => commitAdminState(state, { ...action(model, 'standard'), modelId: 'missing' }), /模型不存在/);
  assert.deepEqual(state, before);
  model.listingStatus = '未知';
  assert.throws(() => commitAdminState(state, action(model, 'provider')), /模型上架状态无效/);
});

test('service mode retains permission, concurrent-write and storage-error protection', () => {
  const { state, model } = setup(), before = structuredClone(state), pending = action(model, 'standard');
  assert.throws(() => commitAdminState({ ...state, currentRole: '运维人员' }, pending), /无权/);
  assert.throws(() => persistModelAction(state, pending, { getItem: () => JSON.stringify({ ...state, revision: state.revision + 1 }), setItem: () => assert.fail('must not save') }), /数据已变化/);
  assert.throws(() => persistModelAction(state, pending, { getItem: () => JSON.stringify(state), setItem: () => { throw Error('storage failed'); } }), /storage failed/);
  assert.deepEqual(state, before);
});

function createAdminSeed(...args) { return withAdminSession(baseCreateAdminSeed(...args)); }
function parseAdminState(...args) { return withAdminSession(baseParseAdminState(...args)); }
