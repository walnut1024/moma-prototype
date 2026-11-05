import mockConfig from '../mock/catalogues.json' with { type: 'json' };
import { normalizeCataloguePrice } from './provider-catalogue-pricing.js';
import { connectionFingerprint, connectionCredentialsReady } from './connection-state.js';
import { channelFingerprint } from './provider-channels.js';
import { modelLibrary } from './model-library.js';


export const SUPPLIER_REVIEW_CASES = mockConfig["admin-v2/supplier-review-cases.js"]["SUPPLIER_REVIEW_CASES"];

// Merge only missing fixtures; saved edits, deletions and service data are never reset.
export function prepareSupplierReviewCases(source, merge = true) {
  if (source.supplierReviewVersion === 1) return source;
  const state = structuredClone(source), at = new Date().toISOString();
  for (const spec of SUPPLIER_REVIEW_CASES) {
    let provider = state.providers.find(row => row.id === spec.id);
    if (!provider) { provider = { id: spec.id, name: spec.name, code: spec.code, status: '已启用', sourceType: 'thirdParty', catalogModelIds: [], catalogModels: [], catalogConnections: [], apiKeys: [] }; state.providers.push(provider); }
    if (!merge) {
      state.endpoints = state.endpoints.filter(row => row.providerId !== provider.id);
      Object.assign(provider, { catalogModelIds: [], catalogModels: [], catalogConnections: [], catalogPricing: [], apiKeys: [], defaultApiKeyId: '', removedCatalogModelIds: [], catalogueScope: 'managed' });
    }
    for (const [modelId, name, type] of spec.models) {
      let master;
      if (!merge) {
        master = modelLibrary(state).find(row => row.modelId.toLowerCase() === modelId.toLowerCase() && row.type === type);
        if (!master) {
          master = { id: `supplier-template-${modelId}`, modelId: modelId.toLowerCase(), name, type: type === 'visual' ? 'video' : type, maker: '', description: name + ' 的模型资料演示记录，具体能力规格待核对。', usageUnit: type === 'visual' ? '秒' : '百万 Token', capabilities: {}, profile: { tasks: [type === 'visual' ? '文生视频' : '对话'], inputModalities: ['文本'], outputModalities: [type === 'visual' ? '视频' : '文本'] }, revision: 1, updatedAt: at };
          state.modelTemplates.push(master);
        }
      }
      if (!(provider.removedCatalogModelIds || []).includes(modelId) && !(provider.catalogModelIds || []).includes(modelId)) provider.catalogModelIds = [...(provider.catalogModelIds || []), modelId];
      if (!provider.catalogModels?.some(row => row.modelId === modelId)) provider.catalogModels = [...(provider.catalogModels || []), { modelId, name, type: master?.type || type, ...(master ? { libraryId: master.id } : {}) }];
    }
    provider.supplierReviewModelIds = spec.models.map(row => row[0]);
    for (const [id, name] of spec.keys) if (!provider.apiKeys?.some(row => row.id === id)) provider.apiKeys = [...(provider.apiKeys || []), { id, name, maskedKey: `test••••••••${id.slice(-3).padStart(4, '0')}`, fingerprint: (Number(id.slice(-3)) + 1000).toString(16).padStart(64, '0'), status: 'enabled', createdAt: at }];
    if (!provider.defaultApiKeyId) provider.defaultApiKeyId = (merge ? source.providers.find(row => row.id === spec.id)?.apiKeys?.[0]?.id : '') || spec.keys[0]?.[0] || '';
    for (const [code, name, baseUrl, authMode, apiKeyId = ''] of spec.channels) {
      const id = `supplier-review-${code}`;
      if (state.endpoints.some(row => row.id === id)) continue;
      const endpoint = { id, endpointId: id, providerId: provider.id, channelCode: code, supplierChannel: true, name, protocol: 'OpenAI', baseUrl, authMode, apiKeyId, credentialVersion: 'supplier-review-1', apiKeys: [], credentialRef: '', timeoutSeconds: 60, capacity: null, modelIds: [], status: '草稿', createdAt: at, updatedAt: at };
      if (connectionCredentialsReady(endpoint, provider)) { endpoint.status = '运行中'; endpoint.connectionTest = { result: '通过', testedAt: at, fingerprint: connectionFingerprint(endpoint) }; }
      state.endpoints.push(endpoint);
    }
    for (const [modelIndex, channelIndex, upstreamModelId, scenarios] of spec.links) {
      const modelId = spec.models[modelIndex][0], endpointId = `supplier-review-${spec.channels[channelIndex][0]}`, id = `supplier-review-link-${spec.code}-${modelIndex}-${channelIndex}`;
      if ((provider.removedCatalogModelIds || []).includes(modelId) || provider.catalogConnections?.some(row => row.id === id || row.modelId === modelId && row.endpointId === endpointId)) continue;
      const endpoint = state.endpoints.find(row => row.id === endpointId);
      const row = { id, modelId, endpointId, upstreamModelId, name: endpoint.name, origin: 'undisclosed', pricing: normalizeCataloguePrice({ modelId, scenarios }), enabled: endpoint.status === '运行中', health: null, createdAt: at, updatedAt: at };
      if (row.enabled) row.health = { result: '通过', testedAt: at, fingerprint: channelFingerprint({ ...row, endpoint }) };
      provider.catalogConnections = [...(provider.catalogConnections || []), row];
    }
  }
  state.supplierReviewVersion = 1;
  return state;
}
