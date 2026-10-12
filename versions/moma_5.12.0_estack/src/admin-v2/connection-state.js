// Shared gate for supplier configuration, model verification and routing candidates.
export const connectionFingerprint = endpoint => JSON.stringify([endpoint.baseUrl, endpoint.protocol, endpoint.credentialRef, endpoint.capacity, endpoint.timeoutSeconds]);
export const connectionTestCurrent = endpoint => Boolean(endpoint && endpoint.connectionTest?.fingerprint === connectionFingerprint(endpoint));
export const connectionTestPassed = endpoint => connectionTestCurrent(endpoint) && endpoint.connectionTest.result === '通过';
export function connectionBlockReason(endpoint, provider) {
  if (provider?.status !== '已启用') return '先启用供应商';
  if (!connectionTestPassed(endpoint)) return '先通过当前配置的连接测试';
  if (!['运行中', '需关注'].includes(endpoint?.status)) return '先启用接入';
  return '';
}
