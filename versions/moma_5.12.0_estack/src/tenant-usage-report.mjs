import { usageMeter, usageModelTypes, usageValue, usageWindow } from './admin-v2/usage-analysis.js';
import { shanghaiDate } from './call-log-data.mjs';
import { tenantUsageTypes } from './usage-data.mjs';

export const UNASSIGNED = '__unknown__';
export const USAGE_OVERVIEW = '概览';
export const USAGE_ACTIVITY_DAYS = 365;
export const tenantUsageCategory = type => usageModelTypes.find(group => group.types.includes(type))?.name;
export const NATIVE_METERS = {
  images: ['生成图片数', '张'],
  videoSeconds: ['视频生成时长', '秒'],
  audio: ['识别音频时长', '秒'],
  characters: ['合成字符数', '字符'],
};
const DAY = 86_400_000;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const BEIJING_OFFSET = 8 * HOUR;
const MICROS = 1_000_000;
const billingOf = row => row.billingType || '按量付费';
const normalizedUnit = unit => ({ '百万 Token': 'Token', 分钟: '秒', 万字符: '字符' })[unit] || unit;

function totals() {
  return {
    requests: 0, finished: 0, success: 0, tokens: null, uncached: 0, cached: 0,
    unknownInput: 0, input: null, output: null, inputSamples: 0, outputSamples: 0,
    cacheInput: 0, cacheHit: null, cacheWrite: null, cacheRead: null,
    planTokens: null, fees: new Map(), savings: new Map(), units: new Map(),
  };
}

function moneyAdd(map, currency, micros) {
  if (/^[A-Z]{3}$/.test(currency) && Number.isSafeInteger(micros)) {
    map.set(currency, (map.get(currency) ?? 0) + micros);
  }
}

export function tenantUsageMeter(model, row = {}) {
  const unit = normalizedUnit(row.usageUnit) || normalizedUnit(model.usageUnit);
  const meter = usageMeter({ type: model.type }, { ...row, usageUnit: unit });
  const seconds = { audio: 'audio', video: 'videoSeconds' }[model.type];
  const metric = { Token: 'tokens', 张: 'images', 秒: seconds, 字符: 'characters' }[meter.unit];
  return { ...meter, metric };
}

function measure(row, model) {
  const meter = tenantUsageMeter(model, row);
  const value = usageValue(row, meter.fields);
  const { input = null, output = null } = value;
  const confirmed = value.complete && row.usageConfirmed !== false;
  const token = confirmed && meter.unit === 'Token';
  const cache = token && ['text', 'multimodal'].includes(model.type);
  const { cached, cacheWrite, cacheRead } = row.cacheHit ? {} : row.usage || {};
  const known = (value, max = Infinity) => cache && Number.isFinite(value) && value >= 0 && value <= max ? value : null;
  return {
    metric: meter.metric,
    total: confirmed && meter.metric ? value.total : null,
    input: token ? input : null,
    output: token ? output : null,
    cached: known(cached, input),
    cacheWrite: known(cacheWrite),
    cacheRead: known(cacheRead, input),
  };
}

function add(group, row, value) {
  group.requests++;
  if (Number.isInteger(row.httpStatus) && row.httpStatus >= 200 && row.httpStatus <= 599) {
    group.finished++;
    if (row.httpStatus < 300) group.success++;
  }
  if (value.total !== null) {
    if (value.metric === 'tokens') {
      group.tokens = (group.tokens ?? 0) + value.total;
      group.input = (group.input ?? 0) + value.input;
      group.inputSamples++;
      if (value.output !== null) {
        group.output = (group.output ?? 0) + value.output;
        group.outputSamples++;
      }
      if (value.cached === null) group.unknownInput += value.input;
      else {
        group.uncached += value.input - value.cached;
        group.cached += value.cached;
        group.cacheInput += value.input;
        group.cacheHit = (group.cacheHit ?? 0) + value.cached;
      }
      if (value.cacheWrite !== null) group.cacheWrite = (group.cacheWrite ?? 0) + value.cacheWrite;
      if (value.cacheRead !== null) group.cacheRead = (group.cacheRead ?? 0) + value.cacheRead;
    } else {
      group.units.set(value.metric, (group.units.get(value.metric) ?? 0) + value.total);
    }
  }
  if (billingOf(row) === 'Token Plan') {
    if (Number.isSafeInteger(row.planTokens) && row.planTokens >= 0) group.planTokens = (group.planTokens ?? 0) + row.planTokens;
    return;
  }
  const charge = row.charge;
  if (charge && Number.isSafeInteger(charge.micros) && charge.micros >= 0) {
    moneyAdd(group.fees, charge.currency, charge.micros);
    if (value.cached !== null) moneyAdd(group.savings, charge.currency, charge.savingsMicros);
  }
}

