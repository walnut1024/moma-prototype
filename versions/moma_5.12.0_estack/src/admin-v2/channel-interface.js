export const CHANNEL_INTERFACES = [
  { id: 'openai', label: 'OpenAI 兼容', protocol: 'OpenAI' },
  { id: 'anthropic', label: 'Anthropic 原生', protocol: 'Anthropic' },
  { id: 'custom', label: '自定义任务端点', protocol: '其他' },
];

const modelTypes = ['text', 'multimodal', 'embedding', 'rerank', 'image', 'video', 'audio'];
const completePaths = {
  openai: ['/chat/completions', '/embeddings', '/responses', '/images/generations', '/audio/transcriptions', '/audio/speech'],
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

export function suggestChannelRoot({ interfaceType, baseUrl, allowHttp = false }) {
  const url = checkedUrl(baseUrl, allowHttp);
  const pathname = url.pathname.replace(/\/+$/, '');
  const suffix = completePaths[interfaceType]?.find(path => pathname.endsWith(path));
  if (!suffix) return null;
  url.pathname = pathname.slice(0, -suffix.length) || '/';
  return urlText(url);
}

export function prepareChannelInterface({ interfaceType, baseUrl, taskUrls = {}, allowHttp = false }) {
  const preset = CHANNEL_INTERFACES.find(row => row.id === interfaceType);
  if (!preset) throw new Error('请选择已支持的接口类型');
  const url = checkedUrl(baseUrl, allowHttp);
  if (interfaceType !== 'custom') {
    if (!taskUrls || typeof taskUrls !== 'object' || Array.isArray(taskUrls) || Object.keys(taskUrls).length) throw new Error('预设接口按模型任务生成地址，不能覆盖任务地址');
    const suggestedBaseUrl = suggestChannelRoot({ interfaceType, baseUrl, allowHttp });
    if (suggestedBaseUrl) {
      const error = new Error('当前地址为完整任务接口，请确认使用识别出的服务根地址');
      error.code = 'full_task_url';
      error.suggestedBaseUrl = suggestedBaseUrl;
      throw error;
    }
    return { interfaceType, protocol: preset.protocol, addressMode: 'base', baseUrl: urlText(url), taskUrls: {} };
  }
  if (url.pathname === '/' || /^\/v\d+\/?$/.test(url.pathname)) throw new Error('自定义 API 地址需要包含完整任务接口路径');
  if (!taskUrls || typeof taskUrls !== 'object' || Array.isArray(taskUrls)) throw new Error('任务地址配置无效');
  const preparedTasks = {};
  for (const [type, value] of Object.entries(taskUrls)) {
    if (!modelTypes.includes(type)) throw new Error('任务地址包含未支持的模型类型');
    const taskUrl = checkedUrl(value, allowHttp);
    if (taskUrl.origin !== url.origin) throw new Error('不同主机或认证边界的任务地址须使用不同渠道');
    if (taskUrl.pathname === '/' || /^\/v\d+\/?$/.test(taskUrl.pathname)) throw new Error('任务地址需要包含完整接口路径');
    preparedTasks[type] = urlText(taskUrl);
  }
  return { interfaceType, protocol: preset.protocol, addressMode: 'task', baseUrl: urlText(url), taskUrls: preparedTasks };
}

export function modelTaskUrl(endpoint, modelType) {
  if (!endpoint || !modelTypes.includes(modelType)) throw new Error('请选择已支持的模型任务');
  const { interfaceType, baseUrl, taskUrls } = prepareChannelInterface({ ...endpoint, allowHttp: endpoint.allowHttp === true });
  if (interfaceType === 'custom') return taskUrls[modelType] || baseUrl;
  const task = interfaceType === 'anthropic'
    ? ['text', 'multimodal'].includes(modelType) ? 'messages' : null
    : ({ text: 'chat/completions', multimodal: 'chat/completions', embedding: 'embeddings' })[modelType];
  if (!task) throw new Error('当前接口预设尚不支持此模型任务，请使用已支持的自定义任务端点');
  return `${baseUrl}/${task}`;
}
