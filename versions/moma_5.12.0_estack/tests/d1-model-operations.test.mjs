import assert from 'node:assert/strict';
import {domainModelWorkspace} from '../src/mock/model-fields.js';
import {test} from 'node:test';
import {randomBytes,createHash} from 'node:crypto';
import {startLocalBackend} from '../database/local-runtime.js';
import {completeServiceShowcase} from '../src/admin-v2/service-showcase-client.js';
import {configureOnboardingTransport} from '../src/admin-v2/onboarding-client.js';
import {useCloudMockSnapshot} from '../src/admin-v2/mock-onboarding-service.js';
import {initialModelWorkspace} from '../server/model-repository.js';
import {serviceModelSources} from '../src/admin-v2/supply-models.js';
import {serviceModelSourceDraft} from '../src/admin-v2/model-profile.js';
import {providerApiKeysDraft} from '../src/admin-v2/provider-management.js';
import {operationsTransaction} from '../src/admin-v2/model-operations.js';

test('cloud service configuration leaves the original workspace and simulation history unchanged',()=>{
  const state=initialModelWorkspace(),before=structuredClone(state),model=state.models.find(m=>m.id==='model-glm53');
  const freeze=value=>{if(value && typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}};
  freeze(state);
  const transaction=operationsTransaction(state,{operation:'serviceMode',modelId:model.id,data:{serviceMode:'standard',expectedUpdatedAt:model.updatedAt,confirmedReset:true}});
  const changes=Object.assign({},...transaction.changes.filter(row=>row.collection==='models' && row.id===model.id).map(row=>row.changes));
  assert.equal(changes.serviceMode,'standard');
  assert.equal(changes.listingStatus,'已下架');
  assert.deepEqual(state,before);
});

