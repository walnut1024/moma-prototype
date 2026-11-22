export const SERVICE_ADDRESS_LABEL = '服务地址（Base URL）';
export const PROTOCOL_ENDPOINT_LABEL = '协议及端点（Endpoint）';

const shortNames = new Map([
  ['OpenAI Chat Completions', 'OpenAI Chat'],
  ['OpenAI 兼容 API（Chat Completions）', 'OpenAI Chat'],
  ['OpenAI 兼容 API（Responses）', 'OpenAI Responses'],
  ['Anthropic Messages API', 'Anthropic Messages'],
  ['火山方舟 Video Generation', 'Ark Video'],
  ['DashScope Video Generation', 'DashScope Video'],
  ['MiniMax Video Generation', 'MiniMax Video'],
]);

export const workbenchProtocolLabel = protocol => shortNames.get(protocol) || protocol;

export function protocolAndEndpoint(protocol, address) {
  const label = workbenchProtocolLabel(protocol) || '—';
  try {
    const url = new URL(address);
    return label + '：' + url.pathname;
  } catch {
    return label + '：—';
  }
}
