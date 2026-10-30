import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdminSeed,commitAdminState,parseAdminState,persistModelAction} from '../src/admin-v2/store.js';
import {providerServices,providerServiceId,activeProviderPrice,providerPriceRevision,unifiedBillingDraft,serviceSupplyRows} from '../src/admin-v2/service-workspace.js';
import {routingServices,routingChannels,routeSourceVersion,serviceRoute,activeRouteVersion,validateRouteConfig} from '../src/admin-v2/service-routing.js';
import {modelSupplies,publicationChecks} from '../src/admin-v2/model-management.js';
import {connectionFingerprint} from '../src/admin-v2/connection-state.js';
import {simulateRequest} from '../src/admin-v2/domain.js';
const run=(state,operation,modelId,data)=>commitAdminState(state,{type:'modelOperations',operation,modelId,data});
const items=[{name:'输入',condition:'',unit:'百万 Token',currency:'CNY',amount:'2'},{name:'输出',condition:'',unit:'百万 Token',currency:'CNY',amount:'8'}];
function fixture(){
 let state=createAdminSeed();const model=state.models[0];model.serviceMode='provider';model.listingStatus='已下架';for(const endpoint of state.endpoints.filter(item=>state.modelSupplies.some(supply=>supply.modelId===model.id && supply.endpointId===item.id))){if(!endpoint.baseUrl.endsWith('/chat/completions'))endpoint.baseUrl=endpoint.baseUrl.replace(/\/$/,'')+'/chat/completions';endpoint.connectionTest={fingerprint:connectionFingerprint(endpoint),result:'通过',testedAt:'2026-01-01'};}
 const provider=modelSupplies(state,model.id).find(supply=>supply.provider?.status==='已启用').provider;
 const baseline=structuredClone(state);
 state=run(state,'associateServiceProvider',model.id,{providerId:provider.id,expectedUpdatedAt:model.updatedAt});
 return {state,model:state.models.find(item=>item.id===model.id),provider,baseline};
}
const configuration=({state,model,provider},patch={})=>({providerId:provider.id,callId:'provider-test-call',items,expectedUpdatedAt:model.updatedAt,expectedSaleVersion:providerPriceRevision(state,model.id,provider.id),...patch});
function configured(){const f=fixture(),state=run(f.state,'configureServiceProvider',f.model.id,configuration(f));return {...f,state,model:state.models.find(item=>item.id===f.model.id)};}

