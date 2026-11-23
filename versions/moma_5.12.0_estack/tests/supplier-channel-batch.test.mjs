import test from 'node:test';
import assert from 'node:assert/strict';
import { initialModelWorkspace } from '../server/model-repository.js';
import { commitAdminState } from '../src/admin-v2/state-transaction.js';
import { resolveChannelAssociationModel } from '../src/admin-v2/channel-association-model.js';
import { supplierChannelAssociations } from '../src/admin-v2/supplier-resources.js';
import { supplierChannelBatchPlan, channelBatchTasks, channelBatchRowResult, channelBatchInterface } from '../src/admin-v2/supplier-channel-batch.js';

const fixture = () => {
  const state = initialModelWorkspace(), provider = state.providers.find(row => row.id === 'provider-moma');
  const rows = supplierChannelAssociations(state, provider);
  const first = rows.find(row => rows.filter(other => other.endpointId === row.endpointId).length > 1);
  const other = rows.find(row => row.endpointId !== first.endpointId);
  return { state, provider, rows, first, other };
};
const run = (state, operation, data) => commitAdminState(state, { type: 'modelOperations', operation, data }, '平台管理员');
const edit = (state, ids, patch) => run(state, 'supplierChannelBatchEdit', {
  providerId: 'provider-moma', associationIds: ids, expectedSignature: supplierChannelBatchPlan(state, 'provider-moma', ids).signature, confirmed: true, ...patch,
});

test('batch plan deduplicates connections, lists unselected shared channels and never changes identities', () => {
  const { state, first, rows } = fixture(), before = structuredClone(state);
  const plan = supplierChannelBatchPlan(state, 'provider-moma', [first.id]);
  assert.equal(plan.connections.length, 1); assert(plan.additional.length > 0);
  assert(plan.additional.every(row => row.id !== first.id && row.endpointId === first.endpointId));
  const shared = rows.filter(row => row.endpointId === first.endpointId);
  assert.equal(supplierChannelBatchPlan(state, 'provider-moma', shared.map(row => row.id)).connections.length, 1);
  assert.deepEqual(state, before);
  assert(channelBatchInterface(state, plan.provider, first).endsWith('/v1/chat/completions'));
  assert.equal(channelBatchInterface(state, plan.provider, first, 'https://preview.example.invalid/v1'), 'https://preview.example.invalid/v1/chat/completions');
  const archived = structuredClone(state), archivedOwner = archived.providers.find(row => row.id === 'provider-moma');
  resolveChannelAssociationModel(archived, archivedOwner, first).archivedAt = new Date().toISOString();
  assert.throws(() => supplierChannelBatchPlan(archived, 'provider-moma', [first.id]), /已归档/);
  for (const ids of [[], [first.id, first.id], ['foreign'], [null], Array.from({ length: 501 }, (_, i) => String(i))]) assert.throws(() => supplierChannelBatchPlan(state, 'provider-moma', ids));
});

test('batch names update only the selected associations atomically, preserving shared connections, evidence and prices', () => {
  const { state, first, other, provider } = fixture();
  const ids = [first.id, other.id], next = edit(state, ids, { field: 'name', value: '统一连接名称' });
  const owner = next.providers.find(row => row.id === provider.id);
  for (const row of provider.catalogConnections) {
    const saved = owner.catalogConnections.find(item => item.id === row.id);
    assert.deepEqual(saved, ids.includes(row.id) ? { ...row, sourceName: '统一连接名称', updatedAt: saved.updatedAt } : row);
  }
  for (const key of ['endpoints', 'models', 'modelTemplates', 'modelSupplies', 'modelSalePrices', 'supplyPrices', 'serviceRoutes']) assert.deepEqual(next[key], state[key]);
  const before = structuredClone(state);
  for (const patch of [{ value: '' }, { value: 'x'.repeat(61) }, { value: 'a\nb' }, { confirmed: false }, { expectedSignature: 'stale' }, { field: 'invalid' }]) assert.throws(() => edit(state, ids, { field: 'name', value: '合法名称', ...patch }));
  assert.deepEqual(state, before);
  assert.throws(() => commitAdminState({ ...state, currentRole: '只读审计员' }, { type: 'modelOperations', operation: 'supplierChannelBatchEdit', data: {} }), /权限|账号|无权/);
});

