import catalogue from '../mock/builtin-model-catalogue.json' with { type: 'json' };
import { providerCatalogueIds } from './moma-provider.js';
export const MODEL_CATALOGUE_TYPES = { text: '文本', visual: '视觉', multimodal: '多模态', audio: '语音', embedding: '向量', rerank: '重排' };
export function libraryRecord(state, id) {
  const record = state.models.find(item => item.id === id) || state.modelTemplates.find(item => item.id === id);
  if (record?.templateId) return state.modelTemplates.find(item => item.id === record.templateId) || state.models.find(item => item.id === record.templateId);
  if (record && state.models.some(item => item.templateId === record.id)) return record;
  return record && (state.models.find(item => item.id === record.id || item.modelId === record.modelId) || record);
}
export function modelLibrary(state) {
  return [...state.models.filter(item => !item.templateId || item.templateId === item.id && !state.modelTemplates.some(row=>row.id===item.id)), ...state.modelTemplates.filter(item => libraryRecord(state, item.id)?.id === item.id)];
}

export function modelCatalogue(state) {
  const archived = new Set(state.modelData?.archivedCatalogueIds || []);
  const records = modelLibrary(state).filter(row => !archived.has(row.id));
  if (!state.modelData?.archivedCatalogueIds) return records;
  const order = new Map(catalogue.models.flatMap((row, index) => [[row.existingId || row.id, index], [row.modelId, index]]));
  const rank = row => order.get(row.id) ?? order.get(row.modelId?.toLowerCase()) ?? catalogue.models.length;
  return records.sort((a, b) => rank(a) - rank(b));
}

export function libraryRemovalIssue(state, id) {
  const record = libraryRecord(state, id);
  if (!record) return '模型资料不存在';
  if (state.models.some(row => row.id === record.id || row.templateId === record.id)) return '已进入服务管理，不能删除模型资料';
  if (state.providers.some(provider => providerCatalogueIds(provider).some(code => {
    const entry = provider.catalogModels?.find(row => row.modelId === code);
    return entry?.libraryId ? libraryRecord(state, entry.libraryId)?.id === record.id : code.toLowerCase() === record.modelId.toLowerCase();
  }))) return '模型资料仍被供应关系引用，请先移除供应关系';
  if (state.modelOnboardings.some(row => !['已完成', '已放弃'].includes(row.status) && (libraryRecord(state, row.libraryId)?.id === record.id || row.kind === 'supplier-channel' && row.rows.some(item => libraryRecord(state, item.libraryId)?.id === record.id)))) return '模型资料仍被配置草稿引用';
  return '';
}
