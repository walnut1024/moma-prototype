import {trackUserConfiguration} from "../mock/application-data.js";
import {applyModelDataset,trackModelUserChanges} from "../mock/model-data.js";
import { MOMA_PROVIDER } from './moma-provider.js';
import { platformPublicationFingerprint } from './platform-publication-state.js';
import { modelAuditContext, modelAuditChanges } from './model-operation-history.js';


import { enterpriseTransaction } from "./enterprise.js";
import { individualTransaction } from "./individual-users.js";
import { modelTransaction } from "./model-management.js";
import { providerTransaction } from "./provider-management.js";
import { adminAccountTransaction } from './admin-accounts.js';
import { deploymentTransaction, deploymentUsesArtifact } from './deployments.js';
import { operationsTransaction } from './model-operations.js';
import { lifecycleSignature, assertOrderAccess } from '../service-access.mjs';
const now='2026-09-15T10:30:00+08:00';
const record=(id,value)=>({id,createdAt:now,updatedAt:now,...value});
export function canMutate(role, action) {
  if (action.type === 'deploymentOperation') return ['平台管理员', '运维人员'].includes(role);
  if (action.type === 'modelOperations') return ['installModelCatalogue', 'cleanModelCatalogue'].includes(action.operation) ? role === '平台管理员' : ['平台管理员', '运营人员'].includes(role);
  if (action.type === 'adminAccount') return role === '平台管理员';
  if (action.type === 'providerOperation') return ['平台管理员', '运营人员'].includes(role);
  if (action.type === "individual") return ["平台管理员", "运营人员"].includes(role);
  if (action.type === 'modelOperation') return ['平台管理员', '运营人员'].includes(role) || (role === '财务人员' && ['priceDraft', 'pricePublish', 'procurement'].includes(action.operation));
  if (action.type === "enterprise") return ["平台管理员", "运营人员"].includes(role);
  if (action.type === "setRole" || role === "平台管理员") return true;
  if (role === "只读观察员") return false;
  const collection = action.collection || action.changes?.[0]?.collection || (action.type === "setSettings" ? "settings" : "");
  const allowed = {
    运营人员: ["providers","endpoints","supplyPrices","models","modelVersions","validations","tenants","projects","memberships","users","organizations","apiKeys","grants","products","prices","orders","announcements"],
    运维人员: ["clusters","artifacts","deployments","routes","limits","fallbacks","releases","caches","alerts","incidents","integrations"],
    财务人员: ["prices","orders","ledger","bills","settlements","adjustments"],
    安全管理员: ["apiKeys"],
  };
  return allowed[role]?.includes(collection) || false;
}

