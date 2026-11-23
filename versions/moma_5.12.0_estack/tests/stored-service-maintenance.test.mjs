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
  state=providerRun(state,'channelSave',{name:`连接 ${index+1}`,origin:'direct',upstreamModelId:catalogueModelId,protocol:'OpenAI',baseUrl:`https://compact-${index}.example.invalid/v1/chat/completions`,scenarios:[{name:'输入',unit:'百万 Token',currency:'CNY',listPrice:'1.5'},{name:'输出',unit:'百万 Token',currency:'CNY',listPrice:'4'}]});
  let provider=state.providers.find(item=>item.id===providerId),channel=catalogueChannels(state,provider,catalogueModelId).find(item=>item.name===`连接 ${index+1}`);
  state=providerRun(state,'connectionKeys',{endpointId:channel.endpointId,apiKeys:[provider.apiKeys[0]],confirmed:true});
  state=providerRun(state,'channelTest',{channelId:channel.id,scenario:'success'});
  state=providerRun(state,'channelEnable',{channelId:channel.id});
 }
 state=create(state);let model=state.models.find(item=>item.id===state.audits[0].objectId);
 state=run(state,'associateServiceProvider',{providerId,expectedUpdatedAt:model.updatedAt},model.id);model=state.models.find(item=>item.id===model.id);
 const provider=state.providers.find(item=>item.id===providerId), channels=availableServiceChannels(state,provider,catalogueModelId).filter(item=>item.name.startsWith('连接 '));
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
