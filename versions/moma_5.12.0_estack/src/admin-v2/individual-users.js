import { enterpriseDisplayValue, validateDemoAdminCode } from './enterprise.js';
import { MODEL_ORDER_BILLING_TYPES } from '../model-order-display.mjs';

export const individualTabs = { info: '基本信息', projects: '项目空间', keys: 'API 密钥', entitlements: '订购详情' };
export const individualAccounts = state => state.tenants.filter(tenant => tenant.type === '个人').map(tenant => ({ tenant, user: state.users.find(user => user.id === tenant.ownerId) }));
export const individualName = ({ tenant, user }) => user?.nickname || tenant.name || '未设置昵称';
export const individualStatus = tenant => tenant.status === '停用' ? '已冻结' : tenant.status === '正常' ? '正常' : tenant.status;
export const maskIndividualValue = (field, value) => enterpriseDisplayValue(field, value) || '未填写';

export function filterIndividualAccounts(state, { q = '', status = '' } = {}) {
  const query = q.trim().toLowerCase();
  return individualAccounts(state).filter(account => {
    return (!status || account.tenant.status === status) && [account.tenant.id, account.tenant.ownerId, account.user?.phone, individualName(account)].some(value => String(value || '').toLowerCase().includes(query));
  }).sort((a, b) => String(b.user?.registeredAt || '').localeCompare(String(a.user?.registeredAt || '')) || a.tenant.id.localeCompare(b.tenant.id));
}

