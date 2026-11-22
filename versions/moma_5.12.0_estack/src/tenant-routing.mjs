import { projectAccess, requireProject, projectModelEnabled, projectRole } from './project-access.mjs';

export const autoStrategies = [
  { callId: 'moma/auto', name: '均衡模式', costTier: 'medium' },
  { callId: 'moma/performance', name: '效果优先', costTier: 'high' },
  { callId: 'moma/cost', name: '成本优先', costTier: 'low' },
];

export const providerSorts = [
  { value: 'default', label: '平台默认' },
  { value: 'price', label: '价格优先' },
  { value: 'throughput', label: '吞吐优先', disabled: true },
  { value: 'latency', label: '低时延优先', disabled: true },
  { value: 'manual', label: '手动顺序' },
];

export const routeParameters = [
  { key: 'temperature', label: 'Temperature', min: 0, max: 2, step: 0.1, initial: 0.7 },
  { key: 'top_p', label: 'Top P', min: 0, max: 1, step: 0.1, initial: 1 },
  { key: 'max_tokens', label: '最大输出 Token', min: 1, max: 1048576, step: 1, initial: 1024 },
];

const presetName = /^[A-Za-z0-9_.:-]{2,50}$/;
export const isTenantRouteCall = id => typeof id === 'string' &&
  (autoStrategies.some(strategy => strategy.callId === id) || id.startsWith('@preset/'));
export const activeTenantVersion = route => route?.versions?.find(row => row.number === route.activeVersion);
export const tenantRouteLabel = route => route.callId === 'moma/auto'
  ? 'Auto Router' : activeTenantVersion(route)?.config.label || route.name;
export const validRouteOptions = (model, routing) => routing === undefined || (
  model === 'moma/auto' && routing && typeof routing === 'object' && !Array.isArray(routing) &&
  Object.keys(routing).length === 1 && Object.hasOwn(routing, 'cost_tier') && autoStrategies.some(strategy => strategy.costTier === routing.cost_tier)
);
export const tenantRouteVisible = (route, tenantId, projectId, ownerId, canManage) => route.tenantId === tenantId && route.projectId === projectId &&
  (route.kind === 'auto' || canManage || route.ownerId === ownerId);

export function keyTenantRoute(state, key, callId) {
  if (!key) return undefined;
  const project = state.projects.find(row => row.id === key.projectId && row.tenantId === key.tenantId);
  const member = state.memberships.find(row => row.userId === key.ownerId && row.tenantId === key.tenantId && row.status === '正常');
  const canManage = state.tenants.find(row => row.id === key.tenantId)?.type === '个人' ||
    ['租户管理员','企业管理员'].includes(member?.role) || project && projectRole(project, member) === '项目管理员';
  return (state.tenantRoutes || []).find(row => row.callId === callId && row.enabled &&
    tenantRouteVisible(row, key.tenantId, key.projectId, key.ownerId, canManage));
}

export function visibleProjectRoutes({ state, identity, link }) {
  const projects = new Map(projectAccess(state, identity, link).projects.map(project => [project.id, project]));
  return (state.tenantRoutes || []).flatMap(route => {
    const project = projects.get(route.projectId);
    if (!project || !tenantRouteVisible(route, identity.tenantId, project.id, link.backendUserId, project.canManage)) return [];
    return [route.kind === 'auto' && !project.canManage
      ? { ...route, draft: undefined, versions: route.versions?.filter(version => version.number === route.activeVersion) } : route];
  });
}

export function routeModels(services) {
  const groups = new Map();
  for (const service of services) {
    if (!service.modelKey || !service.callId || !['text', 'multimodal'].includes(service.type)) continue;
    if (!groups.has(service.modelKey)) groups.set(service.modelKey, { id: service.modelKey, name: service.name, services: [] });
    groups.get(service.modelKey).services.push(service);
  }
  return [...groups.values()];
}

function allowedServices(config, model) {
  return (model?.services || []).filter(service => service.callable &&
    (!config.providers.length || config.providers.includes(service.providerId)) &&
    !config.excludedProviders?.includes(service.providerId));
}

function inputPrice(service, now) {
  return service.salePrices?.find(price => price.unit === 'million_input_tokens' && Number.isFinite(price.amount) &&
    (!price.effectiveAt || Date.parse(price.effectiveAt) <= now) && (!price.expiresAt || Date.parse(price.expiresAt) > now));
}

function sortByPrice(services, now) {
  const prices = services.map(service => inputPrice(service, now));
  return prices.every(price => price && price.currency === prices[0]?.currency)
    ? services.toSorted((a, b) => inputPrice(a, now).amount - inputPrice(b, now).amount)
    : services;
}

