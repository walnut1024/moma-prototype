import { modelSupplies } from './model-management.js';
import { providerServices } from './service-workspace.js';
import { supplierChannelName } from './supplier-resources.js';

export function marketSupplyGroups(state, { sources = [], upstreams = [] }) {
  const groups = new Map();
  const add = (id, provider) => {
    if (!groups.has(id)) groups.set(id, {
      id, name: provider?.name || '服务商已不存在', channels: new Map(),
    });
    return groups.get(id);
  };

  for (const { model, providerId, channelId } of sources) {
    for (const entry of providerServices(model)) {
      if (providerId && entry.providerId !== providerId || channelId && entry.channelId !== channelId) continue;
      const provider = state.providers.find(row => row.id === entry.providerId);
      add(entry.providerId, provider || (entry.providerName ? { name: entry.providerName } : null));
    }

    for (const supply of modelSupplies(state, model.id)) {
      const id = supply.endpoint?.providerId || supply.providerId;
      if (providerId && id !== providerId || channelId && supply.channelId !== channelId) continue;
      const provider = supply.provider || state.providers.find(row => row.id === id);
      const channel = supply.endpoint;
      const source = provider?.catalogConnections?.find(row => row.id===supply.channelId && !row.deletedAt);
      const name = !channel || channel.deletedAt ? '连接已不存在'
        : source?.sourceName || (provider ? supplierChannelName(provider, channel) : channel.name);
      add(id, provider).channels.set(supply.channelId || supply.endpointId, name || '连接名称未配置');
    }
  }

  for (const { channel } of upstreams) {
    add(channel.provider.id, channel.provider).channels.set(channel.id, channel.upstreamModelId);
  }
  return [...groups.values()];
}
