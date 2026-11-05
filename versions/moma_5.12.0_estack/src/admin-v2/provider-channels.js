import { catalogueConnections } from './provider-model-connections.js';
import { providerCatalogueIds } from './moma-provider.js';
import { providerCataloguePrice } from './moma-catalogue-prices.js';
import { cataloguePriceDraft, billingItemKey } from './provider-catalogue-pricing.js';
import { connectionFingerprint, connectionTestPassed, connectionCredentialsReady, connectionKeys, connectionQualified } from './connection-state.js';
import { supplyModelUrl } from './model-management.js';
import { modelTaskUrl } from './channel-interface.js';
import { activeChannelProcurement } from './channel-change-management.js';
import { supplyModelRecord, supplierModelIds } from './supply-models.js';
import { libraryRecord } from './model-library.js';

export const CHANNEL_ORIGINS = { undisclosed: '未披露', direct: '自营', resale: '转售' };
const channelProbe = channel => [channel.task, channel.health?.task, channel.qualification?.task].find(task => ['speech', 'transcription'].includes(task));
export function channelModelUrl(endpoint, type, options = {}) {
  if (!endpoint.interfaceType) return endpoint.baseUrl;
  try { return modelTaskUrl(endpoint, type, options); }
  catch { return ''; }
}
export const channelIdentity = (providerId, modelId, endpointId) => JSON.stringify([providerId, modelId, endpointId]);
export function catalogueChannels(state, provider, modelId) {
  const saved = (provider.catalogConnections || []).filter(item => item.modelId === modelId && !item.deletedAt);
  const endpoints = catalogueConnections(state, provider, modelId);
  const rows = endpoints.flatMap((endpoint, index) => {
    const entries = saved.filter(item => item.endpointId === endpoint.id);
    return (entries.length ? entries : [{ modelId, endpointId: endpoint.id }]).map(item => {
      const version = activeChannelProcurement(item);
      return {
      ...item, id: item.id || channelIdentity(provider.id, modelId, endpoint.id),
      name: endpoint.supplierChannel ? endpoint.name : item.name || (endpoints.length > 1 ? `默认渠道 ${index + 1}` : '默认渠道'), origin: item.origin || 'undisclosed', upstreamProvider: item.upstreamProvider || '',
      ...(endpoint.supplierChannel ? { apiAddresses: [{ protocol: endpoint.protocol, baseUrl: channelModelUrl(endpoint, item.type || provider.catalogModels?.find(row => row.modelId === modelId)?.type, { probe: channelProbe(item) }) }] } : {}),
      upstreamModelId: item.upstreamModelId ?? state.modelSupplies.find(supply => supply.endpointId === endpoint.id && (supply.catalogueModelId || supply.upstreamModelId) === modelId)?.upstreamModelId ?? modelId, endpoint,
      managed: Object.hasOwn(item, 'enabled'),
      enabled: item.enabled ?? ['运行中', '需关注'].includes(endpoint.status),
      pricing: version === undefined ? item.pricing || providerCataloguePrice(provider, modelId) : version?.pricing || { modelId, discountFactor: 1000000, scenarios: [] },
    }; });
  });
  return [...rows, ...saved.filter(item => !item.endpointId).map(item => ({ ...item, managed: true, endpoint: { id: null, protocol: 'OpenAI', baseUrl: '', apiKeys: [] }, enabled: false, pricing: item.pricing || providerCataloguePrice(provider, modelId) }))];
}
export function channelUrl(provider, channel) {
  if (channel.managed) return channelModelUrl(channel.endpoint, channel.type || provider.catalogModels?.find(row => row.modelId === channel.modelId)?.type, { probe: channelProbe(channel) });
  return supplyModelUrl({ provider, endpoint: channel.endpoint, catalogueModelId: channel.modelId }, provider.catalogModels?.find(item => item.modelId === channel.modelId)) || channel.endpoint.baseUrl;
}
export const channelAddresses = (provider, channel) => channel.apiAddresses?.length ? channel.apiAddresses : channel.endpoint.baseUrl ? [{ protocol: channel.endpoint.protocol, baseUrl: channelUrl(provider, channel) }] : [];
export const modelApiExample = type => `https://api.example.com${({ text: '/v1/chat/completions', multimodal: '/v1/chat/completions', embedding: '/v1/embeddings', rerank: '/v1/rerank' })[type] || '/完整接口路径'}`;
export function modelApiIssue(type, baseUrl) {
  if (!type) return '';
  const known = [['/chat/completions', ['text', 'multimodal'], 'Chat Completions'], ['/embeddings', ['embedding'], 'Embeddings'], ['/rerank', ['rerank'], 'Rerank'], ['/images/generations', ['image'], 'Images'], ['/audio/speech', ['audio'], 'Speech'], ['/audio/transcriptions', ['audio'], 'Transcriptions']];
  const match = known.find(([suffix]) => baseUrl?.replace(/\/$/, '').endsWith(suffix));
  return match && !match[1].includes(type) ? `当前模型类型不适用 ${match[2]} 接口，请修改 API 地址。` : '';
}
export function channelInterfaceIssue(provider, channel) {
  const type = channel.type || provider.catalogModels?.find(row => row.modelId === channel.modelId)?.type;
  if (!channel.endpoint?.supplierChannel) return '';
  if (channel.endpoint.interfaceType) {
    const probe = channel.probe || channelProbe(channel);
    if (channel.endpoint.interfaceType === 'openai' && type === 'audio' && !probe) return '';
    try { return modelApiIssue(type, modelTaskUrl(channel.endpoint, type, { probe })); }
    catch (error) { return error.message; }
  }
  return channelAddresses(provider, channel).map(address => modelApiIssue(type, address.baseUrl)).find(Boolean) || '';
}
export function channelLinkedModels(state, provider, channel) {
  if (!channel?.endpointId || !state.endpoints.some(item => item.id === channel.endpointId && item.providerId === provider.id)) return [];
  const ids = new Set(state.modelSupplies.filter(item => item.status !== '已移除' && (!item.providerId || item.providerId === provider.id) && item.endpointId === channel.endpointId && (item.catalogueModelId || item.upstreamModelId) === channel.modelId && item.upstreamModelId === channel.upstreamModelId).map(item => item.modelId));
  return state.models.filter(item => ids.has(item.id));
}
export const channelFingerprint = channel => JSON.stringify([channel.modelId, channel.upstreamModelId, connectionFingerprint(channel.endpoint), ...(channel.apiAddresses?.length > 1 ? [channel.apiAddresses] : [])]);
export const channelCheckCurrent = channel => channel.health ? channel.health.fingerprint === channelFingerprint(channel) : !channel.managed && connectionTestPassed(channel.endpoint);
export const channelTestPending = channel => channel.endpoint.serverTestJobs?.some(job => !job.receivedAt && job.signature === connectionFingerprint(channel.endpoint) && job.associationIds?.includes(channel.id));
export function channelQualification(channel) {
  if (channel.qualification?.result === '通过' && channel.qualification.fingerprint === channelFingerprint(channel)) return channel.qualification;
  return channel.enabled && channel.health?.result === '通过' && channel.health.fingerprint === channelFingerprint(channel) ? channel.health : null;
}
export function channelBlockReason(provider, channel, { runtime = false } = {}) {
  if (provider.status !== '已启用') return '供应商已停用';
  if (channel.endpoint?.frozen) return '渠道已冻结';
  if (channelInterfaceIssue(provider, channel)) return channelInterfaceIssue(provider, channel);
  if (!channel.enabled) return '渠道已停用';
  if (!connectionCredentialsReady(channel.endpoint, provider)) return 'API 凭证待配置';
  if (!runtime && channelTestPending(channel)) return '当前模型测试尚未完成';
  if (channel.endpoint.supplierChannel && !(runtime ? connectionQualified(channel.endpoint) : connectionTestPassed(channel.endpoint))) return '渠道连接测试待通过';
  if (channel.endpoint.supplierChannel && !['运行中', '需关注'].includes(channel.endpoint.status)) return '渠道待启用';
  const evidence = runtime ? channelQualification(channel) : channel.health;
  if (!(runtime ? channel.managed ? evidence : connectionQualified(channel.endpoint) : channelCheckCurrent(channel))) return '渠道配置已变化，需检测';
  if (evidence && evidence.result !== '通过') return evidence.message || '健康检测未通过';
  return '';
}
export function channelRouteRefs(state, provider, channel) {
  const ids = new Set([channel.id, ...state.modelSupplies.filter(item => item.endpointId === channel.endpointId && (item.catalogueModelId || item.upstreamModelId) === channel.modelId).map(item => item.id)]);
  return (state.serviceRoutes || []).filter(route => route.versions?.find(version => version.version === route.activeVersion)?.config.channels.some(item => item.enabled && ids.has(item.supplyId)));
}
export function supplierDeletionBlock(state, provider, modelId, channel) {
  const modelIds = modelId ? channel ? [modelId] : supplierModelIds(state, provider, modelId) : [];
  const channels = modelIds.flatMap(id => catalogueChannels(state, provider, id));
  if (!channel && channels.some(row => row.endpointId)) return { message: '请先删除该模型的全部渠道，再删除模型。', models: [] };
  const master = modelId && supplyModelRecord(state, provider, modelId);
  const wholeEndpoint = channel && !providerCatalogueIds(provider).some(id => catalogueChannels(state, provider, id).some(row => row.endpointId === channel.endpointId && row.id !== channel.id));
  const records = (provider.catalogConnections || []).filter(row => channel ? row.id === channel.id || row.endpointId === channel.endpointId && (wholeEndpoint || !modelId || row.modelId === modelId) : modelIds.includes(row.modelId));
  const ids = new Set([...(channel ? [channel.id] : channels.map(row => row.id)), ...records.map(row => row.id)].filter(Boolean));
  const endpoints = new Set((channel ? [channel.endpointId] : [...channels.map(row => row.endpointId), ...records.map(row => row.endpointId)]).filter(Boolean));
  const supplies = state.modelSupplies.filter(row => (row.providerId === provider.id || !row.providerId && state.endpoints.some(endpoint => endpoint.id === row.endpointId && endpoint.providerId === provider.id)) &&
    (ids.has(row.channelId) || (!channel || endpoints.has(row.endpointId)) && (wholeEndpoint || !modelId || modelIds.includes(row.catalogueModelId || row.upstreamModelId))));
  supplies.forEach(row => ids.add(row.id));
  const related = state.models.filter(model => master && libraryRecord(state, model.id)?.id === master.id || supplies.some(row => row.modelId === model.id));
  const services = related.filter(model => model.serviceProviders?.some(row => row.providerId === provider.id && row.status !== '已移除'));
  const pendingMappings=state.modelSupplies.filter(row=>row.status!=='已移除' && row.serviceMapping?.pending?.config.providerId===provider.id && (channel ? row.serviceMapping.pending.config.endpointId===channel.endpointId : modelIds.includes(row.serviceMapping.pending.config.catalogueModelId)));
  if(pendingMappings.length)return {message:'该渠道仍被模型服务的待验证映射引用，请先应用或放弃映射变更。',models:state.models.filter(model=>pendingMappings.some(row=>row.modelId===model.id))};
  const linked = supplies.filter(row => row.status !== '已移除');
  const serviceIds = new Set(related.flatMap(model => ['standard:' + model.id, `provider:${model.id}:${provider.id}`]));
  const references = (route, rows) => rows?.some(row => ids.has(row.supplyId) || (wholeEndpoint || serviceIds.has(route.serviceId)) && endpoints.has(row.supplyId));
  const routes = (state.serviceRoutes || []).filter(route => references(route, route.versions?.find(row => row.version === route.activeVersion)?.config?.channels) || references(route, route.draft?.channels));
  if (services.length || linked.length || routes.length) {
    return { message: '该供应商或渠道已在“模型服务”中关联，无法删除。下架或停服不会解除关联，请先移除对应的供应商、渠道映射及路由引用。', models: related.filter(model => services.includes(model) || linked.some(row => row.modelId === model.id) || routes.some(route => ['standard:' + model.id, `provider:${model.id}:${provider.id}`].includes(route.serviceId))) };
  }
  const pending = state.modelOnboardings.some(row => {
    if (row.status === '已放弃' || (row.guided ? row.completion : row.status === '已完成') || (row.providerId || row.value?.providerId) !== provider.id) return false;
    const sameModel = modelIds.includes(row.catalogueModelId) || !row.catalogueModelId && master && (row.libraryId === master.id || row.rows?.some(item => item.libraryId === master.id));
    return channel ? row.createdAssociationIds?.includes(channel.id) || endpoints.has(row.endpointId || row.createdEndpointId) && (wholeEndpoint || !modelId || sameModel) : sameModel;
  });
  const testing = state.endpoints.some(endpoint => endpoints.has(endpoint.id) && endpoint.serverTestJobs?.some(job => !job.receivedAt && (wholeEndpoint || job.associationIds?.some(id => ids.has(id)))));
  return { message: pending ? '该模型或渠道仍有未完成的接入任务，请先完成或放弃任务后再删除。' : testing ? '该渠道仍有检测任务未完成，请先查询或取消检测后再删除。' : '', models: [] };
}
const text = (value, label, maximum, required = true) => {
  if (typeof value !== 'string' || (required && !value.trim()) || value.trim().length > maximum || /[\r\n]/.test(value)) throw new Error(`${label}${required ? '必填，' : ''}最多 ${maximum} 字，不能换行`);
  return value.trim();
};
const requestIdentity = endpoint => JSON.stringify([endpoint.protocol, endpoint.baseUrl.replace(/\/$/, ''), endpoint.credentialRef || '', (endpoint.apiKeys || []).map(key => key.fingerprint).sort()]);
const callIdentity = channel => JSON.stringify([requestIdentity(channel.endpoint), channel.upstreamModelId]);
const sameCall = (left, right) => {
  const hasKey = endpoint => endpoint.credentialRef || endpoint.apiKeys?.length;
  if (!hasKey(left.endpoint) || !hasKey(right.endpoint)) return left.endpoint.protocol === right.endpoint.protocol && left.endpoint.baseUrl.replace(/\/$/, '') === right.endpoint.baseUrl.replace(/\/$/, '') && left.upstreamModelId === right.upstreamModelId;
  return callIdentity(left) === callIdentity(right);
};
const currentHealth = channel => channel.health || (connectionTestPassed(channel.endpoint) ? { ...channel.endpoint.connectionTest, fingerprint: channelFingerprint(channel) } : null);
function channelCosts(provider, modelId, scenarios, normalize, draft = false) {
  if (!Array.isArray(scenarios)) throw new Error('请填写渠道价格');
  // Channel cost is the entered amount; old model-level discount and manual overrides remain separate.
  const quote = normalize(provider, { modelId, discountFactor: '1', scenarios: scenarios.map(row => ({ ...row, purchasePrice: undefined })) });
  if (!draft && quote.scenarios.some(row => row.listPrice == null)) throw new Error('请填写完整的采购价，免费请填 0');
  return quote;
}

