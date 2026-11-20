import test from 'node:test';
import assert from 'node:assert/strict';
import { sections, canAccessPage, pageFromHash, pageWorkspace } from '../src/admin-v2/navigation.mjs';
import { adminBreadcrumbs } from '../src/admin-v2/breadcrumbs.mjs';
import { readFileSync } from 'node:fs';
import { parseOperationsGuide } from '../src/admin-v2/model-operations-guide.mjs';

const source = readFileSync(new URL('../MODEL_OPERATIONS_GUIDE.md', import.meta.url), 'utf8');

test('getting started is the last operations group with role access and reloadable route', () => {
  const group = sections.find(item => item.id === 'getting-started');
  assert.equal(Boolean(group.direct), false);
  for (const role of ['平台管理员', '运营人员']) {
    const visible = sections.filter(item => item.workspace === 'operations' || item.id === 'platform' && role === '平台管理员');
    assert.equal(visible.at(-1).id, 'getting-started');
  }
  assert.equal(group.title, '入门指导');
  assert.deepEqual(group.items.map(item => item.label), ['渠道管理']);
  assert.equal(pageWorkspace('getting-started'), 'operations');
  assert.equal(pageFromHash('#/admin-2/getting-started', '运营人员'), 'getting-started');
  for (const role of ['平台管理员', '运营人员']) assert.equal(canAccessPage(role, 'getting-started'), true);
  for (const role of ['运维人员', '未知角色']) assert.equal(canAccessPage(role, 'getting-started'), false);
  assert.deepEqual(adminBreadcrumbs('getting-started', new URLSearchParams()), [{ label: '入门指导' }, { label: '渠道管理' }]);
});

test('getting started renders one channel guide with working task and management links', () => {
  const guides = parseOperationsGuide(source);
  assert.deepEqual(guides.map(({ id, title }) => [id, title]), [['channels', '渠道管理']]);
  const [guide] = guides;
  assert.deepEqual([...source.matchAll(/\]\(#([a-z0-9-]+)\)/g)].map(([, id]) => id), guide.tasks.map(task => task.id));
  const routes = [...source.matchAll(/\]\(#\/admin-2\/([^)]+)\)/g)].map(([, route]) => route);
  assert.deepEqual([...new Set(routes)], ['providers', 'providers-new']);
  for (const route of routes) assert.equal(pageFromHash('#/admin-2/' + route, '运营人员'), route);
});

test('the guide walks through three provider setups and names the unavailable video presets', () => {
  const [guide] = parseOperationsGuide(source);
  const providers = guide.blocks.find(block => block.type === 'table').rows;
  assert.deepEqual(providers.map(([name]) => name), ['硅基流动', '深度求索 DeepSeek', '火山引擎方舟（北京）']);
  assert(providers.every(([, , key]) => /^`EXAMPLE_[A-Z]+_KEY`$/.test(key)));
  assert.deepEqual(guide.tasks.map(task => task.id), ['channel-connect', 'siliconflow', 'deepseek', 'volcengine', 'video', 'channel-maintenance']);
  const video = guide.tasks.find(task => task.id === 'video');
  assert(video.blocks.some(block => block.text?.includes('协议预设无法配置')));
  assert.equal(video.blocks.find(block => block.type === 'table').rows.length, 2);
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
