import { parseDelimitedCells } from '../tabular-import.mjs';
import { MODEL_CATEGORIES, modelTransaction } from './model-management.js';
import { INPUT_MODALITY_OPTIONS, OUTPUT_MODALITY_OPTIONS, RESULT_TYPE_OPTIONS, TASK_OPTIONS } from './model-profile.js';

export const MODEL_IMPORT_LIMIT = 500;
export const MODEL_IMPORT_HEADERS = ['模型ID', '模型展示名称', '模型类型', '支持任务', '输入模态', '输出模态', '结果类型', '上下文大小（Token）', '最大输出（Token）', '简短介绍'];
export const MODEL_IMPORT_TEMPLATE = [MODEL_IMPORT_HEADERS,
  ['catalog/chat-001', '智能对话', '语言模型', '对话', '文本', '文本', '', '32768', '8192', '面向知识问答和文本生成。'],
  ['catalog/image-001', '图像创作', MODEL_CATEGORIES.visual, '文生图', '文本、图片', '图片', '', '', '', '根据文本和参考图生成图像。'],
  ['catalog/video-001', '视频创作', MODEL_CATEGORIES.visual, '文生视频', '文本、图片', '视频', '', '', '', '根据文本和参考图生成视频。'],
];
export function modelRowsFromCells(cells) {
  const rows = cells.map(row => row.map(cell => String(cell ?? '').trim())).filter(row => row.some(Boolean));
  if (!rows.length || MODEL_IMPORT_HEADERS.some((header, index) => rows[0][index] !== header) || rows[0].length !== MODEL_IMPORT_HEADERS.length) throw new Error('表头不匹配，请下载最新模板，保留十列表头和顺序');
  rows.shift();
  if (!rows.length) throw new Error('没有可导入的模型，请填写至少一条记录');
  if (rows.length > MODEL_IMPORT_LIMIT) throw new Error(`每批最多 ${MODEL_IMPORT_LIMIT} 条，请拆分后导入`);
  if (rows.some(row => row.length > MODEL_IMPORT_HEADERS.length)) throw new Error('列数超过模板范围，请按十列填写');
  return rows.map((cells, index) => ({ rowNumber: index + 2, cells }));
}
export const parseModelText = text => modelRowsFromCells(parseDelimitedCells(text));
export function validateModelRows(state, rows) {
  const seen = new Set();
  return rows.map(row => {
    const [modelId = '', name = '', category = '', task = '', input = '', output = '', result = '', context = '', maxOutput = '', description = ''] = row.cells;
    const split = raw => [...new Set(raw.split(/[,，、;；]/).map(value => value.trim()).filter(Boolean))];
    const tasks = split(task);
    const data = { modelId, name, description, type: Object.keys(MODEL_CATEGORIES).find(key => MODEL_CATEGORIES[key] === category), usageUnit: tasks.includes('语音合成') ? '字符' : '秒', profile: { tasks }, capabilities: { streaming: null, tools: null, context, output: maxOutput } };
    try {
      if (data.type === 'visual') {
        data.type = ['image', 'video'].find(key => tasks.length && tasks.every(value => TASK_OPTIONS[key].includes(value)));
        if (!data.type) throw new Error('视觉生成的支持任务需属于图像生成或视频生成中的一类');
      }
      for (const value of [context, maxOutput]) if (value && (!Number.isSafeInteger(Number(value)) || Number(value) < 1)) throw new Error('Token 大小需为正整数');
      for (const [key, raw, choices, label] of [['inputModalities', input, INPUT_MODALITY_OPTIONS, '输入模态'], ['outputModalities', output, OUTPUT_MODALITY_OPTIONS, '输出模态'], ['resultTypes', result, RESULT_TYPE_OPTIONS, '结果类型']]) {
        const values = split(raw);
        if (values.some(value => !choices.includes(value))) throw new Error(label + '包含无效选项，请按模板说明填写');
        data.profile[key] = values;
      }
      modelTransaction(state, { operation: 'create', data });
      if (seen.has(modelId.toLowerCase())) throw new Error('批次内 Model ID 重复');
      seen.add(modelId.toLowerCase());
      return { ...row, data, status: 'ready', message: '可导入' };
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
