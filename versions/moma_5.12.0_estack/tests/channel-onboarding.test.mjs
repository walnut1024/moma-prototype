import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAdminState, commitAdminState, serializeAdminState } from '../src/admin-v2/store.js';
import { channelOnboardingTransaction, channelDrafts, channelDraftIssue, previewChannelModels, validateChannelRows } from '../src/admin-v2/channel-onboarding.js';
import { libraryRemovalIssue } from '../src/admin-v2/model-library.js';
import { resolveChannelAssociationModel } from '../src/admin-v2/channel-association-model.js';
import { channelEvidenceSignature, candidateTestPlan } from '../src/admin-v2/channel-change-management.js';
import { catalogueChannels, channelBlockReason } from '../src/admin-v2/provider-channels.js';
import { connectionFingerprint } from '../src/admin-v2/connection-state.js';
import { activeSupplyPrice, priceItems } from '../src/admin-v2/model-management.js';
const state = () => parseAdminState(null);
const value = { providerId: 'provider-moma', name: '持久草稿', interfaceType: 'openai', baseUrl: 'https://example.com/v1', keyGroupId: 'default' };
const rows = [{ id: 'r1', libraryId: 'model-2', upstreamModelId: 'vendor/model-1', scenarios: [] }];
const run = (s, operation, data) => commitAdminState(s, { type: 'modelOperations', operation, data });

test('draft persistence preserves only nonsecret fields, revisions and selection without creating channels', () => {
  const s = state(), next = run(s, 'channelDraftSave', { value, rows, step: 1 }), draft = channelDrafts(next)[0];
  assert.equal(draft.value.name, value.name); assert.equal(draft.draftRevision, 1); assert.deepEqual(next.endpoints, s.endpoints);
  const restored = parseAdminState(serializeAdminState(next)); assert.deepEqual(channelDrafts(restored)[0], draft);
  assert.equal(channelDraftIssue(restored, draft), '');
  assert.throws(() => run(restored, 'channelDraftSave', { id: draft.id, expectedRevision: 0, value, rows }), /已变化/);
  assert.equal(channelDrafts(run(restored, 'channelDraftDiscard', { id: draft.id, expectedRevision: 1 })).length, 0);
});

test('secret payloads and unsafe credential URLs cannot enter persisted draft or audit', () => {
  for (const data of [{ value: { ...value, secret: 'sensitive' }, rows }, { value, rows: [{ ...rows[0], secret: 'sensitive' }] }, { value: { ...value, baseUrl: 'https://example.com/v1?api_key=sensitive' }, rows }]) assert.throws(() => channelOnboardingTransaction(state(), { operation: 'channelDraftSave', data }), /密钥|认证|查询/);
});

test('draft references protect minimal metadata until explicitly discarded', () => {
  let s = state();
  s = run(s, 'channelMetadataCreate', { name: 'Minimal', modelId: 'minimal-record', type: 'embedding', profile: { tasks: ['文本向量化'], inputModalities: ['文本'], resultTypes: ['向量'] } });
  const id = s.audits[0].objectId; assert.equal(s.modelTemplates.find(row => row.id === id).description, '');
  s = run(s, 'channelDraftSave', { value, rows: [{ ...rows[0], libraryId: id }] });
  assert.match(libraryRemovalIssue(s, id), /草稿/);
  const draft = channelDrafts(s)[0]; s = run(s, 'channelDraftDiscard', { id: draft.id, expectedRevision: 1 }); assert.equal(libraryRemovalIssue(s, id), '');
});

test('minimal model validates identity and explicit task/input/output without guessing capabilities', () => {
  const s = state(), data = { name: 'Minimal', modelId: 'minimal-model', type: 'text', profile: { tasks: ['对话'], inputModalities: ['文本'], outputModalities: ['文本'] } };
  const next = run(s, 'channelMetadataCreate', data), master = next.modelTemplates.find(row => row.id === next.audits[0].objectId);
  assert.equal(master.capabilities.context, null); assert.equal(master.capabilities.tools, null); assert.deepEqual(next.providers, s.providers);
  assert.throws(() => run(next, 'channelMetadataCreate', data), /已存在/);
  assert.throws(() => run(s, 'channelMetadataCreate', { ...data, profile: {} }), /任务/);
  assert.throws(() => run(s, 'channelMetadataCreate', { ...data, profile: { ...data.profile, tasks: ['编造任务'] } }), /任务/);
});

