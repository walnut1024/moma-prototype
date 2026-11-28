import { attemptCapacity, observationBuckets, observationTime } from './call-observations.mjs';

const minute = 60_000;
const hour = 60 * minute;
const day = 24 * hour;
const beijingOffset = 8 * hour;
const ranges = ['<128', '128–256', '256–512', '512–1K', '1K–2K', '2K–4K', '4K–8K', '8K–16K', '16K–32K', '32K–64K', '≥64K'];
const limits = [128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536, Infinity];
export const performanceSceneAxes = {
  input: [
    { label: '200', limit: 200 }, { label: '1K', limit: 1024 }, { label: '2K', limit: 2048 },
    { label: '4K', limit: 4096 }, { label: '7K', limit: 7168 }, { label: '16K', limit: 16384 },
    { label: '40K', limit: 40960 }, { label: '128K', limit: 131072 }, { label: '>128K', limit: Infinity },
  ],
  output: [
    { label: '200', limit: 200 }, { label: '1K', limit: 1024 }, { label: '2K', limit: 2048 },
    { label: '4K', limit: 4096 }, { label: '>4K', limit: Infinity },
  ],
};

export const maxPerformanceBuckets = 1440;

export function defaultPerformanceFilters(now = Date.now()) {
  const currentMinute = Math.floor(now / minute) * minute;
  return { start: currentMinute - 59 * minute, end: currentMinute + minute, model: '', upstream: '' };
}

export function performanceGrain({ start, end }) {
  const lastMinute = Math.floor((end - 1) / minute);
  const firstMinute = Math.floor(start / minute);
  return lastMinute - firstMinute < 48 * 60 ? 'hour' : 'day';
}

export function performanceBucketCount({ start, end }) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  const step = performanceGrain({ start, end }) === 'hour' ? hour : day;
  return Math.ceil((end + beijingOffset) / step) - Math.floor((start + beijingOffset) / step);
}

function sortedOptions(labels) {
  const counts = new Map();
  for (const label of labels.values()) counts.set(label, (counts.get(label) ?? 0) + 1);
  return Array.from(labels, ([value, label]) => ({
    value,
    label: counts.get(label) > 1 ? `${label} · ${value}` : label,
  })).sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'));
}

export function performanceOptions(attempts, model = '') {
  const models = new Map();
  const upstreams = new Map();
  for (const row of attempts) {
    if (!Number.isFinite(row.at)) continue;
    if (row.model) models.set(row.model, row.modelName || row.model);
    if ((!model || row.model === model) && row.upstreamModelId && row.channelModel) {
      const label = [row.upstreamModelId, row.providerName || row.provider, row.channelName || row.channel].filter(Boolean).join(' · ');
      upstreams.set(row.channelModel, label);
    }
  }
  return { models: sortedOptions(models), upstreams: sortedOptions(upstreams) };
}

const sum = values => values.reduce((total, value) => total + value, 0);
const isMeasured = value => Number.isFinite(value) && value >= 0;
const valuesFor = (rows, key) => rows.map(row => row[key]).filter(isMeasured);
const sumOrNull = values => values.length ? sum(values) : null;
const percent = (count, total) => total > 0 ? count * 100 / total : null;

function latency(values) {
  if (!values.length) return null;
  const sorted = values.toSorted((a, b) => a - b);
  const rank = ratio => sorted[Math.ceil(values.length * ratio) - 1];
  return { avg: sum(values) / values.length, p50: rank(0.5), p90: rank(0.9), p95: rank(0.95), p99: rank(0.99) };
}

function measurePerformance(rows, window) {
  const totalCalls = rows.length;
  const successfulCalls = rows.filter(row => row.outcome === 'success').length;
  const failedCalls = rows.filter(row => row.outcome === 'failed').length;
  const timeoutCalls = rows.filter(row => row.timeout).length;
  const cacheSamples = rows.filter(row => row.input > 0 && isMeasured(row.cached) && row.cached <= row.input);
  const cachedTokens = sumOrNull(valuesFor(cacheSamples, 'cached'));
  const { averageRpm, averageTpm } = attemptCapacity(rows, window);
  const generated = rows.filter(row => row.outcome === 'success' && row.output > 0 && row.generationDuration > 0
    && Number.isFinite(row.output) && Number.isFinite(row.generationDuration));
  const tokenIntervals = generated.filter(row => row.output > 1).map(row => row.generationDuration / (row.output - 1));

  return {
    totalCalls, successfulCalls, failedCalls, timeoutCalls,
    totalTokens: sumOrNull(valuesFor(rows, 'total')),
    totalPromptTokens: sumOrNull(valuesFor(rows, 'input')),
    totalCompletionTokens: sumOrNull(valuesFor(rows, 'output')),
    cachedTokens,
    rpm: totalCalls ? averageRpm : null,
    tpm: averageTpm,
    ttft: latency(valuesFor(rows, 'ttft')),
    tpot: latency(tokenIntervals),
    e2e: latency(valuesFor(rows, 'duration')),
    otps: generated.length ? sum(valuesFor(generated, 'output')) * 1000 / sum(valuesFor(generated, 'generationDuration')) : null,
    timeoutRate: percent(timeoutCalls, totalCalls),
    cacheHitRate: percent(cachedTokens, sum(valuesFor(cacheSamples, 'input'))),
  };
}

