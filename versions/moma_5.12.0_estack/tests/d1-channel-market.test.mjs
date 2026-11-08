import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startLocalBackend } from '../database/local-runtime.js';
import { domainModelWorkspace } from '../src/mock/model-fields.js';
import { offerKey } from '../src/service-access.mjs';
import { materialBase } from '../src/admin-v2/model-operations.js';
import { BUILTIN_MODEL_CATALOGUE } from '../src/mock/builtin-model-catalogue.js';
import { marketModels } from '../src/service-directory.mjs';
import { providerApiKeysDraft } from '../src/admin-v2/provider-management.js';
import { supplierModelChannelGroups } from '../src/admin-v2/supplier-model-channel-table.js';
import { supplierChannelAssociations } from '../src/admin-v2/supplier-resources.js';
import { serviceModelSourceDraft } from '../src/admin-v2/model-profile.js';
import { connectionFingerprint } from '../src/admin-v2/connection-state.js';
import { channelTestModels, channelTestRequest, channelBatchTerminal } from '../src/admin-v2/channel-test-jobs.js';
import { configureOnboardingTransport, onboardingApi, prepareServerChannel } from '../src/admin-v2/onboarding-client.js';
import { useCloudMockSnapshot } from '../src/admin-v2/mock-onboarding-service.js';
import { routingServices } from '../src/admin-v2/service-routing.js';
import { routeEditorChannels, routeEditorPayload } from '../src/admin-v2/service-route-editor.js';
import { routeEditConfig } from '../src/admin-v2/route-workspace.js';
import { EMPTY_PACKAGE } from '../src/admin-v2/token-packages.js';
import { commercialPriceBase } from '../src/admin-v2/service-workspace.js';
import { platformAllowedChannels, platformCandidatePlan, publishPlatformCandidate, runPlatformTrial } from '../src/admin-v2/platform-service-client.js';

