import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { startLocalBackend } from '../database/local-runtime.js';

test('the requirements document is readable only by an active operations or platform admin session', { timeout: 30_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'moma-requirements-fixture-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const fixture = join(directory, 'requirements.md');
  const title = 'Published requirement fixture';
  await writeFile(fixture, [
    '# ' + title,
    '',
    '[目录](#模型接入)',
    '',
    '## 模型接入',
    '',
    '| 字段 | 值 |',
    '| --- | --- |',
    '| 连接 | 示例 |',
    '',
    '<span data-raw="fixture">raw HTML</span>',
  ].join('\n'));
  const password = 'Test@' + randomBytes(12).toString('hex');
  const hash = createHash('sha256').update(password).digest('hex');
  const source = process.env.MOMA_REQUIREMENTS_SOURCE;
  let local;
  try {
    process.env.MOMA_REQUIREMENTS_SOURCE = fixture;
    local = await startLocalBackend({
      presets: true,
      loginHashes: { 'admin-001': hash, 'admin-002': hash, 'requirements-operator': hash, grzh: hash },
    });
    t.after(() => local.runtime.dispose());
  } finally {
    if (source === undefined) delete process.env.MOMA_REQUIREMENTS_SOURCE;
    else process.env.MOMA_REQUIREMENTS_SOURCE = source;
  }
  await local.db.prepare("INSERT INTO admin_accounts(id, name, role) VALUES('requirements-operator', '需求文档验收', '运营人员')").run();

  const origin = 'https://example.test';
  const request = (path, { cookie, method = 'GET', body } = {}) =>
    local.runtime.dispatchFetch(origin + '/api/v1' + path, {
      method,
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(method === 'POST' ? { origin, 'x-moma-request': '1', 'content-type': 'application/json' } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const signIn = async (identifier, expectedRole) => {
    const response = await request('/auth/sign-in', { method: 'POST', body: { identifier, accessCode: password } });
    assert.equal(response.status, 200);
    const { account } = await response.json();
    assert.equal(account?.role, expectedRole);
    const session = response.headers.getSetCookie().find(value => !value.includes('Max-Age=0'));
    assert(session);
    return session.split(';')[0];
  };
  const administrator = await signIn('admin-001', '平台管理员');
  const operator = await signIn('requirements-operator', '运营人员');
  const maintenance = await signIn('admin-002', '运维人员');
  const tenant = await signIn('grzh');
  assert.match(tenant, /^moma5120_v2_market=/);

  const snapshot = () => local.db.prepare(`
    SELECT commit_seq,
      (SELECT revision FROM model_workspace WHERE id=1) AS revision,
      (SELECT COUNT(*) FROM operations) AS operations,
      (SELECT COUNT(*) FROM audit_events) AS audit_events
    FROM db_state WHERE id=1`).first();
  const before = await snapshot();
  const path = '/docs/model-operations';
  for (const cookie of [administrator, operator]) {
    const response = await request(path, { cookie });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^application\/json\b/);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('set-cookie'), null);
    const body = await response.json();
    assert.deepEqual(Object.keys(body), ['html']);
    assert.match(body.html, /<h1(?:\s[^>]*)?>Published requirement fixture<\/h1>/);
    assert.match(body.html, /href="about:srcdoc#%E6%A8%A1%E5%9E%8B%E6%8E%A5%E5%85%A5"/);
    assert.match(body.html, /<h2 id="模型接入">模型接入<\/h2>/);
    assert.match(body.html, /<table>/);
    assert.doesNotMatch(body.html, /<span data-raw=/);
  }
  for (const [cookie, status, code] of [
    [undefined, 401, 'SESSION_EXPIRED'],
    [tenant, 401, 'SESSION_EXPIRED'],
    [maintenance, 403, 'FORBIDDEN'],
  ]) {
    const response = await request(path, { cookie });
    assert.equal(response.status, status);
    assert.match(response.headers.get('cache-control'), /\bno-store\b/);
    const body = await response.json();
    assert.equal(body.error.code, code);
    assert(!JSON.stringify(body).includes(title));
  }
  const post = await request(path, { cookie: administrator, method: 'POST', body: {} });
  assert.equal(post.status, 405);
  assert.equal((await post.json()).error.code, 'METHOD_NOT_ALLOWED');
  assert.deepEqual(await snapshot(), before);
});
