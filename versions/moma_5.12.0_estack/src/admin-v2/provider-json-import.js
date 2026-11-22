import { normalizeChannelCapacity } from './channel-capacity.js';
import { channelChangeTransaction } from './channel-change-management.js';
import { resourceId } from '../resource-id.mjs';
import { prepareChannelInterface } from './channel-interface.js';
import { MODEL_CATALOGUE_TYPES, modelCatalogue, modelLibrary } from './model-library.js';
import { MODEL_IMPORT_HEADERS, MODEL_IMPORT_LIMIT } from './model-import.js';
import { modelTransaction, MODEL_TYPES } from './model-management.js';
import { MOMA_BUILTIN_MODELS } from './official-channel-presets.js';
import { isBuiltinMoma } from './moma-provider.js';
import { providerKeyGroups } from './provider-key-groups.js';
import { providerCode, providerTransaction } from './provider-management.js';
import { catalogueChannels, channelInterfaceIssue } from './provider-channels.js';
import { supplierChannelResources } from './supplier-resources.js';
import { supplierModelFields } from './supply-models.js';

const modalities = { text: '文本', image: '图片', video: '视频', audio: '音频' };
const maxMappings = 20;
const syntax = {
  file: ['provider'],
  provider: ['id', 'name', 'code', 'preset_code', 'source_type', 'catalogue_source', 'catalogue_checked_at', 'connections', 'models', 'logo', 'introduction', 'website', 'documentation', 'contact', 'contact_info', 'description'],
  connection: ['connection_id', 'base_url', 'protocol', 'interface_type', 'key_group_id', 'task_urls'],
  model: ['canonical_slug', 'model_name', 'model_type', 'model_info', 'mappings', 'upstream_reference'],
  info: ['author', 'listed_at', 'architecture', 'streaming', 'tools', 'context_length_tokens', 'max_output_tokens', 'documentation', 'source_checked_at', 'visual_type'],
  architecture: ['input_modalities', 'output_modalities'],
  mapping: ['connection_id', 'upstream_model_id', 'channel_name', 'capacity_limits', 'procurement'],
  reference: ['url', 'upstream_model_id'],
};

function object(value, kind, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !syntax[kind].includes(key))) {
    throw Error(`${label}格式不正确或含未知字段，请使用服务商 JSON 格式`);
  }
  return value;
}

function string(value, label, limit, pattern) {
  if (typeof value !== 'string' || !value.trim() || value.length > limit || /\p{Cc}/u.test(value) || pattern && !pattern.test(value)) {
    throw Error(`请填写有效的${label}，最多 ${limit} 字符`);
  }
  return value.trim();
}

