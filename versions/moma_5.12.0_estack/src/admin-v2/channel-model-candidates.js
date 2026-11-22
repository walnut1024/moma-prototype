import { CHANNEL_LIST_TYPES } from './channel-connection-directory.js';
import { CHANNEL_INTERFACES, modelTaskUrl } from './channel-interface.js';
import { modelCatalogue } from './model-library.js';
import { officialChannelReferences } from './onboarding-presets.js';
import { OFFICIAL_CHANNEL_PRESETS } from './official-channel-presets.js';
import { channelInterfaceIssue } from './provider-channels.js';
import { providerMaterialModels } from './provider-materials.js';
import { modelTypeLabel } from '../model-types.mjs';

export const sourceFormat = endpoint => endpoint.modelProtocol || endpoint.interfaceType || endpoint.protocol || '';
export const sourceFormatLabel = format => CHANNEL_LIST_TYPES.find(row => row.id === format)?.label
  || CHANNEL_INTERFACES.find(row => row.id === format)?.label || format;
export const sourceBaseUrl = value => (value || '').trim().replace(/\/+$/, '');
export const validUpstreamId = value => Boolean(value && value.length <= 200 && !/[\s\p{Cc}]/u.test(value));

function taskUrl(endpoint, model) {
  try { return modelTaskUrl(endpoint, model.type); }
  catch { return ''; }
}

export function channelModelCandidates(state, channel) {
  const { provider, endpoint, models } = channel;
  const sources = new Map();
  const supplied = new Set();
  const added = new Map(models.map(row => [row.master?.id, row.association.upstreamModelId]));
  const existingIds = new Set([
    ...models.map(row => row.association.upstreamModelId),
    ...(provider.catalogConnections || []).filter(row => row.endpointId === endpoint.id && !row.deletedAt).map(row => row.upstreamModelId),
  ]);
  const sourceKey = (endpointId, modelId, upstreamModelId) => JSON.stringify([endpointId, modelId, upstreamModelId]);
  const knownIds = new Set([
    ...(provider.catalogConnections || []).filter(row => !row.deletedAt).map(row => sourceKey(row.endpointId, row.modelId, row.upstreamModelId)),
    ...state.modelSupplies.filter(row => row.status !== '已移除' && (!row.providerId || row.providerId === provider.id))
      .map(row => sourceKey(row.endpointId, row.catalogueModelId || row.upstreamModelId, row.upstreamModelId)),
  ]);
  const addSource = (id, source) => {
    if (!sources.has(id)) sources.set(id, []);
    sources.get(id).push(source);
    supplied.add(id);
  };
  for (const group of providerMaterialModels(state, provider)) {
    supplied.add(group.master.id);
    for (const row of group.channels) {
      if (!row.endpointId || row.endpoint.deletedAt || row.endpoint.adapterDraft) continue;
      const explicit = knownIds.has(sourceKey(row.endpointId, row.modelId, row.upstreamModelId));
      addSource(group.master.id, {
        name: row.name, format: sourceFormat(row.endpoint), baseUrl: sourceBaseUrl(row.endpoint.baseUrl),
        upstreamModelId: explicit ? row.upstreamModelId : '', endpoint: row.endpoint,
      });
    }
  }
  const catalogue = modelCatalogue(state);
  for (const preset of OFFICIAL_CHANNEL_PRESETS) {
    if (officialChannelReferences(state, preset).supplier.providerId !== provider.id) continue;
    for (const row of preset.models) {
      const matches = catalogue.filter(model => model.onboardingPresetId === row.id || model.modelId?.toLowerCase() === row.modelId);
      if (matches.length !== 1 || matches[0].type !== row.type) continue;
      const baseUrl = sourceBaseUrl(row.baseUrl);
      addSource(matches[0].id, {
        name: '官方参考', format: 'openai', baseUrl, upstreamModelId: row.upstreamModelId,
        endpoint: { interfaceType: 'openai', baseUrl },
      });
    }
  }
  const format = sourceFormat(endpoint), baseUrl = sourceBaseUrl(endpoint.baseUrl);
  return catalogue.map(model => {
    const options = sources.get(model.id) || [];
    const targetUrl = taskUrl(endpoint, model);
    const matches = options.filter(source => validUpstreamId(source.upstreamModelId)
      && source.format === format && source.baseUrl && source.baseUrl === baseUrl
      && (source.endpoint.id === endpoint.id || Boolean(targetUrl && targetUrl === taskUrl(source.endpoint, model))));
    const ids = new Set(matches.map(source => source.upstreamModelId));
    return {
      id: model.id, model, supplied: supplied.has(model.id), sources: options,
      defaultSource: ids.size === 1 ? matches[0] : undefined,
      added: added.has(model.id), currentUpstreamId: added.get(model.id),
      issue: channelInterfaceIssue(provider, { type: model.type, endpoint }),
      existingIds,
    };
  });
}

export const filterModelSources = (sources, format, baseUrl) =>
  sources.filter(source => (!format || source.format === format) && (!baseUrl || source.baseUrl === baseUrl));

export function matchesChannelModel(row, { format, baseUrl, query, targetFormat, targetBaseUrl }) {
  const matchingSources = filterModelSources(row.sources, format, baseUrl);
  const defaultFilters = (!format || format === targetFormat) && (!baseUrl || baseUrl === targetBaseUrl);
  if (!matchingSources.length && (format || baseUrl) && !(defaultFilters && !row.sources.length)) return false;
  const keyword = query.trim().toLowerCase();
  return !keyword || [row.model.name, row.model.modelId, modelTypeLabel(row.model.type), ...matchingSources.map(source => source.upstreamModelId)]
    .some(value => value?.toLowerCase().includes(keyword));
}
