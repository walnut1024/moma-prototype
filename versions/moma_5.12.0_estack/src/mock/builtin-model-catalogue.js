import catalogue from './builtin-model-catalogue.json' with { type: 'json' };
import { modelLibrary } from '../admin-v2/model-library.js';

export const BUILTIN_MODEL_CATALOGUE = catalogue;
const configuredFields = value => value && typeof value === 'object' ? Array.isArray(value) ? value.map(configuredFields) : Object.fromEntries(Object.keys(value).filter(key => !['createdAt', 'updatedAt'].includes(key)).sort().map(key => [key, configuredFields(value[key])])) : value;

// Explicit installation only. Existing user records and removed catalogue entries stay user-owned.
export function builtinModelCatalogueChanges(state, ids) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 5 || new Set(ids).size !== ids.length || ids.some(id => !catalogue.models.some(row => row.id === id))) throw Error('请选择 1–5 个有效的内置模型');
  const changes = [], masters = modelLibrary(state), timestamp = new Date().toISOString();
  for (const id of ids) {
    if (state.modelData?.catalogueIds?.includes(id)) continue;
    const spec = catalogue.models.find(row => row.id === id);
    const matches = masters.filter(row => row.id === spec.existingId || row.modelId?.toLowerCase() === spec.modelId);
    if (matches.length > 1) throw Error(`${spec.name} 有多份模型身份，请先核对基础资料`);
    const master = matches[0];
    if (master) {
      // Ignore initialization timestamps when recognizing an untouched default; keep all business fields and drafts.
      if (JSON.stringify(configuredFields(master)) !== JSON.stringify(configuredFields(spec.initialRecord))) continue;
      const profile = { ...master.profile, releaseDate: spec.releaseDate };
      if (master.name === spec.name && master.type === spec.type && master.profile?.releaseDate === spec.releaseDate) continue;
      changes.push({ type: 'update', collection: state.models.some(row => row.id === master.id) ? 'models' : 'modelTemplates', id: master.id, changes: { name: spec.name, type: spec.type, profile, updatedAt: timestamp, revision: (master.revision || 0) + 1 } });
    } else {
      if ([...state.models, ...state.modelTemplates].some(row => row.id === id)) throw Error(`${spec.name} 的内置 ID 已被占用`);
      changes.push({ type: 'add', collection: 'modelTemplates', record: { id, modelId: spec.modelId, name: spec.name, type: spec.type, maker: '', description: '', profile: { releaseDate: spec.releaseDate }, capabilities: {}, revision: 1, builtinCatalogue: catalogue.id, createdAt: timestamp, updatedAt: timestamp } });
    }
  }
  return { type: 'batch', changes, objectId: catalogue.id, label: '更新内置模型目录', catalogueIds: ids };
}

export function cleanModelCatalogueTransaction(state) {
  const masters = modelLibrary(state), active = new Set();
  for (const spec of catalogue.models) {
    const matches = masters.filter(row => row.id === spec.existingId || row.modelId?.toLowerCase() === spec.modelId);
    if (matches.length !== 1) throw Error(`请先核对内置模型资料：${spec.name}`);
    active.add(matches[0].id);
  }
  const archivedCatalogueIds = [...new Set([...(state.modelData?.archivedCatalogueIds || []), ...masters.map(row => row.id)].filter(id => !active.has(id)))].sort();
  return { type: 'batch', changes: [], objectId: catalogue.id, label: '清理模型目录', archivedCatalogueIds };
}

export function seedBuiltinModelCatalogue(source) {
  const state = structuredClone(source);
  for (let offset = 0; offset < catalogue.models.length; offset += 5) {
    const ids = catalogue.models.slice(offset, offset + 5).map(row => row.id);
    const transaction = builtinModelCatalogueChanges(state, ids);
    for (const change of transaction.changes) {
      if (change.type === 'add') state[change.collection].push(change.record);
      else Object.assign(state[change.collection].find(row => row.id === change.id), change.changes);
    }
    state.modelData = { ...state.modelData, catalogueIds: [...(state.modelData?.catalogueIds || []), ...ids] };
  }
  const added = state.modelTemplates.filter(row => row.builtinCatalogue === catalogue.id).map(row => row.id);
  state.modelData.builtinIds = { ...state.modelData.builtinIds, modelTemplates: [...new Set([...(state.modelData.builtinIds?.modelTemplates || []), ...added])] };
  state.modelData.archivedCatalogueIds = cleanModelCatalogueTransaction(state).archivedCatalogueIds;
  return state;
}
