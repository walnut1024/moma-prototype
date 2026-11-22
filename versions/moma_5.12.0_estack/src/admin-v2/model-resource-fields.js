import { modelServiceKey, modelServiceIdentity, channelIdentity, modelDisplayName, priceItemReferences } from '../model-identities.mjs';
import { serviceReferences, offerKey } from '../service-access.mjs';
import { modelIdentityCatalogue } from './model-library.js';
import { providerKeyGroups } from './provider-key-groups.js';
import { activeChannelProcurement } from './channel-change-management.js';
import { cataloguePurchasePrice, catalogueAmountInput } from './provider-catalogue-pricing.js';
import { resourceKey } from './model-resource-scope.js';
import { platformRouteInterface } from './service-route-mapping.js';
import { serviceReferenceStarted } from './service-directory.js';
import { mappingConfig } from './service-model-mappings.js';
export { registeredResourceModels as registrationResources } from './model-resource-registration.js';

export const providerResourceFields = provider => ({ source_type: provider.sourceType || null, website: provider.website || '', documentation: provider.documentation || '', logo: provider.logo || '', description: provider.description || '', introduction: provider.introduction || '', contact: provider.contact || '', contact_info: provider.contactInfo || '', status: provider.status || null });
export const connectionResourceFields = connection => ({ interface_type: connection.interfaceType || null, address_mode: connection.addressMode || null,
  task_urls: connection.taskUrls || {}, timeout_seconds: connection.timeoutSeconds ?? null, adapter_options: connection.adapterOptions || {},
  auth_mode: connection.authMode || null, key_group_id: connection.keyGroupId || null, api_key_id: connection.apiKeyId || null,
  key_pool: (connection.keyPool || []).map(key => ({ api_key_id: key.keyId, priority: key.priority, enabled: key.enabled })),
  configuration_revision: connection.configurationRevision || 0 });

export function procurementResource(state, association) {
  const active = activeChannelProcurement(association), pricing = active === undefined ? association.pricing : active?.pricing;
  return { price_version_id: active?.id || null, revision: association.procurementRevision || 0,
    effective_at: active?.effectiveAt || null, expires_at: active?.expiresAt || null,
    items: (pricing?.scenarios || []).map((item, index) => ({ name: item.name, condition: item.condition || '', unit: item.unit, currency: item.currency,
      ...priceItemReferences(state, item), price_item_id: active?.id ? `${active.id}:item:${index}` : null,
      amount: catalogueAmountInput(cataloguePurchasePrice(item.listPrice, pricing.discountFactor, item.purchasePrice)) })) };
}

export const procurementHistoryResources = (state, association) => (association.procurementVersions || []).map(version => ({
  price_version_id: version.id, version: version.version, effective_at: version.effectiveAt, expires_at: version.expiresAt || null, status: version.status,
  items: (version.pricing?.scenarios || []).map((item, index) => ({ name: item.name, condition: item.condition || '', unit: item.unit, currency: item.currency,
    ...priceItemReferences(state, item), price_item_id: `${version.id}:item:${index}`, amount: catalogueAmountInput(cataloguePurchasePrice(item.listPrice, version.pricing.discountFactor, item.purchasePrice)) })) }));

export function serviceResourceFields(state, service) {
  const route = state.serviceRoutes?.find(row => row.serviceId === service.id), mappings = state.modelSupplies.filter(row => row.modelId === service.model.id && row.status !== '已移除'
    && (!service.providerId || (row.providerId || state.endpoints.find(endpoint => endpoint.id === row.endpointId)?.providerId) === service.providerId)
    && (!service.channelId || row.channelId === service.channelId || row.id === service.channelId));
  return { calls_enabled: serviceReferenceStarted(service.model, service), interface: platformRouteInterface(service.model),
    mappings: mappings.map(row => ({ mapping_id: row.id, channel_id: channelIdentity(state, row.channelId || row.id), connection_id: row.endpointId,
      provider_id: row.providerId || state.endpoints.find(endpoint => endpoint.id === row.endpointId)?.providerId || null, upstream_model_id: row.upstreamModelId,
      name: row.mappingName || '', mapping_revision: row.mappingRevision || 0, status: row.status, validation_status: row.validationStatus || null,
      configuration: mappingConfig({ ...row, providerId: row.providerId || state.endpoints.find(endpoint => endpoint.id === row.endpointId)?.providerId }, service.model),
      pending_configuration: row.serviceMapping?.pending ? { name: row.serviceMapping.pending.name, configuration: row.serviceMapping.pending.config } : null })),
    routing: route ? { id: route.id, active_version: route.activeVersion, draft: route.draft || null,
      versions: (route.versions || []).map(version => ({ version: version.version, configuration: version.config, published_at: version.publishedAt || null })) } : null };
}

