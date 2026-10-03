import { apiKeyOptions } from './api-key-data.mjs';
import { shanghaiDate } from './call-log-data.mjs';

export const usageModels = {
  文本模型: ['DeepSeek-V4-Pro', 'DeepSeek-V4-Flash', 'DeepSeek-V4-Flash-0731', 'Qwen3.7-Max', 'Qwen3-32B', 'Qwen3.5-27B', 'Qwen3.5-9B', 'Qwen3.5-35B-A3B', 'Qwen3.5-397B-A17B', 'GLM-5.1', 'GLM-5.2', 'Kimi-K2.6', 'Kimi-K2.7-Code', 'Kimi-K3', 'MiniMax-M3', 'qwen3-max', 'qwen3.5-flash', 'qwen3.5-plus', 'qwen3.6-flash', 'qwen3.6-plus', 'qwen3.7-plus'],
  视觉理解: ['Qwen-VL', 'GLM-VL'],
  多模态模型: ['Qwen-Omni', 'GLM-Omni'],
  图片生成: ['Qwen-Image', 'Seedream', 'HY-Image'],
  视频生成: ['MiniMax-H3', 'Wan3.0-Video', 'Seedance-2.0'],
  语音合成: ['Qwen-Audio-TTS'],
  语音识别: ['Qwen-Audio-ASR-Flash'],
  向量模型: ['BGE-M3'],
  重排模型: ['BGE-Reranker-V2-M3'],
};
const tier32 = ['0＜输入长度≤32K', '32K＜输入长度≤128K', '128K＜输入长度≤252K'];
const tier128 = ['0＜输入长度≤128K', '128K＜输入长度≤256K'];
const tier256 = ['0＜输入长度≤256K', '256K＜输入长度≤1M'];
const tier1M = ['0＜输入长度≤128K', '128K＜输入长度≤256K', '256K＜输入长度≤1M'];
export const languageMetering = {
  'DeepSeek-V4-Pro': { cache: true },
  'DeepSeek-V4-Flash-0731': { cache: true },
  'Qwen3.7-Max': { cache: true, explicit: true },
  'Qwen3-32B': { modes: true },
  'Qwen3.5-35B-A3B': { tiers: tier128, modes: true },
  'Qwen3.5-397B-A17B': { tiers: tier128 },
  'GLM-5.1': { tiers: ['0＜输入长度≤32K', '32K＜输入长度≤200K'], cache: true },
  'GLM-5.2': { cache: true },
  'Kimi-K2.6': { cache: true, cachedInput: true },
  'Kimi-K2.7-Code': { cache: true, cachedInput: true },
  'Kimi-K3': { cache: true, cachedInput: true },
  'MiniMax-M3': { tiers: ['0＜输入长度≤512K', '512K＜输入长度≤1M'], cache: true },
  'qwen3-max': { tiers: tier32, cache: true, explicit: true, cachedInput: true },
  'qwen3.5-flash': { tiers: tier1M, explicit: true },
  'qwen3.5-plus': { tiers: tier1M, explicit: true },
  'qwen3.6-flash': { tiers: tier256, explicit: true },
  'qwen3.6-plus': { tiers: tier256, explicit: true },
  'qwen3.7-plus': { tiers: tier256, cache: true, explicit: true, cachedInput: true },
};
export const usageModelGroups = [
  { id: '语言模型', name: '语言模型', types: ['文本模型'] },
  { id: '多模态理解', name: '多模态理解', types: ['多模态模型'] },
  { id: '视觉模型', name: '视觉模型', types: ['视觉理解', '图片生成', '视频生成'] },
  { id: '语音模型', name: '语音模型', types: ['语音合成', '语音识别'] },
  { id: '向量模型', name: '向量模型', types: ['向量模型'] },
  { id: '排序模型', name: '排序模型', types: ['重排模型'] },
];
export const fields = {
  successRate: ['成功率', '%', '成功次数 ÷ 请求次数。'],
  latencyP95: ['P95 响应时延', '秒', '95% 的成功请求响应耗时不超过此值，按请求样本计算。'],
  models: ['调用模型数', '个', '所选范围内实际产生请求的去重模型数。'],
  success: ['成功次数', '次', '成功完成的业务请求数。'],
  failure: ['失败次数', '次', '未成功完成的业务请求数，包含其他异常状态。'],
  failureRate: ['失败率', '%', '失败次数 ÷ 调用总量；按原始请求数计算，不平均各时间段的百分比。'],
  average: ['平均单次请求 Token', 'Token/次', '已确认 Token 总量 ÷ 有 Token 计量的请求数，包含这些模型的失败请求。'],
  paidInput: ['付费输入 Token', 'Token', '服务商记录的需计费输入 Token；缓存折扣不等于免费。'],
  paidOutput: ['付费输出 Token', 'Token', '需计费的输出 Token，包含付费思考及非思考输出。'],
  cacheCreate: ['显式缓存创建', 'Token', '显式写入缓存的 Token，不能与缓存读取量相加当作输入总量。'],
  cacheRead: ['显式缓存命中', 'Token', '读取显式缓存的输入 Token，已包含在输入总量中。'],
  cacheRate: ['隐式缓存命中率', '%', '隐式缓存命中 Token ÷ 输入 Token。'],
  explicitRate: ['显式缓存命中率', '%', '显式缓存命中 Token ÷ 输入 Token，与隐式缓存分别统计。'],
  thinking: ['付费思考 Token', 'Token', '付费输出中的思考部分，仅适用于提供该计量字段的模型。'],
  nonThinking: ['付费非思考 Token', 'Token', '付费输出中的非思考部分；两部分之和等于付费输出 Token。'],
  latencyMin: ['最小响应时延', '秒', '区间内成功请求耗时的最小值。'],
  latencyMax: ['最大响应时延', '秒', '区间内成功请求耗时的最大值。'],
  rpm: ['平均 RPM', '次/分钟', '调用总量 ÷ 已观测分钟数，包含无请求的完整时间段。'],
  tpm: ['平均 TPM', 'Token/分钟', 'Token 总量 ÷ 已观测分钟数；仅用于提供 Token 计量的模型。'],
  inputMinute: ['每分钟输入 Token', 'Token/分钟', '时间桶内输入 Token ÷ 已观测分钟数，包含无请求分钟。'],
  cacheReadMinute: ['每分钟读缓存 Token', 'Token/分钟', '时间桶内隐式与显式缓存命中 Token 之和 ÷ 已观测分钟数；命中量已包含在输入 Token 中。'],
  cacheCreateMinute: ['每分钟写入缓存 Token', 'Token/分钟', '时间桶内已记录的显式缓存写入 Token ÷ 已观测分钟数；未记录的隐式写入不计入。'],
  cacheReadTotal: ['读缓存总 Token', 'Token', '时间桶内隐式与显式缓存命中 Token 之和，已包含在输入 Token 中。'],
  explicitReadMinute: ['每分钟读显式缓存 Token', 'Token/分钟', '时间桶内显式缓存命中 Token ÷ 已观测分钟数。'],
  inputPerRequest: ['平均输入 Token（TPR）', 'Token/次', '本页 TPR 指 Tokens Per Request；已确认输入 Token ÷ 有输入 Token 计量的请求数，包含这些模型的失败请求。'],
  outputPerRequest: ['平均输出 Token（TPR）', 'Token/次', '本页 TPR 指 Tokens Per Request；已确认输出 Token ÷ 有输出 Token 计量的请求数，包含这些模型的失败请求。'],
  ttft: ['平均 TTFT', '秒', '成功流式请求从发出到收到首个 Token 的平均时间。'],
  ttftMin: ['最小 TTFT', '秒', '成功流式请求的最小首 Token 时延。'],
  ttftMax: ['最大 TTFT', '秒', '成功流式请求的最大首 Token 时延。'],
  outputMinute: ['输出 Token / 分钟', 'Token/分钟', '输出 Token ÷ 已观测分钟数，表示时间窗口吞吐。'],
  outputSecond: ['输出 Token / 秒', 'Token/秒', '输出 Token ÷ 已观测秒数，表示时间窗口吞吐，不是单请求解码速度。'],
  status2: ['2xx', '次', '返回 2xx 状态码的请求数。'],
  status4: ['4xx', '次', '返回 4xx 状态码的请求数。'],
  status5: ['5xx', '次', '返回 5xx 状态码的请求数。'],
  statusOther: ['其他', '次', '其他状态码或未获得 HTTP 响应的请求数。'],
  textIn: ['文本输入', 'Token', '文本模态输入 Token。'],
  imageIn: ['图片输入', 'Token', '图片模态输入 Token，不是图片张数。'],
  videoIn: ['视频输入', 'Token', '视频模态输入 Token，不是视频秒数。'],
  audioIn: ['音频输入', 'Token', '音频模态输入 Token，不是音频秒数。'],
  textOut: ['文本输出', 'Token', '文本模态输出 Token。'],
  audioOut: ['音频输出', 'Token', '音频模态输出 Token；文本与音频相加为输出总量。'],
  videoNormal: ['含视频输入 · 普通', 'Token', '含视频输入、普通分辨率档的计量 Token。'],
  video1080: ['含视频输入 · 1080p', 'Token', '含视频输入、1080p 档的计量 Token。'],
  noVideoNormal: ['无视频输入 · 普通', 'Token', '不含视频输入、普通分辨率档的计量 Token。'],
  noVideo1080: ['无视频输入 · 1080p', 'Token', '不含视频输入、1080p 档的计量 Token。'],
  metered: ['计量 Token', 'Token', '四个互斥计量档位的 Token 之和；接口未提供独立时长，不换算为秒。'],
  requests: ['请求次数', '次', '所选区间内的业务请求数，含成功和失败请求，不包含异步任务状态轮询。'],
  total: ['总 Token', 'Token', '所选模型已确认的 Token 用量；可拆分模型按输入与输出之和计，不可拆分模型按其 Token 计量总量计。缓存不重复相加。'],
  input: ['输入 Token', 'Token', '包含缓存命中；视觉理解图片折算计入输入，重排包含 query 与 documents。'],
  output: ['输出 Token', 'Token', '模型响应消耗的 Token。'],
  cache: ['隐式缓存命中', 'Token', '输入中自动命中缓存的 Token，已计入输入与总量。'],
  images: ['成功生成图片', '张', '成功生成的图片张数，一次请求可以生成多张图片。'],
  audio: ['识别音频时长', '秒', '成功处理的输入音频时长，不是请求响应耗时。'],
  characters: ['合成字符数', '字符', '成功完成语音合成的输入字符数，不是 Token 数。'],
  latency: ['平均响应时延', '秒', '成功请求总耗时 ÷ 成功次数；异步任务按提交到完成计，不是音视频内容时长。'],
};
const calls = ['调用次数趋势', ['success', 'failure']];
const latency = ['响应时延', ['latency'], { variants: { 平均: ['latency'], 最小: ['latencyMin'], 最大: ['latencyMax'] } }];
const throughput = ['吞吐趋势', ['rpm'], { variants: { RPM: ['rpm'], TPM: ['tpm'] } }];
const status = ['调用状态分布', ['status2', 'status4', 'status5', 'statusOther'], { defaultType: 'bar', stacked: true }];
const common = [latency, throughput, status];
const tokenSummary = ['total', 'input', 'output', 'average'];
const llm = { summary: tokenSummary, charts: [calls,
  ['Token 用量趋势', ['input', 'output', 'cache'], { variants: { 总量: ['input', 'output', 'cache'], 付费: ['paidInput', 'paidOutput'] } }], ...common,
  ['缓存 Token 趋势', ['cache', 'cacheCreate', 'cacheRead']],
  ['缓存命中率', ['cacheRate', 'explicitRate']],
  ['付费输出构成', ['thinking', 'nonThinking'], { defaultType: 'bar', stacked: true }],
  ['首 Token 时延', ['ttft'], { variants: { 平均: ['ttft'], 最小: ['ttftMin'], 最大: ['ttftMax'] } }],
  ['输出吞吐', ['outputMinute'], { variants: { 每分钟: ['outputMinute'], 每秒: ['outputSecond'] } }],
] };
const inputOnly = { summary: ['input', 'average'], charts: [calls, ['输入 Token 趋势', ['input']], ...common] };
const nonToken = (title, key) => ({ summary: [key, 'latency'], charts: [calls, [title, [key]], latency, ['吞吐趋势', ['rpm']], status] });
export const usageViews = {
  文本模型: llm,
  视觉理解: llm,
  多模态模型: { summary: tokenSummary, charts: [calls, ['Token 用量趋势', ['input', 'output']], ...common, ['输入模态用量', ['textIn', 'imageIn', 'videoIn', 'audioIn']], ['输出模态用量', ['textOut', 'audioOut']]] },
  图片生成: nonToken('图片生成趋势', 'images'),
  视频生成: { summary: ['metered', 'average'], charts: [calls, ['视频计量趋势', ['videoNormal', 'video1080', 'noVideoNormal', 'noVideo1080']], ...common] },
  语音合成: nonToken('合成字符数趋势', 'characters'),
  语音识别: nonToken('识别音频时长趋势', 'audio'),
  向量模型: inputOnly,
  重排模型: inputOnly,
};
export function usageKeys(billing) {
  return apiKeyOptions(billing).map(key => key.id);
}
export function dateRange(days, now = new Date()) {
  const end = shanghaiDate(now);
  const start = new Date(Date.parse(`${end}T00:00:00+08:00`) - (days - 1) * 86400000);
  return { start: shanghaiDate(start), end };
}
export function usagePeriod(preset, now = new Date()) {
  if (preset === 'today') return dateRange(1, now);
  const previous = new Date(Date.parse(`${shanghaiDate(now)}T00:00:00+08:00`) - 1);
  return dateRange(preset === 'yesterday' ? 1 : preset === '7d' ? 7 : 30, previous);
}
const empty = () => ({ requests: 0, success: 0, failure: 0, status2: 0, status4: 0, status5: 0, statusOther: 0, duration: 0, observedMinutes: 0, modelNames: new Set(), modelRequests: {}, latencySamples: [] });
function peakTpm(minuteMaps) {
  const totals = new Map();
  for (const minutes of minuteMaps) for (const [minute, tokens] of minutes) totals.set(minute, (totals.get(minute) || 0) + tokens);
  return [...totals.values()].reduce((peak, tokens) => Math.max(peak, tokens), 0);
}
// ponytail: fixed demo proportions; replace with request-level metering facts when connected.
function splitTokens(total, count) {
  const weights = count === 2 ? [.84, .16] : [.72, .2, .08];
  let assigned = 0;
  return weights.slice(0, count).map((weight, index) => {
    const amount = index === count - 1 ? total - assigned : Math.floor(total * weight);
    assigned += amount;
    return amount;
  });
}
function addLanguageBreakdown(sample, profile) {
  const cacheTotal = (sample.cache ?? 0) + (sample.cacheRead ?? 0);
  if (profile.cachedInput && !profile.tiers) {
    sample.cachedInput = cacheTotal;
    sample.uncachedInput = sample.input - cacheTotal;
  }
  if (!profile.tiers) {
    if (profile.modes) {
      sample.thinkingModeOutput = Math.floor(sample.output * .65);
      sample.plainModeOutput = sample.output - sample.thinkingModeOutput;
    }
    return;
  }
  const count = profile.tiers.length;
  const input = splitTokens(sample.input, count);
  const output = splitTokens(sample.output, count);
  const cache = cacheTotal ? splitTokens(cacheTotal, count) : [];
  const created = sample.cacheCreate == null ? [] : splitTokens(sample.cacheCreate, count);
  const explicit = sample.cacheRead == null ? [] : splitTokens(sample.cacheRead, count);
  const cachedInput = profile.cachedInput ? splitTokens(profile.explicit ? sample.cache : cacheTotal, count) : [];
  for (let i = 0; i < count; i++) {
    sample[`tier${i}Input`] = input[i];
    sample[`tier${i}Output`] = output[i];
    if (cache.length) sample[`tier${i}Cache`] = cache[i];
    if (created.length) sample[`tier${i}Create`] = created[i];
    if (explicit.length) sample[`tier${i}Explicit`] = explicit[i];
    if (cachedInput.length) sample[`tier${i}CachedInput`] = cachedInput[i];
    if (profile.modes) {
      sample[`tier${i}ThinkingOutput`] = Math.floor(output[i] * .65);
      sample[`tier${i}PlainOutput`] = output[i] - sample[`tier${i}ThinkingOutput`];
    }
  }
}
function add(target, sample) {
  for (const [key, value] of Object.entries(sample)) {
    if (key === 'latencySamples') target.latencySamples.push(...value);
    else if (key === 'modelNames') value.forEach(name => target.modelNames.add(name));
    else if (key === 'modelRequests') for (const [name, count] of Object.entries(value)) target.modelRequests[name] = (target.modelRequests[name] || 0) + count;
    else if (key.endsWith('Min')) target[key] = Math.min(target[key] ?? Infinity, value);
    else if (key.endsWith('Max')) target[key] = Math.max(target[key] ?? -Infinity, value);
    else target[key] = (target[key] ?? 0) + value;
  }
}
function derived(row) {
  const { modelNames, latencySamples, ...result } = row;
  result.latencySamples = latencySamples;
  result.successRate = row.requests ? row.success / row.requests * 100 : null;
  const sorted = [...latencySamples].sort((a,b) => a[0]-b[0]);
  let count = 0;
  result.latencyP95 = null;
  for (const [duration, weight] of sorted) { count += weight; if (count >= row.success * .95) { result.latencyP95 = duration; break; } }
  result.models = modelNames.size;
  result.failureRate = row.requests ? row.failure / row.requests * 100 : null;
  result.latency = row.success ? row.duration / row.success : null;
  result.rpm = row.observedMinutes ? row.requests / row.observedMinutes : null;
  const tokens = row.total ?? row.metered ?? row.input;
  if (tokens !== undefined) {
    result.average = row.requests ? tokens / row.requests : null;
    result.tpm = row.observedMinutes ? tokens / row.observedMinutes : null;
  }
  if (row.input !== undefined) {
    result.inputMinute = row.observedMinutes ? row.input / row.observedMinutes : null;
    result.inputPerRequest = row.requests ? row.input / row.requests : null;
  }
  if (row.output !== undefined) {
    result.outputMinute = row.observedMinutes ? row.output / row.observedMinutes : null;
    result.outputPerRequest = row.requests ? row.output / row.requests : null;
  }
  if (row.cache !== undefined || row.cacheRead !== undefined) {
    result.cacheReadTotal = (row.cache ?? 0) + (row.cacheRead ?? 0);
    result.cacheReadMinute = row.observedMinutes ? result.cacheReadTotal / row.observedMinutes : null;
    if (row.cacheCreate !== undefined) result.cacheCreateMinute = row.observedMinutes ? row.cacheCreate / row.observedMinutes : null;
    if (row.cacheRead !== undefined) {
      result.explicitReadMinute = row.observedMinutes ? row.cacheRead / row.observedMinutes : null;
      result.explicitRate = row.input ? row.cacheRead / row.input * 100 : null;
    }
    if (row.cache !== undefined) result.cacheRate = row.input ? row.cache / row.input * 100 : null;
  }
  if (row.ttftDuration !== undefined) result.ttft = row.success ? row.ttftDuration / row.success : null;
  if (result.outputMinute !== undefined) result.outputSecond = result.outputMinute == null ? null : result.outputMinute / 60;
  return result;
}
// Deterministic five-minute prototype samples. Coarser graphs aggregate the same samples.
export function usageData({ billing, type, dimension = 'Model ID', targets = [], modelIds = null, apiKeyIds = null, start, end, minutes = 60, now = new Date(), source = 'standard', apiKeyId = null }) {
  const begin = Date.parse(`${start}T00:00:00+08:00`);
  const availableUntil = now.getTime() - (source === 'aicc' ? 3 * 3600000 : 0);
  const finish = Math.min(Date.parse(`${end}T00:00:00+08:00`) + 86400000, availableUntil);
  if (!usageModels[type] || ![5, 10, 60, 1440].includes(minutes) || !Number.isFinite(begin) || !Number.isFinite(finish) || begin >= finish || finish - begin > 31 * 86400000) return { buckets: [], summary: derived(empty()), minuteTokens: new Map(), availableUntil };
  const models = usageModels[type];
  const keys = usageKeys(billing);
  const sourceFactor = { 按量付费: 1, 'Token Plan': .61, 资源包: .38 }[billing] * (source === 'aicc' ? .43 : 1);
  const buckets = new Map();
  const modelBuckets = new Map();
  const minuteTokens = new Map();
  const summary = empty();
  for (let time = begin; time + 300000 <= finish; time += 300000) {
    const row = empty();
    row.observedMinutes = 5;
    models.forEach((model, m) => keys.forEach((key, k) => {
      if (apiKeyId !== null && apiKeyId !== key) return;
      if (targets.length && !targets.includes(dimension === 'Model ID' ? model : key)) return;
      if (modelIds !== null && !modelIds.includes(model)) return;
      if (apiKeyIds !== null && !apiKeyIds.includes(key)) return;
      const phase = time / 3600000 + m * 2 + k;
      const weight = (.7 + .3 * Math.sin(phase / 3)) * sourceFactor * (models.length - m) / models.length * (k ? .24 : .76);
      const requests = Math.max(0, Math.round(30 * weight));
      if (!requests) return;
      const failure = Math.floor(time / 300000 + m + k) % 23 === 0 ? 1 : 0;
      const success = requests - failure, errorType = Math.floor(time / 300000 + m) % 3;
      const duration = (type === '视频生成' ? 65 : type === '图片生成' ? 8.6 : 2.4) * (.8 + .4 * Math.abs(Math.sin(phase)));
      const sample = { requests, success, failure, status2: success, status4: errorType === 0 ? failure : 0, status5: errorType === 1 ? failure : 0, statusOther: errorType === 2 ? failure : 0, duration: success * duration, latencySamples: success ? [[duration, success]] : [], modelNames: new Set([model]), modelRequests: { [model]: requests } };
      if (success) Object.assign(sample, { latencyMin: duration * .7, latencyMax: duration * 1.3 });
      if (['文本模型', '视觉理解'].includes(type)) {
        const input = success * 14040, output = success * 160;
        Object.assign(sample, { input, output, total: input + output, paidInput: Math.floor(input * .95), paidOutput: output, thinking: success * 60, nonThinking: success * 100, ttftDuration: success * duration * .12 });
        const profile = type === '文本模型' ? languageMetering[model] ?? {} : { cache: true, explicit: true };
        if (profile.cache) sample.cache = Math.floor(input * .18);
        if (profile.explicit) {
          sample.cacheCreate = Math.floor(input * .08);
          sample.cacheRead = Math.floor(input * .12);
        }
        if (type === '文本模型') addLanguageBreakdown(sample, profile);
        if (success) Object.assign(sample, { ttftMin: duration * .08, ttftMax: duration * .18 });
      } else if (type === '多模态模型') {
        Object.assign(sample, { textIn: success * 400, imageIn: success * 240, videoIn: success * 600, audioIn: success * 800, textOut: success * 120, audioOut: success * 360 });
        sample.input = sample.textIn + sample.imageIn + sample.videoIn + sample.audioIn;
        sample.output = sample.textOut + sample.audioOut;
        sample.total = sample.input + sample.output;
      } else if (type === '视频生成') {
        Object.assign(sample, { videoNormal: success * 1200, video1080: success * 2400, noVideoNormal: success * 900, noVideo1080: success * 1800 });
        sample.metered = sample.videoNormal + sample.video1080 + sample.noVideoNormal + sample.noVideo1080;
      } else if (type === '语音识别') sample.audio = success * 120;
      else if (type === '语音合成') sample.characters = success * 48;
      else if (type === '图片生成') sample.images = success * 2;
      else sample.input = success * 360;
      const tokenTotal = sample.total ?? sample.metered ?? sample.input;
      if (tokenTotal !== undefined && success) {
        const perRequest = tokenTotal / success;
        for (let minute = 0; minute < 5; minute++) {
          const count = Math.floor(success / 5) + (minute < success % 5 ? 1 : 0);
          if (count) minuteTokens.set(time + minute * 60000, (minuteTokens.get(time + minute * 60000) || 0) + count * perRequest);
        }
      }
      add(row, sample);
      const modelTime = begin + Math.floor((time - begin) / (minutes * 60000)) * minutes * 60000;
      const byModel = modelBuckets.get(modelTime) || new Map();
      const modelRow = byModel.get(model) || {};
      for (const [field, value] of Object.entries(sample)) if (typeof value === 'number') {
        if (field.endsWith('Min')) modelRow[field] = Math.min(modelRow[field] ?? Infinity, value);
        else if (field.endsWith('Max')) modelRow[field] = Math.max(modelRow[field] ?? -Infinity, value);
        else modelRow[field] = (modelRow[field] ?? 0) + value;
      }
      byModel.set(model, modelRow);
      modelBuckets.set(modelTime, byModel);
    }));
    add(summary, row);
    const bucketTime = begin + Math.floor((time - begin) / (minutes * 60000)) * minutes * 60000;
    const bucket = buckets.get(bucketTime) || { time: bucketTime, ...empty() };
    add(bucket, row);
    buckets.set(bucketTime, bucket);
  }
  const summaryResult = derived(summary);
  summaryResult.peakTpm = peakTpm([minuteTokens]);
  return { buckets: [...buckets.values()].map(bucket => ({ ...derived(bucket), modelUsage: Object.fromEntries([...(modelBuckets.get(bucket.time) || [])].map(([model, row]) => [model, derived({ ...row, observedMinutes: bucket.observedMinutes, modelNames: new Set([model]), latencySamples: [] })])) })), summary: summaryResult, minuteTokens, availableUntil };
}
export function selectedUsageTypes(groups, modelIds = null) {
  return usageModelGroups.filter(group => groups === null || groups.includes(group.id))
    .flatMap(group => group.types)
    .filter(type => modelIds === null || usageModels[type].some(id => modelIds.includes(id)));
}
function combineSelectedUsage(rows) {
  const result = { requests: 0, success: 0, failure: 0, models: 0, observedMinutes: 0 };
  let tokenRequests = 0, inputRequests = 0, outputRequests = 0;
  for (const row of rows) {
    for (const key of ['requests', 'success', 'failure', 'models']) result[key] += row[key] || 0;
    result.observedMinutes = Math.max(result.observedMinutes, row.observedMinutes || 0);
    const total = row.total ?? row.metered ?? row.input;
    if (total !== undefined) { result.total = (result.total || 0) + total; tokenRequests += row.requests; }
    if (row.input !== undefined) inputRequests += row.requests;
    if (row.output !== undefined) outputRequests += row.requests;
    for (const key of ['input', 'output', 'paidInput', 'paidOutput', 'cache', 'cacheRead', 'cacheCreate', 'images', 'audio', 'characters', 'cachedInput', 'uncachedInput', 'thinkingModeOutput', 'plainModeOutput'])
      if (row[key] !== undefined) result[key] = (result[key] || 0) + row[key];
    for (const [key, value] of Object.entries(row))
      if (/^tier\d/.test(key)) result[key] = (result[key] || 0) + value;
  }
  if (result.total !== undefined) {
    result.average = tokenRequests ? result.total / tokenRequests : null;
    result.tpm = result.observedMinutes ? result.total / result.observedMinutes : null;
  }
  if (result.input !== undefined) {
    result.inputMinute = result.observedMinutes ? result.input / result.observedMinutes : null;
    result.inputPerRequest = inputRequests ? result.input / inputRequests : null;
  }
  if (result.output !== undefined) {
    result.outputMinute = result.observedMinutes ? result.output / result.observedMinutes : null;
    result.outputPerRequest = outputRequests ? result.output / outputRequests : null;
  }
  if (result.cache !== undefined || result.cacheRead !== undefined) {
    result.cacheReadTotal = (result.cache || 0) + (result.cacheRead || 0);
    result.cacheReadMinute = result.observedMinutes ? result.cacheReadTotal / result.observedMinutes : null;
    if (result.cacheCreate !== undefined) result.cacheCreateMinute = result.observedMinutes ? result.cacheCreate / result.observedMinutes : null;
    if (result.cacheRead !== undefined) result.explicitReadMinute = result.observedMinutes ? result.cacheRead / result.observedMinutes : null;
  }
  return result;
}
export function selectedUsageData({ groups = ['语言模型'], modelIds = null, ...options }) {
  const types = selectedUsageTypes(groups, modelIds);
  const results = types.map(type => usageData({ ...options, type, dimension: 'Model ID', targets: modelIds === null ? [] : usageModels[type].filter(id => modelIds.includes(id)) }));
  const times = [...new Set(results.flatMap(result => result.buckets.map(row => row.time)))].sort((a, b) => a - b);
  const summary = combineSelectedUsage(results.map(result => result.summary));
  summary.peakTpm = peakTpm(results.map(result => result.minuteTokens));
  return { types, summary, buckets: times.map(time => {
    const rows = results.flatMap(result => result.buckets.filter(row => row.time === time));
    return { time, ...combineSelectedUsage(rows), modelUsage: Object.assign({}, ...rows.map(row => row.modelUsage)) };
  }), availableUntil: results[0]?.availableUntil ?? options.now.getTime() };
}
function languageSeries(model, title) {
  const profile = languageMetering[model] ?? {};
  const tiers = profile.tiers ?? [];
  const shortTier = tier => tier.replace('0＜输入长度≤', '≤').replace('＜输入长度≤', '–');
  const byTier = (suffix, label) => tiers.map((tier, index) => ({ key: `tier${index}${suffix}`, label: shortTier(tier), fullLabel: `${tier} · ${label}` }));
  if (title === '输入 Token 数') {
    if (tiers.length) return byTier('Input', '输入');
    if (profile.cachedInput) return [{ key: 'uncachedInput', label: '缓存未命中输入' }, { key: 'cachedInput', label: '缓存命中输入' }];
  }
  if (title === '输出 Token 数') {
    if (tiers.length && profile.modes) return tiers.flatMap((tier, index) => [
      { key: `tier${index}ThinkingOutput`, label: `${shortTier(tier)}·思考`, fullLabel: `${tier} · 思考模式输出` },
      { key: `tier${index}PlainOutput`, label: `${shortTier(tier)}·非思考`, fullLabel: `${tier} · 非思考模式输出` },
    ]);
    if (tiers.length) return byTier('Output', '输出');
    if (profile.modes) return [{ key: 'thinkingModeOutput', label: '思考模式输出' }, { key: 'plainModeOutput', label: '非思考模式输出' }];
  }
  if (title === '读缓存总 Token 数' && tiers.length) return byTier(profile.cachedInput ? 'CachedInput' : 'Cache', profile.cachedInput ? '输入缓存命中' : '缓存读取');
  if (title === '写入缓存总 Token 数' && tiers.length) return byTier('Create', '显式缓存创建');
  if (title === '区间内命中显式缓存总 Token 数' && tiers.length) return byTier('Explicit', '显式缓存命中');
  return null;
}
export function selectedMeteringView(types, modelIds = null) {
  const tokenKeys = new Set();
  for (const type of types) {
    if (['文本模型', '视觉理解'].includes(type)) meteringView('文本模型').charts.forEach(([, [key]]) => tokenKeys.add(key));
    else if (type === '多模态模型') ['total', 'input', 'output', 'tpm', 'inputMinute', 'outputMinute', 'inputPerRequest', 'outputPerRequest'].forEach(key => tokenKeys.add(key));
    else if (['向量模型', '重排模型'].includes(type)) ['total', 'input', 'tpm', 'inputMinute', 'inputPerRequest'].forEach(key => tokenKeys.add(key));
    else if (type === '视频生成') ['total', 'tpm'].forEach(key => tokenKeys.add(key));
  }
  const extras = [['图片生成', 'images', '图片生成量'], ['语音识别', 'audio', '识别音频时长'], ['语音合成', 'characters', '合成字符数']].filter(([type]) => types.includes(type));
  const singleLanguageModel = types.length === 1 && types[0] === '文本模型' && modelIds?.length === 1 ? modelIds[0] : null;
  const profile = singleLanguageModel ? languageMetering[singleLanguageModel] ?? {} : null;
  const charts = meteringView('文本模型').charts.filter(([, [key]]) => tokenKeys.has(key)).filter(([, [key]]) => {
    if (!profile) return true;
    if (key === 'cacheReadTotal' && profile.cachedInput && !profile.tiers) return false;
    if (['cacheReadMinute', 'cacheReadTotal'].includes(key)) return !!profile.cache;
    if (['cacheCreateMinute', 'cacheCreate', 'explicitReadMinute', 'cacheRead'].includes(key)) return !!profile.explicit;
    return true;
  }).map(([title, keys, options]) => {
    if (!profile) return [title, keys, options];
    const series = languageSeries(singleLanguageModel, title);
    return series ? [title === '读缓存总 Token 数' && profile.cachedInput && profile.tiers ? '输入缓存命中 Token 数' : title, series.map(item => item.key), { series }] : [title, keys, options];
  });
  return { summary: tokenKeys.size ? ['total', 'input', 'output', 'average'] : extras.map(([, key]) => key), nonTokenSummary: extras.map(([, key]) => key), charts: [...charts, ...extras.map(([, key, title]) => [title, [key]])] };
}
export function usageNumber(value) {
  if (value === null || value === undefined) return '—';
  if (Math.abs(value) >= 1e9) return `${(value / 1e9).toFixed(2)} B`;
  if (Math.abs(value) >= 1e6) return `${(value / 1e6).toFixed(2)} M`;
  return value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}
