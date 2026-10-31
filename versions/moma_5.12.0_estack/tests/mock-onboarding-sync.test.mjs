import test from 'node:test';
import assert from 'node:assert/strict';
import { connectionFingerprint } from '../src/admin-v2/connection-state.js';
import { planMockOnboardingSync } from '../src/admin-v2/mock-onboarding-sync.js';
import { commitAdminState, parseAdminState, persistModelAction, serializeAdminState, STORAGE_KEY } from '../src/admin-v2/store.js';
import { prepareServerChannel, onboardingApi as api } from '../src/admin-v2/onboarding-client.js';
import { prepareCandidateTest, submitCandidateTest, candidateTestReceipt } from '../src/admin-v2/candidate-tests.js';
import { setMockRuntimeState } from '../src/admin-v2/mock-onboarding-service.js';

function transitionFixture() {
  const before = { id: 'endpoint', providerId: 'supplier', baseUrl: 'https://old.example.invalid/v1', protocol: 'OpenAI', credentialVersion: 'old', configurationRevision: 0, candidateConfiguration: { id: 'candidate' }, candidateTestJobs: [{ candidateId: 'candidate', endpointId: 'endpoint', serverChannelId: 'target', receivedAt: '2026-10-31T00:00:00Z' }] };
  const after = { ...before, baseUrl: 'https://new.example.invalid/v1', credentialVersion: 'new', configurationRevision: 1, candidateConfiguration: null, configurationVersions: [{ version: 1, candidateId: 'candidate' }] };
  const previous = { endpoints: [before], providers: [{ id: 'supplier' }] }, next = { endpoints: [after], providers: [{ id: 'supplier' }] };
  const snapshots = [{ id: 'source', providerId: 'supplier', clientChannelId: before.id, clientSignature: connectionFingerprint(before) }, { id: 'target', providerId: 'supplier', clientChannelId: after.id, clientSignature: connectionFingerprint(after) }];
  return { before, after, previous, next, snapshots };
}

test('sync planner uses explicit candidate job and immutable signatures without changing business data', () => {
  const env = transitionFixture(), before = structuredClone(env), plan = planMockOnboardingSync(env.previous, env.next, env.snapshots);
  assert.deepEqual(plan.replacements, [{ channelId: 'source', candidateChannelId: 'target' }]); assert.deepEqual(plan.unverifiedChannelIds, []);
  assert.deepEqual(env, before);
  env.before.candidateTestJobs[0].serverChannelId = 'another-snapshot';
  assert.deepEqual(planMockOnboardingSync(env.previous, env.next, env.snapshots).replacements, []);
  assert.deepEqual(planMockOnboardingSync(env.previous, env.next, env.snapshots).unverifiedChannelIds, ['source']);
});

test('group rotation never produces a partial replacement set when one target is missing', () => {
  const env = transitionFixture(), secondBefore = { ...env.before, id: 'second' }, secondAfter = { ...env.after, id: 'second' };
  env.previous.endpoints.push(secondBefore); env.next.endpoints.push(secondAfter);
  const group = { id: 'group-candidate', groupId: 'group', configs: { endpoint: {}, second: {} } };
  env.previous.providers[0] = { id: 'supplier', keyGroupCandidates: [group], keyGroupTestJobs: [{ candidateId: group.id, endpointId: 'endpoint', serverChannelId: 'target', receivedAt: '2026-10-31' }] };
  env.next.providers[0] = { id: 'supplier', keyGroupRevisions: { group: 1 }, keyGroupVersions: [{ groupId: 'group', version: 1, candidateId: group.id }] };
  env.snapshots.push({ id: 'second-source', providerId: 'supplier', clientChannelId: 'second', clientSignature: connectionFingerprint(secondBefore) });
  const plan = planMockOnboardingSync(env.previous, env.next, env.snapshots);
  assert.equal(plan.scope, 'group'); assert.deepEqual(plan.replacements, []); assert.deepEqual(new Set(plan.unverifiedChannelIds), new Set(['source', 'second-source']));
});

