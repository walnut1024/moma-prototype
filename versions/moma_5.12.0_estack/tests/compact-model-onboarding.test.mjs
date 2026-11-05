import {serviceModelSources} from '../src/admin-v2/supply-models.js';
import { withAdminSession } from './admin-session-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdminSeed as baseCreateAdminSeed,commitAdminState,parseAdminState as baseParseAdminState,persistModelAction} from '../src/admin-v2/store.js';
import {modelAuthors,serviceModelDraft} from '../src/admin-v2/model-profile.js';
import {modelSupplies} from '../src/admin-v2/model-management.js';
import {availableServiceChannels} from '../src/admin-v2/service-workspace.js';
import {catalogueChannels} from '../src/admin-v2/provider-channels.js';
import {providerApiKeysDraft} from '../src/admin-v2/provider-management.js';
const run=(state,operation,data,modelId)=>commitAdminState(state,{type:'modelOperations',operation,modelId,data});
const input=state=>({libraryId:'template-compact-source',name:'独立模型',modelId:'custom-model-3',type:'text',author:modelAuthors(state)[0],releaseDate:'2026-10-25',inputModalities:['文本','图片'],outputModalities:['文本'],description:'独立创建模型资料，随后配置供给。',context:'1.5',contextUnit:'M',serviceMode:'provider'});
const create=state=>run(state,'createServiceModel',input(state));

