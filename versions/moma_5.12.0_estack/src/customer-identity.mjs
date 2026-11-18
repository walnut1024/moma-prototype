import { emptyAuthState } from './auth-state.mjs';
import { normalizeMemberPhone } from './organization-data.mjs';
import { ADMIN_DATA_KEY, AUTH_DATA_KEY } from './service-access.mjs';

export function prepareCustomerLogins(state, targets, storage) {
  if (!targets.length) return null;
  const raw = storage.getItem(AUTH_DATA_KEY);
  const auth = raw ? JSON.parse(raw) : emptyAuthState();
  auth.identityLinks ||= [];
  for (const { tenantId, userId, memberId } of targets) {
    const user = state.users.find(row => row.id === userId && row.status === '正常');
    const tenant = state.tenants.find(row => row.id === tenantId);
    const personal = tenant?.type === '个人';
    const member = state.memberships.find(row => row.id === memberId && row.userId === userId &&
      row.tenantId === tenantId && row.status === '正常');
    if (!user || !tenant || (personal ? tenant.ownerId !== userId : !member)) throw Error('客户和登录账号的关联不完整');
    const existingIds = new Set(auth.identityLinks.filter(link => link.backendUserId === userId).map(link => link.authUserId));
    if (existingIds.size > 1) throw Error('该人员关联了多个登录账号，请先核对身份');
    const id = existingIds.values().next().value || userId;
    const phone = normalizeMemberPhone(user.phone || '');
    const email = String(user.email || '').trim().toLowerCase();
    const existing = auth.accounts.find(row => row.id === id);
    if (auth.identityLinks.some(row => row.authUserId === id && row.backendUserId !== userId) ||
        auth.accounts.some(row => row.id !== id && ((phone && row.phone === phone) || (email && row.email?.toLowerCase() === email)))) {
      throw Error('手机号或邮箱已关联其他登录账号，请选择正确的已有账号');
    }
    if (!existing && !phone && !email) throw Error('登录账号需要可用的手机号或邮箱');
    if (existing?.status && existing.status !== '正常') throw Error('登录账号当前不可用');
    if (!existing) auth.accounts.push({ id, name:user.name, phone, email, status:'正常', userType:personal ? 'personal' : 'enterprise' });
    else if (personal) {
      existing.userType = 'personal';
      if (!existing.phone) existing.phone = phone;
    }
    const spaceId = personal ? 'personal' : tenantId;
    const link = auth.identityLinks.find(row => row.authUserId === id && row.spaceId === spaceId);
    if (link && (link.tenantId !== tenantId || link.backendMembershipId !== memberId)) throw Error('使用空间已关联其他身份');
    if (!link) auth.identityLinks.push({ id:personal ? tenantId : memberId, authUserId:id, spaceId, tenantId, backendUserId:userId,
      ...(memberId ? { backendMembershipId:memberId } : {}) });
    if (member) {
      const relation = { id:member.id, userId:id, enterpriseId:tenantId, enterprise:tenant.name,
        role:member.role === '租户管理员' ? '企业管理员' : member.role, status:'已加入' };
      const index = auth.memberships.findIndex(row => row.userId === id && row.enterpriseId === tenantId);
      if (index < 0) auth.memberships.push(relation);
      else auth.memberships[index] = { ...auth.memberships[index], ...relation };
    }
  }
  return { raw, encoded:JSON.stringify({ ...auth, revision:(auth.revision || 0) + 1 }) };
}

export function writeCustomerState(storage, raw, encoded, login) {
  if (storage.getItem(ADMIN_DATA_KEY) !== raw || (login && storage.getItem(AUTH_DATA_KEY) !== login.raw)) {
    throw Error('客户或登录账号已变化，请刷新后重试');
  }
  storage.setItem(ADMIN_DATA_KEY, encoded);
  if (!login) return;
  try { storage.setItem(AUTH_DATA_KEY, login.encoded); }
  catch (error) {
    if (storage.getItem(ADMIN_DATA_KEY) !== encoded) throw Error('保存期间客户已变化，请重新载入核对');
    if (raw === null) storage.removeItem(ADMIN_DATA_KEY);
    else storage.setItem(ADMIN_DATA_KEY, raw);
    throw error;
  }
}
