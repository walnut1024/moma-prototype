import { test } from 'node:test';
import assert from 'node:assert/strict';
import { usageFacts, usageFilterOptions } from '../src/admin-v2/usage-analysis.js';
import { defaultTrend, trendSeries, visibleTrendIds, toggleSupplyGroup, toggleSupplyChannel, validTrendView, supplySummary } from '../src/admin-v2/usage-trends.js';

const now = Date.parse('2026-10-27T12:00:00+08:00');
const range = { start: '2026-10-25', end: '2026-10-26' };
const filters = { types: null, tenant: null, model: null, channels: null, providers: [], user: null };
const req = (id, modelId, endpointId, userId, input, output, extra = {}) => ({ id, requestId: id, modelId, endpointId, userId, tenantId: userId ? `customer-${userId}` : undefined, createdAt: '2026-10-26T08:00:00+08:00', httpStatus: 200, usage: { input, output }, ...extra });
const state = {
  tenants: [{ id: 'customer-u1', name: 'Customer A' }, { id: 'customer-u2', name: 'Customer B' }],
  models: [{ id: 'm1', name: 'Model', type: 'text' }, { id: 'm2', name: 'Model', type: 'embedding' }, { id: 'img', name: 'Image', type: 'image' }],
  providers: [{ id: 'p1', name: 'Supplier' }, { id: 'p2', name: 'Supplier' }],
  endpoints: [{ id: 'e1', name: 'Channel', providerId: 'p1' }, { id: 'e2', name: 'Channel', providerId: 'p1' }, { id: 'e3', providerId: 'p2' }],
  requests: [req('a', 'm1', 'e1', 'u1', 10, 5), req('b', 'm2', 'e2', 'u2', 20), req('c', 'm1', 'e3', 'u2', 30, 7), req('d', 'img', 'e3', undefined, undefined, undefined, { usage: { images: 2 } })],
};
const get = (f = filters, s = state) => usageFacts(s, range, f, now);
const plot = (dimension, calls = false, f = filters, s = state, metric = 'total') => trendSeries(s, get(f, s), f, { ...defaultTrend(), dimension, metric }, calls);

test('supplier groups union with explicit channels; dimensions intersect and requests are counted once', () => {
  const selected = { ...filters, providers: ['p1'], channels: ['e1', 'e3'], model: ['m1'], user: ['u2'] };
  assert.deepEqual(get(selected).current.map(row => row.id), ['c']);
  assert.equal(get({ ...filters, providers: ['p1'], channels: ['e1'] }).current.length, 2);
  assert.equal(get({ ...filters, providers: [], channels: [] }).current.length, 0);
  assert.equal(get({ ...filters, model: [] }).current.length, 0);
  assert.equal(get({ ...filters, user: [] }).current.length, 0);
  const futureChannel = { ...state, endpoints: [...state.endpoints, { id: 'e4', providerId: 'p1' }], requests: [...state.requests, req('new', 'm1', 'e4', 'u1', 1, 2)] };
  assert.equal(get({ ...filters, providers: ['p1'], channels: [] }, futureChannel).current.length, 3);
});

test('supplier grouping filters final channel after retry and keeps orphan channel identity', () => {
  const fixture = { ...state, requests: [req('a', 'm1', 'e1', 'u1', 1, 2), req('a', 'm1', 'e3', 'u1', 3, 4, { updatedAt: '2026-10-26T08:01:00+08:00' }), req('old', 'm1', 'deleted', undefined, 2, 3)] };
  assert.equal(get({ ...filters, providers: ['p1'], channels: [] }, fixture).current.length, 0);
  const trend = plot('providerId', true, filters, fixture);
  assert.deepEqual(trend.total.values, [0, 2]);
  assert.ok(trend.groups.some(row => row.id === '__unknown__'));
  assert.ok(usageFilterOptions(fixture).channels.some(row => row.id === 'deleted'));
});

test('all four grouping dimensions reconcile with totals, preserve zero buckets and distinguish duplicate names', () => {
  for (const calls of [false, true]) for (const dimension of ['modelId', 'category', 'providerId', 'tenantId']) {
    const trend = plot(dimension, calls);
    assert.deepEqual(trend.total.values, [0, calls ? 4 : 72]);
    assert.equal(new Set(trend.groups.map(row => row.label)).size, trend.groups.length);
    for (let i = 0; i < trend.buckets.length; i++) assert.equal(trend.groups.reduce((sum, row) => sum + row.values[i], 0), trend.total.values[i]);
  }
  const selected = plot('modelId', false, { ...filters, model: ['m1', 'm2'] });
  assert.equal(selected.total.label, '当前筛选范围合计');
  assert.equal(plot('total').total.label, '全部模型合计');
  assert.equal(plot('tenantId', true).groups.find(row => row.id === 'customer-u1').label, 'Customer A');
  assert.equal(plot('providerId', true).groups.some(row => row.label.includes(' / ')), false);
  assert.equal(plot('tenantId', true).groups.find(row => row.id === '__unknown__').label, '未归属客户');
});

