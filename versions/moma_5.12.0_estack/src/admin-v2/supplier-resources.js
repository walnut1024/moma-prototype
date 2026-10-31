import { supplierModelFields } from './supply-models.js';
import { libraryRecord } from './model-library.js';
import { providerCatalogueIds } from './moma-provider.js';
import { catalogueChannels, channelInterfaceIssue, channelFingerprint, channelQualification } from './provider-channels.js';
import { connectionKeys, connectionTestPassed, connectionTestPending, connectionCredentialsReady } from './connection-state.js';
import { providerKeyGroups } from './provider-key-groups.js';

const update = (collection, id, changes) => ({ type: 'update', collection, id, changes });
const knownSupplierKeys = (provider, resources) => {
  const seen = new Set();
  return [...(provider.apiKeys || []), ...resources.flatMap(row => row.apiKeys || [])].filter(key => {
    if (seen.has(key.id)) return false;
    seen.add(key.id); return true;
  });
};
export function supplierChannelResources(state, provider) {
  return state.endpoints.filter(row => row.providerId === provider.id && !row.deletedAt);
}
export const supplierChannelAssociations = (state, provider, endpointId) => providerCatalogueIds(provider).flatMap(id => catalogueChannels(state, provider, id)).filter(row => row.endpointId && (!endpointId || row.endpointId === endpointId));
export const supplierChannelCode = endpoint => endpoint.channelCode || endpoint.id;
export const supplierChannelName = (provider, endpoint) => endpoint.supplierChannel ? endpoint.name : provider.catalogConnections?.find(row => row.endpointId === endpoint.id && !row.deletedAt)?.name || endpoint.name;
export const supplierKeyChannels = (state, provider, keyId) => supplierChannelResources(state, provider).filter(endpoint => connectionKeys(endpoint, provider, true).some(key => key.id === keyId));
export function supplierCredentialIssues(state, provider, modelIds = providerCatalogueIds(provider)) {
  const associations = supplierChannelAssociations(state, provider).filter(row => modelIds.includes(row.modelId));
  return supplierChannelResources(state, provider).flatMap(channel => {
    const models = [...new Set(associations.filter(row => row.endpointId === channel.id).map(row => row.modelId))];
    return models.length && !connectionCredentialsReady(channel, provider) ? [{channel, modelIds: models}] : [];
  });
}
export function supplierChannelReadiness(endpoint, provider) {
  if (provider.status !== '已启用') return {ready: false, label: '供应商已停用'};
  if (!connectionCredentialsReady(endpoint, provider)) return {ready: false, label: '凭证待配置'};
  if (!connectionTestPassed(endpoint)) return {ready: false, label: '待连接测试'};
  if (!['运行中', '需关注'].includes(endpoint.status)) return {ready: false, label: '待启用渠道'};
  return {ready: true, label: '渠道可用'};
}
const required = (value, label, max = 200) => { if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /[\r\n]/.test(value)) throw new Error(`请填写有效的${label}，最多 ${max} 字`); return value.trim(); };
export const SUPPLIER_MODEL_BATCH_LIMIT = 50;
function stageResourceChanges(state, changes) {
  let next = state;
  for (const change of changes) next = { ...next, [change.collection]: change.type === 'add' ? [...next[change.collection], change.record] : next[change.collection].map(row => row.id === change.id ? { ...row, ...change.changes } : row) };
  return next;
}
function modelBatch(state, models) {
  if (!Array.isArray(models) || !models.length || models.length > SUPPLIER_MODEL_BATCH_LIMIT) throw new Error(`每批请选择 1–${SUPPLIER_MODEL_BATCH_LIMIT} 个模型`);
  const masters = new Set(), upstreamIds = new Set();
  return models.map((row, index) => {
    const master = row && libraryRecord(state, row.libraryId);
    if (!master) throw new Error(`第 ${index + 1} 行模型资料不存在，请重新选择`);
    const upstreamModelId = required(row.upstreamModelId, '上游 Model ID');
    if (/\s|\p{Cc}/u.test(upstreamModelId)) throw new Error(`第 ${index + 1} 行上游 Model ID 不能包含空白或控制字符`);
    if (masters.has(master.id)) throw new Error(`第 ${index + 1} 行重复选择模型资料`);
    if (upstreamIds.has(upstreamModelId)) throw new Error(`第 ${index + 1} 行上游 Model ID 重复`);
    masters.add(master.id); upstreamIds.add(upstreamModelId);
    return { ...row, libraryId: master.id, upstreamModelId, scenarios: row.scenarios === undefined ? [] : row.scenarios };
  });
}

