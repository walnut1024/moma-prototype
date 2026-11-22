import { isResourceId, resourceId } from '../src/resource-id.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrateEmptyDatabase, startLocalBackend } from '../database/local-runtime.js';
import { billingPeriod } from '../src/admin-v2/mock-billing.js';
import { domainModelWorkspace } from '../src/mock/model-fields.js';
import { offerKey } from '../src/service-access.mjs';
import { materialBase } from '../src/admin-v2/model-operations.js';
import { classificationIndex, modelClassification, modelClassificationFor } from '../src/admin-v2/model-classification.js';
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
import { serviceDirectoryRows } from '../src/admin-v2/service-directory.js';
import { routeEditorChannels, routeEditorPayload } from '../src/admin-v2/service-route-editor.js';
import { routeEditConfig, routeTableGroups } from '../src/admin-v2/route-workspace.js';
import { salesStatus } from '../src/admin-v2/service-sales.js';
import { EMPTY_PACKAGE } from '../src/admin-v2/token-packages.js';
import { commercialPriceBase } from '../src/admin-v2/service-workspace.js';
import { mappingCandidates } from '../src/admin-v2/service-model-mappings.js';
import { channelFingerprint } from '../src/admin-v2/provider-channels.js';
import { platformAllowedChannels, platformCandidatePlan, publishPlatformCandidate, runPlatformTrial } from '../src/admin-v2/platform-service-client.js';