export function routeTargets(config, services, callId, { inputTokens = 0, now = Date.now(), costTier } = {}) {
  const models = new Map(routeModels(services).map(model => [model.id, model]));
  const groups = config.models.filter(id => !config.excludedModels?.includes(id)).map(id => {
    let candidates = allowedServices(config, models.get(id)).filter(service => {
      const { context, output } = service.capabilities || {};
      const maxOutput = config.parameters.max_tokens || 0;
      return (!context || inputTokens + maxOutput <= context) && (!output || maxOutput <= output);
    }).sort((a, b) => a.callId.localeCompare(b.callId));
    if (config.sort === 'manual') {
      const order = config.providerOrder ?? config.providers;
      const priority = id => order.includes(id) ? order.indexOf(id) : order.length;
      candidates.sort((a, b) => priority(a.providerId) - priority(b.providerId));
    }
    if (config.sort === 'price') candidates = sortByPrice(candidates, now);
    if (config.allowProviderFallbacks === false && candidates.length > 1) {
      const first = candidates[0];
      candidates = candidates.filter(service => service.providerId === first.providerId);
    }
    return { id, candidates };
  }).filter(group => group.candidates.length);

  const strategy = autoStrategies.find(row => row.callId === callId);
  if (!strategy) return groups.flatMap(group => group.candidates);
  const tier = callId === 'moma/auto'
    ? (!config.preventOverrides && costTier) || config.costTier || strategy.costTier : strategy.costTier;
  // shortcut: use published capability and price signals until the 九天 selection service is connected.
  const matching = groups.filter(group => group.candidates.some(service => Number.isFinite(service.capabilities?.context)));
  const fallback = groups.find(group => group.id === config.fallbackModel) || groups[0];
  let chosen = matching[0] || fallback;
  if (tier === 'high' && matching.length) {
    const context = group => Math.max(...group.candidates.map(service => service.capabilities?.context || 0));
    chosen = matching.reduce((best, group) => context(group) > context(best) ? group : best);
  }
  if (tier === 'low' && matching.length) {
    const cheapest = sortByPrice(matching.map(group => sortByPrice(group.candidates, now)[0]), now)[0];
    chosen = matching.find(group => group.candidates.includes(cheapest));
  }
  return chosen?.candidates || [];
}

export function routeConfiguration(config, services, kind, publish, callId) {
  const { models, providers, sort, fallbackModel, description, systemPrompt, parameters,
    excludedModels = [], costTier = 'medium', preventOverrides = false, label = '',
    excludedProviders = [], providerOrder = providers, allowProviderFallbacks = true } = config || {};
  const catalogue = routeModels(services);
  if (!Array.isArray(models) || models.length > 50 || new Set(models).size !== models.length ||
      models.some(id => !catalogue.some(model => model.id === id && model.services.some(row => row.callable)))) {
    throw Error('请选择已订购且当前可调用的模型');
  }
  const validList = (ids, valid) => Array.isArray(ids) && ids.length <= 50 && new Set(ids).size === ids.length && ids.every(valid);
  const availableProvider = id => kind !== 'auto' && catalogue.some(model => models.includes(model.id) &&
    model.services.some(row => row.callable && row.providerId === id));
  if (![providers, excludedProviders, providerOrder].every(ids => validList(ids, availableProvider)) || typeof allowProviderFallbacks !== 'boolean') {
    throw Error('请选择所选模型下的可用供应商');
  }
  if (!['default', 'price', 'manual'].includes(sort) || sort === 'manual' && (!providerOrder.length || kind === 'auto')) {
    throw Error('请选择可用的供应商排序方式');
  }
  const restrictions = { providers, excludedProviders };
  if (models.some(id => !allowedServices(restrictions, catalogue.find(model => model.id === id)).length)) {
    throw Error('所选供应商未覆盖全部模型，请调整范围');
  }
  if (kind === 'auto') {
    if (!validList(excludedModels, id => catalogue.some(model => model.id === id && model.services.some(service => service.callable)))) {
      throw Error('请选择可用的排除模型');
    }
    if (fallbackModel && (!models.includes(fallbackModel) || excludedModels.includes(fallbackModel))) {
      throw Error('兜底模型须在有效模型范围内');
    }
    if (publish && models.every(id => excludedModels.includes(id))) throw Error('至少选择一个可调用模型才能生效');
    if (!autoStrategies.some(strategy => strategy.costTier === costTier) || typeof preventOverrides !== 'boolean') {
      throw Error('请选择有效的成本偏好');
    }
    return { models, excludedModels, providers: [], sort, fallbackModel: fallbackModel || '', parameters: {},
      ...(callId === 'moma/auto' && { costTier, preventOverrides }) };
  }
  if (!models.length) throw Error('请选择首选模型');
  if (typeof label !== 'string' || label.trim().length > 50) throw Error('显示名称最多 50 字');
  if (typeof description !== 'string' || description.length > 200 || typeof systemPrompt !== 'string' || systemPrompt.length > 500) {
    throw Error('描述最多 200 字，系统提示词最多 500 字');
  }
  if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) throw Error('生成参数无效');
  for (const [key, value] of Object.entries(parameters)) {
    const field = routeParameters.find(item => item.key === key);
    if (!field || !Number.isFinite(value) || value < field.min || value > field.max || field.step === 1 && !Number.isInteger(value)) {
      throw Error(`${field?.label || '生成参数'}超出支持范围`);
    }
    if (key === 'max_tokens' && catalogue.some(model => models.includes(model.id) &&
        !allowedServices(restrictions, model).some(service => !service.capabilities?.output || value <= service.capabilities.output))) {
      throw Error('最大输出 Token 超出所选模型服务的能力');
    }
  }
  return { models, providers, excludedProviders, providerOrder, allowProviderFallbacks, sort,
    label: label.trim(), description: description.trim(), systemPrompt, parameters };
}

