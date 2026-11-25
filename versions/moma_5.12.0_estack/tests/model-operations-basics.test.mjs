import {seedExistingService} from './legacy-service-fixture.mjs';
import {serviceModelSourceDraft} from '../src/admin-v2/model-profile.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {startLocalBackend} from '../database/local-runtime.js';
import {domainModelWorkspace} from '../src/mock/model-fields.js';
import {libraryRecord,modelMaterial} from '../src/admin-v2/model-library.js';
import {materialBase} from '../src/admin-v2/model-operations.js';
import {providerApiKeysDraft} from '../src/admin-v2/provider-management.js';
import {connectionKeys} from '../src/admin-v2/connection-state.js';
import {marketCardIndex,marketCardFieldValues} from '../src/market-cards.mjs';
import {connectionDirectoryRows} from '../src/admin-v2/channel-connection-directory.js';
import {mappingCandidates} from '../src/admin-v2/service-model-mappings.js';
import {resourceId} from '../src/resource-id.mjs';

test('HTTP and D1 preserve canonical material, explicit channel protocol and candidate edits across the first onboarding stage',{timeout:60000},async()=>{
  const accessCode=randomBytes(24).toString('hex');
  const local=await startLocalBackend({ demo: true, loginHashes:{'admin-001':createHash('sha256').update(accessCode).digest('hex')}});
  let cookie,state;
  async function api(path,body,key){const r=await local.runtime.dispatchFetch('https://example.test/api/v1'+path,{method:body?'POST':'GET',headers:{...(cookie?{cookie}:{}),...(body?{origin:'https://example.test','content-type':'application/json','x-moma-request':'1'}:{}),...(key?{'idempotency-key':key}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json(),headers:r.headers};}
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
    const channel={providerId:owner.id,modelId:catalogue.modelId,name:'阶段一测试连接',upstreamModelId:'vendor/glm-5.5',protocol:'Anthropic',baseUrl:'https://phase-one.example.invalid/v1',authMode:'group',keyGroupId:'default',scenarios:[{name:'输入 Token',listPrice:'0',unit:'百万 Token',currency:'CNY'}]};
    const invalid=await command('supplierChannelRegister',{...channel,protocol:'unknown'});assert.equal(invalid.status,422);await refresh();assert.equal(state.revision,registered.data.revision);
    const fullTask=await command('supplierChannelRegister',{...channel,baseUrl:channel.baseUrl+'/messages'});assert.equal(fullTask.status,422);await refresh();assert.equal(state.revision,registered.data.revision);
    const connected=await command('supplierChannelRegister',channel);assert.equal(connected.status,200,JSON.stringify(connected.data));await refresh();
    const endpoint=state.endpoints.find(row=>row.name===channel.name),association=state.providers.find(row=>row.id===owner.id).catalogConnections.find(row=>row.endpointId===endpoint.id);
    assert.equal(endpoint.protocol,'Anthropic');assert.equal(endpoint.interfaceType,'anthropic');assert.equal(endpoint.status,'草稿');assert.equal(association.enabled,false);assert.equal(state.modelSupplies.length,baseline.modelSupplies.length);
    const privateInput = 'temporary-channel-only-key';
    const [channelApiKey] = (await providerApiKeysDraft([privateInput])).apiKeys;
    const quick = {
      newProvider: { name: '手动接入服务商' },
      channelApiKey,
      values: {
        name: '手动接入连接', interfaceType: 'openai', baseUrl: 'https://manual.example.invalid/v1',
        authMode: 'group', keyGroupId: 'default', models: [{ libraryId: material.id, upstreamModelId: 'vendor/manual-glm' }],
      },
    };
    const rejected = await command('channelQuickCreate', { ...quick, channelApiKey: { ...channelApiKey, raw: privateInput } });
    assert.equal(rejected.status, 422);
    await refresh();
    assert.equal(state.providers.some(row => row.name === quick.newProvider.name), false);
    const created = await command('channelQuickCreate', quick);
    assert.equal(created.status, 200, JSON.stringify(created.data));
    await refresh();
    const privateOwner = state.providers.find(row => row.name === quick.newProvider.name);
    const privateChannel = state.endpoints.find(row => row.name === quick.values.name);
    assert.equal(privateChannel.providerId, privateOwner.id);
    assert.equal(privateChannel.status, '草稿');
    assert.deepEqual(privateOwner.apiKeys || [], []);
    assert.equal(connectionKeys(privateChannel, privateOwner)[0].fingerprint, channelApiKey.fingerprint);
    assert.equal(privateChannel.apiKeys[0].scope, 'channel');
    assert.equal(privateOwner.catalogConnections.find(row => row.endpointId === privateChannel.id).upstreamModelId, 'vendor/manual-glm');
    assert.equal(JSON.stringify(state).includes(privateInput), false);
    const edit={providerId:owner.id,endpointId:endpoint.id,associationId:association.id,modelId:catalogue.modelId,upstreamModelId:channel.upstreamModelId,name:endpoint.name,protocol:'OpenAI',baseUrl:channel.baseUrl,expectedUpdatedAt:endpoint.updatedAt,expectedProviderUpdatedAt:state.providers.find(row=>row.id===owner.id).updatedAt};
    const changed=await command('supplierChannelEdit',edit);assert.equal(changed.status,200,JSON.stringify(changed.data));await refresh();
    const pending=state.endpoints.find(row=>row.id===endpoint.id);assert.equal(pending.protocol,'Anthropic');assert.equal(pending.baseUrl,channel.baseUrl);assert.equal(pending.candidateConfiguration.config.protocol,'OpenAI');
    const cardResult=await command('marketCardCreate',{expectedRevision:state.revision,...marketCardFieldValues(material),source_model_id:material.id,description_en:'GLM model for testing',family:'GLM',precision:'BF16',tags:['对话']},material.id);
    assert.equal(cardResult.status,200,JSON.stringify(cardResult.data));await refresh();
    const cardId=state.audits[0].objectId;
    assert.ok(state.modelData.marketCards[cardId]);
    // Keep an existing sales service in the export scope while its source material changes.
    await seedExistingService(local.db,state,{...serviceModelSourceDraft(state,material),libraryId:material.id,serviceMode:'standard'});
    await refresh();
    const newServiceRow={
      id:resourceId('model-service'), name:'独立创建的新模型服务', callId:'qa-independent-service',
      type:material.type, listed:false, channels:[],
    };
    const persistNewService=(row,revision=0)=>{
      const operationId=resourceId('operation');
      return api('/model-services-new',{action:'save',id:row.id,revision,row,operationId},operationId);
    };
    const invalidMode=await persistNewService({...newServiceRow,serviceMode:'provider'});
    assert.equal(invalidMode.status,400);
    const invalidDetails=await persistNewService({...newServiceRow, modelDetails:{context:-1}});
    assert.equal(invalidDetails.status,400);
    assert.equal((await persistNewService({...newServiceRow,modelId:material.id})).status,400);
    const newService=await persistNewService(newServiceRow);
    assert.equal(newService.status,200,JSON.stringify(newService.data));
    const readNewService=async()=> (await api('/model-services-new')).data.rows.find(row=>row.id===newServiceRow.id);
    assert.equal(Object.hasOwn(newService.data.row,'modelId'),false);
    assert.equal(Object.hasOwn(newService.data.row,'modelDetails'),false);
    await refresh();
    const configured=structuredClone(state);
    const businessFields = ['models','providers','endpoints','modelSupplies','validations','serviceRoutes','supplyRelations','modelSalePrices','supplyPrices'];
    const beforeCandidates=mappingCandidates(configured,{modelId:material.id});
    const renamed=await command('templatePublish',{id:material.id,expectedBase:materialBase(state,material),confirmed:true,value:{...material,name:'GLM-5.5 模型资料',capabilities:{...material.capabilities,context:65536}}});assert.equal(renamed.status,200,JSON.stringify(renamed.data));await refresh();
    assert.equal(modelMaterial(state,material.id).name,'GLM-5.5 模型资料');
    assert.equal(modelMaterial(state,material.id).capabilities.context,65536);
    assert.deepEqual(await readNewService(),newService.data.row);
    for (const key of businessFields) assert.deepEqual(state[key],configured[key],key);
    const persisted=await command('templateDelete',{id:material.id,confirmed:true});assert.equal(persisted.status,200,JSON.stringify(persisted.data));await refresh();
    assert.equal(modelMaterial(state,material.id),undefined);
    assert.deepEqual(await readNewService(),newService.data.row);
    for (const key of businessFields) assert.deepEqual(state[key],configured[key],key);
    assert.deepEqual(state.modelData.marketCards,configured.modelData.marketCards);
    assert.equal(marketCardIndex(state,state.models).find(row=>row.cardId===cardId).name,material.name);
    const savedChannel=connectionDirectoryRows(state,state.providers).find(row=>row.id===privateChannel.id);
    assert.equal(savedChannel.models[0].modelName,material.name);
    assert.deepEqual(mappingCandidates(state,{modelId:material.id}),beforeCandidates);
    assert.equal((await readNewService()).name,newServiceRow.name);
    const editOwn=await persistNewService({...newService.data.row,name:'服务自己维护'},1);
    assert.equal(editOwn.status,200,JSON.stringify(editOwn.data));
    assert.equal((await readNewService()).name,'服务自己维护');
    await refresh();
    const deletedSource=await persistNewService({...newServiceRow,id:resourceId('model-service'),callId:'qa-use-deleted-reference',modelId:material.id});
    assert.equal(deletedSource.status,400);
    await refresh();
    const currentOwner=state.providers.find(row=>row.id===privateOwner.id);
    const currentAssociation=currentOwner.catalogConnections.find(row=>row.endpointId===privateChannel.id);
    const ownName='连接独立维护的展示名称';
    const channelRename=await command('supplierChannelEdit',{
      providerId:currentOwner.id,endpointId:privateChannel.id,associationId:currentAssociation.id,
      modelId:currentAssociation.modelId,name:privateChannel.name,upstreamModelId:currentAssociation.upstreamModelId,
      baseUrl:privateChannel.baseUrl,modelDisplayName:ownName,expectedUpdatedAt:privateChannel.updatedAt,expectedProviderUpdatedAt:currentOwner.updatedAt,
    });
    assert.equal(channelRename.status,200,JSON.stringify(channelRename.data));await refresh();
    const renamedChannel=connectionDirectoryRows(state,state.providers).find(row=>row.id===privateChannel.id);
    assert.equal(renamedChannel.models[0].modelName,ownName);
    assert.deepEqual(renamedChannel.endpoint,privateChannel);
    assert.deepEqual(state.models,configured.models);
    assert.deepEqual(state.modelData.marketCards,configured.modelData.marketCards);
    for(const key of ['modelSalePrices','supplyPrices','serviceRoutes'])assert.deepEqual(state[key],baseline[key],key);for(const row of baseline.endpoints)assert.deepEqual(state.endpoints.find(current=>current.id===row.id),row);
    assert.equal((await local.db.prepare('PRAGMA foreign_key_check').all()).results.length,0);
  }finally{await local.runtime.dispose();}
});
