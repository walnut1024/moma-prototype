import { legacySupplierState } from './legacy-supplier-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { commitAdminState, persistModelAction } from '../src/admin-v2/store.js';
import { supplierChannelAssociations } from '../src/admin-v2/supplier-resources.js';
import { channelBlockReason } from '../src/admin-v2/provider-channels.js';
import { connectionFingerprint } from '../src/admin-v2/connection-state.js';
import { channelChangeImpact, channelCandidateStatus, channelEvidenceSignature, activeChannelProcurement, channelProcurementSnapshot, assertDirectChannelMutation, keyGroupCandidateStatus, CHANNEL_EVIDENCE_MAX_AGE_MS } from '../src/admin-v2/channel-change-management.js';
import { providerKeyGroups } from '../src/admin-v2/provider-key-groups.js';

const providerId = 'provider-moma';
const owner = state => state.providers.find(row => row.id === providerId);
const endpoint = state => state.endpoints.find(row => row.name === '候选配置测试');
const mappings = state => supplierChannelAssociations(state, owner(state), endpoint(state).id);
const action = (operation, data) => ({ type: 'modelOperations', operation, data });
const run = (state, operation, data) => commitAdminState(state, action(operation, data));
const args = state => ({ providerId, endpointId: endpoint(state).id, expectedRevision: endpoint(state).configurationRevision || 0, candidateId: endpoint(state).candidateConfiguration?.id });
const price = amount => [{ name: '输入 Token', unit: '百万 Token', currency: 'CNY', listPrice: String(amount) }];

function fixture() {
  let state = legacySupplierState();
  const provider = (operation, values) => { state = commitAdminState(state, { type: 'modelOperations', operation: 'provider', data: { operation, objectId: providerId, values } }); };
  provider('supplierChannelCreate', { name: '候选配置测试', interfaceType: 'openai', protocol: 'OpenAI', baseUrl: 'https://active.example.invalid/v1', authMode: 'group', keyGroupId: 'default', models: [{ libraryId: 'model-2', upstreamModelId: 'vendor/chat', scenarios: price(1) }, { libraryId: 'model-6', upstreamModelId: 'vendor/embedding', scenarios: price(1) }] });
  provider('supplierModelsTest', { endpointId: endpoint(state).id, associationIds: mappings(state).map(row => row.id) });
  provider('supplierModelsEnable', { endpointId: endpoint(state).id, associationIds: mappings(state).map(row => row.id) });
  state.serviceRoutes.push({ id: 'candidate-service-route', serviceId: 'standard:model-2', activeVersion: 1, versions: [{ version: 1, config: { channels: mappings(state).map(row => ({ supplyId: row.id, enabled: true })) } }] });
  return state;
}
const createCandidate = (state, config = { baseUrl: 'https://candidate.example.invalid/v1' }) => run(state, 'channelCandidateSave', { ...args(state), config });
const testCandidate = (state, patch = {}) => run(state, 'channelCandidateTest', { ...args(state), ...patch });
const applyCandidate = state => run(state, 'channelCandidateApply', { ...args(state), confirmed: true });
const stableBusiness = (before, after) => { for (const field of ['models', 'modelSalePrices', 'supplyPrices', 'serviceRoutes']) assert.deepEqual(after[field], before[field], field); };

test('saving and testing a candidate leave current address, credentials, health and service configuration intact', () => {
  const state = fixture(), original = structuredClone(state), candidate = createCandidate(state), tested = testCandidate(candidate);
  assert.equal(endpoint(tested).baseUrl, endpoint(state).baseUrl);
  assert.equal(connectionFingerprint(endpoint(tested)), connectionFingerprint(endpoint(state)));
  assert.deepEqual(endpoint(tested).connectionTest, endpoint(state).connectionTest);
  assert.deepEqual(owner(tested).catalogConnections, owner(state).catalogConnections);
  assert.ok(endpoint(tested).candidateConfiguration.tests.every(row => row.source === 'prototype' && row.simulated));
  assert.equal(channelCandidateStatus(tested, providerId, endpoint(tested).id).ready, true);
  assert.equal(channelCandidateStatus(tested, providerId, endpoint(tested).id, { requireReal: true }).ready, false);
  assert.deepEqual(state, original); stableBusiness(state, tested);
});

