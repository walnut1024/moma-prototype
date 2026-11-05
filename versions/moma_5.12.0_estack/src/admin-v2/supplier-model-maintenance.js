import { catalogueChannels } from './provider-channels.js';
import { providerCatalogueIds } from './moma-provider.js';
import { supplierModelFields } from './supply-models.js';
import { cataloguePriceDraft, normalizeCataloguePrice } from './provider-catalogue-pricing.js';

const text = (value, label, max = 2000) => {
  if (value == null) return '';
  if (typeof value !== 'string' || value.length > max || Array.from(value).some(char => char.charCodeAt(0) < 32 && !['\t', '\n'].includes(char))) throw new Error(`${label}无效，最多 ${max} 字`);
  return value.trim();
};
export const SUPPLY_FEATURES = { streaming: '流式响应', tools: '工具调用', structured: '结构化输出', reasoning: '深度思考', cache: '提示词缓存' };
export function normalizeSupplyProfile(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('供应能力配置无效');
  if (input.capabilities != null && (typeof input.capabilities !== 'object' || Array.isArray(input.capabilities))) throw new Error('能力配置无效');
  const capabilities = {};
  for (const key of Object.keys(SUPPLY_FEATURES)) {
    const value = input.capabilities?.[key];
    if (value != null && typeof value !== 'boolean') throw new Error('能力须选择支持、不支持或未确认');
    capabilities[key] = value ?? null;
  }
  for (const key of ['context', 'output']) {
    const value = input.capabilities?.[key];
    if (value !== '' && value != null && (!['string', 'number'].includes(typeof value) || !Number.isSafeInteger(Number(value)) || Number(value) <= 0)) throw new Error('上下文与最大输出须为正整数');
    capabilities[key] = value === '' || value == null ? null : Number(value);
  }
  if (capabilities.context && capabilities.output > capabilities.context) throw new Error('最大输出不能大于上下文');
  if (!Array.isArray(input.parameters ?? []) || (input.parameters ?? []).length > 50) throw new Error('最多维护 50 个参数');
  const names = new Set();
  const parameters = (input.parameters ?? []).map(row => {
    if (!row || typeof row !== 'object') throw new Error('参数配置无效');
    const name = text(row.name, '参数名', 80);
    if (!/^[a-zA-Z][a-zA-Z0-9_.-]*$/.test(name) || names.has(name)) throw new Error('参数名须有效且不能重复');
    names.add(name);
    if (typeof row.required !== 'boolean') throw new Error('请明确参数是否必填');
    return { name, required: row.required, defaultValue: text(row.defaultValue, '默认值', 256), range: text(row.range, '参数范围', 256) };
  });
  return { capabilities, parameters, constraints: text(input.constraints, '组合限制'), source: text(input.source, '能力来源', 500) };
}
export function activeSupplierListPrice(entry, at = Date.now()) {
  const latest = (entry?.listPriceVersions || []).filter(row => row.status === '已发布' && Date.parse(row.effectiveAt) <= at && Date.parse(row.publishedAt || row.effectiveAt) <= at)
    .sort((a, b) => Date.parse(b.effectiveAt) - Date.parse(a.effectiveAt) || b.version - a.version)[0];
  return !latest || latest.expiresAt && Date.parse(latest.expiresAt) <= at ? null : latest;
}
export function listPriceStatus(entry) {
  if (activeSupplierListPrice(entry)) return '已生效';
  const versions = entry?.listPriceVersions || [];
  if (versions.some(row => row.status === '已发布' && Date.parse(row.effectiveAt) > Date.now())) return '待生效';
  return versions.some(row => row.status === '已发布') ? '已到期' : '未配置';
}
export function supplierListPriceDraft(data, modelId) {
  if (!Array.isArray(data.scenarios) || data.scenarios.some(row => !row || typeof row !== 'object')) throw new Error('请配置刊例价计费项');
  const pricing = normalizeCataloguePrice({ modelId, discountFactor: '1', scenarios: data.scenarios?.map(row => ({ name: row.name, unit: row.unit, currency: row.currency, condition: row.condition, listPrice: row.listPrice })) });
  if (!pricing.scenarios.length || pricing.scenarios.some(row => row.listPrice == null)) throw new Error('请填写完整刊例价，免费请填 0');
  if (!Number.isFinite(Date.parse(data.effectiveAt))) throw new Error('请填写有效生效时间');
  if (data.expiresAt && (!Number.isFinite(Date.parse(data.expiresAt)) || Date.parse(data.expiresAt) <= Date.parse(data.effectiveAt))) throw new Error('到期时间须晚于生效时间');
  return { pricing, effectiveAt: new Date(data.effectiveAt).toISOString(), expiresAt: data.expiresAt ? new Date(data.expiresAt).toISOString() : null };
}
export function supplierModelMaintenance(state, { operation, objectId, data = {} }) {
  const provider = state.providers.find(row => row.id === objectId);
  if (!provider || !providerCatalogueIds(provider).includes(data.modelId)) throw new Error('供应商模型不存在，请重新选择');
  const current = provider.catalogModels?.find(row => row.modelId === data.modelId) || { modelId: data.modelId };
  const update = (owner, fields, label) => ({ type: 'batch', objectId: owner.id, label, changes: [{ type: 'update', collection: 'providers', id: owner.id, changes: fields }] });
  const save = (record, label) => update(provider, { catalogModels: [...(provider.catalogModels || []).filter(row => row.modelId !== data.modelId), record] }, label);
  if (operation === 'supplierModelProfile') {
    if (data.expectedRevision !== (current.supplyProfileRevision || 0)) throw new Error('供应能力已变化，请重新载入');
    const supplyProfile = normalizeSupplyProfile(data.profile);
    return save({ ...current, supplyProfile, supplyProfileRevision: (current.supplyProfileRevision || 0) + 1, supplyProfileUpdatedAt: new Date().toISOString() }, '保存供应商模型参数与能力');
  }
  if (operation === 'supplierModelCopy') {
    const target = state.providers.find(row => row.id === data.targetProviderId);
    if (!target) throw new Error('请选择目标供应商');
    const { modelId, fields } = supplierModelFields(state, target, data.libraryId);
    if (providerCatalogueIds(target).includes(modelId)) throw new Error('目标供应商已登记该模型，请直接配置，不能重复创建');
    const profile = normalizeSupplyProfile(current.supplyProfile);
    let copiedPrice;
    if (data.copyListPrice) {
      const active = activeSupplierListPrice(current);
      if (!active) throw new Error('来源模型没有有效刊例价');
      copiedPrice = { ...supplierListPriceDraft({ ...active, scenarios: cataloguePriceDraft(active.pricing).scenarios, effectiveAt: new Date().toISOString(), expiresAt: active.expiresAt }, modelId), id: crypto.randomUUID(), version: 1, status: '已发布', publishedAt: new Date().toISOString(), createdAt: new Date().toISOString(), operator: state.currentRole };
    }
    fields.catalogModels = fields.catalogModels.map(row => row.modelId === modelId ? { ...row, supplyProfile: profile, supplyProfileRevision: (row.supplyProfileRevision || 0) + 1, copiedFrom: { providerId: provider.id, modelId: data.modelId }, ...(copiedPrice ? { listPriceRevision: (row.listPriceRevision || 0) + 1, listPriceVersions: [...(row.listPriceVersions || []), { ...copiedPrice, version: (row.listPriceRevision || 0) + 1 }] } : {}) } : row);
    return update(target, fields, '复制创建供应模型');
  }
  if (operation === 'supplierChannelListPricePublish') {
    const association = catalogueChannels(state, provider, data.modelId).find(row => row.id === data.associationId && row.endpointId === data.endpointId);
    if (!association || !association.endpointId) throw new Error('模型与渠道关联已变化，请重新选择');
    if (data.expectedRevision !== (association.listPriceRevision || 0)) throw new Error('渠道刊例价已变化，请重新载入');
    if (data.confirmed !== true) throw new Error('请确认发布刊例价');
    const price = supplierListPriceDraft(data, data.modelId);
    if (price.expiresAt && Date.parse(price.expiresAt) <= Date.now()) throw new Error('刊例价已经到期，不能发布');
    const revision = (association.listPriceRevision || 0) + 1;
    const next = { ...price, id: crypto.randomUUID(), version: revision, status: '已发布', publishedAt: new Date().toISOString(), createdAt: new Date().toISOString(), operator: state.currentRole };
    const records = provider.catalogConnections || [];
    const stored = records.find(row => !row.deletedAt && row.modelId === data.modelId && row.endpointId === data.endpointId && (row.id || association.id) === association.id);
    const record = { ...(stored || { id: association.id, modelId: data.modelId, endpointId: data.endpointId }), listPriceRevision: revision, listPriceVersions: [...(association.listPriceVersions || []), next] };
    return update(provider, { catalogConnections: stored ? records.map(row => row === stored ? record : row) : [...records, record] }, '发布模型渠道刊例价');
  }
  if (data.expectedRevision !== (current.listPriceRevision || 0)) throw new Error('刊例价已变化，请重新载入');
  const versions = current.listPriceVersions || [], revision = (current.listPriceRevision || 0) + 1;
  if (operation === 'supplierListPricePublish') {
    if (data.confirmed !== true) throw new Error('请确认发布刊例价，采购价和客户售价保持不变');
    const price = supplierListPriceDraft(data, data.modelId);
    if (price.expiresAt && Date.parse(price.expiresAt) <= Date.now()) throw new Error('刊例价已经到期，不能发布');
    const next = { ...price, id: crypto.randomUUID(), version: revision, status: '已发布', publishedAt: new Date().toISOString(), createdAt: new Date().toISOString(), operator: state.currentRole };
    return save({ ...current, listPriceRevision: revision, listPriceVersions: [...versions, next] }, '发布供应商刊例价');
  }
  throw new Error('未知供应商模型维护操作');
}
