import test from 'node:test';
import assert from 'node:assert/strict';
import { commitAdminState, createAdminSeed, parseAdminState, persistIndividualAction, STORAGE_KEY } from '../src/admin-v2/store.js';
import { filterIndividualAccounts, individualAccounts, maskIndividualValue } from '../src/admin-v2/individual-users.js';
import { simulateRequest } from '../src/admin-v2/domain.js';
import { MODEL_ORDER_BILLING_TYPES, MODEL_ORDER_COLUMNS } from '../src/model-order-display.mjs';
import { individualOrders, individualOrderDisplay } from '../src/admin-v2/individual-users.js';

const target = 'personal-demo-001';

test('personal subscriptions use the frontend billing categories including Coding Plan', () => {
  assert.deepEqual(Object.values(MODEL_ORDER_BILLING_TYPES), ['按Token用量计费', '按资源包计费', 'Token Plan订阅', 'Coding Plan订阅']);
  assert.deepEqual(MODEL_ORDER_COLUMNS, ['类型', '模型服务商', '资费场景', '目录价', '订购状态', '订购时间', '到期时间', '操作']);
  const state = createAdminSeed();
  state.orders = state.orders.filter(order => order.tenantId !== target);
  state.products.push({ id: 'coding-product', code: 'CODING-MONTH', name: '研发助手 Coding Plan' });
  state.orders.push({ id: 'coding-order', tenantId: target, productId: 'coding-product' }, { id: 'unknown-billing', tenantId: target, productId: 'product-payg', billingType: 'other' });
  assert.deepEqual(individualOrders(state, target).map(entry => entry.billingType), ['coding', null]);
});

test('subscription display preserves purchased facts and does not invent provider, price or usage', () => {
  const state = createAdminSeed();
  const product = { name: '模型服务', modelIds: ['model-1'], catalogPrice: 5, priceUnit: '元/百万 Token', providerId: 'provider-cmss', tariffScenario: '输入 Token' };
  const order = { createdAt: '2026-09-15T10:00:00+08:00', startAt: '2026-09-16T10:00:00+08:00', endAt: '2027-09-15T10:00:00+08:00', catalogPrice: '2 元/百万tokens\n4 元/百万tokens', providerName: '订购时的服务商', tariffScenario: '输入\n输出', status: '已开通' };
  const display = individualOrderDisplay(state, { order, product, billingType: 'payg' });
  assert.equal(display.name, 'DeepSeek-V4-Pro');
  assert.equal(display.provider, '订购时的服务商');
  assert.equal(display.catalogPrice, order.catalogPrice);
  assert.equal(display.tariff, order.tariffScenario);
  assert.equal(display.orderedAt, order.createdAt);
  assert.notEqual(display.orderedAt, order.startAt);
  assert.equal(display.expiresAt, order.endAt);
  const missing = individualOrderDisplay(state, { order: {}, product: { modelIds: ['model-1'], price: 699 }, billingType: 'payg' });
  assert.equal(missing.provider, '未记录');
  assert.equal(missing.catalogPrice, '未记录');
  assert.equal(missing.tariff, '未记录');
  assert.equal(missing.orderedAt, undefined);
  const zeroPrice = individualOrderDisplay(state, { order: { catalogPrice: 0 }, billingType: 'coding' });
  assert.equal(zeroPrice.catalogPrice, '0（单位未记录）');
  assert.equal(zeroPrice.type, 'Coding Plan');
});
const edit = (data = {}) => ({ type: 'individual', operation: 'edit', tenantId: target, data: { nickname: '新昵称', email: 'personal@example.com', notes: '客服核对', ...data } });
const freeze = (data = {}) => ({ type: 'individual', operation: 'set-status', tenantId: target, data: { status: '停用', reason: '异常调用核查', challenge: { code: '123456', issuedAt: Date.now(), scope: `individual:${target}:freeze`, actor: '平台管理员' }, code: '123456', ...data } });