export function providerChannelTransaction(state, { operation, objectId, data = {} }, connect, normalizePrice, preview) {
  const provider = state.providers.find(item => item.id === objectId);
  if (!provider || !providerCatalogueIds(provider).includes(data.modelId)) throw new Error('供应商或目录模型不存在');
  const channels = catalogueChannels(state, provider, data.modelId);
  const current = channels.find(item => item.id === data.channelId);
  if (data.channelId && !current) throw new Error('渠道已不存在，请重新载入');
  const changes = [], entries = provider.catalogConnections || [];
  if (operation === 'catalogueRemove' || operation === 'channelDelete') {
    if (!data.confirmed) throw new Error('请确认删除对象及关联影响');
    const targets = operation === 'channelDelete' ? current ? [current] : [] : channels;
    if (operation === 'channelDelete' && !current) throw new Error('请选择供应渠道');
    const block = supplierDeletionBlock(state, provider, data.modelId, operation === 'channelDelete' ? current : null);
    if (block.message) throw new Error(block.message);
    const deletedAt = new Date().toISOString(), ids = new Set(targets.map(item => item.id));
    const catalogConnections = entries.map(item => ids.has(item.id || channelIdentity(provider.id, item.modelId, item.endpointId)) ? { ...item, deletedAt, enabled: false } : item);
    for (const channel of targets) if (!catalogConnections.some(item => (item.id || channelIdentity(provider.id, item.modelId, item.endpointId)) === channel.id)) catalogConnections.push({ id: channel.id, modelId: channel.modelId, endpointId: channel.endpointId, name: channel.name, deletedAt, enabled: false });
    return { type: 'batch', objectId: current?.id || data.modelId, label: operation === 'channelDelete' ? '删除供应渠道' : '删除供应模型', changes: [{ type: 'update', collection: 'providers', id: provider.id, changes: { catalogConnections, ...(operation === 'catalogueRemove' ? { removedCatalogModelIds: [...new Set([...(provider.removedCatalogModelIds || []), ...supplierModelIds(state, provider, data.modelId)])] } : {}) } }] };
  }
  let next, label;
  if (operation === 'channelSave') {
    if (!current && channels.length >= 20) throw new Error('每个模型最多配置 20 个供应渠道');
    const name = text(data.name, '渠道名称', 60);
    if (channels.some(item => item.id !== current?.id && item.name === name)) throw new Error('同一模型的渠道名称不可重复');
    if (!Object.hasOwn(CHANNEL_ORIGINS, data.origin)) throw new Error('请选择有效的来源类型');
    const upstreamProvider = data.origin === 'resale' ? text(data.upstreamProvider || '', '上游服务商', 100, false) : '';
    const upstreamModelId = text(data.upstreamModelId, '上游 Model ID', 200);
    if (/\s/.test(upstreamModelId)) throw new Error('上游 Model ID 不能包含空格');
    const apiKeys = current?.endpoint.apiKeys || [];
    const credentialRef = current?.endpoint.credentialRef || '';
    const fields = { name, protocol: data.protocol, baseUrl: data.baseUrl, providerId: provider.id, apiKeys, credentialRef, capacity: current?.endpoint.capacity, timeoutSeconds: current?.endpoint.timeoutSeconds || 60 };
    const transaction = connect(state, { operation: 'connection', objectId: current?.endpointId, data: fields });
    const endpointChange = transaction.changes.find(item => item.collection === 'endpoints');
    const normalizedEndpoint = current?.endpointId ? { ...current.endpoint, ...endpointChange.changes } : endpointChange.record;
    const addresses = data.apiAddresses || [{ protocol: data.protocol, baseUrl: data.baseUrl }, ...(current?.apiAddresses || []).slice(1)];
    if (!Array.isArray(addresses) || addresses.length < 1 || addresses.length > 5) throw new Error('每个渠道须配置 1–5 个协议地址');
    const apiAddresses = addresses.map(address => {
      if (!address || typeof address.baseUrl !== 'string') throw new Error('请填写协议及 API 地址');
      connect(state, { operation: 'connection', objectId: current?.endpointId, data: { ...fields, protocol: address.protocol, baseUrl: address.baseUrl } });
      return { protocol: address.protocol, baseUrl: new URL(address.baseUrl).toString().replace(/\/$/, '') };
    });
    if (apiAddresses[0].protocol !== normalizedEndpoint.protocol || apiAddresses[0].baseUrl !== normalizedEndpoint.baseUrl) throw new Error('默认协议地址与渠道接入不一致');
    if (new Set(apiAddresses.map(item => item.protocol)).size !== apiAddresses.length) throw new Error('同一渠道每种协议只能配置一个地址');
    const connectionChanged = current && requestIdentity(normalizedEndpoint) !== requestIdentity(current.endpoint);
    const endpoint = current?.endpointId && !connectionChanged ? current.endpoint : normalizedEndpoint;
    const candidate = { endpoint, upstreamModelId };
    if (channels.some(item => item.id !== current?.id && sameCall(item, candidate))) throw new Error('调用配置相同，不能仅凭名称或来源标签拆成两个渠道');
    const shared = current?.endpointId && (state.modelSupplies.some(item => item.endpointId === current.endpointId && item.status !== '已移除') || entries.some(item => item.endpointId === current.endpointId && item.modelId !== data.modelId));
    if (shared && connectionChanged && !data.confirmed) throw new Error('请确认共享接入地址变更会使关联模型需要重新验证');
    const pricing = channelCosts(provider, data.modelId, data.scenarios, normalizePrice, true);
    next = { ...(current?.listPriceVersions ? { listPriceVersions: current.listPriceVersions, listPriceRevision: current.listPriceRevision } : {}), id: current?.id || `channel-${crypto.randomUUID()}`, modelId: data.modelId, endpointId: endpoint.id, apiAddresses, name, origin: data.origin, upstreamProvider, upstreamModelId, pricing, enabled: current?.enabled || false, health: current ? currentHealth(current) : null, source: current?.source, checkedAt: current?.checkedAt, sourceNote: current?.sourceNote, updatedAt: new Date().toISOString() };
    const changed = !current || channelFingerprint({ ...next, endpoint }) !== channelFingerprint(current);
    next.protocolTests = changed ? {} : current?.protocolTests;
    if (changed) { next.enabled = false; next.health = null; }
    if (pricing.scenarios.some(row => row.listPrice == null)) next.enabled = false;
    if (!current?.endpointId || connectionChanged) changes.push(...transaction.changes);
    label = current ? '保存供应渠道' : '添加供应渠道';
  } else {
    if (!current) throw new Error('请选择供应渠道');
    next = { ...current, health: currentHealth(current) }; delete next.endpoint; delete next.managed;
    if (operation === 'channelPrice') {
      const pricing = channelCosts(provider, data.modelId, data.scenarios, normalizePrice);
      next.pricing = pricing; label = '保存渠道价格';
    } else if (operation === 'channelTest') {
      if (!current.endpointId) throw new Error('请先配置渠道 API 地址');
      if (!connectionCredentialsReady(current.endpoint, provider)) throw new Error('请先通过独立的 API 凭证操作配置密钥，再进行检测');
      if (channelInterfaceIssue(provider, current)) throw new Error(channelInterfaceIssue(provider, current));
      if (current.endpoint.supplierChannel && (!connectionTestPassed(current.endpoint) || !['运行中', '需关注'].includes(current.endpoint.status))) throw new Error('请先完成渠道连接测试并启用渠道');
      // The prototype checks configuration and stores a preview; it makes no upstream request.
      connect(state, { operation: 'connection', objectId: current.endpointId, data: { ...current.endpoint, providerId: provider.id, timeoutSeconds: current.endpoint.timeoutSeconds || 60 } });
      const addressIndex = data.addressIndex ?? 0, address = channelAddresses(provider, current)[addressIndex];
      if (!Number.isInteger(addressIndex) || !address) throw new Error('请选择当前渠道的协议地址');
      const result = preview({ modelId: data.modelId, upstreamId: current.upstreamModelId, endpointId: current.endpointId, ...address }, data.scenario);
      const qualification = channelQualification(current);
      if (qualification) next.qualification = structuredClone(qualification);
      const health = { ...result, id: `test-${crypto.randomUUID()}`, source: 'local-preview', task: provider.catalogModels?.find(row => row.modelId === data.modelId)?.type || '基础调用', operator: state.currentRole, credentialIds: connectionKeys(current.endpoint, provider).map(key => key.id), configurationRevision: current.endpoint.configurationRevision || 0, fingerprint: channelFingerprint(current), testedAt: new Date().toISOString() };
      next.testHistory = [...(current.testHistory || []), structuredClone(health)];
      next.protocolTests = { ...current.protocolTests, [address.protocol]: health };
      if (addressIndex === 0) next.health = health;
      label = '检测供应渠道';
    } else if (operation === 'channelEnable') {
      if (channelTestPending(current)) throw new Error('当前模型测试尚未完成，不能使用先前证据启用');
      if (channelInterfaceIssue(provider, current)) throw new Error(channelInterfaceIssue(provider, current));
      if (current.endpoint.supplierChannel && (!connectionTestPassed(current.endpoint) || !['运行中', '需关注'].includes(current.endpoint.status))) throw new Error('请先完成渠道连接测试并启用渠道');
      if (provider.status !== '已启用' || !connectionCredentialsReady(current.endpoint, provider) || !channelCheckCurrent(current) || !current.health || current.health.result !== '通过' || current.health.fingerprint !== channelFingerprint(current)) throw new Error('当前渠道须先完成有效的健康检测');
      next.enabled = true; next.activationChangedAt = new Date().toISOString(); next.qualification = structuredClone(current.health); label = '启用供应渠道';
    } else if (operation === 'channelDisable') {
      if (!data.confirmed) throw new Error('请确认全局停用渠道及服务影响');
      next.enabled = false; next.activationChangedAt = new Date().toISOString(); label = '停用供应渠道';
    } else throw new Error('未知渠道操作');
    next.updatedAt = new Date().toISOString();
  }
  const implicit = channels.filter(item => item.id !== current?.id && !entries.some(row => row.modelId === item.modelId && (row.id === item.id || row.endpointId === item.endpointId))).map(item => ({ id: item.id, modelId: item.modelId, endpointId: item.endpointId, name: item.name }));
  const catalogConnections = [...entries.filter(item => !(current && item.modelId === data.modelId && (item.id === current.id || !item.id && item.endpointId === current.endpointId))), ...implicit];
  catalogConnections.push(next);
  changes.push({ type: 'update', collection: 'providers', id: provider.id, changes: { catalogConnections } });
  return { type: 'batch', objectId: next.id, label, changes };
}

export const channelPriceDraft = channel => cataloguePriceDraft(channel.pricing).scenarios;
export function channelPriceRows(channels, fallback) {
  const groups = new Map();
  for (const quote of channels.length ? channels.map(channel => channel.pricing) : [fallback]) for (const row of quote.scenarios) {
    const key = billingItemKey(row), group = groups.get(key) || { ...row, values: [] };
    if (row.listPrice != null) group.values.push(row.listPrice);
    groups.set(key, group);
  }
  return [...groups.values()].map(row => ({ ...row, minimum: row.values.length ? Math.min(...row.values) : null, maximum: row.values.length ? Math.max(...row.values) : null, incomplete: row.values.length < Math.max(channels.length, 1) }));
}
