import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { startLocalBackend } from '../database/local-runtime.js';

const origin = 'https://moma.test';
const adminPath = '/announcements';
const customerPath = '/market/announcements';

test('platform announcements reach all signed-in users and dismissal persists for only that account', { timeout: 30_000 }, async t => {
  const credentials = Object.fromEntries(['yyg', 'announcement-operator', 'zqzh', 'grzh'].map(id => [id, randomUUID()]));
  const loginHashes = Object.fromEntries(Object.entries(credentials).map(([id, value]) => [id, createHash('sha256').update(value).digest('hex')]));
  const local = await startLocalBackend({ presets: true, loginHashes });
  t.after(() => local.runtime.dispose());

  const now = Date.now();
  const expiresTomorrow = new Date(now + 86_400_000).toISOString();
  const historical = {
    id: 'notice-historical-target', title: '历史定向维护公告', body: '历史定向范围校验 qa-old-70c4',
    startsAt: new Date(now - 60_000).toISOString(), endsAt: expiresTomorrow, publication: 'published',
    scope: 'selected', tenantIds: ['zqzh'], revision: 1, publisher: '历史发布人',
  };
  const reference = JSON.parse(await local.db.prepare('SELECT reference_json FROM model_workspace WHERE id=1').first('reference_json'));
  reference.announcements.push(historical);
  reference.memberships.push({ id: 'notice-reader-membership', userId: 'grzh', tenantId: 'zqzh', role: '普通成员', status: '正常' });
  await local.db.batch([
    local.db.prepare('UPDATE model_workspace SET reference_json=? WHERE id=1').bind(JSON.stringify(reference)),
    local.db.prepare('INSERT INTO admin_accounts(id,name,role,enabled) VALUES(?,?,?,1)').bind('announcement-operator', '公告验证运营人员', '运营人员'),
  ]);

  async function request(path, { cookie, body, requestOrigin = origin, idempotencyKey } = {}) {
    const response = await local.runtime.dispatchFetch(origin + '/api/v1' + path, {
      method: body ? 'POST' : 'GET',
      headers: {
        ...(cookie && { cookie }),
        ...(body && { origin: requestOrigin, 'x-moma-request': '1', 'content-type': 'application/json' }),
        ...(idempotencyKey && { 'idempotency-key': idempotencyKey }),
      },
      ...(body && { body: JSON.stringify(body) }),
    });
    return { status: response.status, data: await response.json(), cookies: response.headers.getSetCookie() };
  }

  async function signIn(id, kind) {
    const login = await request('/auth/sign-in', { body: { identifier: id, accessCode: credentials[id] } });
    assert.equal(login.status, 200, JSON.stringify(login.data));
    const cookie = login.cookies.find(value => value.startsWith('moma5120_v2_' + kind + '=') && !value.includes('Max-Age=0'));
    assert.ok(cookie, '应签发对应的登录会话');
    return cookie.split(';')[0];
  }

  async function customerAnnouncements(cookie, accountId) {
    const result = await request(customerPath, { cookie });
    assert.equal(result.status, 200, JSON.stringify(result.data));
    assert.equal(result.data.accountId, accountId);
    assert.equal(Object.hasOwn(result.data, 'tenantId'), false);
    return result.data.announcements;
  }

  async function writeAnnouncement(body, status, cookie = admin) {
    const result = await request(adminPath, { body, cookie });
    assert.equal(result.status, status, JSON.stringify(result.data));
    return result.data.announcement;
  }

  const admin = await signIn('yyg', 'session');
  const operator = await signIn('announcement-operator', 'session');
  const enterprise = await signIn('zqzh', 'market');
  const personal = await signIn('grzh', 'market');
  const readAdmin = await request(adminPath, { cookie: admin });
  assert.equal(readAdmin.status, 200, JSON.stringify(readAdmin.data));
  assert.equal(Object.hasOwn(readAdmin.data, 'tenants'), false);
  const legacy = readAdmin.data.announcements.find(row => row.id === 'notice-001');
  assert.equal(legacy?.status, 'draft');
  assert.equal(legacy.title, '国庆假期服务保障通知');
  const inactive = readAdmin.data.announcements.find(row => row.id === historical.id);
  assert.equal(inactive?.status, 'inactive');
  assert.equal(inactive.scope, 'selected');
  assert.equal(Object.hasOwn(inactive, 'tenantIds'), false);

  assert.equal((await request(adminPath)).status, 401);
  assert.equal((await request(adminPath, { cookie: personal })).status, 401);
  assert.equal((await request(adminPath, { cookie: operator })).status, 403);
  assert.equal((await request(customerPath)).status, 401);
  assert.equal((await request(customerPath, { cookie: admin })).status, 401);
  assert.deepEqual(await customerAnnouncements(enterprise, 'zqzh'), []);
  assert.deepEqual(await customerAnnouncements(personal, 'grzh'), []);

  const application = await request('/application', { cookie: admin });
  assert.equal(application.status, 200, JSON.stringify(application.data));
  assert.equal(Object.hasOwn(application.data, 'announcements'), false);
  const operationId = randomUUID();
  const oldWrite = await request('/application/commands', { cookie: admin, idempotencyKey: operationId, body: {
    operationId, expectedRevision: application.data.revision,
    action: { type: 'update', collection: 'announcements', id: legacy.id, changes: { status: '已启用' } },
  } });
  assert.equal(oldWrite.status, 403, JSON.stringify(oldWrite.data));

  const dates = { startsAt: null, endsAt: expiresTomorrow };
  const publicNotice = { title: '全员服务公告', body: '公告正文 qa-all-9b26\n第二行', ...dates };
  const maintenance = { title: '模型服务维护公告', body: '维护期间请保存当前操作。', ...dates };
  await writeAnnouncement({ action: 'publish', ...publicNotice }, 403, operator);
  assert.equal((await request(adminPath, { cookie: admin, body: { action: 'publish', ...publicNotice }, requestOrigin: 'https://other.test' })).status, 403);
  for (const invalid of [
    { ...publicNotice, body: '  ' },
    { ...publicNotice, scope: 'all' },
    { ...publicNotice, tenantIds: ['zqzh'] },
    { ...publicNotice, endsAt: new Date(now - 60_000).toISOString() },
  ]) await writeAnnouncement({ action: 'publish', ...invalid }, 400);
  await writeAnnouncement({ action: 'publish', id: historical.id, revision: historical.revision, ...publicNotice }, 409);

  const draft = await writeAnnouncement({ action: 'draft', ...maintenance }, 200);
  assert.equal(draft.status, 'draft');
  const scheduled = await writeAnnouncement({
    action: 'publish', ...publicNotice, title: '计划公告',
    startsAt: new Date(now + 3_600_000).toISOString(),
  }, 200);
  assert.equal(scheduled.status, 'scheduled');
  assert.deepEqual(await customerAnnouncements(enterprise, 'zqzh'), []);

  const publishedMaintenance = await writeAnnouncement({
    action: 'publish', id: draft.id, revision: draft.revision, ...maintenance,
  }, 200);
  assert.equal(publishedMaintenance.id, draft.id);
  assert.equal(publishedMaintenance.status, 'active');
  assert.equal(publishedMaintenance.revision, draft.revision + 1);
  await writeAnnouncement({ action: 'withdraw', id: draft.id, revision: draft.revision }, 409);
  const publishRequest = { cookie: admin, body: { action: 'publish', ...publicNotice }, idempotencyKey: randomUUID() };
  const published = await request(adminPath, publishRequest);
  assert.equal(published.status, 200, JSON.stringify(published.data));
  const replayed = await request(adminPath, publishRequest);
  assert.equal(replayed.status, 200, JSON.stringify(replayed.data));
  assert.deepEqual(replayed.data, published.data);
  const publishedPublic = published.data.announcement;
  const publicView = { id: publishedPublic.id, title: publicNotice.title, body: publicNotice.body };
  const maintenanceView = { id: draft.id, title: maintenance.title, body: maintenance.body };
  const visible = await customerAnnouncements(enterprise, 'zqzh');
  assert.deepEqual(new Map(visible.map(item => [item.id, item])), new Map([[draft.id, maintenanceView], [publishedPublic.id, publicView]]));
  assert.deepEqual(await customerAnnouncements(personal, 'grzh'), visible);

  for (const [path, cookie] of [['/application', operator], ['/model-operations', operator], ['/market/workspace', personal]]) {
    const result = await request(path, { cookie });
    assert.equal(result.status, 200, JSON.stringify(result.data));
    const serialized = JSON.stringify(result.data);
    for (const value of [publicNotice.title, 'qa-all-9b26', historical.title, 'qa-old-70c4']) {
      assert.equal(serialized.includes(value), false, path + ' exposed announcement data');
    }
  }

  const dismissal = { accountId: 'grzh', ids: [publishedPublic.id] };
  assert.equal((await request(customerPath, { cookie: personal, body: { ...dismissal, tenantId: 'grzh' } })).status, 400);
  assert.equal((await request(customerPath, { cookie: personal, body: { ...dismissal, accountId: 'zqzh' } })).status, 403);
  assert.equal((await request(customerPath, { cookie: personal, body: dismissal, requestOrigin: 'https://other.test' })).status, 403);
  const ignored = await request(customerPath, { cookie: personal, body: { ...dismissal, ids: [historical.id] } });
  assert.equal(ignored.status, 200, JSON.stringify(ignored.data));
  assert.deepEqual(ignored.data.announcements, visible);
  for (let retry = 0; retry < 2; retry++) {
    const dismissed = await request(customerPath, { cookie: personal, body: dismissal });
    assert.equal(dismissed.status, 200, JSON.stringify(dismissed.data));
    assert.deepEqual(dismissed.data, { accountId: 'grzh', announcements: [maintenanceView] });
  }
  const secondLogin = await signIn('grzh', 'market');
  assert.deepEqual(await customerAnnouncements(secondLogin, 'grzh'), [maintenanceView]);
  const switchResult = await request('/market/switch', { cookie: secondLogin, body: { tenantId: 'zqzh' } });
  assert.equal(switchResult.status, 200, JSON.stringify(switchResult.data));
  assert.deepEqual(await customerAnnouncements(secondLogin, 'grzh'), [maintenanceView]);
  assert.deepEqual(await customerAnnouncements(enterprise, 'zqzh'), visible);

  const withdrawn = await writeAnnouncement({ action: 'withdraw', id: draft.id, revision: publishedMaintenance.revision }, 200);
  assert.equal(withdrawn.status, 'withdrawn');
  assert.deepEqual(await customerAnnouncements(enterprise, 'zqzh'), [publicView]);
  assert.deepEqual(await customerAnnouncements(secondLogin, 'grzh'), []);

  for (const action of ['announcement.publish', 'announcement.withdraw']) {
    const log = await request('/audit-logs?action=' + action, { cookie: admin });
    assert.equal(log.status, 200, JSON.stringify(log.data));
    assert.ok(log.data.items.some(event => event.target?.id === draft.id));
  }

  // Move the saved window to the past so expiry does not depend on a real timer.
  const after = JSON.parse(await local.db.prepare('SELECT reference_json FROM model_workspace WHERE id=1').first('reference_json'));
  assert.deepEqual(after.announcements.find(row => row.id === historical.id), historical);
  const expired = after.announcements.find(row => row.id === publishedPublic.id);
  assert.equal(expired.scope, 'all');
  expired.startsAt = new Date(now - 120_000).toISOString();
  expired.endsAt = new Date(now - 60_000).toISOString();
  await local.db.prepare('UPDATE model_workspace SET reference_json=? WHERE id=1').bind(JSON.stringify(after)).run();
  assert.deepEqual(await customerAnnouncements(enterprise, 'zqzh'), []);
  const history = await request(adminPath, { cookie: admin });
  assert.equal(history.status, 200, JSON.stringify(history.data));
  assert.equal(history.data.announcements.find(row => row.id === publishedPublic.id)?.status, 'expired');
});
