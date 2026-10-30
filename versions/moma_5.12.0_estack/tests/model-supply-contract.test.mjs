import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAdminState, commitAdminState } from '../src/admin-v2/store.js';
import { modelLibrary, libraryRecord, libraryRemovalIssue } from '../src/admin-v2/model-library.js';
import { supplyModelDirectory, supplyModelRecord } from '../src/admin-v2/supply-models.js';
import { catalogueChannels } from '../src/admin-v2/provider-channels.js';
const op = (s, operation, data) => commitAdminState(s, {type:'modelOperations',operation,data});
const provider = (s, id) => s.providers.find(row=>row.id===id);
const supplyOp = (s, id, operation, values) => op(s,'provider',{operation,objectId:id,values});
const create = s => op(s,'templateSave',{...s.models.find(row=>row.id==='model-2'),id:undefined,modelId:'contract-new-model',name:'仅资料模型'});

test('fresh mocks have canonical identities, pending suppliers and multiple channels without populating the full library',()=>{
 const s=parseAdminState(null), groups=supplyModelDirectory(s);
 assert.ok(groups.every(row=>row.master));assert.ok(modelLibrary(s).length>groups.length);
 const glm=groups.find(row=>row.id==='model-2');assert.equal(glm.entries.length,2);
 assert.equal(catalogueChannels(s,provider(s,'provider-moma'),'GLM-5.2').length,2);
 assert.equal(catalogueChannels(s,provider(s,'provider-zhipu-direct'),'glm-5.2').length,0);
 for(const group of groups)for(const entry of group.entries)assert.equal(entry.provider.catalogModels.find(row=>row.modelId===entry.modelId).libraryId,group.master.id);
});
test('creating library data does not register supply, channels or services; registration shares identity',()=>{
 const initial=parseAdminState(null), s=create(initial), id=s.audits[0].objectId;
 assert.ok(libraryRecord(s,id));assert.ok(!supplyModelDirectory(s).some(row=>row.id===id));
 for(const field of ['providers','endpoints','models','modelSupplies','modelSalePrices','serviceRoutes'])assert.deepEqual(s[field],initial[field]);
 const next=supplyOp(s,'provider-zhipu-direct','supplierModelAdd',{libraryId:id});
 assert.equal(supplyModelDirectory(next).find(row=>row.id===id).entries.length,1);assert.deepEqual(next.endpoints,s.endpoints);
 assert.throws(()=>op(next,'templateDelete',{id,confirmed:true}),/供应关系/);
});
test('removing one supplier preserves the master and other suppliers; final removal permits unused library deletion',()=>{
 let s=create(parseAdminState(null)), id=s.audits[0].objectId;
 for(const owner of ['provider-zhipu-direct','provider-kimi-official'])s=supplyOp(s,owner,'supplierModelAdd',{libraryId:id});
 s=supplyOp(s,'provider-zhipu-direct','catalogueRemove',{modelId:'contract-new-model',confirmed:true});
 assert.equal(supplyModelDirectory(s).find(row=>row.id===id).entries.length,1);assert.ok(libraryRecord(s,id));
 s=supplyOp(s,'provider-kimi-official','catalogueRemove',{modelId:'contract-new-model',confirmed:true});
 assert.ok(!supplyModelDirectory(s).some(row=>row.id===id));assert.equal(libraryRemovalIssue(s,id),'');
 assert.throws(()=>op(s,'templateDelete',{id}),/确认/);s=op(s,'templateDelete',{id,confirmed:true});
 assert.equal(libraryRecord(parseAdminState(JSON.stringify(s)),id),undefined);
});
test('library edits synchronize both supply views without touching channels or prices',()=>{
 const s=parseAdminState(null), master=s.models.find(row=>row.id==='model-2');
 const next=op(s,'templateSave',{...master,name:'统一名称更新'});
 assert.equal(supplyModelDirectory(next).find(row=>row.id===master.id).name,'统一名称更新');
 for(const id of ['provider-moma','provider-zhipu-direct']){
  const p=provider(next,id),code=id==='provider-moma'?'GLM-5.2':'glm-5.2';assert.equal(supplyModelRecord(next,p,code).name,'统一名称更新');
 }
 for(const field of ['providers','endpoints','modelSalePrices','serviceRoutes'])assert.deepEqual(next[field],s[field]);
 assert.throws(()=>op(next,'templateDelete',{id:master.id,confirmed:true}),/服务管理/);
});
test('batch registration rejects unknown data atomically and never creates placeholder channels',()=>{
 const s=parseAdminState(null), before=structuredClone(s);
 assert.throws(()=>supplyOp(s,'provider-zhipu-direct','catalogueImport',{mode:'batch',text:'glm-5\nnot-in-library'}),/模型资料/);assert.deepEqual(s,before);
 const next=supplyOp(s,'provider-zhipu-direct','catalogueImport',{mode:'batch',text:'glm-5\nglm-5'});
 assert.equal(supplyModelRecord(next,provider(next,'provider-zhipu-direct'),'glm-5').id,'template-glm-5');
 assert.equal(catalogueChannels(next,provider(next,'provider-zhipu-direct'),'glm-5').length,0);assert.deepEqual(next.endpoints,s.endpoints);
});
test('saved mock edits and removals are not reset on refresh',()=>{
 const s=parseAdminState(null);provider(s,'provider-moma').catalogModels.find(row=>row.modelId==='GLM-5.2').libraryId='manual-missing';
 s.modelTemplates=s.modelTemplates.filter(row=>row.modelId!=='glm-4-7');const next=parseAdminState(JSON.stringify(s));
 assert.equal(provider(next,'provider-moma').catalogModels.find(row=>row.modelId==='GLM-5.2').libraryId,'manual-missing');
 assert.ok(!next.modelTemplates.some(row=>row.modelId==='glm-4-7'));
});

test('removed relationships can be registered again without new identity or restored channels',()=>{let s=create(parseAdminState(null)),id=s.audits[0].objectId;s=supplyOp(s,'provider-zhipu-direct','supplierModelAdd',{libraryId:id});s=supplyOp(s,'provider-zhipu-direct','catalogueRemove',{modelId:'contract-new-model',confirmed:true});s=supplyOp(s,'provider-zhipu-direct','supplierModelAdd',{libraryId:id});assert.equal(supplyModelDirectory(s).find(row=>row.id===id).entries.length,1);assert.equal(catalogueChannels(s,provider(s,'provider-zhipu-direct'),'contract-new-model').length,0);assert.throws(()=>commitAdminState(s,{type:'batch',changes:[{type:'remove',collection:'modelTemplates',id}]}),/删除/);});

test('new mock library records can be edited through the same validation as real form submissions',()=>{let s=parseAdminState(null);for(const record of s.modelTemplates.filter(row=>row.id.startsWith('supplier-template-'))){const next=op(s,'templateSave',{...record,name:record.name+' 编辑'});assert.equal(libraryRecord(next,record.id).name,record.name+' 编辑');assert.deepEqual(next.providers,s.providers);s=next;}});
