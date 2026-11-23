import { exportModelResources } from '../src/admin-v2/model-resource-transfer.js';
import { withAdminSession } from './admin-session-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminSeed as baseCreateAdminSeed, commitAdminState, parseAdminState as baseParseAdminState, persistModelAction } from '../src/admin-v2/store.js';
import { commercialPriceBase, serviceDirectoryModels, serviceSupplyRows, activeModelSalePrice, modelSaleRevision, availableServiceChannels } from '../src/admin-v2/service-workspace.js';
import { callStateLabel, modelServiceStarted, serviceDirectoryRows } from '../src/admin-v2/service-directory.js';
import { modelSupplies, publicationChecks } from '../src/admin-v2/model-management.js';
import { routingServices, routingChannels, routeSourceVersion } from '../src/admin-v2/service-routing.js';
import { providerCatalogueIds } from '../src/admin-v2/moma-provider.js';
import {connectionFingerprint} from '../src/admin-v2/connection-state.js';
import { simulateRequest } from '../src/admin-v2/domain.js';
const transact=(state,operation,modelId,data)=>commitAdminState(state,{type:'modelOperations',operation,modelId,data});
const setup=()=>{const state=createAdminSeed(), model=state.models.find(item=>item.id==='catalog-demo-kimi');model.serviceMode='standard';for(const endpoint of state.endpoints.filter(item=>state.modelSupplies.some(supply=>supply.modelId===model.id && supply.endpointId===item.id))){if(!endpoint.baseUrl.endsWith('/chat/completions'))endpoint.baseUrl=endpoint.baseUrl.replace(/\/$/,'')+'/chat/completions';endpoint.connectionTest={fingerprint:connectionFingerprint(endpoint),result:'通过',testedAt:'2026-01-01'};}return {state,model};};
const pricing=(state,model,items=[{name:'输入 Token',unit:'百万 Token',currency:'CNY',condition:'',amount:'0.000001'},{name:'输出 Token',unit:'百万 Token',currency:'CNY',condition:'',amount:'0'}])=>({items,expectedUpdatedAt:model.updatedAt,expectedSaleVersion:modelSaleRevision(state,model.id)});

test('service list keeps independent public call references and shows each channel service launch state', () => {
 const providers = [{ id: 'moma', name: '移动云 MoMA' }, { id: 'other', name: '其他服务商' }];
 const serviceProviders = [
  { providerId: 'moma', channelId: 'east', channelName: '华东', callId: 'moma/east', callsEnabled: true },
  { providerId: 'moma', channelId: 'west', channelName: '华西', callId: 'moma/west', callsEnabled: false },
  { providerId: 'other', callId: '', callsEnabled: true },
  { providerId: 'other', channelId: 'removed', callId: 'removed', status: '已移除' },
 ];
 const model = { id: 'model-1', modelId: 'platform/alias', type: 'text', serviceMode: 'provider', callsEnabled: true, serviceProviders };
 const unified = { ...model, id: 'unified', serviceMode: 'standard' };
 const archived = { ...unified, id: 'archived', archivedAt: '2026-11-12T00:00:00Z' };
 const image = { ...unified, id: 'image', type: 'image' };
 const unconfigured = { ...model, id: 'unconfigured', serviceProviders: [] };
 const rows = serviceDirectoryRows([unified, model, archived, image, unconfigured], { providers });
 assert.deepEqual(rows.map(row => [row.id, row.callId, row.started]), [
  ['standard:unified', 'platform/alias', true],
  ['provider:model-1:east', 'moma/east', true],
  ['provider:model-1:west', 'moma/west', false],
  ['provider:model-1:other', '', false],
  ['standard:archived', 'platform/alias', false],
  ['standard:image', 'platform/alias', true],
  ['unconfigured', '', false],
 ]);
 assert.deepEqual(rows.slice(1, 4).map(row => [row.providerName, row.channelName]), [
  ['移动云 MoMA', '华东'], ['移动云 MoMA', '华西'], ['其他服务商', undefined],
 ]);
 assert.deepEqual(rows.map(row => row.endpoints.map(endpoint => [endpoint.protocol, endpoint.path])), [
  [['OpenAI Chat', '/api/v1/chat/completions']],
  [['OpenAI Chat', '/api/v1/chat/completions']],
  [['OpenAI Chat', '/api/v1/chat/completions']],
  [],
  [['OpenAI Chat', '/api/v1/chat/completions']],
  [],
  [],
 ]);
 assert.ok(serviceDirectoryRows([{ ...model, callsEnabled: false }], { providers }).every(row => !row.started));
 assert.deepEqual(serviceDirectoryRows([model], { providers }, 'stopped').map(row => [row.callId, callStateLabel(row.started)]), [
  ['moma/west', '已停止'], ['', '已停止'],
 ]);
 assert.equal(callStateLabel(modelServiceStarted({ ...model, marketVisible: false, listingStatus: '已下架' })), '已启动');
 assert.equal(callStateLabel(modelServiceStarted({ ...model, serviceProviders: serviceProviders.slice(1) })), '已停止');
});

