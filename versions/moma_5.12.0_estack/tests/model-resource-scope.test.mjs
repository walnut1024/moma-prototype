import test from 'node:test';
import assert from 'node:assert/strict';
import { initialModelWorkspace, modelSupplyRelations } from '../server/model-repository.js';
import { withAdminSession } from './admin-session-fixture.mjs';
import { exportModelResources, importModelResources } from '../src/admin-v2/model-resource-transfer.js';
import { resourcePageTarget, resourceKey } from '../src/admin-v2/model-resource-scope.js';
import { operationsTransaction } from '../src/admin-v2/model-operations.js';
import { commitAdminState } from '../src/admin-v2/store.js';
import { resourceId } from '../src/resource-id.mjs';
import { modelServiceKey } from '../src/model-identities.mjs';
import { modelCatalogue } from '../src/admin-v2/model-library.js';

const seed = () => withAdminSession({ ...initialModelWorkspace(), currentRole: '平台管理员' });
const plan = (state, file, target) => importModelResources(state, file, operationsTransaction, target);
const commit = (state, file) => commitAdminState(state, { type: 'modelOperations', operation: 'importModelResources', data: { file, target: file.target } }, '平台管理员');

function fixture() {
  const state = seed(), all = exportModelResources(state, 'channels'), channel = all.rows.find(row => row.type === 'channel' && row.model_id);
  const provider = state.providers.find(row => row.id === channel.provider_id), association = provider.catalogConnections.find(row => row.endpointId === channel.connection_id && row.upstreamModelId === channel.upstream_model_id);
  const entry = provider.catalogModels.find(row => row.modelId === association.modelId);
  const other = { ...structuredClone(provider), id: resourceId('provider'), name: '另一个供给方', code: 'scope-other', catalogueScope: 'managed', catalogModelIds: [entry.modelId], removedCatalogModelIds: [], catalogModels: [{ ...entry, id: resourceId('provider-model') }], catalogConnections: [] };
  const connection = { ...structuredClone(state.endpoints.find(row => row.id === channel.connection_id)), id: resourceId('connection'), providerId: other.id };
  other.catalogConnections = [{ ...structuredClone(association), id: resourceId('channel'), endpointId: connection.id }];
  state.providers.push(other); state.endpoints.push(connection);
  return { state, channel, provider, association, other };
}

test('module, provider, model and provider-model JSON preserve identity and independent scope', () => {
  const { state, channel, provider, other } = fixture(), before = structuredClone(state);
  const module = exportModelResources(state, 'channels');
  assert.equal(module.schema, 'moma.model-operations/v2');
  assert(module.rows.some(row => row.type === 'provider_model'));
  for (const target of [{ level: 'module' }, { level: 'provider', provider_id: provider.id }, { level: 'model', model_id: channel.model_id }, { level: 'provider_model', provider_id: provider.id, model_id: channel.model_id }]) {
    const file = exportModelResources(state, 'channels', target);
    assert.equal(new Set(file.rows.map(resourceKey)).size, file.rows.length);
    assert.deepEqual(plan(state, JSON.parse(JSON.stringify(file)), target).changes, []);
    if (target.provider_id) assert(file.rows.every(row => row.type === 'provider' ? row.id === provider.id : row.provider_id === provider.id));
    if (target.model_id) {
      assert(file.rows.every(row => row.model_id === channel.model_id));
      assert(file.references.some(row => row.type === 'connection' && row.id === channel.connection_id));
      assert(!file.rows.some(row => row.type === 'connection'));
    }
  }
  const model = exportModelResources(state, 'channels', { level: 'model', model_id: channel.model_id });
  assert(model.rows.some(row => row.type === 'channel' && row.provider_id === other.id));
  assert.deepEqual(state, before);
});

test('registered models without channels remain in the provider JSON', () => {
  const { state, provider } = fixture(), model = modelCatalogue(state).find(row => !provider.catalogModels.some(entry => entry.libraryId === row.id));
  provider.catalogModelIds.push('registered-no-channel');
  provider.catalogModels.push({ id: resourceId('provider-model'), modelId: 'registered-no-channel', libraryId: model.id, name: model.name, type: model.type });
  const file = exportModelResources(state, 'channels', { level: 'provider', provider_id: provider.id });
  assert(file.rows.some(row => row.type === 'provider_model' && row.model_id === model.id));
  assert(!file.rows.some(row => row.type === 'channel' && row.model_id === model.id));
});

