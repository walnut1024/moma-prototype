import test from 'node:test';
import assert from 'node:assert/strict';
import { callObservations } from '../src/admin-v2/call-observations.mjs';
import {
  defaultPerformanceFilters, maxPerformanceBuckets, modelPerformance, performanceBucketCount, performanceGrain, performanceOptions,
} from '../src/admin-v2/model-performance-data.mjs';

const minute = 60_000;
const day = 1440 * minute;
const clock = Date.parse('2026-11-24T09:39:37+08:00');
const filters = defaultPerformanceFilters(clock);
const oneMinute = { ...filters, end: filters.start + minute };

test('model performance uses the current 60 display minutes and labels aligned Beijing buckets', () => {
  assert.equal(filters.start, Date.parse('2026-11-24T08:40:00+08:00'));
  assert.equal(filters.end, Date.parse('2026-11-24T09:40:00+08:00'));
  assert.equal(performanceGrain({ ...filters, end: filters.start + 2 * day }), 'hour');
  assert.equal(performanceGrain({ ...filters, end: filters.start + 2 * day + minute }), 'day');
  assert.equal(performanceBucketCount(filters), 2);
  const { points, summary } = modelPerformance([
    { at: filters.start - 1, outcome: 'success' },
    { at: filters.start, outcome: 'success' },
    { at: clock, outcome: 'success' },
    { at: filters.end, outcome: 'failed' },
  ], filters);
  assert.equal(summary.totalCalls, 2);
  assert.equal(summary.latestAt, clock);
  assert.deepEqual(points.map(({ time, minutes, totalCalls }) => [time, minutes, totalCalls]), [
    ['2026-11-24 08:00', 20, 1], ['2026-11-24 09:00', 40, 1],
  ]);
});

test('upstream choices distinguish identical upstream IDs and use actual fallback attempt facts', () => {
  const { attempts } = callObservations({
    models: [{ id: 'customer-model', name: '客户模型' }],
    users: [{ id: 'user-1', name: '调用用户' }],
    requests: [{
      modelId: 'customer-model', userId: 'user-1', requestId: 'retried', startedAt: filters.start - minute, httpStatus: 200,
      attempts: [
        { dispatched: true, startedAt: filters.start, channelId: 'primary', providerId: 'vendor', upstreamModelId: 'shared', httpStatus: 503 },
        { dispatched: true, startedAt: filters.start + 50, channelId: 'backup', providerId: 'vendor', upstreamModelId: 'shared', httpStatus: 200 },
        { dispatched: true, channelId: 'untimed', providerId: 'vendor', upstreamModelId: 'shared', httpStatus: 401 },
      ],
    }],
  });
  const options = performanceOptions(attempts, 'customer-model');
  assert.deepEqual(options.models, [{ value: 'customer-model', label: '客户模型' }]);
  assert.deepEqual(options.upstreams.map(option => option.label), ['shared · vendor · backup', 'shared · vendor · primary']);
  assert.equal(performanceOptions(attempts, 'another-model').upstreams.length, 0);
  const primary = modelPerformance(attempts, { ...filters, model: 'customer-model', upstream: options.upstreams[1].value });
  assert.equal(primary.summary.successRate, 0);
  assert.equal(primary.distribution.outcomes[2], 1);
  assert.deepEqual(primary.errorUsers, [{ userId: 'user-1', userName: '调用用户', failures: 1 }]);
  const total = modelPerformance(attempts, filters);
  assert.equal(total.summary.totalCalls, 2);
  assert.equal(total.summary.successRate, 50);
});

test('overview metrics use exact duration, successful generation samples and measured cache input', () => {
  const measured = { at: oneMinute.start, outcome: 'success', tokenMeter: true };
  const { points: [point], summary } = modelPerformance([
    { ...measured, ttft: 100, duration: 180, generationDuration: 80, input: 100, output: 9, total: 109, cached: 25 },
    { ...measured, ttft: 500, duration: 560, generationDuration: 60, input: 200, output: 4, total: 204, cached: 100 },
    { ...measured, input: 50, output: 0, total: 50, cached: null },
    { at: oneMinute.start + 20, outcome: 'canceled', ttft: null, generationDuration: 20 },
  ], oneMinute);
  assert.equal(summary.totalTokens, 363);
  assert.equal(summary.rpm, 4);
  assert.equal(summary.tpm, 363);
  assert.equal(summary.successRate, 100);
  assert.equal(summary.ttft, 300);
  assert.equal(summary.tpot, 15);
  assert.equal(summary.cacheHitRate, 125 * 100 / 300);
  assert.equal(point.otps, 13 * 1000 / 140);
  assert.deepEqual(point.ttft, { avg: 300, p50: 100, p90: 500, p95: 500, p99: 500 });
  assert.equal(point.e2e.p95, 560);
});

