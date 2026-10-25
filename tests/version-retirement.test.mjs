import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('retired 5.13.0 has no source, public output, deployed output or executable task', () => {
  for (const directory of ['versions/moma_5.13.0_estack', 'public/moma_5.13.0_estack', 'dist/client/moma_5.13.0_estack']) {
    assert.equal(fs.existsSync(path.join(root, directory)), false, directory);
  }
  const { scripts } = JSON.parse(read('package.json'));
  assert.ok(!Object.entries(scripts).some(([name, command]) => /5\.13\.0/.test(name + command)));
  assert.ok(!read('.oxlintrc.json').includes('moma_5.13.0_estack'));
});

test('the directory retains 5.12.0, 5.11.0 and the existing 5.10.2 release only', () => {
  const versions = read('src/App.jsx').match(/const prototypeVersions = \[([\s\S]*?)\n\];/)[1];
  assert.deepEqual([...versions.matchAll(/id: "([^"]+)"/g)].map(match => match[1]), [
    'moma_5.12.0_estack', 'moma_5.11.0_estack', 'moma_5.10.2_estack',
  ]);
  assert.match(versions, /id: "moma_5\.12\.0_estack",\s*state: "当前版本"/);
});

test('the root and isolated 5.12.0 build retain resolvable runtime assets', () => {
  for (const entry of ['dist/client/index.html', 'dist/client/moma_5.12.0_estack/index.html']) {
    const html = read(entry);
    const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map(match => match[1]);
    assert.ok(assets.length >= 2);
    for (const asset of assets) {
      assert.ok(!asset.includes('moma_5.13.0_estack'));
      assert.ok(fs.existsSync(path.join(root, 'dist/client', asset)), asset);
    }
  }
});
