import { memberPhoneError, normalizeMemberPhone } from '../organization-data.mjs';

export const ADMIN_ROLES = ['运营人员', '运维人员', '平台管理员'];
export const ADMIN_ROLE_LABELS = { 运营人员: '运营管理员', 运维人员: '运维管理员', 平台管理员: '系统管理员' };
export const ROLE_DESCRIPTIONS = {
  平台管理员: '管理后台账号及平台业务配置。',
  运营人员: '管理模型、客户及业务运营。',
  运维人员: '管理供应服务、集群、部署和网关配置。',
};

export function generateAdminPassword() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  return 'Aa1!' + Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => alphabet[byte & 63]).join('');
}

export function normalizeAdminLogin(value, type = 'phone') {
  if (type === 'phone') {
    const phone = normalizeMemberPhone(value), error = memberPhoneError(phone);
    if (error) throw new Error(error);
    return phone;
  }
  if (type !== 'email') throw new Error('请选择手机号码或邮箱登录');
  const email = String(value || '').trim().toLowerCase(), [local, domain, extra] = email.split('@');
  if (!email) throw new Error('请填写邮箱');
  if (email.length > 254 || !local || local.length > 64 || !/^[a-z0-9.!#$%&'*+/=?^_{|}~-]+$/i.test(local) || /^\.|\.$|\.\./.test(local) || extra !== undefined || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(domain || '')) throw new Error('邮箱格式错误，请填写完整邮箱地址，如 name@example.com');
  return email;
}

export function lastEnabledAdmin(state, id) {
  const account = state.admins.find(item => item.id === id);
  return account?.role === '平台管理员' && account.status === '已启用' && state.admins.filter(item => item.role === '平台管理员' && item.status === '已启用').length === 1;
}

export function adminAccountTransaction(state, action) {
  const target = state.admins.find(item => item.id === action.id);
  if (action.operation !== 'create' && !target) throw new Error('账号不存在，请刷新列表');
  let changes;
  if (action.operation === 'resetPassword') {
    changes = { passwordVersion: (target.passwordVersion || 0) + 1, passwordUpdatedAt: new Date().toISOString() };
  } else if (action.operation === 'toggle') {
    if (lastEnabledAdmin(state, action.id)) throw new Error('至少保留一个启用的系统管理员');
    changes = { status: target.status === '已启用' ? '停用' : '已启用' };
  } else if (['create', 'edit'].includes(action.operation)) {
    const values = action.values || {};
    const creating = action.operation === 'create', accountType = creating ? values.accountType || 'phone' : target.accountType;
    const account = creating ? normalizeAdminLogin(values.account, accountType) : target.account;
    const name = String(values.name || '').trim(), phone = accountType === 'phone' ? account : creating ? '' : normalizeMemberPhone(values.phone);
    const identity = value => memberPhoneError(value) ? String(value).trim().toLowerCase() : normalizeMemberPhone(value);
    if (state.admins.some(item => item.id !== target?.id && identity(item.account) === identity(account))) throw new Error('登录账号已存在');
    if (!name || name.length > 40) throw new Error('请填写不超过 40 字的姓名');
    if (!ADMIN_ROLES.includes(values.role)) throw new Error('请选择有效的后台角色');
    const phoneError = phone ? memberPhoneError(phone) : '';
    if (phoneError) throw new Error(phoneError);
    if (lastEnabledAdmin(state, action.id) && values.role !== '平台管理员') throw new Error('至少保留一个启用的系统管理员');
    changes = { account, name, phone, role: values.role };
    if (creating) Object.assign(changes, { accountType, email: accountType === 'email' ? account : '' });
    if (action.operation === 'create') Object.assign(changes, { passwordVersion: 1, passwordUpdatedAt: new Date().toISOString() });
  } else throw new Error('未知账号操作');
  const id = action.operation === 'create' ? action.id : target.id;
  if (!id || state.admins.some(item => item.id === id) && action.operation === 'create') throw new Error('账号 ID 已存在或无效');
  return {
    type: 'batch', objectId: id,
    label: action.operation === 'create' ? '新建后台账号' : action.operation === 'edit' ? '编辑后台账号' : action.operation === 'resetPassword' ? '重置后台账号密码' : `${changes.status === '停用' ? '停用' : '启用'}后台账号`,
    changes: [action.operation === 'create' ? { type: 'add', collection: 'admins', record: { id, ...changes, status: '已启用' } } : { type: 'update', collection: 'admins', id, changes }],
  };
}