function url(value, protocols, label, allowQuery = false) {
  const text = string(value, label, 2048);
  let parsed;
  try { parsed = new URL(text); } catch { throw Error(`${label}无效`); }
  const credentialQuery = [...parsed.searchParams.keys()].some(key => /^(?:api[-_]?key|access[-_]?token|token|secret|password|authorization|credential|signature)$/i.test(key));
  if (!protocols.includes(parsed.protocol) || parsed.username || parsed.password || credentialQuery || !allowQuery && /[?#]/.test(text)) throw Error(`${label}不支持该协议或包含凭据、查询参数或片段`);
  return text;
}

function date(value, label) {
  if (value == null) return undefined;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw Error(`${label}须为有效的 YYYY-MM-DD 日期`);
  return value;
}

export function providerJsonConnection(provider, input) {
  const row = object(input, 'connection', '连接');
  const id = string(row.connection_id, '连接标识', 100, /^[\w.:-]+$/);
  const config = prepareChannelInterface({ interfaceType: row.interface_type, baseUrl: row.base_url, taskUrls: row.task_urls || {}, allowHttp: provider.sourceType === 'selfHosted' });
  if (row.protocol !== config.protocol) throw Error('连接协议与接口类型不一致');
  const keyGroupId = row.key_group_id ?? 'default';
  if (!providerKeyGroups(provider).some(group => group.id === keyGroupId)) throw Error('API 密钥组不属于当前服务商');
  return { id, config, keyGroupId };
}

export function providerJsonRows(file, provider) {
  const { provider: input } = object(file, 'file', '导入文件');
  const catalogue = object(input, 'provider', '服务商资料');
  if (!provider || provider.deletedAt || catalogue.id !== provider.id || catalogue.code !== providerCode(provider)) throw Error('文件中的Provider ID 或编码与当前服务商不一致');
  if (!Array.isArray(catalogue.models) || !catalogue.models.length || catalogue.models.length > MODEL_IMPORT_LIMIT) throw Error(`每份 JSON 需包含 1–${MODEL_IMPORT_LIMIT} 个模型`);
  const listed = catalogue.connections ?? [];
  if (!Array.isArray(listed) || listed.length > MODEL_IMPORT_LIMIT) throw Error(`服务商连接须为数组，最多 ${MODEL_IMPORT_LIMIT} 条`);
  const connections = new Map();
  for (const row of listed) {
    const { id } = providerJsonConnection(provider, row);
    if (connections.has(id)) throw Error('文件内连接标识重复');
    connections.set(id, row);
  }
  return catalogue.models.map((model, index) => {
    const type = typeof model?.model_type === 'string' ? model.model_type : '';
    const summary = { '模型编码': model?.canonical_slug, '模型资料名称': model?.model_name, '模型类型': MODEL_CATALOGUE_TYPES[type] || MODEL_TYPES[type] };
    const cells = MODEL_IMPORT_HEADERS.map(label => typeof summary[label] === 'string' ? summary[label] : '');
    try {
      object(model, 'model', '模型');
      const mappings = model.mappings ?? [];
      if (!Array.isArray(mappings) || mappings.length > maxMappings) throw Error(`模型映射须为数组，每个模型最多 ${maxMappings} 条`);
      const refs = new Set(mappings.map(row => object(row, 'mapping', '模型映射').connection_id));
      if ([...refs].some(id => !connections.has(id))) throw Error('模型映射引用了文件中不存在的连接');
      return { rowNumber: index + 1, cells, payload: { model, connections: [...refs].map(id => connections.get(id)) } };
    } catch (error) { return { rowNumber: index + 1, cells, status: 'error', message: error.message }; }
  });
}

function modelData(provider, model, existing) {
  const info = object(model.model_info ?? {}, 'info', '模型资料');
  const architecture = object(info.architecture ?? {}, 'architecture', '输入输出模态');
  const list = key => {
    const values = architecture[key];
    if (values == null) return undefined;
    if (!Array.isArray(values) || values.some(value => typeof value !== 'string' || !Object.hasOwn(modalities, value))) throw Error('输入输出模态须为 text、image、video 或 audio 数组');
    return values.map(value => modalities[value]);
  };
  const inputModalities = list('input_modalities'), outputModalities = list('output_modalities');
  const name = string(model.model_name, '模型展示名', 100);
  const builtin = isBuiltinMoma(provider) && MOMA_BUILTIN_MODELS.find(row => row.modelId === model.canonical_slug);
  let type = model.model_type;
  if (type === 'visual') {
    const visualOutputs = (architecture.output_modalities || []).filter(value => ['image', 'video'].includes(value));
    type = info.visual_type ?? (visualOutputs.length === 1 ? visualOutputs[0] : undefined) ?? (['image', 'video'].includes(existing?.type) ? existing.type : builtin?.visualType);
    if (!['image', 'video'].includes(type)) throw Error('视觉模型需填写 model_info.visual_type（image 或 video）');
  } else if (info.visual_type != null) throw Error('仅视觉模型填写 visual_type');
  if (!Object.hasOwn(MODEL_TYPES, type)) throw Error('请选择有效的模型类型');
  if (existing && existing.type !== type) throw Error('模型类型与已有主档不一致，请核对模型编码');
  const capabilities = { context: info.context_length_tokens, output: info.max_output_tokens, streaming: info.streaming, tools: info.tools };
  if (['context', 'output'].some(key => capabilities[key] != null && (!Number.isSafeInteger(capabilities[key]) || capabilities[key] < 1)) || ['streaming', 'tools'].some(key => capabilities[key] != null && typeof capabilities[key] !== 'boolean')) throw Error('模型 Token 上限须为正整数，流式和工具调用须为布尔值');
  if (capabilities.context && capabilities.output > capabilities.context) throw Error('最大输出不能超过上下文上限');
  const profile = { author: info.author == null ? undefined : string(info.author, '模型作者', 100), inputModalities, outputModalities,
    documentation: info.documentation == null ? undefined : url(info.documentation, ['https:', 'http:'], '资料链接', true), sourceUpdated: date(info.source_checked_at, '核对日期') };
  return { material: { modelId: model.canonical_slug, name, type, profile, capabilities }, listedAt: date(info.listed_at, '服务商上线日期') };
}

function upstreamReference(input) {
  if (input == null) return undefined;
  const row = object(input, 'reference', '上游参考');
  return { ...(row.url == null ? {} : { url: url(row.url, ['https:', 'http:', 'wss:'], '参考地址') }),
    ...(row.upstream_model_id == null ? {} : { upstreamModelId: upstreamId(row.upstream_model_id) }) };
}

const upstreamId = value => string(value, '上游模型调用标识', 200, /^\S+$/u);

export function planProviderJsonModel(state, providerId, { model, connections }) {
  const provider = state.providers.find(row => row.id === providerId && !row.deletedAt);
  if (!provider) throw Error('当前服务商已移除');
  object(model, 'model', '模型');
  const code = string(model.canonical_slug, '模型编码', 80, /^[a-z0-9][a-z0-9._:/-]*$/);
  const matches = modelLibrary(state).filter(row => row.modelId.toLowerCase() === code);
  if (matches.length > 1) throw Error('模型编码匹配到多份主档');
  const existing = matches[0] && modelCatalogue(state).find(row => row.id === matches[0].id);
  if (matches[0] && !existing) throw Error('模型编码已被归档资料使用，请核对');
  const { material, listedAt } = modelData(provider, model, existing);
  const reference = upstreamReference(model.upstream_reference);
  const mappings = model.mappings ?? [];
  if (!Array.isArray(mappings) || mappings.length > maxMappings || !Array.isArray(connections) || connections.length > maxMappings) throw Error(`每个模型最多 ${maxMappings} 条连接映射`);
  const byId = new Map(connections.map(value => { const row = providerJsonConnection(provider, value); return [row.id, row]; }));
  if (byId.size !== connections.length) throw Error('连接标识重复');
  const working = { ...state }, changes = [];
  const stage = next => {
    for (const change of next) {
      const { collection } = change;
      working[collection] = change.type === 'add' ? [...working[collection], change.record]
        : working[collection].map(row => row.id === change.id ? { ...row, ...change.changes } : row);
      changes.push(change);
    }
  };
  const { modelId, name, maker, type, description, profile, capabilities } = modelTransaction({ ...state, models: [] }, { operation: 'create', catalogue: true, data: material }).changes[0].record;
  const master = existing || { id: resourceId('model'), modelId, name, maker, type, description, profile, capabilities, revision: 1 };
  if (!existing) stage([{ type: 'add', collection: 'modelTemplates', record: master }]);
  const owner = () => working.providers.find(row => row.id === providerId);
  const linked = supplierModelFields(working, owner(), master.id);
  const declaration = provider.catalogModels?.find(row => row.modelId === linked.modelId);
  const register = declaration?.libraryId !== master.id || !(provider.catalogModelIds || []).includes(linked.modelId) || provider.removedCatalogModelIds?.includes(linked.modelId);
  if (register || listedAt && !declaration?.listedAt || reference && Object.keys(reference).some(key => !declaration?.upstreamReference?.[key])) {
    const entry = linked.fields.catalogModels.find(row => row.modelId === linked.modelId);
    if (listedAt && !entry.listedAt) entry.listedAt = listedAt;
    if (reference) entry.upstreamReference = { ...reference, ...entry.upstreamReference };
    stage([{ type: 'update', collection: 'providers', id: providerId, changes: linked.fields }]);
  }
  const seen = new Set(), mappingPreview = [];
  for (const input of mappings) {
    const mapping = object(input, 'mapping', '模型映射');
    const config = byId.get(mapping.connection_id);
    if (!config) throw Error('模型映射引用了不存在的连接');
    const upstreamModelId = upstreamId(mapping.upstream_model_id);
    const key = JSON.stringify([config.config.interfaceType, config.config.baseUrl, config.keyGroupId, upstreamModelId]);
    if (seen.has(key)) throw Error('模型内渠道映射重复');
    seen.add(key);
    const sameConnection = row => row.interfaceType === config.config.interfaceType && row.protocol === config.config.protocol && row.baseUrl === config.config.baseUrl
      && row.authMode === 'group' && row.keyGroupId === config.keyGroupId && JSON.stringify(row.taskUrls || {}) === JSON.stringify(config.config.taskUrls || {}) && !Object.keys(row.adapterOptions || {}).length;
    const endpoints = supplierChannelResources(working, owner());
    const matching = endpoints.filter(sameConnection);
    const saved = catalogueChannels(working, owner(), linked.modelId).find(row => matching.some(item => item.id === row.endpointId) && row.upstreamModelId === upstreamModelId);
    if (saved) { mappingPreview.push({ baseUrl: config.config.baseUrl, upstreamModelId, existing: true }); continue; }
    if (matching.length > 1) throw Error('找到多条相同连接，请先核对渠道');
    let endpoint = matching[0];
    if (!endpoint) {
      const baseName = `导入 ${config.id.slice(0, 48)}`;
      let name = baseName, serial = 1;
      while (endpoints.some(row => row.name === name)) name = `${baseName} ${++serial}`;
      const created = providerTransaction(working, { operation: 'supplierChannelSave', objectId: providerId, data: { ...config.config, name, authMode: 'group', keyGroupId: config.keyGroupId } });
      endpoint = created.changes.find(change => change.collection === 'endpoints').record;
      // The validated group already belongs to this provider; importing a connection only references it.
      stage(created.changes.filter(change => change.collection === 'endpoints'));
    }
    const issue = channelInterfaceIssue(owner(), { type, modelId: linked.modelId, endpoint });
    if (issue) throw Error(issue);
    const associated = providerTransaction(working, { operation: 'supplierAssociationSave', objectId: providerId, data: {
      modelId: linked.modelId, endpointId: endpoint.id, upstreamModelId, scenarios: [], sourceName: mapping.channel_name ? string(mapping.channel_name, '渠道名称', 60) : config.id.slice(0, 48),
    } });
    stage(associated.changes);
    const associationId = associated.changes.find(change => change.collection === 'providers').changes.catalogConnections.find(row => row.endpointId === endpoint.id && row.modelId === linked.modelId && row.upstreamModelId === upstreamModelId && !row.deletedAt)?.id;
    if (mapping.capacity_limits != null) {
      const limits = normalizeChannelCapacity(mapping.capacity_limits);
      const entries = owner().catalogConnections.map(row => row.id === associationId ? { ...row, capacityLimits: limits, capacityRevision: 1 } : row);
      stage([{ type: 'update', collection: 'providers', id: providerId, changes: { catalogConnections: entries } }]);
    }
    if (mapping.procurement != null) {
      const input = mapping.procurement;
      if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['scenarios', 'effective_at', 'expires_at'].includes(key))) throw Error('procurement 格式无效');
      const transaction = channelChangeTransaction(working, { operation: 'channelProcurementPublish', data: { providerId, endpointId: endpoint.id, associationId, expectedPriceRevision: 0, scenarios: input.scenarios, effectiveAt: input.effective_at, expiresAt: input.expires_at, confirmed: true } });
      const quote = transaction.changes.find(change => change.collection === 'providers')?.changes.catalogConnections.find(row => row.id === associationId)?.procurementVersions?.at(-1)?.pricing;
      for (const item of quote?.scenarios || []) {
        if (!working.tariffDictionary.some(row => row.kind === 'scenario' && row.name === item.name) || !working.tariffDictionary.some(row => row.kind === 'unit' && row.name === item.unit) || !working.tariffDictionary.some(row => row.kind === 'currency' && row.code === item.currency)) throw Error('采购成本引用了未维护的计费项、单位或币种：' + item.name);
      }
      stage(transaction.changes);
    }
    mappingPreview.push({ baseUrl: config.config.baseUrl, upstreamModelId, existing: false });
  }
  return { state: working, changes, existing: Boolean(existing), register: Boolean(register), mappingPreview, reference };
}

export function previewProviderJsonRows(state, providerId, rows) {
  const seen = new Set();
  let working = state;
  return rows.map(row => {
    if (!row.payload) return row;
    try {
      const code = row.payload.model.canonical_slug;
      if (seen.has(code)) throw Error('文件内模型编码重复');
      const plan = planProviderJsonModel(working, providerId, row.payload);
      seen.add(code);
      working = plan.state;
      const count = plan.mappingPreview.filter(item => !item.existing).length;
      const message = [plan.existing ? plan.register ? '复用主档并登记' : '已登记，保留已有主档' : '新建主档并登记', count ? `新增 ${count} 条待验证渠道映射` : '', plan.reference ? '保留上游参考' : ''].filter(Boolean).join(' · ');
      return { ...row, status: plan.changes.length ? 'ready' : 'skip', message: plan.changes.length ? message : '模型与渠道已导入', mappingPreview: plan.mappingPreview, reference: plan.reference };
    } catch (error) { return { ...row, status: 'error', message: error.message }; }
  });
}
