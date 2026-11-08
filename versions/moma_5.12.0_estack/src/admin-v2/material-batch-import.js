import { IMPORT_REPORT_HEADERS, MODEL_IMPORT_HEADERS, MODEL_IMPORT_LIMIT, modelRowsFromCells, validateModelRows } from './model-import.js';
import { modelCatalogue } from './model-library.js';
import { providerCode, providerTransaction, PROVIDER_TYPES } from './provider-management.js';
import { materialProviders } from './provider-materials.js';
import { registeredSupplierModelIds, SUPPLIER_REGISTRATION_LIMIT } from './supplier-model-registration.js';

const providerColumns = [
  ['服务商名称', 'name'], ['服务商编码', 'code'], ['供给类型', 'sourceType'],
  ['简介', 'introduction'], ['官网', 'website'], ['官方文档链接', 'documentation'],
  ['联系人', 'contact'], ['联系人号码或邮箱', 'contactInfo'], ['备注', 'description'],
];
export const materialImportHeaders = {
  model: MODEL_IMPORT_HEADERS,
  provider: providerColumns.map(([header]) => header),
  relation: ['服务商编码', '规范模型标识'],
};
const requiredHeaders = { provider: materialImportHeaders.provider.slice(0, 3), relation: materialImportHeaders.relation };
function uniqueCodes(rows, codeOf) {
  const codes = new Map();
  for (const row of rows) {
    const code = codeOf(row).toLowerCase();
    codes.set(code, codes.has(code) ? null : row);
  }
  return codes;
}
const modelCodes = state => uniqueCodes(modelCatalogue(state), row => row.modelId);
const result = (row, status, message, fields = {}) => ({ ...row, ...fields, status, message });

export function materialImportRows(kind, cells) {
  if (kind === 'model') return modelRowsFromCells(cells);
  const headers = materialImportHeaders[kind];
  const labels = (cells[0] || []).map(cell => String(cell ?? '').trim());
  if (requiredHeaders[kind].some(label => !labels.includes(label))) throw Error('缺少必填表头：' + requiredHeaders[kind].join('、'));
  if (new Set(labels).size !== labels.length || labels.some(label => !headers.includes(label) && !IMPORT_REPORT_HEADERS.includes(label))) {
    throw Error('表头含重复或未知字段，请使用最新模板');
  }
  const rows = cells.slice(1).map((values, index) => {
    const clean = values.map(cell => String(cell ?? '').trim());
    const data = headers.map(label => clean[labels.indexOf(label)] || '');
    const extra = clean.slice(labels.length).some(Boolean);
    return { rowNumber: index + 2, cells: data, ...(extra ? { extra: true } : {}) };
  }).filter(row => row.extra || row.cells.some(Boolean));
  if (!rows.length || rows.length > MODEL_IMPORT_LIMIT) throw Error(`请填写 1–${MODEL_IMPORT_LIMIT} 条记录`);
  return rows;
}

