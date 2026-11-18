import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { startLocalBackend } from '../database/local-runtime.js';
import { domainModelWorkspace } from '../src/mock/model-fields.js';
import { exportModelResources } from '../src/admin-v2/model-resource-transfer.js';

test('HTTP maintenance imports keep persisted service IDs and reject conflicting or unauthorized writes', { timeout: 60000 }, async () => {
  const accessCode = randomBytes(24).toString('hex');
  const local = await startLocalBackend({ demo: true, loginHashes: { 'admin-001': createHash('sha256').update(accessCode).digest('hex') } });
  let cookie = '';
  const request = (path, body, authenticated = true) => local.runtime.dispatchFetch('https://example.test/api/5120' + path, {
    method: body ? 'POST' : 'GET', headers: { ...(authenticated && cookie ? { cookie } : {}), ...(body?.operationId ? { 'idempotency-key': body.operationId } : {}), ...(body ? { origin: 'https://example.test', 'x-moma-request': '1', 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  try {
    const login = await request('/auth/login', { accountId: 'admin-001', accessCode });
    assert.equal(login.status, 200); cookie = login.headers.get('set-cookie').split(';')[0];
    const state = domainModelWorkspace(await (await request('/model-operations')).json());
    const registrationTarget = { level: 'provider', provider_id: 'provider-moma' };
    const registration = exportModelResources(state, 'channels', registrationTarget);
    const registeredRows = registration.rows.filter(item => item.type === 'provider_model');
    assert.equal(registeredRows.length, 2);
    assert.deepEqual(registeredRows.map(item => item.id).sort(), state.supplyRelations.models.filter(item => item.providerId === registrationTarget.provider_id).map(item => item.id).sort());
    assert.deepEqual(registeredRows.map(item => item.canonical_slug).sort(), ['deepseek-v4-flash-0731', 'glm-5.3']);
    assert.deepEqual(domainModelWorkspace(await (await request('/model-operations')).json()), state);
    const file = exportModelResources(state, 'services');
    const row = file.rows.find(item => state.models.find(model => model.id === item.model_service_config_id)?.serviceMode === 'standard' && state.models.find(model => model.id === item.model_service_config_id)?.listingStatus !== '已上架' && state.models.find(model => model.id === item.model_service_config_id)?.callsEnabled !== true);
    assert(row); file.rows = [row];
    const before = await local.db.prepare('SELECT * FROM offers WHERE record_id=?').bind(row.id).first();
    assert(before); row.call_id = 'http-id-preserving-rename';
    const body = { operationId: crypto.randomUUID(), expectedRevision: state.revision,
      action: { type: 'modelOperations', operation: 'importModelResources', data: { file } } };
    assert.equal((await request('/model-operations/commands', body, false)).status, 401);
    const saved = await request('/model-operations/commands', body);
    assert.equal(saved.status, 200, await saved.clone().text());
    const after = await local.db.prepare('SELECT * FROM offers WHERE record_id=?').bind(row.id).first();
    assert.equal(after.record_id, before.record_id); assert.equal(after.service_id, before.service_id);
    assert.equal(after.material_id, before.material_id); assert.equal(after.id, row.call_id);
    assert.equal(after.active_sale_price_id, before.active_sale_price_id);
    assert.equal((await request('/model-operations/commands', body)).status, 200);
    const current = domainModelWorkspace(await (await request('/model-operations')).json());
    const invalid = exportModelResources(current, 'services'); invalid.rows = [invalid.rows.find(item => item.id === row.id)];
    invalid.rows[0].model_id = 'foreign-model';
    const rejected = await request('/model-operations/commands', { ...body, operationId: crypto.randomUUID(), expectedRevision: current.revision,
      action: { ...body.action, data: { file: invalid } } });
    assert.equal(rejected.status, 422);
    assert.deepEqual(await local.db.prepare('SELECT * FROM offers WHERE record_id=?').bind(row.id).first(), after);
    const market = exportModelResources(current,'market');
    market.rows = [market.rows.find(item=>item.type==='market_service' && item.id===row.id)];
    market.rows[0].market_visible = false;
    const visibility = await request('/model-operations/commands',{...body,operationId:crypto.randomUUID(),expectedRevision:current.revision,
      action:{...body.action,data:{file:market}}});
    assert.equal(visibility.status,200,await visibility.clone().text());
    assert.equal(await local.db.prepare('SELECT market_visible FROM services WHERE id=?').bind(before.service_id).first('market_visible'),0);
    assert.equal((await local.db.prepare('SELECT * FROM offers WHERE record_id=?').bind(row.id).first()).record_id,before.record_id);
    const latest = domainModelWorkspace(await (await request('/model-operations')).json());
    const channel = exportModelResources(latest, 'channels').rows.find(item => item.type === 'channel' && item.model_id);
    const target = { level: 'model', model_id: channel.model_id }, capacity = exportModelResources(latest, 'channels', target);
    capacity.rows = [capacity.rows.find(item => item.type === 'channel' && item.id === channel.id)];
    capacity.rows[0].capacity_limits = { rpm: 234, tpm: 2000000 };
    const capacityResult = await request('/model-operations/commands', { operationId: crypto.randomUUID(), expectedRevision: latest.revision,
      action: { type: 'modelOperations', operation: 'importModelResources', data: { file: capacity, target } } });
    assert.equal(capacityResult.status, 200, await capacityResult.clone().text());
    const scoped = domainModelWorkspace(await (await request('/model-operations')).json());
    assert.deepEqual(exportModelResources(scoped, 'channels', target).rows.find(item => item.type === 'channel' && item.id === channel.id).capacity_limits, { rpm: 234, tpm: 2000000 });
    assert.deepEqual(scoped.modelSalePrices, latest.modelSalePrices);
    const wider = exportModelResources(scoped, 'channels');
    const rejectedRange = await request('/model-operations/commands', { operationId: crypto.randomUUID(), expectedRevision: scoped.revision,
      action: { type: 'modelOperations', operation: 'importModelResources', data: { file: wider, target } } });
    assert.equal(rejectedRange.status, 422);
    const foreign = exportModelResources(scoped, 'channels', target);
    foreign.rows.push(wider.rows.find(item => item.type === 'channel' && item.model_id && item.model_id !== channel.model_id));
    const rejectedRow = await request('/model-operations/commands', { operationId: crypto.randomUUID(), expectedRevision: scoped.revision,
      action: { type: 'modelOperations', operation: 'importModelResources', data: { file: foreign, target } } });
    assert.equal(rejectedRow.status, 422);
    assert.deepEqual(domainModelWorkspace(await (await request('/model-operations')).json()), scoped);
  } finally { await local.runtime.dispose(); }
});
