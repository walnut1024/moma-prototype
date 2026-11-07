import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {legacySupplierState} from './legacy-supplier-fixture.mjs';
import {commitAdminState} from '../src/admin-v2/state-transaction.js';
import {routingServices,routingChannels} from '../src/admin-v2/service-routing.js';
import {modelSupplies} from '../src/admin-v2/model-management.js';
import {mappingCandidates,mappingConfig,mappingPreview,mappingSignature,mappingReadiness,mappingSourceVersion,mappingReferences} from '../src/admin-v2/service-model-mappings.js';
import {supplierDeletionBlock} from '../src/admin-v2/provider-channels.js';
import {startLocalBackend} from '../database/local-runtime.js';
import {domainModelWorkspace} from '../src/mock/model-fields.js';

function fixture(){let state=legacySupplierState();const service=routingServices(state).find(row=>row.id==='standard:model-1');for(const row of mappingCandidates(state,service)){const entry=row.provider.catalogModels.find(item=>item.modelId===row.catalogueModelId);entry.libraryId=service.model.templateId || service.modelId;}state.modelSupplies=state.modelSupplies.filter(row=>row.modelId!==service.modelId);state.serviceRoutes=state.serviceRoutes.filter(row=>row.serviceId!==service.id);return {state,service,candidates:mappingCandidates(state,service)};}
const config=(row)=>({providerId:row.provider.id,endpointId:row.endpointId,associationId:row.id,catalogueModelId:row.catalogueModelId,upstreamModelId:row.upstreamModelId,platformInterface:'/v1/chat/completions'});
function command(f,operation,data={},role='平台管理员'){const supply=data.id && f.state.modelSupplies.find(row=>row.id===data.id);return commitAdminState(f.state,{type:'modelOperations',operation,modelId:f.service.modelId,data:{serviceId:f.service.id,expectedSource:mappingSourceVersion(f.state,f.service),expectedRevision:supply?.mappingRevision || 0,...data}},role);}
function create(f){f.state=command(f,'serviceMappingCreate',{name:'移动云映射',config:config(f.candidates[0],f.service)});return f.state.modelSupplies.find(row=>row.modelId===f.service.modelId);}

