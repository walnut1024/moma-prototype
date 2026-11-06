import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readSheet } from 'read-excel-file/node';
import { createAdminSeed } from '../src/admin-v2/store.js';
import { operationsTransaction } from '../src/admin-v2/model-operations.js';
import { MODEL_IMPORT_FIELDS, MODEL_IMPORT_HEADERS, MODEL_IMPORT_REQUIRED_HEADERS, MODEL_IMPORT_TEMPLATE_HEADERS, MODEL_IMPORT_TEMPLATE, modelCsv, modelRowsFromCells, parseModelText, validateModelRows } from '../src/admin-v2/model-import.js';
import { IDENTITY_FIELDS, TECHNICAL_FIELDS, PRESENTATION_FIELDS, COMMON_FIELDS, INTERFACE_FIELDS, RECORD_FIELDS, FEATURE_FIELDS, TASK_OPTIONS, specificationFields } from '../src/admin-v2/model-profile.js';

const row = values => MODEL_IMPORT_HEADERS.map(label => values[label] ?? '');
const base = { '规范模型标识': 'qa/import-001', '模型名称': '资料导入测试', '模型类型': '文本' };
const validate = (...values) => validateModelRows(createAdminSeed(), modelRowsFromCells([MODEL_IMPORT_HEADERS, ...values.map(value => row({ ...base, ...value }))]));

test('downloadable XLSX puts required columns first and round-trips all fields and examples through the real reader', async () => {
  const file = fileURLToPath(new URL('../public/templates/model-material-import.xlsx', import.meta.url));
  const cells = await readSheet(file);
  assert.deepEqual(cells[0], MODEL_IMPORT_TEMPLATE_HEADERS);
  assert.deepEqual(cells[0].slice(0, 3), MODEL_IMPORT_REQUIRED_HEADERS.map(label => `${label}（必填）`));
  assert.equal(cells[0][3], '视觉任务类型（视觉模型必填）');
  const rows = modelRowsFromCells(cells);
  assert.deepEqual(rows, modelRowsFromCells(MODEL_IMPORT_TEMPLATE));
  assert.deepEqual(validateModelRows(createAdminSeed(), rows).map(row => row.status), ['ready', 'ready', 'ready']);
  const guide = await readSheet(file, '填写说明');
  assert.equal(guide[2][0], '红色表头');
  assert.equal(guide[3][0], '橙色表头');
  assert.equal(guide[4][1], '选填');
});

test('required text markers work with reordered or reduced columns and cannot hide duplicate headers', () => {
  const headers = ['模型名称（必填）', '模型类型（必填）', '规范模型标识（必填）'];
  const rows = modelRowsFromCells([headers, ['基础资料', '文本', 'qa/decorated']]);
  assert.equal(validateModelRows(createAdminSeed(), rows)[0].status, 'ready');
  assert.throws(() => modelRowsFromCells([[...headers, '规范模型标识'], ['x', '文本', 'qa/x', 'qa/y']]), /重复/);
});

test('template covers all editable metadata, task-specific specifications and capability fields without duplicate headers', () => {
  assert.equal(MODEL_IMPORT_HEADERS.length, new Set(MODEL_IMPORT_HEADERS).size);
  for (const field of [...IDENTITY_FIELDS, ...TECHNICAL_FIELDS, ...PRESENTATION_FIELDS, ...COMMON_FIELDS, ...INTERFACE_FIELDS, ...RECORD_FIELDS, ...FEATURE_FIELDS, ...Object.keys(TASK_OPTIONS).flatMap(type => specificationFields(type, '', { tasks: TASK_OPTIONS[type] }))]) {
    assert(MODEL_IMPORT_FIELDS.some(item => item.key === field.key && item.label === field.label && item.unit === field.unit), field.label);
  }
  for (const label of ['视觉任务类型', '上下文窗口（Token）', '最大输出（Token）', '流式响应', '工具调用', '详细介绍']) assert(MODEL_IMPORT_HEADERS.includes(label), label);
  assert(validateModelRows(createAdminSeed(), modelRowsFromCells(MODEL_IMPORT_TEMPLATE)).every(item => item.status === 'ready'));
});

