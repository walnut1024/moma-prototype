import { connectionKeys } from './connection-state.js';

// Rotation targets current bindings; deletion and revocation retain their broader reference checks.
export function credentialRotationChannels(state, provider, keyId) {
  const selected = provider.apiKeys?.find(key => key.id === keyId) || state.endpoints.filter(endpoint => endpoint.providerId === provider.id).flatMap(endpoint => endpoint.apiKeys || []).find(key => key.id === keyId);
  const storedIds = new Set((provider.apiKeys || []).map(key => key.id));
  return state.endpoints.filter(endpoint => {
    if (endpoint.providerId !== provider.id || endpoint.deletedAt) return false;
    const keys = connectionKeys(endpoint, provider, true);
    return ['group', 'inherit'].includes(endpoint.authMode) ? keys[0]?.id === keyId : keys.some(key => key.id === keyId || !endpoint.authMode && !storedIds.has(key.id) && selected?.fingerprint && key.fingerprint === selected.fingerprint);
  });
}
