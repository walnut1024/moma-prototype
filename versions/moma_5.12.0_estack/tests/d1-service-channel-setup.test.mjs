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
import {routingServices,serviceRoute,activeRouteVersion} from '../src/admin-v2/service-routing.js';
import {routeEditorChannels,routeEditorPayload} from '../src/admin-v2/service-route-editor.js';
import {routeEditConfig} from '../src/admin-v2/route-workspace.js';
import {configureOnboardingTransport,prepareServerChannel,onboardingApi} from '../src/admin-v2/onboarding-client.js';
import {useCloudMockSnapshot} from '../src/admin-v2/mock-onboarding-service.js';
import {connectionFingerprint} from '../src/admin-v2/connection-state.js';
import {prepareCandidateTest,submitCandidateTest,candidateTestReceipt,recoverCandidateTest} from '../src/admin-v2/candidate-tests.js';

test('new supplier registration, channel testing, enablement and route mapping finish through HTTP/D1; key ordering survives refresh and retry',{timeout:60000},async()=>{
  const accessCode=randomBytes(24).toString('hex'),local=await startLocalBackend({ demo: true, loginHashes:{'admin-001':createHash('sha256').update(accessCode).digest('hex'),'admin-002':createHash('sha256').update(accessCode).digest('hex')}});let cookie,state,lastBody;
  async function api(path,body,key){const response=await local.runtime.dispatchFetch('https://example.test/api/5120'+path,{method:body?'POST':'GET',headers:{...(cookie?{cookie}:{}),...(body?{origin:'https://example.test','x-moma-request':'1','content-type':'application/json'}:{}),...(key?{'idempotency-key':key}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json(),headers:response.headers};}
  const reload=async()=>{state=domainModelWorkspace((await api('/model-operations')).data);useCloudMockSnapshot(state,state.cloudMockState);};
  const command=async(operation,data,modelId)=>{const operationId=crypto.randomUUID();lastBody={operationId,expectedRevision:state.revision,action:{type:'modelOperations',operation,modelId,data}};const result=await api('/model-operations/commands',lastBody,operationId);assert.equal(result.status,200,operation+': '+JSON.stringify(result.data));await reload();};
  try{
    const login=await api('/auth/login',{accountId:'admin-001',accessCode});cookie=login.headers.get('set-cookie').split(';')[0];await reload();
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
    const originalOrder=providerKeyGroups(owner())[0].keyIds,priority={providerId,groupId:'default',keyId:originalOrder[2],direction:'up',expectedKeyIds:originalOrder,expectedGroupVersion:0};
    await command('keyGroupPriority',priority);const priorityBody=lastBody;
    assert.equal((await api('/model-operations/commands',priorityBody,priorityBody.operationId)).status,200);
    const ordered=[originalOrder[0],originalOrder[2],originalOrder[1]];assert.deepEqual(providerKeyGroups(owner())[0].keyIds,ordered);
    assert.deepEqual((await local.db.prepare('SELECT credential_id FROM key_group_members WHERE group_id=? ORDER BY position').bind(providerId+':default').all()).results.map(row=>row.credential_id),ordered);
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
    const active=activeRouteVersion(serviceRoute(state,service().id)),supply=state.modelSupplies.find(row=>row.id===active.config.channels[0].supplyId);assert.equal(supply.endpointId,endpointId);assert.equal(supply.upstreamModelId,'vendor/GLM-5.3');assert.equal(supply.status,'已启用');assert.equal(supply.validationStatus,'通过');assert.equal(active.config.channels.length,1);
    assert.deepEqual(state.models.filter(row=>row.id!==modelId),baseline.models.filter(row=>row.id!==modelId));assert.deepEqual(state.modelSalePrices,baseline.modelSalePrices);assert.equal(model().listingStatus,baseline.models.find(row=>row.id===modelId).listingStatus);
    assert(secrets.every(secret=>!JSON.stringify(state).includes(secret)));assert.equal((await local.db.prepare('PRAGMA foreign_key_check').all()).results.length,0);
    await command('keyGroupPriority',{...priority,keyId:ordered[1],expectedKeyIds:ordered,expectedGroupVersion:1});
    const staged=owner().keyGroupCandidates[0],context={providerId,endpointId,groupId:'default',candidateId:staged.id,expectedGroupVersion:1};
    const probe=await prepareCandidateTest(state,context);await command(probe.operation,probe.data);
    let tracked=await submitCandidateTest(probe.data);await command(probe.operation,tracked);
    for(let i=0;i<40 && tracked.batch.items.some(row=>!['passed','failed','cancelled'].includes(row.status));i++){await new Promise(resolve=>setTimeout(resolve,100));tracked.batch=await recoverCandidateTest(tracked);}
    assert(tracked.batch.items.every(row=>row.status==='passed'));const receipt=candidateTestReceipt(tracked,tracked.batch);await command(receipt.operation,receipt.data);await command('keyGroupCandidateApply',{...context,confirmed:true});
    assert.deepEqual(providerKeyGroups(owner())[0].keyIds,[ordered[1],ordered[0],ordered[2]]);
    const viewer=await api('/auth/login',{accountId:'admin-002',accessCode});cookie=viewer.headers.get('set-cookie').split(';')[0];const viewerId=crypto.randomUUID();assert.equal((await api('/model-operations/commands',{operationId:viewerId,expectedRevision:state.revision,action:{type:'modelOperations',operation:'keyGroupPriority',data:{...priority,expectedKeyIds:ordered,expectedGroupVersion:1}}},viewerId)).status,403);
  }finally{configureOnboardingTransport(null);await local.runtime.dispose();}
});
