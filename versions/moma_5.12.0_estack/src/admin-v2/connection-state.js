import { providerKeyGroupKeys } from './provider-key-groups.js';

// Shared gate for supplier configuration, model verification and routing candidates.
export const connectionFingerprint = endpoint => JSON.stringify([endpoint.baseUrl, endpoint.protocol, endpoint.credentialRef, endpoint.capacity, endpoint.timeoutSeconds, ...(endpoint.apiKeys?.length ? [endpoint.apiKeys.map(key => key.fingerprint)] : []), ...(endpoint.authMode ? [endpoint.authMode, endpoint.apiKeyId, endpoint.credentialVersion] : []), ...(endpoint.authMode === 'group' ? [endpoint.keyGroupId] : []), ...(['interfaceType', 'addressMode', 'taskUrls'].some(key => Object.hasOwn(endpoint, key)) ? [endpoint.interfaceType, endpoint.addressMode, Object.entries(endpoint.taskUrls || {}).sort(([left], [right]) => left.localeCompare(right))] : []), ...(Object.keys(endpoint.adapterOptions || {}).length ? [Object.entries(endpoint.adapterOptions).sort(([left], [right]) => left.localeCompare(right))] : [])]);
export function connectionKeys(endpoint, provider, includeDisabled = false) {
  if (!endpoint) return [];
  if (endpoint.authMode === 'group') {
    const keys = providerKeyGroupKeys(provider || {}, endpoint.keyGroupId, true);
    return includeDisabled ? keys : keys[0] && keys[0].status !== 'disabled' && !keys[0].revokedAt ? [keys[0]] : [];
  }
  const id = endpoint.authMode === 'inherit' ? provider?.defaultApiKeyId : endpoint.apiKeyId;
  const keys = endpoint.authMode ? endpoint.authMode === 'none' ? [] : (provider?.apiKeys || []).filter(key => key.id === id) : (endpoint.apiKeys || []).map(key => provider?.apiKeys?.find(current => current.id === key.id) || key);
  return includeDisabled ? keys : keys.filter(key => key.status !== 'disabled' && !key.revokedAt);
}
export function connectionCredentialsReady(endpoint, provider) {
  if (!endpoint) return false;
  if (!endpoint.authMode && connectionKeys(endpoint, provider, true).some(key => key.revokedAt) && !connectionKeys(endpoint, provider).length) return false;
  return Boolean(endpoint.authMode ? endpoint.authMode === 'none' || connectionKeys(endpoint, provider).length : provider?.sourceType === 'selfHosted' || endpoint.credentialRef || connectionKeys(endpoint, provider).length);
}
export const connectionTestCurrent = endpoint => Boolean(endpoint && endpoint.connectionTest?.fingerprint === connectionFingerprint(endpoint));
export const connectionTestPassed = endpoint => connectionTestCurrent(endpoint) && endpoint.connectionTest.result === '通过';
export const connectionTestPending = endpoint => endpoint?.serverTestJobs?.some(job => !job.receivedAt && job.signature === connectionFingerprint(endpoint));
export function connectionQualification(endpoint) {
  const qualification = endpoint?.connectionQualification;
  if (qualification?.result === '通过' && qualification.fingerprint === connectionFingerprint(endpoint)) return qualification;
  return ['运行中', '需关注'].includes(endpoint?.status) && connectionTestPassed(endpoint) ? endpoint.connectionTest : null;
}
export const connectionQualified = endpoint => Boolean(connectionQualification(endpoint));
export function connectionBlockReason(endpoint, provider) {
  if (provider?.status !== '已启用') return '先启用供应商';
  if (!connectionCredentialsReady(endpoint, provider)) return 'API 凭证待配置或已撤销';
  if (!connectionQualified(endpoint)) return '先通过当前配置的连接测试';
  if (!['运行中', '需关注'].includes(endpoint?.status)) return '先启用接入';
  return '';
}