test('registration JSON uses actual supplier-model relations and excludes reference-only catalogue models', () => {
  const state = seed(), provider = state.providers.find(row => row.id === 'provider-moma');
  const target = { level: 'provider', provider_id: provider.id }, before = structuredClone(state);
  const domainRows = exportModelResources(state, 'channels', target).rows.filter(row => row.type === 'provider_model');
  assert.equal(domainRows.length, 2);
  assert.deepEqual(state, before);
  state.supplyRelations = modelSupplyRelations(structuredClone(state));
  const expected = state.supplyRelations.models.filter(row => row.providerId === provider.id);
  const file = exportModelResources(state, 'channels', target), rows = file.rows.filter(row => row.type === 'provider_model');
  assert.deepEqual(rows.map(row => row.id).sort(), expected.map(row => row.id).sort());
  assert.deepEqual(rows.map(row => row.model_id).sort(), domainRows.map(row => row.model_id).sort());
  assert.deepEqual(rows.map(row => row.canonical_slug).sort(), ['deepseek-v4-flash-0731', 'glm-5.3']);
  const referenceOnly = modelCatalogue(state).find(row => row.modelId === 'kimi-k3');
  assert(referenceOnly);
  assert.throws(() => exportModelResources(state, 'channels', { level: 'provider_model', provider_id: provider.id, model_id: referenceOnly.id }), /尚未登记/);
  const snapshot = structuredClone(state);
  assert.deepEqual(plan(state, JSON.parse(JSON.stringify(file)), target).changes, []);
  assert.deepEqual(state, snapshot);
});

test('shared connections are included once as read-only references without unrelated channels or credentials', () => {
  const { state, channel, provider, association } = fixture(), otherModel = state.modelTemplates.find(row => row.id !== channel.model_id);
  provider.catalogModelIds.push('shared-other-model');
  provider.catalogModels.push({ id: resourceId('provider-model'), modelId: 'shared-other-model', libraryId: otherModel.id, name: otherModel.name, type: otherModel.type });
  const otherChannel = { ...association, id: resourceId('channel'), modelId: 'shared-other-model', upstreamModelId: 'other-upstream' };
  provider.catalogConnections.push(otherChannel);
  provider.apiKeys = [{ id: 'key-scope', name: 'Primary', masked: 'sk-***', value: 'never-export-secret', status: 'enabled' }];
  provider.apiKeyGroups = [{ id: 'default', name: '默认 API 密钥组', keyIds: ['key-scope'] }];
  const connection = state.endpoints.find(row => row.id === channel.connection_id);
  connection.authMode = 'group'; connection.keyGroupId = 'default'; connection.credentialRef = 'never-export-secret';
  const file = exportModelResources(state, 'channels', { level: 'model', model_id: channel.model_id });
  assert.equal(file.references.filter(row => row.type === 'connection' && row.id === channel.connection_id).length, 1);
  assert(!file.rows.some(row => row.id === otherChannel.id));
  assert(!JSON.stringify(file).includes('never-export-secret'));
  assert(file.references.some(row => row.type === 'key_group' && row.keys.some(key => key.masked_value === 'sk-***')));
  const before = structuredClone(state); file.references.find(row => row.type === 'connection').base_url = 'https://changed.invalid/v1';
  assert.throws(() => plan(state, file), /只读关联/); assert.deepEqual(state, before);
  connection.authMode = 'pool'; connection.keyPool = [{ keyId: 'key-scope', priority: 3, enabled: false }];
  const pool = exportModelResources(state, 'channels', { level: 'model', model_id: channel.model_id });
  assert.deepEqual(pool.references.find(row => row.type === 'connection' && row.id === connection.id).key_pool, [{ api_key_id: 'key-scope', priority: 3, enabled: false }]);
});

