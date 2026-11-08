import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {legacySupplierState} from './legacy-supplier-fixture.mjs';
import {commitAdminState} from '../src/admin-v2/state-transaction.js';
import {operationsTransaction} from '../src/admin-v2/model-operations.js';
import {routingServices,routingChannels,serviceRoute,activeRouteVersion} from '../src/admin-v2/service-routing.js';
import {mappingCandidates} from '../src/admin-v2/service-model-mappings.js';
import {routeEditorChannels,routeEditorPayload} from '../src/admin-v2/service-route-editor.js';
import {routeEditConfig} from '../src/admin-v2/route-workspace.js';
import {startLocalBackend} from '../database/local-runtime.js';
import {domainModelWorkspace} from '../src/mock/model-fields.js';

function fixture(){const state=legacySupplierState(),service=routingServices(state).find(row=>row.id==='standard:model-1');for(const row of mappingCandidates(state,service)){row.provider.catalogModels.find(item=>item.modelId===row.catalogueModelId).libraryId=service.model.templateId || service.modelId;}state.modelSupplies=state.modelSupplies.filter(row=>row.modelId!==service.modelId);state.serviceRoutes=state.serviceRoutes.filter(row=>row.serviceId!==service.id);return {state,service};}
function payload(state,service,targets,strategy='weighted'){const channels=routeEditorChannels(state,service),config={...routeEditConfig(service,serviceRoute(state,service.id)),strategy,groups:[{id:'P1',name:'默认组',strategy}],channels:targets.map((target,index)=>({supplyId:target.id,enabled:true,groupId:'P1',weight:targets.length===1?100:50,priority:index+1}))};return routeEditorPayload(state,service,config,channels);}
function run(state,service,data,role='平台管理员'){return commitAdminState(state,{type:'modelOperations',operation:'serviceRouteConfigure',modelId:service.modelId,data},role);}

