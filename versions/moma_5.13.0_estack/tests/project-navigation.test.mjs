import test from 'node:test';
import assert from 'node:assert/strict';
import { projectTabs, enterpriseTabs, workspaceNavigation, navigationPage, projectSwitchPage } from '../src/project-navigation.mjs';

test('upper navigation stays intact while project and enterprise entries are consolidated', () => {
  const groups = workspaceNavigation('enterprise');
  assert.deepEqual(groups.slice(0,4).map(([,items])=>items.map(([id])=>id)), [
    ['catalogue','智能路由'], ['experience','图片生成','视频生成','语音识别'], ['模型订购'], ['usage','调用观测','logs'],
  ]);
  assert.deepEqual(groups.slice(4), [['项目',[['overview','项目管理'],['keys','API Key']]],['企业',[['组织及成员','企业管理']]]]);
  assert.deepEqual(workspaceNavigation('personal').slice(4), [['项目',[['overview','项目管理'],['keys','API Key']]]]);
  assert.ok(!workspaceNavigation('personal')[3][1].some(([id])=>id==='logs'));
});

test('direct project and enterprise pages select their management entry without merging key or request logs', () => {
  for (const [page] of projectTabs) assert.equal(navigationPage(page),'overview');
  for (const [page] of enterpriseTabs) assert.equal(navigationPage(page),'组织及成员');
  assert.equal(navigationPage('projects'),'overview');
  for (const page of ['keys','logs','账号认证']) assert.equal(navigationPage(page),page);
});

test('switching project preserves the task and avoids opening another project with stale detail identifiers', () => {
  for (const page of ['models','members','settings','audit','keys','logs','experience','组织及成员']) assert.equal(projectSwitchPage(page),page);
  assert.equal(projectSwitchPage('detail'),'catalogue');
  assert.equal(projectSwitchPage('projects'),'overview');
});
