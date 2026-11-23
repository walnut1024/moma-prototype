import { workspaceStoragePrefix } from '../workspace-storage.mjs';
import { MODEL_TYPE_LABELS, modelCategory } from '../model-types.mjs';

const storageKey = workspaceStoragePrefix + 'model-services-new:v1';
const simulatedChannelNames = ['上游模型 A', '上游模型 B', '备用上游模型'];
export const SERVICE_DESCRIPTION_LIMIT = 300;
export const MODEL_ID_LABEL = '模型 ID';

export const MODEL_SERVICE_TYPES = {
  text: [MODEL_TYPE_LABELS.text, '普通对话、文本生成、推理、代码生成'],
  multimodal: [MODEL_TYPE_LABELS.multimodal, '图片理解、视频理解、文档理解、视觉问答'],
  visual: [MODEL_TYPE_LABELS.visual, '文生图、图生图、图像编辑、文生视频、图生视频、视频编辑'],
  audio: [MODEL_TYPE_LABELS.audio, '语音识别、语音合成、语音对话、语音转语音、音乐生成、音频理解'],
  embedding: [MODEL_TYPE_LABELS.embedding, '文本向量化、图像向量化、多模态向量化'],
  rerank: [MODEL_TYPE_LABELS.rerank, '文本相关性重排、多模态重排'],
  other: [MODEL_TYPE_LABELS.other, '文本分类、内容审核、翻译、3D生成'],
};
export { modelCategory as modelServiceType };
export const serviceStatus = row => row.listed ? '服务中' : '已停服';

export const contextRoutingEnabled = service => typeof service.tokenizer === 'string' && Boolean(service.tokenizer.trim()) && !service.contextPaused;
export const validContextLength = value => Number.isSafeInteger(value) && value > 0;

export function channelSetupIssue(service) {
  if (!contextRoutingEnabled(service)) return '';
  return service.channels.some(row => row.enabled && !validContextLength(row.context))
    ? '请为每条已启用的上游模型配置上下文长度' : '';
}

export function preferredServiceChannels(channels, contextTokens = null) {
  const eligible = channels.filter(row => row.enabled && !row.reason
    && (contextTokens == null || validContextLength(row.context) && row.context >= contextTokens));
  const first = Math.min(...eligible.map(row => row.priority));
  return eligible.filter(row => row.priority === first);
}

export function serviceChannelShares(channels, contextTokens = null) {
  const preferred = preferredServiceChannels(channels, contextTokens);
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
    provider: { name: '模拟连接' },
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

export function serviceFormIssue(values, rows, id) {
  if (!values.name.trim()) return '请填写模型服务名称';
  if (!values.callId) return `请填写${MODEL_ID_LABEL}`;
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(values.callId)) return `${MODEL_ID_LABEL} 需以字母或数字开头，最多 128 个字符，可使用 . _ : / -`;
  if (rows.some(row => row.id !== id && row.callId === values.callId)) return `${MODEL_ID_LABEL} 已存在`;
  if (values.description?.length > SERVICE_DESCRIPTION_LIMIT
    && !rows.some(row => row.id === id && row.description === values.description)) return '描述不能超过 300 字';
  return '';
}
