import { channelIdentity, modelDisplayName } from '../model-identities.mjs';
import { providerCatalogueModel } from './moma-provider.js';
import { modelCatalogue } from './model-library.js';
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

export function channelManagementDirectory(state, providers, relations = state.supplyRelations) {
  const byProvider = new Map(), byModel = new Map();
  const masters = new Map(modelCatalogue(state).map(master => [master.id, master]));
  for (const owner of providers) {
    const metadata = new Map(supplierModelChannelGroups(state, owner).map(group => [group.id, group]));
    const channelOrder = new Map((owner.catalogConnections || []).map((row, index) => [row.id, index]));
    const groups = relations.models.filter(row => row.providerId === owner.id && masters.has(row.materialId)).map(relation => {
      const master = masters.get(relation.materialId), existing = metadata.get(master.id);
      const channels = relations.channels.filter(row => row.supplierModelId === relation.id).flatMap(row => {
        const endpoint = state.endpoints.find(endpoint => endpoint.id === row.endpointId && endpoint.providerId === owner.id && !endpoint.deletedAt);
        if (!endpoint) return [];
        const saved = owner.catalogConnections?.find(entry => entry.id === row.associationId);
        const modelId = saved?.modelId || relation.modelId;
        const candidates = catalogueChannels(state, owner, modelId);
        const projected = candidates.find(entry => entry.id === row.associationId) || candidates.find(entry => entry.endpointId === row.endpointId && entry.upstreamModelId === row.upstreamModelId);
        return [{ ...projected, id: projected?.id || row.associationId, modelId, endpointId: row.endpointId, endpoint,
          upstreamModelId: row.upstreamModelId, enabled: row.enabled, relationId: row.id }];
      }).sort((a, b) => (channelOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (channelOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER));
      return { ...existing, id: master.id, modelId: existing?.modelId || relation.modelId,
        modelIds: existing?.modelIds || [relation.modelId], name: existing?.name || master.name,
        master, owner, channels };
    }).filter(group => group.channels.length);
    const linked = new Set(relations.channels.filter(row => row.providerId === owner.id).map(row => row.endpointId));
    const unlinked = supplierChannelResources(state, owner).filter(endpoint => !linked.has(endpoint.id));
    if (unlinked.length) groups.push({ id: 'unlinked-channels', modelId: null, name: '未关联模型', owner,
      channels: unlinked.map(endpoint => ({ id: endpoint.id, endpointId: endpoint.id, endpoint, unlinked: true })) });
    byProvider.set(owner.id, groups);
    for (const group of groups) {
      if (!group.modelId) continue;
      const { id, master } = group;
      if (!byModel.has(id)) {
        byModel.set(id, { id, master, name: master?.name || group.name, code: master?.modelId || group.modelId, groups: [] });
      }
      const model = byModel.get(id);
      model.groups.push(group);
    }
  }
  const order = new Map([...masters.keys()].map((id, index) => [id, index]));
  return { byProvider, models: [...byModel.values()].sort((a, b) => order.get(a.id) - order.get(b.id)) };
}

export function supplierChannelInterface(provider, channel) {
  if (!channel?.endpointId) return {protocol:'—',url:''};
  const url=channel.unlinked?channel.endpoint.baseUrl:channelUrl(provider,channel);
  const protocol=channel.endpoint.protocol || '';
  const path=url?.split(/[?#]/)[0].replace(/\/$/,'') || '';
  return {url,protocol:protocol==='Anthropic'?'Anthropic':protocol==='OpenAI'?(path.endsWith('/responses')?'OpenAI Responses':path.endsWith('/chat/completions')?'OpenAI Chat':'OpenAI'):protocol || '—'};
}

export function supplierModelChannelRows(state, groups, query = '') {
  const search = query.trim().toLowerCase();
  return groups.filter(group => group.modelId).flatMap(group => group.channels
    .filter(channel => channel.endpointId && !channel.unlinked)
    .map(channel => ({ id: channel.id, group, channel })))
    .filter(({ group, channel }) => !search || [modelDisplayName(state, group.master?.id), group.name, group.master?.modelId,
      channel.sourceName, channel.name, channel.upstreamModelId, channel.endpointId, channel.endpoint?.name,
      channelIdentity(state, channel.id), supplierChannelInterface(group.owner, channel).url]
      .some(value => String(value || '').toLowerCase().includes(search)));
}

export function modelSupplyGroups(state,entries) {
  const groups=new Map();
  for(const entry of entries)for(const group of supplierModelChannelGroups(state,entry.provider))if(group.modelIds?.includes(entry.modelId))groups.set(entry.provider.id+':'+group.id,{...group,owner:entry.provider});
  return [...groups.values()];
}
