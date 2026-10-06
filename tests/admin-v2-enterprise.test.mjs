import assert from 'node:assert/strict';
import test from 'node:test';
import { commitAdminState, createAdminSeed, parseAdminState, persistEnterpriseAction, STORAGE_KEY } from '../src/admin-v2/store.js';
import { simulateRequest } from '../src/admin-v2/domain.js';
import { enterpriseAdmins, enterpriseGrant, enterpriseTokenUsage, validateDemoAdminCode, enterpriseDisplayValue } from '../src/admin-v2/enterprise.js';
const create = (overrides = {}) => ({ type: 'enterprise', operation: 'create', ids: { tenant: 'tenant-test', user: 'user-test', member: 'member-test', organization: 'org-test' }, data: { companyName: '星辰科技', taxId: 'DEMO1234567890', type: '企业', accountMode: 'new', adminName: '张三', login: 'zhangsan', email: 'test@example.com', phone: '13800138000', countryRegion: '中国', province: '江苏省', contactName: '演示联系人', contactPhone: '025-12345678' }, ...overrides });

test('editing requires every administrator phone and rejects stale or foreign identities atomically', () => {
  const state = commitAdminState(createAdminSeed(), create());
  const command = { type: 'enterprise', operation: 'edit', tenantId: 'tenant-test', data: { ...create().data, companyName: '不应部分保存' } };
  const before = JSON.stringify(state);
  for (const adminPhones of [undefined, {}, { 'user-test': '', }, { 'user-test': '123' }, { 'user-test': '13800138000', 'user-unassigned': '13900139000' }]) {
    assert.throws(() => commitAdminState(state, { ...command, data: { ...command.data, adminPhones } }), /手机|管理员列表/);
    assert.equal(JSON.stringify(state), before);
  }
  const missingIdentity = structuredClone(state);
  missingIdentity.users = missingIdentity.users.filter(user => user.id !== 'user-test');
  assert.throws(() => commitAdminState(missingIdentity, { ...command, data: { ...command.data, adminPhones: { 'user-test': '13800138000' } } }), /身份缺失/);
});

test('editing phone keeps stable identity and relationships, persists and audits the change', () => {
  const state = commitAdminState(createAdminSeed(), create());
  state.users[0].phone = '';
  const next = commitAdminState(state, { type: 'enterprise', operation: 'edit', tenantId: 'tenant-test', data: { ...create().data, adminPhones: { 'user-test': '+44 7700 900123' } } });
  const restored = parseAdminState(JSON.stringify(next));
  assert.equal(restored.users[0].phone, '+447700900123');
  assert.equal(restored.users[0].id, 'user-test');
  assert.equal(restored.users[0].login, 'zhangsan');
  assert.deepEqual(next.memberships, state.memberships);
  assert.deepEqual(next.users.slice(1), state.users.slice(1));
  assert.equal(next.audits[0].before.find(item => item.collection === 'users').values.phone, '');
  assert.equal(next.audits[0].after.find(item => item.collection === 'users').changes.phone, '+447700900123');
});

test('enterprise creation atomically links tenant, root organization, account and admin without resources', () => {
  const state = createAdminSeed(), next = commitAdminState(state, create(), '运营人员');
  assert.equal(next.tenants[0].id, 'tenant-test');
  assert.equal(next.tenants[0].ownerId, next.users[0].id);
  assert.equal(next.organizations[0].tenantId, next.tenants[0].id);
  assert.equal(next.memberships[0].userId, next.users[0].id);
  assert.equal(next.users[0].initialized, false);
  assert.equal(next.projects.length, state.projects.length);
  assert.equal(next.apiKeys.length, state.apiKeys.length);
  assert.equal(next.audits[0].objectId, 'tenant-test');
  assert.equal(next.audits[0].action, '创建企业并开通管理员');
  assert.ok(Math.abs(Date.now() - Date.parse(next.audits[0].createdAt)) < 5000);
  const restored = parseAdminState(JSON.stringify(next));
  assert.equal(restored.users[0].login, 'zhangsan');
  assert.equal(restored.organizations[0].name, '星辰科技');
});