test('discovery exact matching still requires confirmation and similar names never merge', () => {
  const s = state(), master = s.models.find(row => row.id === 'model-2');
  const preview = previewChannelModels(s, value.providerId, [{ id: master.modelId }, { id: master.modelId + '-other' }]);
  assert.equal(preview.rows[0].libraryId, master.id); assert.equal(preview.rows[0].selected, false); assert.equal(preview.rows[0].confirmed, false);
  assert.equal(preview.rows[1].libraryId, ''); assert.equal(preview.rows[1].type, null);
  const selection = [{ ...preview.rows[0], selected: true }]; assert.ok(validateChannelRows(s, selection).some(row => row.field === 'confirmed'));
  assert.deepEqual(validateChannelRows(s, [{ ...selection[0], confirmed: true }]), []);
});

test('partial discovery cannot declare deletion and preview never changes saved mappings or prices', () => {
  const s = state(), provider = s.providers.find(row => row.id === value.providerId), endpointId = provider.catalogConnections.find(row => row.endpointId).endpointId;
  const partial = previewChannelModels(s, provider.id, [], { endpointId, complete: false }); assert.deepEqual(partial.missing, []);
  const before = structuredClone(s); run(s, 'channelDiscoveryPreview', { providerId: provider.id, endpointId, models: [], complete: true }); assert.deepEqual(s, before);
});

test('row validation identifies duplicates, missing identity, incompatible task and incomplete cost by stable row id', () => {
  const s = state(), selected = [{ ...rows[0], selected: true }, { ...rows[0], id: 'r2', scenarios: [{ name: '输入', unit: 'Token', listPrice: '' }] }];
  const errors = validateChannelRows(s, selected, { interfaceType: 'anthropic' }); assert.ok(errors.some(row => row.rowId === 'r2' && row.field === 'upstreamModelId')); assert.ok(errors.some(row => row.rowId === 'r2' && row.field === 'scenarios'));
  assert.deepEqual(validateChannelRows(s, [{ ...rows[0], selected: false }]), [{ rowId: '', field: 'selection', message: '请选择 1–50 个模型' }]);
});

test('draft and metadata operations obey existing role and persist transaction guards', () => {
  for (const operation of ['channelDraftSave', 'channelMetadataCreate']) assert.throws(() => run({ ...state(), currentRole: '运维人员' }, operation, { value, rows }), /无权/);
});

test('bulk selection rejects stale and duplicate identities atomically across channels', async () => {
  const { catalogueChannels, channelFingerprint } = await import('../src/admin-v2/provider-channels.js');
  const s = state(), provider = s.providers.find(row => row.id === value.providerId), row = catalogueChannels(s, provider, 'GLM-5.2')[0];
  const selection = { providerId: provider.id, endpointId: row.endpointId, modelId: row.modelId, associationId: row.id, expectedFingerprint: channelFingerprint(row) };
  const before = structuredClone(s);
  assert.throws(() => run(s, 'supplierSelection', { action: 'disable', selections: [selection, { ...selection, expectedFingerprint: 'stale' }], confirmed: true }), /已变化|重复/);
  assert.deepEqual(s, before);
  assert.throws(() => run(s, 'supplierSelection', { action: 'disable', selections: [selection] }), /确认/);
  const stopped = run(s, 'supplierSelection', { action: 'disable', selections: [selection], confirmed: true });
  assert.equal(catalogueChannels(stopped, stopped.providers.find(row => row.id === provider.id), 'GLM-5.2')[0].enabled, false);
  assert.deepEqual(stopped.serviceRoutes, s.serviceRoutes);
});

test('draft completion and resource creation share one atomic revision', () => {
  const s = run(state(), 'channelDraftSave', { value, rows }); const draft = channelDrafts(s)[0];
  const next = run(s, 'channelDraftCommit', { id: draft.id, expectedRevision: 1, values: { ...value, protocol: 'OpenAI', addressMode: 'base', models: rows } });
  assert.equal(next.revision, s.revision + 1); assert.equal(channelDrafts(next).length, 0); assert.ok(next.endpoints.some(row => row.name === value.name));
  assert.throws(() => run(next, 'channelDraftCommit', { id: draft.id, expectedRevision: 1, values: {} }), /已变化/);
});

