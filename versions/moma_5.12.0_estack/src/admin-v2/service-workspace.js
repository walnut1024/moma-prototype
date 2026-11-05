import { modelOperationsView } from '../mock/model-data.js';
import { modelCategory, modelCode, modelSupplies, activeSupplyPrice, activeSupplySalePrice, priceItems, supplyModelUrl, publicationChecks } from './model-management.js';
import { catalogueChannels, channelUrl, channelBlockReason, channelFingerprint } from './provider-channels.js';
import { MOMA_PROVIDER, providerCatalogueIds, supplierDirectory, displayedCatalogueIds } from './moma-provider.js';
import { cataloguePurchasePrice } from './provider-catalogue-pricing.js';
import { activeChannelProcurement } from './channel-change-management.js';

export function serviceDirectoryModels(state, linkedId, catalogue) {
  return modelOperationsView(state,catalogue,linkedId).models;
}

export function serviceIndexModels(state, params) {
  const query = (params.get('q') || '').trim().toLowerCase(), type = params.get('type'), mode = params.get('mode'), status = params.get('status');
  return serviceDirectoryModels(state, params.get('model'), params.get('catalogue')).filter(model =>
    (!query || [model.name, modelCode(model)].join(' ').toLowerCase().includes(query)) &&
    (!type || type === 'all' || modelCategory(model.type) === type) &&
    (!mode || mode === 'all' || (mode === 'unset' ? !model.serviceMode : model.serviceMode === mode)) &&
    (!status || status === 'all' || serviceLifecycle(model)==={listed:'已上架',unlisted:'已下架',unpublished:'未上架'}[status]));
}

export function selectServiceModel(rows, requestedId) {
  return requestedId !== null ? rows.find(model => model.id === requestedId) : rows.find(model => model.serviceReviewCase === 'video') || rows[0];
}
export function serviceLifecycle(model) {
  if (model.listingStatus==='已上架') return '已上架';
  return (model.serviceManaged || model.serviceReviewCase) && !model.firstPublishedAt?'未上架':'已下架';
}
export function serviceConfiguration(state,model) {
  if (!model.serviceMode) return {label:'未配置',issues:publicationChecks(state,model).filter(check=>!check.passed)};
  const issues=publicationChecks(state,model).filter(check=>check.tab!=='platform' && !check.passed);
  return {label:issues.length?'待完善':'已配置',issues};
}
export function serviceConfigurationTarget(model,check) {
  const base={panel:'pricing',providerEdit:null,providerAdd:null,providerChannels:null,providerAssociate:null,routeProvider:null,service:null,mapping:null};
  if (check.tab==='serviceMode') return {...base,panel:'routing'};
  if (check.tab==='publication') return {...base,panel:'pricing',scopeEdit:'1'};
  if (check.tab==='pricing' && model.serviceMode==='provider' && !providerServices(model).find(row=>row.providerId===check.providerId)?.callId) return {...base,panel:'routing',identityProvider:check.providerId};
  if (check.tab==='platform') return {...base,panel:'guide',routeProvider:check.providerId || null};
  if (check.tab==='supplies' && model.serviceMode==='provider') return {...base,panel:'routing',providerAdd:'1'};
  if (check.tab==='basic') return {...base,panel:'editMetadata'};
  if (check.tab==='routing') {
    const id=check.providerId?providerServiceId(model.id,check.providerId):'standard:'+model.id;
    return {...base,panel:'routing',routeProvider:check.providerId || null,[check.mapping?'mapping':'service']:id};
  }
  return {...base,providerEdit:check.providerId || null};
}
export function serviceSupplyRows(state, model) {
  if (!['standard','provider'].includes(model.serviceMode)) return [];
  return modelSupplies(state, model.id).map(supply => {
    const channel = supply.provider && catalogueChannels(state, supply.provider, supply.catalogueModelId || supply.upstreamModelId).find(item => item.endpointId === supply.endpointId && item.upstreamModelId === supply.upstreamModelId);
    return { ...supply, channelId: channel ? serviceChannelId(channel) : supply.channelId || supply.endpointId, channelName: channel?.name || supply.endpoint?.name || '渠道待配置', url: channel ? channelUrl(supply.provider, channel) : supplyModelUrl(supply, model), cost: channel?.managed ? {items:serviceChannelCosts(channel)} : activeSupplyPrice(state, supply.id), sale: activeSupplySalePrice(state, model.id, supply.id) };
  }).sort((a,b) => String(a.provider?.name).localeCompare(String(b.provider?.name), 'zh-CN'));
}
export function availableServiceChannels(state, provider, catalogueModelId) {
  if (!provider || !providerCatalogueIds(provider).includes(catalogueModelId)) return [];
  return catalogueChannels(state, provider, catalogueModelId).map(channel => {
    const existingCosts = !channel.managed && state.modelSupplies.filter(row => row.status !== '已移除' && row.endpointId === channel.endpointId && row.upstreamModelId === channel.upstreamModelId && (row.catalogueModelId || row.upstreamModelId) === catalogueModelId)
      .map(row => priceItems(activeSupplyPrice(state, row.id), state.models.find(model => model.id === row.modelId)))
      .find(items => items.length && items.every(item => item.amount != null));
    const costs = existingCosts || serviceChannelCosts(channel);
    return { ...channel, reason: channelBlockReason(provider, channel) || (!costs.length || costs.some(item => item.amount == null) ? '采购价待配置' : '') };
  });
}
export function serviceAssociationChannels(state) {
  return supplierDirectory(state).flatMap(provider => displayedCatalogueIds(provider,state).flatMap(catalogueModelId =>
    availableServiceChannels(state,provider,catalogueModelId).map(channel => ({...channel,provider,catalogueModelId,selectionId:JSON.stringify([provider.id,catalogueModelId,channel.id])}))));
}
export const serviceChannelRevision = channel => JSON.stringify([channelFingerprint(channel), channel.pricing, channel.enabled, channel.health]);
export const serviceChannelId = channel => channel.managed ? channel.id : channel.endpoint.endpointId || channel.endpointId;
export function serviceChannelCosts(channel, at = Date.now()) {
  const version = activeChannelProcurement(channel, at), pricing = version === undefined ? channel.pricing : version?.pricing;
  return (pricing?.scenarios || []).map(({ listPrice, purchasePrice, ...item }) => ({ ...item, amount: cataloguePurchasePrice(listPrice, pricing.discountFactor, purchasePrice) }));
}
export const activeModelSalePrice = (state, modelId, at = Date.now()) => state.modelSalePrices.filter(price => price.modelId === modelId && price.scope === 'model' && price.status === '已发布' && (price.serviceModeRevision || 0)===(state.models.find(model=>model.id===modelId)?.serviceModeRevision || 0) && Date.parse(price.effectiveAt) <= at).sort((a,b) => Date.parse(b.effectiveAt)-Date.parse(a.effectiveAt) || b.version-a.version)[0];
export const modelSaleRevision = (state, modelId) => state.modelSalePrices.filter(price => price.modelId === modelId && price.scope === 'model').sort((a,b) => b.version-a.version)[0]?.id || '';
export function unifiedBillingDraft(state, model) {
  const sale = activeModelSalePrice(state, model.id);
  const items = sale ? priceItems(sale, model) : [];
  return items.map(item => ({ name:item.name, condition:item.condition||'', unit:item.unit, currency:item.currency||'CNY', amount:sale && item.amount != null ? String(item.amount/1000000) : '' }));
}

