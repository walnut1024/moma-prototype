import test from 'node:test';
import assert from 'node:assert/strict';
import { sections, pages, canAccessPage } from '../src/admin-v2/navigation.mjs';
import {
  attemptCapacity, callObservations, filterObservations, logCsv, observationBuckets, observationDrill,
  observationFilters, observationGroups, observationGroupScope, observationHash, observationViewFilters, observationWindow, summarizeObservations,
} from '../src/admin-v2/call-observations.mjs';

const now = Date.parse('2026-11-08T11:15:15+08:00');
const time = offset => new Date(now + offset).toISOString();
const base = { modelId: 'model', publicModelId: 'model/v1', createdAt: time(-180_000), userId: 'user' };
const attempts = [
  { dispatched: true, startedAt: time(-75_000), channelId: 'a', providerId: 'provider-a', endpointId: 'ea',
    httpStatus: 429, durationMs: 4, error: 'upstream_rate_limited', usage: { input: 0, output: 0 } },
  { dispatched: true, startedAt: time(-62_000), channelId: 'b', providerId: 'provider-b', endpointId: 'eb',
    httpStatus: 200, durationMs: 110, usage: { input: 12, output: 8, cached: 5 } },
];
const success = { ...base, requestId: 'req-fallback', httpStatus: 200, durationMs: 200,
  stream: true, ttftMs: 40, firstPacketMs: -1, usage: { input: 12, output: 8, cached: 5 }, attempts };
const state = {
  models: [{ id: 'model', name: '示例模型', modelId: 'model-default', type: 'text' }],
  users: [{ id: 'user', name: '示例用户' }],
  apiKeys: [{ id: 'key', keyId: 'ak-fixture', name: '生产 Key', secretPreview: 'sensitive-fixture' }],
  requests: [
    { ...success, keyId: 'key' }, { ...success },
    { ...base, publicModelId: undefined, requestId: 'req-rejected', providerId: 'candidate-only', httpStatus: 0, ttftMs: -1,
      attempts: [{ dispatched: false, endpointId: 'ea', error: 'auth_rejected' }] },
    { ...base, requestId: 'req-interrupted', httpStatus: 200, streamInterrupted: true },
    { ...base, requestId: 'req-pending', httpStatus: 202, finalStatus: 'pending' },
    { ...base, requestId: 'req-canceled', httpStatus: 0, isCanceled: true },
    { ...base, requestId: 'req-legacy', httpStatus: 200,
      attempts: [{ dispatched: true, channelId: 'a', durationMs: 10, error: null }] },
  ],
};

test('independent maintenance navigation keeps the gateway configuration tabs', () => {
  const { items } = sections.find(section => section.id === 'gateway');
  assert.deepEqual(items.map(item => item.id), ['gateway', 'logs', 'monitoring']);
  assert.deepEqual(items[0].children.map(([id]) => id), ['routes', 'limits', 'fallback', 'cache', 'releases']);
  for (const id of ['logs', 'monitoring', 'alerts', 'incidents', 'sla']) {
    assert.equal(canAccessPage('运维人员', id), true);
    assert.equal(canAccessPage('运营人员', id), false);
  }
  assert.equal(pages.alerts.area, 'monitoring');
});

test('request outcome and duration observations are independent of attempts and HTTP acceptance', () => {
  const data = callObservations(state);
  const [request, rejected, interrupted, pending, canceled] = data.requests;
  assert.equal(data.requests.length, 6);
  assert.equal(request.total, 20);
  assert.equal(request.firstPacket, null);
  assert.equal(request.ttft, 40);
  assert.equal(request.provider, 'provider-b');
  assert.equal(request.channel, 'b');
  assert.equal(request.userName, '示例用户');
  assert.equal(request.keyName, '生产 Key');
  assert.equal(request.modelIdentifier, 'model/v1');
  assert.equal(request.keyDisplayId, 'ak-fixture');
  assert.equal(request.keyMasked, 'sensitiv*****ture');
  assert.equal(rejected.modelIdentifier, 'model-default');
  assert.equal(rejected.keyMasked, null);
  assert.equal(rejected.provider, null);
  assert.equal(rejected.attempts.length, 0);
  assert.deepEqual([rejected, interrupted, pending, canceled].map(row => row.outcome), ['failed', 'failed', 'pending', 'canceled']);
  assert.equal(summarizeObservations(data.requests).failureRate, 50);
  assert.ok(!JSON.stringify(data).includes('sensitive-fixture'));
  assert.equal(data.attempts[0].fallback, true);
  assert.equal(data.attempts[1].outcome, 'success');
});

