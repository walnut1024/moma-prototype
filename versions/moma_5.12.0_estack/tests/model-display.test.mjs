import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminSeed, commitAdminState, persistModelAction } from '../src/admin-v2/store.js';
import { libraryRecord } from '../src/admin-v2/model-operations.js';

function action(model, values = {}) {
  return { type: 'modelOperations', operation: 'display', modelId: model.id, data: { name: '更新展示名称', description: '更新模型介绍', visibility: '内部', expectedUpdatedAt: model.updatedAt, ...values } };
}

test('display edits update the model master and visibility without changing commercial or capability state', () => {
  const state = createAdminSeed(), model = state.models.find(item => item.id === 'catalog-demo-kimi');
  const before = structuredClone(state), next = commitAdminState(state, action(model));
  const saved = next.models.find(item => item.id === model.id);
  assert.equal(saved.name, '更新展示名称');
  assert.equal(saved.description, '更新模型介绍');
  assert.equal(saved.visibility, '内部');
  assert.equal(saved.listingStatus, model.listingStatus);
  assert.equal(saved.callsEnabled, model.callsEnabled);
  assert.equal(saved.modelId, model.modelId);
  assert.deepEqual(saved.capabilities, model.capabilities);
  assert.deepEqual(saved.profile, model.profile);
  for (const key of ['providers', 'endpoints', 'modelSupplies', 'supplyPrices', 'modelSalePrices', 'modelTemplates', 'modelOnboardings', 'serviceRoutes']) assert.deepEqual(next[key], state[key]);
  assert.equal(libraryRecord(next, model.templateId || model.id).name, saved.name);
  assert.deepEqual(state, before);
});

test('display rejects blank fields, invalid visibility, missing models and stale dialog edits', () => {
  const state = createAdminSeed(), model = state.models[0], before = structuredClone(state);
  for (const values of [{ name: ' ' }, { description: '' }, { name: 1 }, { visibility: '其他' }, { expectedUpdatedAt: 'stale' }]) assert.throws(() => commitAdminState(state, action(model, values)));
  assert.throws(() => commitAdminState(state, { ...action(model), modelId: 'missing' }), /模型不存在/);
  assert.deepEqual(state, before);
});

test('display retains role, revision and failed-persistence protection', () => {
  const state = createAdminSeed(), model = state.models[0], before = structuredClone(state);
  assert.throws(() => commitAdminState({ ...state, currentRole: '运维人员' }, action(model)), /无权/);
  assert.throws(() => persistModelAction(state, action(model), { getItem: () => JSON.stringify({ ...state, revision: state.revision + 1 }), setItem: () => assert.fail('must not save stale state') }), /数据已变化/);
  assert.throws(() => persistModelAction(state, action(model), { getItem: () => JSON.stringify(state), setItem: () => { throw Error('storage full'); } }), /storage full/);
  assert.deepEqual(state, before);
});