test('personal account list excludes enterprise-only identities and retains explicit scope', () => {
  const state = createAdminSeed(), accounts = individualAccounts(state);
  assert.equal(accounts.length, 12);
  assert.ok(accounts.every(({ tenant, user }) => tenant.type === '个人' && user.phone && user.id === tenant.ownerId));
  assert.ok(!accounts.some(({ user }) => user.id === 'user-zhang'));
  const tenant = state.tenants.find(item => item.id === 'tenant-gov');
  state.memberships.push({ id: 'dual-membership', tenantId: tenant.id, userId: accounts[0].user.id, status: '正常', role: '开发者' });
  assert.equal(individualAccounts(state).length, 12);
});

test('search combines with account status without registration-date constraints', () => {
  const state = createAdminSeed();
  assert.equal(filterIndividualAccounts(state, { q: '13800001001' })[0].tenant.id, target);
  assert.equal(filterIndividualAccounts(state, { q: 'user-personal-demo-001', status: '正常' }).length, 1);
  assert.equal(filterIndividualAccounts(state, { q: '林间风', status: '停用' }).length, 0);
  assert.equal(filterIndividualAccounts(state, { status: '停用' }).length, 2);
  state.users.find(user => user.id === 'user-personal-demo-001').registeredAt = null;
  assert.equal(filterIndividualAccounts(state, { q: '林间风' }).length, 1);
  assert.equal(filterIndividualAccounts(state, { start: '2099-01-01', end: '2000-01-01' }).length, 12);
});

test('editing preserves phone, login, stable ID, memberships and resource ownership', () => {
  const state = createAdminSeed(), user = state.users.find(item => item.id === 'user-personal-demo-001');
  const next = commitAdminState(state, edit({ phone: '13999999999', id: 'wrong-id', login: 'wrong-login' }));
  const saved = next.users.find(item => item.id === user.id);
  assert.equal(saved.nickname, '新昵称'); assert.equal(saved.phone, user.phone); assert.equal(saved.login, user.login);
  assert.equal(next.tenants.find(item => item.id === target).name, '新昵称');
  assert.deepEqual(next.memberships, state.memberships); assert.deepEqual(next.apiKeys, state.apiKeys);
  assert.equal(next.audits[0].objectId, target); assert.equal(next.audits[0].before[0].values.nickname, user.nickname);
  assert.throws(() => commitAdminState(state, edit({ email: 'bad-email' })), /邮箱/);
  assert.throws(() => commitAdminState(state, edit({ nickname: 'x'.repeat(41) })), /昵称/);
});

test('freezing blocks personal Key requests while preserving enterprise membership and child status', () => {
  const state = createAdminSeed();
  state.memberships.push({ id: 'enterprise-member', tenantId: 'tenant-gov', userId: 'user-personal-demo-001', role: '开发者', status: '正常' });
  const frozen = commitAdminState(state, freeze());
  assert.equal(frozen.tenants.find(item => item.id === target).status, '停用');
  assert.deepEqual(frozen.users, state.users); assert.deepEqual(frozen.memberships, state.memberships); assert.deepEqual(frozen.apiKeys, state.apiKeys); assert.deepEqual(frozen.projects, state.projects);
  const denied = simulateRequest(frozen, { requestId: 'personal-frozen-request', keyId: 'personal-key-demo-001', modelId: 'model-1' });
  assert.equal(denied.request.httpStatus, 401);
  const thawed = commitAdminState(frozen, freeze({ status: '正常', reason: '核查完成', challenge: null, code: '' }));
  assert.equal(thawed.tenants.find(item => item.id === target).status, '正常');
  assert.deepEqual(thawed.apiKeys, state.apiKeys);
  assert.equal(simulateRequest(thawed, { requestId: 'personal-thawed-request', keyId: 'personal-key-demo-001', modelId: 'model-1' }).request.httpStatus, 200);
});

test('freezing requires valid actor/object/time-bound code and a reason', () => {
  const state = createAdminSeed();
  assert.throws(() => commitAdminState(state, freeze({ reason: ' ' })), /操作原因/);
  assert.throws(() => commitAdminState(state, freeze({ code: '000000' })), /校验码错误/);
  const expired = freeze(); expired.data.challenge.issuedAt -= 300000;
  assert.throws(() => commitAdminState(state, expired), /过期/);
  const wrongScope = freeze(); wrongScope.data.challenge.scope = 'individual:other:freeze';
  assert.throws(() => commitAdminState(state, wrongScope), /对象或角色/);
  assert.throws(() => commitAdminState(state, freeze({ challenge: null })), /获取管理员/);
  assert.throws(() => commitAdminState(state, { ...edit(), tenantId: 'tenant-gov' }), /个人用户不存在/);
});

