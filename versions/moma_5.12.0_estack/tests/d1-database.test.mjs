import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { Miniflare } from 'miniflare';
import { migrateEmptyDatabase, startLocalBackend } from '../database/local-runtime.js';
import { createSeed, initializeDatabase } from '../database/seed.js';

test('initialization is atomic, refuses an incompatible seed, and preserves zero/unknown price semantics', async () => {
  const runtime = new Miniflare({ modules: true, script: "export default {fetch(){return new Response('test')}}", compatibilityDate: '2026-07-30', d1Databases: ['MODEL_OPS_DB'] });
  try {
    const db = await runtime.getD1Database('MODEL_OPS_DB'); await migrateEmptyDatabase(db);
    const seed = await createSeed(), broken = structuredClone(seed);
    broken.pointers[0].value = 'wrong-price-owner';
    await assert.rejects(initializeDatabase(db, broken), /FOREIGN KEY/);
    assert.equal((await db.prepare('SELECT count(*) AS n FROM materials').first()).n, 0);
    assert.equal((await db.prepare('SELECT count(*) AS n FROM seed_runs').first()).n, 0);
    await initializeDatabase(db, seed);
    await assert.rejects(initializeDatabase(db, { ...seed, contentHash: 'different' }), /拒绝覆盖/);
    const old = await db.prepare('SELECT * FROM price_items LIMIT 1').first();
    const sql = 'INSERT INTO price_items(id,price_version_id,billing_item_id,unit_id,currency_id,amount_micros,unit_quantity,condition_json,condition_hash,labels_json,position) VALUES(?,?,?,?,?,?,?,?,?,?,?)';
    const values = amount => ['test-price',old.price_version_id,old.billing_item_id,old.unit_id,old.currency_id,amount,1,'{}','test-price','{}',0];
    for (const amount of [null,-1,0.5]) await assert.rejects(db.prepare(sql).bind(...values(amount)).run(), /constraint|CHECK|NOT NULL/i);
    await db.prepare(sql).bind(...values(0)).run();
    assert.equal((await db.prepare("SELECT amount_micros FROM price_items WHERE id='test-price'").first()).amount_micros, 0);
  } finally { await runtime.dispose(); }
});

test('D1 state survives runtime restart and reinitialization never replaces an edit', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'moma-5120-d1-'));
  const accessCode = randomBytes(32).toString('hex'), loginHashes = { 'admin-001': createHash('sha256').update(accessCode).digest('hex') };
  let local;
  try {
    local = await startLocalBackend({ persistPath: dir, loginHashes });
    const login = await local.runtime.dispatchFetch('https://example.test/api/5120/auth/login', { method: 'POST', headers: { origin: 'https://example.test', 'x-moma-request': '1', 'content-type': 'application/json' }, body: JSON.stringify({ accountId: 'admin-001', accessCode }) });
    assert.equal(login.status, 200); await login.json();
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const write = await local.runtime.dispatchFetch('https://example.test/api/5120/services/model-glm53/visibility', { method: 'POST', headers: { cookie, origin: 'https://example.test', 'x-moma-request': '1', 'content-type': 'application/json', 'idempotency-key': 'persist' }, body: JSON.stringify({ operationId: 'persist', expectedRevision: 1, visible: false }) });
    assert.equal(write.status, 200); const receipt = await write.json();
    await local.runtime.dispose(); local = undefined;
    local = await startLocalBackend({ persistPath: dir, loginHashes });
    assert.equal(local.initialization.initialized, false);
    const response = await local.runtime.dispatchFetch('https://example.test/api/5120/services/model-glm53/workspace', { headers: { cookie } });
    const workspace = await response.json(); assert.equal(response.status, 200);
    assert.equal(workspace.service.revision, receipt.revision); assert.equal(workspace.service.marketVisible, false);
    const replay = await local.runtime.dispatchFetch('https://example.test/api/5120/operations/persist', { headers: { cookie } });
    assert.deepEqual(await replay.json(), receipt);
  } finally { await local?.runtime.dispose(); await rm(dir, { recursive: true, force: true }); }
});
