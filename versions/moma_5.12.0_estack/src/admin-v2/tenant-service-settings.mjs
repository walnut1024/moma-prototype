import { enterpriseGrant } from './enterprise.js';
import { activeCustomer, offerGrayTenants, offerStage, providerOffer, offerKey, salesCustomer, serviceCallsEnabled, serviceReferences } from '../service-access.mjs';
import { tenantQuotaEnabled } from '../tenant-service-policy.mjs';

export const TENANT_SERVICE_LEVELS = ['L0','L1','L2','L3','L4','L5'];
export const tenantModelHasTpm = model => ['text','multimodal','embedding','rerank'].includes(model?.type);

export function tenantModelCatalogue(state, tenantId) {
  const catalogue = new Map();
  for (const service of serviceReferences(state)) {
    const { model, modelId, callId } = service;
    const row = catalogue.get(modelId) || { calls:new Set(), availability:'' };
    if (callId) row.calls.add(callId);
    const entry = service.providerId ? providerOffer(model,offerKey(service)) : null;
    const stage = offerStage(model,entry);
    if (callId && !model.deletedAt && model.visibility==='公开' && serviceCallsEnabled(model,entry) && (!model.salesScope || salesCustomer(model,tenantId))) {
      if (stage==='formal') row.availability='已上架';
      else if (!row.availability && stage==='gray' && offerGrayTenants(model,entry).includes(tenantId)) row.availability='灰度上架';
    }
    catalogue.set(modelId,row);
  }
  return catalogue;
}

export function tenantModelRules(state, tenant, catalogue) {
  if (Array.isArray(tenant.modelRules)) return tenant.modelRules;
  const grant = enterpriseGrant(state,tenant.id);
  const ids = Array.isArray(grant?.modelIds)
    ? (grant.status==='生效中' ? grant.modelIds : [])
    : [...catalogue].filter(([,model])=>model.availability).map(([id])=>id);
  return [...new Set(ids)].map(modelId=>({modelId,rpm:null,tpm:null}));
}

export function tenantServiceTransaction(state, action, at = Date.now()) {
  const { tenantId, operation, data } = action;
  const tenant = state.tenants.find(row => row.id === tenantId);
  if (!activeCustomer(tenant)) throw Error('请先启用租户');
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('请填写配置');
  const updateTenant = changes => [{type:'update', collection:'tenants', id:tenantId, changes}];
  if (operation === 'level') {
    if (!TENANT_SERVICE_LEVELS.includes(data.level)) throw Error('请选择 L0 至 L5 的服务等级');
    return { label:'设置服务等级', changes:updateTenant({serviceLevel:data.level}) };
  }
  if (['open-models','model-limits','remove-model'].includes(operation)) {
    const catalogue = tenantModelCatalogue(state,tenantId);
    const rules = tenantModelRules(state,tenant,catalogue);
    const opened = new Set(rules.map(row=>row.modelId));
    const save = (label,modelRules)=>({label,changes:updateTenant({modelRules})});
    if (operation==='open-models') {
      const { modelIds } = data;
      if (!Array.isArray(modelIds) || !modelIds.length || new Set(modelIds).size!==modelIds.length) throw Error('请选择要授权的模型服务');
      if (modelIds.some(id=>opened.has(id))) throw Error('已授权，请刷新后重试');
      if (modelIds.some(id=>!catalogue.get(id)?.availability)) throw Error('存在当前租户无法授权的模型服务');
      return save('授权模型服务',[...modelIds.map(modelId=>({modelId,rpm:null,tpm:null})),...rules]);
    }
    const { modelId, rpm, tpm } = data;
    if (!opened.has(modelId)) throw Error('该模型服务尚未授权');
    if (operation==='remove-model') return save('移除授权',rules.filter(row=>row.modelId!==modelId));
    if ([rpm,tpm].some(value=>value!==null && (!Number.isSafeInteger(value) || value<1))) throw Error('RPM 和 TPM 须为正整数');
    if (tpm!==null && !tenantModelHasTpm(state.models.find(row=>row.id===modelId))) throw Error('该模型不支持 TPM 限流');
    return save('设置租户模型限流',rules.map(row=>row.modelId===modelId ? {...row,rpm,tpm} : row));
  }
  if (operation === 'quota') {
    const grant = enterpriseGrant(state,tenantId);
    const used = grant?.used ?? 0;
    if (typeof data.enabled !== 'boolean' || typeof data.reason !== 'string' || !data.reason.trim() || data.reason.trim().length > 500) {
      throw Error('请填写调整原因（最多 500 字）');
    }
    if (!data.enabled && !tenantQuotaEnabled(grant)) throw Error('配额尚未启用');
    const limit = data.enabled ? data.limit : grant?.limit;
    if (!Number.isSafeInteger(limit) || limit < used || data.enabled && limit < 1) throw Error('总额度须为正整数，且不低于已用额度');
    if (data.enabled && (typeof data.expiresAt !== 'string' || !(Date.parse(data.expiresAt) > at))) throw Error('有效期须晚于当前时间');
    if ((!grant && !action.ids?.grant) || !action.ids?.ledger) throw Error('缺少配额操作标识');
    const changes = { quotaEnabled:data.enabled, limit, used, expiresAt:data.enabled ? new Date(data.expiresAt).toISOString() : grant.expiresAt ?? null };
    return { label:'调整租户 Token 配额', changes:[
      grant ? {type:'update',collection:'grants',id:grant.id,changes} : {type:'add',collection:'grants',record:{
        id:action.ids.grant,subjectId:tenantId,subjectType:'tenant',period:'total',status:'生效中', ...changes }},
      { type:'add',collection:'ledger',record:{id:action.ids.ledger,accountId:tenantId,sourceId:action.ids.ledger,
        type:'租户配额调整', delta:limit-(grant?.limit || 0), balance:limit-used, reason:data.reason.trim(), status:'已完成', ...changes} },
    ] };
  }
  throw Error('未知租户配置操作');
}
