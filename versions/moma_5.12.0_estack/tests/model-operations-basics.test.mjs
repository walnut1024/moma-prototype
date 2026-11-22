import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {startLocalBackend} from '../database/local-runtime.js';
import {domainModelWorkspace} from '../src/mock/model-fields.js';
import {libraryRecord,modelMaterial} from '../src/admin-v2/model-library.js';
import {serviceModelSourceDraft} from '../src/admin-v2/model-profile.js';
import {materialBase} from '../src/admin-v2/model-operations.js';
import {providerApiKeysDraft} from '../src/admin-v2/provider-management.js';
import {connectionKeys} from '../src/admin-v2/connection-state.js';
import {marketCardIndex} from '../src/market-cards.mjs';
import {connectionDirectoryRows} from '../src/admin-v2/channel-connection-directory.js';
import {mappingCandidates} from '../src/admin-v2/service-model-mappings.js';
import {exportModelResources} from '../src/admin-v2/model-resource-transfer.js';
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
    const channel={providerId:owner.id,modelId:catalogue.modelId,name:'阶段一测试渠道',upstreamModelId:'vendor/glm-5.5',protocol:'Anthropic',baseUrl:'https://phase-one.example.invalid/v1',authMode:'group',keyGroupId:'default',scenarios:[{name:'输入 Token',listPrice:'0',unit:'百万 Token',currency:'CNY'}]};
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
        name: '手动接入渠道', interfaceType: 'openai', baseUrl: 'https://manual.example.invalid/v1',
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
    const cardResult=await command('marketCardCreate',{expectedRevision:state.revision,name:material.name,description:material.description,logo:material.profile?.logo || ''},material.id);
    assert.equal(cardResult.status,200,JSON.stringify(cardResult.data));await refresh();
    const create=await command('createServiceModel',{...serviceModelSourceDraft(state,material),libraryId:material.id,name:'GLM-5.5 业务服务',modelId:'glm-5.5-service',serviceMode:'standard'});assert.equal(create.status,200,JSON.stringify(create.data));await refresh();
    const service=state.models.find(row=>row.templateId===material.id);assert.equal(service.name,material.name);assert.equal(service.serviceName,'GLM-5.5 业务服务');assert.equal(service.description,material.description);assert.equal(service.serviceMode,'standard');assert.equal(service.callsEnabled,false);assert.equal(service.listingStatus,'已下架');assert.equal(service.modelId,'glm-5.5-service');
    const newServiceRow={
      id:resourceId('model-service'), name:'从资料复制的新模型服务', callId:'qa-copy-new-service',
      modelId:material.id, type:material.type, listed:false, channels:[],
    };
    const persistNewService=(row,revision=0)=>{
      const operationId=resourceId('operation');
      return api('/model-services-new',{action:'save',id:row.id,revision,row,operationId},operationId);
    };
    const invalidDetails=await persistNewService({...newServiceRow, modelDetails:{context:-1}});
    assert.equal(invalidDetails.status,400);
    const copied=await persistNewService(newServiceRow);
    assert.equal(copied.status,200,JSON.stringify(copied.data));
    const readNewService=async()=> (await api('/model-services-new')).data.rows.find(row=>row.id===newServiceRow.id);
    assert.equal(copied.data.row.modelDetails.name,material.name);
    assert.equal(copied.data.row.modelDetails.context,material.capabilities.context);
    await refresh();
    const configured=structuredClone(state);
    const businessExports = current => ['channels','services','market','prices'].map(scope => {
      const { rows, references } = exportModelResources(current,scope,{level:'model',model_id:material.id});
      return { rows, references };
    });
    const beforeExports=businessExports(configured);
    assert.ok(beforeExports[0].rows.some(row=>row.type==='provider_model'));
    assert.ok(beforeExports[2].rows.some(row=>row.type==='market_model'));
    const beforeCandidates=mappingCandidates(configured,{modelId:material.id});
    const renamed=await command('templatePublish',{id:material.id,expectedBase:materialBase(state,material),confirmed:true,value:{...material,name:'GLM-5.5 模型资料',capabilities:{...material.capabilities,context:65536}}});assert.equal(renamed.status,200,JSON.stringify(renamed.data));await refresh();
    assert.equal(modelMaterial(state,material.id).name,'GLM-5.5 模型资料');
    assert.equal(modelMaterial(state,material.id).capabilities.context,65536);
    assert.deepEqual(await readNewService(),copied.data.row);
    assert.deepEqual(businessExports(state),beforeExports);
    const persisted=await command('templateDelete',{id:material.id,confirmed:true});assert.equal(persisted.status,200,JSON.stringify(persisted.data));await refresh();
    assert.equal(modelMaterial(state,material.id),undefined);
    assert.deepEqual(await readNewService(),copied.data.row);
    assert.deepEqual(businessExports(state),beforeExports);
    for(const key of ['models','providers','endpoints','modelSupplies','validations','serviceRoutes','supplyRelations']) assert.deepEqual(state[key],configured[key],key);
    assert.deepEqual(state.modelData.marketCards,configured.modelData.marketCards);
    assert.equal(marketCardIndex(state,state.models).find(row=>row.modelId===material.id).name,material.name);
    const savedChannel=connectionDirectoryRows(state,state.providers).find(row=>row.id===privateChannel.id);
    assert.equal(savedChannel.models[0].modelName,material.name);
    assert.deepEqual(mappingCandidates(state,{modelId:material.id}),beforeCandidates);
    assert.equal(state.models.find(row=>row.id===service.id).serviceName,service.serviceName);
    const editOwn=await persistNewService({...copied.data.row,modelDetails:{name:'服务自己维护',context:16384}},1);
    assert.equal(editOwn.status,200,JSON.stringify(editOwn.data));
    assert.equal((await readNewService()).modelDetails.name,'服务自己维护');
    assert.equal((await readNewService()).modelDetails.context,16384);
    assert.equal((await readNewService()).modelDetails.code,material.modelId);
    await refresh();
    const deletedSource=await persistNewService({...newServiceRow,id:resourceId('model-service'),callId:'qa-use-deleted-reference'});
    assert.equal(deletedSource.status,400);
    const duplicate=await command('createServiceModel',{...serviceModelSourceDraft(state,material),libraryId:material.id,modelId:'another',serviceMode:'provider'});assert.equal(duplicate.status,422);
    await refresh();
    const currentOwner=state.providers.find(row=>row.id===privateOwner.id);
    const currentAssociation=currentOwner.catalogConnections.find(row=>row.endpointId===privateChannel.id);
    const ownName='渠道独立维护的展示名称';
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
