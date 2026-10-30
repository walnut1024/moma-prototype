import { modelLibrary } from './model-library.js';
import { supplierModelFields } from './supply-models.js';
import { canonicalMomaScenarios } from './moma-billing-items.js';
import { providerCatalogueIds } from './moma-provider.js';
import { availableSupplies, modelTransaction } from './model-management.js';
import { connectionFingerprint, connectionTestCurrent, connectionTestPassed, connectionCredentialsReady, connectionKeys } from './connection-state.js';
import { supplierResourceTransaction, invalidateSupplierChannels } from './supplier-resources.js';
import { catalogueConnections, connectionCatalogueIds } from './provider-model-connections.js';
import { isMomaCataloguePrice, providerCataloguePrice } from './moma-catalogue-prices.js';
import { normalizeCataloguePrice, normalizeCatalogueDiscount, cataloguePriceDraft, billingItemKey } from './provider-catalogue-pricing.js';
import { providerChannelTransaction, channelIdentity, catalogueChannels, channelInterfaceIssue } from './provider-channels.js';
import { officialCatalogueTransaction } from './official-supply-catalogue.js';
import { providerKeyGroups } from './provider-key-groups.js';
export { connectionFingerprint, connectionTestCurrent } from './connection-state.js';

export const providerCode = provider => provider.code || ({ mobile: 'cmcc', unicom: 'cucc', telecom: 'ctcc', alibaba: 'bailian' }[provider.id.replace(/^(catalog-provider-|provider-)/, '')] || provider.id.replace(/^(catalog-provider-|provider-)/, ''));
export const PROVIDER_TYPES = { thirdParty: '第三方推理服务', selfHosted: '自有推理服务' };
export const PROTOCOLS = ['OpenAI', 'Anthropic', '其他'];
export const SUPPLIER_MODEL_TYPES = { text: '语言模型', multimodal: '多模态理解', visual: '视觉模型', audio: '语音模型', embedding: '向量模型', rerank: '重排模型' };
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
const uid = prefix => `${prefix}-${crypto.randomUUID()}`;
const add = (collection, record) => ({ type: 'add', collection, record });
const update = (collection, id, changes) => ({ type: 'update', collection, id, changes });

