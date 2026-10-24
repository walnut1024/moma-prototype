import { memberPhoneError, normalizeMemberPhone } from './organization-data.mjs';
import { normalizeAdminLogin } from './admin-v2/admin-accounts.js';

// Browser-local interaction state; never authorizes backend or gateway access.
export const AUTH_STORAGE_KEY = 'moma-auth-prototype-5130-v1';
export const AUTH_INVITE = Object.freeze({ id: 'invite-jiangsu', phone: '13800138000', enterpriseId: 'auth-jiangsu', enterprise: '江苏政务云', inviter: '张明', department: '研发中心', role: '普通成员', expiresAt: '2026-12-31T23:59:59+08:00' });
export const emptyAuthState = () => ({ accounts: [], memberships: [], applications: [], currentUserId: null, activeSpace: 'personal' });
export const authRoute = hash => /^#\/auth\/(login|register|account|enterprise|invite|application|activate|password)(?:\?|$)/.exec(hash)?.[1] || null;
export const currentAuthUser = state => state.accounts.find(account => account.id === state.currentUserId) || null;
export const authPhone = value => {
  const phone = normalizeMemberPhone(value), error = memberPhoneError(phone);
  if (error) throw new Error(error);
  return phone;
};

export function enterpriseLoginPolicy(value = 'phone,email') {
  if (!['phone', 'email', 'phone,email'].includes(value)) throw new Error('企业登录配置仅支持 phone、email 或 phone,email');
  return value.split(',');
}
export const AUTH_ENTERPRISE_LOGIN = enterpriseLoginPolicy(import.meta.env?.VITE_ENTERPRISE_LOGIN);

export function normalizeAuthLogin(value, userType, policy = AUTH_ENTERPRISE_LOGIN) {
  if (userType === 'personal') return authPhone(value);
  if (userType !== 'enterprise') throw new Error('请选择个人用户或企业用户');
  const type = policy.length === 1 ? policy[0] : String(value).includes('@') ? 'email' : 'phone';
  if (!policy.includes(type)) throw new Error('当前项目不支持此登录方式');
  return normalizeAdminLogin(value, type);
}

export function verifyAuthCode(challenge, { identity, type = 'phone', code, purpose, now = Date.now() }) {
  if (!challenge) throw new Error('请先获取验证码');
  if (challenge.identity !== normalizeAdminLogin(identity, type) || challenge.type !== type || challenge.purpose !== purpose) throw new Error('联系方式或验证用途已变化，请重新获取验证码');
  if (now < challenge.issuedAt || now >= challenge.issuedAt + 300000) throw new Error('验证码已过期，请重新获取');
  if (challenge.attempts >= 5) throw new Error('验证次数过多，请重新获取验证码');
  if (!/^\d{6}$/.test(code) || code !== challenge.code) throw new Error('验证码错误，请核对后重试');
  return true;
}

export function registerAuthAccount(state, { phone, name = '' }, allowExisting = false) {
  phone = authPhone(phone);
  const existing = state.accounts.find(account => account.phone === phone);
  if (existing && !allowExisting) throw new Error('该手机号已注册，请直接登录');
  if (existing?.status === '停用') throw new Error('该账号已停用，请联系平台管理员');
  if (existing?.activation) throw new Error('账号尚未激活，请使用收到的激活链接');
  const account = existing || { id: `auth-user-${crypto.randomUUID()}`, phone, name: name.trim() || `用户${phone.slice(-4)}`, status: '正常', registeredAt: new Date().toISOString() };
  return { ...state, accounts: existing ? state.accounts : [...state.accounts, account], currentUserId: account.id, activeSpace: availableAuthSpaces({ ...state, currentUserId: account.id }).some(space => space.id === state.activeSpace) ? state.activeSpace : 'personal' };
}

export function loginAuthAccount(state, identifier, userType, policy = AUTH_ENTERPRISE_LOGIN) {
  if (!['personal', 'enterprise'].includes(userType)) throw new Error('请选择个人用户或企业用户');
  const normalized = normalizeAuthLogin(identifier, userType, policy), isEmail = normalized.includes('@');
  const accounts = state.accounts.filter(item => isEmail ? String(item.email || '').trim().toLowerCase() === normalized : item.phone === normalized);
  if (accounts.length > 1) throw new Error('登录账号对应多条身份，请联系平台管理员');
  const account = accounts[0];
  if (!account) throw new Error(isEmail ? '该邮箱未登记，请联系企业管理员' : '该手机号尚未注册，请前往注册');
  if (account.status !== '正常') throw new Error('该账号已停用，请联系平台管理员');
  if (account.activation) throw new Error('账号尚未激活，请使用收到的激活链接');
  const next = { ...state, currentUserId: account.id };
  const spaces = availableAuthSpaces(next);
  if (userType === 'personal') {
    if (!spaces.some(space => space.id === 'personal')) throw new Error('个人空间已停用，请联系平台管理员或选择企业用户登录');
    return { ...next, activeSpace: 'personal' };
  }
  const enterprises = spaces.filter(space => space.id !== 'personal');
  if (!enterprises.length) throw new Error('该账号暂无可进入的企业，请联系企业管理员邀请加入，或申请企业开通');
  return { ...next, activeSpace: enterprises.length === 1 ? enterprises[0].id : null };
}

