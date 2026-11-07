import { withinRouteLimits } from './routing-policy.js';
import { routingChannels, routingServices, comparableRouteCosts } from './service-routing.js';
import mockConfig from '../mock/catalogues.json' with { type: 'json' };
import { assertPublishedAccess, readLinkedState as browserReadLinkedState } from '../service-access.mjs';
export const SCENARIOS = mockConfig["admin-v2/mock-onboarding-service.js"]["SCENARIOS"];
export function createMockEngine({initialState,storage:getStorage,notify=()=>{},localState}={}) {
const readLinkedState=()=>localState || browserReadLinkedState();
// Mock state is isolated from other prototype versions and never sends network requests.
const STORAGE_KEY = 'moma-5120-model-onboarding-mock-v1';
let memory = initialState && (localState?.cloudOperations ? initialState : structuredClone(initialState)), runtime;
const now = () => new Date(Date.now()).toISOString();
const uid = () => crypto.randomUUID();
const copy = value => structuredClone(value);
const stable = value => value && typeof value === 'object' ? Array.isArray(value) ? value.map(stable) : Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const hash = value => { const input = typeof value === 'string' ? value : JSON.stringify(stable(value)); let result = 2166136261; for (let i = 0; i < input.length; i++) result = Math.imul(result ^ input.charCodeAt(i), 16777619); return `mock-${(result >>> 0).toString(16).padStart(8, '0')}`; };
const fail = (code, message) => { const error = new Error(message); error.code = code; error.traceId = uid(); throw error; };
const text = (value, label, max = 200) => { if (typeof value !== 'string' || !value.trim() || value.length > max) fail('invalid_field', `请填写有效的${label}`); return value.trim(); };
const initial = () => ({ version: 1, scenario: 'success', clock: Date.now(), credentials: [], channels: [], batches: [], services: [], identities: [], clientKeys: [], usage: [], operations: {}, changes: [], audits: [] });
function read() {
  const storage = getStorage?.(), raw = storage?.getItem(STORAGE_KEY);
  const state = raw ? JSON.parse(raw) : storage ? initial() : localState?.cloudOperations ? (memory ||= initial()) : copy(memory || initial());
  if (state.version !== 1) fail('storage_version', '接入工作区版本不匹配，请保留数据后处理');
  return state;
}
// Cloud snapshots are immutable: reads share them; a write receives its own copy.
const readForWrite = () => localState?.cloudOperations ? copy(read()) : read();
function save(state) { getStorage?.()?.setItem(STORAGE_KEY, JSON.stringify(state)); memory = localState?.cloudOperations ? state : copy(state); notify(); }
const credential = (state, channel) => state.credentials.find(item => item.id === channel.credentialId);
const requestConfiguration = channel => [channel.interfaceType, channel.baseUrl, channel.taskUrls || {}, channel.authMode, channel.credentialId, channel.apiVersion, channel.workspaceId, channel.tokenLimitField, channel.imageSize, channel.voice, channel.statusPath];
const channelSignature = (state, channel) => hash([requestConfiguration(channel), credential(state, channel)?.version, credential(state, channel)?.status, channel.configVersion]);
const channelById = (state, id) => { const channel = state.channels.find(item => item.id === id); if (!channel) fail('channel_not_found', '渠道不存在'); return channel; };
const serviceById = (state, id) => { const service = state.services.find(item => item.id === id); if (!service) fail('service_not_found', '服务不存在'); return service; };
function audit(state, action, objectId) { state.audits.push({ id: uid(), action, objectId, at: now(), source: 'mock' }); }
function once(state, action, body, execute, hideSecret = false, scope = '') {
  const operationId = text(body.operationId, '操作 ID', 200), key = scope ? `${scope}:${operationId}` : operationId, fingerprint = hash([action, body]), prior = state.operations[key];
  if (prior) { if (prior.fingerprint !== fingerprint) fail('idempotency_conflict', '同一操作 ID 不能提交不同内容'); if (prior.error) throw Object.assign(new Error(prior.error.message), copy(prior.error), { persistMockState: true }); return copy(prior.response); }
  try {
    const response = execute(), stored = copy(response);
    if (hideSecret) { delete stored.token; delete stored.clientKey; }
    state.operations[key] = { action, fingerprint, response: stored };
    audit(state, action, response.id || operationId);
    return response;
  } catch (error) {
    if (error.persistMockState) { state.operations[key] = { action, fingerprint, error: { code: error.code, message: error.message, traceId: error.traceId, attempts: copy(error.attempts || []) } }; audit(state, action + 'Failed', operationId); }
    throw error;
  }
}
function resultFor(scenario, model, index) {
  if (scenario === 'timeout') return { status: 'unknown', code: 'request_timeout', message: '等待响应超时，执行结果未知，请先查询任务状态。', stage: model.type === 'video' ? 'poll' : 'request', upstreamStatus: null };
  const issues = mockConfig["admin-v2/mock-onboarding-service.js"]["issues"];
  const issue = issues[scenario] || scenario === 'partial' && index % 2 === 1 && [503, 'upstream_unavailable', '此模型暂不可用。'] || scenario === 'asyncfail' && (model.probe || model.type) === 'video' && [502, 'async_task_failed', '异步任务创建后执行失败。'];
  if (issue) return { status: 'failed', upstreamStatus: issue[0], code: issue[1], message: issue[2], stage: scenario === 'protocol' ? 'parse' : scenario === 'asyncfail' ? 'poll' : 'request', retryAfter: scenario === 'ratelimit' ? 30 : null };
  return { status: 'passed', meteringUnknown: scenario === 'metering_unknown', upstreamStatus: 200, message: '任务返回有效结果。', stage: ['image', 'audio', 'video'].includes(model.type) ? 'artifact' : 'parse', code: '', usage: scenario === 'metering_unknown' ? null : ['text', 'multimodal', 'embedding', 'rerank'].includes(model.type) ? { requests: 1, input_tokens: 8, output_tokens: model.type === 'embedding' ? 0 : 2, total_tokens: model.type === 'embedding' ? 8 : 10 } : { requests: 1, seconds: ['audio', 'video'].includes(model.type) ? 1 : undefined, characters: model.type === 'audio' ? 2 : undefined } };
}
function advance(state) {
  const until = Date.now(); let clock = Math.min(state.clock || until, until), turns = 0;
  while (turns++ < 10000) {
    for (const batch of state.batches) for (const [index, item] of batch.items.entries()) if (item.status === 'running' && Date.parse(item.scheduledEndAt) <= clock) {
      Object.assign(item, batch.cancelRequested ? { status: 'unknown', message: '已取消后续执行；已提交任务结果未知。', code: 'cancelled_after_dispatch', stage: item.stage } : resultFor(batch.scenario, item.model, index), { endedAt: new Date(clock).toISOString(), durationMs: clock - Date.parse(item.startedAt), current: batch.signature === channelSignature(state, channelById(state, batch.channelId)) });
      item.result = ({ passed: '通过', failed: '失败', unknown: '结果未知', cancelled: '已取消' })[item.status];
    }
    const active = new Map();
    for (const batch of state.batches) for (const item of batch.items) if (item.status === 'running') active.set(batch.channelId, (active.get(batch.channelId) || 0) + 1);
    for (const batch of state.batches) {
      if (!['queued', 'running'].includes(batch.status) || Date.parse(batch.createdAt) > clock) continue;
      if (batch.cancelRequested) for (const item of batch.items) if (item.status === 'queued') Object.assign(item, { status: 'cancelled', result: '已取消', endedAt: new Date(clock).toISOString(), stage: 'queued', message: '待执行测试已取消。' });
      for (const item of batch.items) if (!batch.cancelRequested && item.status === 'queued' && (active.get(batch.channelId) || 0) < 2) {
        try { assertAvailable(state, channelById(state, batch.channelId)); } catch (issue) { Object.assign(item, { status: 'failed', result: '失败', code: issue.code, message: issue.message, endedAt: new Date(clock).toISOString(), stage: 'request', current: false }); continue; }
        const key = credential(state, channelById(state, batch.channelId));
        if (key?.accountRpm) {
          state.rateEvents ||= {}; const recent = (state.rateEvents[key.id] || []).filter(time => time > clock - 60000);
          if (recent.length >= Number(key.accountRpm)) { Object.assign(item, { status: 'failed', result: '失败', code: 'account_rate_limit', message: '当前共享账号已达到请求上限。', upstreamStatus: 429, retryAfter: 60, endedAt: new Date(clock).toISOString(), stage: 'request' }); continue; }
          state.rateEvents[key.id] = [...recent, clock];
        }
        item.upstreamRequestId ||= 'mock-request-' + uid(); if (item.model.type === 'video') item.taskId ||= 'mock-task-' + uid();
        item.status = 'running'; item.stage = item.model.type === 'video' ? 'poll' : 'request'; item.startedAt = new Date(clock).toISOString(); item.scheduledEndAt = new Date(clock + (item.model.type === 'video' ? 3000 : ['image', 'audio'].includes(item.model.type) ? 1600 : 800)).toISOString(); batch.startedAt ||= item.startedAt; active.set(batch.channelId, (active.get(batch.channelId) || 0) + 1);
      }
      if (batch.items.every(item => !['queued', 'running'].includes(item.status))) { batch.status = batch.cancelRequested ? 'cancelled' : 'completed'; batch.endedAt = new Date(clock).toISOString(); } else batch.status = 'running';
    }
    const next = Math.min(...state.batches.flatMap(batch => batch.items.filter(item => item.status === 'running').map(item => Date.parse(item.scheduledEndAt))), ...state.batches.filter(batch => ['queued', 'running'].includes(batch.status) && Date.parse(batch.createdAt) > clock).map(batch => Date.parse(batch.createdAt)));
    if (!Number.isFinite(next) || next > until || next <= clock) break;
    clock = next;
  }
  state.clock = until;
}
const getMockScenario = () => read().scenario;
function setMockScenario(value) { if (!SCENARIOS.some(([id]) => id === value)) fail('invalid_scenario', '请选择有效场景'); const state = readForWrite(); state.scenario = value; save(state); }
function prices(input = []) {
  if (!Array.isArray(input)) fail('invalid_prices', '价格格式无效');
  return input.map(item => { if (!item.id || !Number.isSafeInteger(item.amount) || item.amount < 0 || !item.currency || !item.unit || !Number.isFinite(Date.parse(item.effectiveAt))) fail('invalid_prices', '请补齐价格版本、金额、单位和生效时间'); return { id: item.id, amount: item.amount, currency: item.currency, unit: item.unit, effectiveAt: item.effectiveAt, expiresAt: item.expiresAt || null }; });
}
function activePrices(input, at) {
  const latest = new Map();
  for (const item of [...input].filter(row => Date.parse(row.effectiveAt) <= at).sort((a, b) => Date.parse(b.effectiveAt) - Date.parse(a.effectiveAt))) if (!latest.has(item.unit)) latest.set(item.unit, item);
  const selected = [...latest.values()].sort((a, b) => a.id.localeCompare(b.id));
  return selected.length && selected.every(item => !item.expiresAt || Date.parse(item.expiresAt) > at) ? selected : null;
}
function totalPrice(selected, usage) {
  if (!selected) return null;
  const items = selected.map(price => { const count = ({ request: 1, million_tokens: usage?.total_tokens, million_input_tokens: usage?.input_tokens, million_output_tokens: usage?.output_tokens, second: usage?.seconds, character: usage?.characters })[price.unit]; return count == null ? null : { amount: Math.ceil(price.amount * count / (price.unit.startsWith('million_') ? 1000000 : 1)), currency: price.currency, priceVersion: price.id }; });
  if (items.some(item => !item) || new Set(items.map(item => item.currency)).size !== 1) return null;
  return { amount: items.reduce((sum, item) => sum + item.amount, 0), currency: items[0].currency, unit: 'micro', priceVersion: selected.map(item => item.id).join('+'), items };
}
function normalizeCandidate(state, body, previous = {}) {
  const input = { ...previous, ...body }, publicModelId = text(input.publicModelId, '对外调用标识');
  if (/\s/.test(publicModelId) || !['standard', 'provider'].includes(input.mode)) fail('service_incomplete', '请配置对外调用标识 和服务模式');
  const bindings = (input.bindings || []).map(binding => { channelById(state, binding.channelId); return { id: text(binding.id || `${binding.channelId}:${binding.model?.id}`, '供给 ID'), channelId: binding.channelId, model: copy(binding.model), procurementPrices: prices(binding.procurementPrices || []) }; });
  const route = input.route || { version: 1, strategy: 'priority', channels: [] };
  if (!['fixed', 'priority', 'weighted', 'priority_weighted', 'load', 'tpm', 'latency', 'cost'].includes(route.strategy || 'priority') || !Number.isInteger(route.version) || route.channels.some(row => !bindings.some(binding => binding.id === row.bindingId))) fail('invalid_route', '路由须引用明确关联的供给');
  return { ...(input.technical === true ? { technical: true, purpose: input.purpose === 'internal' ? 'internal' : 'commercial' } : {}), name: input.name || publicModelId, publicModelId, mode: input.mode, tenantIds: [...new Set(input.tenantIds || [])], capabilities: [...new Set(input.capabilities || [])], bindings, salePrices: prices(input.salePrices || []), route: { ...copy(route), strategy: route.strategy || 'priority', channels: route.channels.map((row, index) => ({ bindingId: row.bindingId, priority: row.priority ?? index + 1, weight: row.weight ?? 1, ...(row.enabled === false ? { enabled: false } : {}) })), autoFailover: route.autoFailover === true } };
}
function assertAvailable(state, channel, { live = false, model } = {}) {
  if (runtime) {
    const provider = runtime.providers.find(row => row.id === channel.providerId), key = credential(state, channel), localKey = key?.localKeyId && runtime.keys.find(row => row.providerId === channel.providerId && row.id === key.localKeyId);
    if (key?.localKeyId && (!localKey || localKey.revokedAt || localKey.status === 'disabled')) fail('credential_unavailable', '当前密钥已移除、停用或撤销');
    if (live) {
      const endpoint = runtime.endpoints.find(row => row.id === channel.clientChannelId);
      if (!provider || provider.status !== '已启用' || !endpoint || endpoint.deletedAt || endpoint.frozen || !['运行中', '需关注'].includes(endpoint.status)) fail('supply_unavailable', '当前服务商或渠道已停用');
      const association = runtime.associations.find(row => row.providerId === channel.providerId && row.endpointId === endpoint.id && (model?.associationId ? row.id === model.associationId : row.masterId === model?.id && row.upstreamModelId === model?.upstreamModelId));
      if (!association || association.deletedAt || association.enabled === false) fail('supply_unavailable', '当前模型关联已移除或停用');
    }
  }
  if (channel.needsValidation || channel.disabled || channel.supersededBy || channel.authMode !== 'none' && credential(state, channel)?.status !== 'active') fail('supply_unavailable', '渠道已停用、已替换或凭证不可用'); }
function evidence(state, binding, capabilities = []) {
  const channel = channelById(state, binding.channelId); assertAvailable(state, channel);
  const signature = channelSignature(state, channel), proofs = [];
  for (const check of ['', ...capabilities]) {
    const matching = state.batches.flatMap(batch => batch.channelId === channel.id && batch.signature === signature ? batch.items.filter(item => item.model.id === binding.model.id && item.model.upstreamModelId === binding.model.upstreamModelId && (item.model.probe || item.model.type) === (binding.model.probe || binding.model.type) && (item.model.check || '') === check).map(item => ({ batchId: batch.id, ...item, at: item.endedAt || item.startedAt || batch.createdAt })) : []).reverse().sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    const latest = matching[0];
    if (!latest || latest.status !== 'passed' || !latest.current || Date.now() - Date.parse(latest.endedAt) > 86400000) fail('validation_required', `供给 ${binding.id} 的${check || '基础'}检查待完成或需重测`);
    proofs.push({ batchId: latest.batchId, itemId: latest.id, check });
  }
  return { bindingId: binding.id, signature, evidenceSource: 'mock', evidenceIds: proofs };
}
const activeRouteChannels = config => config.route.channels.filter(row => row.enabled !== false && (!['weighted', 'priority_weighted'].includes(config.route.strategy) || row.weight > 0));
function qualify(state, service) {
  const config = service.candidate;
  if (!config.tenantIds.length || !activeRouteChannels(config).length || !config.technical && !activePrices(config.salePrices, Date.now())) fail('service_incomplete', '客户范围、有效售价和路由尚未完整');
  return activeRouteChannels(config).map(row => { const binding = config.bindings.find(item => item.id === row.bindingId); if (!config.technical && !activePrices(binding.procurementPrices, Date.now())) fail('procurement_price_required', '采购价缺失或已过期'); return evidence(state, binding, config.capabilities); });
}
function routeOrder(config) {
  const weighted = rows => { const pool = [...rows], result = []; while (pool.length) { let target = Math.random() * pool.reduce((sum, row) => sum + row.weight, 0), index = 0; while (index < pool.length - 1 && (target -= pool[index].weight) >= 0) index++; result.push(...pool.splice(index, 1)); } return result; };
  let allowed = activeRouteChannels(config).sort((a, b) => a.priority - b.priority);
  const local=runtime && readLinkedState(),needsMetrics=['load','tpm','latency','cost'].includes(config.route.strategy) || local?.endpoints?.some(row=>row.rpmLimit!=null || row.tpmLimit!=null || row.metrics?.rpmLimit!=null || row.metrics?.tpmLimit!=null),service=needsMetrics && local && routingServices(local).find(row=>row.callId===config.publicModelId);
  const channels=service?routingChannels(local,service,Date.now(),{runtime:true}):[];
  const byId=new Map(channels.map(row=>[row.id,row]));
  if(service){
    if(allowed.some(row=>!byId.has(row.bindingId)))fail('supply_changed','当前路由引用的渠道已变化');
    allowed=allowed.filter(row=>withinRouteLimits(byId.get(row.bindingId)));
  }
  if(['load','tpm','latency','cost'].includes(config.route.strategy)){
    if(!service || allowed.some(row=>!byId.has(row.bindingId)))fail('routing_metrics_required','缺少当前路由的实际渠道依据');
    const costs=config.route.strategy==='cost'?new Map(comparableRouteCosts(allowed.map(row=>byId.get(row.bindingId)),config.route.costBasis || 'input').map(row=>[row.supplyId,row.amount])):null;
    const metric=config.route.strategy==='load'?'activeRequests':config.route.strategy==='tpm'?'tokensPerMinute':'p95LatencyMs';
    const value=row=>costs?costs.get(row.bindingId):byId.get(row.bindingId)[metric];
    if(allowed.some(row=>value(row)==null))fail('routing_metrics_required','缺少路由所需的实际指标，不能推断为零');
    return weighted(allowed.map(row=>({...row,weight:1}))).sort((a,b)=>value(a)-value(b));
  }
  return config.route.strategy === 'weighted' ? weighted(allowed) : config.route.strategy === 'priority_weighted' ? [...new Set(allowed.map(row => row.priority))].flatMap(priority => weighted(allowed.filter(row => row.priority === priority))) : allowed;
}
function operationalContext(service, binding, channel) {
  try {
    const local = readLinkedState();
    const model = local.models.find(row => row.platformPublications?.some(proof => proof.mockServiceId === service.id && proof.source === 'mock'));
    const proof = model?.platformPublications.find(row => row.mockServiceId === service.id && row.source === 'mock');
    return model && proof ? {modelId:model.id,modelType:model.type,serviceId:proof.serviceId,endpointId:channel.clientChannelId,providerId:channel.providerId,supplyId:binding.id} : null;
  } catch { return null; }
}
function operationalPrice(selected, context, at) {
  const meters = {million_tokens:['总 Token','百万 Token'],million_input_tokens:['输入 Token','百万 Token'],million_output_tokens:['输出 Token','百万 Token'],request:['调用次数','次'],second:['时长','秒'],character:['语音合成字符数','字符']};
  return {id:selected.map(row=>row.id).join(' / '),modelId:context?.modelId,serviceId:context?.serviceId,effectiveAt:selected.map(row=>row.effectiveAt).sort((a,b)=>Date.parse(b)-Date.parse(a))[0],expiresAt:selected.map(row=>row.expiresAt).filter(Boolean).sort((a,b)=>Date.parse(a)-Date.parse(b))[0] || null,selectedAt:new Date(at).toISOString(),items:selected.map(row=>({name:meters[row.unit]?.[0] || row.unit,unit:meters[row.unit]?.[1] || row.unit,currency:row.currency,amount:row.amount}))};
}
function pipeline(state, service, config, proofs, { identityType, identityId, messages }) {
  const started = Date.now(), technical = config.technical === true && identityType === 'trial', sale = technical ? null : activePrices(config.salePrices, started);
  if (!technical && !sale) fail('sale_price_expired', '当前销售价格已过期');
  let lastIssue, attempt = 0; const attempts = [];
  for (const route of routeOrder(config)) {
    const binding = config.bindings.find(item => item.id === route.bindingId), channel = channelById(state, binding.channelId);
    let dispatched=false;
    try {
      assertAvailable(state, channel, { live: identityType === 'client', model: binding.model });
      if (proofs.find(item => item.bindingId === binding.id)?.signature !== channelSignature(state, channel)) fail('supply_changed', '供给配置已变化，请重新检查发布');
      const procurement = activePrices(binding.procurementPrices, started); if (!technical && !procurement) fail('procurement_price_expired', '采购价已到期');
      dispatched=true;
      const result = resultFor(state.scenario, binding.model, state.scenario === 'partial' ? attempt++ === 0 ? 1 : 0 : 0);
      if (result.status !== 'passed') fail(result.code, result.message);
      const context=operationalContext(service,binding,channel);
      attempts.push({ dispatched:true, bindingId: binding.id, channelId: channel.id, endpointId:channel.clientChannelId || null, status: 'passed', usage:result.usage || null, procurementSnapshot:procurement?{...operationalPrice(procurement,context,started),providerId:channel.providerId,endpointId:channel.clientChannelId || null,supplyId:binding.id}:null });
      const usage = result.usage || null, cost = result.meteringUnknown ? null : totalPrice(procurement,usage), record = { id: uid(), source: 'mock', evidenceSource: 'mock', serviceId: service.id, publicModelId: config.publicModelId, serviceVersion: identityType === 'trial' ? service.candidateVersion : service.published.version, routeVersion: config.route.version, identityType, identityId, operational:context, priceSnapshot:sale?operationalPrice(sale,context,started):null,billingStatus:technical?'not_applicable':identityType==='client'?'billable':'trial',costStatus:cost?'confirmed':'pending', tenantId:identityType === 'client' ? state.clientKeys.find(row=>row.id===identityId)?.tenantId || null : null, attempts: copy(attempts), startedAt: new Date(started).toISOString(), endedAt: now(), providerId: channel.providerId, channelId: channel.id, upstreamModelId: binding.model.upstreamModelId, usage, cost, saleTrial: result.meteringUnknown ? null : totalPrice(sale, usage), customerDebited: false, traceId: uid() };
      state.usage.push(record);
      return { id: record.id, model: config.publicModelId, choices: [{ message: { role: 'assistant', content: `已处理：${messages?.at(-1)?.content || '连接检查'}` } }], usage, traceId: record.traceId, source: 'mock', attempts: copy(attempts), actualSupply: { providerId: channel.providerId, channelId: channel.id, upstreamModelId: binding.model.upstreamModelId }, routeVersion: config.route.version, cost: record.cost, saleTrial: record.saleTrial, technicalReady: true, billingReady: Boolean(record.cost && record.saleTrial), customerDebited: false };
    } catch (error) { const selected=activePrices(binding.procurementPrices,started),context=operationalContext(service,binding,channel); attempts.push({ dispatched, bindingId: binding.id, channelId: channel.id, endpointId:channel.clientChannelId || null, status: 'failed', code: error.code || 'request_failed', usage:null, procurementSnapshot:selected?{...operationalPrice(selected,context,started),providerId:channel.providerId,endpointId:channel.clientChannelId || null}:null }); error.attempts = copy(attempts); lastIssue = error; if (!config.route.autoFailover || error.code === 'request_timeout') throw error; }
  }
  throw lastIssue || new Error('没有符合当前允许范围的可用供给');
}
function changeSnapshot(state, input) {
  if (!['channels', 'group'].includes(input.scope || 'channels')) fail('invalid_scope', '请选择渠道或共享组切换范围');
  if (!Array.isArray(input.replacements) || !input.replacements.length) fail('invalid_replacement', '请选择明确替换集合');
  const sources = new Set(), targets = new Set();
  const replacements = input.replacements.map(row => { const source = channelById(state, row.channelId), candidate = channelById(state, row.candidateChannelId); if (source.providerId !== candidate.providerId || source.id === candidate.id || sources.has(source.id) || targets.has(candidate.id) || source.supersededBy || candidate.supersededBy) fail('invalid_replacement', '替换须为同服务商下独立的候选配置'); sources.add(source.id); targets.add(candidate.id); return { channelId: source.id, candidateChannelId: candidate.id }; }).sort((a, b) => a.channelId.localeCompare(b.channelId));
  if ([...targets].some(id => sources.has(id))) fail('replacement_cycle', '替换不能含循环或链式映射');
  if (input.scope === 'group') {
    const oldCredentials = new Set([...sources].map(id => channelById(state, id).credentialId));
    if (oldCredentials.has(null) || state.channels.some(channel => !channel.supersededBy && !channel.needsValidation && !targets.has(channel.id) && oldCredentials.has(channel.credentialId) && !sources.has(channel.id))) fail('group_references_incomplete', '共享凭证的全部引用必须包含在切换集合内');
    for (const id of oldCredentials) if (new Set(replacements.filter(row => channelById(state, row.channelId).credentialId === id).map(row => channelById(state, row.candidateChannelId).credentialId)).size !== 1) fail('inconsistent_group_candidate', '共享组必须选择同一候选凭证');
  }
  const channels = [...new Set([...sources, ...targets])].sort().map(id => { const channel = channelById(state, id); return { id, revision: channel.revision, signature: channelSignature(state, channel), credentialId: channel.credentialId }; });
  const affectedServices = state.services.filter(service => [...service.candidate.bindings, ...(service.published?.config.bindings || [])].some(binding => sources.has(binding.channelId))).map(service => ({ serviceId: service.id, name: service.candidate.name, revision: service.revision, candidateVersion: service.candidateVersion, candidateFingerprint: hash(service.candidate), publishedVersion: service.published?.version || null, publishedFingerprint: hash(service.published || null) })).sort((a, b) => a.serviceId.localeCompare(b.serviceId));
  const requiredCoverage = affectedServices.flatMap(item => { const service = serviceById(state, item.serviceId); return service.published && !service.disabled ? activeRouteChannels(service.published.config).flatMap(route => { const binding = service.published.config.bindings.find(row => row.id === route.bindingId), replacement = replacements.find(row => row.channelId === binding.channelId); return replacement ? [{ serviceId: service.id, bindingId: binding.id, candidateChannelId: replacement.candidateChannelId, model: binding.model, capabilities: service.published.config.capabilities }] : []; }) : []; });
  return { scope: input.scope || 'channels', replacements, channels, affectedServices, requiredCoverage };
}
function handle(state, path, { method = 'GET', body = {}, token } = {}) {
  const url = new URL(path, 'http://mock.invalid'), route = url.pathname, scenario = state.scenario;
  if (method === 'GET' && route === '/health') return { status: 'healthy', source: 'mock' };
  if (method === 'GET' && route === '/credentials') return { credentials: state.credentials };
  if (method === 'POST' && route === '/credentials') return once(state, 'createCredential', body, () => { const secret = body.secret || '', row = { id: uid(), providerId: text(body.providerId, '服务商'), name: text(body.name, '密钥名称'), maskedKey: secret.length > 12 ? `${secret.slice(0, 8)}*****${secret.slice(-4)}` : '*****', version: 1, status: 'active', source: 'mock', accountRpm: body.accountRpm || null }; state.credentials.push(row); return row; });
  const credentialAction = route.match(/^\/credentials\/([^/]+)\/(revoke|disable|enable)$/);
  if (method === 'POST' && credentialAction) return once(state, credentialAction[2] + 'Credential', body, () => { const row = state.credentials.find(item => item.id === credentialAction[1]); if (!row) fail('credential_not_found', '凭证引用不存在'); if (row.version !== body.expectedRevision) fail('revision_conflict', '凭证版本已变化'); if (row.status === 'revoked' && credentialAction[2] !== 'revoke') fail('credential_revoked', '已撤销凭证不能恢复'); const status = ({ revoke: 'revoked', disable: 'disabled', enable: 'active' })[credentialAction[2]]; if (row.status !== status) { row.status = status; row.version++; } return row; });
  if (method === 'GET' && route === '/channels') return { channels: state.channels.map(channel => ({ ...channel, signature: channelSignature(state, channel) })) };
  const channelPath = route.match(/^\/channels\/([^/]+)$/);
  if (method === 'POST' && route === '/channels' || method === 'PATCH' && channelPath) return once(state, channelPath ? 'updateChannel' : 'createChannel', body, () => {
    const current = channelPath ? channelById(state, channelPath[1]) : null;
    if (current && current.revision !== body.expectedRevision) fail('revision_conflict', '渠道版本已变化');
    const input = { ...current, ...body }, providerId = text(input.providerId, '服务商'), name = text(input.name, '渠道名称', 60);
    if (current && current.providerId !== providerId) fail('provider_immutable', '渠道不能变更服务商');
    if (state.channels.some(row => row.id !== current?.id && row.providerId === providerId && row.name === name)) fail('duplicate_name', '渠道名称重复');
    if (!['openai', 'anthropic', 'custom'].includes(input.interfaceType)) fail('invalid_interface', '请选择明确接口类型');
    const localKeyId = input.credential?.id || null, externalVersion = input.credential?.version || 'initial', credentialId = input.authMode === 'none' ? null : localKeyId ? `${localKeyId}@${hash(externalVersion)}` : input.credentialId;
    if (input.authMode !== 'none' && !state.credentials.some(row => row.id === credentialId)) { const revoked = localKeyId && state.credentials.some(row => row.localKeyId === localKeyId && row.status === 'revoked'); state.credentials.push({ id: text(credentialId, '密钥引用'), localKeyId, externalVersion, providerId, name: '渠道密钥引用', maskedKey: '*****', status: revoked ? 'revoked' : input.credential?.status || 'active', version: 1, accountRpm: input.credential?.accountRpm || null, source: 'mock' }); }
    const key = state.credentials.find(row => row.id === credentialId); if (key && key.providerId !== providerId) fail('credential_scope', '密钥不属于此服务商');
    const channel = { id: current?.id || uid(), providerId, name, displayName: input.displayName || name, interfaceType: input.interfaceType, baseUrl: text(input.baseUrl, '接口地址', 2048), taskUrls: copy(input.taskUrls || {}), authMode: input.authMode || 'key', credentialId, clientChannelId: input.clientChannelId || null, clientSignature: input.clientSignature || null, mockModels: copy(input.mockModels || current?.mockModels || []), apiVersion: input.apiVersion || input.adapterOptions?.apiVersion || null, workspaceId: input.workspaceId || input.adapterOptions?.workspaceId || null, tokenLimitField: input.tokenLimitField || input.adapterOptions?.tokenLimitField || null, imageSize: input.imageSize || input.adapterOptions?.imageSize || null, voice: input.voice || input.adapterOptions?.voice || null, statusPath: input.statusPath || input.adapterOptions?.statusPath || null, revision: (current?.revision || 0) + 1, configVersion: (current?.configVersion || 0) + 1, source: 'mock' };
    if (current && hash(requestConfiguration(current)) === hash(requestConfiguration(channel))) channel.configVersion = current.configVersion;
    if (current) state.channels[state.channels.indexOf(current)] = channel; else state.channels.push(channel);
    return { ...channel, signature: channelSignature(state, channel) };
  });
  if (method === 'POST' && route === '/discover') {
    const channel = channelById(state, body.channelId);
    if (channel.interfaceType === 'custom') fail('discovery_unsupported', '此任务接口不支持通用模型发现，请手动添加或从参考目录选择');
    const issue = resultFor(scenario, { type: 'text' }, 0);
    if (['auth', 'forbidden', 'ratelimit', 'timeout', 'protocol', 'balance'].includes(scenario)) fail(issue.code, issue.message);
    const models = scenario === 'empty' ? [] : channel.mockModels.length ? channel.mockModels : mockConfig["admin-v2/mock-onboarding-service.js"]["discoveryModels"];
    return { models: copy(scenario === 'partial' ? models.slice(0, 1) : models), complete: scenario !== 'partial', source: 'mock', signature: channelSignature(state, channel), discoveredAt: now() };
  }
  if (method === 'GET' && route === '/tests' && url.searchParams.has('operationId')) { const entry = state.operations[url.searchParams.get('operationId')], batch = entry?.action === 'startTests' && state.batches.find(row => row.id === entry.response.id); if (!batch) fail('submission_not_found', '未找到此操作 ID 的测试提交'); return batch; }
  if (method === 'POST' && route === '/tests') return once(state, 'startTests', body, () => {
    const channel = channelById(state, body.channelId); assertAvailable(state, channel);
    if (!Array.isArray(body.models) || !body.models.length || body.models.length > 50) fail('invalid_models', '请选择 1–50 个测试模型');
    if (body.models.some(model => ['image', 'video', 'audio'].includes(model.type)) && body.confirmExpensive !== true) fail('cost_confirmation_required', '请明确勾选高成本任务');
    for (const model of body.models) { text(model.id, '模型资料 ID'); text(model.upstreamModelId, '上游模型标识'); if (!['text', 'multimodal', 'embedding', 'rerank', 'image', 'audio', 'video'].includes(model.type) || model.check && !['streaming', 'tools', 'structured'].includes(model.check)) fail('invalid_task', '模型任务或验证内容无效'); }
    if (new Set(body.models.map(row => row.id)).size !== body.models.length || new Set(body.models.map(row => row.upstreamModelId)).size !== body.models.length) fail('duplicate_model', '测试模型不能重复');
    const batch = { id: uid(), channelId: channel.id, providerId: channel.providerId, signature: channelSignature(state, channel), configVersion: channel.configVersion, credentialId: channel.credentialId, credentialVersion: credential(state, channel)?.version || null, source: 'mock', scenario, status: 'queued', createdAt: now(), confirmExpensive: body.confirmExpensive === true, items: body.models.map(model => ({ id: uid(), model: { id: model.id, associationId: model.associationId, upstreamModelId: model.upstreamModelId, type: model.type, probe: model.probe || model.type, ...(model.check ? { check: model.check } : {}), ...(model.dimensions ? { dimensions: model.dimensions } : {}) }, status: 'queued', stage: 'queued', evidenceSource: 'mock', current: true, traceId: uid(), usage: null, cost: null, templateVersion: 1 })) }; state.batches.push(batch); return batch;
  });
  const batchPath = route.match(/^\/tests\/([^/]+)(\/cancel)?$/);
  if (batchPath) { const batch = state.batches.find(row => row.id === batchPath[1]); if (!batch) fail('batch_not_found', '测试任务不存在'); if (method === 'GET' && !batchPath[2]) return batch; if (method === 'POST' && batchPath[2]) return once(state, 'cancelTests', body, () => { batch.cancelRequested = true; advance(state); return batch; }); }
  if (method === 'GET' && route === '/services') return { services: state.services };
  if (method === 'POST' && route === '/services') return once(state, 'createService', body, () => { const candidate = normalizeCandidate(state, body); if (state.services.some(service => service.candidate.publicModelId === candidate.publicModelId || service.published?.config.publicModelId === candidate.publicModelId)) fail('public_model_conflict', '对外调用标识 已存在'); const service = { id: uid(), revision: 1, candidateVersion: 1, candidate, published: null, trials: [], source: 'mock' }; state.services.push(service); return service; });
  const servicePath = route.match(/^\/services\/([^/]+)(?:\/(test-identities|trial|publish|unpublish))?$/);
  if (servicePath) {
    const service = serviceById(state, servicePath[1]);
    if (method === 'PATCH' && !servicePath[2]) return once(state, 'updateService', body, () => { if (service.revision !== body.expectedRevision) fail('revision_conflict', '服务修订已变化'); const candidate = normalizeCandidate(state, body, service.candidate); if (state.services.some(row => row.id !== service.id && (row.candidate.publicModelId === candidate.publicModelId || row.published?.config.publicModelId === candidate.publicModelId))) fail('public_model_conflict', '对外调用标识 已存在'); service.candidate = candidate; service.revision++; service.candidateVersion++; return service; });
    if (method === 'POST' && servicePath[2] === 'test-identities') return once(state, 'createTestIdentity', body, () => { if (service.revision !== body.expectedRevision) fail('revision_conflict', '服务修订已变化'); const token = `mock-trial-${uid()}`, identity = { id: uid(), tokenHash: hash(token), serviceId: service.id, candidateVersion: service.candidateVersion, fingerprint: hash(service.candidate), expiresAt: new Date(Date.now() + 600000).toISOString() }; state.identities.push(identity); return { id: identity.id, token, serviceId: service.id, candidateVersion: service.candidateVersion, expiresAt: identity.expiresAt, source: 'mock' }; }, true);
    if (method === 'POST' && servicePath[2] === 'trial') {
      const identity = state.identities.find(row => row.tokenHash === hash(body.trialToken || ''));
      if (!identity || identity.serviceId !== service.id || identity.candidateVersion !== service.candidateVersion || identity.fingerprint !== hash(service.candidate) || Date.parse(identity.expiresAt) <= Date.now()) fail('trial_identity_invalid', '测试身份不适用于当前候选或已过期');
      return once(state, 'platformTrial', body, () => {
        const entry = { id: uid(), fingerprint: hash([service.candidateVersion, service.candidate]), proofs: [], status: 'running', source: 'mock', candidateVersion: service.candidateVersion, routeVersion: service.candidate.route.version, startedAt: now(), at: now() }; service.trials.push(entry);
        try {
          entry.proofs = qualify(state, service);
          const result = pipeline(state, service, service.candidate, entry.proofs, { identityType: 'trial', identityId: identity.id });
          Object.assign(entry, { result: copy({...result,candidateVersion:service.candidateVersion}), requestId: result.id, status: result.technicalReady && service.candidate.technical || result.billingReady ? 'passed' : 'metering_unknown', traceId: result.traceId, endedAt: now(), at: now() });
          return { ...result, candidateVersion: service.candidateVersion };
        } catch (error) {
          Object.assign(entry, { status: error.code === 'request_timeout' ? 'unknown' : 'failed', code: error.code || 'request_failed', message: error.message, traceId: error.traceId || uid(), attempts: copy(error.attempts || []), usage: null, cost: null, saleTrial: null, endedAt: now(), at: now() });
          if (entry.attempts.length) state.usage.push({ id: entry.id, source: 'mock', evidenceSource: 'mock', serviceId: service.id, publicModelId: service.candidate.publicModelId, serviceVersion: service.candidateVersion, routeVersion: service.candidate.route.version, identityType: 'trial', identityId: identity.id, status: entry.status, code: entry.code, attempts: copy(entry.attempts), startedAt: entry.startedAt, endedAt: entry.endedAt, channelId: entry.attempts.at(-1).channelId, usage: null, cost: null, saleTrial: null, customerDebited: false, traceId: entry.traceId });
          error.traceId = entry.traceId; error.persistMockState = true; throw error;
        }
      }, false, 'trial:' + identity.id);
    }
    if (method === 'POST' && servicePath[2] === 'publish') return once(state, 'publishService', body, () => { if (service.revision !== body.expectedRevision) fail('revision_conflict', '服务修订已变化'); const proofs = qualify(state, service), trial = service.trials.filter(row => row.fingerprint === hash([service.candidateVersion, service.candidate])).at(-1); if (!trial || trial.status !== 'passed' || hash(trial.proofs) !== hash(proofs)) fail('platform_trial_required', '当前候选、路由和价格版本尚未通过平台试调用'); service.published = { version: service.candidateVersion, config: copy(service.candidate), proofs, trialId: trial.id, publishedAt: now(), source: 'mock' }; service.disabled = false; service.revision++; return service; });
    if (method === 'POST' && servicePath[2] === 'unpublish') return once(state, 'unpublishService', body, () => { if (service.revision !== body.expectedRevision) fail('revision_conflict', '服务修订已变化'); service.disabled = true; service.revision++; return service; });
  }
  if (method === 'POST' && route === '/client-keys') return once(state, 'createClientKey', body, () => { if (!Array.isArray(body.serviceIds) || !body.serviceIds.length) fail('invalid_scope', '请选择客户服务范围'); body.serviceIds.forEach(id => serviceById(state, id)); const clientKey = `mock-client-${uid()}`, row = { id: uid(), tokenHash: hash(clientKey), tenantId: text(body.tenantId, '租户'), serviceIds: [...new Set(body.serviceIds)], status: 'active', version: 1, expiresAt: body.expiresAt || null }; state.clientKeys.push(row); const metadata = { ...row }; delete metadata.tokenHash; return { ...metadata, clientKey }; }, true);
  const clientAction = route.match(/^\/client-keys\/([^/]+)\/revoke$/);
  if (method === 'POST' && clientAction) return once(state, 'revokeClientKey', body, () => { const row = state.clientKeys.find(item => item.id === clientAction[1]); if (!row) fail('client_key_not_found', '客户 Key 不存在'); if (row.version !== body.expectedRevision) fail('revision_conflict', '客户 Key 修订已变化'); row.status = 'revoked'; row.version++; const metadata = { ...row }; delete metadata.tokenHash; return metadata; });
  if (method === 'POST' && route === '/client/completions') {
    const key = state.clientKeys.find(row => row.tokenHash === hash(token || body.clientKey || ''));
    if (!key || key.status !== 'active' || key.expiresAt && Date.parse(key.expiresAt) <= Date.now()) fail('client_unauthorized', '客户 Key 无效或已过期');
    const service = state.services.find(row => row.published?.config.publicModelId === body.model && !row.disabled);
    if (!service) fail('model_unavailable', '模型服务未上架或不可用');
    const local = readLinkedState();
    assertPublishedAccess(local, service, key.tenantId);
    setMockRuntimeState(local);
    const ready = mockServiceReadiness(local, service);
    if (!ready.allowed) fail(ready.code, ready.reason);
    if (!key.serviceIds.includes(service.id) || !service.published.config.tenantIds.includes(key.tenantId)) fail('model_forbidden', '客户未获授权使用此模型');
    return once(state, 'clientRequest', body, () => {
      const startedAt=now();
      try { const result = pipeline(state, service, service.published.config, service.published.proofs, { identityType: 'client', identityId: key.id, messages: body.messages }); return { id: result.id, model: result.model, choices: result.choices, usage: result.usage, traceId: result.traceId, source: 'mock' }; }
      catch(error) {
        const attempts=copy(error.attempts || []),last=attempts.at(-1),binding=service.published.config.bindings.find(row=>row.id===last?.bindingId),channel=binding && channelById(state,binding.channelId),context=channel && operationalContext(service,binding,channel),sale=activePrices(service.published.config.salePrices,Date.parse(startedAt));
        if(attempts.length){state.usage.push({id:uid(),source:'mock',identityType:'client',identityId:key.id,tenantId:key.tenantId,serviceId:service.id,publicModelId:service.published.config.publicModelId,operational:context,priceSnapshot:sale?operationalPrice(sale,context,Date.parse(startedAt)):null,attempts,status:'failed',billingStatus:'not_billable',startedAt,endedAt:now(),usage:null,cost:null,saleTrial:null,traceId:error.traceId});error.persistMockState=true;}
        delete error.attempts;
        throw error;
      }
    }, false, 'client:' + key.id);
  }
  const channelAction = route.match(/^\/channels\/([^/]+)\/(disable|enable)$/);
  if (method === 'POST' && channelAction) return once(state, channelAction[2] + 'Channel', body, () => { const channel = channelById(state, channelAction[1]); if (channel.revision !== body.expectedRevision) fail('revision_conflict', '渠道修订已变化'); channel.disabled = channelAction[2] === 'disable'; channel.revision++; return channel; });
  if (method === 'POST' && route === '/configuration-changes/preview') return once(state, 'previewConfigurationChange', body, () => { const snapshot = changeSnapshot(state, body), plan = { id: uid(), status: 'preview', source: 'mock', ...snapshot, impactSignature: hash(snapshot), createdAt: now() }; state.changes.push(plan); return plan; });
  const changePath = route.match(/^\/configuration-changes\/([^/]+)$/);
  if (method === 'GET' && changePath) { const plan = state.changes.find(row => row.id === changePath[1]); if (!plan) fail('configuration_plan_not_found', '切换计划不存在'); return plan; }
  if (method === 'POST' && route === '/configuration-changes/apply') return once(state, 'applyConfigurationChange', body, () => {
    const plan = state.changes.find(row => row.id === body.previewId); if (!plan) fail('configuration_plan_not_found', '切换计划不存在'); if (plan.status !== 'preview') fail('configuration_already_applied', '切换已完成，请读取原结果');
    const snapshot = changeSnapshot(state, plan); if (body.impactSignature !== plan.impactSignature || hash(snapshot) !== plan.impactSignature) fail('configuration_impact_changed', '配置修订或完整引用集合已变化，请重新预览');
    const proofs = new Map();
    for (const item of snapshot.affectedServices) { const service = serviceById(state, item.serviceId); if (service.disabled || !service.published) continue; for (const route of activeRouteChannels(service.published.config)) { const binding = service.published.config.bindings.find(row => row.id === route.bindingId), replacement = snapshot.replacements.find(row => row.channelId === binding.channelId); if (replacement) proofs.set(service.id + ':' + binding.id, evidence(state, { ...binding, channelId: replacement.candidateChannelId }, service.published.config.capabilities)); } }
    const changed = [];
    for (const item of snapshot.affectedServices) {
      const service = serviceById(state, item.serviceId); service.configurationHistory ||= []; service.configurationHistory.push({ planId: plan.id, revision: service.revision, candidate: copy(service.candidate), published: copy(service.published) });
      const replace = bindings => bindings.map(binding => { const replacement = snapshot.replacements.find(row => row.channelId === binding.channelId); return replacement ? { ...binding, channelId: replacement.candidateChannelId, needsValidation: !proofs.has(service.id + ':' + binding.id) } : binding; });
      service.candidate.bindings = replace(service.candidate.bindings); service.candidateVersion++; service.revision++;
      if (service.published) { service.published.config.bindings = replace(service.published.config.bindings); service.published.proofs = service.published.proofs.filter(row => !snapshot.replacements.some(replacement => row.bindingId && service.configurationHistory.at(-1).published.config.bindings.some(binding => binding.id === row.bindingId && binding.channelId === replacement.channelId))); for (const binding of service.published.config.bindings) if (proofs.has(service.id + ':' + binding.id)) service.published.proofs.push(proofs.get(service.id + ':' + binding.id)); service.published.version++; }
      changed.push({ serviceId: service.id, revision: service.revision, candidateVersion: service.candidateVersion, publishedVersion: service.published?.version || null });
    }
    for (const row of snapshot.replacements) { const channel = channelById(state, row.channelId); channel.supersededBy = row.candidateChannelId; channel.revision++; }
    plan.status = 'applied'; plan.appliedAt = now(); plan.result = { id: plan.id, status: 'applied', replacements: snapshot.replacements, services: changed, source: 'mock' }; return plan.result;
  });
  if (method === 'GET' && route === '/usage') return { usage: state.usage, testCount: state.usage.filter(row => row.identityType === 'trial').length, clientCount: state.usage.filter(row => row.identityType === 'client').length };
  if (method === 'GET' && route === '/audits') return { audits: state.audits };
  fail('not_found', '此操作暂不可用');
}
async function mockOnboardingApi(path, options = {}) {
  const abortError = () => Object.assign(new Error('操作已取消'), { name: 'AbortError' });
  if (options.signal?.aborted) throw abortError();
  if (typeof window !== 'undefined') await new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); reject(abortError()); };
    const timer = setTimeout(() => { options.signal?.removeEventListener('abort', abort); resolve(); }, 150);
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) abort();
  });
  if (options.signal?.aborted) throw abortError();
  const state = readForWrite(); advance(state);
  try { const response = handle(state, path, options); save(state); return copy(response); }
  catch (error) { if (error.persistMockState) save(state); throw error; }
}

