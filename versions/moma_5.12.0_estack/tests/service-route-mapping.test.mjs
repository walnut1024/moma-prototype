import test from 'node:test';
import assert from 'node:assert/strict';
import {platformRouteInterface,routeMappingStatus} from '../src/admin-v2/service-route-mapping.js';

function fixture(type='text',path='/v1/chat/completions',protocol='OpenAI',upstreamType=type) {
  const model={id:'platform-model',modelId:'public-model',type,profile:type==='audio'?{tasks:['语音合成']}:{}};
  const endpoint={id:'endpoint-a',providerId:'provider-a',protocol,baseUrl:`https://supplier.example.invalid${path}`};
  const provider={id:'provider-a',catalogModels:[{modelId:'supplier-model',type:upstreamType}],catalogConnections:[]};
  const channel={id:'supply-a',modelId:model.id,catalogueModelId:'supplier-model',upstreamModelId:'upstream-native-model',endpoint,provider,url:endpoint.baseUrl};
  return {state:{endpoints:[endpoint],providers:[provider]},service:{id:'standard:platform-model',model,modelId:model.id,mode:'standard',callId:model.modelId,providerId:null},channel};
}
const mapping=f=>routeMappingStatus(f.state,f.service,f.channel);

test('text and multimodal mapping uses explicit public and upstream IDs with the final channel path',()=>{
  for (const type of ['text','multimodal']) {
    const f=fixture(type,'/compatible-mode/v1/chat/completions'),before=structuredClone(f);
    const status=mapping(f);
    assert.equal(status.valid,true);assert.equal(status.status,'已配置');assert.equal(status.platformProtocol,'OpenAI');assert.equal(status.platformPath,'/v1/chat/completions');assert.equal(status.upstreamPath,'/compatible-mode/v1/chat/completions');assert.equal(status.platformModelId,'public-model');assert.equal(status.upstreamModelId,'upstream-native-model');assert.deepEqual(f,before);
  }
});
test('supported media endpoint families require compatible declared data types and do not collapse to text chat',()=>{
  for (const [type,path,display] of [['image','/v1/images/generations','图像生成'],['video','/v1/videos','视频生成'],['video','/v1/videos/generations','视频生成'],['audio','/v1/audio/speech','语音合成']]) {
    for (const protocol of ['OpenAI','其他']) {
      const f=fixture(type,path,protocol),status=mapping(f);
      assert.equal(status.valid,true);assert.equal(status.platformProtocol,display);assert.equal(status.upstreamProtocol,protocol);assert.equal(status.upstreamPath,path);
    }
  }
  const visual=fixture('video','/v1/videos/generations','其他','visual');assert.equal(mapping(visual).valid,true);
  visual.channel.provider.catalogModels=[];assert.equal(mapping(visual).status,'待配置');
});
test('audio task is explicit and unsupported or ambiguous tasks never default to speech synthesis',()=>{
  const f=fixture('audio','/v1/audio/transcriptions','其他');
  f.service.model.profile.tasks=['语音识别'];assert.equal(mapping(f).valid,true);assert.deepEqual(platformRouteInterface(f.service.model),{protocol:'语音识别',path:'/v1/audio/transcriptions'});
  for (const tasks of [[],['语音翻译'],['语音合成','语音识别']]) {f.service.model.profile.tasks=tasks;assert.equal(mapping(f).status,'待配置');assert.equal(mapping(f).valid,false);}
});
test('unimplemented protocol, URL-family and model-type conversion stays pending adaptation',()=>{
  for (const f of [fixture('text','/v1/messages','Anthropic'),fixture('text','/v1/responses'),fixture('video','/api/v3/contents/generations/tasks','其他'),fixture('image','/v1/images/generations','其他','text'),fixture('text','/v1/chat/completions','其他')]) {
    const status=mapping(f);assert.equal(status.valid,false);assert.equal(status.status,'待适配');assert.ok(status.reason);
  }
  assert.equal(mapping(fixture('rerank','/v1/rerank','其他')).status,'待适配');
  assert.equal(mapping(fixture('rerank','/v1/rerank','其他')).upstreamPath,'/v1/rerank');
});
test('incomplete identifiers, provider scope and unsafe or incomplete URLs remain unconfigured',()=>{
  for (const modify of [f=>{f.service.callId='';f.service.providerId='provider-a';},f=>f.channel.upstreamModelId='',f=>f.channel.modelId='another-model',f=>f.service.providerId='provider-other',f=>f.channel.endpoint.protocol='',f=>f.channel.url='https://supplier.example.invalid/v1',f=>f.channel.url='https://user:secret@supplier.example.invalid/v1/chat/completions',f=>f.channel.url='https://supplier.example.invalid/v1/chat/completions?api_key=x',f=>f.channel.url='/v1/chat/completions']) {
    const f=fixture();modify(f);const status=mapping(f);assert.equal(status.valid,false);assert.equal(status.status,'待配置');
  }
});
test('mapping convention does not claim health, credentials, availability or live request validation',()=>{
  const f=fixture();f.channel.endpoint.status='停用';f.channel.endpoint.credentialRef='';f.channel.endpoint.connectionTest=null;f.channel.status='已停用';
  assert.equal(mapping(f).valid,true);assert.equal(mapping(f).status,'已配置');
  assert.deepEqual(platformRouteInterface({type:'video'}),{protocol:'视频生成',path:'/v1/videos'});
});
test('selected alternate address has its own declared protocol without mutating shared supplier resources',()=>{
  const f=fixture('text','/v1/messages','Anthropic');
  f.channel.provider.catalogConnections=[{modelId:'supplier-model',endpointId:f.channel.endpoint.id,upstreamModelId:f.channel.upstreamModelId,apiAddresses:[{protocol:'Anthropic',baseUrl:f.channel.endpoint.baseUrl},{protocol:'OpenAI',baseUrl:'https://proxy.example.invalid/v1/chat/completions'}]}];
  f.channel.url='https://proxy.example.invalid/v1/chat/completions';
  const before=structuredClone(f);assert.equal(mapping(f).valid,true);assert.equal(mapping(f).upstreamProtocol,'OpenAI');assert.deepEqual(f,before);
});
