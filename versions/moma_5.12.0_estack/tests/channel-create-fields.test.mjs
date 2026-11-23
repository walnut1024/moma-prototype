import test from 'node:test';
import assert from 'node:assert/strict';
import { supplierBaseUrls } from '../src/admin-v2/supplier-resources.js';
import { initialModelWorkspace } from '../server/model-repository.js';
import { commitAdminState } from '../src/admin-v2/state-transaction.js';

test('provider Base URL options use the exact live address source in order and exclude other providers and archived connections', () => {
  const provider = { id: 'p' }, state = { endpoints: [{ id: '1', providerId: 'p', baseUrl: 'https://one.test/v1' }, { id: '2', providerId: 'p', baseUrl: 'https://one.test/v1' }, { id: '3', providerId: 'p', baseUrl: 'https://two.test/v1' }, { id: '4', providerId: 'q', baseUrl: 'https://foreign.test' }, { id: '5', providerId: 'p', baseUrl: 'https://gone.test', deletedAt: 'now' }] };
  assert.deepEqual(supplierBaseUrls(state, provider), ['https://one.test/v1', 'https://two.test/v1']);
  assert.deepEqual(supplierBaseUrls(state), []);
});

test('directory-external model and channel creation is atomic, preserves existing records and rejects conflicting model codes', () => {
  const state = initialModelWorkspace(), provider = state.providers.find(row => row.id === 'provider-moma');
  const data = { providerId: provider.id, values: { name: '新上游模型', baseUrl: supplierBaseUrls(state, provider)[0], protocol: 'OpenAI', interfaceType: 'openai', authMode: 'group', keyGroupId: 'default', models: [{ newModel: { modelId: 'new-review-model', name: '新模型展示名', type: 'text' }, upstreamModelId: 'Upstream/Actual-Model' }] } };
  const run = input => commitAdminState(state, { type: 'modelOperations', operation: 'channelQuickCreate', data: input }, '平台管理员');
  const next = run(data), master = next.modelTemplates.find(row => row.modelId === 'new-review-model'); assert(master); assert.equal(master.name, '新模型展示名');
  for (const row of state.modelTemplates) assert.deepEqual(next.modelTemplates.find(r => r.id === row.id), row);
  for (const key of ['models', 'modelSalePrices', 'supplyPrices', 'serviceRoutes']) assert.deepEqual(next[key], state[key], key);
  const bad = structuredClone(data); bad.values.models[0].newModel.modelId = 'Invalid CODE'; assert.throws(() => run(bad), /模型编码/);
  bad.values.models[0].newModel.modelId = 'glm-5.3'; assert.throws(() => run(bad), /存在/);
});
