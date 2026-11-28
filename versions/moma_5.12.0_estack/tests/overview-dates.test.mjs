import test from 'node:test';
import assert from 'node:assert/strict';
import { overviewCustomers, overviewMetrics, overviewRange, overviewRanks, overviewSummary, overviewTimeline } from '../src/admin-v2/overview.js';

const time = value => Date.parse(value + '+08:00');
const now = time('2026-11-18T10:30:00');
const call = (id, at, usage = { input: 10, output: 2 }, extra = {}) => ({
  id, requestId: id, modelId: 'model-a', tenantId: 'enterprise', endpointId: 'self',
  createdAt: new Date(time(at)).toISOString(), httpStatus: 200, usage, ...extra,
});
const state = requests => ({
  requests,
  models: [{ id: 'model-a', type: 'text', name: '模型 A' }, { id: 'image-model', type: 'image' }],
  tenants: [
    { id: 'enterprise', name: '企业 A', type: '企业', createdAt: '2026-10-01T00:00:00+08:00' },
    { id: 'personal', name: '个人 A', type: '个人', createdAt: '2026-11-16T00:00:00+08:00' },
    { id: 'dormant', type: '政府', createdAt: '2026-10-01T00:00:00+08:00' },
    { id: 'dormant-at-cutoff', type: '政府', createdAt: '2026-10-19T00:00:00+08:00' },
  ],
  endpoints: [{ id: 'self', providerId: 'first' }, { id: 'external', providerId: 'second' }],
  providers: [{ id: 'first', sourceType: 'selfHosted' }, { id: 'second', sourceType: 'thirdParty' }],
});

test('today comparisons use the same elapsed time in Beijing and classify terminal outcomes', () => {
  const latest = call('revised', '2026-11-18T08:15:00', { input: 30, output: 2 });
  const data = overviewTimeline(state([
    call('revised', '2026-11-18T08:15:00', { input: 99, output: 99 }),
    { ...latest, updatedAt: '2026-11-18T00:30:00Z' },
    call('pending', '2026-11-18T08:00:00', {}, { finalStatus: 'pending' }),
    call('failed', '2026-11-18T07:00:00', { input: 8, output: 3 }, { isTimeout: true, usageConfirmed: false }),
    call('not-yet', '2026-11-18T11:00:00'),
    call('yesterday', '2026-11-17T09:00:00'),
    call('yesterday-late', '2026-11-17T11:00:00'),
  ]), now);
  assert.equal(data.today.calls, 3);
  assert.equal(data.today.total, 32);
  assert.equal(data.today.pending, 2);
  assert.equal(data.today.successRate, 50);
  assert.equal(data.yesterday.calls, 1);
  assert.equal(data.yesterday.successRate, 100);
  assert.equal(overviewMetrics(data)[2].change, -50);
  assert.equal(overviewMetrics(data)[2].changeUnit, '个百分点');
});

test('monthly customer counts, day-average tiers and history use the same bounded facts', () => {
  const workspace = state([
    call('day-1', '2026-11-17T08:00:00', { input: 3e9, output: 0 }),
    call('earlier-in-month', '2026-11-01T08:00:00', {}, { tenantId: 'personal', endpointId: 'external' }),
    call('non-token', '2026-11-16T08:00:00', { images: 7 }, { tenantId: 'old-partner', modelId: 'image-model' }),
    call('unattributed', '2026-11-16T08:00:00', { input: 40, output: 2 }, { tenantId: undefined }),
    call('late-in-prior-month', '2026-10-18T08:00:00', undefined, { tenantId: 'dormant' }),
    call('prior-month', '2026-10-17T08:00:00'),
  ]);
  const timeline = overviewTimeline(workspace, now);
  const yesterday = overviewCustomers(timeline, null);
  const month = overviewCustomers(timeline, '2026-11');
  assert.equal(yesterday.count, 1);
  assert.equal(month.count, 3);
  assert.equal(month.previous, 1);
  assert.equal(month.previousEnd, time('2026-10-18T00:00:00'));
  assert.equal(month.previousLabel, '上月同期');
  assert.equal(month.added, 1);
  assert.equal(month.recent7, 2);
  assert.equal(month.dormant, 2);
  assert.deepEqual(month.types.map(row => row.value), [1, 1, 1]);
  assert.deepEqual(timeline.months.at(-1).customers, [1, 1, 1]);
  assert.equal(month.tiers.find(row => row.label === '1–10 亿').value, 1);
  assert.equal(month.tiers.find(row => row.label === 'Token 未确认').value, 1);
  assert.equal(month.tiers.find(row => row.label === '无 Token 类调用').value, 1);
  assert.deepEqual(overviewRanks(month.rows, 'customer', workspace, 'total').map(row => row.id),
    ['enterprise', 'old-partner', 'personal']);
});

