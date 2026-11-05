import { catalogueModelMatch, modelLibrary, libraryRecord, supplySalesStatus } from './model-operations.js';
import { supplierDirectory, providerCatalogueIds, providerCatalogueModel } from './moma-provider.js';
import { providerCataloguePrice } from './moma-catalogue-prices.js';
import { catalogueConnections } from './provider-model-connections.js';
import { activeSupplySalePrice, priceItems, procurementVersion, latestSaleRevision, supplyPriceReady, availableSupplies } from './model-management.js';
import { cataloguePurchasePrice, saleItemsDraft } from './provider-catalogue-pricing.js';
import { connectionBlockReason } from './connection-state.js';
import { commitAdminState } from './state-transaction.js';

export const LISTING_PREFERENCES_KEY = 'moma:5120:model-management:views';
export const LISTING_FILTER_KEYS = ['q', 'type', 'mode', 'model', 'status', 'attention', 'provider', 'page', 'size', 'supplier', 'supplierQ', 'catalogueQ', 'catalogueType', 'catalogueStatus', 'cataloguePage', 'catalogueSize'];
export function listingAddress(params, perspective) {
  const query = new URLSearchParams();
  for (const key of LISTING_FILTER_KEYS) if (params.has(key)) query.set(key, params.get(key));
  query.set('perspective', perspective);
  return '#/admin-2/listing?' + query;
}
export function validListingReturn(value) {
  return typeof value === 'string' && /^#\/admin-2\/listing(?:\?|$)/.test(value) ? value : null;
}
export function listingPreferences(storage) {
  try { const value = JSON.parse(storage.getItem(LISTING_PREFERENCES_KEY)); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; } catch { return {}; }
}
export function rememberListing(storage, patch) {
  const next = { ...listingPreferences(storage), ...patch };
  try { storage.setItem(LISTING_PREFERENCES_KEY, JSON.stringify(next)); } catch { /* View preferences must not block business operations. */ }
  return next;
}
export function selectedCatalogueIds(storage, provider) {
  const values = listingPreferences(storage).selections?.[provider?.id];
  const available = provider ? providerCatalogueIds(provider) : [];
  return Array.isArray(values) ? [...new Set(values.filter(value => typeof value === 'string' && available.includes(value)))].slice(0, 100) : [];
}
export function rememberCatalogueSelection(storage, provider, ids) {
  rememberListing(storage, { selections: { ...listingPreferences(storage).selections, [provider.id]: ids } });
}
export function supplierListingRows(state, provider) {
  if (!provider) return [];
  const library = modelLibrary(state);
  return providerCatalogueIds(provider).map(catalogueModelId => {
    let matched = {}, issue = '';
    try { matched = catalogueModelMatch(state, provider.id, catalogueModelId); } catch (error) { issue = error.message; }
    const master = libraryRecord(state, matched.model?.id || matched.template?.id) || library.find(item => item.modelId.toLowerCase() === catalogueModelId.toLowerCase());
    const endpoints = catalogueConnections(state, provider, catalogueModelId);
    const endpoint = endpoints.find(item => item.id === matched.supply?.endpointId) || (endpoints.length === 1 ? endpoints[0] : null);
    const quote = providerCataloguePrice(provider, catalogueModelId);
    const cost = {
      items: (quote?.scenarios || []).map(({ listPrice, purchasePrice, ...item }) => ({ ...item, amount: cataloguePurchasePrice(listPrice, quote.discountFactor, purchasePrice) })),
      sourceVersion: JSON.stringify(quote ? { modelId: catalogueModelId, discountFactor: quote.discountFactor, scenarios: quote.scenarios } : null),
    };
    const costs = priceItems(cost, master), sale = matched.supply && matched.model && activeSupplySalePrice(state, matched.model.id, matched.supply.id);
    const draft = state.modelOnboardings.find(item => item.providerId === provider.id && item.catalogueModelId === catalogueModelId && item.status !== '已完成');
    if (!issue) issue = !master ? '待关联模型资料' : !endpoint ? '待配置接入地址' : connectionBlockReason(endpoint, provider) || (!costs.length || costs.some(item => item.amount == null) ? '待补齐采购价' : !matched.supply ? '待接入服务管理' : matched.supply.validationStatus !== '通过' ? '待检查模型' : !supplyPriceReady(state, matched.model, matched.supply.id) ? '待配置平台售价' : '');
    const selling = matched.supply?.salesEnabled && matched.supply.status === '已启用';
    return { catalogueModelId, master, model: matched.model, supply: matched.supply, endpoint, cost, costs, sale, draft, issue,
      type: master?.type || providerCatalogueModel(provider, catalogueModelId)?.type || '',
      selling, status: matched.supply ? supplySalesStatus(matched.supply) : '未纳入',
      ready: !issue && !selling && (matched.supply?.validationStatus === '通过') && (!matched.model || availableSupplies(state, matched.model.id).some(item => item.id === matched.supply.id) || matched.supply.status === '已停用'),
    };
  });
}
export function supplierBatchEntry(state, row) {
  return { catalogueModelId: row.catalogueModelId, draftId: row.draft?.id || '',
    libraryId: row.master?.id || '', libraryRevision: row.master?.updatedAt || '',
    endpointId: row.endpoint?.id || '', confirmedIdentity: false,
    prices: saleItemsDraft(row.costs, priceItems(row.sale, row.master)),
    sourceVersion: procurementVersion(row.cost),
    expectedSaleVersion: row.supply ? latestSaleRevision(state, row.supply.id) : '',
    listingScope: null,
  };
}
export function supplierPublishEntry(row) {
  return { catalogueModelId: row.catalogueModelId, draftId: row.draft?.id, draftRevision: row.draft?.updatedAt };
}
export function previewSupplierBatch(state, operation, providerId, entries) {
  let working = state;
  const ready = [], blocked = [];
  for (const entry of entries) {
    try { working = commitAdminState(working, { type: 'modelOperations', operation, data: { providerId, items: [entry] } }); ready.push(entry); }
    catch (error) { blocked.push({ catalogueModelId: entry.catalogueModelId, reason: error.message }); }
  }
  return { ready, blocked, revision: state.revision };
}
export { supplierDirectory };
