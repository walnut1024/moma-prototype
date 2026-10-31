import { resolveOnboardingProvider, resolveOnboardingModel, assertOnboardingMetadata } from './onboarding-presets.js';
import { libraryRecord, modelLibrary, libraryRemovalIssue } from './model-library.js';
export { libraryRecord, modelLibrary } from './model-library.js';
import { routingTransaction } from './service-routing.js';
import { prepareServiceReviewCases } from './service-review-cases.js';
import { modelSaleRevision, availableServiceChannels, providerServices, providerServiceId, providerPriceRevision, serviceBindingInUse } from './service-workspace.js';
import { billingItemKey, parseSaleAmount } from './provider-catalogue-pricing.js';
import { modelTransaction, modelCode, modelSupplies, availableSupplies, supplyPriceReady, supplyModelUrl, latestSaleRevision } from './model-management.js';
import { modelProfileDraft } from './model-profile.js';
import { tariffDictionaryTransaction } from './tariff-dictionary.js';
import { channelChangeTransaction } from './channel-change-management.js';
import { channelOnboardingTransaction } from './channel-onboarding.js';
import { providerTransaction, providerCode, modelConnectivityPreview, PROTOCOLS } from './provider-management.js';
import { connectionTestPassed, connectionTestPending, connectionCredentialsReady } from './connection-state.js';
import { providerCatalogueIds } from './moma-provider.js';
import { catalogueMetadata, REAL_MODELS, RECENT_TEMPLATE_CODES } from './real-model-catalogue.js';