test('distributions preserve outcome categories, failure user and only observed Token lengths', () => {
  const outcomeRows = [
    { outcome: 'success', input: 127, output: 128, total: 255, tokenMeter: true },
    { outcome: 'failed', status: 0, timeout: true },
    { outcome: 'failed', status: 502, user: 'uid' },
    { outcome: 'failed', status: 400, user: 'uid' },
    { outcome: 'failed', status: 401, user: 'uid' },
    { outcome: 'failed', status: 429, user: 'another' },
    { outcome: 'failed', status: 403, user: 'another' },
    { outcome: 'canceled', status: 0 },
    { outcome: 'unknown', input: 65536, total: null, tokenMeter: true },
    { outcome: 'pending' },
  ].map(row => ({ ...row, at: filters.start }));
  const { distribution, errorUsers, summary } = modelPerformance(outcomeRows, filters);
  assert.equal(summary.totalCalls, 10);
  assert.equal(summary.failedCalls, 6);
  assert.equal(summary.timeoutCalls, 1);
  assert.equal(summary.timeoutRate, 10);
  assert.equal(summary.tpm, null);
  assert.equal(summary.successRate, 100 / 7);
  assert.deepEqual(distribution.outcomes, Array(10).fill(1));
  assert.deepEqual(distribution.tokens, [127, 128]);
  assert.equal(distribution.histogram.calls[0][0], 1);
  assert.equal(distribution.histogram.calls[0][10], 1);
  assert.equal(distribution.histogram.tokens[0][10], 65536);
  assert.equal(distribution.histogram.calls[1][1], 1);
  assert.deepEqual(errorUsers.map(({ userId, failures }) => [userId, failures]), [['uid', 3], ['another', 2], [null, 1]]);
});

test('input and output scenes classify paired attempts within the applied filters', () => {
  const window = { ...filters, end: filters.start + 2 * minute, model: 'customer-model', upstream: 'upstream-channel' };
  const measured = { at: window.start, model: window.model, channelModel: window.upstream };
  const rows = [
    ...[[0, 0], [200, 200], [201, 201], [1024, 1024], [4096, 4096], [131072, 4097], [131073, 0]]
      .map(([input, output]) => ({ ...measured, input, output })),
    { ...measured, input: 500, output: null },
    { ...measured, input: null, output: 500 },
    { ...measured, input: -1, output: 50 },
    { ...measured, input: 500, output: 500, model: 'other-model' },
    { ...measured, input: 500, output: 500, channelModel: 'other-upstream' },
    { ...measured, input: 500, output: 500, at: window.end },
  ];
  const { scenes } = modelPerformance(rows, window).distribution;
  assert.equal(scenes.sampleCount, 7);
  assert.equal(scenes.cells.length, 9);
  assert(scenes.cells.every(row => row.length === 5));
  assert.equal(scenes.cells.flat().reduce((total, cell) => total + cell.calls, 0), 7);
  assert.deepEqual(scenes.cells[0][0], { calls: 2, share: 200 / 7, tpm: 200 });
  assert.deepEqual(scenes.cells[1][1], { calls: 2, share: 200 / 7, tpm: 1225 });
  assert.deepEqual(scenes.cells[3][3], { calls: 1, share: 100 / 7, tpm: 4096 });
  assert.deepEqual(scenes.cells[7][4], { calls: 1, share: 100 / 7, tpm: 67584.5 });
  assert.deepEqual(scenes.cells[8][0], { calls: 1, share: 100 / 7, tpm: 65536.5 });
  assert.deepEqual(scenes.cells[1][0], { calls: 0, share: 0, tpm: null });

  const empty = modelPerformance([{ ...measured, input: 50, output: null }], window).distribution.scenes;
  assert.equal(empty.sampleCount, 0);
  assert.deepEqual(empty.cells[0][0], { calls: 0, share: null, tpm: null });
});

test('empty, invalid and overlong windows contain no points or fabricated measurements', () => {
  assert.equal(performanceBucketCount({ start: Date.parse('2026-11-24T00:00:00+08:00'), end: Date.parse('2026-11-26T00:00:00+08:00') }), 48);
  const wide = { ...filters, end: filters.start + maxPerformanceBuckets * day + minute };
  assert.equal(performanceBucketCount(wide), maxPerformanceBuckets + 1);
  for (const window of [filters, wide, { ...filters, end: filters.start - 1 }]) {
    const { summary, points, distribution } = modelPerformance([{ at: NaN, ttft: 100, outcome: 'success' }], window);
    assert.deepEqual(points, []);
    assert.deepEqual([summary.totalCalls, summary.totalTokens, summary.successRate, summary.rpm, summary.ttft, summary.tpot, summary.latestAt],
      [0, null, null, null, null, null, null]);
    assert.deepEqual(distribution.tokens, [null, null]);
  }
});
