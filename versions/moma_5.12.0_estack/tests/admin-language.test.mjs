import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { channelEnglish } from '../src/admin-v2/admin-english.mjs';
import { sections } from '../src/admin-v2/navigation.mjs';

test('workbench uses the published English field names from the version glossary', () => {
  const glossary = readFileSync(new URL('../MODEL_OPERATIONS_GUIDE_FIELDS.md', import.meta.url), 'utf8');
  const rows = [...glossary.matchAll(/^\| ([^|]+?) \| ([A-Za-z][^|]*?) \|/gm)];
  assert.ok(rows.length >= 35);
  for (const [, label, english] of rows) assert.equal(channelEnglish(label), english, label);
});

test('all navigation groups, items and tabs have English labels', () => {
  for (const group of sections) {
    const labels = [group.title, ...group.items.flatMap(item => [item.label, ...item.children.map(([, label]) => label)])];
    for (const label of labels) assert.doesNotMatch(channelEnglish(label), /\p{Script=Han}/u, label);
  }
});
