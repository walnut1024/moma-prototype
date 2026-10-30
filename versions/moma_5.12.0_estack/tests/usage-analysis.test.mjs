import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenModelTypes, usagePreset, usagePresets, operationsPresets, operationsPeriod, usageWindow, usageValue, usageFacts, usageTotals, usageGroups, usageBuckets, usageCallBuckets, usageRates, usageFilterOptions } from '../src/admin-v2/usage-analysis.js';

const now = Date.parse('2026-09-24T12:30:00+08:00');
const state = {
  models: [{ id: 'm', type: 'text' }],
  endpoints: [{ id: 'e', providerId: 'p' }],
  providers: [{ id: 'p', sourceType: 'selfHosted' }],
  requests: [],
};
const request = (id, at, tenantId, usage, extra = {}) => ({ id, requestId: id, createdAt: at, updatedAt: at, tenantId, modelId: 'm', endpointId: 'e', httpStatus: 200, usage, ...extra });
const filters = { types: ['text'], tenant: null, model: null, source: '' };

test('channel filtering distinguishes two suppliers for the same platform model and scopes comparison', () => {
  const fixture = { ...state, endpoints: [...state.endpoints, { id: 'e2', providerId: 'p2' }], providers: [...state.providers, { id: 'p2', name: '转售商' }], requests: [
    request('a', '2026-09-24T08:00:00+08:00', 'one', { input: 10, output: 1 }),
    request('b', '2026-09-24T08:10:00+08:00', 'one', { input: 20, output: 2 }, { endpointId: 'e2' }),
    request('prior', '2026-09-23T08:10:00+08:00', 'one', { input: 5, output: 1 }, { endpointId: 'e2' }),
  ] };
  const facts = usageFacts(fixture, usagePreset('today', now), { ...filters, channels: ['e2'] }, now);
  assert.deepEqual(facts.current.map(row => row.id), ['b']);
  assert.deepEqual(facts.prior.map(row => row.id), ['prior']);
  assert.equal(usageFacts(fixture, usagePreset('today', now), { ...filters, channels: [] }, now).current.length, 0);
  assert.deepEqual(usageFilterOptions(fixture).channels.map(row => [row.id, row.groupId]), [['e', 'p'], ['e2', 'p2']]);
});

test('user filtering uses explicit user IDs, never tenants or Key ownership', () => {
  const fixture = { ...state, requests: [
    request('a', '2026-09-24T08:00:00+08:00', 'same-tenant', { input: 10, output: 1 }, { userId: 'u1', keyId: 'shared' }),
    request('b', '2026-09-24T08:10:00+08:00', 'same-tenant', { input: 20, output: 2 }, { userId: 'u2', keyId: 'shared' }),
    request('c', '2026-09-24T08:20:00+08:00', 'same-tenant', { input: 30, output: 3 }),
    request('prior', '2026-09-23T08:10:00+08:00', 'same-tenant', { input: 5, output: 1 }, { userId: 'u1' }),
  ] };
  const facts = usageFacts(fixture, usagePreset('today', now), { ...filters, user: ['u1'] }, now);
  assert.deepEqual(facts.current.map(row => row.id), ['a']);
  assert.deepEqual(facts.prior.map(row => row.id), ['prior']);
  assert.deepEqual(usageFacts(fixture, usagePreset('today', now), { ...filters, user: ['__unknown__'] }, now).current.map(row => row.id), ['c']);
  assert.deepEqual(usageFilterOptions(fixture).users.map(item => item.id), ['u1', 'u2', '__unknown__']);
});

test('cascade options group model IDs by type and preserve orphan channel identity', () => {
  const options = usageFilterOptions({ ...state, models: [...state.models, { id: 'image', name: 'Image', modelId: 'image-id', type: 'image' }], requests: [{ endpointId: 'retired' }, {}] });
  assert.equal(options.models.find(item => item.id === 'image').groupId, 'visual');
  assert.equal(options.models.find(item => item.id === 'image').code, 'image-id');
  assert.ok(options.channels.some(item => item.id === 'retired' && item.groupId === '__unknown__'));
  assert.ok(options.channels.some(item => item.id === '__unknown__'));
});