function setMockRuntimeState(local) {
  if (!local) { runtime = null; return; }
  runtime = {
    providers: (local.providers || []).map(({ id, status }) => ({ id, status })),
    endpoints: (local.endpoints || []).map(({ id, providerId, status, deletedAt, frozen }) => ({ id, providerId, status, deletedAt, frozen })),
    keys: (local.providers || []).flatMap(provider => [...(provider.apiKeys || []), ...(local.endpoints || []).filter(endpoint => endpoint.providerId === provider.id).flatMap(endpoint => endpoint.apiKeys || [])].map(({ id, status, revokedAt }) => ({ id, status, revokedAt, providerId: provider.id }))),
    associations: (local.providers || []).flatMap(provider => (provider.catalogConnections || []).map(({ id, modelId, endpointId, upstreamModelId, enabled, deletedAt }) => ({ id, modelId, endpointId, upstreamModelId, enabled, deletedAt, providerId: provider.id, masterId: provider.catalogModels?.find(model => model.modelId === modelId)?.libraryId }))),
  };
}

const getMockChannelSnapshots = () => { const state = read(); return state.channels.map(channel => ({ ...copy(channel), signature: channelSignature(state, channel) })); };
function prepareMockConfiguration({ operationId = uid(), scope = 'channels', replacements = [], unverifiedChannelIds = [], commercialUpdates = [], publications = [] }, databaseTransaction = false) {
  const before = read(), after = copy(before); advance(after);
  let result = null;
  if (replacements.length) {
    const preview = handle(after, '/configuration-changes/preview', { method: 'POST', body: { operationId: operationId + ':preview', scope, replacements } });
    result = handle(after, '/configuration-changes/apply', { method: 'POST', body: { operationId, previewId: preview.id, impactSignature: preview.impactSignature } });
  }
  for (const id of unverifiedChannelIds) {
    const channel = channelById(after, id);
    if (after.services.some(service => !service.disabled && service.published && activeRouteChannels(service.published.config).some(route => service.published.config.bindings.some(binding => binding.id === route.bindingId && binding.channelId === id)))) fail('validation_required', '在线引用的候选尚未完成检查，不能只修改本地配置');
    channel.needsValidation = true;
  }
  for (const update of commercialUpdates) {
    const service = serviceById(after, update.serviceId);
    if (!service.published || service.disabled) fail('publication_required', '当前服务发布配置不可用');
    const published = service.published, sameCandidate = hash(service.candidate) === hash(published.config);
    published.validation ||= { config: copy(published.config), version: published.version };
    for (const field of ['salePrices', 'tenantIds']) if (Object.hasOwn(update, field)) published.config[field] = copy(update[field]);
    published.commercialRevision = (published.commercialRevision || 0) + 1;
    published.commercialPublishedAt = now();
    if (sameCandidate) service.candidate = copy(published.config);
    service.revision++;
    audit(after, 'publishCommercialConfiguration', service.id);
  }
  for (const publication of publications) result = handle(after, `/services/${publication.serviceId}/publish`, {method:'POST',body:{operationId:publication.operationId,expectedRevision:publication.expectedRevision}});
  // D1 checks the workspace revision atomically; browser commits need full snapshot hashes.
  return { before, after, ...(!databaseTransaction ? { beforeHash: hash(before), afterHash: hash(after) } : {}), result };
}
function commitMockConfiguration(prepared) {
  if (hash(read()) !== prepared.beforeHash) fail('configuration_impact_changed', '接入工作区已变化，请重新准备切换');
  save(prepared.after); return copy(prepared.result);
}
function rollbackMockConfiguration(prepared) {
  if (hash(read()) !== prepared.afterHash) fail('configuration_impact_changed', '接入工作区已有其他修改，不能覆盖恢复');
  save(prepared.before);
}


