import { withAdminSession } from './admin-session-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdminSeed as baseCreateAdminSeed,commitAdminState,parseAdminState as baseParseAdminState,persistModelAction} from '../src/admin-v2/store.js';
import {providerApiKeysDraft} from '../src/admin-v2/provider-management.js';
import {serviceAssociationChannels,serviceSupplyRows} from '../src/admin-v2/service-workspace.js';

const run=(state,operation,modelId,data)=>commitAdminState(state,{type:'modelOperations',operation,modelId,data});
let prepared=createAdminSeed();
const model={...prepared.models[0],id:'unified-content-qa',name:'统一服务验证模型',serviceMode:'standard',listingStatus:'已下架'};
prepared.models.unshift(model);
for (const providerId of ['provider-deepseek-official','provider-moma']) {
  const catalogueModelId=providerId==='provider-moma'?'DeepSeek-V4-Flash-0731':'deepseek-v4-pro';
  const providerRun=(operation,values)=>{prepared=run(prepared,'provider',null,{operation,objectId:providerId,values:{modelId:catalogueModelId,...values}});};
  providerRun('addApiKeys',await providerApiKeysDraft(['sk-unified-content-local-test-000001']));
  for (let index=0;index<5;index++) {
    providerRun('channelSave',{name:`统一服务渠道 ${index+1}`,origin:'direct',upstreamModelId:catalogueModelId,protocol:'OpenAI',baseUrl:`https://${providerId}-${index}.example.invalid/v1/chat/completions`,scenarios:[{name:'输入',unit:'百万 Token',currency:'CNY',listPrice:'2'},{name:'输出',unit:'百万 Token',currency:'CNY',listPrice:'8'}]});
    const channel=serviceAssociationChannels(prepared).find(item=>item.provider.id===providerId && item.name===`统一服务渠道 ${index+1}`);
    providerRun('connectionKeys',{endpointId:channel.endpointId,apiKeys:[prepared.providers.find(item=>item.id===providerId).apiKeys[0]],confirmed:true});
    providerRun('channelTest',{channelId:channel.id,scenario:'success'});
    providerRun('channelEnable',{channelId:channel.id});
  }
}
const ready=state=>serviceAssociationChannels(state).filter(channel=>channel.name.startsWith('统一服务渠道 '));
const batch=state=>({groups:['provider-deepseek-official','provider-moma'].map(providerId=>({providerId,catalogueModelId:providerId==='provider-moma'?'DeepSeek-V4-Flash-0731':'deepseek-v4-pro',channelIds:ready(state).filter(channel=>channel.provider.id===providerId).map(channel=>channel.id)})),confirmedIdentity:true,expectedUpdatedAt:state.models.find(item=>item.id===model.id).updatedAt});

test('picker lists ten existing channels across suppliers with distinct selection identities without changing inventory',()=>{
  const before=structuredClone(prepared),channels=ready(prepared);
  assert.equal(channels.length,10);assert.equal(new Set(channels.map(channel=>channel.selectionId)).size,10);
  assert.ok(channels.every(channel=>!channel.reason));assert.deepEqual(prepared,before);
});
test('one batch associates ten channels across suppliers with a single commit and no price or route changes',()=>{
  const next=run(prepared,'associateServiceChannelsBatch',model.id,batch(prepared));
  assert.equal(next.revision,prepared.revision+1);assert.equal(next.audits.length,prepared.audits.length+1);
  for (const key of ['providers','modelSalePrices','serviceRoutes']) assert.deepEqual(next[key],prepared[key]);
  const resources=state=>state.endpoints.map(({id,baseUrl,apiKeys,credentialRef})=>({id,baseUrl,apiKeys,credentialRef}));
  assert.deepEqual(resources(next),resources(prepared));
  const refreshed=parseAdminState(JSON.stringify(next)),rows=serviceSupplyRows(refreshed,refreshed.models.find(item=>item.id===model.id));
  assert.equal(rows.length,10);assert.equal(new Set(rows.map(row=>row.channelId)).size,10);assert.ok(rows.every(row=>row.cost.items.length===2));
});
test('invalid later group, duplicates, limits, stale revisions and unconfirmed identity reject the whole batch',()=>{
  const data=batch(prepared),before=structuredClone(prepared);
  for (const patch of [{groups:[data.groups[0],{...data.groups[1],channelIds:['missing']}]},{groups:[data.groups[0],data.groups[0]]},{groups:[{...data.groups[0],channelIds:Array(21).fill(data.groups[0].channelIds[0])}]},{groups:[]},{groups:[{}]},{confirmedIdentity:false},{expectedUpdatedAt:'stale'}]) assert.throws(()=>run(prepared,'associateServiceChannelsBatch',model.id,{...data,...patch}));
  assert.deepEqual(prepared,before);
});
test('batch preserves role, service mode and storage concurrency protections',()=>{
  const action={type:'modelOperations',operation:'associateServiceChannelsBatch',modelId:model.id,data:batch(prepared)};
  assert.throws(()=>commitAdminState({...prepared,currentRole:'运维人员'},action),/无权/);
  const differentMode=structuredClone(prepared);differentMode.models.find(item=>item.id===model.id).serviceMode='provider';
  assert.throws(()=>commitAdminState(differentMode,action),/统一服务/);
  assert.throws(()=>persistModelAction(prepared,action,{getItem:()=>JSON.stringify({...prepared,revision:prepared.revision+1}),setItem:()=>assert.fail()}),/数据已变化/);
  assert.throws(()=>persistModelAction(prepared,action,{getItem:()=>JSON.stringify(prepared),setItem:()=>{throw Error('quota');}}),/quota/);
});

function createAdminSeed(...args) { return withAdminSession(baseCreateAdminSeed(...args)); }
function parseAdminState(...args) { return withAdminSession(baseParseAdminState(...args)); }
