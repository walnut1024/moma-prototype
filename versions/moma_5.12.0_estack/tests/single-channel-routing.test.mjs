import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {parseAdminState,commitAdminState} from '../src/admin-v2/store.js';
import {withAdminSession} from './admin-session-fixture.mjs';
import {routingServices,routingChannels,serviceRoute,activeRouteVersion,lastRouteVersion,routeSourceVersion,emptyRouteConfig,routingStatus} from '../src/admin-v2/service-routing.js';
import {routeEditConfig} from '../src/admin-v2/route-workspace.js';
import {mappingReferences} from '../src/admin-v2/service-model-mappings.js';
import {startLocalBackend} from '../database/local-runtime.js';
import {domainModelWorkspace} from '../src/mock/model-fields.js';
import {simulateRequest} from '../src/admin-v2/domain.js';

function fixture(){const state=withAdminSession(parseAdminState(null)),service=routingServices(state).find(row=>row.id==='standard:model-1');assert.ok(service);service.model.listingStatus='已下架';service.model.callsEnabled=false;state.serviceRoutes=state.serviceRoutes.filter(row=>row.serviceId!==service.id);const channels=routingChannels(state,service).filter(row=>row.available);assert.ok(channels.length>=2);return {state,service,channels};}
test('route review source is stable across client patch ordering without changing business arrays',()=>{const f=fixture(),source=routeSourceVersion(f.state,f.service);f.state.modelSupplies.reverse();assert.equal(routeSourceVersion(f.state,f.service),source);const order=f.state.modelSupplies.map(row=>row.id);routeSourceVersion(f.state,f.service);assert.deepEqual(f.state.modelSupplies.map(row=>row.id),order);});
const fixed=id=>({...emptyRouteConfig(),channels:[{supplyId:id,enabled:true,priority:1,weight:0,groupId:'P1'}]});
function run(f,operation,extra={},role='平台管理员'){const service=routingServices(f.state).find(row=>row.id===f.service.id);return commitAdminState(f.state,{type:'modelOperations',operation,data:{serviceId:service.id,expectedVersion:serviceRoute(f.state,service.id)?.activeVersion || 0,sourceVersion:routeSourceVersion(f.state,service),...extra}},role);}

