import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

test('后台首页默认概览，已注册业务路径保持可达', () => {
  const source = readFileSync(new URL('../src/AdminConsoleV2.jsx', import.meta.url), 'utf8');
  const resolver = source.match(/const pageFromHash = (\(\) => \{[^\n]+\});/)[1];
  const pages = { dashboard: {}, admins: {}, providers: {} };
  for (const [hash, expected] of [
    ['#/admin-2', 'dashboard'], ['#/admin-2/', 'dashboard'],
    ['#/admin-2/workbench', 'dashboard'], ['#/admin-2/unknown', 'dashboard'],
    ['#/admin-2/constructor', 'dashboard'], ['#/admin-2/dashboard', 'dashboard'],
    ['#/admin-2/admins', 'admins'], ['#/admin-2/providers?provider=p1', 'providers'],
  ]) {
    assert.equal(runInNewContext(`(${resolver})()`, { location: { hash }, pages }), expected, hash);
  }
});
