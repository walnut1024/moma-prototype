import { callObservations } from './call-observations.mjs';

const minute = 60_000;
const hour = 60 * minute;
const models = [
  { id: 'demo-performance-deepseek', name: 'DeepSeek V4 Pro', modelId: 'deepseek-v4-pro', type: 'text' },
  { id: 'demo-performance-doubao', name: 'Doubao Seed 1.6', modelId: 'doubao-seed-1.6', type: 'text' },
];
const providers = [
  { id: 'demo-performance-deepseek-provider', name: 'DeepSeek（模拟）' },
  { id: 'demo-performance-shared-provider', name: '共享推理服务商（模拟）' },
  { id: 'demo-performance-ark-provider', name: '火山方舟（模拟）' },
];
const channels = [
  { id: 'demo-performance-main', name: '直连主线', providerId: providers[0].id },
  { id: 'demo-performance-standby', name: '直连备线', providerId: providers[0].id },
  { id: 'demo-performance-shared', name: '共享推理连接', providerId: providers[1].id },
  { id: 'demo-performance-ark', name: '北京推理连接', providerId: providers[2].id },
];
const routes = [
  { model: models[0], channel: channels[0], upstream: 'deepseek-v4-pro', latency: 620, speed: 113, cache: 82 },
  { model: models[0], channel: channels[1], upstream: 'deepseek-v4-pro', latency: 820, speed: 85, cache: 74 },
  { model: models[0], channel: channels[2], upstream: 'deepseek-v4-flash', latency: 390, speed: 146, cache: 66 },
  { model: models[1], channel: channels[3], upstream: 'doubao-seed-1.6', latency: 450, speed: 132, cache: 77 },
];
const users = ['A', 'B', 'C', 'D'].map(letter => ({
  id: `demo-performance-user-${letter.toLowerCase()}`, name: `示例调用用户 ${letter}`,
}));
const failures = [
  { httpStatus: 0, durationMs: 8000, isTimeout: true, code: 'upstream_timeout', errorMessage: '模拟上游响应超时' },
  { httpStatus: 503, durationMs: 150, code: 'upstream_unavailable', errorMessage: '模拟上游服务不可用' },
  { httpStatus: 429, durationMs: 75, code: 'upstream_rate_limit', errorMessage: '模拟上游限流' },
  { httpStatus: 400, durationMs: 65, code: 'upstream_invalid_request', errorMessage: '模拟上游参数错误' },
  { httpStatus: 401, durationMs: 73, code: 'upstream_unauthorized', errorMessage: '模拟上游认证失败' },
  { httpStatus: 0, durationMs: 280, code: 'upstream_network_error', errorMessage: '模拟上游网络错误' },
  { httpStatus: 403, durationMs: 81, code: 'upstream_forbidden', errorMessage: '模拟上游拒绝请求' },
];

function demoRequest(slot, route, routeIndex, repetition) {
  const ordinal = routeIndex * 9 + repetition;
  const startedAt = slot + (ordinal + 1) * 1000;
  const sample = Math.floor(slot / minute) * 37 + ordinal * 11;
  const user = users[sample % users.length];
  const context = sample % 31;
  const input = context === 0 ? 66_000 + sample % 2400
    : context <= 3 ? 3000 + sample % 20_000 : 54 + sample % 2500;
  const output = sample % 23 === 0 ? 1400 + sample % 3000 : 31 + sample % 540;
  const cacheRate = sample % 29 === 0 ? 0 : route.cache + sample % 15 - 7;
  const ttftMs = route.latency + Math.round(Math.sqrt(input) * 5) + sample % 260;
  const generationDurationMs = Math.round(1000 * (output - 1) / (route.speed + sample % 29 - 14));
  const failure = sample % 47 < 2 ? failures[Math.floor(sample / 47) % failures.length] : null;
  // Demo failures end before the upstream processes any billable Token.
  const response = failure ? { ...failure, usageConfirmed: true, usage: { input: 0, output: 0 } }
    : { httpStatus: 200, ttftMs, generationDurationMs, durationMs: ttftMs + generationDurationMs,
      usage: { input, output, cached: Math.round(input * cacheRate / 100) } };
  return {
    requestId: `demo-performance-${slot}-${ordinal}`, startedAt, modelId: route.model.id,
    publicModelId: route.model.modelId, userId: user.id, source: '模拟请求', ...response,
    attempts: [{ dispatched: true, startedAt, channelId: route.channel.id, endpointId: route.channel.id,
      upstreamModelId: route.upstream, ...response }],
  };
}

export function createModelPerformanceDemo(now = Date.now()) {
  const lastCompleteMinute = Math.floor(now / minute) * minute - minute;
  // Keep recent samples dense for the default hourly view and use hourly samples for the wider demo range.
  const recent = Array.from({ length: 120 }, (_, index) => {
    const slot = lastCompleteMinute - index * minute;
    return { slot, count: 2 + Math.floor(slot / (13 * minute)) % 5 };
  });
  const history = Array.from({ length: 166 }, (_, index) => ({ slot: lastCompleteMinute - (index + 3) * hour, count: 1 }));
  const requests = [...recent, ...history]
    .flatMap(({ slot, count }) => routes.flatMap((route, routeIndex) =>
      Array.from({ length: count }, (_, repetition) => demoRequest(slot, route, routeIndex, repetition))))
    .filter(request => request.startedAt + request.durationMs <= now);
  return callObservations({ models, users, providers, endpoints: channels, requests }).attempts;
}