test('batch addresses preserve live configuration until every deduplicated candidate passes, then apply once per connection', () => {
  const { state, first, other } = fixture(), ids = [first.id, other.id], value = 'https://batch.example.invalid/v1';
  let prepared = edit(state, ids, { field: 'address', phase: 'prepare', value });
  const plan = supplierChannelBatchPlan(prepared, 'provider-moma', ids);
  const candidates = plan.connections.map(({ endpoint }) => ({ endpointId: endpoint.id, candidateId: endpoint.candidateConfiguration.id }));
  for (const { endpoint } of plan.connections) {
    assert.equal(endpoint.baseUrl, state.endpoints.find(row => row.id === endpoint.id).baseUrl);
    assert.equal(endpoint.candidateConfiguration.config.baseUrl, value);
    assert(endpoint.candidateConfiguration.addressOnly);
  }
  const resumed = edit(prepared, ids, { field: 'address', phase: 'prepare', value });
  assert.deepEqual(resumed.endpoints, prepared.endpoints);
  assert.throws(() => edit(prepared, ids, { field: 'address', phase: 'prepare', value: 'https://other.example.invalid/v1' }), /其他待验证/);
  assert.throws(() => edit(prepared, ids, { field: 'address', phase: 'apply', value, candidates }), /测试|验证|通过/);
  for (const target of candidates) prepared = run(prepared, 'channelCandidateTest', { providerId: 'provider-moma', endpointId: target.endpointId, candidateId: target.candidateId, expectedRevision: 0 });
  const incomplete = structuredClone(prepared), partial = incomplete.endpoints.find(row => row.id === first.endpointId);
  partial.candidateConfiguration.tests = partial.candidateConfiguration.tests.filter(row => row.associationId === first.id);
  assert.throws(() => edit(incomplete, ids, { field: 'address', phase: 'apply', value, candidates }), /测试|验证|通过/);
  const failed = structuredClone(prepared);
  failed.endpoints.find(row => row.id === other.endpointId).candidateConfiguration.tests.forEach(row => { row.result = '失败'; });
  const failedBefore = structuredClone(failed);
  assert.throws(() => edit(failed, ids, { field: 'address', phase: 'apply', value, candidates })); assert.deepEqual(failed, failedBefore);
  for (const bad of [[candidates[0]], [candidates[0], candidates[0]], candidates.map(row => ({ ...row, candidateId: 'foreign' }))]) assert.throws(() => edit(prepared, ids, { field: 'address', phase: 'apply', value, candidates: bad }));
  const saved = edit(prepared, ids, { field: 'address', phase: 'apply', value, candidates });
  for (const { endpointId } of candidates) { const endpoint = saved.endpoints.find(row => row.id === endpointId); assert.equal(endpoint.baseUrl, value); assert.equal(endpoint.configurationRevision, 1); }
  assert.deepEqual(saved.endpoints.map(row => row.id), state.endpoints.map(row => row.id));
  assert.deepEqual(saved.providers.map(row => (row.catalogConnections || []).map(item => item.id).sort()), state.providers.map(row => (row.catalogConnections || []).map(item => item.id).sort()));
  for (const key of ['modelSalePrices', 'supplyPrices', 'modelTemplates']) assert.deepEqual(saved[key], state[key]);
});

test('mixed invalid address and stale shared impacts reject the complete batch without leaving partial candidates', () => {
  const { state, first, other } = fixture(), ids = [first.id, other.id], before = structuredClone(state);
  for (const value of ['', 'not-a-url', 'https://batch.example.invalid/v1/chat/completions']) assert.throws(() => edit(state, ids, { field: 'address', phase: 'prepare', value }));
  const signature = supplierChannelBatchPlan(state, 'provider-moma', ids).signature;
  const changed = structuredClone(state), owner = changed.providers.find(row => row.id === 'provider-moma'); owner.catalogConnections.find(row => row.id === first.id).upstreamModelId = 'changed';
  assert.throws(() => edit(changed, ids, { field: 'address', phase: 'prepare', value: 'https://batch.example.invalid/v1', expectedSignature: signature }), /范围已变化/);
  assert.deepEqual(state, before);
});

test('test tasks retain per-model evidence on shared connections and aggregate failures across credential tests', () => {
  const { state, first, other } = fixture(), plan = supplierChannelBatchPlan(state, 'provider-moma', [first.id, other.id]);
  const current = channelBatchTasks(state, plan); assert.equal(current.flatMap(row => row.associationIds).length, 2);
  const candidates = channelBatchTasks(state, plan, true); assert(candidates.flatMap(row => row.associationIds).length > 2);
  const tasks = [{ key: 'a', associationIds: [first.id] }, { key: 'b', associationIds: [first.id] }];
  const passed = key => ({ complete: true, batch: { items: [{ model: { associationId: first.id }, status: key, message: '检测失败' }] } });
  assert.equal(channelBatchRowResult(tasks, {}, first.id, 'a').status, '测试中');
  assert.equal(channelBatchRowResult(tasks, { a: passed('passed') }, first.id).status, '等待中');
  assert.equal(channelBatchRowResult(tasks, { a: passed('failed'), b: passed('passed') }, first.id).status, '失败');
  assert.equal(channelBatchRowResult(tasks, { a: passed('passed'), b: passed('passed') }, first.id).status, '通过');
  assert.equal(channelBatchRowResult([], {}, first.id, undefined, { passed: true }).status, '通过');
  assert.equal(channelBatchRowResult([], {}, first.id, undefined, { passed: false, evidence: { result: '失败' }, reason: '凭证验证失败' }).message, '凭证验证失败');
});
