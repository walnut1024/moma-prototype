import test from 'node:test';
import assert from 'node:assert/strict';
import { packageClaimDemo } from '../src/admin-v2/package-claim-demo.js';
import { packageReport } from '../src/admin-v2/package-order-report.js';

const now = Date.parse('2026-11-08T20:50:00+08:00');

test('package report uses Beijing acquisition dates, excludes future facts and counts distinct account types', () => {
  const range = { start: '2026-11-07', end: '2026-11-08' };
  const orders = [
    { id: 'prior-active', packageId: 'a', createdAt: '2026-11-06T15:59:59Z', expiresAt: '2026-12-07T00:00:00Z' },
    { id: 'first', packageId: 'a', createdAt: '2026-11-06T16:00:00Z', accountType: 'individual', userId: 'one', entitlement: 100, used: 0, amount: 0 },
    { id: 'repeat', packageId: 'a', createdAt: '2026-11-07T16:00:00Z', accountType: 'individual', userId: 'one', entitlement: 200, used: 150 },
    { id: 'expires', packageId: 'b', createdAt: '2026-11-08T10:00:00Z', expiresAt: '2026-11-08T12:00:00Z',
      accountType: 'enterprise', userId: 'employee-a', tenantId: 'team-a', entitlement: 400, used: 200, status: '生效中' },
    { id: 'last', packageId: 'b', createdAt: '2026-11-08T12:50:00Z',
      accountType: 'enterprise', userId: 'employee-b', tenantId: 'team-a', entitlement: 300, used: 300, status: '生效中' },
    { id: 'future', createdAt: '2026-11-08T12:51:00Z' },
    { id: 'unknown-date' },
  ];
  const before = structuredClone(orders);
  const report = packageReport(orders, [{ id: 'a', name: '个人试用' }, { id: 'b', name: '团队试用' }], range, now);
  assert.deepEqual(report.rows.map(row => row.id), ['last', 'expires', 'repeat', 'first']);
  assert.deepEqual(report.rows.map(row => [row.used, row.remaining, row.status]), [
    [300, 0, '已用完'], [200, 0, '已过期'], [150, 50, undefined], [0, 100, undefined],
  ]);
  assert.deepEqual(report.trend, [{ label: '11-07', individual: 1, enterprise: 0 }, { label: '11-08', individual: 1, enterprise: 2 }]);
  assert.deepEqual(report.distribution, [{ label: '个人试用', value: 2 }, { label: '团队试用', value: 2 }]);
  assert.deepEqual(report.totals, { individual: 2, enterprise: 2, individualAccounts: 1, enterpriseAccounts: 1, tokens: 1000, cost: null });
  assert(report.rows.every(row => row.usage === null));
  assert.deepEqual(orders, before);
});

test('single-day report uses hourly labels and leaves historical and missing measurements unknown', () => {
  const orders = [{ id: 'older', createdAt: '2026-11-06T23:59:00Z', entitlement: 100, used: 42, cost: 2.3, usage: [], accountType: 'individual' }];
  const range = { start: '2026-11-07', end: '2026-11-07' };
  const history = packageReport(orders, [], range, now);
  assert.equal(history.trend.length, 24);
  assert.deepEqual(history.trend[7], { label: '11-07 07:00', individual: 1, enterprise: 0 });
  assert.deepEqual(history.trend[23], { label: '11-07 23:00', individual: 0, enterprise: 0 });
  assert.deepEqual(history.rows.map(row => [row.used, row.remaining, row.cost, row.usage]), [[null, null, null, null]]);
  assert.deepEqual(history.totals, { individual: 1, enterprise: 0, individualAccounts: 0, enterpriseAccounts: 0, tokens: 100, cost: null });

  const today = { start: '2026-11-08', end: '2026-11-08' };
  const incomplete = packageReport([{ createdAt: '2026-11-08T00:00:00Z', used: 0, cost: 0 }], [], today, now);
  assert.equal(incomplete.trend.length, 21);
  assert.equal(incomplete.trend.at(-1).label, '11-08 20:00');
  assert.equal(incomplete.totals.tokens, null);
  assert.equal(incomplete.totals.cost, 0);
  assert.equal(incomplete.rows[0].remaining, null);
  assert.deepEqual(packageReport([], [], today, now).totals,
    { individual: 0, enterprise: 0, individualAccounts: 0, enterpriseAccounts: 0, tokens: 0, cost: 0 });
});

test('the isolated claim fixture covers each tier and adds up from model token usage and demo prices', () => {
  const { orders, prices } = packageClaimDemo(now);
  const today = packageReport(orders, [], { start: '2026-11-08', end: '2026-11-08' }, now);
  assert.deepEqual(today.distribution, [{ label: '个人版-Free', value: 4 }, { label: '团队版-Free', value: 8 }]);
  assert.equal(today.totals.individualAccounts, 4);
  assert.equal(today.totals.enterpriseAccounts, 8);
  assert.equal(today.totals.tokens, 4_400_000_000);
  assert(today.totals.cost > 0);
  const extended = packageReport(orders, [], { start: '2026-10-24', end: '2026-11-08' }, now);
  assert.deepEqual(new Set(extended.distribution.map(tier => tier.label)), new Set(['个人版-Free', '团队版-Free', 'OPC 0元卡']));
  assert.equal(new Set(orders.map(row => row.id)).size, orders.length);
  assert(orders.every(row => row.id.startsWith('demo-claim-') && row.used <= row.entitlement));
  for (const row of orders) {
    const tokens = row.usage.reduce((total, usage) => total + usage.inputTokens + usage.outputTokens, 0);
    const cost = row.usage.reduce((total, usage) => {
      const price = prices.find(item => item.model === usage.model && item.provider === usage.provider);
      return total + (usage.inputTokens * price.inputRate + usage.outputTokens * price.outputRate) / 1_000_000;
    }, 0);
    assert.equal(row.used, tokens);
    assert.equal(row.cost, cost);
  }
});
