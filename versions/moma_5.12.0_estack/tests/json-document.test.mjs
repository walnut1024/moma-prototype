import test from 'node:test';
import assert from 'node:assert/strict';
import { jsonDocument } from '../src/admin-v2/json-document.mjs';

const lines = node => node.children
  ? [`${'  '.repeat(node.depth)}${node.prefix}${node.open}`, ...node.children.flatMap(lines), `${'  '.repeat(node.depth)}${node.close}${node.comma ? ',' : ''}`]
  : [`${'  '.repeat(node.depth)}${node.text}`];

test('expanded document retains every value, escaped key and JSON delimiter without changing data', () => {
  const value = { schema: 'v2', rows: [{ name: '模型\n"A"', enabled: false, cost: 0, metadata: null, empty: {}, list: [] }], 'a/b~c': { '': [true, ''] } };
  const before = structuredClone(value), { root, containerKeys } = jsonDocument(value);
  assert.equal(lines(root).join('\n'), JSON.stringify(value, null, 2));
  assert.equal(new Set(containerKeys).size, containerKeys.length);
  assert(containerKeys.includes(JSON.stringify(['rows', 0])));
  assert(containerKeys.includes(JSON.stringify(['a/b~c', ''])));
  assert(!containerKeys.includes(JSON.stringify(['rows', 0, 'empty'])));
  assert.deepEqual(value, before);
});

test('empty containers and scalar JSON remain complete non-foldable values', () => {
  for (const value of [{}, [], null, false, 0, '']) {
    const { root, containerKeys } = jsonDocument(value);
    assert.equal(root.text, JSON.stringify(value));
    assert.deepEqual(containerKeys, []);
  }
});