test('catalogue import requires only the current form basics and preserves unknown values', () => {
  const [result] = validate({});
  assert.equal(result.status, 'ready', result.message);
  assert.deepEqual(result.data.profile, {});
  assert.deepEqual(result.data.capabilities, { context: null, output: null, streaming: null, tools: null });
  for (const label of ['规范模型标识', '模型名称', '模型类型']) assert.equal(validate({ [label]: '' })[0].status, 'error', label);
  const service = validateModelRows(createAdminSeed(), modelRowsFromCells([MODEL_IMPORT_HEADERS, row(base)]), { catalogue: false })[0];
  assert.equal(service.status, 'error');
});

test('rich metadata survives validation and the existing atomic catalogue transaction without creating services or supply', () => {
  const state = createAdminSeed(), before = structuredClone(state);
  const values = { ...base, '模型作者': '测试作者', '原厂发布日期': '2026-10', '知识截止日期': '2026-09', '模型系列': '测试系列', '模型版本': 'v2', '模型 Logo': 'https://example.test/logo.png', '简短介绍': '用于校验资料导入', '支持任务': '对话、代码生成', '输入模态': '文本', '输出模态': '文本', '结果类型': '结构化数据', '支持语言': '中文、英文', '适用场景': '编程、办公', '上下文窗口（Token）': 32768, '最大输出（Token）': 8192, '流式响应': '支持', '工具调用': '不支持', '深度思考': '支持', '支持参数': 'temperature、max_tokens', '默认参数': '{"temperature":0.7,"max_tokens":4096}', '模型架构': 'MoE（混合专家）', '许可协议': 'Apache 2.0', '总参数（B）': 100, '激活参数（B）': 10, '版本状态': '稳定版', '资料状态': '已核对', '资料链接': 'https://example.test/docs', '详细介绍': '第一行\n第二行，含"引号"' };
  const [result] = validateModelRows(state, parseModelText(modelCsv([MODEL_IMPORT_HEADERS, row(values)])));
  assert.equal(result.status, 'ready', result.message);
  assert.equal(result.data.profile.author, '测试作者');
  assert.equal(result.data.profile.releaseDate, '2026-10');
  assert.equal(result.data.profile.knowledgeCutoff, '2026-09');
  assert.deepEqual(result.data.profile.defaultParameters, { temperature: 0.7, max_tokens: 4096 });
  assert.equal(result.data.profile.architecture, 'MoE');
  assert.equal(result.data.profile.license, 'Apache-2.0');
  assert.equal(result.data.profile.parameters, 100);
  assert.equal(result.data.profile.tools, undefined);
  assert.equal(result.data.capabilities.tools, false);
  const transaction = operationsTransaction(state, { operation: 'templateImport', data: { models: [result.data] } });
  const added = transaction.changes.find(item => item.collection === 'modelTemplates').record;
  assert.deepEqual(added.profile, result.data.profile);
  assert.deepEqual(added.capabilities, result.data.capabilities);
  assert(transaction.changes.every(item => ['modelTemplates', 'audits'].includes(item.collection)));
  assert.deepEqual(state, before);
});

