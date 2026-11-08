import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {parseAdminState,commitAdminState} from '../src/admin-v2/store.js';
import {withAdminSession} from './admin-session-fixture.mjs';
import {serviceModelSourceDraft} from '../src/admin-v2/model-profile.js';
import {serviceArchiveIssues,checkedServiceCallId} from '../src/admin-v2/service-maintenance.js';
import {serviceIndexModels,serviceConfiguration} from '../src/admin-v2/service-workspace.js';
import {modelAuditChanges} from '../src/admin-v2/model-operation-history.js';
import {commonTariffNames} from '../src/admin-v2/tariff-dictionary.js';
import {storedModel,domainModel,domainModelWorkspace} from '../src/mock/model-fields.js';
import {startLocalBackend} from '../database/local-runtime.js';
const state=()=>withAdminSession(parseAdminState(null));
const run=(s,operation,model,data)=>commitAdminState(s,{type:'modelOperations',operation,modelId:model.id,data:{expectedUpdatedAt:model.updatedAt,confirmed:true,...data}});

test('archive retains stable identity and history, checks all dependencies, and restores without enabling calls',()=>{
  let s=state(),m={...structuredClone(s.models[0]),id:'ux-service',modelId:'ux-call',serviceProviders:[],listingStatus:'已下架',callsEnabled:false,serviceManaged:true};s.models.push(m);
  assert.deepEqual(serviceArchiveIssues(s,m),[]);
  const before=structuredClone(s);s=run(s,'serviceArchive',m);m=s.models.find(row=>row.id===m.id);
  assert.ok(m.archivedAt);assert.ok(!serviceIndexModels(s,new URLSearchParams()).some(row=>row.id===m.id));assert.ok(serviceIndexModels(s,new URLSearchParams({status:'archived'})).some(row=>row.id===m.id));
  for(const key of ['providers','endpoints','modelTemplates','modelSupplies','modelSalePrices','orders','serviceRoutes'])assert.deepEqual(s[key],before[key],key);
  assert.throws(()=>run(s,'marketVisibility',m,{visible:true}),/归档/);
  assert.throws(()=>commitAdminState(s,{type:'modelOperation',operation:'publish',modelId:m.id}),/归档/);
  s=run(s,'serviceRestore',m);m=s.models.find(row=>row.id===m.id);assert.equal(m.archivedAt,null);assert.equal(m.callsEnabled,false);assert.equal(m.listingStatus,'已下架');
  assert.equal(domainModel(storedModel(m,true),true).archivedAt,null);
  for(const patch of [{listingStatus:'已上架'},{callsEnabled:true},{serviceProviders:[{status:'已关联'}]}])assert.ok(serviceArchiveIssues(s,{...m,...patch}).length);
  for(const patch of [{serviceRoutes:[{serviceId:'standard:'+m.id,activeVersion:1}]},{modelSupplies:[{modelId:m.id,status:'已启用'}]},{modelOnboardings:[{modelId:m.id,status:'配置中'}]}])assert.ok(serviceArchiveIssues({...s,...patch},m).length);
  assert.throws(()=>run(s,'serviceArchive',m,{expectedUpdatedAt:'stale'}),/修订/);
  assert.throws(()=>run({...s,currentRole:'只读观察员'},'serviceArchive',m),/无权/);
});
test('changing a public call ID preserves canonical master and requires stopping and confirmation',()=>{
  let s=state(),m=s.models.find(row=>row.serviceMode==='standard');
  m.callsEnabled=false;m.listingStatus='已下架';const master=structuredClone(s.modelTemplates.find(row=>row.id===m.templateId) || m),stable=m.id;
  assert.throws(()=>run(s,'configureServiceModelIdentity',m,{callId:'new-call',confirmed:false}),/确认/);
  assert.throws(()=>run({...s,models:s.models.map(row=>row.id===m.id?{...row,callsEnabled:true}:row)},'configureServiceModelIdentity',m,{callId:'new-call'}),/停用|修订/);
  assert.throws(()=>checkedServiceCallId(s,m,'',s.models.find(row=>row.id!==m.id).modelId),/存在/);
  s=run(s,'configureServiceModelIdentity',m,{callId:'ux/model:variant'});m=s.models.find(row=>row.id===stable);
  assert.equal(m.modelId,'ux/model:variant');assert.equal(s.modelTemplates.find(row=>row.id===m.templateId).modelId,master.modelId);
  assert.equal(s.audits[0].changes.find(row=>row.field==='模型标识' && row.after==='ux/model:variant').after,'ux/model:variant');
});
test('audit summaries expose business changes without credential material, and common tariffs keep all as an explicit option',()=>{
  const raw='do-not-expose',changes=modelAuditChanges({endpoints:[{id:'ep',name:'old',baseUrl:'https://old.invalid'}]},{type:'batch',changes:[{collection:'endpoints',type:'update',id:'ep',changes:{name:'new',baseUrl:'https://new.invalid',apiKeys:[{maskedKey:raw,fingerprint:raw}],candidateConfiguration:{apiKey:raw}}}]});
  assert.equal(changes.length,2);assert.ok(!JSON.stringify(changes).includes(raw));assert.equal(changes[0].before,'old');
  const all=['输入 Token','输出 Token','缓存读取 Token','图像输出（按张）','音频分钟'];assert.deepEqual(commonTariffNames(all,'text'),all.slice(0,3));assert.deepEqual(commonTariffNames(all,'unknown'),all);
});
test('D1 maintenance and reused-connection commands preserve existing records and reject stale or cross-supplier attachment',{timeout:90000},async()=>{
  const accessCode=randomBytes(24).toString('hex'),local=await startLocalBackend({ demo: true, loginHashes:{'admin-001':createHash('sha256').update(accessCode).digest('hex')}});let cookie='',s;
  try{
    const api=async(path,body,id)=>{const r=await local.runtime.dispatchFetch('https://example.test/api/5120'+path,{method:body?'POST':'GET',headers:{...(cookie?{cookie}:{}),...(body?{'content-type':'application/json',origin:'https://example.test','x-moma-request':'1'}:{}),...(id?{'idempotency-key':id}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
    cookie=(await api('/auth/login',{accountId:'admin-001',accessCode})).cookie;
    const reload=async()=>s=domainModelWorkspace((await api('/model-operations')).data);await reload();
    const command=async(operation,data,modelId)=>{const id=crypto.randomUUID(),body={operationId:id,expectedRevision:s.revision,action:{type:'modelOperations',operation,modelId,data}};const result=await api('/model-operations/commands',body,id);await reload();return {result,body,id};};
    const provider=s.providers.find(row=>row.id==='provider-moma'),master=[...s.modelTemplates,...s.models].find(row=>row.modelId?.toLowerCase()==='glm-5.2');assert.ok(master);
    assert.equal((await command('supplierModelsRegister',{providerId:provider.id,libraryIds:[master.id]})).result.status,200);
    const endpoint=s.endpoints.find(row=>row.providerId===provider.id && row.interfaceType==='openai'),beforeEndpoints=structuredClone(s.endpoints),beforeModels=structuredClone(s.models);
    assert.ok(endpoint);const costs=[{name:'输入 Token',listPrice:'1',currency:'CNY',unit:'百万 Token'}],data={providerId:provider.id,modelId:s.providers.find(row=>row.id===provider.id).catalogModels.find(row=>row.libraryId===master.id).modelId,upstreamModelId:'cloud/glm-5.2',scenarios:costs,endpointId:endpoint.id,expectedEndpointUpdatedAt:endpoint.updatedAt};
    assert.equal((await command('supplierChannelRegister',{...data,expectedEndpointUpdatedAt:'stale'})).result.status,422);
    assert.equal((await command('supplierChannelRegister',{...data,baseUrl:'https://overwrite.invalid'})).result.status,422);
    const attached=await command('supplierChannelRegister',data);assert.equal(attached.result.status,200,JSON.stringify(attached.result.data));assert.equal((await api('/model-operations/commands',attached.body,attached.id)).status,200);
    assert.deepEqual(s.endpoints,beforeEndpoints);assert.deepEqual(s.models,beforeModels);assert.equal((await command('supplierChannelRegister',data)).result.status,422);
    const created=await command('createServiceModel',{...serviceModelSourceDraft(s,master),libraryId:master.id,modelId:'ux-d1-service',serviceMode:'standard'});assert.equal(created.result.status,200,JSON.stringify(created.result.data));
    let m=s.models.find(row=>row.modelId==='ux-d1-service');assert.ok(m);
    assert.equal((await command('configureServiceModelIdentity',{callId:'ux-d1-renamed',confirmed:true,expectedUpdatedAt:m.updatedAt},m.id)).result.status,200);m=s.models.find(row=>row.id===m.id);
    for(const supply of s.modelSupplies.filter(row=>row.modelId===m.id && row.status!=='已移除')){assert.equal((await command('removeServiceChannel',{supplyId:supply.id,expectedUpdatedAt:m.updatedAt},m.id)).result.status,200);m=s.models.find(row=>row.id===m.id);}
    const archived=await command('serviceArchive',{confirmed:true,expectedUpdatedAt:m.updatedAt},m.id);assert.equal(archived.result.status,200,JSON.stringify(archived.result.data));m=s.models.find(row=>row.id===m.id);assert.ok(m.archivedAt);
    assert.ok(s.audits.some(row=>row.changes?.some(field=>field.field==='归档时间')));assert.equal((await api('/model-operations/commands',archived.body,archived.id)).status,200);
    assert.equal((await command('serviceRestore',{confirmed:true,expectedUpdatedAt:m.updatedAt},m.id)).result.status,200);assert.equal(s.models.find(row=>row.id===m.id).callsEnabled,false);
    assert.equal((await local.db.prepare('PRAGMA foreign_key_check').all()).results.length,0);
  }finally{await local.runtime.dispose();}
});

test('call guides can use complete setup while current platform verification is still pending',()=>{const s=state(),m=s.models.find(row=>row.serviceMode==='standard' && serviceConfiguration(s,row).setupIssues.length===0);assert.ok(m);const status=serviceConfiguration(s,m);assert.equal(status.label,'待验证');assert.ok(status.issues.some(row=>row.tab==='platform'));assert.deepEqual(status.setupIssues,[]);});
