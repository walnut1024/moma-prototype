import { salesChecks } from './service-sales.js';
import { serviceScope } from './service-commercial.js';
import { publicationChecks } from './model-management.js';
import { SERVICE_PURPOSES, servicePurpose } from './service-purpose.js';
import { serviceArchiveIssues, checkedServiceCallId } from './service-maintenance.js';
import { retailItems } from './service-commercial.js';
import { channelHealthTransaction } from './channel-health.js';
import { resolveOnboardingProvider, resolveOnboardingModel, assertOnboardingMetadata } from './onboarding-presets.js';
import { libraryRecord, modelLibrary, libraryRemovalIssue } from './model-library.js';
export { libraryRecord, modelLibrary } from './model-library.js';
import { routingTransaction, routingServices, routingChannels, routeSourceVersion } from './service-routing.js';
import { prepareServiceShowcase, SERVICE_SHOWCASE_ID } from './service-showcase.js';
import { prepareServiceReviewCases } from './service-review-cases.js';
import { commercialTaskKey, commercialTaskBase, modelSaleRevision, availableServiceChannels, providerServices, providerServiceId, providerPriceRevision, serviceBindingInUse, activeModelSalePrice, activeProviderPrice } from './service-workspace.js';
import { modelTransaction, modelCode, modelSupplies, availableSupplies, supplyPriceReady, supplyModelUrl, latestSaleRevision, activeSupplyPrice } from './model-management.js';
import { modelProfileDraft, requireModelBasics } from './model-profile.js';
import { MODEL_OPERATION_NAMES } from './model-operation-history.js';
import { tariffDictionaryTransaction } from './tariff-dictionary.js';
import { channelChangeTransaction, channelChangeImpact } from './channel-change-management.js';
import { channelOnboardingTransaction } from './channel-onboarding.js';
import { providerTransaction, providerCode, modelConnectivityPreview, PROTOCOLS, checkedConnectionKeys } from './provider-management.js';
import { builtinModelCatalogueChanges, cleanModelCatalogueTransaction } from '../mock/builtin-model-catalogue.js';
import { archiveAcceptanceFixture } from './acceptance-cleanup.js';
import { supplierModelRegistration } from './supplier-model-registration.js';
import { supplyModelRecord } from './supply-models.js';
import { providerKeyGroupKeys } from './provider-key-groups.js';
import { connectionTestPassed, connectionTestPending, connectionCredentialsReady, connectionKeys } from './connection-state.js';
import { providerCatalogueIds } from './moma-provider.js';
import { catalogueMetadata, REAL_MODELS, RECENT_TEMPLATE_CODES } from './real-model-catalogue.js';
import { guidedOnboarding } from './guided-onboarding.js';
import { channelFingerprint, channelInterfaceIssue } from './provider-channels.js';
import { supplierChannelAssociations } from './supplier-resources.js';
import { platformPriceVersions } from './platform-service-client.js';
import { modelOperationsExamplesTransaction } from './model-operations-examples.js';
import { CHANNEL_INTERFACES } from './channel-interface.js';
import { serviceMappingTransaction, mappingSourceVersion } from './service-model-mappings.js';

