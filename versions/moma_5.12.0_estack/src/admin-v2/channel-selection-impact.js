import { activeRouteVersion, routingChannels, routingServices, serviceRoute } from './service-routing.js';
import { catalogueChannels } from './provider-channels.js';

export function channelSelectionGroups(selections) {
  const groups = new Map();
  for (const selection of selections) {
    const key = JSON.stringify([selection.providerId, selection.endpointId]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ ...selection });
  }
  return [...groups.values()].flatMap(rows => Array.from({ length: Math.ceil(rows.length / 50) }, (_, index) => ({ providerId: rows[0].providerId, endpointId: rows[0].endpointId, selections: rows.slice(index * 50, (index + 1) * 50) })));
}

export function channelSelectionServiceImpact(state, selections) {
  const selectedSupplyIds = new Set(selections.flatMap(selection => {
    const provider = state.providers.find(row => row.id === selection.providerId);
    const association = provider && catalogueChannels(state, provider, selection.modelId).find(row => row.id === selection.associationId && row.endpointId === selection.endpointId);
    return association ? state.modelSupplies.filter(supply => supply.status !== '已移除' && supply.endpointId === association.endpointId && (supply.catalogueModelId || supply.upstreamModelId) === association.modelId && supply.upstreamModelId === association.upstreamModelId).map(row => row.id) : [];
  }));
  return routingServices(state).flatMap(service => {
    const current = activeRouteVersion(serviceRoute(state, service.id));
    const allowed = current?.config.channels.filter(row => row.enabled !== false) || [];
    const affected = allowed.filter(row => selectedSupplyIds.has(row.supplyId));
    if (!affected.length) return [];
    const candidates = routingChannels(state, service);
    const remaining = allowed.filter(row => !selectedSupplyIds.has(row.supplyId)).map(row => candidates.find(candidate => candidate.id === row.supplyId)).filter(row => row?.available);
    return [{ id: service.id, name: `${service.model.name} · ${service.name}`, callId: service.callId, routeVersion: current.version, affectedSupplyIds: affected.map(row => row.supplyId), remaining: remaining.map(row => ({ id: row.id, provider: row.provider.name, channel: row.channelName || row.endpoint.name, upstreamModelId: row.upstreamModelId })), unavailable: !remaining.length }];
  });
}
