import { MOMA_PRICE_DATA } from './moma-price-data.js';
import { REAL_PROVIDERS } from './real-provider-catalogue.js';
import { OFFICIAL_SUPPLY_CATALOGUE } from './official-supply-catalogue.js';

// The supplied resource specification explicitly includes DeepSeek-V4-Flash as a Mobile Cloud offer.
const regionalOnlyModelIds = new Set(['Qwen3.5-35B']);

export const MOMA_PROVIDER = {
  id: 'provider-moma', name: '中国移动 MoMA', code: 'moma',
  baseUrl: 'https://moma.cmecloud.cn/v1',
  sourceType: 'thirdParty', integrationType: '云厂商模型服务',
  catalogueSource: '公有云MoMA_按Token用量计费_资源规格清单_v5-20260920.xlsx',
  catalogueCheckedAt: '2026-10-21',
  catalogModelIds: Object.keys(MOMA_PRICE_DATA),
  description: '中国移动移动云模型服务平台 MoMA，提供模型 API 调用服务。',
  catalogueNote: '资源规格清单内模型按清单报价，未列入清单的主站、合作及机密模型保留原报价；不合并省市节点同名模型。价格规格名称不等同于已经验证的调用 ID，实际调用以供应商 API 资料与账号权益为准。',
};

export const DEFAULT_SUPPLIERS = [
  MOMA_PROVIDER,
  { ...REAL_PROVIDERS.find(provider => provider.code === 'zhipu'), id: 'provider-zhipu-direct', name: '智谱', code: 'zhipu-direct' },
  { ...REAL_PROVIDERS.find(provider => provider.code === 'deepseek'), id: 'provider-deepseek-direct', name: 'DeepSeek', code: 'deepseek-direct' },
];
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
  return ids.filter(id => representativeMomaIds.has(id) || provider.supplierReviewModelIds?.includes(id) || !Object.hasOwn(MOMA_PRICE_DATA, id) || linked.has(id));
};
export const providerCatalogueModel = (provider, modelId) => provider?.catalogModels?.find(item => item.modelId === modelId);
export const supplierDirectory = state => {
  const providers = state.providers.filter(provider => !hiddenFixtureIds.has(provider.id) && !(provider.id === 'provider-deepseek-direct' && state.providers.some(item => item.id === 'provider-deepseek-official') && !provider.catalogConnections?.length && !provider.apiKeys?.length && !state.endpoints.some(item => item.providerId === provider.id && (item.credentialRef || item.apiKeys?.length || item.modelIds?.length)))).map(provider => provider.id === MOMA_PROVIDER.id ? { ...provider, catalogModelIds: providerCatalogueIds(provider) } : provider);
  const order = [...OFFICIAL_SUPPLY_CATALOGUE.map(provider => provider.id), ...defaultSupplierIds];
  return [...order.map(id => providers.find(provider => provider.id === id)).filter(Boolean), ...providers.filter(provider => !order.includes(provider.id))].map(provider => provider.id === MOMA_PROVIDER.id ? { ...provider, catalogModelIds: displayedCatalogueIds(provider, state) } : provider);
};
