import { customerProject, personalDefaultProject } from './personal-project.mjs';
export const PROJECT_ADMIN = '项目管理员';
export const PROJECT_MEMBER = '项目成员';
export const projectRoleLabel = role => role === PROJECT_MEMBER ? '普通成员' : role;
export const tenantProjectAdmin = member => ['租户管理员', '企业管理员'].includes(member?.role);

export function activeProjectMembers(state, tenantId) {
  const users = new Map(state.users.filter(row => row.status === '正常').map(row => [row.id, row]));
  return state.memberships.filter(row => row.tenantId === tenantId && row.status === '正常' && users.has(row.userId))
    .map(row => ({ ...row, name: row.memberName || users.get(row.userId).name }));
}

export function assertProjectAdministratorsPreserved(state, next, tenantId) {
  const before = activeProjectMembers(state, tenantId);
  const after = activeProjectMembers(next, tenantId);
  for (const project of state.projects.filter(row => row.tenantId === tenantId && row.status !== '已删除')) {
    if (before.some(member => projectRole(project, member) === PROJECT_ADMIN) &&
        !after.some(member => projectRole(project, member) === PROJECT_ADMIN)) {
      throw Error('请先为「' + project.name + '」指定另一位项目管理员');
    }
  }
}

export function assertProjectDepartmentsPreserved(state, next, tenantId) {
  const departments = new Set(next.organizations.filter(row => row.tenantId === tenantId).map(row => row.id));
  const removed = new Set(state.organizations.filter(row => row.tenantId === tenantId && !departments.has(row.id)).map(row => row.id));
  const project = state.projects.find(row => row.tenantId === tenantId && row.status !== '已删除' && removed.has(row.organizationId));
  if (project) throw Error('请先调整「' + project.name + '」的所属部门');
}

export function projectRole(project, member) {
  if (!member || member.status !== '正常' || member.tenantId !== project.tenantId) return null;
  if (project.memberRoles) {
    const role=Object.hasOwn(project.memberRoles, member.id) ? project.memberRoles[member.id] : null;
    return [PROJECT_ADMIN,PROJECT_MEMBER].includes(role) ? role : null;
  }
  if (project.ownerId === member.userId) return PROJECT_ADMIN;
  return member.projectIds?.includes(project.id) ? PROJECT_MEMBER : null;
}

export function projectAccess(state, identity, link) {
  const member = state.memberships.find(row => row.id === link.backendMembershipId);
  const personal = identity.spaceId === 'personal';
  const defaultProject = personal ? personalDefaultProject(state, identity.tenantId) : null;
  const managesSpace = link.systemAdministrator === true || identity.spaceId === 'personal' || tenantProjectAdmin(member);
  const projects = state.projects.flatMap(project => {
    if (project.tenantId !== identity.tenantId || personal && project.id !== defaultProject.id) return [];
    const role = projectRole(project, member);
    if (!managesSpace && !role) return [];
    const canManage = managesSpace || role === PROJECT_ADMIN;
    return [{ ...customerProject(state, project), role: canManage ? PROJECT_ADMIN : PROJECT_MEMBER, canManage,
      canEdit: project.status === '正常' && canManage }];
  });
  return {
    managesSpace,
    canCreate: !personal && managesSpace,
    projects,
  };
}

export function requireProject(projects, projectId, write = false) {
  if (!projectId) throw Error('请先选择项目');
  const project = projects.find(row => row.id === projectId);
  if (!project) throw Error('无权访问该项目');
  if (project.status !== '正常') throw Error('该项目当前不可用');
  if (write && !project.canEdit) throw Error('只有项目管理员可以修改项目配置');
  return project;
}

export const experienceKeyId = projectId => 'experience:' + projectId;

export const projectModelEnabled = (project, modelId) =>
  project.inheritsSpaceModels === true || project.modelPermissions == null || project.modelPermissions.some(row => row.modelId === modelId);
