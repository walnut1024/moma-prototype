import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminSeed, commitAdminState, persistAdminAccountAction, STORAGE_KEY } from '../src/admin-v2/store.js';
import { ADMIN_ROLES, ADMIN_ROLE_LABELS, generateAdminPassword, normalizeAdminLogin } from '../src/admin-v2/admin-accounts.js';

const create = { type: 'adminAccount', operation: 'create', id: 'admin-test', values: { account: '13800000801', name: '测试账号', role: '运营人员', phone: '13800000801' } };
test('account lifecycle preserves identity and appends audit before and after values', () => {
  const seed = createAdminSeed();
  const created = commitAdminState(seed, create);
  assert.equal(created.admins[0].status, '已启用');
  assert.equal(seed.admins.length, 2);
  const edited = commitAdminState(created, { type: 'adminAccount', operation: 'edit', id: create.id, values: { ...create.values, account: 'ignored-change', name: '新姓名', role: '运维人员' } });
  assert.equal(edited.admins[0].account, create.values.account);
  assert.equal(edited.audits[0].before[0].values.role, '运营人员');
  assert.equal(edited.audits[0].after[0].changes.role, '运维人员');
  const disabled = commitAdminState(edited, { type: 'adminAccount', operation: 'toggle', id: create.id });
  assert.equal(disabled.admins[0].status, '停用');
  assert.deepEqual(disabled.tenants, seed.tenants);
  const enabled = commitAdminState(disabled, { type: 'adminAccount', operation: 'toggle', id: create.id });
  assert.equal(enabled.admins[0].status, '已启用');
  assert.equal(enabled.audits.length, 4);
});

test('account validation rejects duplicates, invalid roles and direct mutation bypasses', () => {
  const seed = createAdminSeed();
  const created = commitAdminState(seed, create);
  assert.throws(() => commitAdminState(created, { ...create, id: 'duplicate', values: { ...create.values, account: '+86 138-0000-0801' } }), /已存在/);
  assert.throws(() => commitAdminState(seed, { ...create, values: { ...create.values, role: '自定义超级角色' } }), /有效的后台角色/);
  assert.throws(() => commitAdminState(seed, { ...create, values: { ...create.values, name: ' ' } }), /姓名/);
  assert.throws(() => commitAdminState(seed, create, '运营人员'), /无权/);
  assert.throws(() => commitAdminState(seed, { type: 'update', collection: 'admins', id: 'admin-001', changes: { status: '停用' } }), /账号管理/);
  assert.throws(() => commitAdminState(seed, { type: 'batch', changes: [{ type: 'update', collection: 'admins', id: 'admin-001', changes: { role: '运营人员' } }] }), /账号管理/);
});

test('last enabled platform administrator cannot be disabled or demoted', () => {
  const seed = createAdminSeed();
  assert.throws(() => commitAdminState(seed, { type: 'adminAccount', operation: 'toggle', id: 'admin-001' }), /至少保留/);
  assert.throws(() => commitAdminState(seed, { type: 'adminAccount', operation: 'edit', id: 'admin-001', values: { ...seed.admins[0], phone: create.values.phone, role: '运维人员' } }), /至少保留/);
  const next = commitAdminState(seed, { ...create, values: { ...create.values, role: '平台管理员' } });
  assert.equal(commitAdminState(next, { type: 'adminAccount', operation: 'toggle', id: 'admin-001' }).admins.find(account => account.id === 'admin-001').status, '停用');
});

test('account persistence detects stale revisions and failed writes', () => {
  const seed = createAdminSeed(); let raw = JSON.stringify(seed);
  const storage = { getItem: key => key === STORAGE_KEY ? raw : null, setItem: (key, value) => { assert.equal(key, STORAGE_KEY); raw = value; } };
  const saved = persistAdminAccountAction(seed, create, storage);
  assert.equal(JSON.parse(raw).admins[0].account, create.values.account);
  assert.throws(() => persistAdminAccountAction(seed, create, storage), /数据已变化/);
  assert.throws(() => persistAdminAccountAction(saved, { type: 'adminAccount', operation: 'toggle', id: create.id }, { getItem: () => raw, setItem: () => { throw new Error('配额不足'); } }), /配额不足/);
  assert.equal(saved.admins[0].status, '已启用');
});

test('account phone is required, normalized, persisted and audited without data scope', () => {
  const seed = createAdminSeed();
  for (const phone of ['', 'abc', '1381234567', '+8612812345678']) {
    assert.throws(() => commitAdminState(seed, { ...create, values: { ...create.values, account: phone } }), /手机号/);
  }
  const saved = commitAdminState(seed, { ...create, values: { ...create.values, account: '+86 138-0000-0801' } });
  assert.equal(saved.admins[0].phone, '13800000801');
  assert.equal(Object.hasOwn(saved.admins[0], 'scope'), false);
  const edited = commitAdminState(saved, { type: 'adminAccount', operation: 'edit', id: create.id, values: { ...create.values, phone: '+1 202-555-0182' } });
  assert.equal(edited.admins[0].phone, '13800000801');
  assert.equal(edited.audits[0].before[0].values.phone, '13800000801');
  assert.equal(edited.audits[0].after[0].changes.phone, '13800000801');
  assert.equal(edited.admins[0].account, create.values.account);
  const existing = commitAdminState(seed, { type: 'adminAccount', operation: 'edit', id: 'admin-002', values: { ...seed.admins[1], phone: '+1 202-555-0182' } });
  assert.equal(existing.admins[1].account, 'ops-wang');
  assert.equal(existing.admins[1].phone, '+12025550182');
  assert.equal(existing.admins[1].scope, seed.admins[1].scope);
});