test('usage periods use Beijing natural days and like-for-like elapsed comparison', () => {
  assert.deepEqual(usagePreset('today', now), { start: '2026-09-24', end: '2026-09-24' });
  assert.deepEqual(usagePreset('yesterday', now), { start: '2026-09-23', end: '2026-09-23' });
  assert.deepEqual(usagePreset('7d', now), { start: '2026-09-17', end: '2026-09-23' });
  const window = usageWindow(usagePreset('today', now), now);
  assert.equal(window.end, now);
  assert.equal(window.priorEnd, Date.parse('2026-09-23T12:30:00+08:00'));
  assert.equal(usageBuckets([], [], window).at(-1).partial, true);
});

test('usage page opts into today while completed-period callers keep their existing bounds', () => {
  assert.deepEqual(usagePresets.map(([id]) => id), ['today', 'yesterday', '7d', '30d']);
  assert.deepEqual(operationsPresets.map(([id]) => id), ['yesterday', '7d', '30d']);
  assert.deepEqual(operationsPeriod('today', null, now), { period: 'yesterday', range: usagePreset('yesterday', now) });
  assert.deepEqual(operationsPeriod('today', null, now, true), { period: 'today', range: usagePreset('today', now) });
  const custom = { start: '2026-09-22', end: '2026-09-25' };
  assert.deepEqual(operationsPeriod('custom', custom, now), { period: 'custom', range: { start: custom.start, end: '2026-09-23' } });
  assert.deepEqual(operationsPeriod('custom', custom, now, true), { period: 'custom', range: { start: custom.start, end: '2026-09-24' } });
  assert.deepEqual(operationsPeriod('custom', usagePreset('today', now), now, true), { period: 'custom', range: usagePreset('today', now) });
  assert.deepEqual(operationsPeriod('custom', { start: '2026-09-25', end: '2026-09-26' }, now, true), { period: 'yesterday', range: usagePreset('yesterday', now) });
  for (const period of ['yesterday', '7d', '30d']) assert.deepEqual(operationsPeriod(period, null, now, true), { period, range: usagePreset(period, now) });
});

test('saved today recalculates in Beijing time and excludes future requests and unstarted buckets', () => {
  const saved = JSON.parse(JSON.stringify({ period: 'today', range: { start: '2026-09-23', end: '2026-09-23' } }));
  const restored = operationsPeriod(saved.period, saved.range, now, true);
  assert.deepEqual(restored, { period: 'today', range: { start: '2026-09-24', end: '2026-09-24' } });
  assert.deepEqual(operationsPeriod(saved.period, saved.range, Date.parse('2026-09-24T00:30:00+08:00'), true), restored);
  const facts = usageFacts({ ...state, requests: [
    request('before-now', '2026-09-24T12:29:00+08:00', 'one', { input: 10, output: 1 }),
    request('future', '2026-09-24T12:31:00+08:00', 'one', { input: 20, output: 2 }),
  ] }, restored.range, filters, now);
  assert.deepEqual(facts.current.map(row => row.id), ['before-now']);
  const buckets = usageBuckets(facts.current, facts.prior, facts.window);
  assert.equal(buckets.length, 13);
  assert.equal(buckets[0].label, '00:00');
  assert.equal(buckets.at(-1).label, '12:00');
  assert.equal(buckets.at(-1).partial, true);
  assert.equal(buckets.at(-1).end, now);
  assert.ok(buckets.every(bucket => bucket.start < now && bucket.end <= now));
  assert.equal(buckets.reduce((sum, bucket) => sum + bucket.calls, 0), 1);
});

test('today at Beijing midnight is a valid empty window while future and invalid ranges remain rejected', () => {
  const midnight = Date.parse('2026-09-24T00:00:00+08:00');
  const selected = usagePreset('today', midnight), window = usageWindow(selected, midnight);
  assert.ok(window);
  assert.equal(window.start, midnight);
  assert.equal(window.end, midnight);
  assert.equal(window.days, 1);
  assert.deepEqual(usageBuckets([], [], window), []);
  assert.deepEqual(operationsPeriod('custom', selected, midnight, true), { period: 'custom', range: selected });
  const facts = usageFacts({ ...state, requests: [request('not-elapsed', '2026-09-24T00:00:00+08:00', 'one', { input: 1, output: 1 })] }, selected, filters, midnight);
  assert.deepEqual(facts.current, []);
  assert.deepEqual(facts.prior, []);
  assert.equal(usageRates(facts.current, window).averageRpm, 0);
  for (const range of [
    { start: '2026-09-25', end: '2026-09-25' },
    { start: '2026-09-24', end: '2026-09-25' },
    { start: '2026-09-24', end: '2026-09-23' },
    { start: 'invalid', end: '2026-09-24' },
  ]) assert.equal(usageWindow(range, midnight), null);
});

