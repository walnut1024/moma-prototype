import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAdminState, commitAdminState } from '../src/admin-v2/store.js';
import { supplyModelDirectory, supplyModelRecord } from '../src/admin-v2/supply-models.js';
import { catalogueChannels } from '../src/admin-v2/provider-channels.js';
const owner = (state, id) => state.providers.find(row => row.id === id);
const run = (state, provider, operation, values) => commitAdminState(state, {type:'modelOperations', operation:'provider', data:{operation, objectId:provider, values}});
const values = {name:'统一模型渠道', baseUrl:'https://qa.example.invalid/v1/chat/completions', protocol:'OpenAI', keyGroupId:'default', models:[{libraryId:'model-2', upstreamModelId:'vendor/glm-52', scenarios:[{name:'输入 Token', listPrice:'0', currency:'CNY', unit:'百万 Token'}]}]};

test('one canonical model collects independent suppliers and preserves service publication and channel identity', () => {
 const state=parseAdminState(null), before=structuredClone(state);
 const next=run(state,'provider-zhipu-direct','supplierChannelCreate',values);
 const group=supplyModelDirectory(next).find(row=>row.id==='model-2');
 assert.deepEqual(new Set(group.entries.map(row=>row.provider.id)),new Set(['provider-moma','provider-zhipu-direct']));
 const added=owner(next,'provider-zhipu-direct');
 assert.equal(added.catalogModels.find(row=>row.modelId==='glm-5.2').libraryId,'model-2');
 const channels=group.entries.flatMap(row=>catalogueChannels(next,row.provider,row.modelId));
 assert.equal(channels.length,1);assert.equal(channels.filter(row=>row.upstreamModelId==='vendor/glm-52').length,1);
 assert.equal(channels.find(row=>row.upstreamModelId==='vendor/glm-52').pricing.scenarios[0].listPrice,0);
 for(const field of ['models','modelSupplies','serviceRoutes','modelSalePrices','supplyPrices']) assert.deepEqual(next[field],state[field]);
 assert.deepEqual(state,before);
 const restored=parseAdminState(JSON.stringify(next));
 assert.equal(supplyModelDirectory(restored).find(row=>row.id==='model-2').entries.length,2);
});

test('explicit alias linking unifies every existing channel without rewriting upstream data or prices', () => {
 const state=parseAdminState(null), p=owner(state,'provider-zhipu-direct');
 p.catalogModelIds.push('vendor-glm');p.catalogModels.push({modelId:'vendor-glm',name:'供应商定制名称',type:'text'});
 p.catalogConnections=[...(p.catalogConnections||[]),{id:'alias-quote',modelId:'vendor-glm',endpointId:null,upstreamModelId:'vendor-call-id',pricing:{scenarios:[]}}];
 const old=structuredClone(p);
 const next=run(state,p.id,'supplierModelLink',{modelId:'vendor-glm',libraryId:'model-2',confirmed:true});
 assert.equal(supplyModelDirectory(next).find(row=>row.id==='model-2').entries.length,3);
 assert.deepEqual(owner(next,p.id).catalogConnections,old.catalogConnections);
 assert.deepEqual(next.endpoints,state.endpoints);assert.deepEqual(next.modelSupplies,state.modelSupplies);
 assert.equal(supplyModelRecord(next,owner(next,p.id),'vendor-glm').id,'model-2');
 assert.throws(()=>run(state,p.id,'supplierModelLink',{modelId:'vendor-glm',libraryId:'model-2'}),/确认/);
 assert.throws(()=>run(state,p.id,'supplierModelLink',{modelId:'vendor-glm',libraryId:'model-6',confirmed:true}),/类型不同/);
});

test('same display names, versions and ambiguous codes cannot silently merge', () => {
 const state=parseAdminState(null), p=owner(state,'provider-zhipu-direct');
 p.catalogModelIds.push('glm-5.2-int4');p.catalogModels.push({modelId:'glm-5.2-int4',name:'GLM-5.2',type:'text'});
 assert.equal(supplyModelRecord(state,p,'glm-5.2-int4'),undefined);
 assert.ok(supplyModelDirectory(state).some(row=>row.code==='glm-5.2-int4'&&!row.master));
 state.models.push({...state.models.find(row=>row.id==='model-2'),id:'ambiguous',modelId:'GLM-5.2'});
 assert.equal(supplyModelRecord(state,owner(state,'provider-moma'),'GLM-5.2').id,'model-2');
 delete owner(state,'provider-moma').catalogModels.find(row=>row.modelId==='GLM-5.2').libraryId;
 assert.equal(supplyModelRecord(state,owner(state,'provider-moma'),'GLM-5.2'),undefined);
});

test('invalid group, price and model reject creation atomically; supplier key groups remain isolated', () => {
 const state=parseAdminState(null), before=structuredClone(state);
 for(const patch of [{models:[{...values.models[0],libraryId:'missing'}]},{keyGroupId:'foreign-key-group'},{models:[{...values.models[0],scenarios:[{name:'输入 Token',listPrice:'-1',unit:'百万 Token',currency:'CNY'}]}]},{baseUrl:'https://qa.example.invalid/v1'},{models:[{...values.models[0],libraryId:undefined}]}]) {
  assert.throws(()=>run(state,'provider-zhipu-direct','supplierChannelCreate',{...values,...patch}));assert.deepEqual(state,before);
 }
 const next=run(state,'provider-moma','supplierChannelCreate',values);
 assert.equal(owner(next,'provider-moma').catalogModelIds.filter(id=>id.toLowerCase()==='glm-5.2').length,1);
 assert.deepEqual(owner(next,'provider-zhipu-direct'),owner(state,'provider-zhipu-direct'));
 assert.throws(()=>run(next,'provider-moma','supplierChannelCreate',values),/名称不可重复/);
});

test('independent supplier, model and channel creation share one canonical association', () => {
 const original=parseAdminState(null);
 let state=run(original,null,'create',{name:'新供给机构',code:'new-supply-org',sourceType:'thirdParty',description:''});
 const providerId=state.audits[0].objectId;
 assert.ok(owner(state,providerId));
 assert.deepEqual(state.endpoints,original.endpoints);
 assert.deepEqual(owner(state,providerId).catalogModelIds,[]);
 state=run(state,providerId,'supplierModelAdd',{libraryId:'model-2'});
 assert.equal(supplyModelRecord(state,owner(state,providerId),'glm-5.2').id,'model-2');
 assert.deepEqual(state.endpoints,original.endpoints);
 state=run(state,providerId,'supplierChannelCreate',values);
 assert.equal(owner(state,providerId).catalogModelIds.length,1);
 assert.equal(catalogueChannels(state,owner(state,providerId),'glm-5.2').length,1);
 assert.ok(supplyModelDirectory(state).find(row=>row.id==='model-2').entries.some(row=>row.provider.id===providerId));
 for(const field of ['models','modelSupplies','serviceRoutes','modelSalePrices']) assert.deepEqual(state[field],original[field]);
 assert.throws(()=>run(state,providerId,'supplierModelAdd',{libraryId:'model-2'}),/已/);
 assert.throws(()=>run(state,null,'create',{name:'重复供应商',code:'new-supply-org',sourceType:'thirdParty'}),/不可重复/);
});