export function bucketLabel(time) {
  return new Date(time + 8 * 3600000).toISOString().slice(5, 16).replace('T', ' ');
}
export function usageCSV(data, view, billing, type) {
  const columns = [...new Set([...view.summary, ...view.charts.flatMap(([, keys, options]) => [...keys, ...Object.values(options?.variants ?? {}).flat()])])];
  const labels = Object.fromEntries(view.charts.flatMap(([, , options]) => options?.series?.map(({ key, label, fullLabel }) => [key, fullLabel ?? label]) ?? []));
  const quote = value => `"${String(value).replaceAll('"', '""')}"`;
  const perModel = data.types !== undefined;
  const models = [...new Set(data.buckets.flatMap(row => Object.keys(row.modelUsage || {})))];
  const rows = perModel ? data.buckets.flatMap(row => models.map(model => [billing, type, model, bucketLabel(row.time), ...columns.map(key => row.modelUsage?.[model]?.[key] ?? '')])) : data.buckets.map(row => [billing, type, bucketLabel(row.time), ...columns.map(key => row[key] ?? '')]);
  return '\ufeff' + [['计费来源', '模型类型', ...(perModel ? ['模型 ID'] : []), '时间（北京时间）', ...columns.map(key => `${labels[key] ?? fields[key]?.[0] ?? key}（${fields[key]?.[1] ?? 'Token'}）`)], ...rows].map(row => row.map(quote).join(',')).join('\n');
}

