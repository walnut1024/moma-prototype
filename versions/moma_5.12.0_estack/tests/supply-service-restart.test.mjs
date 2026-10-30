import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminSeed, commitAdminState, persistModelAction } from '../src/admin-v2/store.js';
import { modelSupplies, availableSupplies } from '../src/admin-v2/model-management.js';
import { simulateRequest } from '../src/admin-v2/domain.js';

const op = (state, operation, modelId, id) => commitAdminState(state, { type: 'modelOperations', operation, modelId, data: { id } });
function stopped() {
  let state = createAdminSeed();
  const modelId = 'catalog-demo-kimi', supplies = modelSupplies(state, modelId), supplyId = supplies[0].id;
  for (const supply of supplies) state = op(state, 'stopSupply', modelId, supply.id);
  return { state, modelId, supplyId };
}

test('starting the last stopped supply restores existing calls without resuming sales', () => {
  let { state, modelId, supplyId } = stopped();
  assert.equal(availableSupplies(state, modelId).length, 0);
  assert.equal(state.models.find(item => item.id === modelId).callsEnabled, false);
  const key = state.apiKeys.find(item => item.status === '有效' && state.grants.some(grant => grant.subjectId === item.id));
  key.modelIds = [...new Set([...key.modelIds, modelId])];
  state.limits = state.limits.filter(item => item.scopeId !== key.id);
  const call = () => simulateRequest(state, { requestId: crypto.randomUUID(), keyId: key.id, modelId }).request;
  assert.notEqual(call().httpStatus, 200);
  state = op(state, 'startSupply', modelId, supplyId);
  assert.equal(availableSupplies(state, modelId).length, 1);
  assert.equal(state.models.find(item => item.id === modelId).callsEnabled, true);
  assert.equal(state.models.find(item => item.id === modelId).listingStatus, '已下架');
  assert.equal(state.modelSupplies.find(item => item.id === supplyId).salesEnabled, false);
  assert.equal(call().httpStatus, 200);
});

test('starting only changes the target service and preserves prices, shared connections and sale state', () => {
  const { state, modelId, supplyId } = stopped(), before = structuredClone(state);
  const next = op(state, 'startSupply', modelId, supplyId), model = state.models.find(item => item.id === modelId), saved = next.models.find(item => item.id === modelId);
  assert.deepEqual(saved, { ...model, callsEnabled: true, status: '运行中', updatedAt: saved.updatedAt });
  assert.deepEqual(next.modelSupplies.filter(item => item.id !== supplyId), state.modelSupplies.filter(item => item.id !== supplyId));
  for (const key of ['endpoints', 'providers', 'supplyPrices', 'modelSalePrices', 'serviceRoutes']) assert.deepEqual(next[key], state[key]);
  assert.deepEqual(state, before);
});

test('starting rechecks verification, current connection and supplier ownership atomically', () => {
  const original = stopped();
  for (const invalidate of [
    state => { state.modelSupplies.find(item => item.id === original.supplyId).validationStatus = '待验证'; },
    state => { const supply = modelSupplies(state, original.modelId)[0]; state.endpoints.find(item => item.id === supply.endpointId).status = '停用'; },
    state => { const supply = modelSupplies(state, original.modelId)[0]; state.providers.find(item => item.id === supply.provider.id).status = '停用'; },
  ]) {
    const state = structuredClone(original.state); invalidate(state); const before = structuredClone(state);
    assert.throws(() => op(state, 'startSupply', original.modelId, original.supplyId), /验证通过/);
    assert.deepEqual(state, before);
  }
  assert.throws(() => op(original.state, 'startSupply', 'model-1', original.supplyId), /不存在/);
});

test('starting retains permissions and failed-persistence protection', () => {
  const { state, modelId, supplyId } = stopped(), before = structuredClone(state);
  const action = { type: 'modelOperations', operation: 'startSupply', modelId, data: { id: supplyId } };
  assert.throws(() => commitAdminState({ ...state, currentRole: '运维人员' }, action), /无权/);
  assert.throws(() => persistModelAction(state, action, { getItem: () => JSON.stringify(state), setItem: () => { throw Error('storage failed'); } }), /storage failed/);
  assert.deepEqual(state, before);
});
