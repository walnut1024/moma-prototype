import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const nav = source.match(/const nav = (\[[\s\S]*?\n\]);/)[1];
const versionNav = source.match(/const versionNav = ([\s\S]*?);/)[1];
const labels = is5102 => Function('is5102', `const nav = ${nav}; return ${versionNav};`)(is5102).map(([, label]) => label);

test('5.11.0 syncs existing text/image experiences without adding absent capabilities', () => {
  const actual = labels(false);
  assert.ok(actual.includes('文本生成'));
  assert.ok(actual.includes('图片生成'));
  for (const absent of ['语言模型', '视觉模型', '多模态理解', '视频生成', '语音生成', '语音模型', '语音识别']) {
    assert.ok(!actual.includes(absent), absent);
  }
});

test('5.10.2 retains its existing experience navigation', () => {
  assert.deepEqual(labels(true), ['模型广场', '智能路由', '语言模型', '多模态理解', '视觉模型', '模型订购', '按量付费', 'Token Plan']);
});
