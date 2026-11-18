import test from 'node:test';
import assert from 'node:assert/strict';
import { MODEL_DATASET, MODEL_DATA_COLLECTIONS, validateModelDataset, validateSystemModelData, modelOperationsView, applyModelDataset } from '../src/mock/model-data.js';
import { createAdminSeed, loadAdminState, parseAdminState, serializeAdminState, STORAGE_KEY, commitAdminState } from '../src/admin-v2/store.js';
import { modelLibrary } from '../src/admin-v2/model-library.js';
import { serviceDirectoryModels } from '../src/admin-v2/service-workspace.js';
import { supplierDirectory } from '../src/admin-v2/moma-provider.js';
import { marketModels } from '../src/service-directory.mjs';
import { withAdminSession } from './admin-session-fixture.mjs';
import { isResourceId } from '../src/resource-id.mjs';
const storageFor = raw => { const data=new Map(raw?[[STORAGE_KEY,raw]]:[]); return {getItem:k=>data.get(k) || null,setItem:(k,v)=>data.set(k,v)}; };

test('configuration has valid stable relationships and fails on broken fixtures before initialization',()=>{
 assert.doesNotThrow(()=>validateModelDataset()); assert.doesNotThrow(()=>validateSystemModelData());
 for(const damage of [c=>c.collections.providers.splice(0,1),c=>c.collections.models[0].templateId='missing',c=>c.collections.modelSupplies[0].upstreamModelId='wrong',c=>c.collections.modelSalePrices[0].items[0].amount=-1,c=>c.collections.serviceRoutes.find(row=>row.serviceId.startsWith('standard:')).versions[0].config.channels[0].weight=99]){
  const config=structuredClone(MODEL_DATASET);damage(config);assert.throws(()=>validateModelDataset(config),/配置无效/);
 }
});
test('new browser workspace ignores previous storage and starts with only reference records',()=>{
 const before=JSON.stringify(MODEL_DATASET),storage=storageFor(),state=loadAdminState(storage),view=modelOperationsView(state);
 for(const key of ['models','endpoints','tenants','orders','requests','modelSalePrices','serviceRoutes']) assert.deepEqual(view[key],[]);
 assert.equal(modelLibrary(view).length,17);assert(modelLibrary(view).every(row=>isResourceId(row.id,'model')));
 assert.deepEqual(supplierDirectory(view).map(row=>row.code),['moma','deepseek-official']);
 assert(view.providers.every(row=>isResourceId(row.id,'provider') && !row.catalogModels.length));
 const stored=storage.getItem(STORAGE_KEY); loadAdminState(storage);assert.equal(storage.getItem(STORAGE_KEY),stored);assert.equal(JSON.stringify(MODEL_DATASET),before);
 const former=storageFor();former.setItem('moma.adminV2.5120.v1',JSON.stringify(createAdminSeed()));
 const isolated=loadAdminState(former);assert.deepEqual(isolated.models,[]);assert.notEqual(isolated.providers[0].id,state.providers[0].id);
 assert.ok(former.getItem('moma.adminV2.5120.v1'));
});
test('saved manual records, removed defaults, credentials, drafts and histories are not refilled or overwritten',()=>{
 const state=withAdminSession(applyModelDataset(createAdminSeed()));
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
 let state=withAdminSession(loadAdminState(storageFor()));
 state=commitAdminState(state,{type:'modelOperations',operation:'templateSave',data:{name:'用户资料',modelId:'user-material',type:'text',description:'手工登记',profile:{tasks:['对话'],inputModalities:['文本'],outputModalities:['文本']}}});
 const master=state.modelTemplates.find(row=>row.name==='用户资料');assert.ok(master);
 assert.ok(state.modelData.userIds.modelTemplates.includes(master.id));assert.ok(!state.modelData.builtinIds.modelTemplates.includes(master.id));
 assert.ok(modelLibrary(modelOperationsView(state)).some(row=>row.id===master.id));
 const reloaded=parseAdminState(serializeAdminState(state));assert.deepEqual(reloaded.modelData,state.modelData);
 assert.ok(modelLibrary(modelOperationsView(reloaded)).some(row=>row.id===master.id));
 assert.deepEqual(modelOperationsView(reloaded).models,[]);
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
 const provider=state.providers.find(row=>row.code==='moma');
 state=commitAdminState(state,{type:'update',collection:'providers',id:provider.id,changes:{contact:'手工联系人'}});
 assert.ok(state.modelData.builtinIds.providers.includes(provider.id));assert.ok(state.modelData.userIds.providers.includes(provider.id));
 const loaded=parseAdminState(serializeAdminState(state)),view=modelOperationsView(loaded);
 assert.equal(view.providers.find(row=>row.id===provider.id).contact,'手工联系人');
 assert.equal(view.providers.find(row=>row.id===provider.id).catalogModels.length,0);
 assert.equal(view.modelTemplates.length,17);
});
test('frontend default catalogue includes user services and keeps historical builtins in all mode',()=>{
 const rows=[{id:'one',modelKey:'one',defaultCatalogue:true,provider:'平台',callable:true},{id:'user',modelKey:'user',defaultCatalogue:true,provider:'用户服务商',callable:true},{id:'old',modelKey:'old',defaultCatalogue:false,provider:'旧内置',callable:true}];
 assert.deepEqual(marketModels(rows).map(row=>row.modelKey),['one','user']);assert.equal(marketModels(rows,'all').length,3);
});
