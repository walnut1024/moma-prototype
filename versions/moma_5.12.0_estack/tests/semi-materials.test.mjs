import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import config from '../vite.config.mjs';
import {materialModalitiesLabel} from '../src/admin-v2/material-catalogue.js';

test('incomplete model material modalities render as missing facts without crashing the table',()=>{
  assert.equal(materialModalitiesLabel({}),'未填写 → 未填写');
  assert.equal(materialModalitiesLabel({inputModalities:['文本','图片'],outputModalities:['文本']}),'文本、图片 → 文本');
  assert.equal(materialModalitiesLabel({inputModalities:[],outputModalities:['视频']}),'未填写 → 视频');
});

test('Semi date-fns-tz resolves version two in both Vite builds and development without changing app version four',()=>{
  const require=createRequire(import.meta.url),source='date-fns/_lib/cloneObject/index.js',importer='/node_modules/date-fns-tz/esm/zonedTimeToUtc/index.js';
  const resolver=config.plugins.find(plugin=>plugin.name==='semi-date-fns');
  const expected=createRequire(require.resolve('@douyinfe/semi-ui')).resolve(source);
  assert.equal(resolver.resolveId(source,importer),expected);
  assert.equal(resolver.resolveId(source,'/app/other.js'),null);
  let handler;config.optimizeDeps.esbuildOptions.plugins[0].setup({onResolve:(_filter,callback)=>{handler=callback;}});
  assert.deepEqual(handler({path:source,importer}),{path:expected});
  assert.equal(handler({path:source,importer:'/app/other.js'}),undefined);
  assert.match(require('date-fns/package.json').version,/^4\./);
});

test('shared material form drafts preserve manual metadata, explicit values and unknown capabilities',async()=>{
  const {modelMetadataDraft}=await import('../src/admin-v2/model-metadata-draft.js');
  const model={name:'Manual',modelId:'manual-model',type:'text',profile:{author:'手工作者',releaseDate:'2026-10',supportedParameters:['temperature'],defaultParameters:{temperature:0}},capabilities:{context:null,tools:false,output:0}};
  const before=structuredClone(model),draft=modelMetadataDraft(model);
  assert.equal(draft.profile.author,'手工作者');assert.equal(draft.profile.releaseDate,'2026-10');
  assert.deepEqual(draft.profile.defaultParameters,{temperature:0});assert.equal(draft.capabilities.context,null);assert.equal(draft.capabilities.tools,false);assert.equal(draft.capabilities.output,0);
  assert.deepEqual(model,before);assert.deepEqual(modelMetadataDraft().capabilities,{streaming:null,tools:null,context:null,output:null});
});