test('token metric selection separates input/output and non-Token requests', () => {
  assert.deepEqual(plot('modelId', false, filters, state, 'input').total.values, [0, 60]);
  assert.deepEqual(plot('modelId', false, filters, state, 'output').total.values, [0, 12]);
  assert.equal(plot('total', false, { ...filters, model: ['img'] }).applicable, false);
  assert.deepEqual(plot('total', true, { ...filters, model: ['img'] }).total.values, [0, 1]);
  assert.deepEqual(plot('tenantId', true, { ...filters, user: ['__unknown__'] }).total.values, [0, 1]);
});

test('unconfirmed measurement is a gap, never fabricated zero; known input can remain visible', () => {
  const fixture = { ...state, requests: [...state.requests, req('missing', 'm1', 'e1', 'u1', 5, null)] };
  const trend = plot('modelId', false, filters, fixture);
  assert.deepEqual(trend.total.values, [0, null]);
  assert.equal(trend.pending, 1);
  assert.deepEqual(trend.groups.find(row => row.id === 'm2').values, [0, 20]);
  assert.deepEqual(plot('total', false, filters, fixture, 'input').total.values, [0, 65]);
  const fractional = { ...state, requests: [req('fraction', 'm1', 'e1', 'u1', 0.5, 0)] };
  assert.deepEqual(plot('total', false, filters, fractional).total.values, [0, null]);
  assert.equal(plot('total', false, filters, fractional).pending, 1);
});

test('fixed period Top 5 and explicit curve selection never change the range total', () => {
  const fixture = { ...state, models: Array.from({ length: 10 }, (_, n) => ({ id: `m${n}`, type: 'text' })), requests: Array.from({ length: 10 }, (_, n) => req(`r${n}`, `m${n}`, 'e1', 'u1', n, 1)) };
  const trend = plot('modelId', false, filters, fixture);
  assert.deepEqual(visibleTrendIds(trend.groups, null), ['m9', 'm8', 'm7', 'm6', 'm5']);
  assert.deepEqual(visibleTrendIds(trend.groups, ['m1', 'gone']), ['m1']);
  assert.deepEqual(visibleTrendIds(trend.groups, []), []);
  assert.deepEqual(trend.total.values, [0, 55]);
});

test('supplier selection keeps whole groups dynamic and partial selections explicit across groups', () => {
  const channels = usageFilterOptions(state).channels;
  let draft = toggleSupplyGroup({ providers: [], channels: ['e1', 'e3'] }, 'p1', channels, true);
  assert.deepEqual(draft, { providers: ['p1'], channels: ['e3'] });
  draft = toggleSupplyChannel(draft, channels.find(item => item.id === 'e2'), channels, false);
  assert.deepEqual(draft, { providers: [], channels: ['e3', 'e1'] });
  draft = toggleSupplyChannel(draft, channels.find(item => item.id === 'e2'), channels, true);
  assert.equal(draft.providers.length, 0);
  assert.equal(draft.channels.length, 3);
  draft = toggleSupplyGroup(draft, 'p1', channels, false);
  assert.deepEqual(draft, { providers: [], channels: ['e3'] });
  assert.equal(supplySummary({ providers: ['p1'], channels: [] }, usageFilterOptions(state)), '供应商：1个');
});

test('saved view round trip preserves filters and modes and rejects malformed state', () => {
  const ids = ['token', 'calls', 'detail'];
  const view = { period: '7d', range, panelFilters: Object.fromEntries(ids.map(id => [id, structuredClone(filters)])), trends: { token: { ...defaultTrend(), dimension: 'tenantId', curves: ['customer-u1'], metric: 'output', showTotal: true }, calls: defaultTrend() }, shares: { share: { dimension: 'providerId', metric: 'input' } } };
  const restored = JSON.parse(JSON.stringify(view));
  assert.ok(validTrendView(restored, ids, ['token', 'calls'], ['share']));
  assert.deepEqual(restored, view);
  restored.trends.token.dimension = 'nonexistent';
  assert.equal(validTrendView(restored, ids, ['token', 'calls'], ['share']), false);
  restored.trends.token.dimension = 'modelId'; restored.panelFilters.token.providers = 'p1';
  assert.equal(validTrendView(restored, ids, ['token', 'calls'], ['share']), false);
  restored.panelFilters.token.providers = [];
  restored.shares.share.dimension = 'userId';
  assert.equal(validTrendView(restored, ids, ['token', 'calls'], ['share']), false);
  restored.shares.share.dimension = 'category';
  assert.ok(validTrendView(restored, ids, ['token', 'calls'], ['share']));
  restored.period = 'today';
  assert.ok(validTrendView(restored, ids, ['token', 'calls'], ['share']));
  restored.period = 'tomorrow';
  assert.equal(validTrendView(restored, ids, ['token', 'calls'], ['share']), false);
});
