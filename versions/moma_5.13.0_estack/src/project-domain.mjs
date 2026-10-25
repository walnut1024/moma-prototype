import { organizationChanges } from './project-organization.mjs';
import { parseIpAllowlist } from './api-key-utils.mjs';
import { activeSupplySalePrice, availableSupplies, priceItems } from './admin-v2/model-management.js';
import { callModelId } from './admin-v2/model-operations.js';

const uid = prefix => `${prefix}-${crypto.randomUUID()}`;
const fail = (message, code = 'invalid_configuration') => { throw Object.assign(new Error(message), { code }); };
const add = (collection, record) => ({ type: 'add', collection, record });
const update = (collection, id, changes) => ({ type: 'update', collection, id, changes });
export const money = value => value == null ? '未记录' : `¥${(value / 1e6).toLocaleString('zh-CN', { maximumFractionDigits: 6 })}`;
export function parseMoney(value) {
  if (value === '' || value == null) return null;
  const text = String(value).trim();
  if (!/^\d+(\.\d{1,6})?$/.test(text)) fail('金额须为非负数，最多六位小数');
  const [whole, fraction = ''] = text.split('.');
  const result = Number(whole) * 1e6 + Number(fraction.padEnd(6, '0'));
  if (!Number.isSafeInteger(result)) fail('金额超过允许范围');
  return result;
}
export const monthOf = time => new Date(time).toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }).slice(0, 7);
export const currentSpend = (state, object, now = Date.now()) => state.requests.filter(row => row.workspace && row.httpStatus === 200 && (object.projectId ? row.keyId === object.id : row.projectId === object.id) && (object.budgetPeriod !== 'month' || monthOf(row.createdAt) === monthOf(now))).reduce((sum, row) => sum + (row.customerCharge || 0), 0);
export function workspaceSeed(state) {
  state.projectMemberships = state.projects.flatMap(project => state.memberships.filter(member => member.tenantId === project.tenantId && (member.userId === project.ownerId || member.projectIds?.includes(project.id))).map(member => ({ id: uid('pm'), projectId: project.id, userId: member.userId, role: member.userId === project.ownerId ? '管理员' : '成员', status: '正常' })));
  state.projectModelGrants = state.projects.flatMap(project => state.models.filter(model => model.listingStatus === '已上架').slice(0, 2).map(model => ({ id: uid('pg'), projectId: project.id, modelId: model.id, enabled: true, rpm: null, tpm: null })));
  state.projects = state.projects.map(project => ({ ...project, description: '', moneyBudget: 1e9, budgetPeriod: 'month', warningPercent: 80, overageAction: 'stop', logBodies: false }));
  state.apiKeys = state.apiKeys.map(key => ({ ...key, createdBy: state.projects.find(project => project.id === key.projectId)?.ownerId, moneyBudget: null, budgetPeriod: 'month', expiresAt: null }));
  state.apiKeys.push(...state.projects.map(project => ({ id: `experience-${project.id}`, keyId: `experience-${project.id}`, name: '在线体验', tenantId: project.tenantId, projectId: project.id, createdBy: project.ownerId, managed: true, modelIds: null, status: '有效', moneyBudget: null, budgetPeriod: 'month', expiresAt: null, secretPreview: '系统托管' })));
  return state;
}
export function workspaceIdentity(auth, userType) {
  if (auth.storageError) return null;
  if (!auth.user) return userType === 'personal' ? { userId: 'user-personal-demo-001', tenantId: 'personal-demo-001', name: '林间风', tenantName: '个人空间', personal: true } : { userId: 'user-zhang', tenantId: 'tenant-gov', name: '张敏', tenantName: '江苏政务云', admin: true };
  const space = auth.spaces.find(item => item.id === auth.state.activeSpace);
  if (!space) return null;
  const personal = space.id === 'personal';
  return { userId: auth.user.id, tenantId: personal ? `workspace-${auth.user.id}` : space.id, name: auth.user.name || auth.user.phone, tenantName: personal ? '个人空间' : space.name, personal, admin: ['企业管理员', '租户管理员'].includes(space.role) };
}
export function accountMember(state, identity) {
  const tenant = state.tenants.find(item => item.id === identity?.tenantId && item.status !== '停用');
  const user = state.users.find(item => item.id === identity?.userId && item.status === '正常');
  if (!tenant || !user) return false;
  return tenant.ownerId === user.id || state.memberships.some(member => member.tenantId === tenant.id && member.userId === user.id && ['正常', '已加入'].includes(member.status));
}
export const accountAdmin = (state, identity) => accountMember(state, identity) && (state.tenants.find(item => item.id === identity.tenantId)?.ownerId === identity.userId || state.memberships.some(member => member.tenantId === identity.tenantId && member.userId === identity.userId && ['正常', '已加入'].includes(member.status) && ['企业管理员', '租户管理员'].includes(member.role)));
export function projectRole(state, project, identity) {
  if (!project || project.tenantId !== identity?.tenantId || !accountMember(state, identity)) return null;
  if (accountAdmin(state, identity)) return '管理员';
  return state.projectMemberships.find(member => member.projectId === project.id && member.userId === identity.userId && member.status === '正常')?.role || null;
}
export const visibleProjects = (state, identity) => state.projects.filter(project => project.status !== '已删除' && projectRole(state, project, identity));
export function accountModels(state, tenantId) {
  const grant = state.grants.find(item => item.subjectType === 'tenant' && item.subjectId === tenantId);
  if (grant?.status === '停用') return [];
  return state.models.filter(model => (!grant || grant.modelIds.includes(model.id)) && (model.openScope !== 'selected' || model.tenantIds?.includes(tenantId)));
}
export function modelOffers(state, model) {
  return availableSupplies(state, model.id).filter(supply => supply.status === '已启用' && supply.salesEnabled && supply.provider?.status === '已启用' && supply.endpoint?.status === '运行中').map(supply => ({ ...supply, callId: supply.callId || callModelId(supply.provider, model), price: activeSupplySalePrice(state, model.id, supply.id), items: priceItems(activeSupplySalePrice(state, model.id, supply.id), model) }));
}
export const projectModels = (state, project) => accountModels(state, project.tenantId).filter(model => state.projectModelGrants.some(grant => grant.projectId === project.id && grant.modelId === model.id && grant.enabled) && model.callsEnabled !== false && modelOffers(state, model).length);
export function effectiveLimit(state, project, modelId, kind) {
  const local = state.projectModelGrants.find(grant => grant.projectId === project.id && grant.modelId === modelId)?.[kind];
  const rules = state.limits.filter(rule => rule.status === '已启用' && ((rule.scopeType === 'tenant' && rule.scopeId === project.tenantId) || (rule.scopeType === 'model' && rule.scopeId === modelId) || (rule.scopeType === 'project' && rule.scopeId === project.id)));
  const values = [local, ...rules.map(rule => rule[kind])].filter(value => Number.isFinite(value) && value > 0);
  return values.length ? Math.min(...values) : null;
}
export function assertProject(state, identity, projectId, admin = false, write = false) {
  const project = state.projects.find(item => item.id === projectId && item.status !== '已删除');
  const role = projectRole(state, project, identity);
  if (!role) fail('无法访问该项目，请选择有权限的项目', 'project_forbidden');
  if (admin && role !== '管理员' || write && role === '只读') fail('当前项目角色无权执行此操作', 'permission_denied');
  return project;
}
function keyFields(state, project, values, now) {
  const allowed = projectModels(state, project).map(model => model.id);
  if (!Array.isArray(values.modelIds) || !values.modelIds.length || values.modelIds.some(id => !allowed.includes(id))) fail('请选择项目已开通且可用的模型');
  const expiry = values.expiresAt && (/(?:Z|[+-]\d\d:\d\d)$/.test(values.expiresAt) ? values.expiresAt : values.expiresAt + '+08:00');
  if (expiry && !Number.isFinite(Date.parse(expiry))) fail('有效期格式无效');
  const expiresAt = expiry ? new Date(expiry).toISOString() : null;
  if (expiresAt && (!Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= now)) fail('有效期必须晚于当前时间');
  const name = String(values.name || '').trim();
  if (name.length < 2 || name.length > 50) fail('Key 名称须为 2–50 字');
  if (!['month', 'total'].includes(values.budgetPeriod)) fail('请选择预算周期');
  if (String(values.description || '').length > 200) fail('用途最多 200 字');
  const subscriptionId = values.subscriptionId || null;
  if (subscriptionId) {
    const order = state.orders.find(item => item.id === subscriptionId && item.tenantId === project.tenantId && item.status === '已开通');
    const product = state.products.find(item => item.id === order?.productId && productBillingType(item) === 'plan');
    if (!product || values.modelIds.some(id => !product.modelIds.includes(id))) fail('Token Plan 不属于当前账户、尚未开通或不包含所选模型');
    for (const modelId of values.modelIds) activeSubscription(state, project, subscriptionId, modelId, now);
  }
  return { name, ips: parseIpAllowlist(values.ips || ''), description: values.description || '', modelIds: [...new Set(values.modelIds)], subscriptionId, moneyBudget: subscriptionId ? null : parseMoney(values.budget), budgetPeriod: values.budgetPeriod, expiresAt };
}
export function workspaceTransaction(state, command) {
  const { operation, identity, projectId, values = {}, now = Date.now() } = command;
  const changes = [];
  let objectId = projectId || identity?.tenantId;
  if (operation === 'order') {
    if (!accountAdmin(state, identity)) fail('仅账户管理员可订购');
    if (!Array.isArray(values.productIds) || !values.productIds.length) fail('请选择产品');
    for (const id of new Set(values.productIds)) {
      const product = state.products.find(item => item.id === id && item.status === '已上架');
      if (!product || !product.modelIds?.every(id => accountModels(state,identity.tenantId).some(model=>model.id===id))) fail('产品不在当前账户可订购范围');
      if (state.orders.some(item=>item.tenantId===identity.tenantId && item.productId===id && !['已取消','已到期'].includes(item.status))) fail('已有订单，请勿重复提交');
      const payg=productBillingType(product)==='payg';
      changes.push(add('orders',{id:uid('order'),orderNo:'ORD-'+crypto.randomUUID().slice(0,8),tenantId:identity.tenantId,productId:id,amount:product.price || 0,entitlement:0,used:0,status:payg?'生效中':'待支付',timeline:['订单创建',...(payg?['服务开通']:[])],createdAt:new Date(now).toISOString()}));
    }
  } else if (operation === 'organization') {
    if (!accountAdmin(state, identity) || identity.personal) fail('仅企业账户管理员可维护组织及成员');
    changes.push(...organizationChanges(state, identity, values));
  } else if (operation === 'bootstrap') {
    if (!identity?.userId || !identity?.tenantId) fail('请先选择可访问空间');
    const tenant = state.tenants.find(item => item.id === identity.tenantId);
    if (tenant?.status === '停用') fail('当前账户空间已停用');
    if (state.users.some(item => item.id === identity.userId && item.status !== '正常')) fail('当前人员账号已停用');
    if (!tenant) changes.push(add('tenants', { id: identity.tenantId, name: identity.tenantName, type: identity.personal ? '个人' : '企业', ownerId: identity.personal || identity.admin ? identity.userId : null, status: '正常' }));
    if (!state.users.some(item => item.id === identity.userId)) changes.push(add('users', { id: identity.userId, name: identity.name, login: identity.userId, status: '正常' }));
    if (!state.memberships.some(item => item.tenantId === identity.tenantId && item.userId === identity.userId)) changes.push(add('memberships', { id: uid('membership'), tenantId: identity.tenantId, userId: identity.userId, role: identity.admin ? '企业管理员' : '普通成员', status: '正常', projectIds: [] }));
    if (!changes.length) return null;
  } else if (operation === 'create') {
    if (!accountAdmin(state, identity)) fail('仅账户管理员可创建项目');
    const name = String(values.name || '').trim();
    if (name.length < 2 || name.length > 50) fail('项目名称须为 2–50 字');
    if (state.projects.some(project => project.tenantId === identity.tenantId && project.status !== '已删除' && project.name === name)) fail('当前账户已有同名项目');
    if (String(values.description || '').length > 200) fail('项目说明最多 200 字');
    objectId = uid('project');
    changes.push(add('projects', { id: objectId, tenantId: identity.tenantId, ownerId: identity.userId, name, description: values.description || '', status: '正常', moneyBudget: null, budgetPeriod: 'month', warningPercent: 80, overageAction: 'stop', logBodies: false }));
    changes.push(add('projectMemberships', { id: uid('pm'), projectId: objectId, userId: identity.userId, role: '管理员', status: '正常' }));
    changes.push(add('apiKeys', { id: `experience-${objectId}`, keyId: `experience-${objectId}`, name: '在线体验', projectId: objectId, tenantId: identity.tenantId, createdBy: identity.userId, managed: true, status: '有效', modelIds: null, secretPreview: '系统托管', moneyBudget: null, budgetPeriod: 'month' }));
  } else {
    const project = assertProject(state, identity, projectId, !['createKey', 'editKey', 'keyStatus', 'deleteKey', 'rotateKey', 'leave', 'request'].includes(operation), operation !== 'leave');
    if (operation === 'routes') {
      if (!Array.isArray(values.routes)) fail('路由配置无效');
      const allowed=projectModels(state,project).map(model=>model.id), names=new Set();
      for(const route of values.routes) {
        if (!route.id || typeof route.name!=='string' || route.name.trim().length<2 || route.name.length>50 || names.has(route.name) || !Array.isArray(route.modelIds) || !route.modelIds.length || route.modelIds.some(id=>!allowed.includes(id))) fail('路由名称须唯一，候选模型须在项目可用范围内');
        names.add(route.name);
      }
      changes.push(update('projects',projectId,{smartRoutes:values.routes.map(route=>({id:route.id,name:route.name,strategy:route.strategy,modelIds:route.modelIds,status:route.status,creator:identity.name || identity.userId,time:route.time}))}));
    } else if (operation === 'profile') {
      const name = String(values.name || '').trim();
      if (name.length < 2 || name.length > 50 || state.projects.some(item => item.id !== projectId && item.tenantId === identity.tenantId && item.status !== '已删除' && item.name === name)) fail('项目名称须为 2–50 字且不能重名');
      if (String(values.description || '').length > 200) fail('项目说明最多 200 字');
      changes.push(update('projects', projectId, { name, description: values.description || '' }));
    } else if (operation === 'budget') {
      if (!['month', 'total'].includes(values.budgetPeriod) || !['stop', 'warn'].includes(values.overageAction) || !Number.isInteger(Number(values.warningPercent)) || Number(values.warningPercent) < 1 || Number(values.warningPercent) > 100) fail('请填写有效的预算周期、阈值和超额动作');
      changes.push(update('projects', projectId, { moneyBudget: parseMoney(values.budget), budgetPeriod: values.budgetPeriod, warningPercent: Number(values.warningPercent), overageAction: values.overageAction, logBodies: Boolean(values.logBodies) }));
    } else if (operation === 'model') {
      if (!accountModels(state, project.tenantId).some(model => model.id === values.modelId)) fail('模型不在账户授权范围');
      for (const name of ['rpm', 'tpm']) if (values[name] !== '' && values[name] != null && (!Number.isSafeInteger(Number(values[name])) || Number(values[name]) < 1)) fail('RPM / TPM 须为正整数，留空继承');
      const grant = state.projectModelGrants.find(item => item.projectId === projectId && item.modelId === values.modelId);
      const fields = { projectId, modelId: values.modelId, enabled: Boolean(values.enabled), rpm: values.rpm === '' || values.rpm == null ? null : Number(values.rpm), tpm: values.tpm === '' || values.tpm == null ? null : Number(values.tpm) };
      changes.push(grant ? update('projectModelGrants', grant.id, fields) : add('projectModelGrants', { id: uid('pg'), ...fields }));
    } else if (operation === 'member') {
      if (!state.memberships.some(member => member.tenantId === project.tenantId && member.userId === values.userId && ['正常', '已加入'].includes(member.status)) && state.tenants.find(tenant => tenant.id === project.tenantId)?.ownerId !== values.userId) fail('只能添加当前账户的正常成员');
      if (!state.users.some(user => user.id === values.userId && user.status === '正常')) fail('成员账号不可用');
      if (!['管理员', '成员', '只读'].includes(values.role)) fail('项目角色无效');
      const member = state.projectMemberships.find(item => item.projectId === projectId && item.userId === values.userId);
      if (values.userId === project.ownerId && (values.remove || values.role !== '管理员')) fail('请先交接项目负责人');
      if (member?.role === '管理员' && (values.remove || values.role !== '管理员') && !state.projectMemberships.some(item => item.projectId === projectId && item.id !== member.id && item.status === '正常' && item.role === '管理员')) fail('不能移除最后一位项目管理员');
      changes.push(member ? update('projectMemberships', member.id, { role: values.role, status: values.remove ? '已移除' : '正常' }) : add('projectMemberships', { id: uid('pm'), projectId, userId: values.userId, role: values.role, status: '正常' }));
    } else if (operation === 'transfer') {
      if (project.ownerId !== identity.userId && !accountAdmin(state, identity)) fail('仅负责人或账户管理员可交接');
      if (!state.projectMemberships.some(member => member.projectId === projectId && member.userId === values.userId && member.role === '管理员' && member.status === '正常') || !state.users.some(user => user.id === values.userId && user.status === '正常')) fail('请选择项目内正常的管理员');
      changes.push(update('projects', projectId, { ownerId: values.userId }));
    } else if (operation === 'leave') {
      if (project.ownerId === identity.userId) fail('负责人须先交接后退出');
      const member = state.projectMemberships.find(item => item.projectId === projectId && item.userId === identity.userId && item.status === '正常');
      if (!member) fail('当前人员不在项目成员中');
      changes.push(update('projectMemberships', member.id, { status: '已退出' }));
    } else if (operation === 'delete') {
      if (!accountAdmin(state, identity)) fail('仅账户管理员可删除项目');
      if (values.confirmName !== project.name) fail('请输入完整项目名称确认删除');
      changes.push(update('projects', projectId, { status: '已删除' }), ...state.apiKeys.filter(key => key.projectId === projectId).map(key => update('apiKeys', key.id, { status: '已删除' })));
    } else if (operation === 'createKey') {
      const fields = keyFields(state, project, values, now);
      if (!/^[a-f0-9]{64}$/.test(values.fingerprint || '') || !/^sk-\*{5}[a-f0-9]{4}$/.test(values.secretPreview || '')) fail('密钥生成失败，请重试');
      objectId = uid('key');
      changes.push(add('apiKeys', { id: objectId, keyId: objectId, projectId, tenantId: project.tenantId, createdBy: identity.userId, ...fields, fingerprint: values.fingerprint, secretPreview: values.secretPreview, status: '有效' }));
    } else if (['editKey', 'keyStatus', 'deleteKey', 'rotateKey'].includes(operation)) {
      const key = state.apiKeys.find(item => item.id === values.id && item.projectId === projectId && item.status !== '已删除');
      if (!key || key.managed) fail('系统托管 Key 不支持此操作');
      if (projectRole(state, project, identity) !== '管理员' && key.createdBy !== identity.userId) fail('只能管理本人创建的 Key');
      if (operation === 'rotateKey' && (!/^[a-f0-9]{64}$/.test(values.fingerprint || '') || !/^sk-\*{5}[a-f0-9]{4}$/.test(values.secretPreview || ''))) fail('密钥生成失败');
      changes.push(update('apiKeys', key.id, operation === 'rotateKey' ? { fingerprint: values.fingerprint, secretPreview: values.secretPreview, rotatedAt: new Date(now).toISOString() } : operation === 'editKey' ? keyFields(state, project, values, now) : { status: operation === 'deleteKey' ? '已删除' : key.status === '有效' ? '停用' : '有效' }));
      objectId = key.id;
    } else if (operation === 'request') return requestTransaction(state, command, project);
    else fail('未知项目操作');
  }
  const labels = { routes:'配置项目路由', order:'订购产品', organization: '维护组织及成员', bootstrap: '建立账户空间', create: '创建项目', profile: '更新项目基本信息', budget: '更新项目预算与日志', model: '配置项目模型', member: '更新项目成员', transfer: '交接负责人', leave: '退出项目', delete: '删除项目', createKey: '创建 API Key', editKey: '编辑 API Key', keyStatus: '启停 API Key', deleteKey: '删除 API Key', rotateKey: '轮换 API Key' };
  return { type: 'batch', objectId, label: labels[operation], changes, workspaceActor: identity.userId, workspaceTenantId: identity.tenantId, workspaceProjectId: projectId || (operation === 'create' ? objectId : null) };
}
function requestTransaction(state, command, project) {
  const { identity, values, now = Date.now() } = command;
  if (!values.requestId || state.requests.some(row => row.requestId === values.requestId)) fail('请求标识重复');
  const model = state.models.find(item => item.id === values.modelId);
  const key = state.apiKeys.find(item => item.id === values.keyId && item.projectId === project.id);
  const supply = model && modelOffers(state, model).find(item => !values.supplyId || item.id === values.supplyId);
  let error = null, charge = 0;
  // shortcut: Fixed local output and usage; replace with gateway results when real model invocation is connected.
  const usage = { input: 128, output: 256, cached: 0 };
  const answer = `已收到：${String(values.prompt || '').slice(0, 120)}\n\n建议先明确目标和使用场景，再整理关键事实与执行步骤。对具体结论请结合业务资料核验。`;
  try {
    if ((!String(values.prompt || '').trim() && !values.attachments?.length) || String(values.prompt || '').length > 6000) fail('体验内容须为 1–6000 字', 'invalid_prompt');
    if (project.status !== '正常') fail('项目已停用', 'project_disabled');
    if (!key || key.status !== '有效') fail('Key 不可用', 'key_disabled');
    if (!key.managed && key.createdBy !== identity.userId && projectRole(state, project, identity) !== '管理员') fail('Key 不属于当前用户', 'key_forbidden');
    if (key.expiresAt && Date.parse(key.expiresAt) <= now) fail('Key 已过期', 'key_expired');
    if (!projectModels(state, project).some(item => item.id === values.modelId) || key.modelIds && !key.modelIds.includes(values.modelId)) fail('模型未开通或不在 Key 允许范围', 'model_not_authorized');
    if (!supply) fail('模型服务当前不可用', 'model_unavailable');
    if (['text','multimodal'].includes(model.type) && values.attachments?.length && !model.profile?.inputModalities?.some(value => ['图片', '图像'].includes(value))) fail('模型不支持图片输入', 'invalid_parameters');
    const maxOutput = Number(values.maxOutput || 1024);
    if (!Number.isSafeInteger(maxOutput) || maxOutput < 1 || maxOutput > (model.capabilities?.output || 32768) || !Number.isFinite(Number(values.temperature ?? 0.7)) || !Number.isFinite(Number(values.topP ?? 0.8)) || Number(values.temperature ?? 0.7) < 0 || Number(values.temperature ?? 0.7) > 2 || Number(values.topP ?? 0.8) < 0 || Number(values.topP ?? 0.8) > 1) fail('推理参数超出模型范围', 'invalid_parameters');
    usage.output = Math.min(256, maxOutput);
    if (['text','multimodal','embedding','rerank'].includes(model.type)) {
      const input=supply.items.find(item=>/输入/.test(item.name)&&!/缓存/.test(item.name)), output=supply.items.find(item=>/输出/.test(item.name));
      if (!input || !output || [input,output].some(item=>!Number.isSafeInteger(item.amount)||item.currency!=='CNY'||!/百万.*Token/i.test(item.unit))) fail('当前服务没有可计算的人民币 Token 售价','price_unconfigured');
      charge=Number((BigInt(input.amount)*BigInt(usage.input)+BigInt(output.amount)*BigInt(usage.output)+999999n)/1000000n);
    } else {
      const mediaType=model.type==='audio' ? (model.profile?.tasks?.includes('语音识别')?'asr':'tts') : model.type;
      const metric={image:'images',video:'seconds',tts:'characters',asr:'seconds'}[mediaType];
      const quantity=Number(values.quantity);
      if(!metric || !Number.isSafeInteger(quantity) || quantity<1 || quantity>10000) fail('计量数量无效','invalid_parameters');
      const unit={image:/张|图/,video:/秒/,tts:/字符/,asr:/秒|分钟/}[mediaType];
      const price=supply.items.find(item=>unit.test(item.unit));
      if(!price || !Number.isSafeInteger(price.amount) || price.currency!=='CNY') fail('当前服务计价单位未配置','price_unconfigured');
      const divisor=/百万/.test(price.unit)?1000000:/万/.test(price.unit)?10000:/千/.test(price.unit)?1000:/分钟/.test(price.unit)?60:1;
      charge=Math.ceil(price.amount*quantity/divisor);
      if(!Number.isSafeInteger(charge)) fail('费用超出范围','invalid_parameters');
      delete usage.input; delete usage.output; delete usage.cached; usage[metric]=quantity;
    }
    if (key.subscriptionId && (!Number.isFinite(usage.input) || !Number.isFinite(usage.output))) fail('当前套餐不支持此计量方式','subscription_unavailable');
    if (key.subscriptionId) { const order = activeSubscription(state, project, key.subscriptionId, model.id, now); if ((order.used || 0) + usage.input + usage.output > order.entitlement) fail('Token Plan 剩余额度不足', 'subscription_exhausted'); charge = 0; }
    if (project.moneyBudget != null && project.overageAction === 'stop' && currentSpend(state, project, now) + charge > project.moneyBudget) fail('项目预算不足，请调整预算后重试', 'project_budget_exhausted');
    if (key.moneyBudget != null && currentSpend(state, key, now) + charge > key.moneyBudget) fail('Key 预算不足', 'key_budget_exhausted');
    const recent = state.requests.filter(row => row.projectId === project.id && row.modelId === model.id && Date.parse(row.createdAt) <= now && Date.parse(row.createdAt) > now - 60000 && row.httpStatus === 200);
    const rpm = effectiveLimit(state, project, model.id, 'rpm'), tpm = effectiveLimit(state, project, model.id, 'tpm');
    if (rpm && recent.length >= rpm || tpm && recent.reduce((sum, row) => sum + (row.usage.input || 0) + (row.usage.output || 0), (usage.input || 0) + (usage.output || 0)) > tpm) fail('达到项目模型 RPM / TPM 上限', 'rate_limit_exceeded');
    for (const rule of state.limits.filter(item => item.status === '已启用')) {
      const field = { tenant: 'tenantId', project: 'projectId', key: 'keyId', model: 'modelId' }[rule.scopeType];
      const object = { tenantId: project.tenantId, projectId: project.id, keyId: key.id, modelId: model.id };
      if (!field || object[field] !== rule.scopeId) continue;
      const rows = state.requests.filter(row => row[field] === rule.scopeId && row.httpStatus === 200 && Date.parse(row.createdAt) <= now && Date.parse(row.createdAt) > now - 60000);
      if (rule.rpm && rows.length >= rule.rpm || rule.tpm && rows.reduce((sum, row) => sum + (row.usage?.input || 0) + (row.usage?.output || 0), (usage.input || 0) + (usage.output || 0)) > rule.tpm) fail('达到上层限流规则：' + rule.name, 'rate_limit_exceeded');
    }
  } catch (caught) { error = caught; }
  const record = { id: uid('request'), requestId: values.requestId, tenantId: project.tenantId, projectId: project.id, userId: identity.userId, keyId: key?.id || null, modelId: values.modelId, supplyId: supply?.id || null, endpointId: supply?.endpointId || null, callModelId: supply?.callId || null, source: values.source || '模型体验', workspace: true, createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(), httpStatus: error ? requestErrorStatus(error.code) : 200, errorCode: error?.code || null, errorMessage: error?.message || null, usage: error ? {} : usage, customerCharge: error ? 0 : charge, priceSnapshot: error ? null : structuredClone(supply.price), ttftMs: error || !['text','multimodal'].includes(model?.type) ? null : 220, durationMs: error ? 0 : 680, attempts: error ? [] : [{ endpointId: supply.endpointId, durationMs: 680, error: null }], billing: key?.subscriptionId ? 'Token Plan' : '按量付费', subscriptionId: key?.subscriptionId || null, quotaDebit: !error && key?.subscriptionId ? usage.input + usage.output : 0, parameters: { temperature: Number(values.temperature ?? 0.7), topP: Number(values.topP ?? 0.8), maxOutput: Number(values.maxOutput || 1024), deepThinking: Boolean(values.deepThinking) }, attachmentCount: values.attachments?.length || 0, contextMessages: values.messages?.length || 0, stages: [{ name: '调用校验', result: error ? '拒绝' : '通过' }, { name: '上游尝试', result: error ? '未执行' : '成功' }], bodyRecorded: project.logBodies, ...(project.logBodies ? { requestBody: JSON.stringify({ prompt: values.prompt || '', systemPrompt: values.systemPrompt || '', messages: values.messages || [], attachments: (values.attachments || []).map(item => ({ name: item.name })) }), responseBody: error ? null : answer } : {}) };
  const changes = [add('requests', record)];
  if (key?.subscriptionId && !error) { const order = state.orders.find(item => item.id === key.subscriptionId); changes.push(update('orders', order.id, { used: (order.used || 0) + usage.input + usage.output })); }
  if (key && !error) changes.push(update('apiKeys', key.id, { lastUsedAt: record.createdAt }));
  return { type: 'batch', objectId: record.requestId, workspaceResult: error ? '失败' : '成功', label: error ? '体验请求被拒绝' : '模型体验', changes, workspaceActor: identity.userId, workspaceTenantId: identity.tenantId, workspaceProjectId: project.id, requestResult: { ...record, answer: error ? null : answer } };
}
export function visibleRequests(state, project, identity) {
  const role = projectRole(state, project, identity);
  if (!role) return [];
  return state.requests.filter(row => row.projectId === project.id && (role !== '成员' || row.userId === identity.userId));
}