test('mock test job pending request survives refresh and binds a later canonical receipt without replaying effects', async () => {
  const { catalogueChannels } = await import('../src/admin-v2/provider-channels.js');
  const { connectionFingerprint } = await import('../src/admin-v2/connection-state.js');
  let s = state(); const provider = s.providers.find(row => row.id === value.providerId), association = catalogueChannels(s, provider, 'GLM-5.2')[0];
  const masterId = provider.catalogModels.find(row => row.modelId === association.modelId).libraryId;
  const model = { id: masterId, associationId: association.id, upstreamModelId: association.upstreamModelId, type: 'text' };
  const job = { providerId: provider.id, endpointId: association.endpointId, operationId: 'stable-operation-id', serverChannelId: 'server-channel', associationIds: [association.id], signature: connectionFingerprint(association.endpoint), request: { models: [model] } };
  s = run(s, 'channelTestEvidenceJob', job); s = parseAdminState(serializeAdminState(s));
  assert.equal(s.endpoints.find(row => row.id === association.endpointId).serverTestJobs[0].request.operationId, job.operationId);
  s = run(s, 'channelTestEvidenceJob', { ...job, batchId: 'canonical-batch' });
  const batch = { id: 'canonical-batch', channelId: job.serverChannelId, providerId: provider.id, status: 'completed', source: 'mock', signature: 'server-signature', items: [{ id: 'canonical-item', model, status: 'passed', usage: null, cost: null }] };
  s = run(s, 'channelTestEvidenceReceipt', { providerId: provider.id, endpointId: association.endpointId, batch });
  const row = catalogueChannels(s, s.providers.find(row => row.id === provider.id), 'GLM-5.2')[0];
  assert.equal(row.testHistory.at(-1).source, 'mock'); assert.equal(row.testHistory.at(-1).usage, null);
  const replay = run(s, 'channelTestEvidenceReceipt', { providerId: provider.id, endpointId: association.endpointId, batch });
  assert.equal(catalogueChannels(replay, replay.providers.find(row => row.id === provider.id), 'GLM-5.2')[0].testHistory.length, row.testHistory.length);
});

test('foreign and stale mock receipts cannot qualify another model or a changed configuration', async () => {
  const { catalogueChannels } = await import('../src/admin-v2/provider-channels.js');
  const { connectionFingerprint } = await import('../src/admin-v2/connection-state.js');
  let s = state(); const provider = s.providers.find(row => row.id === value.providerId), association = catalogueChannels(s, provider, 'GLM-5.2')[0];
  const model = { id: 'model-2', associationId: association.id, upstreamModelId: association.upstreamModelId, type: 'text' };
  s = run(s, 'channelTestEvidenceJob', { providerId: provider.id, endpointId: association.endpointId, batchId: 'stale-batch', serverChannelId: 'server-channel', signature: 'old-configuration', associationIds: [association.id], request: { models: [model] } });
  const before = connectionFingerprint(s.endpoints.find(row => row.id === association.endpointId));
  const batch = { id: 'stale-batch', channelId: 'server-channel', providerId: provider.id, status: 'completed', source: 'mock', items: [{ id: 'stale-item', status: 'passed', model }] };
  const next = run(s, 'channelTestEvidenceReceipt', { providerId: provider.id, endpointId: association.endpointId, batch });
  const result = catalogueChannels(next, next.providers.find(row => row.id === provider.id), 'GLM-5.2')[0];
  assert.equal(result.testHistory.at(-1).current, false); assert.equal(connectionFingerprint(result.endpoint), before);
  assert.deepEqual(result.health, association.health);
  assert.throws(() => run(s, 'channelTestEvidenceReceipt', { providerId: provider.id, endpointId: association.endpointId, batch: { ...batch, items: [{ ...batch.items[0], model: { ...batch.items[0].model, associationId: 'foreign' } }] } }), /其他渠道/);
});

