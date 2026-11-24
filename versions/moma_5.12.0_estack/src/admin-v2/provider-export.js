import { providerCode } from './provider-management.js';
import { activeChannelProcurement } from './channel-change-management.js';
import { cataloguePurchasePrice, catalogueAmountInput } from './provider-catalogue-pricing.js';
import { modelLibrary } from './model-library.js';
import { supplierChannelResources } from './supplier-resources.js';
import { normalizeChannelCapacity } from './channel-capacity.js';

const profileKeys = ['name', 'code', 'source_type', 'logo', 'introduction', 'website', 'documentation', 'contact', 'contact_info', 'description'];

export function exportProviderJson(state, provider) {
  const endpoints = supplierChannelResources(state, provider), masters = new Map(modelLibrary(state).map(row => [row.id, row]));
  const connections = endpoints.map((endpoint, index) => ({ connection_id: 'connection-' + (index + 1), base_url: endpoint.baseUrl, protocol: endpoint.protocol,
    interface_type: endpoint.interfaceType || 'openai', ...(Object.keys(endpoint.taskUrls || {}).length ? { task_urls: endpoint.taskUrls } : {}) }));
  const connectionIds = new Map(endpoints.map((row, index) => [row.id, connections[index].connection_id]));
  const models = (provider.catalogModels || []).filter(entry => !entry.deletedAt && (provider.catalogModelIds || []).includes(entry.modelId)).flatMap(entry => {
    const master = masters.get(entry.libraryId);
    if (!master) return [];
    const info = master.profile || {}, capabilities = master.capabilities || {}, types = { 文本: 'text', 图片: 'image', 视频: 'video', 音频: 'audio' };
    const mappings = (provider.catalogConnections || []).filter(row => !row.deletedAt && row.modelId === entry.modelId && connectionIds.has(row.endpointId)).map(row => {
      const active = activeChannelProcurement(row), quote = active === undefined ? row.pricing : active?.pricing;
      const scenarios = quote?.scenarios?.filter(item => item.listPrice != null || item.purchasePrice != null).map(item => ({ name: item.name, condition: item.condition || '', listPrice: catalogueAmountInput(cataloguePurchasePrice(item.listPrice, quote.discountFactor, item.purchasePrice)), unit: item.unit, currency: item.currency }));
      return { connection_id: connectionIds.get(row.endpointId), upstream_model_id: row.upstreamModelId, channel_name: row.sourceName || row.name || '',
        ...(Object.keys(row.capacityLimits || {}).length ? { capacity_limits: normalizeChannelCapacity(row.capacityLimits) } : {}),
        ...(scenarios?.length ? { procurement: { scenarios } } : {}) };
    });
    return [{ canonical_slug: master.modelId, model_name: master.name, model_type: master.type,
      model_info: { ...(info.author || master.maker ? { author: info.author || master.maker } : {}),
        ...(info.inputModalities?.every(value => types[value]) && info.outputModalities?.every(value => types[value]) ? { architecture: { input_modalities: info.inputModalities.map(value => types[value]), output_modalities: info.outputModalities.map(value => types[value]) } } : {}),
        ...(typeof capabilities.streaming === 'boolean' ? { streaming: capabilities.streaming } : {}), ...(typeof capabilities.tools === 'boolean' ? { tools: capabilities.tools } : {}),
        ...(capabilities.context > 0 ? { context_length_tokens: capabilities.context } : {}), ...(capabilities.output > 0 ? { max_output_tokens: capabilities.output } : {}) }, mappings }];
  });
  const profile = Object.fromEntries(profileKeys.flatMap(key => { const field = key === 'source_type' ? 'sourceType' : key === 'contact_info' ? 'contactInfo' : key; return provider[field] != null ? [[key, provider[field]]] : []; }));
  return { provider: { ...profile, code: providerCode(provider), connections, models } };
}
