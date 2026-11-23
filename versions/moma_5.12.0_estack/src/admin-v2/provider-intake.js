import { providerTransaction, providerCode } from './provider-management.js';
import { providerJsonRows, planProviderJsonModel, providerJsonConnection } from './provider-json-import.js';
import { activeChannelProcurement } from './channel-change-management.js';
import { cataloguePurchasePrice, catalogueAmountInput } from './provider-catalogue-pricing.js';
import { modelLibrary } from './model-library.js';
import { supplierChannelResources } from './supplier-resources.js';
import { normalizeChannelCapacity } from './channel-capacity.js';
import { providerKeyGroups } from './provider-key-groups.js';

const profileKeys = ['name', 'code', 'source_type', 'logo', 'introduction', 'website', 'documentation', 'contact', 'contact_info', 'description'];
const allowed = [...profileKeys, 'connections', 'models', 'catalogue_source', 'catalogue_checked_at'];
export const PROVIDER_JSON_TEMPLATE = { provider: { name: '示例推理服务商', code: 'example-provider', source_type: 'thirdParty',
  connections: [{ connection_id: 'openai', base_url: 'https://api.example.com/v1', protocol: 'OpenAI', interface_type: 'openai' }],
  models: [{ canonical_slug: 'example-model', model_name: '示例模型', model_type: 'text', model_info: {},
    mappings: [{ connection_id: 'openai', upstream_model_id: 'example-model', channel_name: '标准连接', capacity_limits: { rpm: 300, tpm: 10000000 } }] }] } };

function inputProvider(file) {
  if (!file || typeof file !== 'object' || Array.isArray(file) || Object.keys(file).some(key => key !== 'provider')) throw Error('请使用服务商完整 JSON，顶层字段为 provider');
  const input = file.provider;
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('provider 必须为服务商对象');
  if (Object.hasOwn(input, 'id')) throw Error('录入文件不填写本地Provider ID，请使用服务商编码');
  const unknown = Object.keys(input).find(key => !allowed.includes(key));
  if (unknown) throw Error('provider.' + unknown + ' 为未知字段，请使用服务商 JSON 模板');
  if (!Array.isArray(input.models ?? []) || (input.models?.length || 0) > 500) throw Error('provider.models 最多包含 500 个模型');
  if (!Array.isArray(input.connections ?? []) || (input.connections?.length || 0) > 500) throw Error('provider.connections 最多包含 500 个连接');
  return input;
}

