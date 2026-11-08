import system from './system-model-catalogue.json' with { type: 'json' };
import workspace from './initial-workspace.json' with { type: 'json' };
import scenario from './model-operations.json' with { type: 'json' };

export const MODEL_DATA_COLLECTIONS = Object.keys(scenario.collections);
export const MODEL_DATASET = scenario;
export const marketDemoModelIds = () => [...new Set([system, workspace, scenario].flatMap(data => data.collections.models.map(model => model.id)))];
export const systemModelData = () => structuredClone(system.collections);
const ids = collections => Object.fromEntries(MODEL_DATA_COLLECTIONS.map(key => [key, (collections[key] || []).map(row => row.id)]));
function instantiateWorkspace(at) {
  const changes = JSON.parse(JSON.stringify(workspace.collections).replaceAll('@initializedAt', at));
  return Object.fromEntries(MODEL_DATA_COLLECTIONS.map(key => {
    const records = new Map(system.collections[key].filter(row => !workspace.excludeIds[key].includes(row.id)).map(row => [row.id, row]));
    for (const row of changes[key]) records.set(row.id, row);
    return [key, structuredClone([...records.values()])];
  }));
}
export function initialWorkspace(source) {
  const at=new Date().toISOString(), collections=instantiateWorkspace(at);
  return { ...source, ...collections, ...workspace.flags, modelData:{systemId:workspace.id,systemVersion:workspace.version,initializedAt:at,builtinIds:ids(collections),userIds:{}} };
}
export const systemModelOrigin = () => ({ systemId: system.id, systemVersion: system.version, builtinIds: ids(system.collections), userIds: {} });

export function validateModelDataset(data = scenario) {
  const fail = message => { throw Error(`模型 Mock 配置无效：${message}`); };
  if (data.version !== 1 || !data.id || !data.collections) fail('数据版本或集合缺失');
  const c = data.collections;
  for (const key of MODEL_DATA_COLLECTIONS) {
    if (!Array.isArray(c[key])) fail(`${key} 必须是数组`);
    const seen = new Set();
    for (const row of c[key]) { if (!row.id || seen.has(row.id)) fail(`${key} ID 缺失或重复`); seen.add(row.id); }
  }
  const find = (key, id) => c[key].find(row => row.id === id) || fail(`${key} 引用不存在：${id}`);
  find('providers', data.platformProviderId);
  for (const model of c.models) {
    const master = find('modelTemplates', model.templateId);
    if (master.modelId !== model.modelId || master.name !== model.name) fail('模型服务与资料身份不一致');
    if (!['standard', 'provider'].includes(model.serviceMode)) fail('服务模式无效');
    const calls = new Set();
    for (const service of model.serviceProviders || []) {
      find('providers', service.providerId);
      if (!service.callId || calls.has(service.callId)) fail('请求模型 ID 缺失或重复');
      calls.add(service.callId);
    }
  }
  for (const provider of c.providers) for (const entry of provider.catalogModels || []) find('modelTemplates', entry.libraryId);
  for (const endpoint of c.endpoints) { find('providers', endpoint.providerId); for (const id of endpoint.modelIds) find('models', id); }
  for (const supply of c.modelSupplies) {
    find('models', supply.modelId);
    const endpoint = find('endpoints', supply.endpointId), provider = find('providers', supply.providerId);
    const mapping = provider.catalogConnections?.find(row => row.id === supply.channelId);
    if (endpoint.providerId !== provider.id || !mapping || mapping.endpointId !== endpoint.id || mapping.upstreamModelId !== supply.upstreamModelId) fail('供应与渠道映射不一致');
  }
  const services = c.models.flatMap(model => model.serviceMode === 'standard' ? [`standard:${model.id}`] : model.serviceProviders.map(row => `provider:${model.id}:${row.providerId}`));
  for (const price of c.modelSalePrices) {
    find('models', price.modelId);
    if (!services.includes(price.serviceId)) fail('售价引用未知服务');
    for (const item of price.items) if (!Number.isSafeInteger(item.amount) || item.amount < 0 || !item.currency || !item.unit) fail('售价金额、币种或单位无效');
  }
  for (const route of c.serviceRoutes) {
    if (!services.includes(route.serviceId)) fail('路由引用未知服务');
    const active = route.versions.find(row => row.version === route.activeVersion);
    if (!active) fail('活动路由版本不存在');
    for (const row of active.config.channels) {
      const supply = find('modelSupplies', row.supplyId);
      if (!route.serviceId.includes(`:${supply.modelId}`) || route.serviceId.startsWith('provider:') && !route.serviceId.endsWith(`:${supply.providerId}`)) fail('路由串模型或串供应商');
    }
    if (active.config.strategy === 'weighted' && active.config.channels.filter(row => row.enabled).reduce((n, row) => n + row.weight, 0) !== 100) fail('路由权重不为100');
  }
  for (const id of data.modelIds) find('models', id);
  return data;
}

