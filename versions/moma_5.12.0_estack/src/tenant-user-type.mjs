import { availableAuthSpaces, currentAuthUser } from './auth-state.mjs';

export const TENANT_USER_TYPE_KEY = 'moma-tenant-user-type-5120-v1';
export function tenantUserAccess(state, previewType) {
  if (!currentAuthUser(state)) {
    const userType = previewType === 'personal' ? 'personal' : 'enterprise';
    return { userType, canViewOrganization: userType === 'enterprise' };
  }
  const spaces = availableAuthSpaces(state);
  const currentSpace = spaces.find(space => space.id === state.activeSpace);
  return {
    userType: currentSpace?.id === 'personal' || !spaces.some(space => space.id !== 'personal') ? 'personal' : 'enterprise',
    canViewOrganization: Boolean(currentSpace && currentSpace.id !== 'personal'),
  };
}
