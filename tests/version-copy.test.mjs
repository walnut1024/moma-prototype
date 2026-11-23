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
    ['workspace-storage.mjs', 'moma-5120-workspace-v2:'],
    ['admin-v2/store.js', 'ADMIN_DATA_KEY'],
    ['auth-state.mjs', 'AUTH_DATA_KEY'],
    ['experience-drafts.mjs', 'workspaceStoragePrefix}draft:'],
    ['components/SavedFilterViews.jsx', "workspaceStoragePrefix + 'filter-views:'"],
    ['admin-v2/UsageAnalysisPage.jsx', "workspaceStoragePrefix + 'usage-analysis:card-order'"],
    ['organization-data.mjs', "workspaceStoragePrefix + 'organization'"],
  ]) {
    assert.ok(fs.readFileSync(path.join(version, 'src', file), 'utf8').includes(key));
  }
  const textExperience=fs.readFileSync(path.join(version,'src/TextExperience.jsx'),'utf8');
  assert.match(textExperience,/marketRequest\('conversations'/);
  assert.doesNotMatch(textExperience,/localStorage/);
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
  const assets = path.join(root, 'dist/client/moma_5.12.0_estack/assets/compiled');
  const orderStylesheet = fs.readdirSync(assets).find(file => /^ModelOrderList-.*\.css$/.test(file));
  assert.ok(orderStylesheet, 'Missing model order route CSS');
  const css = fs.readFileSync(path.join(assets, orderStylesheet), 'utf8');
  for (const selector of ['.model-order-table', '.service-order-table', '.service-order-footer', '.order-confirm-modal', '.order-quote']) {
    assert.match(css, new RegExp(selector.replace('.', '\\.') + '(?=[,{\\s])'), 'Missing order layout: ' + selector);
  }
});