test('model directory keeps custom records and existing examples visible without deleting data',()=>{
 const state=createAdminSeed();
 const custom={...state.models[0],id:'model-user-created',name:'My model',createdAt:'2026-10-25'};
 state.models.push(custom);
 const before=structuredClone(state), directory=serviceDirectoryModels(state);
 assert.equal(directory.length,state.models.length);assert.equal(new Set(directory.map(model=>model.type)).size,new Set(state.models.map(model=>model.type)).size);
 assert.ok(directory.includes(custom));assert.ok(directory.some(model=>model.id==='catalog-demo-kimi'));
 state.models.push(...Array.from({length:5},(_,index)=>({...custom,id:'custom-'+index})));
 assert.equal(serviceDirectoryModels(state).length,before.models.length+5);
 state.models.splice(-5);assert.deepEqual(state,before);
});
test('unified pricing is model-scoped, exact to six decimals, versioned and independent of channel prices',()=>{
 let {state,model}=setup();const channels=structuredClone(state.modelSupplies), prices=structuredClone(state.modelSalePrices), oldModel=structuredClone(model);
 state=transact(state,'unifiedPrice',model.id,pricing(state,model));const first=activeModelSalePrice(state,model.id);
 assert.equal(first.items[0].amount,1);assert.equal(first.items[1].amount,0);assert.equal(first.version,1);
 state=transact(state,'unifiedPrice',model.id,pricing(state,model,[{name:'输入 Token',unit:'百万 Token',currency:'CNY',condition:'',amount:'2'}]));
 assert.equal(activeModelSalePrice(state,model.id).version,2);assert.deepEqual(state.modelSalePrices.find(item=>item.id===first.id),first);
 assert.deepEqual(state.modelSalePrices.filter(item=>item.scope!=='model'),prices);assert.deepEqual(state.modelSupplies,channels);assert.deepEqual(state.models.find(item=>item.id===model.id),oldModel);
 assert.equal(activeModelSalePrice(parseAdminState(JSON.stringify(state)),model.id).items[0].amount,2000000);
});
test('unified pricing rejects blanks, negatives, invalid units, duplicate items and stale versions atomically',()=>{
 const {state,model}=setup(), before=structuredClone(state), valid=pricing(state,model);
 for(const amount of ['', '-1','0.0000001','NaN'])assert.throws(()=>transact(state,'unifiedPrice',model.id,{...valid,items:[{...valid.items[0],amount}]}));
 for(const patch of [{items:[]},{items:[{...valid.items[0],unit:''}]},{items:[valid.items[0],valid.items[0]]},{expectedUpdatedAt:'stale'},{expectedSaleVersion:'stale'}])assert.throws(()=>transact(state,'unifiedPrice',model.id,{...valid,...patch}));
 assert.deepEqual(state,before);
 model.serviceMode='provider';assert.throws(()=>transact(state,'unifiedPrice',model.id,valid),/具体模型服务配置售价/);
});
test('a unified model cannot edit or publish a channel retail offer',()=>{
 const {state,model}=setup(), supply=modelSupplies(state,model.id)[0];
 assert.throws(()=>transact(state,'reprice',model.id,{}),/模型服务售价/);
 assert.throws(()=>transact(state,'publishSupply',model.id,{id:supply.id}),/不能独立售卖/);
});
test('unified billing always snapshots the model price, independent of the chosen supplier price',()=>{
 let {state,model}=setup();state=transact(state,'unifiedPrice',model.id,pricing(state,model));
 const service=routingServices(state).find(item=>item.modelId===model.id), channel=routingChannels(state,service).find(item=>item.available);
 assert.ok(channel);
 state=transact(state,'serviceRoutePublish',null,{serviceId:service.id,expectedVersion:0,sourceVersion:routeSourceVersion(state,service),config:{strategy:'weighted',autoFailover:true,channels:[{supplyId:channel.id,enabled:true,weight:100}]}});
 const key=state.apiKeys.find(item=>item.status==='有效'&&state.grants.some(grant=>grant.subjectId===item.id));key.modelIds=[...new Set([...key.modelIds,model.id])];state.limits=state.limits.filter(item=>item.scopeId!==key.id);
 const result=simulateRequest(state,{requestId:crypto.randomUUID(),keyId:key.id,modelId:model.id}).request;
 assert.equal(result.httpStatus,200);assert.equal(result.priceVersionId,activeModelSalePrice(state,model.id).id);assert.equal(result.priceSnapshot.scope,'model');
});
test('unified model publication requires both unified price and a valid published route',()=>{
 let {state,model}=setup();assert.ok(publicationChecks(state,model).some(item=>!item.passed));
 state=transact(state,'unifiedPrice',model.id,pricing(state,model));
 const service=routingServices(state).find(item=>item.modelId===model.id), channels=routingChannels(state,service).filter(item=>item.available);
 assert.ok(channels.length);
 state=transact(state,'serviceRoutePublish',null,{serviceId:service.id,expectedVersion:0,sourceVersion:routeSourceVersion(state,service),config:{strategy:'weighted',autoFailover:true,channels:[{supplyId:channels[0].id,enabled:true,weight:100}]}});
 const checks=publicationChecks(state,state.models.find(item=>item.id===model.id));
 assert.ok(checks.filter(item=>item.tab!=='platform').every(item=>item.passed));
 assert.equal(checks.find(item=>item.tab==='platform').passed,false);
});
function association(){
 const state=createAdminSeed(), model=state.models.find(item=>item.id==='catalog-demo-kimi-code');
 const target=model || state.models.find(item=>!modelSupplies(state,item.id).length);target.serviceMode='provider';
 const source=modelSupplies(state,'catalog-demo-kimi').find(item=>providerCatalogueIds(item.provider).includes(item.catalogueModelId||item.upstreamModelId)), catalogueModelId=source.catalogueModelId||source.upstreamModelId;
 const channel=availableServiceChannels(state,source.provider,catalogueModelId).find(item=>item.endpointId===source.endpointId);
 assert.ok(channel && !channel.reason);
 target.serviceProviders=[{providerId:source.provider.id,code:source.provider.code || source.provider.id,callId:target.modelId+'-test-provider',status:'已关联'}];
 return {state,model:target,data:{providerId:source.provider.id,catalogueModelId,channelIds:[channel.id],confirmedIdentity:true,expectedUpdatedAt:target.updatedAt}};
}
test('associating an existing channel creates a distinct verified mapping without sales or new prices',()=>{
 const {state,model,data}=association(), prices=structuredClone(state.modelSalePrices), providers=structuredClone(state.providers);
 const next=transact(state,'associateServiceChannels',model.id,data), rows=serviceSupplyRows(next,model);
 assert.equal(rows.length,1);assert.equal(rows[0].validationStatus,'通过');assert.equal(rows[0].salesEnabled,false);
 assert.deepEqual(next.modelSalePrices,prices);assert.deepEqual(next.providers,providers);
 assert.throws(()=>transact(next,'associateServiceChannels',model.id,{...data,expectedUpdatedAt:next.models.find(item=>item.id===model.id).updatedAt}),/已关联/);
});
test('channel association rejects stale models, foreign channels and missing identity confirmation',()=>{
 const {state,model,data}=association(), before=structuredClone(state);
 for(const patch of [{confirmedIdentity:false},{channelIds:['missing']},{expectedUpdatedAt:'old'}])assert.throws(()=>transact(state,'associateServiceChannels',model.id,{...data,...patch}));
 assert.deepEqual(state,before);model.serviceMode='';assert.throws(()=>transact(state,'associateServiceChannels',model.id,data),/配置服务模式/);
});
test('new price and association operations preserve permissions, revision and storage errors',()=>{
 for(const fixture of [(()=>{const {state,model}=setup();model.listingStatus='已下架';return {state,model,operation:'commercialPublish',data:{confirmed:true,kind:'price',value:{callId:model.modelId,items:pricing(state,model).items},expectedBase:commercialPriceBase(state,model)}};})(),{...association(),operation:'associateServiceChannels'}]){
  const {state,model,operation,data}=fixture, before=structuredClone(state), action={type:'modelOperations',operation,modelId:model.id,data};
  assert.throws(()=>commitAdminState({...state,currentRole:'运维人员'},action),/无权/);
  assert.throws(()=>persistModelAction(state,action,{getItem:()=>JSON.stringify({...state,revision:state.revision+1}),setItem:()=>assert.fail()}),/数据已变化/);
  assert.throws(()=>persistModelAction(state,action,{getItem:()=>JSON.stringify(state),setItem:()=>{throw Error('storage failed');}}),/storage failed/);
  assert.deepEqual(state,before);
 }
});

