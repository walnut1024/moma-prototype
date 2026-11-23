import { normalizeMemberPhone, memberPhoneError } from '../organization-data.mjs';
import { initialPersonalData } from '../mock/application-data.js';
import { enterpriseDisplayValue, validateDemoAdminCode } from './enterprise.js';
import { accountDataSource, isManagedCustomerAccount } from './account-data-source.js';

export const individualTabs = { info: '基本信息', models:'模型授权', projects:'项目', keys:'API 密钥' };
export const individualAccounts = state => state.tenants.filter(tenant => tenant.type === '个人').map(tenant => ({ tenant, user: state.users.find(user => user.id === tenant.ownerId) }));
export const managedIndividualAccounts = state => individualAccounts(state).filter(({ tenant }) => isManagedCustomerAccount(tenant));
export const individualName = ({ tenant, user }) => user?.nickname || tenant.name || '未设置昵称';
export const individualStatus = tenant => tenant.status === '停用' ? '已冻结' : tenant.status === '正常' ? '正常' : tenant.status;
export const maskIndividualValue = (field, value) => enterpriseDisplayValue(field, value) || '未填写';

export function filterIndividualAccounts(state, { q = '', status = '', source = '' } = {}) {
  const query = q.trim().toLowerCase();
  return managedIndividualAccounts(state).filter(account => {
    return (!status || account.tenant.status === status) && (!source || accountDataSource(account.tenant) === source) &&
      [account.tenant.id, account.tenant.ownerId, account.user?.phone, individualName(account)].some(value => String(value || '').toLowerCase().includes(query));
  }).sort((a, b) => String(b.user?.registeredAt || '').localeCompare(String(a.user?.registeredAt || '')) || a.tenant.id.localeCompare(b.tenant.id));
}

// Explicit browser-local phone-registration fixtures; these are not real identities.
export function individualSeed() {
  return initialPersonalData();
}

export function individualTransaction(state, command, actor = state.currentRole) {
  const { tenantId, operation, data = {}, ids = {}, loginProof } = command;
  if (operation==='create') {
    const newAccount=data.accountMode==='new';
    const existing=state.users.find(row=>row.id===data.userId && row.status==='正常');
    const name=newAccount ? String(data.name || '').trim() : existing?.nickname || existing?.name;
    const phone=newAccount ? normalizeMemberPhone(data.phone || '') : existing?.phone;
    const userId=newAccount ? ids.user : existing?.id;
    if (!['new','existing'].includes(data.accountMode) || !ids.tenant || !ids.project || !userId || !name || name.length>40) {
      throw Error('请填写个人租户信息或选择有效的登录账号');
    }
    if (newAccount && memberPhoneError(phone)) throw Error(memberPhoneError(phone));
    if (state.tenants.some(row=>row.type==='个人' && row.ownerId===userId)) throw Error('该账号已授权个人空间');
    const at=new Date().toISOString();
    return { type:'batch', objectId:ids.tenant, label:'开通个人租户', changes:[
      ...(newAccount ? [{type:'add',collection:'users',record:{id:userId,name,nickname:name,phone,login:phone,status:'正常',
        initialized:Boolean(loginProof),registeredAt:at,createdAt:at,updatedAt:at}}] : []),
      {type:'add',collection:'tenants',record:{id:ids.tenant,ownerId:userId,defaultProjectId:ids.project,name,type:'个人',status:'正常',source:'后台创建',createdAt:at,updatedAt:at}},
      {type:'add',collection:'projects',record:{id:ids.project,tenantId:ids.tenant,ownerId:userId,name:'默认项目',
        ...(command.createdBy && {createdBy:command.createdBy}),status:'正常',modelPermissions:[],retainContent:false,createdAt:at,updatedAt:at}},
    ] };
  }
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
    return { type: 'batch', objectId: ids.slice().sort().join(','), label: '批量冻结个人租户', changes: targets.map(({ tenant }) => ({ type: 'update', collection: 'tenants', id: tenant.id, changes: { status: '停用', freezeReason: reason, statusReason: reason } })) };
  }
  const account = individualAccounts(state).find(item => item.tenant.id === tenantId);
  if (!account) throw new Error('个人租户不存在，请返回列表');
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
  } else throw new Error('不支持的个人租户操作');
  return { type: 'batch', objectId: tenant.id, label: operation === 'edit' ? '编辑个人租户资料' : data.status === '停用' ? '冻结个人租户' : '解冻个人租户', changes };
}


export const individualFreezeScope = ids => 'individual:batch-freeze:' + [...ids].sort().join(',');
