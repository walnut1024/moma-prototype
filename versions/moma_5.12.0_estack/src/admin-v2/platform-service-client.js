import { activeSupplyPrice, modelSupplies, moneyDisplay } from './model-management.js';
import { activeModelSalePrice, activeProviderPrice } from './service-workspace.js';
import { activeRouteVersion, routingServices, serviceRoute } from './service-routing.js';
import { resolveChannelAssociationModel } from './channel-association-model.js';
import { catalogueChannels } from './provider-channels.js';
import { connectionFingerprint, connectionKeys } from './connection-state.js';
import { onboardingApi, prepareServerChannel } from './onboarding-client.js';
import { platformPublicationFingerprint } from './platform-publication-state.js';

const issue = (path, message) => { const error = new Error(`${path}：${message}`); error.path = path; throw error; };
const validTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
export const platformServices = (state, model) => routingServices(state).filter(service => service.modelId === model.id);
export const platformFeeDisplay = value => value?.unit === 'micro' && Number.isSafeInteger(value.amount) && value.amount >= 0 && /^[A-Z]{3}$/.test(value.currency || '') ? `${value.currency} ${moneyDisplay(value.amount)}` : '费用未知';

export function platformAllowedChannels(state, service) {
  if (!service) return [];
  const version = activeRouteVersion(serviceRoute(state, service.id));
  const supplies = modelSupplies(state, service.modelId);
  return (version?.config.channels || []).filter(row => row.enabled !== false).map(route => {
    const supply = supplies.find(row => row.id === route.supplyId);
    const association = supply?.provider && catalogueChannels(state, supply.provider, supply.catalogueModelId || supply.upstreamModelId).find(row => row.endpointId === supply.endpointId && row.upstreamModelId === supply.upstreamModelId);
    return { id: route.supplyId, route, supply, association };
  });
}

