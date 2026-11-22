import { matchesSelection } from './analytics.js';
import { percentile } from './observability.js';
import { usageMeter, usagePreset } from './usage-analysis.js';
import { maskApiKey } from '../api-key-utils.mjs';
import { customerRequest, diagnosticRequest } from './operations-analysis.js';

const minute = 60_000, hour = 60 * minute, day = 24 * hour, week = 7 * day, beijing = 8 * hour;
const grains = [['minute', '按分钟', minute, 2 * hour], ['hour', '按小时', hour, week],
  ['day', '按天', day, 31 * day], ['week', '按周', week, 365 * day]];
export const callPresets = [['today', '今日'], ['1h', '近 1 小时'], ['24h', '近 24 小时'], ['7d', '近 7 天'], ['30d', '近 30 天']];
export const outcomes = { success: '成功', failed: '失败', canceled: '已取消', pending: '进行中', unknown: '未采集' };
export const modelTypes = [['', '全部类型'], ['text', '语言模型'], ['multimodal', '多模态模型'], ['image', '图片生成'],
  ['video', '视频生成'], ['audio', '语音模型'], ['embedding', '向量模型'], ['rerank', '重排模型']];
export const errorSignals = [['rate-limit', '429'], ['timeout', '超时'], ['fallback', '回退']];
export const preflightTypes = [['auth', '认证与授权'], ['rate-limit', '限流'], ['parameters', '参数校验'], ['other', '其他前置错误']];
export const purposeLabels = { customer: '客户调用', diagnostic: '测试调用' };

const dimensions = ['tenant', 'project', 'purpose', 'model', 'callId', 'upstreamModelId', 'endpoint', 'user', 'key', 'source'];
const scalarFilters = ['type', 'outcome', 'http', 'query', 'userRecord', 'preflightType'];
const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
const timeOf = value => typeof value === 'number' ? value : Date.parse(value);
const midnight = date => Date.parse(date + 'T00:00:00+08:00');
const number = value => Number.isFinite(value) && value >= 0 ? value : null;
export const uncollectedObservationKey = '__uncollected__';

export const observationTime = at => Number.isFinite(at) ? new Date(at + beijing).toISOString().slice(0, 19).replace('T', ' ') : '未采集';
export const observationNumber = value => value == null ? '—' : value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
export const httpLabel = value => value === 0 ? '无 HTTP 响应' : value == null ? '未采集' : String(value);

// A null component matches any value at that level, including uncollected data.
const validKeys = keys => Array.isArray(keys) && keys.every(key => typeof key === 'string' && key.length > 0);
const validSupply = supply => supply === null || Array.isArray(supply) && supply.every(pair =>
  Array.isArray(pair) && pair.length === 2 && pair.some(key => key !== null) &&
  pair.every(key => key === null || typeof key === 'string' && key.length > 0));
const narrowKeys = (key, scope) => scope == null ? [key] : key === null ? scope : scope.includes(key) ? [key] : [];
function narrowSupply(supply, providers, channels) {
  if (providers == null && channels == null) return supply;
  return (supply ?? [[null, null]]).flatMap(([provider, channel]) => narrowKeys(provider, providers)
    .flatMap(id => narrowKeys(channel, channels).map(channelId => [id, channelId])));
}

export function observationViewFilters({ provider, channel, supply, ...filters }) {
  if (supply === undefined) {
    supply = [provider, channel].every(keys => keys == null || validKeys(keys))
      ? narrowSupply(null, provider, channel) : [];
  }
  return { ...filters, supply: validSupply(supply) ? supply : [] };
}

function parseSupply(value) {
  try { return JSON.parse(value); }
  catch { return []; }
}

export function observationFilters(params = new URLSearchParams(), preset = 'today') {
  const keys = key => !params.has(key) ? null : params.get(key) === '__none__' ? [] : params.get(key).split(',').filter(Boolean);
  return observationViewFilters({
    period: params.get('period') || (params.has('start') || params.has('end') ? 'custom' : preset),
    start: params.get('start') || '', end: params.get('end') || '',
    ...Object.fromEntries(dimensions.map(key => [key, keys(key)])),
    supply: params.has('supply') ? parseSupply(params.get('supply')) : undefined,
    provider: keys('provider'), channel: keys('channel'),
    ...Object.fromEntries(scalarFilters.map(key => [key, params.get(key) || ''])),
    ...(params.get('failed') === '1' && !params.has('outcome') ? { outcome: 'failed' } : {}),
  });
}

