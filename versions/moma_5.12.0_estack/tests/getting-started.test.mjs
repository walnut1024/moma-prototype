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
  assert.equal(group.items[0].label, '模型运营');
  assert.equal(pageWorkspace('getting-started'), 'operations');
  assert.equal(pageFromHash('#/admin-2/getting-started', '运营人员'), 'getting-started');
  for (const role of ['平台管理员', '运营人员']) assert.equal(canAccessPage(role, 'getting-started'), true);
  for (const role of ['运维人员', '未知角色']) assert.equal(canAccessPage(role, 'getting-started'), false);
  assert.deepEqual(adminBreadcrumbs('getting-started', new URLSearchParams()), [{ label: '入门指导' }, { label: '模型运营' }]);
});

test('guide keeps task links, diagrams and continued field-table steps from the approved document', () => {
  const source = readFileSync(new URL('../MODEL_OPERATIONS_GUIDE.md', import.meta.url), 'utf8');
  const sections = parseOperationsGuide(source), tasks = sections.flatMap(section => section.tasks);
  const blocks = sections.flatMap(section => [...section.blocks, ...section.tasks.flatMap(task => task.blocks)]);
  const ids = new Set([...sections.map(section => section.id), ...tasks.map(task => task.id), ...blocks.filter(block => block.type === 'anchor').map(block => block.id)]);
  for (const link of source.matchAll(/\]\(#([^)]+)\)/g)) assert.equal(ids.has(link[1]), true, link[1]);
  assert.equal(tasks.length, 28);
  assert.equal(blocks.filter(block => block.type === 'image').length, 2);
  const channel = tasks.find(task => task.id === 'channel-add');
  assert.deepEqual(channel.blocks.filter(block => block.type === 'list').map(block => block.start), [1, 3]);
  assert.equal(channel.blocks.find(block => block.type === 'table').rows.length, 5);
  assert.equal(JSON.stringify(sections).includes('页面文案评审稿'), false);
  assert.equal(blocks.some(block => block.type === 'table' && block.rows.some(row => row.every(cell => /^-+$/.test(cell)))), false);
});

test('guide treats unsupported HTML as text and never turns it into an executable block', () => {
  const result = parseOperationsGuide('# Title\n> internal note\n\n## Task\n<script>alert(1)</script>\n\n1. First\n2. Second');
  assert.equal(result[0].blocks[0].type, 'paragraph');
  assert.equal(result[0].blocks[0].text, '<script>alert(1)</script>');
  assert.deepEqual(result[0].blocks[1].items, ['First', 'Second']);
});
