import { cataloguePurchasePrice } from './provider-catalogue-pricing.js';
import { providerCatalogueModel } from './moma-provider.js';
import { supplyModelDirectory } from './supply-models.js';
import { catalogueChannels, channelUrl } from './provider-channels.js';
import { supplierChannelResources, supplierChannelAssociations } from './supplier-resources.js';

export function supplierModelChannelGroups(state, provider) {
  const groups = supplyModelDirectory(state, [provider]).map(({ id, master, name, entries }) => {
    const channels = [...new Map(entries.flatMap(row => catalogueChannels(state, provider, row.modelId)).map(channel => [channel.id, channel])).values()];
    const primary = entries.find(row => providerCatalogueModel(provider, row.modelId)?.displayName) || entries.find(row => channels.some(channel => channel.modelId === row.modelId)) || entries[0];
    const entry = providerCatalogueModel(provider, primary.modelId);
    return { id, modelId: primary.modelId, modelIds: entries.map(row => row.modelId), name: entry?.displayName || name, master, entry, channels };
  });
  // Archived model mappings remain linked; they must not become editable unlinked channels.
  const linked = new Set(supplierChannelAssociations(state, provider).map(channel => channel.endpointId));
  const unlinked = supplierChannelResources(state, provider).filter(endpoint => !linked.has(endpoint.id));
  if (unlinked.length) groups.push({ id: 'unlinked-channels', modelId: null, name: '未关联模型', channels: unlinked.map(endpoint => ({ id: endpoint.id, endpointId: endpoint.id, endpoint, unlinked: true })) });
  return groups;
}

export function supplierModelChannelRows(group) {
  const channels = group.channels.length ? group.channels : [null];
  const rows = channels.flatMap(channel => {
    const prices = channel?.pricing?.scenarios || [];
    return (prices.length ? prices : [null]).map((price, index) => ({ channel, price: price ? { ...price, purchasePrice: cataloguePurchasePrice(price.listPrice, channel.pricing.discountFactor, price.purchasePrice) } : null, channelSpan: index === 0 ? Math.max(1, prices.length) : 0 }));
  });
  return rows.map((row, index) => ({ ...row, modelSpan: index === 0 ? rows.length : 0 }));
}

export function supplierChannelInterface(provider, channel) {
  if (!channel?.endpointId) return {protocol:'—',url:''};
  const url=channel.unlinked?channel.endpoint.baseUrl:channelUrl(provider,channel);
  const protocol=channel.endpoint.protocol || '';
  const path=url?.split(/[?#]/)[0].replace(/\/$/,'') || '';
  return {url,protocol:protocol==='Anthropic'?'Anthropic':protocol==='OpenAI'?(path.endsWith('/responses')?'OpenAI Response':path.endsWith('/chat/completions')?'OpenAI Chat':'OpenAI'):protocol || '—'};
}

export function modelSupplyGroups(state,entries) {
  const groups=new Map();
  for(const entry of entries)for(const group of supplierModelChannelGroups(state,entry.provider))if(group.modelIds?.includes(entry.modelId))groups.set(entry.provider.id+':'+group.id,{...group,owner:entry.provider});
  return [...groups.values()];
}
