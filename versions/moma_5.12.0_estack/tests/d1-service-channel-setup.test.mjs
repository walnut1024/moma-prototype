import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {startLocalBackend} from '../database/local-runtime.js';
import {domainModelWorkspace} from '../src/mock/model-fields.js';
import {providerApiKeysDraft} from '../src/admin-v2/provider-management.js';
import {providerKeyGroups} from '../src/admin-v2/provider-key-groups.js';
import {libraryRecord} from '../src/admin-v2/model-library.js';
import {supplierModelChannelGroups} from '../src/admin-v2/supplier-model-channel-table.js';
import {supplierChannelAssociations} from '../src/admin-v2/supplier-resources.js';
import {routingServices,serviceRoute,activeRouteVersion,routeSourceVersion} from '../src/admin-v2/service-routing.js';
import {routeEditorChannels,routeEditorPayload} from '../src/admin-v2/service-route-editor.js';
import {routeEditConfig} from '../src/admin-v2/route-workspace.js';
import {configureOnboardingTransport,prepareServerChannel,onboardingApi} from '../src/admin-v2/onboarding-client.js';
import {useCloudMockSnapshot} from '../src/admin-v2/mock-onboarding-service.js';
import {connectionFingerprint} from '../src/admin-v2/connection-state.js';
import {channelFingerprint} from '../src/admin-v2/provider-channels.js';
import {prepareCandidateTest,submitCandidateTest,candidateTestReceipt,recoverCandidateTest} from '../src/admin-v2/candidate-tests.js';
import {keyGroupRotationSignature} from '../src/admin-v2/channel-change-management.js';
import {credentialRotationChannels} from '../src/admin-v2/credential-rotation-scope.js';

test('priority groups and retry limits are saved together as route versions through HTTP/D1',{timeout:60000},async()=>{
  const accessCode=randomBytes(24).toString('hex');
  const local=await startLocalBackend({demo:true,loginHashes:{'admin-001':createHash('sha256').update(accessCode).digest('hex')}});
  let cookie;
  const api=(path,body)=>local.runtime.dispatchFetch('https://example.test/api/v1'+path,{
    method:body?'POST':'GET',
    headers:{...(cookie?{cookie}:{}),...(body?{origin:'https://example.test','x-moma-request':'1','content-type':'application/json'}:{}),
      ...(body?.operationId?{'idempotency-key':body.operationId}:{})},
    ...(body?{body:JSON.stringify(body)}:{}),
  });
  const reload=async()=>domainModelWorkspace(await (await api('/model-operations')).json());
  try{
    const login=await api('/auth/login',{accountId:'admin-001',accessCode});
    assert.equal(login.status,200);
    cookie=login.headers.get('set-cookie').split(';')[0];
    let state=await reload();
    const serviceId='standard:model-1';
    const service=()=>routingServices(state).find(row=>row.id===serviceId);
    const route=()=>serviceRoute(state,serviceId);
    const command=(operation,data)=>api('/model-operations/commands',{
      operationId:crypto.randomUUID(),expectedRevision:state.revision,
      action:{type:'modelOperations',operation,modelId:service().modelId,data},
    });
    const channels=routeEditorChannels(state,service());
    const config=routeEditConfig(service(),route());
    const groups=[{id:'P1',name:'P1',strategy:'weighted'},{id:'P2',name:'P2',strategy:'weighted'}];
    const supplies=channels.filter(row=>row.available).slice(0,3);
    assert.equal(supplies.length,3);
    const grouped={...config,strategy:'weighted',groups,channels:supplies.map((row,index)=>({
      supplyId:row.id,enabled:true,priority:index+1,weight:[10,20,70][index],groupId:index===2?'P2':'P1',
    }))};
    const publish=await command('serviceRouteConfigure',routeEditorPayload(state,service(),grouped,channels));
    assert.equal(publish.status,200,await publish.text());
    state=await reload();
    assert.deepEqual(activeRouteVersion(route()).config.groups,groups);
    const retry={withinGroup:1,acrossGroups:1,maxAttempts:3,reasons:['timeout']};
    const configure=overrides=>command('serviceFailoverConfigure',{
      serviceId,expectedVersion:route().activeVersion,sourceVersion:routeSourceVersion(state,service()),
      confirmed:true,enabled:true,retry:{...retry,...overrides},
    });
    const saved=await configure();
    assert.equal(saved.status,200,await saved.text());
    state=await reload();
    const {revision}=state;
    const active=activeRouteVersion(route());
    assert.deepEqual(active.config.groups,groups);
    assert.deepEqual(active.config.channels.map(row=>row.weight),[10,20,70]);
    assert.deepEqual(active.config.retry,retry);
    const blocked=await configure({acrossGroups:2});
    assert.equal(blocked.status,422);
    state=await reload();
    assert.equal(state.revision,revision);
    assert.deepEqual(activeRouteVersion(route()),active);
  }finally{await local.runtime.dispose();}
});