export function commitAdminState(state, action, actor = state.currentRole) {
  const archivingAcceptance = action.type === 'modelOperations' && action.operation === 'archiveAcceptanceFixture';
  if (action.type === 'setRole') throw new Error('请通过后台 mock 账号切换身份');
  if (action.type === 'enterAdmin') {
    const account = state.admins.find(row => row.id === action.accountId && row.status === '已启用');
    if (!account) throw new Error('后台账号不可用');
    return { ...state, adminSession: { accountId: account.id }, currentRole: account.role, revision: state.revision + 1 };
  }
  const cleaningCatalogue = action.type === 'modelOperations' && action.operation === 'cleanModelCatalogue';
  const installingCatalogue = action.type === 'modelOperations' && action.operation === 'installModelCatalogue';
  const preparingDataset = action.type === 'modelOperations' && action.operation === 'prepareServiceShowcase';
  const publishingCommercial = action.type === 'modelOperations' && action.operation === 'commercialPublish';
  const commercialKind = publishingCommercial ? action.data?.kind : null;
  const ordinaryListing = action.type === 'modelOperation' && ['publish', 'unlist'].includes(action.operation);
  // Supplier controls must not cancel in-flight tasks belonging to other suppliers.
  const supplierLifecycle = action.type === 'modelOperations' && ['serviceProviderListing','serviceProviderServing','removeServiceProvider'].includes(action.operation);
  const deletingLibrary = action.type === 'modelOperations' && action.operation === 'templateDelete';
  const directChanges=action.type==='batch'?action.changes:[action];
  if (action.type!=='modelOperations' && directChanges?.some(change=>change.collection==='models' && ['callsEnabled','listingStatus','releaseStage','releaseTenantIds','salesScope','purpose','archivedAt','marketVisible','openScope','tenantIds','commercialDrafts','commercialPublications','materialDraft','materialPublication','lifecycleStopReason','requestGeneration','serviceProviders','serviceMode','serviceModeRevision'].some(key=>Object.hasOwn(change.changes || change.record || {},key)) || change.collection==='modelSalePrices' && ['model','provider'].includes((change.record || change.changes)?.scope || state.modelSalePrices.find(price=>price.id===change.id)?.scope))) throw new Error('模型服务关联及售价须通过服务管理操作');
  if (action.type !== 'modelOperations' && directChanges?.some(change => change.collection === 'modelTemplates' && ['materialDraft', 'materialPublication'].some(key => Object.hasOwn(change.changes || change.record || {}, key)))) throw new Error('模型资料须通过模型资料维护操作');
  if (action.type!=='modelOperations' && directChanges?.some(change=>change.collection==='endpoints' && Object.hasOwn(change.changes || change.record || {},'frozen'))) throw new Error('渠道冻结状态须通过供应管理操作');
  const isEnterprise = ['enterprise', 'individual', 'adminAccount'].includes(action.type);
  if (action.type !== 'adminAccount' && (action.collection === 'admins' || Array.isArray(action.changes) && action.changes.some(change => change.collection === 'admins'))) throw new Error('后台账号须通过账号管理操作');
  if (action.type !== 'modelOperations' && (action.collection === 'serviceRoutes' || Array.isArray(action.changes) && action.changes.some(change => change.collection === 'serviceRoutes'))) throw new Error('服务路由须通过路由管理操作');
  if (action.type !== 'modelOperations' && (action.collection === 'tariffDictionary' || Array.isArray(action.changes) && action.changes.some(change => change.collection === 'tariffDictionary'))) throw new Error('资费字典须通过字典维护操作');
  if (!canMutate(actor, action)) throw new Error(`${actor}无权执行此操作`);
  if (action.type === "enterprise") action = enterpriseTransaction(state, action);
  if (action.type === "individual") action = individualTransaction(state, action, actor);
  if (action.type === "modelOperations") action = operationsTransaction(state, action);
  if (action.type === "modelOperation") action = modelTransaction(state, action);
  if (action.type === 'providerOperation') action = providerTransaction(state, action);
  if (action.type === 'adminAccount') action = adminAccountTransaction(state, action);
  if (action.type === 'deploymentOperation') action = deploymentTransaction(state, action);
  if (action.type === 'update' && action.collection === 'artifacts' && action.changes.status === '已删除' && state.deployments.some(item => deploymentUsesArtifact(item, action.id))) throw new Error('该制品被部署或回滚配置引用，不能删除');
  if ((action.type === 'batch' ? action.changes : [action]).some(change => change.type === 'remove' && change.collection === 'providers' && change.id === MOMA_PROVIDER.id)) throw new Error('内置平台服务商不可删除');
  const next = state.cloudOperations ? {...state,...Object.fromEntries(['models','modelTemplates','providers','endpoints','modelSupplies','modelSalePrices','supplyPrices','modelVersions','validations','modelOnboardings','serviceRoutes','tariffDictionary','modelData'].map(key=>[key,structuredClone(state[key])])),audits:[...state.audits]} : structuredClone(state), timestamp = new Date().toISOString();
  if (action.type === "setRole") next.currentRole = action.role;
  else if (action.type === "setSettings") next.settings = { ...next.settings, ...action.changes };
  else if (action.type === "add") {
    if (!Array.isArray(next[action.collection])) throw new Error("未知数据集合");
    if (next[action.collection].some(item => item.id === action.record.id)) throw new Error("记录 ID 已存在");
    next[action.collection].unshift({ createdAt: timestamp, updatedAt: timestamp, ...action.record });
  } else if (action.type === "update") {
    const index = next[action.collection]?.findIndex(item => item.id === action.id) ?? -1;
    if (index < 0) throw new Error("记录不存在");
    next[action.collection][index] = { ...next[action.collection][index], ...action.changes, updatedAt: timestamp };
  } else if (action.type === "batch") {
    for (const change of action.changes) {
      if (!Array.isArray(next[change.collection])) throw new Error("未知数据集合");
      if (change.type === "add") {
        if (next[change.collection].some(item => item.id === change.record.id)) throw new Error("记录 ID 已存在");
        next[change.collection].unshift({ createdAt: timestamp, updatedAt: timestamp, ...change.record });
      } else {
        const index = next[change.collection].findIndex(item => item.id === change.id);
        if (index < 0) throw new Error("记录不存在");
        if (change.type === 'remove') {
          if (change.collection !== 'tariffDictionary' && !(deletingLibrary && change.collection === 'modelTemplates') && !(archivingAcceptance && ['providers','endpoints','models','modelSupplies','modelVersions','validations','serviceRoutes'].includes(change.collection))) throw new Error('不支持删除此集合');
          next[change.collection].splice(index, 1);
        } else next[change.collection][index] = { ...next[change.collection][index], ...change.changes, updatedAt: timestamp };
      }
    }
  } else throw new Error("未知操作");
  for (const order of next.orders.filter(row => !state.orders.some(old => old.id === row.id) || row.status === '已开通' && state.orders.find(old => old.id === row.id)?.status !== '已开通')) assertOrderAccess(next, order);
  for (const model of next.models) {
    const before = state.models.find(row => row.id === model.id);
    if (before && publishingCommercial && Object.entries(model.commercialPublications || {}).some(([key, value]) => before.commercialPublications?.[key]?.version !== value.version)) {
      model.platformPublications = (model.platformPublications || []).map(row => row.fingerprint === platformPublicationFingerprint(state, before, row.serviceId) ? { ...row, fingerprint: platformPublicationFingerprint(next, model, row.serviceId) } : row);
    }
    if (before && !supplierLifecycle && !(publishingCommercial && commercialKind === 'price') && lifecycleSignature(before) !== lifecycleSignature(model)) {
      model.accessGeneration = (before.accessGeneration || 0) + 1;
      if (!ordinaryListing) model.requestGeneration = (before.requestGeneration || 0) + 1;
    }
  }
  if (['users', 'tenants', 'memberships', 'grants'].some(key => JSON.stringify(state[key]) !== JSON.stringify(next[key]))) next.identityGeneration = (state.identityGeneration || 0) + 1;
  const currentAdmin = next.admins.find(row => row.id === next.adminSession?.accountId);
  if (currentAdmin) next.currentRole = currentAdmin.role;
  next.revision += 1; next.updatedAt = timestamp;
  const auditBefore = modelAuditContext(state, action), auditAfter = modelAuditContext(next, action);
  if (action.type !== "setRole") next.audits.unshift(record(`audit-${next.revision}`, { createdAt: timestamp, updatedAt: timestamp, actor, action: action.label || action.type, objectId: action.record?.id || action.id || action.objectId || "batch", objectLabel: auditAfter.objectLabel, relatedModelIds: [...new Set([...auditBefore.relatedModelIds, ...auditAfter.relatedModelIds])], relatedEndpointIds:[...new Set([...auditBefore.relatedEndpointIds,...auditAfter.relatedEndpointIds])], result: action.auditFailure ? '失败' : '成功', changes: modelAuditChanges(state,action), ...(action.auditFailure ? { reason: action.auditFailure } : {}), before: isEnterprise ? action.changes.filter(change => change.type === 'update').map(change => ({ collection: change.collection, id: change.id, values: Object.fromEntries(Object.keys(change.changes).map(key => [key, state[change.collection].find(item => item.id === change.id)?.[key]])) })) : null, after: action.record || action.changes }));
  if (preparingDataset) next.modelData = applyModelDataset(state).modelData;
  else if (installingCatalogue) {
    const added = next.modelTemplates.filter(row => !state.modelTemplates.some(before => before.id === row.id)).map(row => row.id);
    next.modelData = { ...next.modelData, builtinIds: { ...next.modelData?.builtinIds, modelTemplates: [...new Set([...(next.modelData?.builtinIds?.modelTemplates || []), ...added])] }, catalogueIds: [...new Set([...(next.modelData?.catalogueIds || []), ...action.catalogueIds])] };
  } else if (cleaningCatalogue || archivingAcceptance) next.modelData = { ...next.modelData, archivedCatalogueIds: action.archivedCatalogueIds };
  else trackModelUserChanges(state, next);
  if(!state.cloudOperations)trackUserConfiguration(state, next);
  return next;
}