test('forged targets, wider files, unknown IDs and immutable statuses cannot escape the selected object', () => {
  const { state, channel, provider, other } = fixture(), target = { level: 'provider', provider_id: provider.id }, file = exportModelResources(state, 'channels', target), before = structuredClone(state);
  assert.throws(() => plan(state, exportModelResources(state, 'channels'), target), /当前页面/);
  const forged = structuredClone(file); forged.target.provider_id = other.id;
  assert.throws(() => plan(state, forged), /只读关联|当前范围/);
  const outside = structuredClone(file); outside.rows.push(exportModelResources(state, 'channels').rows.find(row => row.type === 'channel' && row.provider_id === other.id));
  assert.throws(() => plan(state, outside), /当前范围/);
  const status = exportModelResources(state, 'channels', { level: 'model', model_id: channel.model_id });
  status.rows.find(row => row.type === 'channel').enabled = !status.rows.find(row => row.type === 'channel').enabled;
  assert.throws(() => plan(state, status), /不可修改/);
  assert.throws(() => exportModelResources(state, 'channels', { level: 'provider', provider_id: 'missing' }), /不存在/);
  assert.throws(() => resourcePageTarget(state, 'channels', new URLSearchParams('provider=missing')), /不存在/);
  assert.throws(() => exportModelResources(state, 'channels', { level: 'module', provider_id: provider.id }), /范围无效/);
  assert.throws(() => plan(state, { ...exportModelResources(state, 'channels'), operation: 'link', rows: [] }), /只适用于模型服务/);
  assert.throws(() => resourcePageTarget(state, 'channels', new URLSearchParams({ provider: provider.id, resourceJson: '1', resourceTarget: JSON.stringify({ level: 'module' }) })), /来源页面不一致/);
  assert.deepEqual(state, before);
});

test('capacity and purchase-price updates use existing transactions without changing IDs or old versions', () => {
  const { state, channel } = fixture(), file = exportModelResources(state, 'channels', { level: 'model', model_id: channel.model_id });
  file.rows = [file.rows.find(row => row.type === 'channel' && row.id === channel.id)];
  file.rows[0].capacity_limits = { rpm: 123, tpm: 6000000 };
  const next = commit(state, file), after = exportModelResources(next, 'channels').rows.find(row => row.type === 'channel' && row.id === channel.id);
  assert.deepEqual(after.capacity_limits, { rpm: 123, tpm: 6000000 }); assert.equal(after.connection_id, channel.connection_id);
  assert.deepEqual(next.modelSalePrices, state.modelSalePrices);
  const prices = exportModelResources(next, 'channels', file.target); prices.rows = [prices.rows.find(row => row.id === channel.id && row.type === 'channel')];
  assert(prices.rows[0].procurement.items.length); prices.rows[0].procurement.items[0].amount = '0';
  const saved = commit(next, prices), provider = saved.providers.find(row => row.id === channel.provider_id);
  const original = next.providers.find(row => row.id === channel.provider_id).catalogConnections.find(row => row.endpointId === channel.connection_id && row.upstreamModelId === channel.upstream_model_id);
  const current = provider.catalogConnections.find(row => row.id === original.id);
  for (const version of original.procurementVersions || []) assert.deepEqual(current.procurementVersions.find(row => row.id === version.id), version);
  assert.equal(current.procurementVersions.at(-1).pricing.scenarios[0].listPrice, 0);
  assert.equal(current.id, original.id);
});

test('price histories retain their original service generation and dictionary IDs cannot change meaning', () => {
  const state = seed(), file = exportModelResources(state, 'prices'), row = file.rows.find(row => row.items.length);
  const model = state.models.find(model => model.id === row.model_service_config_id);
  const old = { ...structuredClone(state.modelSalePrices.find(price => price.id === row.price_version_id)), id: 'preserved-historical-price', serviceModeRevision: 999 };
  const key = old.scope === 'provider' ? old.channelId || old.providerId : '';
  state.modelData.resourceIds ||= {};
  state.modelData.resourceIds[modelServiceKey(model, key, 999)] = 'preserved-historical-service';
  state.modelSalePrices.push(old);
  const exported = exportModelResources(state, 'prices');
  assert.equal(exported.references.find(ref => ref.id === old.id).model_service_id, 'preserved-historical-service');
  const concrete = exportModelResources(state, 'prices', { level: 'model_service', model_service_id: row.id });
  assert(!concrete.references.some(ref => ref.id === old.id));
  concrete.rows[0].items[0].currency_id = 'foreign-currency';
  assert.throws(() => plan(state, concrete), /币种不一致/);
});

