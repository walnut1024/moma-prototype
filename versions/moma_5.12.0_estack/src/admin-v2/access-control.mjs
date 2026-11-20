import { projectRole } from '../project-access.mjs';

export function adminProjectHref(filters = {}) {
  const params = new URLSearchParams(filters);
  return '#/admin-2/projects' + (params.size ? '?' + params : '');
}

export function tenantHref(tenant, patch = {}, filters) {
  const params = new URLSearchParams(filters);
  ['enterprise','personal','user','tab','project','create','organizationView'].forEach(key => params.delete(key));
  params.set(tenant.type === '个人' ? 'personal' : 'enterprise', tenant.type === '个人' ? tenant.ownerId : tenant.id);
  for (const [key, value] of Object.entries(patch)) params.set(key, value);
  return '#/admin-2/tenants?' + params;
}

export function userAffiliations(state, userId) {
  const memberships = state.memberships.filter(member => member.userId === userId);
  return state.tenants.flatMap(tenant => {
    const member = memberships.find(row => row.tenantId === tenant.id);
    const personal = tenant.type === '个人' && tenant.ownerId === userId;
    if (!member && !personal) return [];
    const admin = ['企业管理员', '租户管理员'].includes(member?.role);
    return [{ tenant, member, role:personal ? '本人' : member.role, status:personal ? tenant.status : member.status,
      projects:state.projects.filter(project => project.tenantId === tenant.id && project.status !== '已删除').flatMap(project => {
        const role = personal || admin ? '项目管理员' : projectRole(project, member);
        return role ? [{ project, role }] : [];
      }) }];
  });
}
