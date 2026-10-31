import { connectionKeys } from './connection-state.js';

// Rotation targets current bindings; deletion and revocation retain their broader reference checks.
export function credentialRotationChannels(state, provider, keyId) {
  const selected = provider.apiKeys?.find(key => key.id === keyId) || state.endpoints.filter(endpoint => endpoint.providerId === provider.id).flatMap(endpoint => endpoint.apiKeys || []).find(key => key.id === keyId);
  return state.endpoints.filter(endpoint => {
    if (endpoint.providerId !== provider.id || endpoint.deletedAt) return false;
    const keys = connectionKeys(endpoint, provider, true);
    return ['group', 'inherit'].includes(endpoint.authMode) ? keys[0]?.id === keyId : keys.some(key => key.id === keyId || !endpoint.authMode && selected?.fingerprint && key.fingerprint === selected.fingerprint);
  });
}
export function credentialRotationScope(state, provider, keyId) {
  const channels = credentialRotationChannels(state, provider, keyId);
  return { channels, specific: channels.filter(endpoint => endpoint.authMode === 'specific'), shared: channels.filter(endpoint => ['group', 'inherit'].includes(endpoint.authMode)) };
}

export function credentialRotationOpening(state, provider, keyId) {
  const { channels, specific, shared } = credentialRotationScope(state, provider, keyId);
  return { channelIds: channels.map(row => row.id), specificIds: specific.map(row => row.id), sharedIds: shared.map(row => row.id), route: specific.length ? shared.length ? 'choose' : 'specific' : shared.length ? 'group' : 'plain' };
}
