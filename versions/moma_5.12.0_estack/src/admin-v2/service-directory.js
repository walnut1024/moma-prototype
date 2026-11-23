import { modelIdentity } from '../model-identities.mjs';
import { offerKey, providerOffer, serviceCallsEnabled, serviceReferences } from '../service-access.mjs';

// Public inference routes mounted by the prototype Worker.
const platformEndpoints = [
  { protocol: 'OpenAI Chat', method: 'POST', path: '/api/v1/chat/completions', modelTypes: ['text', 'multimodal'] },
];

export const callStateLabel = started => started ? '服务中' : '已停服';
export const matchesCallStatus = (status, started) => status !== 'started' && status !== 'stopped' || started === (status === 'started');

export function serviceReferenceStarted(model, service) {
  const entry = service?.providerId ? providerOffer(model, offerKey(service)) : undefined;
  return Boolean(service?.callId && serviceCallsEnabled(model, entry));
}

function referenceChannels(model, service, state) {
  const providers = new Map(state.providers.map(provider => [provider.id, provider]));
  const entry = service?.providerId ? providerOffer(model, offerKey(service)) : null;
  if (service?.channelId) {
    const provider = providers.get(service.providerId), channel = provider?.catalogConnections?.find(row => row.id === service.channelId);
    return [{ key: service.channelId, id: service.channelId, providerName: provider?.name || entry?.providerName || '服务商已不存在', name: channel?.sourceName || channel?.name || entry?.channelName || '上游模型名称未配置' }];
  }
  const channels = (state.modelSupplies || []).filter(row => row.modelId === model.id && row.status !== '已移除').flatMap(supply => {
    const endpoint = state.endpoints?.find(row => row.id === supply.endpointId), providerId = supply.providerId || endpoint?.providerId;
    if (service?.providerId && providerId !== service.providerId) return [];
    const provider = providers.get(providerId);
    const matches = (provider?.catalogConnections || []).filter(row => supply.channelId ? row.id === supply.channelId : row.endpointId === supply.endpointId && row.upstreamModelId === supply.upstreamModelId && row.modelId === (supply.catalogueModelId || supply.upstreamModelId));
    const channel = matches.length === 1 ? matches[0] : null, id = supply.channelId || channel?.id || '';
    return [{ key: id || supply.id, id, providerName: provider?.name || '服务商已不存在', name: channel?.sourceName || channel?.name || entry?.channelName || '上游模型名称未配置' }];
  });
  return [...new Map(channels.map(row => [row.key, row])).values()];
}

function serviceDirectoryReferences(model, state = {}) {
  const references = serviceReferences({ ...state, models: [model] });
  return references.length ? references : [null];
}

export const modelServiceStarted = model => serviceDirectoryReferences(model).some(service => serviceReferenceStarted(model, service));
export const hasMatchingCallStatus = (model, status) => serviceDirectoryReferences(model)
  .some(service => matchesCallStatus(status, serviceReferenceStarted(model, service)));

export function serviceDirectoryRows(models, state, status) {
  const providerNames = new Map(state.providers.map(provider => [provider.id, provider.name]));
  return models.flatMap(model => {
    const services = serviceDirectoryReferences(model, state).filter(service => matchesCallStatus(status, serviceReferenceStarted(model, service)));
    const endpoints = platformEndpoints.filter(endpoint => endpoint.modelTypes.includes(model.type));
    return services.map(service => {
      const entry = service?.providerId ? providerOffer(model, offerKey(service)) : null;
      const callId = service?.callId || '';
      return {
        id: service?.id || model.id,
        model,
        providerKey: service?.providerId ? offerKey(service) : null,
        channelId: service?.channelId,
        name: model.serviceName || model.name,
        canonical_slug: modelIdentity(state, model).canonical_slug,
        channels: referenceChannels(model, service, state),
        providerName: service?.providerId ? providerNames.get(service.providerId) || entry?.providerName || '服务商已不存在' : '',
        channelName: entry?.channelName,
        callId,
        model_service_id: service?.model_service_id || '',
        endpoints: callId ? endpoints : [],
        started: serviceReferenceStarted(model, service),
        stopReason: serviceReferenceStarted(model, service) ? '' : entry?.channelUnavailableReason || (['channel-unavailable', 'channel-removal'].includes(model.lifecycleStopReason) ? model.lifecycleStopReason === 'channel-unavailable' ? '连接未接入' : '连接待移除' : ''),
      };
    });
  });
}