test('direct configuration edits invalidate old snapshots instead of borrowing an unrelated passing target', () => {
  const env = transitionFixture(); env.before.candidateConfiguration = null;
  assert.deepEqual(planMockOnboardingSync(env.previous, env.next, env.snapshots).unverifiedChannelIds, ['source']);
  env.after.baseUrl = env.before.baseUrl; env.after.credentialVersion = env.before.credentialVersion;
  assert.deepEqual(planMockOnboardingSync(env.previous, env.next, env.snapshots).replacements, []);
});

async function fixture(t) {
  let clock = Date.now(); const records = new Map(); let failMain = false, failMock = false, concurrentMain = null;
  t.mock.method(Date, 'now', () => clock);
  t.mock.method(globalThis, 'fetch', () => { assert.fail('Mock synchronization cannot send requests'); });
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const storage = { getItem: key => records.get(key) ?? null, setItem: (key, value) => { if (failMain && key === STORAGE_KEY) throw new Error('main storage failed'); if (failMock && key !== STORAGE_KEY) { if (concurrentMain) records.set(STORAGE_KEY, concurrentMain); throw new Error('mock storage failed'); } records.set(key, value); }, removeItem: key => records.delete(key) };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage }); setMockRuntimeState(null);
  t.after(() => { setMockRuntimeState(null); if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor); else delete globalThis.localStorage; });
  let state = parseAdminState(null);
  const run = (operation, data) => { state = commitAdminState(state, { type: 'modelOperations', operation, data }); };
  run('provider', { operation: 'supplierChannelCreate', objectId: 'provider-moma', values: { name: 'Mock同步渠道', interfaceType: 'openai', baseUrl: 'https://old-sync.example.invalid/v1', protocol: 'OpenAI', authMode: 'group', keyGroupId: 'default', models: [{ libraryId: 'model-2', upstreamModelId: 'vendor/chat', scenarios: [] }] } });
  const endpoint = () => state.endpoints.find(row => row.name === 'Mock同步渠道'), provider = () => state.providers.find(row => row.id === 'provider-moma');
  const mapping = () => provider().catalogConnections.find(row => row.endpointId === endpoint().id);
  const args = () => ({ providerId: provider().id, endpointId: endpoint().id, expectedRevision: endpoint().configurationRevision || 0, candidateId: endpoint().candidateConfiguration?.id });
  run('provider', { operation: 'supplierModelsTest', objectId: provider().id, values: { endpointId: endpoint().id, associationIds: [mapping().id] } });
  run('provider', { operation: 'supplierModelsEnable', objectId: provider().id, values: { endpointId: endpoint().id, associationIds: [mapping().id] } });
  const source = await prepareServerChannel(provider(), endpoint()), model = { id: 'model-2', associationId: mapping().id, upstreamModelId: mapping().upstreamModelId, type: 'text' };
  const prove = async channelId => { const batch = await api('/tests', { method: 'POST', body: { operationId: crypto.randomUUID(), channelId, models: [model] } }); clock += 1200; return api(`/tests/${batch.id}`); };
  await prove(source.id);
  const price = id => ({ id, amount: 1000000, unit: 'request', currency: 'CNY', effectiveAt: new Date(clock - 60000).toISOString() });
  const service = await api('/services', { method: 'POST', body: { operationId: crypto.randomUUID(), publicModelId: 'moma/sync-chat', mode: 'standard', tenantIds: ['tenant-sync'], bindings: [{ id: 'binding-fixed', channelId: source.id, model, procurementPrices: [price('cost')] }], salePrices: [price('sale')], route: { version: 1, strategy: 'fixed', channels: [{ bindingId: 'binding-fixed', priority: 1, weight: 1 }], autoFailover: false } } });
  const identity = await api(`/services/${service.id}/test-identities`, { method: 'POST', body: { operationId: crypto.randomUUID(), expectedRevision: service.revision } });
  await api(`/services/${service.id}/trial`, { method: 'POST', body: { operationId: crypto.randomUUID(), trialToken: identity.token } });
  const published = await api(`/services/${service.id}/publish`, { method: 'POST', body: { operationId: crypto.randomUUID(), expectedRevision: service.revision } });
  run('channelCandidateSave', { ...args(), config: { baseUrl: 'https://new-sync.example.invalid/v1' } });
  const prepared = await prepareCandidateTest(state, args()), candidate = prepared.data;
  run(prepared.operation, candidate);
  const submitted = await submitCandidateTest(candidate); run(prepared.operation, submitted);
  clock += 1200; const batch = await api(`/tests/${submitted.batchId}`), receipt = candidateTestReceipt(submitted, batch); run(receipt.operation, receipt.data);
  storage.setItem(STORAGE_KEY, serializeAdminState(state)); setMockRuntimeState(state);
  return { state, storage, records, published, source, targetId: candidate.serverChannelId, action: { type: 'modelOperations', operation: 'channelCandidateApply', data: { ...args(), confirmed: true } }, failMain: () => { failMain = true; }, failMock: value => { failMock = true; concurrentMain = value || null; } };
}

