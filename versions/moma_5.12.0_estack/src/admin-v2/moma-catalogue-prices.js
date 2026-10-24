import { canonicalMomaScenarios } from './moma-billing-items.js';
import { MOMA_PRICE_DATA } from './moma-price-data.js';
import { providerCatalogueIds } from './moma-provider.js';
import { normalizeCataloguePrice } from './provider-catalogue-pricing.js';

export const MOMA_CATALOGUE_PRICES = MOMA_PRICE_DATA;

export const isPayAsYouGoPrice = row => !['资源包', '输入 TPM 预留', '输出 TPM 预留'].includes(row.name) && !['包', '千 TPM·月'].includes(row.unit) && !/^(?:资源包抵扣|机密模型资源包(?:抵扣)?|TPM预留)(?:；|$)/.test(row.condition || '');

export const isMomaCataloguePrice = row => isPayAsYouGoPrice(row) && !/^自营按量·(?!移动云(?:；|$))[^；]+(?:；|$)/.test((row.condition || '').trim());

export function providerCataloguePrice(provider, modelId) {
  if (!providerCatalogueIds(provider).includes(modelId)) return undefined;
  const configured = provider.catalogPricing?.find(item => item.modelId === modelId);
  const official = provider.id === 'provider-moma' && Object.hasOwn(MOMA_CATALOGUE_PRICES, modelId) && MOMA_CATALOGUE_PRICES[modelId];
  const entry = configured || normalizeCataloguePrice({ modelId, scenarios: official?.scenarios || [] });
  return { ...entry, discountFactor: entry.discountFactor ?? 1000000, scenarios: provider.id === 'provider-moma' ? canonicalMomaScenarios(entry.scenarios.filter(isMomaCataloguePrice)) : entry.scenarios };
}
