import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import test from 'node:test';
import { startLocalBackend } from '../database/local-runtime.js';
import { resourceId } from '../src/resource-id.mjs';

test('new model services share D1, preserve the imported ID, and protect concurrent edits', async t => {
  const origin = 'https://example.test';
  const endpoint = '/model-services-new';
  const accessCode = randomBytes(18).toString('hex');
  const hash = createHash('sha256').update(accessCode).digest('hex');
  const { db, runtime } = await startLocalBackend({ loginHashes: { 'admin-001': hash, 'admin-002': hash } });
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

  const first = await run(imported);
  assert.equal(first.status, 200);
  assert.deepEqual(first.data.row, { ...model, revision: 1 });
  assert.deepEqual((await request(endpoint, { cookie: chrome })).data.rows, [first.data.row]);
  assert.deepEqual((await run(imported)).data, first.data);
  assert.deepEqual((await request('/operations/' + imported.operationId, { cookie: inApp })).data, first.data);
  assert.equal((await run(command('save', { ...model, channels: [], id: resourceId('model-service') }))).data.error.code, 'DUPLICATE_CALL_ID');
  const invalidListing = await run(command('save', { ...model, listed: true }, 1));
  assert.equal(invalidListing.status, 400);

  const edits = await Promise.all([
    run(command('save', { ...model, note: 'first edit' }, 1)),
    run(command('save', { ...model, note: 'second edit' }, 1), chrome),
  ]);
  assert.deepEqual(edits.map(result => result.status).sort(), [200, 409]);
  const [saved] = (await request(endpoint, { cookie: chrome })).data.rows;
  assert.equal(saved.revision, 2);
  assert.equal(saved.createdAt, model.createdAt);
  assert.equal(saved.createdBy, model.createdBy);
  assert.deepEqual((await run(command('import', model))).data.row, saved);
  const strategy = command('save', { ...saved, routingStrategy: 'latency-based-routing' }, 2);
  assert.equal((await run({ ...strategy, row: { ...saved, routingStrategy: ['least-busy'] } })).status, 400);
  assert.equal((await run({ ...strategy, row: { ...saved, routingStrategy: 'round-robin' } })).status, 400);
  const changed = await run(strategy);
  assert.equal(changed.status, 200);
  assert.deepEqual(changed.data.row, { ...saved, routingStrategy: 'latency-based-routing', revision: 3 });
  assert.deepEqual((await run(strategy)).data, changed.data);
  assert.deepEqual((await request(endpoint, { cookie: chrome })).data.rows, [changed.data.row]);
  const reset = await run(command('save', { ...changed.data.row, routingStrategy: 'simple-shuffle' }, 3));
  assert.equal(reset.status, 200);
  assert.deepEqual(reset.data.row.channels, model.channels);
  assert.equal(reset.data.row.routingStrategy, 'simple-shuffle');
  assert.equal((await run(command('delete', undefined, 1, model.id))).status, 409);
  assert.equal((await run(command('delete', undefined, 4, model.id))).status, 200);
  assert.deepEqual((await run(command('import', model))).data, { id: model.id, row: null });
  assert.deepEqual((await request(endpoint, { cookie: chrome })).data, { rows: [], deletedIds: [model.id] });
  assert.equal(await db.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE entity_type='new-model-service'").first('n'), 5);
  assert.equal((await request('/health')).data.schemaVersion, 18);
});
