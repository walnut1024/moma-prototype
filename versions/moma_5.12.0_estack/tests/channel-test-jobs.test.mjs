import test from 'node:test';
import assert from 'node:assert/strict';
import { channelTestModels, channelTestRequest, recentChannelTestJob, channelBatchProgress, channelBatchRunning, channelBatchTerminal, channelTestItem } from '../src/admin-v2/channel-test-jobs.js';
const records = [{ associationId: 'a', modelId: 'master-a', upstreamModelId: 'vendor/chat', type: 'text' }, { associationId: 'b', modelId: 'master-b', upstreamModelId: 'vendor/embed', type: 'embedding' }, { associationId: 'c', modelId: 'master-c', upstreamModelId: 'vendor/video', type: 'video' }, { associationId: 'd', modelId: 'master-d', upstreamModelId: 'vendor/audio', type: 'audio' }];
test('ordinary batch excludes paid media by default and keeps model identity distinct from association identity', () => {
  const models = channelTestModels(records); assert.equal(models.length, 2); assert.equal(models[0].id, 'master-a'); assert.equal(models[0].associationId, 'a'); assert.equal(models[0].upstreamModelId, 'vendor/chat');
  assert.deepEqual(channelTestModels(records, { check: 'tools' }).map(row => row.associationId), ['a']);
  assert.deepEqual(channelTestModels(records, { plannedIds: ['b'] }).map(row => row.associationId), ['b']);
});
test('media probes require explicit inclusion and an explicit audio task, with a stable recoverable request identity', () => {
  assert.throws(() => channelTestModels(records, { expensiveIds: ['d'] }), /选择识别或合成/);
  const models = channelTestModels(records, { expensiveIds: ['c', 'd'], audioProbes: { d: 'transcription' } });
  const request = channelTestRequest('server-channel', models, { operationId: 'same-submission' });
  assert.equal(request.operationId, 'same-submission'); assert.equal(request.confirmExpensive, true); assert.equal(request.models.find(row => row.associationId === 'd').probe, 'transcription');
  assert.deepEqual(channelTestRequest('server-channel', structuredClone(models), { operationId: request.operationId }), request);
  assert.throws(() => channelTestRequest('server-channel', []), /1–50/);
});
test('recovery picks the newest related pending job without dropping an old-configuration task', () => {
  const jobs = [{ operationId: 'old', batchId: 'done', signature: 'old', associationIds: ['a'], createdAt: '2026-10-30T10:00:00Z' }, { operationId: 'new', batchId: '', request: { operationId: 'new' }, signature: 'different-config', associationIds: ['a'], createdAt: '2026-10-30T11:00:00Z' }, { batchId: 'unrelated', associationIds: ['b'], createdAt: '2026-10-30T12:00:00Z' }];
  assert.equal(recentChannelTestJob(jobs, ['a']).operationId, 'new'); assert.equal(recentChannelTestJob(jobs, ['missing']), null);
});
test('unknown and cancelled results stay distinct from failure and progress never counts them as success', () => {
  const batch = { status: 'completed', items: ['passed', 'failed', 'unknown', 'cancelled'].map((status, index) => ({ status, model: { associationId: `m${index}` } })) };
  assert.deepEqual(channelBatchProgress(batch), { queued: 0, running: 0, passed: 1, failed: 1, unknown: 1, cancelled: 1 }); assert.equal(channelTestItem(batch, 'm2').status, 'unknown'); assert.equal(channelBatchRunning(batch), false); assert.equal(channelBatchTerminal(batch), true); assert.equal(channelBatchRunning({ status: 'running' }), true);
});
