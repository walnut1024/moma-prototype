import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAdminState, commitAdminState, persistModelAction } from '../src/admin-v2/store.js';
import { withAdminSession } from './admin-session-fixture.mjs';
import { catalogueChannels, supplierDeletionBlock } from '../src/admin-v2/provider-channels.js';
import { displayedCatalogueIds } from '../src/admin-v2/moma-provider.js';
const action = (providerId, operation, values) => ({ type: 'modelOperations', operation: 'provider', data: { operation, objectId: providerId, values } });
const run = (state, providerId, operation, values) => commitAdminState(state, action(providerId, operation, values));
function fixture() {
  let state = withAdminSession(parseAdminState(null));
  state = run(state, null, 'create', { name: '删除校验服务商', code: 'delete-contract', sourceType: 'thirdParty', description: '', catalogModelIds: [] });
  const providerId = state.providers.find(row => row.code === 'delete-contract').id;
  state = run(state, providerId, 'supplierChannelCreate', { name: '删除校验渠道', protocol: 'OpenAI', baseUrl: 'https://delete.example.invalid/v1/chat/completions', authMode: 'inherit', models: [{ libraryId: 'model-2', upstreamModelId: 'vendor/delete', scenarios: [{ name: '输入 Token', listPrice: '0', unit: '百万 Token', currency: 'CNY' }] }] });
  const provider = state.providers.find(row => row.id === providerId), channel = catalogueChannels(state, provider, provider.catalogModelIds[0])[0];
  return { state, providerId, modelId: channel.modelId, channel, values: { modelId: channel.modelId, endpointId: channel.endpointId, associationId: channel.id, confirmed: true } };
}
test('deleting the last channel then its model retains immutable records, other suppliers and the master through refresh', () => {
  const { state, providerId, modelId, channel, values } = fixture(), before = structuredClone(state);
  assert.throws(() => run(state, providerId, 'catalogueRemove', { modelId, confirmed: true }), /先删除.*全部渠道/);
  const next = run(state, providerId, 'supplierCatalogueChannelDelete', values), provider = next.providers.find(row => row.id === providerId);
  assert.equal(catalogueChannels(next, provider, modelId).length, 0);
  const archived = provider.catalogConnections.find(row => row.id === channel.id);
  assert.ok(archived.deletedAt); assert.equal(archived.enabled, false); assert.deepEqual(archived.pricing, channel.pricing);
  assert.ok(next.endpoints.find(row => row.id === channel.endpointId).deletedAt);
  const removed = run(next, providerId, 'catalogueRemove', { modelId, confirmed: true });
  assert.ok(!displayedCatalogueIds(removed.providers.find(row => row.id === providerId), removed).includes(modelId));
  const restored = parseAdminState(JSON.stringify(removed));
  assert.equal(catalogueChannels(restored, restored.providers.find(row => row.id === providerId), modelId).length, 0);
  for (const key of ['models', 'modelTemplates', 'modelSupplies', 'modelSalePrices', 'supplyPrices', 'serviceRoutes']) assert.deepEqual(removed[key], before[key]);
  assert.deepEqual(removed.providers.filter(row => row.id !== providerId), before.providers.filter(row => row.id !== providerId));
  assert.deepEqual(state, before);
});
test('a shared endpoint remains usable by sibling models when one model channel is deleted', () => {
  const { state, providerId, modelId, channel, values } = fixture();
  const shared = run(state, providerId, 'supplierModelsAdd', { endpointId: channel.endpointId, models: [{ libraryId: 'model-3', upstreamModelId: 'vendor/other', scenarios: [] }] });
  const sibling = shared.providers.find(row => row.id === providerId).catalogConnections.find(row => row.modelId !== modelId && !row.deletedAt);
  const next = run(shared, providerId, 'supplierCatalogueChannelDelete', values);
  assert.deepEqual(next.endpoints, shared.endpoints);
  assert.deepEqual(next.providers.find(row => row.id === providerId).catalogConnections.find(row => row.id === sibling.id), sibling);
  assert.equal(catalogueChannels(next, next.providers.find(row => row.id === providerId), modelId).length, 0);
  next.endpoints.find(row => row.id === channel.endpointId).serverTestJobs = [{ id: 'sibling-test', associationIds: [sibling.id] }];
  assert.doesNotThrow(() => run(next, providerId, 'catalogueRemove', { modelId, confirmed: true }));
});
test('existing service mappings block deletion regardless of listing, visibility, serving or supply activation', () => {
  const { state, providerId, modelId, channel, values } = fixture();
  for (const [listingStatus, status] of [['已上架', '已启用'], ['已下架', '已停用'], ['未上架', '待验证']]) {
    const current = structuredClone(state), service = current.models[0];
    Object.assign(service, { listingStatus, marketVisible: false, callsEnabled: false });
    current.modelSupplies.push({ id: 'blocked-binding', modelId: service.id, providerId, endpointId: channel.endpointId, channelId: channel.id, catalogueModelId: modelId, upstreamModelId: 'stale-upstream-identity', status });
    const before = structuredClone(current);
    assert.throws(() => run(current, providerId, 'supplierCatalogueChannelDelete', values), /模型服务.*下架或停服不会解除关联/);
    assert.deepEqual(current, before);
  }
});
test('a provider association alone also protects a model without channels until explicitly unbound', () => {
  const { state, providerId, modelId, values } = fixture();
  const next = run(state, providerId, 'supplierCatalogueChannelDelete', values), service = next.models.find(row => row.id === 'model-2');
  Object.assign(service, { serviceMode: 'provider', listingStatus: '已下架', serviceProviders: [{ providerId, status: '已关联', marketVisible: false, callsEnabled: false }] });
  assert.throws(() => run(next, providerId, 'catalogueRemove', { modelId, confirmed: true }), /模型服务/);
  service.serviceProviders[0].status = '已移除';
  assert.doesNotThrow(() => run(next, providerId, 'catalogueRemove', { modelId, confirmed: true }));
});
test('current route references including disabled rows and drafts block deletion; retired route history does not', () => {
  const { state, providerId, channel, values } = fixture();
  for (const mode of ['active', 'draft']) {
    const current = structuredClone(state), config = { channels: [{ supplyId: channel.id, enabled: false }] };
    current.serviceRoutes.push({ id: 'delete-route', serviceId: 'standard:model-2', activeVersion: mode === 'active' ? 1 : 0, versions: [{ version: 1, config }], draft: mode === 'draft' ? config : null });
    assert.throws(() => run(current, providerId, 'supplierCatalogueChannelDelete', values), /路由引用/);
  }
  const archived = structuredClone(state);
  archived.modelSupplies.push({ id: 'removed-binding', modelId: 'model-2', providerId, endpointId: channel.endpointId, channelId: channel.id, catalogueModelId: channel.modelId, status: '已移除' });
  archived.serviceRoutes.push({ id: 'old-route', serviceId: 'standard:model-2', activeVersion: 0, versions: [{ version: 1, config: { channels: [{ supplyId: channel.id, enabled: true }] } }], draft: null });
  assert.doesNotThrow(() => run(archived, providerId, 'supplierCatalogueChannelDelete', values));
});
test('pending onboarding, unfinished tests, foreign IDs, missing confirmation, readonly and storage failures cannot partially delete', () => {
  const { state, providerId, modelId, channel, values } = fixture(), provider = state.providers.find(row => row.id === providerId);
  const onboarding = structuredClone(state); onboarding.modelOnboardings.push({ id: 'active-onboarding', status: '配置中', providerId, catalogueModelId: modelId, endpointId: channel.endpointId });
  assert.throws(() => run(onboarding, providerId, 'supplierCatalogueChannelDelete', values), /未完成的接入任务/);
  const testing = structuredClone(state); testing.endpoints.find(row => row.id === channel.endpointId).serverTestJobs = [{ id: 'pending-test', associationIds: [channel.id] }];
  assert.throws(() => run(testing, providerId, 'supplierCatalogueChannelDelete', values), /检测任务未完成/);
  for (const patch of [{ confirmed: false }, { associationId: 'foreign' }, { endpointId: 'foreign' }, { modelId: 'foreign' }]) assert.throws(() => run(state, providerId, 'supplierCatalogueChannelDelete', { ...values, ...patch }));
  assert.equal(supplierDeletionBlock(state, provider, modelId, channel).message, '');
  assert.throws(() => commitAdminState({ ...state, currentRole: '只读审计员' }, action(providerId, 'supplierCatalogueChannelDelete', values)), /无权|权限/);
  const before = JSON.stringify(state), command = action(providerId, 'supplierCatalogueChannelDelete', values);
  assert.throws(() => persistModelAction(state, command, { getItem: () => before, setItem: () => { throw Error('quota'); } }), /quota/);
  assert.throws(() => persistModelAction(state, command, { getItem: () => JSON.stringify({ ...state, revision: state.revision + 1 }), setItem: () => assert.fail() }), /数据已变化/);
  assert.equal(JSON.stringify(state), before);
});
