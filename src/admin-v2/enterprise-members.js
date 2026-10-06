import { departmentPath, descendantIds } from '../organization-data.mjs';
import { isEnterpriseAdmin } from './enterprise.js';

export function enterpriseProjectDepartment(state, project) {
  if (!project.organizationId) return '未登记部门归属';
  const organizations = state.organizations.filter(org => org.tenantId === project.tenantId);
  const seen = new Set();
  let id = project.organizationId;
  while (id != null) {
    const organization = organizations.find(org => org.id === id);
    if (!organization?.name || seen.has(id)) return '部门归属异常';
    seen.add(id);
    id = organization.parentId;
  }
  return departmentPath(organizations, project.organizationId);
}

// The frontend's standalone demo is not the enterprise account's data source.
export function enterpriseMemberView(state, tenant, filters = {}) {
  const { selection = 'all', includeChildren = true, query = '', role = 'all', status = 'all' } = filters;
  const organizations = state.organizations.filter(org => org.tenantId === tenant.id);
  const members = state.memberships.filter(member => member.tenantId === tenant.id);
  const organizationFor = member => organizations.find(org => org.id === member.organizationId);
  const userFor = member => state.users.find(user => user.id === member.userId);
  const organization = organizations.find(org => org.id === selection);
  const ids = organization ? includeChildren ? descendantIds(organizations, selection) : new Set([selection]) : new Set();
  const scoped = members.filter(member => selection === 'all' ||
    (selection === 'admins' && isEnterpriseAdmin(member, tenant)) ||
    (selection === 'unassigned' && !organizationFor(member)) || ids.has(member.organizationId));
  const search = query.trim().toLowerCase();
  const filtered = scoped.filter(member => (role === 'all' || member.role === role) &&
    (status === 'all' || member.status === status) &&
    `${userFor(member)?.name || member.name} ${userFor(member)?.login || ''} ${member.userId} ${member.role}`.toLowerCase().includes(search));
  return { organizations, members, organization, scoped, filtered, organizationFor, userFor };
}
