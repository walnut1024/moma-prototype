import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { startLocalBackend } from '../database/local-runtime.js';
import { API_PREFIX } from '../api-path.js';
import { domainModelWorkspace } from '../src/mock/model-fields.js';
import { providerRemovalPlan } from '../src/admin-v2/provider-removal.js';
import { channelManagementDirectory, supplierModelChannelRows } from '../src/admin-v2/supplier-model-channel-table.js';
import { costRecords, supplyCostTableRows } from '../src/admin-v2/model-pricing-workspace.js';

test('HTTP/D1 last-channel retirement survives reload and replay, preserves commercial history, and allows safe orphan cleanup and re-registration', { timeout: 60000 }, async () => {
  const code = randomBytes(24).toString('hex'), hash = createHash('sha256').update(code).digest('hex');
  const local = await startLocalBackend({ demo: true, loginHashes: { 'admin-001': hash, 'admin-002': hash } });
  let cookie;
  const request = async (path, body, token = cookie) => {
    const response = await local.runtime.dispatchFetch('https://example.test' + API_PREFIX + path, {
      method: body ? 'POST' : 'GET', headers: { ...(token ? { cookie: token } : {}), ...(body ? { origin: 'https://example.test', 'x-moma-request': '1', 'content-type': 'application/json', 'idempotency-key': body.operationId || crypto.randomUUID() } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  };
  const read = async () => { const response = await request('/model-operations'); assert.equal(response.status, 200); return domainModelWorkspace(response.data); };
  const body = (state, operation, data) => ({ operationId: crypto.randomUUID(), expectedRevision: state.revision, action: { type: 'modelOperations', operation, data } });
  const history = async () => Object.fromEntries(await Promise.all(['materials', 'price_versions', 'price_items', 'route_versions', 'route_members', 'model_price_records'].map(async table => [table, (await local.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results])));
  const checkViews = state => {
    const directory = channelManagementDirectory(state, state.providers), groups = [...directory.byProvider.values()].flat();
    const left = groups.flatMap(group => supplierModelChannelRows(state, [group]));
    const right = supplyCostTableRows(directory.models, costRecords(state, groups));
    assert.deepEqual(left.map(r => r.channel.id).sort(), right.map(r => r.channel.id).sort());
    assert(groups.every(g => !g.modelId || g.channels.length > 0));
    return directory;
  };
  try {
    assert.equal((await request('/model-operations')).status, 401);
    cookie = (await request('/auth/login', { accountId: 'admin-001', accessCode: code })).cookie;
    const observer = await request('/auth/login', { accountId: 'admin-002', accessCode: code }, '');
    let state = await read();
    const owner = state.providers.find(p => p.id === 'provider-moma');
    const registration = state.supplyRelations.models.find(r => r.providerId === owner.id && r.modelId === 'glm-5.3');
    const channels = state.supplyRelations.channels.filter(r => r.supplierModelId === registration.id);
    assert.equal(channels.length, 2);
    const otherProviders = structuredClone(state.providers.filter(p => p.id !== owner.id));
    const target = { providerId: owner.id, associationIds: channels.map(c => c.associationId) };
    const removal = current => ({ target, confirmed: true, expectedSignature: providerRemovalPlan(current, target).signature });
    assert.equal((await request('/model-operations/commands', body(state, 'providerRemovalCommit', removal(state)))).status, 422);
    assert.equal((await request('/model-operations/commands', body(state, 'providerRemovalPrepare', removal(state)))).status, 200);
    state = await read();
    const preserved = await history();
    const existingAudits = (await local.db.prepare('SELECT id,record_json FROM audit_events ORDER BY id').all()).results;
    const deletion = body(state, 'providerRemovalCommit', removal(state));
    assert.equal((await request('/model-operations/commands', deletion, observer.cookie)).status, 403);
    const saved = await request('/model-operations/commands', deletion); assert.equal(saved.status, 200, JSON.stringify(saved.data));
    assert.deepEqual((await request('/model-operations/commands', deletion)).data, saved.data);
    assert.equal((await request('/model-operations/commands', { ...deletion, operationId: crypto.randomUUID() })).status, 409);
    state = await read();
    assert.deepEqual(state.supplyRelations, saved.data.supplyRelations);
    assert(!state.supplyRelations.models.some(r => r.id === registration.id));
    assert(!state.supplyRelations.channels.some(r => r.supplierModelId === registration.id));
    assert(!checkViews(state).byProvider.get(owner.id).some(g => g.id === registration.materialId));
    assert((await local.db.prepare('SELECT removed_at FROM supplier_models WHERE id=?').bind(registration.id).first('removed_at')) > 0);
    for (const c of channels) assert((await local.db.prepare('SELECT removed_at FROM channel_models WHERE id=?').bind(c.id).first('removed_at')) > 0);
    assert.deepEqual(await history(), preserved);
    assert.deepEqual(state.providers.filter(p => p.id !== owner.id), otherProviders);
    for (const audit of existingAudits) assert.equal(await local.db.prepare('SELECT record_json FROM audit_events WHERE id=?').bind(audit.id).first('record_json'), audit.record_json);
    assert.equal((await local.db.prepare('PRAGMA foreign_key_check').all()).results.length, 0);
    assert.equal((await request('/model-operations/commands', body(state, 'supplierModelsRegister', { providerId: owner.id, libraryIds: [registration.materialId] }))).status, 200);
    state = await read();
    assert.equal(state.supplyRelations.models.find(r => r.providerId === owner.id && r.materialId === registration.materialId).id, registration.id);
    assert(!state.supplyRelations.channels.some(r => r.supplierModelId === registration.id), 're-registration cannot restore archived channels');
    assert(!checkViews(state).byProvider.get(owner.id).some(g => g.id === registration.materialId));
    assert.equal((await request('/model-operations/commands', body(state, 'provider', { operation: 'catalogueRemove', objectId: owner.id, values: { modelId: state.supplyRelations.models.find(r => r.id === registration.id).modelId, confirmed: true } }))).status, 422, 'retained service associations still protect registration cleanup');
    assert.equal((await request('/model-operations/commands', body(state, 'supplierModelsRegister', { providerId: owner.id, libraryIds: ['builtin-pp-ocrv6'] }))).status, 200);
    state = await read();
    const orphan = state.supplyRelations.models.find(r => r.providerId === owner.id && r.materialId === 'builtin-pp-ocrv6');
    const cleanup = body(state, 'provider', { operation: 'catalogueRemove', objectId: owner.id, values: { modelId: orphan.modelId, confirmed: true } });
    const cleaned = await request('/model-operations/commands', cleanup); assert.equal(cleaned.status, 200, JSON.stringify(cleaned.data));
    assert.deepEqual((await request('/model-operations/commands', cleanup)).data, cleaned.data);
    state = await read();
    assert(!state.supplyRelations.models.some(r => r.id === orphan.id));
    assert.deepEqual(await history(), preserved);
    const live = state.supplyRelations.models.find(r => r.providerId === owner.id && state.supplyRelations.channels.some(c => c.supplierModelId === r.id));
    assert.equal((await request('/model-operations/commands', body(state, 'provider', { operation: 'catalogueRemove', objectId: owner.id, values: { modelId: live.modelId, confirmed: true } }))).status, 422);
    assert.deepEqual(await read(), state);
  } finally { await local.runtime.dispose(); }
});
