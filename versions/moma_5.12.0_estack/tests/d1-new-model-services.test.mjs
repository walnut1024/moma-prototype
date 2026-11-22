import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import test from 'node:test';
import { startLocalBackend } from '../database/local-runtime.js';
import { initializeApplication } from '../server/application.js';
import { resourceId } from '../src/resource-id.mjs';
import { domainModelWorkspace } from '../src/mock/model-fields.js';
import { mappingCandidates } from '../src/admin-v2/service-model-mappings.js';
import { channelFingerprint } from '../src/admin-v2/provider-channels.js';
import { initialRoutingParameters, globalPolicyDefaults } from '../src/admin-v2/global-routing-parameters.mjs';

test('new model services share D1, protect imported records, and inherit the persisted global route strategy', async t => {
  const origin = 'https://example.test';
  const endpoint = '/model-services-new';
  const accessCode = randomBytes(18).toString('hex');
  const hash = createHash('sha256').update(accessCode).digest('hex');
  const { db, runtime } = await startLocalBackend({ demo: true, loginHashes: { 'admin-001': hash, 'admin-002': hash } });
  t.after(() => runtime.dispose());

  async function request(path, { cookie, body, site = origin, operationId = body?.operationId } = {}) {
    const response = await runtime.dispatchFetch(origin + '/api/v1' + path, {
      method: body ? 'POST' : 'GET',
      headers: { ...(cookie && { cookie }), ...(operationId && { 'idempotency-key': operationId }),
        ...(body && { origin: site, 'x-moma-request': '1', 'content-type': 'application/json' }) },
      ...(body && { body: JSON.stringify(body) }),
    });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  const login = async accountId => {
    const result = await request('/auth/login', { body: { accountId, accessCode } });
    assert.equal(result.status, 200);
    return result.cookie;
  };
  const chrome = await login('admin-001');
  const inApp = await login('admin-001');
  const observer = await login('admin-002');
  const model = { id: resourceId('model-service'), name: 'service example', callId: 'example-local-model', modelId: '',
    modelName: '', type: 'text', note: 'original note', description: '', listed: false,
    channels: [{ id: resourceId('service-channel'), channelId: 'mock-service-channel:original:1',
      fingerprint: 'mock-service-channel:original:1', name: 'original channel', provider: '模拟渠道',
      upstreamId: 'mock/original', enabled: true, simulated: true, priority: 0, weight: 37, context: 32000 }],
    createdBy: 'original creator', createdAt: '2026-11-20T11:37:24.000Z', tags: '' };
  const command = (action, row, revision = 0, id = row?.id) => ({ action, id, row, revision, operationId: resourceId('operation') });
  const imported = command('import', model);
  const run = (body, cookie = inApp) => request(endpoint, { cookie, body });

  assert.equal((await request(endpoint)).status, 401);
  assert.equal((await request(endpoint, { cookie: observer })).status, 403);
  assert.equal((await run(imported, observer)).status, 403);
  assert.equal((await request(endpoint, { cookie: inApp, body: imported, site: 'https://other.test' })).status, 403);
  assert.equal((await run({ ...imported, row: { ...model, callId: 'invalid call id ' } })).status, 400);
  assert.deepEqual((await request(endpoint, { cookie: chrome })).data.rows, []);

  assert.equal((await run(command('import', { ...model, priorityGroups: [0.5] }))).status, 400);
  assert.equal((await run(command('import', { ...model, priorityGroups: [2, 2] }))).status, 400);
  const first = await run(imported);
  assert.equal(first.status, 200);
  assert.deepEqual(first.data.row, { ...model, routingCustom:false, failoverCustom:false, revision: 1 });
  assert.deepEqual((await request(endpoint, { cookie: chrome })).data.rows, [first.data.row]);
  assert.deepEqual((await run(imported)).data, first.data);
  assert.deepEqual((await request('/operations/' + imported.operationId, { cookie: inApp })).data, first.data);
  assert.equal((await run(command('save', { ...model, channels: [], id: resourceId('model-service') }))).data.error.code, 'DUPLICATE_CALL_ID');
  const invalidListing = await run(command('save', { ...model, listed: true }, 1));
  assert.equal(invalidListing.status, 400);

  const edits = await Promise.all([
    run(command('save', { ...model, priorityGroups: [0, 2], note: 'first edit' }, 1)),
    run(command('save', { ...model, priorityGroups: [0, 2], note: 'second edit' }, 1), chrome),
  ]);
  assert.deepEqual(edits.map(result => result.status).sort(), [200, 409]);
  const [saved] = (await request(endpoint, { cookie: chrome })).data.rows;
  assert.equal(saved.revision, 2);
  assert.deepEqual(saved.priorityGroups, [0, 2]);
  assert.ok(saved.channels.every(channel => channel.priority !== 2));
  assert.equal(saved.createdAt, model.createdAt);
  assert.equal(saved.createdBy, model.createdBy);
  assert.deepEqual((await run(command('import', model))).data.row, saved);
  const failover = {retry_policy:{TimeoutErrorRetries:0,RateLimitErrorRetries:3},max_fallbacks:1,timeout:20,numRetries:4,allowedFails:3,cooldownTime:60,retryConditions:['429'],failoverEnabled:true};
  assert.equal((await run(command('save',{...saved,failoverCustom:true,failover:{...failover,retryConditions:['404']}},2))).status,400);
  const strategy = command('save', { ...saved, routingCustom:true, failoverCustom:true, failover, routingStrategy: 'latency-based-routing' }, 2);
  assert.equal((await run({ ...strategy, row: { ...saved, routingStrategy: ['least-busy'] } })).status, 400);
  assert.equal((await run({ ...strategy, row: { ...saved, routingStrategy: 'round-robin' } })).status, 400);
  const changed = await run(strategy);
  assert.equal(changed.status, 200);
  assert.deepEqual(changed.data.row, { ...saved, routingCustom:true, failoverCustom:true, failover, routingStrategy: 'latency-based-routing', revision: 3 });
  assert.deepEqual((await run(strategy)).data, changed.data);
  assert.deepEqual((await request(endpoint, { cookie: chrome })).data.rows, [changed.data.row]);
  const reset = await run(command('save', { ...changed.data.row, routingCustom:false, routingStrategy: 'simple-shuffle' }, 3));
  assert.equal(reset.status, 200);
  assert.equal(reset.data.row.routingCustom,false);
  assert.deepEqual(reset.data.row.failover,failover);
  assert.deepEqual(reset.data.row.channels, model.channels);
  assert.equal(reset.data.row.routingStrategy, 'simple-shuffle');
  assert.equal((await run(command('delete', undefined, 1, model.id))).status, 409);
  assert.equal((await run(command('delete', undefined, 4, model.id))).status, 200);
  assert.deepEqual((await run(command('import', model))).data, { id: model.id, row: null });
  assert.deepEqual((await request(endpoint, { cookie: chrome })).data, { defaults: {timeout:60,numRetries:2,allowedFails:3,cooldownTime:30,retryConditions:['429','超时','5xx'],failoverEnabled:true,strategy:'simple-shuffle'}, rows: [], deletedIds: [model.id] });
  assert.equal(await db.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE entity_type='new-model-service'").first('n'), 5);
  assert.equal((await request('/health')).data.schemaVersion, 18);

  const materialId = 'template-glm-5.3';
  const workspace = await request('/model-operations', { cookie: chrome });
  assert.equal(workspace.status, 200);
  const candidates = mappingCandidates(domainModelWorkspace(workspace.data), { modelId: materialId })
    .filter(candidate => !candidate.reason);
  assert.ok(candidates.length >= 2);
  const service = { id: resourceId('model-service'), name: 'GLM 新模型服务', callId: 'glm-test-new-service',
    modelId: '', type: 'text', listed: false, channels: [] };
  const created = await run(command('save', service));
  assert.equal(created.status, 200, JSON.stringify(created.data));
  assert.deepEqual(created.data.row.channels, []);
  assert.equal(created.data.row.routingCustom, false);

  const channels = candidates.slice(0, 2).map((candidate, index) => ({
    id: resourceId('service-channel'), channelId: candidate.id, fingerprint: channelFingerprint(candidate),
    name: candidate.name, upstreamId: candidate.upstreamModelId, provider: candidate.provider.name,
    enabled: true, priority: 2, weight: index ? 30 : 70,
  }));
  const update = { ...created.data.row, modelId: materialId, channels, priorityGroups: [0, 2] };
  assert.equal((await run(command('save', { ...update, channels: [channels[0], channels[0]] }, 1))).status, 400);
  assert.equal((await run(command('save', { ...update, channels: [{ ...channels[0], fingerprint: 'stale' }] }, 1))).status, 400);
  const linked = await run(command('save', update, 1));
  assert.equal(linked.status, 200, JSON.stringify(linked.data));
  assert.deepEqual(linked.data.row.channels, channels);
  assert.deepEqual(linked.data.row.priorityGroups, [0, 2]);
  assert.equal(linked.data.row.modelId, materialId);

  await initializeApplication(db);
  const app = await request('/application', { cookie: chrome });
  assert.equal(app.status, 200);
  const operationId = resourceId('operation');
  const global = await request('/application/commands', { cookie: chrome, body: {
    operationId, expectedRevision: app.data.revision,
    action: { type: 'saveGlobalRoutingParameters', values: { ...initialRoutingParameters, ...globalPolicyDefaults, strategy: 'least-busy' } },
  } });
  assert.equal(global.status, 200, JSON.stringify(global.data));
  const refreshed = (await request(endpoint, { cookie: inApp })).data;
  assert.equal(refreshed.defaults.strategy, 'least-busy');
  assert.deepEqual(refreshed.rows.find(row => row.id === service.id), linked.data.row);

});
