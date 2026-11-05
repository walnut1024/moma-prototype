import { modelCatalogue } from './model-library.js';
import { displayedCatalogueIds } from './moma-provider.js';
import { supplyModelRecord } from './supply-models.js';
export const registeredSupplierModelIds = (state, provider) => displayedCatalogueIds(provider, state).map(id => supplyModelRecord(state, provider, id)?.id).filter(Boolean);

// Keep one batch within the existing D1 atomic statement budget.
export const SUPPLIER_REGISTRATION_LIMIT = 5;
export function supplierModelRegistration(state, provider, libraryIds) {
  if (!Array.isArray(libraryIds) || !libraryIds.length || libraryIds.length > SUPPLIER_REGISTRATION_LIMIT || libraryIds.some(id => typeof id !== 'string' || !id)) throw Error('请选择 1–5 个模型');
  if (new Set(libraryIds).size !== libraryIds.length) throw Error('本次选择包含重复模型');
  const library = modelCatalogue(state), existing = registeredSupplierModelIds(state, provider);
  return libraryIds.map(id => {
    const model = library.find(row => row.id === id);
    if (!model) throw Error('模型资料已有变化，请重新选择');
    if (existing.includes(id)) throw Error(`当前供应商已登记模型：${model.name}`);
    return model;
  });
}
