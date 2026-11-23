export const defaultChannelNetwork = { proxyRef: '', httpVersion: 'auto', http2Streams: 1, certificate: 'default', caRef: '', polling: 'default', runtimeKind: '' };
const reference = value => typeof value === 'string' && (!value || /^[a-z][a-z0-9_.-]{0,79}$/i.test(value) && !/^sk-/i.test(value));

export function normalizeChannelNetwork(value, { interfaceType, internal }) {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !Object.hasOwn(defaultChannelNetwork, key))) {
    throw Error('网络配置包含不支持的字段');
  }
  const { proxyRef, httpVersion, http2Streams, certificate, caRef, polling, runtimeKind } = { ...defaultChannelNetwork, ...value };
  if (!reference(proxyRef) || !reference(caRef)) throw Error('请填写代理或 CA 的配置引用，不填写账号密码、URL 或证书内容');
  if (!['auto', 'http1', 'http2'].includes(httpVersion) || !Number.isSafeInteger(http2Streams) || http2Streams < 1 || http2Streams > 8) {
    throw Error('请选择 HTTP 接口格式，HTTP/2 分片须为 1–8');
  }
  if (!['default', 'internal'].includes(certificate) || certificate === 'internal' && (!internal || !caRef)) throw Error('自建部署的内部 CA 必须指定可信 CA 引用');
  if (!['default', 'slow', 'external'].includes(polling) || polling !== 'default' && interfaceType !== 'custom') throw Error('自定义轮询仅适用于异步任务适配器');
  if (!['', 'ollama', 'vllm', 'sglang', 'plugin'].includes(runtimeKind) || (runtimeKind === 'plugin' ? interfaceType !== 'custom' : Boolean(runtimeKind) && !internal)) {
    throw Error('请为当前连接选择适用的专项适配器');
  }
  return { proxyRef, httpVersion, http2Streams: httpVersion === 'http2' ? http2Streams : 1, certificate, caRef: certificate === 'internal' ? caRef : '', polling,
    ...(runtimeKind ? { runtimeKind } : {}) };
}
