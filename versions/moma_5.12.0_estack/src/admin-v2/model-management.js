import { normalizeModelProfile, requireModelBasics } from './model-profile.js';
import { addCatalogueExamples } from './model-catalogue-examples.js';
import { catalogueMetadata } from './real-model-catalogue.js';
import { connectionFingerprint, connectionTestPassed, connectionBlockReason } from './connection-state.js';
import { providerCataloguePrice } from './moma-catalogue-prices.js';
import { cataloguePurchasePrice, billingItemKey, parseSaleAmount } from './provider-catalogue-pricing.js';

export const MODEL_TYPES = { text: '语言模型', multimodal: '视觉理解', image: '图像生成', video: '视频生成', audio: '语音模型', embedding: '向量模型', rerank: '重排模型' };
export const MODEL_CATEGORIES = { text: '语言模型', multimodal: '视觉理解', visual: '视觉生成', audio: '语音模型', embedding: '向量模型', rerank: '重排模型' };
export const MODEL_CATEGORY_DESCRIPTIONS = {
  text: '以对话、写作和推理为主，也可理解图片、视频。',
  multimodal: '以图片、视频分析为主，如识图、图表解读和视频问答。',
  visual: '生成或编辑图片、视频。',
  audio: '将语音转成文字，或将文字转成语音。',
  embedding: '将内容转成向量，用于查找相似内容。',
  rerank: '按相关程度重新排列检索结果。',
};
export const modelCategory = type => ['image', 'video'].includes(type) ? 'visual' : type;
export const modelCode = model => model.modelId;
export function supplyModelUrl(supply, model) {
  const path = supply.provider?.catalogModels?.find(item => item.modelId === (supply.catalogueModelId || supply.upstreamModelId))?.endpoint?.trim();
  const base = supply.endpoint?.baseUrl?.trim() || '';
  if (path) { try { return new URL(path, base || undefined).href; } catch { return ''; } }
  if (base && supply.endpoint?.protocol === 'OpenAI' && ['text', 'multimodal'].includes(model?.type)) return base.endsWith('/chat/completions') ? base : base.replace(/\/$/, '') + '/chat/completions';
  return '';
}
export function parseFloorDiscount(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (!/^\d+(?:\.\d{1,2})?$/.test(text) || Number(text) > 100) throw new Error('底线折扣须为 0–100 的百分比，最多两位小数');
  return Math.round(Number(text) * 100);
}
export const floorDiscountDisplay = price => Number.isInteger(price?.floorDiscountBps) && price.floorDiscountBps >= 0 && price.floorDiscountBps <= 10000 ? `${price.floorDiscountBps / 100}%` : '—';
export function modelSupplierRows(model, supplies) {
  const groups = new Map();
  for (const supply of supplies) {
    const provider = supply.provider, key = provider?.id || supply.endpointId;
    if (groups.has(key)) continue;
    const keyCode = provider?.id.replace(/^(catalog-provider-|provider-)/, '');
    const code = provider?.code || keyCode;
    groups.set(key, { key, name: provider?.name || '供应商不可用', code, callId: code ? `${code}/${modelCode(model)}` : null });
  }
  return [...groups.values()];
}
export const MODEL_TABS = { basic: '基本信息', supplies: '供应商', pricing: '价格配置', publication: '上架配置', history: '变更记录' };
const uid = prefix => `${prefix}-${crypto.randomUUID()}`;
const add = (collection, record) => ({ type: 'add', collection, record });
const update = (collection, id, changes) => ({ type: 'update', collection, id, changes });
const timestamp = () => new Date().toISOString();

