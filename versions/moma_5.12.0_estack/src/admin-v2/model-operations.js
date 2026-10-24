import { modelTransaction, modelCode, modelSupplies, availableSupplies, supplyPriceReady, supplyModelUrl } from './model-management.js';
import { modelProfileDraft } from './model-profile.js';
import { tariffDictionaryTransaction } from './tariff-dictionary.js';
import { providerTransaction, providerCode, modelConnectivityPreview, PROTOCOLS } from './provider-management.js';
import { connectionTestPassed, connectionCredentialsReady } from './connection-state.js';
import { providerCatalogueIds } from './moma-provider.js';
import { catalogueMetadata, REAL_MODELS, RECENT_TEMPLATE_CODES } from './real-model-catalogue.js';

export { providerCode } from './provider-management.js';
export const callModelId = (provider, model) => `${providerCode(provider)}/${modelCode(model)}`;
export const listed = model => model.listingStatus === '已上架';
export const supplySalesStatus = supply => supply.status !== '已启用' ? '停止服务' : supply.salesEnabled ? '上架售卖' : '下架停售';
export function supplyConnectivityTest(state, { modelId, supplyId, prompt, scenario }) {
  const supply = modelSupplies(state, modelId).find(item => item.id === supplyId);
  if (!supply?.endpoint || !supply.provider) throw new Error('供应商模型或接入地址不存在');
  const { endpoint, provider } = supply;
  if (!connectionCredentialsReady(endpoint, provider)) throw new Error('请先在供应商 API Key 页签配置凭证');
  let url;
  try { url = new URL(endpoint.baseUrl); } catch { throw new Error('供应商模型 URL 无效'); }
  if (!PROTOCOLS.includes(endpoint.protocol) || (url.protocol !== 'https:' && !(provider.sourceType === 'selfHosted' && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash) throw new Error('供应商模型 URL 或协议无效');
  if (!supply.upstreamModelId?.trim()) throw new Error('供应商模型 ID 未配置');
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 2000) throw new Error('请填写测试内容，最多 2000 字');
  const requestUrl = supplyModelUrl(supply, state.models.find(item => item.id === modelId));
  if (!requestUrl) throw new Error('请先在供应商目录配置完整模型 Endpoint');
  return modelConnectivityPreview({ modelId, upstreamId: supply.upstreamModelId, endpointId: endpoint.id, baseUrl: requestUrl, protocol: endpoint.protocol }, scenario);
}
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
  const ready = selling.filter(supply => available.some(item => item.id === supply.id) && supplyPriceReady(state, model, supply.id));
  let issue = null;
  if (!supplies.length) issue = { label: '接入供应商', step: 'supply' };
  else if (!available.length) issue = { label: '检查连接', step: 'supply' };
  else if (!ready.length) issue = { label: '配置售价', step: 'price' };
  else if (selling.some(supply => !ready.some(item => item.id === supply.id))) issue = { label: '检查销售项', step: 'price' };
  return { supplies, available, selling, ready, issue };
}
export function catalogueModelMatch(state, providerId, catalogueModelId) {
  const supplies = state.modelSupplies.filter(item => item.status !== '已移除' && state.endpoints.find(ep => ep.id === item.endpointId)?.providerId === providerId && (item.catalogueModelId || item.upstreamModelId) === catalogueModelId);
  if (supplies.length > 1) throw new Error('此目录模型有多条既有供给，请核对后继续');
  const supply = supplies[0];
  const model = supply ? state.models.find(item => item.id === supply.modelId) : state.models.find(item => modelCode(item).toLowerCase() === catalogueModelId?.toLowerCase());
  const template = state.modelTemplates.find(item => item.modelId.toLowerCase() === catalogueModelId?.toLowerCase());
  return { model, supply, template };
}
export const salesSelectionVersion = (state, modelId) => JSON.stringify(modelSupplies(state, modelId).map(item => [item.id, Boolean(item.salesEnabled)]).sort(([a], [b]) => a.localeCompare(b)));
// Compose existing domain operations against one working copy; persistence stays atomic.
export function operationsTransaction(state, action) {
  const working = structuredClone(state), changes = [];
  const apply = transaction => {
    for (const change of transaction.changes) {
      if (change.type === 'add') working[change.collection].unshift(change.record);
      else if (change.type === 'remove') working[change.collection] = working[change.collection].filter(item => item.id !== change.id);
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
  } else if (operation === 'applyTemplate') {
    const model = working.models.find(item => item.id === modelId), template = working.modelTemplates.find(item => item.id === model?.templateId);
    if (!template) throw new Error('关联模板不存在');
    modelOp('basic', modelId, metadata(template));
    update('models', modelId, { templateRevision: template.revision });
    label = '应用模板资料';
  } else if (operation === 'saveOnboarding') {
    const current = working.modelOnboardings.find(item => item.id === data.id);
    if (current?.status === '已完成') throw new Error('此配置已完成，请进入模型管理');
    const provider = working.providers.find(item => item.id === data.providerId);
    if (!provider || !providerCatalogueIds(provider).includes(data.catalogueModelId)) throw new Error('请选择有效的供应商目录模型');
    if (data.endpointId && !working.endpoints.some(item => item.id === data.endpointId && item.providerId === provider.id)) throw new Error('连接不属于当前供应商');
    const fields = { providerId: provider.id, catalogueModelId: data.catalogueModelId, endpointId: data.endpointId || '', targetModelId: data.targetModelId || '', targetRevision: data.targetRevision || '', expectedSaleVersion: data.expectedSaleVersion || '', confirmedIdentity: data.confirmedIdentity === true, model: data.model || null, prices: data.prices || [], sourceVersion: data.sourceVersion || '', ...(Array.isArray(data.selected) ? { selected: [...new Set(data.selected)] } : {}), step: ['select', 'metadata', 'price', 'review'].includes(data.step) ? data.step : 'select', status: '配置中' };
    if (current && (current.providerId !== fields.providerId || current.catalogueModelId !== fields.catalogueModelId || current.targetModelId !== fields.targetModelId)) Object.assign(fields, { modelId: null, supplyId: null, prices: [], sourceVersion: '', expectedSaleVersion: '' });
    fields.salesVersion = data.salesVersion ?? current?.salesVersion ?? (current?.modelId ? salesSelectionVersion(working, current.modelId) : null);
    objectId = current?.id || 'onboarding-' + crypto.randomUUID();
    if (current) update('modelOnboardings', current.id, fields); else add('modelOnboardings', { id: objectId, ...fields });
    label = '保存模型上架进度';
  } else if (operation === 'onboardModel') {
    const draft = working.modelOnboardings.find(item => item.id === data.draftId && item.status !== '已完成');
    if (!draft) throw new Error('配置进度不存在，请重新选择目录模型');
    const provider = working.providers.find(item => item.id === draft.providerId);
    if (!provider || !providerCatalogueIds(provider).includes(draft.catalogueModelId)) throw new Error('供应商目录模型已变化，请重新选择');
    const endpoint = working.endpoints.find(item => item.id === draft.endpointId && item.providerId === provider.id);
    const configured = provider.catalogConnections?.find(item => item.modelId === draft.catalogueModelId);
    if (configured && configured.endpointId !== draft.endpointId) throw new Error('目录模型接入地址已变化，请重新核对并选择最新接入');
    if (!endpoint?.baseUrl || !connectionCredentialsReady(endpoint, provider)) throw new Error('连接或 API Key 配置缺失，请补齐供应商连接设置；当前进度已保存');
    const matched = catalogueModelMatch(working, provider.id, draft.catalogueModelId);
    const target = draft.targetModelId && working.models.find(item => item.id === draft.targetModelId);
    if (draft.targetModelId && !target) throw new Error('所选平台模型已不存在');
    if (matched.model && target && matched.model.id !== target.id) throw new Error('此目录模型已有明确对应关系，请进入已有模型');
    if (target && !matched.model && !draft.confirmedIdentity) throw new Error('请确认模型身份和版本一致，不能仅凭名称相似合并');
    let model = matched.model || target;
    if (model) {
      if (draft.targetRevision !== model.updatedAt) throw new Error('模型资料已有并发修订，请重新核对最新资料；当前输入保留');
      if (data.model && JSON.stringify(metadata(model)) !== JSON.stringify(metadata(data.model))) modelOp('basic', model.id, data.model);
    } else {
      const result = modelOp('create', null, data.model);
      model = working.models.find(item => item.id === result.objectId);
      if (matched.template) update('models', model.id, { templateId: matched.template.id, templateRevision: matched.template.revision });
    }
    model = working.models.find(item => item.id === model.id);
    let supply = matched.supply || modelSupplies(working, model.id).find(item => item.provider?.id === provider.id);
    if (supply && supply.upstreamModelId !== draft.catalogueModelId && supply.catalogueModelId !== draft.catalogueModelId) throw new Error('该平台模型已接入此供应商的其他 Model ID，请核对已有配置');
    if (!supply) {
      const mapping = modelOp('supply', model.id, { endpointId: endpoint.id, upstreamModelId: draft.catalogueModelId, capabilities: model.capabilities });
      supply = mapping.changes.find(change => change.collection === 'modelSupplies').record;
      update('modelSupplies', supply.id, { salesEnabled: false, callId: callModelId(provider, model) });
    }
    if (supply.endpointId !== endpoint.id) throw new Error('既有供给使用另一连接，请进入该供给配置，不能重复创建');
    update('modelSupplies', supply.id, { catalogueModelId: draft.catalogueModelId });
    update('modelOnboardings', draft.id, { modelId: model.id, supplyId: supply.id, model: metadata(model), targetRevision: null, salesVersion: salesSelectionVersion(working, model.id), step: 'price' });
    objectId = model.id; label = '保存展示资料并接入目录模型';
  } else if (operation === 'verifySupply') {
    const supply = working.modelSupplies.find(item => item.id === data.id && item.modelId === modelId);
    if (!supply) throw new Error('供应商接入不存在');
    const endpoint = working.endpoints.find(item => item.id === supply.endpointId);
    if (!endpoint?.baseUrl || !connectionCredentialsReady(endpoint, working.providers.find(item => item.id === endpoint.providerId))) throw new Error('连接地址或 API Key 配置缺失，请补齐供应商连接设置');
    providerOp('testConnection', endpoint.id, { scenario: data.scenario || '成功' });
    if (connectionTestPassed(working.endpoints.find(item => item.id === endpoint.id))) {
      providerOp('enableConnection', endpoint.id, {});
      modelOp('verify', modelId, { id: supply.id, result: data.modelResult || '通过' });
      if (data.modelResult !== '失败') modelOp('enableSupply', modelId, { id: supply.id });
    }
    label = '验证供应商接入';
  } else if (['publishSupply', 'unlistSupply', 'stopSupply'].includes(operation)) {
    const model = working.models.find(item => item.id === modelId);
    const supply = modelSupplies(working, modelId).find(item => item.id === data.id);
    if (!model || !supply) throw new Error('供应商模型不存在');
    if (operation === 'publishSupply') {
      if (!supplyPriceReady(working, model, supply.id)) throw new Error('请先配置完整的采购价与对外售价');
      modelOp('enableSupply', modelId, { id: supply.id });
      update('modelSupplies', supply.id, { salesEnabled: true });
      modelOp('publish', modelId, {});
    } else {
      update('modelSupplies', supply.id, { salesEnabled: false });
      if (operation === 'stopSupply') modelOp('disableSupply', modelId, { id: supply.id });
      if (!modelSupplies(working, modelId).some(item => item.salesEnabled)) update('models', modelId, { listingStatus: '已下架', visibility: '内部' });
      if (operation === 'stopSupply' && !availableSupplies(working, modelId).length) update('models', modelId, { callsEnabled: false, status: '停用' });
    }
    label = { publishSupply: '上架销售供应商模型', unlistSupply: '下架停售供应商模型', stopSupply: '停止供应商模型服务' }[operation];
  } else if (operation === 'reprice') {
    if (data.selected || data.openScope || data.publish || data.salesEnabled != null) throw new Error('调价只允许修改售价');
    if (!Array.isArray(data.items)) throw new Error('请按完整计费项设置售价');
    modelOp('pricePublish', modelId, data);
    label = '修改平台目录价';
  } else if (operation === 'completeOnboarding') {
    const draft = working.modelOnboardings.find(item => item.id === data.draftId && item.status !== '已完成');
    if (!draft) throw new Error('配置进度不存在或已完成');
    const supply = working.modelSupplies.find(item => item.id === draft.supplyId && item.modelId === draft.modelId && item.status !== '已移除');
    if (!supply) throw new Error('供给已变化，请返回供应商选择步骤');
    if (!availableSupplies(working, draft.modelId, working.models.find(item => item.id === draft.modelId).capabilities).some(item => item.id === supply.id)) throw new Error('当前销售供给尚未通过验证，请检查连接与模型');
    modelOp('pricePublish', draft.modelId, { supplyId: supply.id, items: draft.prices, sourceVersion: draft.sourceVersion, expectedSaleVersion: draft.expectedSaleVersion });
    if (draft.salesVersion !== salesSelectionVersion(working, draft.modelId)) throw new Error('销售供给已有并发修订，请重新核对本次选择');
    const supplies = modelSupplies(working, draft.modelId), selected = draft.selected || [...supplies.filter(item => item.salesEnabled).map(item => item.id), supply.id];
    if (!selected.includes(supply.id) || selected.some(id => !supplies.some(item => item.id === id))) throw new Error('销售供给选择无效');
    for (const item of supplies) if (Boolean(item.salesEnabled) !== selected.includes(item.id)) update('modelSupplies', item.id, { salesEnabled: selected.includes(item.id) });
    if (data.publish) modelOp('publish', draft.modelId, {});
    update('modelOnboardings', draft.id, { status: '已完成', step: 'review' });
    objectId = draft.modelId; label = data.publish ? '确认售价并上架模型' : '保存销售供给';
  } else if (operation === 'providerRegistration') {
    const result = providerOp(data.providerId ? 'profile' : 'create', data.providerId, data.provider);
    objectId = data.providerId || result.objectId;
    if (!data.providerId) {
      if (!Array.isArray(data.connections) || !data.connections.length) throw new Error('请至少添加一组连接信息');
      data.connections.forEach((connection, index) => {
        if (data.provider.sourceType !== 'selfHosted' && !connection.credentialRef && !connection.apiKeys?.length) throw new Error('第三方推理服务每个连接至少配置一个 API Key');
        providerOp('connection', null, { ...connection, name: `连接 ${index + 1}`, providerId: objectId });
      });
    }
    label = data.providerId ? '更新供应商资料' : '新增供应商';
  } else if (operation === 'checkConnection') {
    providerOp('testConnection', data.endpointId, { scenario: data.scenario || '成功' });
    if (connectionTestPassed(working.endpoints.find(item => item.id === data.endpointId))) providerOp('enableConnection', data.endpointId, {});
    objectId = working.endpoints.find(item => item.id === data.endpointId).providerId; label = '检查接入连接';
  } else if (operation === 'tariffDictionary') {
    const result = apply(tariffDictionaryTransaction(working, data));
    objectId = result.objectId; label = result.label;
  } else if (operation === 'provider') {
    const result = providerOp(data.operation, data.objectId, data.values);
    objectId = result.objectId; label = result.label;
  } else throw new Error('未知模型运营操作');
  return { type: 'batch', label, objectId, changes };
}
