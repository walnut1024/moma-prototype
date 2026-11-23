import { legacySupplierState } from './legacy-supplier-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { commitAdminState, persistModelAction } from '../src/admin-v2/store.js';
import { supplierChannelAssociations } from '../src/admin-v2/supplier-resources.js';
import { channelBlockReason } from '../src/admin-v2/provider-channels.js';
import { connectionFingerprint } from '../src/admin-v2/connection-state.js';
import { channelChangeImpact, channelCandidateStatus, channelEvidenceSignature, activeChannelProcurement, channelProcurementSnapshot, assertDirectChannelMutation, keyGroupCandidateStatus, CHANNEL_EVIDENCE_MAX_AGE_MS } from '../src/admin-v2/channel-change-management.js';
import { providerKeyGroups } from '../src/admin-v2/provider-key-groups.js';
import { CHANNEL_LIST_TYPES, channelListPaths, channelListType, channelProtocolPaths, channelProtocolUsesFullAddress, connectionDirectoryRows, filterConnections, prepareListedChannelInterface } from '../src/admin-v2/channel-connection-directory.js';
import { modelTaskUrl } from '../src/admin-v2/channel-interface.js';

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

test('the connection directory groups models by ID and keeps empty connections and sibling model rows', () => {
  const state = fixture(), current = endpoint(state);
  state.endpoints.push({ ...current, id: 'empty-connection', status: '停用', connectionTest: null });
  const rows = connectionDirectoryRows(state, [owner(state)]);
  const shared = rows.find(row => row.id === current.id);
  const empty = rows.find(row => row.id === 'empty-connection');
  assert.equal(shared.modelCount, 2);
  assert.equal(channelListType(shared), 'OpenAI Chat Completions');
  assert.deepEqual(channelListPaths(shared), ['/chat/completions']);
  assert.deepEqual(shared.models.map(row => row.association.id), mappings(state).map(row => row.id));
  assert.equal(shared.name, empty.name);
  assert.equal(empty.modelCount, 0);
  assert.deepEqual(filterConnections(rows, { query: 'vendor/chat', providerId, status: '已启用' }), [shared]);
  assert.deepEqual(filterConnections(rows, { query: 'vendor/chat', providerId: 'other' }), []);
});

test('channel list names the configured interface and distinguishes the video API paths', () => {
  const label = (endpoint, models = [], interfaceLabel = '其他') => channelListType({ endpoint, models, interfaceLabel });
  assert.equal(label({ interfaceType: 'openai-responses' }), 'OpenAI Responses');
  assert.equal(label({ interfaceType: 'anthropic' }), 'Anthropic Messages');
  assert.equal(label({ interfaceType: 'openai' }, [{ master: { type: 'embedding' } }]), 'OpenAI Embeddings');
  for (const [path, name] of [
    ['/v1/embeddings', 'OpenAI Embeddings'],
    ['/api/v3/contents/generations/tasks', '火山方舟 Video Generation'],
    ['/api/v1/services/aigc/video-generation/video-synthesis', 'DashScope Video Generation'],
    ['/api/v1/services/aigc/image2video/video-synthesis', 'DashScope Video Generation'],
    ['/v1/video_generation', 'MiniMax Video Generation'],
  ]) assert.equal(label({ baseUrl: 'https://api.example.invalid' + path + '/' }), name);
  assert.equal(label({ interfaceType: 'custom', baseUrl: 'https://api.example.invalid/v1/generate',
    taskUrls: { video: 'https://api.example.invalid/v1/video_generation' } }), 'MiniMax Video Generation');
  assert.equal(label({ baseUrl: 'https://api.example.invalid/v1/video_generation', adapterDraft: {} }, [], '待适配'), '待适配');
  assert.equal(label({ baseUrl: 'https://api.example.invalid/v1/custom' }), '其他');
});

