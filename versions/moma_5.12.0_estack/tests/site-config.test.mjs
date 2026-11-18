import assert from 'node:assert/strict';
import test from 'node:test';
import { canAccessPage } from '../src/admin-v2/navigation.mjs';
import { agreementWithDefault, DEFAULT_USER_TERMS } from '../src/default-site-terms.mjs';
import { DEFAULT_PRIVACY_POLICY } from '../src/default-site-privacy.mjs';
import { readSiteConfig, saveSiteConfig, siteImage, siteUrl, SITE_CONFIG_KEY } from '../src/site-config.mjs';

test('site settings accept image data and web URLs and render agreement text as data', () => {
  assert.equal(siteUrl('javascript:alert(1)'), '');
  assert.equal(siteUrl('https://account:password@example.test/'), '');
  assert.equal(siteImage('data:text/html;base64,PGgxPg=='), '');
  const logo = 'data:image/png;base64,aW1hZ2U=';
  const saved = readSiteConfig(JSON.stringify({
    name: '  私有化站点  ', logo, terms: { text: '<script>example</script>' },
    privacy: { url: 'https://example.test/privacy', text: 'unused' },
  }));
  assert.equal(saved.name, '私有化站点');
  assert.equal(saved.logo, logo);
  assert.deepEqual(saved.terms, { text: '<script>example</script>', url: '' });
  assert.deepEqual(saved.privacy, { text: '', url: 'https://example.test/privacy' });
  assert.equal(readSiteConfig('invalid JSON').logo, '');
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