export function availableAuthSpaces(state) {
  const user = currentAuthUser(state);
  if (!user || user.status !== '正常' || user.activation) return [];
  return [...(user.phone && !user.personalFrozen ? [{ id: 'personal', name: '个人空间', role: '个人用户' }] : []), ...state.memberships.filter(member => member.userId === user.id && member.status === '已加入' && !member.enterpriseFrozen).map(member => ({ id: member.enterpriseId, name: member.enterprise, role: member.role }))];
}

export function acceptAuthInvite(state, token, now = Date.now()) {
  const user = currentAuthUser(state);
  if (!user || user.status !== '正常' || user.activation) throw new Error('请先登录有效账号');
  if (token !== AUTH_INVITE.id) throw new Error('邀请不存在或已撤销，请联系邀请人');
  if (now >= Date.parse(AUTH_INVITE.expiresAt)) throw new Error('邀请已过期，请联系邀请人重新邀请');
  if (user.phone !== AUTH_INVITE.phone) throw new Error('当前账号与受邀手机号不一致，请切换账号');
  const existing = state.memberships.find(member => member.userId === user.id && member.enterpriseId === AUTH_INVITE.enterpriseId);
  if (existing && existing.status !== '已加入') throw new Error('企业成员关系已停用，请联系企业管理员');
  if (existing?.enterpriseFrozen) throw new Error('该企业已冻结，请联系企业管理员');
  return { ...state, memberships: existing ? state.memberships : [...state.memberships, { ...AUTH_INVITE, userId: user.id, status: '已加入', joinedAt: new Date(now).toISOString() }], activeSpace: AUTH_INVITE.enterpriseId };
}

export function applicationErrors(data, step = 3, policy = AUTH_ENTERPRISE_LOGIN) {
  const errors = {};
  if (step !== 2) {
    if (!['government', 'enterprise'].includes(data.subjectType)) errors.subjectType = '请选择主体类型';
    if (!data.companyName?.trim() || data.companyName.trim().length > 120) errors.companyName = '请填写 120 字以内的主体全称';
    if (!/^[A-Za-z0-9]{6,32}$/.test(data.taxId?.trim())) errors.taxId = '请输入 6–32 位字母或数字的主体标识';
    if (!data.province) errors.province = '请选择省份';
    if (!data.industry) errors.industry = '请选择所属行业';
  }
  if (step !== 1) {
    if (!data.contactName?.trim() || data.contactName.trim().length > 40) errors.contactName = '请填写 40 字以内的申请人姓名';
    if (!policy.includes(data.contactType)) errors.contactType = '当前项目不支持此登录方式';
    try { normalizeAuthLogin(data.contactIdentity, 'enterprise', [data.contactType]); } catch (error) { errors.contactIdentity = error.message; }
  }
  return errors;
}

