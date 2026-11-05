import { legacySupplierState } from './legacy-supplier-fixture.mjs';
import { withAdminSession } from './admin-session-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAdminState as baseParseAdminState, createAdminSeed as baseCreateAdminSeed, commitAdminState, persistModelAction } from '../src/admin-v2/store.js';
import { displayedCatalogueIds } from '../src/admin-v2/moma-provider.js';
import { supplierChannelResources, supplierChannelAssociations, supplierKeyChannels } from '../src/admin-v2/supplier-resources.js';
import { connectionKeys, connectionCredentialsReady, connectionTestPassed } from '../src/admin-v2/connection-state.js';
import { catalogueChannels, channelAddresses } from '../src/admin-v2/provider-channels.js';
import { prepareSupplierReviewCases } from '../src/admin-v2/supplier-review-cases.js';
import { providerApiKeysDraft, providerApiKeyRows } from '../src/admin-v2/provider-management.js';
const owner = (s,id='provider-moma') => s.providers.find(row=>row.id===id);
const endpoint = (s,code) => s.endpoints.find(row=>row.channelCode===code);
const action = (operation,values,providerId='provider-moma') => ({type:'modelOperations',operation:'provider',data:{operation,objectId:providerId,values}});
const run = (s,op,data,id) => commitAdminState(s,action(op,data,id));
const price = n => [{name:'输入 Token',listPrice:String(n),unit:'百万 Token',currency:'CNY'}];
const unchangedServices=(a,b)=>{for(const k of ['models','modelSupplies','modelSalePrices','supplyPrices','serviceRoutes'])assert.deepEqual(b[k],a[k],k);};

test('five cases express shared channels and missing credentials without adding extra supplier resources',()=>{
 const s=legacySupplierState();
 for(const [id,models,channels,links,keys]of [['provider-moma',5,2,4,3],['provider-deepseek-official',1,1,1,1],['provider-ark-official',2,3,4,3],['provider-kimi-official',1,1,1,0],['provider-zhipu-direct',2,0,0,0]]){
  const p=owner(s,id);assert.equal(displayedCatalogueIds(p,s).length,models);assert.equal(supplierChannelResources(s,p).length,channels);assert.equal(supplierChannelAssociations(s,p).length,links);assert.equal(p.apiKeys.length,keys);
 }
 assert.equal(supplierChannelAssociations(s,owner(s),endpoint(s,'CH-001').id).length,2);
 assert.equal(supplierKeyChannels(s,owner(s),'KEY-001').length,1);
 assert.equal(providerApiKeyRows(s,owner(s)).find(row=>row.apiKey.id==='KEY-001').endpoints.length,1);
 assert.equal(connectionKeys(endpoint(s,'CH-202'),owner(s,'provider-ark-official'))[0].id,'KEY-202');
 const restored=parseAdminState(JSON.stringify(s));
 for(const p of s.providers.filter(row=>row.supplierReviewModelIds))assert.equal(supplierChannelResources(restored,owner(restored,p.id)).length,supplierChannelResources(s,p).length);
});

test('one endpoint can serve several models while each model-channel association has its own quote',()=>{
 const s=legacySupplierState(),ep=endpoint(s,'CH-001'),p=owner(s),before=structuredClone(s);
 const next=run(s,'supplierAssociationSave',{modelId:'Kimi/miKimi-K3',endpointId:ep.id,upstreamModelId:'kimi-k3',scenarios:price(2)});
 assert.equal(supplierChannelResources(next,owner(next)).length,2);assert.equal(supplierChannelAssociations(next,owner(next)).length,5);
 assert.equal(catalogueChannels(next,owner(next),'DeepSeek-V4-Flash-0731')[0].pricing.scenarios[0].listPrice,1500000);
 assert.equal(catalogueChannels(next,owner(next),'Kimi/miKimi-K3').find(row=>row.endpointId===ep.id).pricing.scenarios[0].listPrice,2000000);
 assert.deepEqual(next.endpoints,s.endpoints);assert.deepEqual(s,before);unchangedServices(s,next);
 assert.throws(()=>run(next,'supplierAssociationSave',{modelId:'DeepSeek-V4-Flash-0731',endpointId:ep.id,upstreamModelId:'deepseek-flash',scenarios:price(1)}),/已关联/);
 assert.equal(supplierKeyChannels(next,p,'KEY-001').length,1);
});