export function planProviderIntake(state, file) {
  const input = inputProvider(file), values = Object.fromEntries(profileKeys.filter(key => input[key] != null).map(key => [key === 'source_type' ? 'sourceType' : key === 'contact_info' ? 'contactInfo' : key, input[key]]));
  const code = typeof values.code === 'string' ? values.code.trim().toLowerCase() : '';
  const archived = state.providers.find(row => row.deletedAt && providerCode(row) === code);
  const initial = providerTransaction({ ...state, providers: state.providers.filter(row => !row.deletedAt) }, { operation: 'create', data: values });
  let provider = initial.changes.find(change => change.collection === 'providers').record;
  if (archived) provider = { ...archived, ...provider, id: archived.id, createdAt: archived.createdAt, deletedAt: null,
    catalogModelIds: [], catalogueScope: 'managed', removedCatalogModelIds: archived.removedCatalogModelIds || [],
    catalogModels: [], archivedCatalogModels: [...(archived.archivedCatalogModels || []), ...(archived.catalogModels || [])],
    catalogConnections: (archived.catalogConnections || []).map(row => ({ ...row, deletedAt: row.deletedAt || archived.deletedAt, enabled: false })),
    apiKeys: (archived.apiKeys || []).map(row => ({ ...row, status: 'disabled' })), defaultApiKeyId: '' };
  else provider = { ...provider, catalogueScope: 'managed', catalogModelIds: [], catalogModels: [], catalogConnections: [], apiKeys: [] };
  const working = { ...state, providers: archived ? state.providers.map(row => row.id === archived.id ? provider : row) : [...state.providers, provider],
    endpoints: [...state.endpoints], modelTemplates: [...state.modelTemplates] };
  const changes = new Map();
  const stage = next => {
    for (const change of next) {
      const key = change.collection + ':' + (change.id || change.record.id), prior = changes.get(key);
      if (change.type === 'add') working[change.collection] = [...working[change.collection], change.record];
      else working[change.collection] = working[change.collection].map(row => row.id === change.id ? { ...row, ...change.changes } : row);
      if (prior?.type === 'add') changes.set(key, { ...prior, record: { ...prior.record, ...change.changes } });
      else if (prior) changes.set(key, { ...change, changes: { ...prior.changes, ...change.changes } });
      else changes.set(key, change);
    }
  };
  changes.set('providers:' + provider.id, archived ? { type: 'update', collection: 'providers', id: provider.id, changes: provider } : { type: 'add', collection: 'providers', record: provider });
  const connections = input.connections || [], ids = new Set(), errors = [], warnings = [];
  for (const [index, connection] of connections.entries()) {
    try {
      const normalized = providerJsonConnection(provider, connection);
      if (ids.has(normalized.id)) throw Error('连接标识重复');
      ids.add(normalized.id);
      if (!supplierChannelResources(working, provider).some(row => row.baseUrl === normalized.config.baseUrl && row.interfaceType === normalized.config.interfaceType && row.keyGroupId === normalized.keyGroupId && JSON.stringify(row.taskUrls || {}) === JSON.stringify(normalized.config.taskUrls || {}))) {
        const next = providerTransaction(working, { operation: 'supplierChannelSave', objectId: provider.id, data: { ...normalized.config, name: normalized.id, authMode: 'group', keyGroupId: normalized.keyGroupId } });
        stage(next.changes.filter(change => change.collection === 'endpoints'));
      }
    } catch (error) { errors.push({ path: 'provider.connections[' + index + ']', message: error.message }); }
  }
  const models = input.models || [];
  if (models.reduce((sum, row) => sum + (Array.isArray(row?.mappings) ? row.mappings.length : 0), 0) > 1000) throw Error('每份文件最多录入 1000 条上游模型');
  if (models.length && !errors.length) {
    const rows = providerJsonRows({ provider: { ...input, id: provider.id, code: provider.code } }, provider);
    const seen = new Set();
    for (const [index, row] of rows.entries()) {
      try {
        if (row.status === 'error') throw Error(row.message);
        if (seen.has(row.payload.model.canonical_slug)) throw Error('模型编码重复');
        seen.add(row.payload.model.canonical_slug);
        const plan = planProviderJsonModel(working, provider.id, row.payload);
        stage(plan.changes);
      } catch (error) { errors.push({ path: 'provider.models[' + index + ']', message: error.message }); }
    }
  }
  provider = working.providers.find(row => row.id === provider.id);
  const channels = (provider.catalogConnections || []).filter(row => !row.deletedAt);
  if (channels.some(row => !Object.keys(row.capacityLimits || {}).length)) warnings.push('部分上游模型未配置容量限额，将保留为未配置');
  if (channels.some(row => !row.pricing?.scenarios?.length && !row.procurementVersions?.length)) warnings.push('部分上游模型未配置采购成本，将保留为未配置；官方报价不会自动作为采购成本');
  if (channels.length) warnings.push('上游模型录入后保持待验证，不自动启用、上架或恢复已停用服务');
  return { provider, changes: [...changes.values()], errors, warnings, models: models.map(row => ({ code: row.canonical_slug, name: row.model_name, type: row.model_type, channels: row.mappings?.length || 0 })),
    connections: supplierChannelResources(working, provider), channels, modelCount: models.length };
}

