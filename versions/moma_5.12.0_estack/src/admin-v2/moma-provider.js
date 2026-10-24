import { MOMA_PRICE_DATA } from './moma-price-data.js';
import { REAL_PROVIDERS } from './real-provider-catalogue.js';

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
// Keep historical records separate from the three default suppliers.
export const providerCatalogueIds = provider => provider.id === MOMA_PROVIDER.id ? [...new Set([...Object.keys(MOMA_PRICE_DATA), ...(provider.catalogModelIds || [])])].filter(id => !regionalOnlyModelIds.has(id)) : provider.catalogModelIds || [];
export const providerCatalogueModel = (provider, modelId) => provider?.catalogModels?.find(item => item.modelId === modelId);
export const supplierDirectory = state => {
  const providers = state.providers.filter(provider => !hiddenFixtureIds.has(provider.id)).map(provider => provider.id === MOMA_PROVIDER.id ? { ...provider, catalogModelIds: providerCatalogueIds(provider) } : provider);
  return [...defaultSupplierIds.map(id => providers.find(provider => provider.id === id)).filter(Boolean), ...providers.filter(provider => !defaultSupplierIds.includes(provider.id))];
};