test('unlinking a model retains the reusable channel and sibling associations; referenced services block unlink',()=>{
 const s=legacySupplierState(),p=owner(s),ep=endpoint(s,'CH-001'),link=catalogueChannels(s,p,'GLM-5.2').find(row=>row.endpointId===ep.id);
 const values={modelId:link.modelId,endpointId:ep.id,associationId:link.id,confirmed:true};
 const next=run(s,'supplierAssociationRemove',values);
 assert.equal(supplierChannelResources(next,owner(next)).length,2);assert.equal(catalogueChannels(next,owner(next),'DeepSeek-V4-Flash-0731').length,1);assert.equal(catalogueChannels(next,owner(next),'GLM-5.2').length,1);
 assert.throws(()=>run(next,'supplierChannelDelete',{endpointId:ep.id,confirmed:true}),/引用/);
 const blocked=structuredClone(s);blocked.modelSupplies.push({id:'protected',endpointId:ep.id,providerId:p.id,modelId:s.models[0].id,catalogueModelId:link.modelId,upstreamModelId:link.upstreamModelId,status:'已启用'});
 assert.throws(()=>run(blocked,'supplierAssociationRemove',values),/模型服务/);
 assert.throws(()=>run(s,'supplierAssociationRemove',{...values,endpointId:endpoint(s,'CH-002').id}),/不匹配/);
});

test('default key rotation invalidates only inherited channels and all of their model associations',()=>{
 const s=legacySupplierState(),p=owner(s),ep=endpoint(s,'CH-001'),other=endpoint(s,'CH-002'),key=p.apiKeys.find(row=>row.id==='KEY-002');
 const v={keyId:key.id,expectedFingerprint:key.fingerprint};
 assert.throws(()=>run(s,'defaultApiKey',v),/确认/);
 const next=run(s,'defaultApiKey',{...v,confirmed:true});
 assert.equal(connectionKeys(endpoint(next,'CH-001'),owner(next))[0].id,'KEY-002');
 assert.equal(connectionTestPassed(endpoint(next,'CH-001')),false);
 assert.ok(supplierChannelAssociations(next,owner(next),ep.id).every(row=>!row.enabled&&!row.health));
 assert.deepEqual(endpoint(next,'CH-002'),other);
 assert.equal(supplierKeyChannels(next,owner(next),'KEY-001').length,0);assert.equal(supplierKeyChannels(next,owner(next),'KEY-002').length,1);
 unchangedServices(s,next);
});

test('key replacement and disable invalidate resolved references while preserving masked storage and prices',async()=>{
 const s=legacySupplierState(),p=owner(s),key=p.apiKeys[0],draft=await providerApiKeysDraft(['test-supplier-rotation-local-only-1234']);
 const replaced=run(s,'editApiKey',{keyId:key.id,expectedFingerprint:key.fingerprint,apiKey:draft.apiKeys[0],confirmed:true});
 assert.equal(owner(replaced).apiKeys[0].id,key.id);assert.notEqual(owner(replaced).apiKeys[0].fingerprint,key.fingerprint);
 assert.ok(supplierChannelAssociations(replaced,owner(replaced),endpoint(s,'CH-001').id).every(row=>!row.health));
 assert.ok(!JSON.stringify(replaced).includes('test-supplier-rotation-local-only-1234'));
 const vip=p.apiKeys.find(row=>row.id==='KEY-003'),disabled=run(s,'toggleApiKey',{keyId:vip.id,expectedFingerprint:vip.fingerprint,enabled:false,confirmed:true});
 assert.equal(connectionCredentialsReady(endpoint(disabled,'CH-002'),owner(disabled)),false);
 assert.equal(supplierKeyChannels(disabled,owner(disabled),vip.id).length,1);assert.deepEqual(endpoint(disabled,'CH-001'),endpoint(s,'CH-001'));
 unchangedServices(s,replaced);unchangedServices(s,disabled);
});

