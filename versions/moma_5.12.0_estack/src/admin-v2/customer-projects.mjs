import { internalSpace } from '../operating-space.mjs';
import { projectModelEnabled } from '../project-access.mjs';
import { activeCustomer, lifecycleAccess, serviceReferences } from '../service-access.mjs';

export function customerKeys(state, tenantId) {
  return state.apiKeys.filter(key => (tenantId === undefined || key.tenantId === tenantId) && key.kind !== 'experience' &&
    key.status !== '已删除' && !key.id.startsWith('experience:'));
}

export function customerModelIds(state, tenantId) {
  const services = serviceReferences(state);
  const allowed = new Set(services.filter(service => lifecycleAccess(state, service, tenantId).allowed).map(service => service.modelId));
  for (const model of state.models) {
    if (!model.serviceMode && lifecycleAccess(state, { model }, tenantId).allowed) allowed.add(model.id);
  }
  if (state.customerOrderScope === 'space' && !internalSpace(state.spacePolicy,state.tenants.find(row=>row.id===tenantId))) {
    const ordered=new Set((state.orders || []).filter(row=>row.tenantId===tenantId && ['生效中','已开通'].includes(row.status) &&
      (!row.expiresAt || Date.parse(row.expiresAt)>Date.now())).flatMap(row=>row.modelIds || []));
    return new Set([...allowed].filter(id=>ordered.has(id)));
  }
  return allowed;
}

export function keyProjectAccess(tenant, project, key, allowedModels, at = Date.now()) {
  const models = project && project.tenantId === tenant.id && key.tenantId === tenant.id && key.projectId === project.id
    ? (key.modelIds || []).filter(id => allowedModels.has(id) && projectModelEnabled(tenant.type === '个人' ? {...project,inheritsSpaceModels:true} : project, id)) : [];
  const reason = !activeCustomer(tenant) ? '租户已冻结'
    : !project || project.tenantId !== tenant.id || key.tenantId !== tenant.id || key.projectId !== project.id ? '项目归属异常'
    : project.status !== '正常' ? '项目当前不可用'
    : key.status !== '有效' ? 'API 密钥当前不可用'
    : key.expiresAt && !(Date.parse(key.expiresAt) > at) ? 'API 密钥已过期'
    : models.length === 0 ? '没有符合条件的模型' : '';
  return { models, reason };
}

const yuan = new Intl.NumberFormat('zh-CN', { maximumFractionDigits:6 });
export const yuanMicros = micros => Number.isSafeInteger(micros) ? yuan.format(micros / 1_000_000) + ' 元' : '未记录';

export function projectBillAmount(bill, projectId) {
  if (!Array.isArray(bill.projectBreakdown)) return undefined;
  const entry = bill.projectBreakdown.find(row => row.projectId === projectId);
  return entry ? entry.amountMicros : bill.unassignedMicros === 0 ? null : undefined;
}
