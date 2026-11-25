import test from 'node:test';
import assert from 'node:assert/strict';
import { initialModelWorkspace } from '../server/model-repository.js';
import { commitAdminState } from '../src/admin-v2/state-transaction.js';
import { supplierChannelAssociations } from '../src/admin-v2/supplier-resources.js';
import { supplierChannelLifecyclePlan } from '../src/admin-v2/supplier-channel-batch.js';
import { providerRemovalPlan } from '../src/admin-v2/provider-removal.js';

const fixture = () => { const state = initialModelWorkspace(), provider = state.providers.find(row => row.id === 'provider-moma'); return { state, provider, rows: supplierChannelAssociations(state, provider) }; };
const run = (state, operation, data) => commitAdminState(state, { type: 'modelOperations', operation, data }, '平台管理员');
const lifecycle = (state, ids, action, patch = {}) => run(state, 'supplierChannelBatchLifecycle', { providerId: 'provider-moma', associationIds: ids, action, confirmed: true,
  expectedSignature: supplierChannelLifecyclePlan(state, 'provider-moma', ids, action).signature, ...patch });
const removal = (state, target, operation) => run(state, operation, { target, confirmed: true, expectedSignature: providerRemovalPlan(state, target).signature });

test('bulk disable and enable preserve unselected shared channels, connections, identities and commercial history', () => {
  const { state, provider, rows } = fixture(), selected = rows.filter(row => row.modelId === 'glm-5.3'), ids = selected.map(row => row.id);
  assert.equal(ids.length, 2);
  const plan = supplierChannelLifecyclePlan(state, provider.id, ids, 'disable'); assert(plan.shared.length > 0);
  const disabled = lifecycle(state, ids, 'disable');
  assert(disabled.providers.find(row => row.id === provider.id).catalogConnections.filter(row => ids.includes(row.id)).every(row => row.enabled === false));
  for (const row of provider.catalogConnections.filter(row => !ids.includes(row.id))) assert.deepEqual(disabled.providers.find(p => p.id === provider.id).catalogConnections.find(c => c.id === row.id), row);
  assert.deepEqual(disabled.endpoints, state.endpoints);
  const enabled = lifecycle(disabled, ids, 'enable'); assert(enabled.providers.find(p => p.id === provider.id).catalogConnections.filter(row => ids.includes(row.id)).every(row => row.enabled));
  for (const key of ['models', 'modelTemplates', 'modelSalePrices', 'supplyPrices', 'serviceRoutes']) assert.deepEqual(enabled[key], state[key], key);
  assert.deepEqual(enabled.endpoints.map(row => row.id), state.endpoints.map(row => row.id));
});

test('mixed failed verification, foreign selections, unfinished tests, stale references and missing confirmation reject the whole lifecycle batch', () => {
  const { state, provider, rows } = fixture(), ids = rows.filter(row => row.modelId === 'glm-5.3').map(row => row.id);
  const invalid = structuredClone(state); invalid.providers.find(p => p.id === provider.id).catalogConnections.find(row => row.id === ids[1]).health = null;
  const before = structuredClone(invalid); assert.throws(() => lifecycle(invalid, ids, 'enable'), /验证|检测|通过/); assert.deepEqual(invalid, before);
  const pending = structuredClone(state), endpoint = pending.endpoints.find(e => e.id === rows.find(r => r.id === ids[0]).endpointId); endpoint.serverTestJobs = [{ associationIds: ids, receivedAt: null }];
  assert.throws(() => lifecycle(pending, ids, 'disable'), /未完成/);
  for (const patch of [{ confirmed: false }, { expectedSignature: 'stale' }, { associationIds: [ids[0], 'foreign'] }, { associationIds: [ids[0], ids[0]] }]) assert.throws(() => lifecycle(state, ids, 'disable', patch));
  assert.throws(() => commitAdminState(state, { type: 'modelOperations', operation: 'supplierChannelBatchLifecycle', data: {} }, '只读审计员'), /无权|权限/);
});

test('batch removal checks the union of selected channels, preserves shared siblings and blocks commit before preparation', () => {
  const { state, provider, rows } = fixture(), selected = rows.filter(row => row.modelId === 'glm-5.3'), target = { providerId: provider.id, associationIds: selected.map(row => row.id) };
  const plan = providerRemovalPlan(state, target); assert.equal(plan.associations.length, 2); assert.equal(plan.endpoints.length, 2); assert.equal(plan.wholeEndpoints.size, 0);
  assert.throws(() => removal(state, target, 'providerRemovalCommit'), /先停服|路由/);
  const prepared = removal(state, target, 'providerRemovalPrepare'); assert(providerRemovalPlan(prepared, target).ready);
  const removed = removal(prepared, target, 'providerRemovalCommit'), owner = removed.providers.find(p => p.id === provider.id);
  assert(!owner.deletedAt); assert.deepEqual(owner.catalogModelIds, provider.catalogModelIds);
  assert(owner.catalogConnections.filter(row => target.associationIds.includes(row.id)).every(row => row.deletedAt && !row.enabled));
  for (const row of provider.catalogConnections.filter(row => !target.associationIds.includes(row.id))) assert.deepEqual(owner.catalogConnections.find(c => c.id === row.id), row);
  assert.deepEqual(removed.endpoints, state.endpoints);
  for (const key of ['modelTemplates', 'modelSalePrices', 'supplyPrices']) assert.deepEqual(removed[key], state[key], key);
  assert.deepEqual(removed.providers.filter(p => p.id !== provider.id), state.providers.filter(p => p.id !== provider.id));
});

test('removing every upstream model preserves the provider and its connections', () => {
  const { state, provider, rows } = fixture(), target = { providerId: provider.id, associationIds: rows.map(row => row.id) };
  const prepared = removal(state, target, 'providerRemovalPrepare'), removed = removal(prepared, target, 'providerRemovalCommit');
  assert(!removed.providers.find(p => p.id === provider.id).deletedAt);
  assert.deepEqual(removed.endpoints, state.endpoints);
  for (const ids of [[], ['foreign'], [rows[0].id, rows[0].id], [null]]) assert.throws(() => providerRemovalPlan(state, { providerId: provider.id, associationIds: ids }));
  const pending = structuredClone(state); pending.endpoints.find(e => e.id === rows[0].endpointId).serverTestJobs = [{ associationIds: [rows[0].id] }];
  assert.throws(() => removal(pending, target, 'providerRemovalPrepare'), /未完成/);
});