test('customer request identity and confirmed usage reconcile', () => {
  const requests = [
    request('a', '2026-09-24T08:00:00+08:00', 'one', { input: 999_999, output: 0, cached: 100 }),
    request('a', '2026-09-24T08:00:00+08:00', 'one', { input: 999_999, output: 0, cached: 100 }, { updatedAt: '2026-09-24T08:05:00+08:00' }),
    request('b', '2026-09-24T09:00:00+08:00', 'two', { input: 1_000_000, output: 0 }),
    request('c', '2026-09-24T10:00:00+08:00', 'three', { input: 0, output: 0 }),
    request('d', '2026-09-24T11:00:00+08:00', 'four', { input: 10, output: 2 }, { httpStatus: 504 }),
    request('e', '2026-09-24T11:30:00+08:00', null, { input: 5, output: 5 }),
    request('prior', '2026-09-23T11:00:00+08:00', 'one', { input: 100, output: 20 }),
    request('late', '2026-09-23T14:00:00+08:00', 'one', { input: 100, output: 20 }),
    request('future', '2026-09-24T13:00:00+08:00', 'one', { input: 100, output: 20 }),
  ];
  const facts = usageFacts({ ...state, requests }, usagePreset('today', now), filters, now);
  assert.equal(facts.current.length, 5);
  assert.equal(facts.prior.length, 1);
  const totals = usageTotals(facts.current, ['input', 'output']);
  assert.equal(totals.calls, 5);
  assert.equal(totals.total, 2_000_009);
  assert.equal(totals.pendingCalls, 1);
  assert.equal(totals.customers, 4);
  assert.equal(totals.unknownCustomers, 1);
  assert.deepEqual(usageValue({ httpStatus: 504, usage: { input: 5, output: 6 }, usageConfirmed: true }, ['input', 'output']), { input: 5, output: 6, total: 11, complete: true });
});

test('Token model trend includes only Token units and each model type uses applicable fields', () => {
  const models = [{ id: 'm', type: 'text' }, { id: 'mm', type: 'multimodal' }, { id: 'em', type: 'embedding' }, { id: 'img', type: 'image' }];
  const requests = [
    request('text', '2026-09-24T08:00:00+08:00', 'one', { input: 10, output: 5 }),
    request('multi', '2026-09-24T08:10:00+08:00', 'one', { input: 4, output: 6 }, { modelId: 'mm' }),
    request('vector', '2026-09-24T08:20:00+08:00', 'one', { input: 7 }, { modelId: 'em' }),
    request('image', '2026-09-24T08:30:00+08:00', 'one', { images: 2 }, { modelId: 'img' }),
  ];
  const result = usageFacts({ ...state, models, requests }, usagePreset('today', now), { ...filters, types: tokenModelTypes.map(type => type.id) }, now);
  const totals = usageTotals(result.current, ['input', 'output']);
  const bucket = usageBuckets(result.current, result.prior, result.window).find(item => item.label === '08:00');
  assert.equal(totals.calls, 3);
  assert.equal(totals.total, 32);
  assert.equal(totals.pendingCalls, 0);
  assert.equal(bucket.total, 32);
  assert.equal(tokenModelTypes.reduce((sum, type) => sum + bucket[type.id], 0), bucket.total);
  assert.deepEqual([bucket.text, bucket.multimodal, bucket.embedding, bucket.rerank], [15, 10, 7, 0]);
});

