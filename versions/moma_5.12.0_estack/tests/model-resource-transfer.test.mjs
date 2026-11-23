import test from 'node:test';
import assert from 'node:assert/strict';
import { commitAdminState } from '../src/admin-v2/store.js';
import { withAdminSession } from './admin-session-fixture.mjs';
import { modelServiceIdentity, modelIdentity, modelPresentation } from '../src/model-identities.mjs';
import { exportModelResources, importModelResources, resourceFieldChanges } from '../src/admin-v2/model-resource-transfer.js';
import { operationsTransaction } from '../src/admin-v2/model-operations.js';
import { projectModelState, initialModelWorkspace } from '../server/model-repository.js';
import { resourceId } from '../src/resource-id.mjs';
import { serviceDirectoryRows } from '../src/admin-v2/service-directory.js';
import { resourceKey } from '../src/admin-v2/model-resource-scope.js';

const seed = () => { const state = initialModelWorkspace(); state.currentRole = '平台管理员'; return withAdminSession(state); };
const plan = (state, file) => importModelResources(state, file, operationsTransaction);
const commit = (state, file) => commitAdminState(state, { type: 'modelOperations', operation: 'importModelResources', data: { file } }, '平台管理员');

test('resource DTOs preserve stored identities and export round trips do not write', () => {
  const state = seed(), before = structuredClone(state);
  for (const scope of ['channels', 'services', 'market', 'prices']) {
    const file = exportModelResources(state, scope);
    assert(file.rows.length > 0, scope);
    assert.equal(new Set(file.rows.map(resourceKey)).size, file.rows.length);
    assert.deepEqual(plan(state, JSON.parse(JSON.stringify(file))).changes, []);
  }
  assert.deepEqual(state, before);
});

test('batch channel maintenance previews a changed field without mutating the saved connection', () => {
  const state = seed(), file = exportModelResources(state, 'channels');
  const connection = file.rows.find(row => row.type === 'connection');
  const before = connection.name;
  connection.name = '本地核对';
  assert.deepEqual(resourceFieldChanges(state, file), [{
    key: resourceKey(connection) + ':name', id: connection.id, type: 'connection', field: 'name', before, after: '本地核对',
  }]);
  assert.equal(exportModelResources(state, 'channels').rows.find(row => resourceKey(row) === resourceKey(connection)).name, before);
});

test('renaming a public call keeps model and service IDs, price owners and routes', () => {
  const state = seed(), model = state.models.find(row => row.serviceMode === 'standard');
  model.listingStatus = '已下架'; model.callsEnabled = false;
  const key = modelServiceIdentity(state, model);
  state.modelData.resourceIds ||= {}; state.modelData.resourceIds[key] = 'model_service-56880aeb-c507-4949-9ef2-12420fa683fc';
  const file = exportModelResources(state, 'services');
  file.rows = file.rows.filter(row => row.model_service_config_id === model.id);
  file.rows[0].call_id = 'renamed-call-with-stable-owner';
  const next = commit(state, file), current = next.models.find(row => row.id === model.id);
  assert.equal(current.modelId, file.rows[0].call_id);
  assert.equal(modelServiceIdentity(next, current), 'model_service-56880aeb-c507-4949-9ef2-12420fa683fc');
  assert.deepEqual(modelIdentity(next, current), modelIdentity(state, model));
  assert.deepEqual(next.modelSalePrices, state.modelSalePrices);
  assert.deepEqual(next.serviceRoutes, state.serviceRoutes);
  assert.equal(projectModelState(next).offers.get('model_service-56880aeb-c507-4949-9ef2-12420fa683fc').id, file.rows[0].call_id);
});

