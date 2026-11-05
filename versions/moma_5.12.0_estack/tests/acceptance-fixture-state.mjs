import fixtures from '../src/mock/acceptance-cleanup.json' with { type: 'json' };
export { fixtures };

export function withAcceptanceFixtures(source) {
  const state = structuredClone(source), master = state.modelTemplates[0], service = state.models.find(row => row.templateId), endpoint = state.endpoints[0], supply = state.modelSupplies[0];
  for (const spec of fixtures) {
    const code = 'qa-' + spec.modelId, mappingId = 'mapping-' + spec.supplyId, versionId = 'version-' + spec.modelId;
    state.modelTemplates.push({ ...master, id: spec.libraryId, modelId: code, name: spec.modelName });
    state.models.push({ ...service, id: spec.modelId, templateId: spec.libraryId, modelId: code, name: spec.modelName, listingStatus: '已下架', callsEnabled: false, serviceMode: 'standard', serviceProviders: [], defaultVersionId: versionId });
    state.providers.push({ id: spec.providerId, name: spec.name, code: 'qa-' + spec.providerId, status: '已启用', catalogueScope: 'managed', catalogModelIds: [code], catalogModels: [{ modelId: code, libraryId: spec.libraryId }], catalogConnections: [{ id: mappingId, modelId: code, endpointId: spec.endpointId, upstreamModelId: code, enabled: false }], apiKeys: [] });
    state.endpoints.push({ ...endpoint, id: spec.endpointId, providerId: spec.providerId, name: spec.name + '渠道', modelIds: [], apiKeys: [], apiKeyId: '', authMode: 'none', serverTestJobs: [] });
    state.modelSupplies.push({ ...supply, id: spec.supplyId, providerId: spec.providerId, endpointId: spec.endpointId, modelId: spec.modelId, channelId: mappingId, catalogueModelId: code, upstreamModelId: code });
    state.modelVersions.push({ ...state.modelVersions[0], id: versionId, modelId: spec.modelId });
  }
  return state;
}