test('only platform admins and operators can change personal accounts', () => {
  const state = createAdminSeed();
  for (const role of ['只读观察员', '运维人员', '财务人员', '安全管理员']) assert.throws(() => commitAdminState(state, edit(), role), /无权/);
  assert.equal(commitAdminState(state, edit(), '运营人员').revision, state.revision + 1);
});

test('checked persistence rejects stale revisions and storage failures before success', () => {
  const state = createAdminSeed(); let saved = JSON.stringify(state);
  const storage = { getItem: key => { assert.equal(key, STORAGE_KEY); return saved; }, setItem: (key, value) => { assert.equal(key, STORAGE_KEY); saved = value; } };
  const next = persistIndividualAction(state, edit(), storage);
  assert.equal(JSON.parse(saved).revision, next.revision);
  assert.throws(() => persistIndividualAction(state, edit(), storage), /数据已变化/);
  assert.throws(() => persistIndividualAction(next, edit(), storage, state.revision), /数据已变化/);
  assert.throws(() => persistIndividualAction(next, edit(), { getItem: () => saved, setItem: () => { throw new Error('quota exceeded'); } }), /quota exceeded/);
  assert.equal(next.users.find(user => user.id === 'user-personal-demo-001').nickname, '新昵称');
});

test('sample initialization preserves existing edits, frozen status and added records on reload', () => {
  const edited = commitAdminState(createAdminSeed(), edit());
  const frozen = commitAdminState(edited, freeze());
  frozen.users.push({ id: 'user-custom', nickname: '保留', status: '正常' });
  const restored = parseAdminState(JSON.stringify(frozen));
  assert.equal(individualAccounts(restored).length, 12);
  assert.equal(restored.users.find(user => user.id === 'user-personal-demo-001').nickname, '新昵称');
  assert.equal(restored.tenants.find(item => item.id === target).status, '停用');
  assert.ok(restored.users.some(user => user.id === 'user-custom'));
  assert.deepEqual(restored.audits, JSON.parse(JSON.stringify(frozen.audits)));
});

test('rendered phone and email are masked without losing stored or audit values', () => {
  assert.equal(maskIndividualValue('phone', '13800001001'), '138****1001');
  assert.equal(maskIndividualValue('phone', ''), '未填写');
  const next = commitAdminState(createAdminSeed(), edit());
  assert.equal(maskIndividualValue('email', next.users.find(user => user.id === 'user-personal-demo-001').email), 'p***@example.com');
  assert.ok(next.audits[0].after.some(change => change.changes.email === 'personal@example.com'));
  assert.equal(next.users.find(user => user.id === 'user-personal-demo-001').email, 'personal@example.com');
});

test('batch freeze is one checked transaction, scoped to the exact personal accounts', async () => {
  const { individualFreezeScope } = await import('../src/admin-v2/individual-users.js');
  const state = createAdminSeed(), ids = ['personal-demo-001', 'personal-demo-002'];
  const command = { type: 'individual', operation: 'batch-freeze', tenantIds: ids, data: { reason: '批量异常核查', code: '123456', challenge: { code: '123456', issuedAt: Date.now(), actor: state.currentRole, scope: individualFreezeScope(ids) } } };
  const next = commitAdminState(state, command);
  assert.equal(next.revision, state.revision + 1);
  for (const id of ids) assert.equal(next.tenants.find(item => item.id === id).status, '停用');
  assert.equal(next.audits[0].before.length, 2);
  assert.deepEqual(next.users, state.users); assert.deepEqual(next.apiKeys, state.apiKeys); assert.deepEqual(next.memberships, state.memberships);
  assert.equal(simulateRequest(next, { requestId: 'batch-denied', keyId: 'personal-key-demo-002', modelId: 'model-1' }).request.httpStatus, 401);
  for (const tenantIds of [[], [ids[0],ids[0]], ['tenant-gov'], [ids[0],'personal-demo-004']]) assert.throws(() => commitAdminState(state, { ...command, tenantIds }));
  assert.throws(() => commitAdminState(state, { ...command, tenantIds: [ids[0]] }), /对象或角色/);
  assert.throws(() => commitAdminState(next, command), /状态已变化/);
  assert.throws(() => commitAdminState(state, command, '只读观察员'), /无权/);
  assert.throws(() => commitAdminState(state, { ...command, data: { ...command.data, reason: '' } }), /操作原因/);
  assert.throws(() => commitAdminState(state, { ...command, data: { ...command.data, code: '000000' } }), /校验码错误/);
  assert.throws(() => commitAdminState(state, { ...command, data: { ...command.data, challenge: { ...command.data.challenge, issuedAt: Date.now() - 300001 } } }), /过期/);
  assert.equal(state.tenants.find(item => item.id === ids[0]).status, '正常');
});

