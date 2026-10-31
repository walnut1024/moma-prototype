import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAdminState, commitAdminState } from '../src/admin-v2/store.js';
import { candidateTestPlan, channelCandidateStatus, keyGroupCandidateStatus } from '../src/admin-v2/channel-change-management.js';
import { prepareCandidateTest, submitCandidateTest, recoverCandidateTest, cancelCandidateTest, candidateTestReceipt } from '../src/admin-v2/candidate-tests.js';
import { prepareServerChannel, onboardingApi } from '../src/admin-v2/onboarding-client.js';
import { channelTestModels, channelTestRequest } from '../src/admin-v2/channel-test-jobs.js';
import { supplierChannelAssociations } from '../src/admin-v2/supplier-resources.js';
import { connectionFingerprint } from '../src/admin-v2/connection-state.js';
import { catalogueChannels, channelUrl, channelInterfaceIssue } from '../src/admin-v2/provider-channels.js';
import { activeSupplyPrice, priceItems } from '../src/admin-v2/model-management.js';

const providerId = 'provider-moma', groupId = 'candidate-group';
const owner = state => state.providers.find(row => row.id === providerId);
const endpoints = state => state.endpoints.filter(row => row.name.startsWith('候选异步测试'));
const run = (state, operation, data) => commitAdminState(state, { type: 'modelOperations', operation, data });
const context = (state, endpoint = endpoints(state)[0], group = false) => ({ providerId, endpointId: endpoint.id, candidateId: group ? owner(state).keyGroupCandidates?.find(row => row.groupId === groupId)?.id : endpoint.candidateConfiguration?.id, ...(group ? { groupId, expectedGroupVersion: owner(state).keyGroupRevisions?.[groupId] || 0 } : { expectedRevision: endpoint.configurationRevision || 0 }) });
function fixture(count = 1) {
  let state = parseAdminState(null);
  const provider = owner(state), keyIds = provider.apiKeys.slice(0, 2).map(row => row.id);
  provider.apiKeyGroups = [...(provider.apiKeyGroups || []).filter(row => row.id !== groupId), { id: groupId, name: '候选测试组', keyIds }];
  for (let index = 0; index < count; index++) {
    state = run(state, 'provider', { operation: 'supplierChannelCreate', objectId: providerId, values: { name: `候选异步测试 ${index}`, interfaceType: 'openai', baseUrl: `https://active${index}.example.invalid/v1`, authMode: 'group', keyGroupId: groupId, models: [{ libraryId: 'model-2', upstreamModelId: 'vendor/chat', scenarios: [] }] } });
    const endpoint = endpoints(state).at(-1), ids = supplierChannelAssociations(state, owner(state), endpoint.id).map(row => row.id);
    state = run(state, 'provider', { operation: 'supplierModelsTest', objectId: providerId, values: { endpointId: endpoint.id, associationIds: ids } });
    state = run(state, 'provider', { operation: 'supplierModelsEnable', objectId: providerId, values: { endpointId: endpoint.id, associationIds: ids } });
  }
  return state;
}
const save = state => run(state, 'channelCandidateSave', { ...context(state), config: { baseUrl: 'https://candidate.example.invalid/v1' } });
function job(state, { group = false, endpoint = endpoints(state)[0], check = '' } = {}) {
  const args = context(state, endpoint, group), plan = candidateTestPlan(state, args), operationId = crypto.randomUUID();
  const models = channelTestModels(plan.records, { check }), request = channelTestRequest(`mock-channel-${endpoint.id}`, models, { operationId, check });
  return { operation: group ? 'keyGroupCandidateTestJob' : 'channelCandidateTestJob', data: { ...args, operationId, batchId: crypto.randomUUID(), signature: plan.signature, serverSignature: `mock-signature-${operationId}`, serverChannelId: request.channelId, request } };
}
const track = (state, item) => run(state, item.operation, item.data);
function batch(item, status = 'passed') {
  const at = new Date().toISOString();
  return { id: item.data.batchId, source: 'mock', providerId, channelId: item.data.serverChannelId, signature: item.data.serverSignature, status: 'completed', createdAt: at, endedAt: at, items: item.data.request.models.map(model => ({ id: crypto.randomUUID(), model: { ...model, probe: model.probe || model.type }, status, evidenceSource: 'mock', current: true, startedAt: at, endedAt: at, usage: null, cost: null, message: status })) };
}
const receive = (state, item, result = batch(item)) => { const action = candidateTestReceipt(item.data, result); return run(state, action.operation, action.data); };

