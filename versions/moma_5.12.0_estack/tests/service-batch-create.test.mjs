import { API_PREFIX } from '../api-path.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { initialModelWorkspace } from '../server/model-repository.js';
import { startLocalBackend } from '../database/local-runtime.js';
import { domainModelWorkspace } from '../src/mock/model-fields.js';
import { commitAdminState } from '../src/admin-v2/state-transaction.js';
import { serviceModelSources } from '../src/admin-v2/supply-models.js';

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

test('D1 rejects retired batch mode commands and preserves stored offers and orders', { timeout: 60000 }, async () => {
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
    const orders = (await local.db.prepare('SELECT * FROM market_orders ORDER BY id').all()).results;
    for (const mode of ['standard','provider']) {
      const input = command(state,batch(libraryIds,mode));
      const response = await api('/model-operations/commands',input);
      assert.equal(response.status,422);
      assert.match((await response.json()).error.message,/请在「模型服务」/);
      assert.deepEqual(await reload(),baseline);
    }
    assert.deepEqual((await local.db.prepare('SELECT * FROM offers ORDER BY record_id').all()).results,existingOffers);
    assert.deepEqual((await local.db.prepare('SELECT * FROM market_orders ORDER BY id').all()).results,orders);
    assert.equal((await local.db.prepare('PRAGMA foreign_key_check').all()).results.length, 0);
  } finally { await local.runtime.dispose(); }
});
