import test from 'node:test';
import assert from 'node:assert/strict';
import { initialModelWorkspace } from '../server/model-repository.js';
import { commitAdminState } from '../src/admin-v2/state-transaction.js';
import { modelCatalogue, libraryRecord } from '../src/admin-v2/model-library.js';
import { supplyModelDirectory, serviceModelSources } from '../src/admin-v2/supply-models.js';
import { modelOperationsView } from '../src/mock/model-data.js';
import { serviceModelSourceDraft } from '../src/admin-v2/model-profile.js';
import { serviceDirectoryModels } from '../src/admin-v2/service-workspace.js';
import { catalogueMappingRows } from '../src/admin-v2/channel-selection.js';
import { supplierDirectory } from '../src/admin-v2/moma-provider.js';
import { supplierModelChannelGroups } from '../src/admin-v2/supplier-model-channel-table.js';
import { supplierDeletionBlock } from '../src/admin-v2/provider-channels.js';

test('materials contain seventeen masters while model onboarding lists only registered models and their actual supplier channels', () => {
  const state=initialModelWorkspace(),before=structuredClone(state),directory=supplyModelDirectory(state);
  assert.equal(modelCatalogue(state).length,17);
  assert.deepEqual(directory.map(row=>row.name),['DeepSeek-V4-Flash-0731','GLM-5.3']);
  for(const model of directory){
    const rows=catalogueMappingRows(state,null,model.entries);
    assert.equal(rows.length,3);
    assert.ok(rows.every(row=>row.association));
    assert.equal(rows.filter(row=>row.provider.id==='provider-moma').length,2);
    assert.equal(new Set(rows.map(row=>row.selectionId)).size,rows.length);
    assert.ok(rows.every(row=>row.model.id===model.master.id));
    assert.ok(rows.every(row=>row.association.upstreamModelId && row.association.endpointId));
  }
  assert.deepEqual(state,before);
});
test('supplier registration adds the selected material to the aggregated view, even before a channel exists; removal only removes the aggregation', () => {
  const state=initialModelWorkspace(),id='builtin-pp-ocrv6';
  const next=commitAdminState(state,{type:'modelOperations',operation:'supplierModelsRegister',data:{providerId:'provider-moma',libraryIds:[id]}},'平台管理员');
  const model=supplyModelDirectory(next).find(row=>row.id===id);
  assert.ok(model);assert.equal(model.entries.length,1);
  const rows=catalogueMappingRows(next,null,model.entries);
  assert.equal(rows.length,1);assert.equal(rows[0].association,null);assert.equal(rows[0].provider.id,'provider-moma');
  assert.deepEqual(modelCatalogue(next),modelCatalogue(state));
  for(const key of ['models','modelTemplates','endpoints','modelSupplies','modelSalePrices','serviceRoutes'])assert.deepEqual(next[key],state[key]);
  const removed=commitAdminState(next,{type:'modelOperations',operation:'provider',data:{operation:'catalogueRemove',objectId:'provider-moma',values:{modelId:'pp-ocrv6',confirmed:true}}},'平台管理员');
  assert.ok(!supplyModelDirectory(removed).some(row=>row.id===id));assert.ok(libraryRecord(removed,id));
  assert.deepEqual(supplyModelDirectory(JSON.parse(JSON.stringify(removed))).map(row=>row.id),supplyModelDirectory(state).map(row=>row.id));
});
test('registered historical model masters reuse their service identity and retain a separate unchanged master',()=>{
  const initial=initialModelWorkspace(),id='model-2';
  const state=commitAdminState(initial,{type:'modelOperations',operation:'supplierModelsRegister',data:{providerId:'provider-moma',libraryIds:[id]}},'平台管理员');
  const master=serviceModelSources(state).find(row=>row.id===id);
  assert(master);assert(!modelOperationsView(state).models.some(row=>row.id===id));
  const before=structuredClone(state),data={...serviceModelSourceDraft(state,master),libraryId:id};
  assert.equal(data.modelId,master.modelId);
  const saved=commitAdminState(state,{type:'modelOperations',operation:'createServiceModel',data},'平台管理员');
  const service=serviceDirectoryModels(saved).find(row=>row.templateId===id);
  assert(service);assert.equal(service.id,id);assert.equal(service.modelId,data.modelId);
  assert.equal(service.callsEnabled,false);assert.equal(service.listingStatus,'已下架');
  const retained=libraryRecord(saved,id);for(const key of ['id','modelId','name','profile','capabilities'])assert.deepEqual(retained[key],master[key],key);
  assert.equal(modelCatalogue(saved).filter(row=>row.id===id).length,1);
  for(const key of ['providers','endpoints','modelSupplies','modelSalePrices','serviceRoutes'])assert.deepEqual(saved[key],state[key],key);
  assert.throws(()=>commitAdminState(saved,{type:'modelOperations',operation:'createServiceModel',data:{...data,modelId:'another-service'}},'平台管理员'),/已有模型服务/);
  assert.deepEqual(state,before);
  const occupied=structuredClone(state);occupied.models.push({id:'occupied',modelId:data.modelId.toUpperCase()},{id:'occupied2',modelId:master.modelId+'-service'});
  assert.equal(serviceModelSourceDraft(occupied,master).modelId,master.modelId+'-service-2');
});