test('email login validates, normalizes, deduplicates and preserves identity on edit', () => {
  const seed = createAdminSeed();
  const values = { ...create.values, accountType: 'email', account: ' Ops.Team+Admin@EXAMPLE.COM ', phone: 'invalid-hidden-phone' };
  const saved = commitAdminState(seed, { ...create, values });
  assert.equal(saved.admins[0].account, 'ops.team+admin@example.com');
  assert.equal(saved.admins[0].email, 'ops.team+admin@example.com');
  assert.equal(saved.admins[0].phone, '');
  assert.equal(saved.admins[0].accountType, 'email');
  assert.equal(commitAdminState(seed, create).admins[0].accountType, 'phone');
  assert.throws(() => commitAdminState(saved, { ...create, id: 'duplicate-email', values: { ...values, account: 'OPS.TEAM+ADMIN@example.com' } }), /已存在/);
  for (const account of ['', 'user', 'a@localhost', 'a@@example.com', 'a b@example.com', '.a@example.com', 'a..b@example.com', 'a@example..com', 'a@-example.com', 'a'.repeat(65) + '@example.com']) assert.throws(() => normalizeAdminLogin(account, 'email'), /邮箱/);
  assert.throws(() => normalizeAdminLogin('ops-zhang', 'phone'), /手机号/);
  assert.throws(() => normalizeAdminLogin('test@example.com', 'other'), /手机号码或邮箱/);
  const edited = commitAdminState(saved, { type: 'adminAccount', operation: 'edit', id: create.id, values: { ...values, account: 'ignored@example.com', phone: '', name: '编辑姓名' } });
  assert.equal(edited.admins[0].account, saved.admins[0].account);
  assert.equal(edited.admins[0].accountType, 'email');
  assert.equal(edited.admins[0].email, saved.admins[0].email);
});

test('three assigned roles retain permission identifiers and reject removed role choices', () => {
  assert.deepEqual(ADMIN_ROLES.map(role => ADMIN_ROLE_LABELS[role]), ['运营管理员', '运维管理员', '系统管理员']);
  const seed = createAdminSeed();
  for (const role of ADMIN_ROLES) assert.equal(commitAdminState(seed, { ...create, values: { ...create.values, role } }).admins[0].role, role);
  for (const role of ['财务人员', '安全管理员', '只读观察员']) {
    assert.throws(() => commitAdminState(seed, { ...create, values: { ...create.values, role } }), /有效的后台角色/);
  }
});

test('password generation and resets retain only version metadata through guarded persistence', () => {
  const passwords = Array.from({ length: 64 }, generateAdminPassword);
  assert.equal(new Set(passwords).size, passwords.length);
  for (const password of passwords) {
    assert.equal(password.length, 20);
    for (const pattern of [/[a-z]/, /[A-Z]/, /\d/, /[!_-]/]) assert.match(password, pattern);
  }
  const seed = createAdminSeed(); let raw = JSON.stringify(seed);
  const storage = { getItem: () => raw, setItem: (_, value) => { raw = value; } };
  const created = persistAdminAccountAction(seed, { ...create, values: { ...create.values, password: passwords[0] } }, storage);
  assert.equal(created.admins[0].passwordVersion, 1);
  const action = { type: 'adminAccount', operation: 'resetPassword', id: create.id, values: { password: passwords[1] } };
  const reset = persistAdminAccountAction(created, action, storage);
  assert.equal(reset.admins[0].passwordVersion, 2);
  assert.ok(Number.isFinite(Date.parse(reset.admins[0].passwordUpdatedAt)));
  assert.equal(reset.admins[0].role, created.admins[0].role);
  assert.equal(reset.admins[0].status, created.admins[0].status);
  assert.equal(reset.audits[0].action, '重置后台账号密码');
  assert.equal(reset.audits[0].before[0].values.passwordVersion, 1);
  assert.equal(reset.audits[0].after[0].changes.passwordVersion, 2);
  assert.deepEqual(JSON.parse(raw).admins, reset.admins);
  for (const password of passwords.slice(0, 2)) assert.equal(raw.includes(password), false);
  assert.throws(() => commitAdminState(created, action, '运营人员'), /无权/);
  assert.throws(() => commitAdminState(created, action, '运维人员'), /无权/);
  assert.throws(() => commitAdminState(created, { ...action, id: 'missing' }), /账号不存在/);
  assert.throws(() => persistAdminAccountAction(created, action, storage), /数据已变化/);
  assert.throws(() => persistAdminAccountAction(reset, action, { getItem: () => raw, setItem: () => { throw Error('保存失败'); } }), /保存失败/);
  const disabled = commitAdminState(reset, { type: 'adminAccount', operation: 'toggle', id: create.id });
  assert.equal(commitAdminState(disabled, action).admins[0].status, '停用');
  assert.equal(commitAdminState(seed, { ...action, id: 'admin-001' }).admins[0].passwordVersion, 1);
});