// Configuration seeds are immutable. Unknown saved records are user-owned.
export function applyModelDataset(source) {
  validateModelDataset();
  if (source.modelData?.datasetId === scenario.id || source.models.some(row => row.serviceShowcase === 'service-showcase-20261102')) return source;
  for (const model of source.models.filter(row => scenario.collections.models.some(spec => spec.modelId === row.modelId))) {
    const material = source.modelTemplates.find(row => row.id === model.templateId) || model;
    if (material.materialDraft || Object.keys(model.commercialDrafts || {}).length || source.serviceRoutes.some(route => route.serviceId.includes(`:${model.id}`) && route.draft)) throw Error(`${model.name} 有未发布草稿，请先处理草稿`);
  }
  const state = structuredClone(source);
  const defaults = source.modelData?.systemId === workspace.id ? instantiateWorkspace(source.modelData.initializedAt) : system.collections;
  for (const key of ['models', 'modelTemplates']) for (const record of scenario.collections[key]) {
    if (state[key].some(row => row.modelId === record.modelId && row.id !== record.id)) throw Error(`现有模型编码与内置配置冲突：${record.modelId}，输入保留`);
  }
  for (const key of MODEL_DATA_COLLECTIONS) for (const record of scenario.collections[key]) {
    const index = state[key].findIndex(row => row.id === record.id);
    if (index >= 0) {
      if (!source.modelData?.builtinIds?.[key]?.includes(record.id) || source.modelData?.userIds?.[key]?.includes(record.id) || JSON.stringify(state[key][index]) !== JSON.stringify(defaults[key].find(row=>row.id===record.id))) throw Error(`现有${key}记录与内置配置冲突：${record.id}，输入保留`);
      state[key][index] = structuredClone(record);
    } else state[key].push(structuredClone(record));
  }
  const builtinIds = Object.fromEntries(MODEL_DATA_COLLECTIONS.map(key=>[key,[...new Set([...(source.modelData?.builtinIds?.[key] || []),...scenario.collections[key].map(row=>row.id)])]]));
  state.modelData = { ...source.modelData, datasetId: scenario.id, datasetVersion: scenario.version, scenarioId: scenario.scenarioId, builtinIds, activeIds: ids(scenario.collections), userIds: structuredClone(source.modelData?.userIds || {}) };
  return state;
}

export function trackModelUserChanges(before, after) {
  if (!before.modelData) return;
  const userIds = structuredClone(before.modelData.userIds || {});
  for (const key of MODEL_DATA_COLLECTIONS) {
    const originals = new Map(before[key].map(row => [row.id, row]));
    const changed = after[key].filter(row => JSON.stringify(row) !== JSON.stringify(originals.get(row.id))).map(row => row.id);
    const removed = before[key].filter(row => !after[key].some(item => item.id === row.id)).map(row => row.id);
    if (changed.length || removed.length) userIds[key] = [...new Set([...(userIds[key] || []), ...changed, ...removed])];
  }
  after.modelData = { ...after.modelData, userIds };
}

export function modelOperationsView(state, scope, linkedId) {
  if (!state.modelData?.activeIds || scope === 'all') return state;
  const { builtinIds, activeIds, userIds = {} } = state.modelData;
  const visible = (key, row) => activeIds[key]?.includes(row.id) || userIds[key]?.includes(row.id) || !builtinIds[key]?.includes(row.id);
  const models = state.models.filter(row => visible('models', row) || row.id === linkedId);
  const modelIds = new Set(models.map(row => row.id)), templateIds = new Set(models.map(row => row.templateId));
  const modelTemplates = state.modelTemplates.filter(row => visible('modelTemplates', row) || templateIds.has(row.id));
  const materialIds = new Set([...modelIds, ...modelTemplates.map(row => row.id)]);
  const modelSupplies = state.modelSupplies.filter(row => modelIds.has(row.modelId) && (visible('modelSupplies', row) || row.modelId === linkedId && !activeIds.models.includes(linkedId)));
  const endpoints = state.endpoints.filter(row => visible('endpoints', row) || modelSupplies.some(s => s.endpointId === row.id));
  const endpointIds = new Set(endpoints.map(row => row.id));
  const providers = state.providers.filter(row => visible('providers', row) || endpoints.some(ep => ep.providerId === row.id)).map(provider => {
    const baseline=[...(system.collections.providers.find(row=>row.id===provider.id)?.catalogModels || []),...(workspace.collections.providers.find(row=>row.id===provider.id)?.catalogModels || []),...(scenario.collections.providers.find(row=>row.id===provider.id)?.catalogModels || [])];
    const knownCodes=new Set(baseline.map(row=>row.modelId));
    const catalogModels = (provider.catalogModels || []).filter(row => materialIds.has(row.libraryId) || !knownCodes.has(row.modelId));
    return { ...provider, catalogueScope: 'managed', catalogModels, catalogModelIds: catalogModels.map(row => row.modelId), catalogConnections: (provider.catalogConnections || []).filter(row => endpointIds.has(row.endpointId) && catalogModels.some(model => model.modelId === row.modelId)) };
  });
  return { ...state, models, modelTemplates, modelSupplies, endpoints, providers };
}

export function validateSystemModelData(data = system) {
  for (const key of MODEL_DATA_COLLECTIONS) {
    const rows=data.collections[key];
    if (!Array.isArray(rows) || rows.some(row=>!row.id) || new Set(rows.map(row=>row.id)).size!==rows.length) throw Error(`系统初始模型配置 ${key} ID 无效`);
  }
  for (const endpoint of data.collections.endpoints) if (!data.collections.providers.some(row=>row.id===endpoint.providerId)) throw Error('系统初始渠道缺少供应商');
  for (const supply of data.collections.modelSupplies) if (!data.collections.models.some(row=>row.id===supply.modelId) || !data.collections.endpoints.some(row=>row.id===supply.endpointId)) throw Error('系统初始供应关系引用无效');
  if (data === system) validateSystemModelData({ collections: instantiateWorkspace('2026-11-02T00:00:00.000Z') });
  return data;
}