test('invalid and duplicate logins cannot leave a partial enterprise', () => {
  const state = createAdminSeed(), snapshot = JSON.stringify(state);
  assert.throws(() => commitAdminState(state, create({ data: { ...create().data, login: 'ZHANG' } })), /已存在/);
  assert.throws(() => commitAdminState(state, create({ data: { ...create().data, login: '有空格 ' } })), /3–64/);
  assert.throws(() => commitAdminState(state, create({ data: { ...create().data, companyName: ' ' } })), /公司\/机构名称/);
  assert.equal(JSON.stringify(state), snapshot);
});

test('reuse an identity without duplicating it and reject duplicate admin relationships', () => {
  const state = createAdminSeed();
  const next = commitAdminState(state, create({ data: { ...create().data, accountMode: 'existing', phone: '13800138000', userId: 'user-unassigned' } }));
  assert.equal(next.users.length, state.users.length);
  assert.equal(next.tenants[0].ownerId, 'user-unassigned');
  assert.throws(() => commitAdminState(next, { ...create(), operation: 'add-admin', tenantId: 'tenant-test', data: { accountMode: 'existing', phone: '13800138000', userId: 'user-unassigned' } }), /已是/);
});

test('last active admin is protected and disabling affects only one enterprise membership', () => {
  const state = commitAdminState(createAdminSeed(), create());
  const toggle = { type: 'enterprise', operation: 'toggle-admin', tenantId: 'tenant-test', memberId: 'member-test' };
  assert.throws(() => commitAdminState(state, toggle), /至少保留/);
  const added = commitAdminState(state, { ...create(), operation: 'add-admin', tenantId: 'tenant-test', ids: { member: 'member-second' }, data: { accountMode: 'existing', phone: '13800138000', userId: 'user-zhang' } });
  const disabled = commitAdminState(added, { ...toggle, memberId: 'member-second' });
  assert.equal(disabled.memberships.find(m => m.id === 'member-second').status, '停用');
  assert.equal(disabled.memberships.find(m => m.id === 'member-1').status, '正常');
  assert.equal(disabled.users.find(u => u.id === 'user-zhang').status, '正常');
  assert.equal(enterpriseAdmins(disabled, disabled.tenants[0]).filter(m => m.status === '正常').length, 1);
});

test('private single-enterprise policy allows initial creation and rejects a second enterprise', () => {
  const state = { ...createAdminSeed(), tenants: [], organizations: [], memberships: [] };
  const next = commitAdminState(state, create({ mode: 'private' }));
  assert.equal(next.tenants.length, 1);
  assert.throws(() => commitAdminState(next, create({ mode: 'private' })), /容量/);
});

test('enterprise rename updates root and suspension retains resources', () => {
  const state = createAdminSeed(), tenantId = 'tenant-nanjing';
  const renamed = commitAdminState(state, { type: 'enterprise', operation: 'edit', tenantId, data: { ...create().data, adminPhones: Object.fromEntries(enterpriseAdmins(state, state.tenants.find(t => t.id === tenantId)).map(m => [m.userId, '13800138000'])), companyName: '更名后的企业', type: '企业' } });
  assert.equal(renamed.organizations.find(org => org.tenantId === tenantId).name, '更名后的企业');
  const disabled = commitAdminState(renamed, { type: 'enterprise', operation: 'toggle-tenant', tenantId });
  assert.equal(disabled.tenants.find(t => t.id === tenantId).status, '停用');
  assert.deepEqual(disabled.apiKeys, state.apiKeys);
  const key = disabled.apiKeys.find(item => item.tenantId === tenantId && item.status === '有效');
  const outcome = simulateRequest(disabled, { requestId: 'enterprise-suspended-test', keyId: key.id, modelId: key.modelIds[0] });
  assert.equal(outcome.request.httpStatus, 401);
  assert.throws(() => commitAdminState(disabled, { ...create(), operation: 'add-admin', tenantId }), /解冻/);
});

