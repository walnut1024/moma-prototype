import test from 'node:test';
import assert from 'node:assert/strict';
import { projectTabs, enterpriseTabs, workspaceNavigation, navigationPage, projectSwitchPage, pageScope, workspaceHash, readWorkspaceRoute, workspaceProject, returnProjectLocation } from '../src/project-navigation.mjs';

test('upper navigation stays intact and account pages do not present project configuration', () => {
  const upper = [
    ['模型服务', [['catalogue', '模型广场'], ['智能路由', '智能路由']]],
    ['模型体验', [['experience', '文本生成'], ['图片生成', '图片生成'], ['视频生成', '视频生成'], ['语音识别', '语音识别']]],
    ['订单管理', [['模型订购', '模型订购']]],
    ['模型观测', [['usage', '用量统计'], ['调用观测', '调用观测'], ['logs', '调用日志']]],
  ];
  for (const account of [false, true]) assert.deepEqual(workspaceNavigation('enterprise', account).slice(0, 4), upper);
  assert.deepEqual(workspaceNavigation('enterprise').slice(4), [['项目', [['overview', '项目概览'], ['settings', '项目配置']]], ['账户', [['组织及成员', '企业管理']]]]);
  assert.deepEqual(workspaceNavigation('enterprise', true).slice(4), [['账户', [['projects', '全部项目'], ['组织及成员', '企业管理']]]]);
  assert.deepEqual(workspaceNavigation('personal').slice(4), [['项目', [['overview', '项目概览'], ['settings', '项目配置']]]]);
  assert.deepEqual(workspaceNavigation('personal', true).slice(4), [['账户', [['projects', '全部项目']]]]);
  for (const account of [false, true]) assert.ok(!workspaceNavigation('personal', account)[3][1].some(([id]) => id === 'logs'));
});

test('overview is independent while six project configuration tabs share one active navigation entry', () => {
  assert.deepEqual(projectTabs, [['settings', '基本信息'], ['models', '模型权限'], ['keys', 'API Key'], ['members', '成员权限'], ['budget', '预算与日志'], ['audit', '操作记录']]);
  assert.equal(navigationPage('overview'), 'overview');
  for (const [page] of projectTabs) assert.equal(navigationPage(page), 'settings');
  for (const [page] of enterpriseTabs) assert.equal(navigationPage(page), '组织及成员');
  for (const page of ['projects', 'logs', '账号认证']) assert.equal(navigationPage(page), page);
});

test('switching project preserves its configuration task and omits stale request or model details', () => {
  for (const page of ['overview', 'models', 'members', 'settings', 'budget', 'audit', 'keys', 'logs', 'experience']) {
    const next = projectSwitchPage(page);
    assert.equal(next, page);
    const route = readWorkspaceRoute('#' + workspaceHash(next, 'project-2', { days: '30' }));
    assert.equal(route.projectId, 'project-2'); assert.equal(route.days, '30');
    assert.equal(route.model, ''); assert.equal(route.request, ''); assert.equal(route.supply, '');
  }
  assert.equal(projectSwitchPage('detail'), 'catalogue');
  assert.equal(projectSwitchPage('projects'), 'overview');
});

test('account addresses cannot inherit a project ID even when opening an old project-shaped address', () => {
  for (const page of ['projects', 'catalogue', 'detail', '模型订购', '组织及成员', '账户操作记录', '账号认证']) {
    assert.equal(pageScope(page), 'account');
    const hash = workspaceHash(page, 'unrelated-project');
    assert.ok(hash.startsWith('/account?')); assert.ok(!hash.includes('unrelated-project'));
    assert.equal(readWorkspaceRoute('#' + hash).projectId, '');
    assert.equal(readWorkspaceRoute('#/projects/unrelated-project?page=' + encodeURIComponent(page)).projectId, '');
  }
  assert.equal(pageScope('keys'), 'project'); assert.equal(pageScope('overview'), 'project');
});

test('explicit inaccessible projects never fall back to a recent or first accessible project', () => {
  const projects = [{ id: 'project-1' }, { id: 'project-2' }];
  assert.equal(workspaceProject(projects, 'foreign-project', 'project-1'), undefined);
  assert.equal(workspaceProject(projects, 'project-2', 'project-1'), projects[1]);
  assert.equal(workspaceProject(projects, '', 'project-2'), projects[1]);
  assert.equal(workspaceProject(projects, '', 'removed-project'), projects[0]);
  assert.equal(workspaceProject([], '', 'project-1'), undefined);
});

test('returning to a project rechecks the saved project and retains the last project task', () => {
  const projects = [{ id: 'project-1' }, { id: 'project-2' }], saved = { projectId: 'project-2', page: 'budget', days: '30' };
  assert.deepEqual(returnProjectLocation(projects, saved, 'project-1'), saved);
  assert.equal(returnProjectLocation(projects.slice(0, 1), saved, 'project-1'), null);
  assert.equal(returnProjectLocation(projects, { projectId: 'project-1', page: '组织及成员' }, 'project-1'), null);
  assert.equal(returnProjectLocation(projects, { projectId: 'project-1', page: 'unknown' }, 'project-1'), null);
  assert.deepEqual(returnProjectLocation(projects, null, 'project-2'), { projectId: 'project-2', page: 'overview', days: '7' });
  assert.equal(returnProjectLocation([], null, 'project-1'), null);
});

test('root business entry links and standalone ordering retain their functional targets', () => {
  const entries = { 'model-order': '模型订购', 'organization-members': '组织及成员', 'operation-records': '账户操作记录', 'api-keys': 'keys', 'account-certification': '账号认证', 'call-logs': 'logs', 'usage-statistics': 'usage' };
  for (const [entry, page] of Object.entries(entries)) assert.equal(readWorkspaceRoute('', '?page=' + entry).page, page);
  assert.equal(readWorkspaceRoute('', '', '/moma_5.13.0_estack/order/serviceOrder').page, '模型订购');
  assert.equal(readWorkspaceRoute('#/account?page=账号认证', '?page=api-keys').page, '账号认证');
  assert.equal(readWorkspaceRoute('#/account?page=unrecognized').page, 'catalogue');
});

test('direct project links preserve identifiers and accept only supported time and action values', () => {
  const hash = workspaceHash('keys', '政务 / 生产', { days: '30', action: 'createKey' });
  const route = readWorkspaceRoute('#' + hash);
  assert.equal(route.projectId, '政务 / 生产'); assert.equal(route.days, '30'); assert.equal(route.action, 'createKey');
  const detail = readWorkspaceRoute('#/account?page=detail&model=model-1&supply=supply-1');
  assert.equal(detail.model, 'model-1'); assert.equal(detail.supply, 'supply-1'); assert.equal(detail.projectId, '');
  const invalid = readWorkspaceRoute('#/projects/project-1?page=overview&days=999&action=delete');
  assert.equal(invalid.days, '7'); assert.equal(invalid.action, '');
  assert.equal(readWorkspaceRoute('#/projects/project-1?page=usage&rangeDays=30').rangeDays, '30');
  assert.equal(readWorkspaceRoute('#/projects/project-1?page=usage&rangeDays=999').rangeDays, '');
});

test('malformed project identifiers do not crash route parsing or select another project', () => {
  let route;
  assert.doesNotThrow(() => { route = readWorkspaceRoute('#/projects/%E0%A4?page=overview'); });
  assert.ok(route.projectId);
  assert.equal(workspaceProject([{ id: 'project-1' }], route.projectId, 'project-1'), undefined);
});
