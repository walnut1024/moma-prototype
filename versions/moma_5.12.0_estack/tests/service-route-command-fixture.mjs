import {mappingCandidates, mappingConfig, mappingPreview, mappingSourceVersion} from '../src/admin-v2/service-model-mappings.js';
import {routingChannels, routeSourceVersion, serviceRoute, activeRouteVersion, emptyRouteConfig} from '../src/admin-v2/service-routing.js';
import {platformRouteInterface} from '../src/admin-v2/service-route-mapping.js';

// Builds command input for existing service records with versioned routes.
export function routeCommandCandidates(state, service) {
  const existing = routingChannels(state, service);
  const candidates = mappingCandidates(state, service);
  return [...existing.map(row => ({...row, selectable: !row.serviceMapping?.pending && candidates.some(source => source.endpointId === row.endpointId && source.id === row.channelId && !source.reason), source: mappingConfig(row, service.model)})), ...candidates.filter(row => !existing.some(supply => supply.endpointId === row.endpointId)).map(row => {
    const source = {providerId: row.provider.id, endpointId: row.endpointId, associationId: row.id, catalogueModelId: row.catalogueModelId, upstreamModelId: row.upstreamModelId, platformInterface: platformRouteInterface(service.model).path};
    let reason = row.reason;
    if (!reason) try { mappingPreview(state, service, source); } catch (error) { reason = error.message; }
    return {...row, id: `candidate:${row.selectionId}`, channelId: row.id, channelName: row.name || row.endpoint.name, source, reason, available: !reason, candidate: true};
  })];
}

export function routeCommandPayload(state, service, config, channels, removeIds = []) {
  return {serviceId: service.id, expectedVersion: serviceRoute(state, service.id)?.activeVersion || 0, sourceVersion: routeSourceVersion(state, service), mappingSource: mappingSourceVersion(state, service), config, sources: config.channels.filter(row => row.enabled && channels.find(channel => channel.id === row.supplyId)?.candidate).map(row => ({key: row.supplyId, config: channels.find(channel => channel.id === row.supplyId).source})), removeIds, confirmed: true};
}


export function routeCommandConfig(service, route) {
  return structuredClone(activeRouteVersion(route)?.config ?? emptyRouteConfig(service));
}
