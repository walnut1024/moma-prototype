import assert from 'node:assert/strict';
import test from 'node:test';
import { tenantUsageDemo } from '../src/mock/tenant-usage.mjs';
import { tenantUsageActivity, tenantUsageReport, UNASSIGNED, USAGE_OVERVIEW, usageCacheRate, usageMetricValue, usageModelsInScope, usageMoney, usageRanking, usageReportCSV, usageSubscribedTrends, usageSuccessRate } from '../src/tenant-usage-report.mjs';
import { usageModelGroups, usagePeriod } from '../src/usage-data.mjs';

const now = new Date('2026-11-10T09:20:00Z');
const initialFilters = { category: '语言模型', billing: '按量付费', projectId: null, keyId: null, userId: null, modelIds: null };

test('the same project, Key, user and date narrow every metric and export', () => {
  const source = tenantUsageDemo(now);
  const filters = { ...initialFilters };
  const cases = [
    [{}, '7d', 1488],
    [{ projectId: 'demo-support' }, '7d', 791],
    [{ keyId: 'demo-support-prod' }, '7d', 690],
    [{ userId: 'demo-user-lin' }, '7d', 385],
    [{}, 'yesterday', 64],
  ];
  const sum = values => values.reduce((total, value) => total + (value ?? 0), 0);
  for (const [patch, preset, requests] of cases) {
    Object.assign(filters, patch);
    const range = usagePeriod(preset, now);
    const report = tenantUsageReport({ ...source, filters, range, now });
    const { summary, buckets, matched } = report;
    assert.equal(summary.requests, requests);
    assert.equal(matched.length, requests);
    assert.equal(sum(buckets.map(bucket => bucket.totals.tokens)), summary.tokens);
    assert.equal(sum(buckets.map(bucket => bucket.totals.cacheHit)), summary.cacheHit);
    assert.equal(sum(buckets.map(bucket => bucket.totals.fees.get('CNY'))), summary.fees.get('CNY'));
    assert.equal(summary.tokens, summary.uncached + summary.cached + summary.unknownInput + summary.output);
    assert.equal(sum(buckets.map(bucket => bucket.minutes)), report.minutes);
    assert.ok(report.peakTpm >= usageMetricValue(summary, 'tpm', 'CNY', report.minutes));
    for (const dimension of ['modelId', 'projectId', 'keyId']) {
      const ranked = usageRanking(report, dimension, 'requests', 'CNY');
      assert.equal(sum(ranked.map(row => row.amount)), requests);
    }
    if (preset !== 'yesterday') continue;
    assert.deepEqual([...report.rankings.keyId.keys()], ['demo-support-prod']);
    assert.equal(usageMoney(summary, 'CNY'), 1.04986);
    assert.equal(usageCacheRate(summary), 41.528809945624246);
    assert.equal(usageRanking(report, 'modelId', 'tokens', 'CNY')[0].share, 100);
    const csv = usageReportCSV(report, { filters, range, now, demo: true, models: source.models });
    assert.match(csv, /"deepseek-v3","demo-support","demo-support-prod","demo-user-lin"/);
    assert.doesNotMatch(csv, /qwen3-32b|demo-knowledge/);
    assert.equal(report.buckets.length, 144);
    assert.equal(report.buckets[0].minutes, 10);
  }
  const plan = tenantUsageReport({ ...source, filters: { ...initialFilters, billing: 'Token Plan' }, range: usagePeriod('7d', now), now });
  assert.equal(plan.summary.planTokens, plan.summary.tokens);
  assert.equal(plan.summary.fees.size, 0);
});