test('supplier and model perspectives share the same canonical registrations and channel mappings without changing historical records', () => {
  const state=initialModelWorkspace(),before=structuredClone(state),providers=supplierDirectory(state).filter(row=>!row.id.startsWith('service-review-provider-'));
  const directory=supplyModelDirectory(state,providers);
  for(const provider of providers){
    const groups=supplierModelChannelGroups(state,provider).filter(row=>row.modelId);
    const models=directory.filter(row=>row.entries.some(entry=>entry.provider.id===provider.id));
    assert.deepEqual(groups.map(row=>row.master?.id),models.map(row=>row.master?.id),provider.name);
    for(const group of groups){
      const model=models.find(row=>row.id===group.master.id);
      const rows=catalogueMappingRows(state,null,model.entries).filter(row=>row.provider.id===provider.id);
      assert.deepEqual(group.channels.map(row=>row.id).sort(),rows.filter(row=>row.association).map(row=>row.association.id).sort());
    }
  }
  assert.deepEqual(state,before);
});

test('aliases of the same master share one supplier group while keeping custom names and each original channel identity', () => {
  const state=initialModelWorkspace(),provider=state.providers.find(row=>row.id==='provider-moma');
  const master=supplyModelDirectory(state).find(row=>row.code==='deepseek-v4-flash-0731').master;
  provider.catalogModelIds.push('manual-alias');
  provider.catalogModels.push({modelId:'manual-alias',libraryId:master.id,displayName:'保留的服务商名称'});
  const existing=provider.catalogConnections.find(row=>row.modelId==='deepseek-v4-flash-0731');
  provider.catalogConnections.push({...structuredClone(existing),id:'manual-channel-alias',modelId:'manual-alias',upstreamModelId:'manual/upstream-id'});
  const before=structuredClone(state),groups=supplierModelChannelGroups(state,provider).filter(row=>row.master?.id===master.id);
  assert.equal(groups.length,1);
  assert.equal(groups[0].name,'保留的服务商名称');
  assert.ok(groups[0].channels.some(row=>row.id==='manual-channel-alias'&&row.modelId==='manual-alias'&&row.upstreamModelId==='manual/upstream-id'));
  assert.equal(new Set(groups[0].channels.map(row=>row.id)).size,3);
  assert.deepEqual(state,before);
});

test('removing a supplier model checks every canonical alias and removes the registration atomically after channels are deleted', () => {
  const state=initialModelWorkspace(),provider=state.providers.find(row=>row.id==='provider-moma'),id='builtin-pp-ocrv6';
  let next=commitAdminState(state,{type:'modelOperations',operation:'supplierModelsRegister',data:{providerId:provider.id,libraryIds:[id]}},'平台管理员');
  const owner=next.providers.find(row=>row.id===provider.id);
  owner.catalogModelIds.push('pp-ocr-alias');
  owner.catalogModels.push({modelId:'pp-ocr-alias',libraryId:id,name:'PP-OCRv6'});
  const endpoint=next.endpoints.find(row=>row.providerId===provider.id);
  owner.catalogConnections.push({id:'alias-deletion-check',modelId:'pp-ocr-alias',endpointId:endpoint.id,enabled:false});
  const remove={type:'modelOperations',operation:'provider',data:{operation:'catalogueRemove',objectId:provider.id,values:{modelId:'pp-ocrv6',confirmed:true}}};
  assert.match(supplierDeletionBlock(next,owner,'pp-ocrv6').message,/全部渠道/);
  assert.throws(()=>commitAdminState(next,remove,'平台管理员'),/全部渠道/);
  owner.catalogConnections.find(row=>row.id==='alias-deletion-check').deletedAt='2026-11-01';
  const before=structuredClone(next);
  next=commitAdminState(next,remove,'平台管理员');
  assert.ok(!supplyModelDirectory(next).some(row=>row.id===id));
  const updated=next.providers.find(row=>row.id===provider.id);
  assert.ok(['pp-ocrv6','pp-ocr-alias'].every(code=>updated.removedCatalogModelIds.includes(code)));
  assert.deepEqual(updated.catalogModels,before.providers.find(row=>row.id===provider.id).catalogModels);
  for(const key of ['models','modelTemplates','endpoints','modelSupplies','modelSalePrices','serviceRoutes'])assert.deepEqual(next[key],before[key]);
  assert.ok(libraryRecord(next,id));
});

test('channels of archived models stay linked and retain their configuration instead of appearing as unlinked resources', () => {
  const state=initialModelWorkspace(),provider=state.providers.find(row=>row.id==='provider-moma');
  const model=supplyModelDirectory(state).find(row=>row.code==='deepseek-v4-flash-0731');
  state.modelData.archivedCatalogueIds.push(model.id);
  const before=structuredClone(state),groups=supplierModelChannelGroups(state,provider);
  assert.ok(!groups.some(row=>row.master?.id===model.id));
  const current=supplierModelChannelGroups(before,provider).flatMap(row=>row.channels).map(row=>row.id);
  const archivedChannels=provider.catalogConnections.filter(row=>row.modelId==='deepseek-v4-flash-0731');
  assert.ok(archivedChannels.length);
  assert.ok(archivedChannels.every(row=>!current.includes(row.id)));
  assert.ok(!groups.filter(row=>!row.modelId).flatMap(row=>row.channels).some(row=>archivedChannels.some(item=>item.endpointId===row.endpointId)));
  assert.deepEqual(state,before);
});