test('the channel creation choices round-trip to the same list type and model request address', () => {
  const origin = 'https://api.example.invalid';
  const choices = [
    ['openai', 'OpenAI Chat Completions', '/v1', 'text', '/v1/chat/completions'],
    ['openai-responses', 'OpenAI Responses', '/v1', 'text', '/v1/responses'],
    ['anthropic', 'Anthropic Messages', '/v1', 'text', '/v1/messages'],
    ['openai-embeddings', 'OpenAI Embeddings', '/v1/embeddings', 'embedding', '/v1/embeddings'],
    ['ark-video', '火山方舟 Video Generation', '/api/v3/contents/generations/tasks', 'video', '/api/v3/contents/generations/tasks'],
    ['dashscope-video', 'DashScope Video Generation', '/api/v1/services/aigc/video-generation/video-synthesis', 'video', '/api/v1/services/aigc/video-generation/video-synthesis'],
    ['minimax-video', 'MiniMax Video Generation', '/v1/video_generation', 'video', '/v1/video_generation'],
  ];
  assert.deepEqual(CHANNEL_LIST_TYPES.map(({ id, label }) => [id, label]), choices.map(([id, label]) => [id, label]));
  for (const [interfaceType, label, basePath, modelType, taskPath] of choices) {
    const endpoint = prepareListedChannelInterface({ interfaceType, baseUrl: origin + basePath });
    assert.equal(endpoint.baseUrl, origin + basePath);
    assert.equal(channelListType({ endpoint, models: [] }), label);
    assert.equal(modelTaskUrl(endpoint, modelType), origin + taskPath);
    assert.deepEqual(channelListPaths({ endpoint, models: [] }), [taskPath.startsWith(basePath + '/') ? taskPath.slice(basePath.length) : taskPath]);
    const relative = CHANNEL_LIST_TYPES.find(type => type.id === interfaceType).paths[0];
    assert.equal(channelProtocolPaths({ interfaceType, baseUrl: origin + basePath })[0], relative);
    assert.equal(channelProtocolPaths({ interfaceType, baseUrl: '' })[0], relative);
  }
  assert.throws(() => prepareListedChannelInterface({ interfaceType: 'ark-video', baseUrl: origin + '/v1/video_generation' }), /完整请求地址/);
  assert.throws(() => prepareListedChannelInterface({ interfaceType: 'openai-embeddings', baseUrl: origin + '/v1' }), /完整/);
  assert.throws(() => prepareListedChannelInterface({ interfaceType: 'anthropic', baseUrl: origin + '/v1/embeddings' }), /不匹配/);
});

test('endpoint previews honor gateway prefixes, configured tasks, and saved embedding roots', () => {
  const baseUrl = 'https://api.example.invalid/tenant/v2';
  assert.deepEqual(channelProtocolPaths({ interfaceType: '', baseUrl }), []);
  assert.deepEqual(channelProtocolPaths({ interfaceType: 'openai-responses', baseUrl }), ['/responses']);
  const taskPath = '/api/v1/services/aigc/image2video/video-synthesis';
  assert.deepEqual(channelProtocolPaths({ interfaceType: 'dashscope-video', baseUrl: 'https://api.example.invalid' + taskPath })[1], taskPath.slice('/api/v1'.length));
  const current = { endpoint: { interfaceType: 'openai', baseUrl: baseUrl + '/old' }, models: [{ master: { type: 'embedding' } }] };
  assert.equal(channelProtocolUsesFullAddress('openai-embeddings', current), false);
  assert.deepEqual(channelProtocolPaths({ interfaceType: 'openai-embeddings', baseUrl }, current), ['/embeddings']);
});

test('a shared connection change checks even disabled model mappings and preserves each model channel name', () => {
  const state = fixture(), [first, second] = mappings(state);
  const disabled = owner(state).catalogConnections.find(row => row.id === second.id);
  Object.assign(disabled, { enabled: false, sourceName: '保留上游模型名' });
  const prepared = run(state, 'channelCandidateSave', { ...args(state), allAssociations: true, config: { baseUrl: 'https://candidate.example.invalid/v1' } });
  const staged = testCandidate(prepared, { associationIds: [first.id] });
  const applyConnection = current => run(current, 'supplierChannelEdit', {
    ...args(current), confirmed: true, allAssociations: true, connectionNameOnly: true, name: '共享连接新名称',
    expectedUpdatedAt: endpoint(current).updatedAt, expectedProviderUpdatedAt: owner(current).updatedAt,
  });
  assert.throws(() => applyConnection(staged), /尚未测试/);
  assert.throws(() => applyCandidate(staged), /尚未测试/);
  assert.throws(() => run(staged, 'channelCandidateApply', { ...args(staged), confirmed: true, unlinked: true }), /已有模型/);
  assert.equal(endpoint(staged).baseUrl, endpoint(state).baseUrl);
  const next = applyConnection(testCandidate(staged, { associationIds: [second.id] }));
  const current = next.endpoints.find(row => row.id === endpoint(state).id);
  const model = supplierChannelAssociations(next, owner(next), current.id).find(row => row.id === second.id);
  assert.equal(current.name, '共享连接新名称');
  assert.equal(current.baseUrl, 'https://candidate.example.invalid/v1');
  assert.equal(model.sourceName, disabled.sourceName);
  assert.equal(model.enabled, false);
  assert.deepEqual(model.pricing, second.pricing);
});

