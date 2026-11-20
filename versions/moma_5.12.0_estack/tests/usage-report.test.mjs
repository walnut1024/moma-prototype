import { test } from 'node:test';
import assert from 'node:assert/strict';
import { usageFacts } from '../src/admin-v2/usage-analysis.js';
import { usageDistributions } from '../src/admin-v2/usage-distributions.js';
import { usageChange, usageReport } from '../src/admin-v2/usage-report.js';

test('selected, seven-day and monthly usage use the same request facts and distinct reporting windows', () => {
  const now = Date.parse('2026-11-10T10:30:00+08:00');
  const range = { start: '2026-11-09', end: '2026-11-09' };
  const filters = { types: null, tenant: null, model: null };
  const row = (id, date, modelId, input, extra) => ({ id, modelId, httpStatus: 200, usage: { input, output: 0 },
    createdAt: `2026-11-${date}T08:00:00+08:00`, ...extra });
  const state = {
    models: ['jiutian-test', 'qwen-test', 'other'].map(id => ({ id, modelId: id, type: 'text' })),
    endpoints: [], providers: [],
    requests: [
      row('month-only', '02', 'jiutian-test', 9),
      row('prior', '08', 'qwen-test', 9),
      row('paid', '09', 'qwen-test', 9, { charge: { micros: 1, currency: 'CNY' }, usageScene: 'marketplace' }),
      row('free', '09', 'other', 9, { usageBillingClass: 'free', usageScene: 'dedicated' }),
      row('internal', '09', 'other', 9, { settlement: 'internal', usageScene: 'marketplace' }),
      row('zero-charge', '09', 'other', 0, { charge: { micros: 0, currency: 'CNY' } }),
      row('incomplete', '09', 'other', 9, { usage: { input: 9 }, usageBillingClass: 'paid' }),
      row('today', '10', 'other', 500),
    ],
  };
  const facts = usageFacts(state, range, filters, now);
  const report = usageReport(state, range, facts, filters, now);
  assert.equal(report.selected.tokens, 27);
  assert.equal(report.selected.calls, 5);
  assert.equal(report.selected.pending, 1);
  assert.deepEqual(report.selected.buckets.paid, { tokens: 9, calls: 2 });
  assert.deepEqual(report.selected.buckets.free, { tokens: 9, calls: 1 });
  assert.deepEqual(report.selected.buckets.pending, { tokens: 9, calls: 2 });
  assert.deepEqual(report.selected.buckets.internal, { tokens: 9, calls: 1 });
  assert.equal(report.selected.buckets.marketplace.tokens, 9);
  assert.equal(usageChange(report.selected.tokens, report.prior.tokens), '+200.00%');
  assert.equal(usageChange(10, 0), '—');
  assert.equal(report.weekStart, '2026-11-03');
  assert.equal(report.week.tokens, 36);
  assert.equal(report.daily.length, 30);
  assert.equal(report.daily.at(-1).tokens, 27);
  assert.deepEqual(report.month, { total: 5, jiutian: 1, qwen: 2, other: 2 });
  assert.deepEqual(report.weeks.map(week => [week.start, week.end]), [
    ['2026-11-01', '2026-11-07'], ['2026-11-08', '2026-11-09'],
  ]);
  assert.equal(report.models.total, report.selected.tokens);
  assert.equal(report.providers.total, report.selected.tokens);
});

test('customer tiers use cumulative Token thresholds and recorded bands count each request once', () => {
  const values = [1e10, 5e9, 3e9, 1e9, 1e9 - 1, 0];
  const rows = values.map((total, index) => ({
    tenantId: index, unit: 'Token', value: { total, complete: true }, usagePriceBand: '0–32K',
  })).map(row => ({ ...row, tenantId: String(row.tenantId) }));
  rows.push({ tenantId: 'no-token', unit: '秒', usagePriceBand: '1080P' });
  rows.push({ tenantId: 'pending', unit: 'Token', value: { total: 1e10, complete: false } });
  rows.push({ tenantId: 'other-band', unit: '秒', usagePriceBand: '640P' });
  const data = usageDistributions(rows);
  assert.equal(data.tokenCustomerCount, 6);
  assert.deepEqual(data.tokenCustomers.map(row => row.value), [1, 1, 1, 1, 2]);
  assert.equal(data.billingBands.length, 22);
  assert.deepEqual(data.billingBands.find(row => row.label === '0-32K'), { label: '0-32K', value: 6 });
  assert.deepEqual(data.billingBands.find(row => row.label === '1080P'), { label: '1080P', value: 1 });
  assert.deepEqual(data.billingBands.at(-1), { label: '其他', value: 2 });
  assert.equal(data.missingBillingBands, 1);
  assert.equal(data.billingBands.reduce((sum, row) => sum + row.value, 0), rows.length);
});