export function resourceReferences(state, scope, all, rows, target) {
  const modelIds = new Set(rows.map(row => row.model_id).filter(Boolean));
  const selectedServices = serviceReferences(state).filter(service => rows.some(row => row.id === modelServiceIdentity(state, service.model, offerKey(service)) && row.type !== 'market_model'));
  const channelIds = new Set(rows.flatMap(row => [row.channel_id, ...(row.mappings || []).flatMap(mapping => [mapping.channel_id,
    mapping.pending_configuration?.configuration?.associationId ? channelIdentity(state, mapping.pending_configuration.configuration.associationId) : null])]).filter(Boolean));
  const channels = scope === 'channels' ? rows.filter(row => row.type === 'channel') : all.filter(row => row.type === 'channel' && channelIds.has(row.id));
  const connectionIds = new Set(channels.map(row => row.connection_id));
  const providerIds = new Set([...rows.flatMap(row => [row.provider_id, row.type === 'provider' ? row.id : null]), ...channels.map(row => row.provider_id)].filter(Boolean));
  const primary = new Set(rows.map(resourceKey));
  const referenced = all.filter(row => !primary.has(resourceKey(row)) && (row.type === 'provider' && providerIds.has(row.id) || row.type === 'connection' && connectionIds.has(row.id) || row.type === 'channel' && channelIds.has(row.id)));
  const connections = [...rows, ...referenced].filter(row => row.type === 'connection');
  const specificKeys = connections.flatMap(connection => {
    const endpoint = state.endpoints.find(row => row.id === connection.id), provider = state.providers.find(row => row.id === connection.provider_id);
    const ids = new Set([connection.api_key_id, ...connection.key_pool.map(key => key.api_key_id)].filter(Boolean));
    const keys = [...(provider?.apiKeys || []), ...(endpoint?.apiKeys || [])].filter(key => ids.has(key.id) || endpoint?.apiKeys?.some(owned => owned.id === key.id));
    return [...new Map(keys.map(key => [key.id, key])).values()].map(key => ({ type: 'api_key', id: key.id, provider_id: connection.provider_id,
      name: key.name || '', masked_value: key.masked || key.maskedValue || '', status: key.status || null }));
  });
  const keys = state.providers.filter(provider => providerIds.has(provider.id)).flatMap(provider => {
    const groups = providerKeyGroups(provider).filter(group => target.level === 'provider' || target.level === 'module' && scope === 'channels' || connections.some(connection => connection.provider_id === provider.id && connection.key_group_id === group.id || connection.provider_id === provider.id && connection.auth_mode === 'inherit' && group.id === 'default'));
    return groups.map(group => ({ type: 'key_group', id: group.id, provider_id: provider.id, name: group.name,
      keys: group.keyIds.map(id => provider.apiKeys?.find(key => key.id === id)).filter(Boolean).map(key => ({ id: key.id, name: key.name || '', status: key.status || null, masked_value: key.masked || key.maskedValue || '' })) }));
  });
  const models = modelIdentityCatalogue(state).filter(model => modelIds.has(model.id)).map(model => ({ type: 'model', id: model.id,
    canonical_slug: model.modelId, name: modelDisplayName(state, model.id) || model.name, model_type: model.type }));
  const dictionaryIds = new Set(rows.flatMap(row => [...(row.items || []), ...(row.procurement?.items || [])]).flatMap(item => [item.billing_item_id, item.unit_id, item.currency_id]).filter(Boolean));
  const dictionary = (state.tariffDictionary || []).filter(row => dictionaryIds.has(row.id)).map(row => ({ type: 'dictionary', id: row.id, kind: row.kind, name: row.name, code: row.code || null }));
  const prices = scope === 'prices' ? state.modelSalePrices.flatMap(price => {
    const service = selectedServices.find(service => price.modelId === service.model.id && (service.providerId ? price.scope === 'provider' && offerKey(price) === offerKey(service) : price.scope === 'model'));
    if (!service) return [];
    const epoch = price.serviceModeRevision ?? 1, key = price.scope === 'provider' ? offerKey(price) : '';
    const owner = state.modelData?.resourceIds?.[modelServiceKey(service.model, key, epoch)]
      || (epoch === (service.model.serviceModeRevision ?? 1) ? modelServiceIdentity(state, service.model, key) : null);
    if (target.model_service_id && owner !== target.model_service_id) return [];
    return [{ type: 'price_version', id: price.id, model_service_id: owner, service_mode_revision: price.serviceModeRevision ?? null,
      version: price.version, effective_at: price.effectiveAt, expires_at: price.expiresAt || null,
      items: (price.items || []).map(item => ({ name: item.name, condition: item.condition || '', unit: item.unit, currency: item.currency, amount: catalogueAmountInput(item.amount), ...priceItemReferences(state, item) })) }];
  }) : [];
  return [...new Map([...models, ...referenced, ...keys, ...specificKeys, ...dictionary, ...prices].map(row => [resourceKey(row), row])).values()];
}