test('temporary group checks retain their own history without replacing official qualification', async () => {
  const { catalogueChannels } = await import('../src/admin-v2/provider-channels.js');
  let s = state(); const provider = s.providers.find(row => row.id === value.providerId), association = catalogueChannels(s, provider, 'GLM-5.2')[0];
  const context = { providerId: provider.id, endpointId: association.endpointId, signature: 'temporary-group-only', operationId: 'temporary-operation' };
  const request = { operationId: context.operationId, channelId: 'temporary-channel', models: [{ id: 'model-2', associationId: association.id, upstreamModelId: association.upstreamModelId, type: 'text' }] };
  s = run(s, 'channelTemporaryTestJob', { ...context, request });
  s = parseAdminState(serializeAdminState(s));
  s = run(s, 'channelTemporaryTestJob', { ...context, request, batchId: 'temporary-batch' });
  const before = structuredClone(s), batch = { id: 'temporary-batch', providerId: provider.id, channelId: request.channelId, source: 'mock', status: 'completed', items: [{ id: 'temporary-item', model: request.models[0], status: 'passed' }] };
  const next = run(s, 'channelTemporaryTestReceipt', { ...context, batch });
  assert.deepEqual(next.providers, before.providers); assert.deepEqual(next.serviceRoutes, before.serviceRoutes); assert.deepEqual(next.modelSalePrices, before.modelSalePrices);
  const endpoint = next.endpoints.find(row => row.id === association.endpointId), oldEndpoint = before.endpoints.find(row => row.id === association.endpointId);
  assert.deepEqual(endpoint.connectionTest, oldEndpoint.connectionTest); assert.equal(endpoint.status, oldEndpoint.status); assert.equal(endpoint.temporaryTestRecords.length, 1);
  const repeated = run(next, 'channelTemporaryTestReceipt', { ...context, batch });
  assert.equal(repeated.endpoints.find(row => row.id === endpoint.id).temporaryTestRecords.length, 1);
});

function ordinaryFixture(legacy = false) {
  const s = state(), provider = s.providers.find(row => row.id === (legacy ? 'provider-self' : value.providerId));
  const association = catalogueChannels(s, provider, legacy ? 'glm-5.3' : 'GLM-5.2')[0];
  return { s, providerId: provider.id, endpointId: association.endpointId, associationId: association.id, modelId: association.modelId };
}
const ordinaryRow = (s, f) => catalogueChannels(s, s.providers.find(row => row.id === f.providerId), f.modelId).find(row => row.id === f.associationId);
function ordinaryJob(s, f) {
  const provider = s.providers.find(row => row.id === f.providerId), association = ordinaryRow(s, f), master = resolveChannelAssociationModel(s, provider, association), operationId = crypto.randomUUID();
  const model = { id: master.id, associationId: association.id, upstreamModelId: association.upstreamModelId, type: master.type };
  return { providerId: provider.id, endpointId: f.endpointId, operationId, serverChannelId: `mock-${f.endpointId}`, associationIds: [association.id], signature: connectionFingerprint(association.endpoint), request: { operationId, channelId: `mock-${f.endpointId}`, models: [model] } };
}
function ordinaryBatch(job, status = 'passed', endedAt = new Date().toISOString()) {
  return { id: crypto.randomUUID(), channelId: job.serverChannelId, providerId: job.providerId, source: 'mock', status: 'completed', signature: 'mock-task-signature', endedAt, items: job.request.models.map(model => ({ id: crypto.randomUUID(), model: { ...model, probe: model.probe || model.type }, status, evidenceSource: 'mock', current: true, endedAt, message: status, usage: null, cost: null })) };
}
const ordinaryReceive = (s, f, batch) => run(s, 'channelTestEvidenceReceipt', { providerId: f.providerId, endpointId: f.endpointId, batch });