function outcomeIndex({ outcome, status }) {
  if (outcome === 'success') return 0;
  if (outcome === 'canceled') return 7;
  if (outcome === 'pending') return 9;
  if (outcome !== 'failed') return 8;
  if (status === 0) return 1;
  if (status >= 500 && status <= 599) return 2;
  if (status === 400) return 3;
  if (status === 401) return 4;
  if (status === 429) return 5;
  return 6;
}

function distributionFor(rows, window) {
  const outcomes = Array(10).fill(0);
  const calls = [Array(ranges.length).fill(0), Array(ranges.length).fill(0)];
  const tokens = [Array(ranges.length).fill(0), Array(ranges.length).fill(0)];
  const comparable = rows.filter(row => isMeasured(row.total));
  const { input, output } = performanceSceneAxes;
  const scenes = input.map(() => output.map(() => ({ calls: 0, tokens: 0 })));
  let sampleCount = 0;
  for (const row of rows) {
    outcomes[outcomeIndex(row)]++;
    if (isMeasured(row.input) && isMeasured(row.output)) {
      const inputIndex = input.findIndex(band => row.input <= band.limit);
      const outputIndex = output.findIndex(band => row.output <= band.limit);
      const cell = scenes[inputIndex][outputIndex];
      cell.calls++;
      cell.tokens += row.input + row.output;
      sampleCount++;
    }
    [row.input, row.output].forEach((value, seriesIndex) => {
      if (!isMeasured(value)) return;
      const band = limits.findIndex(limit => value < limit);
      calls[seriesIndex][band]++;
      tokens[seriesIndex][band] += value;
    });
  }
  const minutes = (window.end - window.start) / minute;
  return {
    outcomes,
    tokens: [sumOrNull(valuesFor(comparable, 'input')), sumOrNull(valuesFor(comparable, 'output'))],
    ranges,
    histogram: { calls, tokens },
    scenes: {
      sampleCount,
      cells: scenes.map(row => row.map(({ calls, tokens }) => ({
        calls,
        share: percent(calls, sampleCount),
        tpm: calls ? tokens / minutes : null,
      }))),
    },
  };
}

function failureUsers(rows) {
  const users = new Map();
  for (const row of rows) {
    if (row.outcome !== 'failed') continue;
    const userId = row.user || null;
    if (!users.has(userId)) users.set(userId, { userId, userName: userId ? row.userName || userId : '未采集', failures: 0 });
    users.get(userId).failures++;
  }
  return Array.from(users.values()).sort((a, b) => b.failures - a.failures || a.userName.localeCompare(b.userName, 'zh-CN'));
}

export function modelPerformance(attempts, filters) {
  const { start, end, model, upstream } = filters;
  const bucketCount = performanceBucketCount(filters);
  const valid = bucketCount > 0 && bucketCount <= maxPerformanceBuckets;
  const rows = valid ? attempts.filter(row => Number.isFinite(row.at) && row.at >= start && row.at < end
    && (!model || row.model === model) && (!upstream || row.channelModel === upstream)) : [];
  const grain = performanceGrain(filters);
  const window = valid ? { start, end } : { start: 0, end: 0 };
  const overall = measurePerformance(rows, window);
  const points = rows.length ? observationBuckets(rows, window, grain).map(bucket => {
    const localTime = observationTime(bucket.start);
    const time = grain === 'hour' ? localTime.slice(0, 13) + ':00' : localTime.slice(0, 10);
    return { time, minutes: (bucket.end - bucket.start) / minute, ...measurePerformance(bucket.rows, bucket) };
  }) : [];
  return {
    points,
    summary: {
      ...overall,
      ttft: overall.ttft?.avg ?? null,
      tpot: overall.tpot?.avg ?? null,
      successRate: percent(overall.successfulCalls, overall.successfulCalls + overall.failedCalls),
      latestAt: rows.length ? rows.reduce((latest, row) => Math.max(latest, row.at), start) : null,
    },
    distribution: distributionFor(rows, window),
    errorUsers: failureUsers(rows),
  };
}
