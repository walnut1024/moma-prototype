import { libraryRecord } from './admin-v2/model-library.js';
import { isResourceId } from './resource-id.mjs';

export const modelServiceKey = (model, key = '', epoch = model.serviceModeRevision || 1) =>
  `${key ? `provider:${model.id}:${key}` : `standard:${model.id}`}${epoch > 1 ? `:epoch:${epoch}` : ''}`;

export function modelIdentity(state, model) {
  const source = libraryRecord({ ...state, models: state.models || [], modelTemplates: state.modelTemplates || [] }, model.id);
  return { id: source?.id || model.templateId || model.id, canonical_slug: source?.modelId || '' };
}

export function modelServiceIdentity(state, model, key = '') {
  const legacy = modelServiceKey(model, key);
  return state.modelData?.resourceIds?.[legacy] || legacy;
}

export function channelIdentity(state, id) {
  return state.modelData?.mappingIds?.[id] || (isResourceId(id,'channel') ? id : state.modelSupplies?.find(row=>row.channelId===id)?.id || id);
}

export function priceItemReferences(state, item) {
  return Object.fromEntries([['billing_item_id', 'scenario', 'name', item.name], ['unit_id', 'unit', 'name', item.unit], ['currency_id', 'currency', 'code', item.currency]]
    .map(([key, kind, field, value]) => [key, item[key] || state.tariffDictionary?.find(row => row.kind === kind && row[field] === value)?.id || null]));
}

export function modelPresentation(state, model) {
  const content = model.marketContent || model;
  return { ...model, name: content.name, description: content.description || '', profile: content.profile || {},
    maker: model.marketContent ? content.profile?.author || '' : model.maker };
}

export function modelDisplayName(state, id) {
  const service = state.models.find(row => !row.deletedAt && modelIdentity(state,row).id === id);
  return service ? modelPresentation(state,service).name : libraryRecord(state,id)?.name || '';
}
