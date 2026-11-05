export const ADMIN_DATA_KEY = 'moma.adminV2.5120.v1';
export const AUTH_DATA_KEY = 'moma-auth-prototype-5120-v1';
export const LINK_EVENT = 'moma-5120-state-change';

export const notifyLinkedState = () => { if (typeof window !== 'undefined') window.dispatchEvent(new Event(LINK_EVENT)); };
export function readLinkedState(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(ADMIN_DATA_KEY);
    const state = raw && JSON.parse(raw);
    if (!state || !Array.isArray(state.models) || !Array.isArray(state.tenants)) throw new Error();
    return state;
  } catch { throw Object.assign(new Error('服务状态读取失败，请重新载入'), { code: 'state_unavailable' }); }
}
export const accessError = (code, message) => Object.assign(new Error(message), { code });
const reject = (code, reason) => ({ allowed: false, code, reason });
export const activeCustomer = tenant => tenant && ['正常', '需关注'].includes(tenant.status);
export const lifecycleSignature = model => JSON.stringify([model.listingStatus, model.visibility, model.callsEnabled, model.openScope, [...(model.tenantIds || [])].sort(), model.serviceMode, model.serviceModeRevision, model.serviceProviders, model.platformPublications, model.profile?.tasks, model.profile?.inputModalities, model.profile?.outputModalities]);

export function serviceReferences(state) {
  return (state.models || []).flatMap(model => model.serviceMode === 'standard'
    ? [{ id: `standard:${model.id}`, modelId: model.id, callId: model.modelId, providerId: null, model }]
    : model.serviceMode === 'provider' ? (model.serviceProviders || []).filter(row => row.status !== '已移除').map(row => ({ id: `provider:${model.id}:${row.providerId}`, modelId: model.id, callId: row.callId, providerId: row.providerId, model })) : []);
}

export function lifecycleAccess(state, service, tenantId) {
  if (!service || !state) return reject('model_unavailable', '模型服务当前不可用');
  const { model } = service;
  if (model.listingStatus !== '已上架' || model.visibility !== '公开' || model.callsEnabled !== true) return reject('model_unavailable', '模型服务已下架，请选择其他模型');
  if (service.providerId) {
    const entry=model.serviceProviders?.find(row=>row.providerId===service.providerId && row.status!=='已移除');
    if (!entry || entry.callsEnabled===false) return reject('provider_unavailable', '该供应商服务已停服，请选择其他供应商');
  }
  if (!activeCustomer(state.tenants?.find(row => row.id === tenantId))) return reject('customer_unavailable', '当前用户或组织不可用');
  if (!['all', 'selected'].includes(model.openScope)) return reject('model_forbidden', '模型开放范围尚未配置');
  if (model.openScope === 'selected' && !model.tenantIds?.includes(tenantId)) return reject('model_forbidden', '当前用户或组织未获授权使用此模型');
  const grant = state.grants?.find(row => row.subjectType === 'tenant' && row.subjectId === tenantId);
  if (grant && (grant.status !== '生效中' || !grant.modelIds?.includes(model.id))) return reject('model_forbidden', '当前用户或组织未获授权使用此模型');
  return { allowed: true, reason: '' };
}

export function assertOrderAccess(state, order) {
  const product = state.products?.find(row => row.id === order.productId), ids = product?.modelIds;
  if (!ids?.length) throw accessError('model_unavailable', '订购商品尚未关联有效模型服务');
  for (const id of ids) {
    const model = state.models.find(row => row.id === id), access = lifecycleAccess(state, model && { model }, order.tenantId);
    if (!access.allowed) throw accessError(access.code, `${model?.name || '模型服务'}：${access.reason}，暂不能订购`);
  }
}

export function serviceAccess(state, service, tenantId, published) {
  const check = lifecycleAccess(state, service, tenantId);
  if (!check.allowed) return check;
  if (serviceReferences(state).filter(row => row.id === service.id || row.callId === service.callId).length !== 1) return reject('model_unavailable', '模型服务引用不完整或存在冲突');
  const { model } = service;
  const proofs = (model.platformPublications || []).filter(row => row.serviceId === service.id && row.source === 'mock');
  if (proofs.length !== 1 || !published?.published || published.disabled || proofs[0].mockServiceId !== published.id || published.published.config.publicModelId !== service.callId) return reject('publication_required', '模型服务配置尚未就绪');
  if (!published.published.config.tenantIds.includes(tenantId)) return reject('model_forbidden', '当前用户或组织未获授权使用此模型');
  return { allowed: true, code: '', reason: '', generation: model.accessGeneration || 0 };
}

export function assertPublishedAccess(state, published, tenantId) {
  const matches = serviceReferences(state).filter(service => service.callId === published?.published?.config.publicModelId);
  if (matches.length !== 1) throw accessError('model_unavailable', '模型服务引用不完整或存在冲突');
  const result = serviceAccess(state, matches[0], tenantId, published);
  if (!result.allowed) throw accessError(result.code, result.reason);
  return matches[0];
}

export function resolveUserIdentity(state, auth) {
  const user = auth?.accounts?.find(row => row.id === auth.currentUserId);
  if (!user || user.status !== '正常' || user.activation) throw accessError('login_required', '请先登录有效用户账号');
  if (!auth.activeSpace) throw accessError('space_required', '请选择所属组织');
  const links = (auth.identityLinks || []).filter(row => row.authUserId === user.id && row.spaceId === auth.activeSpace);
  if (links.length !== 1) throw accessError('identity_unmapped', '当前用户尚未关联可用身份');
  const link = links[0], backend = state.users?.find(row => row.id === link.backendUserId), tenant = state.tenants?.find(row => row.id === link.tenantId);
  if (backend?.status !== '正常' || !activeCustomer(tenant)) throw accessError('customer_unavailable', '当前用户或组织已停用');
  if (auth.activeSpace === 'personal') {
    if (user.userType === 'enterprise' || user.personalFrozen || tenant.type !== '个人' || tenant.ownerId !== backend.id) throw accessError('identity_invalid', '个人用户身份关联异常');
  } else {
    const member = auth.memberships?.find(row => row.userId === user.id && row.enterpriseId === auth.activeSpace);
    const current = state.memberships?.find(row => row.id === link.backendMembershipId);
    if (!member || member.status !== '已加入' || member.enterpriseFrozen || tenant.type === '个人' || !current || current.status !== '正常' || current.userId !== backend.id || current.tenantId !== tenant.id) throw accessError('membership_unavailable', '当前组织成员身份不可用');
  }
  return { userId: user.id, tenantId: tenant.id, spaceId: auth.activeSpace, name: user.name, tenantName: tenant.name, key: `${user.id}:${tenant.id}`, generation: `${auth.sessionGeneration || 0}:${state.identityGeneration || 0}` };
}
