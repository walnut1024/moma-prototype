import { catalogueChannels } from './provider-channels.js';
import { supplierDirectory, providerCatalogueIds } from './moma-provider.js';
import { resolveChannelAssociationModel } from './channel-association-model.js';
import { activeChannelProcurement } from './channel-change-management.js';
import { serviceChannelCosts, activeModelSalePrice, activeProviderPrice } from './service-workspace.js';
import { activeSupplyPrice, priceItems } from './model-management.js';
import { routingServices } from './service-routing.js';

export function costRecords(state) {
  const rows = new Map();
  for (const provider of supplierDirectory(state)) for (const modelId of providerCatalogueIds(provider)) {
    for (const association of catalogueChannels(state,provider,modelId)) {
      const key = `${provider.id}:${association.id}`;
      if (rows.has(key)) continue;
      let master;
      try { master = resolveChannelAssociationModel(state,provider,association); } catch { /* Unresolved identities remain visible for repair. */ }
      const supply = state.modelSupplies.find(row => row.status !== '已移除' && row.endpointId === association.endpointId && (row.catalogueModelId || row.upstreamModelId) === association.modelId);
      const active = activeChannelProcurement(association);
      const legacy = !association.managed && supply ? activeSupplyPrice(state,supply.id) : null;
      const items = legacy ? priceItems(legacy,master || {}) : serviceChannelCosts(association);
      rows.set(key,{key,provider,association,master,items,active:active || legacy,status:items.length && items.every(row => row.amount != null) ? '已配置' : active === null ? '已失效' : '待配置'});
    }
  }
  return [...rows.values()];
}

export const priceRecords = state => routingServices(state).filter(row => !row.model.archivedAt).map(service => ({...service,price:service.providerId ? activeProviderPrice(state,service.modelId,service.providerId) : activeModelSalePrice(state,service.modelId)}));

export function operationsReturn(value) {
  return typeof value === 'string' && value.length <= 5000 && /^#\/admin-2\/(providers|listing|model-costs|model-prices|model-templates|tariff-dictionary)(?:\?[^\s#]*)?$/.test(value) ? value : null;
}