test('personal subscriptions use owned order facts and keep unsupported billing types visible', async () => {
  const { individualOrders } = await import('../src/admin-v2/individual-users.js');
  const state = createAdminSeed();
  state.orders = state.orders.filter(order => order.tenantId !== target);
  assert.equal(individualOrders(state, target).length, 0);
  state.products.push({id:'package-example', billingType:'package', name:'示例资源包'});
  state.orders.push({id:'payg-example',tenantId:target, productId:'product-payg'}, {id:'plan-example',tenantId:target, productId:'product-plan'}, {id:'package-example-order',tenantId:target, productId:'package-example'}, {id:'unknown-example',tenantId:target,productId:'missing'});
  const rows = individualOrders(state,target);
  assert.deepEqual(rows.map(item => item.billingType), ['payg','plan','package',null]);
  assert.ok(rows.every(item => item.order.tenantId === target));
  assert.ok(!rows.some(item => item.order.id === 'order-001'));
  assert.equal(rows[1].order.used, undefined);
});


test('personal prototype includes four billing types, lifecycle states and isolated owners', () => {
  const state = createAdminSeed(), rows = individualOrders(state, target);
  assert.equal(rows.length, 24);
  assert.deepEqual(new Set(rows.slice(0, 8).map(row => row.billingType)), new Set(['payg','package','plan','coding']));
  assert.deepEqual(new Set(rows.map(row => row.order.status)), new Set(['已开通','待生效','已到期','已取消']));
  assert.ok(rows.every(row => row.order.demo && row.product.demo && row.order.modelIds.every(id => state.models.some(model => model.id === id))));
  assert.ok(rows.every(row => Date.parse(row.order.createdAt) <= Date.parse(row.order.startAt) && Date.parse(row.order.startAt) < Date.parse(row.order.endAt)));
  assert.ok(individualOrders(state, 'personal-demo-002').every(row => row.billingType === 'coding'));
  assert.equal(individualOrders(state, 'personal-demo-012').length, 0);
  assert.deepEqual(individualOrders(state, 'tenant-gov').map(row => row.order.id), ['order-001']);
  assert.equal(new Set(state.orders.map(row => row.id)).size, state.orders.length);
});

test('restoring an existing browser adds missing personal sample orders without replacing saved values', () => {
  const state = createAdminSeed();
  const saved = state.orders.find(order => order.id === 'personal-order-demo-001-01');
  saved.status = '已取消'; saved.catalogPrice = '保留订单价格';
  state.orders = state.orders.filter(order => order.id !== 'personal-order-demo-001-02');
  state.products = state.products.filter(product => product.id !== 'personal-product-demo-text');
  const restored = parseAdminState(JSON.stringify(state));
  assert.equal(individualOrders(restored,target).length, 24);
  assert.equal(restored.orders.find(order => order.id === saved.id).catalogPrice,'保留订单价格');
  assert.equal(restored.orders.find(order => order.id === saved.id).status,'已取消');
  assert.ok(restored.products.some(product => product.id === 'personal-product-demo-text'));
  const again = parseAdminState(JSON.stringify(restored));
  assert.equal(again.orders.length,restored.orders.length);
  assert.deepEqual(again.orders,restored.orders);
});