export const maskProviderApiKey = value => typeof value === 'string' && value.length > 8 ? `${value.slice(0, 4)}••••••••${value.slice(-4)}` : '••••••••';
export const providerApiKeyName = key => typeof key.name === 'string' && key.name.trim() ? key.name : `API 密钥 ${(key.id || key.fingerprint).slice(-6)}`;
export const providerApiKeyId = key => key.id.match(/^(?:provider-key-)?([a-f0-9]{8})(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i)?.[1] || key.id;

export function providerApiKeyRows(state, provider) {
  const rows = new Map();
  const addKey = (apiKey, endpoint) => {
    if (!rows.has(apiKey.fingerprint)) rows.set(apiKey.fingerprint, { apiKey, endpoints: [] });
    const row = rows.get(apiKey.fingerprint);
    if (endpoint && !row.endpoints.some(item => item.id === endpoint.id)) row.endpoints.push(endpoint);
  };
  (provider.apiKeys || []).forEach(key => addKey(key));
  state.endpoints.filter(item => item.providerId === provider.id && !item.deletedAt).forEach(endpoint => connectionKeys(endpoint, provider, true).forEach(key => addKey(key, endpoint)));
  return [...rows.values()];
}

export const PROVIDER_API_KEY_LIMIT = 20;
export const MODEL_CONNECTIVITY_SCENARIOS = { success: '测试成功', unauthorized: '鉴权失败', unavailable: '模型不可用', timeout: '请求超时' };
export function supplierModelTestPreview(state, providerId, associationId, modelId, keyGroupId) {
  const provider = state.providers.find(row => row.id === providerId);
  if (!provider) throw new Error('供应商不存在');
  const association = catalogueChannels(state, provider, modelId).find(row => row.id === associationId);
  if (!association?.endpointId) throw new Error('模型与渠道关联已变化');
  const issue = channelInterfaceIssue(provider, association);
  if (issue) throw new Error(issue);
  const owner = { ...provider, apiKeys: providerApiKeyRows(state, provider).map(row => row.apiKey) };
  if (!providerKeyGroups(owner).some(row => row.id === keyGroupId)) throw new Error('请选择当前供应商的 API 密钥组');
  const endpoint = { ...association.endpoint, authMode: 'group', keyGroupId, apiKeyId: '', apiKeys: [], credentialRef: '' };
  const working = { ...state, providers: state.providers.map(row => row.id === providerId ? owner : row), endpoints: state.endpoints.map(row => row.id === endpoint.id ? endpoint : row) };
  return providerModelConnectivityTest(working, { providerId, endpointId: endpoint.id, modelId, upstreamId: association.upstreamModelId, prompt: '连接检查', scenario: 'success' });
}
// shortcut: Results are local previews; real invocation requires server-side credentials and requests.
export function providerModelConnectivityTest(state, { providerId, keyId, endpointId, modelId, upstreamId, prompt, scenario }) {
  const provider = state.providers.find(item => item.id === providerId);
  const endpoint = state.endpoints.find(item => item.id === endpointId && item.providerId === providerId);
  if (!provider || !endpoint) throw new Error('请选择当前供应商的接入地址');
  const groupKey = endpoint.authMode === 'group' ? connectionKeys(endpoint, provider)[0] : null;
  if (endpoint.authMode === 'group' && (!groupKey || keyId && keyId !== groupKey.id)) throw new Error('请使用当前渠道 API 密钥组中可用的主要密钥');
  const key = groupKey || [...(provider.apiKeys || []), ...(endpoint.apiKeys || [])].find(item => item.id === keyId);
  if (keyId && !key || !key && !connectionCredentialsReady({ ...endpoint, apiKeys: [] }, provider)) throw new Error('API 密钥不存在或不适用于当前接入地址');
  if (key) checkedConnectionKeys([key]);
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
  return modelConnectivityPreview({ modelId, upstreamId: callId, keyId: groupKey?.id || keyId, endpointId, baseUrl: endpoint.baseUrl, protocol: endpoint.protocol }, scenario);
}
export function modelConnectivityPreview(context, scenario) {
  if (!Object.hasOwn(MODEL_CONNECTIVITY_SCENARIOS, scenario)) throw new Error('请选择有效的结果预览状态');
  const callId = context.upstreamId;
  const responses = {
    success: { result: '通过', title: '测试成功', status: 200, durationMs: 486, message: '模型已返回测试响应。', response: { model: callId, choices: [{ message: { role: 'assistant', content: 'OK' } }] } },
    unauthorized: { result: '失败', title: '鉴权失败', status: 401, durationMs: 128, message: 'API 密钥无效或没有访问该模型的权限。', hint: '请核对 API 密钥的有效期、供应商账号权限与模型授权。', response: { error: { code: 'invalid_api_key', message: 'Authentication failed' } } },
    unavailable: { result: '失败', title: '模型不可用', status: 404, durationMs: 156, message: '当前地址下未找到该模型，或模型尚未开放。', hint: '请核对调用 Model ID 的大小写、接入地址与供应商模型目录。', response: { error: { code: 'model_not_found', message: 'Model is unavailable' } } },
    timeout: { result: '失败', title: '请求超时', status: null, durationMs: 10000, message: '等待模型响应超过 10 秒。', hint: '请检查服务状态与网络连接，稍后重新测试。', response: { error: { code: 'request_timeout', message: 'No response received within 10 seconds' } } },
  };
  return { ...responses[scenario], ...context, simulated: true };
}
function checkedConnectionKeys(keys) {
  if (!Array.isArray(keys) || keys.length > PROVIDER_API_KEY_LIMIT || keys.some(item => !item || !/^[\x21-\x7e]{4}•{8}[\x21-\x7e]{4}$/.test(item.maskedKey || '') || !/^[a-f0-9]{64}$/.test(item.fingerprint || ''))) throw new Error('连接 API 密钥配置无效，请重新输入');
  if (new Set(keys.map(item => item.fingerprint)).size !== keys.length) throw new Error('同一连接不能配置相同的 API 密钥');
  return keys.map(item => ({ id: item.id || uid('connection-key'), maskedKey: item.maskedKey, fingerprint: item.fingerprint, ...(item.name ? { name: item.name } : {}), ...(item.createdAt ? { createdAt: item.createdAt } : {}) }));
}
export async function providerConnectionDraft(value) {
  const inputs = (value.keyInputs || []).map(row => row.value);
  const added = inputs.some(input => input.trim()) ? (await providerApiKeysDraft(inputs)).apiKeys : [];
  return { name: value.name, protocol: value.protocol, baseUrl: value.baseUrl, credentialRef: added.length ? '' : value.credentialRef, capacity: value.capacity, timeoutSeconds: value.timeoutSeconds, apiKeys: checkedConnectionKeys([...(value.apiKeys || []), ...added]) };
}
// shortcut: Store ordered masked metadata only; real invocation and failover require a server-side credential store.
export async function providerApiKeysDraft(inputs) {
  if (!Array.isArray(inputs) || inputs.length > PROVIDER_API_KEY_LIMIT) throw new Error('每个供应商最多配置 20 个 API 密钥');
  const values = inputs.map((input, index) => {
    const value = typeof input === 'string' ? input.trim() : '';
    if (value && !/^[\x21-\x7e]{12,512}$/.test(value)) throw new Error(`第 ${index + 1} 条 API 密钥请输入 12–512 位字符，不要包含空格或换行`);
    return value;
  }).filter(Boolean);
  if (!values.length) throw new Error('请至少输入一个 API 密钥');
  const apiKeys = await Promise.all(values.map(async value => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    return { maskedKey: maskProviderApiKey(value), fingerprint };
  }));
  if (new Set(apiKeys.map(item => item.fingerprint)).size !== apiKeys.length) throw new Error('本次输入包含相同的 API 密钥，请移除重复项');
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
  if (operation === 'officialCatalogue') return officialCatalogueTransaction(state);
  if (['supplierModelLink', 'supplierModelAdd', 'supplierChannelCreate', 'supplierChannelSave', 'supplierChannelDelete', 'supplierChannelTest', 'supplierChannelEnable', 'supplierModelTest', 'supplierModelEnable', 'supplierAssociationSave', 'supplierAssociationRemove', 'defaultApiKey', 'toggleApiKey', 'keyGroupSave', 'keyGroupDelete', 'keyGroupPrimary'].includes(operation)) return supplierResourceTransaction(state, action, providerTransaction, normalizeProviderPrice);
  if (['channelSave', 'channelPrice', 'channelTest', 'channelEnable', 'channelDisable', 'channelDelete', 'catalogueRemove'].includes(operation)) return providerChannelTransaction(state, action, providerTransaction, normalizeProviderPrice, modelConnectivityPreview);
  const changes = [];
  const provider = state.providers.find(item => item.id === (data.providerId || objectId));
  if (operation === 'catalogueConnection' || operation === 'connectionKeys') {
    if (!provider || provider.id !== objectId) throw new Error('供应商不存在');
    const endpoint = state.endpoints.find(item => item.id === data.endpointId && item.providerId === provider.id);
    if (data.endpointId && !endpoint) throw new Error('接入地址不存在或不属于此供应商');
    if (operation === 'connectionKeys' && !endpoint) throw new Error('请选择要配置 API 密钥的接入地址');
    if (operation === 'catalogueConnection' && !providerCatalogueIds(provider).includes(data.modelId)) throw new Error('该模型不在供应商目录中');
    const fields = { ...endpoint, ...(operation === 'connectionKeys' ? { apiKeys: checkedConnectionKeys(data.apiKeys), credentialRef: data.credentialRef ?? endpoint.credentialRef } : { protocol: data.protocol, baseUrl: typeof data.baseUrl === 'string' ? data.baseUrl.trim().replace(/\/$/, '') : data.baseUrl }), providerId: provider.id, name: endpoint?.name || data.modelId + ' 接入' };
    const changed = endpoint && connectionFingerprint(endpoint) !== connectionFingerprint(fields);
    const previous = operation === 'catalogueConnection' ? catalogueConnections(state, provider, data.modelId) : [];
    const supplies = state.modelSupplies.filter(item => item.status !== '已移除' && state.endpoints.some(ep => ep.id === item.endpointId && ep.providerId === provider.id) && (item.catalogueModelId === data.modelId || item.upstreamModelId === data.modelId));
    const rebinding = operation === 'catalogueConnection' && supplies.some(item => item.endpointId !== endpoint?.id);
    const shared = changed && (connectionCatalogueIds(state, provider, endpoint.id).some(id => operation === 'connectionKeys' || id !== data.modelId) || state.modelSupplies.some(item => item.endpointId === endpoint.id && item.status !== '已移除'));
    if ((shared || rebinding) && !data.confirmed) throw new Error('请确认接入变更会影响关联模型，需要重新验证');
    if (operation === 'catalogueConnection' && previous.length > 1) throw new Error('此模型已有多个渠道，请在管理渠道中逐个编辑，不能合并接入');
    const transaction = !endpoint || changed ? providerTransaction(state, { operation: 'connection', objectId: endpoint?.id, data: { ...fields, timeoutSeconds: endpoint?.timeoutSeconds || 60 } }) : { changes: [] };
    changes.push(...transaction.changes);
    const endpointId = endpoint?.id || changes.find(item => item.collection === 'endpoints').record.id;
    if (operation === 'catalogueConnection') {
      const existing = provider.catalogConnections?.find(item => item.modelId === data.modelId);
      changes.push(update('providers', provider.id, { catalogConnections: [...(provider.catalogConnections || []).filter(item => item.modelId !== data.modelId), { ...existing, id: existing?.id || channelIdentity(provider.id, data.modelId, endpointId), modelId: data.modelId, endpointId, name: existing?.name || '默认渠道', origin: existing?.origin || 'undisclosed', upstreamModelId: existing?.upstreamModelId || data.modelId, enabled: false, health: null }] }));
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
    return { type: 'batch', label: operation === 'catalogueConnection' ? '保存模型接入地址' : '保存接入 API 密钥', objectId: provider.id, changes };
  }
  if (operation === 'catalogueAdd') {
    if (!provider || provider.id !== objectId) throw new Error('供应商不存在');
    if (typeof data.modelId !== 'string' || !data.modelId.trim()) throw new Error('请填写模型ID');
    if (!Object.hasOwn(SUPPLIER_MODEL_TYPES, data.modelType)) throw new Error('请选择有效的模型类型');
    const [modelId] = normalizeProviderCatalogue([data.modelId]);
    if (!/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/.test(modelId)) throw new Error('模型 ID 仅支持英文字母、数字和中划线，中划线不能在首尾或连续出现');
    const channelName = typeof data.channelName === 'string' ? data.channelName.trim() : '';
    if (!channelName || channelName.length > 60 || /\p{Cc}/u.test(channelName)) throw new Error('请填写渠道名称，最多 60 字');
    const modelName = typeof data.modelName === 'string' ? data.modelName.trim() : '';
    if (modelName.length > 100 || /\p{Cc}/u.test(modelName)) throw new Error('模型显示名最多 100 字，不能包含控制字符');
    const apiUrl = typeof data.apiUrl === 'string' ? data.apiUrl.trim() : '';
    let url;
    try { url = new URL(apiUrl); } catch { throw new Error('请填写包含协议、域名和接口路径的完整 API URL'); }
    if (apiUrl.length > 2048 || /[\s\\\p{Cc}]/u.test(apiUrl) || !/^https?:\/\//i.test(apiUrl) || url.pathname === '/' || /^\/v\d+\/?$/i.test(url.pathname)) throw new Error('请填写包含完整接口路径的 API URL，不能只填写 Base URL');
    const protocol = data.modelType === 'text' ? data.protocol ?? 'OpenAI' : '其他';
    if (data.modelType === 'text' && protocol !== 'OpenAI') throw new Error('语言模型目前仅支持 OpenAI 协议');
    const currentIds = providerCatalogueIds(provider);
    if (currentIds.includes(modelId) || provider.catalogModelIds?.includes(modelId) || provider.catalogModels?.some(item => item.modelId === modelId)) throw new Error('该 Model ID 已在供应商目录或历史记录中，请使用其他 ID');
    const catalogModelIds = normalizeProviderCatalogue([...currentIds, modelId]);
    const entry = normalizeProviderPrice(provider, { ...data, modelId });
    if (!entry.scenarios.length || entry.scenarios.some(row => row.listPrice == null)) throw new Error('请至少填写一条完整计费项、目录价和计价单位；免费请填 0');
    const catalogPricing = [...(provider.catalogPricing || []), entry];
    const catalogModels = [...(provider.catalogModels || []), { modelId, name: modelName || modelId, type: data.modelType }];
    const connection = providerTransaction(state, { operation: 'connection', data: { providerId: provider.id, name: channelName, protocol, baseUrl: apiUrl, timeoutSeconds: 60 } });
    const endpointId = connection.changes.find(item => item.collection === 'endpoints').record.id;
    const catalogConnections = [...(provider.catalogConnections || []), { id: channelIdentity(provider.id, modelId, endpointId), modelId, endpointId, name: channelName, origin: 'undisclosed', upstreamModelId: modelId, enabled: false, health: null }];
    const fields = { catalogModelIds, catalogPricing, catalogModels, catalogConnections };
    return { type: 'batch', label: '添加供应商目录模型', objectId: provider.id, changes: [update('providers', provider.id, fields), ...connection.changes] };
  }
  if (operation === 'catalogueImport') {
    if (!provider || provider.id !== objectId) throw new Error('供应商不存在');
    if (data.mode !== 'batch') throw new Error('请选择批量添加；单个模型请填写添加模型表单');
    const catalogModelIds = appendProviderCatalogue(providerCatalogueIds(provider), data.text);
    const added = catalogModelIds.filter(id => !providerCatalogueIds(provider).includes(id));
    let current = provider;
    for (const code of added) {
      const matches = modelLibrary(state).filter(row => row.id === code || row.modelId.toLowerCase() === code.toLowerCase());
      if (matches.length !== 1) throw new Error(code + ' 未匹配唯一模型资料，请先在模型资料库维护');
      current = { ...current, ...supplierModelFields(state, current, matches[0].id).fields };
    }
    return { type: 'batch', label: '登记供应模型', objectId: provider.id, changes: [update('providers', provider.id, { catalogModelIds: current.catalogModelIds, catalogModels: current.catalogModels, removedCatalogModelIds: current.removedCatalogModelIds })] };
  }
  if (['cataloguePrice', 'catalogueDiscount', 'catalogueCost'].includes(operation)) {
    if (!provider || provider.id !== objectId) throw new Error('供应商不存在');
    if (!providerCatalogueIds(provider).includes(data.modelId)) throw new Error('该 Model ID 不在供应商目录中，请重新载入目录');
    const current = provider.catalogPricing?.find(item => item.modelId === data.modelId) || providerCataloguePrice(provider, data.modelId);
    let entry;
    if (operation === 'catalogueDiscount') entry = { ...current, discountFactor: normalizeCatalogueDiscount(data.discountFactor) };
    else if (operation === 'catalogueCost') {
      if (!current.scenarios.length) throw new Error('请先维护供应商目录价和计费项');
      if (!Array.isArray(data.scenarios) || data.scenarios.length !== current.scenarios.length || data.scenarios.some(item => !item)) throw new Error('计费项已变化，请重新载入后修改平台成本');
      const costs = new Map(data.scenarios.map(item => [billingItemKey(item), item.purchasePrice]));
      if (costs.size !== current.scenarios.length || current.scenarios.some(item => !costs.has(billingItemKey(item)))) throw new Error('计费项已变化，请重新载入后修改平台成本');
      const draft = cataloguePriceDraft(current);
      entry = normalizeProviderPrice(provider, { ...draft, modelId: data.modelId, scenarios: draft.scenarios.map(item => ({ ...item, purchasePrice: costs.get(billingItemKey(item)) })) });
    } else entry = { ...normalizeProviderPrice(provider, { ...data, discountFactor: '' }), discountFactor: current.discountFactor ?? 1000000 };
    const catalogPricing = [...(provider.catalogPricing || []).filter(item => item.modelId !== entry.modelId), entry];
    return { type: 'batch', label: operation === 'catalogueDiscount' ? '修改采购折扣系数' : operation === 'catalogueCost' ? '修改平台成本' : '保存供应商售价', objectId: provider.id, changes: [update('providers', provider.id, { catalogPricing })] };
  }
  if (operation === 'addApiKeys') {
    if (!provider || provider.id !== objectId) throw new Error('供应商不存在');
    if (!Array.isArray(data.apiKeys) || !data.apiKeys.length || data.apiKeys.length > PROVIDER_API_KEY_LIMIT || data.apiKeys.some(item => !item || !/^[\x21-\x7e]{4}•{8}[\x21-\x7e]{4}$/.test(item.maskedKey || '') || !/^[a-f0-9]{64}$/.test(item.fingerprint || ''))) throw new Error('API 密钥配置无效，请重新输入。');
    const keys = provider.apiKeys || [];
    const groupId = data.groupId || 'default', groups = providerKeyGroups(provider, providerApiKeyRows(state, provider).map(row => row.apiKey));
    const group = groups.find(row => row.id === groupId);
    if (!group) throw new Error('API 密钥组不存在，请重新选择');
    if (keys.length + data.apiKeys.length > PROVIDER_API_KEY_LIMIT) throw new Error('每个供应商最多配置 20 个 API 密钥');
    const existing = providerApiKeyRows(state, provider).map(row => row.apiKey.fingerprint);
    const fingerprints = new Set([...existing, ...data.apiKeys.map(item => item.fingerprint)]);
    if (fingerprints.size !== existing.length + data.apiKeys.length) throw new Error('此供应商已配置相同的 API 密钥，或本次输入有重复项。');
    const createdAt = new Date().toISOString();
    const names = new Set(providerApiKeyRows(state, provider).map(row => providerApiKeyName(row.apiKey)));
    const ids = new Set(providerApiKeyRows(state, provider).map(row => providerApiKeyId(row.apiKey)));
    const added = data.apiKeys.map(item => {
      let index = 1;
      while (names.has(`API 密钥 ${index}`)) index++;
      const name = `API 密钥 ${index}`; names.add(name);
      let id;
      do { id = crypto.randomUUID().slice(0, 8); } while (ids.has(id));
      ids.add(id);
      return { id, name, maskedKey: item.maskedKey, fingerprint: item.fingerprint, createdAt };
    });
    changes.push(update('providers', provider.id, { apiKeys: [...keys, ...added], ...(data.groupId || provider.apiKeyGroups ? { apiKeyGroups: groups.map(row => row.id === groupId ? { ...row, keyIds: [...row.keyIds, ...added.map(key => key.id)] } : row) } : {}), ...(groupId === 'default' && !group.keyIds.length && !provider.defaultApiKeyId ? { defaultApiKeyId: added[0].id } : {}) }));
    if (!group.keyIds.length) changes.push(...invalidateSupplierChannels(state, provider, state.endpoints.filter(row => !row.deletedAt && row.providerId === provider.id && (row.authMode === 'group' && row.keyGroupId === groupId || groupId === 'default' && row.authMode === 'inherit')).map(row => row.id)));
    return { type: 'batch', label: '添加 API 密钥', objectId: provider.id, changes };
  }
  if (operation === 'editApiKey' || operation === 'deleteApiKey') {
    if (!provider || provider.id !== objectId) throw new Error('供应商不存在');
    const row = providerApiKeyRows(state, provider).find(item => item.apiKey.id === data.keyId);
    if (!row || !data.expectedFingerprint || row.apiKey.fingerprint !== data.expectedFingerprint) throw new Error('API 密钥已变化或不存在，请重新打开后操作');
    const replacement = operation === 'editApiKey' ? checkedConnectionKeys([data.apiKey])[0] : null;
    const changed = !replacement || replacement.fingerprint !== row.apiKey.fingerprint;
    if ((operation === 'deleteApiKey' || changed && row.endpoints.length) && data.confirmed !== true) throw new Error('请确认密钥变更及关联模型需要重新验证');
    if (replacement && providerApiKeyRows(state, provider).some(item => item.apiKey.fingerprint !== row.apiKey.fingerprint && item.apiKey.fingerprint === replacement.fingerprint)) throw new Error('此供应商已配置相同的 API 密钥');
    const replace = keys => (keys || []).filter(key => replacement || key.fingerprint !== row.apiKey.fingerprint).map(key => key.fingerprint === row.apiKey.fingerprint ? { ...key, name: providerApiKeyName(row.apiKey), maskedKey: replacement.maskedKey, fingerprint: replacement.fingerprint } : key);
    if (provider.apiKeys?.some(key => key.fingerprint === row.apiKey.fingerprint)) changes.push(update('providers', provider.id, { apiKeys: replace(provider.apiKeys) }));
    if (!replacement) {
      const removedIds = new Set([...(provider.apiKeys || []), ...state.endpoints.filter(endpoint => endpoint.providerId === provider.id).flatMap(endpoint => endpoint.apiKeys || [])].filter(key => key.fingerprint === row.apiKey.fingerprint).map(key => key.id));
      const apiKeyGroups = providerKeyGroups(provider, providerApiKeyRows(state, provider).map(item => item.apiKey)).map(group => ({ ...group, keyIds: group.keyIds.filter(id => !removedIds.has(id)) }));
      const defaultApiKeyId = apiKeyGroups.find(group => group.id === 'default').keyIds[0] || '';
      const fallback = providerApiKeyRows(state, provider).find(item => item.apiKey.id === defaultApiKeyId)?.apiKey;
      const remaining = replace(provider.apiKeys);
      changes.push(update('providers', provider.id, { apiKeyGroups, ...(removedIds.has(provider.defaultApiKeyId) ? { defaultApiKeyId, ...(fallback && !remaining.some(key => key.id === fallback.id) ? { apiKeys: [...remaining, fallback] } : {}) } : {}) }));
    }
    for (const endpoint of row.endpoints) {
      const transaction = providerTransaction(state, { operation: 'connectionKeys', objectId: provider.id, data: { endpointId: endpoint.id, apiKeys: replace(endpoint.apiKeys), confirmed: true } });
      changes.push(...transaction.changes);
    }
    if (changed) changes.push(...invalidateSupplierChannels(state, provider, row.endpoints.filter(endpoint => endpoint.authMode).map(endpoint => endpoint.id)));
    return { type: 'batch', label: operation === 'editApiKey' ? '编辑 API 密钥' : '删除 API 密钥', objectId: row.apiKey.id, changes };
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
    if ([...description].length > 2000 && description !== provider?.description?.trim()) throw new Error('备注最多 2000 字');
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
        if (!connectionCredentialsReady(endpoint, owner)) throw new Error('请先在 API 密钥页签配置此接入地址的凭证');
        const scenarios = { 成功: ['通过', '服务地址、凭证和协议检查通过'], 超时: ['失败', '上游连接超时，请检查服务地址与网络'], 鉴权失败: ['失败', '鉴权失败，请检查凭证引用与权限'], 协议错误: ['失败', '协议不兼容，请核对接入协议'] };
        const result = scenarios[data.scenario];
        if (!result) throw new Error('请选择测试场景');
        changes.push(update('endpoints', endpoint.id, { connectionTest: { result: result[0], message: result[1], simulated: true, testedAt: new Date().toISOString(), fingerprint: connectionFingerprint(endpoint) }, ...(result[0] !== '通过' && ['运行中', '需关注'].includes(endpoint.status) ? { status: '需关注' } : {}) }));
      } else if (operation === 'enableConnection') {
        if (!connectionCredentialsReady(endpoint, owner)) throw new Error('请先在 API 密钥页签配置此接入地址的凭证');
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
