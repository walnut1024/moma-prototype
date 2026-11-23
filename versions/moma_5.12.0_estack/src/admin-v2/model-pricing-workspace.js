import { modelIdentity, modelServiceIdentity, modelPresentation } from '../model-identities.mjs';
import { offerKey } from '../service-access.mjs';
import { MOMA_PROVIDER } from './moma-provider.js';
import { activeChannelProcurement } from './channel-change-management.js';
import { serviceChannelCosts, activeModelSalePrice, activeProviderPrice } from './service-workspace.js';
import { activeSupplyPrice, priceItems } from './model-management.js';
import { routingServices } from './service-routing.js';
import { salesStatus } from './service-sales.js';

export function costRecords(state, groups) {
  const rows = new Map();
  for (const { owner: provider, master, channels } of groups) {
    for (const association of channels) {
      const key = `${provider.id}:${association.id}`;
      if (rows.has(key)) continue;
      const supply = state.modelSupplies.find(row => row.status !== '已移除' && (row.channelId ? row.channelId === association.id : row.endpointId === association.endpointId && (row.catalogueModelId || row.upstreamModelId) === association.modelId && row.upstreamModelId===association.upstreamModelId));
      const active = activeChannelProcurement(association);
      const legacy = !association.managed && supply ? activeSupplyPrice(state,supply.id) : null;
      const items = legacy ? priceItems(legacy,master || {}) : serviceChannelCosts(association);
      rows.set(key,{key,provider,association,master,items,modelKey:JSON.stringify([master ? 'master' : 'unresolved',master?.id || association.modelId]),modelName:master?.name || association.modelId,supplierId:provider.id,supplierName:provider.name,active:active || legacy,status:items.length && items.every(row => row.amount != null) ? '已配置' : active === null ? '已失效' : '待配置'});
    }
  }
  return [...rows.values()];
}

export const priceRecords = state => routingServices(state).filter(row =>
  !row.model.archivedAt).map(service => {
  const supplierId=service.providerId || MOMA_PROVIDER.id;
  return {...service,modelKey:JSON.stringify(['master',service.model.templateId || service.modelId]),modelName:modelPresentation(state,service.model).name,canonical_slug:modelIdentity(state,service.model).canonical_slug,model_service_id:modelServiceIdentity(state,service.model,offerKey(service)),supplierId,supplierName:state.providers.find(row=>row.id===supplierId)?.name || (service.providerId ? service.name : MOMA_PROVIDER.name),offerName:service.providerId?service.name:(state.providers.find(row=>row.id===supplierId)?.name || MOMA_PROVIDER.name),status:salesStatus(service.model,offerKey(service)),price:service.providerId ? activeProviderPrice(state,service.modelId,offerKey(service)) : activeModelSalePrice(state,service.modelId)};
});

export function filterPricingRecords(records,params, filterBySupplier = true) {
  return records.filter(row=>(!params.has('filterModel') || row.modelKey===params.get('filterModel')) && (!filterBySupplier || !params.has('filterSupplier') || row.supplierId===params.get('filterSupplier')) && (!params.has('filterStatus') || row.status===params.get('filterStatus')));
}

export function pricingFilterOptions(records) {
  return {
    models:[...new Map(records.map(row=>[row.modelKey,row.modelName]))],
    suppliers:[...new Map(records.map(row=>[row.supplierId,row.supplierName]))],
  };
}

export function pricingTableRows(records,itemsFor) {
  const groups=new Map();
  for(const record of records){
    if(!groups.has(record.modelKey))groups.set(record.modelKey,[]);
    const items=itemsFor(record);
    const lines=items.length?items:[null];
    groups.get(record.modelKey).push(...lines.map((item,index)=>({...record,item,tableKey:(record.key || record.id)+':'+index,recordSpan:index===0?lines.length:0})));
  }
  return [...groups.values()].flatMap(group=>group.map((row,index)=>({...row,modelSpan:index===0?group.length:0})));
}

export function operationsReturn(value) {
  return typeof value === 'string' && value.length <= 5000 && /^#\/admin-2\/(providers-reference|listing-new|model-market|model-prices|model-templates|provider-materials|tariff-dictionary)(?:\?[^\s#]*)?$/.test(value) ? value : null;
}

export function supplyCostTableRows(models, records) {
  const costs = new Map(records.map(record => [record.key, record]));
  return models.flatMap(model => {
    const rows = model.groups.flatMap(group => group.channels.map(channel => {
      const cost = channel && costs.get(group.owner.id + ':' + channel.id);
      return { model, group, channel, cost, items: cost?.items || [],
        tableKey: JSON.stringify([model.id, group.owner.id, channel?.id]) };
    }));
    return rows.map((row, index) => ({ ...row, modelSpan: index === 0 ? rows.length : 0 }));
  });
}