export function providerIntakeTransaction(state, { data = {} }) {
  const plan = planProviderIntake(state, data.document);
  if (data.confirmed !== true) throw Error('请确认服务商录入预览');
  if (plan.errors.length) throw Error(plan.errors.slice(0, 10).map(row => row.path + '：' + row.message).join('；'));
  const changes = [...plan.changes];
  if (data.apiKeys != null || data.key_group_name != null) {
    if (!Array.isArray(data.apiKeys) || data.apiKeys.some(row => !row || Object.keys(row).some(key => !['maskedKey', 'fingerprint'].includes(key)))) throw Error('API 密钥只接受脱敏元数据');
    const working = { ...state, providers: [...state.providers], endpoints: [...state.endpoints] };
    const apply = rows => { for (const change of rows.filter(row => ['providers', 'endpoints'].includes(row.collection))) {
      if (change.type === 'add') working[change.collection].push(change.record);
      else working[change.collection] = working[change.collection].map(row => row.id === change.id ? { ...row, ...change.changes } : row);
    } };
    apply(changes);
    let groupId = 'default';
    if (data.key_group_name != null) {
      const created = providerTransaction(working, { operation: 'keyGroupSave', objectId: plan.provider.id, data: { name: data.key_group_name } });
      changes.push(...created.changes); apply(created.changes);
      groupId = providerKeyGroups(working.providers.find(row => row.id === plan.provider.id)).find(row => row.name === data.key_group_name.trim()).id;
    }
    if (data.apiKeys.length) {
      const added = providerTransaction(working, { operation: 'addApiKeys', objectId: plan.provider.id,
        data: { apiKeys: data.apiKeys, ...(data.key_group_name == null ? { standalone: true } : { groupId }) } });
      changes.push(...added.changes);
      if (data.key_group_name == null) {
        const first = added.changes.find(change => change.collection === 'providers').changes.apiKeys.find(key => key.fingerprint === data.apiKeys[0].fingerprint);
        for (const change of changes) {
          if (change.type === 'add' && change.collection === 'endpoints' && change.record.keyGroupId === 'default') {
            Object.assign(change.record, { authMode: 'specific', apiKeyId: first.id, keyGroupId: '' });
          }
        }
      }
    }
  }
  return { type: 'batch', objectId: plan.provider.id, label: '录入服务商', changes };
}

export function exportProviderJson(state, provider) {
  const endpoints = supplierChannelResources(state, provider), masters = new Map(modelLibrary(state).map(row => [row.id, row]));
  const connections = endpoints.map((endpoint, index) => ({ connection_id: 'connection-' + (index + 1), base_url: endpoint.baseUrl, protocol: endpoint.protocol,
    interface_type: endpoint.interfaceType || 'openai', ...(Object.keys(endpoint.taskUrls || {}).length ? { task_urls: endpoint.taskUrls } : {}) }));
  const connectionIds = new Map(endpoints.map((row, index) => [row.id, connections[index].connection_id]));
  const models = (provider.catalogModels || []).filter(entry => !entry.deletedAt && (provider.catalogModelIds || []).includes(entry.modelId)).flatMap(entry => {
    const master = masters.get(entry.libraryId);
    if (!master) return [];
    const info = master.profile || {}, capabilities = master.capabilities || {}, types = { 文本: 'text', 图片: 'image', 视频: 'video', 音频: 'audio' };
    const mappings = (provider.catalogConnections || []).filter(row => !row.deletedAt && row.modelId === entry.modelId && connectionIds.has(row.endpointId)).map(row => {
      const active = activeChannelProcurement(row), quote = active === undefined ? row.pricing : active?.pricing;
      const scenarios = quote?.scenarios?.filter(item => item.listPrice != null || item.purchasePrice != null).map(item => ({ name: item.name, condition: item.condition || '', listPrice: catalogueAmountInput(cataloguePurchasePrice(item.listPrice, quote.discountFactor, item.purchasePrice)), unit: item.unit, currency: item.currency }));
      return { connection_id: connectionIds.get(row.endpointId), upstream_model_id: row.upstreamModelId, channel_name: row.sourceName || row.name || '',
        ...(Object.keys(row.capacityLimits || {}).length ? { capacity_limits: normalizeChannelCapacity(row.capacityLimits) } : {}),
        ...(scenarios?.length ? { procurement: { scenarios } } : {}) };
    });
    return [{ canonical_slug: master.modelId, model_name: master.name, model_type: master.type,
      model_info: { ...(info.author || master.maker ? { author: info.author || master.maker } : {}),
        ...(info.inputModalities?.every(value => types[value]) && info.outputModalities?.every(value => types[value]) ? { architecture: { input_modalities: info.inputModalities.map(value => types[value]), output_modalities: info.outputModalities.map(value => types[value]) } } : {}),
        ...(typeof capabilities.streaming === 'boolean' ? { streaming: capabilities.streaming } : {}), ...(typeof capabilities.tools === 'boolean' ? { tools: capabilities.tools } : {}),
        ...(capabilities.context > 0 ? { context_length_tokens: capabilities.context } : {}), ...(capabilities.output > 0 ? { max_output_tokens: capabilities.output } : {}) }, mappings }];
  });
  const profile = Object.fromEntries(profileKeys.flatMap(key => { const field = key === 'source_type' ? 'sourceType' : key === 'contact_info' ? 'contactInfo' : key; return provider[field] != null ? [[key, provider[field]]] : []; }));
  return { provider: { ...profile, code: providerCode(provider), connections, models } };
}
