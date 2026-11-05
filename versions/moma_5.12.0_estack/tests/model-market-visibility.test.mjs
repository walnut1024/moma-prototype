import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAdminState, commitAdminState, persistModelAction } from '../src/admin-v2/store.js';
import { withAdminSession } from './admin-session-fixture.mjs';
import { lifecycleSignature } from '../src/service-access.mjs';
import { platformPublicationFingerprint } from '../src/admin-v2/platform-publication-state.js';

const fixture = () => withAdminSession(parseAdminState(null));
const action = (model, visible, patch = {}) => ({ type: 'modelOperations', operation: 'marketVisibility', modelId: model.id, data: { visible, expectedUpdatedAt: model.updatedAt, ...patch } });

test('gallery visibility persists independently of lifecycle, customers, pricing, routes, credentials and other models', () => {
  const state = fixture(), model = state.models[0], before = structuredClone(state);
  const fingerprint = platformPublicationFingerprint(state, model, `standard:${model.id}`);
  const hidden = commitAdminState(state, action(model, false)), saved = hidden.models.find(row => row.id === model.id);
  assert.equal(saved.marketVisible, false);
  assert.equal(lifecycleSignature(saved), lifecycleSignature(model));
  assert.equal(platformPublicationFingerprint(hidden, saved, `standard:${model.id}`), fingerprint);
  assert.deepEqual(Object.fromEntries(Object.entries(saved).filter(([key]) => !['marketVisible', 'updatedAt'].includes(key))), Object.fromEntries(Object.entries(model).filter(([key]) => !['marketVisible', 'updatedAt'].includes(key))));
  assert.deepEqual(hidden.models.filter(row => row.id !== model.id), state.models.filter(row => row.id !== model.id));
  for (const key of ['orders','products','grants','tenants','providers','endpoints','modelSupplies','supplyPrices','modelSalePrices','serviceRoutes','modelTemplates']) assert.deepEqual(hidden[key], state[key], key);
  const restored = fixtureFrom(hidden);
  assert.equal(restored.models.find(row => row.id === model.id).marketVisible, false);
  const shown = commitAdminState(restored, action(restored.models.find(row => row.id === model.id), true));
  assert.equal(shown.models.find(row => row.id === model.id).marketVisible, true);
  assert.equal(shown.audits[0].action, '设为用户可见');
  assert.equal(hidden.audits[0].action, '设为用户不可见');
  assert.deepEqual(state, before);
});

const fixtureFrom = state => withAdminSession(parseAdminState(JSON.stringify(state)));

test('visibility rejects invalid input, missing models, concurrent revisions, direct writes and read-only operators', () => {
  const state = fixture(), model = state.models[0], before = structuredClone(state);
  for (const value of [undefined, null, 0, 'false', {}]) assert.throws(() => commitAdminState(state, action(model, value)), /有效/);
  assert.throws(() => commitAdminState(state, action(model, false, { expectedUpdatedAt: 'stale' })), /并发/);
  assert.throws(() => commitAdminState(state, { ...action(model, false), modelId: 'missing' }), /不存在/);
  assert.throws(() => commitAdminState(withAdminSession({ ...state, currentRole: '运维人员' }), action(model, false)), /无权/);
  assert.throws(() => commitAdminState(state, { type:'update', collection:'models', id:model.id, changes:{marketVisible:false} }), /服务管理/);
  assert.throws(() => persistModelAction(state, action(model, false), {getItem:()=>JSON.stringify({...state,revision:state.revision+1}),setItem:()=>assert.fail('must not overwrite')}), /数据已变化/);
  assert.throws(() => persistModelAction(state, action(model, false), {getItem:()=>JSON.stringify(state),setItem:()=>{throw Error('storage full');}}), /storage full/);
  assert.deepEqual(state, before);
});

test('making a disabled service visible never publishes or enables it', () => {
  const state = fixture(), model = state.models[0];
  Object.assign(model,{marketVisible:false,listingStatus:'已下架',visibility:'内部',callsEnabled:false,status:'停用'});
  const next = commitAdminState(state, action(model, true)).models.find(row => row.id === model.id);
  assert.equal(next.marketVisible,true); assert.equal(next.listingStatus,'已下架'); assert.equal(next.callsEnabled,false); assert.equal(next.visibility,'内部');
});
