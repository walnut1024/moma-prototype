import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminSeed } from '../src/admin-v2/store.js';
import { MODEL_IMPORT_HEADERS, MODEL_IMPORT_TEMPLATE, modelRowsFromCells, validateModelRows } from '../src/admin-v2/model-import.js';

test('import distinguishes visual understanding from image and video generation without changing stored data', () => {
  const state = createAdminSeed(), before = JSON.stringify(state);
  assert.deepEqual(MODEL_IMPORT_HEADERS.slice(0, 2), ['规范模型标识', '模型名称']);
  assert.throws(() => modelRowsFromCells([['模型ID', ...MODEL_IMPORT_HEADERS.slice(1)], MODEL_IMPORT_TEMPLATE[1]]), /表头不匹配/);
  const values = { '规范模型标识': 'catalog/vision-001', '模型名称': '视觉分析', '模型类型': '多模态', '支持任务': '图像理解', '输入模态': '文本、图片', '输出模态': '文本', '上下文窗口（Token）': '32768', '最大输出（Token）': '8192', '简短介绍': '分析图片并回答问题。' };
  const understanding = MODEL_IMPORT_HEADERS.map(label => values[label] || '');
  const rows = validateModelRows(state, modelRowsFromCells([MODEL_IMPORT_HEADERS, ...MODEL_IMPORT_TEMPLATE.slice(1), understanding]));
  assert.deepEqual(rows.map(row => row.status), ['ready', 'ready', 'ready', 'ready']);
  assert.deepEqual(rows.map(row => row.data.type), ['text', 'image', 'video', 'multimodal']);
  const wrongCategory = [...understanding];
  wrongCategory[2] = '视觉';
  wrongCategory[3] = '图像';
  wrongCategory[MODEL_IMPORT_HEADERS.indexOf('上下文窗口（Token）')] = '';
  wrongCategory[MODEL_IMPORT_HEADERS.indexOf('最大输出（Token）')] = '';
  const [invalid] = validateModelRows(state, modelRowsFromCells([MODEL_IMPORT_HEADERS, wrongCategory]));
  assert.equal(invalid.status, 'error');
  assert.match(invalid.message, /支持任务包含不适用选项/);
  assert.equal(JSON.stringify(state), before);
});

test('K3 operating model and reusable metadata remain language models with visual inputs', () => {
  const state = createAdminSeed();
  for (const collection of [state.models, state.modelTemplates]) {
    const k3 = collection.find(model => model.modelId === 'kimi-k3');
    assert.equal(k3.type, 'text');
    assert.deepEqual(k3.profile.inputModalities, ['文本', '图片', '视频']);
  }
});