test('drill-down preserves the exact half-open window, view and failure conditions', () => {
  const data = callObservations(state);
  const filter = observationFilters(new URLSearchParams('period=1h'));
  const window = observationWindow(filter, now);
  const timed = filterObservations(data.attempts, filter, window);
  const buckets = observationBuckets(timed, window, 'minute');
  const failureBucket = buckets.find(bucket => bucket.rows.some(attempt => attempt.fallback));
  assert.equal(failureBucket.rows.length, 2);
  const hash = observationDrill(filter, failureBucket, 'attempts', { channel: ['a'], signal: 'rate-limit' });
  const params = new URLSearchParams(hash.split('?')[1]);
  assert.equal(params.get('view'), 'attempts');
  const drillFilter = observationFilters(params);
  const drillWindow = observationWindow(drillFilter, now);
  assert.deepEqual(drillWindow, { start: failureBucket.start, end: failureBucket.end });
  assert.deepEqual(filterObservations(data.attempts, drillFilter, drillWindow).map(row => row.index), [1]);
  const failed = { ...filter, outcome: 'failed', http: '0' };
  assert.deepEqual(filterObservations(data.requests, failed, window).map(row => row.requestId), ['req-rejected']);
  assert.equal(timed.length, 2);
  assert.equal(filterObservations(data.attempts, { ...filter, query: 'req-legacy' }, window, { allowUntimed: true }).length, 1);
});

test('provider and channel pairs stay scoped through filtering, saved views and drill-down', () => {
  const rows = [
    { id: 'a-shared', provider: 'a', channel: 'shared' },
    { id: 'a-uncollected', provider: 'a' },
    { id: 'b-shared', provider: 'b', channel: 'shared' },
    { id: 'b-other', provider: 'b', channel: 'other' },
    { id: 'c-shared', provider: 'c', channel: 'shared' },
    { id: 'provider-uncollected', channel: 'shared' },
  ].map(row => ({ ...row, at: now - 1 }));
  const window = { start: now - 10, end: now };
  const filters = { ...observationFilters(), supply: [['a', null], ['b', 'shared']] };
  const ids = scope => filterObservations(rows, scope, window).map(row => row.id);
  const fromHash = hash => observationFilters(new URLSearchParams(hash.split('?')[1]));
  const drill = scope => fromHash(observationDrill(filters, window, 'attempts', scope));
  assert.deepEqual(ids(filters), ['a-shared', 'a-uncollected', 'b-shared']);
  assert.deepEqual(fromHash(observationHash('call-analysis', filters)).supply, filters.supply);
  assert.deepEqual(ids(drill({ provider: ['b'] })), ['b-shared']);
  assert.deepEqual(ids(drill({ channel: ['shared'] })), ['a-shared', 'b-shared']);
  const [group] = observationGroups([rows[2]], 'channel');
  assert.deepEqual(drill(observationGroupScope('channel', group)).supply, [['b', 'shared']]);
  assert.deepEqual(ids(drill({ provider: ['c'] })), []);
  assert.deepEqual(ids(observationViewFilters({ provider: ['a', 'b'], channel: ['other'] })), ['b-other']);
  assert.deepEqual(ids(observationFilters(new URLSearchParams('channel=shared'))),
    ['a-shared', 'b-shared', 'c-shared', 'provider-uncollected']);
  assert.deepEqual(ids(observationFilters(new URLSearchParams('supply=[null]'))), []);
});

test('capacity uses observed minutes and keeps absent attempt usage distinct from zero', () => {
  const data = callObservations(state);
  const window = { start: now - 120_000, end: now };
  const measured = data.attempts.slice(0, 2);
  assert.deepEqual(attemptCapacity(measured, window), { averageRpm: 1, peakRpm: 2, averageTpm: 10, peakTpm: 20 });
  assert.equal(attemptCapacity([...measured, { ...measured[1], total: null }], window).peakTpm, null);
  assert.equal(attemptCapacity([measured[0]], window).peakTpm, 0);
  assert.equal(attemptCapacity([], window).averageTpm, null);
});

test('CSV keeps missing and zero distinct, quotes names and prevents formula execution', () => {
  assert.equal(logCsv([['渠道,"A"', null, 0, '  =formula']]), '\ufeff"渠道,""A""","","0","\'  =formula"');
});
