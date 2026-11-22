import { legacySupplierState } from './legacy-supplier-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {supplierChannelResources,supplierChannelAssociations,supplierKeyChannels} from '../src/admin-v2/supplier-resources.js';
import {catalogueChannels,channelCheckCurrent} from '../src/admin-v2/provider-channels.js';
import {connectionKeys,connectionCredentialsReady,connectionTestPassed} from '../src/admin-v2/connection-state.js';
import {routeMappingStatus} from '../src/admin-v2/service-route-mapping.js';
import {displayedCatalogueIds} from '../src/admin-v2/moma-provider.js';

const moma=state=>state.providers.find(provider=>provider.id==='provider-moma');
test('explicit historical fixture keeps five models and four mappings across its two legacy channels',()=>{
  const state=legacySupplierState(),provider=moma(state),channels=supplierChannelResources(state,provider),links=supplierChannelAssociations(state,provider);
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
  const state=legacySupplierState(),provider=moma(state),channels=supplierChannelResources(state,provider);
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
