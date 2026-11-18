import { supplierChannelAssociations } from './supplier-resources.js';
import { channelChangeImpact } from './channel-change-management.js';
import { connectionFingerprint, connectionKeys, connectionCredentialsReady } from './connection-state.js';
import { resolveChannelAssociationModel } from './channel-association-model.js';
import { channelModelUrl } from './provider-channels.js';
import { prepareChannelEnableConfirmation } from './channel-enable-confirmation.js';
import { channelSelectionSnapshot } from './channel-selection.js';
import { channelSelectionServiceImpact } from './channel-selection-impact.js';
import { providerRemovalPlan } from './provider-removal.js';

export function channelBatchInterface(state, provider, row, baseUrl = row.endpoint.baseUrl) {
  let type; try { type = resolveChannelAssociationModel(state, provider, row).type; } catch { return ''; }
  const probe = [row.task, row.health?.task, row.qualification?.task].find(task => ['speech', 'transcription'].includes(task));
  return channelModelUrl({ ...row.endpoint, baseUrl }, type, { probe });
}

export function supplierChannelBatchPlan(state, providerId, associationIds) {
  const provider = state.providers.find(row => row.id === providerId && !row.deletedAt);
  if (!provider) throw Error('服务商不存在或已移除');
  if (!Array.isArray(associationIds) || !associationIds.length || associationIds.length > 500 || associationIds.some(id => typeof id !== 'string') || new Set(associationIds).size !== associationIds.length) throw Error('请选择 1–500 条不重复的模型渠道');
  const all = supplierChannelAssociations(state, provider);
  const selected = associationIds.map(id => {
    const row = all.find(row => row.id === id);
    if (!row) throw Error('模型渠道已变化，请重新选择');
    const master = resolveChannelAssociationModel(state, provider, row);
    if (master.archivedAt) throw Error('模型资料已归档，请重新选择');
    return row;
  });
  const connections = [...new Set(selected.map(row => row.endpointId))].map(id => {
    const impact = channelChangeImpact(state, provider.id, id);
    const endpoint = state.endpoints.find(row => row.id === id && !row.deletedAt);
    if (!endpoint) throw Error('连接已移除，请重新选择');
    return { endpoint, impact, rows: impact.mappings, selected: selected.filter(row => row.endpointId === id) };
  });
  const affected = connections.flatMap(row => row.rows);
  const signature = JSON.stringify([provider.id, provider.status,
    selected.map(row => [row.id, row.modelId, row.upstreamModelId, row.sourceName, row.name]).sort(),
    connections.map(({ endpoint, impact }) => [endpoint.id, connectionFingerprint(endpoint), connectionKeys(endpoint, provider, true).map(key => [key.id, key.fingerprint, key.status, key.revokedAt]), endpoint.candidateConfiguration?.id, impact.revision]).sort()]);
  return { provider, selected, connections, affected, additional: affected.filter(row => !associationIds.includes(row.id)), signature };
}

export function channelBatchTasks(state, plan, candidate = false, endpointIds) {
  return plan.connections.filter(({ endpoint }) => !endpointIds || endpointIds.includes(endpoint.id)).flatMap(({ endpoint, rows, selected }) => {
    const chosen = candidate ? rows : selected;
    const projected = candidate ? { ...endpoint, ...endpoint.candidateConfiguration?.config } : endpoint;
    const keys = candidate && projected.authMode === 'pool' ? connectionKeys(projected, plan.provider).map(key => key.id) : [undefined];
    const tasks = [];
    for (const keyId of keys.length ? keys : [undefined]) for (let i = 0; i < chosen.length; i += 50) {
      const channels = chosen.slice(i, i + 50);
      let issue = !projected.interfaceType ? '请先配置明确的上游接口类型' : !connectionCredentialsReady(projected, plan.provider) ? '当前连接缺少可用 API 密钥' : '';
      try { channels.forEach(row => resolveChannelAssociationModel(state, plan.provider, row)); } catch (error) { issue = error.message; }
      tasks.push({ key: endpoint.id + ':' + (keyId || '') + ':' + i, endpointId: endpoint.id, keyId,
        associationIds: channels.map(row => row.id), issue });
    }
    return tasks;
  });
}

export function channelBatchRowResult(tasks, results, associationId, activeKey, candidateCheck) {
  if (candidateCheck?.passed) return { status: '通过', message: '' };
  if (candidateCheck?.evidence && candidateCheck.evidence.result !== '通过') return { status: '失败', message: candidateCheck.reason || '候选测试未通过' };
  const relevant = tasks.filter(task => task.associationIds.includes(associationId));
  const failed = relevant.flatMap(task => {
    const result = results[task.key], item = result?.batch?.items?.find(item => item.model.associationId === associationId);
    return result?.error ? [result.error] : item && ['failed', 'unknown', 'cancelled'].includes(item.status) ? [item.message || '测试未通过'] : [];
  });
  if (failed.length) return { status: '失败', message: failed.join('；') };
  if (relevant.length && relevant.every(task => results[task.key]?.batch?.items?.some(item => item.model.associationId === associationId && item.status === 'passed'))) return { status: '通过', message: '' };
  if (relevant.some(task => task.key === activeKey)) return { status: '测试中', message: '' };
  return { status: '等待中', message: '' };
}

export function supplierChannelLifecyclePlan(state, providerId, associationIds, action) {
  if (!['enable', 'disable'].includes(action)) throw Error('请选择启用或停用渠道');
  const plan = supplierChannelBatchPlan(state, providerId, associationIds);
  const selections = plan.selected.map(association => channelSelectionSnapshot({ provider: plan.provider, modelId: association.modelId, association }));
  const references = providerRemovalPlan(state, { providerId, associationIds });
  const blockers = [...references.blockers];
  if (action === 'enable') for (const connection of plan.connections) {
    try { prepareChannelEnableConfirmation(state, providerId, connection.endpoint.id, connection.selected.map(row => row.id)); }
    catch (error) { blockers.push(error.message); }
  }
  const serviceImpact = channelSelectionServiceImpact(state, selections);
  const shared = plan.connections.flatMap(({ endpoint, rows }) => rows.filter(row => !associationIds.includes(row.id)).map(row => ({ ...row,
    effect: action === 'enable' && !['运行中', '需关注'].includes(endpoint.status) ? '连接恢复，未选渠道保持停用' : '保持原状' })));
  const signature = JSON.stringify([plan.signature, action, selections, plan.selected.map(row => row.enabled), references.signature, serviceImpact]);
  return { ...plan, selections, serviceImpact, references, shared, blockers: [...new Set(blockers)], signature };
}