test('GLM-5.3 channel onboarding, pricing, gray sale and supplier withdrawal are enforced end to end by D1',{timeout:90000},async()=>{
  process.env.VITE_MOMA_PRIVATE_SITE='1';
  const accessCode=randomBytes(18).toString('hex');
  const [a,b,c]=['zqzh','grzh','hospital-c'];
  const loginHashes=Object.fromEntries(['yyg','admin-002',a,b,c].map(id=>[id,createHash('sha256').update(accessCode).digest('hex')]));
  const persistPath=await mkdtemp(join(tmpdir(),'moma-glm-channel-market-'));
  let local,state,admin;
  async function request(path,{body,cookie,key,authorization,requestId}={}){
    const response=await local.runtime.dispatchFetch('https://example.test/api/v1'+path,{method:body?'POST':'GET',
      headers:{...(cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{}),
        ...(body && !authorization ? {origin:'https://example.test','x-moma-request':'1'} : {}),
        ...(key?{'idempotency-key':key}:{}),...(authorization?{authorization}:{}),...(requestId?{'x-request-id':requestId}:{})},
      ...(body?{body:JSON.stringify(body)}:{})});
    return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
  }
  const bearer=(secret,model,{requestId=crypto.randomUUID(),metadata,routing}={})=>request('/chat/completions',{
    authorization:'Bearer '+secret,requestId,body:{model,metadata,routing,messages:[{role:'user',content:'验收 API Key 调用'}]},
  });
  const login=async(path,id)=>{
    const result=await request(path,{body:path.includes('market')
      ? {username:id,accountType:id===b?'personal':'enterprise',accessCode} : {accountId:id,accessCode}});
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
    await local.db.prepare("UPDATE experience_settings SET options_json=json_set(options_json,'$.recommendations[0][0]',?),result_json=json_set(result_json,'$.answer',?) WHERE task='text'")
      .bind('D1 推荐标题','D1 模拟结果').run();
    const experience=await request('/market/experience-options?task=text');
    assert.equal(experience.status,200);
    assert.equal(experience.data.recommendations[0][0],'D1 推荐标题');
    assert.equal((await request('/market/experience-options?task=unknown')).status,400);
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
      {vendor:'甲云',code:'qa-cloud-a',source:'自营',callId:'glm-5.3-a-self',upstream:'vendor/GLM-native',retail:[2000,8000]},
      {vendor:'甲云',code:'qa-cloud-a',source:'转售',callId:'glm-5.3-a-resale',upstream:'vendor/GLM-resale',retail:[3,10]},
      {vendor:'乙云',code:'qa-cloud-b',source:'自营',callId:'glm-5.3-b-self',upstream:'vendor/GLM-native',retail:[2500,9000]},
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
      assert.equal(model().serviceProviders.find(row=>row.channelId===source.channelId).callsEnabled,false);
      await command('serviceProviderServing',{providerId:source.channelId,enabled:true,expectedUpdatedAt:model().updatedAt},modelId);
    }
    for (const source of sources) {
      await command('channelProcurementPublish',{providerId:source.providerId,endpointId:source.endpointId,associationId:source.channelId,expectedPriceRevision:0,confirmed:true,effectiveAt:new Date().toISOString(),scenarios:prices(1,4,'listPrice')});
      await command('commercialPublish',{kind:'price',providerId:source.channelId,confirmed:true,expectedBase:commercialPriceBase(state,model(),source.channelId),value:{callId:source.callId,items:prices(...source.retail,'amount')}},modelId);
    }
    await command('salesSettings',{scope:{openScope:'selected',tenantIds:[a,b]},confirmed:true,expectedUpdatedAt:model().updatedAt},modelId);
    const release=(keys,tenantIds)=>({offerKeys:keys,releaseStage:'gray',releaseTenantIds:tenantIds,confirmed:true,expectedUpdatedAt:model().updatedAt});
    const keys=sources.map(row=>row.channelId);
    await command('startSales',release(keys,[c]),modelId,422);
    await command('startSales',release(keys,[a]),modelId);
    assert.deepEqual(routeTableGroups(state,model()).map(group=>[group.providerId,group.providerName,
      group.rows.map(row=>[row.span,row.service.channelId])]),[
      [sources[0].providerId,'甲云',[[1,sources[0].channelId],[1,sources[1].channelId]]],
      [sources[2].providerId,'乙云',[[1,sources[2].channelId]]],
    ]);
    const offers=await local.db.prepare("SELECT record_id,id,channel_model_id,listing_stage,active_sale_price_id,active_route_id,active_publication_id FROM offers WHERE service_id=? AND retired_at IS NULL ORDER BY id").bind(modelId).all();
    assert.equal(offers.results.length,3);
    for (const row of offers.results) assert(isResourceId(row.record_id, 'model_service'));
    assert(offers.results.every(row=>row.listing_stage==='gray' && row.active_sale_price_id && row.active_route_id && row.active_publication_id));
    let customer=await login('/market/login',a), other=await login('/market/login',b);
    const catalogue=async(cookie)=>{const result=await request('/market/catalogue',{cookie});assert.equal(result.status,200,JSON.stringify(result.data));return result.data.services;};
    const { author, series } = modelClassificationFor(classificationIndex(modelClassification(state)), material);
    assert.ok(author);
    await command('modelClassificationSave', { ...author, kind: 'authors', name: '智谱（目录标准名称）' });
    const savedAuthor = state.modelData.modelClassification.authors.find(row => row.id === author.id);
    assert.equal(savedAuthor.name, '智谱（目录标准名称）');
    assert.ok(savedAuthor.formerNames.includes(author.name));
    await command('modelClassificationSave', { kind: 'authors', name: author.name, aliases: [], active: true }, undefined, 422);
    const services=await catalogue(customer);

    assert.deepEqual(marketModels(services).map(row=>[row.name,row.services.length,[...row.providers.values()]]),[['GLM-5.3',3,['甲云','乙云']]]);
    assert.ok(services.every(row => row.classification.authorId === author.id && row.classification.author === savedAuthor.name && row.classification.seriesId === series?.id));
    assert.deepEqual(services.map(row=>row.provider).sort(),['乙云（自营）','甲云（自营）','甲云（转售）'].sort());
    for (const source of sources) {
      const { providerId, providerName }=services.find(row=>row.callId===source.callId);
      assert.deepEqual([providerId,providerName],[source.providerId,source.vendor]);
    }
    assert.equal((await catalogue(other)).length,0);
    assert.equal((await catalogue()).length,0);
    const attached = sources[0], endpoint = state.endpoints.find(row => row.id === attached.endpointId);
    const deleteMapping = (associationId, endpointId, expected = 200) => command('provider', {
      operation: 'supplierCatalogueChannelDelete', objectId: attached.providerId,
      values: { modelId: attached.modelId, associationId, endpointId, confirmed: true },
    }, undefined, expected);
    await deleteMapping(attached.channelId, endpoint.id, 422);
    for (const shared of [true, false]) {
      const upstreamModelId = shared ? 'vendor/unused-shared' : 'vendor/unused-separate';
      await command('supplierChannelRegister', { providerId: attached.providerId, modelId: attached.modelId, upstreamModelId, sourceName: '闲置来源',
        ...(shared ? { endpointId: endpoint.id, expectedEndpointUpdatedAt: state.endpoints.find(row => row.id === endpoint.id).updatedAt }
          : { name: '闲置渠道', baseUrl: 'https://unused.example.invalid/v1', protocol: 'OpenAI', authMode: 'group', keyGroupId: 'default' }) });
      const unused = owner(attached.providerId).catalogConnections.find(row => row.upstreamModelId === upstreamModelId);
      await deleteMapping(unused.id, unused.endpointId);
      assert.ok(owner(attached.providerId).catalogConnections.find(row => row.id === unused.id).deletedAt);
      assert.equal(state.endpoints.some(row => row.id === unused.endpointId), shared);
    }
    const order=(offerId,cookie=customer)=>request('/market/orders',{cookie,body:{offerIds:[offerId]}});
    const workspace=async cookie=>(await request('/market/workspace',{cookie})).data;
    const project=(await workspace(customer)).projectRouting.projects.find(row=>row.canEdit);
    assert(project);
    const serviceIds = services.map(row=>row.id);
    const setCardVisibility = (listing_stage, scope, expected) => command('marketCardSetStatus',
      { listing_stage, scope, serviceIds, expectedRevision:state.revision }, material.id, expected);
    await setCardVisibility('gray', { tenantIds: [] }, 422);
    await setCardVisibility('gray', { tenantIds: [a, 'missing-tenant'] }, 422);
    await setCardVisibility('gray', { tenantIds: [a,c] });
    assert.deepEqual(state.modelData.marketCards[material.id].scope.tenantIds,[a,c]);
    assert.deepEqual((await catalogue(customer)).map(row=>row.id).sort(),[...serviceIds].sort());
    assert.deepEqual((await catalogue(other)),[]);
    assert.equal((await request('/market/catalogue?project='+project.id,{cookie:other})).status,403);

    const startAll = () => command('startSales', release(sources.map(source=>source.channelId),[a]), modelId);
    const saleBlocked = async () => {
      assert(model().serviceProviders.every(row=>row.salesPaused === true && row.callsEnabled !== false));
      assert.equal((await order(serviceIds[0])).data.error.message,'此模型服务已停售');
    };
    await setCardVisibility('preview');
    const preview = (await request('/market/catalogue',{cookie:customer})).data;
    assert.equal(preview.cards.find(card=>card.model_id===material.id)?.preview,true);
    assert.deepEqual(preview.services,[]);
    await saleBlocked();
    await command('startSales', release([sources[0].channelId],[a]), modelId, 422);
    await setCardVisibility('formal');
    assert((await catalogue(customer)).every(row=>row.canOrder===false));
    await startAll();
    await setCardVisibility('withdrawn');
    assert(!(await request('/market/catalogue',{cookie:customer})).data.cards.some(card=>card.model_id===material.id));
    await saleBlocked();
    await setCardVisibility('formal');
    await startAll();
    await local.db.prepare("UPDATE model_workspace SET meta_json=json_remove(meta_json,?) WHERE id=1")
      .bind('$.modelData.marketCards.'+JSON.stringify(material.id)).run();
    await reload();
    const body=(model)=>({requestId:crypto.randomUUID(),projectId:project.id,model,messages:[{role:'user',content:'验收请求'}]});
    const call=(input,cookie=customer)=>request('/market/completions',{cookie,body:input});
    const pausedOffer = services.find(row=>row.callId===sources[2].callId);
    await command('pauseSales',{offerKey:sources[2].channelId,expectedUpdatedAt:model().updatedAt,confirmed:true},modelId);
    assert.equal((await order(pausedOffer.id)).status,409);
    await command('startSales',release([sources[2].channelId],[a]),modelId);
    assert.equal((await order(services[0].id,admin)).status,401);
    assert.equal((await order(services[0].id,other)).status,403);
    assert.equal((await call(body(services[0].callId))).data.error.code,'ORDER_REQUIRED');
    const staleQuote=await request('/market/orders',{cookie:customer,body:{tenantId:a,offerIds:[services[0].id],salePriceIds:{[services[0].id]:'old-price'}}});
    assert.equal(staleQuote.data.error.code,'PRICE_CHANGED');
    const successful=[], conversationId=crypto.randomUUID();
    for (const source of sources.slice(0,2)) {
      const offer=services.find(row=>row.callId===source.callId);
      assert.equal(offer.salePrices[0].amount,source.retail[0]*1000000);
      const ordered=await order(offer.id);assert.equal(ordered.status,200,JSON.stringify(ordered.data));
      assert.deepEqual((await order(offer.id)).data,ordered.data);
      const textTurn={conversationId,messageId:crypto.randomUUID(),question:'原型验收问题 '+source.source,images:[],
        temperature:0.7,topP:0.8,deepThinking:false};
      const input={...body(offer.callId),tenantId:a,task:'text',textTurn}, invoked=await call(input);
      assert.equal(invoked.status,200,JSON.stringify(invoked.data));
      assert.equal(invoked.data.source,'mock');
      assert.equal(invoked.data.experience.answer,invoked.data.choices[0].message.content);
      assert.equal(invoked.data.experience.answer,'D1 模拟结果');
      assert.ok(invoked.data.experience.points.length);
      assert.equal((await call({...input,imageCount:2})).status,400);
      assert(!JSON.stringify(invoked.data).includes('procurement'));
      assert.deepEqual((await call(input)).data,invoked.data);
      successful.push({source,input,id:invoked.data.id});
    }
    const history=await request('/market/conversations',{cookie:customer});
    assert.equal(history.status,200);
    assert.equal(history.data.conversations.length,1);
    assert.equal(history.data.conversations[0].id,conversationId);
    assert.deepEqual(history.data.conversations[0].messages.map(row=>row.question),successful.map(row=>row.input.textTurn.question));
    assert(history.data.conversations[0].messages.every(row=>row.answer==='D1 模拟结果'));
    assert.deepEqual((await request('/market/conversations',{cookie:other})).data.conversations,[]);
    assert.equal((await request('/market/conversations')).status,401);
    const application=async()=>(await request('/application',{cookie:admin})).data;
    const apply=async action=>{
      const operationId=crypto.randomUUID(), expectedRevision=(await application()).revision;
      return request('/application/commands',{cookie:admin,key:operationId,body:{operationId,expectedRevision,action}});
    };
    const tenantWrite=async (cookie,tenantId,action,data,operationId=crypto.randomUUID())=>{
      const expectedRevision=(await workspace(cookie)).revision;
      return request('/market/commands',{cookie,body:{operationId,tenantId,expectedRevision,action,data}});
    };
    const routeWorkspace=await workspace(customer);
    const [firstService,backupService]=sources.slice(0,2).map(source=>services.find(service=>service.callId===source.callId));
    const projectRoute={projectId:project.id,name:'客服路由验收',code:'support-contract',
      defaultService:firstService.projectServiceId,fallback:[backupService.projectServiceId],
      rules:[{field:'metadata._user',value:'vip',service:firstService.projectServiceId}]};
    const invalidRule={field:'apikey',value:'foreign-key-id',service:services[0].projectServiceId};
    const foreignKeyRoute=await tenantWrite(customer,a,'projectRoute',{route:{...projectRoute,rules:[invalidRule]}});
    assert.equal(foreignKeyRoute.status,422);
    assert.match(foreignKeyRoute.data.error.message,/当前项目/);
    const projectOperation=crypto.randomUUID();
    const projectBody={operationId:projectOperation,tenantId:a,expectedRevision:routeWorkspace.revision,
      action:'projectRoute',data:{route:projectRoute}};
    const savedRoute=await request('/market/commands',{cookie:customer,body:projectBody});
    assert.equal(savedRoute.status,200,JSON.stringify(savedRoute.data));
    assert.equal((await request('/market/commands',{cookie:customer,body:projectBody})).status,200);
    const savedWorkspace=await workspace(customer);
    assert.deepEqual(savedWorkspace.projectRouting.routes,[{id:'project-route-'+projectOperation,tenantId:a,...projectRoute}]);
    assert.deepEqual(savedWorkspace.routes,routeWorkspace.routes);
    assert.deepEqual((await workspace(other)).projectRouting.routes,[]);
    const routeKey={id:'route-test-key',name:'路由验收 Key',enabled:true,models:null,secretPreview:'sk-demo*****test'};
    assert.equal((await tenantWrite(customer,a,'keys',{projectId:project.id,billing:'按量付费',rows:[routeKey]})).status,200);
    const unpurchased=await apply({type:'simulateInvocation',data:{requestId:crypto.randomUUID(),keyId:routeKey.id,
      modelId:sources[2].callId,purpose:'gateway-test'}});
    assert.equal(unpurchased.data.request.error,'order_required');
    assert.equal(unpurchased.data.request.attempts[0].dispatched,false);
    const routed=await apply({type:'simulateInvocation',data:{requestId:crypto.randomUUID(),keyId:routeKey.id,
      modelId:'project@support-contract',purpose:'gateway-test',forceTimeout:true,metadata:{_user:'vip'}}});
    assert.equal(routed.status,200,JSON.stringify(routed.data));
    assert.equal(routed.data.request.httpStatus,200,JSON.stringify(routed.data.request));
    assert.equal(routed.data.request.callId,backupService.callId);
    assert.deepEqual(routed.data.request.routeMatch,{field:'metadata._user',ruleIndex:0});
    const dispatched=routed.data.request.attempts.filter(attempt=>attempt.dispatched);
    assert.deepEqual(dispatched.map(attempt=>[attempt.serviceId,attempt.error]),[
      [firstService.projectServiceId,'upstream_timeout'],[backupService.projectServiceId,null],
    ]);
    assert(dispatched.every(attempt=>Number.isFinite(Date.parse(attempt.startedAt))));
    assert(!(await workspace(customer)).requests.some(row=>row.requestId===routed.data.request.requestId));
    assert.equal((await tenantWrite(customer,a,'projectRoute',{route:savedWorkspace.projectRouting.routes[0],remove:true})).status,200);
    assert.deepEqual((await workspace(customer)).projectRouting.routes,[]);
    assert.deepEqual((await request('/market/ranking')).data.rows,[],'灰度用量不可公开');
    const usage=(await workspace(customer)).requests;
    const projectUsage=usage.find(row=>row.requestId===successful[0].input.requestId);
    assert.equal(projectUsage.usage.input,8);
    assert.equal(projectUsage.projectId,project.id);
    assert.equal(projectUsage.keyId,'experience:'+project.id);
    assert.equal(projectUsage.requestBody,undefined);
    assert.equal((await workspace(customer)).logKeys.find(row=>row.id===projectUsage.keyId).name,'在线体验');
    assert.equal((await workspace(other)).requests.length,0);
    const beforeBills=await application();
    const fact=beforeBills.requests.find(row=>row.requestId===successful[0].input.requestId);
    assert.equal(fact.userId,a);assert.equal(fact.priceVersionId,services.find(row=>row.callId===fact.publicModelId).salePriceId);
    assert.equal(fact.charge.currency,'CNY');
    const restricted=await request('/application',{cookie:await login('/auth/login','admin-002')});
    assert.equal(restricted.status,200,JSON.stringify(restricted.data.error));
    const diagnostic=restricted.data.requests.find(row=>row.requestId===fact.requestId);
    assert.equal(diagnostic.httpStatus,200);
    assert.deepEqual(diagnostic.usage,fact.usage);
    assert.equal(diagnostic.attempts[0].providerId,fact.attempts[0].procurementSnapshot.providerId);
    for(const data of [diagnostic,...diagnostic.attempts]){
      for(const field of ['charge','priceSnapshot','priceVersionId','procurementSnapshot'])assert(!Object.hasOwn(data,field),field);
    }
    const monthly=tenant=>local.db.prepare('SELECT amount_micros FROM market_monthly_charges WHERE period=? AND tenant_id=?')
      .bind(billingPeriod(),tenant).first('amount_micros');
    const initialMicros=beforeBills.requests.filter(row=>successful.some(item=>item.input.requestId===row.requestId))
      .reduce((sum,row)=>sum+row.charge.amount,0);
    assert(initialMicros>=10000);
    assert.equal(await monthly(a),initialMicros,'replayed calls must not add charges');
    await local.db.batch([
      ...['market_charge_receipts','market_monthly_charges','retired_tenant_keys'].map(table=>local.db.prepare('DROP TABLE '+table)),
      local.db.prepare('DROP TABLE customer_last_login'),
      local.db.prepare('DROP TABLE experience_settings'),

      local.db.prepare('DROP INDEX market_history_owner'),
      local.db.prepare('ALTER TABLE market_calls DROP COLUMN history_user_id'),
      local.db.prepare('ALTER TABLE market_calls DROP COLUMN history_json'),

      local.db.prepare('DROP INDEX market_sessions_user'),
      local.db.prepare('DROP TABLE customer_invitations'),

      local.db.prepare('ALTER TABLE market_sessions DROP COLUMN user_id'),
      ...['customer_credentials','customer_signup_challenges'].map(table=>local.db.prepare('DROP TABLE '+table)),
      local.db.prepare('UPDATE db_state SET schema_version=12 WHERE id=1'),
      local.db.prepare("UPDATE model_workspace SET reference_json=json_insert(reference_json,'$.grants[#]',json(?)) WHERE id=1")
        .bind(JSON.stringify({id:'legacy-orphan',subjectType:'key',subjectId:'legacy-key',status:'生效中'})),
    ]);
    await migrateEmptyDatabase(local.db);
    assert.equal((await request('/market/workspace',{cookie:customer})).status,401);
    customer=await login('/market/login',a);
    other=await login('/market/login',b);
    assert.equal(await monthly(a),initialMicros,'v12 upgrade backfills retained usage');
    assert.equal(await local.db.prepare('SELECT count(*) AS n FROM market_charge_receipts').first('n'),2);
    assert.equal(await local.db.prepare('SELECT id FROM retired_tenant_keys WHERE id=?').bind('legacy-key').first('id'),'legacy-key');
    assert.equal((await apply({type:'generateBills'})).status,200);
    const draft=(await application()).bills.find(row=>row.tenantId===a && row.period===billingPeriod());
    assert.equal(draft.status,'待出账');
    assert.equal(draft.amount,Math.round(initialMicros/10000)/100);
    assert.deepEqual(draft.projectBreakdown,[{projectId:project.id,projectName:project.name,amountMicros:initialMicros}]);
    assert.equal(draft.unassignedMicros,0);

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
    const planSecret='sk-'+randomBytes(16).toString('hex');
    const planDigest=createHash('sha256').update(planSecret).digest('hex');
    const planKey={id:'plan-test-key',name:'套餐验收 Key',enabled:true,models:null,secretPreview:'sk-demo*****plan',
      credentialDigest:planDigest};
    assert.equal((await tenantWrite(customer,a,'keys',{projectId:project.id,billing:'Token Plan',subscriptionId:plan.id,rows:[planKey]})).status,200);
    assert.equal((await workspace(other)).plans.length,0);
    assert.equal((await packageState()).packageOrders[0].id,plan.id);
    const meteringId=crypto.randomUUID();
    const metered=await apply({type:'simulateInvocation',data:{requestId:meteringId,keyId:planKey.id,modelId:sources[0].callId,purpose:'metering-test'}});
    assert.equal(metered.status,200,JSON.stringify(metered.data.error));
    const meter=(await application()).requests.find(row=>row.requestId===meteringId);
    assert.equal(meter.httpStatus,200,JSON.stringify(meter.attempts.map(row=>row.error)));
    assert.equal((await packageState()).packageOrders[0].used,0,'后台诊断不扣减套餐额度');
    assert(!(await workspace(customer)).requests.some(row=>row.requestId===meteringId));
    assert(!JSON.stringify(await workspace(customer)).includes(planDigest));
    assert(!JSON.stringify(await application()).includes(planDigest));
    assert.equal((await tenantWrite(customer,a,'projectRoute',{route:projectRoute})).status,200);
    const planRequestId=crypto.randomUUID();
    const routeInput={requestId:planRequestId,metadata:{_user:'vip'}};
    const paidPlan=await bearer(planSecret,'project@support-contract',routeInput);
    assert.equal(paidPlan.status,200,JSON.stringify(paidPlan.data));
    assert.equal(paidPlan.data.source,'mock');
    assert.equal(paidPlan.data.id,planRequestId);
    assert.equal(paidPlan.data.model,firstService.callId);
    const beforePlanCap=(await packageState()).packageOrders[0].used;
    assert(beforePlanCap>0);
    assert.deepEqual((await bearer(planSecret,'project@support-contract',routeInput)).data,paidPlan.data);
    assert.equal((await packageState()).packageOrders[0].used,beforePlanCap);
    assert.equal(await monthly(a),initialMicros,'套餐抵扣不产生按量账单金额');
    assert.equal((await call({...body(sources[0].callId),requestId:planRequestId})).data.error.code,'REQUEST_ID_CONFLICT');
    const {credentialDigest:_digest,...planEdit}=planKey;
    assert.equal((await tenantWrite(customer,a,'keys',{projectId:project.id,billing:'Token Plan',subscriptionId:plan.id,
      rows:[{...planEdit,planBudgetTokens:beforePlanCap}]})).status,200);
    const capped=await bearer(planSecret,sources[0].callId);
    assert.equal(capped.status,402,JSON.stringify(capped.data));
    assert.equal(capped.data.error.code,'key_budget_exceeded');
    assert.equal((await packageState()).packageOrders[0].used,beforePlanCap);

    let routingSecret;
    {
    const modelKey=firstService.modelKey;
    const routeConfig={models:[modelKey],providers:[],sort:'default',fallbackModel:modelKey};
    for (const [callId,config] of [
      ['moma/auto',{...routeConfig,preventOverrides:true}],
      ['moma/performance',{...routeConfig,sort:'price'}],
      ['moma/cost',{...routeConfig,fallbackModel:''}],
    ]) {
      const result=await tenantWrite(customer,a,'routes',{projectId:project.id,kind:'auto',action:'publish',callId,config});
      assert.equal(result.status,200,JSON.stringify(result.data));
    }
    const routeRecords=(await workspace(customer)).routes;
    assert.equal(routeRecords.find(row=>row.callId==='moma/auto').versions[0].config.preventOverrides,true);
    assert.equal(routeRecords.find(row=>row.callId==='moma/performance').versions[0].config.sort,'price');
    assert.equal(routeRecords.find(row=>row.callId==='moma/cost').versions[0].config.fallbackModel,'');
    const presetCallId='@preset/routing-contract';
    const preset=await tenantWrite(customer,a,'routes',{projectId:project.id,kind:'preset',action:'publish',name:'routing-contract',
      config:{...routeConfig,sort:'price',label:'路由验收',description:'',systemPrompt:'仅使用验收资料',parameters:{temperature:0}}});
    assert.equal(preset.status,200,JSON.stringify(preset.data));
    routingSecret='sk-'+randomBytes(16).toString('hex');
    const routingKey={...routeKey,id:'smart-route-contract-key',credentialDigest:createHash('sha256').update(routingSecret).digest('hex')};
    const keysSaved=await tenantWrite(customer,a,'keys',{projectId:project.id,billing:'按量付费',rows:[routeKey,routingKey]});
    assert.equal(keysSaved.status,200,JSON.stringify(keysSaved.data));
    for (const callId of ['moma/auto','moma/performance','moma/cost',presetCallId]) {
      const result=await bearer(routingSecret,callId);
      assert.equal(result.status,200,JSON.stringify(result.data));
      assert.equal(result.data.model,backupService.callId);
    }
    const split=await tenantWrite(customer,a,'projectCreate',{name:'智能路由隔离项目'});
    assert.equal(split.status,200,JSON.stringify(split.data));
    const splitId='project-'+split.data.operationId;
    assert.equal((await tenantWrite(customer,a,'projectUpdate',{projectId:splitId,type:'models',input:[{modelId,rpm:null,tpm:null}]})).status,200);
    const splitSecret='sk-'+randomBytes(16).toString('hex');
    const splitKey={...routingKey,id:'split-routing-key',credentialDigest:createHash('sha256').update(splitSecret).digest('hex')};
    assert.equal((await tenantWrite(customer,a,'keys',{projectId:splitId,billing:'按量付费',rows:[splitKey]})).status,200);
    assert.equal((await bearer(splitSecret,'moma/auto')).data.error.code,'tenant_route_forbidden');
    assert.equal((await bearer(splitSecret,presetCallId)).data.error.code,'tenant_route_forbidden');
    const original=routeRecords.find(row=>row.callId==='moma/auto');
    assert.equal((await tenantWrite(customer,a,'routes',{projectId:splitId,id:original.id,kind:'auto',action:'stop',callId:'moma/auto'})).status,422);
    assert.equal((await tenantWrite(customer,a,'routes',{projectId:splitId,kind:'auto',action:'publish',callId:'moma/auto',config:{...routeConfig,sort:'price'}})).status,200);
    assert.equal((await bearer(splitSecret,'moma/auto')).status,200);
    assert.equal((await tenantWrite(customer,a,'routes',{projectId:splitId,kind:'preset',action:'publish',name:'routing-contract',
      config:{...routeConfig,description:'隔离项目',systemPrompt:'不同提示词',parameters:{}}})).status,200);
    const grouped=(await workspace(customer)).routes.filter(row=>row.callId===presetCallId);
    assert.equal(grouped.length,2);
    assert.deepEqual(new Set(grouped.map(row=>row.projectId)),new Set([project.id,splitId]));
    assert.equal(new Set(grouped.map(row=>row.id)).size,2);
    const splitCallId=crypto.randomUUID();
    const splitCall=await bearer(splitSecret,presetCallId,{requestId:splitCallId});
    assert.equal(splitCall.status,200,JSON.stringify(splitCall.data));
    assert.equal((await bearer(routingSecret,presetCallId,{requestId:splitCallId})).status,409);
    const splitWeb=await call({...body(presetCallId),projectId:splitId,task:'text'});
    assert.equal(splitWeb.status,200,JSON.stringify(splitWeb.data));
    successful.push({source:sources.find(row=>row.callId===splitWeb.data.model),id:splitWeb.data.id});
    const apiFact=(await application()).requests.find(row=>row.requestId===splitCallId);
    assert.equal(apiFact.projectId,splitId);
    assert.equal(apiFact.tenantRouteId,grouped.find(row=>row.projectId===splitId).id);
    assert.equal((await workspace(customer)).routes.find(row=>row.id===original.id).projectId,project.id);
    assert.equal((await tenantWrite(customer,a,'routes',{projectId:splitId,id:original.id,kind:'auto',action:'publish',callId:'moma/auto',config:routeConfig})).status,422);
    const lockedRoute=await bearer(routingSecret,'moma/auto',{routing:{cost_tier:'low'}});
    assert.equal(lockedRoute.status,200,JSON.stringify(lockedRoute.data));
    assert.equal(lockedRoute.data.model,backupService.callId);
    assert.equal((await bearer(routingSecret,'moma/cost',{routing:{cost_tier:'high'}})).status,400);
    const routeConversation={...body(presetCallId),tenantId:a,task:'text',textTurn:{
      conversationId:crypto.randomUUID(),messageId:crypto.randomUUID(),question:'试用路由',images:[],
      temperature:0.7,topP:0.8,deepThinking:false,
    }};
    const tried=await call(routeConversation);
    assert.equal(tried.status,200,JSON.stringify(tried.data));
    assert.equal(tried.data.model,backupService.callId);
    assert.deepEqual(tried.data.routing,{id:presetCallId,version:1,modelName:'GLM-5.3',provider:backupService.provider});
    assert.deepEqual((await call(routeConversation)).data,tried.data);
    const replayedHistory=(await request('/market/conversations',{cookie:customer})).data.conversations
      .find(row=>row.id===routeConversation.textTurn.conversationId);
    assert.equal(replayedHistory.serviceId,presetCallId);
    assert.deepEqual(replayedHistory.messages[0].routing,tried.data.routing);
    assert.equal((await call({...body(presetCallId),task:'text',images:true})).status,400);
    const foreignProject=(await workspace(other)).projects.find(row=>row.status==='正常');
    assert.equal((await call({...body(presetCallId),task:'text',projectId:foreignProject.id})).status,403);
    }

    // Verify that the third offer is callable before withdrawal, while leaving a fresh A order for afterwards.
    await command('startSales',release([keys[0],keys[2]],[a,b]),modelId);
    const channelState = (channel, enabled) => command('serviceProviderServing',
      {providerId:channel.channelId,enabled,expectedUpdatedAt:model().updatedAt},modelId);
    await channelState(sources[0], false);
    assert.equal(model().serviceProviders.find(row=>row.channelId===sources[0].channelId).listingStage,'gray');
    assert.deepEqual(serviceDirectoryRows([model()],state,'stopped').map(row=>row.callId),[sources[0].callId]);
    assert.deepEqual(new Set(serviceDirectoryRows([model()],state,'started').map(row=>row.callId)),new Set(sources.slice(1).map(row=>row.callId)));
    const rejectedWhileStopped = await call(body(sources[0].callId));
    assert.equal(rejectedWhileStopped.status,409);
    assert.equal(rejectedWhileStopped.data.error.message,'模型服务已停止');
    const apiStopped=await bearer(routingSecret,sources[0].callId);
    assert.equal(apiStopped.status,403,JSON.stringify(apiStopped.data));
    assert.equal(apiStopped.data.error.code,'provider_unavailable');
    assert.equal((await bearer(routingSecret,sources[1].callId)).status,200);
    const serviceDetail=await request('/services/'+encodeURIComponent(modelId)+'/workspace',{cookie:admin});
    assert.equal(serviceDetail.status,200,JSON.stringify(serviceDetail.data));
    assert.equal(serviceDetail.data.service.callsEnabled,true);
    assert.equal(serviceDetail.data.offers.find(row=>row.id===sources[0].callId).calls_enabled,0);
    assert.equal(serviceDetail.data.offers.find(row=>row.id===sources[1].callId).calls_enabled,1);
    const sibling = await call(body(sources[1].callId));
    assert.equal(sibling.status,200,JSON.stringify(sibling.data));
    successful.push({source:sources[1],id:sibling.data.id});
    await channelState(sources[0], true);
    assert.deepEqual(serviceDirectoryRows([model()],state,'stopped'),[]);
    const restarted = await call(body(sources[0].callId));
    assert.equal(restarted.status,200,JSON.stringify(restarted.data));
    assert.equal((await bearer(routingSecret,sources[0].callId)).status,200);
    successful.push({source:sources[0],id:restarted.data.id});
    const source=sources[0], expiringOffer=services.find(row=>row.callId===source.callId);
    const third=services.find(row=>row.callId===sources[2].callId);
    assert((await catalogue(other)).find(row=>row.id===expiringOffer.id)?.canOrder);
    const { providerId, endpointId, channelId: associationId }=source;
    const channel=owner(providerId).catalogConnections.find(row=>row.id===associationId);
    const start=Date.now(), expires=start+2000;
    await command('channelProcurementPublish',{providerId,endpointId,associationId,expectedPriceRevision:channel.procurementRevision,confirmed:true,
      effectiveAt:new Date(start).toISOString(),expiresAt:new Date(expires).toISOString(),scenarios:prices(1,4,'listPrice')});
    const seq=state.commitSeq;
    await new Promise(resolve=>setTimeout(resolve,Math.max(0,expires-Date.now()+10)));
    assert.deepEqual((await catalogue(other)).map(row=>row.callId),[third.callId]);
    assert.deepEqual(new Set((await catalogue(customer)).map(row=>row.callId)),new Set([sources[1].callId,third.callId]));
    assert.equal(salesStatus(state,model(),keys[0]),'不可销售');
    const rejected=await request('/market/orders',{cookie:other,body:{offerIds:[expiringOffer.id,third.id]}});
    assert.equal(rejected.status,409);
    assert.equal(rejected.data.error.code,'MODEL_UNAVAILABLE');
    assert.equal(await local.db.prepare('SELECT COUNT(*) AS n FROM market_orders WHERE tenant_id=?').bind(b).first('n'),0);
    const expiredInput=body(expiringOffer.callId);
    assert.equal((await call(expiredInput)).data.error.code,'CALL_UNAVAILABLE');
    assert.equal(await local.db.prepare('SELECT commit_seq FROM db_state WHERE id=1').first('commit_seq'),seq+1);
    assert.equal((await workspace(customer)).requests.find(row=>row.requestId===expiredInput.requestId).error,'CALL_UNAVAILABLE');
    assert.equal((await call(expiredInput)).data.error.code,'CALL_UNAVAILABLE');
    assert.equal(await local.db.prepare('SELECT commit_seq FROM db_state WHERE id=1').first('commit_seq'),seq+1);
    assert.equal((await order(third.id,other)).status,200);
    const otherProject=(await workspace(other)).projects.find(row=>row.status==='正常');
    const before=await call({...body(third.callId),projectId:otherProject.id},other);assert.equal(before.status,200,JSON.stringify(before.data));
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
    const afterInput=body(third.callId);
    const after=await call(afterInput);assert.equal(after.status,200,JSON.stringify(after.data));
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
    assert.equal(await local.db.prepare('SELECT COUNT(*) AS n FROM market_calls').first('n'),8);
    const activeOrder=(await request('/market/catalogue',{cookie:customer})).data.orders.find(row=>row.offerId===third.id);
    assert.equal((await apply({type:'cancelMarketOrder',id:activeOrder.id})).status,200);
    assert.equal((await call(body(third.callId))).data.error.code,'ORDER_REQUIRED');
    const reordered=await order(third.id);
    assert.equal(reordered.status,200);assert.notEqual(reordered.data.orders[0].id,activeOrder.id);
    const expiring=successful.at(-1);
    await local.db.prepare('UPDATE market_calls SET created_at=? WHERE usage_id=?').bind(Date.now()-8*86400000,expiring.id).run();
    const beforeExpiry=await monthly(a);
    assert(beforeExpiry>initialMicros);
    const denied=await call({...body(third.callId),simulateDenied:true});
    assert.equal(denied.data.httpStatus,403);
    assert.equal(denied.data.invocationError.code,'Model.AccessDenied');
    assert.equal(denied.data.experience,null);
    assert.equal(await local.db.prepare("SELECT id FROM simulation_records WHERE kind='usage' AND id=?").bind(expiring.id).first(),null);
    assert.equal((await call(afterInput)).data.error.code,'CALL_RECEIPT_EXPIRED');
    assert.equal(await monthly(a),beforeExpiry,'expired details and denied calls do not change the total');
    assert.equal((await apply({type:'generateBills'})).status,200);
    const updated=(await application()).bills.find(row=>row.id===draft.id);
    assert.equal(updated.billNo,draft.billNo);
    assert.equal(updated.amount,Math.round(beforeExpiry/10000)/100);
    assert(updated.amount>draft.amount);
    assert.equal((await apply({type:'update',collection:'bills',id:draft.id,changes:{status:'已出账'}})).status,200);
    await reload();
    await command('startSales',{...release([keys[2]],[]),releaseStage:'formal'},modelId);
    assert.deepEqual((await request('/market/ranking')).data.rows,[],'转为正式上架也不公开历史灰度用量');
    assert.equal((await call(body(third.callId))).status,200);
    assert.equal((await apply({type:'generateBills'})).status,200);
    const issued=(await application()).bills.filter(row=>row.tenantId===a && row.period===billingPeriod());
    assert.deepEqual(issued.map(row=>[row.id,row.amount,row.status]),[[draft.id,updated.amount,'已出账']]);
    const ranking=await request('/market/ranking');
    assert.equal(ranking.status,200);
    assert.ok(ranking.data.rows.some(row=>row.id===material.id && row.tokens>=10));
    assert(!Object.hasOwn(ranking.data.rows[0],'tenantId'));
    assert.deepEqual((await catalogue()).map(row=>row.callId),[third.callId]);
    await command('marketVisibility',{visible:false,expectedUpdatedAt:model().updatedAt},modelId);
    assert.deepEqual(await catalogue(),[]);
    assert.equal((await call(body(third.callId))).status,200,'display visibility does not revoke a paid order');
    await command('marketVisibility',{visible:true,expectedUpdatedAt:model().updatedAt},modelId);
    assert.deepEqual((await catalogue()).map(row=>row.callId),[third.callId]);
    const visibility=enabled=>command('serviceProviderListing',{providerId:keys[2],enabled,expectedUpdatedAt:model().updatedAt},modelId);
    await visibility(false);
    assert.deepEqual(await catalogue(),[]);
    assert.equal((await call(body(third.callId))).status,200,'hiding one channel does not revoke a paid order');
    await visibility(true);
    assert.deepEqual((await catalogue()).map(row=>row.callId),[third.callId]);

    const created=await tenantWrite(customer,a,'projectCreate',{name:'项目策略验收'});
    assert.equal(created.status,200,JSON.stringify(created.data));
    const projectId='project-'+created.data.operationId;
    const invoke=(overrides={},cookie=customer)=>call({...body(third.callId),projectId,...overrides},cookie);
    const configure=(type,input)=>tenantWrite(customer,a,'projectUpdate',{projectId,type,input});
    assert.equal((await invoke()).data.error.code,'project_model_not_enabled');
    assert.equal((await invoke({},other)).data.error.code,'project_unavailable');
    assert.equal((await configure('models',[{modelId:'foreign-model',rpm:1,tpm:null}])).status,422);
    assert.equal((await configure('models',[{modelId,rpm:1,tpm:99999}])).status,200);
    const sharedCodeRoute={name:projectRoute.name,code:projectRoute.code,defaultService:third.projectServiceId,rules:[],fallback:[]};
    assert.equal((await tenantWrite(customer,a,'projectRoute',{route:{...sharedCodeRoute,projectId}})).status,200);
    assert.equal((await tenantWrite(other,b,'projectRoute',{route:{...sharedCodeRoute,projectId:otherProject.id}})).status,200);
    assert.equal((await tenantWrite(customer,a,'projectRoute',{route:{...sharedCodeRoute,projectId}})).status,422);
    const settings={name:'项目策略验收',amount:'',warnAt:80,stop:false,retainContent:true};
    assert.equal((await configure('settings',settings)).status,200);
    const requestId=crypto.randomUUID();
    const message='项目验收 sk-should-never-be-retained';
    const called=await invoke({requestId,messages:[{role:'user',content:message}]});
    assert.equal(called.status,200,JSON.stringify(called.data));
    assert.equal((await invoke()).data.error.code,'project_model_rate_limit_exceeded');
    assert.equal((await invoke({requestId,messages:[{role:'user',content:message}]})).data.id,called.data.id);
    const afterProjectCall=await workspace(customer);
    const stored=afterProjectCall.requests.find(row=>row.requestId===requestId);
    assert.match(stored.requestBody,/已脱敏/);
    assert(!stored.requestBody.includes('sk-should'));
    assert(stored.responseBody);
    const charge=afterProjectCall.report.records.find(row=>row.requestId===requestId).charge;
    assert(charge.micros>0);
    assert.equal((await configure('models',[{modelId,rpm:null,tpm:1}])).status,200);
    assert.equal((await invoke()).data.error.code,'project_model_rate_limit_exceeded');
    assert.equal((await configure('models',[{modelId,rpm:null,tpm:null}])).status,200);
    assert.equal((await configure('settings',{...settings,amount:String(charge.micros/1_000_000),stop:true,retainContent:false})).status,200);
    const blockedId=crypto.randomUUID();
    const overBudget=await invoke({requestId:blockedId});
    assert.equal(overBudget.status,402);
    assert.equal(overBudget.data.error.code,'project_budget_exceeded');
    const budgetFact=(await application()).requests.find(row=>row.requestId===blockedId);
    assert.equal(budgetFact.projectId,projectId);
    assert.deepEqual(budgetFact.attempts.map(row=>[row.dispatched,row.error]),[[false,'project_budget_exceeded']]);
    assert(Number.isFinite(Date.parse(budgetFact.attempts[0].startedAt)));
    assert.equal((await configure('settings',{...settings,retainContent:false})).status,200);
    const manual={ id:'project-policy-key',name:'项目策略 Key',enabled:true,models:null,budgetMicros:1,secretPreview:'sk-demo*****abcd' };
    const saveKeys=rows=>tenantWrite(customer,a,'keys',{projectId,billing:'按量付费',rows});
    assert.equal((await saveKeys([manual])).status,200);
    const apiInvoke=async()=>{
      const requestId=crypto.randomUUID();
      const result=await apply({type:'simulateInvocation',data:{requestId,keyId:manual.id,modelId:third.callId,purpose:'gateway-test'}});
      assert.equal(result.status,200,JSON.stringify(result.data));
      return (await application()).requests.find(row=>row.requestId===requestId);
    };
    assert.equal((await apiInvoke()).error,'key_budget_exceeded');
    assert.equal((await saveKeys([{...manual,expiresAt:new Date(Date.now()-1000).toISOString()}])).status,200);
    assert.equal((await apiInvoke()).error,'key_expired');
    assert.equal((await saveKeys([])).status,200);
    const finalScope=await workspace(customer);
    assert(!finalScope.keys.some(row=>row.id===manual.id));
    assert(finalScope.logKeys.some(row=>row.id===manual.id));
    assert(finalScope.projectAudits.some(row=>row.objectId===manual.id && row.action==='删除 API Key'));
    const grants=limit=>apply({type:'enterprise',operation:'configure-grant',tenantId:a,
      ids:{grant:crypto.randomUUID(),ledger:crypto.randomUUID()},data:{limit,modelIds:[modelId],reason:'共享额度验收'}});
    const used=async()=>(await application()).grants.find(row=>row.subjectType==='tenant' && row.subjectId===a).used;
    const granted=await grants(10000);
    assert.equal(granted.status,200,JSON.stringify(granted.data));
    assert.equal((await invoke()).status,200);
    const webUsed=await used();
    assert(webUsed>0);
    const raw='sk-'+randomBytes(16).toString('hex');
    const paygKey={...manual,id:'paid-project-key',budgetMicros:null,credentialDigest:createHash('sha256').update(raw).digest('hex')};
    assert.equal((await saveKeys([paygKey])).status,200);
    const paidId=crypto.randomUUID(), beforePaid=await monthly(a);
    const [paid,replayed]=await Promise.all([bearer(raw,third.callId,{requestId:paidId}),bearer(raw,third.callId,{requestId:paidId})]);
    assert.equal(paid.status,200,JSON.stringify(paid.data));
    assert.deepEqual(replayed.data,paid.data);
    const paidFact=(await workspace(customer)).requests.find(row=>row.requestId===paidId);
    assert.equal(paidFact.publicModelId,third.callId);
    assert.equal(paidFact.projectId,projectId);
    const paidRecord=(await workspace(customer)).report.records.find(row=>row.requestId===paidId);
    assert.equal(await monthly(a),beforePaid+paidRecord.charge.micros);
    assert.equal(await used(),webUsed+paid.data.usage.total_tokens);
    assert.equal((await call({...body(third.callId),projectId:otherProject.id,requestId:paidId},other)).status,200);
    const otherMonthly=await monthly(b);
    const historicalMicros=123456;
    await local.db.prepare('UPDATE market_monthly_charges SET amount_micros=amount_micros+? WHERE period=? AND tenant_id=?')
      .bind(historicalMicros,billingPeriod(),b).run();
    assert.equal((await apply({type:'generateBills'})).status,200);
    const otherBill=(await application()).bills.find(row=>row.tenantId===b && row.period===billingPeriod());
    assert.equal(otherBill.unassignedMicros,historicalMicros);
    assert.deepEqual(otherBill.projectBreakdown,[{projectId:otherProject.id,projectName:otherProject.name,amountMicros:otherMonthly}]);
    const baseConfig={models:[third.modelKey],providers:[],sort:'default',parameters:{},fallbackModel:''};
    const autoRoute={projectId,action:'publish',kind:'auto',callId:'moma/auto',config:baseConfig};
    assert.equal((await tenantWrite(other,b,'routes',{...autoRoute,config:{...baseConfig,models:['unavailable-model']}})).status,422);
    const automatic=await tenantWrite(customer,a,'routes',autoRoute);
    assert.equal(automatic.status,200,JSON.stringify(automatic.data));
    assert.equal((await bearer(raw,'moma/auto')).data.model,third.callId);
    const presetConfig={...baseConfig,providers:[third.providerId],sort:'manual',description:'客服预设',systemPrompt:'你是一名客服助理。',
      parameters:{temperature:0.4,top_p:0.8,max_tokens:128}};
    const createdPreset=await tenantWrite(customer,a,'routes',{projectId,action:'publish',kind:'preset',name:'support-preset',config:presetConfig});
    assert.equal(createdPreset.status,200,JSON.stringify(createdPreset.data));
    const preset=(await workspace(customer)).routes.find(row=>row.callId==='@preset/support-preset');
    assert.deepEqual(preset.versions[0].config.parameters,presetConfig.parameters);
    assert.equal((await workspace(other)).routes.some(row=>row.id===preset.id),false);
    const presetOperation={projectId,kind:'preset',id:preset.id,callId:preset.callId};
    assert.equal((await tenantWrite(other,b,'routes',{...presetOperation,action:'stop'})).status,422);
    assert.equal((await tenantWrite(customer,a,'routes',{...presetOperation,action:'publish',config:{...presetConfig,description:'更新描述'}})).status,200);
    assert.equal((await tenantWrite(customer,a,'routes',{...presetOperation,action:'switch',version:1})).status,200);
    const rolled=(await workspace(customer)).routes.find(row=>row.id===preset.id);
    assert.equal(rolled.activeVersion,1);
    assert.equal(rolled.versions.length,2);
    const presetRequest={requestId:crypto.randomUUID()};
    const completed=await bearer(raw,preset.callId,presetRequest);
    assert.equal(completed.status,200,JSON.stringify(completed.data));
    assert.equal(completed.data.model,third.callId);
    assert.deepEqual((await bearer(raw,preset.callId,presetRequest)).data,completed.data);
    assert.equal((await tenantWrite(customer,a,'routes',{...presetOperation,action:'stop'})).status,200);
    assert.equal((await bearer(raw,preset.callId)).data.error.code,'tenant_route_forbidden');
    const beforeQuota=await monthly(a);
    assert.equal((await grants(await used())).status,200);
    assert.equal((await invoke()).data.error.code,'enterprise_quota_exhausted');
    assert.equal((await bearer(raw,third.callId)).data.error.code,'enterprise_quota_exhausted');
    assert.equal(await monthly(a),beforeQuota);

    const tenantSettings = (operation,data)=>apply({type:'tenantServiceSettings',tenantId:a,operation,
      ids:{grant:crypto.randomUUID(),ledger:crypto.randomUUID()},data});
    assert.equal((await tenantSettings('level',{level:'L6'})).status,422);
    assert.equal((await tenantSettings('level',{level:'L5'})).status,200);
    assert.equal((await application()).tenants.find(row=>row.id===a).serviceLevel,'L5');
    const alreadyUsed = await used();
    const expiry = new Date(Date.now()+86_400_000).toISOString();
    assert.equal((await tenantSettings('quota',{enabled:true,limit:1,expiresAt:expiry,reason:'不得低于已用'})).status,422);
    const enabled = await tenantSettings('quota',{enabled:true,limit:alreadyUsed+10000,expiresAt:expiry,reason:'启用租户预付额度'});
    assert.equal(enabled.status,200,JSON.stringify(enabled.data));
    assert.equal(await used(),alreadyUsed);
    assert.equal((await invoke()).status,200);
    const quotaMetered = await bearer(raw,third.callId);
    assert.equal(quotaMetered.status,200,JSON.stringify(quotaMetered.data));
    assert(await used()>=alreadyUsed+quotaMetered.data.usage.total_tokens);
    const ref = JSON.parse(await local.db.prepare('SELECT reference_json FROM model_workspace WHERE id=1').first('reference_json'));
    ref.grants.find(row=>row.subjectType==='tenant' && row.subjectId===a).expiresAt=new Date(Date.now()-1000).toISOString();
    await local.db.prepare('UPDATE model_workspace SET reference_json=? WHERE id=1').bind(JSON.stringify(ref)).run();
    assert.equal((await invoke()).data.error.code,'tenant_quota_expired');
    assert.equal((await bearer(raw,third.callId)).data.error.code,'tenant_quota_expired');
    const usedBeforeDisable = await used();
    assert.equal((await tenantSettings('quota',{enabled:false,reason:'停用预付费配额'})).status,200);
    assert.equal((await invoke()).status,200);
    assert.equal(await used(),usedBeforeDisable);
    assert.equal((await tenantSettings('open-models',{modelIds:[modelId]})).status,422,'already open');
    assert.equal((await tenantSettings('model-limits',{modelId,rpm:0,tpm:null})).status,422);
    assert.equal((await tenantSettings('model-limits',{modelId,rpm:1,tpm:null})).status,200);
    assert.equal((await invoke()).data.error.code,'tenant_model_rate_limit_exceeded');
    assert.equal((await bearer(raw,third.callId)).data.error.code,'tenant_model_rate_limit_exceeded');
    assert.equal((await tenantSettings('model-limits',{modelId,rpm:null,tpm:1})).status,200);
    assert.equal((await invoke()).data.error.code,'tenant_model_rate_limit_exceeded');
    assert.equal((await bearer(raw,third.callId)).data.error.code,'tenant_model_rate_limit_exceeded');
    assert.equal((await tenantSettings('remove-model',{modelId})).status,200);
    assert.equal((await invoke()).status,403);
    assert.equal((await bearer(raw,third.callId)).status,403);
    assert.equal((await tenantSettings('model-limits',{modelId,rpm:null,tpm:null})).status,422);
    assert.equal((await tenantSettings('open-models',{modelIds:[modelId,'missing-model']})).status,422);
    assert.deepEqual((await application()).tenants.find(row=>row.id===a).modelRules,[]);
    assert.equal((await tenantSettings('open-models',{modelIds:[modelId]})).status,200);
    assert.deepEqual((await application()).tenants.find(row=>row.id===a).modelRules,[{modelId,rpm:null,tpm:null}]);
    assert.equal((await bearer(raw,third.callId)).status,200);
    assert.equal((await invoke()).status,200);
    assert.equal((await configure('status',{status:'停用'})).status,200);
    assert.equal((await invoke()).data.error.code,'project_unavailable');
    assert.equal((await configure('status',{status:'已删除'})).status,200);
    assert((await workspace(customer)).requests.some(row=>row.requestId===requestId));
    const policy=(body,cookie=admin)=>request('/project-space-policy',{cookie,body});
    const factory={expectedRevision:0,personalEnabled:true,operatingMode:'factory',internalTenantId:a};
    assert.equal((await policy(factory,other)).status,401);
    assert.equal((await policy({...factory,internalTenantId:b})).status,422);
    assert.equal((await policy(factory)).status,200);
    assert.equal((await policy(factory)).status,409);
    const internalData=(await request('/market/catalogue',{cookie:customer})).data;
    const internalOffer=internalData.services.find(row=>row.callId===third.callId);
    assert.equal(internalData.tenant.internal,true);
    assert(internalOffer.callable && !internalOffer.canOrder && !internalOffer.ordered);
    assert.deepEqual(internalOffer.salePrices,[]);
    assert.deepEqual(internalData.orders,[]);
    assert.equal((await order(third.id)).data.error.code,'INTERNAL_SPACE');
    await apply({type:'cancelMarketOrder',id:(await application()).orders.find(row=>row.tenantId===a && row.serviceId===third.id && row.status==='生效中').id});
    await grants(1000000);
    const organizationId=(await application()).organizations.find(row=>row.tenantId===a && !row.parentId).id;
    const internalProject=await tenantWrite(customer,a,'projectCreate',{name:'内用成本验收',departmentId:organizationId});
    assert.equal(internalProject.status,200,JSON.stringify(internalProject.data));
    const internalProjectId='project-'+internalProject.data.operationId;
    assert.equal((await tenantWrite(customer,a,'projectUpdate',{projectId:internalProjectId,type:'models',input:[{modelId,rpm:null,tpm:null}]})).status,200);
    const inner=await tenantWrite(customer,a,'keys',{projectId:internalProjectId,billing:'按量付费',rows:[
      {id:'internal-cost-key',name:'内用验收 Key',enabled:true,models:null,secretPreview:'sk-test*****qaaa',
        credentialDigest:createHash('sha256').update('sk-'+ 'a'.repeat(32)).digest('hex')},
    ]});
    assert.equal(inner.status,200,JSON.stringify(inner.data));
    const webId=crypto.randomUUID(), apiId=crypto.randomUUID(), spendBefore=await monthly(a);
    const internalRequest={...body(third.callId),requestId:webId,projectId:internalProjectId,tenantId:a};
    assert.equal((await call(internalRequest)).status,200,'enterprise access does not depend on an order');
    assert.equal((await bearer('sk-'+'a'.repeat(32),third.callId,{requestId:apiId})).status,200);
    const adminFacts=(await application()).requests;
    const workspaceInternal=await workspace(customer);
    for(const id of [webId,apiId]){
      const cost=adminFacts.find(row=>row.requestId===id);
      assert.equal(cost.tenantId,a);
      assert.equal(cost.projectId,internalProjectId);
      assert.equal(cost.departmentId,organizationId);
      assert.equal(cost.settlement,'internal');
      assert(cost.internalCost?.micros>0);
      const report=workspaceInternal.report.records.find(row=>row.requestId===id);
      assert.deepEqual(report.charge,cost.internalCost);
      assert(!report.billPeriod);
      assert(!Object.hasOwn(report,'procurementSnapshot'));
      assert(!(await workspace(other)).requests.some(row=>row.requestId===id));
    }
    assert.deepEqual(workspaceInternal.report.bills,[]);
    assert.equal(await monthly(a),spendBefore);
    const lifecycleEndpoint='/model-services-new';
    const lifecycleId=resourceId('model-service');
    const lifecycleRow={id:lifecycleId,name:third.name,callId:third.callId,modelId:material.id,
      type:'text',listed:true,channels:[],createdAt:new Date().toISOString(),createdBy:'测试管理员'};
    await local.db.prepare('INSERT INTO new_model_services (id,call_id,revision,record_json,created_at,imported) VALUES (?,?,1,?,?,0)')
      .bind(lifecycleId,third.callId,JSON.stringify(lifecycleRow),Date.now()).run();
    const inspectLifecycle=async()=>(await request(lifecycleEndpoint+'?inspect='+lifecycleId,{cookie:admin})).data;
    const updateLifecycle=(action,revision,row)=>{
      const operationId=resourceId('operation');
      return request(lifecycleEndpoint,{cookie:admin,key:operationId,body:{action,id:lifecycleId,revision,row,operationId}});
    };
    const metaBefore=await local.db.prepare('SELECT meta_json FROM model_workspace WHERE id=1').first('meta_json');
    const setTestCard=async card=>{
      const meta=JSON.parse(metaBefore);
      meta.modelData.marketCards={...meta.modelData.marketCards,[material.id]:card};
      await local.db.prepare('UPDATE model_workspace SET meta_json=? WHERE id=1').bind(JSON.stringify(meta)).run();
    };
    const testCard={linked:[third.id],shown:[third.id],scope:{type:'all'},status:'listed'};
    const projectChoicesBefore=(await workspace(customer)).projectServices.map(row=>row.id);
    assert(projectChoicesBefore.includes(third.id));
    await setTestCard(testCard);
    assert.deepEqual(await inspectLifecycle(),{revision:1,marketLinked:true,marketListed:true,
      stopIssue:'请先在模型广场下架关联模型',deleteIssue:'请先停止模型服务'});
    assert.match((await updateLifecycle('save',1,{...lifecycleRow,listed:false})).data.error.message,/下架/);
    await setTestCard({...testCard,status:'withdrawn'});
    const stopped = await updateLifecycle('save',1,{...lifecycleRow,listed:false});
    assert.equal(stopped.status,200,JSON.stringify(stopped.data));
    assert.equal((await inspectLifecycle()).deleteIssue,'请先解除模型广场关联');
    assert.equal((await updateLifecycle('delete',2)).status,400);
    await reload();
    assert.deepEqual(state.stoppedModelOfferIds,[third.id]);
    assert(!(await catalogue(customer)).some(row=>row.id===third.id));
    assert.deepEqual((await workspace(customer)).projectServices.map(row=>row.id),projectChoicesBefore.filter(id=>id!==third.id));
    assert.equal((await call({...internalRequest,requestId:crypto.randomUUID()})).data.error.code,'MODEL_UNAVAILABLE');
    assert.equal((await bearer('sk-'+'a'.repeat(32),third.callId)).data.error.code,'model_unavailable');
    const lifecycleSource=mappingCandidates(state,{modelId:material.id}).find(row=>!row.reason);
    assert(lifecycleSource);
    const reenabled=await updateLifecycle('save',2,{...stopped.data.row,listed:true,channels:[{
      id:resourceId('service-channel'),channelId:lifecycleSource.id,fingerprint:channelFingerprint(lifecycleSource),enabled:true,priority:0,weight:100,
    }]});
    assert.equal(reenabled.status,200,JSON.stringify(reenabled.data));
    assert((await workspace(customer)).projectServices.some(row=>row.id===third.id));
    assert.equal((await updateLifecycle('save',3,{...reenabled.data.row,listed:false})).status,200);
    await setTestCard({...testCard,status:'withdrawn',linked:[],shown:[]});
    assert.equal((await inspectLifecycle()).deleteIssue,'');
    assert.equal((await updateLifecycle('delete',4)).status,200);
    await reload();
    assert.deepEqual(state.stoppedModelOfferIds,[third.id]);
    await local.db.batch([
      local.db.prepare('DELETE FROM new_model_services WHERE id=?').bind(lifecycleId),
      local.db.prepare('UPDATE model_workspace SET meta_json=? WHERE id=1').bind(metaBefore),
    ]);
    await reload();
    assert.equal((await tenantWrite(customer,a,'projectUpdate',{projectId:internalProjectId,type:'tokenBudget',
      input:{limit:'0.000001',period:'total'}})).status,200);
    const rejectedExperience=await call({...internalRequest,requestId:crypto.randomUUID()});
    const rejectedAPI=await bearer('sk-'+'a'.repeat(32),third.callId);
    for (const rejected of [rejectedExperience,rejectedAPI]) {
      assert.equal(rejected.status,402);
      assert.equal(rejected.data.error.code,'project_token_budget_exceeded');
    }
    assert.equal((await workspace(customer)).projectBudgets[internalProjectId].tokens,
      [webId,apiId].map(id=>workspaceInternal.report.records.find(row=>row.requestId===id).usage)
        .reduce((total,usage)=>total + (usage.input ?? 0) + (usage.output ?? 0),0));
    const extReport=(await workspace(other)).report;
    assert.equal(extReport.records.find(row=>row.requestId===paidId).billPeriod,billingPeriod());
    assert.equal(extReport.bills.find(row=>row.period===billingPeriod()).projectBreakdown[0].amountMicros,otherMonthly);
    assert.equal((await policy({...factory,expectedRevision:1,operatingMode:'internal'})).status,200);
    assert.equal((await request('/market/workspace',{cookie:other})).status,401);
    assert.equal((await call({...internalRequest,requestId:crypto.randomUUID(),projectId:otherProject.id})).data.error.code,'project_unavailable');
    assert.equal((await policy({...factory,expectedRevision:2})).status,200);
    assert.equal((await request('/market/workspace',{cookie:other})).status,200);
    const retired=sources[2];
    await command('stopSales',{offerKeys:[retired.channelId],confirmed:true,expectedUpdatedAt:model().updatedAt},modelId);
    await channelState(retired,false);
    await command('removeServiceProvider',{providerId:retired.channelId,confirmed:true,expectedUpdatedAt:model().updatedAt},modelId);
    const supply=state.modelSupplies.find(row=>row.channelId===retired.channelId);
    assert.equal(supply.status,'已移除');
    await command('provider',{operation:'supplierCatalogueChannelDelete',objectId:retired.providerId,
      values:{modelId:retired.modelId,endpointId:retired.endpointId,associationId:retired.channelId,confirmed:true}});
    assert(!state.endpoints.some(row=>row.id===retired.endpointId));
    await command('marketVisibility',{visible:false,expectedUpdatedAt:model().updatedAt},modelId);
    assert.equal(model().marketVisible,false);
    assert.deepEqual(JSON.parse(await local.db.prepare('SELECT record_json FROM service_supply_records WHERE id=?').bind(supply.id).first('record_json')),supply);
    const retiredNumber=await local.db.prepare("SELECT MAX(CAST(substr(code,4) AS INTEGER)) AS number FROM channels WHERE code GLOB 'CH-[0-9]*'").first('number');
    await command('supplierModelsRegister',{providerId:retired.providerId,libraryIds:[model().templateId || modelId]});
    await command('supplierChannelRegister',{providerId:retired.providerId,modelId:retired.modelId,name:'替换渠道',
      upstreamModelId:'vendor/after-retirement',baseUrl:'https://after-retirement.example.invalid/v1',protocol:'OpenAI',authMode:'group',keyGroupId:'default'});
    const replacement=owner(retired.providerId).catalogConnections.find(row=>row.upstreamModelId==='vendor/after-retirement');
    assert.equal(Number(state.endpoints.find(row=>row.id===replacement.endpointId).channelCode.slice(3)),retiredNumber+1);
    assert.deepEqual((await local.db.prepare('PRAGMA foreign_key_check').all()).results,[]);
  } finally {
    configureOnboardingTransport(null);
    await local?.runtime.dispose();
    await rm(persistPath,{recursive:true,force:true});
  }
});
