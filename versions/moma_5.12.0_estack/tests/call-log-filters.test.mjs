import assert from 'node:assert/strict';
import test from 'node:test';
import { filterCallLogs, logFilters, logMinuteRange, logWindow } from '../src/admin-v2/call-log-filters.mjs';
import { observationWindow } from '../src/admin-v2/call-observations.mjs';

const now = Date.parse('2026-11-24T01:11:30Z');

test('call log presets include today in Beijing without changing analytics periods', () => {
  const filters = logFilters();
  assert.equal(filters.period, '7d');
  assert.deepEqual(logWindow(filters, now), { start: Date.parse('2026-11-18T00:00:00+08:00'), end: now });
  assert.deepEqual(logWindow({ period: '30d' }, now), { start: Date.parse('2026-10-26T00:00:00+08:00'), end: now });
  assert.notDeepEqual(logWindow(filters, now), observationWindow(filters, now));
});

test('a manual log range includes the final selected minute and limits displayed dates to 30 days', () => {
  const range = logMinuteRange(Date.parse('2026-10-01T09:00:10+08:00'), Date.parse('2026-10-31T09:00:50+08:00'));
  assert.deepEqual(range, { period: 'custom', start: '2026-10-01T01:00:00.000Z', end: '2026-10-31T01:01:00.000Z' });
  const filters = { ...logFilters(), ...range };
  const window = logWindow(filters, now);
  const rows = [{ at: window.start - 1 }, { at: window.start }, { at: window.end - 1 }, { at: window.end }];
  assert.deepEqual(filterCallLogs(rows, filters, window), rows.slice(1, 3));
  assert.equal(logMinuteRange(window.start, window.end), null);
  assert.equal(logMinuteRange(window.end, window.start), null);
});

test('log URLs retain exact ISO bounds and model, upstream and supply filters', () => {
  const expected = { start: Date.parse('2026-09-01T00:00:06.017Z'), end: Date.parse('2026-10-31T02:00:08.001Z') };
  const params = new URLSearchParams({ period: 'custom',
    start: new Date(expected.start).toISOString(), end: new Date(expected.end).toISOString(),
    model: 'service-model', type: 'text', supply: JSON.stringify([['provider', 'connection']]),
    upstreamModelId: 'upstream-model', view: 'upstream' });
  const filters = logFilters(params);
  const window = logWindow(filters, now);
  assert.deepEqual(window, expected);
  const row = { at: expected.start, model: 'service-model', modelType: 'text', provider: 'provider', channel: 'connection', upstreamModelId: 'upstream-model' };
  assert.deepEqual(filterCallLogs([row, { ...row, model: 'other-service' }, { ...row, modelType: 'image' },
    { ...row, upstreamModelId: 'other-upstream' }, { ...row, channel: 'other-connection' }, { ...row, at: expected.end }], filters, window, true), [row]);
});
