import mockConfig from '../mock/catalogues.json' with {type:'json'};
import { parseDelimitedCells } from '../tabular-import.mjs';
import { modelTransaction } from './model-management.js';
import { MODEL_CATALOGUE_TYPES, modelCatalogue, modelLibrary } from './model-library.js';
import { IDENTITY_FIELDS, TECHNICAL_FIELDS, PRESENTATION_FIELDS, COMMON_FIELDS, INTERFACE_FIELDS, RECORD_FIELDS, FEATURE_FIELDS, ARCHITECTURE_OPTIONS, LICENSE_OPTIONS, TASK_OPTIONS, specificationFields } from './model-profile.js';

export const MODEL_IMPORT_LIMIT = 500;
export const IMPORT_REPORT_HEADERS = ['原文件行', '处理结果'];
const column = (key, label, target = 'profile', kind = 'text') => ({ key, label, target, kind });
const header = field => field.label + (field.unit ? `（${field.unit}）` : '');
const profileFields = [...IDENTITY_FIELDS, ...TECHNICAL_FIELDS, ...PRESENTATION_FIELDS, ...COMMON_FIELDS, ...INTERFACE_FIELDS, ...FEATURE_FIELDS, ...Object.keys(TASK_OPTIONS).flatMap(type => specificationFields(type, '', { tasks: TASK_OPTIONS[type] })), ...RECORD_FIELDS, column('detailDescription', '详细介绍')];
const basicProfileFields = [...PRESENTATION_FIELDS, ...COMMON_FIELDS, ...IDENTITY_FIELDS.filter(field => ['family', 'version', 'releaseDate'].includes(field.key))];
export const MODEL_IMPORT_FIELDS = [
  column('modelId', '规范模型标识', 'model'), column('name', '模型名称', 'model'), column('type', '模型类型', 'model'), column('visualType', '视觉任务类型', 'model'),
  ...PRESENTATION_FIELDS.filter(field => ['author', 'logo'].includes(field.key)),
  ...IDENTITY_FIELDS.filter(field => ['family', 'version', 'releaseDate'].includes(field.key)), column('description', '简短介绍', 'model'),
  ...COMMON_FIELDS, ...PRESENTATION_FIELDS.filter(field => ['languages', 'scenarios'].includes(field.key)),
  column('context', '上下文窗口（Token）', 'capabilities', 'number'), column('output', '最大输出（Token）', 'capabilities', 'number'),
  column('streaming', '流式响应', 'capabilities', 'support'), column('tools', '工具调用', 'capabilities', 'support'),
  ...profileFields.filter((field, index, all) => !basicProfileFields.some(item => item.key === field.key) && all.findIndex(item => header(item) === header(field)) === index),
].map(field => ({ target: 'profile', ...field, header: header(field) }));
export const MODEL_IMPORT_HEADERS = MODEL_IMPORT_FIELDS.map(field => field.header);
export const MODEL_IMPORT_REQUIRED_HEADERS = ['规范模型标识', '模型名称', '模型类型'];
export const MODEL_IMPORT_TEMPLATE_HEADERS = MODEL_IMPORT_HEADERS.map(label => MODEL_IMPORT_REQUIRED_HEADERS.includes(label) ? `${label}（必填）` : label === '视觉任务类型' ? `${label}（视觉模型必填）` : label);
export const MODEL_IMPORT_TEMPLATE = [MODEL_IMPORT_HEADERS, ...mockConfig['admin-v2/model-import.js'].MODEL_IMPORT_EXAMPLES.map(example => MODEL_IMPORT_HEADERS.map(label => example[label] ?? ''))];