// Explicit browser-local phone-registration fixtures; these are not real identities.
export function individualSeed() {
  const users = [], tenants = [], projects = [], apiKeys = [], grants = [];
  const names = ['林间风', '云边客', '星河', '码上见', '小满', '远山', '南风', '清禾', '蓝鲸', '拾光', '听雨', '向晚'];
  names.forEach((nickname, index) => {
    const number = String(index + 1).padStart(3, '0');
    const userId = `user-personal-demo-${number}`, tenantId = `personal-demo-${number}`;
    const phone = `13800001${number}`, registeredAt = `2026-09-${String(30 - index).padStart(2, '0')}T${index % 2 ? '15:30' : '09:20'}:00+08:00`;
    const frozen = [3, 8].includes(index), hasProject = index < 7;
    const common = { createdAt: registeredAt, updatedAt: registeredAt, demo: true };
    users.push({ ...common, id: userId, name: nickname, nickname, phone, login: phone, email: index % 3 === 0 ? `personal${number}@example.com` : '', status: '正常', initialized: true, registeredAt, phoneVerifiedAt: registeredAt, lastLoginAt: index % 4 === 0 ? null : `2026-10-0${index % 3 + 1}T10:12:00+08:00` });
    tenants.push({ ...common, id: tenantId, name: nickname, type: '个人', ownerId: userId, status: frozen ? '停用' : '正常', notes: '', source: '手机号注册', freezeReason: frozen ? '账号异常，暂停个人空间访问' : '' });
    if (hasProject) {
      const projectId = `personal-project-demo-${number}`, keyId = `personal-key-demo-${number}`;
      projects.push({ ...common, id: projectId, tenantId, name: '默认项目', ownerId: userId, status: '正常', budget: 0 });
      apiKeys.push({ ...common, id: keyId, keyId: `ak-personal-demo-${number}`, name: '开发测试', tenantId, projectId, modelIds: ['model-1', 'model-2'], secretPreview: `sk-demo*****${number}0`, status: index === 4 ? '停用' : '有效', lastUsedAt: null });
      grants.push({ ...common, id: `personal-grant-demo-${number}`, subjectType: 'key', subjectId: keyId, modelIds: ['model-1', 'model-2'], period: 'month', limit: 1000000, used: 0, expiresAt: '2026-12-31', status: '生效中' });
    }
  });
  const products = [
    { id: 'personal-product-demo-ds', name: 'DeepSeek 按量服务', billingType: 'payg', modelIds: ['model-1'], tariffScenario: '输入 Token\n输出 Token', catalogPrice: '2 元/百万 Token\n4 元/百万 Token' },
    { id: 'personal-product-demo-glm', name: 'GLM 按量服务', billingType: 'payg', modelIds: ['model-2'], tariffScenario: '输入 Token\n输出 Token', catalogPrice: '3 元/百万 Token\n6 元/百万 Token' },
    { id: 'personal-product-demo-token-basic', name: 'Token Plan · 标准版', billingType: 'plan', modelIds: ['model-1', 'model-2'], tariffScenario: '月度 Token 额度', catalogPrice: '699 元/月', entitlement: 100000000, quotaUnit: 'Token' },
    { id: 'personal-product-demo-token-pro', name: 'Token Plan · 专业版', billingType: 'plan', modelIds: ['model-1', 'model-2', 'model-7'], tariffScenario: '月度 Token 额度', catalogPrice: '1699 元/月', entitlement: 300000000, quotaUnit: 'Token' },
    { id: 'personal-product-demo-coding-lite', name: 'Coding Plan · Lite', billingType: 'coding', modelIds: ['model-1', 'model-2'], tariffScenario: '月度编程请求额度', catalogPrice: '99 元/月', entitlement: 600, quotaUnit: '次' },
    { id: 'personal-product-demo-coding-pro', name: 'Coding Plan · Pro', billingType: 'coding', modelIds: ['model-1', 'model-2', 'model-7'], tariffScenario: '月度编程请求额度', catalogPrice: '199 元/月', entitlement: 1200, quotaUnit: '次' },
  ].map(product => ({ ...product, providerName: '移动云', demo: true, status: '已上架' }));
  const orders = [];
  const addOrder = (tenantId, product, sequence, period, status, used) => {
    const month = period === 'current' ? '10' : period === 'future' ? '11' : '10';
    const createdAt = `2026-10-${period === 'future' ? '03' : '01'}T09:00:00+08:00`;
    orders.push({ id: `personal-order-demo-${tenantId.slice(-3)}-${String(sequence).padStart(2, '0')}`, orderNo: `ORD-P-${tenantId.slice(-3)}-2026${month}-${String(sequence).padStart(2, '0')}`, tenantId, productId: product.id, billingType: product.billingType, providerName: product.providerName, catalogPrice: product.catalogPrice, tariffScenario: product.tariffScenario, modelIds: product.modelIds, entitlement: product.entitlement, quotaUnit: product.quotaUnit, used, status, createdAt, updatedAt: createdAt, startAt: `2026-${period === 'future' ? '11' : '10'}-01T10:00:00+08:00`, endAt: period === 'past' ? '2026-10-03T23:59:59+08:00' : `2026-${month}-${month === '11' ? '30' : '31'}T23:59:59+08:00`, demo: true });
  };
  // Supported billing types share the first page; history exercises pagination.
  const firstPage = [0, 2, 4, 5, 1, 3, 2, 4];
  firstPage.forEach((index, sequence) => addOrder('personal-demo-001', products[index], sequence + 1, 'current', '已开通', products[index].entitlement == null ? undefined : Math.round(products[index].entitlement * [0.25, 0.48, 0, 0.72][sequence % 4])));
  for (let index = 0; index < 16; index++) {
    const product = products[index % products.length], future = index < 4, cancelled = index >= 12;
    addOrder('personal-demo-001', product, index + 9, future ? 'future' : 'past', future ? '待生效' : cancelled ? '已取消' : '已到期', product.entitlement == null ? undefined : future || cancelled ? 0 : product.entitlement);
  }
  addOrder('personal-demo-002', products[4], 1, 'current', '已开通', 126);
  addOrder('personal-demo-002', products[5], 2, 'past', '已到期', 1200);
  addOrder('personal-demo-003', products[2], 1, 'current', '已开通', 2800000);
  addOrder('personal-demo-003', products[3], 2, 'future', '待生效', 0);
  return { users, tenants, projects, apiKeys, grants, products, orders };
}