export const providerServices = model => (model.serviceProviders || []).filter(item=>item.status !== '已移除');
export const providerServiceId = (modelId, providerId) => `provider:${modelId}:${providerId}`;
export const activeProviderPrice = (state, modelId, providerId, at = Date.now()) => state.modelSalePrices.filter(price=>price.modelId===modelId && price.scope==='provider' && price.providerId===providerId && price.status==='已发布' && (price.serviceModeRevision || 0)===(state.models.find(model=>model.id===modelId)?.serviceModeRevision || 0) && Date.parse(price.effectiveAt)<=at).sort((a,b)=>b.version-a.version)[0];
export const providerPriceRevision = (state, modelId, providerId) => state.modelSalePrices.filter(price=>price.modelId===modelId && price.scope==='provider' && price.providerId===providerId).sort((a,b)=>b.version-a.version)[0]?.id || '';
export function serviceBindingInUse(state, modelId, supplies, serviceId) {
  const ids=new Set(supplies.flatMap(item=>[item.id,item.channelId].filter(Boolean)));
  return (state.serviceRoutes || []).some(route=>{
    const current=route.versions.find(version=>version.version===route.activeVersion);
    const relevant=serviceId ? route.serviceId===serviceId : route.serviceId===`standard:${modelId}` || route.serviceId.startsWith(`provider:${modelId}:`);
    const refers=row=>serviceId || ids.has(row.supplyId);
    return relevant && (current?.config.channels.some(row=>row.enabled!==false && refers(row)));
  });
}

export const commercialTaskKey = (kind, providerId = '') => kind === 'scope' ? 'scope' : `price:${providerId || 'standard'}`;
export function commercialTaskBase(state, model, kind, providerId = '') {
  return JSON.stringify([model.serviceMode, model.serviceModeRevision || 0, model.modelId, kind === 'scope' ? [model.openScope, [...(model.tenantIds || [])].sort()] : [providerId, providerId ? providerServices(model).find(row => row.providerId === providerId)?.callId : '', providerId ? providerPriceRevision(state, model.id, providerId) : modelSaleRevision(state, model.id)]]);
}

export function servicePriceIdentity(state, model, providerId = '') {
  const provider = state.providers.find(row => row.id === (providerId || MOMA_PROVIDER.id));
  return { supplierName: provider?.name || '供应商已不存在', callId: providerId ? providerServices(model).find(row => row.providerId === providerId)?.callId || '' : model.modelId || '' };
}