const getMockServiceSnapshots = () => copy(read().services);
function inspectMockPublication(serviceId, publishedOnly = false, snapshot = null) {
  const state = snapshot || read();
  try {
    const service = serviceById(state, serviceId), published = service.published;
    if (service.source !== 'mock' || !published || published.source !== 'mock' || service.disabled) fail('platform_publication_required', '当前服务尚未发布有效的试调用配置');
    if (!publishedOnly && (published.version !== service.candidateVersion || hash(published.config) !== hash(service.candidate))) fail('platform_candidate_changed', '当前服务候选已变化，请重新试调用并发布');
    const nonCommercial = config => { return Object.fromEntries(Object.entries(config).filter(([key]) => !['salePrices', 'tenantIds'].includes(key)));  };
    if (published.validation && hash(nonCommercial(published.validation.config)) !== hash(nonCommercial(published.config))) fail('platform_candidate_changed', '调用配置发生变化，请重新试调用');
    const validation = published.validation || { config: published.config, version: published.version };
    const proofs = qualify(state, { ...service, candidate: published.config }), trial = service.trials.filter(row => row.fingerprint === hash([validation.version, validation.config])).at(-1);
    const mockProofs = proofs.every(proof => proof.evidenceSource === 'mock' && proof.evidenceIds.every(reference => {
      const batch = state.batches.find(row => row.id === reference.batchId), item = batch?.items.find(row => row.id === reference.itemId);
      return batch?.source === 'mock' && item?.evidenceSource === 'mock';
    }));
    if (!mockProofs || !trial || trial.source !== 'mock' || trial.status !== 'passed' || hash(trial.proofs) !== hash(proofs) || hash(published.proofs) !== hash(proofs)) fail('platform_trial_required', '当前配置尚未通过最新的平台试调用和发布检查');
    return { ready: true, reason: '', published: copy(published) };
  } catch (error) { return { ready: false, reason: error.message }; }
}