test('missing Kimi credentials guide configuration, and the first added key is inherited by the channel',async()=>{
 const s=legacySupplierState(),id='provider-kimi-official',ep=endpoint(s,'CH-301');
 assert.equal(connectionCredentialsReady(ep,owner(s,id)),false);
 assert.throws(()=>run(s,'supplierChannelTest',{endpointId:ep.id},id),/凭证/);
 const keys=await providerApiKeysDraft(['test-kimi-local-only-987654']);
 const added=run(s,'addApiKeys',keys,id);
 assert.equal(connectionKeys(endpoint(added,'CH-301'),owner(added,id)).length,1);
 const channel=catalogueChannels(added,owner(added,id),'kimi-k2')[0];
 assert.throws(()=>run(added,'channelTest',{modelId:channel.modelId,channelId:channel.id,scenario:'success'},id),/连接测试并启用渠道/);
 const tested=run(added,'supplierChannelTest',{endpointId:ep.id},id);
 assert.equal(connectionTestPassed(endpoint(tested,'CH-301')),true);
 assert.throws(()=>run(tested,'channelEnable',{modelId:channel.modelId,channelId:channel.id},id),/连接测试并启用渠道/);
 const enabled=run(tested,'supplierChannelEnable',{endpointId:ep.id},id);
 const associationTested=run(enabled,'channelTest',{modelId:channel.modelId,channelId:channel.id,scenario:'success'},id);
 const complete=run(associationTested,'channelEnable',{modelId:channel.modelId,channelId:channel.id},id);
 assert.equal(catalogueChannels(complete,owner(complete,id),channel.modelId)[0].enabled,true);
 assert.equal(connectionTestPassed(endpoint(complete,'CH-301')),true);
});

test('create resource separately, then associate a Zhipu model without duplicating the endpoint',()=>{
 const s=legacySupplierState(),id='provider-zhipu-direct';
 const created=run(s,'supplierChannelSave',{name:'新增渠道',protocol:'OpenAI',baseUrl:'https://zhipu.example.invalid/v1/chat/completions',authMode:'inherit'},id);
 const ep=supplierChannelResources(created,owner(created,id))[0];
 assert.equal(supplierChannelAssociations(created,owner(created,id)).length,0);
 const linked=run(created,'supplierAssociationSave',{modelId:'glm-4-7',endpointId:ep.id,upstreamModelId:'glm-4.7',scenarios:price(0)},id);
 assert.equal(supplierChannelResources(linked,owner(linked,id)).length,1);assert.equal(supplierChannelAssociations(linked,owner(linked,id)).length,1);
 const newModel=run(linked,'supplierModelAdd',{libraryId:'model-3'},id);
 assert.equal(supplierChannelResources(newModel,owner(newModel,id)).length,1);assert.equal(catalogueChannels(newModel,owner(newModel,id),'kimi-k2.6').length,0);
});

test('supplier registration places its first key in the central library and makes the initial channel inherit it',async()=>{
 const s=legacySupplierState(),keys=await providerApiKeysDraft(['test-registration-local-only-443322']);
 const next=commitAdminState(s,{type:'modelOperations',operation:'providerRegistration',data:{provider:{name:'新增供应商',code:'supplier-new-review',sourceType:'thirdParty',description:''},connections:[{name:'初始渠道',protocol:'OpenAI',baseUrl:'https://new.example.invalid/v1/chat/completions',apiKeys:keys.apiKeys,timeoutSeconds:60}]}});
 const p=next.providers.find(row=>row.code==='supplier-new-review'),ep=supplierChannelResources(next,p)[0];
 assert.equal(p.defaultApiKeyId,p.apiKeys[0].id);assert.equal(p.apiKeys[0].fingerprint,keys.apiKeys[0].fingerprint);assert.equal(ep.authMode,'inherit');assert.equal(connectionKeys(ep,p)[0].id,p.defaultApiKeyId);assert.equal(supplierKeyChannels(next,p,p.defaultApiKeyId).length,1);
});

test('editing a shared channel affects all mappings after confirmation and name-only changes preserve validation',()=>{
 const s=legacySupplierState(),ep=endpoint(s,'CH-001'),v={endpointId:ep.id,name:ep.name,protocol:ep.protocol,baseUrl:'https://new.example.invalid/v1/chat/completions',authMode:'inherit'};
 assert.throws(()=>run(s,'supplierChannelSave',v),/确认共享/);
 const next=run(s,'supplierChannelSave',{...v,confirmed:true});
 assert.equal(supplierChannelAssociations(next,owner(next),ep.id).length,2);assert.ok(supplierChannelAssociations(next,owner(next),ep.id).every(row=>!row.health&&!row.enabled));
 assert.ok(catalogueChannels(next,owner(next),'DeepSeek-V4-Flash-0731')[0].apiAddresses[0].baseUrl.includes('new.example.invalid'));
 const renamed=run(s,'supplierChannelSave',{...v,baseUrl:ep.baseUrl,name:'生产渠道改名'});
 assert.ok(connectionTestPassed(endpoint(renamed,'CH-001')));assert.equal(catalogueChannels(renamed,owner(renamed),'DeepSeek-V4-Flash-0731')[0].name,'生产渠道改名');
 const renamedEndpoint=endpoint(renamed,'CH-001'),references=supplierChannelAssociations(s,owner(s),ep.id);
 assert.equal(renamedEndpoint.id,ep.id);assert.equal(renamedEndpoint.channelCode,ep.channelCode);
 assert.deepEqual(renamedEndpoint.connectionTest,ep.connectionTest);assert.equal(renamedEndpoint.status,ep.status);
 for(const reference of references){
  const current=catalogueChannels(renamed,owner(renamed),reference.modelId).find(row=>row.id===reference.id);
  assert.equal(current.name,'生产渠道改名');assert.equal(current.endpointId,ep.id);assert.deepEqual(current.pricing,reference.pricing);
 }
 unchangedServices(s,renamed);
});

