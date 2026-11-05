import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminSeed, commitAdminState, persistModelAction } from '../src/admin-v2/store.js';
import { withAdminSession } from './admin-session-fixture.mjs';
import { libraryRecord, metadata, materialBase, materialImpact } from '../src/admin-v2/model-operations.js';
const run=(state,operation,data)=>commitAdminState(state,{type:'modelOperations',operation,data});
const fixture=()=>{
  let state=withAdminSession(createAdminSeed());
  const source=state.models.find(row=>row.id==='model-2');
  state=run(state,'templateSave',{...metadata(source),modelId:'shared-material-p2',name:'共享资料'});
  const id=state.audits[0].objectId;
  for(const suffix of ['a','b'])state.models.push({...structuredClone(source),id:`p2-${suffix}`,modelId:`p2-call-${suffix}`,templateId:id,listingStatus:'已上架',visibility:'公开',callsEnabled:true});
  return {state,id};
};
const publish=(state,id,value,extra={})=>run(state,'templatePublish',{id,value,expectedBase:materialBase(state,libraryRecord(state,id)),confirmed:true,...extra});
test('direct shared display publication synchronizes references and preserves existing historical edits and evidence',()=>{
 let {state,id}=fixture();const record=libraryRecord(state,id),before=structuredClone(state);
 record.materialDraft={id:'historical',values:{name:'old unsubmitted'}};const historical=structuredClone(record.materialDraft);
 state=publish(state,id,{...metadata(record),name:'新名称',description:'新介绍',profile:{...record.profile,secret:'never-store'}});
 for(const model of state.models.filter(row=>row.templateId===id)){assert.equal(model.name,'新名称');assert.equal(model.listingStatus,'已上架');assert.deepEqual(model.platformPublications,before.models.find(row=>row.id===model.id).platformPublications);}
 assert.deepEqual(state.modelSalePrices,before.modelSalePrices);assert.deepEqual(state.modelSupplies,before.modelSupplies);
 assert.deepEqual(libraryRecord(state,id).materialDraft,historical);assert.equal(JSON.stringify(libraryRecord(state,id)).includes('never-store'),false);
});
test('capability publication explicitly downlists all affected online references and preserves unrelated records',()=>{
 let {state,id}=fixture();const record=libraryRecord(state,id),before=structuredClone(state),value={...metadata(record),capabilities:{...record.capabilities,context:262144}};
 assert.equal(materialImpact(state,record,value).changed,true);assert.throws(()=>publish(state,id,value),/明确下架/);
 state=publish(state,id,value,{confirmDownlist:true});
 for(const model of state.models.filter(row=>row.templateId===id)){assert.equal(model.listingStatus,'已下架');assert.equal(model.callsEnabled,false);assert.equal(model.capabilities.context,262144);}
 assert.deepEqual(state.models.filter(row=>row.templateId!==id),before.models.filter(row=>row.templateId!==id));assert.deepEqual(state.modelSalePrices,before.modelSalePrices);
});
test('stale versions, missing confirmation, permissions and storage failure never commit metadata or drafts',()=>{
 const {state,id}=fixture(),record=libraryRecord(state,id),value={...metadata(record),name:'直接提交'},base=materialBase(state,record),raw=JSON.stringify(state);
 for(const patch of [{expectedBase:'stale'},{confirmed:false}])assert.throws(()=>publish(state,id,value,patch));
 assert.throws(()=>publish({...state,currentRole:'运维人员'},id,value),/无权/);
 const newer=structuredClone(state);newer.models.push({...newer.models.find(row=>row.id==='p2-a'),id:'p2-c'});assert.throws(()=>publish(newer,id,value,{expectedBase:base}),/重新核对/);
 assert.throws(()=>persistModelAction(state,{type:'modelOperations',operation:'templatePublish',data:{id,value,expectedBase:base,confirmed:true}},{getItem:()=>raw,setItem(){throw Error('quota');}}),/quota/);
 assert.equal(JSON.stringify(state),raw);
});

test('ordinary downlisting rejects new orders and activation while existing orders and model history remain',async()=>{
  const {orderActivationCommand}=await import('../src/admin-v2/domain.js');
  let state=withAdminSession(createAdminSeed()),model=state.models.find(row=>row.listingStatus==='已上架');
  state.products.push({id:'p2-order-product',modelIds:[model.id],billingType:'payg'});
  const order={id:'p2-new-order',productId:'p2-order-product',tenantId:'tenant-gov',billingType:'payg',status:'待开通'};
  model.openScope='all';state.grants=state.grants.filter(row=>!(row.subjectType==='tenant'&&row.subjectId===order.tenantId));
  state=commitAdminState(state,{type:'add',collection:'orders',record:order});
  assert.ok(orderActivationCommand(state,order.id));
  const before=structuredClone(state.orders);
  state=commitAdminState(state,{type:'modelOperation',operation:'unlist',modelId:model.id,data:{}});
  assert.throws(()=>orderActivationCommand(state,order.id),/暂不能订购/);
  assert.throws(()=>commitAdminState(state,{type:'add',collection:'orders',record:{...order,id:'another'}}),/暂不能订购/);
  assert.deepEqual(state.orders,before);
});


test('editing an existing card preserves hidden metadata and does not require an unknown task',()=>{
 const {state,id}=fixture(),record=libraryRecord(state,id);
 record.profile={...record.profile,tasks:[],license:'MIT',architecture:'Dense',supportedParameters:['temperature'],detailDescription:'保留详细资料',releaseDate:'2026-01-01'};
 const before=structuredClone(record),value={...metadata(record),name:'卡片新名称',description:'卡片新简介',profile:{...record.profile,releaseDate:'2026-11-03'}};
 assert.equal(materialImpact(state,record,value).changed,false);
 const saved=publish(state,id,value),current=libraryRecord(saved,id);
 assert.equal(current.name,'卡片新名称');assert.equal(current.description,'卡片新简介');assert.equal(current.profile.releaseDate,'2026-11-03');
 assert.equal(current.profile.tasks?.length || 0,0);
 for(const key of ['license','architecture','supportedParameters','detailDescription'])assert.deepEqual(current.profile[key],before.profile[key]);
 assert.deepEqual(current.capabilities,before.capabilities);assert.equal(current.modelId,before.modelId);assert.deepEqual(record,before);
 assert.throws(()=>publish(state,id,{...value,capabilities:{...value.capabilities,context:-1}}));
 assert.throws(()=>publish(state,id,{...value,profile:{...value.profile,releaseDate:'bad-date'}}));
});

test('editing sparse catalogue descriptions does not report unknown capability defaults as changes',()=>{
  const state=withAdminSession(createAdminSeed());
  const record={id:'template-sparse-visual',modelId:'sparse-visual',name:'视觉资料',type:'image',profile:{},capabilities:{},description:''};
  state.modelTemplates.push(record);
  const value={...metadata(record),description:'仅修改介绍',capabilities:{streaming:null,tools:null,context:null,output:null}};
  assert.equal(materialImpact(state,record,value).changed,false);
  assert.equal(materialImpact(state,record,{...value,profile:{inputModalities:['图片']}}).changed,true);
});