test('both 5.12.0 modes complete detection, trial, publication and unlisting through HTTP and D1', {timeout:120000}, async()=>{
  const accessCode=randomBytes(32).toString('hex');
  const local=await startLocalBackend({loginHashes:{'admin-001':createHash('sha256').update(accessCode).digest('hex')}});
  let cookie,state;
  async function api(path,{method='GET',body,operationId}={}){
    const r=await local.runtime.dispatchFetch('https://example.test/api/5120'+path,{method,headers:{...(cookie?{cookie}:{}),...(method==='GET'?{}:{origin:'https://example.test','x-moma-request':'1','content-type':'application/json'}),...(operationId?{'idempotency-key':operationId}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const raw=await r.json(),data=path==='/model-operations' && r.ok?domainModelWorkspace(raw):raw;if(!r.ok)throw Object.assign(new Error(data.error?.message || JSON.stringify(data)),{status:r.status,code:data.error?.code});return {data,headers:r.headers};
  }
  try{
    const login=await api('/auth/login',{method:'POST',body:{accountId:'admin-001',accessCode}});cookie=login.headers.get('set-cookie').split(';')[0];
    state=(await api('/model-operations')).data;useCloudMockSnapshot(state,state.cloudMockState);
    configureOnboardingTransport(async(path,options={})=>{const operationId=options.body?.operationId;const {data}=await api('/simulation'+path,{method:options.method,body:options.body,operationId});state.cloudMockState=data.mockState;useCloudMockSnapshot(state,data.mockState);if(path==='/tests' && options.method==='POST'){const found=(await api('/simulation/tests?operationId='+encodeURIComponent(operationId))).data;assert.equal(found.result.id,data.result.id);assert.deepEqual(found.mockState.operations,{});}return data.result;});
    const save=async(previous,action)=>{
      const id=crypto.randomUUID();let result;
      try{result=(await api('/model-operations/commands',{method:'POST',operationId:id,body:{operationId:id,expectedRevision:previous.revision,action}})).data;}catch(e){e.message=action.operation+': '+e.message;throw e;}
      const next={...previous,revision:result.revision,modelData:result.modelData,cloudMockState:result.mockState};
      for(const [key,patch]of Object.entries(result.patches)){const remove=new Set([...patch.remove,...patch.upsert.map(r=>r.id)]);next[key]=[...patch.upsert,...previous[key].filter(r=>!remove.has(r.id))];}
      state=next;useCloudMockSnapshot(next,next.cloudMockState);return next;
    };
    state=await completeServiceShowcase(state,save,{onProgress:message=>console.log('D1:',message)});
    const fresh=(await api('/model-operations')).data;
    const baseline=initialModelWorkspace();
    for(const key of ['models','modelTemplates','providers','endpoints','modelSupplies'])assert.deepEqual(new Set(fresh[key].map(r=>r.id)),new Set(baseline[key].map(r=>r.id)),key);
    const current=fresh.models.filter(m=>m.serviceShowcase);
    assert.equal(current.length,2);assert(current.every(m=>m.listingStatus==='已上架' && m.callsEnabled));
    assert.deepEqual(current.map(m=>m.serviceMode).sort(),['provider','standard']);
    assert((await local.db.prepare('SELECT count(*) AS n FROM publications').first()).n>=3);
    assert((await local.db.prepare('SELECT count(*) AS n FROM simulation_records').first()).n>10);
    const model=current.find(m=>m.serviceMode==='provider'),prices=structuredClone(fresh.modelSalePrices);
    state=await save(fresh,{type:'modelOperations',operation:'stopSales',modelId:model.id,data:{expectedUpdatedAt:model.updatedAt}});
    assert.equal(state.models.find(m=>m.id===model.id).callsEnabled,true);
    const stopped=state.models.find(m=>m.id===model.id);
    const priorRevision=state.revision;
    await assert.rejects(save(state,{type:'modelOperations',operation:'disableService',modelId:model.id,data:{expectedUpdatedAt:'stale'}}),/并发修订/);
    assert.equal(state.revision,priorRevision);
    state=await save(state,{type:'modelOperations',operation:'disableService',modelId:model.id,data:{expectedUpdatedAt:stopped.updatedAt}});
    assert.equal(state.models.find(m=>m.id===model.id).callsEnabled,false);
    assert.equal(state.models.find(m=>m.id===model.id).listingStatus,'已下架');
    assert.deepEqual(state.modelSalePrices,prices);
    const provider=(operation,values)=>save(state,{type:'modelOperations',operation:'provider',data:{operation,objectId:'provider-moma',values}});
    state=await provider('create',{name:'D1验收供应商',code:'d1-qa-provider',sourceType:'thirdParty'});
    assert(state.providers.some(p=>p.code==='d1-qa-provider'));
    state=await provider('keyGroupSave',{name:'D1验收密钥组'});
    const group=state.providers.find(p=>p.id==='provider-moma').apiKeyGroups.find(g=>g.name==='D1验收密钥组');
    const secret='qa-only-'+randomBytes(16).toString('hex'),keyDraft=await providerApiKeysDraft([secret]);
    state=await provider('addApiKeys',{...keyDraft,groupId:group.id});
    assert(!JSON.stringify(state).includes(secret));
    assert.equal((await local.db.prepare('SELECT count(*) AS n FROM key_group_members WHERE group_id=?').bind('provider-moma:'+group.id).first()).n,1);
    state=await provider('supplierChannelCreate',{name:'D1验收渠道',protocol:'OpenAI',baseUrl:'https://qa.example.invalid/v1/chat/completions',keyGroupId:group.id,models:[{libraryId:'template-glm-5.3',upstreamModelId:'glm-d1-qa',scenarios:[{name:'输入 Token',listPrice:'0',unit:'百万 Token',currency:'CNY'},{name:'输出 Token',listPrice:'8.5',unit:'百万 Token',currency:'CNY'}]}]});
    assert.equal(state.endpoints.length,baseline.endpoints.length+1);assert.equal(state.modelSupplies.length,baseline.modelSupplies.length);
    assert.equal((await local.db.prepare('SELECT count(*) AS n FROM channel_models WHERE removed_at IS NULL').first()).n,74);
    const channel=state.endpoints.find(e=>e.name==='D1验收渠道');
    const association=()=>state.providers.find(p=>p.id==='provider-moma').catalogConnections.find(a=>a.endpointId===channel.id);
    const procurement=amount=>save(state,{type:'modelOperations',operation:'channelProcurementPublish',data:{confirmed:true,providerId:'provider-moma',endpointId:channel.id,associationId:association().id,expectedPriceRevision:association().procurementRevision || 0,effectiveAt:new Date().toISOString(),scenarios:[{name:'输入 Token',listPrice:amount,unit:'百万 Token',currency:'CNY'},{name:'输出 Token',listPrice:'0',unit:'百万 Token',currency:'CNY'}]}});
    state=await procurement('1.25');
    const first=structuredClone(association().procurementVersions);
    assert.deepEqual(first.map(v=>v.version),[0,1]);
    assert.equal(first[1].pricing.scenarios[0].listPrice,1250000);
    assert.equal(first[1].pricing.scenarios[1].listPrice,0);
    state=await procurement('1.75');
    assert.deepEqual(association().procurementVersions.slice(0,2),first);
    assert.deepEqual(association().procurementVersions.map(v=>v.version),[0,1,2]);
    const mapping=state.modelData.mappingIds[association().id];
    const stored=await local.db.prepare('SELECT id,version FROM price_versions WHERE channel_model_id=? ORDER BY version').bind(mapping).all();
    assert.deepEqual(stored.results.map(v=>v.version),[1,2]);
    assert.equal((await local.db.prepare('SELECT active_purchase_price_id FROM channel_models WHERE id=?').bind(mapping).first()).active_purchase_price_id,association().procurementVersions[2].id);
    state=await save(state,{type:'modelOperations',operation:'tariffDictionary',data:{operation:'save',kind:'unit',name:'D1验收单位',englishName:'D1 QA unit'}});
    assert(state.tariffDictionary.some(r=>r.name==='D1验收单位'));
    for(const mode of ['standard','provider']){
      const current=state.models.find(m=>m.id===model.id);
      state=await save(state,{type:'modelOperations',operation:'serviceMode',modelId:model.id,data:{serviceMode:mode,expectedUpdatedAt:current.updatedAt,confirmedReset:true}});
    }
    assert.equal(state.models.find(m=>m.id===model.id).serviceModeRevision,3);
    assert(state.models.find(m=>m.id===model.id).serviceProviders.every(p=>p.status==='已移除'));
    assert((await local.db.prepare('SELECT count(*) AS n FROM publications').first()).n>=3);
    const unregistered=state.modelTemplates.find(row=>row.id==='builtin-pp-ocrv6'),beforeRejected=structuredClone(state);
    await assert.rejects(save(state,{type:'modelOperations',operation:'createServiceModel',data:{...serviceModelSourceDraft(state,unregistered),libraryId:unregistered.id}}),/已登记/);
    assert.deepEqual(state,beforeRejected);
    state=await save(state,{type:'modelOperations',operation:'supplierModelsRegister',data:{providerId:'provider-moma',libraryIds:['model-2']}});
    state=(await api('/model-operations')).data;
    const source=serviceModelSources(state).find(row=>row.id==='model-2'),beforeCreate=structuredClone(state);
    state=await save(state,{type:'modelOperations',operation:'createServiceModel',data:{...serviceModelSourceDraft(state,source),libraryId:source.id}});
    const reloaded=(await api('/model-operations')).data,created=reloaded.models.find(row=>row.templateId===source.id);
    assert(created);assert.equal(created.id,source.id);assert.equal(created.modelId,source.modelId);assert.equal(created.callsEnabled,false);assert.equal(created.listingStatus,'已下架');
    const retained=reloaded.modelTemplates.find(row=>row.id===source.id);
    for(const key of ['id','modelId','name','profile','capabilities'])assert.deepEqual(retained[key],source[key],key);
    const sorted=rows=>[...rows].sort((a,b)=>a.id.localeCompare(b.id));
    for(const key of ['providers','endpoints','modelSupplies','modelSalePrices','serviceRoutes'])assert.deepEqual(sorted(reloaded[key]),sorted(beforeCreate[key]),key);
    await assert.rejects(save(state,{type:'modelOperations',operation:'createServiceModel',data:{...serviceModelSourceDraft(state,source),libraryId:source.id}}),/已有模型服务/);
    assert.equal((await local.db.prepare('PRAGMA foreign_key_check').all()).results.length,0);
  }finally{configureOnboardingTransport(null);await local.runtime.dispose();}
});

test('the cloud simulator never reads or writes browser storage and exposes immutable snapshots',async()=>{
  const {createMockEngine}=await import('../src/admin-v2/mock-onboarding-core.js');
  const prior=Object.getOwnPropertyDescriptor(globalThis,'localStorage');let writes=0;
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem(){throw Error('cloud read browser storage');},setItem(){writes++;}}});
  try{
    const engine=createMockEngine({localState:{cloudOperations:true,models:[],providers:[],endpoints:[]}});
    engine.setMockScenario('timeout');const snapshot=engine.snapshot();snapshot.scenario='success';
    assert.equal(engine.snapshot().scenario,'timeout');assert.equal(writes,0);
    const atomic=engine.prepareMockConfiguration({},true);
    assert.equal(atomic.beforeHash,undefined);
    assert.throws(()=>engine.commitMockConfiguration(atomic),error=>error.code==='configuration_impact_changed');
    assert.equal(engine.snapshot().scenario,'timeout');
    const browser=engine.prepareMockConfiguration({});
    assert.equal(typeof browser.beforeHash,'string');
    engine.commitMockConfiguration(browser);
    assert.equal(engine.snapshot().scenario,'timeout');assert.equal(writes,0);
    const frozen=engine.snapshot(),freeze=value=>{if(value && typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}};
    freeze(frozen);
    const isolated=createMockEngine({initialState:frozen,localState:{cloudOperations:true,models:[],providers:[],endpoints:[]}});
    isolated.invoke('/audits');isolated.setMockScenario('success');
    assert.equal(isolated.snapshot().scenario,'success');assert.equal(frozen.scenario,'timeout');
  }finally{if(prior)Object.defineProperty(globalThis,'localStorage',prior);else delete globalThis.localStorage;}
});