test('pending candidate task binds the exact request and mock receipt never claims real evidence', () => {
  const active = fixture(), draft = save(active), item = job(draft), pending = track(draft, item);
  assert.match(channelCandidateStatus(pending, providerId, endpoints(pending)[0].id).checks[0].reason, /尚未完成/);
  assert.deepEqual(owner(pending).catalogConnections, owner(active).catalogConnections);
  const completed = receive(pending, item), endpoint = endpoints(completed)[0];
  assert.equal(endpoint.candidateConfiguration.tests[0].source, 'mock');
  assert.equal(endpoint.candidateConfiguration.tests[0].simulated, true);
  assert.equal(channelCandidateStatus(completed, providerId, endpoint.id).ready, true);
  assert.equal(channelCandidateStatus(completed, providerId, endpoint.id, { requireReal: true }).ready, false);
  assert.deepEqual(endpoint.connectionTest, endpoints(active)[0].connectionTest);
  assert.deepEqual(owner(completed).catalogConnections, owner(active).catalogConnections);
  const applied = run(completed, 'channelCandidateApply', { ...context(completed), confirmed: true, requireReal: false });
  assert.equal(endpoints(applied)[0].connectionQualification.source, 'mock');
  assert.equal(endpoints(applied)[0].connectionQualification.simulated, true);
});

test('new running, failed, cancelled and unknown candidate checks cannot reuse earlier passing evidence', () => {
  let state = save(fixture()), item = job(state); state = receive(track(state, item), item);
  for (const status of ['failed', 'cancelled', 'unknown']) {
    item = job(state); state = track(state, item);
    assert.equal(channelCandidateStatus(state, providerId, endpoints(state)[0].id).ready, false);
    const original = endpoints(state)[0].baseUrl;
    state = receive(state, item, batch(item, status));
    assert.equal(channelCandidateStatus(state, providerId, endpoints(state)[0].id).ready, false);
    assert.throws(() => run(state, 'channelCandidateApply', { ...context(state), confirmed: true }), new RegExp(status));
    assert.equal(endpoints(state)[0].baseUrl, original);
  }
});

test('receipts reject unknown batches, changed signatures and mismatched model identities atomically', () => {
  const draft = save(fixture()), item = job(draft), state = track(draft, item), original = structuredClone(state);
  for (const patch of [{ id: 'unknown' }, { signature: 'other' }, { channelId: 'foreign' }, { items: [] }]) assert.throws(() => receive(state, item, { ...batch(item), ...patch }), /已知|集合/);
  const wrong = batch(item); wrong.items[0].model.upstreamModelId = 'foreign';
  assert.throws(() => receive(state, item, wrong), /身份/);
  const forged = batch(item); forged.items[0].evidenceSource = 'real';
  assert.throws(() => receive(state, item, forged), /对应测试任务/);
  assert.deepEqual(state, original);
});

test('late task recovery after discarding a candidate preserves history and cannot qualify a replacement', () => {
  let state = save(fixture()), item = job(state); item.data.batchId = '';
  state = track(state, item);
  state = run(state, 'channelCandidateDiscard', context(state));
  state = save(state); const replacementId = context(state).candidateId;
  item.data.batchId = crypto.randomUUID(); state = track(state, item); state = receive(state, item);
  assert.equal(context(state).candidateId, replacementId);
  assert.equal(endpoints(state)[0].candidateConfiguration.tests.length, 0);
  assert.equal(endpoints(state)[0].configurationTests.at(-1).current, false);
  assert.equal(endpoints(state)[0].configurationTests.at(-1).candidateId, item.data.candidateId);
});

test('operation identity cannot silently substitute a different candidate request and receipts are idempotent', () => {
  const draft = save(fixture()), item = job(draft), state = track(draft, item);
  const changed = structuredClone(item); changed.data.request.models[0].upstreamModelId = 'other';
  assert.throws(() => track(state, changed), /同一操作/);
  const result = batch(item), completed = receive(state, item, result), duplicate = receive(completed, item, result);
  assert.equal(endpoints(duplicate)[0].configurationTests.length, endpoints(completed)[0].configurationTests.length);
  assert.deepEqual(owner(duplicate).catalogConnections, owner(state).catalogConnections);
});

test('recovering an older completed success cannot replace a more recent completed failure', () => {
  let state = save(fixture());
  const old = job(state), recent = job(state), oldBatch = batch(old), recentBatch = batch(recent, 'failed');
  oldBatch.items[0].endedAt = new Date(Date.now() - 10000).toISOString();
  state = track(track(state, old), recent);
  state = receive(state, recent, recentBatch);
  state = receive(state, old, oldBatch);
  const status = channelCandidateStatus(state, providerId, endpoints(state)[0].id);
  assert.equal(status.ready, false); assert.equal(status.checks[0].evidence.result, '失败');
});