test('impact preview precisely tracks shared online mappings and rejects bypassing direct writes', () => {
  const state = fixture(), impact = channelChangeImpact(state, providerId, endpoint(state).id);
  assert.equal(impact.activeAssociationIds.length, 2); assert.equal(impact.services[0].id, 'standard:model-2');
  assert.throws(() => assertDirectChannelMutation(state, 'supplierChannelSave', providerId, { endpointId: endpoint(state).id, mode: 'address', baseUrl: 'https://changed.example.invalid/v1' }), /候选配置/);
  assert.doesNotThrow(() => assertDirectChannelMutation(state, 'supplierChannelSave', providerId, { endpointId: endpoint(state).id, mode: 'info', name: '新名字' }));
});

test('all online mappings need fresh passing candidate tests and no old success can cover a new failure', () => {
  let state = createCandidate(fixture());
  assert.throws(() => applyCandidate(state), /尚未测试/);
  const [first, second] = mappings(state);
  state = testCandidate(state, { associationIds: [first.id] });
  assert.throws(() => applyCandidate(state), /尚未测试/);
  state = testCandidate(state, { associationIds: [second.id] });
  state = testCandidate(state, { associationIds: [first.id], scenarios: { [first.id]: 'unauthorized' } });
  const before = structuredClone(state);
  assert.throws(() => applyCandidate(state), /密钥/); assert.deepEqual(state, before);
  assert.equal(endpoint(state).baseUrl, 'https://active.example.invalid/v1');
});

test('apply atomically switches a validated configuration while preserving mapping IDs, prices, route and history', () => {
  const state = fixture(), tested = testCandidate(createCandidate(state)), next = applyCandidate(tested);
  assert.equal(endpoint(next).baseUrl, 'https://candidate.example.invalid/v1');
  assert.equal(endpoint(next).configurationRevision, 1); assert.equal(endpoint(next).candidateConfiguration, null);
  assert.equal(endpoint(next).configurationVersions.length, 2);
  assert.equal(endpoint(next).configurationTests.length, 2);
  assert.deepEqual(mappings(next).map(row => row.id), mappings(state).map(row => row.id));
  assert.deepEqual(mappings(next).map(row => row.pricing), mappings(state).map(row => row.pricing));
  assert.ok(mappings(next).every(row => channelBlockReason(owner(next), row) === ''));
  stableBusiness(state, next);
  assert.throws(() => run(tested, 'channelCandidateApply', args(tested)), /确认/);
});

test('candidate evidence expires after 24 hours and depends on actual key version, upstream ID and capability', () => {
  const state = testCandidate(createCandidate(fixture())), ep = endpoint(state), mapping = mappings(state)[0];
  assert.equal(channelCandidateStatus(state, providerId, ep.id, { at: Date.now() + CHANNEL_EVIDENCE_MAX_AGE_MS + 1000 }).ready, false);
  const signature = channelEvidenceSignature(state, providerId, mapping, { ...ep, ...ep.candidateConfiguration.config });
  const changed = structuredClone(state); owner(changed).apiKeys.find(row => row.id === owner(changed).defaultApiKeyId).fingerprint = 'a'.repeat(64);
  assert.notEqual(channelEvidenceSignature(changed, providerId, mappings(changed)[0], { ...endpoint(changed), ...endpoint(changed).candidateConfiguration.config }), signature);
  assert.throws(() => applyCandidate(changed), /凭证已变化/);
  const upstream = { ...mapping, upstreamModelId: 'different' };
  assert.notEqual(channelEvidenceSignature(state, providerId, upstream, { ...ep, ...ep.candidateConfiguration.config }), signature);
});

test('newly added service references or mappings force another impact review instead of applying stale test scope', () => {
  const state = testCandidate(createCandidate(fixture())), row = owner(state).catalogConnections.find(item => item.endpointId === endpoint(state).id);
  row.enabled = false;
  assert.throws(() => applyCandidate(state), /引用已变化/);
});

