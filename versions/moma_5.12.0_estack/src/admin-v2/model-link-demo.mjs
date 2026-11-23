export const protocols = {
  chat: { name: 'OpenAI Chat', path: '/v1/chat/completions' },
  responses: { name: 'OpenAI Responses', path: '/v1/responses' },
  messages: { name: 'Anthropic Messages', path: '/v1/messages' },
  embeddings: { name: 'OpenAI Embeddings', path: '/v1/embeddings' },
  ark: { name: 'Ark Video', path: '/api/v3/contents/generations/tasks' },
  dashscope: { name: 'DashScope Video', path: '/api/v1/services/aigc/video-generation/video-synthesis' },
  minimax: { name: 'MiniMax Video', path: '/v1/video_generation' }
};
export const channels = {
  A: { enabled: true, format: 'chat', convertsFrom: 'messages', origin: 'https://api-a.example.com' },
  B: { enabled: true, format: 'messages', convertsFrom: 'chat', origin: 'https://api-b.example.com' },
  C: { enabled: false, format: 'chat', origin: 'https://api-c.example.com' },
  D: { enabled: true, format: 'chat', origin: 'https://api-d.example.com' },
  E: { enabled: true, format: 'responses', origin: 'https://api-e.example.com' },
  F: { enabled: true, format: 'embeddings', origin: 'https://api-f.example.com' },
  Ark: { enabled: true, format: 'ark', origin: 'https://ark.example.com' },
  DashScope: { enabled: true, format: 'dashscope', origin: 'https://dashscope.example.com' },
  MiniMax: { enabled: true, format: 'minimax', origin: 'https://minimax.example.com' }
};
export const services = [
  { id: 'video', name: 'Seedance', callId: 'video-gen', type: '视觉模型 · 视频生成', enabled: true, protocols: ['ark', 'dashscope', 'minimax'],
    policy: '加权随机', weighted: true, detail: '先按接口格式筛选，再比较优先级与权重',
    routes: [
      { channel: 'Ark', model: 'seedance-video-demo', enabled: true, priority: 0, weight: 50 },
      { channel: 'DashScope', model: 'wan-video-demo', enabled: true, priority: 0, weight: 30 },
      { channel: 'MiniMax', model: 'hailuo-video-demo', enabled: true, priority: 0, weight: 20 }
    ] },
  { id: 'glm', name: 'GLM-5.3', callId: 'glm-5.3', enabled: true, protocols: ['chat', 'responses', 'messages'],
    policy: '加权随机', weighted: true, detail: '先选优先级，再按组内权重分流',
    routes: [
      { channel: 'A', model: 'vendor-a/glm-5.3', enabled: true, priority: 0, weight: 70 },
      { channel: 'B', model: 'vendor-b/glm-5.3', enabled: true, priority: 0, weight: 30 },
      { channel: 'D', model: 'vendor-d/glm-5.3', enabled: true, priority: 1, weight: 100 },
      { channel: 'E', model: 'vendor-e/glm-5.3', enabled: true, priority: 0, weight: 100 }
    ] },
  { id: 'kimi', name: 'Kimi K3', callId: 'kimi-k3', enabled: true, protocols: ['chat'],
    policy: '最低延迟', detail: '从可用上游模型中择优',
    routes: [
      { channel: 'A', model: 'vendor-a/kimi-k3', enabled: true, priority: 0, weight: 100 },
      { channel: 'B', model: 'vendor-b/kimi-k3', enabled: false, priority: 0, weight: 50 },
      { channel: 'C', model: 'vendor-c/kimi-k3', enabled: true, priority: 1, weight: 100 }
    ] },
  { id: 'r1', name: 'DeepSeek R1', callId: 'deepseek-r1', enabled: false, protocols: ['messages'],
    policy: '最低 TPM', detail: '已配置 · 服务已停服',
    routes: [{ channel: 'A', model: 'vendor-a/deepseek-r1', enabled: true, priority: 0, weight: 100 }] },
  { id: 'embedding', name: 'BGE-M3', callId: 'text-embedding', type: '向量模型', enabled: true, protocols: ['embeddings'],
    policy: '加权随机', weighted: true, detail: '先选优先级，再按组内权重分流',
    routes: [{ channel: 'F', model: 'vendor-f/text-embedding', enabled: true, priority: 0, weight: 100 }] }
];
export const examples = [
  { protocol: 'ark', service: 'video', draw: 0 },
  { protocol: 'dashscope', service: 'video', draw: 0 },
  { protocol: 'minimax', service: 'video', draw: 0 },
  { protocol: 'chat', service: 'glm', hit: 'A', draw: 0.3 },
  { protocol: 'chat', service: 'glm', hit: 'B', draw: 0.82 },
  { protocol: 'responses', service: 'glm', draw: 0 },
  { protocol: 'messages', service: 'glm', hit: 'B', draw: 0.82 },
  { protocol: 'embeddings', service: 'embedding', draw: 0 },
  { protocol: 'chat', service: 'kimi' },
  { protocol: 'messages', service: 'r1' }
];

