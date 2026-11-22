import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const retiredVersions = ['moma_5.13.0_estack', 'moma_5.11.0_estack', 'moma_5.10.2_estack'];

test('retired 5.13.0, 5.11.0 and 5.10.2 have no source, public output, deployed output or executable task', () => {
  for (const id of retiredVersions) {
    for (const directory of [`versions/${id}`, `public/${id}`, `dist/client/${id}`]) {
      assert.equal(fs.existsSync(path.join(root, directory)), false, directory);
    }
  }
  // The root application that hosted both retired versions is gone as well.
  for (const entry of ['src', 'vite.config.mjs', 'public/assets', 'public/enterprise-regions']) {
    assert.equal(fs.existsSync(path.join(root, entry)), false, entry);
  }
  assert.ok(!read('.oxlintrc.json').includes('moma_5.13.0_estack'));
  const { scripts } = JSON.parse(read('package.json'));
  assert.ok(!Object.entries(scripts).some(([name, command]) => /5\.13\.0|5\.11\.0|5\.10\.2|test:admin|test:usage/.test(name + command)));
});

test('the directory retains the 5.12.0 release only, listed by the version app and the static root index', () => {
  const versions = read('versions/moma_5.12.0_estack/src/App.jsx').match(/const prototypeVersions = \[([\s\S]*?)\n\];/)[1];
  assert.deepEqual([...versions.matchAll(/id: "([^"]+)"/g)].map(match => match[1]), ['moma_5.12.0_estack']);
  assert.match(versions, /id: "moma_5\.12\.0_estack",\s*state: "当前版本"/);
  const index = read('index.html');
  assert.ok(index.includes('href="/moma_5.12.0_estack/"'));
  for (const id of retiredVersions) {
    const version = id.split('_')[1];
    assert.ok(!index.includes(version), version);
    assert.ok(!versions.includes(version), version);
  }
});

test('the Pages build redirects retired entries and their nested paths to the current version', () => {
  const rules = read('dist/client/_redirects').trim().split('\n');
  assert.deepEqual(rules.sort(), retiredVersions.flatMap(id =>
    ['', '/', '/*'].map(suffix => `/${id}${suffix} /moma_5.12.0_estack/ 301`)).sort());
});

test('the root and isolated 5.12.0 build retain resolvable runtime assets', () => {
  const html = read('dist/client/index.html');
  assert.ok(html.includes('/moma_5.12.0_estack/'));
  const entry = read('dist/client/moma_5.12.0_estack/index.html');
  const assets = [...entry.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map(match => match[1]);
  assert.ok(assets.length >= 2);
  for (const asset of assets) {
    for (const id of retiredVersions) assert.ok(!asset.includes(id));
    assert.ok(fs.existsSync(path.join(root, 'dist/client', asset)), asset);
  }
});
