import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import test from 'node:test';
import { startLocalBackend } from '../database/local-runtime.js';
import { initializeApplication } from '../server/application.js';
import { resourceId } from '../src/resource-id.mjs';
import { domainModelWorkspace } from '../src/mock/model-fields.js';
import { mappingCandidates } from '../src/admin-v2/service-model-mappings.js';
import { channelFingerprint } from '../src/admin-v2/provider-channels.js';
import { initialRoutingParameters } from '../src/admin-v2/global-routing-parameters.mjs';

test('fresh routing fields use the LiteLLM 1.110.2 constructor defaults', () => {
  assert.deepEqual(initialRoutingParameters, {
    numRetries: 2, retryAfter: 0, timeout: 6000, allowedFails: 3, cooldownTime: 5, max_fallbacks: 5,
  });
});

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
  const model = { id: resourceId('model-service'), name: 'service example', callId: 'example-local-model',
    type: 'text', note: 'original note', description: '', listed: false,
    channels: [{ id: resourceId('service-channel'), channelId: 'mock-service-channel:original:1',
      fingerprint: 'mock-service-channel:original:1', name: 'original channel', provider: '模拟连接',
      upstreamId: 'mock/original', enabled: true, simulated: true, priority: 0, weight: 37, context: 32000 }],
    createdBy: 'original creator', createdAt: '2026-11-20T11:37:24.000Z', tags: '' };
  const command = (action, row, revision = 0, id = row?.id) => ({ action, id, row, revision, operationId: resourceId('operation') });
  const historicalMaterial = { modelId: 'old-record', modelName: 'Original material name', modelDetails: { code: 'legacy-source' } };
  const imported = command('import', { ...model, ...historicalMaterial });
  const run = (body, cookie = inApp) => request(endpoint, { cookie, body });

  assert.equal((await request(endpoint)).status, 401);
  assert.equal((await request(endpoint, { cookie: observer })).status, 403);
  assert.equal((await run(imported, observer)).status, 403);
  assert.equal((await request(endpoint, { cookie: inApp, body: imported, site: 'https://other.test' })).status, 403);
  assert.equal((await run({ ...imported, row: { ...model, callId: 'invalid call id ' } })).status, 400);
  assert.deepEqual((await request(endpoint, { cookie: chrome })).data, {
    defaults: { strategy: 'simple-shuffle' }, rows: [], deletedIds: [],
  });

  assert.equal((await run(command('import', { ...model, priorityGroups: [0.5] }))).status, 400);
  assert.equal((await run(command('import', { ...model, priorityGroups: [2, 2] }))).status, 400);
  const first = await run(imported);
  assert.equal(first.status, 200);
  assert.deepEqual(first.data.row, { ...model, routingCustom:false, failoverCustom:false, revision: 1 });
  const history = JSON.parse(await db.prepare('SELECT record_json FROM new_model_services WHERE id=?').bind(model.id).first('record_json'));
  assert.equal(history.modelId, historicalMaterial.modelId);
  assert.deepEqual(history.modelDetails, historicalMaterial.modelDetails);
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
  const failover = {retry_policy:{TimeoutErrorRetries:0,RateLimitErrorRetries:3},max_fallbacks:1,timeout:60,numRetries:4,allowedFails:3,cooldownTime:30,retryConditions:['429'],failoverEnabled:true};
  assert.equal((await run(command('save',{...saved,failoverCustom:true,failover:{...failover,retryConditions:['404']}},2))).status,400);
  const strategy = command('save', { ...saved, routingCustom:true, failoverCustom:true, failover, routingStrategy: 'latency-based-routing' }, 2);
  assert.equal((await run({ ...strategy, row: { ...saved, routingStrategy: ['least-busy'] } })).status, 400);
  assert.equal((await run({ ...strategy, row: { ...saved, routingStrategy: 'round-robin' } })).status, 400);
  assert.equal((await run({ ...strategy, row: { ...saved, routingStrategy: 'cost-based-routing' } })).status, 400);
  const changed = await run(strategy);
  assert.equal(changed.status, 200);
  assert.deepEqual(changed.data.row, { ...saved, routingCustom:true, failoverCustom:true, failover, routingStrategy: 'latency-based-routing', revision: 3 });
  assert.deepEqual((await run(strategy)).data, changed.data);
  assert.deepEqual((await request(endpoint, { cookie: chrome })).data.rows, [changed.data.row]);
  const reset = await run(command('save', { ...changed.data.row,
    routingCustom: false, routingStrategy: 'simple-shuffle', failoverCustom: false, failover: undefined,
  }, 3));
  assert.equal(reset.status, 200);
  assert.equal(reset.data.row.routingCustom,false);
  assert.equal(reset.data.row.failoverCustom, false);
  assert.deepEqual(reset.data.row.failover,failover);
  assert.deepEqual(reset.data.row.channels, model.channels);
  assert.equal(reset.data.row.routingStrategy, 'simple-shuffle');
  assert.equal((await run(command('delete', undefined, 1, model.id))).status, 409);
  assert.equal((await run(command('delete', undefined, 4, model.id))).status, 200);
  const deleted = await db.prepare('SELECT deleted_at,revision FROM new_model_services WHERE id=?').bind(model.id).first();
  assert.ok(deleted.deleted_at);
  const editDeleted = await run(command('save', reset.data.row, deleted.revision));
  assert.equal(editDeleted.status, 409);
  assert.equal(editDeleted.data.error.code, 'REVISION_CONFLICT');
  assert.deepEqual((await run(command('import', model))).data, { id: model.id, row: null });
  assert.deepEqual(await db.prepare('SELECT deleted_at,revision FROM new_model_services WHERE id=?').bind(model.id).first(), deleted);
  assert.deepEqual((await request(endpoint, { cookie: chrome })).data, {
    defaults: { strategy: 'simple-shuffle' }, rows: [], deletedIds: [model.id],
  });
  assert.equal(await db.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE entity_type='new-model-service'").first('n'), 5);
  assert.equal((await request('/health')).data.schemaVersion, 19);

  const materialId = 'template-glm-5.3';
  const workspace = await request('/model-operations', { cookie: chrome });
  assert.equal(workspace.status, 200);
  const candidates = mappingCandidates(domainModelWorkspace(workspace.data), { modelId: materialId })
    .filter(candidate => !candidate.reason);
  assert.ok(candidates.length >= 2);
  const service = { id: resourceId('model-service'), name: 'GLM 新模型服务', callId: 'glm-test-new-service',
    type: 'text', listed: false, channels: [] };
  const created = await run(command('save', service));
  assert.equal(created.status, 200, JSON.stringify(created.data));
  assert.deepEqual(created.data.row.channels, []);
  assert.equal(created.data.row.routingCustom, false);

  const channels = candidates.slice(0, 2).map((candidate, index) => ({
    id: resourceId('service-channel'), channelId: candidate.id, fingerprint: channelFingerprint(candidate),
    name: candidate.name, upstreamId: candidate.upstreamModelId, provider: candidate.provider.name,
    enabled: true, priority: 2, weight: index ? 30 : 70,
  }));
  const update = { ...created.data.row, channels, priorityGroups: [0, 2] };
  assert.equal((await run(command('save', { ...update, channels: [channels[0], channels[0]] }, 1))).status, 400);
  assert.equal((await run(command('save', { ...update, channels: [{ ...channels[0], fingerprint: 'stale' }] }, 1))).status, 400);
  const linked = await run(command('save', update, 1));
  assert.equal(linked.status, 200, JSON.stringify(linked.data));
  assert.deepEqual(linked.data.row.channels, channels);
  assert.deepEqual(linked.data.row.priorityGroups, [0, 2]);
  assert.equal(Object.hasOwn(linked.data.row, 'modelId'), false);
  const reloaded = (await request(endpoint, { cookie: inApp })).data.rows.find(row => row.id === service.id);
  assert.deepEqual(reloaded.channels, channels);
  const started = await run(command('save', { ...reloaded, listed: true }, reloaded.revision));
  assert.equal(started.status, 200, JSON.stringify(started.data));
  assert.equal(Object.hasOwn(started.data.row, 'modelId'), false);
  assert.equal(started.data.row.listed, true);
  const referenced = await run(command('save', { ...started.data.row, modelId: materialId }, started.data.row.revision));
  assert.equal(referenced.status, 400, JSON.stringify(referenced.data));
  assert.match(referenced.data.error.message, /只关联上游模型/);

  await initializeApplication(db);
  const saveGlobal = async values => {
    const app = await request('/application', { cookie: chrome });
    assert.equal(app.status, 200);
    const result = await request('/application/commands', { cookie: chrome, body: {
      operationId: resourceId('operation'), expectedRevision: app.data.revision,
      action: { type: 'saveGlobalRoutingParameters', values },
    } });
    assert.equal(result.status, 200, JSON.stringify(result.data));
  };
  const inherited = { timeout: 120, numRetries: 6, cooldownTime: 15 };
  await saveGlobal({ ...inherited, strategy: 'least-busy', retryAfter: 9 });
  const refreshed = (await request(endpoint, { cookie: inApp })).data;
  assert.deepEqual(refreshed.defaults, { strategy: 'least-busy', ...inherited });
  assert.deepEqual(refreshed.rows.find(row => row.id === service.id), started.data.row);

  const custom = {
    ...inherited, timeout: 0, cooldownTime: 0, allowedFails: null,
    retry_policy: { TimeoutErrorRetries: 0, RateLimitErrorRetries: null },
  };
  const customSave = await run(command('save', { ...started.data.row, failoverCustom: true, failover: custom }, started.data.row.revision));
  assert.equal(customSave.status, 200, JSON.stringify(customSave.data));
  const storedCustom = { timeout: 0, cooldownTime: 0, numRetries: 6, retry_policy: { TimeoutErrorRetries: 0 } };
  assert.deepEqual(customSave.data.row.failover, storedCustom);
  await saveGlobal({ timeout: 900, retryAfter: 0 });
  const reloadCustom = (await request(endpoint, { cookie: chrome })).data;
  assert.deepEqual(reloadCustom.defaults, { strategy: 'least-busy', timeout: 900 });
  assert.deepEqual(reloadCustom.rows.find(row => row.id === service.id), customSave.data.row);
  const switched = await run(command('save', {
    ...customSave.data.row, failoverCustom: false, failover: undefined,
  }, customSave.data.row.revision));
  assert.equal(switched.status, 200, JSON.stringify(switched.data));
  assert.equal(switched.data.row.failoverCustom, false);
  assert.deepEqual(switched.data.row.failover, storedCustom);
  const reverted = await run(command('save', { ...switched.data.row, failoverCustom: true }, switched.data.row.revision));
  assert.equal(reverted.status, 200, JSON.stringify(reverted.data));
  assert.equal(reverted.data.row.failoverCustom, true);
  assert.deepEqual(reverted.data.row.failover, storedCustom);

  const retainedChannels = [channels[0], { ...channels[1], enabled: false, priority: 3 }];
  const groupSetup = await run(command('save', { ...reverted.data.row, channels: retainedChannels }, reverted.data.row.revision));
  assert.equal(groupSetup.status, 200, JSON.stringify(groupSetup.data));
  assert.deepEqual(groupSetup.data.row.priorityGroups, [0, 2, 3]);
  const removeEmptyGroup = command('save', { ...groupSetup.data.row, priorityGroups: [2] }, groupSetup.data.row.revision);
  const removedGroup = await run(removeEmptyGroup);
  assert.equal(removedGroup.status, 200, JSON.stringify(removedGroup.data));
  const afterRemoval = (await request(endpoint, { cookie: chrome })).data.rows.find(row => row.id === service.id);
  assert.deepEqual(afterRemoval.priorityGroups, [2, 3]);
  assert.deepEqual(afterRemoval.channels, retainedChannels);
  assert.equal(afterRemoval.listed, true);

  const withSameName = { ...service, id: resourceId('model-service'), callId: 'same-name-unique-model' };
  const duplicateName = await run(command('save', withSameName));
  assert.equal(duplicateName.status, 200, JSON.stringify(duplicateName.data));
  assert.equal(duplicateName.data.row.name, service.name);
  assert.equal((await run(command('save', { ...withSameName, id: resourceId('model-service') }))).data.error.code, 'DUPLICATE_CALL_ID');
});
