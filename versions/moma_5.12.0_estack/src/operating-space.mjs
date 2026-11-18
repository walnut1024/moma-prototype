export const defaultSpacePolicy = { revision:0, personalEnabled:true, operatingMode:'factory', internalTenantId:'' };
export const internalSpace = (policy, tenant) => Boolean(tenant && tenant.type !== '个人' && tenant.id === policy?.internalTenantId);
export const allowsSpace = (policy, tenant) => policy?.operatingMode === 'internal' ? internalSpace(policy, tenant)
  : tenant?.type !== '个人' || policy?.personalEnabled !== false;