function inspectMockCandidate(serviceId, expectedCandidate) {
  const state=read();
  try {
    const service=serviceById(state,serviceId);
    if(hash({...service.candidate,name:''})!==hash({...normalizeCandidate(state,expectedCandidate),name:''}))fail('platform_candidate_changed','候选已变化');
    const trial=service.trials.filter(row=>row.fingerprint===hash([service.candidateVersion,service.candidate])).at(-1),proofs=qualify(state,service);
    if(!trial?.result || trial.status!=='passed' || hash(trial.proofs)!==hash(proofs))fail('platform_trial_required','当前候选尚无可恢复的有效验证');
    return {ready:true,service:copy(service),result:copy(trial.result)};
  }catch(error){return {ready:false,reason:error.message};}
}

// Runtime readiness does not reuse the 24-hour publication review deadline.
function mockServiceReadiness(local, service) {
  try {
    const state = read(), config = service?.published?.config;
    if (!config) fail('publication_required', '模型服务配置尚未就绪');
    setMockRuntimeState(local);
    if (!activePrices(config.salePrices, Date.now())) fail('sale_price_expired', '当前平台售价未生效或已过期');
    const routes = routeOrder(config);
    if (!routes.length) fail('supply_unavailable', '暂无可用供给');
    let issue;
    for (const route of routes) {
      try {
        const binding = config.bindings.find(item => item.id === route.bindingId);
        if (!binding || !activePrices(binding.procurementPrices, Date.now())) fail('procurement_price_expired', '当前供给价格不可用');
        assertAvailable(state, channelById(state, binding.channelId), { live: true, model: binding.model });
        return { allowed: true, reason: '' };
      } catch (error) { issue = error; if (!config.route.autoFailover) break; }
    }
    throw issue;
  } catch (error) { return { allowed: false, code: error?.code || 'supply_unavailable', reason: error?.message || '暂无可用供给' }; }
}

