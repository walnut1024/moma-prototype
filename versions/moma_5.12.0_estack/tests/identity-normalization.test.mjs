import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { Miniflare } from 'miniflare';
import { inventory, planNormalization, verifyNormalization } from '../database/normalize-identities.mjs';

const old = 'offer-f70421e6-4030-4fcf-aabe-33a8a3b8173f', id = old.replace('offer-', 'model_service-');
const schema = [
  'CREATE TABLE suppliers(id TEXT PRIMARY KEY)', 'CREATE TABLE channels(id TEXT PRIMARY KEY)',
  'CREATE TABLE channel_models(id TEXT PRIMARY KEY)', 'CREATE TABLE materials(id TEXT PRIMARY KEY)',
  'CREATE TABLE offers(record_id TEXT PRIMARY KEY)',
  'CREATE TABLE market_orders(id TEXT PRIMARY KEY,offer_id TEXT REFERENCES offers(record_id),amount INTEGER)',
  'CREATE TABLE operations(id TEXT PRIMARY KEY,response_json TEXT)',
  'CREATE TABLE model_workspace(id INTEGER PRIMARY KEY,revision INTEGER,meta_json TEXT)',
];
const seed = [
  `INSERT INTO offers VALUES('${old}')`,
  `INSERT INTO market_orders VALUES('order-1','${old}',123)`,
  `INSERT INTO operations VALUES('operation-1','{"model_service_id":"${old}","nested":"prefix:${old}:suffix","text":"unchanged"}')`,
  `INSERT INTO model_workspace VALUES(1,7,'{"modelData":{"resourceIds":{"standard:config":"${old}"}}}')`,
];
function fixture() {
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=ON'); db.exec([...schema, ...seed].join(';'));
  const before = Object.fromEntries(['suppliers','channels','channel_models','materials','offers','market_orders','operations','model_workspace'].map(table => [table, db.prepare(`SELECT * FROM ${table}`).all()]));
  return { db, before, plan: planNormalization(db) };
}
test('normalization changes every stored reference atomically, preserves content and rejects legacy IDs', () => {
  const { db, before, plan } = fixture(); db.exec('BEGIN'); db.exec(plan.sql); db.exec('COMMIT');
  verifyNormalization(db, before, plan.mapping);
  assert.equal(db.prepare('SELECT offer_id FROM market_orders').get().offer_id, id);
  assert.throws(() => db.exec(`UPDATE offers SET record_id='${old}'`), /UUID v4/);
  assert.throws(() => db.exec(`INSERT INTO offers VALUES('${id.replace('-4fcf-', '-5fcf-')}')`), /UUID v4/);
  db.exec(`UPDATE offers SET record_id='${id}'`);
  assert.deepEqual(planNormalization(db).mapping, {});
  db.close();
});
test('stale normalization aborts without a partial rename', () => {
  const { db, plan } = fixture(); db.exec('UPDATE model_workspace SET revision=8');
  db.exec('BEGIN'); assert.throws(() => db.exec(plan.sql), /CHECK/); db.exec('ROLLBACK');
  assert.equal(db.prepare('SELECT record_id FROM offers').get().record_id, old);
  assert.equal(db.prepare('SELECT offer_id FROM market_orders').get().offer_id, old);
  db.close();
});
test('D1 batch enforces canonical identities and rolls back a stale plan', async () => {
  const { db: sqlite, plan } = fixture();
  const mf = new Miniflare({ modules:true, script:'export default {fetch(){return new Response("ok")}}', compatibilityDate:'2026-07-30', d1Databases:['DB'] });
  try {
    const db = await mf.getD1Database('DB');
    await db.batch([...schema, ...seed].map(sql => db.prepare(sql)));
    await db.batch(plan.sql.trim().split('\n').map(sql => db.prepare(sql)));
    assert.equal(await db.prepare('SELECT offer_id FROM market_orders').first('offer_id'), id);
    assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results, []);
    await assert.rejects(db.prepare(`UPDATE offers SET record_id='${old}'`).run(), /UUID v4/);
    await assert.rejects(db.batch(plan.sql.trim().split('\n').map(sql => db.prepare(sql))), /CHECK/);
    assert.equal(await db.prepare('SELECT revision FROM model_workspace').first('revision'), 8);
    assert.equal(await db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE name='_identity_migration_guard'").first('n'), 0);
    assert.equal(inventory(sqlite).find(row => row.table === 'offers').invalid.length, 1);
  } finally { sqlite.close(); await mf.dispose(); }
});
