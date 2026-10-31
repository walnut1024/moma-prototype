import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAdminState, commitAdminState, serializeAdminState } from '../src/admin-v2/store.js';
import { channelDrafts } from '../src/admin-v2/channel-onboarding.js';
const run = (state, operation, data) => commitAdminState(state, { type: 'modelOperations', operation, data });

test('unfinished connection fields survive draft save and refresh without creating a channel', () => {
  const before = parseAdminState(null), value = { providerId: 'provider-moma', name: '未完成的接入', interfaceType: 'anthropic', baseUrl: 'https://unfinished.', timeoutSeconds: '', capacity: 'pending', taskUrls: { text: 'https://unfinished./tas' }, adapterOptions: { apiVersion: '2026-', tokenLimitField: 'max_', statusPath: '/tasks/' } };
  const saved = run(before, 'channelDraftSave', { value, rows: [{ id: 'pending', libraryId: '', upstreamModelId: 'vendor/revision:', scenarios: [] }] });
  const restored = channelDrafts(parseAdminState(serializeAdminState(saved)))[0];
  assert.deepEqual(restored.value.adapterOptions, value.adapterOptions); assert.deepEqual(restored.value.taskUrls, value.taskUrls);
  assert.equal(restored.value.baseUrl, value.baseUrl); assert.equal(restored.value.timeoutSeconds, '');
  assert.deepEqual(saved.endpoints, before.endpoints); assert.deepEqual(saved.providers, before.providers);
  assert.throws(() => run(saved, 'channelDraftCommit', { id: restored.id, expectedRevision: restored.draftRevision, values: { ...restored.value, models: [{ libraryId: 'model-2', upstreamModelId: 'test' }] } }));
  assert.equal(channelDrafts(saved).length, 1);
});

test('draft flexibility does not persist credentials or authentication-bearing URLs', () => {
  const state = parseAdminState(null), value = { providerId: 'provider-moma', name: '安全草稿' }, rows = [{ id: 'pending' }];
  for (const patch of [{ baseUrl: 'https://user:secret@unfinished' }, { baseUrl: 'https://unfinished?key=secret' }, { taskUrls: { text: 'https://unfinished#secret' } }, { adapterOptions: { secret: 'raw-key' } }]) assert.throws(() => run(state, 'channelDraftSave', { value: { ...value, ...patch }, rows }));
});
