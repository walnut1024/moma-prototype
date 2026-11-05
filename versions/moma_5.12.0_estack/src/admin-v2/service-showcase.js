import { applyModelDataset, MODEL_DATASET } from '../mock/model-data.js';
export const SERVICE_SHOWCASE_ID = 'service-showcase-20261102';
export const SERVICE_SHOWCASE_MODELS = MODEL_DATASET.collections.models.map(model => ({ code:model.modelId, name:model.name, author:model.profile.author, date:model.profile.releaseDate, mode:model.serviceMode }));
export const isServiceShowcase = model => Boolean(model.serviceShowcase) && SERVICE_SHOWCASE_MODELS.some(spec => spec.code === model.modelId);
export const prepareServiceShowcase = applyModelDataset;