test('metadata alone creates a delisted empty model, with exact context and no supplier or price effects',()=>{
 const state=createAdminSeed(), before=structuredClone(state), next=create(state), model=next.models.find(item=>item.id===next.audits[0].objectId);
 assert.equal(next.models.length,state.models.length+1);assert.equal(model.capabilities.context,1572864);
 assert.equal(model.listingStatus,'已下架');assert.equal(model.visibility,'内部');assert.equal(model.callsEnabled,false);assert.equal(model.serviceMode,'provider');
 assert.deepEqual(model.profile.inputModalities,['文本','图片']);assert.equal(model.profile.releaseDate,'2026-10-25');
 for(const key of ['providers','endpoints','modelSupplies','modelSalePrices','supplyPrices','modelTemplates','modelOnboardings','serviceRoutes'])assert.deepEqual(next[key],state[key],key);
 assert.deepEqual(state,before);assert.equal(parseAdminState(JSON.stringify(next)).models.find(item=>item.id===model.id).name,model.name);
});
test('all eight required metadata values reject blanks and forged single or multiple selections atomically',()=>{
 const state=createAdminSeed(), value=input(state), before=structuredClone(state);
 for(const patch of [{name:''},{modelId:''},{author:''},{releaseDate:''},{description:''},{type:''},{type:['text']},{type:'constructor'},{author:'未知作者'}, {releaseDate:'2026-02-30'}, {inputModalities:[]},{inputModalities:'文本'},{inputModalities:['文本','伪造']},{outputModalities:[]},{outputModalities:['伪造']},{serviceMode:['provider']}])assert.throws(()=>run(state,'createServiceModel',{...value,...patch}),JSON.stringify(patch));
 assert.deepEqual(state,before);
});
test('call identifiers accept catalogue punctuation and retain case-insensitive uniqueness',()=>{
 const state=createAdminSeed(), value=input(state);
 for(const modelId of ['中文','a b','a?b','a#b','a'.repeat(81)])assert.throws(()=>run(state,'createServiceModel',{...value,modelId}),/调用标识/);
 for(const modelId of ['author/model-3.1','a_b:free','123'])assert(run(state,'createServiceModel',{...value,modelId}));
 const next=run(state,'createServiceModel',{...value,modelId:'Custom-Model-3'});
 assert.throws(()=>run(next,'createServiceModel',{...value,libraryId:'template-compact-source-alt',modelId:'custom-model-3'}),/已存在/);
});
test('context is optional and K/M conversions are exact while invalid values never commit',()=>{
 const state=createAdminSeed(), value=input(state);
 for(const [context,contextUnit,tokens] of [['','K',null],['128','K',131072],['1','M',1048576],['0.5','K',512]]){
  const next=run(state,'createServiceModel',{...value,context,contextUnit});assert.equal(next.models.find(item=>item.id===next.audits[0].objectId).capabilities.context,tokens);
 }
 for(const patch of [{context:'0'},{context:'-1'},{context:'Infinity'},{context:'0.1',contextUnit:'K'},{context:'9007199254740991'},{contextUnit:'G'}])assert.throws(()=>run(state,'createServiceModel',{...value,...patch}),/上下文/);
});
test('imported visible metadata can be changed independently of source material, including vector output',()=>{
 const state=createAdminSeed(), source=state.modelTemplates.find(item=>item.id==='template-compact-source'), old=structuredClone(source);
 const next=run(state,'createServiceModel',{...serviceModelDraft(source),libraryId:source.id,modelId:'new-kimi-3',name:'独立修改名称',releaseDate:'2026-10-25',serviceMode:'standard'});
 assert.deepEqual(next.modelTemplates.find(item=>item.id===source.id),old);
 const vector=run(state,'createServiceModel',{...input(state),libraryId:'template-compact-vector',type:'embedding',modelId:'new-vector-3',outputModalities:['向量']});
 assert.deepEqual(vector.models.find(item=>item.id===vector.audits[0].objectId).profile.resultTypes,['向量']);
});
test('editing service metadata preserves ID, hidden user data and prices, and rejects stale changes',()=>{
 let state=create(createAdminSeed()), model=state.models.find(item=>item.id===state.audits[0].objectId);model.profile.family='用户已有资料';
 const value={...serviceModelDraft(model),modelId:'ignored-id',name:'更新名称',expectedUpdatedAt:model.updatedAt};
 const next=run(state,'serviceBasics',value,model.id), saved=next.models.find(item=>item.id===model.id);
 assert.equal(saved.modelId,model.modelId);assert.equal(saved.profile.family,'用户已有资料');assert.deepEqual(next.modelSalePrices,state.modelSalePrices);
 assert.throws(()=>run(state,'serviceBasics',{...value,expectedUpdatedAt:'stale'},model.id),/并发/);
 Object.assign(model,{listingStatus:'已上架',visibility:'公开',status:'运行中',callsEnabled:true});
 const listed=run(state,'serviceBasics',value,model.id),listedModel=listed.models.find(item=>item.id===model.id);
 assert.equal(listedModel.name,'更新名称');assert.equal(listedModel.modelId,model.modelId);assert.equal(listedModel.listingStatus,'已上架');assert.equal(listedModel.callsEnabled,true);
 for(const key of ['providers','endpoints','modelSupplies','modelSalePrices','serviceRoutes'])assert.deepEqual(listed[key],state[key],key);
});
test('editing a listed model capability delists it and invalidates affected supply checks without deleting history',()=>{
 const state=parseAdminState(null),model=state.models.find(item=>item.serviceReviewCase==='qwen'),before=structuredClone(state);
 assert.equal(model.listingStatus,'已上架');assert.ok(modelSupplies(state,model.id).length);
 const value={...serviceModelDraft(model),context:'256',contextUnit:'K',expectedUpdatedAt:model.updatedAt};
 const next=run(state,'serviceBasics',value,model.id),saved=next.models.find(item=>item.id===model.id);
 assert.equal(saved.listingStatus,'已下架');assert.equal(saved.callsEnabled,false);assert.equal(saved.capabilities.context,262144);
 for(const supply of modelSupplies(next,model.id)){assert.equal(supply.status,'已停用');assert.equal(supply.validationStatus,'待验证');assert.equal(supply.verifiedAt,null);assert.deepEqual(supply.validationCases,[]);}
 for(const key of ['providers','endpoints','modelSalePrices','supplyPrices','serviceRoutes'])assert.deepEqual(next[key],state[key],key);
 assert.deepEqual(state,before);
});
const providerId='provider-cmss',catalogueModelId='compact-source';
const providerRun=(state,operation,values)=>run(state,'provider',{operation,objectId:providerId,values:{modelId:catalogueModelId,...values}});
async function supplyFixture(){
 let state=createAdminSeed();const keys=await providerApiKeysDraft(['sk-compact-local-only-00000001']);state=providerRun(state,'addApiKeys',keys);
 for(let index=0;index<2;index++){
  state=providerRun(state,'channelSave',{name:`渠道 ${index+1}`,origin:'direct',upstreamModelId:catalogueModelId,protocol:'OpenAI',baseUrl:`https://compact-${index}.example.invalid/v1/chat/completions`,scenarios:[{name:'输入',unit:'百万 Token',currency:'CNY',listPrice:'1.5'},{name:'输出',unit:'百万 Token',currency:'CNY',listPrice:'4'}]});
  let provider=state.providers.find(item=>item.id===providerId),channel=catalogueChannels(state,provider,catalogueModelId).find(item=>item.name===`渠道 ${index+1}`);
  state=providerRun(state,'connectionKeys',{endpointId:channel.endpointId,apiKeys:[provider.apiKeys[0]],confirmed:true});
  state=providerRun(state,'channelTest',{channelId:channel.id,scenario:'success'});
  state=providerRun(state,'channelEnable',{channelId:channel.id});
 }
 state=create(state);let model=state.models.find(item=>item.id===state.audits[0].objectId);
 state=run(state,'associateServiceProvider',{providerId,expectedUpdatedAt:model.updatedAt},model.id);model=state.models.find(item=>item.id===model.id);
 const provider=state.providers.find(item=>item.id===providerId), channels=availableServiceChannels(state,provider,catalogueModelId).filter(item=>item.name.startsWith('渠道 '));
 assert.equal(channels.length,2);assert.ok(channels.every(item=>!item.reason));
 const data={providerId,catalogueModelId,expectedUpdatedAt:model.updatedAt,confirmedIdentity:true,channelIds:channels.map(channel=>channel.id)};
 return {state,model,data};
}
test('one association maps multiple existing channels without creating channel selling prices',async()=>{
 const {state,model,data}=await supplyFixture(), next=run(state,'associateServiceChannels',data,model.id), supplies=modelSupplies(next,model.id);
 assert.equal(supplies.length,2);assert.ok(supplies.every(item=>item.salesEnabled===false));
 assert.deepEqual(next.modelSalePrices,state.modelSalePrices);assert.deepEqual(next.providers,state.providers);
 assert.equal(next.models.find(item=>item.id===model.id).listingStatus,'已下架');
 assert.throws(()=>run(next,'associateServiceChannels',{...data,expectedUpdatedAt:next.models.find(item=>item.id===model.id).updatedAt},model.id),/已关联/);
});
test('foreign second channel, duplicate selection and unconfirmed mappings never partially associate',async()=>{
 const {state,model,data}=await supplyFixture(), before=structuredClone(state);
 for(const patch of [{confirmedIdentity:false},{expectedUpdatedAt:'old'},{channelIds:[data.channelIds[0],'missing']},{channelIds:[data.channelIds[0],data.channelIds[0]]}]) assert.throws(()=>run(state,'associateServiceChannels',{...data,...patch},model.id));
 assert.deepEqual(state,before);
});
test('new creation and channel association retain permission, stale storage and write failure protection',async()=>{
 const state=createAdminSeed(), supplier=await supplyFixture();
 for(const [current,action] of [[state,{type:'modelOperations',operation:'createServiceModel',data:input(state)}],[supplier.state,{type:'modelOperations',operation:'associateServiceChannels',modelId:supplier.model.id,data:supplier.data}]]){
  const before=structuredClone(current);assert.throws(()=>commitAdminState({...current,currentRole:'运维人员'},action),/无权/);
  assert.throws(()=>persistModelAction(current,action,{getItem:()=>JSON.stringify({...current,revision:current.revision+1}),setItem:()=>assert.fail()}),/数据已变化/);
  assert.throws(()=>persistModelAction(current,action,{getItem:()=>JSON.stringify(current),setItem:()=>{throw Error('quota');}}),/quota/);assert.deepEqual(current,before);
 }
});

