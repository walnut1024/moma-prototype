import { previewChannelModels } from './channel-onboarding.js';
import { libraryRecord } from './model-library.js';
import { channelDiscoveryRevision } from './channel-onboarding.js';
export { channelDiscoveryRevision, directoryDiscoveryReceipt, directoryDiscoverySignature } from './channel-onboarding.js';

// shortcut: anchored expressions allow one trailing repetition, use a linear-time engine for full regex syntax.
const discoveryRegex = pattern => {
  if (pattern.length > 200 || !/^re:\^(?:[\w/:.-]|\\[.:-]|\[[a-zA-Z0-9_-]{1,30}\])+(?:[+*?])?\$?$/.test(pattern)) return null;
  try { return new RegExp(pattern.slice(3), 'u'); }
  catch { return null; }
};
const discoveryId = /^[\w./:-]{1,200}$/;

export const ignoredDiscoveryModel = (policy, id) => (policy?.ignored || []).some(pattern =>
  pattern.startsWith('re:') ? Boolean(discoveryRegex(pattern)?.test(id)) :
    pattern.endsWith('*') ? id.startsWith(pattern.slice(0, -1)) : id === pattern);

export function directoryDiscoveryPolicy(input) {
  const { enabled, intervalMinutes, ignored, whitelist } = input;
  if (typeof enabled !== 'boolean' || !Number.isSafeInteger(intervalMinutes) || intervalMinutes < 5 || intervalMinutes > 1440) throw Error('检测间隔须为 5–1440 分钟');
  const valid = (items, condition) => Array.isArray(items) && items.length <= 100 && items.every(item => typeof item === 'string' && condition(item));
  if (!valid(ignored, item => item.startsWith('re:') ? discoveryRegex(item) : discoveryId.test(item.replace(/\*$/, ''))) ||
    !valid(whitelist, item => discoveryId.test(item))) throw Error('忽略项支持精确标识、前缀 * 或 re:^test-[0-9]+$ 样式的限定正则，采购白名单使用精确标识');
  return { enabled, intervalMinutes, ignored: [...new Set(ignored)], whitelist: [...new Set(whitelist)] };
}

export function channelDiscoveryPreview(state, provider, endpointId, result) {
  const base = previewChannelModels(state, provider.id, result.models, { source: 'upstream', complete: result.complete, endpointId });
  const mappings = (provider.catalogConnections || []).filter(row => row.endpointId === endpointId && !row.deletedAt);
  const rows = base.rows.map(row => {
    const mapping = mappings.find(item => item.upstreamModelId === row.upstreamModelId);
    const master = libraryRecord(state, provider.catalogModels?.find(item => item.modelId === mapping?.modelId)?.libraryId);
    const upstream = result.models.find(item => typeof item === 'object' && item.id === row.upstreamModelId);
    const attributes = [];
    const add = (field, label, observed, current) => { if (observed !== undefined) attributes.push({ field, label, observed, current: current ?? null, different: current != null && observed !== current }); };
    if (typeof upstream?.name === 'string' && upstream.name.length <= 200) add('name', '名称', upstream.name, master?.name);
    if (['text', 'multimodal', 'image', 'video', 'audio', 'embedding', 'rerank'].includes(upstream?.type)) add('type', '模型类型', upstream.type, master?.type);
    if (Number.isSafeInteger(upstream?.context_length) && upstream.context_length > 0) add('context_length', '上下文上限（Token）', upstream.context_length, master?.capabilities?.context);
    for (const [field, label] of [['streaming', '流式响应'], ['tools', '工具调用'], ['structured', '结构化输出']]) if (typeof upstream?.capabilities?.[field] === 'boolean') add(field, label, upstream.capabilities[field], field === 'structured' ? master?.profile?.structured : master?.capabilities?.[field]);
    const matched = libraryRecord(state, row.libraryId);
    const archived = matched && (matched.archivedAt || state.modelData?.archivedCatalogueIds?.includes(matched.id));
    return { ...row, ...(archived ? { libraryId: '', status: '资料已归档' } : {}),
      existingAssociationId: mapping?.id || null, attributes,
      ...(mapping ? { status: attributes.some(item => item.different) ? '属性差异' : '已存在' } : {}) };
  });
  return { ...base, rows, missing: base.missing.map(id => { const mapping = mappings.find(row => row.id === id); return { id, upstreamModelId: mapping.upstreamModelId, modelId: mapping.modelId }; }), source: result.source || 'upstream', discoveredAt: result.discoveredAt, partialReason: result.partialReason || '', mappingRevision: channelDiscoveryRevision(provider, endpointId) };
}
