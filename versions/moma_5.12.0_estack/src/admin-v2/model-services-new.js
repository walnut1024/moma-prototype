import { workspaceStoragePrefix } from '../workspace-storage.mjs';

const storageKey = workspaceStoragePrefix + 'model-services-new:v1';
const simulatedChannelNames = ['渠道 A', '渠道 B', '备用渠道'];
export const SERVICE_DESCRIPTION_LIMIT = 300;

export const contextRoutingEnabled = service => typeof service.tokenizer === 'string' && Boolean(service.tokenizer.trim()) && !service.contextPaused;
export const validContextLength = value => Number.isSafeInteger(value) && value > 0;

export function channelSetupIssue(service) {
  if (!contextRoutingEnabled(service)) return '';
  return service.channels.some(row => row.enabled && !validContextLength(row.context))
    ? '请为每条已启用的渠道模型配置上下文长度' : '';
}

export function serviceChannelShares(channels, contextTokens = null) {
  const eligible = channels.filter(row => row.enabled && !row.reason
    && (contextTokens == null || validContextLength(row.context) && row.context >= contextTokens));
  const first = Math.min(...eligible.map(row => row.priority));
  const preferred = eligible.filter(row => row.priority === first);
  const total = preferred.reduce((sum, row) => sum + row.weight, 0);
  return new Map(preferred.map(row => [row.id, row.weight / total]));
}

export function serviceModelFields(material) {
  const { author, family, version, tasks, inputModalities, outputModalities, resultTypes } = material?.profile || {};
  const { context, output, streaming, tools } = material?.capabilities || {};
  return structuredClone({
    name: material?.name || '', code: material?.modelId || '', author: author || material?.maker || '',
    family: family || '', version: version || '', tasks: tasks || [],
    inputModalities: inputModalities || material?.inputModalities || [], outputModalities: outputModalities || [],
    resultTypes: resultTypes || [], context: context ?? null, output: output ?? null,
    streaming: streaming ?? null, tools: tools ?? null,
  });
}

export function savedServiceModel(service) {
  if (!service?.modelId) return null;
  const details = service.modelDetails;
  return { id: service.modelId, modelId: details.code, name: details.name, type: service.type, profile: details };
}

export function simulatedServiceChannels(model, registeredChannels, links = []) {
  if (!model) return [];
  const hasUsableChannel = registeredChannels.some(channel => !channel.reason);
  return simulatedChannelNames.map((name, index) => ({
    id: `mock-service-channel:${model.id}:${index + 1}`,
    name,
    provider: { name: '模拟渠道' },
    upstreamModelId: 'mock/' + (model.modelId || model.id),
    simulated: true,
  })).filter(channel => !hasUsableChannel || links.some(link => link.channelId === channel.id));
}

export function readNewServices(storage) {
  const rows = JSON.parse(storage.getItem(storageKey) ?? '[]');
  if (!Array.isArray(rows) || rows.some(row => !row?.id || !Array.isArray(row.channels) ||
    (row.grants !== undefined && !Array.isArray(row.grants)))) {
    throw Error('模型服务配置无法读取');
  }
  return rows;
}

export function saveNewServices(storage, previous, rows) {
  if (JSON.stringify(readNewServices(storage)) !== JSON.stringify(previous)) {
    throw Error('其他页面已更新模型服务。请先载入最新配置。');
  }
  storage.setItem(storageKey, JSON.stringify(rows));
}

export function serviceFormIssue(values, rows, id) {
  if (!values.name.trim()) return '请填写模型服务名称';
  if (!values.callId) return '请填写模型调用标识';
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(values.callId)) return '模型调用标识需以字母或数字开头，最多 128 个字符，可使用 . _ : / -';
  if (rows.some(row => row.id !== id && row.callId === values.callId)) return '模型调用标识已存在';
  if (values.description?.length > SERVICE_DESCRIPTION_LIMIT
    && !rows.some(row => row.id === id && row.description === values.description)) return '描述不能超过 300 字';
  return '';
}
