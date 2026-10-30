import test from 'node:test';
import assert from 'node:assert/strict';
import { sections, canAccessPage, pageFromHash, pageWorkspace } from '../src/admin-v2/navigation.mjs';
import { adminBreadcrumbs } from '../src/admin-v2/breadcrumbs.mjs';

test('getting started is the last operations group with role access and reloadable route', () => {
  const group = sections.find(item => item.id === 'getting-started');
  assert.equal(Boolean(group.direct), false);
  for (const role of ['平台管理员', '运营人员']) {
    const visible = sections.filter(item => item.workspace === 'operations' || item.id === 'platform' && role === '平台管理员');
    assert.equal(visible.at(-1).id, 'getting-started');
  }
  assert.equal(group.title, '入门指导');
  assert.equal(group.items[0].label, '运营入门');
  assert.equal(pageWorkspace('getting-started'), 'operations');
  assert.equal(pageFromHash('#/admin-2/getting-started', '运营人员'), 'getting-started');
  for (const role of ['平台管理员', '运营人员']) assert.equal(canAccessPage(role, 'getting-started'), true);
  for (const role of ['运维人员', '未知角色']) assert.equal(canAccessPage(role, 'getting-started'), false);
  assert.deepEqual(adminBreadcrumbs('getting-started', new URLSearchParams()), [{ label: '入门指导' }, { label: '运营入门' }]);
});
