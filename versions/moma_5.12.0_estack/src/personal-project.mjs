export function personalDefaultProject(state, tenantId) {
  const tenant = state.tenants.find(row => row.id === tenantId);
  if (tenant?.type !== '个人') return null;
  const projects = state.projects.filter(row => row.tenantId === tenantId && row.status !== '已删除');
  if (projects.length !== 1 || tenant.defaultProjectId && projects[0].id !== tenant.defaultProjectId) {
    throw Error('个人空间须有且仅有一个默认项目，请联系管理员核对项目记录');
  }
  if (projects[0].ownerId !== tenant.ownerId || projects[0].organizationId) throw Error('个人默认项目归属异常，请联系管理员核对项目记录');
  return projects[0];
}

export function customerProject(state, project) {
  if (!project || state.tenants.find(row => row.id === project.tenantId)?.type !== '个人') return project;
  const current = personalDefaultProject(state, project.tenantId);
  return current.id === project.id ? { ...project, name:'默认项目', inheritsSpaceModels:true, status:state.tenants.find(row => row.id === project.tenantId).status === '停用' ? '停用' : project.status } : undefined;
}

export function assertPersonalProjects(before, after) {
  for (const tenant of before.tenants.filter(row => row.type === '个人')) {
    if (after.tenants.find(row => row.id === tenant.id)?.type !== '个人') throw Error('个人客户类型不可变更');
  }
  for (const tenant of after.tenants.filter(row => row.type === '个人')) {
    const oldTenant = before.tenants.find(row => row.id === tenant.id);
    const beforeProjects = before.projects.filter(row => row.tenantId === tenant.id);
    const afterProjects = after.projects.filter(row => row.tenantId === tenant.id);
    if (oldTenant && oldTenant.defaultProjectId === tenant.defaultProjectId && oldTenant.ownerId === tenant.ownerId &&
        JSON.stringify(beforeProjects) === JSON.stringify(afterProjects)) continue;
    if (oldTenant && afterProjects.some(row => !beforeProjects.some(previous => previous.id === row.id))) throw Error('个人空间固定使用默认项目');
    const project = personalDefaultProject(after, tenant.id);
    const previous = before.tenants.some(row => row.id === tenant.id) && personalDefaultProject(before, tenant.id);
    if (project.ownerId !== tenant.ownerId || project.organizationId) throw Error('个人默认项目须归属本人且不关联企业部门');
    if (previous ? project.name !== previous.name || project.id !== previous.id : project.name !== '默认项目') throw Error('个人默认项目不可替换或重命名');
    if (previous && project.status !== previous.status) throw Error('个人默认项目状态随客户管理');
  }
}
