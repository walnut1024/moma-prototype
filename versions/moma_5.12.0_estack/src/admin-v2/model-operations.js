import { validateOffer } from './supplier-offer-fields.js';
import { providerRemovalTransaction } from './provider-removal.js';
import { directoryArchiveBatch } from './channel-directory-archive.js';
import { channelSpecialtyTransaction, ollamaCurrentRows } from './channel-directory-specialty.js';
import { normalizeAdapterDraft } from './channel-adapter-catalogue.js';
import { supplierChannelBatchPlan, supplierChannelLifecyclePlan } from './supplier-channel-batch.js';
import { importModelResources } from './model-resource-transfer.js';
import { normalizeModelLogo } from './model-profile.js';
import { providerIntakeTransaction } from './provider-intake.js';
import { resourceId } from '../resource-id.mjs';
import { offerKey, offerStage, offerGrayTenants, providerOffer, serviceReferences, salesCustomer, salesPaused } from '../service-access.mjs';
import { channelBlockReason } from './provider-channels.js';
import { resolveChannelAssociationModel } from './channel-association-model.js';
import { salesChecks } from './service-sales.js';
import { marketOrderTransaction, orderedMarketModels } from './model-market-order.js';
import { marketCardTransaction } from '../market-cards.mjs';
import { serviceScope } from './service-commercial.js';
import { publicationChecks } from './model-management.js';
import { SERVICE_PURPOSES, servicePurpose } from './service-purpose.js';
import { serviceArchiveIssues, serviceDeleteIssues, checkedServiceCallId } from './service-maintenance.js';
import { retailItems } from './service-commercial.js';
import { channelHealthTransaction } from './channel-health.js';
import { resolveOnboardingProvider, resolveOnboardingModel, assertOnboardingMetadata } from './onboarding-presets.js';
import { libraryRecord, modelLibrary, libraryRemovalIssue, modelMaterial } from './model-library.js';
export { libraryRecord, modelLibrary } from './model-library.js';
import { routingTransaction, routingServices, routingChannels, routeSourceVersion } from './service-routing.js';
import { prepareServiceShowcase, SERVICE_SHOWCASE_ID } from './service-showcase.js';
import { prepareServiceReviewCases } from './service-review-cases.js';
import { commercialPriceKey, commercialPriceBase, modelSaleRevision, availableServiceChannels, providerServices, providerServiceId, providerPriceRevision, serviceBindingInUse, activeModelSalePrice, activeProviderPrice, SERVICE_CREATION_LIMIT } from './service-workspace.js';
import { modelTransaction, modelCode, modelSupplies, availableSupplies, supplyPriceReady, supplyModelUrl, latestSaleRevision, activeSupplyPrice } from './model-management.js';
import { modelProfileDraft, requireModelBasics, serviceModelSourceDraft } from './model-profile.js';
import { MODEL_OPERATION_NAMES } from './model-operation-history.js';
import { tariffDictionaryTransaction } from './tariff-dictionary.js';
import { classificationIndex, classifiedProfile, modelClassification, saveClassification } from './model-classification.js';
import { activeChannelProcurement, channelChangeTransaction, channelChangeImpact, channelCandidateStatus, prepareKeyPoolCandidate } from './channel-change-management.js';
import { normalizeChannelRequestRules } from './channel-request-rules.js';
import { channelCapacityTransaction } from './channel-capacity.js';
import { channelOnboardingTransaction } from './channel-onboarding.js';
import { channelDiscoveryPreview, directoryDiscoveryPolicy, directoryDiscoverySignature, ignoredDiscoveryModel } from './channel-discovery-diff.js';
import { providerTransaction, providerCode, modelConnectivityPreview, PROTOCOLS, checkedConnectionKeys } from './provider-management.js';
import { builtinModelCatalogueChanges, cleanModelCatalogueTransaction } from '../mock/builtin-model-catalogue.js';
import { archiveAcceptanceFixture } from './acceptance-cleanup.js';
import { supplierModelRegistration } from './supplier-model-registration.js';
import { planProviderJsonModel } from './provider-json-import.js';
import { supplyModelRecord, serviceModelSources } from './supply-models.js';
import { providerKeyGroupKeys } from './provider-key-groups.js';
import { connectionTestPassed, connectionTestPending, connectionCredentialsReady, connectionFingerprint, connectionKeys } from './connection-state.js';
import { providerCatalogueIds } from './moma-provider.js';
import { catalogueMetadata, REAL_MODELS, RECENT_TEMPLATE_CODES } from './real-model-catalogue.js';
import { guidedOnboarding } from './guided-onboarding.js';
import { channelFingerprint, channelInterfaceIssue } from './provider-channels.js';
import { supplierChannelAssociations, supplierChannelName } from './supplier-resources.js';
import { platformPriceVersions } from './platform-service-client.js';
import { modelOperationsExamplesTransaction } from './model-operations-examples.js';
import { CHANNEL_SOURCE_TYPES, channelListType, prepareListedChannelInterface } from './channel-connection-directory.js';
import { CHANNEL_INTERFACES } from './channel-interface.js';
import { serviceMappingTransaction, mappingSourceVersion } from './service-model-mappings.js';

