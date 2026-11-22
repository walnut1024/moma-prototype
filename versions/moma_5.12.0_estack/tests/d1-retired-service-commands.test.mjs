import { API_PREFIX } from '../api-path.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { startLocalBackend } from '../database/local-runtime.js';
import { domainModelWorkspace } from '../src/mock/model-fields.js';

test('D1 rejects retired service mode and guided creation commands and preserves stored offers and orders', { timeout: 60000 }, async () => {
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
    const baseline = await reload();
    const existingOffers = (await local.db.prepare('SELECT * FROM offers ORDER BY record_id').all()).results;
    const orders = (await local.db.prepare('SELECT * FROM market_orders ORDER BY id').all()).results;
    for (const operation of ['serviceMode', 'createServiceModel', 'createServiceModels', 'guidedServiceConfigure', 'guidedProfileSave']) {
      const input = command(baseline, { type: 'modelOperations', operation, data: {} });
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