test('editing one model-channel tariff, unit and free price preserves sibling models and other channels',()=>{
 const s=legacySupplierState(),id='provider-ark-official',p=owner(s,id),ep=endpoint(s,'CH-201');
 const target=catalogueChannels(s,p,'doubao-pro').find(row=>row.endpointId===ep.id),before=structuredClone(s);
 const scenarios=[{name:'缓存读取',condition:'命中缓存',listPrice:'0',unit:'千 Token',currency:'CNY'}];
 const next=run(s,'channelPrice',{modelId:target.modelId,channelId:target.id,scenarios},id);
 const current=catalogueChannels(next,owner(next,id),target.modelId).find(row=>row.id===target.id);
 assert.deepEqual(current.pricing.scenarios,[{...scenarios[0],listPrice:0}]);
 assert.equal(current.id,target.id);assert.equal(current.upstreamModelId,target.upstreamModelId);assert.equal(current.endpointId,ep.id);
 for(const reference of supplierChannelAssociations(s,p).filter(row=>row.id!==target.id)){
  const sibling=catalogueChannels(next,owner(next,id),reference.modelId).find(row=>row.id===reference.id);
  assert.deepEqual(sibling,reference);
 }
 assert.deepEqual(next.endpoints,s.endpoints);unchangedServices(s,next);assert.deepEqual(s,before);
});

test('focused channel information edits preserve legacy credential references and key pools exactly',()=>{
 for(const keyPool of [false,true]){
  const s=legacySupplierState(),id='provider-ark-official',p=owner(s,id),ep=endpoint(s,'CH-201');
  delete ep.authMode;delete ep.apiKeyId;delete ep.supplierChannel;
  ep.credentialRef=keyPool?'':'env:LEGACY_CHANNEL_KEY';ep.apiKeys=keyPool?structuredClone(p.apiKeys.slice(0,2)):[];
  const before=structuredClone(s),name='只修改渠道名称';
  const next=run(s,'supplierChannelSave',{mode:'info',endpointId:ep.id,name,authMode:'inherit',apiKeyId:''},id);
  assert.deepEqual(endpoint(next,'CH-201'),{...ep,name,updatedAt:endpoint(next,'CH-201').updatedAt});
  assert.deepEqual(owner(next,id).catalogConnections,p.catalogConnections.map(row=>row.endpointId===ep.id&&!row.deletedAt?{...row,name}:row));
  assert.deepEqual(owner(next,id).apiKeys,p.apiKeys);assert.equal(owner(next,id).defaultApiKeyId,p.defaultApiKeyId);
  unchangedServices(s,next);assert.deepEqual(s,before);
 }
});

