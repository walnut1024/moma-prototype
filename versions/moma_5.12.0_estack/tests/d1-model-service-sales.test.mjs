import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import test from 'node:test';
import { startLocalBackend } from '../database/local-runtime.js';
import { resourceId } from '../src/resource-id.mjs';
import { scopeTenants } from '../src/admin-v2/service-commercial.js';
import { domainModelWorkspace } from '../src/mock/model-fields.js';
import { registeredServiceUpstreams } from '../src/admin-v2/service-model-mappings.js';
import { channelFingerprint } from '../src/admin-v2/provider-channels.js';

test('model sales enforce one stable sale, immutable quotes and real technical prerequisites', async t => {
  const password = randomBytes(18).toString('hex');
  const hash = createHash('sha256').update(password).digest('hex');
  const { db, runtime } = await startLocalBackend({ demo: true, loginHashes: { 'admin-001': hash, 'admin-002': hash } });
  t.after(() => runtime.dispose());

  const origin = 'https://example.test';
  const request = async (path, { body, cookie, status = 200, key = body?.operationId } = {}) => {
    const response = await runtime.dispatchFetch(origin + '/api/v1' + path, {
      method: body ? 'POST' : 'GET', headers: {
        ...(cookie && { cookie }), ...(key && { 'idempotency-key': key }),
        ...(body && { origin, 'x-moma-request': '1', 'content-type': 'application/json' }),
      }, ...(body && { body: JSON.stringify(body) }),
    });
    const data = await response.json();
    assert.equal(response.status, status, path + ': ' + JSON.stringify(data.error || response.status));
    return { data, cookie: response.headers.get('set-cookie')?.split(';')[0] };
  };
  const login = async accountId => (await request('/auth/login', { body: { accountId, accessCode: password } })).cookie;
  const admin = await login('admin-001');
  const observer = await login('admin-002');
  const salePath = '/model-service-sales';
  await request(salePath, { status: 401 });
  await request(salePath, { cookie: observer, status: 403 });
  const service = {
    id: resourceId('model-service'), name: '独立验收服务', callId: 'independent-model-sales-contract',
    type: 'text', listed: false, channels: [],
  };
  const serviceSave = async (row, revision) => (await request('/model-services-new', {
    cookie: admin, body: { action: 'save', id: row.id, row, revision, operationId: resourceId('operation') },
  })).data.row;
  let technical = await serviceSave(service, 0);
  const list = async () => (await request(salePath, { cookie: admin })).data;
  assert.deepEqual((await list()).candidates.map(row => row.id), [service.id]);
  const create = { action:'create', serviceId: service.id, revision: 0, operationId: resourceId('operation') };
  const sales = async (body, status = 200) => (await request(salePath, {
    cookie: admin, body: { ...create, ...body }, status,
  })).data;
  const command = (action, revision, fields, status) =>
    sales({ action, revision, ...fields, operationId: resourceId('operation') }, status);
  const created = await sales({});
  assert.deepEqual(await sales({}), created);
  assert.equal((await command('create', 0, {}, 409)).error.code, 'SALE_EXISTS');
  assert.equal((await sales({ action: 'pause' }, 409)).error.code, 'IDEMPOTENCY_CONFLICT');
  const [unpublished] = (await list()).rows;
  assert.equal(unpublished.stage, 'unlisted');
  assert.equal(unpublished.revision, 1);
  assert.deepEqual(unpublished.prices, []);
  assert.deepEqual((await list()).candidates, []);
  assert.equal((await command('start', 1, { stage: 'formal' }, 409)).error.code, 'SALE_NOT_READY');

  const prices = field => ['输入 Token', '输出 Token'].map((name, index) => ({
    name, condition: '', unit: '百万 Token', currency: 'CNY', [field]: index ? '0' : '2',
  }));
  const malformed = prices('amount');
  malformed[0].amount = '';
  await command('price', 1, { items: malformed }, 400);
  await command('price', 1, { items: prices('amount') });
  const [retail] = (await list()).rows[0].prices;
  assert.equal(retail.version, 1);
  assert.equal(retail.items[1].amount, 0);
  assert.ok(retail.items[0].billing_item_id);
  assert.equal((await command('price', 1, { items: prices('amount') }, 409)).error.code, 'REVISION_CONFLICT');

  const workspace = async () => domainModelWorkspace((await request('/model-operations', { cookie: admin })).data);
  const source = await workspace();
  const channel = registeredServiceUpstreams(source).find(row => row.type === 'text' && row.managed && !row.reason);
  assert.ok(channel);
  const attached = {
    id: resourceId('service-channel'), channelId: channel.id, fingerprint: channelFingerprint(channel),
    name: channel.name, upstreamId: channel.upstreamModelId, provider: channel.provider.name,
    enabled: true, priority: 0, weight: 100,
  };
  technical = await serviceSave({ ...technical, channels: [attached], listed: true }, technical.revision);
  const operationId = crypto.randomUUID();
  await request('/model-operations/commands', { cookie: admin, body: {
    operationId, expectedRevision: source.revision,
    action: { type: 'modelOperations', operation: 'channelProcurementPublish', data: {
      providerId: channel.provider.id, endpointId: channel.endpointId, associationId: channel.id,
      expectedPriceRevision: channel.procurementRevision || 0, confirmed: true,
      effectiveAt: new Date().toISOString(), scenarios: prices('listPrice'),
    } },
  } });
  assert.ok((await list()).rows[0].checks.every(row => row.passed));
  const tenantId = scopeTenants(source)[0].id;
  await command('start', 2, { stage: 'gray', grayTenantIds: ['unknown-tenant'] }, 400);
  await command('start', 2, { stage: 'gray', grayTenantIds: [tenantId] });
  assert.equal((await list()).rows[0].stage, 'gray');
  assert.deepEqual((await list()).rows[0].grayTenantIds, [tenantId]);
  await command('start', 3, { stage: 'formal' });
  const revised = prices('amount');
  revised[0].amount = '3.25';
  await command('price', 4, { items: revised });
  const [formal] = (await list()).rows;
  assert.equal(formal.stage, 'formal');
  assert.deepEqual(formal.prices[0], retail);
  assert.equal(formal.prices[1].version, 2);
  assert.equal(formal.prices[1].items[0].amount, 3_250_000);
  await command('pause', 5);
  const [paused] = (await list()).rows;
  assert.equal(paused.stage, 'paused');
  assert.equal(paused.service.listed, true);
  assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM model_service_sales WHERE service_id=?').bind(service.id).first('n'), 1);
});
