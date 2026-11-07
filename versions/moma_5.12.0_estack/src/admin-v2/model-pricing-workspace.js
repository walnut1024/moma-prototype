import { catalogueChannels } from './provider-channels.js';
import { MOMA_PROVIDER, supplierDirectory, providerCatalogueIds } from './moma-provider.js';
import { resolveChannelAssociationModel } from './channel-association-model.js';
import { activeChannelProcurement } from './channel-change-management.js';
import { serviceChannelCosts, activeModelSalePrice, activeProviderPrice } from './service-workspace.js';
import { activeSupplyPrice, priceItems } from './model-management.js';
import { routingServices } from './service-routing.js';
import { salesStatus } from './service-sales.js';

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
      rows.set(key,{key,provider,association,master,items,modelKey:JSON.stringify([master ? 'master' : 'unresolved',master?.id || association.modelId]),modelName:master?.name || association.modelId,supplierId:provider.id,supplierName:provider.name,active:active || legacy,status:items.length && items.every(row => row.amount != null) ? '已配置' : active === null ? '已失效' : '待配置'});
    }
  }
  return [...rows.values()];
}

export const priceRecords = state => routingServices(state).filter(row => !row.model.archivedAt).map(service => {
  const supplierId=service.providerId || MOMA_PROVIDER.id;
  return {...service,modelKey:JSON.stringify(['master',service.model.templateId || service.modelId]),modelName:service.model.name,supplierId,supplierName:state.providers.find(row=>row.id===supplierId)?.name || (service.providerId ? service.name : MOMA_PROVIDER.name),status:salesStatus(state,service.model,service.providerId),price:service.providerId ? activeProviderPrice(state,service.modelId,service.providerId) : activeModelSalePrice(state,service.modelId)};
});

export function filterPricingRecords(records,params) {
  return records.filter(row=>(!params.has('filterModel') || row.modelKey===params.get('filterModel')) && (!params.has('filterSupplier') || row.supplierId===params.get('filterSupplier')) && (!params.has('filterStatus') || row.status===params.get('filterStatus')));
}

export function pricingFilterOptions(records) {
  return {
    models:[...new Map(records.map(row=>[row.modelKey,row.modelName]))],
    suppliers:[...new Map(records.map(row=>[row.supplierId,row.supplierName]))],
  };
}

export function pricingTableRows(records,withItems=false) {
  const groups=new Map();
  for(const record of records){
    if(!groups.has(record.modelKey))groups.set(record.modelKey,[]);
    const items=withItems?priceItems(record.price,record.model):[];
    const lines=items.length?items:[null];
    groups.get(record.modelKey).push(...(withItems?lines:[null]).map((item,index)=>({...record,item,tableKey:(record.key || record.id)+':'+index,serviceSpan:index===0?lines.length:0})));
  }
  return [...groups.values()].flatMap(group=>group.map((row,index)=>({...row,modelSpan:index===0?group.length:0})));
}

export function operationsReturn(value) {
  return typeof value === 'string' && value.length <= 5000 && /^#\/admin-2\/(providers|listing|model-costs|model-prices|model-templates|tariff-dictionary)(?:\?[^\s#]*)?$/.test(value) ? value : null;
}