function addGroup(groups, id, row, value) {
  const key = id || UNASSIGNED;
  let group = groups.get(key);
  if (!group) groups.set(key, group = totals());
  add(group, row, value);
}

export const usageSuccessRate = group => group.finished ? group.success / group.finished * 100 : null;
export const usageCacheRate = group => group.cacheInput ? group.cacheHit / group.cacheInput * 100 : null;
export function usageMoney(group, currency, field = 'fees') {
  const amount = group[field].get(currency);
  return amount === undefined ? null : amount / MICROS;
}

const perMinute = { tpm: 'tokens', inputMinute: 'input', outputMinute: 'output',
  cacheReadMinute: 'cacheHit', cacheCreateMinute: 'cacheWrite', explicitReadMinute: 'cacheRead' };
export function usageMetricValue(group, metric, currency, minutes) {
  if (metric === 'fees') return usageMoney(group, currency);
  if (Object.hasOwn(NATIVE_METERS, metric)) return group.units.get(metric) ?? null;
  if (metric === 'inputPerRequest') return group.inputSamples ? group.input / group.inputSamples : null;
  if (metric === 'outputPerRequest') return group.outputSamples ? group.output / group.outputSamples : null;
  const field = perMinute[metric];
  if (field) return group[field] !== null && minutes > 0 ? group[field] / minutes : null;
  return group[metric] ?? null;
}

export function usageModelsInScope(models, records, category) {
  const catalogue = new Map(models.map(model => [model.id, model]));
  for (const row of records) {
    if (row.modelId && !catalogue.has(row.modelId) && (row.modelType || category === USAGE_OVERVIEW)) {
      catalogue.set(row.modelId, { id: row.modelId, modelId: row.publicModelId, type: row.modelType });
    }
  }
  const types = category === USAGE_OVERVIEW ? null : tenantUsageTypes(category);
  return [...catalogue.values()].filter(model => !types || types.includes(model.type));
}

export function usageDimensionRows(records, { projectId, keyId, billing }) {
  const latest = new Map();
  for (const row of records) {
    const id = row.requestId || row.id;
    if (!id) continue;
    const previous = latest.get(id);
    if (!previous || Date.parse(previous.updatedAt || previous.createdAt) <= Date.parse(row.updatedAt || row.createdAt)) latest.set(id, row);
  }
  return [...latest.values()].filter(row => (billing === null || billingOf(row) === billing) &&
    (!projectId || (row.projectId || UNASSIGNED) === projectId) &&
    (!keyId || (row.keyId || UNASSIGNED) === keyId));
}

