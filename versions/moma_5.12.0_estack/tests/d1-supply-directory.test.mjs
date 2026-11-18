import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { startLocalBackend } from '../database/local-runtime.js';
import { domainModelWorkspace } from '../src/mock/model-fields.js';
import { supplierDirectory } from '../src/admin-v2/moma-provider.js';
import { channelManagementDirectory } from '../src/admin-v2/supplier-model-channel-table.js';

test('D1 supplies one authoritative registration set to both views and command receipts without replaying reference models', { timeout: 60000 }, async () => {
  const code = randomBytes(24).toString('hex');
  const local = await startLocalBackend({ loginHashes: { 'admin-001': createHash('sha256').update(code).digest('hex') } });
  let cookie;
  const request = async (path, body) => {
    const response = await local.runtime.dispatchFetch('https://example.test/api/5120' + path, {
      method: body ? 'POST' : 'GET', headers: { ...(cookie ? { cookie } : {}),
        ...(body ? { origin: 'https://example.test', 'x-moma-request': '1', 'content-type': 'application/json' } : {}),
        ...(body?.operationId ? { 'idempotency-key': body.operationId } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  };
  const reload = async () => {
    const response = await request('/model-operations');
    assert.equal(response.status, 200);
    return domainModelWorkspace(response.data);
  };
  try {
    assert.equal((await request('/model-operations')).status, 401);
    const login = await request('/auth/login', { accountId: 'admin-001', accessCode: code });
    assert.equal(login.status, 200); cookie = login.cookie;
    let state = await reload();
    assert.deepEqual(state.supplyRelations, { models: [], channels: [] });
    assert.equal(channelManagementDirectory(state, supplierDirectory(state)).models.length, 0);
    assert.ok(state.modelTemplates.length);
    const provider = state.providers.find(row => row.builtinCatalogue === 'moma'), master = state.modelTemplates[0];
    const body = { operationId: crypto.randomUUID(), expectedRevision: state.revision,
      action: { type: 'modelOperations', operation: 'supplierModelsRegister', data: { providerId: provider.id, libraryIds: [master.id] } } };
    const saved = await request('/model-operations/commands', body);
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    assert.deepEqual((await request('/model-operations/commands', body)).data, saved.data);
    state = await reload();
    assert.deepEqual(saved.data.supplyRelations, state.supplyRelations);
    assert.equal(state.supplyRelations.models.length, 1);
    const { byProvider, models } = channelManagementDirectory(state, supplierDirectory(state));
    assert.equal(byProvider.get(provider.id).filter(row => row.modelId).length, 0);
    assert.equal(models.length, 0);
    const relationId = state.supplyRelations.models[0].id;
    const removal = { operationId: crypto.randomUUID(), expectedRevision: state.revision,
      action: { type: 'modelOperations', operation: 'provider', data: { operation: 'catalogueRemove', objectId: provider.id,
        values: { modelId: master.modelId, confirmed: true } } } };
    const removed = await request('/model-operations/commands', removal);
    assert.equal(removed.status, 200, JSON.stringify(removed.data));
    state = await reload();
    assert.deepEqual(state.supplyRelations, removed.data.supplyRelations);
    assert.equal(state.supplyRelations.models.length, 0);
    assert.ok(state.modelTemplates.some(row => row.id === master.id));
    assert.ok(state.providers.find(row => row.id === provider.id).catalogModels.length);
    const restore = { ...body, operationId: crypto.randomUUID(), expectedRevision: state.revision };
    assert.equal((await request('/model-operations/commands', restore)).status, 200);
    state = await reload();
    assert.equal(state.supplyRelations.models[0].id, relationId);
    const stored = await local.db.prepare('SELECT record_json FROM suppliers WHERE id=?').bind(provider.id).first('record_json');
    await local.db.prepare('UPDATE supplier_models SET removed_at=1 WHERE supplier_id=? AND material_id=?').bind(provider.id, master.id).run();
    state = await reload();
    assert.equal(state.providers.find(row => row.id === provider.id).catalogModelIds.length, 1);
    assert.equal(state.supplyRelations.models.length, 0);
    assert.equal(channelManagementDirectory(state, supplierDirectory(state)).models.length, 0);
    assert.equal(await local.db.prepare('SELECT record_json FROM suppliers WHERE id=?').bind(provider.id).first('record_json'), stored);
    assert.equal((await local.db.prepare('PRAGMA foreign_key_check').all()).results.length, 0);
  } finally { await local.runtime.dispose(); }
});
