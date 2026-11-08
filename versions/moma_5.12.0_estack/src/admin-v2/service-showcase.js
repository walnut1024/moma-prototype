import { applyModelDataset, MODEL_DATASET } from '../mock/model-data.js';
export const SERVICE_SHOWCASE_ID = 'service-showcase-20261102';
export const SERVICE_SHOWCASE_MODELS = MODEL_DATASET.collections.models.map(model => ({ code:model.modelId, name:model.name, author:model.profile.author, date:model.profile.releaseDate, mode:model.serviceMode }));
export const isServiceShowcase = model => Boolean(model.serviceShowcase) && SERVICE_SHOWCASE_MODELS.some(spec => spec.code === model.modelId);
export function prepareServiceShowcase(state) {
  if (!state.cloudOperations) return applyModelDataset(state);
  const { id, version, scenarioId, demoTenant, collections } = MODEL_DATASET;
  if (state.modelData?.datasetId === id || state.models.some(isServiceShowcase)) return state;

  const additions = {};
  for (const [collection, records] of Object.entries({ ...collections, tenants: [demoTenant] })) {
    const existing = state[collection];
    additions[collection] = records.filter(record => {
      const saved = existing.find(row => row.id === record.id);
      if (collection === 'modelTemplates' && saved?.modelId === record.modelId && saved.type === record.type) return false;
      const codeConflict = ['models', 'modelTemplates'].includes(collection) && existing.some(row => row.modelId.toLowerCase() === record.modelId.toLowerCase());
      if (saved || codeConflict || state.modelData?.userIds?.[collection]?.includes(record.id)) {
        throw Error(`案例导入与已有记录冲突：${record.name || record.id}`);
      }
      return true;
    });
  }
  return {
    ...state,
    ...Object.fromEntries(Object.entries(additions).map(([key, records]) => [key, [...state[key], ...structuredClone(records)]])),
    modelData: { ...state.modelData, datasetId: id, datasetVersion: version, scenarioId },
  };
}