export function priceUnits(model) {
  if (model.type === 'image') return ['元/张'];
  if (model.type === 'video') return ['元/秒', '元/百万 Token'];
  if (model.type === 'audio') return model.profile?.tasks?.includes('语音合成') || model.usageUnit === '字符' ? ['元/万字符', '元/分钟', '元/秒', '元/百万 Token'] : ['元/分钟', '元/秒', '元/百万 Token', '元/万字符'];
  if (model.type === 'rerank') return ['元/千次', '元/百万 Token'];
  return ['元/百万 Token'];
}
export const hasOutputPrice = (model, unit = priceUnits(model)[0]) => ['text', 'multimodal'].includes(model.type) || (['video', 'audio'].includes(model.type) && unit === '元/百万 Token');
export const moneyDisplay = value => value == null ? '—' : (value / 1000000).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 6 });
export const displayTime = value => value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '—';

// Each supply has independent immutable selling-price versions.
export function activeSupplySalePrice(state, modelId, supplyId, at = Date.now()) {
  return state.modelSalePrices.filter(price => price.modelId === modelId && price.supplyId === supplyId && price.status === '已发布' && Date.parse(price.effectiveAt) <= at).sort((a, b) => Date.parse(b.effectiveAt) - Date.parse(a.effectiveAt) || b.version - a.version)[0];
}
export function activeSupplyPrice(state, supplyId, at = Date.now()) {
  const supply = state.modelSupplies.find(item => item.id === supplyId);
  if (supply?.catalogueModelId) {
    const endpoint = state.endpoints.find(item => item.id === supply.endpointId);
    const provider = state.providers.find(item => item.id === endpoint?.providerId);
    const quote = provider && providerCataloguePrice(provider, supply.catalogueModelId);
    const items = (quote?.scenarios || []).map(({ listPrice, purchasePrice, ...item }) => ({ ...item, amount: cataloguePurchasePrice(listPrice, quote.discountFactor, purchasePrice) }));
    return { items, sourceVersion: JSON.stringify(quote ? { modelId: supply.catalogueModelId, discountFactor: quote.discountFactor, scenarios: quote.scenarios } : null), sourceLabel: `${provider?.name || '供应商已失效'} / ${supply.catalogueModelId}`, catalogueModelId: supply.catalogueModelId };
  }
  return state.supplyPrices.filter(price => price.supplyId === supplyId && price.status === '生效中' && Date.parse(price.effectiveAt) <= at).sort((a, b) => Date.parse(b.effectiveAt) - Date.parse(a.effectiveAt))[0];
}

