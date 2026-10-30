import { libraryRecord, modelLibrary } from './model-library.js';
import { displayedCatalogueIds, providerCatalogueModel, supplierDirectory, providerCatalogueIds } from './moma-provider.js';

export function supplyModelRecord(state, provider, modelId) {
  const entry = providerCatalogueModel(provider, modelId);
  if (entry?.libraryId) return libraryRecord(state, entry.libraryId);
  // Match a unique model code, never a display name or a shortened version name.
  const matches = modelLibrary(state).filter(model => model.modelId?.toLowerCase() === modelId.toLowerCase() && (!entry?.type || entry.type === model.type));
  return matches.length === 1 ? matches[0] : undefined;
}
export function supplyModelDirectory(state, providers = supplierDirectory(state).filter(row => !row.id.startsWith('service-review-provider-'))) {
  const groups = new Map();
  for (const provider of providers) for (const modelId of displayedCatalogueIds(provider, state)) {
    const master = supplyModelRecord(state, provider, modelId), entry = providerCatalogueModel(provider, modelId);
    const id = master?.id || JSON.stringify([provider.id, modelId]);
    if (!groups.has(id)) groups.set(id, { id, master, name: master?.name || entry?.name || modelId, code: master?.modelId || modelId, entries: [] });
    groups.get(id).entries.push({ provider, modelId });
  }
  return [...groups.values()].sort((a,b) => a.name.localeCompare(b.name, 'zh-CN'));
}
export function supplierModelFields(state, provider, libraryId) {
  const master = libraryRecord(state, libraryId);
  if (!master) throw new Error('模型资料不存在，请重新选择模型');
  const ids = providerCatalogueIds(provider), existing = [...ids, ...(provider.removedCatalogModelIds || [])].find(id => supplyModelRecord(state, provider, id)?.id === master.id);
  const modelId = existing || master.modelId;
  if (!modelId) throw new Error('请先完善模型资料的模型 ID');
  if (!existing && (ids.includes(modelId) || provider.catalogModels?.some(row => row.modelId === modelId) || provider.removedCatalogModelIds?.includes(modelId))) throw new Error('供应商中已有该模型 ID，请先核对并关联模型资料');
  if (!ids.includes(modelId) && ids.length >= 2000) throw new Error('模型目录最多 2000 个模型');
  const current = providerCatalogueModel(provider, modelId);
  return { modelId, fields: {
    catalogModelIds: ids.includes(modelId) ? ids : [...ids, modelId],
    removedCatalogModelIds: (provider.removedCatalogModelIds || []).filter(id => id !== modelId),
    catalogModels: [...(provider.catalogModels || []).filter(row => row.modelId !== modelId), { ...current, modelId, name: current?.name || master.name, type: current?.type || master.type, libraryId: master.id }],
  } };
}
