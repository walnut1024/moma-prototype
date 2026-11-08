import assert from 'node:assert/strict';
import test from 'node:test';
import { PACKAGE_DEMO_RECORDS, filterPackageDemo, packageDemoSummary, packageDemoWindow } from '../src/admin-v2/package-data-demo.js';
import { operationsPeriod } from '../src/admin-v2/usage-analysis.js';

const month = { start: '2026-10-01', end: '2026-10-31' };
const firstHalf = { start: month.start, end: '2026-10-15' };
const secondHalf = { start: '2026-10-16', end: month.end };
const [personal, team, general, shortTerm] = PACKAGE_DEMO_RECORDS;

test('the same buyer is counted once across packages while purchases and deductions reconcile to the detail rows', () => {
  const reports = [general, shortTerm].map(record => filterPackageDemo(record, month, 'individual'));
  const summary = packageDemoSummary(reports);
  assert.equal(summary.buyers, 1);
  assert.equal(summary.orderCount, 3);
  assert.equal(summary.quantity, 4);
  assert.equal(summary.netPaid, 18200);
  assert.equal(summary.tokens, 450000);
  assert.equal(summary.deducted, 280000);
  assert.equal(summary.expired, 1);
});

test('demo dates align with the operations time presets across a Beijing day boundary', () => {
  const now = Date.parse('2026-11-07T17:30:00Z');
  const { range } = operationsPeriod('yesterday', undefined, now);
  const today = operationsPeriod('today', undefined, now).range.end;
  const sample = packageDemoWindow(today);
  assert.equal(sample.end, '2026-11-08');
  assert.equal(range.end, '2026-11-07');
  const reports = sample.records.map(record => filterPackageDemo(record, range, 'all'));
  assert.equal(packageDemoSummary(reports).orderCount, 2);
  assert(reports.flatMap(report => report.orders).every(order => order.day === range.end));
  assert(sample.start <= operationsPeriod('30d', undefined, now).range.start);
});

test('period filters keep earlier purchases in ending balance and exclude prepaid entitlements that have not started', () => {
  const first = packageDemoSummary([filterPackageDemo(personal, firstHalf, 'all')]);
  const second = packageDemoSummary([filterPackageDemo(personal, secondHalf, 'all')]);
  assert.equal(first.remaining, 9700000);
  assert.equal(second.remaining, 8200000);
  assert.equal(second.expiring, 1);
  assert.equal(second.quantity, 1);
  assert.equal(second.netPaid, 2700);
  assert.equal(second.income, 1500);
  assert.equal(second.profit, 1080);
});

test('pending costs block gross profit', () => {
  const report = filterPackageDemo(team, month, 'enterprise');
  const summary = packageDemoSummary([report]);
  assert.equal(summary.cost, 180);
  assert.equal(summary.pending, 1);
  assert.equal(summary.profit, null);
  assert.equal(summary.margin, null);
  const used = report.entitlements.find(row => row.id === 'SUB-201-01');
  assert.equal(used.cost, null);
  assert.equal(report.entitlements.find(row => row.id === 'SUB-201-02').cost, 0);
  const known = packageDemoSummary([filterPackageDemo(shortTerm, month, 'all')]);
  assert.equal(known.remaining, 0);
  assert.equal(known.profit, -210);
});

test('a two-copy order has separate entitlements and deduction belongs to the purchased copy that used it', () => {
  const report = filterPackageDemo(general, secondHalf);
  const copies = report.entitlements.filter(row => row.orderId === 'PACK-102');
  assert.deepEqual(copies.map(row => [row.id, row.quota, row.deducted, row.remaining, row.cost]), [
    ['PACK-102-02', 20000000, 40000, 19960000, 20],
    ['PACK-102-01', 20000000, 0, 20000000, 0],
  ]);
  assert.equal(report.orders.length, 1);
  const earlier = report.entitlements.find(row => row.orderId === 'PACK-101');
  assert.deepEqual([earlier.deducted, earlier.remaining, earlier.cost], [90000, 19910000, 60]);
  const renewal = filterPackageDemo(personal, secondHalf).entitlements.find(row => row.orderId === 'SUB-102');
  assert.equal(renewal.status, '待生效');
  const expired = filterPackageDemo(shortTerm, month).entitlements.find(row => row.orderId === 'PACK-201');
  assert.deepEqual([expired.status, expired.remaining], ['已到期', 0]);
});

test('overview counts sold copies in the range and all expirations through the end date', () => {
  const lastDay = { start: month.end, end: month.end };
  const resourcePack = packageDemoSummary([filterPackageDemo(general, lastDay)]);
  assert.equal(resourcePack.quantity, 2);
  const expiredPack = packageDemoSummary([filterPackageDemo(shortTerm, lastDay)]);
  assert.equal(expiredPack.quantity, 0);
  assert.equal(expiredPack.expiredThroughEnd, 2);
  assert.equal(expiredPack.averageConsumptionRate, null);
});

test('overview averages the consumption of started entitlements and keeps expired unused quota out of deductions', () => {
  const report = record => packageDemoSummary([filterPackageDemo(record, month)]);
  assert.equal(report(personal).averageConsumptionRate, 0.18);
  assert.equal(report(shortTerm).averageConsumptionRate, 0.375);
});
