import test from 'node:test';
import assert from 'node:assert/strict';
import {APPLICATION_CONFIG,validateApplicationConfig,initialApplicationData} from '../src/mock/application-data.js';
import {createAdminSeed,loadAdminState,serializeAdminState,STORAGE_KEY,persistModelAction} from '../src/admin-v2/store.js';
import {emptyAuthState,registerAuthAccount,persistAuthState,loginAuthAccount} from '../src/auth-state.mjs';
import {AUTH_DATA_KEY} from '../src/service-access.mjs';
import {linkedAccountFixture} from '../src/linked-accounts.mjs';
import {withAdminSession} from './admin-session-fixture.mjs';
import {tenantData,tenantContext,saveTenantKeys,orderTenantServices,saveTenantOrganization,recordTenantExperience,saveTenantRoutes} from '../src/tenant-data.mjs';
import {tenantUsageData,tenantUsageTypes} from '../src/usage-data.mjs';
import {tenantLogRecords} from '../src/call-log-data.mjs';
import {overviewBusiness} from '../src/admin-v2/overview.js';
import {changeOrganization} from '../src/organization-data.mjs';
import {observedUsageTotal} from '../src/business-facts.mjs';
import {logJSON,logStatuses} from '../src/call-log-data.mjs';
import {simulateRequest} from '../src/admin-v2/domain.js';
const storageFor=()=>{const map=new Map();return {getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)};};
function environment(t){const storage=storageFor(),descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage');Object.defineProperty(globalThis,'localStorage',{configurable:true,value:storage});t.after(()=>descriptor?Object.defineProperty(globalThis,'localStorage',descriptor):delete globalThis.localStorage);return storage;}
function linked(storage){
 const fixture=linkedAccountFixture(loadAdminState(storage),emptyAuthState());
 fixture.state=withAdminSession(fixture.state);
 const member=fixture.state.memberships.find(row=>row.id==='member-link-enterprise-a');
 member.projectIds=fixture.state.projects.filter(row=>row.tenantId===member.tenantId).map(row=>row.id);
 storage.setItem(STORAGE_KEY,serializeAdminState(fixture.state));
 storage.setItem(AUTH_DATA_KEY,JSON.stringify(loginAuthAccount(fixture.auth,'13800002001','enterprise')));
 return fixture;
}

test('application configuration validates once, clones initial resources and preserves all saved collections including removals',()=>{
 const original=JSON.stringify(APPLICATION_CONFIG);assert.doesNotThrow(validateApplicationConfig);
 const seed=initialApplicationData(0);seed.users[0].name='manual';assert.equal(JSON.stringify(APPLICATION_CONFIG),original);
 const storage=storageFor(),state=loadAdminState(storage);
 for(const key of ['apiKeys','users','tenants','orders','organizations','tariffDictionary'])state[key]=[];
 storage.setItem(STORAGE_KEY,serializeAdminState(state));const loaded=loadAdminState(storage);
 for(const key of ['apiKeys','users','tenants','orders','organizations','tariffDictionary'])assert.deepEqual(loaded[key],[]);
});
test('registration creates one explicitly linked backend identity; failed auth persistence rolls back the backend write',t=>{
 const storage=environment(t);loadAdminState(storage);let auth=emptyAuthState();storage.setItem(AUTH_DATA_KEY,JSON.stringify(auth));
 const next=registerAuthAccount(auth,{phone:'13899990001',name:'配置联动用户'});auth=persistAuthState(auth,next,storage);
 const context=tenantContext(storage);assert.ok(context.state.users.some(row=>row.id===context.link.backendUserId&&row.name==='配置联动用户'));assert.equal(context.identity.spaceId,'personal');
 assert.equal(context.state.identityEvents.filter(row=>row.type==='login').length,1);
 const raw=storage.getItem(STORAGE_KEY),authRaw=storage.getItem(AUTH_DATA_KEY),another=registerAuthAccount(auth,{phone:'13899990002'});
 assert.throws(()=>persistAuthState(auth,another,{...storage,setItem(key,value){if(key===AUTH_DATA_KEY)throw Error('quota');storage.setItem(key,value);}}),/quota/);
 assert.equal(storage.getItem(STORAGE_KEY),raw);assert.equal(storage.getItem(AUTH_DATA_KEY),authRaw);
});
test('organization edits update the tenant membership and reject unauthorized or foreign scopes',t=>{
 const storage=environment(t),fixture=linked(storage);fixture.state.memberships.find(row=>row.id==='member-link-enterprise-a').role='租户管理员';storage.setItem(STORAGE_KEY,serializeAdminState(fixture.state));
 const snapshot=tenantData(storage),member=snapshot.organization.members.find(row=>row.id==='member-link-enterprise-a');
 const next=changeOrganization(snapshot.organization,{type:'member.save',member:{...member,name:'修改后的同一用户'},logId:'qa-org'});
 saveTenantOrganization(next,snapshot.revision,storage);
 const backend=JSON.parse(storage.getItem(STORAGE_KEY));
 assert.equal(backend.users.find(row=>row.id===member.userId).name,member.name);
 assert.equal(backend.memberships.find(row=>row.id===member.id).memberName,'修改后的同一用户');
 const latest=tenantData(storage),bad=structuredClone(latest.organization);
 assert.equal(latest.organization.members.find(row=>row.id===member.id).name,'修改后的同一用户');
 bad.departments.push({id:backend.organizations.find(row=>row.tenantId==='tenant-nanjing').id,name:'foreign',parentId:'root'});
 const raw=storage.getItem(STORAGE_KEY);assert.throws(()=>saveTenantOrganization(bad,latest.revision,storage),/归属冲突/);assert.equal(storage.getItem(STORAGE_KEY),raw);
 const removed=structuredClone(latest.organization);removed.members=removed.members.filter(row=>row.id!==member.id);assert.throws(()=>saveTenantOrganization(removed,latest.revision,storage),/当前登录成员/);
 backend.memberships.find(row=>row.id===member.id).role='普通成员';storage.setItem(STORAGE_KEY,serializeAdminState(backend));assert.throws(()=>saveTenantOrganization(next,backend.revision,storage),/只有企业管理员/);
});
test('request usage views agree on cache inclusion and unknown measurements, including timeout logs',()=>{
 assert.equal(observedUsageTotal({input:2400,output:720,cached:600}),3120);
 assert.equal(observedUsageTotal({}),null);assert.equal(observedUsageTotal({input:0,output:0}),0);
 assert.equal(observedUsageTotal({seconds:2}),2);
 assert.equal(logStatuses[504][0],'上游超时');
 assert.equal(JSON.parse(logJSON({id:'timeout',status:504})).error_code,'Service.UpstreamTimeout');
});
test('key quota disable and restore retain usage and synchronize the saved grant',t=>{
 const storage=environment(t);linked(storage);let data=tenantData(storage);
 const row={id:'quota-roundtrip',name:'额度往返验证',enabled:true,models:[],ips:[],quotaType:'日',quotaLimit:100};
 saveTenantKeys([row],{expectedRevision:data.revision},storage);
 let state=JSON.parse(storage.getItem(STORAGE_KEY));state.grants.find(item=>item.subjectId===row.id).used=12;storage.setItem(STORAGE_KEY,serializeAdminState(state));
 data=tenantData(storage);saveTenantKeys([{...row,quotaEnabled:false}],{expectedRevision:data.revision},storage);
 data=tenantData(storage);assert.equal(data.keys[0].quotaLimit,null);assert.equal(data.keys[0].quota,'不限额度');
 saveTenantKeys([{...row,quotaEnabled:true}],{expectedRevision:data.revision},storage);
 state=JSON.parse(storage.getItem(STORAGE_KEY));const grant=state.grants.find(item=>item.subjectId===row.id);assert.equal(grant.status,'生效中');assert.equal(grant.used,12);
 const stale=data.revision;data=tenantData(storage);assert.throws(()=>saveTenantKeys([row],{expectedRevision:stale},storage),/数据已变化/);
});
test('base model filtering includes provider-specific calls without merging other models',()=>{
 const at='2026-11-02T01:00:00Z',models=[{id:'glm',modelId:'glm-5.3',type:'text'},{id:'ds',modelId:'deepseek',type:'text'}];
 const records=[{requestId:'a',modelId:'glm',publicModelId:'glm-moma',createdAt:at,httpStatus:200,usage:{}},{requestId:'b',modelId:'glm',publicModelId:'glm-zhipu',createdAt:at,httpStatus:200,usage:{}},{requestId:'c',modelId:'ds',createdAt:at,httpStatus:200,usage:{}}];
 const data=tenantUsageData({records,models,modelIds:['glm-5.3'],start:'2026-11-02',end:'2026-11-02',now:new Date('2026-11-02T02:00:00Z')});assert.equal(data.summary.requests,2);
});
test('tenant category filters isolate model types and retain recorded audio units',()=>{
 const types=['text','multimodal','image','video','audio','embedding','rerank'],at='2026-11-02T01:00:00Z';
 const models=types.map(type=>({id:type,type})),records=types.map(type=>({requestId:type,modelId:type,createdAt:at,httpStatus:200,usage:type==='audio'?{seconds:7,characters:12}:{}}));
 const options={records,models,start:'2026-11-02',end:'2026-11-02',now:new Date('2026-11-02T02:00:00Z')};
 for(const [category,count] of [['语言模型',1],['文本模型',1],['多模态理解',1],['多模态模型',1],['视觉模型',2],['语音模型',1],['音频模型',1],['向量模型',1],['排序模型',1],['重排模型',1],['未知分类',0]])assert.equal(tenantUsageData({...options,types:tenantUsageTypes(category)}).summary.requests,count,category);
 assert.deepEqual(tenantUsageTypes('视觉模型','视觉理解'),['multimodal']);assert.deepEqual(tenantUsageTypes('视觉模型','视频生成'),['video']);
 const audio=tenantUsageData({...options,types:tenantUsageTypes('语音模型')});assert.equal(audio.summary.audio,7);assert.equal(audio.summary.characters,12);assert.equal(audio.summary.total,undefined);
});
test('two published modes share tenant keys, orders, routes and request facts with the admin store without secrets or cross-customer data',async t=>{
 const storage=environment(t);linked(storage);t.mock.method(globalThis,'fetch',()=>assert.fail('No real upstream'));
 const {completeServiceShowcase}=await import('../src/admin-v2/service-showcase-client.js');
 let state=tenantContext(storage).state;state=withAdminSession(state);state=await completeServiceShowcase(state,(current,action)=>persistModelAction(current,action,storage));
 let data=tenantData(storage);assert.equal(data.services.length,3);
 const offer=data.services.find(row=>row.mode==='provider'),key={id:'key-tenant-qa',name:'前后台同源',key:'sk-mock-qa-never-persist',enabled:true,models:[offer.modelId],ips:[]};
 saveTenantKeys([key],{expectedRevision:data.revision},storage);let saved=JSON.parse(storage.getItem(STORAGE_KEY));assert.equal(saved.apiKeys.find(row=>row.id===key.id).tenantId,'tenant-gov');assert.ok(!JSON.stringify(saved).includes(key.key));
 data=tenantData(storage);assert.ok(data.keys.some(row=>row.id===key.id));const raw=storage.getItem(STORAGE_KEY);assert.throws(()=>saveTenantKeys([{...key,id:'key-001'}],{expectedRevision:data.revision},storage),/无权/);assert.equal(storage.getItem(STORAGE_KEY),raw);
 saveTenantKeys([{...key,quotaEnabled:false}],{expectedRevision:data.revision},storage);data=tenantData(storage);
 let current=tenantContext(storage).state;current.grants.push({id:'qa-explicit-tenant',subjectType:'tenant',subjectId:data.identity.tenantId,modelIds:current.models.map(row=>row.id),limit:1000000,used:0,status:'生效中'});const tenantGrant=current.grants.find(row=>row.subjectType==='tenant'&&row.subjectId===data.identity.tenantId),beforeUsed=tenantGrant.used;
 const called=simulateRequest(current,{requestId:'api-qa-shared',keyId:key.id,modelId:offer.callId,usage:{input:3,cached:1,output:2}});assert.equal(called.request.httpStatus,200);assert.equal(called.state.grants.find(row=>row.id===tenantGrant.id).used,beforeUsed+5);
 assert.deepEqual(simulateRequest(called.state,{requestId:'api-qa-shared',keyId:key.id,modelId:offer.callId}).request,called.request);
 const foreignReplay=simulateRequest(called.state,{requestId:'api-qa-shared',keyId:'key-001',modelId:offer.callId});assert.equal(foreignReplay.request.httpStatus,409);assert.equal(foreignReplay.request.tenantId,undefined);assert.equal(foreignReplay.request.priceSnapshot,undefined);assert.equal(foreignReplay.state,called.state);
 const revoked=structuredClone(called.state);revoked.apiKeys.find(row=>row.id===key.id).modelIds=[];assert.equal(simulateRequest(revoked,{requestId:'api-qa-shared',keyId:key.id,modelId:offer.callId}).request.httpStatus,403);
 storage.setItem(STORAGE_KEY,serializeAdminState(called.state));data=tenantData(storage);assert.ok(tenantLogRecords(data).some(row=>row.id==='api-qa-shared'&&row.model===offer.callId&&row.total===5));
 saveTenantKeys([{...key,quotaEnabled:false,tpmLimit:4}],{expectedRevision:data.revision},storage);current=tenantContext(storage).state;assert.equal(simulateRequest(current,{requestId:'api-qa-rate',keyId:key.id,modelId:offer.callId,usage:{input:3,output:2}}).request.httpStatus,429);
 data=tenantData(storage);saveTenantKeys([{...key,quotaEnabled:false,qpmLimit:1}],{expectedRevision:data.revision},storage);current=tenantContext(storage).state;assert.equal(simulateRequest(current,{requestId:'api-qa-qpm',keyId:key.id,modelId:offer.callId,usage:{input:1,output:1}}).request.httpStatus,429);
 data=tenantData(storage);assert.throws(()=>saveTenantKeys([{...key,qpmLimit:0}],{expectedRevision:data.revision},storage),/正整数/);
 data=tenantData(storage);
 orderTenantServices([offer.id],data.revision,storage);data=tenantData(storage);assert.ok(data.orders.some(row=>row.serviceId===offer.id));assert.throws(()=>orderTenantServices([offer.id],data.revision,storage),/已订购/);
 saveTenantRoutes([{id:'qa-route',name:'联动路由',models:[offer.callId],strategy:'效果优先'}],data.revision,storage);data=tenantData(storage);assert.equal(data.routes[0].models[0],offer.callId);
 const ticket={requestId:'experience-qa-once',serviceId:offer.id,owner:data.identity.key,startedAt:new Date().toISOString()};recordTenantExperience(ticket,200,storage);recordTenantExperience(ticket,200,storage);
 data=tenantData(storage);const record=data.requests.find(row=>row.requestId===ticket.requestId);assert.ok(record);assert.deepEqual(record.usage,{});assert.equal(data.requests.filter(row=>row.requestId===ticket.requestId).length,1);assert.equal(/procurement|fingerprint|priceSnapshot/.test(JSON.stringify(data.requests)),false);
 const logs=tenantLogRecords(data);assert.ok(logs.some(row=>row.id===ticket.requestId&&row.model===offer.callId));
 assert.ok(JSON.parse(storage.getItem(STORAGE_KEY)).requests.some(row=>row.requestId===ticket.requestId));
 const auth=JSON.parse(storage.getItem(AUTH_DATA_KEY));storage.setItem(AUTH_DATA_KEY,JSON.stringify(loginAuthAccount(auth,'13800002002','enterprise')));data=tenantData(storage);assert.ok(!data.keys.some(row=>row.id===key.id));assert.ok(!data.orders.some(row=>row.serviceId===offer.id));assert.ok(!data.requests.some(row=>row.requestId===ticket.requestId));assert.equal(data.routes.length,0);
});
test('tenant charts and platform overview reconcile the same deduplicated requests and keep unknown metering unknown',()=>{
 const state=createAdminSeed();const at='2026-11-02T01:00:00Z';state.requests=[{id:'one',requestId:'req-one',tenantId:'tenant-gov',modelId:'model-1',createdAt:at,httpStatus:200,usage:{input:3,output:2},durationMs:200},{id:'two',requestId:'req-two',tenantId:'tenant-gov',modelId:'model-1',createdAt:at,httpStatus:200,usage:{}}];
 const data=tenantUsageData({records:[...state.requests,state.requests[0]],models:state.models,start:'2026-11-02',end:'2026-11-02',now:new Date('2026-11-02T02:00:00Z')});assert.equal(data.summary.requests,2);assert.equal(data.summary.total,5);assert.equal(data.buckets.reduce((n,row)=>n+row.requests,0),2);
 const overview=overviewBusiness(state,Date.parse('2026-11-02T02:00:00Z'),'today');assert.equal(overview.calls,2);assert.equal(overview.total,5);
 const unknown=tenantUsageData({records:[state.requests[1]],models:state.models,start:'2026-11-02',end:'2026-11-02',now:new Date('2026-11-02T02:00:00Z')});assert.equal(unknown.summary.total,undefined);
});
