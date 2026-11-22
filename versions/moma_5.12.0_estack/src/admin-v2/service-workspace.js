import { modelIdentity, modelServiceIdentity, modelPresentation } from '../model-identities.mjs';
import { offerKey, providerOffer } from '../service-access.mjs';
import { modelOperationsView } from '../mock/model-data.js';
import { modelCategory, modelCode, modelSupplies, activeSupplyPrice, activeSupplySalePrice, priceItems, supplyModelUrl, publicationChecks } from './model-management.js';
import { catalogueChannels, channelUrl, channelBlockReason, channelFingerprint } from './provider-channels.js';
import { MOMA_PROVIDER, providerCatalogueIds, supplierDirectory, displayedCatalogueIds } from './moma-provider.js';
import { cataloguePurchasePrice } from './provider-catalogue-pricing.js';
import { activeChannelProcurement } from './channel-change-management.js';
import { hasMatchingCallStatus, matchesCallStatus, modelServiceStarted } from './service-directory.js';

export function serviceDirectoryModels(state, linkedId, catalogue) {
  return modelOperationsView(state,catalogue,linkedId).models.filter(model => !model.deletedAt);
}

export function serviceSourceIds(state) {
  const configured = state.models.filter(model => !model.deletedAt && ['standard', 'provider'].includes(model.serviceMode));
  return new Set([...serviceDirectoryModels(state), ...configured].flatMap(model => [model.id, model.templateId]));
}

export const serviceDisplayName = model => model?.serviceName || model?.name;

export const DUPLICATE_SERVICE_NAME = '模型服务名称已存在';
// Keep service creation within the existing D1 atomic statement budget.
export const SERVICE_CREATION_LIMIT = 5;

export function serviceNameInUse(state, name, currentId) {
  const key = name.trim().toLowerCase();
  return Boolean(key && state.models.some(model =>
    !model.deletedAt && model.id !== currentId && serviceDisplayName(model)?.trim().toLowerCase() === key));
}

export function serviceIndexModels(state, params, { byCall = false } = {}) {
  const query = (params.get('q') || '').trim().toLowerCase(), type = params.get('type'), mode = params.get('mode'), status = params.get('status');
  return serviceDirectoryModels(state, params.get('model'), params.get('catalogue')).filter(model =>
    (status==='archived'?Boolean(model.archivedAt):!model.archivedAt) &&
    (!query || [model.serviceName, modelPresentation(state,model).name, modelCode(model), modelIdentity(state,model).canonical_slug, modelIdentity(state,model).id, modelServiceIdentity(state,model), ...providerServices(model).flatMap(service=>[service.callId, modelServiceIdentity(state,model,service.channelId || service.providerId)])].join(' ').toLowerCase().includes(query)) &&
    (!type || type === 'all' || modelCategory(model.type) === type) &&
    (!mode || mode === 'all' || (mode === 'unset' ? !model.serviceMode : model.serviceMode === mode)) &&
    (byCall ? hasMatchingCallStatus(model, status) : matchesCallStatus(status, modelServiceStarted(model))));
}

export function selectServiceModel(rows, requestedId) {
  return requestedId !== null ? rows.find(model => model.id === requestedId) : rows.find(model => model.serviceReviewCase === 'video') || rows[0];
}
export function serviceConfiguration(state,model) {
  const issues=publicationChecks(state,model,{technical:true}).filter(check=>!check.passed),setupIssues=issues.filter(check=>check.tab!=='platform');
  return {label:!model.serviceMode?'未配置':setupIssues.length?'待配置':issues.length?'待验证':model.callsEnabled?'已启用':'可启用',issues,setupIssues};
}