export { providerCode } from './provider-management.js';
export const callModelId = (provider, model) => `${providerCode(provider)}/${modelCode(model)}`;
export const listed = model => model.listingStatus === '已上架';
export const SERVICE_MODES = {
  standard: { label: '统一服务', description: '用户只选模型，用统一 ID 和价格调用；平台负责在不同服务商的渠道间调度。' },
  provider: { label: '分服务商', description: '用户先选服务商，按该服务商的 ID 和价格调用；平台仅在该服务商的渠道内调度。' },
};
export const supplySalesStatus = supply => supply.status !== '已启用' ? '停止服务' : supply.salesEnabled ? '上架售卖' : '下架停售';
export function supplyConnectivityTest(state, { modelId, supplyId, prompt, scenario }) {
  const supply = modelSupplies(state, modelId).find(item => item.id === supplyId);
  if (!supply?.endpoint || !supply.provider) throw new Error('服务商模型或接入地址不存在');
  const { endpoint, provider } = supply;
  if (!connectionCredentialsReady(endpoint, provider)) throw new Error('请先在服务商密钥页签配置凭证');
  let url;
  try { url = new URL(endpoint.baseUrl); } catch { throw new Error('服务商模型 URL 无效'); }
  if (!PROTOCOLS.includes(endpoint.protocol) || (url.protocol !== 'https:' && !(provider.sourceType === 'selfHosted' && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash) throw new Error('服务商模型 URL 或协议无效');
  if (!supply.upstreamModelId?.trim()) throw new Error('服务商模型 ID 未配置');
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 2000) throw new Error('请填写测试内容，最多 2000 字');
  const requestUrl = supplyModelUrl(supply, state.models.find(item => item.id === modelId));
  if (!requestUrl) throw new Error('请先在服务商目录配置完整模型 Endpoint');
  return modelConnectivityPreview({ modelId, upstreamId: supply.upstreamModelId, endpointId: endpoint.id, baseUrl: requestUrl, protocol: endpoint.protocol }, scenario);
}
export const metadata = model => ({ modelId: modelCode(model), name: model.name, maker: model.maker || '', type: model.type, description: model.description, usageUnit: model.usageUnit, profile: { ...modelProfileDraft(model), author: model.profile?.author || model.maker || '' }, capabilities: { ...model.capabilities } });
export const materialBase = (state, record) => JSON.stringify([metadata(record), state.models.filter(row => libraryRecord(state, row.id)?.id === record.id).map(row => [row.id, row.listingStatus, row.serviceModeRevision || 0]).sort(([a],[b])=>a.localeCompare(b))]);
function validatedMaterial(state, record, value) {
  if (!record) return modelTransaction({ ...state, models: [] }, { operation: 'create', data: value, catalogue:true }).changes[0].record;
  // Editing an existing card must not require filling hidden technical fields.
  const fields = modelTransaction({ ...state, models: [{ ...record, templateId: undefined }], modelSupplies: [] }, { operation: 'basic', modelId: record.id, data: value, catalogue:true }).changes.find(row => row.collection === 'models').changes;
  return { ...record, ...fields };
}
export function materialImpact(state, record, value) {
  const normalized = validatedMaterial(state, record, { ...value, modelId: record.modelId });
  const before = metadata(validatedMaterial(state,record,metadata(record))), after = metadata(normalized);
  const changed = before.type !== after.type || ['streaming', 'tools', 'context', 'output'].some(key => before.capabilities[key] !== after.capabilities[key]) || ['version', 'tasks', 'inputModalities', 'outputModalities', 'resultTypes', 'reasoning', 'structured', 'supportedParameters', 'parameterRules', 'maxInput'].some(key => JSON.stringify(before.profile[key] || []) !== JSON.stringify(after.profile[key] || []));
  return { changed, services: state.models.filter(row => libraryRecord(state, row.id)?.id === record.id) };
}
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
  if (!supplies.length) issue = { label: '接入服务商', step: 'supply' };
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
  const target=action.modelId || (action.data?.serviceId && state.models.find(row=>action.data.serviceId===`standard:${row.id}` || action.data.serviceId.startsWith(`provider:${row.id}:`))?.id);
  if(state.models.find(row=>row.id===target)?.archivedAt && !['serviceRestore','recordFailedOperation'].includes(action.operation) && !action.operation.startsWith('template'))throw Error('服务已归档，请先恢复服务');
  if (action.operation === 'archiveAcceptanceFixture') return archiveAcceptanceFixture(state, action.data);
  if (action.operation === 'cleanModelCatalogue') return cleanModelCatalogueTransaction(state);
  if (action.operation === 'installModelCatalogue') return builtinModelCatalogueChanges(state, action.data?.catalogueIds);
  if (action.operation === 'channelHealthTest') return channelHealthTransaction(state, action);
  if (/^channel(Draft|Discovery|Metadata|TestEvidence|TemporaryTest)/.test(action.operation) || action.operation === 'supplierSelection') return channelOnboardingTransaction(state, action);
  if (/^channel(Candidate|Procurement)/.test(action.operation) || action.operation.startsWith('keyGroupCandidate') || action.operation === 'keyGroupPriority' || action.operation === 'credentialEmergencyRevoke') return channelChangeTransaction(state, action);
  if (action.operation.startsWith('serviceMapping')) return serviceMappingTransaction(state,action);
  if (['serviceRouteDraft', 'serviceRoutePublish', 'serviceRouteRollback','serviceRouteStop','serviceRouteRestore'].includes(action.operation)) return routingTransaction(state, action);
  // Cloud commands keep simulation history and reference data read-only.
  const working = state.cloudOperations ? {...state,...Object.fromEntries(['models','modelTemplates','providers','endpoints','modelSupplies','modelSalePrices','supplyPrices','modelVersions','validations','modelOnboardings','serviceRoutes','tariffDictionary','modelData'].map(key=>[key,structuredClone(state[key])]))} : structuredClone(state), changes = [];
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
  if (operation.startsWith('guided')) assertOnboardingMetadata(data);
  let objectId = modelId, label;
  if (['startSales','salesSettings'].includes(operation)) {
    const model=working.models.find(row=>row.id===modelId);
    if (!model || data.expectedUpdatedAt!==model.updatedAt || data.confirmed!==true) throw Error('销售配置已变化，请核对并明确确认');
    if (operation==='salesSettings') {
      if(typeof data.visible!=='boolean')throw Error('请选择有效销售展示状态');
      update('models',modelId,{salesScope:serviceScope(working,data.scope),marketVisible:data.visible===true});label='保存销售设置';
    } else {
      const failed=salesChecks(working,model).filter(row=>!row.passed);
      if(failed.length)throw Error(failed.map(row=>row.label).join('；'));
      const releaseStage=data.releaseStage || 'formal';
      if(!['gray','formal'].includes(releaseStage))throw Error('请选择灰度上架或正式上架');
      const releaseTenantIds=releaseStage==='gray'?serviceScope(working,{openScope:'selected',tenantIds:data.releaseTenantIds}).tenantIds:[];
      if(releaseTenantIds.some(id=>model.openScope!=='all' && !model.tenantIds?.includes(id)))throw Error('灰度客户须在当前调用授权范围内');
      update('models',modelId,{listingStatus:'已上架',visibility:'公开',releaseStage,releaseTenantIds,firstPublishedAt:model.firstPublishedAt || new Date().toISOString()});label=releaseStage==='gray'?'灰度上架':'正式上架';
    }
  } else if (['enableService','disableService','stopSales'].includes(operation)) {
    modelOp(operation,modelId,data);label={enableService:'启用技术服务',disableService:'停用技术服务',stopSales:'停止销售'}[operation];
  } else if (operation === 'servicePurpose') {
    const model=working.models.find(row=>row.id===modelId);
    if (!model || data.expectedUpdatedAt!==model.updatedAt || !Object.hasOwn(SERVICE_PURPOSES,data.purpose) || data.confirmed!==true) throw Error('请核对当前服务用途并明确确认');
    if (model.callsEnabled || model.listingStatus==='已上架') throw Error('请先停用服务并停止销售，再修改用途');
    const entry=data.providerId?model.serviceProviders?.find(row=>row.providerId===data.providerId && row.status!=='已移除'):null;
    if (model.serviceMode==='provider' && !entry || model.serviceMode==='standard' && data.providerId) throw Error('请选择当前服务');
    if (servicePurpose(model,data.providerId)!==data.purpose && (working.orders || []).some(order=>!['已取消','已关闭','已过期'].includes(order.status) && (order.serviceId===(entry?'provider:'+model.id+':'+entry.providerId:'standard:'+model.id) || working.products?.find(row=>row.id===order.productId)?.modelIds?.includes(model.id)))) throw Error('服务仍有商业依赖，不能变更用途');
    if (data.purpose==='internal' && servicePurpose(model,data.providerId)!=='internal' && working.cloudOperations && (model.firstPublishedAt || !model.purpose && !entry?.purpose)) throw Error('已经营服务的客户权益尚无法完整核对，暂不能转为内部服务');
    update('models',modelId,entry?{serviceProviders:model.serviceProviders.map(row=>row===entry?{...row,purpose:data.purpose}:row)}:{purpose:data.purpose});label='变更服务用途';
  } else if (operation === 'recordFailedOperation') {
    const target = working.models.find(row => row.id === modelId) || working.modelTemplates.find(row => row.id === modelId);
    if (!target || typeof data.reason !== 'string' || !data.reason.trim() || data.reason.length > 500) throw new Error('操作失败记录无效');
    return { type: 'batch', label: Object.hasOwn(MODEL_OPERATION_NAMES, data.operation) ? MODEL_OPERATION_NAMES[data.operation] : '模型配置操作', objectId: modelId, auditFailure: data.reason.trim(), changes: [] };
  } else if (operation === 'serviceRouteConfigure') {
    const service=routingServices(working).find(row=>row.id===data.serviceId && row.modelId===modelId);
    if(!service || data.sourceVersion!==routeSourceVersion(working,service) || data.mappingSource!==mappingSourceVersion(working,service))throw Error('模型或供给已变化，请载入最新配置后核对');
    if(data.confirmed!==true)throw Error('请核对模型映射和路由后确认保存');
    if(!Array.isArray(data.config?.channels) || data.config.channels.length>20 || !Array.isArray(data.sources) || data.sources.length>20 || !Array.isArray(data.removeIds) || data.removeIds.length>20)throw Error('路由渠道配置无效');
    const config=structuredClone(data.config), keys=new Set();
    const mapping=(op,supply,extra={})=>apply(serviceMappingTransaction(working,{operation:op,modelId,data:{serviceId:service.id,id:supply?.id,expectedRevision:supply?.mappingRevision || 0,expectedSource:mappingSourceVersion(working,service),...extra}}));
    for(const source of data.sources) {
      if(typeof source?.key!=='string' || !source.key.startsWith('candidate:') || keys.has(source.key) || !config.channels.some(row=>row.enabled && row.supplyId===source.key))throw Error('所选渠道重复或不属于本次路由');
      keys.add(source.key);
      const created=mapping('serviceMappingCreate',null,{name:working.endpoints.find(row=>row.id===source.config?.endpointId)?.name?.trim().slice(0,60) || '模型映射',config:source.config});
      const id=created.changes.find(change=>change.collection==='modelSupplies' && change.type==='add').record.id;
      config.channels=config.channels.map(row=>row.supplyId===source.key?{...row,supplyId:id}:row);
    }
    for(const row of config.channels.filter(row=>row.enabled)) {
      const channel=routingChannels(working,service).find(item=>item.id===row.supplyId);
      if(!channel)throw Error('所选映射不属于当前服务');
      if(!channel.available) {
        const supply=working.modelSupplies.find(item=>item.id===row.supplyId);
        if(supply.serviceMapping?.pending)throw Error('该映射有待应用变更，请先处理映射变更');
        mapping('serviceMappingValidate',supply);
        mapping('serviceMappingEnable',working.modelSupplies.find(item=>item.id===supply.id));
      }
    }
    apply(routingTransaction(working,{operation:'serviceRoutePublish',data:{...data,config,sourceVersion:routeSourceVersion(working,service)}}));
    for(const id of new Set(data.removeIds)) {
      const supply=working.modelSupplies.find(row=>row.id===id && row.status!=='已移除');
      if(!supply)throw Error('待解除的映射已变化');
      mapping('serviceMappingDisable',supply,{confirmed:true});
      mapping('serviceMappingRemove',working.modelSupplies.find(row=>row.id===id),{confirmed:true});
    }
    objectId=modelId;label='保存模型映射与路由';
  } else if (['serviceArchive','serviceRestore','configureServiceModelIdentity'].includes(operation)) {
    const model=working.models.find(row=>row.id===modelId);
    if(!model || data.expectedUpdatedAt!==model.updatedAt || data.confirmed!==true)throw Error('服务已有修订，请重新核对后确认');
    if(operation==='serviceArchive') {
      const issues=serviceArchiveIssues(working,model);if(issues.length)throw Error(issues.join('；'));
      update('models',modelId,{archivedAt:new Date().toISOString(),callsEnabled:false,marketVisible:false});label='归档模型服务';
    } else if(operation==='serviceRestore') {
      if(!model.archivedAt)throw Error('服务未归档');
      update('models',modelId,{archivedAt:null,callsEnabled:false,listingStatus:'已下架'});label='恢复已归档服务';
    } else {
      if(model.serviceMode!=='standard')throw Error('请在统一服务中修改此标识');
      if(model.listingStatus==='已上架' || model.callsEnabled===true)throw Error('先下架并停用服务，再修改调用标识');
      const callId=checkedServiceCallId(working,model,'',data.callId);
      // A legacy service can also own the master; retain that identity before changing its public ID.
      if(!model.templateId){if(!working.modelTemplates.some(row=>row.id===model.id))add('modelTemplates',structuredClone(model));update('models',modelId,{templateId:model.id});}
      update('models',modelId,{modelId:callId,platformPublications:[]});label='修改对外调用标识';
    }
  } else if (operation === 'prepareModelOperationsExamples') {
    if (data.confirmed !== true) throw new Error('请确认准备模型运营 Mock 数据');
    return modelOperationsExamplesTransaction(working);
  } else if (operation === 'guidePublish') {
    const model=working.models.find(row=>row.id===modelId), providerId=data.providerId || '';
    if(!model || !['standard','provider'].includes(model.serviceMode) || (model.serviceMode==='provider'?!providerServices(model).some(row=>row.providerId===providerId):Boolean(providerId)))throw Error('服务身份已变化');
    if(data.expectedBase!==JSON.stringify([model.updatedAt,model.apiGuides || {}]))throw Error('配置已变化，请重新打开核对');
    if(!data.codes || !['cURL','Python','Java','Go'].every(key=>typeof data.codes[key]==='string' && data.codes[key].length<=50000) || !Object.values(data.codes).some(code=>code.trim()))throw Error('请填写示例代码，每种语言最多 50000 字');
    update('models',modelId,{apiGuides:{...model.apiGuides,[providerId || 'standard']:{codes:Object.fromEntries(['cURL','Python','Java','Go'].map(key=>[key,data.codes[key]]))}},updatedAt:new Date().toISOString()});
    label='发布 API 调用指南';
  } else if (operation === 'commercialPublish') {
    const model = working.models.find(row => row.id === modelId);
    if (!model || !['standard', 'provider'].includes(model.serviceMode) || !['price', 'scope'].includes(data.kind)) throw new Error('请选择有效模型和维护任务');
    const providerId = data.kind === 'price' ? data.providerId || '' : '';
    if (data.kind === 'price' && (model.serviceMode === 'provider' ? !providerServices(model).some(row => row.providerId === providerId) : providerId)) throw new Error('服务商服务已变化，请重新核对');
    if (data.confirmed !== true || data.expectedBase !== commercialTaskBase(working, model, data.kind, providerId)) throw new Error('配置已有修订，请重新核对后提交');
    const key = commercialTaskKey(data.kind, providerId), value = data.value;
    if (!value || typeof value !== 'object') throw new Error('请填写配置');
    if (data.kind === 'scope') modelOp('scope', modelId, value);
    else {
      retailItems(working,value.items,(providerId?activeProviderPrice(working,modelId,providerId):activeModelSalePrice(working,modelId))?.items);
      if (providerId && value.callId !== providerServices(model).find(row => row.providerId === providerId)?.callId) throw new Error('对外调用 ID 已变化，请重新核对');
      apply(operationsTransaction(working, { operation: providerId ? 'configureServiceProvider' : 'unifiedPrice', modelId, data: { ...value, providerId, expectedUpdatedAt: model.updatedAt, expectedSaleVersion: providerId ? providerPriceRevision(working, modelId, providerId) : modelSaleRevision(working, modelId) } }));
      platformPriceVersions(providerId ? activeProviderPrice(working, modelId, providerId) : activeModelSalePrice(working, modelId), model);
    }
    const current = working.models.find(row => row.id === modelId);
    update('models', modelId, { commercialPublications: { ...current.commercialPublications, [key]: { kind: data.kind, providerId, version: (model.commercialPublications?.[key]?.version || 0) + 1, publishedAt: new Date().toISOString() } } });
    label = '发布' + (data.kind === 'price' ? '售价' : '客户范围');
  } else if (operation === 'supplierModelsRegister') {
    const provider = working.providers.find(row => row.id === data.providerId);
    if (!provider) throw new Error('请选择当前服务商');
    const rows = supplierModelRegistration(working, provider, data.libraryIds);
    for (const row of rows) providerOp('supplierModelAdd', provider.id, { libraryId: row.id });
    objectId = provider.id; label = '添加供应模型';
  } else if (operation === 'supplierChannelEdit') {
    const provider = working.providers.find(row => row.id === data.providerId);
    const endpoint = working.endpoints.find(row => row.id === data.endpointId && row.providerId === provider?.id && !row.deletedAt);
    if (!provider || !endpoint) throw new Error('请选择当前服务商的渠道');
    const association = data.associationId && supplierChannelAssociations(working, provider, endpoint.id).find(row => row.id === data.associationId && row.modelId === data.modelId);
    if (data.associationId && !association || !association && data.scenarios !== undefined) throw new Error('模型与渠道的关联已变化');
    if (typeof data.baseUrl !== 'string' || !data.baseUrl.trim()) throw new Error('请填写 API 地址');
    if(data.protocol!==undefined && !['OpenAI','Anthropic','其他'].includes(data.protocol)) throw Error('请选择已支持的上游协议');
    const interfaceType=CHANNEL_INTERFACES.find(row=>row.protocol===data.protocol)?.id;
    const protocolChanged=data.protocol!==undefined && (data.protocol!==endpoint.protocol || interfaceType!==endpoint.interfaceType);
    const protocolConfig=protocolChanged ? {protocol:data.protocol,interfaceType,taskUrls:{},adapterOptions:{}} : {};
    const addressChanged = data.baseUrl.trim() !== endpoint.baseUrl;
    if (data.keyGroupId !== undefined && (typeof data.keyGroupId !== 'string' || !data.keyGroupId)) throw new Error('请选择有效的共享API密钥组');
    const keyGroupChanged = data.keyGroupId !== undefined && (endpoint.authMode !== 'group' || endpoint.keyGroupId !== data.keyGroupId), connectionChanged = protocolChanged || addressChanged || keyGroupChanged || data.newApiKey !== undefined;
    if (data.newApiKey !== undefined && data.keyGroupId !== undefined) throw new Error('请选择一种 API 密钥方式');
    if (keyGroupChanged) {
      const primary = providerKeyGroupKeys(provider, data.keyGroupId, true)[0];
      if (!primary || primary.status === 'disabled' || primary.revokedAt) throw new Error('请选择主要密钥可用的共享API密钥组');
    }
    if (connectionChanged && endpoint.candidateConfiguration) throw new Error('渠道已有待验证配置，请先完成或放弃现有配置');
    providerOp('supplierChannelSave', provider.id, { mode: 'info', endpointId: endpoint.id, name: data.name, expectedUpdatedAt: data.expectedUpdatedAt, expectedProviderUpdatedAt: data.expectedProviderUpdatedAt, ...(association ? { associationId: association.id, modelId: association.modelId, upstreamModelId: data.upstreamModelId } : {}) });
    if (connectionChanged && data.newApiKey === undefined) apply(channelChangeTransaction(working, { operation: 'channelCandidateSave', data: { providerId: provider.id, endpointId: endpoint.id, expectedRevision: endpoint.configurationRevision || 0, config: { ...protocolConfig, baseUrl: data.baseUrl.trim(), ...(keyGroupChanged ? { authMode: 'group', keyGroupId: data.keyGroupId } : {}) } } }));
    if (data.newApiKey !== undefined) {
      const key = connectionKeys(endpoint, provider, true)[0];
      apply(channelChangeTransaction(working, { operation: 'channelCandidateCredentialPrepare', data: { providerId: provider.id, endpointId: endpoint.id, expectedRevision: endpoint.configurationRevision || 0, expectedImpactRevision: channelChangeImpact(working, provider.id, endpoint.id).revision, expectedKeyId: key?.id || '', expectedFingerprint: key?.fingerprint || '', newApiKey: data.newApiKey, config: { ...protocolConfig, baseUrl: data.baseUrl.trim() } } }));
    }
    if (data.scenarios !== undefined) apply(channelChangeTransaction(working, { operation: 'channelProcurementPublish', data: { providerId: provider.id, endpointId: endpoint.id, associationId: association.id, expectedPriceRevision: data.expectedPriceRevision, scenarios: data.scenarios, confirmed: true } }));
    objectId = endpoint.id; label = connectionChanged ? '保存渠道信息及待验证配置' : '保存渠道信息';
  } else if (operation === 'supplierChannelRegister') {
    const provider = working.providers.find(row => row.id === data.providerId);
    if (!provider || !providerCatalogueIds(provider).includes(data.modelId)) throw new Error('请选择当前服务商已登记的模型');
    const master = supplyModelRecord(working, provider, data.modelId);
    if (!master) throw new Error('当前供应模型尚未关联基础资料，请先维护模型资料');
    if (data.scenarios !== undefined && !Array.isArray(data.scenarios)) throw new Error('采购成本须为计费项列表');
    if(data.endpointId){
      const endpoint=working.endpoints.find(row=>row.id===data.endpointId && row.providerId===provider.id && !row.deletedAt);
      if(endpoint && supplierChannelAssociations(working,provider,endpoint.id).some(row=>row.modelId===data.modelId))throw Error('当前模型已关联此渠道，请从编辑入口维护');
      if(!endpoint || endpoint.updatedAt!==data.expectedEndpointUpdatedAt)throw Error('已有连接已变化，请重新选择');
      if(['name','baseUrl','protocol','authMode','keyGroupId','apiKey'].some(key=>data[key]!==undefined))throw Error('复用连接不能同时修改共享连接或密钥');
      if(!connectionCredentialsReady(endpoint,provider) || endpoint.candidateConfiguration)throw Error('请先完善已有连接及待验证配置');
      const issue=channelInterfaceIssue(provider,{modelId:data.modelId,endpoint});if(issue)throw Error(issue);
      providerOp('supplierAssociationSave',provider.id,{endpointId:endpoint.id,modelId:data.modelId,upstreamModelId:data.upstreamModelId,scenarios:data.scenarios || []});
      objectId=endpoint.id;label='复用连接接入模型渠道';
    }else{
    if(data.protocol!==undefined && !['OpenAI','Anthropic','其他'].includes(data.protocol)) throw Error('请选择已支持的上游协议');
    if (!['group', 'independent'].includes(data.authMode)) throw new Error('请选择 API 密钥方式');
    let privateKey;
    if (data.authMode === 'independent') {
      if (!data.apiKey || Object.keys(data.apiKey).some(key => !['maskedKey', 'fingerprint'].includes(key))) throw new Error('独立密钥只接受脱敏元数据');
      privateKey = { ...checkedConnectionKeys([data.apiKey])[0], scope: 'channel' };
    } else if (data.apiKey || !providerKeyGroupKeys(provider, data.keyGroupId).some(key => !key.revokedAt)) throw new Error('请选择包含可用密钥的共享API密钥组');
    const created = providerOp('supplierChannelSave', provider.id, {
      name: data.name, baseUrl: data.baseUrl, protocol: data.protocol || (provider.defaultProtocol?.includes('Anthropic') ? 'Anthropic' : 'OpenAI'),
      ...(data.protocol?{interfaceType:CHANNEL_INTERFACES.find(row=>row.protocol===data.protocol).id}:{}),
      authMode: 'group', keyGroupId: privateKey ? 'default' : data.keyGroupId,
    });
    const endpoint = created.changes.find(row => row.type === 'add' && row.collection === 'endpoints').record;
    update('endpoints', endpoint.id, { onboardingCreated: true, ...(privateKey ? { authMode: 'specific', keyGroupId: '', apiKeyId: privateKey.id, apiKeys: [privateKey] } : {}) });
    const issue = channelInterfaceIssue(provider, { modelId: data.modelId, endpoint });
    if (issue) throw new Error(issue);
    providerOp('supplierAssociationSave', provider.id, { endpointId: endpoint.id, modelId: data.modelId, upstreamModelId: data.upstreamModelId, scenarios: data.scenarios || [] });
    objectId = endpoint.id; label = '添加模型渠道';
    }
  } else if (operation === 'guidedChannelCreate') {
    if (!data.task) throw new Error('请完整配置模型与渠道');
    const task = apply(channelOnboardingTransaction(working, { operation: 'channelDraftSave', data: { ...data.task, guided: true, step: 1 } }));
    const saved = working.modelOnboardings.find(row => row.id === task.objectId);
    const { task: _ignored, ...input } = data;
    const created = apply(operationsTransaction(working, { operation: 'channelQuickCreate', data: { ...input, draftId: saved.id, expectedDraftRevision: saved.draftRevision } }));
    objectId = created.objectId; label = '保存模型渠道接入';
  } else if (operation === 'channelQuickCreate') {
    assertOnboardingMetadata(data);
    const input = data.values;
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('请填写渠道连接及模型映射');
    const endpoint = input.endpointId && working.endpoints.find(row => row.id === input.endpointId && row.providerId === data.providerId && !row.deletedAt);
    if (input.endpointId && !endpoint) throw new Error('追加模型的渠道已变化或不属于当前服务商');
    if (endpoint && (data.newProvider || data.providerPresetId || data.newApiKey || Object.keys(input).some(key => !['endpointId', 'models'].includes(key)))) throw new Error('追加模型只能引用已有渠道，不能同时修改连接或密钥');
    const draft = data.draftId && working.modelOnboardings.find(row => row.id === data.draftId && row.kind === 'supplier-channel');
    if (data.draftId && (!draft || draft.status !== '配置中' || draft.draftRevision !== data.expectedDraftRevision || !draft.guided && (draft.endpointId || '') !== (input.endpointId || ''))) throw new Error('接入草稿已变化或渠道不匹配，请重新载入');
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
    const reuse = draft?.guided && endpoint && values.models.length===1 && provider.catalogConnections?.find(row=>row.endpointId===endpoint.id && !row.deletedAt && row.upstreamModelId===values.models[0].upstreamModelId && provider.catalogModels.some(master=>master.modelId===row.modelId && libraryRecord(working,master.libraryId)?.id===values.models[0].libraryId));
    const created = reuse ? null : providerOp(endpoint ? 'supplierModelsAdd' : 'supplierChannelCreate', provider.id, values), channel = endpoint || created?.changes.find(change => change.type === 'add' && change.collection === 'endpoints')?.record;
    if (!channel) throw new Error('渠道创建结果缺失');
    objectId = channel.id; label = endpoint ? '追加模型接入' : '保存快捷模型接入';
    if (draft) {
      const owner = working.providers.find(row => row.id === provider.id);
      const createdAssociationIds = owner.catalogConnections.filter(row => row.endpointId === channel.id && !row.deletedAt && values.models.some(model => model.upstreamModelId.trim() === row.upstreamModelId && owner.catalogModels.some(item => item.modelId === row.modelId && item.libraryId === model.libraryId))).map(row => row.id);
      if (draft.guided && createdAssociationIds.length !== 1) throw new Error('接入模型结果不唯一，请重新核对');
      update('modelOnboardings', draft.id, { status: '已完成', draftRevision: draft.draftRevision + 1, createdEndpointId: channel.id, createdAssociationIds, ...(draft.guided?{rows:values.models.map((row,index)=>({id:draft.rows[index].id,libraryId:row.libraryId,upstreamModelId:row.upstreamModelId,scenarios:row.scenarios,selected:true,confirmed:true,source:'reference'}))}:{}) });
    }
  } else if (operation === 'guidedUpstreamSave') {
    const context = guidedOnboarding(working, data.draftId);
    if (!context?.channel || context.draft.draftRevision !== data.expectedDraftRevision || channelFingerprint(context.channel) !== data.expectedFingerprint) throw new Error('接入模型已变化，请重新打开核对');
    if (working.modelSupplies.some(row => row.status !== '已移除' && (row.channelId === context.association.id || row.endpointId === context.endpoint.id && row.upstreamModelId === context.association.upstreamModelId))) throw new Error('该渠道模型已关联服务，请在供应管理中维护');
    if (context.endpoint.serverTestJobs?.some(row => !row.receivedAt && row.associationIds?.includes(context.association.id))) throw new Error('测试尚未完成，请先查询原任务结果');
    const upstreamModelId = typeof data.upstreamModelId === 'string' ? data.upstreamModelId.trim() : '';
    if (!upstreamModelId || upstreamModelId.length > 200 || /\s/u.test(upstreamModelId)) throw new Error('上游模型 ID 必填，最多 200 字符，不能包含空白');
    if (data.confirmed !== true) throw new Error('请确认修改后重新测试并启用');
    if (context.provider.catalogConnections.some(row => row.id !== context.association.id && !row.deletedAt && row.endpointId === context.endpoint.id && row.upstreamModelId === upstreamModelId)) throw new Error('此渠道已有相同上游模型 ID');
    update('providers', context.provider.id, { catalogConnections: context.provider.catalogConnections.map(row => row.id === context.association.id ? { ...row, upstreamModelId, enabled: false, health: null, qualification: null, capabilityTests: [] } : row) });
    update('modelOnboardings', context.draft.id, { rows: context.draft.rows.map(row => ({ ...row, upstreamModelId })), draftRevision: context.draft.draftRevision + 1, updatedAt: new Date().toISOString() });
    objectId = context.association.id; label = '修正接入模型 ID';
  } else if (operation === 'guidedRouteSave' || operation === 'guidedRouteConfigure') {
    const context=guidedOnboarding(working,data.draftId);
    if(!context?.model || !context.supply || !context.supplyReady || context.draft.draftRevision!==data.expectedDraftRevision || data.serviceId!==context.service?.id)throw new Error('本次服务、供应或任务已变化，请重新核对');
    apply(operation==='guidedRouteConfigure'?operationsTransaction(working,{operation:'serviceRouteConfigure',modelId:context.model.id,data}):routingTransaction(working,{operation:'serviceRoutePublish',data}));
    update('modelOnboardings',context.draft.id,{routeCandidate:null,draftRevision:context.draft.draftRevision+1});
    objectId=context.model.id;label='发布本次接入路由';
  } else if (operation === 'guidedReserveComplete') {
    const context=guidedOnboarding(working,data.draftId);
    if(!context || context.draft.intent!=='reserve' || !context.supplyReady || context.draft.draftRevision!==data.expectedDraftRevision)throw new Error('备用供应的采购条件或检查尚未完成');
    update('modelOnboardings',context.draft.id,{completion:{outcome:'reserve',completedAt:new Date().toISOString()},draftRevision:context.draft.draftRevision+1});
    objectId=context.master.id;label='完成备用供应准备';
  } else if (operation === 'guidedPublish') {
    const context=guidedOnboarding(working,data.draftId), model=context?.model;
    if(!model || model.id!==modelId || !data.operationId || data.confirmed!==true)throw new Error('请选择有效的接入任务并确认发布上架');
    if(context.draft.completion?.operationId===data.operationId)return {type:'batch',changes:[],objectId:modelId,label:'核对发布上架结果'};
    if(context.draft.draftRevision!==data.expectedDraftRevision || !context.serviceReady || !context.routed)throw new Error('本次供应、采购条件、路由或接入任务已变化，请重新核对');
    if(context.routeTransaction)apply(context.routeTransaction);
    modelOp('recordPlatformPublication',modelId,{serviceId:data.serviceId,mockServiceId:data.mockServiceId,publishedVersion:data.publishedVersion,expectedFingerprint:data.expectedFingerprint});
    modelOp('publish',modelId,{});
    update('modelOnboardings',context.draft.id,{completion:{operationId:data.operationId,outcome:'listed',publishedAt:new Date().toISOString()},draftRevision:context.draft.draftRevision+1});
    objectId=modelId;label='发布验证后的配置并上架模型';
  } else if (operation === 'guidedSupplyAttach') {
    const context=guidedOnboarding(working,data.draftId), model=context?.model;
    if(!model || context.draft.intent!=='activate' || !context.supplyReady || context.draft.draftRevision!==data.expectedDraftRevision)throw new Error('请先确认投入目标、采购条件和供应检查');
    if(model.serviceMode==='provider' && !providerServices(model).some(row=>row.providerId===context.provider.id))throw new Error('请先在对外服务中配置新增服务商的独立售价与调用 ID');
    if(!context.supply)apply(operationsTransaction(working,{operation:'associateServiceChannels',modelId:model.id,data:{providerId:context.provider.id,catalogueModelId:context.association.modelId,channelIds:[context.association.id],confirmedIdentity:true,expectedUpdatedAt:model.updatedAt}}));
    objectId=model.id;label='关联新增供应，不改变售价和客户范围';
  } else if (operation === 'guidedProfileSave') {
    const context = guidedOnboarding(working, data.draftId);
    if (!context?.master || context.connectionIssue || context.draft.draftRevision !== data.expectedDraftRevision || context.model?.listingStatus === '已上架' || (context.model?.id || null) !== (modelId || null)) throw new Error('接入模型、服务或进度已变化，请重新核对');
    if (data.values?.type !== context.master.type) throw new Error('模型类型须与本次接入的模型一致');
    const args={...data.values,...(!context.model?{libraryId:context.master.id}:{})};
    const preview=modelTransaction(working,{operation:context.model?'serviceBasics':'createServiceModel',modelId,data:args}).changes.find(row=>row.collection==='models');
    const values={...context.model,...(preview.record || preview.changes)};
    requireModelBasics(values.profile);
    apply(operationsTransaction(working,{operation:'templateSave',data:{...metadata(values),id:context.master.id,modelId:context.master.modelId,confirmCapabilities:true}}));
    const saved = modelOp(context.model ? 'serviceBasics' : 'createServiceModel', modelId, args);
    update('modelOnboardings', context.draft.id, { profile: null, draftRevision: context.draft.draftRevision + 1, updatedAt: new Date().toISOString() });
    objectId = saved.objectId; label = '保存接入模型对外资料';
  } else if (operation === 'guidedServiceConfigure') {
    const context = guidedOnboarding(working, data.draftId), model = context?.model;
    if (!model || model.id !== modelId || !context.channel || context.connectionIssue) throw new Error(context?.connectionIssue || '接入模型与当前服务不匹配');
    if (model.listingStatus === '已上架') throw new Error('已上架服务请在服务管理中维护');
    if (context.draft.draftRevision !== data.expectedDraftRevision || model.updatedAt !== data.expectedUpdatedAt || (context.association.procurementRevision || 0) !== data.expectedPriceRevision || modelSaleRevision(working, modelId) !== data.expectedSaleVersion || providerPriceRevision(working, modelId, context.provider.id) !== data.expectedProviderSaleVersion) throw new Error('模型、采购价或平台售价已有修订，请重新核对');
    if (data.confirmed !== true) throw new Error('请确认采购价、平台售价及开放范围');
    if (model.serviceMode && model.serviceMode !== data.serviceMode) throw new Error('已有服务模式不能在接入流程中重置，请在服务管理中维护');
    if (!context.supplyReady) throw new Error('请先在接通供应阶段确认有效采购条件');
    if (!model.serviceMode) apply(operationsTransaction(working, { operation: 'serviceMode', modelId, data: { serviceMode: data.serviceMode, expectedUpdatedAt: model.updatedAt } }));
    if (data.serviceMode === 'standard') apply(operationsTransaction(working, { operation: 'unifiedPrice', modelId, data: { items: data.prices, expectedUpdatedAt: model.updatedAt, expectedSaleVersion: data.expectedSaleVersion } }));
    else {
      if (!providerServices(model).some(row => row.providerId === context.provider.id)) apply(operationsTransaction(working, { operation: 'associateServiceProvider', modelId, data: { providerId: context.provider.id, expectedUpdatedAt: model.updatedAt } }));
      apply(operationsTransaction(working, { operation: 'configureServiceProvider', modelId, data: { providerId: context.provider.id, callId: data.callId, items: data.prices, expectedUpdatedAt: model.updatedAt, expectedSaleVersion: data.expectedProviderSaleVersion } }));
    }
    modelOp('scope', modelId, { openScope: data.openScope, tenantIds: data.tenantIds });
    if (!context.supply) apply(operationsTransaction(working, { operation: 'associateServiceChannels', modelId, data: { providerId: context.provider.id, catalogueModelId: context.association.modelId, channelIds: [context.association.id], confirmedIdentity: true, expectedUpdatedAt: model.updatedAt } }));
    else if (context.supply.validationStatus !== '通过' || context.supply.status !== '已启用') {
      modelOp('supply', modelId, { id: context.supply.id, endpointId: context.endpoint.id, upstreamModelId: context.association.upstreamModelId, capabilities: model.capabilities });
      apply(operationsTransaction(working, { operation: 'verifySupply', modelId, data: { id: context.supply.id } }));
    }
    const configured = guidedOnboarding(working, data.draftId);
    const procurement = platformPriceVersions(activeSupplyPrice(working, configured.supply.id), model, '采购价');
    const sale = platformPriceVersions(data.serviceMode === 'provider' ? activeProviderPrice(working, modelId, context.provider.id) : activeModelSalePrice(working, modelId), model, '平台售价');
    const measures = items => items.map(item => `${item.unit}:${item.currency}`).sort().join('|');
    if (measures(procurement) !== measures(sale)) throw new Error('采购价与平台售价须使用相同的计量方式和币种');
    update('modelOnboardings', context.draft.id, { sales: null, draftRevision: context.draft.draftRevision + 1, updatedAt: new Date().toISOString() });
    objectId = modelId; label = '保存模型对外服务配置';
   } else if (operation === 'prepareServiceShowcase') {
    if (data.confirmed !== true) throw new Error('请确认准备两个模型服务案例');
    const prepared = prepareServiceShowcase(working);
    for (const collection of ['models','modelTemplates','providers','endpoints','modelSupplies','modelSalePrices','serviceRoutes','modelVersions']) for (const record of prepared[collection]) {
      const current = working[collection].find(item => item.id === record.id);
      if (!current) add(collection, record);
      else if (JSON.stringify(current) !== JSON.stringify(record)) update(collection, record.id, record);
    }
    objectId = SERVICE_SHOWCASE_ID; label = '准备两个模型服务案例';
  } else if (operation==='prepareServiceReviewCases') {
    if (data.confirmed!==true) throw new Error('请确认配置这五个评审场景');
    const prepared=prepareServiceReviewCases(working);
    for (const collection of ['models','providers','endpoints','modelSupplies','modelSalePrices','supplyPrices','serviceRoutes','modelVersions']) for (const record of prepared[collection]) {
      const current=working[collection].find(item=>item.id===record.id);
      if (!current) add(collection,record);
      else if (JSON.stringify(current)!==JSON.stringify(record)) update(collection,record.id,record);
    }
    objectId='service-review-cases';label='配置服务管理评审场景';
  } else if (operation === 'submitSupplierBatch') {
    apply(operationsTransaction(working, { operation: 'prepareSupplierBatch', data }));
    const items = data.items.map(entry => {
      const task = working.modelOnboardings.find(row => row.providerId === data.providerId && row.catalogueModelId === entry.catalogueModelId && row.status !== '已完成');
      return { catalogueModelId: entry.catalogueModelId, draftId: task.id, draftRevision: task.updatedAt };
    });
    apply(operationsTransaction(working, { operation: 'publishSupplierBatch', data: { providerId: data.providerId, items } }));
    objectId = data.providerId; label = `批量上架 ${items.length} 个模型`;
  } else if (['saveSupplierBatch', 'prepareSupplierBatch', 'publishSupplierBatch'].includes(operation)) {
    const provider = working.providers.find(item => item.id === data.providerId);
    if (!provider) throw new Error('服务商不存在');
    if (!Array.isArray(data.items) || !data.items.length || data.items.length > 100) throw new Error('每批请选择 1–100 个目录模型');
    if (new Set(data.items.map(item => item.catalogueModelId)).size !== data.items.length) throw new Error('同一批次不能重复选择目录模型');
    for (const entry of data.items) {
      if (!providerCatalogueIds(provider).includes(entry.catalogueModelId)) throw new Error('目录模型不属于当前服务商，请重新选择');
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
    label = `${{ saveSupplierBatch: '保存批量配置进度', prepareSupplierBatch: '保存配置并检查', publishSupplierBatch: '批量上架服务商模型' }[operation]} ${data.items.length} 个`;
  } else if (operation === 'templatePublish') {
    const record = libraryRecord(working, data.id);
    if (!record) throw new Error('模型资料不存在');
    if (data.confirmed !== true || data.expectedBase !== materialBase(working, record)) throw new Error('请重新核对资料版本和共享影响后发布');
    const collection = working.models.some(row => row.id === record.id) ? 'models' : 'modelTemplates';
    objectId = record.id;
    const impact = materialImpact(working, record, data.value);
    const online = impact.changed ? impact.services.filter(listed) : [];
    if (online.length && data.confirmDownlist !== true) throw new Error('能力变更需先修复相关服务，或明确下架受影响服务后发布');
    apply(operationsTransaction(working, { operation: 'templateSave', data: { ...data.value, id: record.id, confirmCapabilities: true } }));
    for (const service of online) update('models', service.id, { listingStatus: '已下架', visibility: '内部', callsEnabled: false, status: '停用', lifecycleStopReason: 'capability' });
    update(collection, record.id, { materialPublication: { publishedAt: new Date().toISOString(), revision: (record.materialPublication?.revision || 0) + 1 } });
    label = '发布共享模型资料';
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
        if (affected.length && !data.confirmCapabilities) throw new Error(`请确认能力变更：${affected.length} 条服务商供给将暂停服务并重新验证；价格与订购范围保留。`);
        apply(transaction); objectId = current.id; continue;
      }
      const validated = validatedMaterial(working, current, { ...entry, modelId: current?.modelId || entry.modelId });
      const fields = { ...metadata(validated), revision: (current?.revision || 0) + 1, updatedAt: new Date().toISOString() };
      objectId = current?.id || `template-${crypto.randomUUID()}`;
      if (current) update('modelTemplates', current.id, fields); else add('modelTemplates', { id: objectId, ...fields });
      if(current){
        const transactions=working.models.filter(row=>row.templateId===current.id).map(row=>modelTransaction(working,{operation:'basic',modelId:row.id,data:{...fields,profile:{...row.profile,...fields.profile}}}));
        const affected=transactions.flatMap(transaction=>transaction.changes).filter(change=>change.collection==='modelSupplies');
        if(affected.length && !data.confirmCapabilities)throw new Error(`请确认能力变更：${affected.length} 条服务商供给将暂停服务并重新验证；价格与订购范围保留。`);
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
    if (!provider || !providerCatalogueIds(provider).includes(data.catalogueModelId)) throw new Error('请选择有效的服务商目录模型');
    if (data.libraryId && !libraryRecord(working, data.libraryId)) throw new Error('模型资料不存在，请重新选择资料库记录');
    if (data.endpointId && !working.endpoints.some(item => item.id === data.endpointId && item.providerId === provider.id)) throw new Error('连接不属于当前服务商');
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
    if (!provider || !providerCatalogueIds(provider).includes(draft.catalogueModelId)) throw new Error('服务商目录模型已变化，请重新选择');
    const endpoint = working.endpoints.find(item => item.id === draft.endpointId && item.providerId === provider.id);
    const configured = provider.catalogConnections?.find(item => item.modelId === draft.catalogueModelId);
    if (configured && configured.endpointId !== draft.endpointId) throw new Error('目录模型接入地址已变化，请重新核对并选择最新接入');
    if (!endpoint?.baseUrl || !connectionCredentialsReady(endpoint, provider)) throw new Error('连接或 API 密钥配置缺失，请补齐服务商连接设置；当前进度已保存');
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
    if (supply && supply.upstreamModelId !== draft.catalogueModelId && supply.catalogueModelId !== draft.catalogueModelId) throw new Error('该平台模型已接入此服务商的其他 Model ID，请核对已有配置');
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
    if (!supply) throw new Error('服务商接入不存在');
    const endpoint = working.endpoints.find(item => item.id === supply.endpointId);
    if (!endpoint?.baseUrl || !connectionCredentialsReady(endpoint, working.providers.find(item => item.id === endpoint.providerId))) throw new Error('连接地址或 API 密钥配置缺失，请补齐服务商连接设置');
    providerOp('testConnection', endpoint.id, { scenario: data.scenario || '成功' });
    if (connectionTestPassed(working.endpoints.find(item => item.id === endpoint.id))) {
      providerOp('enableConnection', endpoint.id, {});
      modelOp('verify', modelId, { id: supply.id, result: data.modelResult || '通过' });
      if (data.modelResult !== '失败') modelOp('enableSupply', modelId, { id: supply.id });
    }
    label = '验证服务商接入';
  } else if (['publishSupply', 'unlistSupply', 'stopSupply', 'startSupply'].includes(operation)) {
    const model = working.models.find(item => item.id === modelId);
    const supply = modelSupplies(working, modelId).find(item => item.id === data.id);
    if (!model || !supply) throw new Error('服务商模型不存在');
    if (operation === 'publishSupply') {
      if (model.serviceMode === 'standard') throw new Error('统一服务模式请通过模型统一上架，不能独立售卖渠道');
      if (model.serviceMode === 'provider') throw new Error('分服务商模式请通过模型统一上架，不能独立售卖渠道');
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
    label = { publishSupply: '上架销售服务商模型', unlistSupply: '下架停售服务商模型', stopSupply: '停止服务商模型服务', startSupply: '启动服务商模型服务' }[operation];
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
    const items = retailItems(working,data.items,activeModelSalePrice(working,modelId)?.items);
    const version = Math.max(0,...working.modelSalePrices.filter(price => price.modelId === modelId && price.scope === 'model').map(price => price.version)) + 1;
    add('modelSalePrices', { id:`model-sale-${crypto.randomUUID()}`, modelId, scope:'model', serviceModeRevision:model.serviceModeRevision || 0, items, version, effectiveAt:new Date().toISOString(), status:'已发布' });
    objectId=modelId; label='配置统一售价';
  } else if (['serviceProviderListing','serviceProviderServing'].includes(operation)) {
    const model=working.models.find(item=>item.id===modelId), provider=working.providers.find(item=>item.id===data.providerId);
    const entry=model?.serviceProviders?.find(item=>item.providerId===data.providerId && item.status!=='已移除');
    if (!model || model.serviceMode!=='provider' || !entry || !provider) throw new Error('服务商服务不存在');
    if (data.expectedUpdatedAt!==model.updatedAt) throw new Error('模型服务已有并发修订，请重新打开配置');
    if (typeof data.enabled!=='boolean') throw new Error('请选择有效的服务商服务状态');
    if (operation==='serviceProviderServing' && data.enabled) {
      const failed=publicationChecks(working,model,{technical:true}).filter(row=>row.tab!=='platform' && (!row.providerId || row.providerId===provider.id) && !row.passed);
      if(failed.length)throw Error('请先完善技术配置：'+failed.map(row=>row.label).join('；'));
    }
    const field=operation==='serviceProviderListing'?'marketVisible':'callsEnabled';
    update('models',modelId,{serviceProviders:model.serviceProviders.map(item=>item===entry?{...item,[field]:data.enabled}:item)});
    label=operation==='serviceProviderListing'?(data.enabled?'上架服务商':'下架服务商'):(data.enabled?'恢复服务商服务':'停服服务商');objectId=modelId;
  } else if (['associateServiceProvider','configureServiceProvider','configureServiceIdentity','removeServiceProvider'].includes(operation)) {
    const model=working.models.find(item=>item.id===modelId), provider=working.providers.find(item=>item.id===data.providerId);
    if (!model || model.serviceMode!=='provider' || !provider) throw new Error('请在分服务商模式选择已有服务商');
    if (data.expectedUpdatedAt!==model.updatedAt) throw new Error('模型服务已有并发修订，请重新打开配置');
    const entries=model.serviceProviders || [], current=entries.find(item=>item.providerId===provider.id), serviceId=providerServiceId(modelId,provider.id);
    let entry;
    if (operation==='associateServiceProvider') {
      if (provider.status!=='已启用') throw new Error('服务商已停用');
      if (current && current.status!=='已移除') throw new Error('服务商已关联');
      entry={providerId:provider.id,code:providerCode(provider),callId:'',status:'已关联',...(listed(model)?{pendingPublication:true}:{})};
      label='关联已有服务商';
    } else {
      if (!current || current.status==='已移除') throw new Error('服务商关联不存在');
      if (operation==='removeServiceProvider') {
        if (current.marketVisible!==false) throw new Error('请先下架当前服务商，再解绑');
        const supplies=modelSupplies(working,modelId).filter(item=>item.provider?.id===provider.id);
        if (serviceBindingInUse({...working,serviceRoutes:working.serviceRoutes.filter(route=>route.serviceId!==serviceId)},modelId,supplies)) throw new Error('服务商渠道仍被其他服务路由引用，请先解除引用');
        for (const route of working.serviceRoutes.filter(item=>item.serviceId===serviceId)) update('serviceRoutes',route.id,{activeVersion:0,draft:null,draftUpdatedAt:null});
        for (const supply of supplies) update('modelSupplies',supply.id,{status:'已移除',salesEnabled:false});
        entry={...current,status:'已移除',callsEnabled:false};label='解绑服务商';
      } else {
        if (provider.status!=='已启用') throw new Error('服务商已停用');
        const callId=typeof data.callId==='string'?data.callId.trim():'';
        if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(callId)) throw new Error('对外调用 ID 必填，最多200字，仅支持英文、数字及 . _ / -');
        if (working.models.some(item=>item.id===callId || modelCode(item)===callId || providerServices(item).some(service=>!(item.id===modelId && service.providerId===provider.id) && service.callId===callId))) throw new Error('对外调用 ID 已存在');
        if(current.callId && current.callId!==callId) {
          if(listed(model) || current.callsEnabled!==false)throw Error('先下架模型并停用此服务商服务，再修改调用标识');
          if(data.confirmed!==true)throw Error('请确认调用标识变更对客户的影响');
        }
        if (operation !== 'configureServiceIdentity') {
          if (data.expectedSaleVersion!==providerPriceRevision(working,modelId,provider.id)) throw new Error('服务商平台售价已有并发修订，请重新核对');
          const items=retailItems(working,data.items,activeProviderPrice(working,modelId,provider.id)?.items), version=Math.max(0,...working.modelSalePrices.filter(price=>price.modelId===modelId && price.scope==='provider' && price.providerId===provider.id).map(price=>price.version))+1;
          add('modelSalePrices',{id:`provider-sale-${crypto.randomUUID()}`,modelId,providerId:provider.id,serviceId,scope:'provider',serviceModeRevision:model.serviceModeRevision || 0,items,version,effectiveAt:new Date().toISOString(),status:'已发布'});
        }
        entry={...current,callId};label=operation === 'configureServiceIdentity' ? '保存对外调用 ID' : '配置 Provider 对外服务';
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
      if (!channel || channel.reason) throw new Error(channel?.reason || '所选渠道已不存在或不属于服务商模型');
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
  } else if (operation === 'marketVisibility') {
    const model = working.models.find(item => item.id === modelId);
    if (!model) throw new Error('模型不存在');
    if (typeof data.visible !== 'boolean') throw new Error('请选择有效的模型广场可见性');
    if (data.expectedUpdatedAt !== model.updatedAt) throw new Error('模型已有并发修订，请载入最新数据后重试');
    update('models', modelId, { marketVisible: data.visible });
    objectId = modelId; label = data.visible ? '设为用户可见' : '设为用户不可见';
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
    if (!supply) throw new Error('供给已变化，请返回服务商选择步骤');
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
    label = data.providerId ? '更新服务商资料' : '新增服务商';
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
