import { API_PREFIX } from '../api-path.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { initialModelWorkspace } from '../server/model-repository.js';
import { startLocalBackend } from '../database/local-runtime.js';
import { domainModelWorkspace } from '../src/mock/model-fields.js';
import { commitAdminState } from '../src/admin-v2/state-transaction.js';
import { serviceModelSources } from '../src/admin-v2/supply-models.js';
import { isResourceId } from '../src/resource-id.mjs';
import { exportModelResources } from '../src/admin-v2/model-resource-transfer.js';
import { serviceDirectoryRows } from '../src/admin-v2/service-directory.js';

const libraryIds = ['builtin-pp-ocrv6', 'model-2', 'model-14', 'builtin-qwen-audio-3.0-asr-flash', 'catalog-demo-kimi'];
const action = (operation, data) => ({ type: 'modelOperations', operation, data });
const register = action('supplierModelsRegister', { providerId: 'provider-moma', libraryIds });
const batch = (ids = libraryIds, serviceMode = 'standard') => action('createServiceModels', { libraryIds: ids, serviceMode });

test('batch services inherit registered model identity and type in both modes without changing supply or publishing', () => {
  const state = commitAdminState(initialModelWorkspace(), register, '平台管理员');
  for (const mode of ['standard', 'provider']) {
    const before = structuredClone(state), input = batch(libraryIds, mode);
    input.data.name = '客户端伪造名称';
    input.data.type = 'audio';
    const next = commitAdminState(state, input, '平台管理员');
    for (const id of libraryIds) {
      const source = serviceModelSources(state).find(model => model.id === id);
      const service = next.models.find(model => model.templateId === id);
      assert.ok(service);
      assert.deepEqual([service.name, service.serviceName, service.type, service.serviceMode], [source.name, source.name, source.type, mode]);
      assert.equal(service.callsEnabled, false);
      assert.equal(service.listingStatus, '已下架');
    }
    for (const key of ['providers', 'endpoints', 'modelSupplies', 'modelSalePrices', 'serviceRoutes']) assert.deepEqual(next[key], state[key]);
    assert.deepEqual(state, before);
    assert.equal(next.revision, state.revision + 1);
    assert.match(next.audits[0].action, /批量新增 5 个模型服务/);
  }
  assert.throws(() => commitAdminState(state, batch(), '只读观察员'), /无权/);
});

test('a conflicting name in the batch rejects all services and preserves the source state', () => {
  const state = commitAdminState(initialModelWorkspace(), register, '平台管理员');
  const first = serviceModelSources(state).find(model => model.id === libraryIds[0]);
  for (const model of [...state.models, ...state.modelTemplates]) if (model.id === libraryIds[1]) model.name = first.name;
  const before = structuredClone(state);
  assert.throws(() => commitAdminState(state, batch(), '平台管理员'), /模型服务名称已存在/);
  assert.deepEqual(state, before);
});

test('D1 batch creation validates every selection, rolls back failures, persists all five services and replays once', { timeout: 60000 }, async () => {
  const accessCode = randomBytes(24).toString('hex');
  const local = await startLocalBackend({ demo: true, loginHashes: { 'admin-001': createHash('sha256').update(accessCode).digest('hex') } });
  let cookie = '';
  const api = (path, body) => local.runtime.dispatchFetch('https://example.test' + API_PREFIX + path, {
    method: body ? 'POST' : 'GET',
    headers: { ...(cookie ? { cookie } : {}), ...(body ? { origin: 'https://example.test', 'x-moma-request': '1', 'content-type': 'application/json' } : {}), ...(body?.operationId ? { 'idempotency-key': body.operationId } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const reload = async () => domainModelWorkspace(await (await api('/model-operations')).json());
  const command = (state, input) => ({ operationId: crypto.randomUUID(), expectedRevision: state.revision, action: input });
  try {
    const login = await api('/auth/login', { accountId: 'admin-001', accessCode });
    assert.equal(login.status, 200);
    cookie = login.headers.get('set-cookie').split(';')[0];
    let state = await reload();
    const registered = await api('/model-operations/commands', command(state, register));
    assert.equal(registered.status, 200, await registered.text());
    state = await reload();
    const baseline = structuredClone(state);
    const existingOffers = (await local.db.prepare('SELECT * FROM offers ORDER BY record_id').all()).results;
    for (const invalid of [batch([]), batch([...libraryIds, 'sixth']), batch([libraryIds[0], libraryIds[0]]), batch([libraryIds[0], 'missing']), batch([libraryIds[0], 'model-21']), batch(libraryIds, 'invalid'), batch([libraryIds[0], state.models.find(model => model.serviceMode)?.templateId])]) {
      const response = await api('/model-operations/commands', command(state, invalid));
      assert.equal(response.status, 422, await response.text());
      assert.deepEqual(await reload(), baseline);
    }
    const stale = command(state, batch());
    stale.expectedRevision--;
    assert.equal((await api('/model-operations/commands', stale)).status, 409);
    assert.deepEqual(await reload(), baseline);
    const input = command(state, batch()), response = await api('/model-operations/commands', input);
    assert.equal(response.status, 200, await response.text());
    const saved = await reload();
    const services = saved.models.filter(model => libraryIds.includes(model.templateId));
    assert.equal(services.length, 5);
    for (const service of services) {
      const source = serviceModelSources(state).find(model => model.id === service.templateId);
      assert.deepEqual([service.serviceName, service.type], [source.name, source.type]);
      assert.equal(await local.db.prepare('SELECT material_id FROM services WHERE id=?').bind(service.id).first('material_id'), source.id);
      const offer = await local.db.prepare('SELECT record_id FROM offers WHERE service_id=?').bind(service.id).first();
      assert(isResourceId(offer.record_id, 'model_service'));
      assert.equal(serviceDirectoryRows([service], saved)[0].model_service_id, offer.record_id);
      for (const scope of ['services', 'market', 'prices']) {
        assert(exportModelResources(saved, scope).rows.some(row => row.id === offer.record_id));
      }
    }
    for (const offer of existingOffers) assert.deepEqual(await local.db.prepare('SELECT * FROM offers WHERE record_id=?').bind(offer.record_id).first(), offer);
    assert.equal(saved.revision, state.revision + 1);
    assert.equal((await api('/model-operations/commands', input)).status, 200);
    assert.deepEqual(await reload(), saved);
    const duplicate = await api('/model-operations/commands', command(saved, batch()));
    assert.equal(duplicate.status, 422, await duplicate.text());
    assert.deepEqual(await reload(), saved);
    assert.equal((await local.db.prepare('PRAGMA foreign_key_check').all()).results.length, 0);
  } finally { await local.runtime.dispose(); }
});
