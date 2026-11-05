import assert from 'node:assert/strict';
import {test} from 'node:test';
import {storedModel,domainModel} from '../src/mock/model-fields.js';
import {normalizeModelProfile} from '../src/admin-v2/model-profile.js';
import {operationsTransaction} from '../src/admin-v2/model-operations.js';
import {initialModelWorkspace} from '../server/model-repository.js';
import {modelSupplyGroups} from '../src/admin-v2/supplier-model-channel-table.js';
import {supplyModelDirectory} from '../src/admin-v2/supply-models.js';

test('catalogue storage separates record identity, canonical identity and callable identity without losing manual metadata',()=>{
  const material={id:'manual-record',modelId:'zhipu/glm-custom',name:'手工名称',profile:{inputModalities:['文本','图片'],outputModalities:['文本'],releaseDate:'2026-10',supportedParameters:['temperature','tools'],defaultParameters:{temperature:0},knowledgeCutoff:null,manualNote:'保留'},capabilities:{context:131072,output:8192,tools:null,streaming:false}};
  for(const service of [false,true]){
    const stored=storedModel(material,service);
    assert.equal(stored.record_id,material.id);assert.equal(stored[service?'id':'canonical_slug'],material.modelId);
    assert.equal(stored.context_length,131072);assert.deepEqual(stored.architecture.input_modalities,['文本','图片']);
    assert.equal(stored.default_parameters.temperature,0);assert.equal(stored.knowledge_cutoff,null);
    assert(!Object.hasOwn(stored,'modelId'));assert(!Object.hasOwn(stored.profile,'inputModalities'));
    assert.deepEqual(domainModel(stored,service),material);
  }
});

test('default parameters validate supported names and JSON object shape and preserve explicit zero',()=>{
  const profile=normalizeModelProfile({supportedParameters:['temperature'],defaultParameters:'{"temperature":0}',knowledgeCutoff:'2026-10'},'text');
  assert.deepEqual(profile.defaultParameters,{temperature:0});assert.equal(profile.knowledgeCutoff,'2026-10');
  for(const value of ['[]','null','oops','{"foreign":1}'])assert.throws(()=>normalizeModelProfile({supportedParameters:['temperature'],defaultParameters:value},'text'),/默认参数/);
});

test('catalogue identity can be registered before optional capability facts are known',()=>{
  const before=initialModelWorkspace();
  const result=operationsTransaction(before,{operation:'templateSave',data:{name:'手工建档',modelId:'manual/catalogue',type:'text',description:'',profile:{},capabilities:{}}});
  const record=result.changes.find(row=>row.collection==='modelTemplates' && row.type==='add').record;
  assert.equal(record.name,'手工建档');assert.equal(record.modelId,'manual/catalogue');assert.equal(record.capabilities.context,null);
  assert.equal(before.modelTemplates.some(row=>row.name==='手工建档'),false);
});

test('model view merges canonical aliases once per supplier while preserving every channel and cost',()=>{
  const state=initialModelWorkspace(),model=supplyModelDirectory(state).find(row=>row.name==='DeepSeek-V4-Flash-0731');
  const groups=modelSupplyGroups(state,[...model.entries,...model.entries]);
  assert.equal(groups.length,2);
  assert.equal(groups.reduce((sum,row)=>sum+row.channels.length,0),3);
  assert.equal(new Set(groups.map(row=>row.owner.id)).size,2);
  assert(groups.every(group=>group.channels.every(channel=>channel.pricing.scenarios.length===2)));
});
