import { canonicalMomaScenarios } from './moma-billing-items.js';
import { providerCatalogueIds } from './moma-provider.js';
import { availableSupplies, modelTransaction, MODEL_TYPES } from './model-management.js';
import { connectionFingerprint, connectionTestCurrent, connectionTestPassed, connectionCredentialsReady } from './connection-state.js';
import { catalogueConnections, connectionCatalogueIds } from './provider-model-connections.js';
import { isMomaCataloguePrice, providerCataloguePrice } from './moma-catalogue-prices.js';
import { normalizeCataloguePrice, normalizeCatalogueDiscount } from './provider-catalogue-pricing.js';
export { connectionFingerprint, connectionTestCurrent } from './connection-state.js';

export const providerCode = provider => provider.code || ({ mobile: 'cmcc', unicom: 'cucc', telecom: 'ctcc', alibaba: 'bailian' }[provider.id.replace(/^(catalog-provider-|provider-)/, '')] || provider.id.replace(/^(catalog-provider-|provider-)/, ''));
export const PROVIDER_TYPES = { thirdParty: '第三方推理服务', selfHosted: '自有推理服务' };
export const PROTOCOLS = ['OpenAI', '其他'];
export function normalizeProviderCatalogue(ids = []) {
  if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string')) throw new Error('模型目录必须是 Model ID 列表');
  const result = [...new Set(ids.map(id => id.trim()).filter(Boolean))];
  if (result.some(id => /\s/.test(id) || id.length > 200) || result.length > 2000) throw new Error('模型目录每行填写一个有效 Model ID，最多 2000 个');
  return result;
}