test('capability-only checks do not qualify the basic candidate connection', () => {
  const draft = save(fixture()), item = job(draft, { check: 'tools' }), state = receive(track(draft, item), item);
  assert.equal(channelCandidateStatus(state, providerId, endpoints(state)[0].id).ready, false);
  assert.equal(endpoints(state)[0].candidateConfiguration.tests[0].check, 'tools');
});

test('shared group requires every referenced candidate channel before one atomic mock application', () => {
  let state = fixture(2); const active = structuredClone(state), provider = owner(state);
  state = run(state, 'keyGroupCandidateSave', { ...context(state, endpoints(state)[0], true), keyId: provider.apiKeyGroups.find(row => row.id === groupId).keyIds[1] });
  const first = job(state, { group: true }); state = receive(track(state, first), first);
  assert.equal(keyGroupCandidateStatus(state, providerId, groupId).ready, false);
  assert.throws(() => run(state, 'keyGroupCandidateApply', { ...context(state, endpoints(state)[0], true), confirmed: true }), /全部测试通过/);
  assert.deepEqual(state.endpoints, active.endpoints);
  const second = job(state, { group: true, endpoint: endpoints(state)[1] }); state = receive(track(state, second), second);
  assert.equal(keyGroupCandidateStatus(state, providerId, groupId).ready, true);
  assert.equal(keyGroupCandidateStatus(state, providerId, groupId, { requireReal: true }).ready, false);
  const applied = run(state, 'keyGroupCandidateApply', { ...context(state, endpoints(state)[0], true), confirmed: true, requireReal: false });
  assert.ok(endpoints(applied).every(row => row.configurationRevision === 1 && row.connectionQualification.source === 'mock'));
  assert.deepEqual(applied.serviceRoutes, active.serviceRoutes);
});

test('request adapter options participate in candidate signatures while invalid options and task URLs are rejected', () => {
  const state = fixture(), current = endpoints(state)[0], original = connectionFingerprint(current);
  assert.equal(connectionFingerprint({ ...current, adapterOptions: {} }), original);
  assert.notEqual(connectionFingerprint({ ...current, adapterOptions: { apiVersion: '2026-10-31' } }), original);
  const draft = run(state, 'channelCandidateSave', { ...context(state), config: { adapterOptions: { apiVersion: '2026-10-31', workspaceId: 'workspace_a' } } });
  assert.equal(endpoints(draft)[0].candidateConfiguration.config.adapterOptions.workspaceId, 'workspace_a');
  assert.throws(() => run(state, 'channelCandidateSave', { ...context(state), config: { adapterOptions: { secret: 'never-save' } } }), /未支持/);
  assert.throws(() => run(state, 'channelCandidateSave', { ...context(state), config: { taskUrls: { text: 'https://foreign.example.invalid/chat' } } }), /不能覆盖/);
});

test('candidate helper runs asynchronous mock tasks, restores the same submission and cancels without network calls', async t => {
  t.mock.method(globalThis, 'fetch', () => assert.fail('browser mock must never send a network request'));
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  const active = fixture(), source = await prepareServerChannel(owner(active), endpoints(active)[0]);
  let state = save(active), prepared = await prepareCandidateTest(state, context(state));
  assert.notEqual(prepared.data.serverChannelId, source.id);
  state = run(state, prepared.operation, prepared.data);
  await assert.rejects(() => recoverCandidateTest(prepared.data), error => error.code === 'submission_not_found');
  const submitted = await submitCandidateTest(prepared.data);
  assert.equal(submitted.batch.source, 'mock'); assert.equal(submitted.batch.status, 'queued');
  state = run(state, prepared.operation, { ...prepared.data, batchId: submitted.batchId });
  t.mock.timers.tick(1000);
  const result = await recoverCandidateTest(prepared.data);
  assert.equal(result.id, submitted.batchId); assert.equal(result.status, 'completed');
  assert.ok(result.items.every(row => row.status === 'passed' && row.evidenceSource === 'mock'));
  const receipt = candidateTestReceipt(submitted, result); state = run(state, receipt.operation, receipt.data);
  assert.equal(channelCandidateStatus(state, providerId, endpoints(state)[0].id).ready, true);
  const channels = await onboardingApi('/channels');
  assert.equal(channels.channels.find(row => row.id === source.id).baseUrl, endpoints(active)[0].baseUrl);
  assert.equal((await submitCandidateTest(prepared.data)).batchId, submitted.batchId);
  prepared = await prepareCandidateTest(state, context(state)); state = run(state, prepared.operation, prepared.data);
  const cancellation = await submitCandidateTest(prepared.data);
  state = run(state, prepared.operation, { ...prepared.data, batchId: cancellation.batchId });
  await cancelCandidateTest(cancellation); t.mock.timers.tick(1000);
  const cancelled = await recoverCandidateTest(cancellation);
  assert.equal(cancelled.status, 'cancelled');
  const cancellationReceipt = candidateTestReceipt(cancellation, cancelled); state = run(state, cancellationReceipt.operation, cancellationReceipt.data);
  assert.equal(channelCandidateStatus(state, providerId, endpoints(state)[0].id).ready, false);
  assert.equal(endpoints(state)[0].baseUrl, endpoints(active)[0].baseUrl);
});

