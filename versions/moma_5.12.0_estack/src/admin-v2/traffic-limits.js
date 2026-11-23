import { projectRole, tenantProjectAdmin } from '../project-access.mjs';
import { personalDefaultProject } from '../personal-project.mjs';
import { validTrafficLimit } from './traffic-rates.js';

export function accountTraffic(settings, accountId) {
  const rules = settings?.rules.filter(row => row.objectId === accountId) ?? [];
  return { limit: rules.find(row => row.scope === 'account') ?? null, exceptions: rules.filter(row => row.scope === 'policy') };
}

export function trafficAccounts(state) {
  const memberships = new Map();
  const attach = (userId, tenant) => {
    if (!memberships.has(userId)) memberships.set(userId, new Set());
    memberships.get(userId).add(tenant);
  };
  const tenants = new Map(state.tenants.map(tenant => [tenant.id, tenant]));
  for (const tenant of tenants.values()) {
    if (tenant.ownerId) attach(tenant.ownerId, tenant);
  }
  for (const member of state.memberships) {
    const tenant = tenants.get(member.tenantId);
    if (tenant && member.status === '正常') attach(member.userId, tenant);
  }
  return state.users.map(user => ({ ...user, tenants: [...(memberships.get(user.id) || [])] }));
}

export function trafficProjects(state, user) {
  return user.tenants.flatMap(tenant => {
    if (tenant.type === '个人') {
      return [personalDefaultProject(state, tenant.id)];
    }
    const member = state.memberships.find(row => row.status === '正常' && row.tenantId === tenant.id && row.userId === user.id);
    return state.projects.filter(project => project.tenantId === tenant.id && project.status !== '已删除' &&
      (tenant.ownerId === user.id || tenantProjectAdmin(member) || projectRole(project, member)));
  });
}

export function modelTraffic(settings, modelId) {
  const override = settings?.rules.find(row => row.scope === 'model' && row.objectId === modelId);
  return { limit: override ?? settings?.modelDefault, custom: Boolean(override) };
}

export function effectiveTraffic(settings, policy, modelId) {
  const hit = [
    { id: 'exception', name: '一客一策', limit: policy.exceptions.find(row => row.modelId === modelId) },
    { id: 'account', name: '账号自定义', limit: policy.limit },
    { id: 'global', name: '全局默认', limit: settings?.global },
  ].find(row => validTrafficLimit(row.limit));
  const model = modelId ? modelTraffic(settings, modelId) : null;
  const accountLimit = hit?.limit;
  const modelLimit = model?.limit;
  const finalLimit = !modelId ? accountLimit : accountLimit && modelLimit ? {
    rpm: Math.min(accountLimit.rpm, modelLimit.rpm),
    tpm: Math.min(accountLimit.tpm, modelLimit.tpm),
  } : undefined;
  return { hit, model, finalLimit };
}
