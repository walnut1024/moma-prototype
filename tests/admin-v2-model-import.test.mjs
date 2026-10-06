import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminSeed, commitAdminState, persistModelAction, STORAGE_KEY } from '../src/admin-v2/store.js';
import { modelCategory, priceUnits } from '../src/admin-v2/model-management.js';
import { MODEL_IMPORT_HEADERS, MODEL_IMPORT_TEMPLATE, parseModelText, modelRowsFromCells, validateModelRows, modelCsv } from '../src/admin-v2/model-import.js';
const command = models => ({ type: 'modelOperation', operation: 'import', data: { models } });
const row = (id, category = '语言模型', task = '对话', input = '文本', output = '文本', result = '') => [id, '模型名称', category, task, input, output, result, '32768', '8192', '模型介绍'];

test('CSV and Excel cells share strict headers, quoted fields, row numbers and batch limits', () => {
  const cells = [MODEL_IMPORT_HEADERS, [...row('catalog/quoted').slice(0, 9), '支持逗号,换行\n和"引号"']];
  assert.deepEqual(parseModelText(modelCsv(cells)), modelRowsFromCells(cells));
  assert.equal(parseModelText(cells.map(r => r.join('\t')).join('\n'))[0].rowNumber, 2);
  assert.throws(() => parseModelText('名称,类型\na,b'), /表头/);
  assert.throws(() => modelRowsFromCells([MODEL_IMPORT_HEADERS]), /至少/);
  assert.throws(() => modelRowsFromCells([MODEL_IMPORT_HEADERS, ...Array.from({ length: 501 }, () => row('a'))]), /500/);
  assert.throws(() => parseModelText('"未闭合'), /引号/);
  assert.throws(() => modelRowsFromCells([MODEL_IMPORT_HEADERS, [...row('a'), '额外列']]), /列数/);
});
test('all categories validate with explicit visual and audio tasks and modality specs', () => {
  const state = createAdminSeed();
  const cells = [MODEL_IMPORT_HEADERS, row('import/text'), row('import/mm', '视觉模型', '图像理解', '文本、图片'), row('import/image', '视觉模型', '文生图', '文本、图片', '图片'), row('import/video', '视觉模型', '文生视频', '文本、图片', '视频'), row('import/tts', '语音模型', '语音合成', '文本', '音频'), row('import/asr', '语音模型', '语音识别', '音频', '文本'), row('import/vector', '向量模型', '文本向量化', '文本', '', '向量'), row('import/rerank', '重排模型', '文档重排', '文本', '', '相关性分数、排序结果')];
  const result = validateModelRows(state, modelRowsFromCells(cells));
  assert.ok(result.every(r => r.status === 'ready'));
  assert.deepEqual(result.map(r => r.data.type), ['text', 'multimodal', 'image', 'video', 'audio', 'audio', 'embedding', 'rerank']);
  assert.equal(modelCategory('image'), 'visual'); assert.equal(modelCategory('video'), 'visual');
  assert.deepEqual(priceUnits(result[2].data), ['元/张']); assert.deepEqual(priceUnits(result[3].data), ['元/秒', '元/百万 Token']);
  assert.equal(result[4].data.usageUnit, '字符');
});
test('preview reports existing and batch duplicate IDs, bad tasks, modalities and token limits', () => {
  const state = createAdminSeed();
  const rows = modelRowsFromCells([MODEL_IMPORT_HEADERS, row(state.models[0].modelId), row('unique'), row('unique'), row('bad-task', '视觉模型', '对话'), row('bad-modality', '语言模型', '对话', '未知'), [...row('bad-context').slice(0,7), '-1', '8192', '介绍'], [...row('bad-output').slice(0,7), '4096', '8192', '介绍']]);
  const result = validateModelRows(state, rows);
  assert.equal(result[1].status, 'ready'); assert.equal(result.filter(r => r.status === 'error').length, 6);
  assert.match(result[0].message, /已存在/); assert.match(result[2].message, /重复/); assert.match(result[3].message, /视觉/);
});
test('batch creates models and versions atomically as unpublished drafts and never overwrites', () => {
  const state = createAdminSeed(), models = validateModelRows(state, modelRowsFromCells(MODEL_IMPORT_TEMPLATE)).map(r => r.data);
  const next = commitAdminState(state, command(models));
  assert.equal(next.models.length, state.models.length + 3); assert.equal(next.modelVersions.length, state.modelVersions.length + 3);
  assert.equal(next.revision, state.revision + 1); assert.match(next.audits[0].action, /批量导入 3/);
  assert.ok(next.models.filter(m => m.modelId.startsWith('catalog/')).every(m => m.listingStatus === '草稿' && !m.callsEnabled));
  assert.throws(() => commitAdminState(state, command([models[0], models[0]])), /已存在/);
  assert.throws(() => commitAdminState(next, command(models)), /已存在/);
  assert.throws(() => commitAdminState(state, command([models[0], { ...models[1], name: '' }])), /必填/);
  assert.equal(state.models.some(m => m.modelId === models[0].modelId), false);
  assert.throws(() => commitAdminState(state, command([])), /1–500/);
  assert.throws(() => commitAdminState(state, command(models), '只读观察员'), /无权/);
  assert.throws(() => commitAdminState(state, command(models), '财务人员'), /无权/);
});
test('import uses revision and storage failure protections before exposing new records', () => {
  const state = createAdminSeed(), models = validateModelRows(state, modelRowsFromCells(MODEL_IMPORT_TEMPLATE)).map(r => r.data);
  const map = new Map([[STORAGE_KEY, JSON.stringify(state)]]), storage = { getItem: key => map.get(key), setItem: (key, value) => map.set(key, value) };
  const next = persistModelAction(state, command(models), storage); assert.equal(JSON.parse(map.get(STORAGE_KEY)).models.length, next.models.length);
  assert.throws(() => persistModelAction(state, command(models), storage), /数据已变化/);
  assert.throws(() => persistModelAction(state, command(models), { getItem: () => null, setItem: () => { throw new Error('空间不足'); } }), /空间不足/);
  assert.equal(state.models.some(m => m.modelId === models[0].modelId), false);
});
