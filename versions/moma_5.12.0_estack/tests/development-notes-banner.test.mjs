import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

test('every development-notes entry comes from the shared banner immediately before the version selector', () => {
  const root = new URL('../src/', import.meta.url);
  const entries = readdirSync(root, { recursive: true })
    .filter(file => /\.[cm]?[jt]sx?$/.test(file))
    .flatMap(file => [...readFileSync(new URL(file, root), 'utf8').matchAll(/<DevelopmentNotes\b/g)].map(() => file));
  assert.deepEqual(entries, ['App.jsx'], 'Page-local entries would duplicate or move the shared banner button');
  const source = readFileSync(new URL('App.jsx', root), 'utf8');
  const headerStart = source.indexOf('<header className={admin === "v2"');
  assert(headerStart > 0);
  const header = source.slice(headerStart, source.indexOf('</header>', headerStart));
  assert.match(header, /\)\}\s*<div className="banner-version-tools">\s*<DevelopmentNotes\/>\s*<div className="version-switch">/, 'Front and backend must share an unconditional entry at the same position');
});
