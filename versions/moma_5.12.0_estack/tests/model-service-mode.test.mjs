import { withAdminSession } from './admin-session-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminSeed as baseCreateAdminSeed, commitAdminState, parseAdminState as baseParseAdminState, persistModelAction } from '../src/admin-v2/store.js';
import { publicationChecks } from '../src/admin-v2/model-management.js';

const action = (model, serviceMode, expectedUpdatedAt = model.updatedAt) => ({ type: 'modelOperations', operation: 'serviceMode', modelId: model.id, data: { serviceMode, expectedUpdatedAt } });
const setup = () => {
  const state = createAdminSeed(), model = state.models.find(item => item.listingStatus === '已下架');
  assert.ok(model);
  return { state, model };
};

test('unknown persisted service modes cannot bypass required-mode publication checks', () => {
  const {state,model}=setup();model.serviceMode='unknown';
  assert.deepEqual(publicationChecks(state,model).filter(check=>!check.passed && check.tab==='serviceMode').map(check=>check.label),['服务模式无效，请重新选择']);
  assert.throws(()=>commitAdminState(state,{type:'modelOperation',operation:'publish',modelId:model.id,data:{}}),/服务模式无效/);
});

test('initial service mode selection preserves all existing business fields', () => {
  for (const serviceMode of ['standard', 'provider']) {
    const {state,model}=setup();
    const before = structuredClone(state), next = commitAdminState(state, action(model, serviceMode));
    const saved = next.models.find(item => item.id === model.id);
    assert.deepEqual(saved, { ...model, serviceMode, accessGeneration: (model.accessGeneration || 0) + 1, requestGeneration: (model.requestGeneration || 0) + 1, updatedAt: saved.updatedAt });
    for (const key of Object.keys(state).filter(key => !['models', 'modelData', 'initialData', 'audits', 'revision', 'updatedAt'].includes(key))) assert.deepEqual(next[key], state[key]);
    assert.ok(next.modelData.userIds.models.includes(model.id));
    assert.deepEqual(state, before);
    assert.equal(parseAdminState(JSON.stringify(next)).models.find(item => item.id === model.id).serviceMode, serviceMode);
  }
});

test('saved modes reject edits even when the old reset confirmation is supplied', () => {
  for (const serviceMode of ['standard', 'provider']) {
    for (const listingStatus of ['已上架', '已下架']) {
      const state = createAdminSeed();
      const model = state.models.find(row => state.modelSupplies.some(supply => supply.modelId === row.id));
      Object.assign(model, { serviceMode, listingStatus });
      const before = structuredClone(state);
      const replacement = serviceMode === 'standard' ? 'provider' : 'standard';
      const pending = action(model, replacement);
      pending.data.confirmedReset = true;
      assert.throws(() => commitAdminState(state, pending), /服务模式设置后不可修改/);
      assert.throws(() => commitAdminState(state, action(model, serviceMode)), /服务模式设置后不可修改/);
      assert.deepEqual(state, before);
    }
  }
});

test('a listed legacy model without a service mode requires confirmation before initial selection delists it', () => {
  const state=createAdminSeed(),model=state.models.find(item=>item.listingStatus==='已上架');delete model.serviceMode;
  const before=structuredClone(state),pending=action(model,'standard');
  assert.throws(()=>commitAdminState(state,pending),/请确认模型下架/);
  pending.data.confirmDownlist=true;
  const next=commitAdminState(state,pending),saved=next.models.find(item=>item.id===model.id);
  assert.equal(saved.serviceMode,'standard');assert.equal(saved.listingStatus,'已下架');assert.equal(saved.callsEnabled,false);
  for(const key of ['providers','endpoints','supplyPrices','modelSalePrices','orders','requests','apiKeys'])assert.deepEqual(next[key],state[key],key);
  assert.deepEqual(state,before);
});

test('saving rechecks listing state after the configuration dialog was opened', () => {
  const { state, model } = setup(), pending = action(model, 'standard');
  model.listingStatus = '已上架';
  assert.throws(() => commitAdminState(state, pending), /请确认模型下架/);
  assert.equal(model.serviceMode, undefined);
});

test('service mode rejects multiple values, unknown modes, invalid states and stale revisions', () => {
  const { state, model } = setup(), before = structuredClone(state);
  for (const mode of ['', 'invalid', ['standard', 'provider'], ['provider'], null, '__proto__']) assert.throws(() => commitAdminState(state, action(model, mode)), /一种有效/);
  assert.throws(() => commitAdminState(state, action(model, 'standard', 'stale')), /并发修订/);
  assert.throws(() => commitAdminState(state, { ...action(model, 'standard'), modelId: 'missing' }), /模型不存在/);
  assert.deepEqual(state, before);
  model.listingStatus = '未知';
  assert.throws(() => commitAdminState(state, action(model, 'provider')), /模型上架状态无效/);
});

test('service mode retains permission, concurrent-write and storage-error protection', () => {
  const { state, model } = setup(), before = structuredClone(state), pending = action(model, 'standard');
  assert.throws(() => commitAdminState({ ...state, currentRole: '运维人员' }, pending), /无权/);
  assert.throws(() => persistModelAction(state, pending, { getItem: () => JSON.stringify({ ...state, revision: state.revision + 1 }), setItem: () => assert.fail('must not save') }), /数据已变化/);
  assert.throws(() => persistModelAction(state, pending, { getItem: () => JSON.stringify(state), setItem: () => { throw Error('storage failed'); } }), /storage failed/);
  assert.deepEqual(state, before);
});

function createAdminSeed(...args) { return withAdminSession(baseCreateAdminSeed(...args)); }
function parseAdminState(...args) { return withAdminSession(baseParseAdminState(...args)); }
