import mockConfig from '../mock/catalogues.json' with { type: 'json' };
import { MOMA_PRICE_DATA } from './moma-price-data.js';
import { REAL_PROVIDERS } from './real-provider-catalogue.js';
import { OFFICIAL_SUPPLY_CATALOGUE } from './official-supply-catalogue.js';

// The supplied resource specification explicitly includes DeepSeek-V4-Flash as a Mobile Cloud offer.
const regionalOnlyModelIds = new Set(['Qwen3.5-35B']);

export const MOMA_PROVIDER = mockConfig["admin-v2/moma-provider.js"]["MOMA_PROVIDER"];

export const DEFAULT_SUPPLIERS = mockConfig["admin-v2/moma-provider.js"]["DEFAULT_SUPPLIERS"];
const defaultSupplierIds = DEFAULT_SUPPLIERS.map(provider => provider.id);
const hiddenFixtureIds = new Set(REAL_PROVIDERS.map(provider => provider.id));
const representativeMomaIds = new Set(['DeepSeek-V4-Flash-0731', 'Kimi/miKimi-K3', 'AICC-Doubao-Seedance-2.0']);
// Keep historical records separate from the three default suppliers.
export const providerCatalogueIds = provider => (provider.id === MOMA_PROVIDER.id && provider.catalogueScope !== 'managed' ? [...new Set([...Object.keys(MOMA_PRICE_DATA), ...(provider.catalogModelIds || [])])].filter(id => !regionalOnlyModelIds.has(id)) : provider.catalogModelIds || []).filter(id => !(provider.removedCatalogModelIds || []).includes(id));
export const displayedCatalogueIds = (provider, state) => {
  const ids = providerCatalogueIds(provider);
  if (provider.id !== MOMA_PROVIDER.id || provider.catalogueScope === 'managed') return ids;
  const endpointIds = new Set(state.endpoints.filter(item => item.providerId === provider.id).map(item => item.id));
  const linked = new Set(state.modelSupplies.filter(item => endpointIds.has(item.endpointId) && item.status !== '已移除').map(item => item.catalogueModelId || item.upstreamModelId));
  return ids.filter(id => representativeMomaIds.has(id) || provider.supplierReviewModelIds?.includes(id) || provider.catalogModels?.some(row => row.modelId === id && row.libraryId) || !Object.hasOwn(MOMA_PRICE_DATA, id) || linked.has(id));
};
export const providerCatalogueModel = (provider, modelId) => provider?.catalogModels?.find(item => item.modelId === modelId);
export const supplierDirectory = state => {
  const providers = state.providers.filter(provider => (!hiddenFixtureIds.has(provider.id) || Boolean(provider.onboardingPresetId)) && !(provider.id === 'provider-deepseek-direct' && state.providers.some(item => item.id === 'provider-deepseek-official') && !provider.catalogConnections?.length && !provider.apiKeys?.length && !state.endpoints.some(item => item.providerId === provider.id && (item.credentialRef || item.apiKeys?.length || item.modelIds?.length)))).map(provider => provider.id === MOMA_PROVIDER.id ? { ...provider, catalogModelIds: providerCatalogueIds(provider) } : provider);
  const order = [...new Set([MOMA_PROVIDER.id, ...OFFICIAL_SUPPLY_CATALOGUE.map(provider => provider.id), ...defaultSupplierIds])];
  return [...order.map(id => providers.find(provider => provider.id === id)).filter(Boolean), ...providers.filter(provider => !order.includes(provider.id))].map(provider => provider.id === MOMA_PROVIDER.id ? { ...provider, catalogModelIds: displayedCatalogueIds(provider, state) } : provider);
};
