import { modelSupplies } from './model-management.js';
import { providerServices } from './service-workspace.js';
import { supplierChannelName } from './supplier-resources.js';

export function marketSupplyGroups(state, model) {
  const groups = new Map();
  const add = (id, provider) => {
    if (!groups.has(id)) groups.set(id, {
      id, name: provider?.name || '服务商已不存在', channels: new Map(),
    });
    return groups.get(id);
  };

  const direct = model.serviceMode === 'provider';
  if (direct) {
    for (const { providerId } of providerServices(model)) {
      add(providerId, state.providers.find(row => row.id === providerId));
    }
  }

  for (const supply of modelSupplies(state, model.id)) {
    const id = supply.endpoint?.providerId || supply.providerId;
    if (direct && !groups.has(id)) continue;
    const provider = supply.provider || state.providers.find(row => row.id === id);
    const channel = supply.endpoint;
    const source = provider?.catalogConnections?.find(row => row.id===supply.channelId && !row.deletedAt);
    const name = !channel || channel.deletedAt ? '渠道已不存在'
      : source?.sourceName || (provider ? supplierChannelName(provider, channel) : channel.name);
    add(id, provider).channels.set(supply.channelId || supply.endpointId, name || '渠道名称未配置');
  }
  return [...groups.values()];
}
