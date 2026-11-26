import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import test from 'node:test';
import { startLocalBackend } from '../database/local-runtime.js';
import { resourceId } from '../src/resource-id.mjs';
import { scopeTenants } from '../src/admin-v2/service-commercial.js';
import { domainModelWorkspace } from '../src/mock/model-fields.js';
import { registeredServiceUpstreams } from '../src/admin-v2/service-model-mappings.js';
import { channelFingerprint } from '../src/admin-v2/provider-channels.js';
import { modelServiceSupply } from '../server/model-service-sales.js';

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
  const state = () => db.prepare(`SELECT commit_seq, (SELECT COUNT(*) FROM model_service_sales) AS sales,
    (SELECT COUNT(*) FROM audit_events) AS audits FROM db_state WHERE id=1`).first();
  const initial = await state();
  assert.deepEqual(initial.sales, 0);
  assert.deepEqual(Object.keys(await list()), ['rows']);
  const [unpublished] = (await list()).rows;
  assert.equal(unpublished.id, service.id);
  assert.equal(unpublished.service.name, service.name);
  assert.equal(unpublished.stage, 'unlisted');
  assert.equal(unpublished.revision, 0);
  assert.deepEqual(unpublished.prices, []);
  assert.deepEqual(await state(), initial);

  const sales = async (body, status = 200) => (await request(salePath, {
    cookie: admin, body: { serviceId: service.id, ...body }, status,
  })).data;
  const command = (action, revision, fields, status) =>
    sales({ action, revision, ...fields, operationId: resourceId('operation') }, status);
  assert.equal((await command('create', 0, {}, 400)).error.code, 'INVALID_INPUT');
  assert.equal((await command('start', 0, { stage: 'formal' }, 409)).error.code, 'SALE_NOT_READY');

  const prices = field => ['输入 Token', '输出 Token'].map((name, index) => ({
    name, condition: '', unit: '百万 Token', currency: 'CNY', [field]: index ? '0' : '2',
  }));
  const malformed = prices('amount');
  malformed[0].amount = '';
  await command('price', 0, { items: malformed }, 400);
  assert.deepEqual(await state(), initial);
  const firstPrice = { action: 'price', revision: 0, items: prices('amount'), operationId: resourceId('operation') };
  const firstResult = { id: service.id, revision: 1 };
  assert.deepEqual(await Promise.all([sales(firstPrice), sales(firstPrice)]), [firstResult, firstResult]);
  assert.deepEqual(await sales(firstPrice), firstResult);
  assert.equal((await sales({ ...firstPrice, items: malformed }, 409)).error.code, 'IDEMPOTENCY_CONFLICT');
  assert.equal((await command('price', 0, { items: prices('amount') }, 409)).error.code, 'REVISION_CONFLICT');
  assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM audit_events WHERE operation_id=?').bind(firstPrice.operationId).first('n'), 1);
  const [sale] = (await list()).rows;
  assert.equal(sale.stage, 'unlisted');
  const [retail] = sale.prices;
  assert.equal(retail.version, 1);
  assert.equal(retail.items[1].amount, 0);
  assert.ok(retail.items[0].billing_item_id);
  const inspect = async id => (await request('/model-services-new?inspect=' + id, { cookie: admin })).data;
  const remove = async (row, status = 200) => request('/model-services-new', { cookie: admin, status, body: {
    action: 'delete', id: row.id, revision: row.revision, operationId: resourceId('operation'),
  } });
  const saleDeleteIssue = '该模型服务已配置模型售卖，不能删除';
  assert.equal((await inspect(service.id)).deleteIssue, saleDeleteIssue);
  const pricedSnapshot = await state();
  assert.equal((await remove(technical, 400)).data.error.message, saleDeleteIssue);
  assert.deepEqual(await state(), pricedSnapshot);

  const workspace = async () => domainModelWorkspace((await request('/model-operations', { cookie: admin })).data);
  const source = await workspace();
  const channel = registeredServiceUpstreams(source).find(row => row.type === 'text' && row.managed && !row.reason &&
    modelServiceSupply(source, { type:'text', channels:[{ channelId:row.id, enabled:true, fingerprint:channelFingerprint(row) }] })
      .some(route => !route.costPrices));
  assert.ok(channel);
  const attached = {
    id: resourceId('service-channel'), channelId: channel.id, fingerprint: channelFingerprint(channel),
    name: channel.name, upstreamId: channel.upstreamModelId, provider: channel.provider.name,
    enabled: true, priority: 0, weight: 100,
  };
  technical = await serviceSave({ ...technical, channels: [attached], listed: true }, technical.revision);
  const { checks } = (await list()).rows[0];
  assert.ok(checks.some(check => check.warning && check.upstreamId === channel.id &&
    check.connectionId === channel.endpointId && check.label.includes(channel.upstreamModelId)));
  assert.ok(checks.filter(check => !check.warning).every(check => check.passed));
  const tenantId = scopeTenants(source)[0].id;
  await command('start', 1, { stage: 'gray', grayTenantIds: ['unknown-tenant'] }, 400);
  await command('start', 1, { stage: 'gray', grayTenantIds: [tenantId] });
  assert.equal((await list()).rows[0].stage, 'gray');
  assert.deepEqual((await list()).rows[0].grayTenantIds, [tenantId]);
  await command('start', 2, { stage: 'formal' });
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
  const revised = prices('amount');
  revised[0].amount = '3.25';
  await command('price', 3, { items: revised });
  const [formal] = (await list()).rows;
  assert.equal(formal.stage, 'formal');
  assert.deepEqual(formal.prices[0], retail);
  assert.equal(formal.prices[1].version, 2);
  assert.equal(formal.prices[1].items[0].amount, 3_250_000);
  await command('pause', 4);
  const [paused] = (await list()).rows;
  assert.equal(paused.stage, 'paused');
  assert.equal(paused.service.listed, true);
  assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM model_service_sales WHERE service_id=?').bind(service.id).first('n'), 1);

  const addService = suffix => serviceSave({
    id: resourceId('model-service'), name: '列表验收服务 ' + suffix, callId: 'visible-model-sales-' + suffix,
    type: 'text', listed: false, channels: [],
  }, 0);
  const discarded = await addService('retired');
  const legacy = await addService('legacy');
  const legacyOffer = await db.prepare('SELECT record_id FROM offers ORDER BY retired_at IS NOT NULL,record_id LIMIT 1').first('record_id');
  assert.ok(legacyOffer);
  await db.prepare("UPDATE new_model_services SET record_json=json_set(record_json,'$.controlledOfferId',?) WHERE id=?")
    .bind(legacyOffer, legacy.id).run();
  const visible = (await list()).rows;
  assert.deepEqual(new Set(visible.map(row => row.id)), new Set([service.id, discarded.id, legacy.id]));
  assert.equal(visible.length, 3);
  assert.equal(visible.find(row => row.id === legacy.id).legacyOfferId, legacyOffer);
  assert.equal((await command('price', 0, { serviceId: legacy.id, items: prices('amount') }, 409)).error.code, 'SALE_EXISTS');
  assert.equal((await inspect(discarded.id)).deleteIssue, '');
  await remove(discarded);
  assert(!(await list()).rows.some(row => row.id === discarded.id));
  assert.equal((await command('price', 0, { serviceId: discarded.id, items: prices('amount') }, 404)).error.code, 'NOT_FOUND');
  assert.equal((await state()).sales, 1);
});
