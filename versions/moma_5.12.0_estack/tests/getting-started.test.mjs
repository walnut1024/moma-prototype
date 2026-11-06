import test from 'node:test';
import assert from 'node:assert/strict';
import { sections, canAccessPage, pageFromHash, pageWorkspace } from '../src/admin-v2/navigation.mjs';
import { adminBreadcrumbs } from '../src/admin-v2/breadcrumbs.mjs';
import { readFileSync } from 'node:fs';
import { findOperationsGuide, parseOperationsGuide } from '../src/admin-v2/model-operations-guide.mjs';

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

test('short guides resolve every section and task link without leaving the guide route', () => {
  const source = readFileSync(new URL('../MODEL_OPERATIONS_GUIDE.md', import.meta.url), 'utf8');
  const guides = parseOperationsGuide(source), tasks = guides.flatMap(guide => guide.tasks);
  const ids = [...guides.map(guide => guide.id), ...tasks.map(task => task.id)];
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(guides.map(guide => guide.id), ['overview', 'channels', 'services', 'costs', 'sales', 'materials', 'maintenance']);
  for (const link of source.matchAll(/\]\(#([^)]+)\)/g)) {
    assert.ok(ids.includes(link[1]), link[1]);
    const guide = findOperationsGuide(guides, link[1]);
    assert.ok(guide.id === link[1] || guide.tasks.some(task => task.id === link[1]));
  }
  for (const guide of guides) {
    assert.equal(findOperationsGuide(guides, guide.id), guide);
    for (const task of guide.tasks) assert.equal(findOperationsGuide(guides, task.id), guide);
  }
  assert.equal(findOperationsGuide(guides, null), guides[0]);
  assert.equal(findOperationsGuide(guides, 'unknown-guide'), guides[0]);
});

test('guide separates internal use from sales and explains current entry points', () => {
  const source = readFileSync(new URL('../MODEL_OPERATIONS_GUIDE.md', import.meta.url), 'utf8');
  const guides = parseOperationsGuide(source);
  assert.match(JSON.stringify(guides.find(guide => guide.id === 'overview')), /内部使用不需要用零元售价/);
  assert.match(JSON.stringify(guides.find(guide => guide.id === 'services')), /内部免售价开放尚待完善/);
  assert.match(JSON.stringify(guides.find(guide => guide.id === 'sales')), /纯内部使用可以跳过/);
  assert.match(JSON.stringify(guides.find(guide => guide.id === 'costs')), /尚无独立的模型成本页面/);
  const imported = guides.flatMap(guide => guide.tasks).find(task => task.id === 'materials-import');
  assert.match(JSON.stringify(imported), /XLSX 或 UTF-8 CSV/);
  assert.match(JSON.stringify(imported), /已有规范标识不覆盖/);
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