test('ordinary jobs and candidate plans resolve an implicit model by exact supply identity without name guessing', () => {
  const f = ordinaryFixture(true), provider = f.s.providers.find(row => row.id === f.providerId), association = ordinaryRow(f.s, f);
  assert.equal(association.managed, false);
  const master = resolveChannelAssociationModel(f.s, provider, association);
  assert.equal(master.id, 'model-glm53');
  const draft = run(f.s, 'channelCandidateSave', { providerId: f.providerId, endpointId: f.endpointId, expectedRevision: 0, config: { baseUrl: 'https://legacy.example.invalid/v1/chat/completions' } });
  const candidate = draft.endpoints.find(row => row.id === f.endpointId).candidateConfiguration;
  const plan = candidateTestPlan(draft, { providerId: f.providerId, endpointId: f.endpointId, candidateId: candidate.id, expectedRevision: 0 });
  assert.equal(plan.records.find(row => row.associationId === association.id).modelId, master.id);
  const job = ordinaryJob(f.s, f), pending = run(f.s, 'channelTestEvidenceJob', job);
  assert.equal(pending.endpoints.find(row => row.id === f.endpointId).serverTestJobs[0].associationSignatures[association.id], channelEvidenceSignature(f.s, provider.id, association));
  const ambiguous = structuredClone(f.s), supply = ambiguous.modelSupplies.find(row => row.endpointId === f.endpointId && row.upstreamModelId === association.upstreamModelId);
  ambiguous.modelSupplies.push({ ...supply, id: 'ambiguous-exact-supply', modelId: 'model-2' });
  assert.throws(() => resolveChannelAssociationModel(ambiguous, ambiguous.providers.find(row => row.id === provider.id), association), /多个模型资料/);
  assert.throws(() => ordinaryJob(ambiguous, f), /多个模型资料/);
});

test('implicit ordinary receipts preserve actual procurement, original enable semantics and existing online qualification', () => {
  const f = ordinaryFixture(true), row = ordinaryRow(f.s, f), job = ordinaryJob(f.s, f), batch = ordinaryBatch(job, 'failed');
  const supply = f.s.modelSupplies.find(item => item.endpointId === f.endpointId && item.upstreamModelId === row.upstreamModelId), master = f.s.models.find(item => item.id === supply.modelId);
  const cost = priceItems(activeSupplyPrice(f.s, supply.id), master), supplies = structuredClone(f.s.modelSupplies), prices = structuredClone(f.s.supplyPrices);
  assert.equal(channelBlockReason(f.s.providers.find(item => item.id === f.providerId), row, { runtime: true }), '');
  let pending = run(f.s, 'channelTestEvidenceJob', job); pending = run(pending, 'channelTestEvidenceJob', { ...job, batchId: batch.id });
  const next = ordinaryReceive(pending, f, batch), result = ordinaryRow(next, f), provider = next.providers.find(item => item.id === f.providerId), raw = provider.catalogConnections.find(item => item.id === row.id);
  assert.equal(result.id, row.id); assert.equal(result.managed, false); assert.equal(result.enabled, row.enabled);
  assert.equal(Object.hasOwn(raw, 'enabled'), false); assert.equal(raw.qualification, undefined);
  assert.equal(result.health.source, 'mock'); assert.equal(result.health.result, '失败'); assert.equal(result.health.simulated, true);
  assert.equal(channelBlockReason(provider, result), 'failed'); assert.equal(channelBlockReason(provider, result, { runtime: true }), '');
  assert.deepEqual(priceItems(activeSupplyPrice(next, supply.id), master), cost);
  assert.deepEqual(next.modelSupplies, supplies); assert.deepEqual(next.supplyPrices, prices);
  assert.deepEqual(next.serviceRoutes, f.s.serviceRoutes); assert.deepEqual(next.modelSalePrices, f.s.modelSalePrices);
});

test('a pending job retains its original model signature across capability changes and later batch recovery', () => {
  const f = ordinaryFixture(), job = ordinaryJob(f.s, f), batch = ordinaryBatch(job);
  let pending = run(f.s, 'channelTestEvidenceJob', job), master = pending.models.find(row => row.id === job.request.models[0].id);
  master.capabilities.output += 1;
  const before = structuredClone(ordinaryRow(pending, f).health), signature = pending.endpoints.find(row => row.id === f.endpointId).serverTestJobs[0].associationSignatures[f.associationId];
  pending = run(pending, 'channelTestEvidenceJob', { ...job, batchId: batch.id });
  assert.equal(pending.endpoints.find(row => row.id === f.endpointId).serverTestJobs[0].associationSignatures[f.associationId], signature);
  const next = ordinaryReceive(pending, f, batch), row = ordinaryRow(next, f);
  assert.equal(row.testHistory.at(-1).current, false); assert.deepEqual(row.health, before);
});