test('candidate readiness becomes stale as soon as affected model or service references change', () => {
  const draft = save(fixture()), item = job(draft), state = receive(track(draft, item), item), endpoint = endpoints(state)[0];
  const mapping = supplierChannelAssociations(state, owner(state), endpoint.id)[0];
  state.serviceRoutes.push({ id: 'new-reference', serviceId: 'standard:model-2', activeVersion: 1, versions: [{ version: 1, config: { channels: [{ supplyId: mapping.id, enabled: true }] } }] });
  const status = channelCandidateStatus(state, providerId, endpoint.id);
  assert.equal(status.ready, false); assert.match(status.reason, /引用已变化/);
  assert.ok(status.checks.every(row => !row.passed));
});

test('editing candidate credentials preserves the saved candidate address and request options while invalidating old evidence', () => {
  const original = fixture();
  let state = run(original, 'channelCandidateSave', { ...context(original), config: { baseUrl: 'https://saved-candidate.example.invalid/v1', adapterOptions: { tokenLimitField: 'max_tokens' } } });
  const item = job(state); state = receive(track(state, item), item);
  const previousId = context(state).candidateId;
  state = run(state, 'channelCandidateSave', { ...context(state), config: { authMode: 'group', keyGroupId: groupId } });
  const candidate = endpoints(state)[0].candidateConfiguration;
  assert.notEqual(candidate.id, previousId);
  assert.equal(candidate.config.baseUrl, 'https://saved-candidate.example.invalid/v1');
  assert.equal(candidate.config.adapterOptions.tokenLimitField, 'max_tokens');
  assert.equal(candidate.tests.length, 0);
  assert.equal(endpoints(state)[0].baseUrl, endpoints(original)[0].baseUrl);
});

test('applying a legacy implicit candidate preserves identity and actual cost while uncovered mappings need retest', () => {
  let state = parseAdminState(null);
  const endpointId = 'endpoint-glm', endpoint = state.endpoints.find(row => row.id === endpointId), legacyProviderId = endpoint.providerId;
  const provider = state.providers.find(row => row.id === legacyProviderId), supply = state.modelSupplies.find(row => row.endpointId === endpointId && row.upstreamModelId === 'glm-5.3');
  provider.catalogModelIds.push('legacy-uncovered');
  provider.catalogModels = [...(provider.catalogModels || []), { modelId: 'legacy-uncovered', name: '未覆盖模型', type: 'text', libraryId: 'model-2' }];
  state.modelSupplies.push({ ...supply, id: 'legacy-uncovered-supply', modelId: 'model-2', upstreamModelId: 'legacy-uncovered' });
  const before = supplierChannelAssociations(state, provider, endpointId), first = before.find(row => row.upstreamModelId === supply.upstreamModelId), second = before.find(row => row.upstreamModelId === 'legacy-uncovered');
  assert.equal(first.managed, false); assert.equal(second.managed, false);
  const actualCost = priceItems(activeSupplyPrice(state, supply.id), state.models.find(row => row.id === supply.modelId));
  assert.ok(actualCost.length && actualCost.every(row => row.amount != null));
  state.serviceRoutes.push({ id: 'legacy-live', serviceId: `standard:${supply.modelId}`, activeVersion: 1, versions: [{ version: 1, config: { channels: [{ supplyId: supply.id, enabled: true }] } }] });
  const routes = structuredClone(state.serviceRoutes), prices = structuredClone(state.supplyPrices), ids = state.modelSupplies.map(row => row.id);
  let args = { providerId: legacyProviderId, endpointId, expectedRevision: endpoint.configurationRevision || 0 };
  state = run(state, 'channelCandidateSave', { ...args, config: { baseUrl: 'https://legacy-candidate.example.invalid/v1/chat/completions' } });
  args = { ...args, candidateId: state.endpoints.find(row => row.id === endpointId).candidateConfiguration.id };
  state = run(state, 'channelCandidateTest', { ...args, associationIds: [first.id] });
  state = run(state, 'channelCandidateApply', { ...args, confirmed: true });
  const afterProvider = state.providers.find(row => row.id === legacyProviderId), after = supplierChannelAssociations(state, afterProvider, endpointId);
  assert.deepEqual(after.map(row => row.id).sort(), before.map(row => row.id).sort());
  assert.equal(after.find(row => row.id === first.id).qualification.result, '通过');
  assert.equal(after.find(row => row.id === second.id).enabled, false);
  assert.equal(after.find(row => row.id === second.id).qualification, null);
  assert.deepEqual(priceItems(activeSupplyPrice(state, supply.id), state.models.find(row => row.id === supply.modelId)), actualCost);
  assert.deepEqual(state.supplyPrices, prices); assert.deepEqual(state.serviceRoutes, routes); assert.deepEqual(state.modelSupplies.map(row => row.id), ids);
});