test('imports reject stale revisions, duplicate and unknown IDs and inconsistent parents atomically', () => {
  const state = seed(), before = structuredClone(state), base = exportModelResources(state, 'services');
  const stale = structuredClone(base); stale.revision--;
  assert.throws(() => plan(state, stale), /版本/);
  const duplicate = structuredClone(base); duplicate.rows = [duplicate.rows[0], duplicate.rows[0]];
  assert.throws(() => plan(state, duplicate), /重复/);
  const unknown = structuredClone(base); unknown.rows[0].id = 'another-service';
  assert.throws(() => plan(state, unknown), /不存在/);
  const foreign = structuredClone(base); foreign.rows[0].model_id = 'another-model';
  assert.throws(() => plan(state, foreign), /归属/);
  assert.deepEqual(state, before);
});

test('canonical model_service IDs stay identical in rows, exports and maintenance', () => {
  for (const storedId of [resourceId('model_service')]) {
    const state = seed(), model = state.models.find(row => row.serviceMode === 'standard');
    model.listingStatus = '已下架'; model.callsEnabled = false;
    const legacy = modelServiceIdentity(state, model), id = storedId || legacy;
    state.modelData.resourceIds ||= {}; state.modelData.resourceIds[legacy] = id;
    const before = projectModelState(state), file = exportModelResources(state, 'services');
    file.rows = file.rows.filter(row => row.id === id);
    assert.equal(file.rows.length, 1);
    file.rows[0].call_id = 'renamed-with-original-permanent-id';
    const next = commit(state, file), saved = next.models.find(row => row.id === model.id);
    assert.equal(serviceDirectoryRows([saved], next)[0].model_service_id, id);
    assert.equal(projectModelState(next, before).offers.get(id).record_id, id);
    for (const scope of ['services', 'market', 'prices']) {
      const exported = exportModelResources(next, scope);
      assert(exported.rows.some(row => row.id === id));
      assert.deepEqual(plan(next, exported).changes, []);
    }
    assert.deepEqual(next.modelSalePrices, state.modelSalePrices);
    assert.deepEqual(next.serviceRoutes, state.serviceRoutes);
  }
});

test('market content belongs to the marketplace and never overwrites reference material', () => {
  const state = seed(), before = structuredClone(state.modelTemplates), file = exportModelResources(state, 'market');
  file.rows = [file.rows[0]]; file.rows[0].name = '运营维护的展示名'; file.rows[0].description = '广场独立内容';
  const next = commit(state, file), model = next.models.find(row => modelIdentity(next, row).id === file.rows[0].model_id);
  assert.equal(modelPresentation(next, model).name, file.rows[0].name);
  assert.deepEqual(next.modelTemplates, before);
  (next.modelTemplates.find(row => row.id === model.templateId) || model).name = '资料库后续更新';
  assert.equal(modelPresentation(next, model).name, file.rows[0].name);
  assert.deepEqual(next.serviceRoutes, state.serviceRoutes);
  const visibility = exportModelResources(next,'market');
  visibility.rows = [visibility.rows.find(row=>row.type==='market_service' && row.model_id===file.rows[0].model_id)];
  visibility.rows[0].market_visible = false;
  const hidden = commit(next,visibility);
  assert.equal(exportModelResources(hidden,'market').rows.find(row=>row.type==='market_service' && row.id===visibility.rows[0].id).market_visible,false);
  assert.deepEqual(hidden.modelSalePrices,next.modelSalePrices);
  assert.deepEqual(hidden.serviceRoutes,next.serviceRoutes);
});

test('unknown mutable fields cannot smuggle IDs, credentials or lifecycle changes', () => {
  const state = seed(), file = exportModelResources(state, 'services');
  file.rows[0].api_key = 'must-not-enter-maintenance';
  assert.throws(() => plan(state, file), /未知字段/);
  assert.throws(() => commitAdminState(state, { type: 'modelOperations', operation: 'importModelResources', data: { file } }, '只读观察员'), /无权/);
  assert.throws(() => commitAdminState(state, { type: 'update', collection: 'providers', id: state.providers[0].id,
    changes: { id: 'rewritten-permanent-id' } }, '平台管理员'), /永久 ID/);
});