test('one save creates, checks and enables mapping then publishes route atomically, preserving source records and prices',()=>{
 const {state,service}=fixture(),before=structuredClone(state),target=routeEditorChannels(state,service).find(row=>row.available);assert.ok(target?.candidate);
 const data=payload(state,service,[target]);operationsTransaction(state,{operation:'serviceRouteConfigure',modelId:service.modelId,data});assert.deepEqual(state,before,'preview is read-only');
 const next=run(state,service,data),route=activeRouteVersion(serviceRoute(next,service.id)),supply=next.modelSupplies.find(row=>row.id===route.config.channels[0].supplyId);
 assert.ok(!supply.id.startsWith('candidate:'));assert.equal(supply.status,'已启用');assert.equal(supply.validationStatus,'通过');assert.equal(supply.channelId,target.channelId);assert.equal(supply.upstreamModelId,target.upstreamModelId);assert.ok(supply.serviceMapping.validation.signature);
 for(const key of ['models','providers','supplyPrices','modelSalePrices','modelVersions'])assert.deepEqual(next[key],before[key],key);
 assert.equal(routingChannels(next,service).find(row=>row.id===supply.id).available,true);
 const config=route.config,id=supply.id;const reused=run(next,service,routeEditorPayload(next,service,config,routeEditorChannels(next,service)));assert.equal(reused.modelSupplies.find(row=>row.id===id).mappingRevision,supply.mappingRevision);assert.equal(serviceRoute(reused,service.id).versions.length,2);
});
test('invalid weight, missing evidence, stale revision and readonly saves leave every collection unchanged',()=>{
 const {state,service}=fixture(),channels=routeEditorChannels(state,service).filter(row=>row.available);assert.ok(channels.length>=2);const data=payload(state,service,channels.slice(0,2),'weighted'),before=structuredClone(state);
 data.config.channels[0].weight=40;assert.throws(()=>run(state,service,data),/100/);assert.deepEqual(state,before);
 data.config.channels[0].weight=50;assert.throws(()=>run(state,service,{...data,sourceVersion:'stale'}),/已变化/);assert.throws(()=>run(state,service,{...data,expectedVersion:999}),/已变化/);assert.throws(()=>run(state,service,data,'运维人员'),/无权/);assert.deepEqual(state,before);
 const bad=structuredClone(data);bad.sources[0].config.upstreamModelId='another-model';assert.throws(()=>run(state,service,bad),/关联|模型/);assert.deepEqual(state,before);
 const unavailable=structuredClone(state);unavailable.endpoints.find(row=>row.id===channels[0].endpointId).baseUrl='https://changed.example.invalid/v1';const unavailableService=routingServices(unavailable).find(row=>row.id===service.id),unavailableData=payload(unavailable,unavailableService,[routeEditorChannels(unavailable,unavailableService).find(row=>row.endpointId===channels[0].endpointId)]),unchanged=structuredClone(unavailable);assert.throws(()=>run(unavailable,unavailableService,unavailableData),/检测|验证|配置/);assert.deepEqual(unavailable,unchanged);
});
test('supplier service cannot use another supplier; switching channels preserves history and unrelated mappings',()=>{
 const {state,service}=fixture(),choices=routeEditorChannels(state,service).filter(row=>row.available);let next=run(state,service,payload(state,service,[choices[0]]));const old=structuredClone(next.modelSupplies.find(row=>row.modelId===service.modelId));
 const nextTarget=routeEditorChannels(next,service).find(row=>row.candidate && row.available);assert.ok(nextTarget);next=run(next,service,payload(next,service,[nextTarget]));assert.deepEqual(next.modelSupplies.find(row=>row.id===old.id),old);assert.equal(serviceRoute(next,service.id).versions[0].config.channels[0].supplyId,old.id);
 const model=next.models.find(row=>row.id===service.modelId);model.serviceMode='provider';model.serviceProviders=[{providerId:choices[0].provider.id,callId:'test-provider-model'}];const scoped=routingServices(next).find(row=>row.modelId===service.modelId);assert.ok(routeEditorChannels(next,scoped).every(row=>row.provider.id===scoped.providerId));
 const foreign=choices.find(row=>row.provider.id!==scoped.providerId);assert.ok(foreign);const forged=payload(next,scoped,[foreign]);assert.throws(()=>run(next,scoped,forged),/服务商|不属于|关联/);
});
test('HTTP D1 one-save contract survives refresh, idempotent retry, conflict, invalid target and readonly roles',{timeout:60000},async()=>{
 const accessCode=randomBytes(24).toString('hex'),local=await startLocalBackend({ demo: true, loginHashes:{'admin-001':createHash('sha256').update(accessCode).digest('hex'),'admin-002':createHash('sha256').update(accessCode).digest('hex')}});let cookie;
 async function api(path,body,key){const r=await local.runtime.dispatchFetch('https://example.test/api/v1'+path,{method:body?'POST':'GET',headers:{...(cookie?{cookie}:{}),...(body?{origin:'https://example.test','content-type':'application/json','x-moma-request':'1'}:{}),...(key?{'idempotency-key':key}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json(),headers:r.headers};}
 try{const login=await api('/auth/login',{accountId:'admin-001',accessCode});cookie=login.headers.get('set-cookie').split(';')[0];let state=domainModelWorkspace((await api('/model-operations')).data),service=routingServices(state).find(row=>row.mode==='standard' && row.callId==='deepseek-v4-flash-0731');assert.ok(service);
 const channel=routeEditorChannels(state,service).find(row=>row.available),data=payload(state,service,[channel]),before=structuredClone(state),key=crypto.randomUUID(),body={operationId:key,expectedRevision:state.revision,action:{type:'modelOperations',operation:'serviceRouteConfigure',modelId:service.modelId,data}};
 const saved=await api('/model-operations/commands',body,key);assert.equal(saved.status,200,JSON.stringify(saved.data));assert.equal((await api('/model-operations/commands',body,key)).status,200);
 state=domainModelWorkspace((await api('/model-operations')).data);assert.equal(state.revision,before.revision+1);const effective=activeRouteVersion(serviceRoute(state,service.id));assert.ok(effective);assert.equal(effective.config.channels.length,1);assert.ok(routingChannels(state,service).find(row=>row.id===effective.config.channels[0].supplyId).available);
 const badKey=crypto.randomUUID();assert.equal((await api('/model-operations/commands',{...body,operationId:badKey},badKey)).status,409);
 const invalid=routeEditorPayload(state,service,{...effective.config,channels:[{...effective.config.channels[0],supplyId:'missing'}]},routeEditorChannels(state,service)),invalidKey=crypto.randomUUID();assert.equal((await api('/model-operations/commands',{operationId:invalidKey,expectedRevision:state.revision,action:{...body.action,data:invalid}},invalidKey)).status,422);assert.deepEqual(domainModelWorkspace((await api('/model-operations')).data),state);
 for(const field of ['models','providers','supplyPrices','modelSalePrices'])assert.deepEqual(state[field],before[field],field);assert.equal((await local.db.prepare('PRAGMA foreign_key_check').all()).results.length,0);
 async function command(operation,data){const operationId=crypto.randomUUID();const result=await api('/model-operations/commands',{operationId,expectedRevision:state.revision,action:{type:'modelOperations',operation,modelId:service.modelId,data}},operationId);assert.equal(result.status,200,JSON.stringify(result.data));state=domainModelWorkspace((await api('/model-operations')).data);service=routingServices(state).find(row=>row.id===service.id);}
 await command('serviceRouteStop',{serviceId:service.id,expectedVersion:serviceRoute(state,service.id).activeVersion,confirmed:true});
 const previousId=effective.config.channels[0].supplyId,previousSupply=state.modelSupplies.find(row=>row.id===previousId);
 await command('removeServiceChannel',{supplyId:previousId,expectedUpdatedAt:service.model.updatedAt});
 const newTarget=routeEditorChannels(state,service).find(row=>row.candidate && row.endpointId===previousSupply.endpointId);assert.ok(newTarget);
 await command('serviceRouteConfigure',payload(state,service,[newTarget]));const active=activeRouteVersion(serviceRoute(state,service.id));assert.notEqual(active.config.channels[0].supplyId,previousId);assert.ok(routingChannels(state,service).find(row=>row.id===active.config.channels[0].supplyId).available);assert.equal(state.modelSupplies.find(row=>row.id===previousId).status,'已移除');assert.equal((await local.db.prepare('PRAGMA foreign_key_check').all()).results.length,0);
 const viewer=await api('/auth/login',{accountId:'admin-002',accessCode});assert.equal(viewer.status,200);cookie=viewer.headers.get('set-cookie').split(';')[0];const readonlyKey=crypto.randomUUID();assert.equal((await api('/model-operations/commands',{operationId:readonlyKey,expectedRevision:state.revision,action:{...body.action,data:routeEditorPayload(state,service,active.config,routeEditorChannels(state,service))}},readonlyKey)).status,403);
 }finally{await local.runtime.dispose();}
});
