import { workspaceStoragePrefix } from "./workspace-storage.mjs";
import { availableAuthSpaces, currentAuthUser } from './auth-state.mjs';

export const TENANT_USER_TYPE_KEY = workspaceStoragePrefix + 'tenant-user-type';
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
