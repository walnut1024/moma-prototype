import { modelCatalogue } from './model-library.js';
import { displayedCatalogueIds } from './moma-provider.js';
import { supplyModelRecord } from './supply-models.js';
export const registeredSupplierModelIds = (state, provider) => displayedCatalogueIds(provider, state).map(id => supplyModelRecord(state, provider, id)?.id).filter(Boolean);

// Keep one batch within the existing D1 atomic statement budget.
export const SUPPLIER_REGISTRATION_LIMIT = 5;
export function supplierModelSelection(value) {
  try { const rows=JSON.parse(value || '[]'); return Array.isArray(rows) && rows.length<=SUPPLIER_REGISTRATION_LIMIT && rows.every(id=>typeof id==='string' && /^[A-Za-z0-9:_.-]{1,200}$/.test(id)) ? [...new Set(rows)] : []; } catch { return []; }
}
export function supplierMaterialReturn(value, createdId) {
  if(typeof value!=='string' || !/^#\/admin-2\/providers(?:\?|$)/.test(value)) return null;
  const params=new URLSearchParams(value.split('?')[1] || '');
  if(!params.get('provider')) return null;
  const selected=supplierModelSelection(params.get('selectedModels'));
  if(createdId && !selected.includes(createdId) && selected.length<SUPPLIER_REGISTRATION_LIMIT) selected.push(createdId);
  params.set('selectedModels',JSON.stringify(selected)); params.set('addingModel','1');
  return '#/admin-2/providers?'+params;
}
export function supplierModelRegistration(state, provider, libraryIds) {
  if (!Array.isArray(libraryIds) || !libraryIds.length || libraryIds.length > SUPPLIER_REGISTRATION_LIMIT || libraryIds.some(id => typeof id !== 'string' || !id)) throw Error('请选择 1–5 个模型');
  if (new Set(libraryIds).size !== libraryIds.length) throw Error('本次选择包含重复模型');
  const library = modelCatalogue(state), existing = registeredSupplierModelIds(state, provider);
  return libraryIds.map(id => {
    const model = library.find(row => row.id === id);
    if (!model) throw Error('模型资料已有变化，请重新选择');
    if (existing.includes(id)) throw Error(`当前服务商已登记模型：${model.name}`);
    return model;
  });
}
