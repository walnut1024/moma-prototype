import { matchesSelection } from './analytics.js';
import { percentile } from './observability.js';
import { usageMeter, usagePreset } from './usage-analysis.js';
import { maskApiKey } from '../api-key-utils.mjs';

const minute = 60_000, hour = 60 * minute, day = 24 * hour, week = 7 * day, beijing = 8 * hour;
const grains = [['minute', '按分钟', minute, 2 * hour], ['hour', '按小时', hour, week],
  ['day', '按天', day, 31 * day], ['week', '按周', week, 365 * day]];
export const callPresets = [['today', '今日'], ['1h', '近 1 小时'], ['24h', '近 24 小时'], ['7d', '近 7 天'], ['30d', '近 30 天']];
export const outcomes = { success: '成功', failed: '失败', canceled: '已取消', pending: '进行中', unknown: '未采集' };
export const modelTypes = [['', '全部类型'], ['text', '语言模型'], ['multimodal', '多模态模型'], ['image', '图片生成'],
  ['video', '视频生成'], ['audio', '语音模型'], ['embedding', '向量模型'], ['rerank', '重排模型']];
export const errorSignals = [['rate-limit', '429'], ['timeout', '超时'], ['fallback', '回退']];

const dimensions = ['tenant', 'model', 'callId', 'endpoint', 'user', 'key', 'source'];
const scalarFilters = ['type', 'outcome', 'http', 'errorSource', 'signal', 'query', 'upstreamQuery'];
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

export function observationDrill(filters, window, view, { provider, channel, ...extra } = {}) {
  const supply = narrowSupply(filters.supply ?? null, provider, channel);
  return observationHash('logs', filters, { period: 'custom', start: new Date(window.start).toISOString(),
    end: new Date(window.end).toISOString(), view, supply, ...extra });
}

const httpStatus = value => Number.isInteger(value) && (value === 0 || value >= 100 && value <= 599) ? value : null;
const outcomeCodes = new Map([['success', 'success'], ['succeeded', 'success'], ['passed', 'success'], ['failed', 'failed'],
  ['canceled', 'canceled'], ['cancelled', 'canceled'], ['pending', 'pending'], ['running', 'pending'], ['unknown', 'unknown']]);
const explicitOutcome = value => value === true ? 'success' : value === false ? 'failed' : outcomeCodes.get(value);
function resultOf(row, status) {
  if (row.isCanceled === true) return 'canceled';
  if (row.isTimeout === true || row.streamInterrupted === true || row.finishReason === 'error') return 'failed';
  return explicitOutcome(row.finalStatus ?? row.requestStatus ?? row.status)
    || (status == null || status >= 100 && status < 200 ? 'unknown' : status >= 200 && status < 300 ? 'success' : 'failed');
}

