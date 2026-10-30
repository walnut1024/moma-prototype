import { test } from 'node:test';
import assert from 'node:assert/strict';
import { usageShare, usageDistributions } from '../src/admin-v2/usage-distributions.js';
import { usageFacts } from '../src/admin-v2/usage-analysis.js';

const fact = (id, total = 1, extra = {}) => ({ tenantId: id, modelId: id, category: 'text', providerId: 'supplier', unit: 'Token', value: { input: total, output: 0, total, complete: true }, ...extra });

test('request shares count every unit, preserve unknown attribution and reconcile top five plus other', () => {
  const rows = Array.from({ length: 8 }, (_, i) => Array.from({ length: 9 - i }, () => fact(`m${i}`, 99, { unit: i % 2 ? '张' : 'Token' }))).flat();
  rows.push(fact(null, 999999));
  const share = usageShare(rows, 'modelId');
  assert.equal(share.total, rows.length);
  assert.equal(share.count, 8);
  assert.deepEqual(share.ranked[0], { id: 'm0', value: 9 });
  assert.deepEqual(share.slices.at(-2), { id: '__other__', value: 9 });
  assert.deepEqual(share.slices.at(-1), { id: '__unknown__', value: 1 });
  assert.equal(share.slices.reduce((sum, row) => sum + row.value, 0), share.total);
  assert.equal(share.pendingCalls, 0);
  assert.equal(usageShare(rows, 'category').total, share.total);
  assert.equal(usageShare(rows, 'providerId').slices.length, 1);
});

test('Token shares exclude other units and incomplete totals while accepting individually known input', () => {
  const rows = [
    fact('a', 20), fact('b', 10), fact(null, 5), fact('zero', 0),
    fact('image', 900, { unit: '张' }),
    fact('pending', 30, { value: { input: 30, output: null, total: 30, complete: false } }),
  ];
  const total = usageShare(rows, 'tenantId', 'total');
  assert.equal(total.total, 35);
  assert.equal(total.pendingCalls, 1);
  assert.equal(total.unknownValue, 5);
  assert.equal(total.ranked.some(row => row.id === 'pending'), false);
  assert.equal(total.ranked.some(row => row.id === 'image'), false);
  assert.equal(total.slices.some(row => row.id === 'zero'), false);
  assert.equal(total.slices.reduce((sum, row) => sum + row.value, 0), total.total);
  const input = usageShare(rows, 'modelId', 'input');
  assert.equal(input.total, 65);
  assert.equal(input.pendingCalls, 0);
  assert.equal(usageShare(rows, 'modelId', 'output').pendingCalls, 1);
  const zero = usageShare([fact('a', 0)], 'modelId', 'total');
  assert.equal(zero.total, 0);
  assert.deepEqual(zero.slices, []);
  assert.deepEqual(usageShare([], 'modelId'), { total: 0, count: 0, ranked: [], slices: [], unknownValue: 0, pendingCalls: 0 });
});

test('customer layers count distinct active customers at every inclusive boundary without inventing missing customers', () => {
  const rows = [1, 10, 11, 100, 101, 1000, 1001, 10000, 10001].flatMap((calls, i) => Array.from({ length: calls }, () => fact(`customer${i}`, 0)));
  rows.push(fact(null), fact('__unknown__', 5, { unit: '张' }));
  const result = usageDistributions(rows);
  assert.deepEqual(result.customers.map(row => row.value), [2, 2, 2, 2, 1]);
  assert.equal(result.customerCount, 9);
  assert.equal(result.unknownCustomerCalls, 2);
  assert.equal(result.customers.reduce((sum, row) => sum + row.value, 0), result.customerCount);
});