test('a unified model with no supplies explicitly maps an existing channel from routing',()=>{
 const {state,model,data}=association();model.serviceMode='standard';
 const before=structuredClone(state.modelSalePrices), next=transact(state,'associateServiceChannels',model.id,{...data,context:'routing'});
 const service=routingServices(next).find(item=>item.modelId===model.id);
 assert.equal(routingChannels(next,service).length,1);assert.equal(serviceSupplyRows(next,model)[0].salesEnabled,false);
 assert.deepEqual(next.modelSalePrices,before);assert.equal(next.serviceRoutes.length,state.serviceRoutes.length);
});

function createAdminSeed(...args) { return withAdminSession(baseCreateAdminSeed(...args)); }
function parseAdminState(...args) { return withAdminSession(baseParseAdminState(...args)); }

test('service list displays the same permanent entry ID as maintenance exports after a call rename', () => {
 const model = { id: 'service-config', modelId: 'call-before', serviceMode: 'standard', type: 'text' };
 const state = { models: [model], providers: [], modelTemplates: [], endpoints: [], modelSupplies: [], serviceRoutes: [], modelSalePrices: [], tariffDictionary: [], modelData: { resourceIds: { 'standard:service-config': 'model_service-56880aeb-c507-4949-9ef2-12420fa683fc' } } };
 const before = structuredClone(state);
 const rows = serviceDirectoryRows([model], state);
 assert.equal(rows[0].model_service_id, 'model_service-56880aeb-c507-4949-9ef2-12420fa683fc');
 assert.equal(rows[0].model_service_id, exportModelResources(state, 'services').rows[0].id);
 model.modelId = 'call-after';
 assert.equal(serviceDirectoryRows([model], state)[0].model_service_id, 'model_service-56880aeb-c507-4949-9ef2-12420fa683fc');
 model.modelId = 'call-before';
 assert.deepEqual(state, before);
});