export function priceItems(price, model) {
  if (!price) return [];
  if (Array.isArray(price.items)) return price.items;
  // Historical snapshots keep their original fields and IDs; only their presentation is expanded.
  return [['inputPrice', hasOutputPrice(model, price.unit) ? '输入' : '单价'], ...(hasOutputPrice(model, price.unit) ? [['outputPrice', '输出']] : []), ...['cachedPrice', 'cacheWritePrice'].filter(key => price[key] != null).map(key => [key, key === 'cachedPrice' ? '缓存读取' : '缓存写入'])].map(([key, name]) => ({ name, unit: price.unit, currency: 'CNY', amount: price[key] ?? null }));
}
export const procurementVersion = price => price?.sourceVersion || price?.id || '';
export const latestSaleRevision = (state, supplyId) => state.modelSalePrices.filter(price => price.supplyId === supplyId).sort((a, b) => b.version - a.version)[0]?.id || '';
export const procurementLabel = price => price?.sourceLabel || (price ? `历史采购快照 ${price.priceId || price.id} · ${displayTime(price.effectiveAt)}` : '采购价待配置');
export function supplyPriceReady(state, model, supplyId) {
  const cost = priceItems(activeSupplyPrice(state, supplyId), model), sale = priceItems(activeSupplySalePrice(state, model.id, supplyId), model);
  return cost.length > 0 && cost.every(item => item.amount != null && sale.some(row => billingItemKey(row) === billingItemKey(item) && row.amount != null));
}
export function modelSupplies(state, modelId) {
  return state.modelSupplies.filter(supply => supply.modelId === modelId && supply.status !== '已移除').map(supply => {
    const endpoint = state.endpoints.find(item => item.id === supply.endpointId);
    return { ...supply, endpoint, provider: state.providers.find(item => item.id === endpoint?.providerId) };
  });
}
export function availableSupplies(state, modelId, requirements = {}) {
  return modelSupplies(state, modelId).filter(supply => supply.status === '已启用' && supply.validationStatus === '通过' && !connectionBlockReason(supply.endpoint, supply.provider) && ['streaming', 'tools'].every(key => !requirements[key] || supply.capabilities[key]) && (!requirements.context || supply.capabilities.context >= requirements.context) && (!requirements.output || supply.capabilities.output >= requirements.output));
}
export function publicationChecks(state, model) {
  const eligible = availableSupplies(state, model.id, model.capabilities).filter(supply => supply.salesEnabled);
  const selected = modelSupplies(state, model.id).filter(supply => supply.salesEnabled);
  const pricesReady = eligible.length > 0 && selected.length === eligible.length && eligible.every(supply => supplyPriceReady(state, model, supply.id));
  return [
    { label: '展示内容完整', passed: Boolean(model.name?.trim() && model.description?.trim()), tab: 'basic' },
    { label: '至少一家供应商已验证并纳入销售', passed: eligible.length > 0, tab: 'supplies' },
    { label: '供给满足模型声明的能力', passed: availableSupplies(state, model.id, model.capabilities).length > 0, tab: 'supplies' },
    { label: '销售价格与计量规则完整', passed: pricesReady, tab: 'pricing' },
    { label: '开放范围明确', passed: model.openScope === 'all' || (model.openScope === 'selected' && model.tenantIds?.length > 0 && model.tenantIds.every(id => state.tenants.some(tenant => tenant.id === id))), tab: 'publication' },
    ...selected.flatMap(supply => {
      const name = `${supply.provider?.name || '供应商已失效'} / ${supply.upstreamModelId}`;
      const costs = priceItems(activeSupplyPrice(state, supply.id), model), sales = priceItems(activeSupplySalePrice(state, model.id, supply.id), model);
      const missingCost = costs.filter(item => item.amount == null).map(item => item.name);
      const missingSale = costs.filter(item => !sales.some(row => billingItemKey(row) === billingItemKey(item) && row.amount != null)).map(item => item.name);
      return [
        ...(!eligible.some(item => item.id === supply.id) ? [{ label: `${name}：请核对连接、供给验证与声明能力`, passed: false, tab: 'supplies' }] : []),
        ...(!costs.length || missingCost.length ? [{ label: `${name}：采购价待配置${missingCost.length ? '（' + missingCost.join('、') + '）' : ''}`, passed: false, tab: 'pricing' }] : []),
        ...(missingSale.length ? [{ label: `${name}：售价待配置（${missingSale.join('、')}）`, passed: false, tab: 'pricing' }] : []),
      ];
    }),
  ];
}
export function supplyState(state, model) {
  if (!modelSupplies(state, model.id).length) return '未接入';
  if (!availableSupplies(state, model.id).length) return '不可用';
  return availableSupplies(state, model.id, model.capabilities).length ? '正常' : '部分能力不可用';
}

