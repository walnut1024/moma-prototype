import { supplierChannelAssociations } from './supplier-resources.js';
import { resolveChannelAssociationModel } from './channel-association-model.js';

export function channelServiceContext(state, params) {
  if (!params.get('supplyProvider') || !params.get('supplyEndpoint')) return null;
  let ids; try { ids = JSON.parse(params.get('supplyAssociations') || '[]'); } catch { return { error: '接入返回信息无效，请从供应管理重新进入' }; }
  if (!Array.isArray(ids) || !ids.length || ids.length > 50 || ids.some(id => typeof id !== 'string') || new Set(ids).size !== ids.length) return { error: '接入选择范围无效' };
  const provider = state.providers.find(row => row.id === params.get('supplyProvider'));
  const endpoint = state.endpoints.find(row => row.id === params.get('supplyEndpoint') && row.providerId === provider?.id && !row.deletedAt);
  if (!provider || !endpoint) return { error: '原供应商或渠道已变化，请重新选择' };
  const mappings=supplierChannelAssociations(state,provider,endpoint.id);
  const rows = ids.map(id => {
    const association = mappings.find(row=>row.id===id);
    let master;try{if(association)master=resolveChannelAssociationModel(state,provider,association);}catch{/* An unresolved exact reference stays visible as missing. */}
    const service = master && state.models.find(row => row.id === master.id || row.templateId === master.id);
    return { id, association, master, service };
  });
  return { provider, endpoint, rows, missing: rows.filter(row => !row.association || !row.master).length };
}

export function channelServiceParameters({ providerId, endpointId, associationIds, origin }) {
  return { supplyProvider: providerId, supplyEndpoint: endpointId, supplyAssociations: JSON.stringify(associationIds), origin, model: null, view: null, type: null, mode: null, status: null, q: null, perspective: 'models', panel: null };
}

export function channelServiceReturn(context) {
  const query = new URLSearchParams({ perspective: 'suppliers', provider: context.provider.id, tab: 'catalogue', returnTestEndpoint: context.endpoint.id, returnTestAssociations: JSON.stringify(context.rows.map(row => row.id)) });
  return `#/admin-2/providers?${query}`;
}
