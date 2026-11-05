import mockConfig from '../mock/catalogues.json' with { type: 'json' };
import { normalizeCataloguePrice } from './provider-catalogue-pricing.js';

const checkedAt = '2026-10-25';





// Official product facts are separate from account credentials and actual service availability.
export const OFFICIAL_SUPPLY_CATALOGUE = mockConfig["admin-v2/official-supply-catalogue.js"]["OFFICIAL_SUPPLY_CATALOGUE"];

export function officialSupplyRecords() {
  const providers = [], endpoints = [];
  for (const supplier of OFFICIAL_SUPPLY_CATALOGUE) {
    const catalogConnections = [], catalogModels = [], catalogPricing = [];
    for (const model of supplier.models) {
      catalogModels.push({ modelId: model.modelId, name: model.name, type: model.type, source: model.source, checkedAt });
      for (const channel of model.channels) {
        const id = `official-${supplier.code}-${model.modelId}-${channel.key}`, endpointId = `endpoint-${id}`;
        const pricing = normalizeCataloguePrice({ modelId: model.modelId, scenarios: channel.scenarios });
        endpoints.push({ id: endpointId, endpointId, providerId: supplier.id, name: `${model.name} ${channel.name}`, ...channel.addresses[0], apiKeys: [], credentialRef: '', capacity: null, timeoutSeconds: 60, modelIds: [], status: '草稿', connectionTest: null });
        catalogConnections.push({ id, modelId: model.modelId, name: channel.name, origin: 'direct', upstreamProvider: '', upstreamModelId: model.modelId, endpointId, apiAddresses: channel.addresses, pricing, source: channel.source, sourceNote: channel.note || (channel.scenarios.some(item => item.listPrice == null) ? '官方文档已确认计费项，金额待核实。' : ''), checkedAt, enabled: false, health: null });
        if (!catalogPricing.some(item => item.modelId === model.modelId)) catalogPricing.push(pricing);
      }
    }
    providers.push({ id: supplier.id, name: supplier.name, code: supplier.code, sourceType: 'thirdParty', status: '已启用', contact: '', contactInfo: '', description: '', catalogModelIds: supplier.models.map(model => model.modelId), catalogModels, catalogPricing, catalogConnections });
  }
  return { providers, endpoints };
}

export function officialCatalogueTransaction(state) {
  const records = officialSupplyRecords(), changes = [];
  for (const collection of ['providers', 'endpoints']) for (const record of records[collection]) {
    if (!state[collection].some(item => item.id === record.id)) changes.push({ type: 'add', collection, record });
  }
  return { type: 'batch', label: '载入官方模型目录', objectId: 'official-supply-catalogue', changes };
}