export function submitAuthApplication(state, data, verification, applicationId = null) {
  const errors = applicationErrors(data);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  verifyAuthCode(verification.challenge, { ...verification, identity: data.contactIdentity, type: data.contactType, purpose: 'enterprise' });
  const previous = applicationId && state.applications.find(item => item.id === applicationId);
  if (applicationId && (!previous || previous.status !== '需补充' || previous.contactType !== data.contactType || previous.contactIdentity !== normalizeAdminLogin(data.contactIdentity, data.contactType))) throw new Error('申请状态或联系人已变化，请重新查询申请进度');
  const values = Object.fromEntries(Object.entries(data).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value]));
  values.taxId = values.taxId.toUpperCase();
  values.contactIdentity = normalizeAdminLogin(values.contactIdentity, values.contactType);
  values.adminName = values.contactName;
  values.adminType = values.contactType;
  values.adminIdentity = values.contactIdentity;
  if (state.applications.some(item => item.id !== applicationId && item.taxId === values.taxId && item.status !== '已关闭')) throw new Error('该主体已有开通申请，请查看申请进度');
  const application = { ...previous, ...values, countryRegion: '中国', id: previous?.id || `APP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, status: '待处理', createdAt: previous?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
  // Application intake never creates an identity, session, subject or membership.
  return { ...state, applications: previous ? state.applications.map(item => item.id === applicationId ? application : item) : [...state.applications, application] };
}

export function realNameErrors({ name = '', idNumber = '', consent = false }) {
  const errors = {};
  if (!name.trim() || name.trim().length > 40) errors.name = '请填写真实姓名（不超过 40 字）';
  const id = idNumber.trim().toUpperCase();
  if (!/^[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dX]$/.test(id)) errors.idNumber = '请填写有效的 18 位居民身份证号码';
  else {
    const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
    const sum = weights.reduce((total, weight, index) => total + Number(id[index]) * weight, 0);
    const year = Number(id.slice(6, 10)), month = Number(id.slice(10, 12)), day = Number(id.slice(12, 14));
    const date = new Date(year, month - 1, day);
    if ('10X98765432'[sum % 11] !== id[17] || date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day || date > new Date()) errors.idNumber = '身份证号码格式或校验位不正确';
  }
  if (consent !== true) errors.consent = '请确认信息真实并授权身份核验';
  return errors;
}

export function submitRealNameCertification(state, data) {
  const user = currentAuthUser(state);
  if (!user || user.status !== '正常') throw new Error('请先登录有效账号');
  const errors = realNameErrors(data);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  if (['审核中', '已认证'].includes(user.realNameCertification?.status)) throw new Error('已有实人认证记录，请查看认证状态');
  // Only a masked document number is retained; identity verification is not connected.
  const realNameCertification = { name: data.name.trim(), maskedId: '**************' + data.idNumber.trim().toUpperCase().slice(-4), status: '审核中', submittedAt: new Date().toISOString() };
  return { ...state, accounts: state.accounts.map(account => account.id === user.id ? { ...account, realNameCertification } : account) };
}

export function submitEnterpriseCertification(state, data, applicationId = null) {
  const user = currentAuthUser(state);
  if (!user || user.status !== '正常' || user.activation || !user.phone) throw new Error('请先登录有效的手机号账号');
  const values = Object.fromEntries(['subjectType', 'companyName', 'taxId', 'province', 'city', 'industry', 'contactName', 'authorizationRole', 'authorizationNote'].map(key => [key, String(data[key] || '').trim()]));
  values.contactType = 'phone'; values.contactIdentity = authPhone(user.phone); values.taxId = values.taxId.toUpperCase();
  const errors = applicationErrors(values, 3, ['phone']);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  if (!['legal-representative', 'authorized-agent'].includes(values.authorizationRole)) throw new Error('请选择申请人身份');
  if (values.authorizationNote.length > 300 || (values.authorizationRole === 'authorized-agent' && !values.authorizationNote)) throw new Error('请填写授权说明（不超过 300 字）');
  if (data.authorized !== true) throw new Error('请确认有权代表该单位提交认证');
  const previous = applicationId && state.applications.find(item => item.id === applicationId);
  if (applicationId && (!previous || previous.applicantUserId !== user.id)) throw new Error('无权修改该认证申请');
  if (previous && previous.status !== '需补充') throw new Error('当前认证申请不能修改');
  if (state.applications.some(item => item.id !== applicationId && item.taxId === values.taxId && item.status !== '已关闭')) throw new Error('该主体已有认证申请，请查看认证记录');
  const record = { ...previous, ...values, authorized: true, applicantUserId: user.id, purpose: 'enterprise-certification', countryRegion: '中国', id: previous?.id || `APP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, status: '待处理', createdAt: previous?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
  return { ...state, applications: previous ? state.applications.map(item => item.id === previous.id ? record : item) : [...state.applications, record] };
}

export function queryAuthApplication(state, id, verification) {
  verifyAuthCode(verification.challenge, { ...verification, purpose: 'application' });
  const contactIdentity = normalizeAdminLogin(verification.identity, verification.type);
  const result = state.applications.find(item => item.id === id.trim().toUpperCase() && item.contactType === verification.type && item.contactIdentity === contactIdentity);
  if (!result) throw new Error('申请编号与联系人不匹配，请核对后重试');
  return result;
}

export function activationAccount(state, token, now = Date.now()) {
  const matches = state.accounts.filter(item => item.activation?.token === token && token);
  const user = matches.length === 1 ? matches[0] : null;
  if (!user || user.credential || !Number.isFinite(Date.parse(user.activation.expiresAt)) || now >= Date.parse(user.activation.expiresAt)) throw new Error('激活链接无效或已过期，请联系平台工作人员');
  if (user.status !== '正常' || !state.memberships.some(item => item.userId === user.id && item.enterpriseId === user.activation.enterpriseId && item.status === '已加入' && !item.enterpriseFrozen && item.role === '企业管理员')) throw new Error('政企空间或管理员身份不可用，请联系平台工作人员');
  return user;
}

export async function activateAuthAccount(state, token, verification, password) {
  const user = activationAccount(state, token);
  const type = user.activation.type;
  const identity = normalizeAuthLogin(user[type], 'enterprise', [type]);
  verifyAuthCode(verification.challenge, { ...verification, identity, type, purpose: 'activate' });
  const credential = await encodeAuthPassword(password);
  return { ...state, accounts: state.accounts.map(item => item.id === user.id ? { ...item, credential, activation: null } : item) };
}

export async function encodeAuthPassword(password, salt = crypto.randomUUID()) {
  if (password.length < 8 || password.length > 64 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) throw new Error('密码需为 8–64 位，并包含字母和数字');
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations: 100000 }, key, 256);
  return { salt, digest: Array.from(new Uint8Array(bits), value => value.toString(16).padStart(2, '0')).join('') };
}

export async function matchesAuthPassword(password, credential) {
  if (!credential || !password) return false;
  try { return (await encodeAuthPassword(password, credential.salt)).digest === credential.digest; }
  catch { return false; }
}