export function tenantUsageReport({ records, models, filters, range, now, maxDays = 31 }) {
  const window = usageWindow(range, now.getTime());
  const summary = totals();
  const rankings = { modelId: new Map(), projectId: new Map(), keyId: new Map() };
  const buckets = [];
  const matched = [];
  if (!window || window.days > maxDays) return { summary, rankings, buckets, matched, days: 0, minutes: 0, peakTpm: null };
  const { start, end, hourly } = window;
  const step = hourly ? 10 * MINUTE : DAY;
  for (let time = start; time < end; time += step) {
    buckets.push({ time, minutes: (Math.min(time + step, end) - time) / MINUTE, totals: totals(), models: new Map() });
  }

  const modelById = new Map(models.map(model => [model.id, model]));
  const overview = filters.category === USAGE_OVERVIEW;
  const types = overview ? null : tenantUsageTypes(filters.category);
  const modelIds = overview || filters.modelIds === null ? null : new Set(filters.modelIds);
  const minuteTokens = new Map();
  let peakTpm = null;
  for (const row of usageDimensionRows(records, filters)) {
    const at = Date.parse(row.createdAt);
    const model = modelById.get(row.modelId) || { id: row.modelId, type: row.modelType, modelId: row.publicModelId };
    if (!(at >= start && at < end) ||
        filters.userId && (row.userId || UNASSIGNED) !== filters.userId ||
        types && !types.includes(model.type) ||
        modelIds && !modelIds.has(model.id)) continue;

    const value = measure(row, model);
    if (value.metric === 'tokens' && value.total !== null) {
      const minute = Math.floor(at / MINUTE);
      const amount = (minuteTokens.get(minute) ?? 0) + value.total;
      minuteTokens.set(minute, amount);
      peakTpm = Math.max(peakTpm ?? 0, amount);
    }
    matched.push(row);
    const bucket = buckets[Math.floor((at - start) / step)];
    add(summary, row, value);
    add(bucket.totals, row, value);
    addGroup(bucket.models, row.modelId, row, value);
    for (const [dimension, groups] of Object.entries(rankings)) addGroup(groups, row[dimension], row, value);
  }
  return { summary, rankings, buckets, matched, days: window.days, minutes: (end - start) / MINUTE, peakTpm };
}

export function usageRanking(report, dimension, metric, currency) {
  const value = group => usageMetricValue(group, metric, currency);
  const denominator = value(report.summary);
  return [...report.rankings[dimension]].map(([id, group]) => {
    const amount = value(group);
    return { id, group, amount, share: amount === null || !denominator ? null : amount / denominator * 100 };
  }).filter(row => row.amount !== null)
    .sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id));
}

const beijingDay = time => Math.floor((time + BEIJING_OFFSET) / DAY) * DAY - BEIJING_OFFSET;
const hourStart = time => Math.floor(time / HOUR) * HOUR;
export const usageWeekday = time => (new Date(time + BEIJING_OFFSET).getUTCDay() + 6) % 7;
const tokenValue = group => group.tokens ?? (group.requests ? null : 0);

function tokenPeriods(buckets, periodKey, groupsFor) {
  const periods = [];
  for (const bucket of buckets) {
    const key = periodKey(bucket.time);
    let period = periods.at(-1);
    if (period?.key !== key) periods.push(period = { key, time: bucket.time, requests: 0, tokens: null });
    period.end = bucket.time;
    for (const group of groupsFor(bucket)) {
      if (!group) continue;
      period.requests += group.requests;
      if (group.tokens !== null) period.tokens = (period.tokens ?? 0) + group.tokens;
    }
  }
  return periods;
}

export function tenantUsageActivity({ records, models, now }) {
  const today = beijingDay(now.getTime());
  const range = {
    start: shanghaiDate(new Date(today - (USAGE_ACTIVITY_DAYS - 1) * DAY)),
    end: shanghaiDate(now),
  };
  const { buckets } = tenantUsageReport({
    records, models, range, now, maxDays: USAGE_ACTIVITY_DAYS, filters: { category: USAGE_OVERVIEW, billing: null },
  });
  // At midnight today's cell is in range even though it has no observed minutes yet.
  if (buckets.at(-1)?.time !== today) buckets.push({ time: today, totals: totals() });
  const daily = buckets.map(bucket => ({ time: bucket.time, end: bucket.time, value: tokenValue(bucket.totals) }));
  const weekly = tokenPeriods(buckets, time => time - usageWeekday(time) * DAY, bucket => [bucket.totals])
    .map(period => ({ time: period.time, end: period.end, value: tokenValue(period) }));
  let total = 0;
  const cumulative = daily.map(point => ({ ...point, value: point.value === null ? null : (total += point.value) }));
  return { range, daily, weekly, cumulative };
}

