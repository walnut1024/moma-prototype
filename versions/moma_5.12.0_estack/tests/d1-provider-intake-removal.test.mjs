import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { startLocalBackend } from '../database/local-runtime.js';
import { modelChanges } from '../server/model-repository.js';
import { domainModelWorkspace } from '../src/mock/model-fields.js';
import { modelLibrary } from '../src/admin-v2/model-library.js';
import { PROVIDER_JSON_TEMPLATE, exportProviderJson } from '../src/admin-v2/provider-intake.js';
import { providerRemovalPlan } from '../src/admin-v2/provider-removal.js';
import { providerApiKeysDraft } from '../src/admin-v2/provider-management.js';
import { providerKeyGroups } from '../src/admin-v2/provider-key-groups.js';

test('D1 provider intake and two-step removal are atomic, conflict checked and preserve material and price history', { timeout: 120000 }, async () => {
  const code = randomBytes(24).toString('hex');
  const local = await startLocalBackend({ demo: true, loginHashes: { 'admin-001': createHash('sha256').update(code).digest('hex') } });
  let cookie;
  const request = async (path, body, key) => {
    const response = await local.runtime.dispatchFetch('https://example.test/api/v1' + path, {
      method: body ? 'POST' : 'GET', headers: { ...(cookie ? { cookie } : {}), ...(body ? { origin: 'https://example.test', 'x-moma-request': '1', 'content-type': 'application/json' } : {}), ...(key ? { 'idempotency-key': key } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  };
  const reload = async () => { const result = await request('/model-operations'); assert.equal(result.status, 200); return domainModelWorkspace(result.data); };
  const body = (state, operation, data) => ({ operationId: crypto.randomUUID(), expectedRevision: state.revision, action: { type: 'modelOperations', operation, data } });
  const send = command => request('/model-operations/commands', command, command.operationId);
  const remove = (state, target, operation) => send(body(state, operation, { target, expectedSignature: providerRemovalPlan(state, target).signature, confirmed: true }));
  const history = async () => Object.fromEntries(await Promise.all(['materials', 'price_versions', 'price_items', 'route_versions', 'route_members', 'market_orders', 'market_calls'].map(async table => [table, (await local.db.prepare('SELECT * FROM ' + table + ' ORDER BY rowid').all()).results.map(row => { if (table !== 'materials') return row; const { record_json, updated_at: _updatedAt, ...columns } = row; const record = JSON.parse(record_json); return { ...columns, profile: record.profile, capabilities: record.capabilities, description: record.description, maker: record.maker }; })])));
  try {
    assert.equal((await send(body({ revision: 0 }, 'providerIntake', {}))).status, 401);
    const login = await request('/auth/login', { accountId: 'admin-001', accessCode: code });
    assert.equal(login.status, 200); cookie = login.cookie;
    const original = await reload(), file = structuredClone(PROVIDER_JSON_TEMPLATE), model = original.models[0];
    const master = modelLibrary(original).find(row => row.id === (model.templateId || model.id));
    Object.assign(file.provider.models[0], { canonical_slug: master.modelId, model_name: master.name, model_type: master.type });
    file.provider.models[0].mappings[0].procurement = { scenarios: [{ name: '输入 Token', listPrice: '0', unit: '百万 Token', currency: 'CNY' }] };
    const invalid = structuredClone(file); invalid.provider.models[0].mappings[0].connection_id = 'foreign';
    assert.equal((await send(body(original, 'providerIntake', { document: invalid, confirmed: true }))).status, 422);
    assert.deepEqual(await reload(), original);
    const { apiKeys } = await providerApiKeysDraft(['fixture-intake-key-123456', 'fixture-intake-key-654321']);
    const invalidGroup = await send(body(original, 'providerIntake', { document: file, apiKeys, key_group_name: '默认 API 密钥组', confirmed: true }));
    assert.equal(invalidGroup.status, 422);
    assert.deepEqual(await reload(), original);
    const intake = body(original, 'providerIntake', { document: file, apiKeys, key_group_name: '接入账号组', confirmed: true }), saved = await send(intake);
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    assert.deepEqual((await send(intake)).data, saved.data);
    let state = await reload(), provider = state.providers.find(row => row.code === file.provider.code), channel = provider.catalogConnections[0];
    assert.deepEqual(providerKeyGroups(provider).find(row => row.name === '接入账号组').keyIds, provider.apiKeys.map(row => row.id));
    assert.deepEqual(provider.apiKeys.map(row => row.fingerprint), apiKeys.map(row => row.fingerprint));
    assert(!JSON.stringify(state).includes('fixture-intake-key-123456'));
    const target = { providerId: provider.id }, exports = exportProviderJson(state, provider);
    assert.equal(channel.enabled, false);
    assert.equal(channel.capacityLimits.tpm, 10000000);
    assert.equal(channel.procurementVersions.at(-1).pricing.scenarios[0].listPrice, 0);
    assert.equal(state.modelTemplates.length, original.modelTemplates.length);
    const configured = structuredClone(state), service = configured.models.find(row => row.id === model.id);
    Object.assign(service, { serviceMode: 'provider', callsEnabled: true, listingStatus: '已上架', releaseStage: 'gray',
      serviceProviders: [{ providerId: provider.id, channelId: channel.id, channelName: '目标渠道', callId: 'removal-contract-call', status: '已关联', callsEnabled: true, listingStage: 'gray', grayTenantIds: [] }] });
    await local.db.batch(modelChanges(local.db, state, configured));
    state = await reload();
    const preserved = await history(), oldAudits = (await local.db.prepare('SELECT id,record_json FROM audit_events ORDER BY id').all()).results;
    assert.equal((await remove(state, target, 'providerRemovalCommit')).status, 422);
    assert.deepEqual(await reload(), state);
    assert.equal((await remove(state, target, 'providerRemovalPrepare')).status, 200);
    const prepared = await reload();
    assert.equal(providerRemovalPlan(prepared, target).ready, true);
    assert.equal(prepared.models.find(row => row.id === model.id).serviceProviders[0].callsEnabled, false);
    assert.equal(prepared.models.find(row => row.id === model.id).serviceProviders[0].listingStage, 'withdrawn');
    assert.equal((await remove(state, target, 'providerRemovalCommit')).status, 409);
    assert.equal((await remove(prepared, target, 'providerRemovalCommit')).status, 200);
    state = await reload();
    assert.ok(!state.providers.some(row => row.id === provider.id));
    assert.equal(state.models.find(row => row.id === model.id).serviceProviders[0].channelUnavailableReason, '渠道未接入');
    assert.deepEqual(state.modelTemplates, prepared.modelTemplates);
    assert.deepEqual(await history(), preserved);
    for (const audit of oldAudits) assert.equal(await local.db.prepare('SELECT record_json FROM audit_events WHERE id=?').bind(audit.id).first('record_json'), audit.record_json);
    assert.ok(await local.db.prepare('SELECT deleted_at FROM suppliers WHERE id=?').bind(provider.id).first('deleted_at'));
    assert.equal((await send(body(state, 'providerIntake', { document: exports, confirmed: true }))).status, 200);
    state = await reload(); provider = state.providers.find(row => row.code === file.provider.code);
    assert.equal(provider.id, target.providerId);
    assert.equal(provider.catalogConnections.filter(row => !row.deletedAt).length, 1);
    assert.equal(provider.catalogConnections.filter(row => row.deletedAt).length, 1);
    assert.equal(state.models.find(row => row.id === model.id).serviceProviders[0].callsEnabled, false);
    assert.equal((await local.db.prepare('PRAGMA foreign_key_check').all()).results.length, 0);
    const large = structuredClone(PROVIDER_JSON_TEMPLATE);
    large.provider.code = 'bulk-provider'; large.provider.name = '批量录入合同测试';
    large.provider.models = Array.from({ length: 500 }, (_, i) => ({ canonical_slug: 'large-' + i, model_name: '批量模型' + i, model_type: 'text',
      model_info: { documentation: 'https://example.com/' + 'a'.repeat(900) }, upstream_reference: { url: 'https://example.com/' + 'a'.repeat(1800) }, mappings: [{ connection_id: 'openai', upstream_model_id: 'large-' + i }] }));
    const largeBody = body(state, 'providerIntake', { document: large, confirmed: true });
    assert.ok(Buffer.byteLength(JSON.stringify(largeBody)) > 1024 * 1024);
    const oversized = await send(largeBody);
    assert.equal(oversized.status, 413, JSON.stringify(oversized.data));
    assert.deepEqual(await reload(), state);
    for (const model of large.provider.models) { model.model_info = {}; delete model.upstream_reference; }
    const bulkSaved = await send(body(state, 'providerIntake', { document: large, confirmed: true }));
    assert.equal(bulkSaved.status, 200, JSON.stringify(bulkSaved.data));
    state = await reload(); const bulk = state.providers.find(row => row.code === 'bulk-provider'), beforeBulkRemoval = await history();
    assert.equal(bulk.catalogConnections.length, 500);
    const bulkRemoved = await remove(state, { providerId: bulk.id }, 'providerRemovalCommit');
    assert.equal(bulkRemoved.status, 200, JSON.stringify(bulkRemoved.data));
    assert.deepEqual(await history(), beforeBulkRemoval);
    assert.equal((await local.db.prepare('PRAGMA foreign_key_check').all()).results.length, 0);
  } finally { await local.runtime.dispose(); }
});