test('only platform administrators and operators can execute enterprise commands', () => {
  for (const role of ['只读观察员', '运维人员', '财务人员', '安全管理员']) assert.throws(() => commitAdminState(createAdminSeed(), create(), role), /无权/);
});

test('ownership is not an admin permission and disabled identities cannot protect the last admin', () => {
  let state = commitAdminState(createAdminSeed(), create());
  const tenant = state.tenants.find(t => t.id === 'tenant-test');
  state.memberships.find(m => m.id === 'member-test').role = '开发者';
  assert.equal(enterpriseAdmins(state, tenant).length, 0);
  state = commitAdminState(state, { type: 'enterprise', operation: 'add-admin', tenantId: tenant.id, data: { accountMode: 'existing', phone: '13800138000', userId: 'user-test' } });
  assert.equal(enterpriseAdmins(state, tenant).length, 1);
  state = commitAdminState(state, { type: 'enterprise', operation: 'add-admin', tenantId: tenant.id, ids: { member: 'member-other' }, data: { accountMode: 'existing', phone: '13800138000', userId: 'user-unassigned' } });
  state.users.find(u => u.id === 'user-unassigned').status = '停用';
  assert.throws(() => commitAdminState(state, { type: 'enterprise', operation: 'toggle-admin', tenantId: tenant.id, memberId: 'member-test' }), /至少保留/);
  state.memberships.find(m => m.id === 'member-other').status = '停用';
  assert.throws(() => commitAdminState(state, { type: 'enterprise', operation: 'toggle-admin', tenantId: tenant.id, memberId: 'member-other' }), /登录账号已停用/);
});

test('enterprise commands reject nonenterprise targets, private cross-scope access and missing IDs', () => {
  const state = createAdminSeed();
  assert.throws(() => commitAdminState(state, create({ ids: {} })), /事务编号/);
  state.tenants.push({ id: 'personal-test', type: '个人' });
  assert.throws(() => commitAdminState(state, { type: 'enterprise', operation: 'toggle-tenant', tenantId: 'personal-test' }), /企业不存在/);
  assert.throws(() => commitAdminState(state, { type: 'enterprise', operation: 'toggle-tenant', tenantId: 'tenant-gov', mode: 'private' }), /私有化场景/);
});

const grantAction = (state, changes = {}) => ({ type: 'enterprise', operation: 'configure-grant', tenantId: 'tenant-gov', ids: { grant: 'tenant-grant', ledger: `ledger-enterprise-${state.revision}` }, data: { limit: 100000, modelIds: ['model-1', 'model-2'], reason: '合同额度配置', ...changes } });

test('enterprise authorization and quota persist atomically with a reason, ledger and audit', () => {
  const state = createAdminSeed();
  assert.throws(() => commitAdminState(state, grantAction(state, { reason: ' ' })), /调整原因/);
  assert.throws(() => commitAdminState(state, grantAction(state, { limit: '' })), /非负整数/);
  assert.throws(() => commitAdminState(state, grantAction(state, { modelIds: ['unknown'] })), /有效模型/);
  const next = commitAdminState(state, grantAction(state), '运营人员');
  assert.equal(enterpriseGrant(next, 'tenant-gov').limit, 100000);
  assert.equal(next.ledger[0].accountId, 'tenant-gov');
  assert.equal(next.ledger[0].delta, 100000);
  assert.equal(next.audits[0].action, '配置企业授权与额度');
  assert.throws(() => commitAdminState(next, grantAction(next)), /没有变化/);
  next.grants.find(g => g.id === 'tenant-grant').used = 123;
  assert.throws(() => commitAdminState(next, grantAction(next, { limit: 122 })), /低于已用/);
});