export function individualTransaction(state, command, actor = state.currentRole) {
  const { tenantId, operation, data = {} } = command;
  if (operation === 'batch-freeze') {
    const ids = command.tenantIds;
    if (!Array.isArray(ids) || !ids.length || ids.length > 100 || new Set(ids).size !== ids.length) throw new Error('请选择 1 至 100 个不同的个人账号');
    const accounts = individualAccounts(state);
    const targets = ids.map(id => accounts.find(item => item.tenant.id === id));
    if (targets.some(item => !item)) throw new Error('存在非个人账号或账号已不存在，请重新选择');
    if (targets.some(item => item.tenant.status !== '正常')) throw new Error('所选账号状态已变化，请重新选择正常账号');
    const reason = String(data.reason || '').trim();
    if (!reason || reason.length > 500) throw new Error('请填写操作原因，最多 500 个字符');
    validateDemoAdminCode(data.challenge, { code: data.code, scope: individualFreezeScope(ids), actor });
    return { type: 'batch', objectId: ids.slice().sort().join(','), label: '批量冻结个人账号', changes: targets.map(({ tenant }) => ({ type: 'update', collection: 'tenants', id: tenant.id, changes: { status: '停用', freezeReason: reason, statusReason: reason } })) };
  }
  const account = individualAccounts(state).find(item => item.tenant.id === tenantId);
  if (!account) throw new Error('个人用户不存在，请返回列表');
  const { tenant, user } = account;
  const changes = [];
  if (operation === 'edit') {
    if (!user) throw new Error('登录身份缺失，无法修改资料');
    const nickname = String(data.nickname || '').trim(), email = String(data.email || '').trim(), notes = String(data.notes || '').trim();
    if (nickname.length > 40) throw new Error('昵称不能超过 40 个字符');
    if (email.length > 120 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new Error('请输入有效的邮箱');
    if (notes.length > 500) throw new Error('备注不能超过 500 个字符');
    changes.push({ type: 'update', collection: 'users', id: user.id, changes: { nickname, email } }, { type: 'update', collection: 'tenants', id: tenant.id, changes: { name: nickname || '未设置昵称', notes } });
  } else if (operation === 'set-status') {
    if (!['正常', '停用'].includes(data.status)) throw new Error('不支持的账号状态');
    if (data.status === tenant.status) throw new Error('账号状态已变化，请关闭后重新操作');
    const reason = String(data.reason || '').trim();
    if (!reason || reason.length > 500) throw new Error('请填写操作原因，最多 500 个字符');
    if (data.status === '停用') validateDemoAdminCode(data.challenge, { code: data.code, scope: `individual:${tenant.id}:freeze`, actor });
    changes.push({ type: 'update', collection: 'tenants', id: tenant.id, changes: { status: data.status, freezeReason: data.status === '停用' ? reason : '', statusReason: reason } });
  } else throw new Error('不支持的个人用户操作');
  return { type: 'batch', objectId: tenant.id, label: operation === 'edit' ? '编辑个人用户资料' : data.status === '停用' ? '冻结个人账号' : '解冻个人账号', changes };
}


export const individualFreezeScope = ids => 'individual:batch-freeze:' + [...ids].sort().join(',');
export const individualBillingTypes = MODEL_ORDER_BILLING_TYPES;
export function individualOrders(state, tenantId) {
  return state.orders.filter(order => order.tenantId === tenantId).map(order => {
    const product = state.products.find(item => item.id === order.productId);
    const explicit = order.billingType || product?.billingType;
    if (explicit === 'package') return null;
    const billingType = explicit ? Object.hasOwn(individualBillingTypes, explicit) ? explicit : null : product?.billingMode === '按量付费' ? 'payg' : product?.code?.startsWith('TOKEN-') ? 'plan' : product?.code?.startsWith('CODING-') ? 'coding' : null;
    return { order, product, billingType };
  }).filter(Boolean);
}

export function individualOrderDisplay(state, { order, product, billingType }) {
  const modelIds = order.modelIds ?? product?.modelIds ?? [];
  const models = modelIds.map(id => state.models.find(model => model.id === id));
  const modelNames = models.map((model, index) => model?.name || modelIds[index]).join('、') || '未记录';
  const modelTypes = { text: '文本模型', multimodal: '多模态模型', image: '视觉模型', video: '视觉模型', audio: '语音模型', embedding: '向量模型', rerank: '重排模型' };
  const providerId = order.providerId ?? product?.providerId;
  const price = order.catalogPrice ?? product?.catalogPrice;
  const priceUnit = order.priceUnit ?? product?.priceUnit;
  const catalogPrice = typeof price === 'string' && price.trim() ? price : typeof price === 'number' && Number.isFinite(price) && price >= 0 ? price.toLocaleString('zh-CN') + (priceUnit ? ' ' + priceUnit : '（单位未记录）') : '未记录';
  return {
    name: billingType === 'payg' && modelIds.length ? modelNames : product?.name || '商品未记录',
    modelNames,
    type: order.modelType || product?.modelType || ({ plan: 'Token Plan', coding: 'Coding Plan' })[billingType] || [...new Set(models.map(model => modelTypes[model?.type] || '未记录'))].join('、') || '未记录',
    provider: order.providerName || product?.providerName || state.providers.find(provider => provider.id === providerId)?.name || '未记录',
    tariff: order.tariffScenario || product?.tariffScenario || '未记录',
    catalogPrice,
    status: order.status || '未记录',
    orderedAt: order.createdAt,
    expiresAt: order.endAt,
  };
}