export function observationWindow(filters, now = Date.now()) {
  if (filters.period === '1h' || filters.period === '24h') {
    return { start: now - (filters.period === '1h' ? hour : day), end: now };
  }
  const dates = filters.period === 'custom' ? filters : usagePreset(filters.period, now);
  const start = dateOnly.test(dates.start) ? midnight(dates.start) : timeOf(dates.start);
  const end = Math.min(now, dateOnly.test(dates.end) ? midnight(dates.end) + day : timeOf(dates.end));
  return Number.isFinite(start) && Number.isFinite(end) && end >= start && end - start <= 365 * day
    ? { start, end } : null;
}

export const observationGrains = window => grains.filter(([, , , limit]) => !window || window.end - window.start <= limit)
  .map(([id, label]) => [id, label]);
export const defaultObservationGrain = (filters, window) => filters.period === '1h' ? 'minute'
  : window && window.end - window.start <= day ? 'hour' : window && window.end - window.start > 31 * day ? 'week' : 'day';

export function observationHash(page, filters, extra = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...filters, ...extra })) {
    if (value == null || value === '') continue;
    params.set(key, key === 'supply' ? JSON.stringify(value) : Array.isArray(value) ? value.join(',') || '__none__' : String(value));
  }
  return '#/admin-2/' + page + (params.size ? '?' + params : '');
}

export function observationDrill(filters, window, { provider, channel, ...extra } = {}) {
  const supply = narrowSupply(filters.supply ?? null, provider, channel);
  return observationHash('logs', filters, { period: 'custom', start: new Date(window.start).toISOString(),
    end: new Date(window.end).toISOString(), supply, ...extra });
}

const httpStatus = value => Number.isInteger(value) && (value === 0 || value >= 100 && value <= 599) ? value : null;
const outcomeCodes = new Map([['success', 'success'], ['succeeded', 'success'], ['passed', 'success'], ['failed', 'failed'],
  ['canceled', 'canceled'], ['cancelled', 'canceled'], ['pending', 'pending'], ['running', 'pending'], ['unknown', 'unknown']]);
const explicitOutcome = value => value === true ? 'success' : value === false ? 'failed' : outcomeCodes.get(value);
export function requestOutcome(row, status = httpStatus(row.httpStatus)) {
  if (row.isCanceled === true) return 'canceled';
  if (row.isTimeout === true || row.streamInterrupted === true || row.finishReason === 'error') return 'failed';
  return explicitOutcome(row.finalStatus ?? row.requestStatus ?? row.status)
    || (status == null || status >= 100 && status < 200 ? 'unknown' : status >= 200 && status < 300 ? 'success' : 'failed');
}

const timeout = (row, code) => row.isTimeout === true || /(?:^|_)timeout(?:$|_)/i.test(code || '');
const preflight = new Set(['auth_rejected', 'model_not_authorized', 'enterprise_model_not_authorized', 'enterprise_quota_exhausted',
  'model_scope_rejected', 'quota_exhausted', 'rate_limit_exceeded', 'no_available_endpoint', 'provider_service_required',
  'provider_price_unavailable', 'model_price_unavailable', 'invalid_request']);
const errorCode = row => row.errorCode || row.code || row.error;
function preflightType(code, status) {
  if (status === 429 || /rate_limit/.test(code)) return 'rate-limit';
  if ([401, 403].includes(status) || /auth|scope|forbidden/.test(code)) return 'auth';
  if (/param|invalid_request|malformed/.test(code)) return 'parameters';
  return 'other';
}

function usageFields(row, model, usage = row.usage) {
  const { unit, fields } = usageMeter(model, { ...row, usage });
  const tokenMeter = unit === 'Token' || row.usageUnit == null && [usage?.input, usage?.output].some(value => number(value) != null);
  const measured = tokenMeter && row.usageConfirmed !== false;
  const input = measured ? number(usage?.input) : null, output = measured ? number(usage?.output) : null;
  const total = input != null && output != null ? input + output
    : input != null && fields.length === 1 && fields[0] === 'input' ? input : null;
  return { tokenMeter, input, output, total };
}

