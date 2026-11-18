import { latestRequests } from '../request-identity.mjs';

export const unassignedProject = '__uncollected__';

export function analysisProjects(state, tenantId = '') {
  const projects = new Map();
  for (const project of state.projects || []) {
    if (!tenantId || project.tenantId === tenantId) projects.set(project.id, project);
  }
  for (const row of latestRequests(state.requests)) {
    if (tenantId && row.tenantId !== tenantId) continue;
    const id = row.projectId || unassignedProject;
    if (!projects.has(id)) projects.set(id, {
      id, name: row.projectName || row.projectId || '未记录项目',
      tenantId: row.projectId ? row.tenantId : null,
    });
  }
  return [...projects.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN') || a.id.localeCompare(b.id));
}
