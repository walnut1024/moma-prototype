import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminSeed } from '../src/admin-v2/store.js';
import { MODEL_IMPORT_HEADERS, MODEL_IMPORT_TEMPLATE, modelRowsFromCells, validateModelRows } from '../src/admin-v2/model-import.js';

test('import distinguishes visual understanding from image and video generation without changing stored data', () => {
  const state = createAdminSeed(), before = JSON.stringify(state);
  const understanding = ['catalog/vision-001', '视觉分析', '视觉理解', '图像理解', '文本、图片', '文本', '', '32768', '8192', '分析图片并回答问题。'];
  const rows = validateModelRows(state, modelRowsFromCells([MODEL_IMPORT_HEADERS, ...MODEL_IMPORT_TEMPLATE.slice(1), understanding]));
  assert.deepEqual(rows.map(row => row.status), ['ready', 'ready', 'ready', 'ready']);
  assert.deepEqual(rows.map(row => row.data.type), ['text', 'image', 'video', 'multimodal']);
  const wrongCategory = [...understanding];
  wrongCategory[2] = '视觉生成';
  const [invalid] = validateModelRows(state, modelRowsFromCells([MODEL_IMPORT_HEADERS, wrongCategory]));
  assert.equal(invalid.status, 'error');
  assert.match(invalid.message, /视觉生成.*图像生成或视频生成/);
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