test('focused address edits retain legacy authentication and secondary addresses while invalidating shared checks',()=>{
 for(const keyPool of [false,true]){
  const s=legacySupplierState(),id='provider-ark-official',p=owner(s,id),ep=endpoint(s,'CH-201');
  delete ep.authMode;delete ep.apiKeyId;delete ep.supplierChannel;
  ep.credentialRef=keyPool?'':'env:LEGACY_CHANNEL_KEY';ep.apiKeys=keyPool?structuredClone(p.apiKeys.slice(0,2)):[];
  const secondary={protocol:'Anthropic',baseUrl:'https://legacy.example.invalid/v1/messages'};
  for(const row of p.catalogConnections.filter(row=>row.endpointId===ep.id))row.apiAddresses=[{protocol:ep.protocol,baseUrl:ep.baseUrl},secondary];
  const before=structuredClone(s),baseUrl='https://changed.example.invalid/v1/chat/completions';
  const values={mode:'address',endpointId:ep.id,protocol:ep.protocol,baseUrl,name:'不应修改名称',authMode:'inherit',apiKeyId:''};
  assert.throws(()=>run(s,'supplierChannelSave',values,id),/确认共享/);
  const next=run(s,'supplierChannelSave',{...values,confirmed:true},id),saved=endpoint(next,'CH-201');
  assert.equal(saved.id,ep.id);assert.equal(saved.channelCode,ep.channelCode);assert.equal(saved.name,ep.name);assert.equal(saved.baseUrl,baseUrl);
  assert.equal(saved.credentialRef,ep.credentialRef);assert.deepEqual(saved.apiKeys,ep.apiKeys);assert.equal(saved.authMode,ep.authMode);assert.equal(saved.apiKeyId,ep.apiKeyId);
  assert.equal(saved.connectionTest,null);assert.equal(saved.status,'停用');
  for(const reference of supplierChannelAssociations(s,p,ep.id)){
   const current=catalogueChannels(next,owner(next,id),reference.modelId).find(row=>row.id===reference.id);
   assert.deepEqual(channelAddresses(owner(next,id),current),[{protocol:ep.protocol,baseUrl},secondary]);
   assert.equal(current.health,null);assert.equal(current.enabled,false);assert.deepEqual(current.pricing,reference.pricing);
  }
  assert.deepEqual(endpoint(next,'CH-202'),endpoint(s,'CH-202'));assert.deepEqual(owner(next,id).apiKeys,p.apiKeys);
  unchangedServices(s,next);assert.deepEqual(s,before);
  assert.throws(()=>run(s,'supplierChannelSave',{...values,protocol:'Anthropic',confirmed:true},id),/每种协议只能配置一个/);
 }
});

test('saving an unchanged focused address preserves modern channel authentication and validation',()=>{
 const s=legacySupplierState(),ep=endpoint(s,'CH-201'),id='provider-ark-official';
 const next=run(s,'supplierChannelSave',{mode:'address',endpointId:ep.id,protocol:ep.protocol,baseUrl:ep.baseUrl},id);
 assert.deepEqual(next.endpoints,s.endpoints.map(row=>row.id===ep.id?{...row,updatedAt:endpoint(next,'CH-201').updatedAt}:row));
 assert.deepEqual(owner(next,id),owner(s,id));unchangedServices(s,next);
});

test('focused key changes preserve legacy channel identity, hidden fields and secondary protocols',()=>{
 for(const authMode of ['inherit','specific']){
  const s=legacySupplierState(),id='provider-ark-official',p=owner(s,id),ep=endpoint(s,'CH-201');
  delete ep.authMode;delete ep.apiKeyId;delete ep.supplierChannel;
  ep.credentialRef='env:LEGACY_CHANNEL_KEY';ep.apiKeys=structuredClone(p.apiKeys.slice(0,2));
  const secondary={protocol:'Anthropic',baseUrl:'https://legacy.example.invalid/v1/messages'};
  for(const row of p.catalogConnections.filter(row=>row.endpointId===ep.id))row.apiAddresses=[{protocol:ep.protocol,baseUrl:ep.baseUrl},secondary];
  const before=structuredClone(s),values={mode:'credentials',endpointId:ep.id,authMode,apiKeyId:'KEY-202',name:'不应修改名称',protocol:'Anthropic',baseUrl:'invalid-url',capacity:999,timeoutSeconds:1};
  assert.throws(()=>run(s,'supplierChannelSave',values,id),/确认共享/);
  const next=run(s,'supplierChannelSave',{...values,confirmed:true},id),saved=endpoint(next,'CH-201');
  assert.deepEqual(saved,{...ep,authMode,apiKeyId:authMode==='specific'?'KEY-202':'',apiKeys:[],credentialRef:'',credentialVersion:saved.credentialVersion,connectionTest:null,status:'停用',updatedAt:saved.updatedAt});
  assert.equal(connectionKeys(saved,owner(next,id))[0].id,authMode==='specific'?'KEY-202':p.defaultApiKeyId);
  for(const reference of supplierChannelAssociations(s,p,ep.id)){
   const current=catalogueChannels(next,owner(next,id),reference.modelId).find(row=>row.id===reference.id);
   assert.deepEqual(channelAddresses(owner(next,id),current),channelAddresses(p,reference));
   assert.equal(current.name,reference.name);assert.deepEqual(current.pricing,reference.pricing);assert.equal(current.enabled,false);assert.equal(current.health,null);
  }
  assert.deepEqual(endpoint(next,'CH-202'),endpoint(s,'CH-202'));assert.deepEqual(owner(next,id).apiKeys,p.apiKeys);
  unchangedServices(s,next);assert.deepEqual(s,before);
 }
});

