export const INFRASTRUCTURE_STORAGE = 'moma-5.12.0-estack:infrastructure';
export const MODEL_SOURCE_SLOTS = {
  'ops-model-library': 'catalog',
  'ops-cache-acceleration': 'cache-provider',
};

export function modelSourceSettings(saved, storage = globalThis.localStorage) {
  const record = value => value && typeof value === 'object' && !Array.isArray(value);
  if (record(saved?.modelSources)) return saved.modelSources;
  try {
    const prior = JSON.parse(storage?.getItem(`${INFRASTRUCTURE_STORAGE}:model-sources`) || '{}');
    return record(prior) ? prior : {};
  }
  catch { return {}; }
}

export function readModelSourceSetting(slot, storage = globalThis.localStorage) {
  try {
    const saved = JSON.parse(storage?.getItem(INFRASTRUCTURE_STORAGE) || '{}');
    return modelSourceSettings(saved, storage)[slot];
  } catch { return undefined; }
}
