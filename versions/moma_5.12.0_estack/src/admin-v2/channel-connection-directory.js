import { channelIdentity, modelDisplayName } from '../model-identities.mjs';
import { CHANNEL_INTERFACES } from './channel-interface.js';
import { directoryDisabledKind } from './channel-directory-archive.js';
import { connectionKeys, connectionTestCurrent, connectionTestPending } from './connection-state.js';
import { costRecords } from './model-pricing-workspace.js';
import { supplyModelRecord } from './supply-models.js';
import { supplierChannelAssociations, supplierChannelResources } from './supplier-resources.js';

export const CONNECTION_STATUSES = ['已启用', '已停用', '自动停用', '未启用'];

export function connectionDirectoryRows(state, providers) {
  return providers.flatMap(provider => {
    const associations = supplierChannelAssociations(state, provider);
    const costs = costRecords(state, associations.map(association => ({
      owner: provider, master: supplyModelRecord(state, provider, association.modelId), channels: [association],
    })));
    return supplierChannelResources(state, provider).map(endpoint => {
      const models = costs.filter(cost => cost.association.endpointId === endpoint.id).map(cost => ({
        ...cost,
        modelName: modelDisplayName(state, cost.master?.id) || cost.modelName,
        modelCode: cost.master?.modelId || cost.association.modelId,
        channelId: channelIdentity(state, cost.association.id),
      }));
      const enabled = ['运行中', '需关注'].includes(endpoint.status);
      const stopped = endpoint.frozen || provider.status !== '已启用';
      const tested = connectionTestCurrent(endpoint);
      const credentials = connectionKeys(endpoint, provider, true).map(key => key.maskedKey).filter(Boolean);
      return {
        id: endpoint.id, endpoint, provider, models, credentials,
        modelCount: new Set(models.map(model => model.modelKey)).size,
        name: endpoint.name || endpoint.id,
        interfaceLabel: endpoint.adapterDraft ? endpoint.adapterDraft.label + ' · 待适配' :
          CHANNEL_INTERFACES.find(option => option.id === endpoint.interfaceType)?.label || endpoint.protocol,
        status: directoryDisabledKind(endpoint) === 'automatic' ? '自动停用' : stopped || directoryDisabledKind(endpoint) === 'manual' ? '已停用'
          : enabled ? '已启用' : endpoint.connectionTest || endpoint.configurationRevision ? '已停用' : '未启用',
        testStatus: connectionTestPending(endpoint) ? '测试中' : tested ? endpoint.connectionTest.result === '通过' ? '已通过' : '未通过' : endpoint.connectionTest ? '待复测' : '未测试',
      };
    });
  });
}

export function filterConnections(rows, { query, providerId, status, protocol, modelId, group, tag }) {
  const keyword = query.trim().toLowerCase();
  return rows.filter(row => (!providerId || row.provider.id === providerId) && (!status || row.status === status) &&
    (!protocol || row.interfaceLabel === protocol) && (!modelId || row.models.some(model => model.modelKey === modelId)) &&
    (!group || row.endpoint.authMode === 'group' && row.provider.id + '/' + row.endpoint.keyGroupId === group) &&
    (!tag || row.endpoint.directoryTags?.includes(tag)) &&
    (!keyword || [row.name, row.id, row.endpoint.channelCode, row.endpoint.baseUrl, row.provider.name, row.provider.code, ...row.credentials,
      ...(row.endpoint.directoryTags || []),
      ...row.models.flatMap(model => [model.modelName, model.modelCode, model.channelId, model.association.sourceName, model.association.upstreamModelId])]
      .some(value => String(value ?? '').toLowerCase().includes(keyword))));
}