test('supplier and service operations share a scoped, redacted audit trail through HTTP/D1',{timeout:60000},async()=>{
  const accessCode=randomBytes(24).toString('hex'),local=await startLocalBackend({ demo: true, loginHashes:{'admin-001':createHash('sha256').update(accessCode).digest('hex'),'admin-002':createHash('sha256').update(accessCode).digest('hex')}});let cookie,state,lastBody;
  async function api(path,body,key){const response=await local.runtime.dispatchFetch('https://example.test/api/v1'+path,{method:body?'POST':'GET',headers:{...(cookie?{cookie}:{}),...(body?{origin:'https://example.test','x-moma-request':'1','content-type':'application/json'}:{}),...(key?{'idempotency-key':key}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json(),headers:response.headers};}
  const reload=async()=>{state=domainModelWorkspace((await api('/model-operations')).data);useCloudMockSnapshot(state,state.cloudMockState);};
  const command=async(operation,data,modelId)=>{const operationId=crypto.randomUUID();lastBody={operationId,expectedRevision:state.revision,action:{type:'modelOperations',operation,modelId,data}};const result=await api('/model-operations/commands',lastBody,operationId);assert.equal(result.status,200,operation+': '+JSON.stringify(result.data));await reload();};
  try{
    assert.equal((await api('/audit-logs')).status,401);
    const login=await api('/auth/login',{accountId:'admin-001',accessCode});cookie=login.headers.get('set-cookie').split(';')[0];await reload();
    assert.equal((await api('/audit-logs')).data.items.length,0);
    configureOnboardingTransport(async(path,options={})=>{const result=await api('/simulation'+path,options.method==='POST'?options.body:undefined,options.body?.operationId);assert.equal(result.status,200,JSON.stringify(result.data));useCloudMockSnapshot(state,result.data.mockState);return result.data.result;});
    const baseline=structuredClone(state),modelId='model-glm53',model=()=>state.models.find(row=>row.id===modelId),master=libraryRecord(state,modelId);
    await command('provider',{operation:'create',values:{name:'新供应映射合同',code:'mapping-contract-new',sourceType:'thirdParty'}});
    const providerId=state.audits[0].objectId,owner=()=>state.providers.find(row=>row.id===providerId),provider=(operation,values)=>command('provider',{operation,objectId:providerId,values});
    await command('associateServiceProvider',{providerId,expectedUpdatedAt:model().updatedAt},modelId);
    await command('configureServiceIdentity',{providerId,callId:'glm-5.3-contract-new',expectedUpdatedAt:model().updatedAt},modelId);
    const service=()=>routingServices(state).find(row=>row.modelId===modelId && row.providerId===providerId);
    assert.equal(routeEditorChannels(state,service()).length,0);
    await command('supplierModelsRegister',{providerId,libraryIds:[master.id]});
    const registered=supplierModelChannelGroups(state,owner()).find(row=>row.master?.id===master.id);assert(registered);
    const secrets=['qa-only-mapping-key-one','qa-only-mapping-key-two','qa-only-mapping-key-three'];await provider('addApiKeys',{...await providerApiKeysDraft(secrets),groupId:'default'});
    const originalOrder=providerKeyGroups(owner())[0].keyIds,priority={providerId,groupId:'default',keyId:originalOrder[2],targetKeyId:originalOrder[1],expectedKeyIds:originalOrder,expectedGroupVersion:0};
    await command('keyGroupPriority',priority);const priorityBody=lastBody;
    assert.equal((await api('/model-operations/commands',priorityBody,priorityBody.operationId)).status,200);
    const ordered=[originalOrder[0],originalOrder[2],originalOrder[1]];assert.deepEqual(providerKeyGroups(owner())[0].keyIds,ordered);
    const defaultGroupId=state.modelData.resourceIds[providerId+':default'];
    assert.ok(defaultGroupId);
    assert.deepEqual((await local.db.prepare('SELECT credential_id FROM key_group_members WHERE group_id=? AND supplier_id=? ORDER BY position').bind(defaultGroupId,providerId).all()).results.map(row=>row.credential_id),ordered);
    const staleId=crypto.randomUUID();assert.equal((await api('/model-operations/commands',{...priorityBody,operationId:staleId},staleId)).status,409);
    await command('supplierChannelRegister',{providerId,modelId:registered.modelId,name:'新供应模型渠道',upstreamModelId:'vendor/GLM-5.3',baseUrl:'https://mapping-contract.example.invalid/v1',protocol:'OpenAI',authMode:'group',keyGroupId:'default',scenarios:[]});
    const endpointId=state.audits[0].objectId,endpoint=()=>state.endpoints.find(row=>row.id===endpointId),association=supplierChannelAssociations(state,owner(),endpointId).find(row=>row.modelId===registered.modelId);
    assert.equal(association.enabled,false);assert.equal(serviceRoute(state,service().id),undefined);assert(routeEditorChannels(state,service()).every(row=>!row.available));
    const server=await prepareServerChannel(owner(),endpoint()),request={operationId:crypto.randomUUID(),channelId:server.id,models:[{id:master.id,associationId:association.id,upstreamModelId:association.upstreamModelId,type:'text'}]},job={providerId,endpointId,operationId:request.operationId,serverChannelId:server.id,signature:connectionFingerprint(endpoint()),associationIds:[association.id],request};
    await command('channelTestEvidenceJob',job);let batch=await onboardingApi('/tests',{method:'POST',body:request});await command('channelTestEvidenceJob',{...job,batchId:batch.id});
    for(let i=0;i<40 && batch.items.some(row=>!['passed','failed','cancelled'].includes(row.status));i++){await new Promise(resolve=>setTimeout(resolve,100));batch=await onboardingApi('/tests/'+batch.id);}
    assert(batch.items.every(row=>row.status==='passed'));await command('channelTestEvidenceReceipt',{providerId,endpointId,batch});
    assert(routeEditorChannels(state,service()).every(row=>!row.available),'passing tests do not enable supply');
    await provider('supplierModelsEnable',{endpointId,associationIds:[association.id]});
    const channels=routeEditorChannels(state,service()),target=channels.find(row=>row.endpointId===endpointId);assert(target.available && target.candidate);
    const config={...routeEditConfig(service(),serviceRoute(state,service().id)),strategy:'fixed',channels:[{supplyId:target.id,enabled:true,priority:1,weight:100,groupId:'P1'}]};
    await command('serviceRouteConfigure',routeEditorPayload(state,service(),config,channels),modelId);
    const routeOperationId=lastBody.operationId;
    assert.equal((await api('/model-operations/commands',lastBody,routeOperationId)).status,200);
    const active=activeRouteVersion(serviceRoute(state,service().id)),supply=state.modelSupplies.find(row=>row.id===active.config.channels[0].supplyId);assert.equal(supply.endpointId,endpointId);assert.equal(supply.upstreamModelId,'vendor/GLM-5.3');assert.equal(supply.status,'已启用');assert.equal(supply.validationStatus,'通过');assert.equal(active.config.channels.length,1);
    assert.deepEqual(state.models.filter(row=>row.id!==modelId),baseline.models.filter(row=>row.id!==modelId));assert.deepEqual(state.modelSalePrices,baseline.modelSalePrices);assert.equal(model().listingStatus,baseline.models.find(row=>row.id===modelId).listingStatus);
    assert(secrets.every(secret=>!JSON.stringify(state).includes(secret)));assert.equal((await local.db.prepare('PRAGMA foreign_key_check').all()).results.length,0);
    await command('keyGroupPriority',{...priority,keyId:ordered[1],targetKeyId:ordered[0],expectedKeyIds:ordered,expectedGroupVersion:1});
    async function applyGroupCandidate(expectedGroupVersion) {
      const staged=owner().keyGroupCandidates[0],context={providerId,endpointId,groupId:'default',candidateId:staged.id,expectedGroupVersion};
      const probe=await prepareCandidateTest(state,context);await command(probe.operation,probe.data);
      let tracked=await submitCandidateTest(probe.data);await command(probe.operation,tracked);
      for(let i=0;i<40 && tracked.batch.items.some(row=>!['passed','failed','cancelled'].includes(row.status));i++){await new Promise(resolve=>setTimeout(resolve,100));tracked.batch=await recoverCandidateTest(tracked);}
      assert(tracked.batch.items.every(row=>row.status==='passed'));const receipt=candidateTestReceipt(tracked,tracked.batch);await command(receipt.operation,receipt.data);await command('keyGroupCandidateApply',{...context,confirmed:true});
      return staged.id;
    }
    await applyGroupCandidate(1);
    assert.deepEqual(providerKeyGroups(owner())[0].keyIds,[ordered[1],ordered[0],ordered[2]]);
    assert.equal((await api('/audit-logs?action=supplier_key_group.rotate')).data.items.length,0);

    const rotationSecret='qa-only-audit-rotation';
    const {apiKeys:[newApiKey]}=await providerApiKeysDraft([rotationSecret]);
    await command('keyGroupCandidatePrepare',{providerId,groupId:'default',expectedGroupVersion:2,
      expectedScope:keyGroupRotationSignature(state,providerId,'default'),newApiKey});
    const candidateId=await applyGroupCandidate(2), rotationOperationId=lastBody.operationId;
    const activeKeyId=providerKeyGroups(owner())[0].keyIds[0];
    assert.notEqual(activeKeyId,ordered[1]);
    const existingKey=owner().apiKeys.find(row=>row.id===activeKeyId),keyOrder=providerKeyGroups(owner())[0].keyIds;
    const replacementSecret='qa-only-one-step-api-key';
    const replacement={providerId,keyId:activeKeyId,expectedFingerprint:existingKey.fingerprint,
      expectedEndpointIds:credentialRotationChannels(state,owner(),activeKeyId).map(row=>row.id),
      newApiKey:(await providerApiKeysDraft([replacementSecret])).apiKeys[0]};
    const rejectReplacement=async (data,status)=>{
      const operationId=crypto.randomUUID();
      const result=await api('/model-operations/commands',{operationId,expectedRevision:state.revision,action:{type:'modelOperations',operation:'credentialReplace',data}},operationId);
      assert.equal(result.status,status,JSON.stringify(result.data));
    };
    const beforeReplace=state.revision;
    await rejectReplacement({...replacement,expectedEndpointIds:[]},422);
    await rejectReplacement({...replacement,newApiKey:{...replacement.newApiKey,secret:replacementSecret}},400);
    await reload();
    assert.equal(state.revision,beforeReplace);
    assert.equal(owner().apiKeys.find(row=>row.id===activeKeyId).fingerprint,existingKey.fingerprint);
    await command('credentialReplace',replacement);
    const replaceOperationId=lastBody.operationId;
    assert.deepEqual(providerKeyGroups(owner())[0].keyIds,keyOrder);
    assert.equal(owner().apiKeys.find(row=>row.id===activeKeyId).fingerprint,replacement.newApiKey.fingerprint);
    assert.equal(supplierChannelAssociations(state,owner(),endpointId).find(row=>row.id===association.id).enabled,true);
    assert.equal(activeRouteVersion(serviceRoute(state,service().id)).version,active.version);
    assert(!JSON.stringify(state).includes(replacementSecret));

    await command('supplierChannelRegister',{providerId,modelId:registered.modelId,name:'第二模型渠道',upstreamModelId:'vendor/GLM-5.3-b',baseUrl:'https://mapping-contract.example.invalid/v2',protocol:'OpenAI',authMode:'group',keyGroupId:'default',scenarios:[]});
    const secondEndpoint=state.audits[0].objectId;
    const selections=[endpointId,secondEndpoint].map(id=>{
      const channel=supplierChannelAssociations(state,owner(),id).find(row=>row.modelId===registered.modelId);
      return {providerId,modelId:registered.modelId,endpointId:id,associationId:channel.id,expectedFingerprint:channelFingerprint(channel)};
    });
    const rejected=crypto.randomUUID();
    assert.equal((await api('/model-operations/commands',{operationId:rejected,expectedRevision:state.revision,action:{type:'modelOperations',
      operation:'supplierSelection',data:{action:'disable',confirmed:true,selections:[selections[0],{...selections[1],expectedFingerprint:'stale'}]}}},rejected)).status,422);
    assert(supplierChannelAssociations(state,owner(),endpointId).some(row=>row.id===selections[0].associationId && row.enabled));
    await command('supplierSelection',{action:'disable',confirmed:true,selections});
    const disableOperationId=lastBody.operationId;

    const list=await api('/audit-logs');
    assert.equal(list.status,200);
    assert.equal(list.headers.get('cache-control'),'no-store');
    const {items}=list.data;
    const replacementAudit=items.find(item=>item.operation_id===replaceOperationId);
    assert.equal(replacementAudit.action_code,'supplier_key.replace');
    assert.equal(replacementAudit.target.id,activeKeyId);
    const established=items.filter(item=>item!==replacementAudit);
    assert.deepEqual(established.map(item=>item.operation_id),[disableOperationId,rotationOperationId,routeOperationId]);
    assert.equal(items[0].target_count,2);
    assert(items.every(item=>item.changes===undefined && item.resources===undefined));
    const first=await api('/audit-logs?limit=1');
    assert.equal(first.data.nextCursor,items[0].event_id);
    assert.equal((await api('/audit-logs?limit=1&after='+first.data.nextCursor)).data.items[0].event_id,items[1].event_id);
    assert.deepEqual((await api('/audit-logs?actor=admin-001&status=succeeded&type=supplier_key_group&q='+encodeURIComponent(activeKeyId))).data.items.map(row=>row.event_id),[established[1].event_id]);
    assert.deepEqual((await api('/audit-logs?action=supplier_key_group.rotate')).data.items.map(row=>row.event_id),[established[1].event_id]);
    const routeTime=Date.parse(established[2].occurred_at);
    assert.deepEqual((await api('/audit-logs?from='+routeTime+'&to='+routeTime)).data.items.map(row=>row.event_id),[established[2].event_id]);
    assert.equal((await api('/audit-logs?action=__proto__')).status,400);
    assert.equal((await api('/audit-logs?from=2&to=1')).status,400);
    assert.equal((await api('/audit-logs?to=1')).status,400);
    assert.equal((await api('/audit-logs/absent')).status,404);

    const detail=async row=>(await api('/audit-logs/'+row.event_id)).data.event;
    const routeAudit=await detail(established[2]);
    assert(routeAudit.changes.some(change=>change.field==='active_version' && change.after.value===active.version));
    assert(routeAudit.resources.some(resource=>resource.type==='service_mapping' && resource.roles.includes('changed')));
    assert(routeAudit.resources.some(resource=>resource.type==='model_supply' && resource.id===association.id));
    const rotateAudit=await detail(established[1]);
    assert.equal(rotateAudit.links.candidate_id,candidateId);
    assert(rotateAudit.changes.some(change=>change.field==='active_key_id' && change.after.value===activeKeyId));
    assert(rotateAudit.resources.some(resource=>resource.id===endpointId && resource.roles.includes('changed')));
    const batchAudit=await detail(established[0]);
    assert.deepEqual(batchAudit.item_results.map(row=>row.status),['succeeded','unchanged']);
    assert(batchAudit.changes.some(change=>change.field==='enabled' && change.before.value===true && change.after.value===false));
    assert(batchAudit.resources.some(resource=>resource.type==='model_material' && resource.id===master.id));
    assert.doesNotMatch(JSON.stringify([routeAudit,rotateAudit,batchAudit,await detail(replacementAudit)]),/qa-only|fingerprint|maskedKey|catalogConnections|mapping-contract\.example/);

    for (const item of established) {
      const original=await local.db.prepare('SELECT record_json FROM audit_events WHERE id=?').bind(item.event_id).first('record_json');
      await local.db.prepare("UPDATE audit_events SET record_json=json_remove(record_json,'$.platformAudit') WHERE id=?").bind(item.event_id).run();
      const historical=await detail(item);
      assert.equal(historical.action_code,item.action_code);
      assert.doesNotMatch(JSON.stringify(historical),/qa-only|fingerprint|maskedKey|catalogConnections|mapping-contract\.example/);
      await local.db.prepare('UPDATE audit_events SET record_json=? WHERE id=?').bind(original,item.event_id).run();
    }
    const viewer=await api('/auth/login',{accountId:'admin-002',accessCode});cookie=viewer.headers.get('set-cookie').split(';')[0];const viewerId=crypto.randomUUID();assert.equal((await api('/model-operations/commands',{operationId:viewerId,expectedRevision:state.revision,action:{type:'modelOperations',operation:'keyGroupPriority',data:{...priority,expectedKeyIds:ordered,expectedGroupVersion:1}}},viewerId)).status,403);
    assert.equal((await api('/audit-logs')).status,403);
    assert.equal((await api('/audit-logs/'+items[0].event_id)).status,403);
  }finally{configureOnboardingTransport(null);await local.runtime.dispose();}
});