export function requestErrorStatus(code) { return ['invalid_prompt', 'invalid_parameters', 'unsupported_task'].includes(code) ? 400 : code === 'rate_limit_exceeded' ? 429 : ['model_unavailable', 'price_unconfigured'].includes(code) ? 503 : 403; }
export function activeSubscription(state, project, id, modelId, now = Date.now()) {
  const order = state.orders.find(item => item.id === id && item.tenantId === project.tenantId);
  const product = state.products.find(item => item.id === order?.productId && productBillingType(item) === 'plan');
  if (!order || order.status !== '已开通' || order.startAt && Date.parse(order.startAt) > now || order.expiresAt && Date.parse(order.expiresAt) <= now || !product?.modelIds.includes(modelId)) fail('Token Plan 未生效、已到期或不包含所选模型', 'subscription_unavailable');
  if (!Number.isSafeInteger(order.entitlement) || order.entitlement < 0 || !Number.isSafeInteger(order.used ?? 0) || (order.used ?? 0) < 0) fail('Token Plan 额度信息不完整', 'subscription_unavailable');
  return order;
}
export function effectiveKeyModels(state, key) {
  const project = state.projects.find(item => item.id === key.projectId && item.status !== '已删除');
  return project ? projectModels(state, project).filter(model => key.managed || key.modelIds?.includes(model.id)) : [];
}
export function keyAvailability(state, key, now = Date.now()) {
  if (key.status !== '有效') return key.status;
  if (key.expiresAt && Date.parse(key.expiresAt) <= now) return '已过期';
  if (key.moneyBudget != null && currentSpend(state, key, now) >= key.moneyBudget) return '预算耗尽';
  const project = state.projects.find(item=>item.id===key.projectId);
  if (!project || project.status !== '正常') return '项目不可用';
  if (project.moneyBudget != null && project.overageAction === 'stop' && currentSpend(state,project,now)>=project.moneyBudget) return '项目预算耗尽';
  const models=effectiveKeyModels(state,key);
  if (!models.length) return '无可用模型';
  if (key.subscriptionId) { try { const order=activeSubscription(state,project,key.subscriptionId,models[0].id,now); if ((order.used || 0)>=order.entitlement) return '套餐额度耗尽'; } catch { return '套餐不可用'; } }
  return '可调用';
}
export const visibleCatalogue = (state, tenantId) => accountModels(state, tenantId).filter(model => model.visibility === '公开' && model.listingStatus === '已上架');

export const productBillingType = product => product?.billingType || (product?.billingMode === '按量付费' || product?.code?.startsWith('PAYG-') ? 'payg' : product?.code?.startsWith('TOKEN-') ? 'plan' : product?.code?.startsWith('CODING-') ? 'coding' : null);