export function usageSubscribedTrends(report, subscribedModelIds) {
  const subscribed = new Set(subscribedModelIds);
  const ranked = usageRanking(report, 'modelId', 'tokens').filter(row => subscribed.has(row.id));
  const positive = ranked.filter(row => row.amount > 0);
  const groups = positive.slice(0, 5).map(({ id, amount }) => ({ id, value: amount, members: [id] }));
  const rest = positive.slice(5);
  if (rest.length) groups.push({ id: null, value: rest.reduce((sum, row) => sum + row.amount, 0), members: rest.map(row => row.id) });
  const periodKey = report.days === 1 ? hourStart : time => time;
  return {
    measured: ranked.length > 0,
    times: [...new Set(report.buckets.map(bucket => periodKey(bucket.time)))],
    groups: groups.map(({ id, value, members }) => ({
      id, value, values: tokenPeriods(report.buckets, periodKey, bucket => members.map(member => bucket.models.get(member))).map(tokenValue),
    })),
  };
}

export function usageReportCSV(report, { filters, range, now, demo, models }) {
  const currencies = [...report.summary.fees.keys()].sort();
  const meters = Object.keys(NATIVE_METERS).filter(metric => report.summary.units.has(metric));
  const modelById = new Map(models.map(model => [model.id, model]));
  const overview = filters.category === USAGE_OVERVIEW;
  const columns = [
    '数据来源', '起始日期', '结束日期', '快照更新时间（北京时间）', '时间桶（北京时间）', '时间桶观测分钟数', '计费方式', '模型类别',
    '模型 ID', '项目筛选', 'Key 筛选', '用户筛选', '请求数', '成功请求数', '已结束请求数',
    '总 Token', '输入 Token', '输出 Token', '已计量输入的请求数', '已计量输出的请求数',
    '缓存命中 Token', '缓存写入 Token', '显式缓存命中 Token', '已采集缓存的输入 Token', '套餐抵扣 Token',
    ...meters.map(metric => NATIVE_METERS[metric][0] + '（' + NATIVE_METERS[metric][1] + '）'),
    ...currencies.flatMap(currency => ['调用费用（' + currency + '）', '预估缓存节省（' + currency + '）']),
  ];
  const stamp = value => new Date(new Date(value).getTime() + 28_800_000).toISOString().slice(0, 19).replace('T', ' ');
  const quote = value => {
    const safe = typeof value === 'string' && /^[\t\r\n ]*[=+@-]/.test(value) ? "'" + value : value ?? '';
    return '"' + String(safe).replaceAll('"', '""') + '"';
  };
  const rows = report.buckets.flatMap(bucket => [...bucket.models].map(([id, group]) => [
    demo ? '模拟数据' : '当前空间', range.start, range.end, stamp(now), stamp(bucket.time), bucket.minutes,
    filters.billing, overview ? tenantUsageCategory(modelById.get(id)?.type) || '未归类' : filters.category,
    modelById.get(id)?.modelId || id,
    filters.projectId ?? '全部', filters.keyId ?? '全部', filters.userId ?? '全部',
    group.requests, group.success, group.finished, group.tokens,
    group.input, group.output, group.inputSamples, group.outputSamples, group.cacheHit, group.cacheWrite, group.cacheRead,
    group.cacheHit === null ? null : group.cacheInput, group.planTokens,
    ...meters.map(metric => group.units.get(metric)),
    ...currencies.flatMap(currency => [usageMoney(group, currency), usageMoney(group, currency, 'savings')]),
  ]));
  return '\ufeff' + [columns, ...rows].map(row => row.map(quote).join(',')).join('\r\n');
}
