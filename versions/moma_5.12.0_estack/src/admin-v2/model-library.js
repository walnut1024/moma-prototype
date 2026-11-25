import catalogue from '../data/builtin-model-catalogue.json' with { type: 'json' };
import { MODEL_TYPE_LABELS } from '../model-types.mjs';
export const MODEL_CATALOGUE_TYPES = MODEL_TYPE_LABELS;
export function requireModelSlug(value) {
  if (!/^[a-z0-9][a-z0-9.-]{0,79}$/.test(value || '')) throw new Error('模型编码须以小写字母或数字开头，仅可使用小写字母、数字、点和中划线，最多 80 字符');
}

export function libraryRecord(state, id) {
  const record = state.models.find(item => item.id === id) || state.modelTemplates.find(item => item.id === id);
  if (record?.templateId) return state.modelTemplates.find(item => item.id === record.templateId) || state.models.find(item => item.id === record.templateId);
  if (record && state.models.some(item => item.templateId === record.id)) return record;
  return record && (state.models.find(item => item.id === record.id || item.modelId === record.modelId) || record);
}
export function modelLibrary(state) {
  return [...state.models.filter(item => !item.templateId || item.templateId === item.id && !state.modelTemplates.some(row=>row.id===item.id)), ...state.modelTemplates.filter(item => libraryRecord(state, item.id)?.id === item.id)];
}

export function modelReleaseOrder(a,b) {
  const date=row=>/^\d{4}-\d{2}(?:-\d{2})?$/.test(row.profile?.releaseDate || '')?row.profile.releaseDate:'';
  return date(b).localeCompare(date(a));
}
function materialFromIdentity(state, identity) {
  if (!identity || state.modelData?.archivedCatalogueIds?.includes(identity.id)) return;
  const material = state.modelData?.referenceMaterials?.[identity.id] || identity;
  if (!material.referenceDeletedAt) return material;
}

export function modelMaterial(state, id) {
  return materialFromIdentity(state, libraryRecord(state, id));
}

export function modelIdentityCatalogue(state) {
  const archived = new Set(state.modelData?.archivedCatalogueIds || []);
  const records = modelLibrary(state).filter(row => !archived.has(row.id));
  if (!state.modelData?.archivedCatalogueIds) return records;
  const order = new Map(catalogue.models.flatMap((row, index) => [[row.existingId || row.id, index], [row.modelId, index]]));
  const rank = row => order.get(row.id) ?? order.get(row.modelId?.toLowerCase()) ?? catalogue.models.length;
  return records.sort((a, b) => rank(a) - rank(b));
}

export function modelCatalogue(state) {
  return modelIdentityCatalogue(state).flatMap(row => materialFromIdentity(state, row) || []);
}

export function libraryRemovalIssue(state, id) {
  return modelMaterial(state, id) ? '' : '模型资料不存在';
}
