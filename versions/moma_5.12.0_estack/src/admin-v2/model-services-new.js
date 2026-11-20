import { workspaceStoragePrefix } from '../workspace-storage.mjs';

const storageKey = workspaceStoragePrefix + 'model-services-new:v1';
export const serviceLevels = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5'];
export const serviceMetrics = type => ['text', 'multimodal', 'embedding', 'rerank'].includes(type)
  ? ['rpm', 'tpm'] : ['rpm'];

export function readNewServices(storage) {
  const rows = JSON.parse(storage.getItem(storageKey) ?? '[]');
  if (!Array.isArray(rows) || rows.some(row => !row?.id || !Array.isArray(row.channels) || !Array.isArray(row.grants) || !row.limits)) {
    throw Error('模型服务配置无法读取');
  }
  return rows;
}

export function saveNewServices(storage, previous, rows) {
  if (JSON.stringify(readNewServices(storage)) !== JSON.stringify(previous)) {
    throw Error('其他页面已更新模型服务。请先载入最新配置。');
  }
  storage.setItem(storageKey, JSON.stringify(rows));
}

export function serviceIdentityIssue(values, rows, id) {
  if (!values.name.trim()) return '请填写模型服务名称';
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(values.callId)) return '模型调用标识需以字母或数字开头，最多 128 个字符，可使用 . _ : / -';
  if (rows.some(row => row.id !== id && row.callId === values.callId)) return '模型调用标识已存在';
  return '';
}

export function rateIssue(limits) {
  return Object.values(limits).some(value => value != null && (!Number.isSafeInteger(value) || value < 0))
    ? '限流额度需填写非负整数' : '';
}

export function tenantServiceRates(service, grant) {
  return Object.fromEntries(serviceMetrics(service.type).map(metric => [metric,
    grant.rates[metric] ?? service.limits[grant.level]?.[metric] ?? null,
  ]));
}

export const contextRoutingEnabled = service => Boolean(service.tokenizer) && !service.contextPaused;

export function channelSetupIssue(service) {
  if (!contextRoutingEnabled(service)) return '';
  return service.channels.some(row => row.enabled && (!Number.isSafeInteger(row.context) || row.context < 1))
    ? '请为每条已启用的渠道模型配置上下文长度' : '';
}

export function serviceChannelShares(channels, contextTokens = null) {
  const eligible = channels.filter(row => row.enabled && !row.reason && (contextTokens == null || row.context >= contextTokens));
  const first = Math.min(...eligible.map(row => row.priority));
  const preferred = eligible.filter(row => row.priority === first);
  const total = preferred.reduce((sum, row) => sum + row.weight, 0);
  return new Map(preferred.map(row => [row.id, row.weight / total]));
}
