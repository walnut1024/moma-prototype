import { connectionKeys, connectionFingerprint, connectionCredentialsReady } from './connection-state.js';
import { channelFingerprint, channelInterfaceIssue } from './provider-channels.js';
import { supplierChannelAssociations } from './supplier-resources.js';
import { providerModelConnectivityTest } from './provider-management.js';

export const HEALTH_MAX_AGE = 24 * 60 * 60 * 1000;
export const healthFingerprint = (provider, association, key) => JSON.stringify([channelFingerprint(association), key?.id || '', key?.fingerprint || '', key?.version || '', key?.status || '', key?.revokedAt || '', provider.status]);
export function keyHealth(provider, association, key, now = Date.now()) {
  const endpoint = association.endpoint;
  const records = (endpoint.keyConnectivityTests || []).filter(row => row.associationId === association.id && row.keyId === (key?.id || ''));
  const record = records.slice().reverse().sort((a,b) => Date.parse(b.testedAt)-Date.parse(a.testedAt))[0];
  let label;
  if (provider.status !== '已启用') label = '服务商已停用';
  else if (key?.revokedAt) label = '密钥已撤销';
  else if (key?.status === 'disabled') label = '密钥已停用';
  else if (channelInterfaceIssue(provider, association)) label = '接口不匹配';
  else if (!connectionCredentialsReady(endpoint, provider)) label = '密钥待配置';
  else if (!record) label = '未检测';
  else if (record.fingerprint !== healthFingerprint(provider, association, key)) label = '待复测';
  else if (!Number.isFinite(Date.parse(record.testedAt)) || Date.parse(record.testedAt) > now || now - Date.parse(record.testedAt) >= HEALTH_MAX_AGE) label = '结果过期';
  else label = record.result === '通过' ? '正常' : '异常';
  return { label, record, good: label === '正常' };
}
export function channelModelHealth(provider, association, now = Date.now()) {
  if (!association) return { label: '未配置', good: false, rows: [] };
  const keys = connectionKeys(association.endpoint, provider);
  const rows = (keys.length ? keys : [null]).map(key => ({ key, ...keyHealth(provider, association, key, now) }));
  const passed = rows.filter(row => row.good).length;
  const label = passed === rows.length ? '正常' : passed ? rows.some(row => row.label === '异常') ? '部分异常' : '待补充检测' : rows.find(row => row.label === '异常')?.label || rows.find(row => row.label === '待复测' || row.label === '结果过期')?.label || rows[0].label;
  return { label, good: passed === rows.length, rows };
}
export function channelHealthTransaction(state, { data }) {
  const { providerId, endpointId, associationId, keyId = '', expectedFingerprint, confirmed, scenario = 'success' } = data;
  const provider = state.providers.find(row => row.id === providerId);
  const endpoint = state.endpoints.find(row => row.id === endpointId && row.providerId === providerId && !row.deletedAt);
  if (!provider || !endpoint || provider.status !== '已启用') throw new Error('服务商或渠道不可用，请重新核对');
  const association = supplierChannelAssociations(state, provider, endpointId).find(row => row.id === associationId);
  if (!association) throw new Error('渠道模型关联已变化');
  const key = connectionKeys(endpoint, provider, true).find(row => row.id === keyId);
  if (endpoint.authMode !== 'none' && (!key || key.revokedAt || key.status === 'disabled')) throw new Error('请选择此渠道绑定的可用 API 密钥');
  if (endpoint.authMode === 'none' && keyId) throw new Error('此渠道无需密钥');
  if (confirmed !== true || expectedFingerprint !== healthFingerprint(provider, association, key)) throw new Error('请重新核对当前配置后确认检测');
  if (channelInterfaceIssue(provider, association)) throw new Error('接口不匹配，请先修正渠道配置');
  // Test a group backup key without changing the active group or qualification.
  const testingState = structuredClone(state);
  const testingEndpoint = testingState.endpoints.find(row => row.id === endpointId);
  if (key && endpoint.authMode === 'group') Object.assign(testingEndpoint, { authMode: 'specific', apiKeyId: key.id });
  // shortcut: Browser prototype uses simulated diagnostics; replace this call when a backend probe is available.
  const result = providerModelConnectivityTest(testingState, { providerId, endpointId, keyId, modelId: association.modelId, upstreamId: association.upstreamModelId, prompt: '请只回复 OK。', scenario });
  const record = { id: crypto.randomUUID(), associationId, modelId: association.modelId, upstreamModelId: association.upstreamModelId, keyId, fingerprint: expectedFingerprint, connectionFingerprint: connectionFingerprint(endpoint), testedAt: new Date().toISOString(), result: result.result, status: result.status, durationMs: result.durationMs, message: result.message, hint: result.hint || '', source: 'mock', simulated: true };
  return { type: 'batch', objectId: endpoint.id, label: '渠道密钥连通检测', changes: [{ type: 'update', collection: 'endpoints', id: endpoint.id, changes: { keyConnectivityTests: [...(endpoint.keyConnectivityTests || []), record] } }] };
}