test('associating an existing Provider creates no resources, channel price or automatic route',()=>{
 const f=fixture(), seed=f.baseline, entries=providerServices(f.model);
 assert.equal(entries.length,1);assert.equal(entries[0].callId,'');
 for(const key of ['providers','endpoints','modelSupplies','modelSalePrices','serviceRoutes'])assert.deepEqual(f.state[key],seed[key]);
 assert.equal(publicationChecks(f.state,f.model).some(item=>!item.passed),true);
 assert.throws(()=>run(f.state,'associateServiceProvider',f.model.id,{providerId:f.provider.id,expectedUpdatedAt:f.model.updatedAt}),/已关联/);
 assert.throws(()=>run(f.state,'associateServiceProvider',f.model.id,{providerId:'missing',expectedUpdatedAt:f.model.updatedAt}),/已有供应商/);
});
test('Provider price and call ID are scoped to the Provider, versioned and survive refresh without rewriting channel prices',()=>{
 let f=configured(), first=activeProviderPrice(f.state,f.model.id,f.provider.id);
 assert.equal(first.scope,'provider');assert.equal(first.items[0].amount,2000000);assert.equal(first.serviceId,providerServiceId(f.model.id,f.provider.id));
 const before=structuredClone(f.state), next=run(f.state,'configureServiceProvider',f.model.id,configuration(f,{items:[{...items[0],name:'请求',unit:'千次',amount:'0.000001'}]}));
 assert.equal(activeProviderPrice(next,f.model.id,f.provider.id).version,2);assert.equal(activeProviderPrice(next,f.model.id,f.provider.id).items[0].amount,1);
 assert.deepEqual(next.modelSalePrices.find(price=>price.id===first.id),first);
 for(const key of ['providers','endpoints','modelSupplies','serviceRoutes'])assert.deepEqual(next[key],before[key]);
 const refreshed=parseAdminState(JSON.stringify(next));assert.equal(activeProviderPrice(refreshed,f.model.id,f.provider.id).version,2);assert.equal(providerServices(refreshed.models.find(model=>model.id===f.model.id))[0].callId,'provider-test-call');
});
test('invalid, duplicate, stale and listed call-ID changes fail atomically',()=>{
 const f=configured(), before=structuredClone(f.state);
 for(const patch of [{callId:''},{callId:'bad id'},{callId:f.model.modelId},{items:[{...items[0],amount:''}]},{items:[{...items[0],amount:'-1'}]},{items:[items[0],items[0]]},{expectedUpdatedAt:'stale'},{expectedSaleVersion:'stale'}])assert.throws(()=>run(f.state,'configureServiceProvider',f.model.id,configuration(f,patch)));
 assert.deepEqual(f.state,before);
 f.model.listingStatus='已上架';assert.throws(()=>run(f.state,'configureServiceProvider',f.model.id,configuration(f,{callId:'changed-id'})),/下架/);
});
test('two Providers retain independent call IDs, prices and price versions',()=>{
 const first=configured(), other=modelSupplies(first.state,first.model.id).find(item=>item.provider?.id!==first.provider.id).provider;
 let state=run(first.state,'associateServiceProvider',first.model.id,{providerId:other.id,expectedUpdatedAt:first.model.updatedAt});
 const f={state,model:state.models.find(item=>item.id===first.model.id),provider:other};
 assert.throws(()=>run(state,'configureServiceProvider',f.model.id,configuration(f)),/已存在/);
 state=run(state,'configureServiceProvider',f.model.id,configuration(f,{callId:'second-provider-call',items:[{...items[0],amount:'3.5'}]}));
 assert.equal(activeProviderPrice(state,f.model.id,first.provider.id).items[0].amount,2000000);
 assert.equal(activeProviderPrice(state,f.model.id,other.id).items[0].amount,3500000);
 assert.equal(activeProviderPrice(state,f.model.id,first.provider.id).version,1);assert.equal(activeProviderPrice(state,f.model.id,other.id).version,1);
});
test('Provider route candidates stay within associated channels of that Provider',()=>{
 const f=configured(), service=routingServices(f.state).find(item=>item.providerId===f.provider.id), channels=routingChannels(f.state,service);
 assert.ok(channels.length);assert.ok(channels.every(channel=>channel.provider.id===f.provider.id));
 const foreign=modelSupplies(f.state,f.model.id).find(item=>item.provider?.id!==f.provider.id);
 if(foreign)assert.throws(()=>validateRouteConfig(f.state,service,{strategy:'fixed',channels:[{supplyId:foreign.id,enabled:true}],autoFailover:true}),/不属于/);
 const removed=channels[0];f.state.modelSupplies.find(item=>item.id===removed.id).status='已移除';
 assert.ok(!routingChannels(f.state,service).some(item=>item.id===removed.id));
});
test('removing a binding retains supply resources and prices, but published and draft route references block removal',()=>{
 const f=configured(), service=routingServices(f.state).find(item=>item.providerId===f.provider.id), channel=routingChannels(f.state,service).find(item=>item.available);
 assert.ok(channel);const data={supplyId:channel.id,expectedUpdatedAt:f.model.updatedAt};
 const detached=run(f.state,'removeServiceChannel',f.model.id,data);
 for(const key of ['providers','endpoints','modelSalePrices'])assert.deepEqual(detached[key],f.state[key]);
 assert.equal(detached.modelSupplies.find(item=>item.id===channel.id).status,'已移除');
 const draft=run(f.state,'serviceRouteDraft',null,{serviceId:service.id,expectedVersion:0,config:{strategy:'fixed',autoFailover:true,channels:[{supplyId:channel.id,enabled:true}]}});
 assert.throws(()=>run(draft,'removeServiceChannel',f.model.id,data),/草稿引用/);
 assert.throws(()=>run(draft,'removeServiceProvider',f.model.id,{providerId:f.provider.id,expectedUpdatedAt:f.model.updatedAt}),/路由或草稿引用/);
 const published=run(f.state,'serviceRoutePublish',null,{serviceId:service.id,expectedVersion:0,sourceVersion:routeSourceVersion(f.state,service),config:{strategy:'fixed',autoFailover:true,channels:[{supplyId:channel.id,enabled:true}]}});
 assert.throws(()=>run(published,'removeServiceChannel',f.model.id,data),/生效路由/);
 assert.throws(()=>run(published,'serviceRouteStop',null,{serviceId:service.id,expectedVersion:1}),/确认/);
 const stopped=run(published,'serviceRouteStop',null,{serviceId:service.id,expectedVersion:1,confirmed:true});
 assert.deepEqual(serviceRoute(stopped,service.id).versions,serviceRoute(published,service.id).versions);
 assert.equal(serviceRoute(stopped,service.id).activeVersion,0);
 assert.doesNotThrow(()=>run(stopped,'removeServiceProvider',f.model.id,{providerId:f.provider.id,expectedUpdatedAt:f.model.updatedAt}));
 const unlinked=run(f.state,'removeServiceProvider',f.model.id,{providerId:f.provider.id,expectedUpdatedAt:f.model.updatedAt});
 assert.equal(providerServices(unlinked.models.find(item=>item.id===f.model.id)).length,0);assert.deepEqual(unlinked.providers,f.state.providers);assert.deepEqual(unlinked.modelSalePrices,f.state.modelSalePrices);
});
test('a Provider call resolves to its model and snapshots its Provider price after route publication',()=>{
 const f=configured(), service=routingServices(f.state).find(item=>item.providerId===f.provider.id), channel=routingChannels(f.state,service).find(item=>item.available);
 let state=run(f.state,'serviceRoutePublish',null,{serviceId:service.id,expectedVersion:0,sourceVersion:routeSourceVersion(f.state,service),config:{strategy:'fixed',autoFailover:true,channels:[{supplyId:channel.id,enabled:true}]}});
 const key=state.apiKeys.find(item=>item.status==='有效' && state.grants.some(grant=>grant.subjectId===item.id));key.modelIds=[...new Set([...key.modelIds,f.model.id])];state.limits=state.limits.filter(item=>item.scopeId!==key.id);
 const result=simulateRequest(state,{requestId:crypto.randomUUID(),keyId:key.id,modelId:service.callId}).request;
 assert.equal(result.httpStatus,200);assert.equal(result.providerId,f.provider.id);assert.equal(result.modelId,f.model.id);assert.equal(result.priceSnapshot.scope,'provider');assert.equal(result.priceVersionId,activeProviderPrice(state,f.model.id,f.provider.id).id);
 assert.equal(simulateRequest(state,{requestId:crypto.randomUUID(),keyId:key.id,modelId:f.model.id}).request.attempts.at(-1).error,'provider_service_required');
 assert.equal(activeRouteVersion(serviceRoute(state,service.id)).version,1);
});
test('outbound billing starts empty and never adopts a supplier cost structure implicitly',()=>{
 const state=createAdminSeed(), model=state.models.find(item=>item.id==='catalog-demo-kimi');model.serviceMode='standard';
 assert.ok(serviceSupplyRows(state,model).length);assert.deepEqual(unifiedBillingDraft(state,model),[]);
});
test('unconfigured models expose no service channels and cannot publish while preserving stored supply records',()=>{
 const state=createAdminSeed(), model=state.models.find(item=>item.id==='catalog-demo-kimi'), before=structuredClone(state), channels=modelSupplies(state,model.id);
 assert.ok(channels.length);assert.equal(model.serviceMode,undefined);assert.deepEqual(serviceSupplyRows(state,model),[]);
 assert.ok(publicationChecks(state,model).some(check=>check.tab==='serviceMode' && !check.passed));
 assert.throws(()=>commitAdminState(state,{type:'modelOperation',operation:'publish',modelId:model.id,data:{}}),/服务模式/);
 assert.throws(()=>run(state,'removeServiceChannel',model.id,{supplyId:channels[0].id,expectedUpdatedAt:model.updatedAt}),/配置服务模式/);
 assert.deepEqual(state,before);
 const refreshed=parseAdminState(JSON.stringify(state));assert.deepEqual(serviceSupplyRows(refreshed,refreshed.models.find(item=>item.id===model.id)),[]);
 assert.deepEqual(refreshed.modelSupplies.filter(item=>item.modelId===model.id),state.modelSupplies.filter(item=>item.modelId===model.id));
});
test('permissions, generic-write guards, conflict and storage failures preserve Provider configuration',()=>{
 const f=configured(), action={type:'modelOperations',operation:'configureServiceProvider',modelId:f.model.id,data:configuration(f)}, before=structuredClone(f.state);
 assert.throws(()=>commitAdminState({...f.state,currentRole:'运维人员'},action),/无权/);
 assert.throws(()=>commitAdminState(f.state,{type:'update',collection:'models',id:f.model.id,changes:{serviceProviders:[]}}),/须通过服务管理/);
 assert.throws(()=>commitAdminState(f.state,{type:'add',collection:'modelSalePrices',record:{id:'forged',scope:'provider'}}),/须通过服务管理/);
 assert.throws(()=>persistModelAction(f.state,action,{getItem:()=>JSON.stringify({...f.state,revision:f.state.revision+1}),setItem:()=>assert.fail()}),/数据已变化/);
 assert.throws(()=>persistModelAction(f.state,action,{getItem:()=>JSON.stringify(f.state),setItem:()=>{throw Error('disk full');}}),/disk full/);assert.deepEqual(f.state,before);
});
