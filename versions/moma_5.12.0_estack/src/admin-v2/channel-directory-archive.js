import { providerRemovalPlan, providerRemovalTransaction } from './provider-removal.js';

export function directoryDisabledKind(endpoint) {
  if (endpoint.status === '自动停用' || ['停用', '已停用'].includes(endpoint.status) && endpoint.activationSource === 'automatic') return 'automatic';
  if (['停用', '已停用'].includes(endpoint.status) && endpoint.activationSource === 'manual') return 'manual';
  return '';
}

export function directoryArchivePlan(state, providerId, endpointId, { mode = 'selected', includeAutomatic = false } = {}) {
  const target = { providerId, endpointId };
  const endpoint = state.endpoints.find(row => row.id === endpointId && row.providerId === providerId && !row.deletedAt);
  if (!endpoint || !state.providers.some(row => row.id === providerId && !row.deletedAt)) return { target, reason: '连接已归档或归属已变化' };
  const kind = directoryDisabledKind(endpoint);
  if (mode === 'disabled' && (kind !== 'manual' && !(includeAutomatic && kind === 'automatic'))) {
    return { target, kind, reason: '当前停用状态不在确认范围内' };
  }
  const plan = providerRemovalPlan(state, target);
  const reasons = [...plan.blockers];
  if (plan.routes.some(row => row.active)) reasons.push('仍被生效路由引用');
  if (plan.routes.some(row => row.draft)) reasons.push('仍被待发布路由引用');
  if (plan.rows.some(row => row.needsStop)) reasons.push('关联服务需先停服或下架');
  if (plan.supplies.some(row => row.status === '已启用')) reasons.push('仍有启用的模型供给');
  if (endpoint.candidateConfiguration) reasons.push('仍有待验证的连接配置');
  return {
    target, kind, reason: reasons.join('；'),
    associations: plan.associations.length, services: plan.rows.length, routes: plan.routes.length,
    signature: JSON.stringify([plan.signature, endpoint.status, kind, endpoint.candidateConfiguration?.id || null]),
  };
}

export function directoryArchiveBatch(working, data, apply) {
  const { mode, includeAutomatic, targets } = data;
  if (data.confirmed !== true || !['selected', 'disabled'].includes(mode) || typeof includeAutomatic !== 'boolean' ||
    !Array.isArray(targets) || !targets.length || targets.length > 100 ||
    targets.some(target => !target || typeof target.providerId !== 'string' || typeof target.endpointId !== 'string' || typeof target.signature !== 'string') ||
    new Set(targets.map(target => target.endpointId)).size !== targets.length) throw Error('请核对并确认 1–100 条不重复的连接');

  const reviewed = targets.map(target => {
    const plan = directoryArchivePlan(working, target.providerId, target.endpointId, { mode, includeAutomatic });
    return { ...target, reason: plan.reason || (plan.signature === target.signature ? '' : '连接或引用范围已变化，请重新核对') };
  });
  return reviewed.map(row => {
    const receipt = { endpointId: row.endpointId, providerId: row.providerId };
    if (row.reason) return { ...receipt, status: '已跳过', reason: row.reason };
    const fresh = directoryArchivePlan(working, row.providerId, row.endpointId, { mode, includeAutomatic });
    if (fresh.reason) return { ...receipt, status: '已跳过', reason: fresh.reason };
    const target = { providerId: row.providerId, endpointId: row.endpointId };
    let transaction;
    try {
      const plan = providerRemovalPlan(working, target);
      transaction = providerRemovalTransaction(working, { operation: 'providerRemovalCommit',
        data: { target, confirmed: true, expectedSignature: plan.signature } });
    } catch (error) {
      return { ...receipt, status: '失败', reason: error.message };
    }
    apply(transaction);
    return { ...receipt, status: '已归档' };
  });
}
