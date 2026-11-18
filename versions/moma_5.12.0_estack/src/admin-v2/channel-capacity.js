import { supplierChannelAssociations } from './supplier-resources.js';
import { parseTrafficRate, trafficRateText } from './traffic-rates.js';

export const CAPACITY_METRICS = [
  { key: 'rpm', label: 'RPM', unit: '次/分钟' },
  { key: 'tpm', label: 'TPM', unit: '百万 Token/分钟', tokenRate: true },
  { key: 'concurrency', label: '并发上限', unit: '个请求' },
  { key: 'rpd', label: 'RPD', unit: '次/天' },
  { key: 'tpd', label: 'TPD', unit: 'Token/天' },
  { key: 'rps', label: 'RPS', unit: '次/秒' },
  { key: 'inputTpm', label: '输入 TPM（ITPM）', unit: '百万 Token/分钟', tokenRate: true },
  { key: 'outputTpm', label: '输出 TPM（OTPM）', unit: '百万 Token/分钟', tokenRate: true },
  { key: 'ipm', label: 'IPM', unit: '张/分钟' },
];

export const capacityEntries = limits => CAPACITY_METRICS.filter(metric => limits?.[metric.key] != null)
  .map(metric => ({ ...metric, value: limits[metric.key] }));

// Keep stored Token limits in base units; only the form and display use millions.
export const channelCapacityDraft = limits => Object.fromEntries(Object.entries(limits || {}).map(([key, value]) => [key,
  CAPACITY_METRICS.find(metric => metric.key === key)?.tokenRate ? trafficRateText(value, 'tpm') : String(value ?? '')]));

export function parseChannelCapacityDraft(limits) {
  return normalizeChannelCapacity(Object.fromEntries(Object.entries(limits).map(([key, raw]) => {
    const metric = CAPACITY_METRICS.find(metric => metric.key === key);
    if (!metric?.tokenRate || raw == null || typeof raw === 'string' && !raw.trim()) return [key, raw];
    const value = typeof raw === 'string' ? parseTrafficRate(raw, 'tpm') : null;
    if (value === null) throw new Error(`${metric.label} 须为正数，最多保留 6 位小数`);
    return [key, value];
  })));
}

export function normalizeChannelCapacity(limits) {
  if (!limits || typeof limits !== 'object' || Array.isArray(limits) || Object.keys(limits).some(key => !CAPACITY_METRICS.some(metric => metric.key === key))) throw new Error('容量指标无效');
  return Object.fromEntries(Object.entries(limits).flatMap(([key, raw]) => {
    const value = typeof raw === 'string' ? raw.trim() : raw;
    if (value === '' || value === null) return [];
    if (!(typeof value === 'number' || typeof value === 'string' && /^\d+$/.test(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) {
      throw new Error(`${CAPACITY_METRICS.find(metric => metric.key === key).label} 须为正整数`);
    }
    return [[key, Number(value)]];
  }));
}

export function channelCapacityTransaction(state, { data = {} }) {
  const provider = state.providers.find(row => row.id === data.providerId && !row.deletedAt);
  const endpoint = state.endpoints.find(row => row.id === data.endpointId && row.providerId === provider?.id && !row.deletedAt);
  if (!provider || !endpoint) throw new Error('当前渠道不存在或不属于该服务商');
  const projected = supplierChannelAssociations(state, provider, endpoint.id).find(row => row.id === data.associationId);
  if (!projected) throw new Error('容量配置不属于当前模型渠道');
  const entries = provider.catalogConnections || [];
  const saved = entries.find(row => !row.deletedAt && row.endpointId === endpoint.id && (row.id === projected.id || !row.id && row.modelId === projected.modelId));
  if (data.expectedCapacityRevision !== (saved?.capacityRevision || 0)) throw new Error('该渠道容量已有修订，请重新打开；当前输入保留');
  const capacityLimits = normalizeChannelCapacity(data.limits);
  const association = { ...saved, id: projected.id, modelId: projected.modelId, endpointId: endpoint.id,
    capacityLimits, capacityRevision: (saved?.capacityRevision || 0) + 1 };
  return { type: 'batch', objectId: projected.id, label: '保存渠道容量', changes: [{ type: 'update', collection: 'providers', id: provider.id,
    changes: { catalogConnections: saved ? entries.map(row => row === saved ? association : row) : [...entries, association] } }] };
}
