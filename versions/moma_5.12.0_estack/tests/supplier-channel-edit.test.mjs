import { legacySupplierState } from './legacy-supplier-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAdminState, commitAdminState } from '../src/admin-v2/store.js';
import { withAdminSession } from './admin-session-fixture.mjs';
import { supplierChannelAssociations } from '../src/admin-v2/supplier-resources.js';
import { activeChannelProcurement } from '../src/admin-v2/channel-change-management.js';
const initial = () => withAdminSession(legacySupplierState());
const context = state => {
  const provider = state.providers.find(row => row.id === 'provider-moma');
  const association = supplierChannelAssociations(state, provider)[0], endpoint = association.endpoint;
  return { provider, association, endpoint };
};
const costs = price => [{ name: '输入 Token', listPrice: String(price), unit: '百万 Token', currency: 'CNY' }];
const values = state => {
  const {provider, association, endpoint} = context(state);
  return {providerId:provider.id, endpointId:endpoint.id, associationId:association.id, modelId:association.modelId, name:endpoint.name, upstreamModelId:association.upstreamModelId, baseUrl:endpoint.baseUrl, expectedUpdatedAt:endpoint.updatedAt, expectedProviderUpdatedAt:provider.updatedAt, expectedPriceRevision:association.procurementRevision || 0};
};
const run = (state, patch) => commitAdminState(state, {type:'modelOperations',operation:'supplierChannelEdit',data:{...values(state),...patch}});

test('channel editor publishes only the selected purchase version and retains siblings, prices and connection evidence', () => {
  const state = initial(), before = structuredClone(state), {provider,association,endpoint} = context(state);
  const next = run(state,{name:'编辑统一保存',scenarios:costs(0)});
  const current = next.providers.find(row=>row.id===provider.id).catalogConnections.find(row=>row.id===association.id);
  assert.equal(next.endpoints.find(row=>row.id===endpoint.id).name,'编辑统一保存');
  assert.equal(activeChannelProcurement(current).pricing.scenarios[0].listPrice,0);
  assert.equal(current.procurementRevision,(association.procurementRevision || 0)+1);
  assert.equal(current.procurementVersions.length,(association.procurementVersions?.length || 1)+1);
  for(const row of provider.catalogConnections.filter(row=>row.id!==association.id)) {
    const other = next.providers.find(p=>p.id===provider.id).catalogConnections.find(p=>p.id===row.id);
    for(const key of ['pricing','procurementVersions','procurementRevision','enabled','health']) assert.deepEqual(other[key],row[key]);
  }
  for(const key of ['connectionTest','connectionQualification','baseUrl','candidateConfiguration','apiKeys','authMode']) assert.deepEqual(next.endpoints.find(row=>row.id===endpoint.id)[key],endpoint[key]);
  for(const key of ['modelSalePrices','supplyPrices','modelSupplies','serviceRoutes','callLogs']) assert.deepEqual(next[key],state[key]);
  assert.deepEqual(state,before);
  assert.equal(activeChannelProcurement(parseAdminState(JSON.stringify(next)).providers.find(row=>row.id===provider.id).catalogConnections.find(row=>row.id===association.id)).pricing.scenarios[0].listPrice,0);
});

test('address and purchase edits commit atomically while the current API remains active until candidate validation', () => {
  const state=initial(), {endpoint,provider}=context(state), url='https://edited.example.invalid/v1/chat/completions';
  const next=run(state,{baseUrl:url,scenarios:costs(2)}), updated=next.endpoints.find(row=>row.id===endpoint.id);
  assert.equal(updated.baseUrl,endpoint.baseUrl); assert.equal(updated.candidateConfiguration.config.baseUrl,url);
  assert.equal(updated.status,endpoint.status);
  assert.deepEqual(next.providers.find(row=>row.id===provider.id).apiKeys,provider.apiKeys);
  assert.throws(()=>commitAdminState(next,{type:'modelOperations',operation:'channelCandidateApply',data:{providerId:provider.id,endpointId:endpoint.id,expectedRevision:updated.configurationRevision || 0,candidateId:updated.candidateConfiguration.id,confirmed:true}}),/验证|测试|通过/);
  assert.throws(()=>run(next,{baseUrl:'https://another.example.invalid/v1/chat/completions'}),/已有待验证/);
});

test('invalid costs, URLs, identities and revisions reject the entire editor update', () => {
  const state=initial(), before=structuredClone(state);
  for(const patch of [{baseUrl:''},{baseUrl:'not-a-url',name:'不得部分改名'},{associationId:'foreign'},{modelId:'foreign'},{expectedUpdatedAt:'stale'},{expectedProviderUpdatedAt:'stale'},{expectedPriceRevision:99,scenarios:costs(1)},{scenarios:[]},{scenarios:[{...costs(1)[0],listPrice:''}]},{scenarios:[{...costs(1)[0],unit:''}]}]) {
    assert.throws(()=>run(state,patch));assert.deepEqual(state,before);
  }
});

