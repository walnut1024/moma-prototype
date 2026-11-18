import { mappingCandidates } from './service-model-mappings.js';
import { providerServices } from './service-workspace.js';

export function serviceChannelOptions(state, model, providerId) {
  if (!providerId) return [];
  const linked = new Set(providerServices(model).map(entry => entry.channelId));
  return mappingCandidates(state, { modelId: model.id, providerId }).map(channel => ({ ...channel,
    reason: linked.has(channel.id) ? '已关联当前模型服务' : channel.reason,
  }));
}
