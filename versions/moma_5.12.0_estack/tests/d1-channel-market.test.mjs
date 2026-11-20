import { isResourceId, resourceId } from '../src/resource-id.mjs';
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
import { routeEditorChannels, routeEditorPayload } from '../src/admin-v2/service-route-editor.js';
import { routeEditConfig, routeTableGroups } from '../src/admin-v2/route-workspace.js';
import { commercialPriceBase } from '../src/admin-v2/service-workspace.js';
import { platformAllowedChannels, platformCandidatePlan, publishPlatformCandidate, runPlatformTrial } from '../src/admin-v2/platform-service-client.js';
import { salesStatus } from '../src/admin-v2/service-sales.js';
import { builtinProviderCatalogue } from '../src/mock/reference-workspace.js';
import { previewProviderJsonRows, providerJsonRows } from '../src/admin-v2/provider-json-import.js';

test('fresh D1 imports MoMA and DeepSeek before GLM-5.3 pricing, ordering and supplier withdrawal',{timeout:90000},async()=>{
  const accessCode=randomBytes(18).toString('hex');
  const [a,b,c]=Array.from({length:3},()=>resourceId('tenant'));
  const tenants=[{id:a,name:'A 医院',status:'正常'},{id:b,name:'B 医院',status:'正常'},{id:c,name:'C 医院',status:'正常'}];
  const orgMember = 'qa-member-org', projectMember = 'qa-member-project', org = 'qa-org', childOrg = 'qa-org-child', projectId = 'qa-project';
  const loginHashes=Object.fromEntries(['admin-001',a,b,c,orgMember,projectMember].map(id=>[id,createHash('sha256').update(accessCode).digest('hex')]));
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
    local=await startLocalBackend({loginHashes,persistPath});
    // Customers are fixture prerequisites. Every service, sale and call is created through its normal API.
    await local.db.prepare("UPDATE model_workspace SET reference_json=json_set(reference_json,'$.tenants',json(?)) WHERE id=1").bind(JSON.stringify(tenants)).run();
    const signIn = (identifier, password = accessCode) => request('/auth/sign-in', { body: { identifier, accessCode: password } });
    const adminSignIn = await signIn('admin-001'), marketSignIn = await signIn(a);
    assert.equal(adminSignIn.status, 200);
    assert(isResourceId(adminSignIn.data.account.id, 'admin-account'));
    assert.match(adminSignIn.cookie, /^moma5120_session=/);
    assert.equal(marketSignIn.status, 200);
    assert.equal(marketSignIn.data.tenant.id, a);
    assert.match(marketSignIn.cookie, /^moma5120_market=/);
    assert.equal((await request('/auth/me', { cookie: marketSignIn.cookie })).status, 401);
    assert.equal((await request('/market/catalogue', { cookie: adminSignIn.cookie })).data.tenant, null);
    const assertInvalidLogin = result => {
      assert.equal(result.status, 401);
      assert.equal(result.cookie, undefined);
      assert.equal(result.data.error.code, 'INVALID_LOGIN');
      assert.equal(result.data.error.message, '账号或密码无效');
    };
    assertInvalidLogin(await signIn('admin-001', 'incorrect-password'));
    assertInvalidLogin(await signIn('unknown'));
    await local.db.prepare("UPDATE model_workspace SET reference_json=json_insert(reference_json,'$.tenants[#]',json(?)) WHERE id=1")
      .bind(JSON.stringify({ ...tenants[0], id: 'admin-001' })).run();
    assertInvalidLogin(await signIn('admin-001'));
    await local.db.prepare("UPDATE model_workspace SET reference_json=json_remove(reference_json,'$.tenants[3]') WHERE id=1").run();
    await local.db.prepare("UPDATE model_workspace SET reference_json=json_set(reference_json,'$.organizations',json(?),'$.projects',json(?),'$.memberships',json(?),'$.users',json(?)) WHERE id=1")
      .bind(
        JSON.stringify([{id:org,tenantId:a,name:'研发中心',status:'正常'}, {id:childOrg,tenantId:a,parentId:org,name:'平台组',status:'正常'}]),
        JSON.stringify([{id:projectId,tenantId:b,name:'知识库',status:'正常',memberRoles:{[projectMember]:'项目成员'}}]),
        JSON.stringify([{id:orgMember,tenantId:a,userId:'qa-user-org',organizationId:childOrg,role:'成员',status:'正常'}, {id:projectMember,tenantId:b,userId:'qa-user-project',role:'成员',status:'正常'}]),
        JSON.stringify([{id:'qa-user-org',status:'正常'}, {id:'qa-user-project',status:'正常'}]),
      ).run();

    admin=await login('/auth/login','admin-001');await reload();
    assert.deepEqual(state.models, []);
    assert.deepEqual(state.endpoints, []);
    for (const provider of state.providers) {
      const data = { provider: { ...builtinProviderCatalogue(provider), id: provider.id } };
      const preview = previewProviderJsonRows(state, provider.id, providerJsonRows(data, provider));
      assert(preview.every(row=>row.status==='ready'));
      for (let i=0;i<preview.length;i+=5) await command('supplierJsonImport',{providerId:provider.id,expectedProviderCode:provider.code,rows:preview.slice(i,i+5).map(row=>row.payload)});
    }
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
      {vendor:'移动云 MoMA',code:'moma',callId:'glm-5.3-a-self',retail:[2,8],builtin:true},
      {vendor:'移动云 MoMA',code:'moma',source:'转售',callId:'glm-5.3-a-resale',upstream:'vendor/GLM-resale',retail:[3,10]},
      {vendor:'乙云',code:'qa-cloud-b',source:'自营',callId:'glm-5.3-b-self',upstream:'vendor/GLM-native',retail:[2.5,9]},
    ];
    for (const source of sources) {
      if (source.builtin) {
        const provider = state.providers.find(row=>row.code==='moma');
        const entry = provider.catalogModels.find(row=>row.libraryId===material.id);
        const mapping = provider.catalogConnections.find(row=>row.modelId===entry.modelId);
        const endpoint = state.endpoints.find(row=>row.id===mapping.endpointId);
        Object.assign(source,{providerId:provider.id,modelId:entry.modelId,endpointId:endpoint.id,channelId:mapping.id,upstream:mapping.upstreamModelId,source:mapping.sourceName || endpoint.name});
        await command('provider',{operation:'addApiKeys',objectId:provider.id,values:{...await providerApiKeysDraft(['qa-only-moma']),groupId:'default'}});
        continue;
      }
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
    const aMappings=await local.db.prepare('SELECT id,upstream_model_id FROM channel_models WHERE channel_id=? AND material_id=? ORDER BY upstream_model_id').bind(sources[0].endpointId,material.id).all();
    assert.deepEqual(aMappings.results.map(row=>row.upstream_model_id),sources.slice(0,2).map(source=>source.upstream).sort());
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
      [sources[0].providerId,'移动云 MoMA',[[1,sources[0].channelId],[1,sources[1].channelId]]],
      [sources[2].providerId,'乙云',[[1,sources[2].channelId]]],
    ]);
    const offers=await local.db.prepare("SELECT record_id,id,channel_model_id,listing_stage,active_sale_price_id,active_route_id,active_publication_id FROM offers WHERE service_id=? AND retired_at IS NULL ORDER BY id").bind(modelId).all();
    assert.equal(offers.results.length,3);
    assert(isResourceId(modelId, 'service'));
    for (const row of offers.results) {
      assert(isResourceId(row.record_id, 'model_service'));
      assert(isResourceId(row.channel_model_id, 'channel'));
      assert(isResourceId(row.active_sale_price_id, 'sale-price-version'));
      assert(isResourceId(row.active_route_id, 'route-version'));
      assert(isResourceId(row.active_publication_id, 'publication'));
    }
    assert(offers.results.every(row=>row.listing_stage==='gray' && row.active_sale_price_id && row.active_route_id && row.active_publication_id));
    const customer=await login('/market/login',a), other=await login('/market/login',b);
    const catalogue=async(cookie)=>{const result=await request('/market/catalogue',{cookie});assert.equal(result.status,200,JSON.stringify(result.data));return result.data.services;};
    const { author, series } = modelClassificationFor(classificationIndex(modelClassification(state)), material);
    assert.ok(author);
    await command('modelClassificationSave', { ...author, kind: 'authors', name: '智谱（目录标准名称）' });
    const savedAuthor = state.modelData.modelClassification.authors.find(row => row.id === author.id);
    assert.equal(savedAuthor.name, '智谱（目录标准名称）');
    assert.ok(savedAuthor.formerNames.includes(author.name));
    await command('modelClassificationSave', { kind: 'authors', name: author.name, aliases: [], active: true }, undefined, 422);
    const services=await catalogue(customer);
    assert.deepEqual(marketModels(services).map(row=>[row.name,row.services.length,[...row.providers.values()]]),[['GLM-5.3',3,['移动云 MoMA','乙云']]]);
    assert.ok(services.every(row => row.classification.authorId === author.id && row.classification.author === savedAuthor.name && row.classification.seriesId === series?.id));
    for (const source of sources) {
      const { providerId, provider, channelName }=services.find(row=>row.callId===source.callId);
      assert.deepEqual([providerId,provider,channelName],[source.providerId,source.vendor,source.source]);
    }
    assert.equal((await catalogue(other)).length,0);
    assert.equal((await catalogue()).length,0);
    const order=(offerId,cookie=customer)=>request('/market/orders',{cookie,body:{offerIds:[offerId]}});
    const body=(model)=>({requestId:crypto.randomUUID(),model,messages:[{role:'user',content:'验收请求'}]});
    const call=(input,cookie=customer)=>request('/market/completions',{cookie,body:input});
    assert.equal((await order(services[0].id,admin)).status,401);
    assert.equal((await order(services[0].id,other)).status,403);
    assert.equal((await call(body(services[0].callId))).data.error.code,'ORDER_REQUIRED');
    const successful=[];
    for (const source of sources.slice(0,2)) {
      const offer=services.find(row=>row.callId===source.callId);
      assert.equal(offer.salePrices[0].amount,source.retail[0]*1000000);
      const ordered=await order(offer.id);assert.equal(ordered.status,200,JSON.stringify(ordered.data));
      assert(isResourceId(ordered.data.orders[0].id, 'order'));
      assert.deepEqual((await order(offer.id)).data,ordered.data);
      const input=body(offer.callId), invoked=await call(input);
      assert.equal(invoked.status,200,JSON.stringify(invoked.data));
      assert.equal(invoked.data.source,'mock');
      assert(!JSON.stringify(invoked.data).includes('procurement'));
      assert.deepEqual((await call(input)).data,invoked.data);
      successful.push({source,input,id:invoked.data.id});
    }
    const channelState = (source, enabled) => command('serviceProviderServing',
      {providerId:source.channelId,enabled,expectedUpdatedAt:model().updatedAt},modelId);
    const [target, sibling] = sources;
    await channelState(target, false);
    assert.equal(model().serviceProviders.find(row=>row.channelId===target.channelId).listingStage,'gray');
    const blocked = await call(body(target.callId));
    assert.equal(blocked.status,409);
    assert.equal(blocked.data.error.message,'模型服务已停止');
    const unaffected = await call(body(sibling.callId));
    assert.equal(unaffected.status,200);
    successful.push({source:sibling,id:unaffected.data.id});
    await channelState(target, true);
    const restarted = await call(body(target.callId));
    assert.equal(restarted.status,200);
    successful.push({source:target,id:restarted.data.id});
    // Verify that the third offer is callable before withdrawal, while leaving a fresh A order for afterwards.
    await command('startSales',release([keys[0],keys[2]],[a,b]),modelId);
    const expiring=sources[0], expiringOffer=services.find(row=>row.callId===expiring.callId);
    const third=services.find(row=>row.callId===sources[2].callId);
    assert((await catalogue(other)).find(row=>row.id===expiringOffer.id)?.canOrder);
    const { providerId, endpointId, channelId: associationId }=expiring;
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
    assert.equal((await call(body(expiringOffer.callId))).data.error.code,'CALL_UNAVAILABLE');
    assert.equal(await local.db.prepare('SELECT commit_seq FROM db_state WHERE id=1').first('commit_seq'),seq);
    assert.equal((await order(third.id,other)).status,200);
    const before=await call(body(third.callId),other);assert.equal(before.status,200,JSON.stringify(before.data));
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
      const row=await local.db.prepare("SELECT json_extract(r.payload_json,'$.upstreamModelId') AS upstream,call.offer_id,call.sale_price_id,call.route_version_id FROM market_calls call JOIN simulation_records r ON r.kind='usage' AND r.id=call.usage_id WHERE json_extract(r.payload_json,'$.requestId')=?").bind(id).first();
      assert(isResourceId(id, 'request'));
      assert.equal(row.upstream,source.upstream);
      assert.equal(row.offer_id,services.find(offer=>offer.callId===source.callId).id);
      assert(row.sale_price_id && row.route_version_id);
    }
    // A display change must never change sale stages, orders, or call authorization.
    const cardData = () => ({ expectedRevision: state.revision });
    const cardName = 'GLM-5.3 展示验收';
    const cardModelId = material.id;
    const displayOnly = services.find(offer => offer.callId === sources[1].callId);
    const selectedScope = { type: 'selected', tenantIds: [a] };
    const modelBeforeCard = structuredClone(model());
    const pricesBeforeCard = structuredClone(state.modelSalePrices);
    await command('marketCardEdit', { ...cardData(), name: cardName, description: '广场展示验收。', logo: '' }, cardModelId);
    await command('marketCardList', { ...cardData(), scope: selectedScope, serviceIds: ['missing'] }, cardModelId, 422);
    await command('marketCardList', { ...cardData(), scope: selectedScope, serviceIds: [third.id, displayOnly.id] }, cardModelId);
    assert.deepEqual(new Set((await catalogue(customer)).map(offer => offer.id)), new Set([third.id, displayOnly.id]));
    assert.equal((await catalogue(customer)).find(offer => offer.id === displayOnly.id).canOrder, false);
    assert.equal((await catalogue(customer)).find(offer => offer.id === third.id).name, cardName);
    assert.equal((await catalogue(other)).length, 0);
    assert.equal((await catalogue()).length, 0);
    await command('marketCardLink', { ...cardData(), serviceIds: [displayOnly.id] }, cardModelId, 422);
    const orgCookie = await login('/market/login', orgMember);
    const projectCookie = await login('/market/login', projectMember);
    await command('marketCardList', { ...cardData(), scope:{ type:'selected', organizationIds:[org], projectIds:[projectId] }, serviceIds:[third.id] }, cardModelId);
    assert.equal((await catalogue(customer)).length, 0);
    assert.equal((await catalogue(orgCookie))[0]?.id, third.id);
    assert.equal((await catalogue(projectCookie)).length, 0);
    const projectCatalogue = await request('/market/catalogue?project=' + projectId, { cookie:projectCookie });
    assert.equal(projectCatalogue.data.services[0]?.id, third.id);
    assert.equal(projectCatalogue.data.services[0].canOrder,false);
    assert.deepEqual(projectCatalogue.data.projects.map(row=>row.id), [projectId]);
    assert.equal((await request('/market/catalogue?project=' + projectId, { cookie:other })).status,403);
    assert.equal((await request('/market/catalogue?project=' + projectId, { cookie:orgCookie })).status,403);
    assert.equal((await order(third.id, projectCookie)).status,403);
    await command('marketCardUnlist', { ...cardData(), confirmed: true }, cardModelId);
    assert.equal((await catalogue(customer)).length, 0);
    assert.deepEqual(model(), modelBeforeCard);
    assert.deepEqual(state.modelSalePrices, pricesBeforeCard);
    const stillCallable = await call(body(third.callId), other);
    assert.equal(stillCallable.status, 200);
    successful.push({source:sources[2],id:stillCallable.data.id});
    await command('marketCardList', { ...cardData(), scope: selectedScope, serviceIds: [third.id] }, cardModelId);
    const pauses = () => ({offerKey:keys[2],expectedUpdatedAt:model().updatedAt,confirmed:true});
    await command('pauseSales', pauses(), modelId);
    assert.equal(salesStatus(state,model(),keys[2]), '已停售');
    assert.equal((await catalogue(customer))[0].canOrder,false);
    assert.equal((await order(third.id)).status,409);
    const continued = await call(body(third.callId), other);
    assert.equal(continued.status,200);
    successful.push({source:sources[2],id:continued.data.id});
    await command('startSales', release([keys[2]],[a,b]), modelId);
    assert.equal((await catalogue(customer))[0].canOrder,true);
    await local.runtime.dispose();
    local=null;
    local=await startLocalBackend({loginHashes,persistPath});
    assert.deepEqual((await catalogue(customer)).map(row=>row.callId),[third.callId]);
    assert.deepEqual((await local.db.prepare('SELECT id,listing_stage FROM offers WHERE service_id=? AND retired_at IS NULL ORDER BY id').bind(modelId).all()).results,
      sources.map((source,index)=>({id:source.callId,listing_stage:index===2?'gray':'withdrawn'})).sort((a,b)=>a.id.localeCompare(b.id)));
    assert.equal(await local.db.prepare('SELECT COUNT(*) AS n FROM market_orders').first('n'),4);
    assert.equal(await local.db.prepare('SELECT COUNT(*) AS n FROM market_calls').first('n'),successful.length);
    assert.deepEqual((await local.db.prepare('PRAGMA foreign_key_check').all()).results,[]);
  } finally {
    configureOnboardingTransport(null);
    await local?.runtime.dispose();
    await rm(persistPath,{recursive:true,force:true});
  }
});
