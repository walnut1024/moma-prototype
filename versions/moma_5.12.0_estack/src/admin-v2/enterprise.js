import { isManagedCustomerAccount } from './account-data-source.js';

export const enterpriseTenants = state => state.tenants.filter(item => ['企业', '政府'].includes(item.type));
export const managedEnterpriseTenants = state => enterpriseTenants(state).filter(isManagedCustomerAccount);
export const isEnterpriseAdmin = (member, tenant) => member.tenantId === tenant.id && ['租户管理员', '企业管理员'].includes(member.role);
export const enterpriseAdmins = (state, tenant) => state.memberships.filter(member => isEnterpriseAdmin(member, tenant));
export const effectiveEnterpriseAdmins = (state, tenant) => enterpriseAdmins(state, tenant).filter(member => member.status === '正常' && state.users.some(user => user.id === member.userId && user.status === '正常'));
export const privateEnterprise = state => managedEnterpriseTenants(state).toSorted((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || a.id.localeCompare(b.id))[0];
export const enterpriseGrant = (state, tenantId) => state.grants.find(item => item.subjectType === 'tenant' && item.subjectId === tenantId);
export function enterpriseTokenUsage(model, usage) {
  if (!['text', 'multimodal', 'embedding', 'rerank'].includes(model?.type)) return 0;
  const input = Number(usage.input ?? 0), output = Number(usage.output ?? 0), total = input + output;
  if (![input, output, total].every(value => Number.isSafeInteger(value) && value >= 0)) throw new Error('Token 用量必须为非负安全整数');
  return total;
}

const required = (value, label, max = 80) => {
  const text = String(value || '').trim();
  if (!text) throw new Error(`请填写${label}`);
  if (text.length > max) throw new Error(`${label}不能超过 ${max} 个字符`);
  return text;
};

function adminPhone(value) {
  const phone = required(value, '管理员手机号码', 24).replace(/[\s()-]/g, '');
  if (!/^1[3-9]\d{9}$/.test(phone) && !/^\+[1-9]\d{6,14}$/.test(phone)) throw new Error('请输入有效的管理员手机号码；境外号码需包含 + 国际区号');
  return phone;
}

export const enterpriseMetadataFields = [
  { key: 'companyName', label: '公司/机构名称', required: true, max: 120, placeholder: '企业或机构主体全称' },
  { key: 'taxId', label: '税号/统一社会信用代码', required: true, max: 32, placeholder: '填写主体税务标识' },
  { key: 'countryRegion', label: '国家/地区', required: true, max: 60, placeholder: '如：中国' },
  { key: 'province', label: '省份/州', required: true, max: 60, placeholder: '如：江苏省' },
  { key: 'city', label: '城市', max: 60, placeholder: '如：南京市' },
  { key: 'address', label: '详细地址', max: 200, placeholder: '区县、街道及门牌等' },
  { key: 'industry', label: '所属行业', max: 60, placeholder: '如：软件与信息技术服务' },
  { key: 'contactName', label: '业务联系人', required: true, max: 40, placeholder: '企业开户及业务联系人员' },
  { key: 'contactPhone', label: '联系电话', required: true, max: 40, type: 'tel', placeholder: '手机或座机，支持国际区号' },
  { key: 'contactEmail', label: '联系邮箱', max: 120, type: 'email', placeholder: '企业业务联系邮箱' },
  { key: 'website', label: '企业网站', max: 200, type: 'url', placeholder: 'https://example.com' },
];

// Mask only rendered text; transactions and editor inputs retain original values.
export function enterpriseDisplayValue(field, value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (['contactName', 'adminName'].includes(field)) {
    const letters = Array.from(text);
    return letters.length === 1 ? '*' : letters[0] + '*'.repeat(letters.length - 1);
  }
  if (field === 'taxId') return text.length > 7 ? text.slice(0, 3) + '*'.repeat(text.length - 7) + text.slice(-4) : '*'.repeat(text.length);
  if (['phone', 'contactPhone'].includes(field)) {
    const phone = text.replace(/[\s().-]/g, '');
    return phone.length > 7 ? phone.slice(0, -8) + '****' + phone.slice(-4) : '*'.repeat(phone.length);
  }
  if (['email', 'contactEmail'].includes(field)) {
    const at = text.indexOf('@');
    return at > 0 ? text[0] + '***' + text.slice(at) : '*'.repeat(text.length);
  }
  return text;
}

function metadata(data) {
  const values = Object.fromEntries(enterpriseMetadataFields.map(field => {
    const value = String(data[field.key] || '').trim();
    if (field.required && !value) throw new Error(`请填写${field.label}`);
    if (value.length > field.max) throw new Error(`${field.label}不能超过 ${field.max} 个字符`);
    return [field.key, value];
  }));
  values.taxId = values.taxId.toUpperCase();
  if (values.taxId && !/^[A-Z0-9]+$/.test(values.taxId)) throw new Error('税号/统一社会信用代码仅支持字母和数字');
  if (values.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.contactEmail)) throw new Error('请输入有效的企业联系邮箱');
  if (!/^[+\d\s().-]{3,40}$/.test(values.contactPhone) || !/\d{3}/.test(values.contactPhone.replace(/\D/g, ''))) throw new Error('请输入有效的联系电话');
  if (values.website) {
    try { const url = new URL(values.website); if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) throw new Error(); }
    catch { throw new Error('企业网站需填写完整的 http 或 https 地址'); }
  }
  return values;
}