export const branchId = (service, route) => service.id + '-' + route.channel;
export const endpoint = channel => channel.origin + protocols[channel.format].path;
export const canForward = (input, channel) => input === channel.format || input === channel.convertsFrom;

export function planDemoRequest(example) {
  const { protocol, service: serviceId, draw } = example;
  const service = services.find(item => item.id === serviceId);
  const steps = [];
  const walk = (from, to, message, tone = 'request') => steps.push({ from, to, message, tone });
  const policy = service.id + '-policy';
  const input = protocols[protocol];
  walk(protocol, 'gateway', input.name + ' · POST ' + input.path);
  walk('gateway', service.id, '匹配模型服务 · ' + service.callId);
  if (!service.enabled) {
    walk('gateway', service.id, service.name + ' 已停服', 'denied');
    walk(protocol, 'gateway', '返回拒绝响应', 'denied');
    steps.push({ stage: 'done', message: '已返回拒绝响应 · 服务已停服' });
    return { steps, group: [], standby: [] };
  }

  const available = service.routes.filter(route => {
    const channel = channels[route.channel];
    return route.enabled && channel.enabled && canForward(protocol, channel);
  });
  const priority = Math.min(...available.map(route => route.priority));
  const group = available.filter(route => route.priority === priority);
  const standby = available.filter(route => route.priority !== priority);
  walk(service.id, policy, '校验连接状态与协议兼容性');
  if (!group.length) {
    walk(service.id, policy, '无可用上游模型', 'denied');
    walk('gateway', service.id, '返回拒绝响应', 'denied');
    walk(protocol, 'gateway', '返回拒绝响应', 'denied');
    steps.push({ stage: 'done', message: '已返回拒绝响应 · 无可用上游模型' });
    return { steps, group, standby };
  }
  steps.push({ stage: 'group', message: '优先级 ' + priority + ' 入组 · ' +
    group.map(route => '连接 ' + route.channel).join('、') +
    (standby.length ? ' · 连接 ' + standby.map(route => route.channel).join('、') + ' 待命' : '') });
  // shortcut: only one eligible branch in non-weighted sample scenarios; real routing uses engine observations.
  let chosen = group[0];
  if (service.weighted && group.length > 1) {
    let remaining = draw * group.reduce((total, route) => total + route.weight, 0);
    chosen = group.find(route => (remaining -= route.weight) < 0);
  }
  steps.push({ stage: 'chosen', message: (service.weighted && group.length > 1
    ? '组内权重 ' + group.map(route => route.channel + ' ' + route.weight).join(' / ') + ' · '
    : '唯一可用候选 · ') + '命中连接 ' + chosen.channel });

  const channel = channels[chosen.channel];
  const format = protocols[channel.format].name;
  const id = branchId(service, chosen);
  const conversion = id + '-conversion';
  const upstream = id + '-channel';
  const video = service.id === 'video';
  const response = video ? '任务已受理 · 返回任务 ID' : '200 OK';
  walk(policy, conversion, channel.format === protocol ? '原生转发 · ' + format : input.name + ' → ' + format);
  walk(conversion, upstream, '请求转发 · ' + endpoint(channel));
  walk(upstream, id, (video ? '提交视频生成任务 · ' : '调用上游模型 · ') + chosen.model);
  for (const [from, to] of [[upstream, id], [conversion, upstream], [policy, conversion],
    [serviceId, policy], ['gateway', serviceId], [protocol, 'gateway']]) {
    walk(from, to, response + ' · 连接 ' + chosen.channel, 'response');
  }
  steps.push({ stage: 'done', message: response + ' · 本次命中连接 ' + chosen.channel });
  return { steps, group: group.map(route => branchId(service, route)),
    standby: standby.map(route => branchId(service, route)), chosen: id };
}