test('final request revisions distinguish absent cache, zero charge and currency', () => {
  const base = { modelId: 'm', createdAt: '2026-11-09T12:00:00+08:00', httpStatus: 200 };
  const records = [
    { ...base, requestId: 'a', updatedAt: '2026-11-09T14:00:00+08:00', usage: { input: 80, output: 20, cached: 40 }, charge: { currency: 'CNY', micros: 0, savingsMicros: 5000 } },
    { ...base, requestId: 'a', updatedAt: '2026-11-09T13:00:00+08:00', userId: 'obsolete', usage: { input: 1, output: 1, cached: 1 } },
    { ...base, requestId: 'b', cacheHit: true, usage: { input: 30, output: 10, cached: 10 }, charge: { currency: 'USD', micros: 20_000 } },
    { ...base, requestId: 'c', httpStatus: 503, usage: { input: 100, output: 100, cached: 100 } },
  ];
  const options = { records, models: [{ id: 'm', type: 'text' }], now, range: usagePeriod('yesterday', now) };
  const { summary } = tenantUsageReport({ ...options, filters: { ...initialFilters, userId: UNASSIGNED } });
  assert.equal(summary.requests, 3);
  assert.equal(summary.tokens, 140);
  assert.equal(summary.unknownInput, 30);
  assert.equal(usageCacheRate(summary), 50);
  assert.equal(usageMoney(summary, 'CNY'), 0);
  assert.equal(usageMoney(summary, 'CNY', 'savings'), 0.005);
  assert.equal(usageMoney(summary, 'USD'), 0.02);
  assert.equal(usageMoney(summary, 'EUR'), null);
  assert.equal(usageSuccessRate(summary), 2 / 3 * 100);
  const empty = tenantUsageReport({ ...options, filters: { ...initialFilters, userId: 'obsolete' } });
  assert.equal(empty.summary.requests, 0);
  assert.equal(empty.summary.tokens, null);
});

test('the measured field drives trend buckets, ranking and CSV for mixed meters', () => {
  const base = { createdAt: '2026-11-09T12:21:33+08:00', httpStatus: 200 };
  const models = [
    { id: 'image', type: 'image', modelId: 'image-gen' },
    { id: 'video', type: 'video', modelId: 'video-gen' },
    { id: 'token-video', type: 'video', modelId: 'token-video', usageUnit: '百万 Token' },
    { id: 'asr', type: 'audio', modelId: 'asr', usageUnit: '分钟' },
    { id: 'tts', type: 'audio', modelId: 'tts', usageUnit: '字符' },
    { id: 'vector', type: 'embedding', modelId: 'vector' },
    { id: 'rank', type: 'rerank', modelId: 'rank' },
  ];
  const records = [
    { id: 'i', modelId: 'image', usage: { images: 3, input: 70, output: 20, cached: 10 } },
    { id: 'v', modelId: 'video', usage: { seconds: 8, input: 50, output: 10 } },
    { id: 'v-unconfirmed', modelId: 'video', usage: { seconds: 60 }, usageConfirmed: false },
    { id: 'vt', modelId: 'token-video', publicModelId: 'video', usage: { input: 12, output: 4 } },
    { id: 'a', modelId: 'asr', usage: { seconds: 75 }, durationMs: 200 },
    { id: 's', modelId: 'tts', usage: { characters: 320, seconds: 5, input: 111 } },
    { id: 'e', modelId: 'vector', usage: { input: 123, output: 200, cached: 8 } },
    { id: 'r', modelId: 'rank', usage: { input: 50, output: 999 } },
  ].map(row => ({ ...base, ...row }));
  const range = usagePeriod('yesterday', now);
  const filters = { ...initialFilters, category: '视觉模型' };
  const report = tenantUsageReport({ records, models, filters, range, now });
  assert.equal(report.summary.requests, 4);
  assert.equal(report.summary.tokens, 16);
  assert.equal(report.peakTpm, 16);
  assert.equal(report.summary.cacheHit, null);
  for (const [metric, expected, id] of [['images', 3, 'image'], ['videoSeconds', 8, 'video'], ['tokens', 16, 'token-video']]) {
    const bucket = report.buckets.find(item => item.totals.requests);
    assert.equal(usageMetricValue(report.summary, metric), expected);
    assert.equal(usageMetricValue(bucket.models.get(id), metric), expected);
    assert.deepEqual(usageRanking(report, 'modelId', metric).map(row => [row.id, row.amount, row.share]), [[id, expected, 100]]);
  }
  const selected = tenantUsageReport({ records, models, filters: { ...filters, modelIds: ['video'] }, range, now });
  assert.equal(selected.summary.requests, 2);
  assert.equal(selected.summary.tokens, null);
  const csv = usageReportCSV(report, { filters, range, now, demo: true, models });
  assert.match(csv, /"生成图片数（张）","视频生成时长（秒）"/);
  assert.doesNotMatch(csv, /识别音频时长|合成字符数/);
  const audio = tenantUsageReport({ records, models, filters: { ...filters, category: '语音模型' }, range, now });
  assert.equal(usageMetricValue(audio.summary, 'audio'), 75);
  assert.equal(usageMetricValue(audio.summary, 'characters'), 320);
  assert.equal(audio.summary.tokens, null);
  for (const [category, tokens] of [['向量模型', 123], ['排序模型', 50]]) {
    const { summary } = tenantUsageReport({ records, models, filters: { ...filters, category }, range, now });
    assert.equal(summary.input, tokens);
    assert.equal(summary.tokens, tokens);
    assert.equal(summary.output, null);
    assert.equal(summary.cacheHit, null);
  }
});

