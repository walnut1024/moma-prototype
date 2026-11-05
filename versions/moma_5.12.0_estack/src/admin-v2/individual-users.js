import { initialPersonalData } from '../mock/application-data.js';
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
  return initialPersonalData();
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