test('channel-owned credential candidates do not add a reusable credential to the provider pool', async () => {
  const { providerApiKeysDraft, providerApiKeyRows } = await import('../src/admin-v2/provider-management.js');
  const state = fixture(), current = endpoint(state), provider = owner(state);
  const key = (await providerApiKeysDraft(['mock-private-connection-credential'])).apiKeys[0];
  const staged = run(state, 'supplierChannelEdit', {
    ...args(state), baseUrl: current.baseUrl, prepareConnection: true, channelOwned: true, newApiKey: key,
    expectedUpdatedAt: current.updatedAt, expectedProviderUpdatedAt: provider.updatedAt,
  });
  const candidate = endpoint(staged).candidateConfiguration;
  assert.deepEqual(endpoint(staged).apiKeys, current.apiKeys);
  assert.equal(candidate.config.apiKeys[0].scope, 'channel');
  assert.equal(candidate.config.apiKeys[0].id, candidate.config.apiKeyId);
  assert.throws(() => applyCandidate(staged), /尚未测试/);
  const next = applyCandidate(testCandidate(staged));
  assert.equal(endpoint(next).apiKeyId, candidate.config.apiKeyId);
  assert.deepEqual(owner(next).apiKeys, provider.apiKeys);
  assert.ok(!providerApiKeyRows(next, owner(next)).some(row => row.apiKey.id === candidate.config.apiKeyId));
  assert.ok(!JSON.stringify(next).includes('mock-private-connection-credential'));
});

test('an empty connection can save a new configuration without fabricating evidence or enabling supply', () => {
  const state = fixture(), current = endpoint(state);
  owner(state).catalogConnections = owner(state).catalogConnections.filter(row => row.endpointId !== current.id);
  const staged = createCandidate(state);
  assert.throws(() => applyCandidate(staged), /尚未完成验证/);
  const next = run(staged, 'channelCandidateApply', { ...args(staged), confirmed: true, unlinked: true });
  const saved = endpoint(next);
  assert.equal(saved.status, '停用');
  assert.equal(saved.baseUrl, 'https://candidate.example.invalid/v1');
  assert.equal(saved.connectionTest, null);
  assert.equal(saved.connectionQualification, null);
  assert.deepEqual(saved.configurationVersions.at(-1).evidenceIds, []);
  stableBusiness(state, next);
});

test('editing a named task protocol replaces previous task addresses only after applying the candidate', () => {
  const state = fixture(), current = endpoint(state), provider = owner(state);
  provider.catalogConnections = provider.catalogConnections.filter(row => row.endpointId !== current.id);
  const oldPath = '/v1/video_generation';
  Object.assign(current, { interfaceType: 'custom', protocol: '其他', baseUrl: 'https://active.example.invalid' + oldPath,
    taskUrls: { video: 'https://active.example.invalid' + oldPath } });
  const newPath = '/api/v3/contents/generations/tasks';
  const data = { ...args(state), expectedUpdatedAt: current.updatedAt, expectedProviderUpdatedAt: provider.updatedAt,
    prepareConnection: true, allAssociations: true, modelProtocol: 'ark-video', baseUrl: 'https://candidate.example.invalid' + newPath };
  assert.throws(() => run(state, 'supplierChannelEdit', { ...data, baseUrl: current.baseUrl }), /完整请求地址/);
  const staged = run(state, 'supplierChannelEdit', data);
  assert.equal(endpoint(staged).baseUrl, current.baseUrl);
  assert.deepEqual(endpoint(staged).taskUrls, current.taskUrls);
  assert.deepEqual(endpoint(staged).candidateConfiguration.config.taskUrls, {});
  const next = run(staged, 'channelCandidateApply', { ...args(staged), confirmed: true, unlinked: true });
  assert.deepEqual(channelListPaths({ endpoint: endpoint(next), models: [] }), [newPath]);
  assert.equal(channelListType({ endpoint: endpoint(next), models: [] }), '火山方舟 Video Generation');
});

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