test('discard preserves the live configuration and immutable test history', () => {
  const state = testCandidate(createCandidate(fixture())), next = run(state, 'channelCandidateDiscard', args(state));
  assert.equal(endpoint(next).candidateConfiguration, null);
  assert.deepEqual(endpoint(next).configurationTests, endpoint(state).configurationTests);
  assert.equal(endpoint(next).baseUrl, endpoint(state).baseUrl); stableBusiness(state, next);
});

test('rollback creates a new candidate, requires fresh tests, and appends a version without erasing history', () => {
  const first = applyCandidate(testCandidate(createCandidate(fixture())));
  const rollback = run(first, 'channelCandidateRollback', { ...args(first), targetVersion: 0 });
  assert.equal(endpoint(rollback).baseUrl, 'https://candidate.example.invalid/v1');
  assert.equal(endpoint(rollback).candidateConfiguration.rollbackOf, 0);
  assert.throws(() => applyCandidate(rollback), /尚未测试/);
  const restored = applyCandidate(testCandidate(rollback));
  assert.equal(endpoint(restored).baseUrl, 'https://active.example.invalid/v1');
  assert.equal(endpoint(restored).configurationRevision, 2); assert.equal(endpoint(restored).configurationVersions.length, 3);
  assert.equal(endpoint(restored).configurationVersions[2].rollbackOf, 0);
});

test('credential group candidates refer only to the same supplier and temporary results cannot forge real evidence', () => {
  const initial = fixture();
  assert.throws(() => createCandidate(initial, { keyGroupId: 'foreign-group' }), /当前供应商/);
  assert.throws(() => createCandidate(initial, { apiKey: 'secret' }), /敏感字段/);
  let state = createCandidate(initial, { authMode: 'specific', apiKeyId: owner(initial).apiKeys.find(row => row.id !== owner(initial).defaultApiKeyId).id });
  state = testCandidate(state, { source: 'upstream', simulated: false });
  assert.ok(endpoint(state).candidateConfiguration.tests.every(row => row.source === 'prototype' && row.simulated));
  const next = applyCandidate(state);
  assert.equal(endpoint(next).authMode, 'specific');
  assert.equal(owner(next).defaultApiKeyId, owner(initial).defaultApiKeyId);
});

test('emergency revoke disables all referencing channels and mappings but keeps history, routes and sale prices', () => {
  const state = fixture(), key = owner(state).apiKeys.find(row => row.id === owner(state).defaultApiKeyId);
  const data = { providerId, keyId: key.id, expectedFingerprint: key.fingerprint, confirmed: true };
  const next = run(state, 'credentialEmergencyRevoke', data);
  assert.equal(owner(next).apiKeys.find(row => row.id === key.id).status, 'disabled');
  assert.ok(owner(next).apiKeys.find(row => row.id === key.id).revokedAt);
  assert.equal(endpoint(next).status, '停用'); assert.ok(mappings(next).every(row => !row.enabled && !row.health));
  assert.throws(() => run(state, 'credentialEmergencyRevoke', { ...data, confirmed: false }), /确认/);
  stableBusiness(state, next);
});

test('revoked credentials cannot qualify for candidate application or revive through rollback', () => {
  let state = testCandidate(createCandidate(fixture()));
  const key = owner(state).apiKeys.find(row => row.id === owner(state).defaultApiKeyId);
  state = run(state, 'credentialEmergencyRevoke', { providerId, keyId: key.id, expectedFingerprint: key.fingerprint, confirmed: true });
  assert.throws(() => applyCandidate(state), /凭证已变化|修订|验证/);
});

test('candidate writes respect supplier ownership, revision, roles and failed persistence', () => {
  const state = fixture(), data = { ...args(state), config: { baseUrl: 'https://candidate.example.invalid/v1' } }, before = structuredClone(state);
  assert.throws(() => run(state, 'channelCandidateSave', { ...data, providerId: 'provider-zhipu-direct' }), /不属于/);
  assert.throws(() => run(state, 'channelCandidateSave', { ...data, expectedRevision: 99 }), /修订/);
  assert.throws(() => run({ ...state, currentRole: '运维人员' }, 'channelCandidateSave', data), /无权/);
  assert.throws(() => persistModelAction(state, action('channelCandidateSave', data), { getItem: () => JSON.stringify(state), setItem: () => { throw Error('disk full'); } }), /disk full/);
  assert.deepEqual(state, before);
});

