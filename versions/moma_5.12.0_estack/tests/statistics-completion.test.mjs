import test from 'node:test';
import assert from 'node:assert/strict';
import { callObservations, failureGroups, summarizeObservations } from '../src/admin-v2/call-observations.mjs';
import { analysisFilters, operationFacts } from '../src/admin-v2/operations-analysis.js';
import { modelUsageSummary } from '../src/model-usage.mjs';
import { userMetrics, userTokenGroups } from '../src/admin-v2/user-analysis.js';

const now = Date.parse('2026-11-15T12:00:00+08:00');
const range = { start: '2026-11-15', end: '2026-11-15' };
const state = { models: [{ id: 'm', type: 'text', name: '模型' }], users: [{ id: 'u1' }], tenants: [], providers: [], endpoints: [], apiKeys: [], requests: [] };
const row = (id, extra = {}) => ({ id, requestId: id, createdAt: '2026-11-15T09:00:00+08:00',
  modelId: 'm', modelType: 'text', userId: 'u1', tenantId: 't', httpStatus: 200, usage: { input: 100, output: 20 }, ...extra });
const facts = requests => operationFacts({ ...state, requests }, range, analysisFilters(), now);

test('Token ranks use explicit callers and retain internal usage without diagnostics or future calls', () => {
  const groups = userTokenGroups(facts([row('normal'), row('internal', { userId: 'u2', settlement: 'internal' }),
    row('missing-user', { userId: undefined, keyId: 'key-with-owner' }), row('diagnostic', { purpose: 'platform-trial' }),
    row('future', { createdAt: '2026-11-15T13:00:00+08:00' })]));
  assert.deepEqual(groups.map(item => item.id), ['u1', 'u2', '__unknown__']);
  assert(groups.every(item => item.calls === 1 && item.tokens === 120));
});

test('latest request revision drives observations and Token ranks without counting retry copies', () => {
  const requests = [row('same', { httpStatus: 500, updatedAt: '2026-11-15T09:01:00+08:00' }),
    row('same', { updatedAt: '2026-11-15T09:02:00+08:00' })];
  assert.equal(callObservations({ ...state, requests }).requests[0].outcome, 'success');
  assert.deepEqual(userTokenGroups(facts(requests)), [{ id: 'u1', calls: 1, tokens: 120, pendingTokens: 0 }]);
});

test('missing Token measurements, zeros and non-Token units remain distinct in ranks', () => {
  const rows = operationFacts({ ...state, models: [...state.models, { id: 'image', type: 'image' }], requests: [
    row('missing', { usage: {}, userId: 'unknown-meter' }), row('zero', { usage: { input: 0, output: 0 } }),
    row('image-only', { userId: 'image-user', modelId: 'image', modelType: 'image', usage: { images: 3 } }),
  ] }, range, analysisFilters(), now);
  const groups = userTokenGroups(rows);
  assert.equal(groups.find(item => item.id === 'unknown-meter').tokens, null);
  assert.equal(groups.find(item => item.id === 'unknown-meter').pendingTokens, 1);
  assert.equal(groups.find(item => item.id === 'u1').tokens, 0);
  assert.equal(groups.find(item => item.id === 'image-user').tokens, 0);
});

test('failure aggregates reconcile with all failures, preserving unknown source and deduplicated identities', () => {
  const rows = [
    { outcome: 'failed', user: 'u', model: 'm', status: 504, timeout: true, code: 'timeout', errorSource: '上游调用', errorReason: '超时' },
    { outcome: 'failed', user: 'u', model: 'm', status: 504, timeout: true, code: 'timeout', errorSource: '上游调用', errorReason: '超时' },
    { outcome: 'failed', tenant: 'tenant-without-user', status: 401, code: 'auth_rejected', errorSource: '网关' },
    { outcome: 'failed', status: 500 }, { outcome: 'success', user: 'other', model: 'other' }, { outcome: 'pending' },
  ];
  const summary = summarizeObservations(rows), groups = failureGroups(rows);
  assert.equal(summary.affectedUsers, 1); assert.equal(summary.affectedModels, 1);
  assert.equal(summary.missingFailureUsers, 2); assert.equal(summary.missingFailureModels, 2);
  assert.equal(summary.success, 1); assert.equal(summary.failed, 4);
  assert.equal(groups[0].count, 2); assert.equal(groups[0].share, 50);
  assert.equal(groups.reduce((sum, item) => sum + item.share, 0), 100);
  assert(groups.some(item => item.source === '未采集'));
});

test('model details keep selected model and provider call ID, final outcomes and unknown latency', () => {
  const records = [row('a', { publicModelId: 'provider/a', durationMs: 50, ttftMs: 10 }),
    row('b', { publicModelId: 'provider/b', durationMs: 999 }), row('old', { createdAt: '2026-11-01T09:00:00+08:00' }),
    row('failed', { publicModelId: 'provider/a', httpStatus: 500 }), row('other', { modelId: 'n' })];
  const summary = modelUsageSummary(records, { modelKey: 'm', type: 'text', mode: 'provider', callId: 'provider/a' }, now);
  assert.equal(summary.count, 2); assert.equal(summary.successRate, 50); assert.equal(summary.p95, 50);
  assert.equal(summary.ttft, 10);
  assert.equal(modelUsageSummary([], { modelKey: 'm' }, now).p95, null);
});

test('identity trend counts each bucket independently instead of summing daily active counts', () => {
  const data = { users: [{ id: 'u', type: '企业', at: now - 86400000 }],
    logins: [{ userId: 'u', at: now - 3 * 3600000 }, { userId: 'u', at: now - 2 * 3600000 }], calls: [], keys: [] };
  const metrics = userMetrics(data, range, now);
  assert.equal(metrics.current.login, 1);
  assert.equal(metrics.trend.reduce((sum, bucket) => sum + bucket.login, 0), 2);
  assert.equal(metrics.dau.at(-1), 1);
});
