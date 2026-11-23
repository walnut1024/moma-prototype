import test from 'node:test';
import assert from 'node:assert/strict';
import { initialModelWorkspace, modelSupplyRelations } from '../server/model-repository.js';
import { commitAdminState } from '../src/admin-v2/state-transaction.js';
import { channelIdentity } from '../src/model-identities.mjs';
import { channelManagementDirectory, supplierModelChannelRows } from '../src/admin-v2/supplier-model-channel-table.js';

const fixture = () => {
  const state=initialModelWorkspace(),provider=state.providers.find(row=>row.id==='provider-moma');
  return {state,provider,groups:channelManagementDirectory(state,[provider],modelSupplyRelations(state)).byProvider.get(provider.id)};
};

test('provider rows retain one record per model channel, including shared connections, without changing any IDs or business data', () => {
  const {state,groups}=fixture(),before=structuredClone(state),rows=supplierModelChannelRows(state,groups);
  assert.equal(rows.length,groups.filter(group=>group.modelId).reduce((count,group)=>count+group.channels.length,0));
  assert.equal(new Set(rows.map(row=>row.id)).size,rows.length);
  assert(rows.filter(row=>row.group.name==='GLM-5.3').length>1);
  assert(new Set(rows.map(row=>row.channel.endpointId)).size<rows.length,'shared connection must not collapse channels');
  for(const row of rows){assert.equal(row.id,row.channel.id);assert(row.group.channels.includes(row.channel));}
  assert.deepEqual(state,before);
});

test('channel search filters individual sources and supports canonical names, permanent IDs and actual upstream URLs', () => {
  const {state,groups}=fixture(),all=supplierModelChannelRows(state,groups),first=all[0];
  first.channel.sourceName='仅此连接';
  assert.deepEqual(supplierModelChannelRows(state,groups,'仅此连接').map(row=>row.id),[first.id]);
  assert.deepEqual(supplierModelChannelRows(state,groups,channelIdentity(state,first.id)).map(row=>row.id),[first.id]);
  const model=first.group.master.modelId;
  assert(supplierModelChannelRows(state,groups,model).every(row=>row.group.master.modelId===model));
  assert(supplierModelChannelRows(state,groups,first.channel.endpoint.baseUrl).some(row=>row.id===first.id));
  assert.deepEqual(supplierModelChannelRows(state,groups,'不存在的模型或连接'),[]);
});

test('zero-channel registrations remain pending and can be removed without introducing fake channel records or deleting other suppliers', () => {
  const {state,provider,groups}=fixture();
  const registered=commitAdminState(state,{type:'modelOperations',operation:'supplierModelsRegister',data:{providerId:provider.id,libraryIds:['builtin-pp-ocrv6']}},'平台管理员');
  const owner=registered.providers.find(row=>row.id===provider.id),nextGroups=channelManagementDirectory(registered,[owner],modelSupplyRelations(registered)).byProvider.get(owner.id);
  assert(!nextGroups.some(group=>group.id==='builtin-pp-ocrv6'));
  assert(modelSupplyRelations(registered).models.some(row=>row.materialId==='builtin-pp-ocrv6'));
  assert.deepEqual(supplierModelChannelRows(registered,nextGroups).map(row=>row.id),supplierModelChannelRows(state,groups).map(row=>row.id));
  const removed=commitAdminState(registered,{type:'modelOperations',operation:'provider',data:{operation:'catalogueRemove',objectId:provider.id,values:{modelId:'pp-ocrv6',confirmed:true}}},'平台管理员');
  assert.deepEqual(removed.providers.filter(row=>row.id!==provider.id),registered.providers.filter(row=>row.id!==provider.id));
  assert.deepEqual(removed.endpoints,registered.endpoints);
  assert.deepEqual(removed.modelTemplates,registered.modelTemplates);
});
