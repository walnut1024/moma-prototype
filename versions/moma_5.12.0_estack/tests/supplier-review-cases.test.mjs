import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdminSeed,parseAdminState} from '../src/admin-v2/store.js';
import {prepareSupplierReviewCases} from '../src/admin-v2/supplier-review-cases.js';
import {supplierChannelResources,supplierChannelAssociations,supplierKeyChannels} from '../src/admin-v2/supplier-resources.js';
import {catalogueChannels,channelCheckCurrent} from '../src/admin-v2/provider-channels.js';
import {connectionKeys,connectionCredentialsReady,connectionTestPassed} from '../src/admin-v2/connection-state.js';
import {routeMappingStatus} from '../src/admin-v2/service-route-mapping.js';
import {displayedCatalogueIds} from '../src/admin-v2/moma-provider.js';

const moma=state=>state.providers.find(provider=>provider.id==='provider-moma');
test('MoMA keeps five catalogue models, two shared chat channels and four compatible associations',()=>{
  const state=parseAdminState(null),provider=moma(state),channels=supplierChannelResources(state,provider),links=supplierChannelAssociations(state,provider);
  assert.equal(displayedCatalogueIds(provider,state).length,5);assert.equal(channels.length,2);assert.equal(links.length,4);assert.equal(provider.apiKeys.length,3);
  const identities=links.map(link=>[link.modelId,state.endpoints.find(endpoint=>endpoint.id===link.endpointId).channelCode]);
  assert.deepEqual(identities.sort(),[['GLM-5.2','CH-001'],['GLM-5.2','CH-002'],['DeepSeek-V4-Flash-0731','CH-001'],['Kimi/miKimi-K3','CH-002']].sort());
  for (const link of links) {
    const endpoint=state.endpoints.find(item=>item.id===link.endpointId),catalogue=provider.catalogModels.find(model=>model.modelId===link.modelId);
    assert.ok(['text','multimodal'].includes(catalogue.type));assert.equal(endpoint.protocol,'OpenAI');assert.ok(new URL(endpoint.baseUrl).pathname.endsWith('/chat/completions'));
    const model={id:'check-'+link.modelId,modelId:link.modelId,type:catalogue.type};
    const status=routeMappingStatus(state,{model,modelId:model.id,callId:model.modelId},{...link,modelId:model.id,catalogueModelId:link.modelId,provider,endpoint,url:endpoint.baseUrl});
    assert.equal(status.valid,true,link.modelId+': '+status.reason);
    assert.equal(channelCheckCurrent(catalogueChannels(state,provider,link.modelId).find(channel=>channel.endpointId===endpoint.id)),true);
  }
  for (const id of ['BGE-M3','AICC-Doubao-Seedance-2.0']) assert.equal(catalogueChannels(state,provider,id).length,0,id+' must start unassociated');
});
test('shared resource credential references and reference counts resolve to the intended key',()=>{
  const state=parseAdminState(null),provider=moma(state),channels=supplierChannelResources(state,provider);
  assert.equal(provider.defaultApiKeyId,'KEY-001');
  for (const [code,keyId] of [['CH-001','KEY-001'],['CH-002','KEY-003']]) {
    const channel=channels.find(item=>item.channelCode===code);
    assert.deepEqual(connectionKeys(channel,provider).map(key=>key.id),[keyId]);
    assert.equal(connectionCredentialsReady(channel,provider),true);assert.equal(connectionTestPassed(channel),true);
    assert.equal(supplierChannelAssociations(state,provider,channel.id).length,2);
  }
  for (const [id,count] of [['KEY-001',1],['KEY-002',0],['KEY-003',1]]) assert.equal(supplierKeyChannels(state,provider,id).length,count);
  const kimi=state.providers.find(item=>item.id==='provider-kimi-official');
  for (const channel of supplierChannelResources(state,kimi)) {assert.equal(connectionCredentialsReady(channel,kimi),false);assert.equal(connectionTestPassed(channel),false);}
});
test('fusion adds corrected missing cases without overwriting custom resources, prices or service history',()=>{
  const state=createAdminSeed(),provider=moma(state),at='2026-10-01T00:00:00Z';
  provider.apiKeys=[{id:'saved-key',name:'自定义密钥',fingerprint:'b'.repeat(64),maskedKey:'test••••saved',status:'enabled'}];provider.defaultApiKeyId='saved-key';
  provider.catalogModels=[{modelId:'GLM-5.2',name:'手工命名模型',type:'text'}];
  provider.catalogConnections=[{id:'saved-association',modelId:'GLM-5.2',endpointId:'supplier-review-CH-001',upstreamModelId:'saved-glm',enabled:false,pricing:{scenarios:[{name:'输入',listPrice:123456,unit:'百万 Token',currency:'CNY'}]},updatedAt:at}];
  const resource={id:'supplier-review-CH-001',providerId:provider.id,channelCode:'CH-001',supplierChannel:true,name:'手工渠道',protocol:'OpenAI',baseUrl:'https://saved.example.invalid/v1/chat/completions',authMode:'specific',apiKeyId:'saved-key',status:'停用',updatedAt:at};
  state.endpoints.push(resource);
  const before=structuredClone(state),prepared=prepareSupplierReviewCases(state);
  assert.deepEqual(state,before);assert.deepEqual(prepared.endpoints.find(item=>item.id===resource.id),resource);
  assert.deepEqual(moma(prepared).catalogConnections.find(item=>item.id==='saved-association'),provider.catalogConnections[0]);
  assert.deepEqual(moma(prepared).catalogModels[0],provider.catalogModels[0]);assert.equal(moma(prepared).defaultApiKeyId,'saved-key');assert.deepEqual(moma(prepared).apiKeys[0],provider.apiKeys[0]);
  for (const key of ['models','modelSupplies','modelSalePrices','serviceRoutes','supplyPrices']) assert.deepEqual(prepared[key],state[key]);
});
test('version-one initialization is idempotent and never restores removed or edited review records',()=>{
  const state=parseAdminState(null),provider=moma(state);
  provider.catalogConnections.find(item=>item.modelId==='DeepSeek-V4-Flash-0731').deletedAt='2026-10-26';
  state.endpoints.find(item=>item.channelCode==='CH-002').name='维护后的专用渠道';
  provider.apiKeys.find(key=>key.id==='KEY-003').status='disabled';
  const before=structuredClone(state);
  assert.strictEqual(prepareSupplierReviewCases(state),state);assert.deepEqual(prepareSupplierReviewCases(state),before);
  const restored=parseAdminState(JSON.stringify(state));
  assert.equal(catalogueChannels(restored,moma(restored),'DeepSeek-V4-Flash-0731').length,0);
  assert.equal(restored.endpoints.find(item=>item.channelCode==='CH-002').name,'维护后的专用渠道');
  assert.equal(moma(restored).apiKeys.find(key=>key.id==='KEY-003').status,'disabled');
});