test('cross-supplier keys and resources, incomplete URLs and invalid association prices cannot be persisted',()=>{
 const s=legacySupplierState(),ep=endpoint(s,'CH-001'),before=structuredClone(s);
 assert.throws(()=>run(s,'supplierChannelSave',{name:'错误',protocol:'OpenAI',baseUrl:'https://x.example.invalid/v1/chat/completions',authMode:'specific',apiKeyId:'KEY-201'}),/当前供应商/);
 assert.throws(()=>run(s,'supplierChannelSave',{name:'错误',protocol:'OpenAI',baseUrl:'https://x.example.invalid/v1',authMode:'inherit'}),/完整接口/);
 assert.throws(()=>run(s,'supplierAssociationSave',{modelId:'DeepSeek-V4-Flash-0731',endpointId:endpoint(s,'CH-101').id,upstreamModelId:'deepseek-flash',scenarios:price(1)}),/当前供应商/);
 assert.throws(()=>run(s,'supplierAssociationSave',{modelId:'Kimi/miKimi-K3',endpointId:ep.id,upstreamModelId:'bad id',scenarios:price(1)}),/空白/);
 assert.throws(()=>run(s,'supplierAssociationSave',{modelId:'Kimi/miKimi-K3',endpointId:ep.id,upstreamModelId:'ok',scenarios:[{...price(1)[0],listPrice:''}]}),/完整采购价/);
 assert.deepEqual(s,before);
});

test('existing endpoint-only credentials can be selected into the supplier library without losing their identity',async()=>{
 const s=legacySupplierState(),p=owner(s),keys=await providerApiKeysDraft(['test-legacy-local-only-556677']);
 keys.apiKeys[0].id='legacy-key-local';
 const legacy={id:'legacy-endpoint',providerId:p.id,name:'旧渠道',protocol:'OpenAI',baseUrl:'https://old.example.invalid/v1/chat/completions',apiKeys:keys.apiKeys,status:'停用'};
 s.endpoints.push(legacy);p.catalogConnections.push({id:'legacy-link',modelId:'Kimi/miKimi-K3',endpointId:legacy.id,upstreamModelId:'kimi-old'});
 const next=run(s,'supplierChannelSave',{endpointId:legacy.id,name:legacy.name,protocol:legacy.protocol,baseUrl:legacy.baseUrl,authMode:'specific',apiKeyId:keys.apiKeys[0].id,confirmed:true});
 assert.deepEqual(owner(next).apiKeys.find(row=>row.id===keys.apiKeys[0].id),keys.apiKeys[0]);
 assert.equal(connectionKeys(next.endpoints.find(row=>row.id===legacy.id),owner(next))[0].id,keys.apiKeys[0].id);
});

test('live service mappings protect upstream identity while pricing remains editable; supplier status gates channel enable',()=>{
 const s=legacySupplierState(),p=owner(s),ep=endpoint(s,'CH-001'),link=catalogueChannels(s,p,'DeepSeek-V4-Flash-0731')[0];
 s.modelSupplies.push({id:'live-map',providerId:p.id,endpointId:ep.id,catalogueModelId:link.modelId,upstreamModelId:link.upstreamModelId,status:'已启用'});
 const values={associationId:link.id,endpointId:ep.id,modelId:link.modelId,upstreamModelId:'different-upstream',scenarios:price(1)};
 assert.throws(()=>run(s,'supplierAssociationSave',values),/先解除服务映射/);
 const next=run(s,'supplierAssociationSave',{...values,upstreamModelId:link.upstreamModelId});
 assert.deepEqual(next.modelSupplies,s.modelSupplies);
 assert.throws(()=>run(s,'supplierModelAdd',{libraryId:'missing'}),/模型资料不存在/);
 p.status='已停用';assert.throws(()=>run(s,'supplierChannelEnable',{endpointId:ep.id}),/启用供应商/);
});

