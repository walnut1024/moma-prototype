import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('retired 5.13.0, 5.11.0 and 5.10.2 have no source, public output, deployed output or executable task', () => {
  for (const id of ['moma_5.13.0_estack', 'moma_5.11.0_estack', 'moma_5.10.2_estack']) {
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
  for (const id of ['moma_5.13.0_estack', 'moma_5.11.0_estack', 'moma_5.10.2_estack']) assert.ok(!index.includes(id));
});

test('the root and isolated 5.12.0 build retain resolvable runtime assets', () => {
  const html = read('dist/client/index.html');
  assert.ok(html.includes('/moma_5.12.0_estack/'));
  const entry = read('dist/client/moma_5.12.0_estack/index.html');
  const assets = [...entry.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map(match => match[1]);
  assert.ok(assets.length >= 2);
  for (const asset of assets) {
    for (const id of ['moma_5.13.0_estack', 'moma_5.11.0_estack', 'moma_5.10.2_estack']) assert.ok(!asset.includes(id));
    assert.ok(fs.existsSync(path.join(root, 'dist/client', asset)), asset);
  }
});
