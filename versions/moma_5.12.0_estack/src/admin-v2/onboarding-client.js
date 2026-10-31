import { prepareChannelAdapterOptions } from './channel-interface.js';
import { connectionKeys, connectionFingerprint } from './connection-state.js';
import { mockOnboardingApi } from './mock-onboarding-service.js';

// The approved deliverable is a browser-only prototype. No network transport is installed.
export const onboardingApi = (path, options = {}) => mockOnboardingApi(path, options);

export async function prepareServerChannel(provider, endpoint) {
  if (!endpoint.interfaceType) throw new Error('请先为此渠道选择明确的接口类型');
  const key = connectionKeys(endpoint, provider)[0];
  if (endpoint.authMode !== 'none' && !key && !endpoint.credentialRef) throw new Error('当前渠道缺少可用凭证引用');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(connectionFingerprint(endpoint) + endpoint.id));
  const suffix = Array.from(new Uint8Array(digest)).map(value => value.toString(16).padStart(2, '0')).join('').slice(0, 10);
  const request = { credential: key ? { id: key.id, version: key.version || key.fingerprint, status: key.revokedAt ? 'revoked' : key.status === 'disabled' ? 'disabled' : 'active', accountRpm: key.accountRpm ?? endpoint.capacity ?? null } : null, ...prepareChannelAdapterOptions(endpoint.adapterOptions), allowHttp: endpoint.allowHttp === true, providerId: provider.id, name: `${endpoint.name.slice(0, 45)} · ${suffix}`, displayName: endpoint.name, interfaceType: endpoint.interfaceType, baseUrl: endpoint.baseUrl, taskUrls: endpoint.taskUrls || {}, authMode: endpoint.authMode === 'none' ? 'none' : 'key', credentialId: key?.id || endpoint.credentialRef || null, timeoutMs: Number(endpoint.timeoutSeconds || 30) * 1000 };
  const signature = connectionFingerprint(endpoint);
  // Deduplicate by server configuration; the opaque operation id never includes a secret.
  const existing = await onboardingApi('/channels');
  const saved = existing.channels.find(row => row.clientChannelId === endpoint.id && row.clientSignature === signature);
  if (saved) return saved;
  return onboardingApi('/channels', { method: 'POST', body: { ...request, operationId: `channel-${Array.from(new Uint8Array(digest)).map(value => value.toString(16).padStart(2, '0')).join('')}`, clientChannelId: endpoint.id, clientSignature: signature } });
}