test('a name-only save does not create purchase history and readonly access cannot edit', () => {
  const state=initial(), {association}=context(state), next=run(state,{name:'仅名称调整'});
  const row=context(next).provider.catalogConnections.find(row=>row.id===association.id);
  for(const key of ['pricing','procurementVersions','procurementRevision'])assert.deepEqual(row[key],association[key]);
  assert.throws(()=>run({...state,currentRole:'只读审计员'},{name:'无权限编辑'}),/权限|账号|无权/);
});

test('preset interfaces retain explicit root-address confirmation before staging a complete task URL', () => {
  const state=initial(), {endpoint}=context(state);
  Object.assign(endpoint,{interfaceType:'openai',addressMode:'base',baseUrl:'https://root.example.invalid/v1',taskUrls:{}});
  const before=structuredClone(state);
  assert.throws(()=>run(state,{baseUrl:'https://changed-root.example.invalid/v1/chat/completions'}),/确认.*根地址/);
  assert.deepEqual(state,before);
  const next=run(state,{baseUrl:'https://changed-root.example.invalid/v1'});
  assert.equal(next.endpoints.find(row=>row.id===endpoint.id).candidateConfiguration.config.baseUrl,'https://changed-root.example.invalid/v1');
  assert.equal(next.endpoints.find(row=>row.id===endpoint.id).baseUrl,endpoint.baseUrl);
});

test('shared key selection stages the chosen group atomically and preserves current keys and other channels', async () => {
  const {providerApiKeysDraft}=await import('../src/admin-v2/provider-management.js');
  const {connectionKeys}=await import('../src/admin-v2/connection-state.js');
  let state=initial();
  const providerId=context(state).provider.id;
  const providerRun=(s,operation,data)=>commitAdminState(s,{type:'modelOperations',operation:'provider',data:{operation,objectId:providerId,values:data}});
  state=providerRun(state,'keyGroupSave',{name:'编辑备用组'});
  const group=context(state).provider.apiKeyGroups.find(row=>row.name==='编辑备用组');
  const key=(await providerApiKeysDraft(['local-editor-shared-key-test-2026'])).apiKeys[0];
  state=providerRun(state,'addApiKeys',{groupId:group.id,apiKeys:[key]});
  const before=structuredClone(state), {endpoint,provider}=context(state);
  const next=run(state,{keyGroupId:group.id,scenarios:costs(0)}), updated=next.endpoints.find(row=>row.id===endpoint.id);
  assert.equal(updated.authMode,endpoint.authMode);assert.equal(updated.apiKeyId,endpoint.apiKeyId);
  assert.deepEqual(connectionKeys(updated,context(next).provider),connectionKeys(endpoint,provider));
  assert.equal(updated.candidateConfiguration.config.authMode,'group');assert.equal(updated.candidateConfiguration.config.keyGroupId,group.id);
  assert.deepEqual(next.providers.find(row=>row.id===provider.id).apiKeys,provider.apiKeys);
  for(const row of state.endpoints.filter(row=>row.id!==endpoint.id))assert.deepEqual(next.endpoints.find(other=>other.id===row.id),row);
  for(const patch of [{keyGroupId:'foreign'},{keyGroupId:''},{keyGroupId:12},{keyGroupId:'foreign',name:'不得部分保存'}])assert.throws(()=>run(state,patch));
  const empty=providerRun(state,'keyGroupSave',{name:'空组'}), emptyId=context(empty).provider.apiKeyGroups.find(row=>row.name==='空组').id;
  assert.throws(()=>run(empty,{keyGroupId:emptyId}),/主要密钥可用/);
  const revoked=structuredClone(state);context(revoked).provider.apiKeys.find(row=>row.fingerprint===key.fingerprint).revokedAt=new Date().toISOString();
  assert.throws(()=>run(revoked,{keyGroupId:group.id}),/主要密钥可用/);
  assert.deepEqual(state,before);
});

test('channel-owned independent credentials remain valid for editing their own address and never leak to a sibling', async () => {
  const {providerApiKeysDraft}=await import('../src/admin-v2/provider-management.js');
  const state=initial(), {provider,association}=context(state), secret='local-owned-editor-key-2026';
  const apiKey=(await providerApiKeysDraft([secret])).apiKeys[0];
  const created=commitAdminState(state,{type:'modelOperations',operation:'supplierChannelRegister',data:{providerId:provider.id,modelId:association.modelId,name:'独立密钥编辑',upstreamModelId:'private/edit-key',baseUrl:'https://owned.example.invalid/v1/chat/completions',authMode:'independent',apiKey,scenarios:costs(1)}});
  const endpoint=created.endpoints.find(row=>!state.endpoints.some(old=>old.id===row.id)), owner=created.providers.find(row=>row.id===provider.id), mapping=supplierChannelAssociations(created,owner,endpoint.id)[0];
  const next=commitAdminState(created,{type:'modelOperations',operation:'supplierChannelEdit',data:{providerId:provider.id,endpointId:endpoint.id,associationId:mapping.id,modelId:mapping.modelId,name:endpoint.name,upstreamModelId:mapping.upstreamModelId,baseUrl:'https://owned-new.example.invalid/v1/chat/completions',expectedUpdatedAt:endpoint.updatedAt,expectedProviderUpdatedAt:owner.updatedAt}});
  const candidate=next.endpoints.find(row=>row.id===endpoint.id).candidateConfiguration;
  assert.equal(candidate.config.apiKeyId,endpoint.apiKeyId);assert.deepEqual(candidate.config.apiKeys,endpoint.apiKeys);
  assert.deepEqual(next.providers.find(row=>row.id===provider.id).apiKeys,owner.apiKeys);assert.equal(JSON.stringify(next).includes(secret),false);
  const sibling=context(state).endpoint;
  assert.throws(()=>commitAdminState(created,{type:'modelOperations',operation:'channelCandidateSave',data:{providerId:provider.id,endpointId:sibling.id,expectedRevision:sibling.configurationRevision || 0,config:{authMode:'specific',apiKeyId:endpoint.apiKeyId}}}),/不属于/);
});

