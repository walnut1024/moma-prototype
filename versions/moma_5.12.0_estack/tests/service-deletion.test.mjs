import { serviceReferences } from '../src/service-access.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { initialModelWorkspace } from '../server/model-repository.js';
import { commitAdminState } from '../src/admin-v2/state-transaction.js';
import { serviceDirectoryModels, serviceSourceIds } from '../src/admin-v2/service-workspace.js';

const run = (state, operation, data, modelId) => commitAdminState(state, { type: 'modelOperations', operation, data, modelId }, '平台管理员');
function fixture() {
  let state = initialModelWorkspace();
  state = run(state, 'supplierModelsRegister', { providerId: 'provider-moma', libraryIds: ['builtin-pp-ocrv6'] });
  state = run(state, 'createServiceModels', { libraryIds: ['builtin-pp-ocrv6'], serviceMode: 'standard' });
  return { state, model: state.models.find(row => row.templateId === 'builtin-pp-ocrv6') };
}

test('deletion hides the service, preserves master, supply and history, and prevents legacy re-creation', () => {
  const { state, model } = fixture(), before = structuredClone(state);
  const deleted = run(state, 'serviceDelete', { expectedUpdatedAt: model.updatedAt, confirmed: true }, model.id);
  assert.ok(deleted.models.find(row => row.id === model.id).deletedAt);
  assert(!serviceDirectoryModels(deleted).some(row => row.id === model.id));
  assert(!serviceSourceIds(deleted).has(model.templateId));
  for (const key of ['modelTemplates', 'providers', 'endpoints', 'modelVersions', 'modelSalePrices', 'serviceRoutes']) assert.deepEqual(deleted[key], before[key]);
  assert.deepEqual(state, before);
  const removed = structuredClone(deleted);
  assert.throws(() => run(deleted, 'createServiceModels', { libraryIds: [model.templateId], serviceMode: 'provider' }), /删除后不可恢复/);
  assert.deepEqual(deleted, removed);
});

test('deletion requires confirmation, current revision and permission, and refuses active configuration', () => {
  const { state, model } = fixture(), data = { expectedUpdatedAt: model.updatedAt, confirmed: true };
  for (const patch of [{ confirmed: false }, { expectedUpdatedAt: 'stale' }]) assert.throws(() => run(state, 'serviceDelete', { ...data, ...patch }, model.id), /修订|确认/);
  for (const patch of [{ callsEnabled: true }, { listingStatus: '已上架' }]) assert.throws(() => run({ ...state, models: state.models.map(row => row.id === model.id ? { ...row, ...patch } : row) }, 'serviceDelete', data, model.id), /停止|停售/);
  assert.throws(() => commitAdminState(state, { type: 'modelOperations', operation: 'serviceDelete', modelId: model.id, data }, '只读观察员'), /无权/);
  const deleted = run(state, 'serviceDelete', data, model.id);
  assert.throws(() => run(deleted, 'serviceDelete', data, model.id), /已删除/);
});

test('existing deletion rules still allow deleting an unused historical archived service', () => {
  const { state, model } = fixture();
  model.archivedAt = '2026-11-01T00:00:00.000Z';
  const deleted = run(state, 'serviceDelete', { expectedUpdatedAt: model.updatedAt, confirmed: true }, model.id);
  const removed = deleted.models.find(row => row.id === model.id);
  assert.ok(removed.deletedAt);
  assert.equal(removed.archivedAt, model.archivedAt);
  assert(!serviceDirectoryModels(deleted).some(row => row.id === model.id));
});


test('permanent service ID deletion preserves sibling entries and guards launch, listing, routes and identities', () => {
 const {state,model}=fixture(), provider=state.providers[0];
 Object.assign(model,{serviceMode:'provider',callsEnabled:false,listingStatus:'已下架',serviceProviders:[{providerId:provider.id,channelId:'channel-a',channelName:'账号 A',callId:'call-a',callsEnabled:false,listingStage:'unlisted'},{providerId:provider.id,channelId:'channel-b',channelName:'账号 B',callId:'call-b',callsEnabled:false,listingStage:'unlisted'}]});
 const [first,second]=serviceReferences(state).filter(row=>row.modelId===model.id), before=structuredClone(state), data={expectedUpdatedAt:model.updatedAt,confirmed:true,model_service_id:first.model_service_id};
 const next=run(state,'serviceDelete',data,model.id), updated=next.models.find(row=>row.id===model.id);
 assert(!updated.deletedAt);assert.equal(updated.serviceProviders.find(row=>row.channelId==='channel-a').status,'已移除');assert.deepEqual(updated.serviceProviders.find(row=>row.channelId==='channel-b'),model.serviceProviders[1]);assert(serviceReferences(next).some(row=>row.model_service_id===second.model_service_id));
 for(const key of ['modelTemplates','providers','endpoints','modelSalePrices','supplyPrices','orders'])assert.deepEqual(next[key],state[key]);
 for(const model_service_id of ['',null,'model_service-missing'])assert.throws(()=>run(state,'serviceDelete',{...data,model_service_id},model.id),/ID|归属/);
 for(const patch of [{confirmed:false},{expectedUpdatedAt:'stale'}])assert.throws(()=>run(state,'serviceDelete',{...data,...patch},model.id),/确认|修订/);
 const started=structuredClone(state);started.models.find(row=>row.id===model.id).callsEnabled=true;started.models.find(row=>row.id===model.id).serviceProviders[0].callsEnabled=true;assert.throws(()=>run(started,'serviceDelete',data,model.id),/停止/);
 const listed=structuredClone(state);listed.models.find(row=>row.id===model.id).serviceProviders[0].listingStage='formal';assert.throws(()=>run(listed,'serviceDelete',data,model.id),/停售/);
 const routed={...state,serviceRoutes:[{id:'route-a',serviceId:first.id,draft:{}}]};assert.throws(()=>run(routed,'serviceDelete',data,model.id),/路由/);
 assert.deepEqual(state,before);
});