export function appendProviderCatalogue(current, text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('请输入上游 Model ID，每行一个。');
  const result = normalizeProviderCatalogue([...current, ...text.split(/\r?\n/)]);
  if (result.length === current.length) throw new Error('输入的 Model ID 均已存在。');
  return result;
}
function normalizeProviderPrice(provider, draft) {
  const entry = normalizeCataloguePrice(draft);
  if (provider.id === 'provider-moma') {
    if (entry.scenarios.some(row => !isMomaCataloguePrice(row))) throw new Error('移动云 MoMA 模型目录仅支持按量计费；请移除省市节点、资源包、抵扣或 TPM 预留报价');
    entry.scenarios = canonicalMomaScenarios(entry.scenarios);
  }
  return entry;
}
function catalogueEndpoint(input) {
  const value = typeof input === 'string' ? input.trim() : '';
  try {
    if (!value || value.length > 2048 || /[\s\\\p{Cc}]/u.test(value) || value.startsWith('//')) throw new Error();
    const path = value.startsWith('/'), url = new URL(value, path ? 'https://endpoint.invalid' : undefined);
    if ((!path && !/^https?:\/\//i.test(value)) || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) throw new Error();
  } catch { throw new Error('Endpoint 须为以 / 开头的接口路径或完整 HTTP/HTTPS 地址，不含空格、账号密码或片段，最多 2048 字'); }
  return value;
}
const uid = prefix => `${prefix}-${crypto.randomUUID()}`;
const add = (collection, record) => ({ type: 'add', collection, record });
const update = (collection, id, changes) => ({ type: 'update', collection, id, changes });

export const maskProviderApiKey = value => typeof value === 'string' && value.length > 8 ? `${value.slice(0, 4)}••••••••${value.slice(-4)}` : '••••••••';

export const PROVIDER_API_KEY_LIMIT = 20;
export const MODEL_CONNECTIVITY_SCENARIOS = { success: '测试成功', unauthorized: '鉴权失败', unavailable: '模型不可用', timeout: '请求超时' };
// shortcut: Results are local previews; real invocation requires server-side credentials and requests.
export function providerModelConnectivityTest(state, { providerId, keyId, endpointId, modelId, upstreamId, prompt, scenario }) {
  const provider = state.providers.find(item => item.id === providerId);
  const endpoint = state.endpoints.find(item => item.id === endpointId && item.providerId === providerId);
  if (!provider || !endpoint) throw new Error('请选择当前供应商的接入地址');
  const key = [...(provider.apiKeys || []), ...(endpoint.apiKeys || [])].find(item => item.id === keyId);
  if (!key) throw new Error('API Key 不存在或不适用于当前接入地址');
  checkedConnectionKeys([key]);
  if (!PROTOCOLS.includes(endpoint.protocol)) throw new Error('接入协议无效，请在模型目录中修改');
  let url;
  try { url = new URL(endpoint.baseUrl); } catch { throw new Error('接入地址无效，请在模型目录中修改'); }
  if ((url.protocol !== 'https:' && !(provider.sourceType === 'selfHosted' && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash) throw new Error('接入地址无效，请在模型目录中修改');
  if (!providerCatalogueIds(provider).includes(modelId)) throw new Error('请选择当前供应商的目录模型');
  const configured = catalogueConnections(state, provider, modelId);
  if (configured.length && !configured.some(item => item.id === endpointId)) throw new Error('接入地址与所选目录模型不匹配');
  const callId = typeof upstreamId === 'string' ? upstreamId.trim() : '';
  if (!callId || callId.length > 200 || /\s/.test(callId)) throw new Error('调用 Model ID 须为 1–200 位字符，不含空格或换行');
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 2000) throw new Error('请填写测试内容，最多 2000 字');
  if (!Object.hasOwn(MODEL_CONNECTIVITY_SCENARIOS, scenario)) throw new Error('请选择有效的结果预览状态');
  return modelConnectivityPreview({ modelId, upstreamId: callId, keyId, endpointId, baseUrl: endpoint.baseUrl, protocol: endpoint.protocol }, scenario);
}
export function modelConnectivityPreview(context, scenario) {
  if (!Object.hasOwn(MODEL_CONNECTIVITY_SCENARIOS, scenario)) throw new Error('请选择有效的结果预览状态');
  const callId = context.upstreamId;
  const responses = {
    success: { result: '通过', title: '测试成功', status: 200, durationMs: 486, message: '模型已返回测试响应。', response: { model: callId, choices: [{ message: { role: 'assistant', content: 'OK' } }] } },
    unauthorized: { result: '失败', title: '鉴权失败', status: 401, durationMs: 128, message: 'API Key 无效或没有访问该模型的权限。', hint: '请核对 Key 的有效期、供应商账号权限与模型授权。', response: { error: { code: 'invalid_api_key', message: 'Authentication failed' } } },
    unavailable: { result: '失败', title: '模型不可用', status: 404, durationMs: 156, message: '当前地址下未找到该模型，或模型尚未开放。', hint: '请核对调用 Model ID 的大小写、接入地址与供应商模型目录。', response: { error: { code: 'model_not_found', message: 'Model is unavailable' } } },
    timeout: { result: '失败', title: '请求超时', status: null, durationMs: 10000, message: '等待模型响应超过 10 秒。', hint: '请检查服务状态与网络连接，稍后重新测试。', response: { error: { code: 'request_timeout', message: 'No response received within 10 seconds' } } },
  };
  return { ...responses[scenario], ...context, simulated: true };
}
function checkedConnectionKeys(keys) {
  if (!Array.isArray(keys) || keys.length > PROVIDER_API_KEY_LIMIT || keys.some(item => !item || !/^[\x21-\x7e]{4}•{8}[\x21-\x7e]{4}$/.test(item.maskedKey || '') || !/^[a-f0-9]{64}$/.test(item.fingerprint || ''))) throw new Error('连接 API Key 配置无效，请重新输入');
  if (new Set(keys.map(item => item.fingerprint)).size !== keys.length) throw new Error('同一连接不能配置相同的 API Key');
  return keys.map(item => ({ id: item.id || uid('connection-key'), maskedKey: item.maskedKey, fingerprint: item.fingerprint }));
}
export async function providerConnectionDraft(value) {
  const inputs = (value.keyInputs || []).map(row => row.value);
  const added = inputs.some(input => input.trim()) ? (await providerApiKeysDraft(inputs)).apiKeys : [];
  return { name: value.name, protocol: value.protocol, baseUrl: value.baseUrl, credentialRef: added.length ? '' : value.credentialRef, capacity: value.capacity, timeoutSeconds: value.timeoutSeconds, apiKeys: checkedConnectionKeys([...(value.apiKeys || []), ...added]) };
}
// shortcut: Store ordered masked metadata only; real invocation and failover require a server-side credential store.
export async function providerApiKeysDraft(inputs) {
  if (!Array.isArray(inputs) || inputs.length > PROVIDER_API_KEY_LIMIT) throw new Error('每个供应商最多配置 20 个 API Key');
  const values = inputs.map((input, index) => {
    const value = typeof input === 'string' ? input.trim() : '';
    if (value && !/^[\x21-\x7e]{12,512}$/.test(value)) throw new Error(`第 ${index + 1} 条 API Key 请输入 12–512 位字符，不要包含空格或换行`);
    return value;
  }).filter(Boolean);
  if (!values.length) throw new Error('请至少输入一个 API Key');
  const apiKeys = await Promise.all(values.map(async value => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    return { maskedKey: maskProviderApiKey(value), fingerprint };
  }));
  if (new Set(apiKeys.map(item => item.fingerprint)).size !== apiKeys.length) throw new Error('本次输入包含相同的 API Key，请移除重复项');
  return { apiKeys };
}

export function providerFacts(state, provider) {
  const endpoints = state.endpoints.filter(endpoint => endpoint.providerId === provider.id);
  const ids = new Set(endpoints.map(endpoint => endpoint.id));
  const supplies = state.modelSupplies.filter(supply => ids.has(supply.endpointId) && supply.status !== '已移除');
  const models = state.models.filter(model => supplies.some(supply => supply.modelId === model.id));
  const available = models.filter(model => availableSupplies(state, model.id).some(supply => ids.has(supply.endpointId)));
  const attention = endpoints.filter(endpoint => endpoint.status === '需关注' || (connectionTestCurrent(endpoint) && endpoint.connectionTest.result !== '通过'));
  return { endpoints, supplies, models, available, attention, running: endpoints.filter(endpoint => ['运行中', '需关注'].includes(endpoint.status)) };
}

export function providerImpact(state, providerId, endpointId) {
  const endpoints = state.endpoints.filter(endpoint => endpoint.providerId === providerId && (!endpointId || endpoint.id === endpointId));
  const ids = new Set(endpoints.map(endpoint => endpoint.id));
  const supplies = state.modelSupplies.filter(supply => ids.has(supply.endpointId) && supply.status !== '已移除');
  const affectedIds = new Set(supplies.map(supply => supply.modelId));
  const projected = { ...state, endpoints: state.endpoints.map(endpoint => ids.has(endpoint.id) ? { ...endpoint, status: '停用' } : endpoint) };
  const exposed = state.models.filter(model => affectedIds.has(model.id) && model.listingStatus === '已上架' && availableSupplies(state, model.id).length > 0 && !availableSupplies(projected, model.id).length);
  const routes = state.routes.filter(route => (route.targets || []).some(target => ids.has(typeof target === 'string' ? target : target.endpointId)));
  const fallbacks = state.fallbacks.filter(fallback => fallback.chain?.some(id => ids.has(id)));
  return { endpoints, supplies, exposed, routes, fallbacks };
}

export function providerTransaction(state, action) {
  const { operation, objectId, data = {} } = action;
  const changes = [];
  const provider = state.providers.find(item => item.id === (data.providerId || objectId));
  if (operation === 'catalogueConnection' || operation === 'connectionKeys') {
    if (!provider || provider.id !== objectId) throw new Error('供应商不存在');
    const endpoint = state.endpoints.find(item => item.id === data.endpointId && item.providerId === provider.id);
    if (data.endpointId && !endpoint) throw new Error('接入地址不存在或不属于此供应商');
    if (operation === 'connectionKeys' && !endpoint) throw new Error('请选择要配置 API Key 的接入地址');
    if (operation === 'catalogueConnection' && !providerCatalogueIds(provider).includes(data.modelId)) throw new Error('该模型不在供应商目录中');
    const fields = { ...endpoint, ...(operation === 'connectionKeys' ? { apiKeys: checkedConnectionKeys(data.apiKeys), credentialRef: data.credentialRef ?? endpoint.credentialRef } : { protocol: data.protocol, baseUrl: typeof data.baseUrl === 'string' ? data.baseUrl.trim().replace(/\/$/, '') : data.baseUrl }), providerId: provider.id, name: endpoint?.name || data.modelId + ' 接入' };
    const changed = endpoint && connectionFingerprint(endpoint) !== connectionFingerprint(fields);
    const previous = operation === 'catalogueConnection' ? catalogueConnections(state, provider, data.modelId) : [];
    const supplies = state.modelSupplies.filter(item => item.status !== '已移除' && state.endpoints.some(ep => ep.id === item.endpointId && ep.providerId === provider.id) && (item.catalogueModelId === data.modelId || item.upstreamModelId === data.modelId));
    const rebinding = operation === 'catalogueConnection' && supplies.some(item => item.endpointId !== endpoint?.id);
    const shared = changed && (connectionCatalogueIds(state, provider, endpoint.id).some(id => operation === 'connectionKeys' || id !== data.modelId) || state.modelSupplies.some(item => item.endpointId === endpoint.id && item.status !== '已移除'));
    if ((shared || rebinding) && !data.confirmed) throw new Error('请确认接入变更会影响关联模型，需要重新验证');
    if (operation === 'catalogueConnection' && previous.length > 1 && !data.confirmed) throw new Error('此模型已有多个接入地址，请核对并确认本次选择');
    const transaction = !endpoint || changed ? providerTransaction(state, { operation: 'connection', objectId: endpoint?.id, data: { ...fields, timeoutSeconds: endpoint?.timeoutSeconds || 60 } }) : { changes: [] };
    changes.push(...transaction.changes);
    const endpointId = endpoint?.id || changes.find(item => item.collection === 'endpoints').record.id;
    if (operation === 'catalogueConnection') {
      changes.push(update('providers', provider.id, { catalogConnections: [...(provider.catalogConnections || []).filter(item => item.modelId !== data.modelId), { modelId: data.modelId, endpointId }] }));
      supplies.filter(item => item.endpointId !== endpointId).forEach(item => changes.push(update('modelSupplies', item.id, { endpointId, status: '已停用', validationStatus: '待验证', verifiedAt: null, validationCases: [] })));
      if (rebinding) {
        const movedIds = new Set(supplies.map(item => item.id));
        const mappings = state.modelSupplies.map(item => movedIds.has(item.id) ? { ...item, endpointId } : item);
        for (const id of new Set([endpointId, ...supplies.map(item => item.endpointId)])) {
          const modelIds = [...new Set(mappings.filter(item => item.endpointId === id && item.status !== '已移除').map(item => item.modelId))];
          if (JSON.stringify(state.endpoints.find(item => item.id === id)?.modelIds || []) !== JSON.stringify(modelIds)) changes.push(update('endpoints', id, { modelIds }));
        }
      }
    }
    return { type: 'batch', label: operation === 'catalogueConnection' ? '保存模型接入地址' : '保存接入 API Key', objectId: provider.id, changes };
  }
  if (operation === 'catalogueAdd') {
    if (!provider || provider.id !== objectId) throw new Error('供应商不存在');
    if (typeof data.modelId !== 'string' || !data.modelId.trim()) throw new Error('请填写模型ID');
    if (!Object.hasOwn(MODEL_TYPES, data.modelType)) throw new Error('请选择有效的模型类型');
    const endpoint = catalogueEndpoint(data.endpoint);
    const [modelId] = normalizeProviderCatalogue([data.modelId]);
    const currentIds = providerCatalogueIds(provider);
    if (currentIds.includes(modelId)) throw new Error('该 Model ID 已在供应商目录中，请进入已有模型维护');
    const catalogModelIds = normalizeProviderCatalogue([...currentIds, modelId]);
    const entry = normalizeProviderPrice(provider, { ...data, modelId });
    if (!entry.scenarios.length || entry.scenarios.some(row => row.listPrice == null)) throw new Error('请至少填写一条完整计费项、目录价和计价单位；免费请填 0');
    const catalogPricing = [...(provider.catalogPricing || []), entry];
    const catalogModels = [...(provider.catalogModels || []), { modelId, type: data.modelType, endpoint }];
    const fields = { catalogModelIds, catalogPricing, catalogModels };
    const staged = { ...state, providers: state.providers.map(item => item.id === provider.id ? { ...item, ...fields } : item) };
    const connection = providerTransaction(staged, { operation: 'catalogueConnection', objectId: provider.id, data: { modelId, protocol: data.protocol, baseUrl: data.baseUrl } });
    return { type: 'batch', label: '添加供应商目录模型', objectId: provider.id, changes: [update('providers', provider.id, fields), ...connection.changes] };
  }
  if (operation === 'catalogueImport') {
    if (!provider || provider.id !== objectId) throw new Error('供应商不存在');
    if (data.mode !== 'batch') throw new Error('请选择批量添加；单个模型请填写添加模型表单');
    const catalogModelIds = appendProviderCatalogue(providerCatalogueIds(provider), data.text);
    return { type: 'batch', label: '添加供应商模型目录', objectId: provider.id, changes: [update('providers', provider.id, { catalogModelIds })] };
  }
  if (['cataloguePrice', 'catalogueDiscount'].includes(operation)) {
    if (!provider || provider.id !== objectId) throw new Error('供应商不存在');
    if (!providerCatalogueIds(provider).includes(data.modelId)) throw new Error('该 Model ID 不在供应商目录中，请重新载入目录');
    const current = provider.catalogPricing?.find(item => item.modelId === data.modelId) || providerCataloguePrice(provider, data.modelId);
    const entry = operation === 'catalogueDiscount'
      ? { ...current, discountFactor: normalizeCatalogueDiscount(data.discountFactor) }
      : { ...normalizeProviderPrice(provider, { ...data, discountFactor: '' }), discountFactor: current.discountFactor ?? 1000000 };
    const catalogPricing = [...(provider.catalogPricing || []).filter(item => item.modelId !== entry.modelId), entry];
    return { type: 'batch', label: operation === 'catalogueDiscount' ? '修改采购折扣系数' : '修改供应商目录价', objectId: provider.id, changes: [update('providers', provider.id, { catalogPricing })] };
  }
  if (operation === 'addApiKeys') {
    if (!provider || provider.id !== objectId) throw new Error('供应商不存在');
    if (!Array.isArray(data.apiKeys) || !data.apiKeys.length || data.apiKeys.length > PROVIDER_API_KEY_LIMIT || data.apiKeys.some(item => !item || !/^[\x21-\x7e]{4}•{8}[\x21-\x7e]{4}$/.test(item.maskedKey || '') || !/^[a-f0-9]{64}$/.test(item.fingerprint || ''))) throw new Error('API Key 配置无效，请重新输入。');
    const keys = provider.apiKeys || [];
    if (keys.length + data.apiKeys.length > PROVIDER_API_KEY_LIMIT) throw new Error('每个供应商最多配置 20 个 API Key');
    const fingerprints = new Set([...keys, ...data.apiKeys].map(item => item.fingerprint));
    if (fingerprints.size !== keys.length + data.apiKeys.length) throw new Error('此供应商已配置相同的 API Key，或本次输入有重复项。');
    const createdAt = new Date().toISOString();
    changes.push(update('providers', provider.id, { apiKeys: [...keys, ...data.apiKeys.map(item => ({ id: uid('provider-key'), maskedKey: item.maskedKey, fingerprint: item.fingerprint, createdAt }))] }));
    return { type: 'batch', label: '添加 API Key', objectId: provider.id, changes };
  }
  if (['supply', 'verify', 'enableSupply', 'disableSupply'].includes(operation)) {
    const supply = state.modelSupplies.find(item => item.id === data.id);
    const endpoint = state.endpoints.find(item => item.id === (operation === 'supply' ? data.endpointId : supply?.endpointId));
    if (!provider || endpoint?.providerId !== provider.id) throw new Error('模型映射不属于该供应商');
    if (operation === 'supply' && data.id && supply?.endpointId !== endpoint.id) throw new Error('现有模型映射不能更换接入，请在目标接入新增映射');
    const transaction = modelTransaction(state, { type: 'modelOperation', operation, modelId: operation === 'supply' ? data.modelId : supply.modelId, data });
    return { ...transaction, objectId: provider.id };
  }
  if (['create', 'profile'].includes(operation)) {
    if (operation === 'profile' && !provider) throw new Error('供应商不存在');
    const name = data.name?.trim();
    if (!name) throw new Error('请填写供应商名称');
    if (state.providers.some(item => item.id !== provider?.id && item.name.trim().toLowerCase() === name.toLowerCase())) throw new Error('供应商名称已存在');
    if (!PROVIDER_TYPES[data.sourceType]) throw new Error('请选择有效的供给类型');
    const code = operation === 'create' ? data.code?.trim().toLowerCase() : providerCode(provider);
    if (operation === 'create' && (!/^[a-z][a-z0-9-]{1,31}$/.test(code || '') || state.providers.some(item => providerCode(item).toLowerCase() === code))) throw new Error('供应商英文编码需为 2–32 位小写字母、数字或连字符，且不可重复');
    const description = data.description?.trim() || '';
    if (description && [...description].length < 140 && description !== provider?.description?.trim()) throw new Error('备注为选填，填写时不少于 140 字');
    const fields = { code, name, sourceType: data.sourceType, contact: data.contact?.trim() || '', contactInfo: data.contactInfo?.trim() || '', description, ...(operation === 'create' ? { catalogModelIds: normalizeProviderCatalogue(data.catalogModelIds ?? []) } : {}) };
    if (operation === 'create') changes.push(add('providers', { id: data.id || uid('provider'), ...fields, status: '已启用', contractEnd: null }));
    else {
      if (provider.sourceType !== fields.sourceType && state.endpoints.some(endpoint => endpoint.providerId === provider.id)) throw new Error('已有接入配置，不能变更供给类型');
      changes.push(update('providers', provider.id, fields));
    }
  } else if (['enableProvider', 'disableProvider'].includes(operation)) {
    if (!provider) throw new Error('供应商不存在');
    if (operation === 'disableProvider' && !data.confirmed) throw new Error('请先确认停用影响');
    changes.push(update('providers', provider.id, { status: operation === 'enableProvider' ? '已启用' : '停用' }));
  } else {
    const endpoint = state.endpoints.find(item => item.id === objectId);
    if (operation === 'connection') {
      if (!provider) throw new Error('供应商不存在');
      if (objectId && (!endpoint || endpoint.providerId !== provider.id)) throw new Error('接入配置不存在或不属于该供应商');
      if (!data.name?.trim()) throw new Error('请填写接入名称');
      if (!PROTOCOLS.includes(data.protocol)) throw new Error('请选择有效的接入协议');
      let url;
      try { url = new URL(data.baseUrl); } catch { throw new Error('请填写有效的服务地址'); }
      if (url.protocol !== 'https:' && !(provider.sourceType === 'selfHosted' && url.protocol === 'http:')) throw new Error('第三方服务地址须使用 HTTPS；自有推理服务可使用 HTTP');
      if (url.username || url.password || url.search || url.hash) throw new Error('服务地址不能包含账号、密码、查询参数或片段');
      const credentialRef = data.credentialRef?.trim() || '';
      const apiKeys = checkedConnectionKeys(data.apiKeys ?? endpoint?.apiKeys ?? []);
      if (credentialRef && !/^(env:[A-Z_][A-Z0-9_]*|secret:[a-zA-Z0-9_./-]+)$/.test(credentialRef) && endpoint?.credentialRef !== credentialRef) throw new Error('凭证引用无效');
      const capacity = data.capacity == null || String(data.capacity).trim() === '' ? null : Number(data.capacity), timeoutSeconds = Number(data.timeoutSeconds);
      if ((capacity != null && (!Number.isSafeInteger(capacity) || capacity < 1)) || !Number.isSafeInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 600) throw new Error('RPM 如填写必须为正整数；超时须为 1–600 秒');
      const fields = { name: data.name.trim(), providerId: provider.id, protocol: data.protocol, baseUrl: url.toString().replace(/\/$/, ''), credentialRef, apiKeys, capacity, timeoutSeconds };
      const changed = !endpoint || connectionFingerprint(endpoint) !== connectionFingerprint(fields);
      if (!endpoint) {
        const id = uid('endpoint');
        changes.push(add('endpoints', { id, endpointId: id, ...fields, modelIds: [], status: '草稿', health: null, connectionTest: null }));
      } else {
        changes.push(update('endpoints', endpoint.id, { ...fields, ...(changed ? { status: '停用', connectionTest: null } : {}) }));
        if (changed) state.modelSupplies.filter(supply => supply.endpointId === endpoint.id && supply.status !== '已移除').forEach(supply => changes.push(update('modelSupplies', supply.id, { status: '已停用', validationStatus: '待验证', verifiedAt: null, validationCases: [] })));
      }
    } else {
      if (!endpoint) throw new Error('接入配置不存在');
      const owner = state.providers.find(item => item.id === endpoint.providerId);
      if (operation === 'testConnection') {
        if (!connectionCredentialsReady(endpoint, owner)) throw new Error('请先在 API Key 页签配置此接入地址的凭证');
        const scenarios = { 成功: ['通过', '服务地址、凭证和协议检查通过'], 超时: ['失败', '上游连接超时，请检查服务地址与网络'], 鉴权失败: ['失败', '鉴权失败，请检查凭证引用与权限'], 协议错误: ['失败', '协议不兼容，请核对接入协议'] };
        const result = scenarios[data.scenario];
        if (!result) throw new Error('请选择测试场景');
        changes.push(update('endpoints', endpoint.id, { connectionTest: { result: result[0], message: result[1], simulated: true, testedAt: new Date().toISOString(), fingerprint: connectionFingerprint(endpoint) }, ...(result[0] !== '通过' && ['运行中', '需关注'].includes(endpoint.status) ? { status: '需关注' } : {}) }));
      } else if (operation === 'enableConnection') {
        if (!connectionCredentialsReady(endpoint, owner)) throw new Error('请先在 API Key 页签配置此接入地址的凭证');
        if (owner?.status !== '已启用') throw new Error('请先启用供应商');
        if (!connectionTestPassed(endpoint)) throw new Error('当前接入配置须先通过连接测试');
        changes.push(update('endpoints', endpoint.id, { status: '运行中' }));
      } else if (operation === 'disableConnection') {
        if (!data.confirmed) throw new Error('请先确认停用影响');
        changes.push(update('endpoints', endpoint.id, { status: '停用' }));
      } else throw new Error('未知供应商操作');
    }
  }
  return { type: 'batch', label: ({ create: '新增模型供应商', profile: '更新供应商资料', connection: '保存供应商接入配置', testConnection: '连接测试', enableProvider: '启用供应商', disableProvider: '停用供应商', enableConnection: '启用接入', disableConnection: '停用接入' })[operation], objectId: objectId || changes[0]?.record?.id, changes };
}
