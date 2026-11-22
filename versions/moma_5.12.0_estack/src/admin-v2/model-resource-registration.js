import { libraryRecord, modelIdentityCatalogue } from './model-library.js';
import { providerCatalogueIds } from './moma-provider.js';
import { modelDisplayName } from '../model-identities.mjs';
import { isResourceId } from '../resource-id.mjs';

// Use persisted supplier-model relations, never the built-in reference catalogue, as evidence of registration.
export function registeredResourceModels(state, provider) {
  const visible = new Map(modelIdentityCatalogue(state).map(model => [model.id, model]));
  const codes = new Set(providerCatalogueIds(provider));
  const entries = (provider.catalogModels || []).filter(entry => entry.libraryId && !entry.deletedAt && codes.has(entry.modelId));
  let relations = state.supplyRelations?.models.filter(row => row.providerId === provider.id);
  if (!relations) {
    const actual = new Map();
    const add = (model, entry, catalogueId) => {
      if (!model || !visible.has(model.id)) return;
      const legacy = `supplier-model:${provider.id}:${model.id}`;
      actual.set(model.id, { id: state.modelData?.resourceIds?.[legacy] || (isResourceId(entry?.id, 'provider-model') ? entry.id : legacy),
        providerId: provider.id, materialId: model.id, modelId: catalogueId || model.modelId });
    };
    for (const entry of entries) add(libraryRecord(state, entry.libraryId), entry, entry.modelId);
    for (const supply of state.modelSupplies) {
      const endpoint = state.endpoints.find(row => row.id === supply.endpointId && row.providerId === provider.id && !row.deletedAt);
      const model = endpoint && libraryRecord(state, supply.modelId);
      if (model && !actual.has(model.id) && supply.status !== '已移除') add(model, undefined, supply.catalogueModelId || supply.upstreamModelId);
    }
    relations = [...actual.values()];
  }
  return relations.filter(row => visible.has(row.materialId)).map(row => {
    const model = visible.get(row.materialId), aliases = entries.filter(entry => libraryRecord(state, entry.libraryId)?.id === model.id);
    const entry = aliases.find(entry => entry.modelId === row.modelId);
    return { type: 'provider_model', id: row.id, provider_id: provider.id, catalogue_model_id: row.modelId,
      catalogue_model_ids: [...new Set([row.modelId, ...aliases.map(entry => entry.modelId)])], model_id: model.id, canonical_slug: model.modelId,
      name: modelDisplayName(state, model.id) || model.name, model_type: model.type, capabilities: entry?.capabilities || null, registered: true };
  });
}