export function changeTenantRoute({ state, identity, link }, input, services, newId) {
  const { action, kind, id, callId, name, config, version, projectId } = input || {};
  const project = requireProject(projectAccess(state, identity, link).projects, projectId);
  const canManage = project.canManage;
  services = services.map(service => ({ ...service,
    callable: service.callable && projectModelEnabled(project, service.serviceModelId || service.modelKey) }));
  const routes = state.tenantRoutes || [];
  const tenantId = identity.tenantId, ownerId = link.backendUserId;
  const strategy = autoStrategies.find(row => row.callId === callId);
  if (!['auto', 'preset'].includes(kind) || !['draft', 'publish', 'stop', 'switch'].includes(action) ||
      (kind === 'auto' && (!strategy || !canManage))) throw Error('当前账号无权维护此路由');
  const current = id ? routes.find(row => row.id === id) : kind === 'auto'
    ? routes.find(row => row.tenantId === tenantId && row.projectId === projectId && row.kind === kind && row.callId === callId)
    : null;
  if ((id && !current) || current && (current.tenantId !== tenantId || current.kind !== kind ||
      current.callId !== callId || !tenantRouteVisible(current, tenantId, projectId, ownerId, canManage))) {
    throw Error('路由不存在或无权维护');
  }
  const routeName = strategy?.name || current?.name || (typeof name === 'string' ? name.trim() : '');
  if (kind === 'preset' && !presetName.test(routeName)) throw Error('规则名称须为 2–50 位字母、数字或 . _ : -');
  const publicId = kind === 'auto' ? strategy.callId : '@preset/' + routeName;
  if (!current && routes.filter(row => row.tenantId === tenantId && row.projectId === projectId).length >= 100) throw Error('当前项目的路由配置已达上限');
  if (routes.some(row => row.id !== current?.id && row.tenantId === tenantId && row.projectId === projectId && row.callId === publicId) ||
      services.some(row => row.callId === publicId)) throw Error('路由 ID 已被使用');
  const next = current ? { ...current } : { id: newId, tenantId, projectId, ownerId, kind, name: routeName, callId: publicId,
    activeVersion: null, enabled: false, versions: [] };
  if (action === 'stop' || action === 'switch') {
    const target = next.versions.find(row => row.number === version);
    if (!current || action === 'switch' && !target) throw Error('路由版本不存在');
    if (action === 'switch') {
      routeConfiguration(target.config, services, kind, true, publicId);
      next.activeVersion = target.number;
    } else next.enabled = false;
  } else {
    const normalized = routeConfiguration(config, services, kind, action === 'publish', publicId);
    if (action === 'draft') {
      if (kind !== 'auto') throw Error('模型预设须保存并生效');
      next.draft = normalized;
    } else {
      const number = (next.versions.at(-1)?.number || 0) + 1;
      next.versions = [...next.versions, { number, config: normalized, at: new Date().toISOString(), actor: identity.name }];
      next.activeVersion = number;
      next.enabled = true;
      delete next.draft;
    }
  }
  return { ...state, tenantRoutes: current ? routes.map(row => row.id === current.id ? next : row) : [...routes, next] };
}