function meter(item, model, path) {
  const unit = item.unit?.replace(/^元\//, '');
  if (unit === '百万 Token') {
    if (['输入', '输入 Token', '向量输入 Token', '重排输入 Token'].includes(item.name)) return ['million_input_tokens', 1];
    if (['输出', '输出 Token'].includes(item.name)) return ['million_output_tokens', 1];
    if (['Token 用量', '总 Token'].includes(item.name)) return ['million_tokens', 1];
    if (item.name === '单价' && ['embedding', 'rerank'].includes(model.type)) return ['million_input_tokens', 1];
    issue(path, `计费项“${item.name}”尚无对应计量规则，请调整价格配置`);
  }
  if (['次', '千次'].includes(unit) && ['重排请求数', '请求数', '调用次数', '单价'].includes(item.name)) return ['request', unit === '千次' ? 1000 : 1];
  if (['秒', '分钟'].includes(unit) && (['视频输出时长', '音频输入时长'].includes(item.name) || item.name === '单价' && ['video', 'audio'].includes(model.type))) return ['second', unit === '分钟' ? 60 : 1];
  if (['字符', '万字符'].includes(unit) && (item.name === '语音合成字符数' || item.name === '单价' && model.type === 'audio')) return ['character', unit === '万字符' ? 10000 : 1];
  issue(path, `计费项“${item.name} / ${item.unit || '未配置'}”尚无对应计量规则，请调整价格配置`);
}

export function platformPriceVersions(price, model, path = '价格配置', at = Date.now()) {
  if (!price?.id) issue(path, '缺少价格版本，请先发布价格');
  if (!validTime(price.effectiveAt) || Date.parse(price.effectiveAt) > at) issue(path, '缺少有效的生效时间或价格尚未生效');
  if (price.expiresAt && (!validTime(price.expiresAt) || Date.parse(price.expiresAt) <= at)) issue(path, '当前价格已到期或到期时间无效');
  let items = price.items;
  if (!Array.isArray(items)) {
    if (!price.unit?.startsWith('元/')) issue(path, '历史报价缺少明确币种或计费项，请重新发布价格');
    items = [['inputPrice', ['text', 'multimodal'].includes(model.type) ? '输入' : '单价'], ...(['text', 'multimodal'].includes(model.type) ? [['outputPrice', '输出']] : []), ...['cachedPrice', 'cacheWritePrice'].filter(key => price[key] != null).map(key => [key, key === 'cachedPrice' ? '缓存读取' : '缓存写入'])].map(([key, name]) => ({ name, unit: price.unit, currency: 'CNY', amount: price[key] }));
  }
  if (!items.length) issue(path, '缺少计费项');
  const units = new Set();
  const result = items.map((item, index) => {
    const location = `${path} / 第 ${index + 1} 项`;
    if (item.condition?.trim()) issue(location, '条件报价尚无对应计量规则');
    if (!Number.isSafeInteger(item.amount) || item.amount < 0) issue(location, '金额未配置；免费须明确填写 0');
    if (!/^[A-Z]{3}$/.test(item.currency || '')) issue(location, '缺少明确币种');
    const [unit, divisor] = meter(item, model, location);
    if (item.amount % divisor) issue(location, '换算后无法以整数微货币精确表示，不能舍入价格');
    if (units.has(unit)) issue(location, '多个计费项使用同一计量字段，不能重复计费');
    units.add(unit);
    return { id: `${price.id}:${unit}`, amount: item.amount / divisor, unit, currency: item.currency, effectiveAt: price.effectiveAt, expiresAt: price.expiresAt || null };
  });
  if (new Set(result.map(row => row.currency)).size !== 1) issue(path, '同一报价不能混合币种');
  return result;
}

function platformRoute(version, rows) {
  const config = version.config;
  if (!['fixed', 'weighted', 'priority', 'priority_weighted'].includes(config.strategy)) issue('路由配置', '当前调度策略尚未支持实际执行，请选择固定渠道、权重分流或优先级策略');
  if (config.strategy === 'fixed' && !config.autoFailover && rows.length !== 1) issue('路由配置', '关闭故障切换时，固定渠道须明确选择一条供给');
  if (config.strategy === 'priority_weighted' && (!config.groups?.length || config.groups.some(group => group.strategy !== 'weighted'))) issue('路由配置', '优先级组内仅支持权重分流，请调整组内策略');
  return { version: version.version, strategy: config.strategy, autoFailover: config.autoFailover === true, channels: rows.map(row => {
    const group = config.groups?.findIndex(group => group.id === row.route.groupId);
    const priority = config.strategy === 'priority_weighted' ? group : row.route.priority;
    const weighted = ['weighted', 'priority_weighted'].includes(config.strategy);
    if (!Number.isInteger(priority) || priority < 0 || weighted && (!Number.isFinite(row.route.weight) || row.route.weight <= 0)) issue('路由配置', '渠道的优先级、分组或权重无效');
    return { bindingId: row.id, priority, ...(weighted ? { weight: row.route.weight } : {}) };
  }) };
}

export function platformCandidatePlan(state, model, { serviceId, tenantIds = [], supplyIds = [], audioProbe = '', at = Date.now() }) {
  const service = platformServices(state, model).find(row => row.id === serviceId);
  if (!service) issue('服务模式', '请选择当前模型的统一服务或供应商服务');
  if (!service.callId || /\s/.test(service.callId)) issue('服务调用 ID', '请先完善当前服务的对外调用 ID');
  if (!tenantIds.length || new Set(tenantIds).size !== tenantIds.length || tenantIds.some(id => !state.tenants?.some(tenant => tenant.id === id && !['已删除', '已停用', '停用'].includes(tenant.status)))) issue('客户范围', '请明确选择有效租户');
  const version = activeRouteVersion(serviceRoute(state, service.id));
  if (!version) issue('路由配置', '请先发布当前服务的路由');
  const allowed = platformAllowedChannels(state, service);
  if (!supplyIds.length || supplyIds.length > 20 || new Set(supplyIds).size !== supplyIds.length) issue('允许供给', '请选择 1–20 条已发布路由中的渠道');
  const rows = supplyIds.map(id => allowed.find(row => row.id === id) || issue('允许供给', '选择含未发布或已移除的渠道，请重新选择'));
  const sale = service.providerId ? activeProviderPrice(state, model.id, service.providerId, at) : activeModelSalePrice(state, model.id, at);
  const salePrices = platformPriceVersions(sale, model, '销售价格', at);
  const bindings = rows.map(row => {
    const { supply, association } = row, path = `供应渠道 ${supply?.provider?.name || row.id}`;
    if (!supply?.provider || !supply.endpoint || supply.provider.status !== '已启用' || supply.status !== '已启用' || !['运行中', '需关注'].includes(supply.endpoint.status)) issue(path, '供应商、渠道或模型关联未启用');
    if (service.providerId && supply.provider.id !== service.providerId) issue(path, '渠道不属于当前供应商服务');
    if (!association || association.enabled === false) issue(path, '请在模型供应中建立并启用明确的模型映射');
    let master;
    try { master = resolveChannelAssociationModel(state, supply.provider, association); }
    catch (error) { issue(path, `主档关联无效：${error.message}`); }
    const sameTemplate = model.templateId && (master.id === model.templateId || master.templateId === model.templateId);
    if (master.id !== model.id && !sameTemplate) issue(path, '主档关联与当前服务模型不一致，请重新关联模型资料');
    if (!association.upstreamModelId || /\s/.test(association.upstreamModelId)) issue(path, '上游模型 ID 未配置');
    if (!supply.endpoint.interfaceType) issue(path, '接口类型未配置');
    if (supply.endpoint.authMode !== 'none' && !connectionKeys(supply.endpoint, supply.provider)[0] && !(!supply.endpoint.authMode && supply.endpoint.credentialRef)) issue(path, '缺少可用且未撤销的主要密钥');
    const procurementPrices = platformPriceVersions(activeSupplyPrice(state, supply.id, at), model, `${path} / 采购价格`, at);
    const measures = prices => prices.map(item => `${item.unit}:${item.currency}`).sort().join('|');
    if (measures(procurementPrices) !== measures(salePrices)) issue(`${path} / 价格`, '采购与销售的计量字段或币种不可比，请调整价格配置');
    let probe;
    if (model.type === 'audio') {
      if (!['speech', 'transcription'].includes(audioProbe)) issue('语音测试任务', '请明确选择语音合成或语音识别');
      const tasks = model.profile?.tasks || [], declared = tasks.filter(task => ['语音合成', '语音识别'].includes(task));
      if (declared.length && !declared.includes(audioProbe === 'speech' ? '语音合成' : '语音识别')) issue('语音测试任务', '所选任务与模型资料不一致');
      probe = audioProbe;
    }
    return { id: supply.id, localEndpointId: supply.endpoint.id, model: { id: master.id, upstreamModelId: association.upstreamModelId, type: master.type, ...(probe ? { probe } : {}) }, procurementPrices };
  });
  const candidate = { name: `${model.name} · ${service.name}`, publicModelId: service.callId, mode: service.mode, tenantIds: [...tenantIds].sort(), bindings, salePrices, capabilities: ['streaming', 'tools', 'structured'].filter(key => model.capabilities?.[key] === true || key === 'structured' && model.profile?.structured === true), route: platformRoute(version, rows) };
  const fingerprint = JSON.stringify([candidate, rows.map(({ supply, association }) => [connectionFingerprint(supply.endpoint), supply.endpoint.adapterOptions, connectionKeys(supply.endpoint, supply.provider).map(key => [key.id, key.version, key.serverCredentialId]), association.id, association.enabled, association.health, association.capabilityTests, supply.status, supply.provider.status])]);
  return { candidate, fingerprint, publicationFingerprint:platformPublicationFingerprint(state,model,service.id), service, rows, expensive: bindings.some(row => ['image', 'video', 'audio'].includes(row.model.type)) };
}

export async function runPlatformTrial(plan, { confirmExpensive = false, isCurrent = () => true, onProgress = () => {}, onCandidate = () => {}, api = onboardingApi, prepareChannel = prepareServerChannel } = {}) {
  const current = () => { if (!isCurrent()) issue('当前配置', '配置已经变化，请重新试调用'); };
  current();
  if (plan.expensive && !confirmExpensive) issue('试调用', '图片、视频和语音任务需要明确确认费用');
  onProgress('同步允许渠道');
  const channels = new Map();
  for (const { supply } of plan.rows) {
    current();
    if (!channels.has(supply.endpoint.id)) channels.set(supply.endpoint.id, await prepareChannel(supply.provider, supply.endpoint));
  }
  const candidate = { ...plan.candidate, bindings: plan.candidate.bindings.map(({ localEndpointId, ...row }) => ({ ...row, channelId: channels.get(localEndpointId).id })) };
  current(); onProgress('保存服务候选');
  const existing = (await api('/services')).services.find(row => row.candidate.publicModelId === candidate.publicModelId || row.published?.config.publicModelId === candidate.publicModelId);
  const canonicalIds = new Set(candidate.bindings.map(row => row.model.id));
  if (existing?.candidate.bindings.some(row => !canonicalIds.has(row.model.id))) issue('服务调用 ID', '该对外 ID 已被其他模型候选占用');
  current();
  const service = await api(existing ? `/services/${existing.id}` : '/services', { method: existing ? 'PATCH' : 'POST', body: { ...candidate, operationId: crypto.randomUUID(), ...(existing ? { expectedRevision: existing.revision } : {}) } });
  onCandidate(service); current(); onProgress('创建受限测试身份');
  const identity = await api(`/services/${service.id}/test-identities`, { method: 'POST', body: { operationId: crypto.randomUUID(), expectedRevision: service.revision } });
  if (!identity.token) issue('试调用身份', '身份未返回有效令牌，请重新创建试调用');
  current(); onProgress('执行平台试调用');
  const result = await api(`/services/${service.id}/trial`, { method: 'POST', body: { operationId: crypto.randomUUID(), trialToken: identity.token, confirmExpensive } });
  return { service, result, fingerprint: plan.fingerprint, serviceId:plan.service.id, publicationFingerprint:plan.publicationFingerprint };
}

export const publishPlatformCandidate = (service, api = onboardingApi) => api(`/services/${service.id}/publish`, { method: 'POST', body: { operationId: crypto.randomUUID(), expectedRevision: service.revision } });
