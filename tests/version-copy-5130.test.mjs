import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const version = path.join(root, 'versions/moma_5.13.0_estack');
test('5.13.0 source and assets are physical copies with imports constrained to their own version', () => {
  function check(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      assert.ok(!entry.isSymbolicLink(), file);
      if (entry.isDirectory()) { check(file); continue; }
      if (!/\.(jsx?|mjs|css)$/.test(file)) continue;
      for (const match of fs.readFileSync(file, 'utf8').matchAll(/(?:from\s*|import\s*\()\s*['"](\.[^'"]+)['"]/g)) assert.ok(path.resolve(path.dirname(file), match[1]).startsWith(version + '/'), file);
    }
  }
  check(path.join(version, 'src'));
  assert.ok(fs.existsSync(path.join(version, 'public/assets/jiangSuZhengWu.png')));
  const oldStore = fs.readFileSync(path.join(root, 'versions/moma_5.12.0_estack/src/admin-v2/store.js'), 'utf8');
  const newStore = fs.readFileSync(path.join(version, 'src/admin-v2/store.js'), 'utf8');
  assert.match(oldStore, /moma\.adminV2\.5120\.v1/); assert.match(newStore, /moma\.adminV2\.5130\.v1/);
  assert.ok(!oldStore.includes('workspaceTransaction'));
  assert.match(fs.readFileSync(path.join(version, 'src/TextExperience.jsx'), 'utf8'), /runtime\?\.storageKey/);
});
test('built 5.13.0 page and deep order entry load only new-version runtime assets', () => {
  const html = fs.readFileSync(path.join(root, 'public/moma_5.13.0_estack/index.html'), 'utf8');
  assert.equal(fs.readFileSync(path.join(root, 'public/moma_5.13.0_estack/order/serviceOrder/index.html'), 'utf8'), html);
  const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map(match => match[1]);
  assert.ok(assets.length >= 2);
  for (const asset of assets) { assert.ok(asset.startsWith('/moma_5.13.0_estack/assets/')); assert.ok(fs.existsSync(path.join(root, 'public', asset))); }
  assert.match(fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8'), /moma_5\.13\.0_estack/);
});