const quoteArgs = state => ({ ...args(state), associationId: mappings(state)[0].id, expectedPriceRevision: mappings(state)[0].procurementRevision || 0 });
test('scheduled procurement does not change active cost before its effective time; publish respects effective and expiry times with no older-price fallback', () => {
  const initial = fixture(), starts = Date.now() + 5000, ends = starts + 5000;
  const draft = run(initial, 'channelProcurementPublish', { confirmed: true, ...quoteArgs(initial), scenarios: price(2), effectiveAt: new Date(starts).toISOString(), expiresAt: new Date(ends).toISOString() });
  assert.equal(mappings(draft)[0].pricing.scenarios[0].listPrice, 1000000);
  const published = draft;
  assert.equal(activeChannelProcurement(mappings(published)[0], Date.now()).version, 0);
  assert.equal(activeChannelProcurement(mappings(published)[0], starts + 1).pricing.scenarios[0].listPrice, 2000000);
  assert.equal(activeChannelProcurement(mappings(published)[0], ends), null);
  assert.deepEqual(initial.modelSalePrices, published.modelSalePrices); assert.deepEqual(initial.serviceRoutes, published.serviceRoutes);
});

test('request procurement snapshots retain the selected version and amount across later price changes', () => {
  const initial = fixture(), selected = channelProcurementSnapshot(mappings(initial)[0]);
  const draft = run(initial, 'channelProcurementPublish', { confirmed: true, ...quoteArgs(initial), scenarios: price(3) }), version = mappings(draft)[0].procurementVersions.at(-1);
  const published = draft;
  const next = channelProcurementSnapshot(mappings(published)[0]);
  assert.equal(selected.pricing.scenarios[0].listPrice, 1000000); assert.equal(next.pricing.scenarios[0].listPrice, 3000000);
  assert.equal(next.versionId, version.id);
  mappings(published)[0].pricing.scenarios[0].listPrice = 999;
  assert.equal(next.pricing.scenarios[0].listPrice, 3000000);
});

test('procurement publishing rejects incomplete amounts, invalid periods, foreign associations and stale revisions', () => {
  const state = fixture();
  assert.throws(() => run(state, 'channelProcurementPublish', { confirmed: true, ...quoteArgs(state), scenarios: price(-1) }), /非负数/);
  assert.throws(() => run(state, 'channelProcurementPublish', { confirmed: true, ...quoteArgs(state), scenarios: price(2), effectiveAt: 'bad' }), /时间/);
  assert.throws(() => run(state, 'channelProcurementPublish', { confirmed: true, ...quoteArgs(state), associationId: 'foreign', scenarios: price(2) }), /不属于/);
  assert.throws(() => run(state, 'channelProcurementPublish', { ...quoteArgs(state), scenarios: [{ ...price(1)[0], listPrice: '' }], confirmed: true }), /补齐/);
  assert.throws(() => run(state, 'channelProcurementPublish', { ...quoteArgs(state), expectedPriceRevision: 99, scenarios: price(1), confirmed: true }), /修订/);
});

const groupArgs = state => ({ providerId, groupId: 'default', expectedGroupVersion: owner(state).keyGroupRevisions?.default || 0, candidateId: owner(state).keyGroupCandidates?.find(row => row.groupId === 'default')?.id });
function groupCandidate(state) {
  const group = providerKeyGroups(owner(state)).find(row => row.id === 'default');
  return run(state, 'keyGroupCandidateSave', { ...groupArgs(state), keyId: group.keyIds.find(id => id !== owner(state).defaultApiKeyId) });
}
test('shared group rotation stages a new major without touching current requests and requires every referenced channel', () => {
  const initial = fixture(), candidate = groupCandidate(initial);
  assert.equal(owner(candidate).defaultApiKeyId, owner(initial).defaultApiKeyId);
  assert.deepEqual(candidate.endpoints, initial.endpoints);
  assert.throws(() => run(candidate, 'keyGroupCandidateApply', { ...groupArgs(candidate), confirmed: true }), /全部测试通过/);
  const partial = run(candidate, 'keyGroupCandidateTest', { ...groupArgs(candidate), endpointIds: [endpoint(candidate).id] });
  assert.equal(keyGroupCandidateStatus(partial, providerId, 'default').ready, false);
  assert.throws(() => run(partial, 'keyGroupCandidateApply', { ...groupArgs(partial), confirmed: true }), /全部测试通过/);
  assert.equal(owner(partial).defaultApiKeyId, owner(initial).defaultApiKeyId); stableBusiness(initial, partial);
});

