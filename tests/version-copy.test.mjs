import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const version = path.join(root, 'versions/moma_5.12.0_estack');

test('5.12.0 has its own source, styles, public assets and storage keys', () => {
  function check(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      assert.ok(!entry.isSymbolicLink(), file);
      if (entry.isDirectory()) { check(file); continue; }
      const source = fs.readFileSync(file, 'utf8');
      for (const match of source.matchAll(/(?:from\s*|import\s*\()\s*['"](\.[^'"]+)['"]/g)) {
        assert.ok(path.resolve(path.dirname(file), match[1]).startsWith(version + '/'), `Shared import: ${file} ${match[1]}`);
      }
      assert.ok(!source.includes('"/assets/') && !source.includes("'/assets/") && !source.includes('`/assets/'), file);
    }
  }
  check(path.join(version, 'src'));
  assert.ok(fs.readFileSync(path.join(version, 'src/styles.css'), 'utf8').includes('source("./")'));
  assert.ok(fs.existsSync(path.join(version, 'public/assets/jiangSuZhengWu.png')));
  assert.ok(fs.readFileSync(path.join(version, 'vite.config.mjs'), 'utf8').includes("path.join(import.meta.dirname, 'src')"));
  for (const [file, key] of [
    ['admin-v2/store.js', 'moma.adminV2.5120.v1'],
    ['auth-state.mjs', 'moma-auth-prototype-5120-v1'],
    ['TextExperience.jsx', 'moma-text-conversations-5120-v1'],
    ['components/SavedFilterViews.jsx', 'moma-5120-filter-views:'],
    ['admin-v2/UsageAnalysisPage.jsx', 'moma:5120:usage-analysis:card-order:v1'],
    ['organization-data.mjs', 'moma-organization:moma_5.12.0_estack'],
  ]) {
    assert.ok(fs.readFileSync(path.join(version, 'src', file), 'utf8').includes(key));
  }
});

test('the built 5.12.0 entry loads only its own JS and CSS', () => {
  const html = fs.readFileSync(path.join(root, 'dist/client/moma_5.12.0_estack/index.html'), 'utf8');
  assert.equal(fs.readFileSync(path.join(root, 'dist/client/moma_5.12.0_estack/order/serviceOrder/index.html'), 'utf8'), html);
  const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map(match => match[1]);
  assert.equal(assets.length, 2);
  for (const asset of assets) {
    assert.ok(asset.startsWith('/moma_5.12.0_estack/assets/'), asset);
    assert.ok(fs.existsSync(path.join(root, 'dist/client', asset)));
  }
});

test('the built 5.12.0 keeps order table, checkout and confirmation layout', () => {
  const html = fs.readFileSync(path.join(root, 'dist/client/moma_5.12.0_estack/index.html'), 'utf8');
  const cssPath = [...html.matchAll(/href="([^"]+\.css)"/g)][0][1];
  const css = fs.readFileSync(path.join(root, 'dist/client', cssPath), 'utf8');
  for (const selector of ['.legacy-order-row', '.service-order-row', '.service-order-footer', '.order-confirm-backdrop']) {
    assert.ok(css.includes(selector + '{'), 'Missing order layout: ' + selector);
  }
});