export function callObservations(state) {
  const [models, users, tenants, keys, providers, endpoints, projects] = ['models', 'users', 'tenants', 'apiKeys', 'providers', 'endpoints', 'projects']
    .map(collection => new Map((state[collection] || []).map(row => [row.id, row])));
  const providerName = id => providers.get(id)?.name || id;
  const rows = [], attempts = [], records = new Map();
  for (const record of state.requests) {
    const id = record.requestId || record.id;
    if (!id) continue;
    const previous = records.get(id);
    if (!previous || timeOf(record.updatedAt || record.createdAt) > timeOf(previous.updatedAt || previous.createdAt)) records.set(id, record);
  }
  for (const [id, record] of records) {
    const model = models.get(record.modelId);
    const key = keys.get(record.keyId);
    const modelType = record.modelType || model?.type;
    const streamSample = record.stream === true || record.stream == null && (!modelType || ['text', 'multimodal'].includes(modelType));
    const status = httpStatus(record.httpStatus);
    const outcome = requestOutcome(record, status);
    const trail = Array.isArray(record.attempts) ? record.attempts : [];
    const started = timeOf(record.startedAt ?? record.createdAt);
    const request = {
      id, requestId: record.requestId || null, at: started, status, outcome, modelType, model: record.modelId,
      modelName: record.modelName || model?.name || record.modelId,
      callId: record.publicModelId || record.callId,
      tenant: record.tenantId, tenantName: record.tenantName || tenants.get(record.tenantId)?.name || record.tenantId,
      project: record.projectId, projectName: record.projectName || projects.get(record.projectId)?.name || record.projectId,
      purpose: diagnosticRequest(record) ? 'diagnostic' : customerRequest(record) ? 'customer' : null,
      user: record.userId, userName: record.userName || users.get(record.userId)?.name || record.userId,
      key: record.keyId, keyName: record.keyName || key?.name, keyDisplayId: key?.keyId || record.keyId,
      source: record.source || (record.evidenceSource === 'mock' ? '模拟请求' : null),
    };
    const observedAttempts = [];
    trail.forEach((item, index) => {
      const code = errorCode(item);
      const legacyEvidence = item.endpointId && !preflight.has(code) &&
        (Number.isFinite(item.durationMs) || item.status || item.httpStatus != null || Object.hasOwn(item, 'error'));
      if (item.dispatched !== true && (item.dispatched === false || !legacyEvidence)) return;
      const endpoint = endpoints.get(item.endpointId);
      const provider = item.providerId || item.procurementSnapshot?.providerId || endpoint?.providerId;
      // An endpoint in the existing channel catalogue carries the channel identity.
      const channel = item.channelId || endpoint?.id;
      const attemptStatus = httpStatus(item.httpStatus ?? item.statusCode);
      const explicit = explicitOutcome(item.finalStatus ?? item.requestStatus ?? item.status);
      const attemptOutcome = item.isCanceled === true || item.isTimeout === true || item.streamInterrupted === true || item.finishReason === 'error'
        ? requestOutcome(item, attemptStatus) : explicit || (code ? 'failed' : attemptStatus != null
          ? requestOutcome(item, attemptStatus) : item.error === null ? 'success' : 'unknown');
      const usage = usageFields(item, model);
      const cached = usage.input == null ? null : number(item.usage?.cached);
      observedAttempts.push({
        ...request, id: JSON.stringify([id, index + 1]), parentId: id, index: index + 1,
        at: timeOf(item.startedAt ?? item.createdAt), upstreamRequestId: item.upstreamRequestId, upstreamModelId: item.upstreamModelId,
        provider, providerName: item.providerName || providerName(provider), channel, channelName: item.channelName || endpoints.get(channel)?.name || channel,
        endpoint: item.endpointId, endpointName: item.endpointName || endpoint?.endpointId || item.endpointId,
        endpointBaseUrl: endpoint?.baseUrl,
        channelModel: JSON.stringify([provider ?? null, channel ?? null, item.upstreamModelId ?? null]),
        channelModelName: [item.channelName || endpoints.get(channel)?.name || channel || '渠道未采集',
          item.upstreamModelId || '模型未采集'].join(' · '),
        outcome: attemptOutcome, status: attemptStatus, duration: number(item.durationMs),
        ttft: item.stream === false ? null : number(item.ttftMs),
        generationDuration: number(item.generationDurationMs),
        selectionReason: item.selectionReason, successReason: item.successReason, nextAction: item.nextAction,
        code, errorReason: item.errorMessage || item.message, errorSource: item.errorSource || (attemptOutcome === 'failed' ? '上游调用' : null),
        timeout: timeout(item, code), fallback: item.fallback === true, fallbackReason: item.fallbackReason,
        recordedFallbackReason: item.fallbackReason,
        ...usage, cached: cached != null && cached <= usage.input ? cached : null,
      });
    });
    observedAttempts.forEach((attempt, index) => {
      const next = observedAttempts[index + 1];
      if (attempt.outcome === 'failed' && next && (
        attempt.channel && next.channel && attempt.channel !== next.channel ||
        attempt.endpoint && next.endpoint && attempt.endpoint !== next.endpoint
      )) attempt.fallback = true;
      if (attempt.fallback && !attempt.fallbackReason) attempt.fallbackReason = attempt.code;
    });
    const final = observedAttempts.at(-1);
    const rejected = trail.findLast(item => errorCode(item) && (item.dispatched === false ||
      item.dispatched !== true && preflight.has(errorCode(item))));
    const recordedCode = errorCode(record);
    const blocked = rejected ? errorCode(rejected) : !trail.length && !record.admittedAt && preflight.has(recordedCode) ? recordedCode : null;
    const gatewayOnly = !record.admittedAt && trail.every(item => item.dispatched === false ||
      item.dispatched !== true && preflight.has(errorCode(item)));
    const kind = outcome === 'failed' && !final && gatewayOnly && blocked ? preflightType(blocked, status) : null;
    const routed = Boolean(final) || !kind && !trail.length && record.cacheHit !== true;
    const provider = routed ? final?.provider || record.providerId || record.procurementSnapshot?.providerId : null;
    const channel = routed ? final?.channel || record.channelId : null;
    const code = recordedCode || blocked || (outcome === 'failed' ? final?.code : null);
    rows.push({
      ...request, provider, providerName: routed ? final?.providerName || record.providerName || providerName(provider) : null,
      channel, channelName: routed ? final?.channelName || record.channelName || endpoints.get(channel)?.name || channel : null,
      registeredModelId: model?.modelId,
      keyMasked: typeof key?.secretPreview === 'string' && key.secretPreview.trim() ? maskApiKey(key.secretPreview) : null,
      endpoint: final?.endpoint, endpointName: final?.endpointName,
      code, errorReason: record.errorMessage || rejected?.errorMessage || (outcome === 'failed' ? final?.errorReason : null),
      errorSource: record.errorSource || (blocked ? '网关' : outcome === 'failed' ? final?.errorSource : null),
      duration: number(record.durationMs), firstPacket: number(record.firstPacketMs),
      ttft: streamSample ? number(record.ttftMs) : null, taskStatus: record.taskStatus,
      attempts: observedAttempts, blocked, preflightType: kind, routeVersion: record.routeVersion, cacheHit: record.cacheHit === true,
      selectionReason: record.selectionReason,
      ...usageFields(record, model),
    });
    attempts.push(...observedAttempts);
  }
  return { requests: rows, attempts };
}

