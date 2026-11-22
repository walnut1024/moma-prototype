import test from 'node:test';
import assert from 'node:assert/strict';
import { packageOrdersThrough, summarizePackageOrders } from '../src/admin-v2/package-order-report.js';

const range = { start: '2026-11-02', end: '2026-11-08' };

test('package data uses actual order dates and expiry through the Beijing reporting date', () => {
  const orders = [
    { id: 'earlier-order', packageId: 'a', createdAt: '2026-11-01T13:00:00Z', expiresAt: '2026-11-04T16:00:00Z' },
    { id: 'in-range', packageId: 'a', createdAt: '2026-11-01T16:00:00Z', expiresAt: '2026-11-08T16:00:00Z' },
    { id: 'another-package', packageId: 'b', createdAt: '2026-11-05T13:00:00Z' },
    { id: 'future-order', packageId: 'a', createdAt: '2026-11-08T16:00:00Z' },
    { id: 'unknown-date', packageId: 'a' },
  ];
  const before = structuredClone(orders);
  const facts = packageOrdersThrough(orders, range.end);
  assert.deepEqual(facts.map(row => row.id), ['earlier-order', 'in-range', 'another-package']);
  const rows = facts.filter(row => row.packageId === 'a');
  assert.equal(rows[1].day, range.start);
  assert.equal(rows[1].expires, '2026-11-09');
  assert.deepEqual(summarizePackageOrders(rows, range, range.end),
    { quantity: 1, expiredThroughEnd: 1, averageConsumptionRate: null });
  assert.deepEqual(orders, before);
});

test('package data includes measured zero use and leaves historical and missing usage unknown', () => {
  const rows = [
    { day: range.start, entitlement: 100, used: 0 },
    { day: range.start, entitlement: 100, used: 50 },
    { day: range.start, entitlement: 100 },
    { day: range.start, entitlement: 0, used: 0 },
  ];
  assert.equal(summarizePackageOrders(rows, range, range.end).averageConsumptionRate, 0.25);
  assert.equal(summarizePackageOrders(rows, range, '2026-11-09').averageConsumptionRate, null);
  assert.equal(summarizePackageOrders([], range, range.end).averageConsumptionRate, null);
});