test('Token segments count requests, keep true zero distinct from missing measurement and cover each boundary', () => {
  const rows = [0, 1, 1000, 1001, 4000, 4001, 16000, 16001, 64000, 64001].map(value => fact('one', value));
  rows.push(fact('one', 15, { value: { input: 15, output: null, total: 15, complete: false } }));
  rows.push(fact('one', 0, { value: { input: null, output: null, total: 0, complete: false } }));
  rows.push(fact('one', 500, { unit: '张' }));
  const result = usageDistributions(rows);
  assert.deepEqual(result.tokens.map(row => row.value), [1, 2, 2, 2, 2, 1]);
  assert.equal(result.tokenCalls, 10);
  assert.equal(result.pendingTokenCalls, 2);
  assert.equal(result.nonTokenCalls, 1);
  assert.equal(result.tokenCalls + result.pendingTokenCalls + result.nonTokenCalls, rows.length);
  assert.equal(result.tokens.reduce((sum, row) => sum + row.value, 0), result.tokenCalls);
  assert.equal(result.customerCount, 1);
});

test('invalid Token measurements remain pending instead of entering the zero or first segment', () => {
  const invalid = [0.5, -1, NaN, Infinity, '10', null, undefined, Number.MAX_SAFE_INTEGER + 1];
  const rows = invalid.map(value => fact('one', 0, { value: { input: value, total: value, complete: true } }));
  rows.push(fact('one', 0, { value: null }));
  rows.push(fact('one', 0, { value: { total: 0, complete: 'confirmed' } }));
  const segments = usageDistributions(rows);
  assert.equal(segments.tokenCalls, 0);
  assert.equal(segments.pendingTokenCalls, rows.length);
  assert.equal(segments.tokens.reduce((sum, row) => sum + row.value, 0), 0);
  const share = usageShare(rows, 'modelId', 'total');
  assert.equal(share.total, 0);
  assert.equal(share.pendingCalls, rows.length);
  assert.deepEqual(share.ranked, []);
  assert.deepEqual(share.slices, []);
});

test('fact meter fields determine Token totals and customer attribution never comes from user IDs', () => {
  const at = '2026-10-26T08:00:00+08:00';
  const state = {
    models: [{ id: 'vector', type: 'embedding' }, { id: 'rank', type: 'rerank' }, { id: 'image-token', type: 'image', usageUnit: 'Token' }, { id: 'image', type: 'image' }, { id: 'text', type: 'text' }],
    endpoints: [], providers: [],
    requests: [
      { id: 'a', modelId: 'vector', tenantId: 'customer-a', userId: 'same-user', usage: { input: 8, output: 300 } },
      { id: 'b', modelId: 'rank', tenantId: 'customer-b', userId: 'same-user', usage: { input: 4 } },
      { id: 'c', modelId: 'image-token', usage: { input: 2, output: 3 } },
      { id: 'd', modelId: 'image', tenantId: null, usage: { images: 2 } },
      { id: 'e', modelId: 'text', tenantId: '', usage: { input: 1 } },
      { id: 'f', modelId: 'text', tenantId: '__unknown__', userId: 'known-user', usage: { input: 0, output: 0 } },
    ].map(row => ({ ...row, createdAt: at, updatedAt: at, httpStatus: 200 })),
  };
  const rows = usageFacts(state, { start: '2026-10-26', end: '2026-10-26' }, { types: null, tenant: null, model: null }, Date.parse('2026-10-27T00:00:00+08:00')).current;
  const share = usageShare(rows, 'modelId', 'total');
  assert.equal(share.total, 17);
  assert.equal(share.pendingCalls, 1);
  assert.equal(usageShare(rows.filter(row => ['embedding', 'rerank'].includes(row.modelType)), 'modelId', 'output').pendingCalls, 0);
  const distribution = usageDistributions(rows);
  assert.equal(distribution.customerCount, 2);
  assert.equal(distribution.unknownCustomerCalls, 4);
  assert.equal(distribution.tokenCalls, 4);
  assert.equal(distribution.pendingTokenCalls, 1);
  assert.equal(distribution.nonTokenCalls, 1);
  assert.deepEqual(distribution.tokens.map(row => row.value), [1, 3, 0, 0, 0, 0]);
});
