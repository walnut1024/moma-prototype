import { modelTransaction, modelCode, modelSupplies, availableSupplies, activeSupplyPrice, activeSupplySalePrice, hasOutputPrice, priceUnits } from './model-management.js';
import { modelProfileDraft } from './model-profile.js';
import { providerTransaction, providerCode } from './provider-management.js';
import { connectionTestPassed } from './connection-state.js';
import { catalogueMetadata, REAL_MODELS, RECENT_TEMPLATE_CODES } from './real-model-catalogue.js';

export { providerCode } from './provider-management.js';
export const callModelId = (provider, model) => `${providerCode(provider)}/${modelCode(model)}`;
export const listed = model => model.listingStatus === '已上架';
export const metadata = model => ({ modelId: modelCode(model), name: model.name, maker: model.maker || '', type: model.type, description: model.description, usageUnit: model.usageUnit, profile: { ...modelProfileDraft(model), author: model.profile?.author || model.maker || '' }, capabilities: { ...model.capabilities } });
export function templateSeed(models) {
  const samples = models.filter(model => model.id.startsWith('catalog-demo-'));
  const templates = samples.map(model => ({ id: `template-${modelCode(model)}`, ...metadata(model), revision: 1, updatedAt: model.updatedAt }));
  templates.push({ ...catalogueMetadata('template-glm-5'), revision: 1, updatedAt: models[0].updatedAt });
  templates.push(...REAL_MODELS.filter(model => RECENT_TEMPLATE_CODES.includes(model.modelId)).map(model => ({ id: `template-${model.modelId}`, ...metadata(model), revision: 1, updatedAt: models[0].updatedAt })));
  return templates;
}
export function operationalFacts(state, model) {
  const supplies = modelSupplies(state, model.id), available = availableSupplies(state, model.id, model.capabilities);
  const selling = supplies.filter(supply => supply.salesEnabled);
  const ready = selling.filter(supply => { const cost = activeSupplyPrice(state, supply.id), sale = activeSupplySalePrice(state, model.id, supply.id); return available.some(item => item.id === supply.id) && cost && sale && cost.unit === sale.unit && priceUnits(model).includes(sale.unit) && sale.inputPrice != null && (!hasOutputPrice(model, sale.unit) || sale.outputPrice != null); });
  let issue = null;
  if (!supplies.length) issue = { label: '接入供应商', step: 'supply' };
  else if (!available.length) issue = { label: '检查连接', step: 'supply' };
  else if (!ready.length) issue = { label: '配置售价', step: 'price' };
  else if (selling.some(supply => !ready.some(item => item.id === supply.id))) issue = { label: '检查销售项', step: 'price' };
  return { supplies, available, selling, ready, issue };
}
// Compose existing domain operations against one working copy; persistence stays atomic.
export function operationsTransaction(state, action) {
  const working = structuredClone(state), changes = [];
  const apply = transaction => {
    for (const change of transaction.changes) {
      if (change.type === 'add') working[change.collection].unshift(change.record);
      else Object.assign(working[change.collection].find(item => item.id === change.id), change.changes);
      changes.push(change);
    }
    return transaction;
  };
  const update = (collection, id, fields) => apply({ changes: [{ type: 'update', collection, id, changes: fields }] });
  const add = (collection, record) => apply({ changes: [{ type: 'add', collection, record }] });
  const modelOp = (operation, modelId, data) => apply(modelTransaction(working, { operation, modelId, data }));
  const providerOp = (operation, objectId, data) => apply(providerTransaction(working, { operation, objectId, data }));
  const { operation, data = {}, modelId } = action;
  let objectId = modelId, label;
  if (['templateSave', 'templateImport', 'templateFromModel'].includes(operation)) {
    if (operation === 'templateFromModel' && !working.models.some(model => model.id === modelId)) throw new Error('模型不存在');
    const entries = operation === 'templateImport' ? data.models : [operation === 'templateFromModel' ? metadata(working.models.find(model => model.id === modelId)) : data];
    if (!Array.isArray(entries) || entries.length < 1 || entries.length > 500) throw new Error('每批需录入 1–500 个模板');
    for (const entry of entries) {
      const current = operation === 'templateSave' && data.id ? working.modelTemplates.find(template => template.id === data.id) : null;
      if (operation === 'templateSave' && data.id && !current) throw new Error('模型资料不存在');
      if (working.modelTemplates.some(template => template.id !== current?.id && template.modelId.toLowerCase() === entry.modelId?.trim().toLowerCase())) throw new Error('相同模型编码的模板已存在，请编辑已有模板');
      const validated = modelTransaction({ ...working, models: [] }, { operation: 'create', data: { ...entry, modelId: current?.modelId || entry.modelId } }).changes[0].record;
      const fields = { ...metadata(validated), revision: (current?.revision || 0) + 1, updatedAt: new Date().toISOString() };
      objectId = current?.id || `template-${crypto.randomUUID()}`;
      if (current) update('modelTemplates', current.id, fields); else add('modelTemplates', { id: objectId, ...fields });
    }
    label = operation === 'templateImport' ? `导入 ${entries.length} 个模型资料` : '保存模型资料';
  } else if (operation === 'addModel') {
    const template = data.templateId && working.modelTemplates.find(item => item.id === data.templateId);
    if (data.templateId && !template) throw new Error('模型模板不存在');
    const input = data.model || (template && metadata(template));
    if (!input) throw new Error('请选择模板或录入模型资料');
    if (working.models.some(model => modelCode(model) === input.modelId || template && model.templateId === template.id)) throw new Error('该模型已添加，请进入已有模型管理');
    const result = modelOp('create', null, input);
    objectId = result.objectId;
    if (template) update('models', objectId, { templateId: template.id, templateRevision: template.revision });
    label = '添加模型';
  } else if (operation === 'applyTemplate') {
    const model = working.models.find(item => item.id === modelId), template = working.modelTemplates.find(item => item.id === model?.templateId);
    if (!template) throw new Error('关联模板不存在');
    modelOp('basic', modelId, metadata(template));
    update('models', modelId, { templateRevision: template.revision });
    label = '应用模板资料';
  } else if (operation === 'connectSupply') {
    const model = working.models.find(item => item.id === modelId);
    if (!model) throw new Error('请先选择模型');
    let providerId = data.providerId;
    if (data.provider) { providerId = providerOp('create', null, data.provider).objectId; }
    const provider = working.providers.find(item => item.id === providerId);
    if (!provider) throw new Error('请选择供应商');
    let endpointId = data.endpointId;
    if (data.connection) { endpointId = providerOp('connection', null, { ...data.connection, providerId }).objectId; }
    const endpoint = working.endpoints.find(item => item.id === endpointId && item.providerId === providerId);
    if (!endpoint) throw new Error('请选择该供应商的接入配置');
    const previous = data.id && working.modelSupplies.find(item => item.id === data.id && item.modelId === modelId);
    if (working.modelSupplies.some(item => item.id !== previous?.id && item.modelId === modelId && item.status !== '已移除' && working.endpoints.find(ep => ep.id === item.endpointId)?.providerId === providerId)) throw new Error('该模型已关联此供应商，请编辑已有接入');
    const mapping = modelOp('supply', modelId, { id: data.id, endpointId, upstreamModelId: data.upstreamModelId, capabilities: data.capabilities });
    const supplyId = previous?.id || mapping.changes.find(change => change.collection === 'modelSupplies').record.id;
    const callId = callModelId(provider, model);
    if (working.modelSupplies.some(item => item.id !== supplyId && item.status !== '已移除' && item.callId === callId)) throw new Error('调用 Model ID 已被其他映射使用');
    update('modelSupplies', supplyId, { callId, salesEnabled: previous?.salesEnabled || false });
    if (data.procurement) modelOp('procurement', modelId, { ...data.procurement, supplyId });
    if (data.verify) {
      if (!connectionTestPassed(endpoint)) providerOp('testConnection', endpointId, { scenario: data.scenario || '成功' });
      if (connectionTestPassed(working.endpoints.find(item => item.id === endpointId))) {
        providerOp('enableConnection', endpointId, {});
        modelOp('verify', modelId, { id: supplyId, result: data.modelResult || '通过' });
        if (data.modelResult !== '失败') modelOp('enableSupply', modelId, { id: supplyId });
      }
    }
    objectId = modelId; label = data.verify ? '验证并接入供应商' : '保存供应商接入';
  } else if (operation === 'verifySupply') {
    const supply = working.modelSupplies.find(item => item.id === data.id && item.modelId === modelId);
    if (!supply) throw new Error('供应商接入不存在');
    const endpoint = working.endpoints.find(item => item.id === supply.endpointId);
    providerOp('testConnection', endpoint.id, { scenario: data.scenario || '成功' });
    if (connectionTestPassed(working.endpoints.find(item => item.id === endpoint.id))) {
      providerOp('enableConnection', endpoint.id, {});
      modelOp('verify', modelId, { id: supply.id, result: data.modelResult || '通过' });
      if (data.modelResult !== '失败') modelOp('enableSupply', modelId, { id: supply.id });
    }
    label = '验证供应商接入';
  } else if (operation === 'saveSales') {
    const model = working.models.find(item => item.id === modelId);
    if (!model) throw new Error('模型不存在');
    if (!Array.isArray(data.prices) || !Array.isArray(data.selected)) throw new Error('销售配置无效');
    const supplies = modelSupplies(working, modelId), available = availableSupplies(working, modelId, model.capabilities);
    if (data.selected.some(id => !supplies.some(item => item.id === id))) throw new Error('所选供给不属于当前模型');
    if (new Set(data.prices.map(price => price.supplyId)).size !== data.prices.length) throw new Error('同一供给不能重复定价');
    for (const price of data.prices) {
      const cost = activeSupplyPrice(working, price.supplyId);
      if (!cost) throw new Error('请先维护采购价');
      if (price.unit !== cost.unit) throw new Error('售价与采购价须使用相同计价单位');
      const complete = price.inputPrice !== '' && (!hasOutputPrice(model, price.unit) || price.outputPrice !== '');
      modelOp(data.allowIncomplete && !complete ? 'priceDraft' : 'pricePublish', modelId, price);
    }
    for (const supply of supplies) {
      const ready = available.some(item => item.id === supply.id) && activeSupplyPrice(working, supply.id) && activeSupplySalePrice(working, modelId, supply.id);
      const selected = data.selected.includes(supply.id) && (!data.allowIncomplete || Boolean(ready));
      if (selected && (!available.some(item => item.id === supply.id) || !activeSupplyPrice(working, supply.id) || !activeSupplySalePrice(working, modelId, supply.id))) throw new Error('纳入销售前须完成供给验证、采购价和当前售价');
      const callId = callModelId(supply.provider, model);
      if (working.modelSupplies.some(item => item.id !== supply.id && item.status !== '已移除' && item.callId === callId)) throw new Error('调用 Model ID 重复，请检查模型编码与供应商映射');
      update('modelSupplies', supply.id, { salesEnabled: selected, callId });
    }
    if (data.openScope) modelOp('scope', modelId, { openScope: data.openScope, tenantIds: data.tenantIds });
    if (data.publish) modelOp('publish', modelId, {});
    label = data.publish ? '保存价格并上架模型' : '保存供应商售价';
   } else if (operation === 'supplyImport') {
    if (!Array.isArray(data.rows) || !data.rows.length || data.rows.length > 500) throw new Error('每批需导入 1–500 条供给');
    for (const row of data.rows) apply(operationsTransaction(working, { operation: 'connectSupply', modelId: row.modelId, data: { ...row, providerId: data.providerId, verify: false } }));
    objectId = data.providerId; label = '批量接入模型';
  } else if (operation === 'providerRegistration') {
    const result = providerOp(data.providerId ? 'profile' : 'create', data.providerId, data.provider);
    objectId = data.providerId || result.objectId;
    if (data.connection) {
      const endpointId = providerOp('connection', null, { ...data.connection, providerId: objectId }).objectId;
      providerOp('testConnection', endpointId, { scenario: '成功' });
      providerOp('enableConnection', endpointId, {});
    }
    label = data.providerId ? '更新供应商资料' : '新增供应商';
  } else if (operation === 'checkConnection') {
    providerOp('testConnection', data.endpointId, { scenario: data.scenario || '成功' });
    if (connectionTestPassed(working.endpoints.find(item => item.id === data.endpointId))) providerOp('enableConnection', data.endpointId, {});
    objectId = working.endpoints.find(item => item.id === data.endpointId).providerId; label = '检查接入连接';
  } else if (operation === 'provider') {
    const result = providerOp(data.operation, data.objectId, data.values);
    objectId = result.objectId; label = result.label;
  } else throw new Error('未知模型运营操作');
  return { type: 'batch', label, objectId, changes };
}