export { providerCode } from './provider-management.js';
export const callModelId = (provider, model) => `${providerCode(provider)}/${modelCode(model)}`;
export const listed = model => model.listingStatus === '已上架';
const storedServiceModes = new Set(['standard', 'provider']);
export const supplySalesStatus = supply => supply.status !== '已启用' ? '停止服务' : supply.salesEnabled ? '上架售卖' : '下架停售';
function channelPrivateKey(key) {
  if (!key || typeof key !== 'object' || Array.isArray(key) || Object.keys(key).some(field => !['maskedKey', 'fingerprint'].includes(field))) throw new Error('独立密钥只接受脱敏元数据');
  return { ...checkedConnectionKeys([key])[0], scope: 'channel' };
}
export function supplyConnectivityTest(state, { modelId, supplyId, prompt, scenario }) {
  const supply = modelSupplies(state, modelId).find(item => item.id === supplyId);
  if (!supply?.endpoint || !supply.provider) throw new Error('服务商模型或接入地址不存在');
  const { endpoint, provider } = supply;
  if (!connectionCredentialsReady(endpoint, provider)) throw new Error('请先在服务商密钥页签配置凭证');
  let url;
  try { url = new URL(endpoint.baseUrl); } catch { throw new Error('服务商模型 URL 无效'); }
  if (!PROTOCOLS.includes(endpoint.protocol) || (url.protocol !== 'https:' && !(provider.sourceType === 'selfHosted' && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash) throw new Error('服务商模型 URL 或协议无效');
  if (!supply.upstreamModelId?.trim()) throw new Error('上游模型调用标识未配置');
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 2000) throw new Error('请填写测试内容，最多 2000 字');
  const requestUrl = supplyModelUrl(supply, state.models.find(item => item.id === modelId));
  if (!requestUrl) throw new Error('请先在服务商目录配置完整模型 Endpoint');
  return modelConnectivityPreview({ modelId, upstreamId: supply.upstreamModelId, endpointId: endpoint.id, baseUrl: requestUrl, protocol: endpoint.protocol }, scenario);
}
export const metadata = model => ({ modelId: modelCode(model), name: model.name, maker: model.maker || '', type: model.type, description: model.description, usageUnit: model.usageUnit, profile: { ...modelProfileDraft(model), author: model.profile?.author || model.maker || '' }, capabilities: { ...model.capabilities } });
export const materialBase = (_state, record) => JSON.stringify([record.revision, metadata(record)]);
function validatedMaterial(state, record, value) {
  if (!record) return modelTransaction({ ...state, models: [] }, { operation: 'create', data: value, catalogue:true }).changes[0].record;
  const fields = modelTransaction({ ...state, models: [{ ...record, templateId: undefined }], modelSupplies: [] }, { operation: 'basic', modelId: record.id, data: value, catalogue:true }).changes.find(row => row.collection === 'models').changes;
  return { ...record, ...fields };
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
function channelDirectoryNote(value) {
  const note = typeof value === 'string' ? value.trim() : null;
  if (note === null || note.length > 300 || /\bsk-[\w-]{6,}|\bBearer\s+\S+|BEGIN .*PRIVATE KEY/i.test(note)) throw Error('内部备注最多 300 字且不能包含密钥');
  return note;
}
// Compose existing domain operations against one working copy; persistence stays atomic.
export function operationsTransaction(state, action) {
  if (action.operation === 'modelClassificationSave') {
    const before = modelClassification(state), data = action.data || {};
    const { entry, dictionary } = saveClassification(before, data);
    return { type: 'batch', label: '保存模型分类', objectId: entry.id, changes: [],
      modelClassification: dictionary, classificationEntry: entry, classificationBefore: before[data.kind].find(row => row.id === entry.id) || null };
  }
  if (action.operation === 'importModelResources') return importModelResources(state, action.data?.file, operationsTransaction, action.data?.target);
  if (state.modelData?.sourceScope === 'reference-only-v2' && ['prepareServiceReviewCases', 'prepareModelOperationsExamples'].includes(action.operation)) throw Error('当前工作区请通过渠道管理导入内置服务商目录');
  const target=action.modelId || (action.data?.serviceId && state.models.find(row=>action.data.serviceId===`standard:${row.id}` || action.data.serviceId.startsWith(`provider:${row.id}:`))?.id);
  if (state.models.find(row => row.id === target)?.deletedAt) throw Error('模型服务已删除');
  if(state.models.find(row=>row.id===target)?.archivedAt && !['serviceRestore','serviceDelete','recordFailedOperation'].includes(action.operation) && !action.operation.startsWith('template'))throw Error('服务已归档，请先恢复服务');
  if (['marketCardCreate', 'marketCardEdit', 'marketCardLink', 'marketCardSetStatus'].includes(action.operation)) {
    return marketCardTransaction(state, action, orderedMarketModels(state));
  }
  if (action.operation === 'marketReorder') return marketOrderTransaction(state, action);
  if (action.operation === 'archiveAcceptanceFixture') return archiveAcceptanceFixture(state, action.data);
  if (action.operation === 'cleanModelCatalogue') return cleanModelCatalogueTransaction(state);
  if (action.operation === 'installModelCatalogue') return builtinModelCatalogueChanges(state, action.data?.catalogueIds);
  if (action.operation === 'channelHealthTest') return channelHealthTransaction(state, action);
  if (action.operation === 'channelDirectoryRepair' && state.cloudOperations) {
    return { type: 'batch', label: '修复渠道派生索引', objectId: 'channel-index', changes: [] };
  }
  if (action.operation === 'providerIntake') return providerIntakeTransaction(state, action);
  if (action.operation === 'supplierChannelBatchLifecycle') {
    const data = action.data || {}, plan = supplierChannelLifecyclePlan(state, data.providerId, data.associationIds, data.action, { modelOnly: data.modelOnly === true });
    if (data.confirmed !== true || data.expectedSignature !== plan.signature) throw Error('渠道或引用范围已变化，请重新预览并确认');
    if (plan.blockers.length) throw Error(plan.blockers.join('；'));
    return channelOnboardingTransaction(state, { operation: 'supplierSelection', data: { action: data.action, selections: plan.selections, confirmed: true } });
  }
  if (['providerRemovalPrepare', 'providerRemovalCommit'].includes(action.operation)) return providerRemovalTransaction(state, action);
  if (action.operation === 'channelCapacitySave') return channelCapacityTransaction(state, action);
  if (/^channel(Draft|Discovery|Metadata|TestEvidence|TemporaryTest)/.test(action.operation) || action.operation === 'supplierSelection') return channelOnboardingTransaction(state, action);
  if (/^channel(Candidate|Procurement)/.test(action.operation) || action.operation.startsWith('keyGroupCandidate') || ['keyGroupPriority', 'credentialReplace', 'credentialEmergencyRevoke'].includes(action.operation)) return channelChangeTransaction(state, action);
  if (action.operation.startsWith('serviceMapping')) return serviceMappingTransaction(state,action);
  if (['serviceRouteDraft', 'serviceRouteDirectoryOrder', 'serviceRoutePublish', 'serviceRouteRollback','serviceRouteStop','serviceRouteRestore','serviceFailoverConfigure'].includes(action.operation)) return routingTransaction(state, action);
  // Cloud commands keep simulation history and reference data read-only.
  const working = state.cloudOperations ? {...state,...Object.fromEntries(['models','modelTemplates','providers','endpoints','modelSupplies','modelSalePrices','supplyPrices','modelVersions','validations','modelOnboardings','serviceRoutes','tariffDictionary','modelData',...(action.operation==='prepareServiceShowcase'?['tenants']:[])].map(key=>[key,structuredClone(state[key])]))} : structuredClone(state), changes = [];
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
  let objectId = modelId, label, referenceMaterial;
  const modelForSale = working.models.find(row=>row.id===modelId);
  if (operation === 'pauseSales') {
    const model = modelForSale;
    const key = data.offerKey || '';
    const provider = model?.serviceMode === 'provider';
    const entry = provider ? providerOffer(model, key) : null;
    if (!model || (provider ? !entry : model.serviceMode !== 'standard' || key) ||
      data.confirmed !== true || data.expectedUpdatedAt !== model.updatedAt ||
      !['gray', 'formal'].includes(offerStage(model, entry)) || salesPaused(model, key)) {
      throw Error('销售状态已变化，请重新核对要停售的服务');
    }
    update('models', model.id, provider ? {
      serviceProviders: model.serviceProviders.map(row => row === entry ? { ...row, salesPaused: true } : row),
    } : { salesPaused: true });
    label = '停售模型服务';
  } else if (['startSales','stopSales'].includes(operation) && modelForSale?.serviceMode==='provider' && (data.offerKeys || providerServices(modelForSale).some(row=>row.channelId))) {
    const model=modelForSale, keys=data.offerKeys;
    if (data.expectedUpdatedAt!==model.updatedAt || data.confirmed!==true) throw Error('销售配置已变化，请核对并明确确认');
    if (!Array.isArray(keys) || !keys.length || keys.length>20 || new Set(keys).size!==keys.length || keys.some(key=>typeof key!=='string' || !providerOffer(model,key))) throw Error('请选择有效渠道服务');
    const stage=operation==='stopSales'?'withdrawn':data.releaseStage;
    if (!['withdrawn','gray','formal'].includes(stage) || operation==='startSales' && stage==='withdrawn') throw Error('请选择有效的上架阶段');
    const grayTenantIds=stage==='gray'?serviceScope(working,{openScope:'selected',tenantIds:data.releaseTenantIds}).tenantIds:[];
    if (grayTenantIds.some(id=>!salesCustomer(model,id))) throw Error('灰度客户须在当前销售对象中');
    if (operation==='startSales') {
      const failed=salesChecks(working,model,keys).filter(row=>!row.passed);
      if (failed.length) throw Error(failed.map(row=>row.label).join('；'));
    } else if (keys.some(key=>!['formal','gray'].includes(offerStage(model,providerOffer(model,key))))) {
      throw Error('所选渠道服务已下架，请刷新后重新选择');
    }
    const serviceProviders=model.serviceProviders.map(row=>row.status==='已移除' ? row : keys.includes(offerKey(row))
      ? {...row,listingStage:stage,grayTenantIds,...(operation === 'startSales' ? { salesPaused: false } : {})}
      : {...row,listingStage:offerStage(model,row),grayTenantIds:offerGrayTenants(model,row)});
    const active=serviceProviders.filter(row=>row.status!=='已移除' && ['formal','gray'].includes(row.listingStage));
    const formal=active.some(row=>offerStage(model,row)==='formal');
    update('models',modelId,{serviceProviders,listingStatus:active.length?'已上架':'已下架',releaseStage:formal?'formal':active.length?'gray':null,
      releaseTenantIds:[...new Set(active.flatMap(row=>offerGrayTenants(model,row)))],
      ...(operation==='startSales'?{visibility:'公开',firstPublishedAt:model.firstPublishedAt || new Date().toISOString()}:{})});
    label=stage==='gray'?'灰度上架渠道服务':stage==='formal'?'正式上架渠道服务':'下架渠道服务';
  } else if (['startSales','salesSettings'].includes(operation)) {
    const model=modelForSale;
    if (!model || data.expectedUpdatedAt!==model.updatedAt || data.confirmed!==true) throw Error('销售配置已变化，请核对并明确确认');
    if (operation==='salesSettings') {
      update('models',modelId,{salesScope:serviceScope(working,data.scope)});label='保存销售设置';
    } else {
      const failed=salesChecks(working,model).filter(row=>!row.passed);
      if(failed.length)throw Error(failed.map(row=>row.label).join('；'));
      const releaseStage=data.releaseStage || 'formal';
      if(!['gray','formal'].includes(releaseStage))throw Error('请选择灰度上架或正式上架');
      const releaseTenantIds=releaseStage==='gray'?serviceScope(working,{openScope:'selected',tenantIds:data.releaseTenantIds}).tenantIds:[];
      update('models',modelId,{listingStatus:'已上架',visibility:'公开',releaseStage,releaseTenantIds,salesPaused:false,firstPublishedAt:model.firstPublishedAt || new Date().toISOString()});label=releaseStage==='gray'?'灰度上架':'正式上架';
    }
  } else if (['enableService','disableService','stopSales'].includes(operation)) {
    label=modelOp(operation,modelId,data).label;
  } else if (operation === 'servicePurpose') {
    const model=working.models.find(row=>row.id===modelId);
    if (!model || data.expectedUpdatedAt!==model.updatedAt || !Object.hasOwn(SERVICE_PURPOSES,data.purpose) || data.confirmed!==true) throw Error('请核对当前服务用途并明确确认');
    if (model.callsEnabled || model.listingStatus==='已上架') throw Error('请先停用服务并停止销售，再修改用途');
    const entry=providerOffer(model,data.providerId);
    if (model.serviceMode==='provider' && !entry || model.serviceMode==='standard' && data.providerId) throw Error('请选择当前服务');
    if (servicePurpose(model,data.providerId)!==data.purpose && (working.orders || []).some(order=>!['已取消','已关闭','已过期'].includes(order.status) && (order.serviceId===(entry?'provider:'+model.id+':'+offerKey(entry):'standard:'+model.id) || working.products?.find(row=>row.id===order.productId)?.modelIds?.includes(model.id)))) throw Error('服务仍有商业依赖，不能变更用途');
    if (data.purpose==='internal' && servicePurpose(model,data.providerId)!=='internal' && working.cloudOperations && (model.firstPublishedAt || !model.purpose && !entry?.purpose)) throw Error('已经营服务的客户权益尚无法完整核对，暂不能转为内部服务');
    update('models',modelId,entry?{serviceProviders:model.serviceProviders.map(row=>row===entry?{...row,purpose:data.purpose}:row)}:{purpose:data.purpose});label='变更服务用途';
  } else if (operation === 'marketContentSave') {
    const model = working.models.find(row => row.id === modelId);
    if (!model || data.expectedUpdatedAt !== model.updatedAt) throw Error('广场内容已有修订，请重新核对');
    if (typeof data.name !== 'string' || !data.name.trim() || data.name.length > 100 || typeof data.description !== 'string' || data.description.length > 5000) throw Error('请填写模型展示名（最多100字）及介绍（最多5000字）');
    if (!data.profile || typeof data.profile !== 'object' || Array.isArray(data.profile) || JSON.stringify(data.profile).length > 100000) throw Error('模型展示资料格式无效');
    const profile = structuredClone(data.profile);
    if (profile.logo) profile.logo = normalizeModelLogo(profile.logo);
    update('models', model.id, { marketContent: { name: data.name.trim(), description: data.description.trim(), profile } });
    objectId = modelId; label = '维护模型广场展示信息';
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
  } else if (['serviceArchive','serviceDelete','serviceRestore','configureServiceModelIdentity'].includes(operation)) {
    const model=working.models.find(row=>row.id===modelId);
    if(!model || data.expectedUpdatedAt!==model.updatedAt || data.confirmed!==true)throw Error('服务已有修订，请重新核对后确认');
    if(operation==='serviceDelete') {
      if (Object.hasOwn(data, 'model_service_id')) {
        const service = serviceReferences(working).find(row => row.model_service_id === data.model_service_id && row.modelId === modelId);
        if (!service) throw Error('模型服务 ID 不存在或归属不匹配');
        if (service.providerId) {
          const key = offerKey(service), issues = serviceDeleteIssues(working, model, key);
          if (issues.length) throw Error(issues.join('；'));
          return { ...operationsTransaction(working, { ...action, operation: 'removeServiceProvider', data: { providerId: key, expectedUpdatedAt: data.expectedUpdatedAt } }), label: '删除模型服务' };
        }
      }
      const issues=serviceArchiveIssues(working,model);if(issues.length)throw Error(issues.join('；'));
      if(!model.templateId && !working.modelTemplates.some(row=>row.id===model.id))add('modelTemplates',structuredClone(model));
      update('models',modelId,{templateId:model.templateId || model.id,deletedAt:new Date().toISOString(),callsEnabled:false,marketVisible:false,listingStatus:'已下架',status:'停用'});label='删除模型服务';
    } else if(operation==='serviceArchive') {
      const issues=serviceArchiveIssues(working,model);if(issues.length)throw Error(issues.join('；'));
      update('models',modelId,{archivedAt:new Date().toISOString(),callsEnabled:false,marketVisible:false});label='归档模型服务';
    } else if(operation==='serviceRestore') {
      if(!model.archivedAt)throw Error('服务未归档');
      update('models',modelId,{archivedAt:null,callsEnabled:false,listingStatus:'已下架'});label='恢复已归档服务';
    } else {
      if(model.serviceMode!=='standard')throw Error('请在对应模型服务中修改调用标识');
      if(model.listingStatus==='已上架' || model.callsEnabled===true)throw Error('先下架并停用服务，再修改模型调用标识');
      const callId=checkedServiceCallId(working,model,'',data.callId);
      // A legacy service can also own the master; retain that identity before changing its public ID.
      if(!model.templateId){if(!working.modelTemplates.some(row=>row.id===model.id))add('modelTemplates',structuredClone(model));update('models',modelId,{templateId:model.id});}
      update('models',modelId,{modelId:callId,platformPublications:[]});label='修改模型调用标识';
    }
  } else if (operation === 'prepareModelOperationsExamples') {
    if (data.confirmed !== true) throw new Error('请确认准备模型运营 Mock 数据');
    return modelOperationsExamplesTransaction(working);
  } else if (operation === 'guidePublish') {
    const model=working.models.find(row=>row.id===modelId), providerId=data.providerId || '';
    if(!model || !['standard','provider'].includes(model.serviceMode) || (model.serviceMode==='provider'?!providerOffer(model,providerId):Boolean(providerId)))throw Error('服务身份已变化');
    if(data.expectedBase!==JSON.stringify([model.updatedAt,model.apiGuides || {}]))throw Error('配置已变化，请重新打开核对');
    if(!data.codes || !['cURL','Python','Java','Go'].every(key=>typeof data.codes[key]==='string' && data.codes[key].length<=50000) || !Object.values(data.codes).some(code=>code.trim()))throw Error('请填写示例代码，每种语言最多 50000 字');
    update('models',modelId,{apiGuides:{...model.apiGuides,[providerId || 'standard']:{codes:Object.fromEntries(['cURL','Python','Java','Go'].map(key=>[key,data.codes[key]]))}},updatedAt:new Date().toISOString()});
    label='发布 API 调用指南';
  } else if (operation === 'commercialPublish') {
    const model = working.models.find(row => row.id === modelId);
    if (!model || !['standard', 'provider'].includes(model.serviceMode) || data.kind !== 'price') throw new Error('请选择有效模型和维护任务');
    const providerId = data.providerId || '';
    if (model.serviceMode === 'provider' ? !providerOffer(model,providerId) : providerId) throw new Error('服务商服务已变化，请重新核对');
    if (data.confirmed !== true || data.expectedBase !== commercialPriceBase(working, model, providerId)) throw new Error('配置已有修订，请重新核对后提交');
    const key = commercialPriceKey(providerId), value = data.value;
    if (!value || typeof value !== 'object') throw new Error('请填写配置');
    retailItems(working,value.items,(providerId?activeProviderPrice(working,modelId,providerId):activeModelSalePrice(working,modelId))?.items);
    if (providerId && value.callId !== providerOffer(model,providerId)?.callId) throw new Error('模型调用标识 已变化，请重新核对');
    apply(operationsTransaction(working, { operation: providerId ? 'configureServiceProvider' : 'unifiedPrice', modelId, data: { callId: value.callId, items: value.items, providerId, expectedUpdatedAt: model.updatedAt, expectedSaleVersion: providerId ? providerPriceRevision(working, modelId, providerId) : modelSaleRevision(working, modelId) } }));
    platformPriceVersions(providerId ? activeProviderPrice(working, modelId, providerId) : activeModelSalePrice(working, modelId), model);
    const current = working.models.find(row => row.id === modelId);
    update('models', modelId, { commercialPublications: { ...current.commercialPublications, [key]: { kind: data.kind, providerId, version: (model.commercialPublications?.[key]?.version || 0) + 1, publishedAt: new Date().toISOString() } } });
    label = '发布售价';
  } else if (operation === 'supplierProfilesImport') {
    if (!Array.isArray(data.profiles) || !data.profiles.length || data.profiles.length > 5) throw new Error('每批需登记 1–5 个服务商');
    for (const profile of data.profiles) {
      if (!profile || typeof profile !== 'object' || Array.isArray(profile)) throw new Error('服务商资料格式无效');
      const { name, code, sourceType, introduction = '', website = '', documentation = '', contact, contactInfo, description } = profile;
      objectId = providerOp('create', null, { name, code, sourceType, introduction, website, documentation, contact, contactInfo, description }).objectId;
    }
    label = `批量导入 ${data.profiles.length} 个服务商`;
  } else if (operation === 'supplierJsonImport') {
    const provider = working.providers.find(row => row.id === data.providerId && !row.deletedAt);
    if (!provider || providerCode(provider) !== data.expectedProviderCode) throw Error('服务商已变化，请重新核对文件中的 ID 和编码');
    if (!Array.isArray(data.rows) || !data.rows.length || data.rows.length > 5) throw Error('每次提交 1–5 个模型');
    const slugs = new Set();
    for (const row of data.rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).some(key => !['model', 'connections'].includes(key))) throw Error('模型导入数据格式无效');
      const slug = row.model?.canonical_slug;
      if (slugs.has(slug)) throw Error('批次内模型编码重复');
      slugs.add(slug);
      apply(planProviderJsonModel(working, data.providerId, row));
    }
    objectId = data.providerId; label = '导入服务商模型及渠道';
  } else if (operation === 'supplierOffersSave') {
    const provider = working.providers.find(row => row.id === data.providerId && !row.deletedAt);
    if (!provider || !Array.isArray(data.offers) || !data.offers.length || data.offers.length > 5) throw Error('每批可保存 1–5 个供应模型');
    for (const offer of data.offers) {
      validateOffer(offer, provider);
      apply(planProviderJsonModel(working, provider.id, { model: { canonical_slug: offer.code, model_name: offer.name, model_type: offer.type }, connections: [] }));
      const owner = working.providers.find(row => row.id === provider.id);
      const master = modelLibrary(working).find(row => row.modelId === offer.code);
      update('providers', owner.id, { catalogModels: owner.catalogModels.map(entry => entry.libraryId === master.id ? { ...entry, offerFields: { name: offer.name, code: offer.code, type: offer.type, bindings: offer.bindings.map(({ upstream, protocol, url }) => ({ upstream, protocol, url })) } } : entry) });
    }
    objectId = provider.id; label = '保存供应模型';
  } else if (operation === 'supplierModelsRegister') {
    const provider = working.providers.find(row => row.id === data.providerId);
    if (!provider) throw new Error('请选择当前服务商');
    const rows = supplierModelRegistration(working, provider, data.libraryIds);
    for (const row of rows) providerOp('supplierModelAdd', provider.id, { libraryId: row.id });
    objectId = provider.id; label = '添加供应模型';
  } else if (operation === 'supplierChannelBatchEdit') {
    const plan = supplierChannelBatchPlan(working, data.providerId, data.associationIds);
    if (data.expectedSignature !== plan.signature || data.confirmed !== true) throw Error('渠道配置或影响范围已变化，请重新预览并确认');
    objectId = plan.provider.id;
    if (data.field === 'name') {
      for (const row of plan.selected) {
        const provider = working.providers.find(item => item.id === plan.provider.id);
        apply(providerTransaction(working, { operation: 'supplierChannelSave', objectId: provider.id, data: {
          mode: 'info', endpointId: row.endpointId, associationId: row.id, modelId: row.modelId,
          name: supplierChannelName(provider, row.endpoint), sourceName: data.value, upstreamModelId: row.upstreamModelId,
        } }));
      }
      label = '批量编辑渠道名称';
    } else if (data.field === 'address' && data.phase === 'prepare') {
      if (typeof data.value !== 'string' || !data.value.trim()) throw Error('请填写新的上游 API 地址');
      const targets = plan.connections.filter(({ endpoint }) => endpoint.baseUrl !== data.value.trim());
      if (!targets.length) throw Error('所选连接的地址没有变化');
      for (const { endpoint } of targets) {
        const candidate = endpoint.candidateConfiguration;
        if (candidate) {
          if (!candidate.addressOnly || candidate.config.baseUrl !== data.value.trim() || channelCandidateStatus(working, plan.provider.id, endpoint.id).reason) throw Error('连接已有其他待验证配置，请先处理现有配置');
          continue;
        }
        apply(channelChangeTransaction(working, { operation: 'channelCandidateSave', data: {
          providerId: plan.provider.id, endpointId: endpoint.id, expectedRevision: endpoint.configurationRevision || 0,
          addressOnly: true, config: { baseUrl: data.value.trim() },
        } }));
      }
      label = '准备批量渠道地址变更';
    } else if (data.field === 'address' && data.phase === 'apply') {
      if (typeof data.value !== 'string' || !data.value.trim()) throw Error('请核对待保存地址');
      const targets = plan.connections.filter(({ endpoint }) => endpoint.baseUrl !== data.value.trim());
      if (!targets.length || !Array.isArray(data.candidates) || data.candidates.length !== targets.length || new Set(data.candidates.map(row => row?.endpointId)).size !== targets.length) throw Error('待保存连接范围已变化');
      for (const { endpoint } of targets) {
        const expected = data.candidates.find(row => row?.endpointId === endpoint.id), candidate = endpoint.candidateConfiguration;
        if (!expected || !candidate?.addressOnly || candidate.id !== expected.candidateId || candidate.config.baseUrl !== data.value.trim()) throw Error('候选地址已变化，请重新预览并测试');
        const status = channelCandidateStatus(working, plan.provider.id, endpoint.id, { allAssociations: true });
        if (!status.ready) throw Error(status.credentialError || status.checks.find(row => !row.passed)?.reason || '共享连接下全部模型渠道须通过测试');
        apply(channelChangeTransaction(working, { operation: 'channelCandidateApply', data: {
          providerId: plan.provider.id, endpointId: endpoint.id, expectedRevision: endpoint.configurationRevision || 0,
          candidateId: candidate.id, confirmed: true,
        } }));
      }
      label = '批量保存已验证渠道地址';
    } else throw Error('请选择有效的批量操作');
  } else if (operation === 'supplierChannelEdit') {
    const provider = working.providers.find(row => row.id === data.providerId);
    const endpoint = working.endpoints.find(row => row.id === data.endpointId && row.providerId === provider?.id && !row.deletedAt);
    if (!provider || !endpoint) throw new Error('请选择当前服务商的渠道');
    if (data.unlinkedAddress === true) {
      if (data.expectedUpdatedAt !== (endpoint.updatedAt ?? null)) throw new Error('渠道已有修订，请重新打开核对');
      if (endpoint.candidateConfiguration || supplierChannelAssociations(working, provider, endpoint.id).length
        || working.modelSupplies.some(row => row.endpointId === endpoint.id && row.status !== '已移除')) throw new Error('渠道已有模型或待验证配置，请在渠道详情中修改');
      const { changes: connectionChanges } = providerTransaction(working, { operation: 'connection', objectId: endpoint.id,
        data: { ...endpoint, providerId: provider.id, baseUrl: data.baseUrl, timeoutSeconds: endpoint.timeoutSeconds || 60 } });
      const fields = connectionChanges[0].changes;
      update('endpoints', endpoint.id, { baseUrl: fields.baseUrl, status: '停用', connectionTest: null, connectionQualification: null });
      return { type: 'batch', objectId: endpoint.id, label: '保存未关联渠道的服务地址（Base URL）', changes };
    }
    const association = data.associationId && supplierChannelAssociations(working, provider, endpoint.id).find(row => row.id === data.associationId && row.modelId === data.modelId);
    if (data.associationId && !association || !association && (data.scenarios !== undefined || data.sourceName !== undefined || data.modelDisplayName !== undefined)) throw new Error('模型与渠道的关联已变化');
    const note = data.note === undefined ? undefined : channelDirectoryNote(data.note);
    if (note !== undefined && (association || data.expectedUpdatedAt !== endpoint.updatedAt ||
      data.expectedProviderUpdatedAt !== provider.updatedAt || data.prepareConnection)) throw Error('请用当前版本保存渠道简介');
    const { channelSourceType, pool } = data;
    if (channelSourceType !== undefined && (!CHANNEL_SOURCE_TYPES.includes(channelSourceType) || data.associationId !== undefined ||
      data.expectedUpdatedAt !== endpoint.updatedAt || data.expectedProviderUpdatedAt !== provider.updatedAt ||
      data.prepareConnection || endpoint.candidateConfiguration && data.candidateId === undefined)) {
      throw Error('请选择有效的渠道类型，并使用当前版本保存');
    }
    const directoryInfo = {
      ...(note === undefined ? {} : { directoryNote: note }),
      ...(channelSourceType === undefined ? {} : { channelSourceType }),
    };
    const channelInfo = () => providerTransaction(working, { operation: 'supplierChannelSave', objectId: provider.id, data: {
      mode: 'info', endpointId: endpoint.id, name: data.name, ...(data.sourceName !== undefined ? { sourceName: data.sourceName } : {}),
      ...(data.connectionNameOnly === true ? { connectionNameOnly: true } : {}),
      expectedUpdatedAt: data.expectedUpdatedAt, expectedProviderUpdatedAt: data.expectedProviderUpdatedAt,
      ...(association ? { associationId: association.id, modelId: association.modelId, upstreamModelId: data.upstreamModelId, modelDisplayName: data.modelDisplayName } : {}),
    } });
    const editsInfo = data.name !== undefined || data.upstreamModelId !== undefined || data.sourceName !== undefined || data.modelDisplayName !== undefined;
    if (data.candidateId !== undefined) {
      if (data.prepareConnection || pool !== undefined || ['baseUrl', 'protocol', 'interfaceType', 'modelProtocol', 'endpointPath', 'keyGroupId', 'apiKeyId', 'newApiKey', 'scenarios', 'requestRules', 'networkSettings', 'timeoutSeconds', 'customAdapter'].some(key => data[key] !== undefined)) {
        throw new Error('请保存已验证的渠道配置，连接信息变更后须重新测试');
      }
      if (data.expectedUpdatedAt !== endpoint.updatedAt || data.expectedProviderUpdatedAt !== provider.updatedAt) throw new Error('渠道或服务商已变化，请重新载入后保存');
      apply(channelChangeTransaction(working, { operation: 'channelCandidateApply', data }));
      if (editsInfo) apply(channelInfo());
      if (Object.keys(directoryInfo).length) update('endpoints', endpoint.id, directoryInfo);
      return { type: 'batch', objectId: endpoint.id, label: '保存已验证的模型渠道配置', changes };
    }
    if (typeof data.baseUrl !== 'string' || !data.baseUrl.trim()) throw new Error('请填写 API 地址');
    if(data.protocol!==undefined && !['OpenAI','Anthropic','其他'].includes(data.protocol)) throw Error('请选择已支持的上游协议');
    const interfaceType=data.interfaceType || CHANNEL_INTERFACES.find(row=>row.protocol===data.protocol)?.id;
    if(data.interfaceType && !(data.interfaceType === 'custom' && data.protocol === '其他') &&
      !CHANNEL_INTERFACES.some(row=>row.id===data.interfaceType && row.protocol===data.protocol)) throw Error('上游接口类型与协议不匹配');
    const listedProtocol = data.modelProtocol !== undefined;
    if (listedProtocol && (!data.prepareConnection || data.addressOnly || data.allAssociations !== true || association ||
      data.protocol !== undefined || data.interfaceType !== undefined)) throw Error('请核对整个渠道后修改模型协议');
    const selectedProtocol = listedProtocol ? prepareListedChannelInterface({ interfaceType: data.modelProtocol, baseUrl: data.baseUrl, endpointPath: data.endpointPath,
      allowHttp: provider.sourceType === 'selfHosted' }) : null;
    const protocolChanged = listedProtocol || data.protocol !== undefined && (data.protocol !== endpoint.protocol || interfaceType !== endpoint.interfaceType);
    const formatChanged = selectedProtocol
      ? channelListType({ endpoint: selectedProtocol, models: [] }) !== channelListType({ endpoint, models: [], interfaceLabel: endpoint.protocol })
      : protocolChanged;
    const protocolConfig = protocolChanged
      ? { protocol: selectedProtocol?.protocol ?? data.protocol, interfaceType: selectedProtocol?.interfaceType ?? interfaceType, ...(formatChanged ? { taskUrls: {}, adapterOptions: {} } : {}),
        ...(endpoint.endpointPath || selectedProtocol?.endpointPath ? { endpointPath: selectedProtocol?.endpointPath ?? null, modelProtocol: selectedProtocol?.modelProtocol ?? null } : {}) }
      : {};
    if (data.endpointPath !== undefined && !listedProtocol) throw Error('请随接口格式提交接口端点');
    const addressChanged = data.baseUrl.trim() !== endpoint.baseUrl;
    if (data.keyGroupId !== undefined && (typeof data.keyGroupId !== 'string' || !data.keyGroupId)) throw new Error('请选择有效的共享API密钥组');
    const rulesChanged = data.requestRules !== undefined;
    const advanced = Object.fromEntries(['requestRules', 'networkSettings', 'timeoutSeconds', 'customAdapter'].filter(key => data[key] !== undefined).map(key => [key, data[key]]));
    const advancedChanged = Object.keys(advanced).length > 0;
    if (advancedChanged && (!data.prepareConnection || data.allAssociations !== true || data.addressOnly || data.expectedImpactRevision !== channelChangeImpact(working, provider.id, endpoint.id).revision)) {
      throw Error('请先核对' + (rulesChanged ? '请求规则' : '运行参数') + '及当前连接的全部影响范围');
    }
    if (Object.hasOwn(advanced, 'timeoutSeconds') && (!Number.isSafeInteger(advanced.timeoutSeconds) || advanced.timeoutSeconds < 1 || advanced.timeoutSeconds > 600)) throw Error('超时须为 1–600 秒');
    if (data.authMode !== undefined && (data.authMode !== 'none' || provider.sourceType !== 'selfHosted' ||
      data.keyGroupId !== undefined || data.apiKeyId !== undefined || data.newApiKey !== undefined || !data.prepareConnection || data.allAssociations !== true)) {
      throw Error('仅自有推理服务可在核对整个连接后切换为无需认证');
    }
    const noAuthChanged = data.authMode === 'none' && endpoint.authMode !== 'none';
    const directKeySelected = data.apiKeyId !== undefined;
    if (directKeySelected && (!data.prepareConnection || data.addressOnly || data.keyGroupId !== undefined || data.newApiKey !== undefined ||
      !provider.apiKeys?.some(key => key.id === data.apiKeyId && key.scope !== 'channel' && key.status !== 'disabled' && !key.revokedAt))) {
      throw Error('请选择当前服务商的可用 API 密钥并测试连接');
    }
    if (pool !== undefined && (endpoint.authMode !== 'pool' || !data.prepareConnection || data.allAssociations !== true ||
      association || data.addressOnly || data.newApiKey !== undefined || data.keyGroupId !== undefined || data.apiKeyId !== undefined ||
      data.authMode !== undefined || !pool || !Array.isArray(pool.keyPool) || !Array.isArray(pool.newKeys) ||
      pool.keyPool.length + pool.newKeys.length < 2)) throw Error('请核对整个渠道并保留至少两把 API 密钥');
    if (endpoint.authMode === 'pool' && data.channelOwned === true && data.newApiKey !== undefined) throw Error('请通过渠道密钥池替换密钥');
    const keyGroupChanged = data.keyGroupId !== undefined && (endpoint.authMode !== 'group' || endpoint.keyGroupId !== data.keyGroupId), connectionChanged = protocolChanged || addressChanged || keyGroupChanged || directKeySelected || noAuthChanged || pool !== undefined || data.newApiKey !== undefined || advancedChanged;
    if (data.newApiKey !== undefined && data.keyGroupId !== undefined) throw new Error('请选择一种 API 密钥方式');
    if (keyGroupChanged) {
      const primary = providerKeyGroupKeys(provider, data.keyGroupId, true)[0];
      if (!primary || primary.status === 'disabled' || primary.revokedAt) throw new Error('请选择主要密钥可用的共享API密钥组');
    }
    if (connectionChanged && endpoint.candidateConfiguration) throw new Error('渠道已有待验证配置，请先完成或放弃现有配置');
    if (data.prepareConnection) {
      if (!connectionChanged || data.scenarios !== undefined) throw new Error('请选择有变化的连接配置进行测试');
      if (data.expectedUpdatedAt !== endpoint.updatedAt || data.expectedProviderUpdatedAt !== provider.updatedAt) throw new Error('渠道或服务商已变化，请重新载入后测试');
      if (editsInfo) channelInfo();
    } else if (editsInfo || !Object.keys(directoryInfo).length) apply(channelInfo());
    if (pool !== undefined) {
      apply(prepareKeyPoolCandidate(working, {
        providerId: provider.id, endpointId: endpoint.id, expectedRevision: endpoint.configurationRevision || 0,
        expectedImpactRevision: data.expectedImpactRevision,
        mode: pool.newKeys.length ? 'append' : 'edit', keyPool: pool.keyPool, keyStrategy: pool.keyStrategy, newKeys: pool.newKeys,
      }, { ...protocolConfig, baseUrl: data.baseUrl.trim(), ...advanced }));
    } else if (connectionChanged && data.newApiKey === undefined) apply(channelChangeTransaction(working, { operation: 'channelCandidateSave', data: {
      providerId: provider.id, endpointId: endpoint.id, expectedRevision: endpoint.configurationRevision || 0,
      ...(data.prepareConnection && data.addressOnly === true ? { addressOnly: true } : {}),
      ...(data.prepareConnection && data.allAssociations === true ? { allAssociations: true } : {}),
      config: { ...protocolConfig, baseUrl: data.baseUrl.trim(), ...(noAuthChanged ? { authMode: 'none' } : {}), ...(keyGroupChanged ? { authMode: 'group', keyGroupId: data.keyGroupId } : {}),
        ...(directKeySelected ? { authMode: 'specific', apiKeyId: data.apiKeyId } : {}), ...advanced },
    } }));
    if (data.newApiKey !== undefined) {
      const key = connectionKeys(endpoint, provider, true)[0];
      apply(channelChangeTransaction(working, { operation: 'channelCandidateCredentialPrepare', data: {
        providerId: provider.id, endpointId: endpoint.id, expectedRevision: endpoint.configurationRevision || 0,
        expectedImpactRevision: channelChangeImpact(working, provider.id, endpoint.id).revision,
        expectedKeyId: key?.id || '', expectedFingerprint: key?.fingerprint || '', newApiKey: data.newApiKey,
        config: { ...protocolConfig, baseUrl: data.baseUrl.trim(), ...advanced },
        ...(data.prepareConnection && data.channelOwned === true ? { channelOwned: true, allAssociations: true } : {}),
      } }));
    }
    if (data.scenarios !== undefined) apply(channelChangeTransaction(working, { operation: 'channelProcurementPublish', data: { providerId: provider.id, endpointId: endpoint.id, associationId: association.id, expectedPriceRevision: data.expectedPriceRevision, scenarios: data.scenarios, confirmed: true } }));
    if (Object.keys(directoryInfo).length) update('endpoints', endpoint.id, directoryInfo);
    objectId = endpoint.id;
    label = data.prepareConnection ? '准备连通性测试' : connectionChanged ? '保存渠道信息及待验证配置' : '保存渠道信息';
  } else if (operation === 'channelDirectoryBalance') {
    if (!Array.isArray(data.rows) || !data.rows.length || data.rows.length > 100 ||
      new Set(data.rows.map(row => row?.endpointId)).size !== data.rows.length) throw Error('请选择不超过 100 条不重复的连接');
    const checkedAt = new Date().toISOString();
    for (const row of data.rows) {
      const endpoint = working.endpoints.find(item => item.id === row?.endpointId && item.providerId === row?.providerId && !item.deletedAt);
      if (!endpoint || row.signature !== connectionFingerprint(endpoint)) throw Error('连接发生变化，请重新查询余额');
      let prior = endpoint.directoryBalance;
      if (row.keyId !== undefined) {
        const provider = working.providers.find(item => item.id === endpoint.providerId && !item.deletedAt);
        if (!provider || !connectionKeys(endpoint, provider).some(key => key.id === row.keyId)) throw Error('密钥不属于此连接当前可用范围');
        prior = endpoint.directoryKeyBalances?.[row.keyId];
      }
      const result = row.result;
      if (result && (!endpoint.customAdapter?.balance || result.source !== 'mock' || !Number.isFinite(result.amount) ||
        typeof result.unit !== 'string' || !/^[\p{L}\p{N} $€¥/._-]{1,30}$/u.test(result.unit) ||
        result.used != null && (!Number.isFinite(result.used) || result.used < 0))) throw Error('余额结果无效');
      const lastSuccess = result ? { amount: result.amount, unit: result.unit, used: result.used ?? null,
        checkedAt, signature: row.signature, source: 'mock' } : prior?.lastSuccess || null;
      const record = { lastSuccess, checkedAt, signature: row.signature,
        status: result ? '已查询' : endpoint.customAdapter?.balance ? '查询失败' : '上游未提供' };
      update('endpoints', endpoint.id, row.keyId === undefined ? { directoryBalance: record } :
        { directoryKeyBalances: { ...endpoint.directoryKeyBalances, [row.keyId]: record } });
    }
    objectId = data.rows[0].endpointId;
    label = '记录上游余额查询';
  } else if (operation === 'channelDirectoryDiscoveryPolicy') {
    const endpoint = working.endpoints.find(row => row.id === data.endpointId && row.providerId === data.providerId && !row.deletedAt);
    if (!endpoint || endpoint.updatedAt !== data.expectedUpdatedAt) throw Error('连接已变化，请重新载入');
    update('endpoints', endpoint.id, { directoryDiscoveryPolicy: { ...directoryDiscoveryPolicy(data.policy || {}), ownerId: working.adminSession?.accountId || null } });
    objectId = endpoint.id;
    label = '保存上游模型同步策略';
  } else if (operation === 'channelDirectoryApplyDiscovery') {
    if (data.confirmed !== true || !Array.isArray(data.targets) || !data.targets.length || data.targets.length > 10 ||
      new Set(data.targets.map(row => row?.endpointId)).size !== data.targets.length) throw Error('请核对所选连接及采购范围');
    const count = data.targets.reduce((sum, row) => sum + (Array.isArray(row.modelIds) ? row.modelIds.length : 0), 0);
    if (!count || count > 25) throw Error('每次最多应用 25 条已核对的模型渠道');
    for (const target of data.targets) {
      const provider = working.providers.find(row => row.id === target.providerId && !row.deletedAt);
      const endpoint = provider && working.endpoints.find(row => row.id === target.endpointId && row.providerId === provider.id && !row.deletedAt);
      const receipt = endpoint?.directoryDiscovery;
      if (!receipt?.result?.complete || receipt.taskId !== target.taskId || receipt.signature !== directoryDiscoverySignature(provider, endpoint) ||
        Date.now() - Date.parse(receipt.discoveredAt) > 86400000 || !Array.isArray(target.modelIds) || !target.modelIds.length ||
        new Set(target.modelIds).size !== target.modelIds.length) throw Error('上游检测结果过期或不完整，请重新检查');
      const preview = channelDiscoveryPreview(working, provider, endpoint.id, receipt.result);
      const models = target.modelIds.map(id => {
        const candidate = preview.rows.find(row => row.upstreamModelId === id && !row.existingAssociationId && row.libraryId && row.candidates.length === 1);
        if (!candidate || ignoredDiscoveryModel(endpoint.directoryDiscoveryPolicy, id) ||
          data.automatic === true && (!endpoint.directoryDiscoveryPolicy?.enabled || !endpoint.directoryDiscoveryPolicy.whitelist.includes(id))) throw Error('候选模型不在本次可应用范围，请重新核对准确身份和采购白名单');
        return { libraryId: candidate.libraryId, upstreamModelId: id, scenarios: [] };
      });
      apply(operationsTransaction(working, { operation: 'channelQuickCreate', data: {
        providerId: provider.id, values: { endpointId: endpoint.id, models },
      } }));
      update('endpoints', endpoint.id, { directoryDiscoveryApply: { taskId: target.taskId, modelIds: [...target.modelIds], appliedAt: new Date().toISOString() } });
    }
    objectId = data.targets[0].endpointId;
    label = '接入已核对的上游模型';
  } else if (operation === 'channelDirectoryDefaultTest') {
    const provider = working.providers.find(row => row.id === data.providerId && !row.deletedAt);
    const endpoint = working.endpoints.find(row => row.id === data.endpointId && row.providerId === provider?.id && !row.deletedAt);
    if (!endpoint || endpoint.updatedAt !== data.expectedUpdatedAt) throw Error('连接已变化，请重新载入');
    if (data.associationId !== null && !supplierChannelAssociations(working, provider, endpoint.id).some(row => row.id === data.associationId)) throw Error('默认测试模型不属于当前连接');
    update('endpoints', endpoint.id, { directoryDefaultTestAssociationId: data.associationId });
    objectId = endpoint.id;
    label = '保存连接默认测试模型';
  } else if (operation === 'channelDirectoryAutoStop') {
    const endpoint = working.endpoints.find(row => row.id === data.endpointId && row.providerId === data.providerId && !row.deletedAt);
    if (!endpoint || endpoint.updatedAt !== data.expectedUpdatedAt) throw Error('连接已变化，请重新载入');
    if (typeof data.enabled !== 'boolean' || !Number.isSafeInteger(data.threshold) || data.threshold < 1 || data.threshold > 10) throw Error('连续失败次数须为 1–10');
    update('endpoints', endpoint.id, { directoryAutoStop: { enabled: data.enabled, threshold: data.threshold, updatedAt: new Date().toISOString() },
      directoryStopEvidence: null, directoryKeyEvidence: {} });
    objectId = endpoint.id;
    label = '保存连接自动停用策略';
  } else if (operation === 'channelDirectoryNote') {
    const endpoint = working.endpoints.find(row => row.id === data.endpointId && row.providerId === data.providerId && !row.deletedAt);
    if (!endpoint || endpoint.updatedAt !== data.expectedUpdatedAt) throw Error('连接已变化，请重新载入');
    update('endpoints', endpoint.id, { directoryNote: channelDirectoryNote(data.note) });
    objectId = endpoint.id;
    label = '保存连接内部备注';
  } else if (operation === 'channelDirectoryCreate') {
    const provider = working.providers.find(row => row.id === data.providerId && !row.deletedAt);
    if (!provider || provider.status !== '已启用') throw Error('请选择已启用的服务商');
    if (data.channelSourceType !== undefined && !CHANNEL_SOURCE_TYPES.includes(data.channelSourceType)) throw Error('请选择有效的渠道类型');
    if (data.endpointPath !== undefined && data.modelProtocol === undefined) throw Error('请随接口格式提交接口端点');
    const selectedProtocol = data.modelProtocol === undefined ? null : prepareListedChannelInterface({
      interfaceType: data.modelProtocol, baseUrl: data.baseUrl, endpointPath: data.endpointPath, allowHttp: provider.sourceType === 'selfHosted',
    });
    const note = data.note === undefined ? undefined : channelDirectoryNote(data.note);
    if (!Array.isArray(data.rows) || !data.rows.length || data.rows.length > 20) throw Error('每次请提交 1–20 条连接');
    if (data.models !== undefined && (!Array.isArray(data.models) || data.models.length * data.rows.length > 50 ||
      data.models.some(row => !row || Object.keys(row).some(key => !['modelId', 'upstreamModelId'].includes(key))) ||
      new Set(data.models.map(row => row.modelId)).size !== data.models.length)) throw Error('请核对不重复的模型接入范围，每批最多新增 50 条模型渠道');
    const adapterDraft = data.adapterDraft ? normalizeAdapterDraft(data.adapterDraft) : null;
    if (adapterDraft && (data.rows.length !== 1 || data.models?.length || data.authMode !== 'pending' || data.copyFrom || data.interfaceType)) throw Error('待适配连接只能保存为未启用草稿');
    if (!['group', 'specific', 'independent', 'none', ...(adapterDraft ? ['pending'] : [])].includes(data.authMode)) throw Error('请选择连接的凭证来源');
    const from = data.copyFrom;
    const copySource = from && working.endpoints.find(row => row.id === from.endpointId && row.providerId === provider.id && !row.deletedAt);
    if (from && (!copySource || data.rows.length !== 1 || from.expectedUpdatedAt !== copySource.updatedAt ||
      from.expectedProviderUpdatedAt !== provider.updatedAt || typeof from.rules !== 'boolean' || typeof from.commercial !== 'boolean')) throw Error('复制来源或配置已变化，请重新核对');
    const sourceModels = copySource && supplierChannelAssociations(working, provider, copySource.id);
    const sourceRules = from?.rules && (copySource.candidateConfiguration ? copySource.candidateConfiguration.config.requestRules : copySource.requestRules);
    const copiedRules = sourceRules ? normalizeChannelRequestRules({ ...sourceRules, ...(sourceRules.aliases ? {
      aliases: Object.fromEntries(Object.entries(sourceRules.aliases).filter(([, id]) => data.models?.some(row => row.upstreamModelId === id))),
    } : {}) }, data.interfaceType) : null;
    if (data.rows.length > 1 && data.perCredential !== true || data.perCredential === true && data.authMode !== 'independent') throw Error('逐行批量创建需要逐条配置独立密钥');
    if (data.authMode === 'group') {
      const [primary] = providerKeyGroupKeys(provider, data.keyGroupId, true);
      if (!primary || primary.revokedAt || primary.status === 'disabled') throw Error('请选择主要密钥可用的共享 API 密钥组');
    }
    const seen = new Set(), creationIds = new Set();
    for (const row of data.rows) {
      if (!row || typeof row.creationId !== 'string' || !/^[a-f0-9-]{36}$/.test(row.creationId) || creationIds.has(row.creationId)) throw Error('创建条目标识无效');
      creationIds.add(row.creationId);
      if (working.endpoints.some(endpoint => endpoint.providerId === provider.id && endpoint.directoryCreationId === row.creationId)) continue;
      if (!Array.isArray(row.keys) || row.keys.length > 20 || (data.authMode === 'independent') !== Boolean(row.keys.length) || data.perCredential && row.keys.length !== 1) throw Error('独立密钥数量与创建方式不匹配');
      const keys = row.keys.map(channelPrivateKey);
      for (const key of keys) {
        if (seen.has(key.fingerprint) || data.perCredential && working.endpoints.some(endpoint => !endpoint.deletedAt && endpoint.providerId === provider.id && endpoint.directoryBatchCredential === key.fingerprint)) throw Error('连接包含重复的密钥');
        seen.add(key.fingerprint);
      }
      if (keys.length > 1 && !['priority', 'random', 'roundRobin'].includes(data.keyStrategy)) throw Error('请选择多密钥选择策略');
      const created = providerOp('supplierChannelSave', provider.id, {
        name: row.name, baseUrl: data.baseUrl, interfaceType: data.interfaceType, protocol: data.protocol, taskUrls: data.taskUrls,
        ...selectedProtocol, adapterOptions: data.adapterOptions, timeoutSeconds: data.timeoutSeconds, capacity: data.capacity,
        authMode: keys.length ? 'inherit' : data.authMode, keyGroupId: data.keyGroupId, apiKeyId: data.apiKeyId, adapterDraft,
      });
      const endpoint = created.changes.find(change => change.collection === 'endpoints' && change.type === 'add').record;
      update('endpoints', endpoint.id, {
        directoryCreationId: row.creationId,
        ...(data.channelSourceType === undefined ? {} : { channelSourceType: data.channelSourceType }),
        ...(selectedProtocol?.modelProtocol ? { modelProtocol: selectedProtocol.modelProtocol } : {}),
        ...(note === undefined ? {} : { directoryNote: note }),
        ...(copiedRules ? { requestRules: copiedRules } : {}),
        ...(data.perCredential && keys.length === 1 ? { directoryBatchCredential: keys[0].fingerprint } : {}),
        ...(keys.length === 1 ? { authMode: 'specific', apiKeyId: keys[0].id, apiKeys: keys } : {}),
        ...(keys.length > 1 ? { authMode: 'pool', apiKeyId: '', apiKeys: keys, keyStrategy: data.keyStrategy,
          keyPool: keys.map((key, index) => ({ keyId: key.id, priority: index + 1, enabled: true })) } : {}),
      });
      for (const model of data.models || []) {
        if (!providerCatalogueIds(provider).includes(model.modelId) || !supplyModelRecord(working, provider, model.modelId)) throw Error('请从当前服务商选择已登记且已关联资料的模型');
        apply(operationsTransaction(working, { operation: 'supplierChannelRegister', data: {
          providerId: provider.id, endpointId: endpoint.id, expectedEndpointUpdatedAt: endpoint.updatedAt,
          modelId: model.modelId, upstreamModelId: model.upstreamModelId,
        } }));
        if (from?.commercial) {
          const candidate = sourceModels.find(row => row.modelId === model.modelId && row.upstreamModelId === model.upstreamModelId);
          if (!candidate) continue;
          const owner = working.providers.find(row => row.id === provider.id);
          const associationId = supplierChannelAssociations(working, owner, endpoint.id).find(row => row.modelId === model.modelId && row.upstreamModelId === model.upstreamModelId)?.id;
          if (candidate.capacityLimits) apply(channelCapacityTransaction(working, { data: { providerId: provider.id, endpointId: endpoint.id,
            associationId, limits: candidate.capacityLimits, expectedCapacityRevision: 0 } }));
          const active = activeChannelProcurement(candidate);
          const price = active === undefined ? candidate.pricing : active?.pricing;
          if (price?.scenarios?.length && associationId) {
            const now = new Date().toISOString();
            update('providers', provider.id, { catalogConnections: owner.catalogConnections.map(saved => saved.id === associationId ? {
              ...saved, procurementVersions: [{ id: resourceId('purchase-price-version'), version: 0, pricing: structuredClone(price), status: '草稿', createdAt: now }],
            } : saved) });
          }
        }
      }
      objectId ||= endpoint.id;
    }
    objectId ||= provider.id;
    label = '创建渠道连接';
  } else if (operation === 'channelDirectoryArchive') {
    const archiveResults = directoryArchiveBatch(working, data, apply);
    return { type: 'batch', label: !changes.length ? '核对连接归档范围' : data.mode === 'disabled' ? '清理已停用连接' : '批量删除连接',
      objectId: data.targets[0].endpointId, archiveResults, changes };
  } else if (operation === 'channelDirectorySpecialty') {
    if (data.action === 'replaceModel') {
      const provider = working.providers.find(row => row.id === data.providerId && !row.deletedAt);
      const endpoint = provider && working.endpoints.find(row => row.id === data.endpointId && row.providerId === provider.id && !row.deletedAt);
      const association = endpoint && supplierChannelAssociations(working, provider, endpoint.id).find(row => row.id === data.associationId);
      if (endpoint?.networkSettings?.runtimeKind !== 'ollama' || endpoint.updatedAt !== data.expectedUpdatedAt || !association ||
        !ollamaCurrentRows(endpoint.directorySpecialties?.ollama).some(row => row.id === data.model && row.status === '已安装') ||
        data.confirmed !== true) throw Error('请选择已安装模型并核对此连接的当前映射');
      if (endpoint.candidateConfiguration || channelChangeImpact(working, provider.id, endpoint.id).services.some(service => service.associationIds.includes(association.id))) {
        throw Error('仍有候选配置或生效服务引用，请先处理引用再替换');
      }
      return operationsTransaction(working, { operation: 'supplierChannelEdit', data: { providerId: provider.id,
        endpointId: endpoint.id, associationId: association.id, modelId: association.modelId, upstreamModelId: data.model,
        expectedUpdatedAt: endpoint.updatedAt, expectedProviderUpdatedAt: provider.updatedAt, name: endpoint.name, baseUrl: endpoint.baseUrl } });
    }
    return channelSpecialtyTransaction(working, action);
  } else if (operation === 'channelDirectoryTagEdit') {
    if (data.confirmed !== true || typeof data.tag !== 'string' || !data.tag || !Array.isArray(data.targets) ||
      !data.targets.length || data.targets.length > 20 || new Set(data.targets.map(row => row?.endpointId)).size !== data.targets.length) throw Error('请选择标签内的连接并确认影响');
    const members = working.endpoints.filter(row => !row.deletedAt && row.directoryTags?.includes(data.tag)).map(row => row.id).sort();
    if (JSON.stringify(members) !== JSON.stringify(data.memberIds)) throw Error('标签成员已变化，请重新核对');
    if (data.mode === 'route') {
      const service = routingServices(working).find(row => row.id === data.serviceId);
      const route = service && working.serviceRoutes.find(row => row.serviceId === service.id);
      const config = route?.draft || route?.versions.find(row => row.version === route.activeVersion)?.config;
      if (!config?.groups?.some(row => row.id === data.groupId) ||
        data.routeSignature !== JSON.stringify([route.activeVersion, route.draftUpdatedAt, route.draft || null])) throw Error('服务路由或分组已变化，请重新核对');
      const configuredSupplyIds = new Set(config.channels.map(row => row.supplyId));
      const routedChannels = routingChannels(working, service).filter(row => configuredSupplyIds.has(row.id));
      const selected = new Map(data.targets.map(row => [row.endpointId, row.expectedUpdatedAt]));
      const matchingEndpoints = new Set(routedChannels.map(row => row.endpointId));
      for (const [id, revision] of selected) {
        const endpoint = working.endpoints.find(row => row.id === id);
        if (!members.includes(id) || !matchingEndpoints.has(id) || endpoint?.updatedAt !== revision) {
          throw Error('所选连接的标签、修订或服务路由归属已变化');
        }
      }
      const supplyIds = new Set(routedChannels.filter(row => selected.has(row.endpointId)).map(row => row.id));
      apply(routingTransaction(working, { operation: 'serviceRouteDraft', data: { serviceId: service.id, expectedVersion: route.activeVersion,
        config: { ...config, channels: config.channels.map(row => supplyIds.has(row.supplyId) ? { ...row, groupId: data.groupId } : row) } } }));
      return { type: 'batch', objectId: route.id, label: '按标签保存服务路由分组草稿', changes };
    }
    if (!['append', 'replace'].includes(data.mode) || typeof data.upstreamModelId !== 'string' || !data.upstreamModelId.trim()) throw Error('请选择模型接入方式及上游调用标识');
    const directoryOperationResults = data.targets.map(target => {
      try {
        const endpoint = working.endpoints.find(row => row.id === target?.endpointId && !row.deletedAt && row.directoryTags?.includes(data.tag));
        if (!endpoint || endpoint.providerId !== data.providerId || endpoint.updatedAt !== target.expectedUpdatedAt) throw Error('连接归属、标签或修订已变化');
        const provider = working.providers.find(row => row.id === endpoint.providerId && !row.deletedAt);
        const existing = supplierChannelAssociations(working, provider, endpoint.id).filter(row => row.modelId === data.modelId);
        if (data.mode === 'append') {
          if (existing.length) throw Error('已接入此模型，保留原配置');
          apply(operationsTransaction(working, { operation: 'supplierChannelRegister', data: {
            providerId: provider.id, endpointId: endpoint.id, expectedEndpointUpdatedAt: endpoint.updatedAt, modelId: data.modelId, upstreamModelId: data.upstreamModelId,
          } }));
        } else {
          if (existing.length !== 1 || endpoint.candidateConfiguration) throw Error('需存在唯一模型渠道，且当前连接没有待验证配置');
          const impact = channelChangeImpact(working, provider.id, endpoint.id);
          if (impact.services.some(service => service.associationIds.includes(existing[0].id))) throw Error('该模型渠道仍被生效服务引用，暂时无法替换');
          apply(operationsTransaction(working, { operation: 'supplierChannelEdit', data: {
            providerId: provider.id, endpointId: endpoint.id, associationId: existing[0].id, name: endpoint.name,
            modelId: data.modelId, upstreamModelId: data.upstreamModelId, baseUrl: endpoint.baseUrl,
            expectedUpdatedAt: endpoint.updatedAt, expectedProviderUpdatedAt: provider.updatedAt,
          } }));
        }
        return { endpointId: endpoint.id, status: '已完成' };
      } catch (error) { return { endpointId: target?.endpointId || '', status: '已跳过', reason: error.message }; }
    });
    return { type: 'batch', objectId: data.targets[0]?.endpointId, label: '按标签核对模型与映射', directoryOperationResults, changes };
  } else if (operation === 'channelDirectoryOperate') {
    const labels = { enable: '启用连接', disable: '停用连接', tag: '添加运维标签', untag: '移除运维标签',
      renameTag: '重命名运维标签', dissolveTag: '解散运维标签', replaceTags: '替换运维标签', clearTags: '清除运维标签' };
    if (!Object.hasOwn(labels, data.action) || data.confirmed !== true || !Array.isArray(data.targets) || !data.targets.length ||
      data.targets.length > 100 || new Set(data.targets.map(row => row?.endpointId)).size !== data.targets.length) throw Error('请核对并确认 1–100 条不重复的连接');
    if (data.associationIds !== undefined && (data.action !== 'enable' || data.targets.length !== 1 || !Array.isArray(data.associationIds) ||
      new Set(data.associationIds).size !== data.associationIds.length)) throw Error('请选择此连接内不重复的模型渠道');
    if (data.report === true && ['enable', 'disable'].includes(data.action) && data.sourceTag === undefined && data.associationIds === undefined) {
      const directoryOperationResults = data.targets.map(target => {
        try {
          if (!target?.endpointId || typeof target.endpointId !== 'string') throw Error('连接标识无效');
          apply(operationsTransaction(working, { operation, data: { ...data, report: false, targets: [target] } }));
          return { endpointId: target.endpointId, status: '已完成' };
        } catch (error) { return { endpointId: target?.endpointId || '', status: '已跳过', reason: error.message }; }
      });
      return { type: 'batch', objectId: data.targets[0]?.endpointId, label: '批量' + labels[data.action], directoryOperationResults, changes };
    }
    const tagging = ['tag', 'untag', 'renameTag', 'dissolveTag', 'replaceTags', 'clearTags'].includes(data.action);
    const tag = typeof data.tag === 'string' ? data.tag.trim() : '';
    const replacement = data.action === 'replaceTags' ? [...new Set(tag.split(/[,，]/u).map(value => value.trim()).filter(Boolean))] : [];
    const groupAction = ['renameTag', 'dissolveTag'].includes(data.action) || data.sourceTag !== undefined;
    const liveRows = working.endpoints.filter(row => !row.deletedAt && working.providers.some(provider => provider.id === row.providerId && !provider.deletedAt));
    const sourceTag = typeof data.sourceTag === 'string' ? data.sourceTag : '';
    if (groupAction) {
      const members = liveRows.filter(row => row.directoryTags?.includes(sourceTag));
      const selectedIds = new Set(data.targets.map(row => row?.endpointId));
      if (!sourceTag || members.length !== selectedIds.size || members.some(row => !selectedIds.has(row.id))) throw Error('标签成员已变化，请重新核对整个标签');
    }
    if (data.action === 'replaceTags' ? !replacement.length || replacement.length > 10 || replacement.some(value => value.length > 32 || /\p{Cc}/u.test(value)) :
      tagging && !['dissolveTag', 'clearTags'].includes(data.action) && (!tag || tag.length > 32 || /\p{Cc}/u.test(tag))) throw Error('请输入有效的运维标签，每条最多 32 字，每个连接最多 10 条');
    if (data.action === 'renameTag' && liveRows.some(row => row.directoryTags?.includes(tag))) throw Error('新标签名称已存在，请使用不同名称');
    for (const target of data.targets) {
      const provider = working.providers.find(row => row.id === target?.providerId && !row.deletedAt);
      const endpoint = working.endpoints.find(row => row.id === target?.endpointId && row.providerId === provider?.id && !row.deletedAt);
      if (!endpoint) throw Error('当前连接不存在');
      const name = endpoint.name;
      if (endpoint.updatedAt !== target.expectedUpdatedAt || !tagging &&
        channelChangeImpact(working, provider.id, endpoint.id).revision !== target.expectedImpactRevision) throw Error(name + '：连接或影响范围已变化，请重新核对');
      if (tagging) {
        const previous = endpoint.directoryTags || [];
        const directoryTags = data.action === 'clearTags' ? [] : data.action === 'replaceTags' ? replacement : data.action === 'tag' ? [...new Set([...previous, tag])]
          : data.action === 'renameTag' ? previous.map(value => value === sourceTag ? tag : value)
          : previous.filter(value => value !== (data.action === 'dissolveTag' ? sourceTag : tag));
        if (directoryTags.length > 10) throw Error(name + '：每条连接最多设置 10 个标签');
        if (JSON.stringify(directoryTags) !== JSON.stringify(previous)) update('endpoints', endpoint.id, { directoryTags });
      } else {
        if (data.action === 'enable') {
          if (endpoint.frozen || endpoint.candidateConfiguration || endpoint.serverTestJobs?.some(job => !job.receivedAt && !job.canceledAt)) throw Error(name + '：请先处理冻结、待验证配置或未完成的测试');
          if (!supplierChannelAssociations(working, provider, endpoint.id).length) throw Error(name + '：请先新增模型渠道');
          providerOp('supplierChannelEnable', provider.id, { endpointId: endpoint.id });
          if (data.associationIds?.length) {
            providerOp('supplierModelsEnable', provider.id, { endpointId: endpoint.id, associationIds: data.associationIds });
          }
          if (endpoint.directoryStopEvidence) update('endpoints', endpoint.id, { directoryStopEvidence: null, activationReason: null });
        } else providerOp('disableConnection', endpoint.id, { confirmed: true });
      }
      objectId ||= endpoint.id;
    }
    label = labels[data.action];
  } else if (operation === 'supplierChannelRegister') {
    const provider = working.providers.find(row => row.id === data.providerId);
    if (!provider || !providerCatalogueIds(provider).includes(data.modelId)) throw new Error('请选择当前服务商已登记的模型');
    const master = supplyModelRecord(working, provider, data.modelId);
    if (!master) throw new Error('当前供应模型尚未关联基础资料，请先维护模型资料');
    if (data.scenarios !== undefined && !Array.isArray(data.scenarios)) throw new Error('采购成本须为计费项列表');
    if(data.endpointId){
      const endpoint=working.endpoints.find(row=>row.id===data.endpointId && row.providerId===provider.id && !row.deletedAt);
      if(!endpoint || endpoint.updatedAt!==data.expectedEndpointUpdatedAt)throw Error('已有连接已变化，请重新选择');
      if(endpoint.adapterDraft)throw Error('待适配连接请先配置可用的适配器');
      if(['name','baseUrl','protocol','authMode','keyGroupId','apiKeyId','apiKey'].some(key=>data[key]!==undefined))throw Error('复用连接不能同时修改共享连接或密钥');
      if(!connectionCredentialsReady(endpoint,provider) || endpoint.candidateConfiguration)throw Error('请先完善已有连接及待验证配置');
      const issue=channelInterfaceIssue(provider,{modelId:data.modelId,endpoint});if(issue)throw Error(issue);
      providerOp('supplierAssociationSave',provider.id,{endpointId:endpoint.id,modelId:data.modelId,upstreamModelId:data.upstreamModelId,sourceName:data.sourceName,scenarios:data.scenarios || []});
      objectId=endpoint.id;label='复用连接接入模型渠道';
    }else{
    if(data.protocol!==undefined && !['OpenAI','Anthropic','其他'].includes(data.protocol)) throw Error('请选择已支持的上游协议');
    if (!['group', 'specific', 'independent'].includes(data.authMode)) throw new Error('请选择 API 密钥方式');
    let privateKey;
    if (data.authMode === 'independent') {
      privateKey = channelPrivateKey(data.apiKey);
    } else if (data.apiKey || data.authMode === 'group' && !providerKeyGroupKeys(provider, data.keyGroupId).some(key => !key.revokedAt)) throw new Error('请选择包含可用密钥的共享API密钥组');
    const created = providerOp('supplierChannelSave', provider.id, {
      name: data.name, baseUrl: data.baseUrl, protocol: data.protocol || (provider.defaultProtocol?.includes('Anthropic') ? 'Anthropic' : 'OpenAI'),
      ...(data.interfaceType || data.protocol ? {interfaceType:data.interfaceType || CHANNEL_INTERFACES.find(row=>row.protocol===data.protocol)?.id}:{}),
      authMode: privateKey ? 'inherit' : data.authMode, keyGroupId: data.keyGroupId, apiKeyId: data.apiKeyId,
    });
    const endpoint = created.changes.find(row => row.type === 'add' && row.collection === 'endpoints').record;
    update('endpoints', endpoint.id, { onboardingCreated: true, ...(privateKey ? { authMode: 'specific', keyGroupId: '', apiKeyId: privateKey.id, apiKeys: [privateKey] } : {}) });
    const issue = channelInterfaceIssue(provider, { modelId: data.modelId, endpoint });
    if (issue) throw new Error(issue);
    providerOp('supplierAssociationSave', provider.id, { endpointId: endpoint.id, modelId: data.modelId, upstreamModelId: data.upstreamModelId, sourceName: data.sourceName, scenarios: data.scenarios || [] });
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
    if (endpoint?.adapterDraft) throw Error('待适配连接请先配置可用的适配器');
    if (endpoint && (data.newProvider || data.providerPresetId || data.newApiKey || data.channelApiKey !== undefined || Object.keys(input).some(key => !['endpointId', 'models'].includes(key)))) throw new Error('追加模型只能引用已有渠道，不能同时修改连接或密钥');
    const privateKey = data.channelApiKey === undefined ? null : channelPrivateKey(data.channelApiKey);
    if (privateKey && (data.newApiKey || input.apiKeyId || input.authMode !== 'inherit' && (input.authMode !== 'group' || input.keyGroupId !== 'default'))) throw new Error('渠道专属密钥不能与其他凭证同时配置');
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
      if (input.apiKeyId || (input.keyGroupId && input.keyGroupId !== 'default')) throw new Error('新增密钥不能同时指定已有密钥或密钥组');
      if (Object.keys(data.newApiKey).some(key => !['maskedKey', 'fingerprint', 'accountRpm'].includes(key))) throw new Error('新增密钥只接受掩码、指纹和账号上限');
      providerOp('addApiKeys', provider.id, { apiKeys: [data.newApiKey], standalone: true });
      const added = working.providers.find(row => row.id === provider.id).apiKeys.find(row => row.fingerprint === data.newApiKey.fingerprint);
      values.authMode = 'specific'; values.apiKeyId = added.id;
    }
    if (!Array.isArray(input.models) || !input.models.length || input.models.length > 50) throw new Error('每批请选择 1–50 个模型');
    values.models = input.models.map(row => {
      if (!row || typeof row !== 'object') throw new Error('请选择有效的模型资料');
      const resolved = resolveOnboardingModel(working, row);
      let record = resolved.record;
      if (working.modelData?.archivedCatalogueIds?.includes(record.id)) throw new Error('该模型资料已归档，请选择其他模型');
      if (resolved.isDraft) {
        const { id: presetId, ...metadata } = record;
        record = { ...metadata, id: resourceId('model'), ...(row.modelPresetId ? { onboardingPresetId: presetId } : {}), revision: 1, updatedAt: new Date().toISOString() };
        add('modelTemplates', record);
      }
      return { libraryId: record.id, upstreamModelId: row.upstreamModelId ?? (row.newModel ? record.modelId : ''), scenarios: row.scenarios || [] };
    });
    const reuse = draft?.guided && endpoint && values.models.length===1 && provider.catalogConnections?.find(row=>row.endpointId===endpoint.id && !row.deletedAt && row.upstreamModelId===values.models[0].upstreamModelId && provider.catalogModels.some(master=>master.modelId===row.modelId && libraryRecord(working,master.libraryId)?.id===values.models[0].libraryId));
    const created = reuse ? null : providerOp(endpoint ? 'supplierModelsAdd' : 'supplierChannelCreate', provider.id, values), channel = endpoint || created?.changes.find(change => change.type === 'add' && change.collection === 'endpoints')?.record;
    if (!channel) throw new Error('渠道创建结果缺失');
    if (privateKey) update('endpoints', channel.id, { authMode: 'specific', keyGroupId: '', apiKeyId: privateKey.id, apiKeys: [privateKey] });
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
    if (!upstreamModelId || upstreamModelId.length > 200 || /\s/u.test(upstreamModelId)) throw new Error('上游模型调用标识 必填，最多 200 字符，不能包含空白');
    if (data.confirmed !== true) throw new Error('请确认修改后重新测试并启用');
    if (context.provider.catalogConnections.some(row => row.id !== context.association.id && !row.deletedAt && row.endpointId === context.endpoint.id && row.upstreamModelId === upstreamModelId)) throw new Error('此渠道已有相同上游模型调用标识');
    update('providers', context.provider.id, { catalogConnections: context.provider.catalogConnections.map(row => row.id === context.association.id ? { ...row, upstreamModelId, enabled: false, health: null, qualification: null, capabilityTests: [] } : row) });
    update('modelOnboardings', context.draft.id, { rows: context.draft.rows.map(row => ({ ...row, upstreamModelId })), draftRevision: context.draft.draftRevision + 1, updatedAt: new Date().toISOString() });
    objectId = context.association.id; label = '修正上游模型调用标识';
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
    if(model.serviceMode==='provider' && !providerServices(model).some(row=>row.providerId===context.provider.id))throw new Error('请先在对外服务中配置新增服务商的独立售价与模型调用标识');
    if(!context.supply)apply(operationsTransaction(working,{operation:'associateServiceChannels',modelId:model.id,data:{providerId:context.provider.id,catalogueModelId:context.association.modelId,channelIds:[context.association.id],confirmedIdentity:true,expectedUpdatedAt:model.updatedAt}}));
    objectId=model.id;label='关联新增供应';
  } else if (operation === 'guidedProfileSave') {
    const context = guidedOnboarding(working, data.draftId);
    if (!context?.master || context.connectionIssue || context.draft.draftRevision !== data.expectedDraftRevision || context.model?.listingStatus === '已上架' || (context.model?.id || null) !== (modelId || null)) throw new Error('接入模型、服务或进度已变化，请重新核对');
    if (data.values?.type !== context.master.type) throw new Error('模型类型须与本次接入的模型一致');
    const args={...data.values,...(!context.model?{libraryId:context.master.id}:{})};
    const profileAction={operation:context.model?'serviceBasics':'createServiceModel',modelId,data:args,deferServiceMode:true};
    const preview=modelTransaction(working,profileAction).changes.find(row=>row.collection==='models');
    const values={...context.model,...(preview.record || preview.changes)};
    requireModelBasics(values.profile);
    apply(operationsTransaction(working,{operation:'templateSave',data:{...metadata(values),id:context.master.id,modelId:context.master.modelId,confirmCapabilities:true}}));
    const saved = apply(modelTransaction(working,profileAction));
    update('modelOnboardings', context.draft.id, { profile: null, draftRevision: context.draft.draftRevision + 1, updatedAt: new Date().toISOString() });
    objectId = saved.objectId; label = '保存接入模型对外资料';
  } else if (operation === 'guidedServiceConfigure') {
    const context = guidedOnboarding(working, data.draftId), model = context?.model;
    if (!model || model.id !== modelId || !context.channel || context.connectionIssue) throw new Error(context?.connectionIssue || '接入模型与当前服务不匹配');
    if (model.listingStatus === '已上架') throw new Error('已上架服务请在服务管理中维护');
    if (context.draft.draftRevision !== data.expectedDraftRevision || model.updatedAt !== data.expectedUpdatedAt || (context.association.procurementRevision || 0) !== data.expectedPriceRevision || modelSaleRevision(working, modelId) !== data.expectedSaleVersion || providerPriceRevision(working, modelId, context.provider.id) !== data.expectedProviderSaleVersion) throw new Error('模型、采购价或平台售价已有修订，请重新核对');
    if (data.confirmed !== true) throw new Error('请确认采购价及平台售价');
    if (!context.supplyReady) throw new Error('请先在接通供应阶段确认有效采购条件');
    if (!storedServiceModes.has(model.serviceMode)) apply(operationsTransaction(working, { operation: 'serviceMode', modelId, data: { serviceMode: data.serviceMode, expectedUpdatedAt: model.updatedAt } }));
    else if (model.serviceMode !== data.serviceMode) throw new Error('服务模式设置后不可修改');
    if (data.serviceMode === 'standard') apply(operationsTransaction(working, { operation: 'unifiedPrice', modelId, data: { items: data.prices, expectedUpdatedAt: model.updatedAt, expectedSaleVersion: data.expectedSaleVersion } }));
    else {
      if (!providerServices(model).some(row => row.providerId === context.provider.id)) apply(operationsTransaction(working, { operation: 'associateServiceProvider', modelId, data: { providerId: context.provider.id, expectedUpdatedAt: model.updatedAt } }));
      apply(operationsTransaction(working, { operation: 'configureServiceProvider', modelId, data: { providerId: context.provider.id, callId: data.callId, items: data.prices, expectedUpdatedAt: model.updatedAt, expectedSaleVersion: data.expectedProviderSaleVersion } }));
    }
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
    if (data.confirmed !== true) throw new Error('请确认导入模型运营演示包');
    const prepared = prepareServiceShowcase(working);
    for (const collection of ['models','modelTemplates','providers','endpoints','modelSupplies','modelSalePrices','serviceRoutes','modelVersions','tenants']) for (const record of prepared[collection]) {
      const current = working[collection].find(item => item.id === record.id);
      if (!current) add(collection, record);
      else if (JSON.stringify(current) !== JSON.stringify(record)) update(collection, record.id, record);
    }
    objectId = SERVICE_SHOWCASE_ID; label = '导入模型运营演示包';
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
        modelOp('enableSupply', draft.modelId, { id: draft.supplyId });
        apply(operationsTransaction(working, { operation: 'completeOnboarding', data: { draftId: draft.id, publish: true } }));
        continue;
      }
      const master = modelMaterial(working, entry.libraryId);
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
      // Preparing verifies the mapping; service and sales are enabled only on final confirmation.
      modelOp('verify', onboarded.objectId, { id: current.supplyId, result: '通过' });
      update('modelOnboardings', current.id, { step: 'review', targetModelId: onboarded.objectId, libraryRevision: '', expectedSaleVersion: latestSaleRevision(working, current.supplyId) });
    }
    objectId = provider.id;
    label = `${{ saveSupplierBatch: '保存批量配置进度', prepareSupplierBatch: '保存配置并检查', publishSupplierBatch: '批量上架服务商模型' }[operation]} ${data.items.length} 个`;
  } else if (operation === 'templateDelete') {
    const issue = libraryRemovalIssue(working, data.id);
    if (issue) throw new Error(issue);
    if (data.confirmed !== true) throw new Error('请确认删除模型资料');
    const current = modelMaterial(working, data.id);
    referenceMaterial = { ...metadata(current), id: current.id, createdAt: current.createdAt, revision: current.revision, referenceDeletedAt: new Date().toISOString() };
    objectId = current.id; label = '删除模型资料';
  } else if (['templateSave', 'templatePublish', 'templateImport'].includes(operation)) {
    const publishing = operation === 'templatePublish';
    const onboarding = data.onboardingId && working.modelOnboardings.find(item => item.id === data.onboardingId && item.status !== '已完成');
    if (data.onboardingId && !onboarding) throw new Error('上架进度不存在或已完成，请重新进入资料库维护');
    const entries = operation === 'templateImport' ? data.models : [data];
    if (!Array.isArray(entries) || entries.length < 1 || entries.length > 500) throw new Error('每批需录入 1–500 个模型资料');
    const classification = classificationIndex(modelClassification(working));
    for (const input of entries) {
      const current = operation !== 'templateImport' && data.id ? modelMaterial(working, data.id) : null;
      if (operation !== 'templateImport' && data.id && !current) throw new Error('模型资料不存在');
      if (publishing && (!current || data.confirmed !== true || data.expectedBase !== materialBase(working, current))) {
        throw new Error('模型资料版本已变化，请重新核对后保存');
      }
      const value = publishing ? data.value : input;
      const entry = { ...value, profile: classifiedProfile(classification, value?.profile, { strict: operation === 'templateImport' }) };
      if (modelLibrary(working).some(record => record.id !== current?.id && record.modelId.toLowerCase() === entry.modelId?.trim().toLowerCase())) throw new Error('相同模型编码的资料已存在，请维护已有资料');
      const validated = validatedMaterial(working, current, { ...entry, modelId: current?.modelId || entry.modelId });
      const fields = { ...metadata(validated), revision: (current?.revision || 0) + 1, updatedAt: new Date().toISOString() };
      objectId = current?.id || resourceId('model');
      if (current) referenceMaterial = { id: current.id, createdAt: current.createdAt, ...fields };
      else add('modelTemplates', { id: objectId, ...fields });
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
    if (data.libraryId && !modelMaterial(working, data.libraryId)) throw new Error('模型资料不存在，请重新选择资料库记录');
    if (data.endpointId && !working.endpoints.some(item => item.id === data.endpointId && item.providerId === provider.id)) throw new Error('连接不属于当前服务商');
    const fields = { providerId: provider.id, catalogueModelId: data.catalogueModelId, endpointId: data.endpointId || '', targetModelId: data.targetModelId || '', targetRevision: data.targetRevision || '', expectedSaleVersion: data.expectedSaleVersion || '', confirmedIdentity: data.confirmedIdentity === true, model: data.model || null, prices: data.prices || [], sourceVersion: data.sourceVersion || '', ...(Array.isArray(data.selected) ? { selected: [...new Set(data.selected)] } : {}), step: ['select', 'metadata', 'price', 'review'].includes(data.step) ? data.step : 'select', status: '配置中' };
    fields.libraryId = libraryRecord(working,data.libraryId)?.id || '';
    fields.libraryRevision = data.libraryRevision ?? current?.libraryRevision ?? '';
    if (current && (current.providerId !== fields.providerId || current.catalogueModelId !== fields.catalogueModelId || current.targetModelId !== fields.targetModelId || libraryRecord(working, current.libraryId)?.id !== libraryRecord(working, fields.libraryId)?.id)) Object.assign(fields, { modelId: null, supplyId: null, prices: [], sourceVersion: '', expectedSaleVersion: '' });
    fields.salesVersion = data.salesVersion ?? current?.salesVersion ?? (current?.modelId ? salesSelectionVersion(working, current.modelId) : null);
    objectId = current?.id || resourceId('onboarding-task');
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
    const master = draft.libraryId ? modelMaterial(working, draft.libraryId) : matched.model || matched.template;
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
    if (supply && supply.upstreamModelId !== draft.catalogueModelId && supply.catalogueModelId !== draft.catalogueModelId) throw new Error('该平台模型已接入此服务商的其他上游模型调用标识，请核对已有配置');
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
      if (storedServiceModes.has(model.serviceMode)) throw new Error('请通过模型服务上架，不能独立售卖渠道');
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
  } else if (operation === 'createServiceModels') {
    const { libraryIds, serviceMode } = data;
    if (!Array.isArray(libraryIds) || !libraryIds.length || libraryIds.length > SERVICE_CREATION_LIMIT || libraryIds.some(id => typeof id !== 'string' || !id)) throw Error(`请选择 1–${SERVICE_CREATION_LIMIT} 个模型`);
    if (new Set(libraryIds).size !== libraryIds.length) throw Error('本次选择包含重复模型');
    for (const libraryId of libraryIds) {
      const source = serviceModelSources(working).find(model => model.id === libraryId);
      if (!source) throw Error('请选择渠道管理中已登记的模型；供应关系可能已变化');
      apply(modelTransaction(working, { operation: 'createServiceModel', data: { ...serviceModelSourceDraft(working, source), libraryId, serviceMode }, allowIncompleteProfile: true }));
    }
    objectId = 'models';
    label = `批量新增 ${libraryIds.length} 个模型服务`;
  } else if (operation === 'createServiceModel') {
    const created=apply(modelTransaction(working,{operation,data}));
    objectId=created.objectId;
    label='新增模型服务';
  } else if (operation === 'serviceBasics') {
    modelOp('serviceBasics',modelId,data); objectId=modelId; label='修改模型资料';
  } else if (operation === 'unifiedPrice') {
    const model = working.models.find(item => item.id === modelId);
    if (!model || model.serviceMode !== 'standard') throw new Error('请为具体模型服务配置售价');
    if (data.expectedUpdatedAt !== model.updatedAt || data.expectedSaleVersion !== modelSaleRevision(working, modelId)) throw new Error('模型或统一售价已有并发修订，请重新打开配置');
    const items = retailItems(working,data.items,activeModelSalePrice(working,modelId)?.items);
    const version = Math.max(0,...working.modelSalePrices.filter(price => price.modelId === modelId && price.scope === 'model').map(price => price.version)) + 1;
    add('modelSalePrices', { id:resourceId('sale-price-version'), modelId, scope:'model', serviceModeRevision:model.serviceModeRevision || 0, items, version, effectiveAt:new Date().toISOString(), status:'已发布' });
    objectId=modelId; label='配置统一售价';
  } else if (['serviceProviderListing','serviceProviderServing'].includes(operation)) {
    const model=working.models.find(item=>item.id===modelId), entry=model && providerOffer(model,data.providerId);
    const provider=working.providers.find(item=>item.id===entry?.providerId);
    if (!model || model.serviceMode!=='provider' || !entry || !provider) throw new Error('服务商服务不存在');
    if (data.expectedUpdatedAt!==model.updatedAt) throw new Error('模型服务已有并发修订，请重新打开配置');
    if (typeof data.enabled!=='boolean') throw new Error('请选择有效的服务商服务状态');
    if (operation==='serviceProviderServing' && data.enabled) {
      const serviceId = providerServiceId(modelId, offerKey(entry));
      const failed=publicationChecks(working,model,{technical:true,serviceId}).filter(row=>row.tab!=='platform' && !row.passed);
      if(failed.length)throw Error('请先完善技术配置：'+failed.map(row=>row.label).join('；'));
    }
    const field=operation==='serviceProviderListing'?'marketVisible':'callsEnabled';
    const openingFirst = field === 'callsEnabled' && data.enabled && model.callsEnabled !== true;
    const serviceProviders = model.serviceProviders.map(item => {
      if (item === entry) return { ...item, [field]: data.enabled };
      // Preserve the effective state of sibling services when opening a stopped model.
      if (openingFirst && item.status !== '已移除' && item.callsEnabled !== false) return { ...item, callsEnabled: false };
      return item;
    });
    update('models',modelId,{serviceProviders,...(openingFirst ? { callsEnabled: true, status: '运行中' } : {})});
    label=operation==='serviceProviderListing'?(data.enabled?'展示渠道服务':'隐藏渠道服务'):(data.enabled?'启动渠道服务':'停止渠道服务');objectId=modelId;
  } else if (['associateServiceProvider','configureServiceProvider','configureServiceIdentity','removeServiceProvider'].includes(operation)) {
    const model=working.models.find(item=>item.id===modelId);
    if (!model || model.serviceMode!=='provider') throw new Error('请选择已关联的服务商');
    const key=(operation==='associateServiceProvider' && data.channelId) || data.providerId, entries=model.serviceProviders || [];
    const current=entries.find(item=>offerKey(item)===key), serviceId=providerServiceId(modelId,key);
    const provider=working.providers.find(item=>item.id===(current?.providerId || data.providerId));
    if (!provider) throw new Error('请选择已有服务商');
    if (data.expectedUpdatedAt!==model.updatedAt) throw new Error('模型服务已有并发修订，请重新打开配置');
    let entry;
    if (operation==='associateServiceProvider') {
      if (provider.status!=='已启用') throw new Error('服务商已停用');
      if (current && current.status!=='已移除') throw new Error('该渠道服务已关联');
      const channel=data.channelId && availableServiceChannels(working,provider,data.catalogueModelId).find(row=>row.id===data.channelId);
      if (data.channelId && (!channel || channelBlockReason(provider,channel) || resolveChannelAssociationModel(working,provider,channel).id!==libraryRecord(working,modelId)?.id)) throw Error('请选择当前模型下已检测并启用的渠道');
      entry={providerId:provider.id,code:providerCode(provider),callId:'',status:'已关联',...(channel?{channelId:channel.id,channelName:channel.name,listingStage:'unlisted',callsEnabled:false,createdAt:current?.createdAt || new Date().toISOString()}:{}),...(listed(model)?{pendingPublication:true}:{})};
      label=channel?'关联渠道服务':'关联已有服务商';
    } else {
      if (!current || current.status==='已移除') throw new Error('服务商关联不存在');
      if (operation==='removeServiceProvider') {
        if (current.channelId ? ['formal','gray'].includes(offerStage(model,current)) : current.marketVisible!==false) throw new Error('请先下架当前服务商渠道，再解绑');
        const supplies=modelSupplies(working,modelId).filter(item=>item.provider?.id===provider.id && (!current.channelId || item.channelId===current.channelId));
        if (serviceBindingInUse({...working,serviceRoutes:working.serviceRoutes.filter(route=>route.serviceId!==serviceId)},modelId,supplies)) throw new Error('服务商渠道仍被其他服务路由引用，请先解除引用');
        for (const route of working.serviceRoutes.filter(item=>item.serviceId===serviceId)) update('serviceRoutes',route.id,{activeVersion:0,draft:null,draftUpdatedAt:null});
        for (const supply of supplies) update('modelSupplies',supply.id,{status:'已移除',salesEnabled:false});
        entry={...current,status:'已移除',callsEnabled:false};label='解绑服务商';
      } else {
        if (provider.status!=='已启用') throw new Error('服务商已停用');
        const callId=typeof data.callId==='string'?data.callId.trim():'';
        if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(callId)) throw new Error('模型调用标识 必填，最多200字，仅支持英文、数字及 . _ / -');
        if (working.models.some(item=>item.id===callId || modelCode(item)===callId || providerServices(item).some(service=>!(item.id===modelId && offerKey(service)===key) && service.callId===callId))) throw new Error('模型调用标识 已存在');
        if(current.callId && current.callId!==callId) {
          if(['formal','gray'].includes(offerStage(model,current)) || current.callsEnabled!==false)throw Error('先下架模型并停用此服务商服务，再修改模型调用标识');
          if(data.confirmed!==true)throw Error('请确认模型调用标识变更对客户的影响');
        }
        if (operation !== 'configureServiceIdentity') {
          if (data.expectedSaleVersion!==providerPriceRevision(working,modelId,key)) throw new Error('服务商平台售价已有并发修订，请重新核对');
          const items=retailItems(working,data.items,activeProviderPrice(working,modelId,key)?.items), version=Math.max(0,...working.modelSalePrices.filter(price=>price.modelId===modelId && price.scope==='provider' && offerKey(price)===key).map(price=>price.version))+1;
          add('modelSalePrices',{id:resourceId('sale-price-version'),modelId,providerId:provider.id,...(current.channelId?{channelId:current.channelId}:{}),serviceId,scope:'provider',serviceModeRevision:model.serviceModeRevision || 0,items,version,effectiveAt:new Date().toISOString(),status:'已发布'});
        }
        entry={...current,callId};label=operation === 'configureServiceIdentity' ? '保存模型调用标识' : '配置 Provider 对外服务';
      }
    }
    update('models',modelId,{serviceProviders:[...entries.filter(item=>offerKey(item)!==key),{...entry,updatedAt:new Date().toISOString()}]});
    objectId=modelId;
  } else if (operation==='removeServiceChannel') {
    const model=working.models.find(item=>item.id===modelId), supply=modelSupplies(working,modelId).find(item=>item.id===data.supplyId);
    if (!model || !supply) throw new Error('模型或渠道关联不存在');
    if (!['standard','provider'].includes(model.serviceMode)) throw new Error('请先配置服务模式');
    if (data.expectedUpdatedAt!==model.updatedAt) throw new Error('模型服务已有并发修订，请重新核对');
    if (serviceBindingInUse(working,modelId,[supply])) throw new Error('渠道仍被生效路由或路由草稿引用，暂时无法解除关联');
    update('modelSupplies',supply.id,{status:'已移除',salesEnabled:false});objectId=modelId;label='解除渠道关联';
  } else if (operation === 'associateServiceChannelsBatch') {
    const model=working.models.find(item=>item.id===modelId);
    if (!model || model.serviceMode!=='standard') throw new Error('请在对应模型服务关联渠道');
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
      if (modelSupplies(working,modelId).some(item=>item.channelId===channel.id || !item.channelId && item.endpointId===channel.endpointId && item.upstreamModelId===channel.upstreamModelId)) throw new Error('该渠道已关联当前模型');
      const result=modelOp('supply',modelId,{endpointId:channel.endpointId,upstreamModelId:channel.upstreamModelId,capabilities:model.capabilities});
      const supply=result.changes.find(item=>item.collection==='modelSupplies').record;
      update('modelSupplies',supply.id,{catalogueModelId:data.catalogueModelId,channelId:channel.id,salesEnabled:false});
      apply(operationsTransaction(working,{operation:'verifySupply',modelId,data:{id:supply.id}}));
    }
    objectId=modelId; label='关联渠道';
  } else if (operation === 'serviceMode') {
    const model = working.models.find(item => item.id === modelId);
    if (!model) throw new Error('模型不存在');
    if (storedServiceModes.has(model.serviceMode)) throw new Error('服务模式设置后不可修改');
    if (!['已上架','已下架'].includes(model.listingStatus)) throw new Error('模型上架状态无效，请重新载入数据');
    if (data.expectedUpdatedAt !== model.updatedAt) throw new Error('模型已有并发修订，请重新打开配置后核对');
    if (typeof data.serviceMode !== 'string' || !storedServiceModes.has(data.serviceMode)) throw new Error('请选择一种有效的服务模式');
    const configureCallId = Object.hasOwn(data,'callId');
    if (configureCallId && data.serviceMode!=='standard') throw Error('请在对应模型服务设置调用标识');
    if (model.listingStatus==='已上架') {
      if (data.confirmDownlist!==true) throw new Error('请确认模型下架后再设置服务模式');
      modelOp('unlist',modelId,{});
    }
    update('models', modelId, { serviceMode: data.serviceMode });
    if (configureCallId) apply(operationsTransaction(working,{
      operation:'configureServiceModelIdentity',modelId,
      data:{callId:data.callId,expectedUpdatedAt:model.updatedAt,confirmed:true},
    }));
    objectId = modelId; label = '设置服务模式';
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
    if (working.models.find(item=>item.id===modelId)?.serviceMode === 'standard') throw new Error('请配置模型服务售价');
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
  return { type: 'batch', label, objectId, changes, ...(referenceMaterial && { referenceMaterial }) };
}
