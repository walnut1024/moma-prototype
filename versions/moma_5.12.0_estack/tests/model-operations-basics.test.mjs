import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {supplierMaterialReturn,supplierModelSelection} from '../src/admin-v2/supplier-model-registration.js';
import {startLocalBackend} from '../database/local-runtime.js';
import {domainModelWorkspace} from '../src/mock/model-fields.js';
import {libraryRecord} from '../src/admin-v2/model-library.js';
import {serviceModelSourceDraft} from '../src/admin-v2/model-profile.js';

test('material maintenance returns to the supplier selection without accepting external routes or malformed selection',()=>{
  const address=supplierMaterialReturn('#/admin-2/providers?provider=provider-moma&selectedModels='+encodeURIComponent('["template-a"]'),'template-b');
  const params=new URLSearchParams(address.split('?')[1]);
  assert.equal(params.get('provider'),'provider-moma');assert.equal(params.get('addingModel'),'1');
  assert.deepEqual(supplierModelSelection(params.get('selectedModels')),['template-a','template-b']);
  for(const bad of [null,'https://outside.invalid','#/admin-2/listing','#/admin-2/providers-extra?provider=x','#/admin-2/providers'])assert.equal(supplierMaterialReturn(bad),null);
  for(const bad of ['not-json','{}','[1]','["<script>"]',JSON.stringify(Array(6).fill('a'))])assert.deepEqual(supplierModelSelection(bad),[]);
});

test('HTTP and D1 preserve canonical material, explicit channel protocol and candidate edits across the first onboarding stage',{timeout:60000},async()=>{
  const accessCode=randomBytes(24).toString('hex');
  const local=await startLocalBackend({loginHashes:{'admin-001':createHash('sha256').update(accessCode).digest('hex')}});
  let cookie,state;
  async function api(path,body,key){const r=await local.runtime.dispatchFetch('https://example.test/api/5120'+path,{method:body?'POST':'GET',headers:{...(cookie?{cookie}:{}),...(body?{origin:'https://example.test','content-type':'application/json','x-moma-request':'1'}:{}),...(key?{'idempotency-key':key}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json(),headers:r.headers};}
  async function refresh(){state=domainModelWorkspace((await api('/model-operations')).data);return state;}
  async function command(operation,data,modelId){const id=crypto.randomUUID();return api('/model-operations/commands',{operationId:id,expectedRevision:state.revision,action:{type:'modelOperations',operation,modelId,data}},id);}
  try{
    const login=await api('/auth/login',{accountId:'admin-001',accessCode});assert.equal(login.status,200);cookie=login.headers.get('set-cookie').split(';')[0];await refresh();
    const baseline=structuredClone(state),master=structuredClone(libraryRecord(state,'model-glm53'));
    const value={...master,name:'GLM-5.5',modelId:'glm-5.5',profile:{...master.profile,releaseDate:'2026-11-05'}};delete value.id;
    const saved=await command('templateSave',value);assert.equal(saved.status,200,JSON.stringify(saved.data));await refresh();
    const material=state.modelTemplates.find(row=>row.modelId==='glm-5.5');assert.ok(material);
    const registered=await command('supplierModelsRegister',{providerId:'provider-moma',libraryIds:[material.id]});assert.equal(registered.status,200,JSON.stringify(registered.data));await refresh();
    const owner=state.providers.find(row=>row.id==='provider-moma'),catalogue=owner.catalogModels.find(row=>row.libraryId===material.id);
    const channel={providerId:owner.id,modelId:catalogue.modelId,name:'阶段一测试渠道',upstreamModelId:'vendor/glm-5.5',protocol:'Anthropic',baseUrl:'https://phase-one.example.invalid/v1',authMode:'group',keyGroupId:'default',scenarios:[{name:'输入 Token',listPrice:'0',unit:'百万 Token',currency:'CNY'}]};
    const invalid=await command('supplierChannelRegister',{...channel,protocol:'unknown'});assert.equal(invalid.status,422);await refresh();assert.equal(state.revision,registered.data.revision);
    const fullTask=await command('supplierChannelRegister',{...channel,baseUrl:channel.baseUrl+'/messages'});assert.equal(fullTask.status,422);await refresh();assert.equal(state.revision,registered.data.revision);
    const connected=await command('supplierChannelRegister',channel);assert.equal(connected.status,200,JSON.stringify(connected.data));await refresh();
    const endpoint=state.endpoints.find(row=>row.name===channel.name),association=state.providers.find(row=>row.id===owner.id).catalogConnections.find(row=>row.endpointId===endpoint.id);
    assert.equal(endpoint.protocol,'Anthropic');assert.equal(endpoint.interfaceType,'anthropic');assert.equal(endpoint.status,'草稿');assert.equal(association.enabled,false);assert.equal(state.modelSupplies.length,baseline.modelSupplies.length);
    const edit={providerId:owner.id,endpointId:endpoint.id,associationId:association.id,modelId:catalogue.modelId,upstreamModelId:channel.upstreamModelId,name:endpoint.name,protocol:'OpenAI',baseUrl:channel.baseUrl,expectedUpdatedAt:endpoint.updatedAt,expectedProviderUpdatedAt:state.providers.find(row=>row.id===owner.id).updatedAt};
    const changed=await command('supplierChannelEdit',edit);assert.equal(changed.status,200,JSON.stringify(changed.data));await refresh();
    const pending=state.endpoints.find(row=>row.id===endpoint.id);assert.equal(pending.protocol,'Anthropic');assert.equal(pending.baseUrl,channel.baseUrl);assert.equal(pending.candidateConfiguration.config.protocol,'OpenAI');
    const create=await command('createServiceModel',{...serviceModelSourceDraft(state,material),libraryId:material.id,modelId:'glm-5.5-service',serviceMode:'standard'});assert.equal(create.status,200,JSON.stringify(create.data));await refresh();
    const service=state.models.find(row=>row.templateId===material.id);assert.equal(service.name,material.name);assert.equal(service.description,material.description);assert.equal(service.serviceMode,'standard');assert.equal(service.callsEnabled,false);assert.equal(service.listingStatus,'已下架');assert.equal(service.modelId,'glm-5.5-service');
    const duplicate=await command('createServiceModel',{...serviceModelSourceDraft(state,material),libraryId:material.id,modelId:'another'});assert.equal(duplicate.status,422);
    await refresh();for(const key of ['modelSalePrices','supplyPrices','serviceRoutes'])assert.deepEqual(state[key],baseline[key],key);for(const row of baseline.endpoints)assert.deepEqual(state.endpoints.find(current=>current.id===row.id),row);
    assert.equal((await local.db.prepare('PRAGMA foreign_key_check').all()).results.length,0);
  }finally{await local.runtime.dispose();}
});
