import { libraryRecord } from './model-library.js';
import { activeSupplyPrice, priceItems } from './model-management.js';

export function resolveChannelAssociationModel(state, provider, association) {
  const endpoint = state.endpoints.find(row => row.id === association.endpointId && row.providerId === provider.id && !row.deletedAt);
  if (!endpoint) throw new Error('模型渠道不属于当前服务商');
  const entry = provider.catalogModels?.find(row => row.modelId === association.modelId);
  if (entry?.libraryId) {
    const master = libraryRecord(state, entry.libraryId);
    if (!master) throw new Error('模型资料引用已失效，请重新关联主档');
    return master;
  }
  const ids = [...new Set(state.modelSupplies.filter(row => row.status !== '已移除' && row.endpointId === endpoint.id && (!row.providerId || row.providerId === provider.id) && row.upstreamModelId === association.upstreamModelId && (row.catalogueModelId || row.upstreamModelId) === association.modelId).map(row => row.modelId))];
  if (ids.length > 1) throw new Error('精确供给引用对应多个模型资料，请先明确关联主档');
  const master = ids.length === 1 && libraryRecord(state, ids[0]);
  if (!master) throw new Error('当前模型缺少明确的模型资料引用，请先关联主档');
  return master;
}

export function channelAssociationPricing(state, association) {
  const items = state.modelSupplies.filter(row => row.status !== '已移除' && row.endpointId === association.endpointId && row.upstreamModelId === association.upstreamModelId && (row.catalogueModelId || row.upstreamModelId) === association.modelId)
    .map(row => priceItems(activeSupplyPrice(state, row.id), state.models.find(model => model.id === row.modelId)))
    .find(rows => rows.length && rows.every(row => row.amount != null)) || [];
  return { modelId: association.modelId, discountFactor: 1000000, scenarios: items.map(({ amount, ...row }) => ({ ...row, listPrice: amount })) };
}

export function materializeChannelAssociation(state, provider, association) {
  const saved = provider.catalogConnections?.find(row => !row.deletedAt && row.endpointId === association.endpointId && (row.id === association.id || !row.id && row.modelId === association.modelId && (!row.upstreamModelId || row.upstreamModelId === association.upstreamModelId)));
  const row = { ...saved, id: saved?.id || association.id, modelId: association.modelId, endpointId: association.endpointId, upstreamModelId: association.upstreamModelId };
  if (!Object.hasOwn(row, 'pricing')) row.pricing = channelAssociationPricing(state, association);
  return row;
}
