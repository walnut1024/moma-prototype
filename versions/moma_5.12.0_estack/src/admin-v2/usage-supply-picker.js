const providerNames = new Map([
  ['deepseek', '深度求索（DeepSeek）'],
  ['深度求索', '深度求索（DeepSeek）'],
  ['siliconflow', '硅基流动（SiliconFlow）'],
  ['硅基流动', '硅基流动（SiliconFlow）'],
]);

export const supplyPickerName = provider => providerNames.get(provider.name.toLowerCase()) || provider.name;

export function supplyPickerGroups(options, query) {
  const search = query.trim().toLowerCase();
  const match = item => `${item.name} ${item.code || ''} ${item.id}`.toLowerCase().includes(search);
  return options.providers.flatMap(provider => {
    const name = supplyPickerName(provider);
    const channels = options.channels.filter(channel => channel.groupId === provider.id);
    const supplierMatch = match({ ...provider, name });
    const visible = supplierMatch ? channels : channels.filter(match);
    return supplierMatch || visible.length ? [{ ...provider, displayName: name, channels: visible, totalChannels: channels.length }] : [];
  });
}

export function supplyPickerSelectionSummary(draft, channels, all) {
  if (all) return '全部服务商';
  const providers = new Set(draft.providers);
  const count = [...new Set(draft.channels)].filter(id => !providers.has(channels.find(channel => channel.id === id)?.groupId)).length;
  return providers.size || count ? `已选 ${providers.size} 家全部渠道＋${count} 条渠道` : '未选择服务商或渠道';
}
