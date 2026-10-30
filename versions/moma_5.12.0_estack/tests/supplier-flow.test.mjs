import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAdminState, commitAdminState } from '../src/admin-v2/store.js';
import { catalogueChannels, channelCheckCurrent, channelInterfaceIssue, modelApiExample } from '../src/admin-v2/provider-channels.js';
import { connectionTestPassed } from '../src/admin-v2/connection-state.js';
import { supplierModelTestPreview, providerApiKeysDraft } from '../src/admin-v2/provider-management.js';
const owner = s => s.providers.find(p => p.id === 'provider-moma');
const run = (s, operation, values, id = 'provider-moma') => commitAdminState(s, {type:'modelOperations', operation:'provider', data:{operation,objectId:id,values}});
const channel = s => catalogueChannels(s, owner(s), 'GLM-5.2')[0];
const args = c => ({modelId:c.modelId,endpointId:c.endpointId,associationId:c.id});
const unchangedServices = (a,b) => {for (const k of ['models','modelSupplies','modelSalePrices','supplyPrices','serviceRoutes']) assert.deepEqual(b[k],a[k],k);};

test('one model-channel test checks both levels without activating a stopped channel or changing services', () => {
 let s = parseAdminState(null), c = channel(s);
 s = run(s,'supplierChannelSave',{endpointId:c.endpointId,mode:'address',protocol:'OpenAI',baseUrl:'https://changed.example.invalid/v1/chat/completions',confirmed:true});
 c = channel(s); const t=run(s,'supplierModelTest',args(c)), checked=channel(t);
 assert.ok(connectionTestPassed(checked.endpoint)); assert.ok(channelCheckCurrent(checked));
 assert.equal(checked.health.result,'通过'); assert.equal(checked.enabled,false);assert.equal(checked.endpoint.status,'停用'); unchangedServices(s,t);
 const enabled=run(t,'supplierModelEnable',args(checked));assert.equal(channel(enabled).enabled,true);assert.equal(channel(enabled).endpoint.status,'运行中');unchangedServices(t,enabled);
});

test('incompatible model interface overrides stale success and cannot be tested or enabled', () => {
 const s=parseAdminState(null); owner(s).catalogModels.find(row=>row.modelId==='GLM-5.2').type='embedding'; const c=channel(s);
 assert.match(channelInterfaceIssue(owner(s),c),/Chat Completions/);
 for (const operation of ['supplierModelTest','supplierModelEnable']) assert.throws(()=>run(s,operation,args(c)),/Chat Completions/);
 assert.equal(modelApiExample('embedding'),'https://api.example.com/v1/embeddings');
 assert.equal(modelApiExample('rerank'),'https://api.example.com/v1/rerank');
});

test('invalid addresses cannot be newly saved for a model or shared with incompatible models',()=>{
 const s=parseAdminState(null), c=channel(s);
 assert.throws(()=>run(s,'supplierChannelSave',{endpointId:c.endpointId,mode:'address',protocol:'OpenAI',baseUrl:'https://changed.example.invalid/v1/embeddings',confirmed:true}),/Embeddings/);
 const master=s.models.find(row=>row.type==='embedding');
 assert.throws(()=>run(s,'supplierChannelCreate',{name:'invalid vector',baseUrl:'https://v.example.invalid/v1/chat/completions',keyGroupId:'default',models:[{libraryId:master.id,upstreamModelId:'vec',scenarios:[]}]}),/Chat Completions/);
});

test('temporary group preview does not mutate saved keys, health, activation or routes',async()=>{
 let s=parseAdminState(null);
 s=run(s,'keyGroupSave',{name:'临时检测'});const group=owner(s).apiKeyGroups.find(row=>row.name==='临时检测');
 s=run(s,'addApiKeys',{...await providerApiKeysDraft(['test-only-temporary-group-123456']),groupId:group.id});
 const before=structuredClone(s),c=channel(s);
 const result=supplierModelTestPreview(s,owner(s).id,c.id,c.modelId,group.id);
 assert.equal(result.result,'通过');assert.deepEqual(s,before);
 assert.throws(()=>run(s,'supplierModelTest',{...args(c),keyGroupId:group.id}),/临时密钥组/);
 assert.throws(()=>supplierModelTestPreview(s,owner(s).id,c.id,c.modelId,'foreign-group'),/当前供应商/);
});

test('empty and disabled primary groups cannot be used for temporary tests',()=>{
 let s=parseAdminState(null);s=run(s,'keyGroupSave',{name:'空组'});const c=channel(s),id=owner(s).apiKeyGroups.find(row=>row.name==='空组').id;
 assert.throws(()=>supplierModelTestPreview(s,owner(s).id,c.id,c.modelId,id),/主要密钥/);
 const key=owner(s).apiKeys[0];s=run(s,'toggleApiKey',{keyId:key.id,expectedFingerprint:key.fingerprint,enabled:false,confirmed:true});
 assert.throws(()=>run(s,'supplierModelTest',args(channel(s))),/凭证/);
 assert.throws(()=>run(s,'supplierModelEnable',args(channel(s))),/凭证/);
});

test('stale health and disabled supplier cannot be used to enable a channel',()=>{
 let s=parseAdminState(null),c=channel(s);
 s=run(s,'supplierChannelSave',{endpointId:c.endpointId,mode:'address',protocol:'OpenAI',baseUrl:'https://new.example.invalid/v1/chat/completions',confirmed:true});
 assert.throws(()=>run(s,'supplierModelEnable',args(channel(s))),/测试/);
 s=run(s,'supplierModelTest',args(channel(s)));
 s={...s,providers:s.providers.map(p=>p.id===owner(s).id?{...p,status:'已停用'}:p)};
 assert.throws(()=>run(s,'supplierModelEnable',args(channel(s))),/启用供应商/);
});

test('supplier remarks allow concise notes but reject over-limit input',()=>{
 const s=parseAdminState(null);const values={name:'简短备注供应商',code:'short-note',sourceType:'thirdParty',description:'仅用于内部接入'};
 const added=run(s,'create',values);assert.ok(added.providers.some(p=>p.code==='short-note'&&p.description===values.description));
 assert.throws(()=>run(s,'create',{...values,description:'字'.repeat(2001)}),/2000/);
});
