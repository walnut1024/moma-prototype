import { initialApplicationData } from './application-data.js';
import { MODEL_DATA_COLLECTIONS } from './model-data.js';
import { BUILTIN_MODEL_CATALOGUE } from './builtin-model-catalogue.js';
import providerCatalogues from '../data/builtin-provider-catalogues.json' with { type: 'json' };
import { resourceId } from '../resource-id.mjs';

export const builtinProviderCatalogue = provider => providerCatalogues.find(row => row.code === provider?.builtinCatalogue);

export function referenceWorkspace() {
  const initial = initialApplicationData(0);
  const state = Object.fromEntries(Object.entries(initial).map(([key, value]) => [key, Array.isArray(value) ? [] : value]));
  state.revision = 0;
  for (const key of MODEL_DATA_COLLECTIONS) state[key] = [];

  const tariffTypes = { scenario: 'billing-item', unit: 'billing-unit', currency: 'currency' };
  const tariffIds = new Map(initial.tariffDictionary.map(row => [row.id, resourceId(tariffTypes[row.kind])]));
  state.tariffDictionary = initial.tariffDictionary.map(row => ({
    ...row, id: tariffIds.get(row.id), ...(row.unitId ? { unitId: tariffIds.get(row.unitId) } : {}),
  }));
  state.admins = initial.admins.map(row => ({ ...row, loginCode: row.id, id: resourceId('admin-account') }));
  state.modelTemplates = BUILTIN_MODEL_CATALOGUE.models.map(spec => {
    const { maker = '', description = '', capabilities = {}, profile, usageUnit } = spec.initialRecord || {};
    return { id: resourceId('model'), modelId: spec.modelId, name: spec.name, type: spec.type, maker, description,
      capabilities: { ...capabilities }, profile: { ...profile, releaseDate: spec.releaseDate },
      ...(usageUnit ? { usageUnit } : {}), builtinCatalogue: BUILTIN_MODEL_CATALOGUE.id, revision: 1 };
  });
  state.providers = providerCatalogues.map(spec => ({
    id: resourceId('provider'), name: spec.name, code: spec.code, sourceType: spec.source_type,
    onboardingPresetId: spec.preset_code, builtinCatalogue: spec.code, catalogueScope: 'managed',
    status: '已启用', catalogModelIds: [], catalogModels: [], catalogConnections: [], apiKeys: [],
  }));
  const modelTemplates = state.modelTemplates.map(row => row.id);
  state.modelData = {
    sourceScope: 'reference-only-v2',
    catalogueIds: BUILTIN_MODEL_CATALOGUE.models.map(row => row.id), archivedCatalogueIds: [],
    builtinIds: { modelTemplates, providers: state.providers.map(row => row.id) }, userIds: {},
    resourceIds: Object.fromEntries(state.providers.map(row => [row.id + ':default', resourceId('key-group')])),
  };
  state.initialData = {
    ...initial.initialData,
    builtinIds: Object.fromEntries(Object.keys(initial.initialData.builtinIds).map(key => [key, state[key].map(row => row.id)])),
  };
  return state;
}