export function modelRowsFromCells(cells) {
  const clean = cells.map(row => row.map(cell => cell instanceof Date ? cell.toISOString().slice(0, 10) : String(cell ?? '').trim()));
  const labels = (clean[0] || []).map(label => MODEL_IMPORT_HEADERS[MODEL_IMPORT_TEMPLATE_HEADERS.indexOf(label)] || label);
  if (MODEL_IMPORT_REQUIRED_HEADERS.some(label => !labels.includes(label))) throw new Error('表头不匹配，请下载最新模板，保留规范模型标识、模型名称和模型类型');
  if (new Set(labels).size !== labels.length || labels.some(label => !MODEL_IMPORT_HEADERS.includes(label) && !IMPORT_REPORT_HEADERS.includes(label))) throw new Error('表头含重复或未知字段，请使用最新模板，可删除不需要的可选列');
  const rows = clean.slice(1).map((row, index) => ({ rowNumber: index + 2, cells: row })).filter(row => row.cells.some(Boolean));
  if (!rows.length) throw new Error('没有可导入的模型，请填写至少一条记录');
  if (rows.length > MODEL_IMPORT_LIMIT) throw new Error(`每批最多 ${MODEL_IMPORT_LIMIT} 条，请拆分后导入`);
  if (rows.some(row => row.cells.slice(labels.length).some(Boolean))) throw new Error('数据列超过表头范围，请检查表格');
  return rows.map(row => ({ ...row, cells: MODEL_IMPORT_HEADERS.map(label => row.cells[labels.indexOf(label)] || '') }));
}
export const parseModelText = text => modelRowsFromCells(parseDelimitedCells(text));
const split = raw => [...new Set(raw.split(/[,，、;；]/).map(value => value.trim()).filter(Boolean))];
const choices = {
  support: [['supported', '支持'], ['unsupported', '不支持']], lifecycle: [['stable', '稳定版'], ['preview', '预览版'], ['deprecated', '已退役']],
  confirmation: [['pending', '待核对'], ['confirmed', '已核对']], architecture: ARCHITECTURE_OPTIONS, license: LICENSE_OPTIONS,
};
export function validateModelRows(state, rows, { catalogue = true, reuseExisting = false } = {}) {
  const seen = new Set();
  const library = new Map();
  for (const model of modelLibrary(state)) {
    const code = model.modelId.toLowerCase();
    library.set(code, library.has(code) ? null : model);
  }
  const active = reuseExisting ? new Set(modelCatalogue(state).map(model => model.id)) : null;
  return rows.map(row => {
    const values = Object.fromEntries(MODEL_IMPORT_HEADERS.map((label, index) => [label, row.cells[index] || '']));
    const tasks = split(values['支持任务']);
    const data = { modelId: values['规范模型标识'], name: values['模型名称'], description: values['简短介绍'], type: Object.keys(MODEL_CATALOGUE_TYPES).find(key => MODEL_CATALOGUE_TYPES[key] === values['模型类型']), profile: {}, capabilities: { streaming: null, tools: null, context: null, output: null } };
    try {
      if (data.type === 'visual') {
        data.type = { '图像': 'image', '视频': 'video' }[values['视觉任务类型']];
        if (!data.type) throw new Error('视觉模型的视觉任务类型必填，请选择图像或视频');
      } else if (values['视觉任务类型']) throw new Error('仅视觉模型填写视觉任务类型');
      const applicable = [...IDENTITY_FIELDS, ...TECHNICAL_FIELDS, ...PRESENTATION_FIELDS, ...COMMON_FIELDS, ...INTERFACE_FIELDS, ...RECORD_FIELDS, ...FEATURE_FIELDS.filter(field => ['text', 'multimodal'].includes(data.type) || field.key === 'batch'), ...specificationFields(data.type, '', { tasks }), column('detailDescription', '详细介绍')];
      for (const field of MODEL_IMPORT_FIELDS) {
        const raw = values[field.header];
        if (!raw || field.target === 'model') continue;
        if (field.target === 'profile' && !applicable.some(item => header(item) === field.header) || field.target === 'capabilities' && !({ context: ['text', 'multimodal', 'embedding', 'rerank'], output: ['text', 'multimodal'], streaming: ['text', 'multimodal', 'audio'], tools: ['text', 'multimodal'] }[field.key].includes(data.type))) throw new Error(`${field.header}不适用于当前模型类型或支持任务，请留空`);
        let value = raw;
        if (['languages', 'modalities', 'tasks', 'results', 'scenarios', 'methods', 'parameters'].includes(field.kind)) value = split(raw);
        if (choices[field.kind]) {
          if (['未填写', '待确认'].includes(raw)) continue;
          value = choices[field.kind].find(([id, label]) => id === raw || label === raw)?.[0];
          if (!value) throw new Error(`${field.header}包含无效选项，请按填写提示填写`);
          if (field.target === 'capabilities') value = value === 'supported';
        }
        if (field.target === 'capabilities' && field.kind === 'number' && (!Number.isSafeInteger(Number(raw)) || Number(raw) < 1)) throw new Error(`${field.header}需为正整数`);
        data[field.target][field.key] = value;
      }
      const code = data.modelId.toLowerCase(), existing = catalogue ? library.get(code) : null;
      if (catalogue && existing === null) throw new Error('规范模型标识匹配到多份资料，请先核对主档');
      if (existing && !reuseExisting) throw new Error('规范模型标识已存在，请维护已有模型资料');
      if (existing && !active.has(existing.id)) throw new Error('规范模型标识已被归档资料使用，请核对');
      const validationState = existing ? { ...state, models: state.models.filter(model => model.modelId.toLowerCase() !== code) } : state;
      const record = modelTransaction(validationState, { operation: 'create', data, catalogue }).changes[0].record;
      if (seen.has(code)) throw new Error('批次内规范模型标识重复');
      if (existing) {
        const same = (left, right) => JSON.stringify(Array.isArray(left) ? [...left].sort() : left)
          === JSON.stringify(Array.isArray(right) ? [...right].sort() : right);
        const differences = MODEL_IMPORT_FIELDS.filter(({ target, key, header }) => {
          if (!values[header] || ['modelId', 'visualType'].includes(key)) return false;
          const before = (target === 'model' ? existing : existing[target])?.[key];
          const after = (target === 'model' ? record : record[target])?.[key];
          return before != null && before !== '' && after != null && !same(before, after);
        });
        if (differences.length) throw new Error('与已有模型资料不一致：' + differences.map(field => field.header).join('、'));
      }
      seen.add(code);
      return { ...row, data: { ...data, profile: record.profile, capabilities: record.capabilities, maker: record.maker }, ...(existing ? { modelId: existing.id } : {}),
        status: 'ready', message: existing ? '复用已有模型资料' : '可导入' };
    } catch (error) { return { ...row, data, status: 'error', message: error.message }; }
  });
}
export function modelCsv(rows) {
  return '\uFEFF' + rows.map(row => row.map(value => {
    const text = String(value ?? '');
    return '"' + (/^[=+@-]/.test(text) ? "'" + text : text).replaceAll('"', '""') + '"';
  }).join(',')).join('\r\n');
}
export function downloadModelCsv(name, rows) {
  const csv = modelCsv(rows);
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
