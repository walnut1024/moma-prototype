import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {parseAdminState} from '../src/admin-v2/store.js';
import {retailItems,serviceScope} from '../src/admin-v2/service-commercial.js';
import {modelReleaseOrder} from '../src/admin-v2/model-library.js';
import {commercialTaskBase,activeProviderPrice,serviceConfigurationTarget} from '../src/admin-v2/service-workspace.js';
import {startLocalBackend} from '../database/local-runtime.js';
import {domainModelWorkspace} from '../src/mock/model-fields.js';

test('retail dictionaries require enabled selections, preserve saved snapshots and distinguish free from missing',()=>{
  const state=parseAdminState(null),row={name:'输入 Token',unit:'百万 Token',currency:'CNY',condition:'',amount:'0'};
  assert.equal(retailItems(state,[row])[0].amount,0);
  assert.throws(()=>retailItems(state,[{...row,amount:''}]),/必填/);
  for(const patch of [{name:'临时输入'},{unit:'临时单位'},{currency:'EUR'}]) assert.throws(()=>retailItems(state,[{...row,...patch}]),/字典/);
  const legacy={...row,name:'手工计量',unit:'手工单位',amount:1200000};
  const before=structuredClone(state);
  assert.equal(retailItems(state,[{...legacy,amount:'1.3'}],[legacy])[0].amount,1300000);
  assert.throws(()=>retailItems(state,[{...legacy,amount:'1.3'}]),/字典/);
  assert.deepEqual(state,before);
});
test('scope explicitly selects active clients and never silently expands invalid or empty selections',()=>{
  const state={tenants:[{id:'active',status:'正常'},{id:'stopped',status:'已停用'},{id:'deleted',status:'已删除'},{id:'unknown'}]};
  assert.deepEqual(serviceScope(state,{openScope:'selected',tenantIds:['active','active']}),{openScope:'selected',tenantIds:['active']});
  for(const tenantIds of [[],['stopped'],['deleted'],['missing'],['unknown'],'active']) assert.throws(()=>serviceScope(state,{openScope:'selected',tenantIds}),/客户/);
  assert.throws(()=>serviceScope(state,{openScope:'unknown',tenantIds:[]}),/客户/);
});
test('listing repairs target the current standard or provider mapping and the visible scope editor',()=>{
  const model={id:'canonical',serviceMode:'standard'};
  assert.equal(serviceConfigurationTarget(model,{tab:'routing',mapping:true}).mapping,'standard:canonical');
  assert.equal(serviceConfigurationTarget(model,{tab:'routing',providerId:'p',mapping:true}).mapping,'provider:canonical:p');
  assert.equal(serviceConfigurationTarget(model,{tab:'publication'}).scopeEdit,'1');
  assert.equal(serviceConfigurationTarget(model,{tab:'publication'}).panel,'access');
});
test('material release sorting is newest first, stable for ties and missing last without fabricating month precision',()=>{
  const rows=[['missing',''],['june','2026-06-11'],['month','2026-10'],['october','2026-10-17'],['tie','2026-10-17']].map(([id,releaseDate])=>({id,profile:{releaseDate}}));
  const before=structuredClone(rows),sorted=[...rows].sort(modelReleaseOrder);
  assert.deepEqual(sorted.map(row=>row.id),['october','tie','month','june','missing']);
  assert.deepEqual(rows,before);assert.equal(sorted[2].profile.releaseDate,'2026-10');
});
test('D1 commercial commands reject incomplete and stale writes, persist independent scope/price and replay idempotently',{timeout:90000},async()=>{
  const accessCode=randomBytes(24).toString('hex'),local=await startLocalBackend({loginHashes:{'admin-001':createHash('sha256').update(accessCode).digest('hex')}});let cookie='',state;
  try{
    const api=async(path,body,id)=>{const response=await local.runtime.dispatchFetch('https://example.test/api/5120'+path,{method:body?'POST':'GET',headers:{...(cookie?{cookie}:{}),...(body?{'content-type':'application/json',origin:'https://example.test','x-moma-request':'1'}:{}),...(id?{'idempotency-key':id}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};};
    cookie=(await api('/auth/login',{accountId:'admin-001',accessCode})).cookie;
    const reload=async()=>{state=domainModelWorkspace((await api('/model-operations')).data);};await reload();
    const modelId='model-glm53',providerId='provider-moma',model=()=>state.models.find(row=>row.id===modelId),before=structuredClone(state);
    const command=async(kind,value,base)=>{const id=crypto.randomUUID(),body={operationId:id,expectedRevision:state.revision,action:{type:'modelOperations',operation:'commercialPublish',modelId,data:{kind,providerId:kind==='price'?providerId:'',value,expectedBase:base??commercialTaskBase(state,model(),kind,kind==='price'?providerId:''),confirmed:true}}};const result=await api('/model-operations/commands',body,id);await reload();return {result,id,body};};
    const price=activeProviderPrice(state,modelId,providerId),value={callId:model().serviceProviders.find(row=>row.providerId===providerId).callId,items:price.items.map(row=>({...row,condition:row.condition || '',amount:String(row.amount/1000000)}))};
    const invalid=structuredClone(value);invalid.items[0].amount='';assert.equal((await command('price',invalid)).result.status,422);assert.deepEqual(state.modelSalePrices,before.modelSalePrices);
    value.items[0].amount='0';const saved=await command('price',value);assert.equal(saved.result.status,200,JSON.stringify(saved.result.data));assert.equal((await api('/model-operations/commands',saved.body,saved.id)).status,200);await reload();assert.equal(activeProviderPrice(state,modelId,providerId).items[0].amount,0);
    assert.equal((await command('scope',{openScope:'selected',tenantIds:['missing']})).result.status,422);
    const priceHistory=structuredClone(state.modelSalePrices);assert.equal((await command('scope',{openScope:'selected',tenantIds:['tenant-gov']})).result.status,200);assert.deepEqual(state.modelSalePrices,priceHistory);assert.deepEqual(model().tenantIds,['tenant-gov']);
    assert.equal((await command('scope',{openScope:'all',tenantIds:[]},'stale')).result.status,422);assert.deepEqual(model().tenantIds,['tenant-gov']);
    for(const key of ['providers','endpoints','modelSupplies','serviceRoutes','orders','apiKeys'])assert.deepEqual(state[key],before[key],key);
    for(const row of before.modelSalePrices)assert.deepEqual(state.modelSalePrices.find(item=>item.id===row.id),row);
    assert.equal((await local.db.prepare('PRAGMA foreign_key_check').all()).results.length,0);
  }finally{await local.runtime.dispose();}
});