export function invalidateSupplierChannels(state, provider, ids) {
  const affected = new Set(ids), stamp = crypto.randomUUID();
  return [
    ...state.endpoints.filter(row => affected.has(row.id)).map(row => update('endpoints', row.id, { credentialVersion: stamp, connectionTest: null, status: '停用' })),
    update('providers', provider.id, { catalogConnections: (provider.catalogConnections || []).map(row => affected.has(row.endpointId) ? { ...row, enabled: false, health: null, protocolTests: {} } : row) }),
    ...state.modelSupplies.filter(row => affected.has(row.endpointId) && row.status !== '已移除').map(row => update('modelSupplies', row.id, { status: '已停用', validationStatus: '待验证', verifiedAt: null, validationCases: [] })),
  ];
}

export function supplierResourceTransaction(state, { operation, objectId, data = {} }, connect, normalizePrice) {
  const provider = state.providers.find(row => row.id === objectId);
  if (!provider) throw new Error('供应商不存在');
  const resources = supplierChannelResources(state, provider), endpoint = resources.find(row => row.id === data.endpointId);
  const finish = (label, changes) => ({ type: 'batch', label, objectId, changes });
  if (['keyGroupSave', 'keyGroupDelete', 'keyGroupPrimary'].includes(operation)) {
    const keys = knownSupplierKeys(provider, resources);
    const groups = providerKeyGroups(provider, keys), group = groups.find(row => row.id === data.groupId);
    if (data.groupId && !group) throw new Error('API 密钥组不存在，请重新选择');
    if (operation === 'keyGroupSave') {
      if (group?.id === 'default') throw new Error('默认 API 密钥组不可重命名');
      const name = required(data.name, 'API 密钥组名称', 60);
      if (/\p{Cc}/u.test(name) || groups.some(row => row.id !== group?.id && row.name === name)) throw new Error('API 密钥组名称无效或已存在');
      const apiKeyGroups = group ? groups.map(row => row.id === group.id ? { ...row, name } : row) : [...groups, { id: `key-group-${crypto.randomUUID()}`, name, keyIds: [] }];
      return finish(group ? '重命名 API 密钥组' : '创建 API 密钥组', [update('providers', objectId, { apiKeyGroups })]);
    }
    if (!group) throw new Error('请选择 API 密钥组');
    const affected = resources.filter(row => row.authMode === 'group' && row.keyGroupId === group.id || group.id === 'default' && row.authMode === 'inherit').map(row => row.id);
    if (operation === 'keyGroupDelete') {
      if (group.id === 'default') throw new Error('默认 API 密钥组不可删除');
      if (group.keyIds.length) throw new Error('请先移除组内所有 API 密钥，再删除密钥组');
      if (resources.some(row => row.keyGroupId === group.id)) throw new Error('API 密钥组仍被渠道引用，请先变更渠道的密钥组');
      if (!data.confirmed) throw new Error('请确认删除 API 密钥组');
      return finish('删除 API 密钥组', [update('providers', objectId, { apiKeyGroups: groups.filter(row => row.id !== group.id) })]);
    }
    const key = keys.find(row => row.id === data.keyId && group.keyIds.includes(row.id));
    if (!key || key.status === 'disabled') throw new Error('请选择组内可用的 API 密钥作为主要密钥');
    const changed = group.keyIds[0] !== key.id || group.id === 'default' && provider.defaultApiKeyId !== key.id;
    if (changed && affected.length && !data.confirmed) throw new Error('请确认主要密钥变更影响的渠道及模型');
    return finish('设置主要 API 密钥', [update('providers', objectId, { apiKeyGroups: groups.map(row => row.id === group.id ? { ...row, keyIds: [key.id, ...row.keyIds.filter(id => id !== key.id)] } : row), ...(!provider.apiKeys?.some(row => row.id === key.id) ? { apiKeys: [...(provider.apiKeys || []), key] } : {}), ...(group.id === 'default' ? { defaultApiKeyId: key.id } : {}) }), ...(changed ? invalidateSupplierChannels(state, provider, affected) : [])]);
  }
  if (operation === 'supplierModelLink') {
    if (!providerCatalogueIds(provider).includes(data.modelId)) throw new Error('供应模型不存在');
    const master = libraryRecord(state, data.libraryId);
    if (!master) throw new Error('请选择有效的模型资料');
    const current = provider.catalogModels?.find(row => row.modelId === data.modelId);
    if (current?.type && current.type !== master.type) throw new Error('模型类型不同，请选择同一款模型的资料');
    if (!data.confirmed) throw new Error('请确认当前供应模型及其全部渠道关联的模型资料');
    return finish('关联模型资料', [update('providers', objectId, { catalogModels: [...(provider.catalogModels || []).filter(row => row.modelId !== data.modelId), { ...current, modelId: data.modelId, name: current?.name || master.name, type: master.type, libraryId: master.id }] })]);
  }
  if (operation === 'supplierChannelCreate') {
    if (data.endpointId || data.channelId || data.associationId) throw new Error('新增渠道不能选择已有渠道或关联');
    const models = modelBatch(state, data.models);
    const created = supplierResourceTransaction(state, { operation: 'supplierChannelSave', objectId, data: { ...data, mode: 'all', protocol: data.protocol || 'OpenAI', authMode: data.authMode || 'group' } }, connect, normalizePrice);
    const record = created.changes.find(row => row.type === 'add' && row.collection === 'endpoints')?.record;
    const associated = supplierResourceTransaction(stageResourceChanges(state, created.changes), { operation: 'supplierModelsAdd', objectId, data: { endpointId: record.id, models } }, connect, normalizePrice);
    return finish('创建模型渠道', [...created.changes, ...associated.changes]);
  }
  if (operation === 'supplierModelsAdd') {
    if (!endpoint) throw new Error('渠道不属于当前供应商或已删除');
    const models = modelBatch(state, data.models), changes = [];
    let working = state;
    for (const row of models) {
      const owner = working.providers.find(item => item.id === objectId), linked = supplierModelFields(working, owner, row.libraryId);
      const registered = update('providers', objectId, linked.fields);
      working = stageResourceChanges(working, [registered]); changes.push(registered);
      const issue = channelInterfaceIssue(working.providers.find(item => item.id === objectId), { modelId: linked.modelId, endpoint });
      if (issue) throw new Error(issue);
      const associated = supplierResourceTransaction(working, { operation: 'supplierAssociationSave', objectId, data: { ...row, modelId: linked.modelId, endpointId: endpoint.id } }, connect, normalizePrice);
      working = stageResourceChanges(working, associated.changes); changes.push(...associated.changes);
    }
    return finish('添加渠道关联模型', changes);
  }
  if (operation === 'supplierModelsTest' || operation === 'supplierModelsEnable') {
    if (!endpoint) throw new Error('渠道不属于当前供应商或已删除');
    if (!Array.isArray(data.associationIds) || !data.associationIds.length || data.associationIds.length > SUPPLIER_MODEL_BATCH_LIMIT || new Set(data.associationIds).size !== data.associationIds.length) throw new Error(`请选择 1–${SUPPLIER_MODEL_BATCH_LIMIT} 条不重复的模型关联`);
    const associations = supplierChannelAssociations(state, provider, endpoint.id);
    const selected = data.associationIds.map(id => {
      const row = associations.find(item => item.id === id);
      if (!row) throw new Error('模型关联不属于当前渠道或已变化');
      return row;
    });
    const changes = [];
    let working = state;
    for (const association of selected) {
      let transaction;
      try {
        transaction = supplierResourceTransaction(working, { operation: operation === 'supplierModelsTest' ? 'supplierModelTest' : 'supplierModelEnable', objectId, data: { endpointId: endpoint.id, associationId: association.id, modelId: association.modelId, modelScenario: data.scenarios?.[association.id] || 'success' } }, connect, normalizePrice);
      } catch (error) {
        if (operation === 'supplierModelsEnable') throw error;
        const owner = working.providers.find(item => item.id === objectId), current = catalogueChannels(working, owner, association.modelId).find(item => item.id === association.id);
        const health = { result: '失败', message: error.message, simulated: true, testedAt: new Date().toISOString(), fingerprint: channelFingerprint(current) };
        const qualification = channelQualification(current);
        const record = { ...current, ...(qualification ? { qualification: structuredClone(qualification) } : {}), health }; delete record.endpoint; delete record.managed;
        transaction = { changes: [update('providers', objectId, { catalogConnections: [...(owner.catalogConnections || []).filter(item => item.id !== association.id && !(item.modelId === association.modelId && item.endpointId === endpoint.id)), record] })] };
      }
      working = stageResourceChanges(working, transaction.changes); changes.push(...transaction.changes);
    }
    if (operation === 'supplierModelsEnable' && !['运行中', '需关注'].includes(endpoint.status)) {
      const owner = working.providers.find(item => item.id === objectId), selectedIds = new Set(data.associationIds);
      changes.push(update('providers', objectId, { catalogConnections: owner.catalogConnections.map(row => row.endpointId === endpoint.id && !selectedIds.has(row.id) ? { ...row, enabled: false } : row) }));
    }
    return finish(operation === 'supplierModelsTest' ? '批量测试模型渠道' : '批量启用模型渠道', changes);
  }
  if (operation === 'supplierModelAdd') {
    const linked = supplierModelFields(state, provider, data.libraryId);
    if (providerCatalogueIds(provider).includes(linked.modelId)) throw new Error('当前供应商已添加该模型');
    return finish('登记供应模型', [update('providers', objectId, linked.fields)]);
  }
  if (['defaultApiKey', 'toggleApiKey'].includes(operation)) {
    const key = knownSupplierKeys(provider, resources).find(row => row.id === data.keyId);
    if (!key || key.fingerprint !== data.expectedFingerprint) throw new Error('API 密钥已变化，请重新选择');
    const ids = operation === 'defaultApiKey' ? resources.filter(row => row.authMode === 'inherit' || row.authMode === 'group' && row.keyGroupId === 'default').map(row => row.id) : supplierKeyChannels(state, provider, key.id).map(row => row.id);
    if (ids.length && !data.confirmed) throw new Error('请确认密钥变更影响的渠道及模型');
    if (operation === 'defaultApiKey' && key.status === 'disabled') throw new Error('停用的密钥不能设为默认');
    const keys = provider.apiKeys?.some(row => row.id === key.id) ? provider.apiKeys : [...(provider.apiKeys || []), key];
    return finish(operation === 'defaultApiKey' ? '设置默认 API 密钥' : '变更 API 密钥状态', [update('providers', objectId, operation === 'defaultApiKey' ? { apiKeys: keys, defaultApiKeyId: key.id, ...(provider.apiKeyGroups ? { apiKeyGroups: providerKeyGroups(provider, keys).map(row => row.id === 'default' ? { ...row, keyIds: [key.id, ...row.keyIds.filter(id => id !== key.id)] } : { ...row, keyIds: row.keyIds.filter(id => id !== key.id) }) } : {}) } : { apiKeys: keys.map(row => row.id === key.id ? { ...row, status: data.enabled ? 'enabled' : 'disabled' } : row) }), ...invalidateSupplierChannels(state, provider, ids)]);
  }
  if (operation === 'supplierChannelSave') {
    if (data.endpointId && !endpoint) throw new Error('渠道不属于当前供应商或已删除');
    const mode = data.mode || 'all';
    if (!['all', 'info', 'address', 'credentials'].includes(mode)) throw new Error('请选择有效的渠道配置项');
    if (mode !== 'all' && !endpoint) throw new Error('请选择当前供应商的渠道');
    if (mode === 'address') {
      const transaction = connect(state, { operation: 'connection', objectId: endpoint.id, data: { ...endpoint, ...data, providerId: objectId, timeoutSeconds: endpoint.timeoutSeconds || 60 } });
      const fields = transaction.changes.find(row => row.collection === 'endpoints').changes;
      const url = new URL(fields.baseUrl);
      if (fields.addressMode !== 'base' && (url.pathname === '/' || /^\/v\d+\/?$/.test(url.pathname))) throw new Error('API URL 需要包含完整接口路径');
      const changed = endpoint.baseUrl !== fields.baseUrl || endpoint.protocol !== fields.protocol || JSON.stringify([endpoint.interfaceType, endpoint.addressMode, endpoint.taskUrls]) !== JSON.stringify([fields.interfaceType, fields.addressMode, fields.taskUrls]);
      const references = supplierChannelAssociations(state, provider, endpoint.id);
      for (const association of references) {
        const issue = channelInterfaceIssue(provider, { ...association, endpoint: { ...association.endpoint, ...fields }, apiAddresses: [{ protocol: fields.protocol, baseUrl: fields.baseUrl }, ...(association.apiAddresses || []).slice(1)] });
        if (issue) throw new Error(issue);
      }
      if (changed && references.length && !data.confirmed) throw new Error('请确认共享渠道变更影响的所有模型');
      const changes = [update('endpoints', endpoint.id, { protocol: fields.protocol, baseUrl: fields.baseUrl, ...(fields.interfaceType ? { interfaceType: fields.interfaceType, addressMode: fields.addressMode, taskUrls: fields.taskUrls, allowHttp: fields.allowHttp } : {}) })];
      if (changed) {
        const catalogConnections = (provider.catalogConnections || []).map(row => {
          if (row.endpointId !== endpoint.id || row.deletedAt || !row.apiAddresses?.length) return row;
          if (row.apiAddresses.slice(1).some(address => address.protocol === fields.protocol)) throw new Error('同一渠道每种协议只能配置一个地址');
          return { ...row, apiAddresses: [{ protocol: fields.protocol, baseUrl: fields.baseUrl }, ...row.apiAddresses.slice(1)] };
        });
        changes.push(...invalidateSupplierChannels(state, { ...provider, catalogConnections }, [endpoint.id]));
      }
      return finish('保存渠道 API 地址', changes);
    }
    const name = mode === 'credentials' ? endpoint.name : required(data.name, '渠道名称', 60);
    if (mode !== 'credentials' && resources.some(row => row.id !== endpoint?.id && supplierChannelName(provider, row) === name)) throw new Error('供应商的渠道名称不可重复');
    if (mode === 'info') return finish('保存渠道信息', [update('endpoints', endpoint.id, { name }), update('providers', objectId, { catalogConnections: (provider.catalogConnections || []).map(row => row.endpointId === endpoint.id && !row.deletedAt ? { ...row, name } : row) })]);
    if (!['inherit', 'specific', 'none', 'group'].includes(data.authMode)) throw new Error('请选择 API 凭证方式');
    if (data.authMode === 'none' && provider.sourceType !== 'selfHosted') throw new Error('仅自有推理服务可选择无需认证');
    const knownKeys = knownSupplierKeys(provider, resources);
    const groups = data.authMode === 'group' ? providerKeyGroups(provider, knownKeys) : null;
    const selectedGroup = groups?.find(row => row.id === data.keyGroupId);
    if (data.authMode === 'group' && !selectedGroup) throw new Error('请选择当前供应商的 API 密钥组');
    const groupChanges = selectedGroup ? [update('providers', objectId, { apiKeyGroups: groups, apiKeys: [...(provider.apiKeys || []), ...knownKeys.filter(key => selectedGroup.keyIds.includes(key.id) && !provider.apiKeys?.some(row => row.id === key.id))] })] : [];
    const selectedKey = data.authMode === 'specific' ? [...(provider.apiKeys || []), ...state.endpoints.filter(row => row.providerId === objectId && !row.deletedAt).flatMap(row => row.apiKeys || [])].find(key => key.id === data.apiKeyId) : null;
    if (data.authMode === 'specific' && (!selectedKey || selectedKey.status === 'disabled')) throw new Error('请选择当前供应商的可用密钥');
    if (mode === 'credentials') {
      const apiKeyId = data.authMode === 'specific' ? data.apiKeyId : '';
      const changed = endpoint.authMode !== data.authMode || (endpoint.apiKeyId || '') !== apiKeyId || data.authMode === 'group' && endpoint.keyGroupId !== data.keyGroupId || Boolean(endpoint.apiKeys?.length || endpoint.credentialRef);
      if (changed && supplierChannelAssociations(state, provider, endpoint.id).length && !data.confirmed) throw new Error('请确认共享渠道变更影响的所有模型');
      return finish('保存渠道 API 密钥', [update('endpoints', endpoint.id, { authMode: data.authMode, apiKeyId, ...(data.authMode === 'group' ? { keyGroupId: data.keyGroupId } : endpoint.authMode === 'group' ? { keyGroupId: '' } : {}), apiKeys: [], credentialRef: '' }), ...groupChanges, ...(selectedKey && !provider.apiKeys?.some(key => key.id === selectedKey.id) ? [update('providers', objectId, { apiKeys: [...(provider.apiKeys || []), selectedKey] })] : []), ...(changed ? invalidateSupplierChannels(state, provider, [endpoint.id]) : [])]);
    }
    const transaction = connect(state, { operation: 'connection', objectId: endpoint?.id, data: { ...endpoint, ...data, providerId: objectId, name, protocol: data.protocol, baseUrl: data.baseUrl, timeoutSeconds: endpoint?.timeoutSeconds || 60, apiKeys: [], credentialRef: '' } });
    const change = transaction.changes.find(row => row.collection === 'endpoints');
    const normalized = change.type === 'add' ? change.record : { ...endpoint, ...change.changes };
    const url = new URL(normalized.baseUrl);
    if (normalized.addressMode !== 'base' && (url.pathname === '/' || /^\/v\d+\/?$/.test(url.pathname))) throw new Error('API URL 需要包含完整接口路径');
    const authChanged = !endpoint || endpoint.authMode !== data.authMode || endpoint.apiKeyId !== (data.authMode === 'specific' ? data.apiKeyId : '') || data.authMode === 'group' && endpoint.keyGroupId !== data.keyGroupId;
    const changed = !endpoint || endpoint.baseUrl !== normalized.baseUrl || endpoint.protocol !== normalized.protocol || JSON.stringify([endpoint.interfaceType, endpoint.addressMode, endpoint.taskUrls]) !== JSON.stringify([normalized.interfaceType, normalized.addressMode, normalized.taskUrls]) || authChanged;
    const references = endpoint ? supplierChannelAssociations(state, provider, endpoint.id) : [];
    if (changed && references.length && !data.confirmed) throw new Error('请确认共享渠道变更影响的所有模型');
    const channelCode = endpoint?.channelCode || `CH-${String(1 + Math.max(0, ...state.endpoints.map(row => /^CH-\d+$/.test(row.channelCode || '') ? Number(row.channelCode.slice(3)) : 0))).padStart(3, '0')}`;
    const fields = { supplierChannel: true, channelCode, authMode: data.authMode, apiKeyId: data.authMode === 'specific' ? data.apiKeyId : '', ...(data.authMode === 'group' ? { keyGroupId: data.keyGroupId } : endpoint?.authMode === 'group' ? { keyGroupId: '' } : {}), credentialVersion: changed ? crypto.randomUUID() : endpoint?.credentialVersion, ...(changed ? { connectionTest: null, status: '草稿' } : { connectionTest: endpoint.connectionTest, status: endpoint.status }) };
    if (change.type === 'add') Object.assign(change.record, fields); else Object.assign(change.changes, fields);
    const ids = endpoint && changed ? [endpoint.id] : [];
    return finish(endpoint ? '保存供应渠道' : '创建供应渠道', [...transaction.changes.filter(row => changed || row.collection === 'endpoints'), ...groupChanges, ...(selectedKey && !provider.apiKeys?.some(key => key.id === selectedKey.id) ? [update('providers', objectId, { apiKeys: [...(provider.apiKeys || []), selectedKey] })] : []), ...(ids.length ? invalidateSupplierChannels(state, provider, ids) : [])]);
  }
  if (!endpoint) throw new Error('请选择当前供应商的渠道');
  if (operation === 'supplierAssociationRemove') {
    if (!catalogueChannels(state, provider, data.modelId).some(row => row.id === data.associationId && row.endpointId === endpoint.id)) throw new Error('模型与渠道关联不匹配');
    return { ...connect(state, { operation: 'channelDelete', objectId, data: { modelId: data.modelId, channelId: data.associationId, confirmed: data.confirmed } }), label: '解除模型渠道关联' };
  }
  if (operation === 'supplierChannelDelete') {
    if (!data.confirmed) throw new Error('请确认删除渠道');
    if (supplierChannelAssociations(state, provider, endpoint.id).length || state.modelSupplies.some(row => row.endpointId === endpoint.id && row.status !== '已移除')) throw new Error('渠道仍被模型或服务引用，请先解除关联');
    return finish('删除供应渠道', [update('endpoints', endpoint.id, { deletedAt: new Date().toISOString(), status: '停用' })]);
  }
  if (operation === 'supplierModelTest' || operation === 'supplierModelEnable') {
    const association = catalogueChannels(state, provider, data.modelId).find(row => row.id === data.associationId && row.endpointId === endpoint.id);
    if (!association) throw new Error('模型与渠道关联已变化，请重新选择');
    const issue = channelInterfaceIssue(provider, association);
    if (issue) throw new Error(issue);
    if (data.keyGroupId && (endpoint.authMode !== 'group' || endpoint.keyGroupId !== data.keyGroupId)) throw new Error('临时密钥组测试不能修改渠道状态');
    const first = operation === 'supplierModelTest'
      ? connect(state, { operation: 'supplierChannelTest', objectId, data: { endpointId: endpoint.id, scenario: data.scenario || '成功' } })
      : connect(state, { operation: 'supplierChannelEnable', objectId, data: { endpointId: endpoint.id } });
    const change = first.changes.find(row => row.collection === 'endpoints' && row.id === endpoint.id);
    const tested = { ...endpoint, ...change.changes };
    if (operation === 'supplierModelTest' && !connectionTestPassed(tested)) return first;
    // Validate the model before activation; the temporary running status is never persisted by a test.
    const working = { ...state, endpoints: state.endpoints.map(row => row.id === endpoint.id ? { ...tested, status: '运行中' } : row) };
    const second = connect(working, { operation: operation === 'supplierModelTest' ? 'channelTest' : 'channelEnable', objectId, data: { modelId: data.modelId, channelId: association.id, scenario: data.modelScenario || 'success' } });
    return finish(operation === 'supplierModelTest' ? '测试模型渠道' : '启用模型渠道', [...first.changes, ...second.changes]);
  }
  if (operation === 'supplierChannelTest') {
    if (!connectionCredentialsReady(endpoint, provider)) throw new Error('渠道缺少可用 API 凭证，请前往 API 密钥配置');
    return connect(state, { operation: 'testConnection', objectId: endpoint.id, data: { scenario: data.scenario || '成功' } });
  }
  if (operation === 'supplierChannelEnable') {
    if (provider.status !== '已启用') throw new Error('请先启用供应商');
    if (connectionTestPending(endpoint)) throw new Error('当前渠道测试尚未完成，不能使用先前证据启用');
    if (!connectionCredentialsReady(endpoint, provider) || !connectionTestPassed(endpoint)) throw new Error('请先配置凭证并通过渠道测试');
    return finish('启用供应渠道', [update('endpoints', endpoint.id, { status: '运行中', connectionQualification: structuredClone(endpoint.connectionTest) })]);
  }
  if (operation !== 'supplierAssociationSave') throw new Error('未知供应资源操作');
  const modelId = required(data.modelId, '模型 ID');
  if (!providerCatalogueIds(provider).includes(modelId)) throw new Error('模型不属于当前供应商');
  const existing = data.associationId && catalogueChannels(state, provider, modelId).find(row => row.id === data.associationId && row.endpointId === endpoint.id);
  if (data.associationId && !existing) throw new Error('模型与渠道的关联已变化');
  if (!existing && catalogueChannels(state, provider, modelId).some(row => row.endpointId === endpoint.id)) throw new Error('此模型已关联该渠道');
  if (!existing && catalogueChannels(state, provider, modelId).length >= 20) throw new Error('每个模型最多关联 20 个渠道');
  const upstreamModelId = required(data.upstreamModelId, '上游 Model ID');
  if (/\s|\p{Cc}/u.test(upstreamModelId)) throw new Error('上游 Model ID 不能包含空白或控制字符');
  if (supplierChannelAssociations(state, provider, endpoint.id).some(row => row.id !== existing?.id && row.upstreamModelId === upstreamModelId)) throw new Error('同一渠道的上游 Model ID 不可重复');
  if (existing && existing.upstreamModelId !== upstreamModelId && state.modelSupplies.some(row => row.endpointId === endpoint.id && (row.catalogueModelId || row.upstreamModelId) === modelId && row.status !== '已移除')) throw new Error('此关联仍被服务引用，请先解除服务映射再修改上游 Model ID');
  if (existing?.upstreamModelId === upstreamModelId) return { ...connect(state, { operation: 'channelPrice', objectId, data: { modelId, channelId: existing.id, scenarios: data.scenarios } }), label: '保存模型渠道关联' };
  if (!Array.isArray(data.scenarios)) throw new Error('请填写有效的采购计费项');
  const pricing = normalizePrice(provider, { modelId, discountFactor: '1', scenarios: data.scenarios.map(row => ({ ...row, purchasePrice: undefined })) });
  if (pricing.scenarios.some(row => row.listPrice == null)) throw new Error('请填写完整供应商售价，免费请填 0');
  const record = { ...(existing ? provider.catalogConnections?.find(row => row.modelId === modelId && row.endpointId === endpoint.id) : {}), id: existing?.id || `association-${crypto.randomUUID()}`, modelId, endpointId: endpoint.id, name: supplierChannelName(provider, endpoint), origin: existing?.origin || 'undisclosed', upstreamModelId, pricing, updatedAt: new Date().toISOString() };
  if (!existing || existing.upstreamModelId !== upstreamModelId) { record.enabled = false; record.health = null; record.protocolTests = {}; }
  return finish('保存模型渠道关联', [update('providers', objectId, { catalogConnections: [...(provider.catalogConnections || []).filter(row => row.id !== record.id), record] })]);
}