test('enterprise model intersection, total quota, cache units and request idempotency are enforced', () => {
  let state = createAdminSeed();
  const key = state.apiKeys.find(k => k.tenantId === 'tenant-gov' && k.status === '有效' && k.modelIds.includes('model-1') && state.grants.some(g => g.subjectId === k.id) && !state.limits.some(l => l.scopeId === k.id));
  state = commitAdminState(state, grantAction(state, { limit: 1500 }));
  const call = { requestId: 'tenant-request-1', keyId: key.id, modelId: 'model-1', usage: { input: 1000, cached: 500, output: 200 } };
  const first = simulateRequest(state, call);
  assert.equal(first.request.httpStatus, 200);
  assert.equal(enterpriseGrant(first.state, key.tenantId).used, 1200);
  assert.equal(enterpriseTokenUsage({ type: 'image' }, { images: 10 }), 0);
  assert.throws(() => enterpriseTokenUsage({ type: 'text' }, { input: -1, output: 20 }), /非负/);
  assert.throws(() => enterpriseTokenUsage({ type: 'text' }, { input: NaN, output: 20 }), /非负/);
  assert.equal(simulateRequest(first.state, call).state, first.state);
  const fail = simulateRequest(first.state, { ...call, requestId: 'tenant-request-2' });
  assert.equal(fail.request.httpStatus, 402);
  assert.equal(enterpriseGrant(fail.state, key.tenantId).used, 1200);
  const denied = commitAdminState(first.state, grantAction(first.state, { limit: 1500, modelIds: [] }));
  assert.equal(simulateRequest(denied, { ...call, requestId: 'tenant-denied' }).request.httpStatus, 403);
});

test('Key controls reject cross-enterprise and revoked targets, and suspension preserves child states', () => {
  let state = createAdminSeed();
  const key = state.apiKeys.find(k => k.tenantId === 'tenant-gov' && k.status === '有效');
  const action = { type: 'enterprise', operation: 'toggle-key', tenantId: 'tenant-nanjing', keyId: key.id };
  assert.throws(() => commitAdminState(state, action), /归属异常/);
  state = commitAdminState(state, { ...action, tenantId: 'tenant-gov' });
  assert.equal(state.apiKeys.find(k => k.id === key.id).status, '停用');
  state = commitAdminState(state, { type: 'enterprise', operation: 'toggle-tenant', tenantId: 'tenant-gov' });
  assert.throws(() => commitAdminState(state, { ...action, tenantId: 'tenant-gov' }), /先解冻企业账号/);
  assert.throws(() => commitAdminState(state, grantAction(state)), /先解冻企业账号/);
  state = commitAdminState(state, { type: 'enterprise', operation: 'toggle-tenant', tenantId: 'tenant-gov' });
  assert.equal(state.apiKeys.find(k => k.id === key.id).status, '停用');
  state.apiKeys.find(k => k.id === key.id).status = '撤销';
  assert.throws(() => commitAdminState(state, { ...action, tenantId: 'tenant-gov' }), /已撤销/);
});

test('actual persistence rejects stale revisions and write failures instead of returning false success', () => {
  const state = createAdminSeed(), original = JSON.stringify(state);
  let saved = original;
  const storage = { getItem: key => key === STORAGE_KEY ? saved : null, setItem: (_, value) => { saved = value; } };
  const next = persistEnterpriseAction(state, create(), storage);
  assert.equal(JSON.parse(saved).revision, next.revision);
  assert.throws(() => persistEnterpriseAction(state, create(), storage), /数据已变化/);
  assert.equal(JSON.stringify(state), original);
  saved = original;
  storage.setItem = () => { throw new Error('quota storage failure'); };
  assert.throws(() => persistEnterpriseAction(state, create(), storage), /storage failure/);
  assert.equal(saved, original);
});

