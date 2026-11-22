import { workbenchProtocolLabel } from './workbench-protocol.js';
import { channelIdentity } from '../model-identities.mjs';
import { CHANNEL_INTERFACES, modelTaskUrl, prepareChannelInterface } from './channel-interface.js';
import { directoryDisabledKind } from './channel-directory-archive.js';
import { connectionKeys, connectionTestCurrent, connectionTestPending } from './connection-state.js';
import { costRecords } from './model-pricing-workspace.js';
import { supplyModelRecord } from './supply-models.js';
import { supplierChannelAssociations, supplierChannelResources } from './supplier-resources.js';

export const CONNECTION_STATUSES = ['已启用', '已停用', '自动停用', '未启用'];

export const CHANNEL_SOURCE_TYPES = ['thirdParty', 'selfHosted'];

export const CHANNEL_LIST_TYPES = [
  { id: 'openai', label: 'OpenAI Chat Completions', paths: ['/chat/completions'] },
  { id: 'openai-responses', label: 'OpenAI Responses', paths: ['/responses'] },
  { id: 'anthropic', label: 'Anthropic Messages', paths: ['/messages'] },
  { id: 'openai-embeddings', label: 'OpenAI Embeddings', paths: ['/embeddings'], task: true },
  { id: 'ark-video', label: '火山方舟 Video Generation', paths: ['/contents/generations/tasks'], task: true, prefix: '/api/v3' },
  { id: 'dashscope-video', label: 'DashScope Video Generation', prefix: '/api/v1', paths: [
    '/services/aigc/video-generation/video-synthesis', '/services/aigc/image2video/video-synthesis',
  ], task: true },
  { id: 'minimax-video', label: 'MiniMax Video Generation', paths: ['/video_generation'], task: true },
];
const channelTypeById = id => CHANNEL_LIST_TYPES.find(type => type.id === id);
const channelTypeForUrl = url => {
  const normalized = url?.replace(/\/+$/, '');
  return CHANNEL_LIST_TYPES.find(type => type.paths.some(path => normalized?.endsWith(path)));
};

export function prepareListedChannelInterface({ interfaceType, baseUrl, endpointPath, allowHttp }) {
  const type = channelTypeById(interfaceType);
  if (!type) throw Error('请选择模型协议');
  if (endpointPath == null && type.task && channelTypeForUrl(baseUrl?.trim()) !== type) {
    throw Error(`请填写 ${workbenchProtocolLabel(type.label)} 的完整接口地址，路径以 ${type.paths.join(' 或 ')} 结尾`);
  }
  const config = prepareChannelInterface({ interfaceType: type.task ? 'custom' : type.id, baseUrl, endpointPath, allowHttp });
  const addressType = channelTypeForUrl(config.baseUrl);
  if (endpointPath == null && addressType && addressType !== type) throw Error(`服务地址（Base URL）与所选模型协议 ${workbenchProtocolLabel(type.label)} 不匹配`);
  return endpointPath == null ? config : { ...config, modelProtocol: type.id };
}

export function channelListType({ endpoint, models, interfaceLabel }) {
  if (endpoint.adapterDraft) return interfaceLabel;
  const selected = channelTypeById(endpoint.modelProtocol);
  if (selected) return selected.label;
  if (['anthropic', 'openai-responses'].includes(endpoint.interfaceType)) return channelTypeById(endpoint.interfaceType).label;

  const baseType = channelTypeForUrl(endpoint.baseUrl);
  if (baseType) return baseType.label;
  if (endpoint.interfaceType === 'openai') {
    if (models.length && models.every(({ master, association }) => (master?.type || association.type) === 'embedding')) return channelTypeById('openai-embeddings').label;
    return channelTypeById('openai').label;
  }

  return channelTypeForUrl(endpoint.taskUrls?.video)?.label || interfaceLabel || '—';
}

export function channelListPaths(row) {
  const { endpoint } = row;
  if (endpoint.adapterDraft) return [];
  const { interfaceType, baseUrl, taskUrls, customAdapter, addressMode } = endpoint;
  const urls = Object.values(taskUrls || {});
  if (CHANNEL_INTERFACES.some(option => option.id === interfaceType)) {
    const task = channelListType(row) === channelTypeById('openai-embeddings').label ? 'embedding' : 'text';
    try { urls.push(modelTaskUrl(endpoint, task)); }
    catch { if (channelTypeForUrl(baseUrl)) urls.push(baseUrl); }
  } else if (endpoint.endpointPath) {
    urls.push(new URL(baseUrl).origin + endpoint.endpointPath);
  } else if (interfaceType === 'custom' || addressMode === 'task' || channelTypeForUrl(baseUrl)) {
    urls.push(baseUrl);
  }
  const paths = new Set();
  for (const url of urls) {
    try {
      const path = new URL(url).pathname.replace(/\/+$/, '');
      if (path) paths.add(path);
    } catch { /* 遗留记录可能缺少完整地址。 */ }
  }
  for (const { path } of customAdapter?.routes || []) paths.add(path);
  return [...paths];
}

export function channelProtocolUsesFullAddress(interfaceType, current) {
  const type = channelTypeById(interfaceType);
  const legacyEmbeddingsRoot = type?.id === 'openai-embeddings' && current?.endpoint.interfaceType === 'openai' &&
    channelTypeForUrl(current.endpoint.baseUrl) !== type;
  return !current?.endpoint.endpointPath && (interfaceType === 'custom' || Boolean(type?.task && !legacyEmbeddingsRoot));
}

export function channelProtocolPaths({ interfaceType, baseUrl, allowHttp }, current) {
  if (current?.endpoint.endpointPath && current.endpoint.modelProtocol === interfaceType) return [current.endpoint.endpointPath];
  if (current && baseUrl.trim() === (current.endpoint.baseUrl || '')) return channelListPaths(current);
  if (!interfaceType) return [];
  const type = channelTypeById(interfaceType);
  try {
    const endpoint = !type || type.task && !channelProtocolUsesFullAddress(interfaceType, current)
      ? prepareChannelInterface({ ...current?.endpoint, interfaceType: type ? 'openai' : 'custom', baseUrl, allowHttp })
      : prepareListedChannelInterface({ interfaceType, baseUrl, allowHttp });
    return channelListPaths({ ...current, endpoint: { ...current?.endpoint, ...endpoint, allowHttp }, models: current?.models || [] });
  } catch {
    return type ? type.paths.map(path => (type.prefix || '/v1') + path) : [];
  }
}

export function connectionDirectoryRows(state, providers) {
  return providers.flatMap(provider => {
    const associations = supplierChannelAssociations(state, provider);
    const costs = costRecords(state, associations.map(association => ({
      owner: provider, master: supplyModelRecord(state, provider, association.modelId), channels: [association],
    })));
    return supplierChannelResources(state, provider).map(endpoint => {
      const models = costs.filter(cost => cost.association.endpointId === endpoint.id).map(cost => ({
        ...cost,
        modelName: cost.association.modelSnapshot?.name || cost.modelName,
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
