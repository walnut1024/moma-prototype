import { prepareChannelAdapterOptions } from './channel-interface.js';
import { connectionKeys, connectionFingerprint } from './connection-state.js';
import { mockOnboardingApi } from './mock-onboarding-service.js';

// The model admin installs D1 transport; unmigrated tenant demos retain their local simulator.
let transport = import.meta.hot?.data.transport || mockOnboardingApi;
if (import.meta.hot) import.meta.hot.dispose(data => { data.transport = transport; });
export function configureOnboardingTransport(value){transport=value || mockOnboardingApi;}
export const onboardingApi = (path, options = {}) => transport(path, options);

export async function prepareServerChannel(provider, endpoint, keyId) {
  if (endpoint.adapterDraft) throw new Error('请先为待适配连接配置可用适配器');
  if (!endpoint.interfaceType) throw new Error('请先为此连接选择明确的接口类型');
  const keys = connectionKeys(endpoint, provider), key = keyId ? keys.find(row => row.id === keyId) : keys[0];
  if (keyId && !key) throw new Error('所选测试密钥不属于当前可用密钥池');
  const signature = connectionFingerprint(endpoint) + (keyId && keyId !== keys[0]?.id ? JSON.stringify([key.id, key.version || key.fingerprint]) : '');
  if (endpoint.authMode !== 'none' && !key && !endpoint.credentialRef) throw new Error('当前连接缺少可用凭证引用');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(signature + endpoint.id));
  const suffix = Array.from(new Uint8Array(digest)).map(value => value.toString(16).padStart(2, '0')).join('').slice(0, 10);
  const request = { credential: key ? { id: key.id, version: key.version || key.fingerprint, accountRpm: key.accountRpm ?? endpoint.capacity ?? null } : null, ...prepareChannelAdapterOptions(endpoint.adapterOptions), allowHttp: endpoint.allowHttp === true, providerId: provider.id, name: `${endpoint.name.slice(0, 45)} · ${suffix}`, displayName: endpoint.name, interfaceType: endpoint.interfaceType, baseUrl: endpoint.baseUrl, taskUrls: endpoint.taskUrls || {}, authMode: endpoint.authMode === 'none' ? 'none' : 'key', credentialId: key?.id || endpoint.credentialRef || null, timeoutMs: Number(endpoint.timeoutSeconds || 30) * 1000 };
  if (endpoint.endpointPath) Object.assign(request, { endpointPath: endpoint.endpointPath, modelProtocol: endpoint.modelProtocol });
  if (endpoint.interfaceType === 'custom' && endpoint.customAdapter) request.customAdapter = endpoint.customAdapter;
  if (endpoint.requestRules) request.requestRules = endpoint.requestRules;
  // Deduplicate by server configuration; the opaque operation id never includes a secret.
  const existing = await onboardingApi('/channels');
  const saved = existing.channels.find(row => row.clientChannelId === endpoint.id && row.clientSignature === signature);
  if (saved) return saved;
  return onboardingApi('/channels', { method: 'POST', body: { ...request, operationId: `channel-${Array.from(new Uint8Array(digest)).map(value => value.toString(16).padStart(2, '0')).join('')}`, clientChannelId: endpoint.id, clientSignature: signature } });
}
