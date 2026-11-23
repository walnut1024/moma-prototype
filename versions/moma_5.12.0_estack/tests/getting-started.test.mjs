import test from 'node:test';
import assert from 'node:assert/strict';
import { sections, canAccessPage, pageFromHash, pageWorkspace } from '../src/admin-v2/navigation.mjs';
import { adminBreadcrumbs } from '../src/admin-v2/breadcrumbs.mjs';
import { readFileSync } from 'node:fs';
import { parseOperationsGuide } from '../src/admin-v2/model-operations-guide.mjs';

test('getting started is the last operations group with role access and reloadable route', () => {
  const group = sections.find(item => item.id === 'getting-started');
  assert.equal(Boolean(group.direct), false);
  for (const role of ['平台管理员', '运营人员']) {
    const visible = sections.filter(item => item.workspace === 'operations' || item.id === 'platform' && role === '平台管理员');
    assert.equal(visible.at(-1).id, 'getting-started');
  }
  assert.equal(group.title, '入门指导');
  assert.deepEqual(group.items.map(item => item.label), ['模型运营']);
  assert.equal(pageWorkspace('model-operations-guide'), 'operations');
  assert.equal(pageFromHash('#/admin-2/getting-started', '运营人员'), 'dashboard');
  assert.equal(pageFromHash('#/admin-2/model-operations-guide', '运营人员'), 'model-operations-guide');
  for (const role of ['平台管理员', '运营人员']) assert.equal(canAccessPage(role, 'model-operations-guide'), true);
  for (const role of ['运维人员', '未知角色']) assert.equal(canAccessPage(role, 'model-operations-guide'), false);
});

test('guide parser preserves numbered steps across a field table', () => {
  const guide = parseOperationsGuide('## 接入\n1. 准备\n2. 填写\n\n| 字段 | 说明 |\n| --- | --- |\n| 地址 | 上游地址 |\n\n3. 保存')[0];
  assert.deepEqual(guide.blocks.filter(block => block.type === 'list').map(block => block.start), [1, 3]);
  assert.deepEqual(guide.blocks.find(block => block.type === 'table').rows, [['地址', '上游地址']]);
});

test('guide treats unsupported HTML as text and never turns it into an executable block', () => {
  const result = parseOperationsGuide('# Title\n> internal note\n\n## Task\n<script>alert(1)</script>\n\n1. First\n2. Second');
  assert.equal(result[0].blocks[0].type, 'paragraph');
  assert.equal(result[0].blocks[0].text, '<script>alert(1)</script>');
  assert.deepEqual(result[0].blocks[1].items, ['First', 'Second']);
});

test('model operations opens a single glossary with complete definitions in both languages', () => {
  const route = 'model-operations-guide';
  assert.equal(pageFromHash('#/admin-2/' + route, '运营人员'), route);
  assert.deepEqual(adminBreadcrumbs(route, new URLSearchParams()), [{ label: '入门指导' }, { label: '模型运营' }]);
  const content = readFileSync(new URL('../MODEL_OPERATIONS_GUIDE_FIELDS.md', import.meta.url), 'utf8');
  const guides = parseOperationsGuide(content);
  assert.equal(guides.length, 1);
  const [section] = guides;
  assert.equal(section.title, '关键概念和字段');
  assert.equal(section.tasks.length, 0);
  assert.equal(section.blocks.length, 1);
  const [table] = section.blocks;
  assert.deepEqual(table.headings, ['字段中文', '字段英文', '定义', 'Definition']);
  assert(table.rows.every(row => row.length === 4 && row.every(Boolean)));
  const names = new Set(table.rows.map(([name]) => name));
  assert.equal(names.size, table.rows.length);
  for (const name of ['模型档案 ID', '模型 ID', '上游模型 ID', '模型连接', '上游模型', '关联上游模型']) assert(names.has(name));
});
