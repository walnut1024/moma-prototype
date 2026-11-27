import assert from 'node:assert/strict';
import test from 'node:test';
import { roleDemoWorkspace } from '../src/role-demo-data.mjs';
import { roleDemoLabels, roleDemoNavigation, roleDemoPage } from '../src/role-demo-navigation.mjs';

const labels = actor => roleDemoNavigation(roleDemoWorkspace(actor))
  .flatMap(group=>[...(group.labels[0] ? [group.labels[0]] : []),...group.items.map(page=>roleDemoLabels[page][0])]);
const base = ['首页','模型广场'];
const experience = ['模型体验','文本生成','图片生成','视频生成','语音识别'];
const rest = ['API 密钥管理','用量计费','用量统计','调用日志','辅助工具','智能路由','模型排行榜','Token计算器','工具接入'];

test('menu follows the reference by role and retains four experiences', () => {
  assert.deepEqual(labels('tenantAdmin'),[...base,'项目管理',...experience,'订购服务','模型订购',...rest]);
  assert.deepEqual(labels('personal'),[...base,...experience,'订购服务','模型订购',...rest]);
  assert.deepEqual(labels('projectAdmin'),[...base,'项目管理',...experience,'订购服务',...rest]);
  assert.deepEqual(labels('data-dev'),[...base,...experience,'订购服务',...rest]);
});

test('role-dependent direct routes follow the reference and members can open read-only project tabs from home', () => {
  const member = roleDemoWorkspace('agent-a','marketing');
  const projectAdmin = roleDemoWorkspace('data-admin','support');
  assert.equal(roleDemoPage(member,'projects'),'home');
  assert.equal(roleDemoPage(member,'projects','models'),'projects');
  assert.equal(member.project.id,'support');
  assert.equal(roleDemoPage(projectAdmin,'model-order'),'home');
  assert.equal(roleDemoPage(member,'smart-route'),'home');
  assert.equal(roleDemoPage(roleDemoWorkspace('personal'),'smart-route'),'smart-route');
  assert.equal(roleDemoPage(member,'quota-manage'),'api-keys');
  assert.equal(roleDemoPage(member,'organization'),'home');
});
