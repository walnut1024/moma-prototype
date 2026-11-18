import test from 'node:test';
import assert from 'node:assert/strict';
import { sections, pages, canAccessPage } from '../src/admin-v2/navigation.mjs';
import { buildRequestTrace, readRequestBody } from '../src/admin-v2/call-log-detail.mjs';
import { createCallLogSimulation, simulateLogRequest, routingDemoRequestId } from '../src/admin-v2/call-log-simulation.mjs';
import {
  attemptCapacity, callObservations, changeObservationTenant, compareLogRows, filterObservations, logCsv, observationBuckets, observationDrill,
  observationFilters, observationGroups, observationGroupScope, observationHash, observationViewFilters, observationWindow,
  searchObservationIdentities, summarizeObservations,
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
  assert.equal(request.callId, 'model/v1');
  assert.equal(request.keyDisplayId, 'ak-fixture');
  assert.equal(request.keyMasked, 'sensitiv*****ture');
  assert.equal(rejected.callId, undefined);
  assert.equal(rejected.registeredModelId, 'model-default');
  assert.equal(rejected.keyMasked, null);
  assert.equal(rejected.provider, null);
  assert.equal(rejected.attempts.length, 0);
  assert.deepEqual([rejected, interrupted, pending, canceled].map(row => row.outcome), ['failed', 'failed', 'pending', 'canceled']);
  assert.equal(summarizeObservations(data.requests).failureRate, 50);
  assert.ok(!JSON.stringify(data).includes('sensitive-fixture'));
  assert.equal(data.attempts[0].fallback, true);
  assert.equal(data.attempts[1].outcome, 'success');
});

