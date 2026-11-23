import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { planAddressMigration } from '../database/connection-address-migration.mjs';

test('address migration preserves the old destination, supports rollback and rejects a stale plan', () => {
  const db = new DatabaseSync(':memory:');
  db.exec("CREATE TABLE channels(id,base_url,connection_json,record_json); CREATE TABLE simulation_records(kind,payload_json); CREATE TABLE channel_models(channel_id);");
  const baseUrl = 'https://example.invalid', path = '/api/v3/chat/completions';
  const record = { id: 'example', interfaceType: 'openai', modelProtocol: 'openai', baseUrl, endpointPath: path, status: '停用' };
  db.prepare('INSERT INTO channels VALUES(?,?,?,?)').run(record.id,baseUrl,JSON.stringify({endpointPath:path}),JSON.stringify(record));
  const plan = planAddressMigration(db);
  assert.deepEqual(plan.report.changed, ['example']);
  db.exec(plan.forward);
  const saved = JSON.parse(db.prepare('SELECT record_json FROM channels').get().record_json);
  assert.equal(saved.baseUrl, baseUrl + '/api/v3');
  assert.equal(saved.baseUrl + saved.endpointPath, baseUrl + path);
  assert.equal(saved.status, record.status);
  db.exec(plan.rollback);
  assert.deepEqual(JSON.parse(db.prepare('SELECT record_json FROM channels').get().record_json), record);
  db.exec("UPDATE channels SET base_url='concurrent change'; BEGIN");
  assert.throws(() => db.exec(plan.forward), /CHECK constraint/);
  db.exec('ROLLBACK');
  db.close();
});