test('overview reconciles the category reports and ranks each native meter separately', () => {
  const source = tenantUsageDemo(now);
  const range = usagePeriod('7d', now);
  const filters = { ...initialFilters, category: USAGE_OVERVIEW, modelIds: ['demo-image'] };
  const reports = usageModelGroups.map(({ id }) => tenantUsageReport({
    ...source, filters: { ...initialFilters, category: id }, range, now,
  }));
  const overview = tenantUsageReport({ ...source, filters, range, now });
  const { summary } = overview;
  const sumCategories = value => reports.reduce((sum, report) => sum + (value(report.summary) ?? 0), 0);
  for (const field of ['requests', 'success', 'finished', 'tokens']) {
    assert.equal(summary[field], sumCategories(group => group[field]));
  }
  assert.equal(summary.fees.get('CNY'), sumCategories(group => group.fees.get('CNY')));
  assert.equal(summary.tokens, summary.uncached + summary.cached + summary.unknownInput + summary.output);
  assert.equal(summary.cacheHit, sumCategories(group => group.cacheHit));
  assert.equal(summary.cacheInput, sumCategories(group => group.cacheInput));
  assert.ok(summary.cacheInput < summary.input);
  assert.equal(usageCacheRate(summary), summary.cacheHit / summary.cacheInput * 100);
  assert.equal(usageRanking(overview, 'modelId', 'requests')[0].id, 'demo-deepseek');
  for (const [metric, modelId] of [['images', 'demo-image'], ['videoSeconds', 'demo-video'], ['audio', 'demo-asr']]) {
    const rows = usageRanking(overview, 'modelId', metric);
    assert.deepEqual(rows.map(row => [row.id, row.amount, row.share]), [[modelId, sumCategories(group => group.units.get(metric)), 100]]);
  }

  const scoped = { ...filters, projectId: 'demo-studio', keyId: 'demo-studio-api', userId: 'demo-user-chen' };
  const narrowed = tenantUsageReport({ ...source, filters: scoped, range, now });
  const visual = tenantUsageReport({ ...source, filters: { ...scoped, category: '视觉模型', modelIds: ['demo-video'] }, range, now });
  assert.equal(narrowed.summary.units.get('videoSeconds'), visual.summary.units.get('videoSeconds'));
  assert.ok(narrowed.summary.requests > visual.summary.requests);
  assert.equal(narrowed.summary.units.has('images'), false);

  const records = [...source.records, {
    id: 'unclassified', modelId: 'old-model', publicModelId: 'older-service',
    httpStatus: 200, usage: { seconds: 60 }, createdAt: '2026-11-09T12:21:33+08:00',
  }];
  const withUnclassified = tenantUsageReport({ ...source, records, filters, range, now });
  assert.equal(withUnclassified.summary.requests, summary.requests + 1);
  assert.deepEqual(withUnclassified.summary.units, summary.units);
  const models = usageModelsInScope(source.models, records, USAGE_OVERVIEW);
  const csv = usageReportCSV(withUnclassified, { filters, range, now, demo: true, models });
  assert.match(csv, /"语言模型","deepseek-v3"/);
  assert.match(csv, /"视觉模型","video-gen"/);
  assert.match(csv, /"语音模型","asr-demo"/);
  assert.match(csv, /"未归类","older-service"/);
});