export function modelManagementSeed(models, endpoints, supplyPrices, providers) {
  const at = timestamp();
  const glm = { ...catalogueMetadata('model-glm53'), status: '运行中', visibility: '公开', listingStatus: '已上架', callsEnabled: true, openScope: 'all', tenantIds: [], defaultVersionId: 'version-glm53', createdAt: at, updatedAt: at };
  models.push(glm);
  const modelSupplies = endpoints.flatMap(endpoint => endpoint.modelIds.map(modelId => ({ id: `supply-${endpoint.id}-${modelId}`, modelId, endpointId: endpoint.id, upstreamModelId: models.find(model => model.id === modelId).modelId, capabilities: { ...models.find(model => model.id === modelId).capabilities }, status: endpoint.id === 'endpoint-kimi' ? '已停用' : '已启用', validationStatus: endpoint.id === 'endpoint-kimi' ? '待验证' : '通过', validationCases: ['协议兼容', '基础推理', '流式响应'].map(name => ({ name, passed: endpoint.id !== 'endpoint-kimi' })), verifiedAt: at, createdAt: at, updatedAt: at })));
  endpoints.forEach((endpoint, index) => {
    endpoint.modelIds = [...endpoint.modelIds, glm.id];
    modelSupplies.push({ id: `supply-glm53-${index + 1}`, modelId: glm.id, endpointId: endpoint.id, upstreamModelId: 'glm-5.3', capabilities: { ...glm.capabilities, tools: index === 0 }, status: index === 2 ? '已停用' : '已启用', validationStatus: index === 2 ? '待验证' : '通过', validationCases: ['协议兼容', '基础推理', '流式响应', ...(index === 0 ? ['工具调用'] : [])].map(name => ({ name, passed: index !== 2 })), verifiedAt: index === 2 ? null : at, createdAt: at, updatedAt: at });
  });
  supplyPrices.forEach(price => { price.supplyId = modelSupplies.find(supply => supply.modelId === price.modelId && endpoints.find(endpoint => endpoint.id === supply.endpointId).providerId === price.providerId)?.id; price.unit = '元/百万 Token'; });
  modelSupplies.filter(supply => supply.modelId === glm.id && supply.validationStatus === '通过').forEach((supply, index) => supplyPrices.push({ id: `procurement-glm53-${index}`, priceId: `procurement-glm53-${index}`, supplyId: supply.id, modelId: glm.id, providerId: endpoints.find(endpoint => endpoint.id === supply.endpointId).providerId, inputPrice: index ? 1500000 : 1000000, outputPrice: index ? 6000000 : 5000000, cachedPrice: null, unit: '元/百万 Token', effectiveAt: at, status: '生效中', createdAt: at, updatedAt: at }));
  const modelSalePrices = [models[0], models[1], glm].map(model => ({ id: `sale-${model.id}-v1`, modelId: model.id, version: 1, inputPrice: model.id === glm.id ? 2000000 : 1000000, outputPrice: model.id === glm.id ? 8000000 : 2000000, cachedPrice: null, cacheWritePrice: null, unit: '元/百万 Token', effectiveAt: at, status: '已发布', createdAt: at, updatedAt: at }));
  modelSalePrices.push({ ...modelSalePrices.find(price => price.modelId === glm.id), id: 'sale-glm53-self-v2', supplyId: 'supply-glm53-2', version: 2, inputPrice: 2500000, outputPrice: 9000000 });
  addCatalogueExamples({ models, providers, endpoints, modelSupplies, modelSalePrices, at });
  // Only fresh fixtures receive explicit simulated checks. Stored configurations are never backfilled.
  endpoints.filter(endpoint => endpoint.status === '运行中').forEach(endpoint => {
    endpoint.connectionTest = { result: '通过', message: '服务地址、凭证和协议检查通过', simulated: true, testedAt: at, fingerprint: connectionFingerprint(endpoint) };
  });
  const defaults = modelSalePrices.filter(price => !price.supplyId);
  for (const supply of modelSupplies) {
    const model = models.find(item => item.id === supply.modelId);
    const endpoint = endpoints.find(item => item.id === supply.endpointId);
    const provider = providers.find(item => item.id === endpoint.providerId);
    supply.callId = provider.code + '/' + modelCode(model);
    const price = modelSalePrices.find(item => item.supplyId === supply.id) || defaults.find(item => item.modelId === model.id);
    if (price) {
      if (!modelSalePrices.some(item => item.supplyId === supply.id)) modelSalePrices.push({ ...price, id: 'sale-' + supply.id, supplyId: supply.id });
      if (!supplyPrices.some(item => item.supplyId === supply.id)) supplyPrices.push({ ...price, id: 'cost-' + supply.id, supplyId: supply.id, providerId: provider.id, status: '生效中', inputPrice: Math.round(price.inputPrice * 0.8), outputPrice: price.outputPrice == null ? null : Math.round(price.outputPrice * 0.8) });
    }
    supply.salesEnabled = Boolean(price && supply.status === '已启用');
  }
  return { modelSupplies, modelSalePrices: modelSalePrices.filter(price => price.supplyId) };
}

