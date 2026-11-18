import { activeProjectMembers, projectAccess, projectRole, requireProject, PROJECT_ADMIN, PROJECT_MEMBER } from './project-access.mjs';
import { parseBudgetAmount } from './project-call.mjs';

function projectDetails(state, identity, { name, description, departmentId }) {
  name = String(name || '').trim();
  description = String(description || '').trim();
  if (!name || name.length > 60 || description.length > 200) throw Error('请填写项目名称（最多 60 字）及 200 字以内的描述');
  const department = departmentId && state.organizations.find(row => row.tenantId === identity.tenantId &&
    (row.id === departmentId || departmentId === 'root' && !row.parentId) && row.status !== '停用');
  if (departmentId && (identity.spaceId === 'personal' || !department)) throw Error('请选择当前企业的有效部门');
  return { name, description, organizationId: department?.id ?? null };
}

export function newProject({ state, identity, link }, input, id, at = new Date().toISOString()) {
  if (identity.spaceId === 'personal') throw Error('个人空间固定使用默认项目');
  if (!projectAccess(state, identity, link).canCreate) throw Error('当前身份无权创建项目');
  return {
    id: id, tenantId: identity.tenantId, ownerId: link.backendUserId,
    ...projectDetails(state, identity, input), status: '正常', createdAt: at, updatedAt: at,
    modelPermissions: [], retainContent: false,
    ...(link.backendMembershipId ? { memberRoles: { [link.backendMembershipId]: PROJECT_ADMIN } } : {}),
  };
}

export function changeProject({ state, identity, link }, projectId, action, input, services) {
  const project = projectAccess(state, identity, link).projects.find(row => row.id === projectId);
  if (!project || project.status === '已删除' || action !== 'exit' && !project.canManage) throw Error('无权操作该项目');
  const personal = identity.spaceId === 'personal';
  if (personal && ['status', 'members', 'exit'].includes(action)) throw Error('个人默认项目状态随客户管理');
  if (personal && action === 'settings' && input.name !== '默认项目') throw Error('个人默认项目不可重命名');
  const changes = {};
  let label, objectId;
  if (action === 'settings') {
    Object.assign(changes, projectDetails(state, identity, input));
    if (personal) changes.name = state.projects.find(row => row.id === projectId).name;
    const amountMicros = parseBudgetAmount(input.amount);
    const warnAt = Number(input.warnAt);
    if (amountMicros && (!Number.isInteger(warnAt) || warnAt < 1 || warnAt > 100)) throw Error('预警阈值须为 1 至 100 的整数');
    changes.spendBudget = amountMicros ? { amountMicros, warnAt, stop: input.stop === true } : null;
    changes.retainContent = input.retainContent === true;
    label = '保存项目设置';
  } else if (action === 'models') {
    requireProject([project], projectId, true);
    const allowed = new Set(services.map(row => row.modelKey));
    const seen = new Set();
    if (!Array.isArray(input) || input.length > 500) throw Error('项目模型配置无效');
    changes.modelPermissions = input.map(({ modelId, rpm, tpm }) => {
      const model = state.models.find(row => row.id === modelId);
      const previous = project.modelPermissions?.find(row => row.modelId === modelId);
      if ((!allowed.has(modelId) && (!previous || previous.rpm !== rpm || previous.tpm !== tpm)) || seen.has(modelId)) throw Error('模型重复或当前空间无权开通该模型');
      if ([rpm, tpm].some(limit => limit !== null && (!Number.isSafeInteger(limit) || limit < 1))) throw Error('RPM 和 TPM 须为正整数');
      if (model && tpm !== null && !['text', 'multimodal', 'embedding', 'rerank'].includes(model?.type)) throw Error('该模型没有 Token 计量，不能设置 TPM');
      seen.add(modelId);
      return { modelId, rpm, tpm };
    });
    label = '维护项目模型权限及限流';
  } else if (action === 'members' || action === 'exit') {
    if (identity.spaceId === 'personal') throw Error('个人项目由本人管理');
    const members = activeProjectMembers(state, identity.tenantId);
    const member = members.find(row => row.id === (action === 'exit' ? link.backendMembershipId : input.memberId));
    if (!member) throw Error('请从当前企业的有效成员中选择');
    const oldRole = projectRole(project, member);
    const role = action === 'exit' ? null : input.role;
    if (action === 'exit' && !oldRole) throw Error('当前身份没有可退出的项目成员关系');
    if (role !== null && ![PROJECT_ADMIN, PROJECT_MEMBER].includes(role)) throw Error('项目角色无效');
    const entries = project.memberRoles ? Object.entries(project.memberRoles) : state.memberships
      .filter(row => row.tenantId === project.tenantId)
      .map(row => [row.id, projectRole(project, { ...row, status: '正常' })])
      .filter(([, value]) => value);
    const roles = new Map(entries);
    if (role) roles.set(member.id, role); else roles.delete(member.id);
    const administrator = members.find(row => roles.get(row.id) === PROJECT_ADMIN);
    if (oldRole === PROJECT_ADMIN && !administrator) throw Error('请先指定另一位有效的项目管理员');
    if (oldRole === PROJECT_ADMIN && role !== PROJECT_ADMIN && member.userId === project.ownerId) changes.ownerId = administrator.userId;
    changes.memberRoles = Object.fromEntries(roles);
    label = action === 'exit' ? '退出项目' : role ? oldRole ? '调整项目成员角色' : '添加项目成员' : '移除项目成员';
    objectId = member.id;
  } else if (action === 'status') {
    if (!['正常', '停用', '已删除'].includes(input.status) || input.status === project.status) throw Error('项目状态无效');
    changes.status = input.status;
    label = { 正常: '启用项目', 停用: '停用项目', 已删除: '删除项目' }[input.status];
  } else {
    throw Error('不支持的项目操作');
  }
  const at = new Date().toISOString();
  const updated = state.projects.map(row => row.id === projectId ? { ...row, ...changes, updatedAt: at } : row);
  return { projects:updated, audit:{ projectId, action:label, objectId:objectId || projectId } };
}