test('annual activity uses Beijing days and all billing modes, independent of the detail window', () => {
  const models = [{ id: 'text', type: 'text' }, { id: 'audio', type: 'audio' }];
  const records = [
    { id: 'too-old', modelId: 'text', httpStatus: 200, usage: { input: 100, output: 0 }, createdAt: '2025-11-10T15:59:59Z' },
    { id: 'first', modelId: 'text', httpStatus: 200, usage: { input: 4, output: 1 }, createdAt: '2025-11-10T16:00:00Z' },
    { id: 'sunday', modelId: 'text', httpStatus: 200, usage: { input: 100, output: 50 }, createdAt: '2026-11-08T15:55:00Z' },
    { id: 'monday', modelId: 'audio', httpStatus: 200, usage: { seconds: 30 }, createdAt: '2026-11-08T16:10:00Z' },
    { id: 'tuesday', modelId: 'text', httpStatus: 200, usage: { input: 15, output: 5 }, createdAt: '2026-11-10T07:20:00Z', updatedAt: '2026-11-10T07:22:00Z' },
    { id: 'old-tuesday', requestId: 'tuesday', modelId: 'text', billingType: 'Token Plan', httpStatus: 200, usage: { input: 90, output: 10 }, createdAt: '2026-11-10T07:20:00Z' },
    { id: 'plan', modelId: 'text', billingType: 'Token Plan', httpStatus: 200, usage: { input: 25, output: 5 }, createdAt: '2026-11-10T08:20:00Z' },
    { id: 'after-snapshot', modelId: 'text', httpStatus: 200, usage: { input: 80, output: 20 }, createdAt: '2026-11-10T09:45:00Z' },
  ];
  const { range, daily, weekly, cumulative } = tenantUsageActivity({ records, models, now });
  assert.deepEqual(range, { start: '2025-11-11', end: '2026-11-10' });
  assert.equal(daily.length, 365);
  assert.equal(weekly.length, 53);
  assert.deepEqual(weekly[0], { time: Date.parse('2025-11-11T00:00:00+08:00'), end: Date.parse('2025-11-16T00:00:00+08:00'), value: 5 });
  assert.deepEqual(daily.slice(-4).map(day => day.value), [0, 150, null, 50]);
  assert.deepEqual(weekly.slice(-2).map(week => week.value), [150, 50]);
  assert.deepEqual(cumulative.slice(-4).map(day => day.value), [5, 155, null, 205]);
  assert.equal(weekly.at(-1).end, Date.parse('2026-11-10T00:00:00+08:00'));

  const midnight = new Date('2026-11-10T00:00:00+08:00');
  const atMidnight = tenantUsageActivity({ records, models, now: midnight });
  assert.equal(atMidnight.daily.length, 365);
  assert.deepEqual(atMidnight.daily.at(-1), { time: +midnight, end: +midnight, value: 0 });
  const detail = tenantUsageReport({ records, models, now, range,
    filters: { ...initialFilters, category: USAGE_OVERVIEW } });
  assert.equal(detail.days, 0);
});

test('subscribed model share and hourly trends use the same Top 5 and other models', () => {
  const modelIds = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  const models = modelIds.map(id => ({ id, type: 'text' }));
  const records = [90, 80, 60, 50, 20, 10, 1000].map((input, i) => ({
    id: modelIds[i], modelId: modelIds[i], httpStatus: 200, usage: { input, output: 0 },
    createdAt: '2026-11-09T12:05:00+08:00',
  }));
  records.push(
    { ...records[0], id: 'second', createdAt: '2026-11-09T12:45:00+08:00', usage: { input: 10, output: 0 } },
    { ...records[0], id: 'failed', createdAt: '2026-11-09T13:05:00+08:00', httpStatus: 503 },
  );
  const report = tenantUsageReport({ records, models, now, range: usagePeriod('yesterday', now),
    filters: { ...initialFilters, category: USAGE_OVERVIEW } });
  const { groups, times } = usageSubscribedTrends(report, [...modelIds.slice(0, -1), 'never-called']);
  assert.deepEqual(groups.map(({ id, value }) => [id, value]), [['a', 100], ['b', 80], ['c', 60], ['d', 50], ['e', 20], [null, 10]]);
  assert.equal(times.length, 24);
  assert.equal(times[12], Date.parse('2026-11-09T12:00:00+08:00'));
  assert.deepEqual(groups[0].values.slice(11, 15), [0, 100, null, 0]);
  assert.deepEqual(groups.map(group => group.values[12]), groups.map(group => group.value));
});