test('workday rollups reconcile supply, peak and daily values and show pending-only days as unknown', () => {
  const data = overviewTimeline(state([
    call('workday', '2026-11-13T08:00:00', { input: 10, output: 0 }),
    call('weekend', '2026-11-14T08:00:00', { input: 100, output: 0 }),
    call('pending', '2026-11-17T08:00:00', {}, { endpointId: 'external' }),
    call('external', '2026-11-16T08:00:00', { input: 20, output: 0 }, { endpointId: 'external' }),
    call('source-missing', '2026-11-16T09:00:00', { input: 3, output: 0 }, { endpointId: null }),
  ]), now);
  assert.equal(data.averages[0].value, 33 / 5);
  assert.equal(data.daily.find(row => row.date === '2026-11-14').total, 100);
  assert.equal(data.daily.at(-1).total, null);
  assert.equal(data.mean, 133 / 29);
  assert.deepEqual(data.months.at(-1).supply, [10, 20, 3]);
  assert.equal(data.months.at(-1).peak, 23);
});

test('first day of the year can show the previous December', () => {
  const data = overviewTimeline(state([]), time('2027-01-01T00:00:00'));
  assert.equal(data.months.at(-1).id, '2026-12');
  assert.equal(data.today.calls, 0);
  assert.equal(data.today.successRate, null);
  assert.equal(overviewMetrics(data)[1].change, null);
});

test('the 610 overview keeps snapshot metrics fixed and recomputes trends and rankings from bounded facts', () => {
  const workspace = state([
    call('prior-late', '2026-11-17T11:00:00', { input: 50, output: 0 }),
    call('prior', '2026-11-17T08:00:00', { input: 20, output: 0 }, { charge: { micros: 800000, currency: 'USD' } }),
    call('current', '2026-11-18T08:00:00', { input: 50, output: 0 }, { charge: { micros: 5000000, currency: 'CNY' } }),
    { ...call('current', '2026-11-18T08:00:00', { input: 30, output: 0 }, { charge: { micros: 1500000, currency: 'CNY' } }),
      updatedAt: '2026-11-18T00:30:00Z' },
    call('same-hour', '2026-11-18T08:30:00', { input: 10, output: 0 }, { endpointId: 'external', settlement: 'internal',
      charge: { micros: 2000000, currency: 'CNY' } }),
    call('pending', '2026-11-18T09:00:00', {}),
    call('future', '2026-11-18T11:00:00', { input: 50, output: 0 }),
  ]);
  workspace.models[0].listingStatus = '已上架';
  workspace.models[0].firstPublishedAt = '2026-11-02T00:00:00+08:00';
  workspace.users = [
    { id: 'registered', createdAt: '2026-10-01T00:00:00+08:00', realNameCertification: { status: '已认证' } },
    { id: 'pending', createdAt: '2026-11-16T00:00:00+08:00', realNameCertification: { status: '审核中' } },
  ];
  workspace.identityEvents = [{ type: 'login', userId: 'registered', at: '2026-11-01T01:00:00+08:00' },
    { type: 'login', userId: 'registered', at: '2026-11-18T01:00:00+08:00' }];
  workspace.apiKeys = [];
  const today = overviewSummary(workspace, overviewRange('today', now), now);
  const week = overviewSummary(workspace, overviewRange('7d', now), now);
  assert.equal(today.registered, 2);
  assert.equal(today.certified, 1);
  assert.equal(today.mau, 1);
  assert.equal(today.listed, 1);
  assert.equal(today.firstListings, 1);
  assert.deepEqual(today.spend, [{ currency: 'USD', value: 0.8 }, { currency: 'CNY', value: 1.5 }]);
  assert.equal(today.peak, 40);
  assert.equal(week.peak, today.peak);
  assert.equal(week.monthTokens.total, 110);
  assert.equal(week.monthTokens.total, today.monthTokens.total);
  assert.equal(today.trend.length, 11);
  assert.equal(today.trend[9].tokens, null);
  assert.equal(week.trend.length, 7);
  assert.equal(week.trend.at(-1).label, '2026-11-18');
  assert.equal(today.customers[0].change, 100);
  assert.equal(today.models[0].calls, 3);
  assert.equal(week.models[0].total, 110);
});