function createAdminSeed(...args) {
 const state=withAdminSession(baseCreateAdminSeed(...args)),author=modelAuthors(state)[0];
 for(const [id,code,type]of [['template-compact-source','compact-source','text'],['template-compact-source-alt','compact-source-alt','text'],['template-compact-vector','compact-vector','embedding']]){
  state.modelTemplates.push({id,modelId:code,name:'已接入测试模型 '+code,type,maker:author,description:'资料主档',profile:{author,tasks:[type==='embedding'?'文本向量化':'对话'],inputModalities:['文本'],outputModalities:['文本']},capabilities:{context:131072}});
  for(const provider of state.providers.filter(p=>['provider-moma','provider-cmss'].includes(p.id))){provider.catalogModelIds=[...(provider.catalogModelIds || []),code];provider.catalogModels=[...(provider.catalogModels || []),{modelId:code,libraryId:id,type,name:code}];}
 }
 return state;
}
function parseAdminState(...args) { return withAdminSession(baseParseAdminState(...args)); }

test('service sources share the access model directory and reject missing or removed registrations atomically',()=>{
 const state=createAdminSeed(),before=structuredClone(state),source=state.modelTemplates.find(row=>row.id==='template-compact-source');
 state.modelTemplates.push({...structuredClone(source),id:'template-material-only',modelId:'material-only'});
 const sources=serviceModelSources(state);assert.equal(sources.filter(row=>row.id===source.id).length,1);assert(!sources.some(row=>row.id==='template-material-only'));
 for(const libraryId of ['',undefined,'missing','template-material-only'])assert.throws(()=>run(state,'createServiceModel',{...input(state),libraryId}),/已登记/);
 const detached=structuredClone(before);for(const provider of detached.providers){provider.catalogModelIds=(provider.catalogModelIds || []).filter(id=>id!=='compact-source');provider.catalogModels=(provider.catalogModels || []).filter(row=>row.libraryId!==source.id);}
 const detachedBefore=structuredClone(detached);assert.throws(()=>create(detached),/供应关系/);assert.deepEqual(detached,detachedBefore);
 const created=create(before);assert.equal(created.models.find(row=>row.id===created.audits[0].objectId).templateId,source.id);
});