test('a late older ordinary success cannot replace a more recent failed health record', t => {
  const base = Date.now(); t.mock.timers.enable({ apis: ['Date'], now: base });
  const f = ordinaryFixture(), first = ordinaryJob(f.s, f), second = ordinaryJob(f.s, f), old = ordinaryBatch(first, 'passed', new Date(base + 1000).toISOString()), recent = ordinaryBatch(second, 'failed', new Date(base + 2000).toISOString());
  let pending = run(run(f.s, 'channelTestEvidenceJob', { ...first, batchId: old.id }), 'channelTestEvidenceJob', { ...second, batchId: recent.id });
  t.mock.timers.tick(3000); pending = ordinaryReceive(pending, f, recent); const next = ordinaryReceive(pending, f, old), row = ordinaryRow(next, f);
  assert.equal(row.health.result, '失败'); assert.equal(row.health.id, recent.items[0].id);
  assert.ok(row.testHistory.some(item => item.id === old.items[0].id));
  assert.equal(channelBlockReason(next.providers.find(item => item.id === f.providerId), row, { runtime: true }), '');
});

test('ordinary receipts reject another source, channel, provider or incomplete model set without committing partial data', () => {
  const f = ordinaryFixture(), job = ordinaryJob(f.s, f), batch = ordinaryBatch(job), pending = run(f.s, 'channelTestEvidenceJob', { ...job, batchId: batch.id }), original = structuredClone(pending);
  for (const patch of [{ source: 'upstream' }, { channelId: 'foreign' }, { providerId: 'foreign' }, { items: [] }]) assert.throws(() => ordinaryReceive(pending, f, { ...batch, ...patch }), /内置|已知|集合/);
  const changed = structuredClone(job); changed.request.models[0].upstreamModelId = 'different';
  assert.throws(() => run(pending, 'channelTestEvidenceJob', { ...changed, batchId: batch.id }), /同一提交/);
  assert.deepEqual(pending, original);
});

test('receipt diagnostics retain actual execution metadata and only controlled redacted summaries', () => {
  const f = ordinaryFixture(), job = ordinaryJob(f.s, f), batch = ordinaryBatch(job, 'failed');
  const startedAt = new Date(Date.parse(batch.endedAt) - 250).toISOString();
  batch.configVersion = 6; batch.credentialId = 'mock-credential-reference'; batch.credentialVersion = 8;
  Object.assign(batch.items[0], { startedAt, durationMs: 250, upstreamStatus: 429, stage: 'request', code: 'upstream_rate_limited', templateVersion: 3, upstreamRequestId: 'mock-upstream-request', traceId: 'mock-platform-trace', retryAfter: 30, message: 'Bearer do-not-store-literal', suggestion: '核对 https://user:raw-password@example.invalid/api?api_key=raw-query-value', usage: { input_tokens: 12, output_tokens: 3, total_tokens: 15, requestBody: 'raw-production-prompt' }, cost: { amount: 1000000, currency: 'CNY', unit: '百万 Token', versionId: 'mock-cost-version', secret: 'raw-cost-secret' }, responseBody: 'raw-response-payload', operator: 'untrusted-receipt-actor' });
  let pending = run(f.s, 'channelTestEvidenceJob', job);
  pending.currentRole = '运营人员';
  pending.endpoints.find(row => row.id === f.endpointId).configurationRevision = 22;
  pending = run(pending, 'channelTestEvidenceJob', { ...job, batchId: batch.id });
  const next = ordinaryReceive(pending, f, batch), record = ordinaryRow(next, f).testHistory.at(-1);
  assert.equal(record.operator, '平台管理员'); assert.equal(record.configurationRevision, 0);
  assert.equal(record.configVersion, 6); assert.equal(record.credentialId, batch.credentialId); assert.deepEqual(record.credentialIds, [batch.credentialId]); assert.equal(record.credentialVersion, 8); assert.equal(record.templateVersion, 3);
  assert.equal(record.providerId, f.providerId); assert.equal(record.endpointId, f.endpointId); assert.equal(record.associationId, f.associationId);
  assert.equal(record.startedAt, startedAt); assert.equal(record.endedAt, batch.endedAt); assert.equal(record.durationMs, 250); assert.equal(record.status, 429); assert.equal(record.stage, 'request');
  assert.equal(record.upstreamRequestId, 'mock-upstream-request'); assert.equal(record.traceId, 'mock-platform-trace'); assert.equal(record.retryAfter, 30);
  assert.deepEqual(record.usage, { input_tokens: 12, output_tokens: 3, total_tokens: 15 });
  assert.deepEqual(record.cost, { amount: 1000000, currency: 'CNY', unit: '百万 Token', versionId: 'mock-cost-version' });
  const stored = JSON.stringify(next);
  for (const forbidden of ['do-not-store-literal', 'raw-password', 'raw-query-value', 'raw-production-prompt', 'raw-cost-secret', 'raw-response-payload', 'untrusted-receipt-actor']) assert.ok(!stored.includes(forbidden), forbidden);
  assert.match(record.message, /已隐藏/); assert.match(decodeURI(record.suggestion), /已隐藏/);
});