test('inline independent key, address and purchase edits share an atomic candidate without changing live credentials', async () => {
  const {providerApiKeysDraft}=await import('../src/admin-v2/provider-management.js');
  const {connectionKeys}=await import('../src/admin-v2/connection-state.js');
  const {channelCandidateStatus}=await import('../src/admin-v2/channel-change-management.js');
  const state=initial(), {endpoint,provider,association}=context(state), secret='local-unified-independent-key-2026';
  const newApiKey=(await providerApiKeysDraft([secret])).apiKeys[0], before=structuredClone(state);
  const next=run(state,{name:'统一表单编辑',newApiKey,baseUrl:'https://unified.example.invalid/v1/chat/completions',scenarios:costs(0)});
  const updated=next.endpoints.find(row=>row.id===endpoint.id), owner=next.providers.find(row=>row.id===provider.id), candidate=updated.candidateConfiguration;
  assert.equal(updated.baseUrl,endpoint.baseUrl);assert.deepEqual(connectionKeys(updated,owner),connectionKeys(endpoint,provider));
  assert.equal(candidate.config.baseUrl,'https://unified.example.invalid/v1/chat/completions');assert.equal(candidate.config.authMode,'specific');
  assert.equal(owner.apiKeys.find(row=>row.id===candidate.config.apiKeyId).fingerprint,newApiKey.fingerprint);
  assert.equal(owner.defaultApiKeyId,provider.defaultApiKeyId);assert.equal(channelCandidateStatus(next,provider.id,endpoint.id).ready,false);
  assert.equal(activeChannelProcurement(owner.catalogConnections.find(row=>row.id===association.id)).pricing.scenarios[0].listPrice,0);
  for(const row of state.endpoints.filter(row=>row.id!==endpoint.id))assert.deepEqual(next.endpoints.find(other=>other.id===row.id),row);
  assert.deepEqual(next.modelSalePrices,state.modelSalePrices);assert.equal(JSON.stringify(next).includes(secret),false);
  const restored=parseAdminState(JSON.stringify(next));assert.equal(restored.endpoints.find(row=>row.id===endpoint.id).candidateConfiguration.config.apiKeyId,candidate.config.apiKeyId);
  for(const patch of [{newApiKey:{...newApiKey,secret}},{newApiKey:null},{newApiKey,keyGroupId:'default'},{newApiKey,scenarios:[]}]) {
    assert.throws(()=>run(state,patch));assert.deepEqual(state,before);
  }
  assert.throws(()=>run(next,{newApiKey}),/已有待验证/);
});


test('inline credential repair accepts missing old keys and an explicitly corrected root in one candidate', async () => {
  const {providerApiKeysDraft}=await import('../src/admin-v2/provider-management.js');
  const state=initial(), {provider,endpoint}=context(state);
  provider.apiKeys=[];provider.apiKeyGroups=[{id:'default',name:'默认 API 密钥组',keyIds:[]}];provider.defaultApiKeyId='';
  Object.assign(endpoint,{authMode:'group',keyGroupId:'default',apiKeys:[],apiKeyId:'',credentialRef:'',interfaceType:'openai',baseUrl:'https://legacy.example.invalid/v1/chat/completions',taskUrls:{}});
  const newApiKey=(await providerApiKeysDraft(['local-unified-repair-2026'])).apiKeys[0];
  const next=run(state,{newApiKey,baseUrl:'https://repaired.example.invalid/v1'}), candidate=next.endpoints.find(row=>row.id===endpoint.id).candidateConfiguration;
  assert.equal(candidate.config.baseUrl,'https://repaired.example.invalid/v1');assert.equal(candidate.config.authMode,'specific');assert.equal(next.endpoints.find(row=>row.id===endpoint.id).authMode,'group');
  assert.deepEqual(next.providers.find(row=>row.id===provider.id).apiKeyGroups.find(row=>row.id==='default').keyIds,[]);
});
