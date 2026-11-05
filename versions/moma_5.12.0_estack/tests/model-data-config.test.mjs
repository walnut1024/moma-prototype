import test from 'node:test';
import assert from 'node:assert/strict';
import { MODEL_DATASET, MODEL_DATA_COLLECTIONS, validateModelDataset, validateSystemModelData, modelOperationsView, applyModelDataset } from '../src/mock/model-data.js';
import { createAdminSeed, loadAdminState, parseAdminState, serializeAdminState, STORAGE_KEY, commitAdminState } from '../src/admin-v2/store.js';
import { modelLibrary } from '../src/admin-v2/model-library.js';
import { serviceDirectoryModels } from '../src/admin-v2/service-workspace.js';
import { supplierDirectory } from '../src/admin-v2/moma-provider.js';
import { marketModels } from '../src/service-directory.mjs';
import { withAdminSession } from './admin-session-fixture.mjs';
const storageFor = raw => { const data=new Map(raw?[[STORAGE_KEY,raw]]:[]); return {getItem:k=>data.get(k) || null,setItem:(k,v)=>data.set(k,v)}; };

test('configuration has valid stable relationships and fails on broken fixtures before initialization',()=>{
 assert.doesNotThrow(()=>validateModelDataset()); assert.doesNotThrow(()=>validateSystemModelData());
 for(const damage of [c=>c.collections.providers.splice(0,1),c=>c.collections.models[0].templateId='missing',c=>c.collections.modelSupplies[0].upstreamModelId='wrong',c=>c.collections.modelSalePrices[0].items[0].amount=-1,c=>c.collections.serviceRoutes[0].versions[0].config.channels[0].weight=99]){
  const config=structuredClone(MODEL_DATASET);damage(config);assert.throws(()=>validateModelDataset(config),/配置无效/);
 }
});
test('new workspace uses one initial dataset for library, suppliers and services and never mutates configuration',()=>{
 const before=JSON.stringify(MODEL_DATASET),storage=storageFor(),state=loadAdminState(storage),view=modelOperationsView(state);
 assert.equal(view.models.length,2);assert.equal(modelLibrary(view).length,2);assert.equal(supplierDirectory(view).length,3);assert.equal(view.endpoints.length,4);
 assert.deepEqual(serviceDirectoryModels(state).map(row=>row.id),view.models.map(row=>row.id));
 assert.equal(state.models.filter(row=>row.modelId==='glm-5.3').length,1);
 assert.equal(state.modelTemplates.filter(row=>row.modelId==='glm-5.3').length,1);
 assert.equal(view.models.find(row=>row.modelId==='glm-5.3').id,'model-glm53');
 for(const model of view.models){assert.ok(modelLibrary(view).some(row=>row.id===model.templateId));assert.equal(model.listingStatus,'已下架');assert.equal(model.callsEnabled,false);assert.equal(model.platformPublications?.length || 0,0);}
 const stored=storage.getItem(STORAGE_KEY); loadAdminState(storage);assert.equal(storage.getItem(STORAGE_KEY),stored);assert.equal(JSON.stringify(MODEL_DATASET),before);
});
test('saved manual records, removed defaults, credentials, drafts and histories are not refilled or overwritten',()=>{
 const state=loadAdminState(storageFor());
 state.models[0].name='手工名称'; state.models[0].commercialDrafts={price:{items:[{amount:'9'}]}};
 state.providers[0].description='手工资料'; state.modelTemplates=[]; state.modelSupplies=[];state.endpoints=[];
 const raw=serializeAdminState(state),storage=storageFor(raw),loaded=loadAdminState(storage);
 for(const key of MODEL_DATA_COLLECTIONS)assert.deepEqual(loaded[key],state[key]);
 assert.deepEqual(loaded.models[0].commercialDrafts,state.models[0].commercialDrafts);
 assert.equal(applyModelDataset(loaded),loaded);
});
test('unattributed existing data is user-owned and is not hidden, seeded or marked builtin',()=>{
 const state=createAdminSeed();delete state.modelData;
 state.models.push({...structuredClone(state.models[0]),id:'manual',name:'用户配置'});
 const loaded=parseAdminState(serializeAdminState(state));
 for(const key of MODEL_DATA_COLLECTIONS)assert.deepEqual(loaded[key],state[key]);
 assert.equal(loaded.modelData,undefined);assert.equal(modelOperationsView(loaded),loaded);
 assert.ok(serviceDirectoryModels(loaded).some(row=>row.id==='manual'));
 assert.equal(serviceDirectoryModels(loaded,null,'all').length,loaded.models.length);
});
test('user changes stay separate from builtin identities and remain visible in the current scenario after reload',()=>{
 let state=withAdminSession(loadAdminState(storageFor()));const model=modelOperationsView(state).models[0];
 state=commitAdminState(state,{type:'modelOperations',operation:'templateSave',data:{name:'用户资料',modelId:'user-material',type:'text',description:'手工登记',profile:{tasks:['对话'],inputModalities:['文本'],outputModalities:['文本']}}});
 const master=state.modelTemplates.find(row=>row.name==='用户资料');assert.ok(master);
 assert.ok(state.modelData.userIds.modelTemplates.includes(master.id));assert.ok(!state.modelData.builtinIds.modelTemplates.includes(master.id));
 assert.ok(modelLibrary(modelOperationsView(state)).some(row=>row.id===master.id));
 const reloaded=parseAdminState(serializeAdminState(state));assert.deepEqual(reloaded.modelData,state.modelData);
 assert.ok(modelLibrary(modelOperationsView(reloaded)).some(row=>row.id===master.id));
 assert.equal(modelOperationsView(reloaded).models.find(row=>row.id===model.id).modelId,model.modelId);
});
test('explicit preparation does not overwrite edited defaults with matching IDs',()=>{
 const state=createAdminSeed();state.providers.find(row=>row.id==='provider-moma').name='用户修改的平台';
 const before=structuredClone(state);assert.throws(()=>applyModelDataset(state),/冲突/);assert.deepEqual(state,before);
});
test('same-code user records cannot be silently replaced or duplicated by preparing examples',()=>{
 const state=createAdminSeed();
 state.models.find(row=>row.modelId==='glm-5.3').id='user-owned-glm';
 const before=structuredClone(state);
 assert.throws(()=>applyModelDataset(state),/编码.*冲突/);assert.deepEqual(state,before);
});
test('editing an initial provider records a user override without exposing archived catalogues',()=>{
 let state=withAdminSession(loadAdminState(storageFor()));
 const provider=state.providers.find(row=>row.id==='provider-moma');
 state=commitAdminState(state,{type:'update',collection:'providers',id:provider.id,changes:{contact:'手工联系人'}});
 assert.ok(state.modelData.builtinIds.providers.includes(provider.id));assert.ok(state.modelData.userIds.providers.includes(provider.id));
 const loaded=parseAdminState(serializeAdminState(state)),view=modelOperationsView(loaded);
 assert.equal(view.providers.find(row=>row.id===provider.id).contact,'手工联系人');
 assert.equal(view.providers.find(row=>row.id===provider.id).catalogModels.length,2);
 assert.equal(view.modelTemplates.length,2);
});
test('frontend default catalogue includes user services and keeps historical builtins in all mode',()=>{
 const rows=[{id:'one',modelKey:'one',defaultCatalogue:true,provider:'平台',callable:true},{id:'user',modelKey:'user',defaultCatalogue:true,provider:'用户供应商',callable:true},{id:'old',modelKey:'old',defaultCatalogue:false,provider:'旧内置',callable:true}];
 assert.deepEqual(marketModels(rows).map(row=>row.modelKey),['one','user']);assert.equal(marketModels(rows,'all').length,3);
});