test('enterprise metadata survives create, edit, storage and audit independently of login identity', () => {
  const data = { ...create().data, companyName: ' 星辰技术有限公司 ', taxId: 'demo1234567890', countryRegion: '中国', province: '江苏省', city: '南京市', address: '演示地址', industry: '信息技术', contactName: '业务联系人', contactPhone: '+86 025-12345678', contactEmail: 'business@example.com', website: 'https://example.com' };
  const opened = commitAdminState(createAdminSeed(), create({ data }));
  assert.equal(opened.tenants[0].companyName, '星辰技术有限公司');
  assert.equal(opened.tenants[0].taxId, 'DEMO1234567890');
  assert.equal(opened.users[0].email, 'test@example.com');
  const edited = commitAdminState(opened, { type: 'enterprise', operation: 'edit', tenantId: 'tenant-test', data: { ...data, adminPhones: { 'user-test': data.phone }, companyName: '星辰研发', city: '苏州市', contactPhone: '+86 025-87654321' } });
  const restored = parseAdminState(JSON.stringify(edited));
  assert.equal(restored.tenants[0].id, 'tenant-test');
  assert.equal(restored.tenants[0].companyName, '星辰研发');
  assert.equal(restored.tenants[0].city, '苏州市');
  assert.equal(restored.tenants[0].contactPhone, '+86 025-87654321');
  assert.equal(restored.organizations[0].name, '星辰研发');
  assert.equal(edited.audits[0].before.find(item => item.collection === 'tenants').values.city, '南京市');
  assert.equal(edited.audits[0].after.find(item => item.collection === 'tenants').changes.city, '苏州市');
});

test('invalid metadata rejects the entire onboarding transaction without leaving identities behind', () => {
  const state = createAdminSeed(), original = JSON.stringify(state);
  for (const [field, value, error] of [['contactEmail', 'bad', /联系邮箱/], ['website', 'javascript:alert(1)', /网站/], ['taxId', '税号#', /字母和数字/], ['city', 'a'.repeat(61), /城市/]]) {
    assert.throws(() => commitAdminState(state, create({ data: { ...create().data, [field]: value } })), error);
    assert.equal(JSON.stringify(state), original);
  }
});

test('admin demo code rejects missing, incorrect, expired and mismatched operation or role', () => {
  const issuedAt = 100000, challenge = { issuedAt, code: '012345', scope: 'tenants:tenant-test:停用', actor: '平台管理员' };
  const input = { code: '012345', scope: challenge.scope, actor: challenge.actor, now: issuedAt + 299999 };
  assert.equal(validateDemoAdminCode(challenge, input), true);
  assert.throws(() => validateDemoAdminCode(null, input), /先获取/);
  assert.throws(() => validateDemoAdminCode(challenge, { ...input, code: '123456' }), /错误/);
  assert.throws(() => validateDemoAdminCode(challenge, { ...input, now: issuedAt + 300000 }), /过期/);
  assert.throws(() => validateDemoAdminCode(challenge, { ...input, scope: 'tenants:another:停用' }), /对象或角色/);
  assert.throws(() => validateDemoAdminCode(challenge, { ...input, actor: '运营人员' }), /对象或角色/);
  assert.throws(() => validateDemoAdminCode(challenge, { ...input, now: issuedAt - 1 }), /过期/);
  const reissued = { ...challenge, code: '987654', issuedAt: issuedAt + 60000 };
  assert.throws(() => validateDemoAdminCode(reissued, { ...input, now: issuedAt + 60001 }), /错误/);
});


test('administrator phone is required and invalid values cannot leave partial state', () => {
  const state = createAdminSeed(), original = JSON.stringify(state);
  for (const phone of ['', '12345', 'phone', '+0123456789']) {
    assert.throws(() => commitAdminState(state, create({ data: { ...create().data, phone } })), /手机号码/);
    assert.throws(() => commitAdminState(state, create({ data: { ...create().data, accountMode: 'existing', userId: 'user-unassigned', phone } })), /手机号码/);
    assert.equal(JSON.stringify(state), original);
  }
  const next = commitAdminState(state, create({ data: { ...create().data, phone: '+1 (202) 555-0123' } }));
  assert.equal(parseAdminState(JSON.stringify(next)).users[0].phone, '+12025550123');
});