test('daily and minute peaks use request timestamps while averages include idle time', () => {
  const models = [...state.models, { id: 'img', type: 'image' }];
  const requests = [
    request('a', '2026-09-23T08:00:10+08:00', 'one', { input: 100, output: 0 }),
    request('b', '2026-09-23T08:00:40+08:00', 'one', { input: 50, output: 0 }),
    request('c', '2026-09-24T08:00:05+08:00', 'one', { input: 200, output: 0 }),
    request('image', '2026-09-24T08:00:20+08:00', 'one', { images: 2 }, { modelId: 'img' }),
    request('pending', '2026-09-24T08:00:30+08:00', 'one', { input: 10, output: 0 }, { httpStatus: 503 }),
    request('confirmed', '2026-09-24T08:01:00+08:00', 'one', { input: 10, output: 0 }, { httpStatus: 503, usageConfirmed: true }),
    request('prior', '2026-09-21T08:00:10+08:00', 'one', { input: 20, output: 0 }),
  ];
  const facts = usageFacts({ ...state, models, requests }, { start: '2026-09-23', end: '2026-09-24' }, { ...filters, types: null }, now);
  const rates = usageRates(facts.current, facts.window);
  assert.equal(usageTotals(facts.current.filter(row => row.unit === 'Token'), ['input', 'output']).total, 360);
  assert.equal(rates.averageTpd, 180);
  assert.equal(rates.peakTpd, 210);
  assert.equal(rates.peakTpm, 200);
  assert.equal(rates.peakRpm, 3);
  assert.equal(rates.averageTpm, 360 / 2190);
  assert.equal(rates.averageRpm, 6 / 2190);
  assert.equal(usageRates(facts.prior, facts.window, true).averageTpm, 20 / 2190);
  assert.deepEqual(usageRates([], facts.window), { averageTpd: 0, peakTpd: 0, peakTpm: 0, peakRpm: 0, averageTpm: 0, averageRpm: 0 });
});


test('multi-select filters and rankings keep Tokens separate from image, duration and character usage', () => {
  const models = [{ id: 'm', type: 'text' }, { id: 'img', type: 'image' }, { id: 'vid', type: 'video' }, { id: 'tts', type: 'audio', usageUnit: '字符' }, { id: 'rank', type: 'rerank' }, { id: 'video-token', type: 'video', usageUnit: 'Token' }];
  const requests = [
    request('text', '2026-09-24T08:00:00+08:00', 'one', { input: 10, output: 5 }),
    request('img', '2026-09-24T08:10:00+08:00', 'one', { images: 2 }, { modelId: 'img' }),
    request('vid', '2026-09-24T08:20:00+08:00', 'one', { seconds: 6 }, { modelId: 'vid' }),
    request('tts', '2026-09-24T08:30:00+08:00', 'one', { characters: 120 }, { modelId: 'tts' }),
    request('rank', '2026-09-24T08:40:00+08:00', 'one', { input: 7 }, { modelId: 'rank' }),
    request('video-token', '2026-09-24T08:50:00+08:00', 'one', { input: 4, output: 11 }, { modelId: 'video-token' }),
  ];
  const fixture = { ...state, models, requests }, range = usagePreset('today', now);
  const all = usageFacts(fixture, range, { ...filters, types: null }, now);
  const grouped = usageGroups(all.current, 'tenantId')[0];
  assert.equal(grouped.total, 37);
  assert.equal(grouped.calls, 6);
  const tokenBucket = usageBuckets(all.current.filter(row => row.unit === 'Token'), [], all.window).find(row => row.label === '08:00');
  assert.equal(tokenBucket.total, 37); assert.equal(tokenBucket.visual, 15);
  assert.deepEqual(grouped.units, { '张': 2, '秒': 6, '字符': 120 });
  const selected = usageFacts(fixture, range, { ...filters, types: ['visual', 'audio'] }, now);
  assert.deepEqual(selected.current.map(row => row.modelId), ['img', 'vid', 'tts', 'video-token']);
  const buckets = usageBuckets([], [], all.window);
  const calls = usageCallBuckets(selected.current, buckets).find((_, i) => buckets[i].label === '08:00');
  assert.equal(calls.total, 4); assert.equal(calls.visual, 3); assert.equal(calls.audio, 1);
  assert.equal(usageFacts(fixture, range, { ...filters, types: null, model: ['vid'] }, now).current.length, 1);
  assert.equal(usageFacts(fixture, range, { ...filters, types: [] }, now).current.length, 0);
  assert.equal(usageFacts(fixture, range, { ...filters, types: null, source: 'thirdParty' }, now).current.length, 0);
});


test('channel filtering uses final request state after failover, not an older matching revision', () => {
  const fixture = { ...state, endpoints: [...state.endpoints, { id: 'e2', providerId: 'p' }], requests: [
    request('same', '2026-09-24T08:00:00+08:00', 'one', { input: 10, output: 1 }),
    request('same', '2026-09-24T08:00:00+08:00', 'one', { input: 20, output: 2 }, { endpointId: 'e2', updatedAt: '2026-09-24T08:01:00+08:00' }),
  ] };
  assert.equal(usageFacts(fixture, usagePreset('today', now), { ...filters, channels: ['e'] }, now).current.length, 0);
  assert.equal(usageFacts(fixture, usagePreset('today', now), { ...filters, channels: ['e2'] }, now).current.length, 1);
});