test('model and concrete-service targets cover all four modules and validate URL identities', () => {
  const state = seed(), services = exportModelResources(state, 'services'), service = services.rows.find(row => row.provider_id);
  for (const scope of ['services', 'market', 'prices']) {
    const file = exportModelResources(state, scope, { level: 'model', model_id: service.model_id });
    assert(file.rows.every(row => row.model_id === service.model_id));
    assert.deepEqual(plan(state, JSON.parse(JSON.stringify(file))).changes, []);
    const concrete = exportModelResources(state, scope, { level: 'model_service', model_service_id: service.id });
    assert(concrete.rows.every(row => row.id === service.id));
    assert(concrete.references.filter(row => row.type === 'price_version').every(row => row.model_service_id === service.id));
  }
  assert.deepEqual(resourcePageTarget(state, 'services', new URLSearchParams({ model: service.model_service_config_id })), { level: 'model', model_id: service.model_id });
  assert.deepEqual(resourcePageTarget(state, 'prices', new URLSearchParams({ service: service.id })), { level: 'model_service', model_service_id: service.id });
});

test('service JSON includes the actual mapping configuration and its pending edit without changing stored data', () => {
  const state = seed(), service = exportModelResources(state, 'services').rows.find(row => row.mappings.length);
  const mapping = service.mappings[0], supply = state.modelSupplies.find(row => row.id === mapping.mapping_id);
  assert.equal(mapping.configuration.endpointId, mapping.connection_id);
  supply.serviceMapping = { ...supply.serviceMapping, pending: { name: '待验证映射', config: { ...mapping.configuration, platformInterface: '/v1/responses' } } };
  const before = structuredClone(state), file = exportModelResources(state, 'services', { level: 'model_service', model_service_id: service.id });
  assert.equal(file.rows[0].mappings.find(row => row.mapping_id === mapping.mapping_id).pending_configuration.configuration.platformInterface, '/v1/responses');
  assert.deepEqual(plan(state, JSON.parse(JSON.stringify(file))).changes, []);
  assert.deepEqual(state, before);
});


test('channel JSON follows current channel deletions and edits while retaining model registrations', () => {
  const { state, provider, association, other } = fixture();
  const target = { level: 'provider', provider_id: provider.id };
  const before = exportModelResources(state, 'channels', target);
  const otherBefore = exportModelResources(state, 'channels', { level: 'provider', provider_id: other.id });
  association.sourceName = '按实际记录命名'; association.capacityLimits = { rpm: 300, tpm: 1500000 };
  const edited = exportModelResources(state, 'channels', target);
  const row = edited.rows.find(row => row.type === 'channel' && row.upstream_model_id === association.upstreamModelId && row.connection_id === association.endpointId);
  assert.equal(row.name, association.sourceName); assert.deepEqual(row.capacity_limits, association.capacityLimits);
  association.deletedAt = '2026-11-17T00:00:00.000Z';
  const current = exportModelResources(state, 'channels', target);
  assert(!current.rows.some(item => item.type === 'channel' && item.id === row.id));
  assert.equal(current.rows.filter(item => item.type === 'channel').length, before.rows.filter(item => item.type === 'channel').length - 1);
  assert.deepEqual(current.rows.filter(item => item.type === 'provider_model'), before.rows.filter(item => item.type === 'provider_model'));
  assert.deepEqual(exportModelResources(state, 'channels', { level: 'provider', provider_id: other.id }), otherBefore);
});

test('model-view JSON uses the whole model scope rather than the removed provider drilldown', () => {
  const state = initialModelWorkspace(), before = structuredClone(state);
  const channel = exportModelResources(state, 'channels').rows.find(row => row.type === 'channel');
  const params = new URLSearchParams({ perspective: 'models', supplyModel: channel.model_id, provider: channel.provider_id });
  const target = resourcePageTarget(state, 'channels', params);
  assert.deepEqual(target, { level: 'model', model_id: channel.model_id });
  const file = exportModelResources(state, 'channels', target);
  assert(new Set(file.rows.filter(row => row.type === 'channel').map(row => row.provider_id)).size > 1);
  assert.deepEqual(state, before);
});