export function serviceConfigurationTarget(model,check) {
  if (check.tab==='basic') return {page:'model-templates',view:'template',template:model.templateId || model.id,materialMode:'edit'};
  if (check.tab==='pricing' && (model.serviceMode!=='provider' || providerOffer(model,check.providerId)?.callId)) {
    return {page:'model-prices',service:model.serviceMode==='provider'?providerServiceId(model.id,check.providerId):'standard:'+model.id,tab:'pricing'};
  }
  return null;
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
  return catalogueChannels(state, provider, catalogueModelId).map(channel => ({ ...channel, reason: channelBlockReason(provider, channel) }));
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
const currentSale = (rows,at) => { const price=rows[0];return price && (!price.expiresAt || Date.parse(price.expiresAt)>at) ? price : undefined; };
export const activeModelSalePrice = (state, modelId, at = Date.now()) => currentSale( state.modelSalePrices.filter(price => price.modelId === modelId && price.scope === 'model' && price.status === '已发布' && (price.serviceModeRevision || 0)===(state.models.find(model=>model.id===modelId)?.serviceModeRevision || 0) && Date.parse(price.effectiveAt) <= at).sort((a,b) => Date.parse(b.effectiveAt)-Date.parse(a.effectiveAt) || b.version-a.version),at);
export const modelSaleRevision = (state, modelId) => state.modelSalePrices.filter(price => price.modelId === modelId && price.scope === 'model').sort((a,b) => b.version-a.version)[0]?.id || '';
export function unifiedBillingDraft(state, model) {
  const sale = activeModelSalePrice(state, model.id);
  const items = sale ? priceItems(sale, model) : [];
  return items.map(item => ({ name:item.name, condition:item.condition||'', unit:item.unit, currency:item.currency||'CNY', amount:sale && item.amount != null ? String(item.amount/1000000) : '' }));
}

export const providerServices = model => (model.serviceProviders || []).filter(item=>item.status !== '已移除');
export const serviceCallIdentifiers = model => [...new Set((model.serviceMode === 'provider'
  ? providerServices(model).map(service => service.callId) : [model.modelId]).filter(Boolean))];
export const providerServiceId = (modelId, providerId) => `provider:${modelId}:${providerId}`;
export const activeProviderPrice = (state, modelId, providerId, at = Date.now()) => currentSale( state.modelSalePrices.filter(price=>price.modelId===modelId && price.scope==='provider' && (price.channelId || price.providerId)===providerId && price.status==='已发布' && (price.serviceModeRevision || 0)===(state.models.find(model=>model.id===modelId)?.serviceModeRevision || 0) && Date.parse(price.effectiveAt)<=at).sort((a,b)=>Date.parse(b.effectiveAt)-Date.parse(a.effectiveAt) || b.version-a.version),at);
export const providerPriceRevision = (state, modelId, providerId) => state.modelSalePrices.filter(price=>price.modelId===modelId && price.scope==='provider' && offerKey(price)===providerId).sort((a,b)=>b.version-a.version)[0]?.id || '';
export function serviceBindingInUse(state, modelId, supplies, serviceId) {
  const ids=new Set(supplies.flatMap(item=>[item.id,item.channelId].filter(Boolean)));
  return (state.serviceRoutes || []).some(route=>{
    const current=route.versions.find(version=>version.version===route.activeVersion);
    const relevant=serviceId ? route.serviceId===serviceId : route.serviceId===`standard:${modelId}` || route.serviceId.startsWith(`provider:${modelId}:`);
    const refers=row=>serviceId || ids.has(row.supplyId);
    return relevant && (current?.config.channels.some(row=>row.enabled!==false && refers(row)));
  });
}

export const commercialPriceKey = (providerId = '') => `price:${providerId || 'standard'}`;
export function commercialPriceBase(state, model, providerId = '') {
  return JSON.stringify([model.serviceMode, model.serviceModeRevision || 0, model.modelId, [providerId, providerId ? providerOffer(model, providerId)?.callId : '', providerId ? providerPriceRevision(state, model.id, providerId) : modelSaleRevision(state, model.id)]]);
}

export function servicePriceIdentity(state, model, providerId = '') {
  const entry = providerOffer(model, providerId);
  const provider = state.providers.find(row => row.id === (entry?.providerId || MOMA_PROVIDER.id));
  return { supplierName: provider?.name || '服务商已不存在', callId: providerId ? entry?.callId || '' : model.modelId || '' };
}
