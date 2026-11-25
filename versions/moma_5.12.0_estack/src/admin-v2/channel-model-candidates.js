import { CHANNEL_LIST_TYPES, channelListType } from './channel-connection-directory.js';
import { modelTaskUrl } from './channel-interface.js';
import { channelInterfaceIssue } from './provider-channels.js';
import { providerMaterialModels } from './provider-materials.js';
import { modelTypeLabel } from '../model-types.mjs';

const requestAddress = value => (value || '').trim().replace(/\/+$/, '');
const validUpstreamId = value => Boolean(value && value.length <= 200 && !/[\s\p{Cc}]/u.test(value));

function taskUrl(endpoint, model) {
  try { return requestAddress(modelTaskUrl(endpoint, model.type)); }
  catch { return ''; }
}

export function channelModelCandidates(state, channel) {
  const { provider, endpoint, models } = channel;
  const format = channelListType(channel);
  if (!CHANNEL_LIST_TYPES.some(type => type.label === format)) return [];
  const added = new Set(models.map(row => row.master?.id));
  const existingIds = new Set([
    ...models.map(row => row.association.upstreamModelId),
    ...(provider.catalogConnections || []).filter(row => row.endpointId === endpoint.id && !row.deletedAt).map(row => row.upstreamModelId),
  ]);
  return providerMaterialModels(state, provider).flatMap(({ master: model, entry }) => {
    const offer = entry?.offerFields;
    if (!offer?.bindings?.length) return [];
    const targetUrl = taskUrl(endpoint, model);
    if (!targetUrl) return [];
    const ids = new Set(offer.bindings.filter(({ protocol, url, upstream }) =>
      protocol === format && requestAddress(url) === targetUrl && validUpstreamId(upstream)).map(row => row.upstream));
    if (ids.size !== 1) return [];
    const [upstreamModelId] = ids;
    if (channelInterfaceIssue(provider, { type: model.type, endpoint, upstreamModelId })) return [];
    return [{
      id: model.id, model, displayName: offer.name || model.name, upstreamModelId,
      added: added.has(model.id), duplicate: existingIds.has(upstreamModelId),
    }];
  });
}

export function matchesChannelModel(row, query) {
  const keyword = query.trim().toLowerCase();
  return !keyword || [row.model.name, row.displayName, row.model.modelId, modelTypeLabel(row.model.type), row.upstreamModelId]
    .some(value => value?.toLowerCase().includes(keyword));
}