export const observationKey = (row, dimension) => row[dimension] ?? uncollectedObservationKey;
export function observationName(row, dimension) {
  return (dimension === 'purpose' ? purposeLabels[row.purpose] : row[dimension + 'Name']) || row[dimension] || '未采集';
}

export function observationOptions(rows, dimension) {
  const items = new Map();
  for (const row of rows) {
    const id = observationKey(row, dimension);
    const name = observationName(row, dimension);
    if (!items.has(id)) items.set(id, { id, name: dimension === 'project' && row.project
      ? [...new Set([name, row.tenantName, row.project].filter(Boolean))].join(' · ') : name,
      searchText: dimension === 'callId' ? row.modelName : '' });
  }
  return [...items.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
}

export function searchObservationIdentities(rows, dimension, tenants, input, limit = 20) {
  const query = input.trim().toLowerCase();
  const items = new Map();
  if (!query) return { items: [], hasMore: false };
  for (const row of rows) {
    const id = row[dimension];
    if (!id || items.has(id) || !matchesSelection(tenants, observationKey(row, 'tenant'))) continue;
    const displayId = dimension === 'key' ? row.keyDisplayId || id : id;
    const name = observationName(row, dimension);
    const exact = id.toLowerCase() === query || displayId.toLowerCase() === query;
    if (!exact && (!tenants?.length || !name.toLowerCase().includes(query))) continue;
    if (items.size === limit) return { items: [...items.values()], hasMore: true };
    items.set(id, { id, label: [...new Set([name, row.tenantName || '客户未采集', displayId])].join(' · ') });
  }
  return { items: [...items.values()], hasMore: false };
}

export function changeObservationTenant(rows, filters, tenant) {
  const patch = { tenant };
  if (tenant === null) return patch;
  const scopedRows = rows.filter(row => matchesSelection(tenant, observationKey(row, 'tenant')));
  for (const dimension of ['project', 'user', 'key']) {
    const selected = filters[dimension];
    if (!selected?.length) continue;
    const available = new Set(scopedRows.map(row => observationKey(row, dimension)));
    const retained = selected.filter(id => available.has(id));
    if (retained.length !== selected.length) patch[dimension] = retained.length ? retained : null;
  }
  return patch;
}

export function filterObservations(rows, filters, window) {
  if (!window) return [];
  const query = filters.query?.trim().toLowerCase();
  return rows.filter(row => row.at >= window.start && row.at < window.end &&
    dimensions.every(key => matchesSelection(filters[key] ?? null, observationKey(row, key))) &&
    (!filters.userRecord || (filters.userRecord === 'uncollected') === (observationKey(row, 'user') === uncollectedObservationKey)) &&
    (filters.supply == null || filters.supply.some(([provider, channel]) =>
      (provider === null || provider === observationKey(row, 'provider')) &&
      (channel === null || channel === observationKey(row, 'channel')))) &&
    (!filters.type || row.modelType === filters.type) &&
    (!filters.outcome || (filters.outcome === 'other' ? !['success', 'failed'].includes(row.outcome) : row.outcome === filters.outcome)) &&
    (!filters.http || String(row.status ?? 'unreported') === filters.http) &&
    (!filters.preflightType || row.preflightType === filters.preflightType) &&
    (!query || row.requestId?.toLowerCase().includes(query)));
}

export function compareLogRows(a, b, field, direction) {
  const left = a[field], right = b[field];
  const leftKnown = Number.isFinite(left), rightKnown = Number.isFinite(right);
  if (leftKnown !== rightKnown) return leftKnown ? -1 : 1;
  if (leftKnown && left !== right) return direction * (left - right);
  const time = row => Number.isFinite(row.at) ? row.at : -Infinity;
  return time(b) - time(a) || a.id.localeCompare(b.id);
}

export function observationGroups(rows, dimension) {
  const groups = new Map();
  for (const row of rows) {
    const id = observationKey(row, dimension);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(row);
  }
  return [...groups].map(([id, rows]) => ({ id, rows, name: observationName(rows[0], dimension) }))
    .sort((a, b) => b.rows.length - a.rows.length || a.name.localeCompare(b.name, 'zh-CN'));
}

export function observationGroupScope(dimension, { id, rows }) {
  return dimension === 'channel' ? { channel: [id], provider: [...new Set(rows.map(row => observationKey(row, 'provider')))] }
    : { [dimension]: [id] };
}

export function observationBuckets(rows, window, granularity) {
  if (!window || window.start >= window.end) return [];
  const step = grains.find(([id]) => id === granularity)?.[2] || day;
  const offset = granularity === 'week' ? beijing - 4 * day : beijing;
  const anchor = Math.floor((window.start + offset) / step) * step - offset;
  const buckets = [];
  for (let at = anchor; at < window.end; at += step) {
    const start = Math.max(at, window.start), end = Math.min(at + step, window.end);
    const date = observationTime(start);
    buckets.push({ start, end, label: granularity === 'day' || granularity === 'week' ? date.slice(5, 10) : date.slice(5, 16), rows: [] });
  }
  for (const row of rows) {
    const index = Math.floor((row.at - anchor) / step);
    buckets[index]?.rows.push(row);
  }
  return buckets;
}

const sum = (rows, field) => {
  const values = rows.map(row => row[field]).filter(value => value != null);
  return values.length ? values.reduce((total, value) => total + value, 0) : null;
};
const attemptMetrics = {
  failed: row => row.outcome === 'failed',
  rateLimit: row => row.status === 429,
  timeout: row => row.timeout,
  fallback: row => row.fallback,
  ttft: row => row.ttft != null,
  otps: row => row.outcome === 'success' && row.output > 0 && row.generationDuration > 0,
};
export function attemptsForMetric(rows, metric) {
  return metric ? rows.filter(attemptMetrics[metric]) : rows;
}

export function summarizeObservations(rows) {
  const success = rows.filter(row => row.outcome === 'success').length;
  const failed = attemptsForMetric(rows, 'failed').length;
  const ttfts = rows.map(row => row.ttft).filter(Number.isFinite);
  return {
    count: rows.length, success, failed, other: rows.length - success - failed,
    failureRate: success + failed ? failed * 100 / (success + failed) : null,
    p95: percentile(rows.map(row => row.duration).filter(Number.isFinite), .95),
    ttft: percentile(ttfts, .95), ttftSamples: ttfts.length,
    input: sum(rows, 'input'), output: sum(rows, 'output'), total: sum(rows, 'total'),
    rateLimit: attemptsForMetric(rows, 'rateLimit').length,
    timeout: attemptsForMetric(rows, 'timeout').length,
    fallback: attemptsForMetric(rows, 'fallback').length,
    affectedUsers: new Set(rows.filter(row => row.outcome === 'failed' && row.user).map(row => row.user)).size,
    missingFailureUsers: rows.filter(row => row.outcome === 'failed' && !row.user).length,
    affectedModels: new Set(rows.filter(row => row.outcome === 'failed' && row.model).map(row => row.model)).size,
    missingFailureModels: rows.filter(row => row.outcome === 'failed' && !row.model).length,
  };
}

export function failureGroups(rows) {
  const failures = rows.filter(row => row.outcome === 'failed');
  const groups = new Map();
  for (const row of failures) {
    const source = row.errorSource || '未采集', code = row.code || '未采集', reason = row.errorReason || '未采集';
    const type = row.timeout ? '超时' : row.status === 429 ? '限流' : [401, 403].includes(row.status) ? '认证与授权'
      : row.status >= 500 ? '服务错误' : '其他失败';
    const id = JSON.stringify([source, row.status, code, reason, type]);
    if (!groups.has(id)) groups.set(id, { id, source, status: row.status, code, reason, type, count: 0 });
    groups.get(id).count++;
  }
  return [...groups.values()].map(row => ({ ...row, share: row.count / failures.length * 100 }))
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
}

export function attemptCapacity(rows, window) {
  const duration = (window.end - window.start) / minute;
  if (duration <= 0) return { averageRpm: null, peakRpm: null, averageTpm: null, peakTpm: null };
  const bins = new Map();
  let tokens = 0, observed = false, incomplete = false, peakRpm = 0, peakTpm = 0;
  for (const row of rows) {
    const index = Math.floor(row.at / minute);
    if (!bins.has(index)) bins.set(index, { calls: 0, tokens: 0 });
    const bin = bins.get(index);
    peakRpm = Math.max(peakRpm, ++bin.calls);
    if (row.total != null) {
      observed = true;
      tokens += row.total;
      bin.tokens += row.total;
      peakTpm = Math.max(peakTpm, bin.tokens);
    } else if (row.tokenMeter) incomplete = true;
  }
  return { averageRpm: rows.length / duration, peakRpm,
    averageTpm: observed && !incomplete ? tokens / duration : null, peakTpm: observed && !incomplete ? peakTpm : null };
}

export function attemptPerformance(rows) {
  const ttft = attemptsForMetric(rows, 'ttft').map(row => row.ttft);
  const outputSamples = attemptsForMetric(rows, 'otps');
  const generationDuration = sum(outputSamples, 'generationDuration');
  return { ttft: percentile(ttft, .95), ttftSamples: ttft.length,
    otps: generationDuration > 0 ? sum(outputSamples, 'output') * 1000 / generationDuration : null, otpsSamples: outputSamples.length,
    timeoutRate: rows.length ? attemptsForMetric(rows, 'timeout').length * 100 / rows.length : null };
}

export function logCsv(rows) {
  return '\ufeff' + rows.map(row => row.map(value => {
    const cell = String(value ?? '');
    const safe = typeof value === 'string' && (/^[\s]*[=+@-]/.test(cell) || /^[\t\r\n]/.test(cell)) ? "'" + cell : cell;
    return '"' + safe.replaceAll('"', '""') + '"';
  }).join(',')).join('\r\n');
}