export function previewMaterialRows(state, kind, rows, { providerId, retry = false } = {}) {
  const providers = materialProviders(state);
  const owner = providers.find(row => row.id === providerId) || state.providers.find(row => row.id === providerId && !row.deletedAt);
  if (kind === 'model') {
    const registered = owner ? new Set(registeredSupplierModelIds(state, owner)) : null;
    return validateModelRows(state, rows, { reuseExisting: Boolean(providerId) || retry }).map(row => {
      if (row.status !== 'ready') return row;
      if (!providerId) return row.modelId ? result(row, 'skip', '模型资料已存在') : row;
      if (!owner) return result(row, 'error', '当前服务商已移除');
      if (registered.has(row.modelId)) return result(row, 'skip', '已关联');
      return result(row, 'ready', row.modelId ? '复用已有模型并登记' : '新建模型资料并登记', { providerId });
    });
  }
  const byCode = uniqueCodes(providers, providerCode);
  const models = kind === 'relation' ? modelCodes(state) : null;
  const registered = new Map(), seen = new Set(), names = new Set();
  return rows.map(row => {
    try {
      if (row.extra) throw Error('数据列超过表头范围');
      if (kind === 'provider') {
        const data = Object.fromEntries(providerColumns.map(([, key], i) => [key, row.cells[i]]));
        data.code = data.code.toLowerCase();
        data.sourceType = Object.keys(PROVIDER_TYPES).find(type => type === data.sourceType || PROVIDER_TYPES[type] === data.sourceType);
        if (!data.name || !data.code || !data.sourceType) throw Error('请填写服务商名称、服务商编码和有效的供给类型');
        const existing = byCode.get(data.code);
        if (existing) {
          if (Object.keys(data).some(key => key !== 'code' && data[key] && existing[key] && data[key] !== existing[key])) throw Error('与已有服务商资料不一致，请核对编码或资料');
          return result(row, 'skip', '服务商资料已存在');
        }
        if (seen.has(data.code) || names.has(data.name.toLowerCase())) throw Error('批次内服务商名称或编码重复');
        providerTransaction(state, { operation: 'create', data });
        seen.add(data.code);
        names.add(data.name.toLowerCase());
        return result(row, 'ready', '可新增服务商资料', { data });
      }
      const provider = byCode.get(row.cells[0].toLowerCase()), model = models.get(row.cells[1].toLowerCase());
      if (provider === null || model === null) throw Error('服务商编码或规范模型标识匹配到多份资料，请先核对主档');
      if (!provider || !model) throw Error([!provider && '服务商编码找不到', !model && '规范模型标识找不到'].filter(Boolean).join('，'));
      const key = JSON.stringify([provider.id, model.id]);
      if (seen.has(key)) return result(row, 'skip', '文件内重复，按首行处理');
      seen.add(key);
      if (!registered.has(provider.id)) registered.set(provider.id, new Set(registeredSupplierModelIds(state, provider)));
      if (registered.get(provider.id).has(model.id)) return result(row, 'skip', '已关联');
      return result(row, 'ready', '可登记供应关系', { providerId: provider.id, modelId: model.id });
    } catch (error) { return result(row, 'error', error.message); }
  });
}

function batches(rows, size) {
  const groups = [];
  for (let i = 0; i < rows.length; i += size) groups.push(rows.slice(i, i + size));
  return groups;
}

export async function submitMaterialRows({ state, kind, providerId, rows, transact, onResult, active }) {
  let current = state, paused = false;
  const failed = new Set(), created = new Set();
  const report = (group, status, message) => {
    if (group.length && active()) onResult(group.map(row => ({ rowNumber: row.rowNumber, status, message, masterCreated: created.has(row.rowNumber) })));
  };
  const fail = (group, message) => {
    for (const row of group) failed.add(row.rowNumber);
    report(group, 'failed', message);
  };
  const commit = async (group, operation, data) => {
    if (!active()) return false;
    if (paused) { fail(group, '前一批结果待核对，载入最新数据后可重试'); return false; }
    try {
      current = await transact({ type: 'modelOperations', operation, data });
      return true;
    } catch (error) {
      fail(group, error.message);
      paused = error.status === 409 || error.message.includes('提交结果待确认');
      return false;
    }
  };
  if (kind === 'provider') {
    for (const group of batches(rows, 5)) {
      if (await commit(group, 'supplierProfilesImport', { profiles: group.map(row => row.data) })) report(group, 'done', '已新增服务商资料');
    }
    return;
  }
  if (kind === 'model') {
    for (const group of batches(rows.filter(row => !row.modelId), 5)) {
      if (await commit(group, 'templateImport', { models: group.map(row => row.data) })) {
        for (const row of group) created.add(row.rowNumber);
        if (!providerId) report(group, 'done', '已新增模型资料');
      }
    }
    if (!providerId) return;
  }
  if (!active()) return;
  const models = modelCodes(current), providers = new Map(current.providers.filter(row => !row.deletedAt).map(row => [row.id, row]));
  const groups = new Map();
  for (const row of rows) {
    if (failed.has(row.rowNumber)) continue;
    const id = providerId || row.providerId;
    const modelId = row.modelId || models.get(row.data.modelId.toLowerCase())?.id;
    if (!providers.has(id) || !modelId) { fail([row], '服务商或模型资料已变化，请重新核对'); continue; }
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push({ ...row, modelId });
  }
  for (const [id, entries] of groups) {
    const registered = new Set(registeredSupplierModelIds(current, providers.get(id)));
    report(entries.filter(row => registered.has(row.modelId)), 'skip', '已关联');
    for (const group of batches(entries.filter(row => !registered.has(row.modelId)), SUPPLIER_REGISTRATION_LIMIT)) {
      if (await commit(group, 'supplierModelsRegister', { providerId: id, libraryIds: group.map(row => row.modelId) })) report(group, 'done', '已登记供应关系');
    }
  }
}
