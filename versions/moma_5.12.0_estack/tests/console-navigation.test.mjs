import test from 'node:test';
import assert from 'node:assert/strict';
import {consoleNavigation,consoleActiveItem} from '../src/console-navigation.mjs';
import {adminSections,canAccessPage} from '../src/admin-v2/navigation.mjs';
const labels=groups=>groups.flatMap(group=>group.items || [group.label]);

test('enterprise navigation has one project entry and groups calling controls by purpose',()=>{
  const groups=consoleNavigation({personal:false,internal:false,canManage:true});
  assert.deepEqual(groups.find(row=>row.id==='experience').items,['文本生成','图片生成','视频生成','语音识别']);
  assert.deepEqual(groups.find(row=>row.id==='observation').items,['用量统计','调用日志']);
  assert(!labels(groups).includes('订购与账单'));
  assert(!labels(groups).includes('组织及成员'));
  assert(labels(groups).includes('账户管理'));
  assert(labels(groups).includes('模型订购'));
  assert.equal(new Set(labels(groups)).size,labels(groups).length);
  assert.equal(groups.find(row=>row.id==='public').label,'');
  assert.deepEqual(groups.find(row=>row.id==='public').items,['首页','模型广场']);
  assert.deepEqual(groups.find(row=>row.label==='系统管理').items,['项目管理']);
  assert(!labels(groups).includes('项目'));
  assert(!labels(groups).includes('我的项目'));
  assert.deepEqual(groups.find(row=>row.id==='connection').items,['API 密钥','工具接入','智能路由']);
  assert.deepEqual(groups.filter(row=>row.scope==='project').map(row=>row.id),['experience','connection','observation']);
});

test('personal navigation binds the same calling entries to its only default project without enterprise management',()=>{
  const entries=labels(consoleNavigation({personal:true,internal:false,canManage:true}));
  assert.equal(entries[0],'首页');
  assert(!entries.includes('操作记录'));
  assert(entries.includes('使用设置'));
  assert(entries.includes('账户管理'));
  for(const entry of ['项目','我的项目','项目管理','组织及成员','操作记录','空间总览']) assert(!entries.includes(entry));
  for(const entry of ['文本生成','图片生成','视频生成','语音识别','API 密钥','工具接入','智能路由','用量统计','调用日志','模型订购']) assert(entries.includes(entry));
});

test('commercial member and internal navigation do not expose purchasing controls',()=>{
  for(const context of [{personal:false,internal:false,canManage:false},{personal:false,internal:true,canManage:true}]) {
    const entries=labels(consoleNavigation(context));
    assert(!entries.includes('模型订购'));
    for(const entry of ['空间总览','运行表现','订购与账单']) assert(!entries.includes(entry));
    assert(!entries.includes('组织及成员'));
    assert(entries.includes('模型广场'));
    assert(!entries.includes('项目'));
    assert(entries.includes('项目管理'));
    assert(!entries.includes('我的项目'));
  }
});

test('deep detail links highlight their original navigation entry without merging observation or experience pages',()=>{
  assert.equal(consoleActiveItem('模型详情',false),'模型广场');
  assert.equal(consoleActiveItem('模型排行',false),'模型广场');
  assert.equal(consoleActiveItem('我的项目',false),'项目管理');
  assert.equal(consoleActiveItem('项目管理',false),'项目管理');
  assert.equal(consoleActiveItem('项目概览',false),'项目管理');
  assert.equal(consoleActiveItem('项目设置',false),'项目管理');
  assert.equal(consoleActiveItem('配额管理',false),'API 密钥');
  assert.equal(consoleActiveItem('密钥操作记录',false),'API 密钥');
  assert.equal(consoleActiveItem('调用日志留存',false),'调用日志');
  assert.equal(consoleActiveItem('调用观测',false),'调用观测');
  assert.equal(consoleActiveItem('项目概览',true),'首页');
  assert.equal(consoleActiveItem('项目设置',true),'使用设置');
  for(const page of ['文本生成','图片生成','视频生成','语音识别','用量统计','调用日志','模型订购']) {
    assert.equal(consoleActiveItem(page,false),page);
  }
});

test('access control exposes tenant management and project management',()=>{
  assert.deepEqual(adminSections.find(group=>group.title==='访问控制').items.map(item=>item.label),['租户管理','项目管理']);
  assert(canAccessPage('平台管理员','organization-members'));
  assert(!canAccessPage('运维人员','organization-members'));
});
