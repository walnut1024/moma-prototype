import { supplierDirectory } from './moma-provider.js';
import { modelSupplyGroups, supplierModelChannelGroups } from './supplier-model-channel-table.js';
import { supplyModelDirectory } from './supply-models.js';

export const materialProviders = state => supplierDirectory(state)
  .filter(row => !row.deletedAt && !row.id.startsWith('service-review-provider-'));

export const providerMaterialModels = (state, provider) => supplierModelChannelGroups(state, provider).filter(row => row.master);

export function modelMaterialProviders(state, materialId) {
  const group = supplyModelDirectory(state, materialProviders(state)).find(row => row.master?.id === materialId);
  return group ? modelSupplyGroups(state, group.entries) : [];
}

export const materialChannelCount = group => new Set(group.channels.map(row => row.endpointId).filter(Boolean)).size;

export function materialSource(hash) {
  const [path, query] = hash.split('?');
  const params = new URLSearchParams(query);
  params.delete('returnTo');
  return path + (params.size ? '?' + params : '');
}

export function viewMaterialChannels(ops, providerId, materialId) {
  ops.go({ provider: providerId, perspective: 'suppliers', tab: 'catalogue', material: materialId, returnTo: materialSource(location.hash) },
    { base: 'providers', reset: true });
}
