import { providerCatalogueIds } from './moma-provider.js';
export function libraryRecord(state, id) {
  const record = state.models.find(item => item.id === id) || state.modelTemplates.find(item => item.id === id);
  if (record?.templateId && record.templateId !== record.id) return state.modelTemplates.find(item => item.id === record.templateId) || state.models.find(item => item.id === record.templateId);
  if (record && state.models.some(item => item.templateId === record.id)) return record;
  return record && (state.models.find(item => item.id === record.id || item.modelId === record.modelId) || record);
}
export function modelLibrary(state) {
  return [...state.models.filter(item => !item.templateId || item.templateId === item.id), ...state.modelTemplates.filter(item => libraryRecord(state, item.id)?.id === item.id)];
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