export { providerCode } from './provider-management.js';
export const callModelId = (provider, model) => `${providerCode(provider)}/${modelCode(model)}`;
export const listed = model => model.listingStatus === '已上架';
export const SERVICE_MODES = {
  standard: { label: '统一服务', description: '对外使用统一的模型 ID 和售价，用户无需关心后端由哪家供应商、哪个渠道提供服务。' },
  provider: { label: '分供应商', description: '同一模型按供应商分别提供服务，每家供应商有独立的调用 ID 和售价，用户可按需选择。' },
};
export const supplySalesStatus = supply => supply.status !== '已启用' ? '停止服务' : supply.salesEnabled ? '上架售卖' : '下架停售';
export function supplyConnectivityTest(state, { modelId, supplyId, prompt, scenario }) {
  const supply = modelSupplies(state, modelId).find(item => item.id === supplyId);
  if (!supply?.endpoint || !supply.provider) throw new Error('供应商模型或接入地址不存在');
  const { endpoint, provider } = supply;
  if (!connectionCredentialsReady(endpoint, provider)) throw new Error('请先在供应商 API 密钥页签配置凭证');
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
function retailItems(rows) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 100) throw new Error('请配置 1–100 个计费项');
  const items=rows.map(item=>{
    if (!item || typeof item!=='object' || Array.isArray(item)) throw new Error('请填写有效的计费项');
    if (typeof item.name!=='string' || !item.name.trim() || item.name.length>100 || typeof item.unit!=='string' || !item.unit.trim() || item.unit.length>100 || !['CNY','USD'].includes(item.currency)) throw new Error('请填写有效的计费项、计价单位和货币');
    if (typeof item.condition!=='string' || item.condition.length>200) throw new Error('计费条件最多 200 字');
    return {name:item.name.trim(),unit:item.unit.trim(),condition:item.condition.trim(),currency:item.currency,amount:parseSaleAmount(item.amount,true)};
  });
  if (new Set(items.map(billingItemKey)).size!==items.length) throw new Error('计费项、条件与单位不能重复');
  return items;
}
// Compose existing domain operations against one working copy; persistence stays atomic.
export function operationsTransaction(state, action) {
  if (/^channel(Draft|Discovery|Metadata|TestEvidence|TemporaryTest)/.test(action.operation) || action.operation === 'supplierSelection') return channelOnboardingTransaction(state, action);
  if (/^channel(Candidate|Procurement)/.test(action.operation) || action.operation.startsWith('keyGroupCandidate') || action.operation === 'credentialEmergencyRevoke') return channelChangeTransaction(state, action);
  if (['serviceRouteDraft', 'serviceRoutePublish', 'serviceRouteRollback','serviceRouteStop'].includes(action.operation)) return routingTransaction(state, action);
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
  if (operation === 'channelQuickCreate') {
    assertOnboardingMetadata(data);
    const input = data.values;
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('请填写渠道连接及模型映射');
    const endpoint = input.endpointId && working.endpoints.find(row => row.id === input.endpointId && row.providerId === data.providerId && !row.deletedAt);
    if (input.endpointId && !endpoint) throw new Error('追加模型的渠道已变化或不属于当前供应商');
    if (endpoint && (data.newProvider || data.providerPresetId || data.newApiKey || Object.keys(input).some(key => !['endpointId', 'models'].includes(key)))) throw new Error('追加模型只能引用已有渠道，不能同时修改连接或密钥');
    const draft = data.draftId && working.modelOnboardings.find(row => row.id === data.draftId && row.kind === 'supplier-channel');
    if (data.draftId && (!draft || draft.status !== '配置中' || draft.draftRevision !== data.expectedDraftRevision || (draft.endpointId || '') !== (endpoint?.id || ''))) throw new Error('接入草稿已变化或渠道不匹配，请重新载入');
    let provider = resolveOnboardingProvider(working, data);
    if (provider.isDraft) {
      const code = data.newProvider ? 'custom-' + crypto.randomUUID().replaceAll('-', '').slice(0, 24) : provider.code;
      const created = providerOp('create', undefined, { name: provider.name, code, sourceType: provider.sourceType, catalogModelIds: [] });
      provider = working.providers.find(row => row.id === created.objectId);
    }
    if (data.providerPresetId && provider.onboardingPresetId !== data.providerPresetId) update('providers', provider.id, { onboardingPresetId: data.providerPresetId });
    const values = { ...input };
    if (data.newApiKey) {
      if (input.authMode === 'none') throw new Error('无需认证的渠道不能同时新增密钥');
      if (Object.keys(data.newApiKey).some(key => !['maskedKey', 'fingerprint', 'accountRpm'].includes(key))) throw new Error('新增密钥只接受掩码、指纹和账号上限');
      providerOp('addApiKeys', provider.id, { apiKeys: [data.newApiKey], groupId: input.keyGroupId || 'default' });
      const added = working.providers.find(row => row.id === provider.id).apiKeys.find(row => row.fingerprint === data.newApiKey.fingerprint);
      values.authMode = 'specific'; values.apiKeyId = added.id;
    }
    if (!Array.isArray(input.models) || !input.models.length || input.models.length > 50) throw new Error('每批请选择 1–50 个模型');
    values.models = input.models.map(row => {
      if (!row || typeof row !== 'object') throw new Error('请选择有效的模型资料');
      const resolved = resolveOnboardingModel(working, row);
      let record = resolved.record;
      if (resolved.isDraft) {
        const { id: presetId, ...metadata } = record;
        record = { ...metadata, id: 'template-onboarding-' + crypto.randomUUID(), ...(row.modelPresetId ? { onboardingPresetId: presetId } : {}), revision: 1, updatedAt: new Date().toISOString() };
        add('modelTemplates', record);
      }
      return { libraryId: record.id, upstreamModelId: row.upstreamModelId ?? (row.newModel ? record.modelId : ''), scenarios: row.scenarios || [] };
    });
    const created = providerOp(endpoint ? 'supplierModelsAdd' : 'supplierChannelCreate', provider.id, values), channel = endpoint || created.changes.find(change => change.type === 'add' && change.collection === 'endpoints')?.record;
    if (!channel) throw new Error('渠道创建结果缺失');
    objectId = channel.id; label = endpoint ? '追加模型接入' : '保存快捷模型接入';
    if (draft) update('modelOnboardings', draft.id, { status: '已完成', draftRevision: draft.draftRevision + 1, createdEndpointId: channel.id });
  } else if (operation==='prepareServiceReviewCases') {
    if (data.confirmed!==true) throw new Error('请确认配置这五个评审场景');
    const prepared=prepareServiceReviewCases(working);
    for (const collection of ['models','providers','endpoints','modelSupplies','modelSalePrices','supplyPrices','serviceRoutes','modelVersions']) for (const record of prepared[collection]) {
      const current=working[collection].find(item=>item.id===record.id);
      if (!current) add(collection,record);
      else if (JSON.stringify(current)!==JSON.stringify(record)) update(collection,record.id,record);
    }
    objectId='service-review-cases';label='配置服务管理评审场景';
  } else if (['saveSupplierBatch', 'prepareSupplierBatch', 'publishSupplierBatch'].includes(operation)) {
    const provider = working.providers.find(item => item.id === data.providerId);
    if (!provider) throw new Error('供应商不存在');
    if (!Array.isArray(data.items) || !data.items.length || data.items.length > 100) throw new Error('每批请选择 1–100 个目录模型');
    if (new Set(data.items.map(item => item.catalogueModelId)).size !== data.items.length) throw new Error('同一批次不能重复选择目录模型');
    for (const entry of data.items) {
      if (!providerCatalogueIds(provider).includes(entry.catalogueModelId)) throw new Error('目录模型不属于当前供应商，请重新选择');
      const draft = working.modelOnboardings.find(item => item.providerId === provider.id && item.catalogueModelId === entry.catalogueModelId && item.status !== '已完成');
      if (entry.draftId ? draft?.id !== entry.draftId : draft) throw new Error(`${entry.catalogueModelId} 的配置进度已变化，请重新载入`);
      if (operation === 'publishSupplierBatch') {
        if (!draft || entry.draftRevision !== draft.updatedAt) throw new Error('配置进度已变化，请重新检查');
        if (draft.listingScope) modelOp('scope', draft.modelId, draft.listingScope);
        modelOp('enableSupply', draft.modelId, { id: draft.supplyId });
        apply(operationsTransaction(working, { operation: 'completeOnboarding', data: { draftId: draft.id, publish: true } }));
        continue;
      }
      const master = libraryRecord(working, entry.libraryId);
      if (operation === 'prepareSupplierBatch' && (!master || master.updatedAt !== entry.libraryRevision)) throw new Error('模型资料未选择或已有修订，请重新核对主档');
      const target=master && working.models.find(item=>item.id===master.id || item.templateId===master.id);
      const saved = apply(operationsTransaction(working, { operation: 'saveOnboarding', data: {
        ...entry, id: draft?.id, providerId: provider.id,
        libraryId:master?.id || entry.libraryId,targetModelId:target?.id || '',targetRevision:target?.updatedAt || '',
      } }));
      if (operation === 'saveSupplierBatch') continue;
      const onboarded = apply(operationsTransaction(working, { operation: 'onboardModel', data: { draftId: saved.objectId } }));
      const current = working.modelOnboardings.find(item => item.id === saved.objectId);
      modelTransaction(working, { operation: 'pricePublish', modelId: onboarded.objectId, data: { supplyId: current.supplyId, items: entry.prices, sourceVersion: entry.sourceVersion, expectedSaleVersion: entry.expectedSaleVersion } });
      if (entry.listingScope) modelTransaction(working, { operation: 'scope', modelId: onboarded.objectId, data: entry.listingScope });
      // Preparing verifies the mapping; service and sales are enabled only on final confirmation.
      modelOp('verify', onboarded.objectId, { id: current.supplyId, result: '通过' });
      update('modelOnboardings', current.id, { step: 'review', targetModelId: onboarded.objectId, libraryRevision: '', expectedSaleVersion: latestSaleRevision(working, current.supplyId) });
    }
    objectId = provider.id;
    label = `${{ saveSupplierBatch: '保存批量配置进度', prepareSupplierBatch: '保存配置并检查', publishSupplierBatch: '批量上架供应商模型' }[operation]} ${data.items.length} 个`;
  } else if (operation === 'templateDelete') {
    const issue = libraryRemovalIssue(working, data.id);
    if (issue) throw new Error(issue);
    if (data.confirmed !== true) throw new Error('请确认删除未被引用的模型资料');
    apply({ changes: [{ type: 'remove', collection: 'modelTemplates', id: data.id }] });
    objectId = data.id; label = '删除模型资料';
  } else if (['templateSave', 'templateImport'].includes(operation)) {
    const onboarding = data.onboardingId && working.modelOnboardings.find(item => item.id === data.onboardingId && item.status !== '已完成');
    if (data.onboardingId && !onboarding) throw new Error('上架进度不存在或已完成，请重新进入资料库维护');
    const entries = operation === 'templateImport' ? data.models : [data];
    if (!Array.isArray(entries) || entries.length < 1 || entries.length > 500) throw new Error('每批需录入 1–500 个模型资料');
    for (const entry of entries) {
      const current = operation === 'templateSave' && data.id ? libraryRecord(working, data.id) : null;
      if (operation === 'templateSave' && data.id && !current) throw new Error('模型资料不存在');
      if (modelLibrary(working).some(record => record.id !== current?.id && record.modelId.toLowerCase() === entry.modelId?.trim().toLowerCase())) throw new Error('相同模型编码的资料已存在，请维护已有资料');
      if (current && working.models.some(item => item.id === current.id)) {
        const transaction = modelTransaction(working, { operation: 'basic', modelId: current.id, data: entry });
        const affected = transaction.changes.filter(change => change.collection === 'modelSupplies');
        if (affected.length && !data.confirmCapabilities) throw new Error(`请确认能力变更：${affected.length} 条供应商供给将暂停服务并重新验证；价格与订购范围保留。`);
        apply(transaction); objectId = current.id; continue;
      }
      const validated = modelTransaction({ ...working, models: [] }, { operation: 'create', data: { ...entry, modelId: current?.modelId || entry.modelId } }).changes[0].record;
      const fields = { ...metadata(validated), revision: (current?.revision || 0) + 1, updatedAt: new Date().toISOString() };
      objectId = current?.id || `template-${crypto.randomUUID()}`;
      if (current) update('modelTemplates', current.id, fields); else add('modelTemplates', { id: objectId, ...fields });
      if(current){
        const transactions=working.models.filter(row=>row.templateId===current.id).map(row=>modelTransaction(working,{operation:'basic',modelId:row.id,data:{...fields,profile:{...row.profile,...fields.profile}}}));
        const affected=transactions.flatMap(transaction=>transaction.changes).filter(change=>change.collection==='modelSupplies');
        if(affected.length && !data.confirmCapabilities)throw new Error(`请确认能力变更：${affected.length} 条供应商供给将暂停服务并重新验证；价格与订购范围保留。`);
        for(const transaction of transactions)apply(transaction);
      }
    }
    if (onboarding) {
      const unchanged = libraryRecord(working, onboarding.libraryId)?.id === objectId;
      update('modelOnboardings', onboarding.id, { libraryId: objectId, ...(!unchanged ? { modelId: null, supplyId: null, targetModelId: '', confirmedIdentity: false, prices: [], sourceVersion: '', expectedSaleVersion: '', salesVersion: null } : {}) });
    }
    label = operation === 'templateImport' ? `导入 ${entries.length} 个模型资料` : '保存模型资料';
  } else if (operation === 'saveOnboarding') {
    const current = working.modelOnboardings.find(item => item.id === data.id);
    if (current?.status === '已完成') throw new Error('此配置已完成，请进入服务管理');
    const provider = working.providers.find(item => item.id === data.providerId);
    if (!provider || !providerCatalogueIds(provider).includes(data.catalogueModelId)) throw new Error('请选择有效的供应商目录模型');
    if (data.libraryId && !libraryRecord(working, data.libraryId)) throw new Error('模型资料不存在，请重新选择资料库记录');
    if (data.endpointId && !working.endpoints.some(item => item.id === data.endpointId && item.providerId === provider.id)) throw new Error('连接不属于当前供应商');
    const fields = { providerId: provider.id, catalogueModelId: data.catalogueModelId, endpointId: data.endpointId || '', targetModelId: data.targetModelId || '', targetRevision: data.targetRevision || '', expectedSaleVersion: data.expectedSaleVersion || '', confirmedIdentity: data.confirmedIdentity === true, model: data.model || null, prices: data.prices || [], sourceVersion: data.sourceVersion || '', ...(Array.isArray(data.selected) ? { selected: [...new Set(data.selected)] } : {}), step: ['select', 'metadata', 'price', 'review'].includes(data.step) ? data.step : 'select', status: '配置中' };
    fields.libraryId = libraryRecord(working,data.libraryId)?.id || '';
    fields.libraryRevision = data.libraryRevision ?? current?.libraryRevision ?? '';
    fields.listingScope = data.listingScope === undefined ? current?.listingScope ?? null : data.listingScope;
    if (current && (current.providerId !== fields.providerId || current.catalogueModelId !== fields.catalogueModelId || current.targetModelId !== fields.targetModelId || libraryRecord(working, current.libraryId)?.id !== libraryRecord(working, fields.libraryId)?.id)) Object.assign(fields, { modelId: null, supplyId: null, prices: [], sourceVersion: '', expectedSaleVersion: '' });
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
    if (!endpoint?.baseUrl || !connectionCredentialsReady(endpoint, provider)) throw new Error('连接或 API 密钥配置缺失，请补齐供应商连接设置；当前进度已保存');
    const matched = catalogueModelMatch(working, provider.id, draft.catalogueModelId);
    const master = libraryRecord(working, draft.libraryId) || matched.model || matched.template;
    const target = (draft.targetModelId && working.models.find(item => item.id === draft.targetModelId)) || (master && working.models.find(item => item.id === master.id || item.templateId === master.id));
    if (draft.targetModelId && !working.models.some(item => item.id === draft.targetModelId)) throw new Error('所选平台模型已不存在');
    if (master && target && master.id !== libraryRecord(working,target.id)?.id) throw new Error('模型资料与所选平台模型不一致，请重新核对');
    if (matched.model && target && matched.model.id !== target.id) throw new Error('此目录模型已有明确对应关系，请进入已有模型');
    if (target && !matched.model && !draft.confirmedIdentity) throw new Error('请确认模型身份和版本一致，不能仅凭名称相似合并');
    if (master && !matched.model && modelCode(master) !== draft.catalogueModelId && !draft.confirmedIdentity) throw new Error('请确认模型身份和版本一致，不能仅凭名称相似合并');
    if (!master && !target) throw new Error('请先在模型资料库登记并选择模型资料');
    let model = matched.model || target;
    if (model) {
      if (draft.targetRevision !== model.updatedAt) throw new Error('模型资料已有并发修订，请重新核对最新资料；当前输入保留');
      if (data.model && JSON.stringify(metadata(model)) !== JSON.stringify(metadata(data.model))) throw new Error('模型资料请在模型资料库维护，上架流程只引用资料');
    } else {
      if (data.model && JSON.stringify(metadata(master)) !== JSON.stringify(metadata(data.model))) throw new Error('模型资料已变化，请重新核对资料库中的当前资料');
      const result = modelOp('create', null, metadata(master));
      model = working.models.find(item => item.id === result.objectId);
      update('models', model.id, { templateId: master.id });
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
    objectId = model.id; label = '引用模型资料并接入目录模型';
  } else if (operation === 'verifySupply') {
    const supply = working.modelSupplies.find(item => item.id === data.id && item.modelId === modelId);
    if (!supply) throw new Error('供应商接入不存在');
    const endpoint = working.endpoints.find(item => item.id === supply.endpointId);
    if (!endpoint?.baseUrl || !connectionCredentialsReady(endpoint, working.providers.find(item => item.id === endpoint.providerId))) throw new Error('连接地址或 API 密钥配置缺失，请补齐供应商连接设置');
    providerOp('testConnection', endpoint.id, { scenario: data.scenario || '成功' });
    if (connectionTestPassed(working.endpoints.find(item => item.id === endpoint.id))) {
      providerOp('enableConnection', endpoint.id, {});
      modelOp('verify', modelId, { id: supply.id, result: data.modelResult || '通过' });
      if (data.modelResult !== '失败') modelOp('enableSupply', modelId, { id: supply.id });
    }
    label = '验证供应商接入';
  } else if (['publishSupply', 'unlistSupply', 'stopSupply', 'startSupply'].includes(operation)) {
    const model = working.models.find(item => item.id === modelId);
    const supply = modelSupplies(working, modelId).find(item => item.id === data.id);
    if (!model || !supply) throw new Error('供应商模型不存在');
    if (operation === 'publishSupply') {
      if (model.serviceMode === 'standard') throw new Error('统一服务模式请通过模型统一上架，不能独立售卖渠道');
      if (model.serviceMode === 'provider') throw new Error('分供应商模式请通过模型统一上架，不能独立售卖渠道');
      if (!supplyPriceReady(working, model, supply.id)) throw new Error('请先配置完整的采购价与对外售价');
      modelOp('enableSupply', modelId, { id: supply.id });
      update('modelSupplies', supply.id, { salesEnabled: true });
      modelOp('publish', modelId, {});
    } else if (operation === 'startSupply') {
      modelOp('enableSupply', modelId, { id: supply.id });
      update('models', modelId, { callsEnabled: true, status: '运行中' });
    } else {
      update('modelSupplies', supply.id, { salesEnabled: false });
      if (operation === 'stopSupply') modelOp('disableSupply', modelId, { id: supply.id });
      if (!modelSupplies(working, modelId).some(item => item.salesEnabled)) update('models', modelId, { listingStatus: '已下架', visibility: '内部' });
      if (operation === 'stopSupply' && !availableSupplies(working, modelId).length) update('models', modelId, { callsEnabled: false, status: '停用' });
    }
    label = { publishSupply: '上架销售供应商模型', unlistSupply: '下架停售供应商模型', stopSupply: '停止供应商模型服务', startSupply: '启动供应商模型服务' }[operation];
  } else if (operation === 'createServiceModel') {
    const created=modelOp('createServiceModel',null,data);
    objectId=created.objectId;
    label='添加模型';
  } else if (operation === 'serviceBasics') {
    modelOp('serviceBasics',modelId,data); objectId=modelId; label='修改模型资料';
  } else if (operation === 'unifiedPrice') {
    const model = working.models.find(item => item.id === modelId);
    if (!model || model.serviceMode !== 'standard') throw new Error('仅统一服务模式可配置统一售价');
    if (data.expectedUpdatedAt !== model.updatedAt || data.expectedSaleVersion !== modelSaleRevision(working, modelId)) throw new Error('模型或统一售价已有并发修订，请重新打开配置');
    const items = retailItems(data.items);
    const version = Math.max(0,...working.modelSalePrices.filter(price => price.modelId === modelId && price.scope === 'model').map(price => price.version)) + 1;
    add('modelSalePrices', { id:`model-sale-${crypto.randomUUID()}`, modelId, scope:'model', serviceModeRevision:model.serviceModeRevision || 0, items, version, effectiveAt:new Date().toISOString(), status:'已发布' });
    objectId=modelId; label='配置统一售价';
  } else if (['associateServiceProvider','configureServiceProvider','removeServiceProvider'].includes(operation)) {
    const model=working.models.find(item=>item.id===modelId), provider=working.providers.find(item=>item.id===data.providerId);
    if (!model || model.serviceMode!=='provider' || !provider) throw new Error('请在分供应商模式选择已有供应商');
    if (data.expectedUpdatedAt!==model.updatedAt) throw new Error('模型服务已有并发修订，请重新打开配置');
    const entries=model.serviceProviders || [], current=entries.find(item=>item.providerId===provider.id), serviceId=providerServiceId(modelId,provider.id);
    let entry;
    if (operation==='associateServiceProvider') {
      if (provider.status!=='已启用') throw new Error('供应商已停用');
      if (current && current.status!=='已移除') throw new Error('供应商已关联');
      entry={providerId:provider.id,code:providerCode(provider),callId:'',status:'已关联'};
      label='关联已有供应商';
    } else {
      if (!current || current.status==='已移除') throw new Error('供应商关联不存在');
      if (operation==='removeServiceProvider') {
        if (listed(model)) throw new Error('请先下架模型再移除 Provider');
        const supplies=modelSupplies(working,modelId).filter(item=>item.provider?.id===provider.id);
        if (serviceBindingInUse(working,modelId,supplies,serviceId)) throw new Error('Provider 被生效路由或草稿引用，请先在渠道与路由移除引用');
        for (const supply of supplies) update('modelSupplies',supply.id,{status:'已移除',salesEnabled:false});
        entry={...current,status:'已移除'};label='解除供应商关联';
      } else {
        if (provider.status!=='已启用') throw new Error('供应商已停用');
        const callId=typeof data.callId==='string'?data.callId.trim():'';
        if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(callId)) throw new Error('对外调用 ID 必填，最多200字，仅支持英文、数字及 . _ / -');
        if (working.models.some(item=>item.id===callId || modelCode(item)===callId || providerServices(item).some(service=>!(item.id===modelId && service.providerId===provider.id) && service.callId===callId))) throw new Error('对外调用 ID 已存在');
        if (listed(model) && current.callId && current.callId!==callId) throw new Error('请先下架模型再修改对外调用 ID');
        if (data.expectedSaleVersion!==providerPriceRevision(working,modelId,provider.id)) throw new Error('供应商平台售价已有并发修订，请重新核对');
        const items=retailItems(data.items), version=Math.max(0,...working.modelSalePrices.filter(price=>price.modelId===modelId && price.scope==='provider' && price.providerId===provider.id).map(price=>price.version))+1;
        add('modelSalePrices',{id:`provider-sale-${crypto.randomUUID()}`,modelId,providerId:provider.id,serviceId,scope:'provider',serviceModeRevision:model.serviceModeRevision || 0,items,version,effectiveAt:new Date().toISOString(),status:'已发布'});
        entry={...current,callId};label='配置 Provider 对外服务';
      }
    }
    update('models',modelId,{serviceProviders:[...entries.filter(item=>item.providerId!==provider.id),{...entry,updatedAt:new Date().toISOString()}]});
    objectId=modelId;
  } else if (operation==='removeServiceChannel') {
    const model=working.models.find(item=>item.id===modelId), supply=modelSupplies(working,modelId).find(item=>item.id===data.supplyId);
    if (!model || !supply) throw new Error('模型或渠道关联不存在');
    if (!['standard','provider'].includes(model.serviceMode)) throw new Error('请先配置服务模式');
    if (data.expectedUpdatedAt!==model.updatedAt) throw new Error('模型服务已有并发修订，请重新核对');
    if (serviceBindingInUse(working,modelId,[supply])) throw new Error('渠道被生效路由或草稿引用，请先在渠道与路由移除引用');
    update('modelSupplies',supply.id,{status:'已移除',salesEnabled:false});objectId=modelId;label='解除渠道关联';
  } else if (operation === 'associateServiceChannelsBatch') {
    const model=working.models.find(item=>item.id===modelId);
    if (!model || model.serviceMode!=='standard') throw new Error('请在统一服务模式关联渠道');
    if (data.expectedUpdatedAt!==model.updatedAt) throw new Error('模型已有并发修订，请重新打开关联');
    if (!Array.isArray(data.groups) || !data.groups.length || data.groups.some(group=>!group || !Array.isArray(group.channelIds) || !group.channelIds.length) || data.groups.reduce((count,group)=>count+group.channelIds.length,0)>20) throw new Error('请选择 1–20 个渠道');
    for (const group of data.groups) apply(operationsTransaction(working,{operation:'associateServiceChannels',modelId,data:{providerId:group.providerId,catalogueModelId:group.catalogueModelId,channelIds:group.channelIds,confirmedIdentity:data.confirmedIdentity,expectedUpdatedAt:working.models.find(item=>item.id===modelId).updatedAt}}));
    objectId=modelId;label='关联渠道';
  } else if (operation === 'associateServiceChannels') {
    const model = working.models.find(item => item.id === modelId), provider=working.providers.find(item => item.id===data.providerId);
    if (!model || !['standard','provider'].includes(model.serviceMode)) throw new Error('请先配置服务模式');
    if (model.serviceMode==='provider' && !providerServices(model).some(item=>item.providerId===data.providerId)) throw new Error('请先关联该 Provider，再配置其渠道');
    if (data.expectedUpdatedAt !== model.updatedAt) throw new Error('模型已有并发修订，请重新打开关联');
    if (!data.confirmedIdentity) throw new Error('请核对上游模型与当前模型的身份及能力');
    if (!Array.isArray(data.channelIds) || !data.channelIds.length || data.channelIds.length > 20 || new Set(data.channelIds).size !== data.channelIds.length) throw new Error('请选择 1–20 个不重复的渠道');
    const candidates=availableServiceChannels(working,provider,data.catalogueModelId);
    for (const id of data.channelIds) {
      const channel=candidates.find(item=>item.id===id);
      if (!channel || channel.reason) throw new Error(channel?.reason || '所选渠道已不存在或不属于供应商模型');
      if (modelSupplies(working,modelId).some(item=>item.endpointId===channel.endpointId)) throw new Error('该渠道已关联当前模型');
      const result=modelOp('supply',modelId,{endpointId:channel.endpointId,upstreamModelId:channel.upstreamModelId,capabilities:model.capabilities});
      const supply=result.changes.find(item=>item.collection==='modelSupplies').record;
      update('modelSupplies',supply.id,{catalogueModelId:data.catalogueModelId,channelId:channel.id,salesEnabled:false});
      apply(operationsTransaction(working,{operation:'verifySupply',modelId,data:{id:supply.id}}));
    }
    objectId=modelId; label='关联渠道';
  } else if (operation === 'serviceMode') {
    const model = working.models.find(item => item.id === modelId);
    if (!model) throw new Error('模型不存在');
    if (!['已上架','已下架'].includes(model.listingStatus)) throw new Error('模型上架状态无效，请重新载入数据');
    if (data.expectedUpdatedAt !== model.updatedAt) throw new Error('模型已有并发修订，请重新打开配置后核对');
    if (typeof data.serviceMode !== 'string' || !Object.hasOwn(SERVICE_MODES, data.serviceMode)) throw new Error('请选择一种有效的服务方式');
    if (data.serviceMode===model.serviceMode) throw new Error('请选择不同的服务模式');
    const reset=Boolean(model.serviceMode);
    if ((reset || model.listingStatus==='已上架') && data.confirmedReset!==true) throw new Error('请确认模型下架、清空服务关联及路由，并重新配置售价');
    if (reset || model.listingStatus==='已上架') modelOp('unlist',modelId,{});
    if (reset) {
      for (const supply of working.modelSupplies.filter(item=>item.modelId===modelId && item.status!=='已移除')) update('modelSupplies',supply.id,{status:'已移除',salesEnabled:false});
      for (const route of (working.serviceRoutes || []).filter(item=>item.serviceId===`standard:${modelId}` || item.serviceId.startsWith(`provider:${modelId}:`))) update('serviceRoutes',route.id,{activeVersion:0,draft:null,draftUpdatedAt:null});
    }
    update('models', modelId, { serviceMode: data.serviceMode, ...(reset?{serviceModeRevision:(model.serviceModeRevision || 0)+1,serviceProviders:(model.serviceProviders || []).map(entry=>({...entry,status:'已移除'}))}:{}) });
    objectId = modelId; label = '修改模型服务模式';
  } else if (operation === 'display') {
    const model = working.models.find(item => item.id === modelId);
    if (!model) throw new Error('模型不存在');
    if (data.expectedUpdatedAt !== model.updatedAt) throw new Error('模型展示信息已有并发修订，请重新打开配置后核对');
    if (typeof data.name !== 'string' || !data.name.trim() || typeof data.description !== 'string' || !data.description.trim()) throw new Error('模型展示名称和介绍必填');
    if (!['公开', '内部'].includes(data.visibility)) throw new Error('请选择有效的展示状态');
    update('models', modelId, { name: data.name.trim(), description: data.description.trim(), visibility: data.visibility });
    objectId = modelId; label = '配置模型展示信息';
  } else if (operation === 'reprice') {
    if (working.models.find(item=>item.id===modelId)?.serviceMode === 'standard') throw new Error('统一服务模式请配置模型统一售价');
    if (data.selected || data.openScope || data.publish || data.salesEnabled != null) throw new Error('调价只允许修改售价');
    if (!Array.isArray(data.items)) throw new Error('请按完整计费项设置售价');
    modelOp('pricePublish', modelId, data);
    label = '修改平台售价';
  } else if (operation === 'completeOnboarding') {
    const draft = working.modelOnboardings.find(item => item.id === data.draftId && item.status !== '已完成');
    if (!draft) throw new Error('配置进度不存在或已完成');
    const supply = working.modelSupplies.find(item => item.id === draft.supplyId && item.modelId === draft.modelId && item.status !== '已移除');
    if (!supply) throw new Error('供给已变化，请返回供应商选择步骤');
    const endpoint = working.endpoints.find(item => item.id === supply.endpointId);
    if (connectionTestPending(endpoint) || !connectionTestPassed(endpoint) || !availableSupplies(working, draft.modelId, working.models.find(item => item.id === draft.modelId).capabilities).some(item => item.id === supply.id)) throw new Error('当前销售供给尚未通过验证，请检查连接与模型');
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
        if (data.provider.sourceType !== 'selfHosted' && !connection.credentialRef && !connection.apiKeys?.length) throw new Error('第三方推理服务每个连接至少配置一个 API 密钥');
        providerOp('connection', null, { ...connection, name: `连接 ${index + 1}`, providerId: objectId });
      });
      const endpoints = working.endpoints.filter(row => row.providerId === objectId);
      const keys = [...new Map(endpoints.flatMap(row => row.apiKeys || []).map(key => [key.fingerprint, key])).values()];
      update('providers', objectId, { apiKeys: keys, defaultApiKeyId: keys[0]?.id || '' });
      for (const endpoint of endpoints) {
        const canonical = (endpoint.apiKeys || []).map(key => keys.find(row => row.fingerprint === key.fingerprint));
        update('endpoints', endpoint.id, { supplierChannel: true, apiKeys: canonical, ...(canonical.length === 1 ? { authMode: canonical[0].id === keys[0].id ? 'inherit' : 'specific', apiKeyId: canonical[0].id === keys[0].id ? '' : canonical[0].id } : {}) });
      }
    }
    label = data.providerId ? '更新供应商资料' : '新增供应商';
  } else if (operation === 'checkConnection') {
    providerOp('testConnection', data.endpointId, { scenario: data.scenario || '成功' });
    if (connectionTestPassed(working.endpoints.find(item => item.id === data.endpointId))) providerOp('enableConnection', data.endpointId, {});
    objectId = working.endpoints.find(item => item.id === data.endpointId).providerId; label = '检查接入连接';
  } else if (operation === 'tariffDictionary') {
    const result = apply(tariffDictionaryTransaction(working, data));
    objectId = result.objectId; label = result.label;
  } else if (operation === 'providerChannelBatch') {
    if (!Array.isArray(data.channels) || !data.channels.length || data.channels.length > 20) throw new Error('每批请添加 1–20 个渠道');
    for (const [index, channel] of data.channels.entries()) {
      try {
        if (!channel || typeof channel !== 'object' || channel.channelId) throw new Error('批量添加仅支持新渠道');
        providerOp('channelSave', data.providerId, { ...channel, modelId: data.modelId });
      } catch (error) { throw new Error(`第 ${index + 1} 行：${error.message}`); }
    }
    objectId = data.providerId; label = `批量添加 ${data.channels.length} 个供应渠道`;
  } else if (operation === 'provider') {
    const result = providerOp(data.operation, data.objectId, data.values);
    objectId = result.objectId; label = result.label;
  } else throw new Error('未知模型运营操作');
  return { type: 'batch', label, objectId, changes };
}