test('GLM-5.3 channel onboarding, pricing, gray sale and supplier withdrawal are enforced end to end by D1',{timeout:90000},async()=>{
  const accessCode=randomBytes(18).toString('hex');
  const [a,b,c]=['zqzh','grzh','hospital-c'];
  const loginHashes=Object.fromEntries(['yyg',a,b,c].map(id=>[id,createHash('sha256').update(accessCode).digest('hex')]));
  const persistPath=await mkdtemp(join(tmpdir(),'moma-glm-channel-market-'));
  let local,state,admin;
  async function request(path,{body,cookie,key}={}){
    const response=await local.runtime.dispatchFetch('https://example.test/api/5120'+path,{method:body?'POST':'GET',
      headers:{...(cookie?{cookie}:{}),...(body?{origin:'https://example.test','x-moma-request':'1','content-type':'application/json'}:{}),...(key?{'idempotency-key':key}:{})},
      ...(body?{body:JSON.stringify(body)}:{})});
    return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
  }
  const login=async(path,id)=>{
    const result=await request(path,{body:{[path.includes('market')?'tenantId':'accountId']:id,accessCode}});
    assert.equal(result.status,200,JSON.stringify(result.data));
    return result.cookie;
  };
  const reload=async()=>{
    const result=await request('/model-operations',{cookie:admin});
    assert.equal(result.status,200);
    state=domainModelWorkspace(result.data);useCloudMockSnapshot(state,state.cloudMockState);
  };
  async function command(operation,data,modelId,expected=200){
    const operationId=crypto.randomUUID();
    const result=await request('/model-operations/commands',{cookie:admin,key:operationId,body:{operationId,expectedRevision:state.revision,action:{type:operation==='recordPlatformPublication'?'modelOperation':'modelOperations',operation,modelId,data}}});
    assert.equal(result.status,expected,operation+': '+JSON.stringify(result.status===200?'成功':result.data));
    if (expected===200) await reload();
    return result.data;
  }
  const owner=id=>state.providers.find(row=>row.id===id);
  const prices=(input,output,field)=>['输入 Token','输出 Token'].map((name,index)=>({name,unit:'百万 Token',currency:'CNY',condition:'',[field]:String(index?output:input)}));
  try {
    local=await startLocalBackend({loginHashes,persistPath,presets:true});
    await local.db.prepare("UPDATE model_workspace SET reference_json=json_insert(reference_json,'$.tenants[#]',json(?)) WHERE id=1")
      .bind(JSON.stringify({id:c,name:'无购买权限客户',status:'正常'})).run();
    admin=await login('/auth/login','yyg');await reload();
    configureOnboardingTransport(async(path,options={})=>{
      const result=await request('/simulation'+path,{cookie:admin,body:options.method==='POST'?options.body:undefined,key:options.body?.operationId});
      assert.equal(result.status,200,path+': '+JSON.stringify(result.status===200?'成功':result.data));
      if(result.data.mockState)useCloudMockSnapshot(state,result.data.mockState);
      return result.data.result;
    });
    const reference=state.modelTemplates.find(row=>row.modelId==='glm-5.3');
    assert(reference);
    const declared=BUILTIN_MODEL_CATALOGUE.models.find(row=>row.modelId==='glm-5.3').initialRecord;
    await command('templatePublish',{id:reference.id,confirmed:true,expectedBase:materialBase(state,reference),value:{...reference,...declared}});
    const material=state.modelTemplates.find(row=>row.id===reference.id);
    const sources=[
      {vendor:'甲云',code:'qa-cloud-a',source:'自营',callId:'glm-5.3-a-self',upstream:'vendor/GLM-native',retail:[2,8]},
      {vendor:'甲云',code:'qa-cloud-a',source:'转售',callId:'glm-5.3-a-resale',upstream:'vendor/GLM-resale',retail:[3,10]},
      {vendor:'乙云',code:'qa-cloud-b',source:'自营',callId:'glm-5.3-b-self',upstream:'vendor/GLM-native',retail:[2.5,9]},
    ];
    for (const source of sources) {
      const shared=sources.find(row=>row!==source && row.code===source.code && row.endpointId);
      if (shared) {
        Object.assign(source,{providerId:shared.providerId,endpointId:shared.endpointId,modelId:shared.modelId});
      } else {
        await command('provider',{operation:'create',values:{name:source.vendor,code:source.code,sourceType:'thirdParty'}});
        source.providerId=state.audits[0].objectId;
        await command('supplierModelsRegister',{providerId:source.providerId,libraryIds:[material.id]});
        source.modelId=supplierModelChannelGroups(state,owner(source.providerId)).find(row=>row.master?.id===material.id).modelId;
        await command('provider',{operation:'addApiKeys',objectId:source.providerId,values:{...await providerApiKeysDraft(['qa-only-'+source.code]),groupId:'default'}});
      }
      const endpoint=state.endpoints.find(row=>row.id===source.endpointId);
      await command('supplierChannelRegister',{providerId:source.providerId,modelId:source.modelId,sourceName:source.source,upstreamModelId:source.upstream,
        ...(endpoint?{endpointId:endpoint.id,expectedEndpointUpdatedAt:endpoint.updatedAt}:{name:source.source,baseUrl:'https://'+source.code+'.example.invalid/v1',protocol:'OpenAI',authMode:'group',keyGroupId:'default'})});
      source.endpointId ||= state.audits[0].objectId;
      const association=supplierChannelAssociations(state,owner(source.providerId),source.endpointId).find(row=>row.upstreamModelId===source.upstream);
      assert(association);source.channelId=association.id;
    }
    assert.equal(sources[0].endpointId,sources[1].endpointId);
    assert.notEqual(sources[0].channelId,sources[1].channelId);
    const aMappings=await local.db.prepare('SELECT id,upstream_model_id FROM channel_models WHERE channel_id=? ORDER BY upstream_model_id').bind(sources[0].endpointId).all();
    assert.deepEqual(aMappings.results.map(row=>row.upstream_model_id),['vendor/GLM-native','vendor/GLM-resale']);
    for (const endpointId of new Set(sources.map(source=>source.endpointId))) {
      const targets=sources.filter(source=>source.endpointId===endpointId), providerId=targets[0].providerId;
      const endpoint=state.endpoints.find(row=>row.id===endpointId),server=await prepareServerChannel(owner(providerId),endpoint);
      const records=targets.map(source=>({associationId:source.channelId,modelId:material.id,upstreamModelId:source.upstream,type:'text'}));
      for (const check of ['', 'streaming']) {
        const submission=channelTestRequest(server.id,channelTestModels(records,{check}),{check});
        const job={providerId,endpointId,operationId:submission.operationId,serverChannelId:server.id,signature:connectionFingerprint(endpoint),associationIds:records.map(row=>row.associationId),request:submission,check};
        await command('channelTestEvidenceJob',job);
        let batch=await onboardingApi('/tests',{method:'POST',body:submission});
        await command('channelTestEvidenceJob',{...job,batchId:batch.id});
        for(let i=0;i<45 && !channelBatchTerminal(batch);i++){
          await new Promise(resolve=>setTimeout(resolve,120));batch=await onboardingApi('/tests/'+batch.id);
        }
        assert(batch.items.every(row=>row.status==='passed'),JSON.stringify(batch.items.map(row=>row.status)));
        await command('channelTestEvidenceReceipt',{providerId,endpointId,batch});
      }
      await command('provider',{operation:'supplierModelsEnable',objectId:providerId,values:{endpointId,associationIds:records.map(row=>row.associationId)}});
    }
    await command('createServiceModel',{...serviceModelSourceDraft(state,material),libraryId:material.id,serviceMode:'provider',purpose:'commercial'});
    const modelId=state.audits[0].objectId,model=()=>state.models.find(row=>row.id===modelId);
    for (const source of sources) {
      await command('associateServiceProvider',{providerId:source.providerId,channelId:source.channelId,catalogueModelId:source.modelId,expectedUpdatedAt:model().updatedAt},modelId);
      await command('configureServiceIdentity',{providerId:source.channelId,callId:source.callId,expectedUpdatedAt:model().updatedAt},modelId);
      const service=routingServices(state).find(row=>row.modelId===modelId && offerKey(row)===source.channelId);
      const channels=routeEditorChannels(state,service);
      assert.equal(channels.length,1);
      const config={...routeEditConfig(service),strategy:'fixed',channels:[{supplyId:channels[0].id,enabled:true,priority:1,weight:100,groupId:'P1'}]};
      await command('serviceRouteConfigure',routeEditorPayload(state,service,config,channels),modelId);
      const allowed=platformAllowedChannels(state,service);
      assert.equal(allowed[0].association.id,source.channelId);
      const plan=platformCandidatePlan(state,model(),{serviceId:service.id,tenantIds:[a,b,c],supplyIds:allowed.map(row=>row.id),technical:true});
      const trial=await runPlatformTrial(plan);
      assert.equal(trial.result.technicalReady,true);
      const saved=await publishPlatformCandidate(trial.service);
      await command('recordPlatformPublication',{serviceId:service.id,mockServiceId:saved.id,publishedVersion:saved.published.version,expectedFingerprint:plan.publicationFingerprint},modelId);
    }
    await command('enableService',{expectedUpdatedAt:model().updatedAt},modelId);
    for (const source of sources) {
      await command('channelProcurementPublish',{providerId:source.providerId,endpointId:source.endpointId,associationId:source.channelId,expectedPriceRevision:0,confirmed:true,effectiveAt:new Date().toISOString(),scenarios:prices(1,4,'listPrice')});
      await command('commercialPublish',{kind:'price',providerId:source.channelId,confirmed:true,expectedBase:commercialPriceBase(state,model(),source.channelId),value:{callId:source.callId,items:prices(...source.retail,'amount')}},modelId);
    }
    await command('salesSettings',{scope:{openScope:'selected',tenantIds:[a,b]},confirmed:true,expectedUpdatedAt:model().updatedAt},modelId);
    const release=(keys,tenantIds)=>({offerKeys:keys,releaseStage:'gray',releaseTenantIds:tenantIds,confirmed:true,expectedUpdatedAt:model().updatedAt});
    const keys=sources.map(row=>row.channelId);
    await command('startSales',release(keys,[c]),modelId,422);
    await command('startSales',release(keys,[a]),modelId);
    const offers=await local.db.prepare("SELECT record_id,id,channel_model_id,listing_stage,active_sale_price_id,active_route_id,active_publication_id FROM offers WHERE service_id=? AND retired_at IS NULL ORDER BY id").bind(modelId).all();
    assert.equal(offers.results.length,3);
    assert(offers.results.every(row=>row.listing_stage==='gray' && row.active_sale_price_id && row.active_route_id && row.active_publication_id));
    const customer=await login('/market/login',a), other=await login('/market/login',b);
    const catalogue=async(cookie)=>{const result=await request('/market/catalogue',{cookie});assert.equal(result.status,200,JSON.stringify(result.data));return result.data.services;};
    const services=await catalogue(customer);
    assert.deepEqual(marketModels(services).map(row=>[row.name,row.services.length]),[['GLM-5.3',3]]);
    assert.deepEqual(services.map(row=>row.provider).sort(),['乙云（自营）','甲云（自营）','甲云（转售）'].sort());
    assert.equal((await catalogue(other)).length,0);
    assert.equal((await catalogue()).length,0);
    const order=(offerId,cookie=customer)=>request('/market/orders',{cookie,body:{offerIds:[offerId]}});
    const body=(model)=>({requestId:crypto.randomUUID(),model,messages:[{role:'user',content:'验收请求'}]});
    const call=(input,cookie=customer)=>request('/market/completions',{cookie,body:input});
    assert.equal((await order(services[0].id,admin)).status,401);
    assert.equal((await order(services[0].id,other)).status,403);
    assert.equal((await call(body(services[0].callId))).data.error.code,'ORDER_REQUIRED');
    const staleQuote=await request('/market/orders',{cookie:customer,body:{tenantId:a,offerIds:[services[0].id],salePriceIds:{[services[0].id]:'old-price'}}});
    assert.equal(staleQuote.data.error.code,'PRICE_CHANGED');
    const successful=[];
    for (const source of sources.slice(0,2)) {
      const offer=services.find(row=>row.callId===source.callId);
      assert.equal(offer.salePrices[0].amount,source.retail[0]*1000000);
      const ordered=await order(offer.id);assert.equal(ordered.status,200,JSON.stringify(ordered.data));
      assert.deepEqual((await order(offer.id)).data,ordered.data);
      const input={...body(offer.callId),tenantId:a,task:'text'}, invoked=await call(input);
      assert.equal(invoked.status,200,JSON.stringify(invoked.data));
      assert.equal(invoked.data.source,'mock');
      assert(!JSON.stringify(invoked.data).includes('procurement'));
      assert.deepEqual((await call(input)).data,invoked.data);
      successful.push({source,input,id:invoked.data.id});
    }
    const workspace=async cookie=>(await request('/market/workspace',{cookie})).data;
    const application=async()=>(await request('/application',{cookie:admin})).data;
    const apply=async action=>{
      const operationId=crypto.randomUUID(), expectedRevision=(await application()).revision;
      return request('/application/commands',{cookie:admin,key:operationId,body:{operationId,expectedRevision,action}});
    };
    const tenantWrite=async (cookie,tenantId,action,data,operationId=crypto.randomUUID())=>{
      const expectedRevision=(await workspace(cookie)).revision;
      return request('/market/commands',{cookie,body:{operationId,tenantId,expectedRevision,action,data}});
    };
    assert.deepEqual((await request('/market/ranking')).data.rows,[],'灰度用量不可公开');
    const usage=(await workspace(customer)).requests;
    assert.equal(usage.find(row=>row.requestId===successful[0].input.requestId).usage.input,8);
    assert.equal((await workspace(other)).requests.length,0);
    const beforeBills=await application();
    const fact=beforeBills.requests.find(row=>row.requestId===successful[0].input.requestId);
    assert.equal(fact.userId,a);assert.equal(fact.priceVersionId,services.find(row=>row.callId===fact.publicModelId).salePriceId);
    assert.equal(fact.charge.currency,'CNY');
    assert.equal((await apply({type:'generateBills'})).status,200);
    assert.ok((await application()).bills.some(row=>row.tenantId===a && row.status==='待出账'));

    const packageState=async()=>(await request('/package-management',{cookie:admin})).data;
    const packageCommand=async (operation,values,record)=>{
      const operationId=crypto.randomUUID(), expectedRevision=(await packageState()).revision;
      const res=await request('/package-management/commands',{cookie:admin,key:operationId,
        body:{operationId,expectedRevision,action:{type:'tokenPackage',operation,values,...(record?{id:record.id,revision:record.revision}:{})}}});
      assert.equal(res.status,200,JSON.stringify(res.data.error));
      return res.data;
    };
    const cataloguePackage=await packageState();
    const rules=cataloguePackage.packageModels.find(row=>row.id===material.id).billingItemIds.map(billingItemId=>
      ({billingItemId,lower:'',upper:'',factor:'1',tiered:false}));
    await packageCommand('saveFactorDraft',{modelId:material.id,rules,enabled:true,changeNote:'套餐联动验收'});
    await packageCommand('publishFactorRules',{modelId:material.id});
    const published=await packageCommand('publishPackage',{...EMPTY_PACKAGE,name:'政企验收套餐',quota:'1',price:'9.90',
      modelIds:[material.id],userTypes:['enterprise'],limited:true,purchaseLimit:'1'});
    await packageCommand('list',{},published.patches.tokenPackages.upsert[0]);
    const [pack]=(await request('/market/catalogue',{cookie:customer})).data.packages;
    assert.equal(pack.name,'政企验收套餐');
    assert.deepEqual((await request('/market/catalogue',{cookie:other})).data.packages,[]);
    const items=[{id:pack.id,revision:pack.revision}];
    assert.equal((await tenantWrite(other,b,'subscribe',{items})).status,422);
    const subscribed=await tenantWrite(customer,a,'subscribe',{items});
    assert.equal(subscribed.status,200,JSON.stringify(subscribed.data));
    assert.equal((await tenantWrite(customer,a,'subscribe',{items})).status,422);
    const [plan]=(await workspace(customer)).plans;
    assert.equal(plan.entitlement,10000);
    assert.equal(plan.packageRevision,pack.revision);
    assert(!Object.hasOwn(plan,'factorSnapshot'));
    const planKey={id:'plan-test-key',name:'套餐验收 Key',enabled:true,models:null,secretPreview:'sk-demo*****plan'};
    assert.equal((await tenantWrite(customer,a,'keys',{billing:'Token Plan',subscriptionId:plan.id,rows:[planKey]})).status,200);
    assert.equal((await workspace(other)).plans.length,0);
    assert.equal((await packageState()).packageOrders[0].id,plan.id);
    const meteringId=crypto.randomUUID();
    const metered=await apply({type:'simulateInvocation',data:{requestId:meteringId,keyId:planKey.id,modelId:sources[0].callId,purpose:'metering-test'}});
    assert.equal(metered.status,200,JSON.stringify(metered.data.error));
    const meter=(await application()).requests.find(row=>row.requestId===meteringId);
    assert.equal(meter.httpStatus,200,JSON.stringify(meter.attempts.map(row=>row.error)));
    assert.ok((await packageState()).packageOrders[0].used>0);

    // Verify that the third offer is callable before withdrawal, while leaving a fresh A order for afterwards.
    const previewCustomer=await login('/market/login',b);
    await command('startSales',release([keys[2]],[a,b]),modelId);
    const third=services.find(row=>row.callId===sources[2].callId);
    assert.equal((await order(third.id,previewCustomer)).status,200);
    const before=await call(body(third.callId),previewCustomer);assert.equal(before.status,200,JSON.stringify(before.data));
    successful.push({source:sources[2],id:before.data.id});
    await command('stopSales',{offerKeys:keys.slice(0,2),confirmed:true,expectedUpdatedAt:model().updatedAt},modelId);
    assert.deepEqual((await catalogue(customer)).map(row=>row.callId),[third.callId]);
    for (const previous of successful.slice(0,2)) {
      const offer=services.find(row=>row.callId===previous.source.callId);
      assert.equal((await order(offer.id)).status,409);
      assert.equal((await call(body(offer.callId))).status,409);
      assert.equal((await call(previous.input)).status,409);
    }
    assert.equal((await order(third.id)).status,200);
    const after=await call(body(third.callId));assert.equal(after.status,200,JSON.stringify(after.data));
    successful.push({source:sources[2],id:after.data.id});
    for (const {source,id} of successful) {
      const row=await local.db.prepare("SELECT json_extract(r.payload_json,'$.upstreamModelId') AS upstream,call.offer_id,call.sale_price_id,call.route_version_id FROM market_calls call JOIN simulation_records r ON r.kind='usage' AND r.id=call.usage_id WHERE call.usage_id=?").bind(id).first();
      assert.equal(row.upstream,source.upstream);
      assert.equal(row.offer_id,services.find(offer=>offer.callId===source.callId).id);
      assert(row.sale_price_id && row.route_version_id);
    }
    await local.runtime.dispose();
    local=null;
    local=await startLocalBackend({loginHashes,persistPath});
    assert.deepEqual((await catalogue(customer)).map(row=>row.callId),[third.callId]);
    assert.deepEqual((await local.db.prepare('SELECT id,listing_stage FROM offers WHERE service_id=? AND retired_at IS NULL ORDER BY id').bind(modelId).all()).results,
      sources.map((source,index)=>({id:source.callId,listing_stage:index===2?'gray':'withdrawn'})).sort((a,b)=>a.id.localeCompare(b.id)));
    assert.equal(await local.db.prepare('SELECT COUNT(*) AS n FROM market_orders').first('n'),4);
    assert.equal(await local.db.prepare('SELECT COUNT(*) AS n FROM market_calls').first('n'),4);
    const activeOrder=(await request('/market/catalogue',{cookie:customer})).data.orders.find(row=>row.offerId===third.id);
    assert.equal((await apply({type:'cancelMarketOrder',id:activeOrder.id})).status,200);
    assert.equal((await call(body(third.callId))).data.error.code,'ORDER_REQUIRED');
    const reordered=await order(third.id);
    assert.equal(reordered.status,200);assert.notEqual(reordered.data.orders[0].id,activeOrder.id);
    const expiring=successful[0];
    await local.db.prepare('UPDATE market_calls SET created_at=? WHERE usage_id=?').bind(Date.now()-8*86400000,expiring.id).run();
    assert.equal((await call(body(third.callId))).status,200);
    assert.equal(await local.db.prepare("SELECT id FROM simulation_records WHERE kind='usage' AND id=?").bind(expiring.id).first(),null);
    await reload();
    await command('startSales',{...release([keys[2]],[]),releaseStage:'formal'},modelId);
    assert.deepEqual((await request('/market/ranking')).data.rows,[],'转为正式上架也不公开历史灰度用量');
    assert.equal((await call(body(third.callId))).status,200);
    const ranking=await request('/market/ranking');
    assert.equal(ranking.status,200);
    assert.ok(ranking.data.rows.some(row=>row.id===material.id && row.tokens>=10));
    assert(!Object.hasOwn(ranking.data.rows[0],'tenantId'));
    assert.deepEqual((await local.db.prepare('PRAGMA foreign_key_check').all()).results,[]);
  } finally {
    configureOnboardingTransport(null);
    await local?.runtime.dispose();
    await rm(persistPath,{recursive:true,force:true});
  }
});
