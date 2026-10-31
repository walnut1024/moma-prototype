import { previewChannelModels } from './channel-onboarding.js';
import { libraryRecord } from './model-library.js';

export const channelDiscoveryRevision = (provider, endpointId) => JSON.stringify((provider?.catalogConnections || []).filter(row => row.endpointId === endpointId && !row.deletedAt).map(row => [row.id, row.modelId, row.upstreamModelId]).sort(([left], [right]) => String(left).localeCompare(String(right))));

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
    return { ...row, existingAssociationId: mapping?.id || null, attributes, status: mapping ? attributes.some(item => item.different) ? '属性差异' : '已存在' : row.status };
  });
  return { ...base, rows, missing: base.missing.map(id => { const mapping = mappings.find(row => row.id === id); return { id, upstreamModelId: mapping.upstreamModelId, modelId: mapping.modelId }; }), source: result.source || 'upstream', discoveredAt: result.discoveredAt, partialReason: result.partialReason || '', mappingRevision: channelDiscoveryRevision(provider, endpointId) };
}
