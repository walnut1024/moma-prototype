import test from 'node:test';
import assert from 'node:assert/strict';
import { initialModelWorkspace, modelSupplyRelations } from '../server/model-repository.js';
import { commitAdminState } from '../src/admin-v2/state-transaction.js';
import { providerRemovalPlan } from '../src/admin-v2/provider-removal.js';
import { supplierChannelAssociations } from '../src/admin-v2/supplier-resources.js';
import { providerCatalogueIds } from '../src/admin-v2/moma-provider.js';
import { channelManagementDirectory, supplierModelChannelRows } from '../src/admin-v2/supplier-model-channel-table.js';
import { costRecords, supplyCostTableRows } from '../src/admin-v2/model-pricing-workspace.js';

const run = (state, operation, data) => commitAdminState(state, { type: 'modelOperations', operation, data }, '平台管理员');
function remove(state, target) {
  let plan = providerRemovalPlan(state, target);
  if (!plan.ready) state = run(state, 'providerRemovalPrepare', { target, confirmed: true, expectedSignature: plan.signature });
  plan = providerRemovalPlan(state, target);
  return run(state, 'providerRemovalCommit', { target, confirmed: true, expectedSignature: plan.signature });
}
function views(state) {
  const relations = modelSupplyRelations(structuredClone(state));
  const directory = channelManagementDirectory(state, state.providers.filter(p => !p.deletedAt), relations);
  const groups = [...directory.byProvider.values()].flat();
  const providerRows = groups.flatMap(group => supplierModelChannelRows(state, [group]));
  const modelRows = supplyCostTableRows(directory.models, costRecords(state, groups));
  assert.deepEqual(modelRows.map(row => row.channel.id).sort(), providerRows.map(row => row.channel.id).sort());
  return { relations, directory, groups };
}

test('last-channel deletion retires its registration across aliases, retains siblings and other providers, and survives another save', () => {
  let state = initialModelWorkspace();
  const provider = state.providers.find(p => p.id === 'provider-moma');
  const selected = supplierChannelAssociations(state, provider).filter(c => c.modelId === 'glm-5.3');
  assert.equal(selected.length, 2);
  provider.catalogModelIds = [...new Set([...(provider.catalogModelIds || []), 'glm-alias'])];
  provider.catalogModels.push({ ...provider.catalogModels.find(m => m.modelId === 'glm-5.3'), modelId: 'glm-alias' });
  provider.catalogConnections.find(c => c.id === selected[1].id).modelId = 'glm-alias';
  provider.catalogConnections.find(c => c.id === selected[1].id).enabled = false;
  const original = structuredClone(state), originalRelations = modelSupplyRelations(structuredClone(state));
  state = remove(state, { providerId: provider.id, endpointId: selected[0].endpointId, associationId: selected[0].id });
  const materialId = provider.catalogModels.find(m => m.modelId === 'glm-5.3').libraryId;
  assert(views(state).relations.models.some(r => r.providerId === provider.id && r.materialId === materialId));
  state = remove(state, { providerId: provider.id, associationIds: [selected[1].id] });
  const owner = state.providers.find(p => p.id === provider.id);
  assert(!providerCatalogueIds(owner).includes('glm-5.3'));
  assert(!providerCatalogueIds(owner).includes('glm-alias'));
  const result = views(state);
  const retired = originalRelations.models.find(r => r.providerId === provider.id && r.materialId === materialId);
  assert(!result.relations.models.some(r => r.id === retired.id));
  assert(result.relations.channels.length > 0, 'shared connection sibling models remain');
  assert.deepEqual(result.relations.models.filter(r => r.providerId !== provider.id), originalRelations.models.filter(r => r.providerId !== provider.id));
  for (const key of ['modelTemplates', 'modelSalePrices', 'supplyPrices']) assert.deepEqual(state[key], original[key]);
  for (const row of provider.catalogConnections) assert.deepEqual(owner.catalogConnections.find(c => c.id === row.id)?.procurementVersions, row.procurementVersions);
  assert.deepEqual(state.providers.filter(p => p.id !== provider.id), original.providers.filter(p => p.id !== provider.id));
  const saved = run(state, 'provider', { operation: 'profile', objectId: provider.id, values: { name: owner.name, code: owner.code, sourceType: owner.sourceType, description: owner.description || '' } });
  assert(!views(JSON.parse(JSON.stringify(saved))).relations.models.some(r => r.id === retired.id));
});

test('channel perspectives exclude zero-channel registrations without deleting reference materials or pending intake data', () => {
  const state = initialModelWorkspace(), original = structuredClone(state);
  const next = run(state, 'supplierModelsRegister', { providerId: 'provider-moma', libraryIds: ['builtin-pp-ocrv6'] });
  const { relations, directory } = views(next);
  assert(relations.models.some(r => r.materialId === 'builtin-pp-ocrv6'));
  assert(!directory.models.some(r => r.id === 'builtin-pp-ocrv6'));
  assert(!directory.byProvider.get('provider-moma').some(r => r.id === 'builtin-pp-ocrv6'));
  assert.deepEqual(next.modelTemplates, original.modelTemplates);
});

test('legacy single-channel delete also retires the last registration atomically', () => {
  let state = run(initialModelWorkspace(), 'provider', { operation: 'create', values: { name: '单连接回归', code: 'last-channel-test', sourceType: 'thirdParty', catalogModelIds: [] } });
  const provider = state.providers.find(p => p.code === 'last-channel-test');
  state = run(state, 'provider', { operation: 'supplierChannelCreate', objectId: provider.id, values: { name: '自营', protocol: 'OpenAI', baseUrl: 'https://last.example.invalid/v1/chat/completions', authMode: 'inherit', models: [{ libraryId: 'model-2', upstreamModelId: 'vendor/last', scenarios: [] }] } });
  const channel = supplierChannelAssociations(state, state.providers.find(p => p.id === provider.id))[0];
  state.providers.find(p => p.id === provider.id).catalogConnections.push({ id: 'unconfigured-history', modelId: channel.modelId, sourceName: '尚未接入' });
  const next = run(state, 'provider', { operation: 'supplierCatalogueChannelDelete', objectId: provider.id, values: { modelId: channel.modelId, endpointId: channel.endpointId, associationId: channel.id, confirmed: true } });
  assert(!providerCatalogueIds(next.providers.find(p => p.id === provider.id)).includes(channel.modelId));
  assert.deepEqual(next.modelTemplates, state.modelTemplates);
});
