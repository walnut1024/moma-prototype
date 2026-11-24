import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { startLocalBackend } from '../database/local-runtime.js';
import { modelChanges } from '../server/model-repository.js';
import { domainModelWorkspace } from '../src/mock/model-fields.js';
import { modelLibrary } from '../src/admin-v2/model-library.js';
import { providerRemovalPlan } from '../src/admin-v2/provider-removal.js';
import { providerApiKeysDraft } from '../src/admin-v2/provider-management.js';
import { providerKeyGroups } from '../src/admin-v2/provider-key-groups.js';

test('D1 rejects retired provider import and preserves material and price history during two-step removal', { timeout: 120000 }, async () => {
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
  const writeCounts = () => local.db.prepare('SELECT (SELECT COUNT(*) FROM operations) AS operations, (SELECT COUNT(*) FROM audit_events) AS audits').first();
  const save = async (state, operation, data) => {
    const result = await send(body(state, operation, data));
    assert.equal(result.status, 200, JSON.stringify(result.data));
    return reload();
  };
  try {
    assert.equal((await send(body({ revision: 0 }, 'providerRemovalCommit', {}))).status, 401);
    const login = await request('/auth/login', { accountId: 'admin-001', accessCode: code });
    assert.equal(login.status, 200); cookie = login.cookie;
    const original = await reload(), model = original.models[0], counts = await writeCounts();
    const master = modelLibrary(original).find(row => row.id === (model.templateId || model.id));
    const profile = { name: 'D1 删除测试服务商', code: 'd1-provider-removal', sourceType: 'thirdParty' };
    const retired = await send(body(original, 'providerIntake', {
      document: { provider: { name: profile.name, code: profile.code, source_type: profile.sourceType } }, confirmed: true,
    }));
    assert.equal(retired.status, 422);
    assert.equal(retired.data.error.code, 'BUSINESS_BLOCKED');
    assert.match(retired.data.error.message, /未知模型运营操作/);
    assert.deepEqual(await reload(), original);
    assert.deepEqual(await writeCounts(), counts);

    let state = await save(original, 'provider', { operation: 'create', values: profile });
    const providerId = state.providers.find(row => row.code === profile.code).id;
    const owner = state => state.providers.find(row => row.id === providerId);
    const providerCommand = (operation, values) => save(state, 'provider', { operation, objectId: providerId, values });
    const secrets = ['fixture-removal-key-123456', 'fixture-removal-key-654321'];
    const { apiKeys } = await providerApiKeysDraft(secrets);
    state = await providerCommand('keyGroupSave', { name: '接入账号组' });
    const groupId = providerKeyGroups(owner(state)).find(row => row.name === '接入账号组').id;
    state = await providerCommand('addApiKeys', { apiKeys, groupId });
    state = await providerCommand('supplierChannelCreate', {
      name: '删除测试连接', protocol: 'OpenAI', interfaceType: 'openai', baseUrl: 'https://api.example.com/v1',
      authMode: 'group', keyGroupId: groupId, models: [{ libraryId: master.id, upstreamModelId: 'vendor/removal-fixture' }],
    });
    const { id: associationId, endpointId } = owner(state).catalogConnections[0];
    const scope = { providerId, endpointId, associationId };
    state = await save(state, 'channelProcurementPublish', { ...scope, expectedPriceRevision: 0, confirmed: true,
      scenarios: [{ name: '输入 Token', listPrice: '0', unit: '百万 Token', currency: 'CNY' }],
    });
    state = await save(state, 'channelCapacitySave', { ...scope, expectedCapacityRevision: 0, limits: { tpm: 10000000 } });
    const provider = owner(state), channel = provider.catalogConnections[0];
    assert.deepEqual(providerKeyGroups(provider).find(row => row.id === groupId).keyIds, provider.apiKeys.map(row => row.id));
    assert.deepEqual(provider.apiKeys.map(row => row.fingerprint), apiKeys.map(row => row.fingerprint));
    for (const secret of secrets) assert(!JSON.stringify(state).includes(secret));
    const target = { providerId };
    assert.equal(channel.enabled, false);
    assert.equal(channel.capacityLimits.tpm, 10000000);
    assert.equal(channel.procurementVersions.at(-1).pricing.scenarios[0].listPrice, 0);
    assert.equal(state.modelTemplates.length, original.modelTemplates.length);
    const configured = structuredClone(state), service = configured.models.find(row => row.id === model.id);
    Object.assign(service, { serviceMode: 'provider', callsEnabled: true, listingStatus: '已上架', releaseStage: 'gray',
      serviceProviders: [{ providerId: provider.id, channelId: channel.id, channelName: '目标连接', callId: 'removal-contract-call', status: '已关联', callsEnabled: true, listingStage: 'gray', grayTenantIds: [] }] });
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
    assert.equal(state.models.find(row => row.id === model.id).serviceProviders[0].channelUnavailableReason, '连接未接入');
    assert.deepEqual(state.modelTemplates, prepared.modelTemplates);
    assert.deepEqual(await history(), preserved);
    for (const audit of oldAudits) assert.equal(await local.db.prepare('SELECT record_json FROM audit_events WHERE id=?').bind(audit.id).first('record_json'), audit.record_json);
    assert.ok(await local.db.prepare('SELECT deleted_at FROM suppliers WHERE id=?').bind(provider.id).first('deleted_at'));
    assert.equal(state.models.find(row => row.id === model.id).serviceProviders[0].callsEnabled, false);
    assert.equal((await local.db.prepare('PRAGMA foreign_key_check').all()).results.length, 0);
  } finally { await local.runtime.dispose(); }
});