test('tenant scope includes anonymous calls and narrows identity searches and filters independently', () => {
  const rows = [
    { id: 'human', at: 1, tenant: 'a', tenantName: 'Tenant A', user: 'user-a', userName: 'Alex', key: 'old-key', keyName: 'App' },
    { id: 'application', at: 2, tenant: 'a', tenantName: 'Tenant A', key: 'old-key', keyName: 'App' },
    { id: 'other', at: 3, tenant: 'b', tenantName: 'Tenant B', user: 'user-b', userName: 'Alex', key: 'key-b', keyDisplayId: 'ak-b', keyName: 'App' },
  ];
  const window = { start: 0, end: 4 };
  assert.deepEqual(filterObservations(rows, { tenant: ['a'] }, window).map(row => row.id), ['human', 'application']);
  assert.deepEqual(filterObservations(rows, { tenant: ['a'], user: ['user-a'] }, window).map(row => row.id), ['human']);
  assert.deepEqual(filterObservations(rows, { tenant: ['a'], userRecord: 'uncollected' }, window).map(row => row.id), ['application']);
  assert.deepEqual(searchObservationIdentities(rows, 'user', ['a'], 'alex').items.map(item => item.id), ['user-a']);
  assert.deepEqual(searchObservationIdentities(rows, 'key', null, '').items, []);
  assert.deepEqual(searchObservationIdentities(rows, 'key', null, 'app').items, []);
  assert.deepEqual(searchObservationIdentities(rows, 'key', ['a'], 'app').items.map(item => item.id), ['old-key']);
  assert.deepEqual(searchObservationIdentities(rows, 'key', null, 'AK-B').items.map(item => item.id), ['key-b']);
  assert.equal(searchObservationIdentities(rows, 'key', ['a', 'b'], 'app', 1).hasMore, true);
  assert.deepEqual(changeObservationTenant(rows, { user: ['user-a'], key: ['old-key', 'key-b'] }, ['b']),
    { tenant: ['b'], user: null, key: ['key-b'] });
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

test('log sort keeps uncollected values last in both directions and breaks ties by latest time', () => {
  const rows = [
    { id: 'missing', duration: null, at: now },
    { id: 'old', duration: 20, at: now - 10 },
    { id: 'new', duration: 20, at: now - 1 },
    { id: 'zero', duration: 0, at: NaN },
  ];
  const sort = (field, direction) => [...rows].sort((a, b) => compareLogRows(a, b, field, direction)).map(row => row.id);
  assert.deepEqual(sort('duration', 1), ['zero', 'new', 'old', 'missing']);
  assert.deepEqual(sort('duration', -1), ['new', 'old', 'zero', 'missing']);
  assert.deepEqual(sort('at', -1), ['missing', 'new', 'old', 'zero']);
});

test('CSV keeps missing and zero distinct, quotes names and prevents formula execution', () => {
  assert.equal(logCsv([['渠道,"A"', null, 0, '  =formula']]), '\ufeff"渠道,""A""","","0","\'  =formula"');
});

test('the routing demo shows group retry, cross-group switching and backup model under one request', () => {
  const simulation = createCallLogSimulation(now);
  const parent = callObservations(simulation.data).requests.find(row => row.requestId === routingDemoRequestId);
  const trace = buildRequestTrace(parent, simulation.evidence[parent.requestId]);
  assert.equal(parent.status, 200);
  assert.equal(trace.attemptCount, 4);
  assert.deepEqual(trace.nodes.filter(row => row.attempt).map(row => row.attempt.channelName), ['渠道 A','渠道 B','渠道 C','渠道 D']);
  assert.deepEqual(trace.nodes.filter(row => row.attempt).map(row => row.attempt.upstreamModelId), [
    'deepseek-v4-pro','deepseek-v4-pro','deepseek-v4-pro','deepseek-v4-flash',
  ]);
  assert.deepEqual(trace.nodes.filter(row => ['group-retry','group-switch','model-fallback'].includes(row.id)).map(row => row.label), [
    '组内重试','跨组切换','切换备用模型服务',
  ]);
});

test('a sorted attempt links to its original parent node even without an upstream ID', () => {
  const simulation = createCallLogSimulation(now);
  const { requests, attempts: upstream } = callObservations(simulation.data);
  const parent = requests.find(row => row.requestId === 'req-73F2');
  const trace = buildRequestTrace(parent, simulation.evidence[parent.requestId]);
  const selected = upstream.filter(row => row.parentId === parent.id).sort((a, b) => compareLogRows(a, b, 'index', -1));
  assert.deepEqual(selected.map(row => trace.nodes.find(node => node.id === row.id)?.attempt.index), [2, 1]);
  assert.equal(selected[1].upstreamRequestId, undefined);
  assert.equal(trace.nodes.find(node => node.id === selected[1].id).offset, 20);
  assert.equal(trace.attemptCount, 2);
  assert.equal(trace.longest.id, selected[1].id);
});

test('a closed retention simulation returns an ID without changing either history view', () => {
  const initial = createCallLogSimulation(now);
  const recorded = simulateLogRequest(initial, now);
  const closed = simulateLogRequest({ ...recorded, retainNew: false }, now + 1);
  assert.equal(closed.data, recorded.data);
  assert.equal(closed.evidence, recorded.evidence);
  assert.notEqual(closed.latestRequestId, recorded.latestRequestId);
  const { requests, attempts: upstream } = callObservations(closed.data);
  const window = observationWindow(observationFilters(undefined, '24h'), now + 2);
  const search = (rows, query) => filterObservations(rows, { query }, window, { allowUntimed: rows === upstream });
  assert.equal(search(requests, closed.latestRequestId).length, 0);
  assert.equal(search(upstream, closed.latestRequestId).length, 0);
  assert.equal(search(requests, recorded.latestRequestId).length, 1);
  assert.equal(search(requests, 'req-73F2').length, 1);
  assert.equal(search(upstream, 'req-73F2').length, 2);
  assert.equal(readRequestBody(closed.evidence['req-61AE']).state, 'available');
  const resumed = simulateLogRequest({ ...closed, retainNew: true }, now + 2);
  assert.equal(resumed.data.requests.some(row => row.requestId === closed.latestRequestId), false);
  assert.equal(resumed.evidence[resumed.latestRequestId].traceState, 'not-retained');
});

test('trace distinguishes missing start, invalid interval and confirmed zero attempts', () => {
  const simulation = createCallLogSimulation(now);
  const { requests } = callObservations(simulation.data);
  const read = id => {
    const row = requests.find(request => request.requestId === id);
    return buildRequestTrace(row, simulation.evidence[id]);
  };
  const partial = read('req-19BF');
  assert.equal(partial.attemptCount, null);
  assert.equal(partial.recordedCount, 1);
  assert.equal(partial.nodes[0].attempt.index, 2);
  assert.equal(partial.nodes[0].offset, null);
  assert.equal(partial.nodes[0].duration, 410);
  assert.equal(partial.hasChart, false);
  assert.equal(read('req-49C1').attemptCount, 0);
  assert.equal(read('req-52C0').attemptCount, 1);
  const interrupted = requests.find(row => row.requestId === 'req-82D1');
  assert.equal(interrupted.status, 200);
  assert.equal(interrupted.outcome, 'failed');
  const invalid = buildRequestTrace({ ...interrupted, duration: 10 });
  assert.equal(invalid.nodes[0].timingConflict, true);
  assert.equal(invalid.hasChart, false);
});

test('body permissions and per-segment retention are enforced before presentation', () => {
  const simulation = createCallLogSimulation(now);
  const body = simulation.evidence['req-61AE'].body;
  assert.deepEqual(readRequestBody({ body: { ...body, allowed: false } }), { state: 'denied', segments: [] });
  assert.equal(readRequestBody(simulation.evidence['req-73F2']).state, 'not-retained');
  const details = readRequestBody(simulation.evidence['req-52C0']);
  assert.equal(details.segments[0].state, 'expired');
  assert.equal(details.segments[0].text, null);
  assert.match(details.segments[1].text, /up-A-6C0/);
  assert.doesNotMatch(JSON.stringify(callObservations(simulation.data)), /列出三个服务巡检项/);
});

test('same Request ID in different customers has separate attempts, project scope and drill-down', () => {
  const { requests, attempts: upstream } = callObservations({
    ...state,
    projects: [{ id: 'project-a', name: '项目 A' }, { id: 'project-b', name: '项目 B' }],
    requests: [
      { ...success, tenantId: 'a', projectId: 'project-a', httpStatus: 500 },
      { ...success, tenantId: 'a', projectId: 'project-a', updatedAt: time(-1000),
        projectRouteId: 'route-a', routeMatch: { field: 'metadata._user', ruleIndex: 0 } },
      { ...success, tenantId: 'b', projectId: 'project-b' },
      { ...success, tenantId: 'b', requestId: 'unassigned' },
    ],
  });
  assert.equal(requests.length, 3);
  assert.equal(new Set(requests.map(row => row.id)).size, 3);
  assert.equal(new Set(upstream.map(row => row.id)).size, 6);
  assert.equal(requests.find(row => row.tenant === 'a').status, 200);
  const filters = observationFilters(new URLSearchParams('period=1h&tenant=a&project=project-a'));
  const window = observationWindow(filters, now);
  const [request] = filterObservations(requests, filters, window);
  assert.equal(request.projectName, '项目 A');
  const [group] = observationGroups([request], 'project');
  const hash = observationDrill(filters, window, 'attempts', observationGroupScope('project', group));
  const drilled = observationFilters(new URLSearchParams(hash.split('?')[1]));
  assert.deepEqual(filterObservations(upstream, drilled, window).map(row => row.parentId), [request.id, request.id]);
  assert.deepEqual(buildRequestTrace(request).nodes.find(node => node.id === 'project-route').fields,
    [['项目路由 ID', 'route-a'], ['匹配字段', 'metadata._user'], ['规则序号', 1]]);
  assert.equal(filterObservations(requests, { ...filters, tenant: ['b'] }, window).length, 0);
  assert.deepEqual(filterObservations(requests, { project: ['__uncollected__'] }, window).map(row => row.requestId), ['unassigned']);
});

test('diagnostic project calls remain traceable with their purpose across drills', () => {
  const { requests, attempts: upstream } = callObservations({ ...state, requests: [
    { ...success, projectId: 'project-a', tenantId: 'a', purpose: 'customer' },
    { ...success, projectId: 'project-a', tenantId: 'a', requestId: 'probe', purpose: 'gateway-test' },
  ] });
  const scope = new URLSearchParams('tenant=a&project=project-a&period=1h');
  const customer = observationFilters(scope, 'today', ['customer']);
  const window = observationWindow(customer, now);
  assert.deepEqual(filterObservations(requests, customer, window).map(row => row.requestId), [success.requestId]);
  assert.equal(filterObservations(requests, { ...customer, project: ['unknown-project'] }, window).length, 0);
  const hash = observationDrill({ ...customer, purpose: ['diagnostic'] }, window, 'attempts');
  const filters = observationFilters(new URLSearchParams(hash.split('?')[1]));
  assert.deepEqual(filterObservations(upstream, filters, window).map(row => row.requestId), ['probe', 'probe']);
  const all = observationHash('monitoring', { ...customer, purpose: null });
  assert.equal(observationFilters(new URLSearchParams(all.split('?')[1]), '24h', ['customer']).purpose, null);
});
