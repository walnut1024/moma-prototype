import test from 'node:test';
import assert from 'node:assert/strict';
import { appendCapacityMetrics } from '../src/admin-v2/channel-capacity-selection.js';

test('batch capacity selection adds distinct supported metrics without replacing entered limits', () => {
  const limits = { rpm: '300', tpm: '1.5', concurrency: '20' }, before = structuredClone(limits);
  assert.deepEqual(appendCapacityMetrics(limits, ['concurrency', 'rpd', 'rps', 'rpd', 'unknown']), { ...limits, rpd: '', rps: '' });
  assert.deepEqual(limits, before);
});
test('empty and already-added capacity selections retain all existing values', () => {
  const limits = { rpm: '', tpm: '0.000001', ipm: '5' };
  assert.deepEqual(appendCapacityMetrics(limits, []), limits);
  assert.deepEqual(appendCapacityMetrics(limits, ['rpm', 'tpm', 'ipm']), limits);
});
