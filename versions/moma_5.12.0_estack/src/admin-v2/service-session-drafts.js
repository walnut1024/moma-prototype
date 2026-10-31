import { useEffect, useState } from 'react';

const PREFIX = 'moma-5120-service-return:';
const MAX_AGE = 24 * 60 * 60 * 1000;
const consumed = new Set();
const fields = {
  'unified-association': ['query', 'providerId', 'catalogueId', 'selected', 'expectedUpdatedAt'],
  'provider-association': ['providerId', 'catalogueId', 'selected', 'expectedUpdatedAt'],
  'channel-content': ['query'],
  route: ['config', 'baseline', 'expectedVersion', 'dirty', 'query', 'participantGroup', 'participants'],
};
const pick = (value, keys) => Object.fromEntries(keys.filter(key => Object.hasOwn(value || {}, key)).map(key => [key, structuredClone(value[key])]));
function routeConfig(value) {
  const config = pick(value, ['strategy', 'autoFailover', 'excludeAbnormal', 'autoRecover']);
  config.groups = (value?.groups || []).map(group => pick(group, ['id', 'name', 'strategy']));
  config.channels = (value?.channels || []).map(row => pick(row, ['supplyId', 'enabled', 'groupId', 'weight', 'priority']));
  config.advanced = pick(value?.advanced, ['timeoutSeconds', 'maxRetries', 'failureThreshold', 'recoverySeconds', 'latencyWindowSeconds', 'costBasis']);
  return config;
}
function safeValues(kind, input) {
  if (!fields[kind]) throw new Error('服务草稿类型无效');
  const value = pick(input, fields[kind]);
  if (kind === 'route') {
    const configs = [input.config, input.baseline, ...(input.participants ? [input.participants.config] : [])];
    if (!configs.every(config => config && Array.isArray(config.channels) && config.channels.length <= 20 && Array.isArray(config.groups) && config.groups.length > 0 && config.groups.length <= 10)) throw new Error('服务路由草稿结构无效');
    value.config = routeConfig(input.config); value.baseline = routeConfig(input.baseline);
    value.participants = input.participants ? { config: routeConfig(input.participants.config), dirty: input.participants.dirty === true } : null;
  }
  if (value.selected && (!Array.isArray(value.selected) || value.selected.length > 20 || value.selected.some(id => typeof id !== 'string' || id.length > 2000))) throw new Error('服务草稿的选中范围无效');
  return value;
}
export const serviceSessionContext = (state, model, sourceVersion = '') => ({ role: state.currentRole, modelId: model.id, updatedAt: model.updatedAt || '', serviceMode: model.serviceMode || '', modeRevision: model.serviceModeRevision || 0, sourceVersion: String(sourceVersion) });
function contextIssue(snapshot, current) {
  if (snapshot.role !== current.role) return '当前角色已变化，请按当前权限重新核对草稿。';
  if (snapshot.modelId !== current.modelId) return '草稿不属于当前模型服务，未自动应用。';
  if (JSON.stringify(snapshot) !== JSON.stringify(current)) return '服务或路由版本已变化，原输入保留，请按当前配置重新核对。';
  return '';
}
export function saveServiceSessionDraft(state, model, { kind, scope = '', values, sourceVersion = '' }, storage) {
  const id = crypto.randomUUID(), record = { id, kind, scope, savedAt: Date.now(), context: serviceSessionContext(state, model, sourceVersion), values: safeValues(kind, values) };
  try { (storage || globalThis.sessionStorage).setItem(PREFIX + id, JSON.stringify(record)); }
  catch { throw new Error('暂时无法保存返回草稿，当前输入保留，请重试或先保存配置。'); }
  return id;
}
export function readServiceSessionDraft(state, model, params, { kind, scope = '', sourceVersion = '' }, storage) {
  const id = params.get('serviceSession');
  if (!id || consumed.has(id) || params.get('serviceSessionKind') !== kind) return null;
  let record;
  try { const raw = (storage || globalThis.sessionStorage).getItem(PREFIX + id); if (!raw) return null; record = JSON.parse(raw); }
  catch { return { id, error: '返回草稿无法读取，当前配置仍可继续操作。', values: null }; }
  if (record.id !== id || record.kind !== kind || record.scope !== scope || record.context?.modelId !== model.id) return null;
  if (!Number.isFinite(record.savedAt)) return { id, error: '返回草稿时间无效，未恢复到当前配置。', values: null };
  let values; try { values = safeValues(kind, record.values); } catch { return { id, error: '返回草稿内容无效，未恢复到当前配置。', values: null }; }
  return { ...record, values, error: Date.now() - record.savedAt > MAX_AGE ? '返回草稿已超过24小时，请按当前配置重新核对。' : contextIssue(record.context, serviceSessionContext(state, model, sourceVersion)) };
}
export function consumeServiceSessionDraft(id, storage) {
  if (!id) return;
  consumed.add(id);
  try { (storage || globalThis.sessionStorage).removeItem(PREFIX + id); } catch { /* A consumed reference cannot replay in this session. */ }
}
export function clearServiceSessionReference(hash, id) {
  const [base, query = ''] = hash.split('?'), params = new URLSearchParams(query);
  if (params.get('serviceSession') !== id) return hash;
  params.delete('serviceSession'); params.delete('serviceSessionKind');
  return `${base}${params.size ? `?${params}` : ''}`;
}
export function serviceSupplyNavigation(origin, id, kind, { providerId, endpointId }) {
  if (!/^#\/admin-2\/listing(?:\?|$)/.test(origin)) throw new Error('当前服务返回位置无效');
  const [base, query = ''] = origin.split('?'), params = new URLSearchParams(query);
  params.set('serviceSession', id); params.set('serviceSessionKind', kind);
  return { patch: { provider: providerId, perspective: 'suppliers', tab: 'catalogue', resource: endpointId || null, origin: `${base}?${params}` }, options: { base: 'providers', saved: true } };
}
export function leaveServiceForSupply(state, model, ops, draft, target) {
  try {
    const id = saveServiceSessionDraft(state, model, draft), navigation = serviceSupplyNavigation(location.hash, id, draft.kind, target);
    ops.go(navigation.patch, navigation.options);
    return true;
  } catch (error) { ops.setError(error.message); return false; }
}
export function useServiceSessionDraft(state, model, ops, context) {
  const [snapshot, setSnapshot] = useState(() => readServiceSessionDraft(state, model, ops.params, context));
  useEffect(() => { if (snapshot?.id) { consumeServiceSessionDraft(snapshot.id); const hash=clearServiceSessionReference(location.hash,snapshot.id);if(hash!==location.hash)history.replaceState(history.state,'',hash);if (snapshot.values && ['route', 'unified-association', 'provider-association'].includes(context.kind)) ops.dirty(context.kind === 'route' ? snapshot.values.dirty === true : Boolean(snapshot.values.selected?.length)); } }, []);
  const current = serviceSessionContext(state, model, context.sourceVersion);
  const issue = snapshot ? snapshot.error || contextIssue(snapshot.context, current) : '';
  return { values: snapshot?.values, restored: Boolean(snapshot?.values), issue, blocked: Boolean(issue && snapshot?.values), dismiss:()=>setSnapshot(null), recheck: () => setSnapshot(record => record ? { ...record, error: '', context: current } : null) };
}