function getMockOperationalRequests() {
  const convert = usage => usage ? {input:usage.input_tokens,output:usage.output_tokens,cached:usage.cached_tokens,images:usage.images,seconds:usage.seconds,characters:usage.characters} : null;
  return read().usage.filter(row=>row.identityType==='client' && row.operational?.modelId && row.operational?.serviceId).map(row=>({id:'mock-customer:'+row.id,requestId:row.traceId || row.id,modelId:row.operational.modelId,modelType:row.operational.modelType,serviceId:row.operational.serviceId,callId:row.publicModelId,tenantId:row.tenantId,endpointId:row.operational.endpointId,providerId:row.operational.providerId,supplyId:row.operational.supplyId,routeVersion:row.routeVersion,purpose:'customer',billingStatus:row.billingStatus || 'billable',usage:convert(row.usage),usageConfirmed:!!row.usage,httpStatus:row.status==='failed'?0:200,createdAt:row.startedAt,updatedAt:row.endedAt,priceSnapshot:copy(row.priceSnapshot),procurementSnapshot:copy(row.attempts.at(-1)?.procurementSnapshot || null),attempts:row.attempts.map(attempt=>({...copy(attempt),usage:convert(attempt.usage),error:attempt.status==='passed'?null:attempt.code || 'upstream_failed'}))}));
}

function invoke(path,options={}) { const state=readForWrite(); advance(state); try {const result=handle(state,path,options);save(state);return copy(result);}catch(error){if(error.persistMockState)save(state);throw error;} }
return {getMockScenario,setMockScenario,mockOnboardingApi,setMockRuntimeState,getMockChannelSnapshots,prepareMockConfiguration,commitMockConfiguration,rollbackMockConfiguration,getMockServiceSnapshots,inspectMockPublication,inspectMockCandidate,mockServiceReadiness,getMockOperationalRequests,invoke,snapshot:()=>copy(read()),restore:value=>save(copy(value))};
}
