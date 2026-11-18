import test from 'node:test';
import {resourceId} from '../src/resource-id.mjs';
import assert from 'node:assert/strict';
import {createHash, randomBytes} from 'node:crypto';
import {startLocalBackend} from '../database/local-runtime.js';
import {domainModelWorkspace} from '../src/mock/model-fields.js';
import {modelChanges} from '../server/model-repository.js';
import {serviceReferences} from '../src/service-access.mjs';

test('HTTP permanent-ID deletion isolates siblings, rejects history and forged IDs, and keeps masters and audit', {timeout:60000}, async()=>{
 const code=randomBytes(24).toString('hex'), local=await startLocalBackend({demo:true,loginHashes:{'admin-001':createHash('sha256').update(code).digest('hex')}});
 let cookie='';
 const request=(path,body)=>local.runtime.dispatchFetch('https://example.test/api/5120'+path,{method:body?'POST':'GET',headers:{...(cookie?{cookie}:{}),...(body?{origin:'https://example.test','x-moma-request':'1','content-type':'application/json'}:{}),...(body?.operationId?{'idempotency-key':body.operationId}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const read=async()=>domainModelWorkspace(await (await request('/model-operations')).json());
 const command=(state,data,modelId,operation='serviceDelete')=>({operationId:crypto.randomUUID(),expectedRevision:state.revision,action:{type:'modelOperations',operation,modelId,data}});
 const send=async(body,status=200)=>{const response=await request('/model-operations/commands',body);assert.equal(response.status,status,await response.clone().text());return response.json();};
 try{
  const login=await request('/auth/login',{accountId:'admin-001',accessCode:code});assert.equal(login.status,200);cookie=login.headers.get('set-cookie').split(';')[0];
  let state=await read();await send(command(state,{providerId:'provider-moma',libraryIds:['builtin-pp-ocrv6']},undefined,'supplierModelsRegister'));state=await read();
  await send(command(state,{libraryIds:['builtin-pp-ocrv6'],serviceMode:'provider'},undefined,'createServiceModels'));state=await read();
  const configured=structuredClone(state),model=configured.models.find(row=>row.templateId==='builtin-pp-ocrv6'),owners=configured.providers.slice(0,2);
  Object.assign(model,{callsEnabled:false,listingStatus:'已下架',serviceProviders:owners.map((provider,index)=>({providerId:provider.id,callId:'delete-entry-'+index,callsEnabled:false,marketVisible:false,listingStage:'unlisted',status:'已关联'}))});
  const priceId=resourceId('sale-price-version');configured.modelSalePrices.push({id:priceId,modelId:model.id,scope:'provider',providerId:owners[1].id,serviceModeRevision:model.serviceModeRevision || 1,version:1,status:'已发布',effectiveAt:'2026-01-01T00:00:00.000Z',items:[{name:state.tariffDictionary.find(row=>row.kind==='scenario').name,unit:state.tariffDictionary.find(row=>row.kind==='unit').name,currency:'CNY',amount:1000000}]});
  await local.db.batch([local.db.prepare('PRAGMA defer_foreign_keys=ON'),...modelChanges(local.db,state,configured)]);state=await read();
  const current=state.models.find(row=>row.id===model.id),entries=serviceReferences(state).filter(row=>row.modelId===model.id),before=structuredClone(state),data={confirmed:true,expectedUpdatedAt:current.updatedAt,model_service_id:entries[0].model_service_id};
  for(const model_service_id of ['model_service-unknown','',null]){await send(command(state,{...data,model_service_id},model.id),422);assert.deepEqual(await read(),before);}
  const foreign=serviceReferences(state).find(row=>row.modelId!==model.id);assert(foreign);await send(command(state,{...data,model_service_id:foreign.model_service_id},model.id),422);
  await send(command({...state,revision:state.revision-1},data,model.id),409);
  await local.db.prepare('INSERT INTO market_orders(id,tenant_id,offer_id,sale_price_id,created_at) VALUES(?,?,?,?,?)').bind('entry-deletion-history','test-tenant',entries[1].model_service_id,priceId,Date.now()).run();
  const deletion=command(state,data,model.id);await send(deletion);await send(deletion);state=await read();
  const remaining=serviceReferences(state).filter(row=>row.modelId===model.id);assert.equal(remaining.length,1);assert.equal(remaining[0].model_service_id,entries[1].model_service_id);
  assert.deepEqual(state.models.find(row=>row.id===model.id).serviceProviders.find(row=>row.providerId===owners[1].id),current.serviceProviders[1]);
  for(const key of ['modelTemplates','providers','endpoints','modelSalePrices','supplyPrices'])assert.deepEqual(state[key],before[key],key);
  assert(await local.db.prepare('SELECT 1 FROM market_orders WHERE id=?').bind('entry-deletion-history').first());
  const after=structuredClone(state);await send(command(state,{...data,expectedUpdatedAt:state.models.find(row=>row.id===model.id).updatedAt,model_service_id:entries[1].model_service_id},model.id),422);assert.deepEqual(await read(),after);
  assert.equal((await local.db.prepare('PRAGMA foreign_key_check').all()).results.length,0);
 }finally{await local.runtime.dispose();}
});
