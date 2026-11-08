import { resetMarketSchemaFixture } from './channel-market-migration-fixture.mjs';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { migrateEmptyDatabase, startLocalBackend } from '../database/local-runtime.js';
import { accountTraffic, effectiveTraffic, modelTraffic } from '../src/admin-v2/traffic-limits.js';

const path = '/traffic-limits';
const historyPath = path + '/history';
const rate = (rpm, tpm) => ({ rpm, tpm });
const code = 'Test@' + randomBytes(8).toString('hex');
const hash = createHash('sha256').update(code).digest('hex');
let local, admin, operator, maintenance;

async function request(path, { session = admin, body, sameOrigin = true } = {}) {
  const response = await local.runtime.dispatchFetch('https://example.test/api/v1' + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(session ? { cookie: session } : {}),
      ...(body ? { origin: sameOrigin ? 'https://example.test' : 'https://other.test',
        'x-moma-request': '1', 'content-type': 'application/json' } : {}),
      ...(body?.operationId ? { 'idempotency-key': body.operationId } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie') };
}

async function login(accountId) {
  const response = await request('/auth/login', { session: null, body: { accountId, accessCode: code } });
  assert.equal(response.status, 200);
  return response.cookie.split(';')[0];
}

const command = (settings, operation, data, id = '') => ({
  operationId: randomUUID(), expectedRevision: settings.revision, accountId: settings.accountId, operation, id, data,
});

async function apply(operation, data, id) {
  const current = (await request(path)).data;
  const result = await request(path, { body: command(current, operation, data, id) });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  const saved = (await request(path)).data;
  assert.equal(saved.revision, current.revision + 1);
  return saved;
}

before(async () => {
  local = await startLocalBackend({ loginHashes: { 'admin-001': hash, 'admin-002': hash, 'test-operator': hash } });
  await local.db.prepare("INSERT INTO admin_accounts(id,name,role) VALUES('test-operator','运营验收','运营人员')").run();
  [admin, operator, maintenance] = await Promise.all(['admin-001', 'test-operator', 'admin-002'].map(login));
}, { timeout: 30000 });
after(async () => { await local?.runtime.dispose(); });

test('D1 seeds both defaults and upgrades a v9 database without changing its saved user limit or history', async () => {
  const fresh = (await request(path)).data;
  assert.deepEqual(fresh.global, rate(60, 3_000_000));
  assert.deepEqual(fresh.modelDefault, rate(600, 30_000_000));
  assert.deepEqual(fresh.rules, []);
  assert.ok(fresh.catalogue.length > 1);
  const legacy = rate(75, 3_250_000);
  const actor = await local.db.prepare("SELECT id FROM admin_sessions WHERE actor_id='admin-001'").first();
  const { commit_seq } = await local.db.prepare('SELECT commit_seq FROM db_state WHERE id=1').first();
  const time = Date.now() - 1000;
  await local.db.batch([
    ...resetMarketSchemaFixture(local.db),
    local.db.prepare('DROP TABLE traffic_limit_rules'),
    local.db.prepare('ALTER TABLE traffic_limit_defaults DROP COLUMN model_rpm'),
    local.db.prepare('ALTER TABLE traffic_limit_defaults DROP COLUMN model_tpm'),
    local.db.prepare('ALTER TABLE traffic_limit_defaults RENAME TO user_traffic_defaults'),
    local.db.prepare('UPDATE user_traffic_defaults SET rpm=?,tpm=?,revision=2 WHERE id=1').bind(legacy.rpm, legacy.tpm),
    local.db.prepare('UPDATE db_state SET schema_version=9 WHERE id=1'),
    local.db.prepare(`INSERT INTO operations(id,actor_id,session_id,idempotency_key,command,request_hash,expected_commit_seq,http_status,response_json,created_at)
      VALUES('legacy-default','admin-001',?,'legacy-default','traffic.defaults','legacy-hash',?,200,'{}',?)`).bind(actor.id, commit_seq, time),
    local.db.prepare(`INSERT INTO audit_events(id,operation_id,entity_type,entity_id,action,diff_json,created_at,record_json)
      VALUES('legacy-audit','legacy-default','traffic-limits','user-traffic-defaults','保存全局默认限流','{}',?,?)`)
      .bind(time, JSON.stringify({ before: fresh.global, after: legacy })),
  ]);
  await migrateEmptyDatabase(local.db);
  assert.equal((await request('/health')).data.schemaVersion, 16);
  const upgraded = (await request(path)).data;
  assert.deepEqual(upgraded.global, legacy);
  assert.deepEqual(upgraded.modelDefault, fresh.modelDefault);
  assert.equal(upgraded.revision, 2);
  const [record] = (await request(historyPath)).data.items;
  assert.equal(record.scope, 'user-default');
  assert.deepEqual(record.before, fresh.global);
  assert.deepEqual(record.after, legacy);
  await migrateEmptyDatabase(local.db);
  assert.deepEqual((await request(path)).data, upgraded);
});

test('both defaults share session, role, revision and idempotency rules', async () => {
  for (const endpoint of [path, historyPath]) {
    assert.equal((await request(endpoint, { session: null })).status, 401);
    assert.equal((await request(endpoint, { session: maintenance })).status, 403);
  }
  assert.equal((await request(historyPath + '?limit=0')).status, 400);
  const current = (await request(path, { session: operator })).data;
  const user = command(current, 'defaults', rate(90, 2_250_001));
  const model = command(current, 'modelDefaults', rate(650, 31_000_000));
  const write = (body, session = operator) => request(path, { session, body });
  assert.equal((await write(model, maintenance)).status, 403);
  assert.equal((await write(model, admin)).data.error.code, 'ACCOUNT_MISMATCH');
  assert.equal((await request(path, { session: operator, body: model, sameOrigin: false })).status, 403);
  assert.equal((await write({ ...model, data: rate(30, 2.25) })).status, 400);
  assert.equal((await write({ ...model, data: rate(0, 2_000_000) })).status, 400);
  assert.equal((await write({ ...model, data: { ...model.data, tpmUnit: 'million' } })).status, 400);
  const candidates = [user, model];
  const results = await Promise.all(candidates.map(candidate => write(candidate)));
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  const winner = results.findIndex(result => result.status === 200);
  const winningCommand = candidates[winner];
  const committed = results[winner].data;
  assert.equal(committed.revision, current.revision + 1);
  assert.deepEqual((await write(winningCommand)).data, committed);
  assert.deepEqual((await request('/operations/' + winningCommand.operationId, { session: operator })).data, committed);
  assert.equal((await write({ ...winningCommand, data: rate(30, 2_000_000) })).data.error.code, 'IDEMPOTENCY_CONFLICT');
  const [entry] = (await request(historyPath + '?limit=1')).data.items;
  assert.equal(entry.scope, winner === 0 ? 'user-default' : 'model-default');
  assert.equal(entry.actorName, '运营验收');
  assert.deepEqual(entry.after, winningCommand.data);
  const loser = candidates[1 - winner];
  const updated = await apply(loser.operation, loser.data);
  assert.deepEqual(updated.global, user.data);
  assert.deepEqual(updated.modelDefault, model.data);
});

test('batch account limits, per-model policies and overrides persist and restore independently', async () => {
  const accountIds = ['tenant-gov', 'tenant-demo'];
  const [accountId] = accountIds;
  const current = (await request(path)).data;
  const [model, other] = current.catalogue;
  const accountLimit = rate(100, 8_000_000);
  const modelLimit = rate(80, 4_000_000);
  const exception = { modelId: model.id, ...rate(90, 3_000_000) };
  const write = body => request(path, { body });
  assert.equal((await write(command(current, 'batchAccounts', { accountIds: [accountId, accountId], limit: accountLimit }))).status, 400);
  assert.equal((await write(command(current, 'model', modelLimit, 'missing-material'))).status, 404);
  assert.equal((await write(command(current, 'exceptions', { exceptions: [exception, exception] }, accountId))).status, 400);
  assert.deepEqual((await request(path)).data, current);

  await apply('batchAccounts', { accountIds, limit: accountLimit });
  const latest = (await request(historyPath + '?limit=1')).data;
  assert.equal(latest.items.length, 2);
  assert.equal(latest.nextCursor, latest.items[0].id);
  assert.equal(new Set(latest.items.map(row => row.id)).size, 2);
  assert.deepEqual(latest.items.map(row => row.objectId), accountIds);
  assert.ok(latest.items.every(row => row.scope === 'account' && row.before === null && row.after.rpm === 100));
  const older = (await request(historyPath + '?limit=1&after=' + latest.nextCursor)).data;
  assert.equal(older.items.length, 1);
  assert.ok(!latest.items.some(row => row.id === older.items[0].id));

  await apply('model', modelLimit, model.id);
  let saved = await apply('exceptions', { exceptions: [exception] }, accountId);
  const resolve = id => effectiveTraffic(saved, accountTraffic(saved, accountId), id);
  assert.equal(resolve(model.id).hit.id, 'exception');
  assert.deepEqual(resolve(model.id).finalLimit, rate(80, 3_000_000));
  assert.equal(resolve(other.id).hit.id, 'account');
  const anotherSession = (await request(path, { session: operator })).data;
  assert.deepEqual(anotherSession.rules, saved.rules);

  saved = await apply('batchAccounts', { accountIds, limit: null });
  assert.equal(resolve(other.id).hit.id, 'global');
  assert.equal(resolve(model.id).hit.id, 'exception');
  saved = await apply('model', null, model.id);
  assert.deepEqual(modelTraffic(saved, model.id), { limit: saved.modelDefault, custom: false });
  assert.deepEqual(resolve(model.id).finalLimit, rate(90, 3_000_000));
  saved = await apply('exceptions', { exceptions: [] }, accountId);
  assert.deepEqual(saved.rules, []);
  const { items } = (await request(historyPath + '?limit=10')).data;
  assert.ok(items.some(row => row.scope === 'model' && row.action === '恢复模型默认额度' && row.after === null));
  assert.ok(items.some(row => row.scope === 'policy' && row.action === '移除一客一策' && row.modelId === model.id && row.after === null));
});

test('a failed batch leaves both its policy rows and its operation receipt untouched', async () => {
  const current = (await request(path)).data;
  const body = command(current, 'batchAccounts', { accountIds: ['tenant-gov', 'failed-account'], limit: rate(80, 4_000_000) });
  await local.db.prepare(`CREATE TRIGGER test_traffic_failure BEFORE INSERT ON traffic_limit_rules
    WHEN NEW.object_id='failed-account' BEGIN SELECT RAISE(ABORT, 'test traffic write failure'); END`).run();
  try {
    assert.equal((await request(path, { body })).status, 503);
    assert.deepEqual((await request(path)).data, current);
    assert.equal((await request('/operations/' + body.operationId)).status, 404);
  } finally {
    await local.db.prepare('DROP TRIGGER test_traffic_failure').run();
  }
  assert.equal((await request(path, { body })).status, 200);
  assert.equal((await request(path)).data.rules.length, 2);
});
