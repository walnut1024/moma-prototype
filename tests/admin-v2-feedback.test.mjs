import assert from 'node:assert/strict';
import test from 'node:test';
import { createAdminSeed, persistAdminAction, STORAGE_KEY } from '../src/admin-v2/store.js';

test('generic admin writes succeed only after persistence and reject failed or stale writes', () => {
  const state = createAdminSeed();
  let saved = JSON.stringify(state);
  const storage = { getItem: key => key === STORAGE_KEY ? saved : null, setItem: (key, value) => { assert.equal(key, STORAGE_KEY); saved = value; } };
  const action = { type: 'update', collection: 'clusters', id: state.clusters[0].id, changes: { status: '维护中' } };
  const next = persistAdminAction(state, action, storage);
  assert.equal(next.clusters[0].status, '维护中');
  assert.equal(JSON.parse(saved).revision, next.revision);
  assert.equal(state.clusters[0].status, '运行中');
  assert.throws(() => persistAdminAction(state, action, storage), /数据已变化/);
  const before = saved;
  assert.throws(() => persistAdminAction(next, action, { ...storage, setItem: () => { throw Error('存储空间不足'); } }), /存储空间不足/);
  assert.equal(saved, before);
  assert.throws(() => persistAdminAction({ ...next, currentRole: '运营人员' }, action, storage), /无权/);
  assert.throws(() => persistAdminAction({ ...next, storageError: '损坏' }, action, storage), /读取失败/);
});
