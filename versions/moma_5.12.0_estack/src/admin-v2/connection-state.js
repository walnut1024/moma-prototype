import { providerKeyGroupKeys } from './provider-key-groups.js';

export function normalizeChannelKeyPool(input, provider, ownedKeys = []) {
  if (!Array.isArray(input) || !input.length || input.length > 20) throw new Error('密钥池须配置 1–20 条密钥');
  const keys = [...ownedKeys.filter(key => key.scope === 'channel'), ...(provider.apiKeys || [])];
  const ids = new Set();
  const rows = input.map(row => {
    if (!row || typeof row !== 'object' || Object.keys(row).some(key => !['keyId', 'priority', 'enabled'].includes(key))) throw new Error('密钥池包含无效字段');
    const key = keys.find(key => key.id === row.keyId);
    if (!key || key.revokedAt || ids.has(row.keyId)) throw new Error('密钥须属于当前连接或服务商、未撤销且不重复');
    if (!Number.isSafeInteger(row.priority) || row.priority < 1 || row.priority > 100 || typeof row.enabled !== 'boolean') throw new Error('优先级须为 1–100 的整数，并明确启用状态');
    if (row.enabled && key.status === 'disabled') throw new Error('请先启用所选 API 密钥');
    ids.add(row.keyId);
    return { keyId: row.keyId, priority: row.priority, enabled: row.enabled };
  });
  if (!rows.some(row => row.enabled)) throw new Error('密钥池至少启用一条密钥');
  return rows;
}

// Shared gate for supplier configuration, model verification and routing candidates.
export const connectionFingerprint = endpoint => JSON.stringify([endpoint.baseUrl, endpoint.protocol, endpoint.credentialRef, endpoint.capacity, endpoint.timeoutSeconds, ...(endpoint.apiKeys?.length ? [endpoint.apiKeys.map(key => key.fingerprint)] : []), ...(endpoint.authMode ? [endpoint.authMode, endpoint.apiKeyId, endpoint.credentialVersion] : []), ...(endpoint.authMode === 'group' ? [endpoint.keyGroupId] : []), ...(endpoint.authMode === 'pool' ? [endpoint.keyPool, ...(endpoint.keyStrategy ? [endpoint.keyStrategy] : [])] : []), ...(['interfaceType', 'addressMode', 'taskUrls'].some(key => Object.hasOwn(endpoint, key)) ? [endpoint.interfaceType, endpoint.addressMode, Object.entries(endpoint.taskUrls || {}).sort(([left], [right]) => left.localeCompare(right))] : []), ...(Object.keys(endpoint.adapterOptions || {}).length ? [Object.entries(endpoint.adapterOptions).sort(([left], [right]) => left.localeCompare(right))] : []), ...(endpoint.requestRules ? [endpoint.requestRules] : []), ...(endpoint.networkSettings ? [endpoint.networkSettings] : []), ...(endpoint.customAdapter ? [endpoint.customAdapter] : []), ...(endpoint.endpointPath ? [endpoint.endpointPath, endpoint.modelProtocol] : []), ...(endpoint.poolPaused ? ['pool-paused'] : [])]);
export function connectionKeys(endpoint, provider, includeDisabled = false) {
  if (!endpoint || endpoint.authMode === 'pending') return [];
  if (endpoint.authMode === 'pool') {
    if (endpoint.poolPaused && !includeDisabled) return [];
    const keys = [...(endpoint.apiKeys || []).filter(key => key.scope === 'channel'), ...(provider?.apiKeys || [])];
    return (endpoint.keyPool || []).filter(row => includeDisabled || row.enabled).slice().sort((left, right) => left.priority - right.priority).map(row => keys.find(key => key.id === row.keyId)).filter(key => key && (includeDisabled || key.status !== 'disabled' && !key.revokedAt));
  }
  if (endpoint.authMode === 'group') {
    const keys = providerKeyGroupKeys(provider || {}, endpoint.keyGroupId, true);
    return includeDisabled ? keys : keys[0] && keys[0].status !== 'disabled' && !keys[0].revokedAt ? [keys[0]] : [];
  }
  const id = endpoint.authMode === 'inherit' ? provider?.defaultApiKeyId : endpoint.apiKeyId;
  const keys = endpoint.authMode ? endpoint.authMode === 'none' ? [] : [...(endpoint.authMode === 'specific' ? endpoint.apiKeys || [] : []), ...(provider?.apiKeys || [])].filter(key => key.id === id).slice(0, 1) : (endpoint.apiKeys || []).map(key => provider?.apiKeys?.find(current => current.id === key.id) || key);
  return includeDisabled ? keys : keys.filter(key => key.status !== 'disabled' && !key.revokedAt);
}
export function connectionTestKey(endpoint, provider, random = Math.random) {
  if (endpoint?.authMode !== 'pool') return undefined;
  const keys = connectionKeys(endpoint, provider);
  if (!keys.length) return undefined;
  if (endpoint.keyStrategy === 'random') return keys[Math.floor(random() * keys.length)].id;
  if (endpoint.keyStrategy === 'roundRobin') {
    const count = (endpoint.serverTestJobs || []).filter(job => job.batchId && job.signature === connectionFingerprint(endpoint)).length;
    return keys[count % keys.length].id;
  }
  return keys[0].id;
}
export function connectionCredentialsReady(endpoint, provider) {
  if (!endpoint) return false;
  if (!endpoint.authMode && connectionKeys(endpoint, provider, true).some(key => key.revokedAt) && !connectionKeys(endpoint, provider).length) return false;
  return Boolean(endpoint.authMode ? endpoint.authMode === 'none' || connectionKeys(endpoint, provider).length : provider?.sourceType === 'selfHosted' || endpoint.credentialRef || connectionKeys(endpoint, provider).length);
}
export const connectionTestCurrent = endpoint => Boolean(endpoint && endpoint.connectionTest?.fingerprint === connectionFingerprint(endpoint));
export const connectionTestPassed = endpoint => connectionTestCurrent(endpoint) && endpoint.connectionTest.result === '通过';
export const connectionActive = endpoint => ['运行中', '需关注'].includes(endpoint?.status);
export const connectionRecoveryRequired = endpoint => !connectionActive(endpoint) &&
  Boolean(endpoint?.activationSource || endpoint?.status === '自动停用');