test('one persisted candidate apply switches mock published reference and preserves IDs, prices, scope and route', async t => {
  const env = await fixture(t), next = persistModelAction(env.state, env.action, env.storage);
  const current = (await api('/services')).services.find(row => row.id === env.published.id);
  assert.equal(current.published.config.bindings[0].channelId, env.targetId);
  const beforeConfig = structuredClone(env.published.published.config), afterConfig = structuredClone(current.published.config);
  beforeConfig.bindings[0].channelId = env.targetId; beforeConfig.bindings[0].needsValidation = false;
  assert.deepEqual(afterConfig, beforeConfig);
  assert.equal(next.endpoints.find(row => row.id === env.action.data.endpointId).baseUrl, 'https://new-sync.example.invalid/v1');
  assert.equal(JSON.parse(env.storage.getItem(STORAGE_KEY)).revision, next.revision);
});

test('a failed main write leaves both current stores intact', async t => {
  const env = await fixture(t), before = new Map(env.records); env.failMain();
  assert.throws(() => persistModelAction(env.state, env.action, env.storage), /main storage failed/);
  assert.deepEqual(env.records, before);
});

test('an online candidate with a missing immutable target cannot commit only the local configuration', async t => {
  const env = await fixture(t), mockKey = [...env.records.keys()].find(key => key !== STORAGE_KEY), mockState = JSON.parse(env.records.get(mockKey));
  mockState.channels = mockState.channels.filter(channel => channel.id !== env.targetId); env.records.set(mockKey, JSON.stringify(mockState));
  const before = new Map(env.records);
  assert.throws(() => persistModelAction(env.state, env.action, env.storage), /在线引用的候选尚未完成检查/);
  assert.deepEqual(env.records, before);
});

test('mapping disable updates the runtime gate in the same persisted action and stops old published calls', async t => {
  const env = await fixture(t), provider = env.state.providers.find(row => row.id === env.action.data.providerId), mapping = provider.catalogConnections.find(row => row.endpointId === env.action.data.endpointId);
  const key = await api('/client-keys', { method: 'POST', body: { operationId: crypto.randomUUID(), tenantId: 'tenant-sync', serviceIds: [env.published.id] } });
  const request = () => api('/client/completions', { method: 'POST', token: key.clientKey, body: { operationId: crypto.randomUUID(), model: 'moma/sync-chat', messages: [{ role: 'user', content: 'check' }] } });
  assert.equal((await request()).source, 'mock');
  persistModelAction(env.state, { type: 'modelOperations', operation: 'provider', data: { operation: 'channelDisable', objectId: provider.id, values: { modelId: mapping.modelId, channelId: mapping.id, confirmed: true } } }, env.storage);
  await assert.rejects(request(), issue => issue.code === 'supply_unavailable');
});

test('a failed mock commit restores only this main key and reports failure', async t => {
  const env = await fixture(t), before = new Map(env.records); env.records.set('unrelated-user-data', 'keep'); env.failMock();
  assert.throws(() => persistModelAction(env.state, env.action, env.storage), /mock storage failed/);
  for (const [key, value] of before) assert.equal(env.records.get(key), value);
  assert.equal(env.records.get('unrelated-user-data'), 'keep');
});

test('rollback refuses to overwrite a concurrent main-store change', async t => {
  const env = await fixture(t), concurrent = JSON.stringify({ revision: env.state.revision + 100, concurrent: true }); env.failMock(concurrent);
  assert.throws(() => persistModelAction(env.state, env.action, env.storage), /未覆盖其他修改/);
  assert.equal(env.records.get(STORAGE_KEY), concurrent);
});
