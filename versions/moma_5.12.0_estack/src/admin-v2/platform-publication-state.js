import { serviceReferences, offerKey } from '../service-access.mjs';
import { connectionFingerprint, connectionKeys } from './connection-state.js';

export function platformPublicationServices(model) {
  return serviceReferences({models:[model]}).map(({id,providerId,callId,channelId})=>({id,providerId,callId,...(channelId ? {channelId} : {})}));
}
export function platformPublicationFingerprint(state, model, serviceId) {
  const service = platformPublicationServices(model).find(row => row.id === serviceId);
  if (!service) return '';
  const route = (state.serviceRoutes || []).find(row => row.serviceId === serviceId), version = route?.versions.find(row => row.version === route.activeVersion);
  const ids = new Set((version?.config.channels || []).filter(row => row.enabled !== false && (!['weighted','priority_weighted'].includes(version.config.strategy) || row.weight > 0)).map(row => row.supplyId));
  const supplies = (state.modelSupplies || []).filter(row => row.modelId === model.id && ids.has(row.id)).sort((a,b) => a.id.localeCompare(b.id));
  const connections = supplies.map(supply => {
    const endpoint = state.endpoints.find(row => row.id === supply.endpointId), provider = state.providers.find(row => row.id === endpoint?.providerId);
    const association = provider?.catalogConnections?.find(row => !row.deletedAt && row.endpointId === supply.endpointId && row.modelId === (supply.catalogueModelId || supply.upstreamModelId) && row.upstreamModelId === supply.upstreamModelId);
    return [supply.id, supply.status, supply.validationStatus, supply.upstreamModelId, supply.capabilities, provider?.id, provider?.status, endpoint && connectionFingerprint(endpoint), endpoint?.status, connectionKeys(endpoint, provider).map(key=>[key.id,key.version,key.fingerprint,key.status,key.revokedAt]), association && [association.id,association.enabled,association.upstreamModelId,association.capabilities,association.task,association.qualification || association.health,association.capabilityTests]];
  });
  // Preserve the fingerprint of existing validation receipts, including their retired scope fields.
  return JSON.stringify([service, model.templateId, model.type, model.serviceModeRevision || 0, model.capabilities, model.profile?.tasks, model.profile?.structured, model.openScope, model.tenantIds, version?.version || 0, version?.config || null, connections]);
}
export function platformPublicationCheck(state, model, at = Date.now(), serviceId) {
  const services = platformPublicationServices(model).filter(row=>!serviceId || row.id===serviceId);
  const missing = services.filter(service => !(model.platformPublications || []).some(record => record.serviceId === service.id && record.source === 'mock' && Number.isFinite(Date.parse(record.recordedAt)) && Date.parse(record.recordedAt)<=at && at-Date.parse(record.recordedAt)<=24*60*60*1000 && record.fingerprint === platformPublicationFingerprint(state,model,service.id,at)));
  return { label: missing.length || !services.length ? '平台试调用验证后的配置待发布' : '平台试调用验证后的配置已发布', passed: services.length > 0 && !missing.length, tab: 'platform', providerId: offerKey(missing[0]) || null };
}
