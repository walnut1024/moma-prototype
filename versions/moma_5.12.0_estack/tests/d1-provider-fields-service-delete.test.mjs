import {seedExistingService} from './legacy-service-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { startLocalBackend } from '../database/local-runtime.js';
import { domainModelWorkspace } from '../src/mock/model-fields.js';
import { providerApiKeysDraft, providerApiKeyRows } from '../src/admin-v2/provider-management.js';
import { supplierChannelResources } from '../src/admin-v2/supplier-resources.js';
import { modelChanges } from '../server/model-repository.js';
import { resourceId } from '../src/resource-id.mjs';

test('HTTP/D1 saves multiple provider URLs and keys atomically, and protects its master and price history after deleting a service', { timeout: 60000 }, async () => {
  const accessCode = randomBytes(24).toString('hex');
  const local = await startLocalBackend({ demo: true, loginHashes: { 'admin-001': createHash('sha256').update(accessCode).digest('hex') } });
  let cookie = '';
  const request = (path, body) => local.runtime.dispatchFetch('https://example.test/api/v1' + path, {
    method: body ? 'POST' : 'GET', headers: { ...(cookie ? { cookie } : {}), ...(body ? { origin: 'https://example.test', 'x-moma-request': '1', 'content-type': 'application/json' } : {}), ...(body?.operationId ? { 'idempotency-key': body.operationId } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const read = async () => domainModelWorkspace(await (await request('/model-operations')).json());
  const command = (state, operation, data, modelId) => ({ operationId: crypto.randomUUID(), expectedRevision: state.revision, action: { type: 'modelOperations', operation, modelId, data } });
  const send = async (body, expected = 200) => { const response = await request('/model-operations/commands', body); assert.equal(response.status, expected, await response.clone().text()); return response.json(); };
  try {
    await send(command({ revision: 0 }, 'serviceDelete', {}, 'missing'), 401);
    const login = await request('/auth/login', { accountId: 'admin-001', accessCode }); assert.equal(login.status, 200); cookie = login.headers.get('set-cookie').split(';')[0];
    let state = await read();
    const secrets = ['d1-first-intake-secret-123456', 'd1-second-intake-secret-654321'], { apiKeys } = await providerApiKeysDraft(secrets);
    const document = { provider: { name: 'D1 多地址密钥', code: 'd1-multiple-keys', source_type: 'thirdParty', website: 'https://example.invalid', description: '描'.repeat(300), models: [], connections: [1, 2].map(index => ({ connection_id: 'address-' + index, base_url: `https://api${index}.example.invalid/v1`, protocol: 'OpenAI', interface_type: 'openai' })) } };
    const before = structuredClone(state);
    await send(command(state, 'providerIntake', { document, apiKeys: [apiKeys[0], apiKeys[0]], confirmed: true }), 422);
    assert.deepEqual(await read(), before);
    const intake = command(state, 'providerIntake', { document, apiKeys, confirmed: true }); await send(intake); await send(intake);
    state = await read(); const provider = state.providers.find(row => row.code === 'd1-multiple-keys');
    assert.equal(providerApiKeyRows(state, provider).length, 2); assert.equal(supplierChannelResources(state, provider).length, 2);
    for (const secret of secrets) {
      assert(!JSON.stringify(state).includes(secret));
      const records = await local.db.prepare('SELECT record_json FROM audit_events').all(); assert(!JSON.stringify(records.results).includes(secret));
    }
    await send(command(state, 'provider', { operation: 'summary', objectId: provider.id, values: { name: provider.name, code: 'renamed-code', expectedUpdatedAt: provider.updatedAt } }), 422);
    assert.equal((await read()).providers.find(row => row.id === provider.id).code, provider.code);
    await send(command(state, 'supplierModelsRegister', { providerId: provider.id, libraryIds: ['builtin-pp-ocrv6'] })); state = await read();
    await seedExistingService(local.db,state,{ libraryIds: ['builtin-pp-ocrv6'], serviceMode: 'standard' }); state = await read();
    const model = state.models.find(row => row.templateId === 'builtin-pp-ocrv6'), master = structuredClone(state.modelTemplates.find(row => row.id === model.templateId));
    const priced = structuredClone(state), priceId = resourceId('sale-price-version');
    priced.modelSalePrices.push({ id: priceId, modelId: model.id, scope: 'model', serviceModeRevision: 1, version: 1, status: '已发布', effectiveAt: '2026-01-01T00:00:00.000Z', items: [{ name: state.tariffDictionary.find(row => row.kind === 'scenario').name, unit: state.tariffDictionary.find(row => row.kind === 'unit').name, currency: 'CNY', amount: 1000000 }] });
    await local.db.batch([local.db.prepare('PRAGMA defer_foreign_keys=ON'), ...modelChanges(local.db, state, priced)]); state = await read();
    const priceHistory = async () => ({ version: await local.db.prepare('SELECT * FROM price_versions WHERE id=?').bind(priceId).first(), items: (await local.db.prepare('SELECT * FROM price_items WHERE price_version_id=? ORDER BY id').bind(priceId).all()).results });
    const preservedPrice = await priceHistory(); assert.ok(preservedPrice.version); assert(preservedPrice.items.length > 0);
    const data = { expectedUpdatedAt: model.updatedAt, confirmed: true };
    await local.db.prepare('INSERT INTO market_orders(id,tenant_id,offer_id,sale_price_id,created_at) VALUES(?,?,?,?,?)').bind('deletion-history-fixture', 'test-tenant', preservedPrice.version.offer_id, priceId, Date.now()).run();
    assert.match(JSON.stringify(await send(command(state, 'serviceDelete', data, model.id), 422)), /订单或调用记录/);
    assert.deepEqual(await read(), state);
    await local.db.prepare('DELETE FROM market_orders WHERE id=?').bind('deletion-history-fixture').run();
    await send(command(state, 'serviceDelete', { ...data, expectedUpdatedAt: 'stale' }, model.id), 422);
    await send(command({ ...state, revision: state.revision - 1 }, 'serviceDelete', data, model.id), 409);
    const deletion = command(state, 'serviceDelete', data, model.id); await send(deletion); await send(deletion);
    state = await read(); assert(!state.models.some(row => row.id === model.id)); assert.deepEqual(state.modelTemplates.find(row => row.id === master.id), master);
    assert(await local.db.prepare('SELECT deleted_at FROM services WHERE id=?').bind(model.id).first('deleted_at'));
    assert.equal((await local.db.prepare('SELECT COUNT(*) AS n FROM model_versions WHERE service_id=?').bind(model.id).first('n')), 1);
    const currentProvider = state.providers.find(row => row.id === provider.id);
    await send(command(state, 'provider', { operation: 'summary', objectId: provider.id, values: { name: currentProvider.name, code: currentProvider.code, expectedUpdatedAt: currentProvider.updatedAt } })); state = await read();
    assert.deepEqual(await priceHistory(), preservedPrice);
    await send(command(state, 'createServiceModels', { libraryIds: [master.id], serviceMode: 'provider' }),422);
    assert.deepEqual(await read(),state);
    assert.deepEqual(await priceHistory(), preservedPrice);
    assert.equal((await local.db.prepare('PRAGMA foreign_key_check').all()).results.length, 0);
  } finally { await local.runtime.dispose(); }
});