test('missing diagnostic metadata stays unknown and an explicitly known zero cost is preserved', () => {
  const f = ordinaryFixture(), job = ordinaryJob(f.s, f), batch = ordinaryBatch(job);
  batch.items[0].cost = 0; batch.items[0].usage = { input_tokens: -1, total_tokens: 'unknown', prompt: 'must-not-be-stored' };
  const pending = run(f.s, 'channelTestEvidenceJob', { ...job, batchId: batch.id }), next = ordinaryReceive(pending, f, batch), record = ordinaryRow(next, f).testHistory.at(-1);
  assert.equal(record.credentialId, null); assert.equal(record.credentialVersion, null); assert.equal(record.templateVersion, null); assert.equal(record.configVersion, null);
  assert.equal(record.usage, null); assert.equal(record.cost, 0); assert.ok(!JSON.stringify(record).includes('must-not-be-stored'));
});

test('temporary receipts retain the same safe execution summary without changing formal qualification', () => {
  const f = ordinaryFixture(), base = ordinaryJob(f.s, f), context = { providerId: f.providerId, endpointId: f.endpointId, signature: 'temporary-key-group-signature', operationId: crypto.randomUUID() };
  const request = { ...base.request, operationId: context.operationId, channelId: 'temporary-key-group-channel', models: base.request.models.map(model => ({ ...model, rawPrompt: 'temporary-raw-prompt' })) };
  let pending = run(f.s, 'channelTemporaryTestJob', { ...context, request });
  pending.currentRole = '运营人员';
  pending = run(pending, 'channelTemporaryTestJob', { ...context, request, batchId: 'safe-temporary-batch' });
  const endedAt = new Date().toISOString(), before = structuredClone(pending), batch = { id: 'safe-temporary-batch', providerId: f.providerId, channelId: request.channelId, source: 'mock', status: 'completed', configVersion: 4, credentialId: 'temporary-credential-reference', credentialVersion: 2, signature: 'temporary-server-signature', endedAt, items: [{ id: 'safe-temporary-item', model: request.models[0], status: 'failed', upstreamStatus: 429, retryAfter: 60, templateVersion: 9, upstreamRequestId: 'temporary-request', startedAt: endedAt, endedAt, durationMs: 0, stage: 'request', message: 'Bearer temporary-sensitive-value', suggestion: '等待账号请求窗口恢复。', usage: { total_tokens: 0, raw: 'temporary-raw-response' }, cost: 0 }] };
  const next = run(pending, 'channelTemporaryTestReceipt', { ...context, batch }), record = next.endpoints.find(row => row.id === f.endpointId).temporaryTestRecords.at(-1);
  assert.equal(record.operator, '平台管理员'); assert.equal(record.configurationRevision, 0); assert.equal(record.configVersion, 4);
  assert.equal(record.credentialId, batch.credentialId); assert.equal(record.credentialVersion, 2); assert.equal(record.templateVersion, 9);
  assert.equal(record.status, 'failed'); assert.equal(record.statusCode, 429); assert.equal(record.result, '失败'); assert.equal(record.retryAfter, 60); assert.equal(record.upstreamRequestId, 'temporary-request');
  assert.deepEqual(record.usage, { total_tokens: 0 }); assert.equal(record.cost, 0); assert.equal(record.source, 'mock'); assert.equal(record.simulated, true);
  for (const raw of ['temporary-sensitive-value', 'temporary-raw-prompt', 'temporary-raw-response']) assert.ok(!JSON.stringify(next).includes(raw));
  assert.deepEqual(next.providers, before.providers); assert.deepEqual(next.serviceRoutes, before.serviceRoutes); assert.deepEqual(next.endpoints.find(row => row.id === f.endpointId).connectionTest, before.endpoints.find(row => row.id === f.endpointId).connectionTest);
});
