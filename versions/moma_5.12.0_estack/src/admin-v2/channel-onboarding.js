import { resolveOnboardingProvider, onboardingModelPreset } from './onboarding-presets.js';
import { libraryRecord, modelLibrary } from './model-library.js';
import { MODEL_TYPES } from './model-management.js';
import { TASK_OPTIONS, INPUT_MODALITY_OPTIONS, OUTPUT_MODALITY_OPTIONS, RESULT_TYPE_OPTIONS, modelProfileDraft } from './model-profile.js';
import { connectionFingerprint, connectionQualification } from './connection-state.js';
import { providerTransaction } from './provider-management.js';
import { catalogueChannels, channelFingerprint, channelQualification } from './provider-channels.js';
import { supplierChannelAssociations } from './supplier-resources.js';
import { channelEvidenceSignature } from './channel-change-management.js';
import { resolveChannelAssociationModel, materializeChannelAssociation } from './channel-association-model.js';
import { channelTestDiagnostics } from './channel-test-diagnostics.js';

const text = (value, label, max, required = true) => {
  if (typeof value !== 'string' || (required && !value.trim()) || value.length > max || /\p{Cc}/u.test(value)) throw new Error(`${label}${required ? '必填，' : ''}最多 ${max} 字，不能含控制字符`);
  return value.trim();
};
const update = (collection, id, changes) => ({ type: 'update', collection, id, changes });
const add = (collection, record) => ({ type: 'add', collection, record });
const requestSignature = request => JSON.stringify([request?.operationId, request?.channelId, request?.confirmExpensive === true, request?.models?.map(model => Object.entries(model).sort(([left], [right]) => left.localeCompare(right)))]);
const testModelFields = ['id', 'associationId', 'upstreamModelId', 'type', 'check', 'probe', 'dimensions', 'voice', 'imageSize', 'statusPath', 'maxOutputTokens'];
function assertNoSecrets(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    if (/^(secret|apiKey|password|token|accessToken|authorization|credentialRef)$/i.test(key)) throw new Error('草稿与发现记录不能保存密钥或认证内容');
    assertNoSecrets(item);
  }
}
export const channelDrafts = state => state.modelOnboardings.filter(row => row.kind === 'supplier-channel' && row.status === '配置中');
export const channelDraftReferences = draft => draft.kind === 'supplier-channel' && draft.status === '配置中' ? draft.rows.map(row => row.libraryId).filter(Boolean) : [];
export function channelDraftIssue(state, draft) {
  let provider;
  try { provider = resolveOnboardingProvider(state, draft.value); } catch (error) { return error.message; }
  if (!provider.isDraft && provider.status !== '已启用') return '供应商已停用，可继续编辑，启用前需恢复供应商';
  try { for (const row of draft.rows) if (row.modelPresetId) onboardingModelPreset(row.modelPresetId); } catch (error) { return error.message; }
  if (draft.endpointId && !state.endpoints.some(row => row.id === draft.endpointId && row.providerId === provider.id && !row.deletedAt)) return '原渠道已不存在或归属已变化';
  if (draft.rows.some(row => row.libraryId && !libraryRecord(state, row.libraryId))) return '部分模型资料已不存在，请重新匹配';
  return '';
}
function draftFields(state, data) {
  assertNoSecrets(data);
  const input = data.value || {};
  const provider = resolveOnboardingProvider(state, input);
  const value = { ...(input.providerPresetId ? { providerId: '', providerPresetId: input.providerPresetId } : { providerId: provider.id }), name: text(input.name, '渠道名称', 60), interfaceType: input.interfaceType || 'unselected', baseUrl: text(input.baseUrl || '', 'API 地址', 2048, false), keyGroupId: text(input.keyGroupId || 'default', '密钥组', 100), authMode: input.authMode === 'none' ? 'none' : 'group', capacity: text(String(input.capacity ?? ''), '账号请求上限', 20, false), timeoutSeconds: text(String(input.timeoutSeconds ?? 60), '请求超时', 20, false) };
  // Drafts retain unfinished text; request validation runs when the connection is committed.
  const draftUrl = input => {
    const raw = text(input || '', 'API 地址', 2048, false);
    if (/[?#]/.test(raw) || /:\/\/[^/]*@/.test(raw)) throw new Error('草稿 API 地址不能包含认证、查询参数或片段');
    return raw;
  };
  value.baseUrl = draftUrl(input.baseUrl);
  value.adapterOptions = {};
  const allowedOptions = ['apiVersion', 'workspaceId', 'tokenLimitField', 'imageSize', 'voice', 'statusPath'];
  if (input.adapterOptions && (typeof input.adapterOptions !== 'object' || Array.isArray(input.adapterOptions))) throw new Error('接口选项草稿格式无效');
  if (Object.keys(input.adapterOptions || {}).some(key => !allowedOptions.includes(key))) throw new Error('接口选项包含未支持字段');
  for (const [key, option] of Object.entries(input.adapterOptions || {})) value.adapterOptions[key] = text(String(option ?? ''), '接口选项', 2048, false);
  value.taskUrls = {};
  for (const [type, url] of Object.entries(input.taskUrls || {})) { if (!Object.hasOwn(MODEL_TYPES, type)) throw new Error('任务地址类型无效'); value.taskUrls[type] = draftUrl(url); }
  if (!Array.isArray(data.rows) || !data.rows.length || data.rows.length > 50) throw new Error('每个接入草稿包含 1–50 个模型行');
  const rows = data.rows.map((row, index) => {
    if (!Array.isArray(row.scenarios || [])) throw new Error('采购价格式无效');
    if (row.libraryId && row.modelPresetId) throw new Error('草稿模型资料与参考预设只能选择一项');
    const scenarios = (row.scenarios || []).map(item => ({ name: text(item.name || '', '计费项', 100, false), listPrice: String(item.listPrice ?? ''), unit: text(item.unit || '', '计价单位', 100, false), currency: text(item.currency || 'CNY', '币种', 10), condition: text(item.condition || '', '条件', 160, false) }));
    return { id: text(row.id || `row-${index + 1}`, '模型行标识', 100), libraryId: row.libraryId || '', ...(row.modelPresetId ? { modelPresetId: text(row.modelPresetId, '模型参考预设', 100) } : {}), upstreamModelId: text(row.upstreamModelId || '', '上游模型 ID', 200, false), selected: row.selected !== false, confirmed: row.confirmed === true, source: ['upstream', 'reference', 'manual'].includes(row.source) ? row.source : 'manual', scenarios };
  });
  const endpoint = data.endpointId && state.endpoints.find(row => row.id === data.endpointId && row.providerId === provider.id && !row.deletedAt);
  if (data.endpointId && !endpoint) throw new Error('草稿渠道不属于当前供应商');
  return { kind: 'supplier-channel', value, rows, endpointId: endpoint?.id || '', endpointFingerprint: endpoint ? connectionFingerprint(endpoint) : '', step: data.step === 1 ? 1 : 0, status: '配置中' };
}
export function previewChannelModels(state, providerId, models, { source = 'upstream', complete = true, endpointId = '' } = {}) {
  const provider = state.providers.find(row => row.id === providerId);
  if (!provider) throw new Error('供应商不存在');
  if (!Array.isArray(models) || models.length > 2000) throw new Error('模型列表格式无效或超过 2000 项');
  const seen = new Set(), library = modelLibrary(state);
  const existing = endpointId ? (provider.catalogConnections || []).filter(row => row.endpointId === endpointId && !row.deletedAt) : [];
  return { source, complete, rows: models.flatMap(input => {
    const id = text(typeof input === 'string' ? input : input.id, '上游模型 ID', 200);
    if (/\s/u.test(id)) throw new Error('上游模型 ID 不能包含空白');
    if (seen.has(id)) return []; seen.add(id);
    const saved = existing.find(row => row.upstreamModelId === id);
    const candidates = library.filter(model => model.modelId === id || model.profile?.upstreamAliases?.[providerId]?.includes(id));
    const match = saved && provider.catalogModels?.find(row => row.modelId === saved.modelId)?.libraryId || (candidates.length === 1 ? candidates[0].id : '');
    return [{ id: crypto.randomUUID(), upstreamModelId: id, libraryId: match, candidates: candidates.map(row => row.id), confirmed: false, selected: false, source, status: saved ? '已存在' : candidates.length > 1 ? '待确认' : match ? '待确认匹配' : '待关联资料', type: typeof input === 'object' && Object.hasOwn(MODEL_TYPES, input.type) ? input.type : null, scenarios: [] }];
  }), missing: complete ? existing.filter(row => !seen.has(row.upstreamModelId)).map(row => row.id) : [] };
}
export function channelOnboardingTransaction(state, { operation, data = {} }) {
  const now = new Date().toISOString(), finish = (label, objectId, changes) => ({ type: 'batch', label, objectId, changes });
  if (/^channelTemporaryTest(Job|Receipt)$/.test(operation)) {
    const endpoint = state.endpoints.find(row => row.id === data.endpointId && row.providerId === data.providerId && !row.deletedAt);
    if (!endpoint) throw new Error('临时测试渠道已变化');
    const jobs = endpoint.temporaryTestJobs || [];
    if (operation.endsWith('Job')) {
      assertNoSecrets(data.request);
      const previous = jobs.find(row => row.operationId === data.operationId);
      if (!data.operationId || data.request?.operationId !== data.operationId || !Array.isArray(data.request.models) || data.request.models.length !== 1) throw new Error('临时测试请求无效');
      const request = { operationId: data.operationId, channelId: data.request.channelId, confirmExpensive: data.request.confirmExpensive === true, models: data.request.models.map(model => Object.fromEntries(testModelFields.filter(key => Object.hasOwn(model, key)).map(key => [key, model[key]]))) };
      if (previous && (requestSignature(previous.request) !== requestSignature(request) || previous.signature !== data.signature || previous.batchId && data.batchId && previous.batchId !== data.batchId)) throw new Error('原提交不能替换请求内容');
      const record = { ...previous, operationId: data.operationId, request, batchId: data.batchId || previous?.batchId || '', signature: data.signature, createdAt: previous?.createdAt || now, operator: previous ? previous.operator || null : state.currentRole, configurationRevision: previous ? previous.configurationRevision ?? null : endpoint.configurationRevision || 0 };
      return finish('跟踪临时密钥检查', record.operationId, [update('endpoints', endpoint.id, { temporaryTestJobs: [...jobs.filter(row => row.operationId !== record.operationId), record] })]);
    }
    const job = jobs.find(row => row.batchId === data.batch?.id);
    if (!job || data.batch.source !== 'mock' || data.batch.channelId !== job.request.channelId || data.batch.providerId !== data.providerId || !Array.isArray(data.batch.items) || data.batch.items.length !== job.request.models.length || !['completed', 'cancelled', 'interrupted'].includes(data.batch.status)) throw new Error('临时检查任务尚未完成或不属于原提交');
    if (job.receivedAt) return finish('临时检查已记录', job.batchId, []);
    const records = data.batch.items.map(item => {
      const submitted = job.request.models.find(row => row.associationId === item.model?.associationId);
      if (!submitted || ['id', 'associationId', 'upstreamModelId', 'type', 'check', 'dimensions'].some(key => submitted[key] !== item.model[key]) || (submitted.probe || submitted.type) !== (item.model.probe || item.model.type)) throw new Error('临时检查回执模型与原请求不一致');
      return { id: text(item.id, '测试记录 ID', 120), batchId: job.batchId, signature: job.signature, source: 'mock', simulated: true, ...channelTestDiagnostics({ providerId: data.providerId, endpointId: endpoint.id, associationId: submitted.associationId, operator: job.operator, configurationRevision: job.configurationRevision, serverChannelId: job.request.channelId }, data.batch, item), status: item.status, model: structuredClone(submitted) };
    });
    return finish('记录临时密钥检查', job.batchId, [update('endpoints', endpoint.id, { temporaryTestJobs: jobs.map(row => row === job ? { ...row, receivedAt: now } : row), temporaryTestRecords: [...(endpoint.temporaryTestRecords || []), ...records] })]);
  }
  if (operation === 'supplierSelection') {
    if (!['test', 'enable', 'disable'].includes(data.action) || !Array.isArray(data.selections) || !data.selections.length || data.selections.length > 2000) throw new Error('请选择有效的批量操作与对象');
    if (data.action !== 'test' && data.confirmed !== true) throw new Error('请确认所选对象及影响');
    const groups = new Map(), seen = new Set();
    for (const entry of data.selections) {
      const provider = state.providers.find(row => row.id === entry.providerId);
      const association = provider && catalogueChannels(state, provider, entry.modelId).find(row => row.id === entry.associationId && row.endpointId === entry.endpointId);
      if (!association || channelFingerprint(association) !== entry.expectedFingerprint || seen.has(entry.associationId)) throw new Error('所选模型渠道已变化或重复，请重新选择');
      if (data.action === 'test' && data.allowHighCost !== true && ['image', 'video', 'audio'].includes(provider.catalogModels?.find(row => row.modelId === entry.modelId)?.type)) throw new Error('高成本任务须单独勾选并确认测试用量');
      seen.add(entry.associationId);
      const key = JSON.stringify([entry.providerId, entry.endpointId]), group = groups.get(key) || { providerId: entry.providerId, endpointId: entry.endpointId, associations: [] };
      group.associations.push(entry); groups.set(key, group);
    }
    let working = structuredClone(state); const changes = [];
    const batches = [...groups.values()].flatMap(group => Array.from({ length: Math.ceil(group.associations.length / 50) }, (_, index) => ({ ...group, associations: group.associations.slice(index * 50, (index + 1) * 50) })));
    for (const group of batches) {
      const transactions = data.action === 'disable' ? group.associations.map(entry => ({ operation: 'channelDisable', objectId: group.providerId, data: { modelId: entry.modelId, channelId: entry.associationId, confirmed: true } })) : [{ operation: data.action === 'test' ? 'supplierModelsTest' : 'supplierModelsEnable', objectId: group.providerId, data: { endpointId: group.endpointId, associationIds: group.associations.map(entry => entry.associationId) } }];
      for (const transaction of transactions) {
        const result = providerTransaction(working, transaction);
        for (const change of result.changes) { if (change.type === 'add') working[change.collection].push(change.record); else Object.assign(working[change.collection].find(row => row.id === change.id), change.changes); changes.push(change); }
      }
    }
    return finish({ test: '批量测试所选模型', enable: '批量启用所选模型', disable: '批量停用所选模型' }[data.action], 'supplier-selection', changes);
  }
  if (operation.startsWith('channelDraft')) {
    const current = data.id && state.modelOnboardings.find(row => row.id === data.id && row.kind === 'supplier-channel');
    if (data.id && !current) throw new Error('接入草稿不存在');
    if (current && (current.status !== '配置中' || data.expectedRevision !== current.draftRevision)) throw new Error('接入草稿已变化，请载入最新版本');
    if (operation === 'channelDraftCommit') {
      if (!current) throw new Error('接入草稿不存在');
      const transaction = providerTransaction(state, { operation: current.endpointId ? 'supplierModelsAdd' : 'supplierChannelCreate', objectId: data.values.providerId || current.value.providerId, data: data.values });
      return finish('保存草稿并创建接入', current.id, [...transaction.changes, update('modelOnboardings', current.id, { status: '已完成', draftRevision: current.draftRevision + 1 })]);
    }
    if (operation === 'channelDraftSave') {
      const fields = draftFields(state, data), id = current?.id || `channel-draft-${crypto.randomUUID()}`;
      const record = { ...fields, draftRevision: (current?.draftRevision || 0) + 1, updatedAt: now, createdBy: current?.createdBy || state.currentRole };
      return finish('保存接入草稿', id, [current ? update('modelOnboardings', id, record) : add('modelOnboardings', { id, ...record })]);
    }
    if (!current) throw new Error('请选择接入草稿');
    if (!['channelDraftComplete', 'channelDraftDiscard'].includes(operation)) throw new Error('未知接入草稿操作');
    return finish(operation === 'channelDraftComplete' ? '完成接入草稿' : '放弃接入草稿', current.id, [update('modelOnboardings', current.id, { status: operation === 'channelDraftComplete' ? '已完成' : '已放弃', draftRevision: current.draftRevision + 1 })]);
  }
  if (operation === 'channelMetadataCreate') {
    assertNoSecrets(data);
    const name = text(data.name, '模型名称', 100), modelId = text(data.modelId, '模型编码', 80), type = data.type;
    if (!/^[a-z0-9][a-z0-9._:/-]{0,79}$/.test(modelId)) throw new Error('模型编码须由小写字母、数字及 . _ : / - 组成，最多80字');
    if (!Object.hasOwn(MODEL_TYPES, type)) throw new Error('请选择模型类型');
    if (modelLibrary(state).some(row => row.modelId.toLowerCase() === modelId.toLowerCase())) throw new Error('相同模型编码的资料已存在');
    const profile = modelProfileDraft({ profile: data.profile || {} });
    const requiredChoices = [['tasks', TASK_OPTIONS[type]], ['inputModalities', INPUT_MODALITY_OPTIONS]];
    for (const [key, options] of requiredChoices) if (!Array.isArray(profile[key]) || !profile[key].length || profile[key].some(value => !options.includes(value))) throw new Error('请选择有效的任务和输入类型');
    if (!(profile.outputModalities?.length || profile.resultTypes?.length) || profile.outputModalities?.some(value => !OUTPUT_MODALITY_OPTIONS.includes(value)) || profile.resultTypes?.some(value => !RESULT_TYPE_OPTIONS.includes(value))) throw new Error('请选择有效的输出类型或结果');
    const id = `template-${crypto.randomUUID()}`;
    return finish('新建模型基础资料', id, [add('modelTemplates', { id, name, modelId, type, description: '', maker: '', capabilities: { context: null, output: null, streaming: null, tools: null }, profile, revision: 1, updatedAt: now })]);
  }
  if (operation === 'channelDiscoveryPreview') {
    assertNoSecrets(data);
    const endpoint = data.endpointId && state.endpoints.find(row => row.id === data.endpointId && row.providerId === data.providerId && !row.deletedAt);
    if (data.endpointId && !endpoint) throw new Error('渠道归属已变化');
    const preview = previewChannelModels(state, data.providerId, data.models, data);
    return finish('预览渠道模型变更', data.endpointId || data.providerId, [update('providers', data.providerId, { lastModelDiscovery: { ...preview, endpointId: data.endpointId || '', fingerprint: endpoint ? connectionFingerprint(endpoint) : '', discoveredAt: now } })]);
  }
  if (operation === 'channelTestEvidenceJob' || operation === 'channelTestEvidenceReceipt') {
    const provider = state.providers.find(row => row.id === data.providerId), endpoint = state.endpoints.find(row => row.id === data.endpointId && row.providerId === provider?.id && !row.deletedAt);
    if (!provider || !endpoint) throw new Error('测试渠道已变化');
    const jobs = endpoint.serverTestJobs || [];
    if (operation === 'channelTestEvidenceJob') {
      const batchId = data.batchId ? text(data.batchId, '测试任务 ID', 120) : '', operationId = text(data.operationId || data.batchId, '提交操作 ID', 120), signature = text(data.signature, '配置签名', 10000);
      assertNoSecrets(data.request);
      const previous = jobs.find(row => row.operationId === operationId);
      if (!Array.isArray(data.associationIds) || !data.associationIds.length || data.associationIds.length > 50 || new Set(data.associationIds).size !== data.associationIds.length) throw new Error('测试任务须引用1–50个不重复模型');
      if (data.request && (!Array.isArray(data.request.models) || data.request.models.some(model => !model || typeof model !== 'object'))) throw new Error('测试请求快照格式无效');
      const request = data.request && { operationId, channelId: data.serverChannelId, confirmExpensive: data.request.confirmExpensive === true, models: data.request.models.map(model => Object.fromEntries(testModelFields.filter(key => Object.hasOwn(model, key)).map(key => [key, model[key]]))) };
      if (!request || request.models.length !== data.associationIds.length || new Set(request.models.map(model => model.associationId)).size !== request.models.length) throw new Error('待确认提交须保留原始请求快照');
      const serverChannelId = text(data.serverChannelId, '服务端渠道 ID', 120);
      if (previous && (previous.signature !== signature || previous.serverChannelId !== serverChannelId || requestSignature(previous.request) !== requestSignature(request) || JSON.stringify(previous.associationIds) !== JSON.stringify(data.associationIds) || previous.batchId && batchId && previous.batchId !== batchId)) throw new Error('同一提交操作不能替换配置、请求或测试任务');
      const known = supplierChannelAssociations(state, provider, endpoint.id), associationSignatures = {};
      if (!previous) for (const id of data.associationIds) {
        const association = known.find(row => row.id === id), model = request.models.find(row => row.associationId === id);
        if (!association || !model) throw new Error('任务模型不属于此渠道');
        const master = resolveChannelAssociationModel(state, provider, association);
        if (model.id !== master.id || model.upstreamModelId !== association.upstreamModelId || model.type !== master.type) throw new Error('测试模型身份与当前精确关联不一致');
        associationSignatures[id] = channelEvidenceSignature(state, provider.id, association, endpoint);
      }
      const record = { ...previous, operationId, batchId: batchId || previous?.batchId || '', signature, serverChannelId, associationIds: [...data.associationIds], associationSignatures: previous?.associationSignatures || associationSignatures, request, check: data.check || '', createdAt: previous?.createdAt || data.createdAt || now, operator: previous ? previous.operator || null : state.currentRole, configurationRevision: previous ? previous.configurationRevision ?? null : endpoint.configurationRevision || 0 };
      return finish('跟踪接入测试任务', operationId, [update('endpoints', endpoint.id, { serverTestJobs: [...jobs.filter(row => row.operationId !== operationId && (!batchId || row.batchId !== batchId)), record] })]);
    }
    const batch = data.batch, job = jobs.find(row => row.batchId === batch?.id);
    if (batch?.source !== 'mock') throw new Error('此原型仅接收内置测试任务结果');
    if (!job || batch.channelId !== job.serverChannelId || batch.providerId !== provider.id || !Array.isArray(batch.items) || !['completed', 'cancelled', 'interrupted'].includes(batch.status)) throw new Error('请选择已完成的已知测试任务');
    if (job.receivedAt) return finish('接入测试结果已记录', batch.id, []);
    if (batch.items.length !== job.associationIds.length || new Set(batch.items.map(item => item.model?.associationId)).size !== batch.items.length) throw new Error('测试回执模型集合与原提交不一致');
    const current = connectionFingerprint(endpoint) === job.signature;
    const passed = [], connections = structuredClone(provider.catalogConnections || []), changed = [], known = supplierChannelAssociations(state, provider, endpoint.id);
    for (const item of batch.items) {
      const projection = known.find(row => row.id === item.model?.associationId);
      if (!projection || !job.associationIds.includes(projection.id)) throw new Error('测试回执含其他渠道模型');
      const submitted = job.request?.models.find(row => row.associationId === projection.id);
      if (!submitted || ['id', 'associationId', 'upstreamModelId', 'type', 'check', 'dimensions'].some(key => submitted[key] !== item.model[key]) || (submitted.probe || submitted.type) !== (item.model.probe || item.model.type)) throw new Error('测试回执模型身份与原请求不一致');
      let master, evidenceSignature;
      try { master = resolveChannelAssociationModel(state, provider, projection); evidenceSignature = channelEvidenceSignature(state, provider.id, projection, endpoint); } catch { /* Changed or ambiguous identity retains history without qualifying. */ }
      const itemCurrent = current && item.current !== false && evidenceSignature === job.associationSignatures?.[projection.id] && master?.id === item.model.id && projection.upstreamModelId === item.model.upstreamModelId && master?.type === item.model.type;
      const association = materializeChannelAssociation(state, provider, projection), index = connections.findIndex(row => row.id === projection.id || !row.id && row.endpointId === endpoint.id && row.modelId === projection.modelId);
      if (index < 0) connections.push(association); else connections[index] = association;
      const result = ({ passed: '通过', failed: '失败', cancelled: '已取消', unknown: '结果未知' })[item.status] || '结果未知';
      const record = { id: text(item.id, '测试记录 ID', 120), source: 'mock', simulated: true, current: itemCurrent, ...channelTestDiagnostics({ providerId: provider.id, endpointId: endpoint.id, associationId: association.id, operator: job.operator, configurationRevision: job.configurationRevision, serverChannelId: job.serverChannelId }, batch, item), fingerprint: itemCurrent ? channelFingerprint({ ...association, endpoint }) : JSON.stringify(['old-config', job.signature]) };
      association.testHistory = [...(association.testHistory || []), record];
      if (itemCurrent) association.type = master.type;
      if (itemCurrent && !item.model.check && (!association.health?.testedAt || Date.parse(record.testedAt) >= Date.parse(association.health.testedAt))) { const qualified = channelQualification({ ...projection, ...association, endpoint }); if (qualified) association.qualification = structuredClone(qualified); association.health = record; if (result === '通过') passed.push(record); }
      const previousCheck = association.capabilityTests?.[item.model.check];
      if (item.model.check && itemCurrent && (!previousCheck?.testedAt || Date.parse(record.testedAt) >= Date.parse(previousCheck.testedAt))) association.capabilityTests = { ...association.capabilityTests, [item.model.check]: record };
    }
    changed.push(update('providers', provider.id, { catalogConnections: connections }));
    const endpointPatch = { ...(connectionQualification(endpoint) ? { connectionQualification: structuredClone(connectionQualification(endpoint)) } : {}), serverTestJobs: jobs.map(row => row.batchId === batch.id ? { ...row, receivedAt: now, status: batch.status } : row) };
    const latestPass = passed.sort((left, right) => Date.parse(right.testedAt) - Date.parse(left.testedAt))[0];
    if (current && latestPass && !job.check && (!endpoint.connectionTest?.testedAt || Date.parse(latestPass.testedAt) >= Date.parse(endpoint.connectionTest.testedAt))) endpointPatch.connectionTest = { result: '通过', fingerprint: connectionFingerprint(endpoint), testedAt: latestPass.testedAt, source: 'mock', simulated: true, serverBatchId: batch.id };
    changed.push(update('endpoints', endpoint.id, endpointPatch));
    return finish('记录接入测试结果', batch.id, changed);
  }
  if (operation === 'channelTestEvidenceAppend') {
    const provider = state.providers.find(row => row.id === data.providerId), endpoint = state.endpoints.find(row => row.id === data.endpointId && row.providerId === provider?.id);
    const association = provider && catalogueChannels(state, provider, data.modelId).find(row => row.id === data.associationId && row.endpointId === endpoint?.id);
    if (!association) throw new Error('测试对象已变化');
    const record = { id: crypto.randomUUID(), testedAt: now, source: 'local-preview', result: ['通过', '失败', '已取消', '结果未知'].includes(data.result) ? data.result : '结果未知', task: text(data.task || '基础调用', '测试任务', 60), message: text(data.message || '', '测试说明', 2000, false), signature: text(data.signature || '', '配置签名', 10000, false), credentialVersion: endpoint.credentialVersion || '', operator: state.currentRole };
    const catalogConnections = (provider.catalogConnections || []).map(row => row.id === association.id ? { ...row, testHistory: [...(row.testHistory || []), record] } : row);
    return finish('记录接入测试', record.id, [update('providers', provider.id, { catalogConnections })]);
  }
  throw new Error('未知接入操作');
}

export function validateChannelRows(state, rows, endpoint) {
  const errors = [], masters = new Set(), ids = new Set(), selected = rows.filter(row => row.selected !== false);
  if (!selected.length || selected.length > 50) errors.push({ rowId: '', field: 'selection', message: '请选择 1–50 个模型' });
  for (const row of selected) {
    const master = libraryRecord(state, row.libraryId), id = row.upstreamModelId.trim();
    if (!master) errors.push({ rowId: row.id, field: 'libraryId', message: '请选择有效的模型资料' });
    if (!id || /\s|\p{Cc}/u.test(id)) errors.push({ rowId: row.id, field: 'upstreamModelId', message: '填写有效的上游模型 ID，不能有空白或控制字符' });
    if (master && masters.has(master.id)) errors.push({ rowId: row.id, field: 'libraryId', message: '重复的模型资料' });
    if (ids.has(id)) errors.push({ rowId: row.id, field: 'upstreamModelId', message: '重复的上游模型 ID' });
    if (master) masters.add(master.id); ids.add(id);
    if (['upstream', 'reference'].includes(row.source) && !row.confirmed) errors.push({ rowId: row.id, field: 'confirmed', message: '请确认模型身份匹配' });
    if (row.scenarios.some(item => !item.name?.trim() || !item.unit?.trim() || String(item.listPrice).trim() === '' || !Number.isFinite(Number(item.listPrice)) || Number(item.listPrice) < 0)) errors.push({ rowId: row.id, field: 'scenarios', message: '补齐已填写的采购价，或清空后稍后配置' });
    if (master && endpoint?.interfaceType) {
      const task = endpoint.interfaceType === 'anthropic' ? ['text', 'multimodal'] : endpoint.interfaceType === 'openai' ? ['text', 'multimodal', 'embedding', 'image', 'audio'] : Object.keys(MODEL_TYPES);
      if (!task.includes(master.type)) errors.push({ rowId: row.id, field: 'libraryId', message: '当前接口类型不支持此模型任务' });
    }
  }
  return errors;
}
