import fixtures from '../mock/acceptance-cleanup.json' with { type: 'json' };

// Explicit maintenance command; these records are never seeded or matched by name prefixes.
export function archiveAcceptanceFixture(state, data) {
  if (state.currentRole !== '平台管理员') throw Error('仅平台管理员可归档验收数据');
  const spec = fixtures.find(row => row.providerId === data?.providerId);
  if (!spec || data.confirmed !== true) throw Error('请确认指定的验收供应商');
  const provider = state.providers.find(row => row.id === spec.providerId), model = state.models.find(row => row.id === spec.modelId);
  const endpoint = state.endpoints.find(row => row.id === spec.endpointId), supply = state.modelSupplies.find(row => row.id === spec.supplyId);
  if (!provider || !model || !endpoint || !supply) throw Error('验收数据已变化或已归档，请重新核对');
  if (provider.name !== spec.name || model.name !== spec.modelName || model.templateId !== spec.libraryId || endpoint.providerId !== provider.id || supply.modelId !== model.id || supply.endpointId !== endpoint.id || supply.providerId && supply.providerId !== provider.id) throw Error('验收数据身份不匹配，拒绝归档');
  if (model.listingStatus === '已上架' || model.callsEnabled !== false) throw Error('请先下架并停用验收模型服务');
  if (state.endpoints.some(row => row.providerId === provider.id && row.id !== endpoint.id)
    || state.modelSupplies.some(row => (row.providerId === provider.id || row.endpointId === endpoint.id || row.modelId === model.id) && row.id !== supply.id)
    || state.models.some(row => row.id !== model.id && row.serviceProviders?.some(item => item.providerId === provider.id))
    || model.serviceProviders?.some(row => row.providerId !== provider.id)
    || provider.catalogModels?.length !== 1 || provider.catalogModels.some(row => row.libraryId !== spec.libraryId)
    || provider.catalogModelIds?.some(id => id !== provider.catalogModels[0].modelId)
    || state.providers.some(row => row.id !== provider.id && row.catalogConnections?.some(item => !item.deletedAt && item.endpointId === endpoint.id))) throw Error('验收资源存在其他业务关联，拒绝归档');
  const serviceIds = new Set([`standard:${model.id}`, `provider:${model.id}:${provider.id}`]);
  const channelIds = new Set([supply.id, supply.channelId, endpoint.id, ...(provider.catalogConnections || []).map(row => row.id)].filter(Boolean));
  const routes = state.serviceRoutes.filter(row => serviceIds.has(row.serviceId));
  const members = row => [...(row.versions || []).flatMap(version => version.config?.channels || []), ...(row.draft?.channels || [])];
  if (state.serviceRoutes.some(row => !serviceIds.has(row.serviceId) && members(row).some(channel => channelIds.has(channel.supplyId)))
    || routes.some(row => members(row).some(channel => !channelIds.has(channel.supplyId)))
    || state.modelOnboardings.some(row => (row.providerId || row.value?.providerId) === provider.id)
    || endpoint.serverTestJobs?.some(row => !row.receivedAt)
    || ['orders','grants','requests'].some(key => (state[key] || []).some(row => row.modelId === model.id || serviceIds.has(row.serviceId) || row.endpointId === endpoint.id))) throw Error('验收数据仍有任务、路由、订购或调用引用，拒绝归档');
  const changes = [
    ['providers', provider], ['endpoints', endpoint], ['models', model], ['modelSupplies', supply],
    ...state.modelVersions.filter(row => row.modelId === model.id).map(row => ['modelVersions', row]),
    ...state.validations.filter(row => row.modelId === model.id).map(row => ['validations', row]),
    ...routes.map(row => ['serviceRoutes', row]),
  ].map(([collection, row]) => ({ type: 'remove', collection, id: row.id }));
  return { type: 'batch', changes, objectId: provider.id, label: '归档指定验收供应商及模型服务', archivedCatalogueIds: [...new Set([...(state.modelData?.archivedCatalogueIds || []), spec.libraryId])] };
}