export function connectionTestPatch(endpoint, connectionTest, startedAt = connectionTest.testedAt) {
  const qualification = connectionQualification(endpoint);
  const patch = { ...(qualification ? { connectionQualification: structuredClone(qualification) } : {}), connectionTest };
  if (connectionTest.result !== '通过') return connectionActive(endpoint) ? { ...patch, status: '需关注' } : patch;
  if (endpoint.frozen || endpoint.poolPaused || endpoint.candidateConfiguration) return patch;
  const held = connectionRecoveryRequired(endpoint);
  // A test already in flight when the restriction was applied cannot clear it.
  if (held && !(Date.parse(startedAt) > Date.parse(endpoint.activationChangedAt))) return patch;
  return { ...patch, status: connectionActive(endpoint) ? endpoint.status : '运行中',
    connectionQualification: structuredClone(held ? connectionTest : qualification || connectionTest),
    ...(held ? { activationSource: null, activationReason: null, directoryStopEvidence: null } : {}) };
}
export const connectionTestPending = endpoint => endpoint?.serverTestJobs?.some(job => !job.receivedAt && job.signature === connectionFingerprint(endpoint));
export function connectionQualification(endpoint) {
  const qualification = endpoint?.connectionQualification;
  if (qualification?.result === '通过' && qualification.fingerprint === connectionFingerprint(endpoint)) return qualification;
  return connectionActive(endpoint) && connectionTestPassed(endpoint) ? endpoint.connectionTest : null;
}
export const connectionQualified = endpoint => Boolean(connectionQualification(endpoint));
export function connectionBlockReason(endpoint, provider) {
  if (provider?.status !== '已启用') return '先启用服务商';
  if (endpoint?.frozen) return '连接已冻结';
  if (!connectionCredentialsReady(endpoint, provider)) return '上游 API 密钥待配置或已撤销';
  if (!connectionQualified(endpoint)) return '先通过当前配置的连接测试';
  if (!connectionActive(endpoint)) return '请重新通过当前配置的连接测试';
  return '';
}
