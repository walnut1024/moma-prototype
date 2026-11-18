import test from 'node:test';
import assert from 'node:assert/strict';
import {consoleNavigation,consoleActiveItem} from '../src/console-navigation.mjs';
const labels=groups=>groups.flatMap(group=>group.items || [group.label]);

test('enterprise navigation retains independent original task, observation, order and organization entries',()=>{
  const groups=consoleNavigation({personal:false,internal:false,canManage:true});
  assert.deepEqual(groups.find(row=>row.id==='experience').items,['文本生成','图片生成','视频生成','语音识别']);
  assert.deepEqual(groups.find(row=>row.id==='observation').items,['用量统计','调用观测','调用日志']);
  assert.deepEqual(groups.find(row=>row.id==='orders').items,['模型订购','订购与账单']);
  assert.deepEqual(groups.find(row=>row.id==='management').items,['项目管理','组织及成员','操作记录']);
  assert.equal(new Set(labels(groups)).size,labels(groups).length);
  assert.equal(groups.find(row=>row.id==='public').label,'');
  assert.deepEqual(groups.find(row=>row.id==='public').items,['空间总览','模型广场']);
  assert.deepEqual(groups.filter(row=>row.scope==='project').map(row=>row.id || row.label),['experience','智能路由','API 密钥','observation']);
});

test('personal navigation binds the same calling entries to its only default project without enterprise management',()=>{
  const entries=labels(consoleNavigation({personal:true,internal:false,canManage:true}));
  assert.equal(entries[0],'概览');
  assert(!entries.includes('操作记录'));
  assert(entries.includes('使用设置'));
  for(const entry of ['项目管理','组织及成员','操作记录','空间总览']) assert(!entries.includes(entry));
  for(const entry of ['文本生成','图片生成','视频生成','语音识别','API 密钥','用量统计','调用观测','调用日志']) assert(entries.includes(entry));
});

test('commercial member and internal navigation do not expose purchasing controls',()=>{
  for(const context of [{personal:false,internal:false,canManage:false},{personal:false,internal:true,canManage:true}]) {
    const entries=labels(consoleNavigation(context));
    assert(!entries.includes('模型订购'));
    assert(!entries.includes('订购与账单'));
    if(!context.canManage)assert(!entries.includes('操作记录'));
    assert(entries.includes('组织及成员'));
    assert(entries.includes('模型广场'));
    assert(entries.includes('项目管理'));
  }
});

test('deep detail links highlight their original navigation entry without merging observation or experience pages',()=>{
  assert.equal(consoleActiveItem('模型详情',false),'模型广场');
  assert.equal(consoleActiveItem('项目概览',false),'项目管理');
  assert.equal(consoleActiveItem('项目设置',false),'项目管理');
  assert.equal(consoleActiveItem('项目概览',true),'概览');
  assert.equal(consoleActiveItem('项目设置',true),'使用设置');
  for(const page of ['文本生成','图片生成','视频生成','语音识别','用量统计','调用观测','调用日志','模型订购','操作记录']) {
    assert.equal(consoleActiveItem(page,false),page);
  }
});