const timeout = (row, code) => row.isTimeout === true || /(?:^|_)timeout(?:$|_)/i.test(code || '');
const preflight = new Set(['auth_rejected', 'model_not_authorized', 'enterprise_model_not_authorized', 'enterprise_quota_exhausted',
  'model_scope_rejected', 'quota_exhausted', 'rate_limit_exceeded', 'no_available_endpoint', 'provider_service_required',
  'provider_price_unavailable', 'model_price_unavailable']);

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
  const [models, users, tenants, keys, providers, endpoints] = ['models', 'users', 'tenants', 'apiKeys', 'providers', 'endpoints']
    .map(collection => new Map((state[collection] || []).map(row => [row.id, row])));
  const providerName = id => providers.get(id)?.name || id;
  const rows = [], attempts = [], seen = new Set();
  for (const record of state.requests) {
    const id = record.requestId || record.id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const model = models.get(record.modelId);
    const key = keys.get(record.keyId);
    const modelType = record.modelType || model?.type;
    const streamSample = record.stream === true || record.stream == null && (!modelType || ['text', 'multimodal'].includes(modelType));
    const status = httpStatus(record.httpStatus);
    const outcome = resultOf(record, status);
    const trail = Array.isArray(record.attempts) ? record.attempts : [];
    const started = timeOf(record.startedAt ?? record.createdAt);
    const request = {
      id, requestId: record.requestId || null, at: started, status, outcome, modelType, model: record.modelId,
      modelName: record.modelName || model?.name || record.modelId,
      callId: record.publicModelId || record.callId,
      tenant: record.tenantId, tenantName: record.tenantName || tenants.get(record.tenantId)?.name || record.tenantId,
      user: record.userId, userName: record.userName || users.get(record.userId)?.name || record.userId,
      key: record.keyId, keyName: record.keyName || key?.name,
      source: record.source || (record.evidenceSource === 'mock' ? '模拟请求' : null),
    };
    const observedAttempts = [];
    trail.forEach((item, index) => {
      const code = item.errorCode || item.code || item.error;
      const legacyEvidence = item.endpointId && !preflight.has(code) &&
        (Number.isFinite(item.durationMs) || item.status || item.httpStatus != null || Object.hasOwn(item, 'error'));
      if (item.dispatched !== true && (item.dispatched === false || !legacyEvidence)) return;
      const endpoint = endpoints.get(item.endpointId);
      const provider = item.providerId || item.procurementSnapshot?.providerId || endpoint?.providerId;
      // An endpoint in the existing channel catalogue carries the channel identity.
      const channel = item.channelId || endpoint?.id;
      const attemptStatus = httpStatus(item.httpStatus ?? item.statusCode);
      const explicit = explicitOutcome(item.status);
      const attemptOutcome = explicit || (item.isTimeout === true || code ? 'failed' : attemptStatus != null
        ? resultOf(item, attemptStatus) : item.error === null ? 'success' : 'unknown');
      observedAttempts.push({
        ...request, id: JSON.stringify([id, index + 1]), parentId: id, index: index + 1,
        at: timeOf(item.startedAt ?? item.createdAt), upstreamRequestId: item.upstreamRequestId, upstreamModelId: item.upstreamModelId,
        provider, providerName: item.providerName || providerName(provider), channel, channelName: item.channelName || endpoints.get(channel)?.name || channel,
        endpoint: item.endpointId, endpointName: item.endpointName || endpoint?.endpointId || item.endpointId,
        outcome: attemptOutcome, status: attemptStatus, duration: number(item.durationMs),
        code, errorReason: item.errorMessage || item.message, errorSource: item.errorSource || (attemptOutcome === 'failed' ? '上游调用' : null),
        timeout: timeout(item, code), fallback: item.fallback === true, fallbackReason: item.fallbackReason,
        ...usageFields(item, model),
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
    const routed = Boolean(final) || !trail.length && record.cacheHit !== true;
    const provider = routed ? final?.provider || record.providerId || record.procurementSnapshot?.providerId : null;
    const channel = routed ? final?.channel || record.channelId : null;
    const blocked = trail.findLast(item => item.error && (item.dispatched === false ||
      item.dispatched !== true && preflight.has(item.error)));
    const code = record.errorCode || record.error || blocked?.error || (outcome === 'failed' ? final?.code : null);
    rows.push({
      ...request, provider, providerName: routed ? final?.providerName || record.providerName || providerName(provider) : null,
      channel, channelName: routed ? final?.channelName || record.channelName || endpoints.get(channel)?.name || channel : null,
      modelIdentifier: request.callId || model?.modelId,
      keyDisplayId: key?.keyId || record.keyId,
      keyMasked: typeof key?.secretPreview === 'string' && key.secretPreview.trim() ? maskApiKey(key.secretPreview) : null,
      endpoint: final?.endpoint, endpointName: final?.endpointName,
      code, errorReason: record.errorMessage || (outcome === 'failed' ? final?.errorReason : null),
      errorSource: record.errorSource || (blocked ? '网关' : outcome === 'failed' ? final?.errorSource : null),
      duration: number(record.durationMs), firstPacket: number(record.firstPacketMs),
      ttft: streamSample ? number(record.ttftMs) : null, taskStatus: record.taskStatus,
      attempts: observedAttempts, blocked: blocked?.error, routeVersion: record.routeVersion,
      ...usageFields(record, model),
    });
    attempts.push(...observedAttempts);
  }
  return { requests: rows, attempts };
}

export const observationKey = (row, dimension) => row[dimension] ?? uncollectedObservationKey;
export function observationName(row, dimension) {
  return row[dimension + 'Name'] || row[dimension] || '未采集';
}

export function observationOptions(rows, dimension) {
  const items = new Map();
  for (const row of rows) {
    const id = observationKey(row, dimension);
    if (!items.has(id)) items.set(id, { id, name: observationName(row, dimension),
      searchText: dimension === 'callId' ? row.modelName : '' });
  }
  return [...items.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
}

export function filterObservations(rows, filters, window, { allowUntimed = false } = {}) {
  if (!window) return [];
  const query = filters.query?.trim().toLowerCase(), upstream = filters.upstreamQuery?.trim().toLowerCase();
  return rows.filter(row => (row.at >= window.start && row.at < window.end ||
    allowUntimed && !Number.isFinite(row.at) && (query || upstream)) &&
    dimensions.every(key => matchesSelection(filters[key] ?? null, observationKey(row, key))) &&
    (filters.supply == null || filters.supply.some(([provider, channel]) =>
      (provider === null || provider === observationKey(row, 'provider')) &&
      (channel === null || channel === observationKey(row, 'channel')))) &&
    (!filters.type || row.modelType === filters.type) &&
    (!filters.outcome || (filters.outcome === 'other' ? !['success', 'failed'].includes(row.outcome) : row.outcome === filters.outcome)) &&
    (!filters.http || String(row.status ?? 'unreported') === filters.http) &&
    (!filters.errorSource || row.errorSource === filters.errorSource) &&
    (!filters.signal || (filters.signal === 'rate-limit' ? row.status === 429 :
      filters.signal === 'timeout' ? row.timeout : filters.signal === 'fallback' && row.fallback)) &&
    (!query || row.requestId?.toLowerCase().includes(query)) && (!upstream || row.upstreamRequestId?.toLowerCase().includes(upstream)));
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
export function summarizeObservations(rows) {
  const success = rows.filter(row => row.outcome === 'success').length;
  const failed = rows.filter(row => row.outcome === 'failed').length;
  const ttfts = rows.map(row => row.ttft).filter(Number.isFinite);
  return {
    count: rows.length, success, failed, other: rows.length - success - failed,
    failureRate: success + failed ? failed * 100 / (success + failed) : null,
    p95: percentile(rows.map(row => row.duration).filter(Number.isFinite), .95),
    ttft: percentile(ttfts, .95), ttftSamples: ttfts.length,
    input: sum(rows, 'input'), output: sum(rows, 'output'), total: sum(rows, 'total'),
    rateLimit: rows.filter(row => row.status === 429).length,
    timeout: rows.filter(row => row.timeout).length,
    fallback: rows.filter(row => row.fallback).length,
  };
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

export function logCsv(rows) {
  return '\ufeff' + rows.map(row => row.map(value => {
    const cell = String(value ?? '');
    const safe = typeof value === 'string' && (/^[\s]*[=+@-]/.test(cell) || /^[\t\r\n]/.test(cell)) ? "'" + cell : cell;
    return '"' + safe.replaceAll('"', '""') + '"';
  }).join(',')).join('\r\n');
}
