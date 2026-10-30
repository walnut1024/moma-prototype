export function catalogueConnections(state, provider, modelId) {
  if (!provider || !modelId) return [];
  const configured = (provider.catalogConnections || []).filter(item => item.modelId === modelId);
  const ids = configured.length ? configured.filter(item => !item.deletedAt).map(item => item.endpointId) : state.modelSupplies.filter(item => item.status !== '已移除' && (item.catalogueModelId === modelId || item.upstreamModelId === modelId)).map(item => item.endpointId);
  return state.endpoints.filter(item => item.providerId === provider.id && ids.includes(item.id));
}

export function connectionCatalogueIds(state, provider, endpointId) {
  return (provider.catalogModelIds || []).filter(id => catalogueConnections(state, provider, id).some(item => item.id === endpointId));
}