test('address-only edits require validation and preserve other protocol addresses and credentials', () => {
  const state = fixture(), current = endpoint(state), baseUrl = 'https://address-only.example.invalid/v1';
  const secondary = { protocol: 'Anthropic', baseUrl: 'https://other.example.invalid/v1/messages' };
  for (const mapping of owner(state).catalogConnections.filter(row => row.endpointId === current.id)) {
    mapping.apiAddresses = [{ protocol: 'OpenAI', baseUrl: current.baseUrl }, secondary];
  }
  const change = (snapshot, config = { baseUrl }) => run(snapshot, 'channelCandidateSave', { ...args(snapshot), addressOnly: true, config });
  assert.throws(() => change(state, { baseUrl, capacity: 10 }), /仅允许修改服务地址（Base URL）/);
  assert.throws(() => change(createCandidate(state)), /现有候选配置/);
  assert.throws(() => run(state, 'supplierChannelEdit', { ...args(state), unlinkedAddress: true, baseUrl, expectedUpdatedAt: current.updatedAt ?? null }), /已有模型/);
  const candidate = change(state);
  assert.equal(endpoint(candidate).baseUrl, current.baseUrl);
  assert.throws(() => applyCandidate(candidate), /尚未测试/);
  const next = applyCandidate(testCandidate(candidate));
  assert.equal(endpoint(next).baseUrl, baseUrl);
  for (const key of ['protocol', 'authMode', 'keyGroupId', 'apiKeys']) assert.deepEqual(endpoint(next)[key], current[key]);
  for (const mapping of mappings(next)) assert.deepEqual(mapping.apiAddresses[1], secondary);
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
  const expired = channelCandidateStatus(state, providerId, ep.id, { at: Date.now() + CHANNEL_EVIDENCE_MAX_AGE_MS + 1000 });
  assert.equal(expired.ready, false);
  assert.ok(expired.checks.some(check => check.testResult === '已过期'));
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
  assert.throws(() => createCandidate(initial, { keyGroupId: 'foreign-group' }), /当前服务商/);
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

test('publishing one channel cost preserves another channel for the same model and all technical evidence', () => {
  let state = fixture();
  state = commitAdminState(state, { type: 'modelOperations', operation: 'provider', data: {
    operation: 'supplierChannelCreate', objectId: providerId, values: {
      name: '独立成本连接', interfaceType: 'openai', protocol: 'OpenAI', baseUrl: 'https://independent-cost.example.invalid/v1',
      authMode: 'group', keyGroupId: 'default', models: [{ libraryId: 'model-2', upstreamModelId: 'vendor/chat', scenarios: price(7) }],
    },
  } });
  const independent = state.endpoints.find(row => row.name === '独立成本连接');
  const before = structuredClone(supplierChannelAssociations(state, owner(state), independent.id));
  const connection = structuredClone(endpoint(state));
  const saved = run(state, 'channelProcurementPublish', { ...quoteArgs(state), confirmed: true, scenarios: price(0) });
  assert.deepEqual(supplierChannelAssociations(saved, owner(saved), independent.id), before);
  assert.equal(channelProcurementSnapshot(mappings(saved)[0]).pricing.scenarios[0].listPrice, 0);
  assert.deepEqual(endpoint(saved), connection);
  stableBusiness(state, saved);
});

test('channel list paths retain gateway prefixes and configured task paths without inventing URLs', () => {
  const origin = 'https://api.example.invalid';
  const paths = (endpoint, models = []) => channelListPaths({ endpoint, models });
  assert.deepEqual(paths({ interfaceType: 'openai', baseUrl: origin + '/tenant/gateway/v2' },
    [{ master: { type: 'embedding' } }]), ['/embeddings']);
  const dashscopePath = '/api/v1/services/aigc/image2video/video-synthesis';
  assert.deepEqual(paths({ baseUrl: origin + dashscopePath + '/' }), [dashscopePath]);
  assert.deepEqual(paths({ interfaceType: 'custom', baseUrl: origin + '/v2/generate',
    taskUrls: { video: origin + '/v2/video', text: origin + '/v2/generate' },
    customAdapter: { routes: [{ path: '/v2/chat' }, { path: '/v2/video' }] } }),
  ['/v2/video', '/v2/generate', '/v2/chat']);
  assert.deepEqual(paths({ interfaceType: 'custom', baseUrl: '未配置' }), []);
  assert.deepEqual(paths({ baseUrl: origin + '/v1' }), []);
  assert.deepEqual(paths({ baseUrl: origin + dashscopePath, adapterDraft: {} }), []);
});
