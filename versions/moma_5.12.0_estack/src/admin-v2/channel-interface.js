import { customForwarding } from './channel-custom-adapter.js';
import { previewChannelRequestRules } from './channel-request-rules.js';

export const CHANNEL_INTERFACES = [
  { id: 'openai', label: 'OpenAI 兼容 API（Chat Completions）', protocol: 'OpenAI' },
  { id: 'openai-responses', label: 'OpenAI 兼容 API（Responses）', protocol: 'OpenAI' },
  { id: 'anthropic', label: 'Anthropic Messages API', protocol: 'Anthropic' },
];

const listedTasks = { 'openai-embeddings': 'embedding', 'ark-video': 'video', 'dashscope-video': 'video', 'minimax-video': 'video' };
const modelTypes = ['text', 'multimodal', 'embedding', 'rerank', 'image', 'video', 'audio'];
const completePaths = {
  openai: ['/chat/completions', '/embeddings', '/responses', '/images/generations', '/audio/transcriptions', '/audio/speech'],
  'openai-responses': ['/responses', '/chat/completions'],
  anthropic: ['/messages'],
};

function checkedUrl(value, allowHttp) {
  // eslint-disable-next-line no-control-regex -- URL parsing discards controls before validation.
  if (typeof value !== 'string' || !value.trim() || value.length > 2048 || /[\u0000-\u001f\u007f]/.test(value)) throw new Error('请填写有效的 API 地址，最多 2048 字符，不能包含控制字符');
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error('请填写有效的完整 API 地址'); }
  if (url.protocol !== 'https:' && !(allowHttp && url.protocol === 'http:')) throw new Error('API 地址须使用 HTTPS，自建服务可明确允许 HTTP');
  if (url.username || url.password || /[?#]/.test(value) || /%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(url.pathname) || /\s/.test(value.trim())) throw new Error('API 地址不能包含账号、查询参数、片段或控制字符');
  return url;
}

const urlText = url => url.toString().replace(/\/+$/, '');

export function prepareChannelAdapterOptions(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('接口选项格式无效');
  const options = {};
  const rules = {
    apiVersion: value => /^\d{4}-\d{2}-\d{2}$/.test(value),
    workspaceId: value => /^[A-Za-z0-9_-]{1,128}$/.test(value),
    tokenLimitField: value => ['max_completion_tokens', 'max_tokens'].includes(value),
    imageSize: value => ['auto', '256x256', '512x512', '1024x1024', '1536x1024', '1024x1536'].includes(value),
    voice: value => /^[A-Za-z0-9_-]{1,60}$/.test(value),
    statusPath: value => value.startsWith('/') && !value.startsWith('//') && value.includes('{id}') && !/[?#\r\n]/.test(value),
  };
  for (const [key, value] of Object.entries(input)) {
    if (!Object.hasOwn(rules, key)) throw new Error('存在未支持的接口选项');
    if (value == null || value === '') continue;
    if (typeof value !== 'string' || value.length > 2048 || !rules[key](value)) throw new Error(`接口选项 ${key} 格式无效`);
    options[key] = value;
  }
  return options;
}

export function suggestChannelRoot({ interfaceType, baseUrl, allowHttp = false }) {
  const url = checkedUrl(baseUrl, allowHttp);
  const pathname = url.pathname.replace(/\/+$/, '');
  const suffix = completePaths[interfaceType]?.find(path => pathname.endsWith(path));
  if (!suffix) return null;
  url.pathname = pathname.slice(0, -suffix.length) || '/';
  return urlText(url);
}

export function connectionRequestUrl(baseUrl, endpointPath) {
  return baseUrl.replace(/\/+$/, '') + endpointPath;
}

export function modelListRequestUrl(endpoint) {
  const adapter = endpoint.customAdapter?.models;
  if (endpoint.interfaceType === 'custom' && !adapter) return null;
  const base = new URL(endpoint.baseUrl);
  return adapter ? new URL(adapter.path, base).href : connectionRequestUrl(base.href, '/models');
}

function checkedChannelPath(serviceUrl, value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\s\\?#]/u.test(value)) {
    throw Error('接口端点须填写以 / 开头的路径，不含域名、参数或片段');
  }
  const path = checkedUrl(serviceUrl.origin + value, serviceUrl.protocol === 'http:').pathname;
  if (path !== value) throw Error('接口端点须填写规范路径，不能包含路径跳转');
  return path;
}

export function prepareChannelInterface({ interfaceType, baseUrl, taskUrls = {}, endpointPath, modelProtocol, allowHttp = false }) {
  const preset = CHANNEL_INTERFACES.find(row => row.id === interfaceType) || (interfaceType === 'custom' ? { protocol: '其他' } : null);
  if (!preset) throw new Error('请选择已支持的接口类型');
  const url = checkedUrl(baseUrl, allowHttp);
  const path = endpointPath == null ? null : checkedChannelPath(url, endpointPath);
  if (modelProtocol != null && (!path || (Object.hasOwn(listedTasks, modelProtocol) ? interfaceType !== 'custom' : modelProtocol !== interfaceType))) {
    throw Error('接口格式与接口端点配置不一致');
  }
  if (path && url.pathname.replace(/\/+$/, '').endsWith(path)) {
    throw Error('服务地址已包含接口端点，请删除服务地址末尾的重复部分');
  }
  const pathConfig = endpointPath === undefined ? {} : { endpointPath: path };
  if (interfaceType !== 'custom') {
    if (!taskUrls || typeof taskUrls !== 'object' || Array.isArray(taskUrls) || Object.keys(taskUrls).length) throw new Error('预设接口按模型任务生成地址，不能覆盖任务地址');
    const suggestedBaseUrl = suggestChannelRoot({ interfaceType, baseUrl, allowHttp });
    if (suggestedBaseUrl) {
      const error = new Error('当前地址为完整任务接口，请确认使用识别出的服务根地址');
      error.code = 'full_task_url';
      error.suggestedBaseUrl = suggestedBaseUrl;
      throw error;
    }
    return { interfaceType, protocol: preset.protocol, addressMode: 'base', baseUrl: urlText(url), taskUrls: {}, ...pathConfig };
  }
  if (!path && (url.pathname === '/' || /^\/v\d+\/?$/.test(url.pathname))) throw new Error('自定义 API 地址需要包含完整任务接口路径');
  if (!taskUrls || typeof taskUrls !== 'object' || Array.isArray(taskUrls)) throw new Error('任务地址配置无效');
  const preparedTasks = {};
  for (const [type, value] of Object.entries(taskUrls)) {
    if (!modelTypes.includes(type)) throw new Error('任务地址包含未支持的模型类型');
    const taskUrl = checkedUrl(value, allowHttp);
    if (taskUrl.origin !== url.origin) throw new Error('不同主机或认证边界的任务地址须使用不同连接');
    if (taskUrl.pathname === '/' || /^\/v\d+\/?$/.test(taskUrl.pathname)) throw new Error('任务地址需要包含完整接口路径');
    preparedTasks[type] = urlText(taskUrl);
  }
  return { interfaceType, protocol: preset.protocol, addressMode: path ? 'base' : 'task', baseUrl: urlText(url), taskUrls: preparedTasks, ...pathConfig };
}

export function modelTaskUrl(endpoint, modelType, { probe, upstreamModelId } = {}) {
  if (!endpoint || !modelTypes.includes(modelType)) throw new Error('请选择已支持的模型任务');
  const { interfaceType, baseUrl, taskUrls, endpointPath } = prepareChannelInterface({ ...endpoint, allowHttp: endpoint.allowHttp === true });
  if (interfaceType === 'custom') {
    if (endpointPath && Object.hasOwn(listedTasks, endpoint.modelProtocol) && listedTasks[endpoint.modelProtocol] !== modelType) {
      throw Error('当前接口格式不适用于此模型任务');
    }
    const route = customForwarding(endpoint.customAdapter, endpoint, modelType, upstreamModelId);
    if (route) return route.url;
    if (upstreamModelId && endpoint.customAdapter?.routes.some(row => row.task === modelType)) throw Error('没有匹配当前模型的自定义转发规则');
    return endpointPath ? connectionRequestUrl(baseUrl, endpointPath) : taskUrls[modelType] || baseUrl;
  }
  if (endpoint.modelProtocol && endpointPath && !['text', 'multimodal'].includes(modelType)) {
    throw Error('当前接口格式不适用于此模型任务');
  }
  const task = ['anthropic', 'openai-responses'].includes(interfaceType)
    ? ['text', 'multimodal'].includes(modelType) ? interfaceType === 'anthropic' ? 'messages' : 'responses' : null
    : ({ text: 'chat/completions', multimodal: 'chat/completions', embedding: 'embeddings', image: 'images/generations', audio: probe === 'speech' ? 'audio/speech' : probe === 'transcription' ? 'audio/transcriptions' : null })[modelType];
  if (!task) throw new Error('当前接口预设尚不支持此模型任务，请使用已支持的自定义任务端点');
  if (endpointPath && ['chat/completions', 'messages', 'responses'].includes(task)) return connectionRequestUrl(baseUrl, endpointPath);
  return connectionRequestUrl(baseUrl, '/' + task);
}

export function channelConversationRequest(endpoint, model) {
  const body = { model: model.upstreamModelId, stream: model.check === 'streaming' };
  const prompt = '请回复你好。';
  if (endpoint.interfaceType === 'openai-responses') Object.assign(body, { input: prompt, max_output_tokens: 32 });
  else if (endpoint.interfaceType === 'anthropic') Object.assign(body, { messages: [{ role: 'user', content: prompt }], max_tokens: 32 });
  else Object.assign(body, { messages: [{ role: 'user', content: prompt }], [endpoint.tokenLimitField || endpoint.adapterOptions?.tokenLimitField || 'max_completion_tokens']: 32 });
  const forwarding = customForwarding(endpoint.customAdapter, endpoint, model.type, model.upstreamModelId);
  const request = { method: forwarding?.method || 'POST', url: modelTaskUrl(endpoint, model.type, { upstreamModelId: model.upstreamModelId }), body };
  if (!endpoint.requestRules) return request;
  const demo = previewChannelRequestRules(endpoint.requestRules, body, 200, { interfaceType: endpoint.interfaceType });
  return demo.error ? { ...request, body: null, rejected: demo.error } : { ...request, ...demo.request };
}

export function channelConversationText(interfaceType, response) {
  const text = interfaceType === 'openai-responses'
    ? response?.output?.filter(item => item.type === 'message').flatMap(item => item.content || []).filter(item => item.type === 'output_text').map(item => item.text).join('')
    : interfaceType === 'anthropic' ? response?.content?.filter(item => item.type === 'text').map(item => item.text).join('') : response?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw new Error('上游响应格式不匹配或未返回文本');
  return text;
}