test('explicit audio probes select the corresponding task URL without guessing a default task', () => {
  const endpoint = { id: 'audio-endpoint', supplierChannel: true, interfaceType: 'openai', baseUrl: 'https://audio.example.invalid/v1', protocol: 'OpenAI' };
  const provider = { id: 'audio-provider', catalogModelIds: ['voice-model'], catalogModels: [{ modelId: 'voice-model', type: 'audio' }], catalogConnections: [{ id: 'audio-mapping', endpointId: endpoint.id, modelId: 'voice-model', upstreamModelId: 'vendor/voice', enabled: true }] };
  const state = { endpoints: [{ ...endpoint, providerId: provider.id }], modelSupplies: [] };
  let row = catalogueChannels(state, provider, 'voice-model')[0];
  assert.equal(channelUrl(provider, row), ''); assert.equal(channelInterfaceIssue(provider, row), '');
  provider.catalogConnections[0].health = { task: 'speech' };
  row = catalogueChannels(state, provider, 'voice-model')[0];
  assert.equal(channelUrl(provider, row), 'https://audio.example.invalid/v1/audio/speech');
  assert.equal(row.apiAddresses[0].baseUrl, channelUrl(provider, row));
  provider.catalogConnections[0].health.task = 'transcription';
  assert.equal(channelUrl(provider, catalogueChannels(state, provider, 'voice-model')[0]), 'https://audio.example.invalid/v1/audio/transcriptions');
});

test('candidate receipts preserve actual credential and template versions with the same safe diagnostic summary', () => {
  const draft = save(fixture()), item = job(draft), result = batch(item, 'failed');
  let state = track(draft, item); state.currentRole = '运营人员';
  result.configVersion = 7; result.credentialId = 'candidate-key-reference'; result.credentialVersion = 5;
  Object.assign(result.items[0], { templateVersion: 11, upstreamStatus: 429, stage: 'request', retryAfter: 45, upstreamRequestId: 'candidate-request', suggestion: '稍后明确重试。', message: 'Bearer candidate-sensitive-value', usage: { total_tokens: 0, responseBody: 'candidate-raw-response' }, cost: 0 });
  const originalConnection = structuredClone(endpoints(state)[0].connectionTest), next = receive(state, item, result), record = endpoints(next)[0].candidateConfiguration.tests.at(-1);
  assert.equal(record.operator, '平台管理员'); assert.equal(record.configurationRevision, 0); assert.equal(record.configVersion, 7);
  assert.equal(record.credentialId, result.credentialId); assert.equal(record.credentialVersion, 5); assert.equal(record.templateVersion, 11);
  assert.equal(record.statusCode, 429); assert.equal(record.retryAfter, 45); assert.equal(record.upstreamRequestId, 'candidate-request'); assert.equal(record.suggestion, '稍后明确重试。');
  assert.deepEqual(record.usage, { total_tokens: 0 }); assert.equal(record.cost, 0); assert.equal(record.source, 'mock'); assert.equal(record.simulated, true);
  assert.ok(!JSON.stringify(next).includes('candidate-sensitive-value')); assert.ok(!JSON.stringify(next).includes('candidate-raw-response'));
  assert.deepEqual(endpoints(next)[0].connectionTest, originalConnection);
});