export function observationData(options) {
  const billings = options.billing === '全部' ? ['按量付费', 'Token Plan'] : [options.billing];
  const results = billings.flatMap(billing => [options.type].map(type => usageData({ ...options, billing, type })));
  function combine(rows) {
    const merged = empty();
    for (const row of rows) {
      for (const key of ['requests','success','failure','status2','status4','status5','statusOther','duration']) merged[key] += row[key];
      merged.latencySamples.push(...row.latencySamples);
      for (const key of ['output','ttftDuration']) if (row[key] != null) merged[key] = (merged[key] ?? 0) + row[key];
      for (const key of ['ttftMin','ttftMax']) if (row[key] != null) merged[key] = key.endsWith('Min') ? Math.min(merged[key] ?? Infinity,row[key]) : Math.max(merged[key] ?? 0,row[key]);
      merged.observedMinutes = Math.max(merged.observedMinutes, row.observedMinutes);
      if (row.latencyMin != null) merged.latencyMin = Math.min(merged.latencyMin ?? Infinity,row.latencyMin);
      if (row.latencyMax != null) merged.latencyMax = Math.max(merged.latencyMax ?? 0,row.latencyMax);
    }
    const result = derived(merged);
    if (['文本模型', '视觉理解'].includes(options.type)) {
      result.ttft = merged.success ? merged.ttftDuration / merged.success : null;
      result.outputMinute = merged.observedMinutes ? merged.output / merged.observedMinutes : null;
      result.outputSecond = result.outputMinute == null ? null : result.outputMinute / 60;
    }
    return result;
  }
  const times = [...new Set(results.flatMap(result => result.buckets.map(row => row.time)))];
  return { summary: combine(results.map(result => result.summary)), buckets: times.map(time => ({ ...combine(results.flatMap(result => result.buckets.filter(row => row.time === time))), time })) };
}
export const observationView = { summary: ['requests','successRate','failure','latency','latencyP95'], charts: [calls, ['失败率趋势',['failureRate']], ['响应时延',['latency','latencyP95'],{variants:{'平均 / P95':['latency','latencyP95'],最小:['latencyMin'],最大:['latencyMax']}}], ['请求速率',['rpm']], status] };
export function meteringView(type) {
  const view = usageViews[type];
  if (['文本模型', '视觉理解', '多模态模型', '向量模型', '重排模型'].includes(type)) {
    const charts = [
      ['总 Token 数', ['total']],
      ['输入 Token 数', ['input']],
      ['输出 Token 数', ['output']],
      ['每分钟总 Token 数（TPM）', ['tpm']],
      ['每分钟输入 Token 数（TPM）', ['inputMinute']],
      ['每分钟输出 Token 数（TPM）', ['outputMinute']],
      ['每分钟读缓存 Token 数', ['cacheReadMinute']],
      ['每分钟写入缓存 Token 数', ['cacheCreateMinute']],
      ['读缓存总 Token 数', ['cacheReadTotal']],
      ['写入缓存总 Token 数', ['cacheCreate']],
      ['每分钟读显式缓存 Token 数', ['explicitReadMinute']],
      ['区间内命中显式缓存总 Token 数', ['cacheRead']],
      ['平均输入 Token（TPR）', ['inputPerRequest']],
      ['平均输出 Token（TPR）', ['outputPerRequest']],
    ];
    const available = type === '文本模型' || type === '视觉理解' ? charts : charts.filter(([, [key]]) => type === '多模态模型' ? !key.toLowerCase().includes('cache') && !['explicitReadMinute'].includes(key) : ['input', 'inputMinute', 'inputPerRequest'].includes(key));
    return { summary: view.summary, charts: available };
  }
  const excluded = new Set(['响应时延','吞吐趋势','调用状态分布','首 Token 时延','输出吞吐']);
  return {summary:view.summary.filter(key => key !== 'latency'),charts:view.charts.filter(([title]) => !excluded.has(title)).map(([title,keys,options]) => title === '调用次数趋势' ? ['模型请求次数趋势',['requests']] : [title,keys,options])};
}