test('preview is read only; create → validate → enable is explicit and does not publish routes, prices or services',()=>{
 const f=fixture(),before=structuredClone(f.state),draft=config(f.candidates[0],f.service);
 const preview=mappingPreview(f.state,f.service,draft);assert.equal(preview.request.platform.model,f.service.callId);assert.equal(preview.request.upstream.model,f.candidates[0].upstreamModelId);assert.deepEqual(f.state,before);
 const s=create(f);assert.equal(s.status,'已停用');assert.equal(s.validationStatus,'待验证');assert.equal(s.serviceMapping.validation,null);assert.throws(()=>command(f,'serviceMappingEnable',{id:s.id,validation:{signature:'forged'}}),/验证/);
 f.state=command(f,'serviceMappingValidate',{id:s.id,result:'通过'});assert.equal(f.state.modelSupplies.find(row=>row.id===s.id).status,'已停用');
 f.state=command(f,'serviceMappingEnable',{id:s.id});assert.ok(routingChannels(f.state,f.service).find(row=>row.id===s.id).available);
 for(const key of ['serviceRoutes','models','modelSalePrices','supplyPrices','providers'])assert.deepEqual(f.state[key],before[key],key);
 assert.throws(()=>command(f,'serviceMappingCreate',{name:'重复',config:draft}),/已建立/);
});
test('only exact same-master supply and provider scope are accepted; readonly and stale writes reject atomically',()=>{
 const f=fixture(),s=create(f),before=structuredClone(f.state),foreign=routingServices(f.state).find(row=>row.modelId!==f.service.modelId),other=mappingCandidates(f.state,foreign)[0];
 if(other)assert.throws(()=>command(f,'serviceMappingSave',{id:s.id,name:'冒名',config:config(other,f.service)}),/当前模型|对应|关联/);
 assert.throws(()=>command(f,'serviceMappingSave',{id:s.id,name:'x',config:config(f.candidates[0],f.service),expectedRevision:99}),/修订/);
 assert.throws(()=>command(f,'serviceMappingValidate',{id:s.id,expectedSource:'stale'}),/已变化/);
 assert.throws(()=>command(f,'serviceMappingEnable',{id:s.id},'运维人员'),/无权/);assert.deepEqual(f.state,before);
 const providerService={...f.service,providerId:f.candidates[1].provider.id};assert.throws(()=>mappingPreview(f.state,providerService,config(f.candidates[0],f.service)),/服务商/);
});
test('pending edits preserve the effective mapping and validation until explicitly checked and applied; discard keeps it intact',()=>{
 const f=fixture(),s=create(f);f.state=command(f,'serviceMappingValidate',{id:s.id});f.state=command(f,'serviceMappingEnable',{id:s.id});const old=structuredClone(f.state.modelSupplies.find(row=>row.id===s.id));
 f.state=command(f,'serviceMappingSave',{id:s.id,name:'备用映射',config:config(f.candidates[1],f.service)});let row=f.state.modelSupplies.find(row=>row.id===s.id);assert.equal(row.endpointId,old.endpointId);assert.deepEqual(row.serviceMapping.validation,old.serviceMapping.validation);assert.equal(mappingReadiness(f.state,f.service,row),'');
 const target=f.candidates[1];assert.match(supplierDeletionBlock(f.state,target.provider,target.modelId,target).message,/待验证映射/);
 assert.throws(()=>command(f,'serviceMappingApply',{id:s.id,confirmed:true}),/先验证/);
 f.state=command(f,'serviceMappingValidate',{id:s.id});f.state=command(f,'serviceMappingApply',{id:s.id,confirmed:true});row=f.state.modelSupplies.find(row=>row.id===s.id);assert.equal(row.endpointId,target.endpointId);assert.equal(row.status,'已启用');assert.equal(mappingReadiness(f.state,f.service,row),'');assert.equal(row.serviceMapping.pending,undefined);
 f.state=command(f,'serviceMappingSave',{id:s.id,name:'另一个',config:config(f.candidates[0],f.service)});f.state=command(f,'serviceMappingDiscard',{id:s.id});assert.equal(f.state.modelSupplies.find(row=>row.id===s.id).endpointId,target.endpointId);
});
test('names retain evidence; public identity and connection changes invalidate it',()=>{
 const f=fixture(),s=create(f);f.state=command(f,'serviceMappingValidate',{id:s.id});let row=f.state.modelSupplies.find(row=>row.id===s.id);const signature=row.serviceMapping.validation.signature;
 f.state=command(f,'serviceMappingSave',{id:s.id,name:'新名称',config:config(f.candidates[0],f.service)});row=f.state.modelSupplies.find(row=>row.id===s.id);assert.equal(row.serviceMapping.validation.signature,signature);
 const original=mappingSignature(f.state,f.service,mappingConfig(row,f.service.model));f.state.providers.find(p=>p.id===row.providerId).name='重命名';assert.equal(mappingSignature(f.state,f.service,mappingConfig(row,f.service.model)),original);
 assert.notEqual(mappingSignature(f.state,{...f.service,callId:'different-id'},mappingConfig(row,f.service.model)),original);
 f.state.endpoints.find(e=>e.id===row.endpointId).baseUrl='https://changed.example.invalid/v1/chat/completions';assert.ok(mappingReadiness(f.state,f.service,row));assert.throws(()=>command(f,'serviceMappingEnable',{id:s.id}),/配置|检测|验证/);
});
test('active routes and drafts block disable, target edits and removal; stopping then unlinking preserves records',()=>{
 const f=fixture(),s=create(f);f.state=command(f,'serviceMappingValidate',{id:s.id});f.state=command(f,'serviceMappingEnable',{id:s.id});
 f.state.serviceRoutes.push({id:'test-route',serviceId:f.service.id,activeVersion:0,versions:[],draft:{channels:[{supplyId:s.id,enabled:false}]}});assert.equal(mappingReferences(f.state,s)[0].kind,'路由草稿');
 for(const op of ['serviceMappingDisable','serviceMappingRemove'])assert.throws(()=>command(f,op,{id:s.id,confirmed:true}),/路由/);
 assert.throws(()=>command(f,'serviceMappingSave',{id:s.id,name:'换渠道',config:config(f.candidates[1],f.service)}),/路由/);
 f.state.serviceRoutes=[];f.state.modelOnboardings=[{id:'pending',status:'接入中',supplyId:s.id}];assert.throws(()=>command(f,'serviceMappingDisable',{id:s.id,confirmed:true}),/未完成任务/);f.state.modelOnboardings=[];assert.throws(()=>command(f,'serviceMappingRemove',{id:s.id,confirmed:true}),/先停用/);f.state=command(f,'serviceMappingDisable',{id:s.id,confirmed:true});f.state=command(f,'serviceMappingRemove',{id:s.id,confirmed:true});assert.equal(f.state.modelSupplies.find(row=>row.id===s.id).status,'已移除');assert.equal(modelSupplies(f.state,f.service.modelId).length,0);
});
test('HTTP/D1 mapping commands retain stable references after reload and reject forged validation and revisions',{timeout:60000},async()=>{
 const accessCode=randomBytes(24).toString('hex'),local=await startLocalBackend({loginHashes:{'admin-001':createHash('sha256').update(accessCode).digest('hex')}});let cookie,state;
 async function api(path,body,key){const response=await local.runtime.dispatchFetch('https://example.test/api/5120'+path,{method:body?'POST':'GET',headers:{...(cookie?{cookie}:{}),...(body?{origin:'https://example.test','content-type':'application/json','x-moma-request':'1'}:{}),...(key?{'idempotency-key':key}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json(),headers:response.headers};}
 async function refresh(){state=domainModelWorkspace((await api('/model-operations')).data);}
 async function run(operation,modelId,data){const id=crypto.randomUUID();return api('/model-operations/commands',{operationId:id,expectedRevision:state.revision,action:{type:'modelOperations',operation,modelId,data}},id);}
 try{const login=await api('/auth/login',{accountId:'admin-001',accessCode});cookie=login.headers.get('set-cookie').split(';')[0];await refresh();
 const service=routingServices(state).find(row=>row.mode==='standard' && row.callId==='deepseek-v4-flash-0731');assert.ok(service);
 const original=modelSupplies(state,service.modelId)[0];assert.ok(original);const route=state.serviceRoutes.find(row=>row.serviceId===service.id);
 if(route){const stop=await run('serviceRouteStop',service.modelId,{serviceId:service.id,expectedVersion:route.activeVersion,confirmed:true});assert.equal(stop.status,200,JSON.stringify(stop.data));await refresh();}
 const remove=await run('removeServiceChannel',service.modelId,{supplyId:original.id,expectedUpdatedAt:state.models.find(m=>m.id===service.modelId).updatedAt});assert.equal(remove.status,200,JSON.stringify(remove.data));await refresh();
 const channel=mappingCandidates(state,service).find(row=>row.endpointId===original.endpointId);assert.ok(channel);const input=config(channel,service),before=structuredClone(state);
 async function mapping(operation,id,extra={}){const supply=state.modelSupplies.find(row=>row.id===id);const result=await run(operation,service.modelId,{serviceId:service.id,id,expectedRevision:supply?.mappingRevision || 0,expectedSource:mappingSourceVersion(state,service),...extra});await refresh();return result;}
 const saved=await mapping('serviceMappingCreate',undefined,{name:'D1映射',config:input});assert.equal(saved.status,200,JSON.stringify(saved.data));const created=state.modelSupplies.find(row=>row.mappingName==='D1映射');assert.equal(created.status,'已停用');
 assert.equal((await mapping('serviceMappingEnable',created.id,{validation:{signature:'forged'}})).status,422);
 assert.equal((await mapping('serviceMappingValidate',created.id)).status,200);assert.equal((await mapping('serviceMappingEnable',created.id)).status,200);const reloaded=state.modelSupplies.find(row=>row.id===created.id);assert.equal(reloaded.channelId,channel.id);assert.equal(reloaded.status,'已启用');
 const revision=state.revision;assert.equal((await mapping('serviceMappingSave',created.id,{name:'bad',config:input,expectedRevision:999})).status,422);assert.equal(state.revision,revision);
 for(const key of ['models','modelSalePrices','supplyPrices','serviceRoutes','providers'])assert.deepEqual(state[key],before[key],key);assert.equal((await local.db.prepare('PRAGMA foreign_key_check').all()).results.length,0);
 }finally{await local.runtime.dispose();}
});