test('an existing service-derived model association remains editable without changing its resource or service history',()=>{
 const s=legacySupplierState(),p=owner(s),ep=endpoint(s,'CH-001');
 p.catalogConnections=p.catalogConnections.filter(row=>row.modelId!=='DeepSeek-V4-Flash-0731');
 s.modelSupplies.push({id:'saved-service-map',providerId:p.id,modelId:s.models[0].id,endpointId:ep.id,catalogueModelId:'DeepSeek-V4-Flash-0731',upstreamModelId:'deepseek-flash-existing',status:'已启用'});
 const link=catalogueChannels(s,p,'DeepSeek-V4-Flash-0731')[0];
 const next=run(s,'supplierAssociationSave',{modelId:link.modelId,endpointId:ep.id,associationId:link.id,upstreamModelId:link.upstreamModelId,scenarios:price(1)});
 assert.equal(catalogueChannels(next,owner(next),'DeepSeek-V4-Flash-0731')[0].pricing.scenarios[0].listPrice,1000000);assert.deepEqual(next.endpoints,s.endpoints);unchangedServices(s,next);
});

test('fusion preserves saved resources, exact models, existing default keys, prices and service histories and never re-adds removed fixtures',()=>{
 const s=createAdminSeed(),p=owner(s);p.apiKeys=[{id:'manual-key',name:'我的凭证',fingerprint:'f'.repeat(64),maskedKey:'test••••••••2222'}];p.defaultApiKeyId='manual-key';p.catalogModels=[{modelId:'GLM-5.2',name:'我的模型名称',type:'text'}];
 const legacy=legacySupplierState();s.endpoints.push(...legacy.endpoints.filter(row=>['supplier-review-CH-001','supplier-review-CH-002'].includes(row.id)));p.catalogConnections=owner(legacy).catalogConnections;
 const before=structuredClone(s),next=prepareSupplierReviewCases(s);
 assert.equal(owner(next).defaultApiKeyId,'manual-key');assert.deepEqual(owner(next).apiKeys[0],p.apiKeys[0]);assert.deepEqual(owner(next).catalogModels[0],p.catalogModels[0]);
 for(const e of s.endpoints)assert.deepEqual(next.endpoints.find(row=>row.id===e.id),e);
 unchangedServices(s,next);assert.deepEqual(s,before);assert.deepEqual(prepareSupplierReviewCases(next),next);
 const ep=endpoint(next,'CH-001'),link=catalogueChannels(next,owner(next),'GLM-5.2').find(row=>row.endpointId===ep.id);
 const unlinked=run(next,'supplierAssociationRemove',{modelId:link.modelId,endpointId:ep.id,associationId:link.id,confirmed:true});
 const restored=parseAdminState(JSON.stringify(unlinked));assert.equal(catalogueChannels(restored,owner(restored),'GLM-5.2').some(row=>row.id===link.id),false);
});

test('supplier resource writes retain role, conflict and storage failure guards',()=>{
 const s=legacySupplierState(),a=action('supplierChannelSave',{name:'新增',protocol:'OpenAI',baseUrl:'https://x.example.invalid/v1/chat/completions',authMode:'inherit'}),before=JSON.stringify(s);
 assert.throws(()=>commitAdminState({...s,currentRole:'运维人员'},a),/无权/);
 assert.throws(()=>persistModelAction(s,a,{getItem:()=>JSON.stringify({...s,revision:s.revision+1}),setItem:()=>assert.fail()}),/数据已变化/);
 assert.throws(()=>persistModelAction(s,a,{getItem:()=>before,setItem:()=>{throw Error('quota');}}),/quota/);
 assert.equal(JSON.stringify(s),before);
});


test('model removal requires all channels to be unlinked, including disabled channels',()=>{
 const s=legacySupplierState(),before=structuredClone(s),modelId='GLM-5.2';
 assert.equal(catalogueChannels(s,owner(s),modelId).length,2);
 assert.throws(()=>run(s,'catalogueRemove',{modelId,confirmed:true}),/请先删除.*全部渠道/);
 assert.deepEqual(s,before);
 const disabled=structuredClone(s);
 owner(disabled).catalogConnections=owner(disabled).catalogConnections.map(link=>({...link,enabled:false}));
 assert.throws(()=>run(disabled,'catalogueRemove',{modelId,confirmed:true}),/请先删除.*全部渠道/);
 let next=s;
 const links=catalogueChannels(s,owner(s),modelId);
 for(const [index,link] of links.entries()){
  next=run(next,'supplierAssociationRemove',{modelId,endpointId:link.endpointId,associationId:link.id,confirmed:true});
  if(index===0)assert.throws(()=>run(next,'catalogueRemove',{modelId,confirmed:true}),/请先删除.*全部渠道/);
 }
 assert.equal(catalogueChannels(next,owner(next),modelId).length,0);
 assert.ok(displayedCatalogueIds(owner(next),next).includes(modelId));
 const removed=run(next,'catalogueRemove',{modelId,confirmed:true});
 assert.ok(!displayedCatalogueIds(owner(removed),removed).includes(modelId));
 assert.deepEqual(removed.endpoints,s.endpoints);
 assert.equal(catalogueChannels(removed,owner(removed),'DeepSeek-V4-Flash-0731').length,1);
 unchangedServices(s,removed);
 assert.deepEqual(s,before);
});

