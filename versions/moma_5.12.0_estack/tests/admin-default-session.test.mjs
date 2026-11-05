import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminSeed, loadAdminState, serializeAdminState, STORAGE_KEY } from '../src/admin-v2/store.js';

function storageFor(state) {
  const rows = new Map([['moma.auth.5120', '前台会话保留']]);
  if (state) rows.set(STORAGE_KEY, serializeAdminState(state));
  return { rows, writes: 0, getItem: key => rows.get(key) ?? null, setItem(key, value) { this.writes++; rows.set(key, value); } };
}

test('first backend visit selects an enabled system administrator and persists the selection', () => {
  const storage = storageFor(), loaded = loadAdminState(storage);
  const account = loaded.admins.find(row => row.id === loaded.adminSession?.accountId);
  assert.equal(account?.role, '平台管理员');
  assert.equal(account.status, '已启用');
  assert.equal(loaded.currentRole, account.role);
  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEY)).adminSession, loaded.adminSession);
  const writes = storage.writes;
  assert.deepEqual(loadAdminState(storage).adminSession, loaded.adminSession);
  assert.equal(storage.writes, writes);
  assert.equal(storage.getItem('moma.auth.5120'), '前台会话保留');
});

test('a saved backend without a session defaults to system administrator without replacing business data', () => {
  const state = createAdminSeed();
  state.currentRole = '运维人员';
  state.settings.environmentLabel = '已保存的工作区';
  state.customerExtension = { keep: true };
  const storage = storageFor(state), loaded = loadAdminState(storage);
  assert.equal(loaded.adminSession?.accountId, 'admin-001');
  assert.equal(loaded.currentRole, '平台管理员');
  assert.equal(loaded.settings.environmentLabel, state.settings.environmentLabel);
  assert.deepEqual(loaded.customerExtension, state.customerExtension);
  assert.equal(loaded.revision, state.revision + 1);
});

test('an existing selected account stays selected, including disabled or missing accounts', () => {
  for (const accountId of ['admin-002', 'missing-admin']) {
    for (const disabled of [false, true]) {
      const state = createAdminSeed();
      state.adminSession = { accountId };
      state.currentRole = '运维人员';
      if (disabled) state.admins.find(row => row.id === 'admin-002').status = '已停用';
      const loaded = loadAdminState(storageFor(state));
      assert.deepEqual(loaded.adminSession, state.adminSession);
      assert.equal(loaded.currentRole, '运维人员');
    }
  }
});

test('no enabled system administrator leaves account selection empty', () => {
  const state = createAdminSeed();
  state.admins.find(row => row.id === 'admin-001').status = '已停用';
  assert.equal(loadAdminState(storageFor(state)).adminSession, undefined);
});

test('a failed default-session save preserves the original stored state and exposes the error', () => {
  const storage = storageFor(createAdminSeed()), raw = storage.getItem(STORAGE_KEY);
  storage.setItem = () => { throw new Error('quota'); };
  const loaded = loadAdminState(storage);
  assert.equal(loaded.storageError, 'quota');
  assert.equal(loaded.adminSession, undefined);
  assert.equal(storage.getItem(STORAGE_KEY), raw);
});