test('channel metadata maintenance preserves channel IDs, procurement history and connections', () => {
  const state = seed(), file = exportModelResources(state, 'channels');
  const row = file.rows.find(item => item.type === 'channel' && item.model_id);
  file.rows = [{ ...row, name: '按永久编号维护连接' }];
  const beforeProvider = state.providers.find(item => item.id === row.provider_id);
  const next = commit(state, file), after = exportModelResources(next, 'channels').rows.find(item => item.type === 'channel' && item.id === row.id);
  assert.equal(after.name, file.rows[0].name); assert.equal(after.connection_id, row.connection_id);
  assert.deepEqual(next.supplyPrices, state.supplyPrices);
  const provider = next.providers.find(item => item.id === row.provider_id);
  assert.deepEqual(provider.catalogConnections.map(item => item.procurementVersions), beforeProvider.catalogConnections.map(item => item.procurementVersions));
});

test('sale maintenance creates a new version on the same service without changing historical prices', () => {
  const state = seed(), file = exportModelResources(state, 'prices');
  const row = file.rows.find(item => item.items.length && state.models.find(model => model.id === item.model_service_config_id)?.serviceMode === 'standard');
  assert(row); file.rows = [structuredClone(row)]; file.rows[0].items[0].amount = String(Number(row.items[0].amount) + 1);
  const before = structuredClone(state.modelSalePrices), next = commit(state, file);
  for (const historical of before) assert.deepEqual(next.modelSalePrices.find(item=>item.id===historical.id),historical);
  assert.equal(next.modelSalePrices.length, before.length + 1);
  assert.equal(exportModelResources(next,'prices').rows.find(item=>item.id===row.id).model_service_id,row.model_service_id);
});

test('relation imports reject foreign model IDs and repeated relation rows', () => {
  const state = seed(), service = exportModelResources(state,'services').rows[0];
  const channel = exportModelResources(state,'channels').rows.find(item=>item.type==='channel' && item.model_id && item.model_id!==service.model_id);
  const file = {...exportModelResources(state,'services'),operation:'link',rows:[{model_service_id:service.id,channel_id:channel.id}]};
  assert.throws(()=>plan(state,file),/同一模型/);
  assert.throws(()=>plan(state,{...file,rows:[{model_service_id:'missing',channel_id:channel.id}]}),/不存在/);
});

test('valid relation imports create one inactive mapping and repeated links do not duplicate it', () => {
  const state = seed(), services = exportModelResources(state,'services').rows;
  const channel = exportModelResources(state,'channels').rows.find(row=>row.type==='channel' && row.model_id && row.canonical_slug==='glm-5.3');
  const service = services.find(row=>row.model_id===channel.model_id && row.provider_id===channel.provider_id);
  const provider = state.providers.find(row=>row.id===channel.provider_id);
  const association = provider.catalogConnections.find(row=>row.endpointId===channel.connection_id && row.upstreamModelId===channel.upstream_model_id);
  state.modelData.mappingIds ||= {}; state.modelData.mappingIds[association.id] = channel.id;
  state.modelSupplies = state.modelSupplies.filter(row=>row.modelId!==service.model_service_config_id);
  const file = {...exportModelResources(state,'services'),operation:'link',rows:[{model_service_id:service.id,channel_id:channel.id}]};
  const next = commit(state,file), mapping = next.modelSupplies.find(row=>row.modelId===service.model_service_config_id && row.channelId===association.id);
  assert(mapping); assert.equal(mapping.status,'已停用'); assert.equal(mapping.validationStatus,'待验证');
  assert.deepEqual(next.serviceRoutes,state.serviceRoutes); assert.deepEqual(next.modelSalePrices,state.modelSalePrices);
  assert.deepEqual(plan(next,{...exportModelResources(next,'services'),operation:'link',rows:file.rows}).changes,[]);
});