test('existing administrator phone is updated atomically and audited without a new identity', () => {
  const state = createAdminSeed(), next = commitAdminState(state, create({ data: { ...create().data, accountMode: 'existing', userId: 'user-unassigned' } }));
  assert.equal(next.users.length, state.users.length);
  assert.equal(next.users.find(user => user.id === 'user-unassigned').phone, '13800138000');
  assert.equal(next.audits[0].after.find(change => change.collection === 'users').changes.phone, '13800138000');
  assert.equal(state.users.find(user => user.id === 'user-unassigned').phone, undefined);
  assert.equal(next.tenants[0].name, next.tenants[0].companyName);
  assert.equal(next.organizations[0].name, next.tenants[0].companyName);
});


test('required enterprise metadata blocks both create and edit atomically', () => {
  const seed = createAdminSeed(), opened = commitAdminState(seed, create());
  for (const [field, label] of [['companyName', '公司/机构名称'], ['taxId', '税号/统一社会信用代码'], ['countryRegion', '国家/地区'], ['province', '省份/州'], ['contactName', '业务联系人'], ['contactPhone', '联系电话']]) {
    const data = { ...create().data, [field]: '   ' };
    for (const [state, action] of [[seed, create({ data })], [opened, { type: 'enterprise', operation: 'edit', tenantId: 'tenant-test', data }]]) {
      const before = JSON.stringify(state);
      assert.throws(() => commitAdminState(state, action), error => error.message.includes(label));
      assert.equal(JSON.stringify(state), before);
    }
  }
  assert.throws(() => commitAdminState(seed, create({ data: { ...create().data, contactPhone: '---' } })), /有效的联系电话/);
  const international = commitAdminState(seed, create({ data: { ...create().data, countryRegion: '梵蒂冈', province: '不适用', contactPhone: '+39 06 12345678' } }));
  assert.equal(international.tenants[0].province, '不适用');
});

test('enterprise freeze and unfreeze are audited without changing identities or child resources', () => {
  const seed = createAdminSeed(), action = { type: 'enterprise', operation: 'toggle-tenant', tenantId: 'tenant-gov' };
  const frozen = commitAdminState(seed, action);
  assert.equal(frozen.audits[0].action, '冻结企业账号');
  for (const collection of ['users', 'memberships', 'projects', 'apiKeys']) assert.deepEqual(frozen[collection], seed[collection]);
  const restored = commitAdminState(frozen, action);
  assert.equal(restored.audits[0].action, '解冻企业账号');
  assert.equal(restored.tenants.find(tenant => tenant.id === 'tenant-gov').status, '正常');
});


test('display masking hides sensitive text without altering stored enterprise or identity values', () => {
  const state = commitAdminState(createAdminSeed(), create({ data: { ...create().data, contactName: '张三', contactEmail: 'business@example.com' } }));
  const original = JSON.stringify(state);
  assert.equal(enterpriseDisplayValue('taxId', state.tenants[0].taxId), 'DEM*******7890');
  assert.equal(enterpriseDisplayValue('contactName', state.tenants[0].contactName), '张*');
  assert.equal(enterpriseDisplayValue('phone', state.users[0].phone), '138****8000');
  assert.equal(enterpriseDisplayValue('contactEmail', state.tenants[0].contactEmail), 'b***@example.com');
  assert.equal(enterpriseDisplayValue('phone', '+1 (202) 555-0123'), '+120****0123');
  for (const [field, value] of [['taxId', 'ABC'], ['contactName', '张'], ['phone', '123']]) assert.ok(!enterpriseDisplayValue(field, value).includes(value));
  assert.equal(enterpriseDisplayValue('taxId', ''), '');
  assert.equal(enterpriseDisplayValue('companyName', '星辰科技'), '星辰科技');
  assert.equal(JSON.stringify(state), original);
  const edited = commitAdminState(state, { type: 'enterprise', operation: 'edit', tenantId: 'tenant-test', data: { ...state.tenants[0], adminPhones: { 'user-test': state.users[0].phone }, province: '浙江省' } });
  assert.equal(parseAdminState(JSON.stringify(edited)).tenants[0].taxId, 'DEMO1234567890');
  assert.equal(edited.tenants[0].contactName, '张三');
});
