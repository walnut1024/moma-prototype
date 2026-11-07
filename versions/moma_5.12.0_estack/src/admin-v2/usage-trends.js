import { usageBuckets, usageFilterOptions, usageModelTypes, usageMeter } from './usage-analysis.js';
import { usageTokenValue } from './usage-distributions.js';

export const usageDimensions = [['category', '按模型类型'], ['providerId', '按服务商'], ['modelId', '按模型'], ['tenantId', '按客户']];
export const trendDimensions = [['total', '合计'], ...usageDimensions];
export const tokenMetrics = [['total', '总Token'], ['input', '输入Token'], ['output', '输出Token']];
export const defaultTrend = () => ({ dimension: 'total', metric: 'total', showTotal: false, curves: null });

export function supplySummary(filters, options, full = false) {
  const providers = filters.providers || [];
  if (filters.channels === null && !providers.length) return '服务商：全部';
  if (full) return [...providers.map(id => `${options.providers.find(item => item.id === id)?.name || id}：全部渠道`), ...(filters.channels || []).map(id => options.channels.find(item => item.id === id)?.name || id)].join('、') || '未选择供给';
  const partial = new Set((filters.channels || []).map(id => options.channels.find(item => item.id === id)?.groupId || '__unknown__'));
  const count = new Set([...providers, ...partial]).size;
  return partial.size ? `服务商：${count}家／部分渠道` : `服务商：${count}个`;
}

// Whole suppliers remain identities; individual channels never promote themselves to a supplier scope.
export function toggleSupplyGroup(draft, groupId, channels, checked) {
  return { providers: checked ? [...new Set([...draft.providers, groupId])] : draft.providers.filter(id => id !== groupId), channels: draft.channels.filter(id => !channels.some(item => item.id === id && item.groupId === groupId)) };
}
export function toggleSupplyChannel(draft, channel, channels, checked) {
  const selected = new Set([...draft.channels, ...channels.filter(item => draft.providers.includes(item.groupId)).map(item => item.id)]);
  if (checked) selected.add(channel.id); else selected.delete(channel.id);
  const providers = draft.providers.filter(id => id !== channel.groupId);
  return { providers, channels: [...selected].filter(id => !channels.some(item => item.id === id && providers.includes(item.groupId))) };
}

export function trendSeries(state, facts, filters, settings, calls = false) {
  const options = usageFilterOptions(state);
  const rows = facts.current.filter(row => calls || row.unit === 'Token');
  const buckets = usageBuckets([], [], facts.window);
  const dimension = settings.dimension;
  const collections = { modelId: options.models, category: usageModelTypes, providerId: options.providers, tenantId: state.tenants || [] };
  const candidates = new Map();
  const add = id => {
    const item = collections[dimension]?.find(item => item.id === id);
    const name = item?.name || (id === '__unknown__' ? `未归属${dimension === 'tenantId' ? '客户' : dimension === 'providerId' ? '服务商' : '模型'}` : id);
    const label = collections[dimension]?.filter(candidate => candidate.name === name).length > 1 ? `${name}（${item.code || id}）` : name;
    if (!candidates.has(id)) candidates.set(id, { id, label, code: item?.code || id, color: dimension === 'category' ? item?.color : undefined, values: buckets.map(() => 0), sum: 0 });
  };
  if (dimension === 'modelId') for (const id of filters.model || []) {
    if (calls || usageMeter(state.models.find(item => item.id === id)).unit === 'Token') add(id);
  }
  if (dimension === 'providerId') for (const id of filters.providers || []) add(id);
  if (dimension === 'tenantId') for (const id of filters.tenant || []) add(id);
  const narrowed = filters.model !== null || filters.channels !== null || filters.providers?.length || filters.user !== null || filters.tenant !== null || filters.types !== null;
  const total = { id: '__total__', label: narrowed ? '当前筛选范围合计' : '全部模型合计', total: true, color: '#315fe8', values: buckets.map(() => 0) };
  let pending = 0;
  for (const row of rows) {
    const index = buckets.findIndex(bucket => row.at >= bucket.start && row.at < bucket.end);
    if (index < 0) continue;
    const id = row[dimension] || '__unknown__';
    if (dimension !== 'total') add(id);
    const value = calls ? 1 : usageTokenValue(row, settings.metric);
    if (value === null) pending++;
    for (const target of dimension === 'total' ? [total] : [total, candidates.get(id)]) {
      target.values[index] = value === null || target.values[index] === null ? null : target.values[index] + value;
      if (!target.total) target.sum += value ?? 0;
    }
  }
  const groups = [...candidates.values()].sort((a, b) => b.sum - a.sum || a.id.localeCompare(b.id));
  return { buckets, groups, total, pending, applicable: calls || rows.length > 0 || state.models.some(model => (filters.model === null || filters.model.includes(model.id)) && usageMeter(model).unit === 'Token') };
}

export function visibleTrendIds(groups, curves) {
  if (curves === null) return groups.slice(0, 5).map(item => item.id);
  return groups.filter(item => curves.includes(item.id)).map(item => item.id);
}

export function validTrendView(view, panelIds, trendIds, shareIds) {
  const ids = value => Array.isArray(value) && value.every(id => typeof id === 'string');
  return !!view && ['today', 'yesterday', '7d', '30d', 'custom'].includes(view.period) && typeof view.range?.start === 'string' && typeof view.range?.end === 'string' && panelIds.every(id => {
    const filter = view.panelFilters?.[id];
    return filter && ['types', 'tenant', 'model', 'channels', 'user'].every(key => filter[key] === null || ids(filter[key])) && ids(filter.providers);
  }) && trendIds.every(id => {
    const setting = view.trends?.[id];
    return setting && trendDimensions.some(([key]) => key === setting.dimension) && tokenMetrics.some(([key]) => key === setting.metric) && typeof setting.showTotal === 'boolean' && (setting.curves === null || ids(setting.curves));
  }) && shareIds.every(id => {
    const setting = view.shares?.[id];
    return setting && usageDimensions.some(([key]) => key === setting.dimension) && tokenMetrics.some(([key]) => key === setting.metric);
  });
}
