import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

test('development notes stay in the shared banner without the backend selectors', () => {
  const root = new URL('../src/', import.meta.url);
  const entries = readdirSync(root, { recursive: true })
    .filter(file => /\.[cm]?[jt]sx?$/.test(file))
    .flatMap(file => [...readFileSync(new URL(file, root), 'utf8').matchAll(/<DevelopmentNotes\b/g)].map(() => file));
  assert.deepEqual(entries, ['App.jsx'], 'Page-local entries would duplicate or move the shared banner button');
  const source = readFileSync(new URL('App.jsx', root), 'utf8');
  const headerStart = source.indexOf('<header className={admin === "v2"');
  assert(headerStart > 0);
  const header = source.slice(headerStart, source.indexOf('</header>', headerStart));
  assert.match(header, /<div className="banner-version-tools">\s*<DevelopmentNotes admin=\{admin === "v2"\}\/>/);
  assert.doesNotMatch(header, /data-admin-role|admin-version-picker-label/);
  const consoleSource = readFileSync(new URL("AdminConsoleV2.jsx", root), "utf8");
  assert.doesNotMatch(consoleSource, /admin-account-picker-label/);
});
