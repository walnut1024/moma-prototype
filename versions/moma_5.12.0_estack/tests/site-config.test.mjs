import assert from 'node:assert/strict';
import test from 'node:test';
import { canAccessPage } from '../src/admin-v2/navigation.mjs';
import { agreementWithDefault, DEFAULT_USER_TERMS } from '../src/default-site-terms.mjs';
import { DEFAULT_PRIVACY_POLICY } from '../src/default-site-privacy.mjs';
import { DEFAULT_USER_CONSOLE_NAME, DEFAULT_WORKBENCH_NAME, readSiteConfig, saveSiteConfig, siteImage, siteUrl, SITE_CONFIG_KEY } from '../src/site-config.mjs';

import { isPortalHomeEntry, portalHomeUrl } from '../src/portal-home.mjs';
import { LOGIN_BASE } from '../src/login-navigation.mjs';

test('a portal only replaces a fresh visit to the version home', () => {
  const origin = 'https://moma.example.test';
  for (const path of [LOGIN_BASE, LOGIN_BASE.slice(0, -1), LOGIN_BASE + 'index.html']) {
    assert.equal(isPortalHomeEntry(new URL(path, origin)), true);
    assert.equal(portalHomeUrl(origin + path, origin), '');
  }
  for (const path of ['/','?page=workspace','#/admin-2/dashboard','#/auth/login','#/agreements/terms','order/serviceOrder/']) {
    assert.equal(isPortalHomeEntry(new URL(path, origin + LOGIN_BASE)), false, path);
  }
  assert.equal(portalHomeUrl(' https://portal.example.test/landing ', origin), 'https://portal.example.test/landing');
  assert.equal(portalHomeUrl(origin + '/landing', origin), origin + '/landing');
  assert.equal(portalHomeUrl(origin + LOGIN_BASE + '?page=workspace', origin), origin + LOGIN_BASE + '?page=workspace');
});

test('site settings accept image data and web URLs and render agreement text as data', () => {
  assert.equal(siteUrl('javascript:alert(1)'), '');
  assert.equal(siteUrl('https://account:password@example.test/'), '');
  assert.equal(siteImage('data:text/html;base64,PGgxPg=='), '');
  const logo = 'data:image/png;base64,aW1hZ2U=';
  const saved = readSiteConfig(JSON.stringify({
    name: '  私有化站点  ', logo, terms: { text: '<script>example</script>' },
    privacy: { url: 'https://example.test/privacy', text: 'unused' },
  }));
  assert.equal(saved.userConsoleName, '私有化站点');
  assert.equal(saved.workbenchName || DEFAULT_WORKBENCH_NAME, 'Token 管理工作台');
  assert.equal(Object.hasOwn(saved, 'name'), false);
  assert.equal(saved.logo, logo);
  assert.deepEqual(saved.terms, { text: '<script>example</script>', url: '' });
  assert.deepEqual(saved.privacy, { text: '', url: 'https://example.test/privacy' });
  assert.equal(readSiteConfig('invalid JSON').logo, '');
});

test('console names are independent and a cleared new field ignores the legacy name', () => {
  const config = readSiteConfig(JSON.stringify({
    name: '旧名称', userConsoleName: '  ', workbenchName: ' 运营中心 ', title: '自定义浏览器标题',
  }));
  assert.equal(config.userConsoleName || DEFAULT_USER_CONSOLE_NAME, '模型服务平台 MoMA 政企版');
  assert.equal(config.workbenchName, '运营中心');
  assert.equal(config.title, '自定义浏览器标题');
});

test('site settings cannot overwrite a newer draft and surface storage failures', () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  assert.equal(saveSiteConfig(storage, null, { name: '原配置' }), true);
  const snapshot = storage.getItem(SITE_CONFIG_KEY);
  assert.equal(saveSiteConfig(storage, null, { name: '过期草稿' }), false);
  storage.setItem = () => { throw new Error('quota'); };
  assert.throws(() => saveSiteConfig(storage, snapshot, { name: '新草稿' }), /quota/);
  assert.equal(storage.getItem(SITE_CONFIG_KEY), snapshot);
  assert.equal(canAccessPage('平台管理员', 'site-configuration'), false);
});

test('bundled agreements apply to empty settings and preserve saved text and links', () => {
  const { terms, privacy } = readSiteConfig(null);
  assert.equal(agreementWithDefault('terms', terms).text, DEFAULT_USER_TERMS);
  assert.ok(DEFAULT_USER_TERMS.length > 2500);
  assert.equal(agreementWithDefault('privacy', privacy).text, DEFAULT_PRIVACY_POLICY);
  assert.ok(DEFAULT_PRIVACY_POLICY.length > 2500);
  const custom = { text: '自定义条款', url: '' };
  const linked = { text: '', url: 'https://example.test/terms' };
  assert.equal(agreementWithDefault('terms', custom), custom);
  assert.equal(agreementWithDefault('terms', linked), linked);
  assert.equal(agreementWithDefault('privacy', custom), custom);
  assert.equal(agreementWithDefault('privacy', linked), linked);
});
