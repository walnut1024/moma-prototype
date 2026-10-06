import { test } from 'node:test';
import assert from 'node:assert/strict';
import { overviewPeriods, overviewDemo, overviewChange, overviewRegistrations, overviewMonthlyActive, compactCount } from '../src/admin-v2/overview.js';
import { userDemo, userMetrics } from '../src/admin-v2/user-analysis.js';
const time = value => Date.parse(value + '+08:00');
const sum = (rows, key) => rows.reduce((n, r) => n + r[key], 0);
test('overview periods use Beijing calendar boundaries and equal elapsed comparison progress', () => {
  const periods = overviewPeriods(time('2026-09-23T16:40:00'));
  assert.equal(periods[0].previousEnd, time('2026-09-22T16:40:00'));
  assert.equal(periods[1].start, time('2026-09-17T00:00:00'));
  assert.equal(periods[1].previousEnd, time('2026-09-16T16:40:00'));
  assert.equal(periods[2].start, time('2026-08-25T00:00:00'));
  assert.equal(periods[2].previousStart, time('2026-07-26T00:00:00'));
  for (const p of periods) assert.equal(p.end - p.start, p.previousEnd - p.previousStart);
  assert.equal(overviewPeriods(time('2024-03-31T12:00:00'))[2].previousStart, time('2024-02-01T00:00:00'));
  assert.equal(overviewPeriods(time('2026-01-01T08:00:00'))[1].start, time('2025-12-26T00:00:00'));
});
test('all overview scopes reconcile summary, supply, chart, customer/model lists and details', () => {
  const now = time('2026-10-04T16:40:00');
  for (const id of ['day', 'week', 'month']) {
    const data = overviewDemo(now, id);
    assert.deepEqual(data, overviewDemo(now, id));
    for (const scope of [data, data.previous]) {
      assert.equal(scope.self + scope.partner, scope.total);
      for (const key of ['total', 'calls', 'successfulCalls', 'self', 'partner']) {
        for (const list of [scope.trend, scope.customers, scope.models, scope.pairs]) assert.equal(sum(list, key), scope[key]);
      }
      assert.equal(scope.activeCustomers, scope.customers.filter(row => row.successfulCalls > 0).length);
      assert.ok(scope.success > 95 && scope.success <= 100);
      for (const kind of ['customers', 'models']) {
        const rows = scope[kind];
        assert.equal(rows.slice(0, 10).length, 10);
        assert.ok(sum(rows.slice(0, 10), 'total') <= scope.total);
        rows.forEach((row, i) => { if (i) assert.ok(rows[i - 1].total >= row.total); });
      }
      for (const model of scope.models) {
        const pairs = scope.pairs.filter(p => p.modelId === model.id);
        assert.equal(sum(pairs, 'total'), model.total);
        assert.equal(model.customerCount, new Set(pairs.filter(p => p.successfulCalls > 0).map(p => p.customerId)).size);
      }
      for (const customer of scope.customers) assert.equal(sum(scope.pairs.filter(p => p.customerId === customer.id), 'total'), customer.total);
    }
    assert.equal(data.trend.length, id === 'day' ? 17 : id === 'week' ? 7 : 30);
    for (const row of data.customers) assert.equal(row.change, overviewChange(row.total, data.previous.customers.find(r => r.id === row.id)?.total || 0));
  }
  const day = overviewDemo(now, 'day'), month = overviewDemo(now, 'month');
  assert.equal(month.trend.at(-1).total, day.total);
  assert.equal(month.trend.at(-1).calls, day.calls);
});
test('empty midnight scope and zero comparison base remain explicit', () => {
  const data = overviewDemo(time('2026-10-04T00:00:00'));
  assert.equal(data.total, 0); assert.equal(data.calls, 0); assert.equal(data.activeCustomers, 0);
  assert.equal(data.success, null); assert.deepEqual(data.customers, []); assert.deepEqual(data.models, []);
  assert.equal(overviewChange(42, 0), null); assert.equal(overviewChange(0, 10), -100);
  assert.equal(compactCount(18600972), '1860.1万'); assert.equal(compactCount(100000000), '1亿');
});
test('registration stock deduplicates identity IDs and excludes records at or after the cutoff', () => {
  const end = time('2026-10-04T12:00:00');
  const users = [
    { id: 'enterprise', type: '企业', at: end - 86400000 },
    { id: 'enterprise', type: '企业', at: end - 86400000 },
    { id: 'personal', type: '个人', at: end - 1 },
    { id: 'at-cutoff', type: '个人', at: end },
    { id: 'future', type: '企业', at: end + 1 },
  ];
  assert.deepEqual(overviewRegistrations(users, end), { total: 2, enterprise: 1, personal: 1 });
  assert.deepEqual(overviewRegistrations([], end), { total: 0, enterprise: 0, personal: 0 });
});
test('overview user composition reconciles identity stock and user analysis for all periods', () => {
  const now = time('2026-10-04T16:40:00'), identities = userDemo(now);
  const userPage = userMetrics(identities, { start: '2026-10-04', end: '2026-10-04' }, now);
  for (const id of ['day', 'week', 'month']) {
    const data = overviewDemo(now, id);
    assert.equal(data.registrations.total, userPage.current.registered);
    assert.equal(data.monthlyActive.total, userPage.mau.at(-1));
    assert.deepEqual(data.monthlyActive, overviewDemo(now, 'day').monthlyActive);
    assert.notEqual(data.registrations.total, data.activeCustomers);
    assert.deepEqual(data.previous.registrations, overviewRegistrations(identities.users, data.period.previousEnd));
    for (const stock of [data.registrations, data.previous.registrations]) assert.equal(stock.total, stock.enterprise + stock.personal);
  }
  const midnight = overviewDemo(time('2026-10-04T00:00:00'));
  assert.equal(midnight.calls, 0);
  assert.ok(midnight.registrations.total > 0);
});
test('monthly activity counts login identities once within the Beijing natural month', () => {
  const end = time('2026-10-05T12:00:00');
  const identities = {
    users: [
      { id: 'enterprise', at: time('2026-09-01T00:00:00') },
      { id: 'personal', at: time('2026-10-03T00:00:00') },
      { id: 'no-login', at: time('2026-09-01T00:00:00') },
    ],
    logins: [
      { userId: 'enterprise', at: time('2026-09-30T23:59:59') },
      { userId: 'enterprise', at: time('2026-10-01T00:00:00') },
      { userId: 'enterprise', at: end - 1 },
      { userId: 'personal', at: time('2026-10-02T00:00:00') }, // Before registration.
      { userId: 'personal', at: time('2026-10-03T00:00:00') },
      { userId: 'missing', at: end - 1 },
      { userId: 'no-login', at: end }, // Exclusive cutoff.
      { userId: 'enterprise', at: time('2026-09-03T00:00:00') },
    ],
  };
  const activity = overviewMonthlyActive(identities, end);
  assert.equal(activity.total, 2);
  assert.equal(activity.previousTotal, 1);
  assert.equal(activity.start, time('2026-10-01T00:00:00'));
  assert.equal(activity.previousStart, time('2026-09-01T00:00:00'));
  assert.equal(activity.previousEnd, time('2026-09-05T12:00:00'));
  assert.equal(overviewMonthlyActive(identities, activity.start).total, 0);
  assert.equal(overviewMonthlyActive({ users: [], logins: [] }, end).total, 0);
});
test('monthly comparison handles year boundaries and shorter previous months', () => {
  const identities = { users: [], logins: [] };
  const january = overviewMonthlyActive(identities, time('2026-01-05T12:00:00'));
  assert.equal(january.previousStart, time('2025-12-01T00:00:00'));
  assert.equal(january.previousEnd, time('2025-12-05T12:00:00'));
  const leap = overviewMonthlyActive(identities, time('2024-03-31T12:00:00'));
  assert.equal(leap.previousStart, time('2024-02-01T00:00:00'));
  assert.equal(leap.previousEnd, time('2024-03-01T00:00:00'));
  const february = overviewMonthlyActive(identities, time('2026-03-31T12:00:00'));
  assert.equal(february.previousEnd, time('2026-03-01T00:00:00'));
});