function createAdminSeed(...args) { return withAdminSession(baseCreateAdminSeed(...args)); }
function parseAdminState(...args) { return withAdminSession(baseParseAdminState(...args)); }

test('channel editor saves shared name and the selected upstream identity atomically without changing cost, history or other mappings',()=>{
 const state=legacySupplierState(),p=owner(state),ep=endpoint(state,'CH-001'),mapping=supplierChannelAssociations(state,p,ep.id)[0];
 state.modelSupplies=[];state.serviceRoutes=[];
 const before=structuredClone(state),values={mode:'info',endpointId:ep.id,name:'渠道编辑核验',associationId:mapping.id,modelId:mapping.modelId,upstreamModelId:'renamed/upstream-v2',expectedUpdatedAt:ep.updatedAt,expectedProviderUpdatedAt:p.updatedAt};
 const next=run(state,'supplierChannelSave',values),saved=owner(next).catalogConnections.find(row=>row.id===mapping.id),old=p.catalogConnections.find(row=>row.id===mapping.id);
 assert.equal(next.endpoints.find(row=>row.id===ep.id).name,values.name);assert.equal(saved.upstreamModelId,values.upstreamModelId);assert.equal(saved.enabled,false);assert.equal(saved.health,null);
 for(const key of ['pricing','procurementVersions','procurementRevision','listPriceVersions','listPriceRevision','qualification'])assert.deepEqual(saved[key],old[key]);
 assert.deepEqual(owner(next).catalogModels,p.catalogModels);
 for(const row of p.catalogConnections.filter(row=>row.id!==mapping.id)){
  const after=owner(next).catalogConnections.find(item=>item.id===row.id);
  assert.deepEqual(after,row.endpointId===ep.id&&!row.deletedAt?{...row,name:values.name}:row);
 }
 assert.deepEqual(next.endpoints.find(row=>row.id===ep.id).connectionTest,ep.connectionTest);
 unchangedServices(state,next);assert.deepEqual(state,before);
 const restored=parseAdminState(JSON.stringify(next));assert.equal(owner(restored).catalogConnections.find(row=>row.id===mapping.id).upstreamModelId,values.upstreamModelId);
 const another=supplierChannelAssociations(state,p,ep.id).find(row=>row.id!==mapping.id);
 for(const patch of [{upstreamModelId:'bad id'},{upstreamModelId:''},{associationId:'missing'},{modelId:'wrong'},{upstreamModelId:another.upstreamModelId},{expectedUpdatedAt:'stale'},{expectedProviderUpdatedAt:'stale'}])assert.throws(()=>run(state,'supplierChannelSave',{...values,...patch}));
 assert.throws(()=>run(withAdminSession({...state,currentRole:'运维人员'}),'supplierChannelSave',values),/无权/);
 assert.deepEqual(state,before);
});

test('channel identity edits reject service references and active routes before changing either the name or the model identifier',()=>{
 const state=legacySupplierState(),p=owner(state),ep=endpoint(state,'CH-001'),mapping=supplierChannelAssociations(state,p,ep.id)[0];
 const values={mode:'info',endpointId:ep.id,name:'不得部分保存',associationId:mapping.id,modelId:mapping.modelId,upstreamModelId:'blocked/upstream'};
 state.modelSupplies=[{id:'identity-reference',modelId:state.models[0].id,endpointId:ep.id,catalogueModelId:mapping.modelId,status:'已停用'}];state.serviceRoutes=[];
 assert.throws(()=>run(state,'supplierChannelSave',values),/服务引用/);
 state.modelSupplies=[];state.serviceRoutes=[{id:'identity-route',activeVersion:1,versions:[{version:1,config:{channels:[{supplyId:mapping.id,enabled:true}]}}]}];
 const before=structuredClone(state);assert.throws(()=>run(state,'supplierChannelSave',values),/服务引用/);assert.deepEqual(state,before);
 assert.doesNotThrow(()=>run(state,'supplierChannelSave',{...values,upstreamModelId:mapping.upstreamModelId}));
});
