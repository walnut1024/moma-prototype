import mockConfig from './mock/catalogues.json' with { type: 'json' };
import { ADMIN_DATA_KEY, AUTH_DATA_KEY, readLinkedState, resolveUserIdentity, notifyLinkedState } from './service-access.mjs';
import { emptyAuthState, loginAuthAccount, persistAuthState } from './auth-state.mjs';

export const LINKED_ADMINS = mockConfig["linked-accounts.mjs"]["LINKED_ADMINS"];
export const LINKED_USERS = mockConfig["linked-accounts.mjs"]["LINKED_USERS"];
function ensure(rows, record, fields) {
  const existing = rows.find(row => row.id === record.id);
  if (existing) {
    if (fields.some(key => existing[key] !== record[key])) throw new Error(`联动样例冲突：${record.id}，请核对现有记录`);
  } else rows.push(record);
}
export function linkedAccountFixture(state, auth) {
  const next = structuredClone(state), login = structuredClone(auth);
  login.identityLinks ||= [];
  for (const row of LINKED_ADMINS) {
    if (next.admins.some(item => item.id !== row.id && String(item.account).trim().toLowerCase() === row.account)) throw new Error('管理账号登录名已被占用');
    ensure(next.admins, { ...row, accountType: 'email', email: row.account, phone: '', status: '已启用', mock: true }, ['account', 'accountType', 'role']);
  }
  for (const row of LINKED_USERS) {
    const tenant = next.tenants.find(item => item.id === row.tenantId);
    if (!tenant || (row.userType === 'personal' ? tenant.type !== '个人' || tenant.ownerId !== row.backendUserId : !['企业', '政府'].includes(tenant.type))) throw new Error('所需基础客户样例缺失或归属冲突，请先核对后台数据');
    if (login.accounts.some(item => item.id !== row.id && item.phone === row.phone)) throw new Error('用户手机号已被占用');
    if (row.userType === 'personal') {
      if (!next.users.some(item => item.id === row.backendUserId && item.phone === row.phone)) throw new Error('个人用户基础记录不匹配');
    } else {
      if (next.users.some(item => item.id !== row.backendUserId && item.phone === row.phone)) throw new Error('后台用户手机号已被占用');
      ensure(next.users, { id: row.backendUserId, name: row.name, phone: row.phone, status: '正常' }, ['phone']);
      ensure(next.memberships, { id: row.backendMembershipId, userId: row.backendUserId, tenantId: row.tenantId, role: '普通成员', status: '正常' }, ['userId', 'tenantId']);
      ensure(login.memberships, { id: row.backendMembershipId, userId: row.id, enterpriseId: row.tenantId, enterprise: tenant.name, role: '普通成员', status: '已加入' }, ['userId', 'enterpriseId']);
    }
    ensure(login.accounts, { id: row.id, name: row.name, phone: row.phone, userType: row.userType, status: '正常' }, ['phone', 'userType']);
    const spaceId = row.userType === 'personal' ? 'personal' : row.tenantId;
    const link = { id: row.id, authUserId: row.id, spaceId, tenantId: row.tenantId, backendUserId: row.backendUserId, ...(row.backendMembershipId ? { backendMembershipId: row.backendMembershipId } : {}) };
    if (login.identityLinks.some(item => item.id !== link.id && item.authUserId === row.id && item.spaceId === spaceId)) throw new Error('用户身份映射存在冲突');
    ensure(login.identityLinks, link, Object.keys(link));
  }
  return { state: next, auth: login };
}
export function prepareLinkedAccounts(storage = globalThis.localStorage) {
  const raw = storage.getItem(ADMIN_DATA_KEY), authRaw = storage.getItem(AUTH_DATA_KEY);
  const state = readLinkedState(storage), auth = authRaw ? JSON.parse(authRaw) : emptyAuthState();
  const next = linkedAccountFixture(state, auth);
  const changed = JSON.stringify(next.state) !== JSON.stringify(state) || JSON.stringify(next.auth) !== JSON.stringify(auth);
  if (!changed) return false;
  next.state.revision++; next.auth.revision = (auth.revision || 0) + 1;
  const encoded = JSON.stringify(next.state);
  if (storage.getItem(ADMIN_DATA_KEY) !== raw || storage.getItem(AUTH_DATA_KEY) !== authRaw) throw new Error('数据已变化，请重试');
  storage.setItem(ADMIN_DATA_KEY, encoded);
  try { storage.setItem(AUTH_DATA_KEY, JSON.stringify(next.auth)); }
  catch (error) { if (storage.getItem(ADMIN_DATA_KEY) === encoded) storage.setItem(ADMIN_DATA_KEY, raw); throw error; }
  notifyLinkedState(); return true;
}
export function activeAdmin(state) {
  const account = state.admins.find(row => row.id === state.adminSession?.accountId);
  if (!account || account.status !== '已启用') throw new Error('请先选择有效的后台 mock 账号');
  return account;
}

// Prototype shortcut: only declared users, with the existing identity and status checks.
export function switchLinkedUser(userId, storage = globalThis.localStorage) {
  const fixture = LINKED_USERS.find(row => row.id === userId);
  if (!fixture) throw new Error('请选择已声明的前台 mock 账号');
  const state = readLinkedState(storage), auth = JSON.parse(storage.getItem(AUTH_DATA_KEY) || 'null');
  const account = auth?.accounts?.find(row => row.id === fixture.id);
  if (!account) throw new Error('请先在研发人员注意中准备联动账号');
  if (account.phone !== fixture.phone || account.userType !== fixture.userType) throw new Error('Mock 账号身份冲突，请核对账号资料');
  const next = loginAuthAccount(auth, fixture.phone, fixture.userType, ['phone']);
  const identity = resolveUserIdentity(state, next);
  if (identity.userId !== fixture.id || identity.tenantId !== fixture.tenantId) throw new Error('Mock 账号身份映射不匹配');
  if (auth.currentUserId === next.currentUserId && auth.activeSpace === next.activeSpace) return auth;
  return persistAuthState(auth, next, storage);
}
