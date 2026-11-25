export function catalogueConnections(state, provider, modelId) {
  if (!provider || !modelId) return [];
  const configured = (provider.catalogConnections || []).filter(item => item.modelId === modelId);
  const ids = configured.length ? configured.filter(item => !item.deletedAt).map(item => item.endpointId) : state.modelSupplies.filter(item => item.status !== '已移除' && (item.catalogueModelId === modelId || item.upstreamModelId === modelId)).map(item => item.endpointId);
  return state.endpoints.filter(item => item.providerId === provider.id && !item.deletedAt && ids.includes(item.id));
}

export function connectionCatalogueIds(state, provider, endpointId) {
  const ids = new Set([...(provider.catalogModelIds || []), ...(provider.removedCatalogModelIds || []),
    ...(provider.catalogConnections || []).filter(row => row.endpointId === endpointId).map(row => row.modelId)]);
  return [...ids].filter(id => catalogueConnections(state, provider, id).some(item => item.id === endpointId));
}
