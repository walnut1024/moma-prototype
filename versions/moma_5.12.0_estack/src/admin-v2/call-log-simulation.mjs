const model = { id: 'demo-log-model', name: 'DeepSeek V4 Pro', modelId: 'deepseek-v4-pro', type: 'text' };
const backupModel = { id: 'demo-log-backup-model', name: 'DeepSeek V4 Flash', modelId: 'deepseek-v4-flash', type: 'text' };
export const routingDemoRequestId = 'req-ROUTE-001';
const tenant = { id: 'demo-log-tenant', name: '示例客户' };
const project = { id: 'demo-log-project', name: '客服机器人' };
const provider = { id: 'demo-log-provider', name: '示例服务商' };
const day = 86_400_000;
const doubaoModel = { id: 'demo-health-doubao', name: 'Doubao Seed 1.6', modelId: 'doubao-seed-1.6', type: 'text' };
const trendProviders = [
  { id: 'demo-health-deepseek', name: 'DeepSeek（模拟）', baseUrl: 'https://api.deepseek.com' },
  { id: 'demo-health-silicon', name: '硅基流动（模拟）', baseUrl: 'https://api.siliconflow.cn/v1' },
  { id: 'demo-health-ark', name: '火山方舟（模拟）', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3' },
];
const trendEndpoints = [
  ['deepseek-primary', '直连主线', 0], ['deepseek-backup', '直连备线', 0],
  ['silicon-shared', '共享推理连接', 1], ['ark-primary', '北京推理连接', 2],
  ['ark-reserve', '北京备用连接', 2],
].map(([slug, name, providerIndex]) => ({
  id: 'demo-health-' + slug, name, providerId: trendProviders[providerIndex].id, providerName: trendProviders[providerIndex].name,
  baseUrl: trendProviders[providerIndex].baseUrl,
}));

// Each period lists total attempts, successful attempts, TTFT (ms), output tokens/s, and cache hit %.
const channelTrendProfiles = [
  { model, endpoint: trendEndpoints[0], prices: [2.2, 8.8], periods: [[28, 28, 390, 117, 42], [35, 34, 460, 108, 51], [31, 30, 420, 121, 46]] },
  { model, endpoint: trendEndpoints[1], prices: [2.2, 8.8], periods: [[24, 23, 630, 78, 26], [30, 26, 810, 62, 32], [32, 21, 1260, 43, 18]] },
  { model, endpoint: trendEndpoints[2], prices: [2.8, 10.4], periods: [[21, 20, 520, 96, 34], [28, 27, 580, 87, 48], [25, 24, 540, 91, 41]] },
  { model: backupModel, endpoint: trendEndpoints[2], prices: [0.9, 3.6], periods: [[4, 4, 250, 150, 12], [5, 4, 320, 130, 24], [6, 6, 280, 162, 19]] },
  { model: doubaoModel, endpoint: trendEndpoints[3], prices: [1.2, 6.0], periods: [[32, 31, 330, 144, 38], [38, 38, 280, 156, 52], [35, 34, 305, 150, 49]] },
  { model: doubaoModel, endpoint: trendEndpoints[4], prices: [1.35, 6.4], periods: [], enabled: false },
];

const channelTrendCatalogue = channelTrendProfiles.map(({ model: upstream, endpoint, prices, enabled = true }) => {
  const channelModel = JSON.stringify([endpoint.providerId, endpoint.id, upstream.modelId]);
  return {
    channelModel, provider: endpoint.providerId, providerName: endpoint.providerName, endpoint: endpoint.id,
    channel: endpoint.id, channelName: endpoint.name, upstreamModelId: upstream.modelId, baseUrl: endpoint.baseUrl, enabled,
    cost: { key: channelModel, items: prices.map((price, index) => ({
      name: index === 0 ? '输入 Token' : '输出 Token', amount: Math.round(price * 1_000_000), currency: 'CNY', unit: '百万 Token',
    })) },
  };
});

export const defaultLogPolicy = { captureBody: false, projectId: 'all', sampleRate: 25, retentionDays: 30, maxSamples: 5000 };
const channels = ['A', 'B', 'C', 'D'].map(letter => ({
  id: 'demo-channel-' + letter, name: '连接 ' + letter, endpointId: 'endpoint-' + letter, providerId: provider.id,
  baseUrl: 'https://channel-' + letter.toLowerCase() + '.example.test/v1',
}));

const request = (requestId, startedAt, fields) => ({
  requestId, startedAt, modelId: model.id, publicModelId: 'support-chat', tenantId: tenant.id,
  projectId: project.id, source: '模拟请求', purpose: 'gateway-test', ...fields,
});
const attempt = (channel, fields) => ({
  dispatched: true, channelId: channel.id, endpointId: channel.id, upstreamModelId: model.modelId, ...fields,
});
const phase = (id, label, offset, duration, fields = []) => ({ id, label, offset, duration, fields });
const point = (id, label, offset) => ({ id, label, offset, point: true });
const routeNodes = channel => [
  phase('admission', '鉴权与权限校验', 0, 12),
  phase('project-route', '项目路由', 12, 3, [['策略标识', 'support-chat'], ['命中规则', '默认规则'], ['目标模型服务', model.name]]),
  phase('channel-route', '连接选路', 15, 5, [['模型服务', model.name], ['所选连接', channel.name], ['选路依据', '上下文长度、优先级']]),
];
const summaryOnly = { traceState: 'not-retained', body: { state: 'not-retained' } };
const segment = (id, label, value, attemptIndex) => ({ id, label, attemptIndex, text: JSON.stringify(value, null, 2) });

function channelTrendRequests(now) {
  return channelTrendProfiles.flatMap(({ model: upstream, endpoint, periods }, profileIndex) =>
    periods.flatMap(([count, successes, ttft, speed, cache], periodIndex) => {
      const minute = Math.floor((now - (60 - periodIndex * 24) * 3_600_000) / 60_000) * 60_000;
      return Array.from({ length: count }, (_, index) => {
        const startedAt = minute + Math.floor(index * 55_000 / count);
        const success = Math.floor((index + 1) * successes / count) > Math.floor(index * successes / count);
        const jitter = (index * 37 + profileIndex * 3) % 11 - 5;
        const ttftMs = ttft + jitter * 13;
        const input = 640 + (index * 173) % 2100;
        const output = 72 + (index * 31) % 180;
        const generationDurationMs = Math.round(1000 * output / (speed + jitter * 2));
        const failure = index % 2 === 0 ? { httpStatus: 503, errorMessage: '模拟上游服务不可用' }
          : { httpStatus: 0, isTimeout: true, code: 'upstream_timeout', errorMessage: '模拟上游响应超时' };
        const usage = { input, output, cached: Math.round(input * (cache + jitter) / 100) };
        const response = success
          ? { httpStatus: 200, ttftMs, generationDurationMs, usage, durationMs: ttftMs + generationDurationMs }
          : { ...failure, durationMs: failure.isTimeout ? 5000 : 120 };
        return request('req-health-' + profileIndex + '-' + periodIndex + '-' + index, startedAt, {
          modelId: upstream.id, publicModelId: upstream.modelId, ...response,
          attempts: [attempt(endpoint, { upstreamModelId: upstream.modelId, startedAt, ...response })],
        });
      });
    }));
}

export function createCallLogSimulation(now = Date.now(), { channelTrend = false } = {}) {
  const [a, b, c, d] = channels;
  const age = minutes => now - minutes * 60_000;
  const startedAt = age(1);
  const routingDemo = request(routingDemoRequestId, startedAt, {
    durationMs: 1260, firstPacketMs: 1050, ttftMs: 1080, httpStatus: 200, usage: { input: 42, output: 44 },
    attempts: [
      attempt(a, { startedAt: startedAt+20, durationMs: 300, isTimeout: true, code: 'upstream_timeout',
        errorMessage: '等待首包超时' }),
      attempt(b, { startedAt: startedAt+330, durationMs: 200, httpStatus: 503, errorMessage: '上游服务不可用' }),
      attempt(c, { startedAt: startedAt+540, durationMs: 310, isTimeout: true, code: 'upstream_timeout',
        errorMessage: '备用优先级组等待首包超时', fallback: true, fallbackReason: '主模型服务已达到总尝试上限' }),
      attempt(d, { startedAt: startedAt+860, durationMs: 400, httpStatus: 200, ttftMs: 214, generationDurationMs: 180,
        usage: { input: 42, output: 44, cached: 0 }, successReason: '备用模型返回首个 Token，响应正常结束', nextAction: '向客户返回结果',
        upstreamModelId: backupModel.modelId, upstreamRequestId: 'up-D-ROUTE-001' }),
    ],
  });
  const recovered = request('req-73F2', age(2), {
    durationMs: 1220, firstPacketMs: 1005, ttftMs: 1015, httpStatus: 200, usage: { input: 42, output: 44 },
    attempts: [
      attempt(a, { startedAt: age(2) + 20, durationMs: 800, httpStatus: 0, isTimeout: true, code: 'upstream_timeout',
        errorMessage: '等待首包超时', fallback: true, fallbackReason: '首选连接超时' }),
      attempt(b, { startedAt: age(2) + 835, durationMs: 385, httpStatus: 200, ttftMs: 176, generationDurationMs: 205,
        usage: { input: 42, output: 44, cached: 12 }, successReason: '连接回退后响应正常结束', upstreamRequestId: 'up-B-29D' }),
    ],
  });
  const full = request('req-61AE', age(4), {
    durationMs: 620, ttftMs: 260, httpStatus: 200, usage: { input: 20, output: 22 },
    attempts: [attempt(b, { startedAt: age(4) + 20, durationMs: 600, httpStatus: 200, ttftMs: 232, generationDurationMs: 360,
      usage: { input: 20, output: 22, cached: 8 }, successReason: '首选连接响应正常结束', upstreamRequestId: 'up-B-17E' })],
  });
  const blocked = request('req-49C1', age(6), {
    durationMs: 16, httpStatus: 429, errorMessage: '超过项目的模型请求速率限制',
    attempts: [{ dispatched: false, error: 'rate_limit_exceeded' }],
  });
  const unauthorized = request('req-49D3', age(7), {
    durationMs: 8, httpStatus: 401, errorMessage: 'API 密钥未通过认证', tenantId: null, projectId: null,
    modelId: null, publicModelId: null, attempts: [{ dispatched: false, error: 'auth_rejected' }],
  });
  const invalid = request('req-4A92', age(9), {
    durationMs: 8, httpStatus: 400, errorMessage: '缺少必填参数 messages',
    attempts: [{ dispatched: false, error: 'invalid_request' }],
  });
  const summary = request('req-20D4', age(8), {
    durationMs: 487, httpStatus: 200, providerId: provider.id, channelId: b.id, usage: { input: 22, output: 36 },
  });
  const partial = request('req-19BF', age(10), {
    durationMs: 910, httpStatus: 502,
    attempts: [{ dispatched: false }, attempt(a, { durationMs: 410, httpStatus: 502,
      upstreamRequestId: 'up-A-16B', errorMessage: '上游服务异常' })],
  });
  const upstreamLimited = request('req-52C0', age(12), {
    durationMs: 78, httpStatus: 429,
    attempts: [attempt(a, { startedAt: age(12) + 20, durationMs: 58, httpStatus: 429,
      upstreamRequestId: 'up-A-6C0', errorMessage: '连接触发速率限制' })],
  });
  const interrupted = request('req-82D1', age(14), {
    durationMs: 420, ttftMs: 110, httpStatus: 200, streamInterrupted: true, errorMessage: '流式输出中断',
    attempts: [attempt(b, { startedAt: age(14) + 20, durationMs: 400, httpStatus: 200, status: 'failed',
      upstreamRequestId: 'up-B-82D1', errorMessage: '流式输出中断' })],
  });
  return {
    retainNew: true, latestRequestId: '', callNumber: 0, policy: defaultLogPolicy,
    preflightEvents: [blocked, unauthorized, invalid],
    ...(channelTrend && { channelTrendCatalogue, channelTrendFilters: {
      period: 'custom', start: new Date(now - 3 * day).toISOString(), end: new Date(now).toISOString(),
      supply: trendProviders.map(item => [item.id, null]),
    } }),
    data: {
      tenants: [tenant], projects: [project],
      models: channelTrend ? [model, backupModel, doubaoModel] : [model, backupModel],
      providers: channelTrend ? [provider, ...trendProviders] : [provider],
      endpoints: channelTrend ? [...channels, ...trendEndpoints] : channels,
      requests: [routingDemo, recovered, full, blocked, unauthorized, summary, invalid, partial, upstreamLimited, interrupted,
        ...(channelTrend ? channelTrendRequests(now) : [])],
    },
    evidence: {
      [routingDemo.requestId]: {
        traceState: 'complete', attemptCount: 4, resultLabel: '备用模型响应成功',
        nodes: [
          phase('admission', '鉴权与权限校验', 0, 12),
          phase('project-route', '命中项目路由', 12, 3, [
            ['项目', project.name], ['策略标识', 'support-chat'], ['命中条件', 'metadata._user = vip'],
            ['目标模型服务', model.name], ['备用模型服务', backupModel.name],
          ]),
          phase('channel-route', '优先级组 P1 选路', 15, 5, [
            ['组内权重', '连接 A 70%，连接 B 30%'], ['选中连接', '连接 A'], ['选中原因', '连接 A 在 P1 候选组内按权重命中'],
            ['重试条件', '上游超时、上游 5xx'], ['每组重试次数', '1 次'],
            ['跨组切换次数', '1 次'], ['主模型总尝试上限', '3 次'],
          ]),
          phase('group-retry', '组内重试', 320, 10, [['原因', '连接 A 超时'], ['下一次尝试', 'P1 · 连接 B']]),
          phase('group-switch', '跨组切换', 530, 10, [['原因', 'P1 已达到组内重试上限'], ['下一次尝试', 'P2 · 连接 C']]),
          phase('model-fallback', '切换备用模型服务', 850, 10, [
            ['原因', 'P2 超时，主模型服务已达到总尝试上限'], ['备用模型服务', backupModel.name], ['下一次尝试', '连接 D'],
          ]),
          point('first-token', '返回首个 Token', 1080),
          point('end', '响应结束 · HTTP 200', 1260),
        ],
        attemptActions: { 1: '组内重试至 P1 · 连接 B', 2: '跨组切换至 P2 · 连接 C', 3: '切换备用模型服务 · 连接 D' },
        body: { state: 'not-retained' },
      },
      [recovered.requestId]: {
        traceState: 'complete', attemptCount: 2, resultLabel: '回退后成功',
        nodes: [...routeNodes(a), phase('fallback', '连接回退', 820, 15, [['回退原因', '首选连接超时'], ['切换去向', '连接 A → 连接 B']]),
          point('first-token', '返回首个 Token', 1015), point('end', '响应结束', 1220)],
        attemptActions: { 1: '同一模型服务内切换至连接 B' },
        body: { state: 'not-retained' },
      },
      [full.requestId]: {
        traceState: 'complete', attemptCount: 1,
        nodes: [...routeNodes(b), point('first-token', '返回首个 Token', 260), point('end', '响应结束', 620)],
        body: { allowed: true, segments: [
          segment('client-request', '客户请求', { model: 'support-chat', messages: [{ role: 'user', content: '列出三个服务巡检项。' }] }),
          segment('upstream-request', '上游尝试 1 · 连接 B · 请求', { model: 'deepseek-v4-pro', input: '列出三个服务巡检项。' }, 1),
          segment('upstream-response', '上游尝试 1 · 连接 B · 响应', { id: 'up-B-17E', status: 200, output: '检查可用性、延迟和错误率。' }, 1),
          segment('client-response', '返回客户的最终响应', { id: 'req-61AE', status: 200, message: '检查可用性、延迟和错误率。' }),
        ] },
      },
      [blocked.requestId]: {
        traceState: 'complete', attemptCount: 0, resultLabel: '限流拦截',
        nodes: [phase('auth', '鉴权', 0, 11),
          { ...phase('limit', '项目模型限流', 11, 5, [['失败原因', blocked.errorMessage]]), status: '已拦截', tone: 'red' },
          point('end', '返回 429', 16)],
        body: { state: 'not-retained' },
      },
      [summary.requestId]: summaryOnly,
      [partial.requestId]: { traceState: 'partial', body: { state: 'not-retained' } },
      [upstreamLimited.requestId]: {
        traceState: 'partial', attemptCount: 1,
        body: { allowed: true, segments: [
          { id: 'upstream-request', label: '上游尝试 1 · 连接 A · 请求', attemptIndex: 1, state: 'expired' },
          segment('upstream-response', '上游尝试 1 · 连接 A · 响应', { id: 'up-A-6C0', status: 429, error: 'rate_limit' }, 1),
        ] },
      },
      [interrupted.requestId]: {
        traceState: 'complete', attemptCount: 1,
        nodes: [...routeNodes(b), point('first-token', '返回首个 Token', 110), point('end', '流式响应中断', 420)],
        body: { allowed: false },
      },
    },
  };
}

export function applyLogPolicy(simulation, policy, now = Date.now()) {
  const { sampleRate, retentionDays, maxSamples, projectId } = policy;
  if (!Number.isInteger(sampleRate) || sampleRate < 1 || sampleRate > 100
      || !Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 365
      || !Number.isSafeInteger(maxSamples) || maxSamples < 100
      || (projectId !== 'all' && !simulation.data.projects.some(row => row.id === projectId))) return null;
  const preflightIds = new Set(simulation.preflightEvents.map(row => row.requestId));
  const retained = simulation.data.requests.filter(row => preflightIds.has(row.requestId))
    .filter(row => now - row.startedAt < retentionDays * day)
    .toSorted((a, b) => b.startedAt - a.startedAt).slice(0, maxSamples);
  const samples = new Set(retained.map(row => row.requestId));
  return { ...simulation, policy, data: { ...simulation.data,
    requests: simulation.data.requests.filter(row => !preflightIds.has(row.requestId) || samples.has(row.requestId)) } };
}

export function simulateLogRequest(simulation, now = Date.now(), { preflight = false, random = Math.random } = {}) {
  const callNumber = simulation.callNumber + 1;
  const latestRequestId = 'req-sim-' + String(callNumber).padStart(3, '0');
  const next = { ...simulation, callNumber, latestRequestId };
  if (preflight) {
    const row = request(latestRequestId, now - 20, {
      durationMs: 8, httpStatus: 400, errorMessage: '缺少必填参数 messages', attempts: [{ dispatched: false, error: 'invalid_request' }],
    });
    const updated = { ...next, preflightEvents: [row, ...next.preflightEvents] };
    if (next.retainNew && random() * 100 < next.policy.sampleRate) {
      updated.data = { ...next.data, requests: [row, ...next.data.requests] };
    }
    return applyLogPolicy(updated, next.policy, now);
  }
  if (!next.retainNew) return next;
  const row = request(latestRequestId, now - 1_000, {
    durationMs: 487, httpStatus: 200, providerId: provider.id, channelId: channels[1].id,
    usage: { input: 12, output: 18 },
  });
  const capture = next.policy.captureBody && (next.policy.projectId === 'all' || next.policy.projectId === row.projectId);
  const evidence = capture ? { ...summaryOnly, body: { allowed: true, segments: [
    segment('request', '客户请求', { model: row.publicModelId, messages: [{ role: 'user', content: '执行一次服务巡检。' }] }),
    segment('response', '返回客户的最终响应', { id: row.requestId, status: 200, message: '巡检完成。' }),
  ] } } : summaryOnly;
  return {
    ...next, data: { ...next.data, requests: [row, ...next.data.requests] },
    evidence: { ...next.evidence, [row.requestId]: evidence },
  };
}