test('list joins only the service channels and never substitutes connection IDs for channel IDs', () => {
 const model = { id: 'service-config', name: '模型服务', modelId: 'call', serviceMode: 'standard', type: 'text' };
 const provider = {id:'provider-a',name:'服务商 A',catalogConnections:[{id:'channel-a',endpointId:'connection-a',modelId:'source-model',upstreamModelId:'source-call',sourceName:'独立账号'}]};
 const state = {models:[model],providers:[provider],modelTemplates:[],endpoints:[{id:'connection-a',providerId:provider.id},{id:'connection-missing-id',providerId:provider.id}],modelSupplies:[{id:'supply-a',modelId:model.id,endpointId:'connection-a',upstreamModelId:'source-call',catalogueModelId:'source-model',status:'已启用'},{id:'supply-b',modelId:model.id,endpointId:'connection-missing-id',status:'已停用'},{id:'supply-removed',modelId:model.id,endpointId:'connection-a',status:'已移除'}]};
 const before=structuredClone(state), row=serviceDirectoryRows([model],state)[0];
 assert.deepEqual(row.channels,[{key:'channel-a',id:'channel-a',providerName:'服务商 A',name:'独立账号'},{key:'supply-b',id:'',providerName:'服务商 A',name:'连接名称未配置'}]);
 assert.deepEqual(row.endpoints.map(({method,protocol,path})=>[method,protocol,path]),[['POST','OpenAI Chat','/api/v1/chat/completions']]);
 model.serviceMode='provider';model.serviceProviders=[{providerId:'provider-a',channelId:'channel-a',channelName:'旧名称',callId:'entry-a'},{providerId:'provider-a',channelId:'channel-b',channelName:'另一个账号',callId:'entry-b'}];
 const rows=serviceDirectoryRows([model],state);
 assert.deepEqual(rows.map(row=>row.channels.map(channel=>channel.id)),[['channel-a'],['channel-b']]);assert.equal(new Set(rows.map(row=>row.model_service_id)).size,2);
 model.serviceMode=before.models[0].serviceMode;delete model.serviceProviders;assert.deepEqual(state,before);
});
