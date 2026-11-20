export function tenantModelAllowed(tenant, grant, modelId) {
  if (Array.isArray(tenant?.modelRules)) return tenant.modelRules.some(rule => rule.modelId === modelId);
  return !Array.isArray(grant?.modelIds) || grant.status === '生效中' && grant.modelIds.includes(modelId);
}

export const tenantQuotaEnabled = (grant, internal = false) => Boolean(grant &&
  (grant.quotaEnabled === undefined ? grant.status === '生效中' && Number.isSafeInteger(grant.limit) : grant.quotaEnabled && !internal));

export function tenantQuotaError(grant, quantity, at, internal) {
  if (!tenantQuotaEnabled(grant,internal) || quantity <= 0) return '';
  if (grant.expiresAt && !(Date.parse(grant.expiresAt) > at)) return 'tenant_quota_expired';
  return quantity > grant.limit - grant.used ? 'enterprise_quota_exhausted' : '';
}
