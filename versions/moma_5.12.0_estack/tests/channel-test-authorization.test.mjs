import test from 'node:test';
import assert from 'node:assert/strict';
import { basicChannelUsageButton, channelTestUsageAuthorized } from '../src/admin-v2/channel-test-authorization.js';
import { channelTestModels,channelTestRequest } from '../src/admin-v2/channel-test-jobs.js';

const records=['text','multimodal','embedding','rerank','image','video','audio'].map(type=>({associationId:type,modelId:`master-${type}`,upstreamModelId:`vendor/${type}`,type}));

test('the basic usage button authorizes only its fixed low-cost basic plan through an explicit click',()=>{
 const models=channelTestModels(records);
 assert.deepEqual(models.map(row=>row.type),['text','multimodal','embedding','rerank']);assert.equal(basicChannelUsageButton(models),true);
 assert.equal(channelTestUsageAuthorized(models),false);assert.equal(channelTestUsageAuthorized(models,{consent:true}),false);
 assert.equal(channelTestUsageAuthorized(models,{explicitBasicClick:true}),true);
 const request=channelTestRequest('fixed-channel',models,{operationId:'explicit-click'});
 assert.equal(request.operationId,'explicit-click');assert.equal(request.confirmExpensive,false);assert.deepEqual(request.models,models);
 assert.equal(channelTestUsageAuthorized([],{explicitBasicClick:true}),false);
});

test('a basic click does not authorize specialized checks or image, video and explicitly chosen audio tasks',()=>{
 for(const check of ['streaming','tools','structured']){
  const models=channelTestModels(records,{check});assert.equal(basicChannelUsageButton(models,check),false);
  assert.equal(channelTestUsageAuthorized(models,{check,explicitBasicClick:true}),false);assert.equal(channelTestUsageAuthorized(models,{check,consent:true}),true);
 }
 const models=channelTestModels(records,{expensiveIds:['image','video','audio'],audioProbes:{audio:'transcription'}});
 assert.equal(channelTestUsageAuthorized(models,{explicitBasicClick:true}),false);assert.equal(channelTestUsageAuthorized(models,{consent:true}),true);
 assert.equal(channelTestRequest('fixed-channel',models).confirmExpensive,true);
 assert.throws(()=>channelTestModels(records,{expensiveIds:['audio']}),/选择识别或合成/);
});