test('all model types import their applicable fields, with explicit visual type and audio task applicability', () => {
  const cases = [
    [{ '模型类型': '多模态', '支持任务': '图像理解', '输入模态': '文本、图片', '单次图片上限（张）': 8 }, 'multimodal', 'imageLimit', 8],
    [{ '模型类型': '视觉', '视觉任务类型': '图像', '支持任务': '文生图', '单次生成上限（张）': 4, '输出分辨率': '1024×1024' }, 'image', 'imageLimit', 4],
    [{ '模型类型': '视觉', '视觉任务类型': '视频', '支持任务': '文生视频', '最长生成时长（秒）': 10, '声音生成': '不支持' }, 'video', 'maxDuration', 10],
    [{ '模型类型': '语音', '支持任务': '语音合成、语音识别', '单次文本上限（字符）': 500, '单次音频上限（秒）': 60 }, 'audio', 'maxDuration', 60],
    [{ '模型类型': '向量', '支持任务': '文本向量化', '可选向量维度': '512、1024', '单批文本上限（条）': 32 }, 'embedding', 'batchSize', 32],
    [{ '模型类型': '重排', '支持任务': '文档重排', '候选文档上限（篇）': 50, '返回结果上限（Top N）（篇）': 10 }, 'rerank', 'topN', 10],
  ];
  for (const [values, type, key, expected] of cases) {
    const [result] = validate(values);
    assert.equal(result.status, 'ready', result.message);
    assert.equal(result.data.type, type);
    assert.equal(result.data.profile[key], expected);
  }
  for (const values of [{ '模型类型': '视觉' }, { '视觉任务类型': '图像' }, { '模型类型': '语音', '支持任务': '语音识别', '单次文本上限（字符）': 500 }, { '模型类型': '视觉', '视觉任务类型': '视频', '上下文窗口（Token）': 100 }]) assert.equal(validate(values)[0].status, 'error');
});

test('invalid parameter JSON, enum, dates, type tasks and numeric bounds block individual rows', () => {
  for (const values of [{ '默认参数': '[]' }, { '默认参数': '{"temperature":1}' }, { '支持参数': 'temperature', '默认参数': '{' }, { '原厂发布日期': '2026-02-30' }, { '流式响应': '是' }, { '上下文窗口（Token）': -1 }, { '上下文窗口（Token）': 10, '最大输出（Token）': 20 }, { '总参数（B）': 1, '激活参数（B）': 2 }, { '模型类型': '多模态', '支持任务': '文生图' }, { '输入模态': '文件' }]) {
    assert.equal(validate(values)[0].status, 'error', JSON.stringify(values));
  }
});

test('headers support optional columns and reordering; source row numbers and Excel dates remain accurate', () => {
  const labels = ['模型名称', '原厂发布日期', '模型类型', '规范模型标识'];
  const rows = modelRowsFromCells([labels, [], ['最小资料', new Date('2026-10-01T00:00:00Z'), '文本', 'qa/minimal']]);
  assert.equal(rows[0].rowNumber, 3);
  assert.equal(rows[0].cells[MODEL_IMPORT_HEADERS.indexOf('原厂发布日期')], '2026-10-01');
  assert.equal(validateModelRows(createAdminSeed(), rows)[0].status, 'ready');
  for (const input of [[['模型名称'], ['无必填表头']], [[...labels, '旧字段'], ['x']], [[...labels, '模型名称'], ['x']], [labels, ['x', '', '文本', 'qa/x', '越界数据']], [labels], [labels, ...Array.from({ length: 501 }, () => ['x', '', '文本', 'qa/x'])]]) assert.throws(() => modelRowsFromCells(input));
});

test('duplicates are isolated in preview and rejected atomically on final import', () => {
  const state = createAdminSeed(), before = structuredClone(state);
  const rows = validateModelRows(state, modelRowsFromCells([MODEL_IMPORT_HEADERS, row(base), row(base), row({ ...base, '规范模型标识': state.modelTemplates[0].modelId })]));
  assert.deepEqual(rows.map(item => item.status), ['ready', 'error', 'error']);
  assert.match(rows[1].message, /批次内/);
  assert.match(rows[2].message, /已存在/);
  assert.throws(() => operationsTransaction(state, { operation: 'templateImport', data: { models: [rows[0].data, rows[0].data] } }), /已存在/);
  assert.deepEqual(state, before);
});