function capabilities(value = {}, type, catalogue = false) {
  const supplied = key => value[key] != null && value[key] !== '';
  if (['text', 'multimodal', 'embedding', 'rerank'].includes(type) && (!catalogue || supplied('context')) && (!Number.isSafeInteger(Number(value.context)) || Number(value.context) < 1)) throw new Error('上下文上限必须为正整数');
  if (['text', 'multimodal'].includes(type) && (!catalogue || supplied('output')) && (!Number.isSafeInteger(Number(value.output)) || Number(value.output) < 1 || (value.context && Number(value.output) > Number(value.context)))) throw new Error('输出上限必须为正整数且不能超过上下文上限');
  for (const key of ['streaming', 'tools']) if (supplied(key) && typeof value[key] !== 'boolean') throw new Error('调用能力需选择支持、不支持或待确认');
  return { streaming: catalogue && value.streaming == null ? null : Boolean(value.streaming), tools: catalogue && value.tools == null ? null : Boolean(value.tools), context: supplied('context') ? Number(value.context) : null, output: supplied('output') ? Number(value.output) : null };
}

// All UI actions pass this boundary before changing the shared business store.
export function modelTransaction(state, action) {
  const { operation, data = {} } = action;
  if (operation === 'import') {
    if (!Array.isArray(data.models) || !data.models.length || data.models.length > 500) throw new Error('每批需导入 1–500 个模型');
    const working = { ...state, models: [...state.models] }, changes = [];
    for (const model of data.models) {
      const transaction = modelTransaction(working, { operation: 'create', data: model });
      changes.push(...transaction.changes);
      working.models.push(transaction.changes.find(change => change.collection === 'models').record);
    }
    return { type: 'batch', label: `批量导入 ${data.models.length} 个模型`, objectId: 'models', changes };
  }
  const changes = [], at = timestamp();
  const model = operation === 'create' ? null : state.models.find(item => item.id === action.modelId);
  if (operation !== 'create' && !model) throw new Error('模型不存在');
  let objectId = model?.id;
  if (operation === 'create' || operation === 'basic') {
    const modelId = operation === 'create' ? data.modelId?.trim() : model.modelId;
    if (!modelId || !/^[a-z0-9][a-z0-9._:/-]{0,79}$/.test(modelId)) throw new Error('Model ID 需使用小写字母、数字或 . _ : / -，最多 80 字符');
    if (!data.name?.trim() || !data.description?.trim()) throw new Error('模型展示名称和介绍必填');
    if (!MODEL_TYPES[data.type]) throw new Error('模型类型无效');
    if (state.models.some(item => item.id !== model?.id && item.modelId.toLowerCase() === modelId.toLowerCase())) throw new Error('Model ID 已存在');
    const declaredCapabilities = capabilities(data.capabilities, data.type, true);
    const profile = normalizeModelProfile(data.profile ?? model?.profile, data.type, data.usageUnit);
    if (operation === 'create') requireModelBasics(profile);
    if (profile.maxInput && declaredCapabilities.context && profile.maxInput > declaredCapabilities.context) throw new Error('最大输入不能超过上下文上限');
    const fields = { modelId, name: data.name.trim(), maker: profile.author || data.maker || model?.maker || '', description: data.description.trim(), type: data.type, usageUnit: data.usageUnit, profile, capabilities: declaredCapabilities };
    if (model) {
      changes.push(update('models', model.id, fields));
      const previousProfile = normalizeModelProfile(model.profile, model.type, model.usageUnit);
      if (model.type !== fields.type || JSON.stringify(capabilities(model.capabilities, model.type, true)) !== JSON.stringify(fields.capabilities) || ['version', 'tasks', 'inputModalities', 'outputModalities', 'resultTypes', 'reasoning', 'structured'].some(key => JSON.stringify(previousProfile[key] || []) !== JSON.stringify(fields.profile[key] || []))) {
        state.modelSupplies.filter(supply => supply.modelId === model.id && supply.status !== '已移除').forEach(supply => changes.push(update('modelSupplies', supply.id, { status: '已停用', validationStatus: '待验证', verifiedAt: null, validationCases: [] })));
      }
      if (state.modelVersions.some(version => version.id === model.defaultVersionId)) changes.push(update('modelVersions', model.defaultVersionId, { capabilities: fields.capabilities }));
    }
    else {
      objectId = action.recordId || uid('model');
      const versionId = uid('version');
      changes.push(add('models', { id: objectId, ...fields, listingStatus: '已下架', status: '停用', callsEnabled: false, visibility: '内部', openScope: 'all', tenantIds: [], defaultVersionId: versionId }), add('modelVersions', { id: versionId, modelId: objectId, version: 'v1.0', capabilities: fields.capabilities, validationStatus: '未验证', isDefault: true, status: '草稿' }));
    }
  } else if (operation === 'supply') {
    const endpoint = state.endpoints.find(item => item.id === data.endpointId), supply = data.id && state.modelSupplies.find(item => item.id === data.id && item.modelId === model.id);
    if (data.id && !supply) throw new Error('供应服务不存在');
    if (!endpoint) throw new Error('请选择有效接入渠道');
    if (!data.upstreamModelId?.trim() || /\s/.test(data.upstreamModelId)) throw new Error('上游模型 ID 必填且不能包含空格');
    if (state.modelSupplies.some(item => item.id !== supply?.id && item.modelId === model.id && item.endpointId === endpoint.id && item.status !== '已移除')) throw new Error('该渠道已关联此模型');
    const fields = { modelId: model.id, endpointId: endpoint.id, upstreamModelId: data.upstreamModelId.trim(), capabilities: capabilities(data.capabilities, model.type, true), validationStatus: '待验证', verifiedAt: null, validationCases: [], status: '已停用' };
    changes.push(supply ? update('modelSupplies', supply.id, fields) : add('modelSupplies', { id: uid('supply'), ...fields }));
    if (!endpoint.modelIds.includes(model.id)) changes.push(update('endpoints', endpoint.id, { modelIds: [...endpoint.modelIds, model.id] }));
  } else if (['verify', 'enableSupply', 'disableSupply', 'removeSupply'].includes(operation)) {
    const supply = state.modelSupplies.find(item => item.id === data.id && item.modelId === model.id && item.status !== '已移除');
    if (!supply) throw new Error('供应服务不存在');
    const endpoint = state.endpoints.find(item => item.id === supply.endpointId), provider = state.providers.find(item => item.id === endpoint?.providerId);
    if (operation === 'enableSupply' && (supply.validationStatus !== '通过' || connectionBlockReason(endpoint, provider))) throw new Error('供应服务需验证通过，且当前接入配置测试通过并启用、供应商已启用，才能启用');
    if (operation === 'verify') {
      const reason = connectionBlockReason(endpoint, provider);
      if (reason) throw new Error(reason);
      const passed = data.result === '通过' && connectionTestPassed(endpoint);
      changes.push(update('modelSupplies', supply.id, { validationStatus: passed ? '通过' : '失败', verifiedAt: at, validationCases: ['协议兼容', '基础推理', ...(supply.capabilities.streaming ? ['流式响应'] : []), ...(supply.capabilities.tools ? ['工具调用'] : [])].map(name => ({ name, passed })), ...(passed ? {} : { status: '已停用' }) }));
    } else changes.push(update('modelSupplies', supply.id, { status: { enableSupply: '已启用', disableSupply: '已停用', removeSupply: '已移除' }[operation] }));
  } else if (['priceDraft', 'pricePublish'].includes(operation)) {
    if (!Array.isArray(data.items)) throw new Error('请按完整计费项设置售价');
    const supply = modelSupplies(state, model.id).find(item => item.id === data.supplyId);
    if (!supply) throw new Error('供应服务不存在');
    const cost = activeSupplyPrice(state, supply.id), required = priceItems(cost, model);
    if (data.expectedSaleVersion !== latestSaleRevision(state, supply.id)) throw new Error('售价已有并发修订，请载入最新售价并核对草稿');
    if (!required.length || required.some(item => item.amount == null)) throw new Error('采购价缺失，请补齐供应商目录报价');
    if (data.sourceVersion !== procurementVersion(cost)) throw new Error('供应商报价已变化，请核对完整计费项与售价后重试');
    if (data.items.length !== required.length || new Set(data.items.map(billingItemKey)).size !== required.length || required.some(item => !data.items.some(row => billingItemKey(row) === billingItemKey(item)))) throw new Error('售价须包含与采购价一致的完整计费项、单位和适用条件');
    const items = required.map(item => ({ name: item.name, condition: item.condition || '', unit: item.unit, currency: item.currency || 'CNY', amount: parseSaleAmount(data.items.find(row => billingItemKey(row) === billingItemKey(item)).amount, operation !== 'priceDraft') }));
    const effectiveAt = data.effectiveAt ? new Date(data.effectiveAt).toISOString() : at;
    if (data.effectiveAt && Date.parse(effectiveAt) <= Date.now()) throw new Error('定时生效时间必须晚于当前时间');
    if (data.effectiveAt && !activeSupplySalePrice(state, model.id, supply.id)) throw new Error('首次设置售价须立即生效');
    if (state.modelSalePrices.some(price => price.supplyId === supply.id && price.status === '已发布' && price.effectiveAt === effectiveAt)) throw new Error('该生效时间已有价格版本');
    const version = Math.max(0, ...state.modelSalePrices.filter(price => price.modelId === model.id).map(price => price.version)) + 1;
    const floorDiscountBps = data.floorDiscountPercent === undefined ? activeSupplySalePrice(state, model.id, supply.id)?.floorDiscountBps : parseFloorDiscount(data.floorDiscountPercent);
    changes.push(add('modelSalePrices', { id: uid('sale'), modelId: model.id, supplyId: supply.id, items, ...(floorDiscountBps == null ? {} : { floorDiscountBps }), version, sourceVersion: procurementVersion(cost), sourceLabel: procurementLabel(cost), effectiveAt, status: operation === 'priceDraft' ? '草稿' : '已发布' }));
  } else if (operation === 'scope') {
    if (!['all', 'selected'].includes(data.openScope) || (data.openScope === 'selected' && (!data.tenantIds?.length || data.tenantIds.some(id => !state.tenants.some(tenant => tenant.id === id))))) throw new Error('请选择有效的开放客户');
    changes.push(update('models', model.id, { openScope: data.openScope, tenantIds: data.openScope === 'selected' ? [...new Set(data.tenantIds)] : [] }));
  } else if (['publish', 'unlist'].includes(operation)) {
    if (operation === 'publish') {
      const failed = publicationChecks(state, model).filter(check => !check.passed);
      if (failed.length) throw new Error(failed.map(check => check.label).join('；'));
    }
    const fields = { publish: { listingStatus: '已上架', visibility: '公开', callsEnabled: true, status: '运行中' }, unlist: { listingStatus: '已下架', visibility: '内部', callsEnabled: false, status: '停用' } }[operation];
    changes.push(update('models', model.id, fields));
  } else throw new Error('未知模型操作');
  const labels = { create: '创建模型', basic: '编辑模型', supply: '保存供应服务', verify: '验证供应服务', enableSupply: '启用供应服务', disableSupply: '停用供应服务', removeSupply: '移除供应服务', priceDraft: '保存价格草稿', pricePublish: '发布销售价格', scope: '设置开放范围', publish: '模型上架', unlist: '模型下架' };
  return { type: 'batch', label: labels[operation], objectId, changes };
}