test('fixed route creation and replacement are atomic; stop releases references and restore preserves history without resuming service',()=>{
 const f=fixture(),before=structuredClone(f.state);assert.equal(routeEditConfig(f.service,null).strategy,'fixed');
 f.state=run(f,'serviceRoutePublish',{config:fixed(f.channels[0].id)});const first=structuredClone(serviceRoute(f.state,f.service.id));
 assert.throws(()=>run(f,'serviceRoutePublish',{config:fixed(f.channels[1].id),sourceVersion:'stale'}),/已变化/);assert.deepEqual(serviceRoute(f.state,f.service.id),first);
 f.state=run(f,'serviceRoutePublish',{config:fixed(f.channels[1].id)});const replacement=structuredClone(serviceRoute(f.state,f.service.id));assert.equal(activeRouteVersion(replacement).config.channels[0].supplyId,f.channels[1].id);assert.deepEqual(replacement.versions[0],first.versions[0]);
 assert.throws(()=>run(f,'serviceRouteStop',{confirmed:'true'}),/确认/);f.state=run(f,'serviceRouteStop',{confirmed:true});const stopped=serviceRoute(f.state,f.service.id);assert.equal(stopped.activeVersion,0);assert.deepEqual(stopped.versions,replacement.versions);assert.equal(mappingReferences(f.state,f.channels[1]).length,0);assert.equal(routingStatus(f.state,f.service).label,'已停用');assert.equal(routeEditConfig(f.service,stopped).channels[0].supplyId,f.channels[1].id);
 const stoppedCopy=structuredClone(f.state);assert.throws(()=>run(f,'serviceRouteRestore',{confirmed:false}),/确认/);assert.throws(()=>run(f,'serviceRouteRestore',{confirmed:true},'运维人员'),/无权/);assert.deepEqual(f.state,stoppedCopy);
 f.state=run(f,'serviceRouteRestore',{confirmed:true,config:fixed(f.channels[0].id)});const restored=serviceRoute(f.state,f.service.id);assert.deepEqual(activeRouteVersion(restored).config,lastRouteVersion(stopped).config);assert.equal(activeRouteVersion(restored).restoredFrom,2);assert.deepEqual(restored.versions.slice(0,2),replacement.versions);
 for(const key of ['models','modelSupplies','providers','endpoints','supplyPrices','modelSalePrices'])assert.deepEqual(f.state[key],before[key],key);
});
test('visibility is not stop; stopped provider can stop its own route while sibling service stays live',()=>{
 const f=fixture();f.state=run(f,'serviceRoutePublish',{config:fixed(f.channels[0].id)});Object.assign(f.state.models.find(row=>row.id===f.service.modelId),{listingStatus:'已上架',callsEnabled:true,marketVisible:false});assert.throws(()=>run(f,'serviceRouteStop',{confirmed:true}),/先.*停用服务/);
 const provider=routingServices(f.state).find(row=>row.mode==='provider' && row.providerId==='service-review-provider-aliyun' && row.modelId==='catalog-demo-qwen');assert.ok(provider);f.service=provider;const model=f.state.models.find(row=>row.id===provider.modelId);Object.assign(model,{listingStatus:'已上架',callsEnabled:true});const sibling=structuredClone(model.serviceProviders.find(row=>row.providerId!==provider.providerId));const channel=routingChannels(f.state,provider).find(row=>row.available);f.state=run(f,'serviceRoutePublish',{config:fixed(channel.id)});assert.throws(()=>run(f,'serviceRouteStop',{confirmed:true}),/先停服当前供应商/);
 f.state.models.find(row=>row.id===provider.modelId).serviceProviders.find(row=>row.providerId===provider.providerId).callsEnabled=false;f.state=run(f,'serviceRouteStop',{confirmed:true});f.state=run(f,'serviceRouteRestore',{confirmed:true});const after=f.state.models.find(row=>row.id===provider.modelId);assert.equal(after.listingStatus,'已上架');assert.equal(after.serviceProviders.find(row=>row.providerId===provider.providerId).callsEnabled,false);assert.deepEqual(after.serviceProviders.find(row=>row.providerId!==provider.providerId),sibling);
});
test('restore checks present supply and draft dependencies rather than blindly activating historical config',()=>{
 const f=fixture();f.state=run(f,'serviceRoutePublish',{config:fixed(f.channels[0].id)});f.state=run(f,'serviceRouteStop',{confirmed:true});const before=structuredClone(f.state);f.state.modelSupplies.find(row=>row.id===f.channels[0].id).status='已停用';assert.throws(()=>run(f,'serviceRouteRestore',{confirmed:true}),/停用/);assert.equal(serviceRoute(f.state,f.service.id).activeVersion,0);assert.deepEqual(serviceRoute(f.state,f.service.id).versions,serviceRoute(before,f.service.id).versions);
 f.state=before;f.state=run(f,'serviceRouteDraft',{config:fixed(f.channels[1].id)});assert.throws(()=>run(f,'serviceRouteRestore',{confirmed:true}),/草稿/);assert.ok(serviceRoute(f.state,f.service.id).draft);f.state=run(f,'serviceRouteStop',{confirmed:true});assert.equal(serviceRoute(f.state,f.service.id).draft,null);
});
test('new requests use the replacement channel; stopped route never falls back to another supply',()=>{
 const f=fixture();Object.assign(f.service.model,{listingStatus:'已上架',visibility:'公开',callsEnabled:true,openScope:'all'});
 const key=f.state.apiKeys.find(row=>row.status==='有效' && f.state.grants.some(grant=>grant.subjectId===row.id && grant.status==='生效中'));assert.ok(key);key.modelIds=[...new Set([...key.modelIds,f.service.modelId])];f.state.limits=f.state.limits.filter(row=>row.scopeId!==key.id);
 f.state=run(f,'serviceRoutePublish',{config:fixed(f.channels[0].id)});
 const call=()=>simulateRequest(f.state,{requestId:crypto.randomUUID(),keyId:key.id,modelId:f.service.callId}).request;
 assert.equal(call().endpointId,f.channels[0].endpointId);f.state=run(f,'serviceRoutePublish',{config:fixed(f.channels[1].id)});const replacement=call();assert.equal(replacement.httpStatus,200);assert.equal(replacement.supplyId,f.channels[1].id);
 f.state.models.find(row=>row.id===f.service.modelId).callsEnabled=false;f.state=run(f,'serviceRouteStop',{confirmed:true});f.state.models.find(row=>row.id===f.service.modelId).callsEnabled=true;const unavailable=call();assert.notEqual(unavailable.httpStatus,200);assert.equal(unavailable.attempts.some(row=>row.dispatched),false);
 f.state=run(f,'serviceRouteRestore',{confirmed:true});assert.equal(call().supplyId,f.channels[1].id);
});
test('HTTP/D1 create replace stop restore survive reload, preserve data and replay idempotently',{timeout:60000},async()=>{
 const accessCode=randomBytes(24).toString('hex'),local=await startLocalBackend({loginHashes:{'admin-001':createHash('sha256').update(accessCode).digest('hex')}});let cookie,state;
 async function api(path,body,key){const r=await local.runtime.dispatchFetch('https://example.test/api/5120'+path,{method:body?'POST':'GET',headers:{...(cookie?{cookie}:{}),...(body?{origin:'https://example.test','content-type':'application/json','x-moma-request':'1'}:{}),...(key?{'idempotency-key':key}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json(),headers:r.headers};}
 async function reload(){state=domainModelWorkspace((await api('/model-operations')).data);}
 try{cookie=(await api('/auth/login',{accountId:'admin-001',accessCode})).headers.get('set-cookie').split(';')[0];await reload();const service=routingServices(state).find(row=>row.mode==='standard' && row.callId==='deepseek-v4-flash-0731'),channels=routingChannels(state,service).filter(row=>row.available);assert.ok(channels.length>=2);const before=structuredClone(state);
 async function command(operation,extra={}){const id=crypto.randomUUID(),body={operationId:id,expectedRevision:state.revision,action:{type:'modelOperations',operation,data:{serviceId:service.id,expectedVersion:serviceRoute(state,service.id)?.activeVersion || 0,sourceVersion:routeSourceVersion(state,service),...extra}}};const result=await api('/model-operations/commands',body,id);await reload();return {result,body,id};}
 assert.equal((await command('serviceRoutePublish',{config:fixed(channels[0].id)})).result.status,200);const old=structuredClone(serviceRoute(state,service.id));
 assert.equal((await command('serviceRoutePublish',{config:fixed(channels[1].id),sourceVersion:'stale'})).result.status,422);assert.deepEqual(serviceRoute(state,service.id),old);
 const replacement=await command('serviceRoutePublish',{config:fixed(channels[1].id)});assert.equal(replacement.result.status,200);assert.equal((await api('/model-operations/commands',replacement.body,replacement.id)).status,200);await reload();assert.equal(activeRouteVersion(serviceRoute(state,service.id)).config.channels[0].supplyId,channels[1].id);
 assert.equal((await command('serviceRouteStop',{confirmed:true})).result.status,200);assert.equal(serviceRoute(state,service.id).activeVersion,0);assert.equal((await command('serviceRouteRestore',{confirmed:true})).result.status,200);assert.equal(activeRouteVersion(serviceRoute(state,service.id)).config.channels[0].supplyId,channels[1].id);
 for(const key of ['models','modelSupplies','providers','endpoints','supplyPrices','modelSalePrices'])assert.deepEqual(state[key],before[key],key);assert.equal((await local.db.prepare('PRAGMA foreign_key_check').all()).results.length,0);
 }finally{await local.runtime.dispose();}
});
