import { customerProject, personalDefaultProject } from './personal-project.mjs';
export const PROJECT_ADMIN = '项目管理员';
export const PROJECT_MEMBER = '项目成员';

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
  const managesSpace = identity.spaceId === 'personal' || ['租户管理员', '企业管理员'].includes(member?.role);
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
    canCreate: !personal && (managesSpace || member?.canCreateProjects === true),
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