test('group failures keep the entire active group intact and successful apply switches it once with immutable history', () => {
  const initial = fixture(), candidate = groupCandidate(initial), failedId = mappings(candidate)[0].id;
  const failed = run(candidate, 'keyGroupCandidateTest', { ...groupArgs(candidate), scenarios: { [failedId]: 'unauthorized' } });
  assert.throws(() => run(failed, 'keyGroupCandidateApply', { ...groupArgs(failed), confirmed: true }), /全部测试通过/);
  assert.deepEqual(failed.endpoints, initial.endpoints);
  const tested = run(failed, 'keyGroupCandidateTest', groupArgs(failed));
  assert.equal(keyGroupCandidateStatus(tested, providerId, 'default').ready, true);
  assert.equal(keyGroupCandidateStatus(tested, providerId, 'default', { requireReal: true }).ready, false);
  const expectedKey = owner(tested).keyGroupCandidates[0].keyIds[0];
  const next = run(tested, 'keyGroupCandidateApply', { ...groupArgs(tested), confirmed: true });
  assert.equal(owner(next).defaultApiKeyId, expectedKey); assert.equal(owner(next).keyGroupRevisions.default, 1);
  assert.equal(owner(next).keyGroupVersions.filter(row => row.groupId === 'default').length, 2);
  assert.equal(owner(next).keyGroupCandidates.length, 0);
  assert.ok(mappings(next).every(row => channelBlockReason(owner(next), row) === '')); stableBusiness(initial, next);
});

test('shared group changes detect new channel references, revoked candidates and stale group revisions', () => {
  const initial = fixture(), candidate = groupCandidate(initial);
  const changed = structuredClone(candidate);
  changed.endpoints.push({ ...endpoint(changed), id: 'concurrent-group-reference' });
  assert.equal(keyGroupCandidateStatus(changed, providerId, 'default').ready, false);
  assert.throws(() => run(changed, 'keyGroupCandidateTest', groupArgs(changed)), /已变化/);
  const revoked = structuredClone(candidate), keyId = owner(revoked).keyGroupCandidates[0].keyIds[0];
  owner(revoked).apiKeys.find(row => row.id === keyId).revokedAt = new Date().toISOString();
  assert.equal(keyGroupCandidateStatus(revoked, providerId, 'default').ready, false);
  assert.throws(() => run(candidate, 'keyGroupCandidateSave', { ...groupArgs(candidate), expectedGroupVersion: 99, keyId }), /修订/);
});

test('shared group rollback requires new tests and cannot revive a revoked historical major', () => {
  const initial = fixture(), candidate = groupCandidate(initial), tested = run(candidate, 'keyGroupCandidateTest', groupArgs(candidate));
  const current = run(tested, 'keyGroupCandidateApply', { ...groupArgs(tested), confirmed: true });
  const rollback = run(current, 'keyGroupCandidateRollback', { ...groupArgs(current), targetVersion: 0 });
  assert.throws(() => run(rollback, 'keyGroupCandidateApply', { ...groupArgs(rollback), confirmed: true }), /全部测试通过/);
  const revoked = structuredClone(current), oldKey = owner(revoked).apiKeys.find(row => row.id === owner(initial).defaultApiKeyId);
  oldKey.revokedAt = new Date().toISOString(); oldKey.status = 'disabled';
  assert.throws(() => run(revoked, 'keyGroupCandidateRollback', { ...groupArgs(revoked), targetVersion: 0 }), /未撤销/);
  const discard = run(rollback, 'keyGroupCandidateDiscard', groupArgs(rollback));
  assert.equal(owner(discard).keyGroupCandidates.length, 0); assert.equal(owner(discard).defaultApiKeyId, owner(current).defaultApiKeyId);
});