// A browser-only interaction fixture, not an authentication or delivery service.
export function validateDemoAdminCode(challenge, { code, scope, actor, now = Date.now() }) {
  if (!challenge) throw new Error('请先获取管理员校验码');
  if (challenge.scope !== scope || challenge.actor !== actor) throw new Error('操作对象或角色已变化，请重新获取校验码');
  if (now < challenge.issuedAt || now >= challenge.issuedAt + 300000) throw new Error('校验码已过期，请重新获取');
  if (!/^\d{6}$/.test(code) || code !== challenge.code) throw new Error('校验码错误，请核对后重试');
  return true;
}

// All enterprise commands resolve to one audited transaction in the shared demo store.
export function enterpriseTransaction(state, command) {
  const { operation, ids = {}, tenantId, data = {}, mode = 'cloud' } = command;
  const tenant = state.tenants.find(item => item.id === tenantId);
  const changes = [];
  if (operation !== 'create' && (!tenant || !enterpriseTenants(state).some(item => item.id === tenantId))) throw new Error('企业不存在，请返回列表');
  if (operation !== 'create' && mode === 'private' && privateEnterprise(state)?.id !== tenantId) throw new Error('该企业不属于当前私有化场景');
  const requireId = key => required(ids[key], '事务编号');
  let account;
  if (operation === 'create' || operation === 'add-admin') {
    if (!['new', 'existing'].includes(data.accountMode)) throw new Error('请选择账号开通方式');
    if (operation === 'create' && mode === 'private' && managedEnterpriseTenants(state).length) throw new Error('当前单企业容量已用完，请进入企业详情管理账号');
    if (operation === 'add-admin' && (!tenant || tenant.status === '停用')) throw new Error('请先解冻企业账号，再添加管理员');
    if (data.accountMode === 'existing') {
      account = state.users.find(user => user.id === data.userId);
      if (!account || account.status !== '正常') throw new Error('请选择有效的已有登录账号');
      const phone = adminPhone(data.phone);
      if (phone !== account.phone) {
        changes.push({ type: 'update', collection: 'users', id: account.id, changes: { phone } });
        account = { ...account, phone };
      }
    } else {
      const name = required(data.adminName, '管理员姓名', 40);
      const login = required(data.login, '登录账号', 64);
      if (!/^[a-zA-Z0-9][a-zA-Z0-9_.@-]{2,63}$/.test(login)) throw new Error('登录账号为 3–64 位字母、数字或 . _ @ -');
      if (state.users.some(user => user.login.toLowerCase() === login.toLowerCase())) throw new Error('登录账号已存在，请选择已有登录账号');
      const email = String(data.email || '').trim();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('请输入有效的联系邮箱');
      account = { id: requireId('user'), name, login, email, phone: adminPhone(data.phone), status: '正常', initialized: false };
      changes.push({ type: 'add', collection: 'users', record: account });
    }
    let targetId = tenantId;
    if (operation === 'create') {
      const name = required(data.companyName, '公司/机构名称', 120);
      if (!['企业', '政府'].includes(data.type)) throw new Error('请选择有效的客户类型');
      if (String(data.notes || '').length > 500) throw new Error('备注不能超过 500 个字符');
      targetId = requireId('tenant');
      changes.push({ type: 'add', collection: 'tenants', record: { id: targetId, name, ...metadata(data), type: data.type, notes: data.notes?.trim() || '', ownerId: account.id, status: '正常', source: '后台创建' } });
      changes.push({ type: 'add', collection: 'organizations', record: { id: requireId('organization'), tenantId: targetId, parentId: null, name, status: '正常' } });
    }
    const existing = state.memberships.find(member => member.tenantId === targetId && member.userId === account.id);
    if (existing && isEnterpriseAdmin(existing, tenant)) throw new Error('该账号已是本企业管理员，请在管理员列表管理');
    const member = { userId: account.id, tenantId: targetId, name: account.name, role: '租户管理员', status: '正常' };
    changes.push(existing ? { type: 'update', collection: 'memberships', id: existing.id, changes: member } : { type: 'add', collection: 'memberships', record: { id: requireId('member'), ...member, projectIds: [] } });
  } else {
    if (!tenant) throw new Error('企业不存在，请返回列表');
    if (operation === 'edit') {
      const name = required(data.companyName, '公司/机构名称', 120);
      if (!['企业', '政府'].includes(data.type)) throw new Error('请选择有效的客户类型');
      if (String(data.notes || '').length > 500) throw new Error('备注不能超过 500 个字符');
      changes.push({ type: 'update', collection: 'tenants', id: tenantId, changes: { name, ...metadata(data), type: data.type, notes: data.notes?.trim() || '' } });
      const adminIds = [...new Set(enterpriseAdmins(state, tenant).map(member => member.userId))];
      const phones = data.adminPhones;
      if (!phones || Array.isArray(phones) || typeof phones !== 'object' || Object.keys(phones).length !== adminIds.length || Object.keys(phones).some(id => !adminIds.includes(id))) throw new Error('管理员列表已变化，请重新打开编辑信息');
      for (const userId of adminIds) {
        const user = state.users.find(item => item.id === userId);
        if (!user) throw new Error('管理员登录身份缺失，请先处理账号关联');
        const phone = adminPhone(phones[userId]);
        if (phone !== user.phone) changes.push({ type: 'update', collection: 'users', id: userId, changes: { phone } });
      }
      const root = state.organizations.find(org => org.tenantId === tenantId && org.parentId === null);
      if (root) changes.push({ type: 'update', collection: 'organizations', id: root.id, changes: { name } });
    } else if (operation === 'toggle-tenant') {
      changes.push({ type: 'update', collection: 'tenants', id: tenantId, changes: { status: tenant.status === '停用' ? '正常' : '停用' } });
    } else if (operation === 'toggle-admin') {
      if (tenant.status === '停用') throw new Error('请先解冻企业账号');
      const member = enterpriseAdmins(state, tenant).find(item => item.id === command.memberId);
      if (!member) throw new Error('管理员关系不存在');
      if (member.status === '停用' && !state.users.some(user => user.id === member.userId && user.status === '正常')) throw new Error('登录账号已停用或不存在，不能启用管理员');
      if (effectiveEnterpriseAdmins(state, tenant).some(item => item.id === member.id) && effectiveEnterpriseAdmins(state, tenant).length <= 1) throw new Error('至少保留一位有效企业管理员，请先添加其他管理员');
      changes.push({ type: 'update', collection: 'memberships', id: member.id, changes: { status: member.status === '停用' ? '正常' : '停用' } });
    } else if (operation === 'toggle-key') {
      const key = state.apiKeys.find(item => item.id === command.keyId && item.tenantId === tenantId && state.projects.some(project => project.id === item.projectId && project.tenantId === tenantId));
      if (!key || !['有效', '停用'].includes(key.status)) throw new Error('API 密钥不存在、已撤销或归属异常');
      if (tenant.status === '停用' && key.status === '停用') throw new Error('请先解冻企业账号，再启用 API 密钥');
      changes.push({ type: 'update', collection: 'apiKeys', id: key.id, changes: { status: key.status === '停用' ? '有效' : '停用' } });
    } else if (operation === 'configure-grant') {
      if (tenant.status === '停用') throw new Error('请先解冻企业账号，再配置授权额度');
      const reason = required(data.reason, '调整原因', 500), limit = Number(data.limit);
      if (String(data.limit).trim() === '' || !Number.isSafeInteger(limit) || limit < 0) throw new Error('总额度必须为非负整数 Token');
      if (!Array.isArray(data.modelIds) || data.modelIds.some(id => !state.models.some(model => model.id === id))) throw new Error('请选择有效模型');
      const grant = enterpriseGrant(state, tenantId), used = grant?.used || 0;
      if (limit < used) throw new Error('总额度不能低于已用额度');
      const modelIds = [...new Set(data.modelIds)];
      if (grant && grant.limit === limit && JSON.stringify([...grant.modelIds].sort()) === JSON.stringify([...modelIds].sort())) throw new Error('授权及额度没有变化');
      const value = { subjectType: 'tenant', subjectId: tenantId, modelIds, limit, used, period: 'total', status: '生效中' };
      changes.push(grant ? { type: 'update', collection: 'grants', id: grant.id, changes: value } : { type: 'add', collection: 'grants', record: { id: requireId('grant'), ...value } });
      changes.push({ type: 'add', collection: 'ledger', record: { id: requireId('ledger'), accountId: tenantId, sourceId: requireId('ledger'), type: '企业授权额度调整', delta: limit - (grant?.limit || 0), balance: limit - used, reason, status: '已完成' } });
    } else throw new Error('未知企业操作');
  }
  return { type: 'batch', objectId: tenantId || ids.tenant, label: ({ create: '创建企业并开通管理员', 'add-admin': '添加企业管理员', edit: '编辑企业信息', 'toggle-tenant': tenant?.status === '停用' ? '解冻企业账号' : '冻结企业账号', 'toggle-admin': '变更管理员状态', 'toggle-key': '变更企业 API 密钥状态', 'configure-grant': '配置企业授权与额度' })[operation], changes };
}
