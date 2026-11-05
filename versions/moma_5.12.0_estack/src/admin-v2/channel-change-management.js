import { prepareChannelInterface, prepareChannelAdapterOptions } from './channel-interface.js';
import { resolveChannelAssociationModel, channelAssociationPricing, materializeChannelAssociation } from './channel-association-model.js';
import { connectionFingerprint, connectionKeys, connectionCredentialsReady, normalizeChannelKeyPool } from './connection-state.js';
import { channelFingerprint, channelInterfaceIssue, channelModelUrl } from './provider-channels.js';
import { supplierChannelAssociations, supplierKeyChannels, invalidateSupplierChannels } from './supplier-resources.js';
import { providerKeyGroups } from './provider-key-groups.js';
import { credentialRotationChannels } from './credential-rotation-scope.js';
import { providerTransaction, modelConnectivityPreview, normalizeProviderPrice } from './provider-management.js';
import { channelTestDiagnostics } from './channel-test-diagnostics.js';

export const CHANNEL_EVIDENCE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const connectionFields = ['protocol', 'baseUrl', 'interfaceType', 'addressMode', 'taskUrls', 'adapterOptions', 'allowHttp', 'authMode', 'apiKeyId', 'keyGroupId', 'keyPool', 'credentialRef', 'apiKeys', 'capacity', 'timeoutSeconds', 'credentialVersion', 'adapterVersion'];
const editableFields = ['protocol', 'baseUrl', 'interfaceType', 'taskUrls', 'adapterOptions', 'authMode', 'apiKeyId', 'keyGroupId', 'keyPool', 'capacity', 'timeoutSeconds', 'adapterVersion'];
const update = (collection, id, changes) => ({ type: 'update', collection, id, changes });
const uid = prefix => `${prefix}-${crypto.randomUUID()}`;
const snapshot = endpoint => structuredClone(Object.fromEntries(connectionFields.filter(key => Object.hasOwn(endpoint, key)).map(key => [key, endpoint[key]])));
const requestSignature = request => JSON.stringify([request?.operationId, request?.channelId, request?.confirmExpensive === true, request?.models?.map(model => Object.entries(model).sort(([left], [right]) => left.localeCompare(right)))]);
const latestCandidateEvidence = (candidate, associationId, signature, keyId) => candidate.tests.filter(test => test.associationId === associationId && test.signature === signature && !test.check && (!keyId || test.credentialIds?.includes(keyId))).reverse().sort((left, right) => Date.parse(right.testedAt) - Date.parse(left.testedAt))[0];

function context(state, providerId, endpointId) {
  const provider = state.providers.find(row => row.id === providerId);
  const endpoint = state.endpoints.find(row => row.id === endpointId && row.providerId === providerId && !row.deletedAt);
  if (!provider || !endpoint) throw new Error('渠道不属于当前供应商或已删除');
  return { provider, endpoint };
}
function expectedRevision(endpoint, value) {
  if (value !== (endpoint.configurationRevision || 0)) throw new Error('渠道配置已有修订，请重新载入后操作');
}
function liveKeys(endpoint, provider) {
  return connectionKeys(endpoint, provider).map(key => ({ id: key.id, version: key.version || key.fingerprint, fingerprint: key.fingerprint, status: key.status, revokedAt: key.revokedAt || null }));
}
function configSignature(endpoint, provider) {
  return JSON.stringify([snapshot(endpoint), liveKeys(endpoint, provider)]);
}
function assertCredentials(endpoint, provider) {
  if (endpoint.authMode === 'pool') normalizeChannelKeyPool(endpoint.keyPool, provider);
  if (!connectionCredentialsReady(endpoint, provider) || liveKeys(endpoint, provider).some(key => key.revokedAt)) throw new Error('候选配置缺少可用凭证，或凭证已经撤销');
}
function configuredEndpoint(state, provider, endpoint, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !editableFields.includes(key))) throw new Error('候选配置包含不支持或敏感字段');
  let value = { ...snapshot(endpoint), ...structuredClone(input), credentialVersion: uid('credential-version') };
  value.adapterOptions = prepareChannelAdapterOptions(value.adapterOptions || {});
  if (value.interfaceType) value = { ...value, ...prepareChannelInterface({ ...value, allowHttp: provider.sourceType === 'selfHosted' }), allowHttp: provider.sourceType === 'selfHosted' };
  const retainedReference = !Object.hasOwn(input, 'authMode') && !endpoint.authMode && (endpoint.credentialRef || endpoint.apiKeys?.length);
  if (!retainedReference && !['group', 'specific', 'inherit', 'none', 'pool'].includes(value.authMode)) throw new Error('请选择候选配置的凭证方式');
  if (value.authMode === 'pool') value.keyPool = normalizeChannelKeyPool(value.keyPool, provider);
  if (value.authMode === 'none' && provider.sourceType !== 'selfHosted') throw new Error('仅自有推理服务可无需认证');
  if (value.authMode === 'group' && !providerKeyGroups(provider).some(group => group.id === value.keyGroupId)) throw new Error('密钥组不属于当前供应商');
  if (value.authMode === 'specific' && !provider.apiKeys?.some(key => key.id === value.apiKeyId) && !endpoint.apiKeys?.some(key => key.scope === 'channel' && key.id === value.apiKeyId)) throw new Error('指定密钥不属于当前供应商或渠道');
  if (Object.hasOwn(input, 'authMode') || Object.hasOwn(input, 'keyGroupId') || Object.hasOwn(input, 'apiKeyId')) {
    value.apiKeys = []; value.credentialRef = '';
    if (value.authMode !== 'specific') value.apiKeyId = '';
    if (value.authMode !== 'group') value.keyGroupId = '';
    if (value.authMode !== 'pool') value.keyPool = [];
  }
  const transaction = providerTransaction(state, { operation: 'connection', objectId: endpoint.id, data: { ...endpoint, ...value, name: endpoint.name, providerId: provider.id, timeoutSeconds: value.timeoutSeconds || 60 } });
  const normalized = transaction.changes.find(change => change.collection === 'endpoints' && change.id === endpoint.id).changes;
  value = { ...value, ...snapshot(normalized) };
  if (value.apiKeys) value.apiKeys = value.apiKeys.map(key => endpoint.apiKeys?.some(saved => saved.scope === 'channel' && saved.id === key.id && saved.fingerprint === key.fingerprint) ? { ...key, scope: 'channel' } : key);
  const prepared = { ...endpoint, ...value };
  for (const mapping of supplierChannelAssociations(state, provider, endpoint.id)) {
    const master = resolveChannelAssociationModel(state, provider, mapping);
    const issue = channelInterfaceIssue(provider, { ...mapping, type: master.type, endpoint: prepared, apiAddresses: [{ protocol: prepared.protocol, baseUrl: channelModelUrl(prepared, master.type) }] });
    if (issue) throw new Error(`${mapping.modelId}：${issue}`);
  }
  return value;
}

export function channelChangeImpact(state, providerId, endpointId) {
  const { provider, endpoint } = context(state, providerId, endpointId);
  const mappings = supplierChannelAssociations(state, provider, endpoint.id);
  const supplies = state.modelSupplies.filter(row => row.endpointId === endpoint.id && row.status !== '已移除');
  const services = (state.serviceRoutes || []).filter(route => route.activeVersion).flatMap(route => {
    const active = route.versions.find(version => version.version === route.activeVersion);
    const rows = mappings.filter(mapping => active?.config.channels.some(row => row.enabled && (row.supplyId === mapping.id || supplies.some(supply => supply.id === row.supplyId && supply.upstreamModelId === mapping.upstreamModelId && (supply.catalogueModelId || supply.upstreamModelId) === mapping.modelId))));
    return rows.length ? [{ id: route.serviceId, routeId: route.id, version: route.activeVersion, associationIds: rows.map(row => row.id) }] : [];
  });
  const activeAssociationIds = [...new Set(services.flatMap(service => service.associationIds))].filter(id => mappings.find(row => row.id === id)?.enabled);
  const revision = JSON.stringify([mappings.map(row => [row.id, row.modelId, row.upstreamModelId, row.enabled]), supplies.map(row => [row.id, row.modelId, row.upstreamModelId, row.status]), services]);
  return { providerId, endpointId, configurationRevision: endpoint.configurationRevision || 0, mappings, services, activeAssociationIds, revision };
}

export function assertDirectChannelMutation(state, operation, providerId, data = {}) {
  const provider = state.providers.find(row => row.id === providerId);
  if (!provider) return;
  let endpoints = [];
  if (operation === 'supplierChannelSave' && data.mode !== 'info') {
    const endpoint = state.endpoints.find(row => row.id === data.endpointId && row.providerId === provider.id);
    const changed = endpoint && ['baseUrl', 'protocol', 'interfaceType', 'taskUrls', 'adapterOptions', 'authMode', 'keyGroupId', 'apiKeyId'].some(key => Object.hasOwn(data, key) && JSON.stringify(data[key]) !== JSON.stringify(endpoint[key]));
    if (changed) endpoints = [endpoint];
  } else if (['keyGroupPrimary', 'defaultApiKey', 'editApiKey'].includes(operation)) {
    if (operation === 'keyGroupPrimary' && providerKeyGroups(provider).find(group => group.id === data.groupId)?.keyIds[0] === data.keyId || operation === 'defaultApiKey' && provider.defaultApiKeyId === data.keyId) return;
    endpoints = operation === 'editApiKey' ? credentialRotationChannels(state, provider, data.keyId) : state.endpoints.filter(row => row.providerId === provider.id && (row.authMode === 'group' && row.keyGroupId === (data.groupId || 'default') || row.authMode === 'inherit' && (!data.groupId || data.groupId === 'default')));
  }
  if (endpoints.some(endpoint => channelChangeImpact(state, provider.id, endpoint.id).activeAssociationIds.length)) throw new Error('在线渠道须先创建候选配置并完成测试后应用');
}

export function channelEvidenceSignature(state, providerId, association, endpoint = association.endpoint) {
  const { provider } = context(state, providerId, endpoint.id);
  const entry = provider.catalogModels?.find(row => row.modelId === association.modelId);
  const master = resolveChannelAssociationModel(state, provider, association);
  return JSON.stringify([configSignature(endpoint, provider), association.id, association.modelId, association.upstreamModelId, association.capabilities, association.task, association.parameters, entry?.type, entry?.capabilities, master?.capabilities, master?.profile?.tasks, endpoint.adapterVersion || 1]);
}

function candidateContext(state, data) {
  const { provider, endpoint } = context(state, data.providerId, data.endpointId);
  expectedRevision(endpoint, data.expectedRevision);
  const candidate = endpoint.candidateConfiguration;
  if (!candidate || candidate.id !== data.candidateId) throw new Error('候选配置已变化，请重新载入');
  if (candidate.baseSignature !== configSignature(endpoint, provider)) throw new Error('生效配置或凭证已变化，请重新创建候选配置');
  return { provider, endpoint, candidate };
}
function candidateChecks(state, provider, endpoint, candidate, { at = Date.now(), requireReal = false } = {}) {
  const impact = channelChangeImpact(state, provider.id, endpoint.id);
  const impactChanged = candidate.impactRevision !== impact.revision;
  const enabledIds = impact.mappings.filter(row => row.enabled).map(row => row.id);
  const requiredIds = impact.activeAssociationIds.length ? impact.activeAssociationIds : enabledIds.length ? enabledIds : impact.mappings.map(row => row.id);
  const projected = { ...endpoint, ...candidate.config };
  const keyIds = projected.authMode === 'pool' ? connectionKeys(projected, provider).map(key => key.id) : [null];
  const checks = requiredIds.map(id => {
    const mapping = impact.mappings.find(row => row.id === id), signature = channelEvidenceSignature(state, provider.id, mapping, projected);
    const evidenceByKey = keyIds.map(keyId => latestCandidateEvidence(candidate, id, signature, keyId));
    const evidence = evidenceByKey.find(row => !row || row.result !== '通过') || evidenceByKey.slice().sort((left, right) => Date.parse(left?.testedAt) - Date.parse(right?.testedAt))[0];
    const pending = candidate.pendingTests?.some(job => job.endpointId === endpoint.id && job.associationIds.includes(id));
    const covered = keyIds.length > 0 && evidenceByKey.every(Boolean);
    const real = evidenceByKey.every(row => row?.source === 'server-receipt' && row.simulated === false && row.serverBatchId && row.serverSignature);
    const fresh = evidenceByKey.every(row => row && at - Date.parse(row.testedAt) >= 0 && at - Date.parse(row.testedAt) <= CHANNEL_EVIDENCE_MAX_AGE_MS);
    const passed = !impactChanged && !pending && covered && fresh && evidence?.result === '通过' && (!requireReal || real);
    return { associationId: id, modelId: mapping.modelId, passed, evidence, evidenceByKey, reason: impactChanged ? '关联模型或服务引用已变化，请重新保存候选配置' : pending ? '候选测试尚未完成' : !covered ? projected.authMode === 'pool' ? '候选配置尚未完成全部启用密钥的测试' : '候选配置尚未测试' : evidence.result !== '通过' ? evidence.message || '最近一次测试未通过' : !fresh ? '测试证据已过期，请重新测试' : requireReal && !real ? '正式接入需要真实上游测试证据' : '' };
  });
  let credentialError = '';
  try { assertCredentials(projected, provider); } catch (error) { credentialError = error.message; }
  return { ready: !impactChanged && checks.length > 0 && checks.every(check => check.passed) && !credentialError, checks, credentialError, impact, reason: impactChanged ? '关联模型或服务引用已变化，请重新保存候选配置' : '' };
}
export function channelCandidateStatus(state, providerId, endpointId, options) {
  const { provider, endpoint } = context(state, providerId, endpointId), candidate = endpoint.candidateConfiguration;
  if (!candidate) return { ready: false, checks: [], reason: '尚未创建候选配置' };
  if (candidate.baseSignature !== configSignature(endpoint, provider)) return { ready: false, checks: [], reason: '生效配置或凭证已变化' };
  return candidateChecks(state, provider, endpoint, candidate, { ...options, requireReal: options?.requireReal || candidate.requireReal === true });
}

function assertCandidateImpact(state, provider, endpoint, impactRevision) {
  if (impactRevision !== channelChangeImpact(state, provider.id, endpoint.id).revision) throw new Error('关联模型或服务引用已变化，请重新保存候选配置后测试');
}

function testedCandidate(state, provider, endpoint, candidate, data) {
  assertCandidateImpact(state, provider, endpoint, candidate.impactRevision);
  const mappings = supplierChannelAssociations(state, provider, endpoint.id), ids = data.associationIds || mappings.map(row => row.id);
  if (!Array.isArray(ids) || !ids.length || ids.length > 50 || new Set(ids).size !== ids.length) throw new Error('请选择 1–50 个不重复的候选模型');
  const selected = ids.map(id => {
    const mapping = mappings.find(row => row.id === id);
    if (!mapping) throw new Error('模型关联不属于当前候选渠道');
    return mapping;
  });
  const projected = { ...endpoint, ...candidate.config };
  if (projected.authMode === 'pool' && !connectionKeys(projected, provider).some(key => key.id === data.keyId)) throw new Error('请选择一条可用的候选密钥进行测试');
  const tests = selected.map(mapping => {
    let result;
    try {
      assertCredentials(projected, provider);
      const issue = channelInterfaceIssue(provider, { ...mapping, endpoint: projected });
      if (issue) throw new Error(issue);
      result = modelConnectivityPreview({ upstreamId: mapping.upstreamModelId }, data.scenarios?.[mapping.id] || 'success');
    } catch (error) { result = { result: '失败', message: error.message }; }
    return { ...result, id: uid('candidate-test'), candidateId: candidate.id, endpointId: endpoint.id, associationId: mapping.id, signature: channelEvidenceSignature(state, provider.id, mapping, projected), testedAt: new Date().toISOString(), source: 'prototype', simulated: true, credentialIds: projected.authMode === 'pool' ? [data.keyId] : liveKeys(projected, provider).map(key => key.id) };
  });
  return { ...candidate, tests: [...candidate.tests, ...tests] };
}

function appliedCandidate(state, provider, endpoint, candidate, data) {
  if (data.confirmed !== true) throw new Error('请确认应用候选配置及其服务影响');
  if (provider.status !== '已启用') throw new Error('供应商已停用，不能应用候选配置');
  const requireReal = data.requireReal === true || candidate.requireReal === true;
  const status = candidateChecks(state, provider, endpoint, candidate, { requireReal });
  if (status.impact.revision !== candidate.impactRevision) throw new Error('关联模型或服务引用已变化，请重新检查影响并创建候选配置');
  if (!status.ready) throw new Error(status.credentialError || status.checks.find(check => !check.passed)?.reason || '候选配置尚未完成验证');
  const at = new Date().toISOString(), revision = (endpoint.configurationRevision || 0) + 1;
  const next = { ...endpoint, ...candidate.config, configurationRevision: revision };
  const versions = endpoint.configurationVersions || [{ version: endpoint.configurationRevision || 0, config: snapshot(endpoint), appliedAt: endpoint.updatedAt || at }];
  const mappings = status.impact.mappings;
  const tested = new Map();
  for (const mapping of mappings) {
    const signature = channelEvidenceSignature(state, provider.id, mapping, next);
    const check = status.checks.find(row => row.associationId === mapping.id);
    const evidence = next.authMode === 'pool' ? check?.passed ? { ...check.evidence, source: check.evidenceByKey.every(row => row.source === 'server-receipt' && row.simulated === false) ? 'server-receipt' : check.evidenceByKey.every(row => row.source === 'mock') ? 'mock' : 'prototype', simulated: check.evidenceByKey.some(row => row.simulated !== false), credentialIds: connectionKeys(next, provider).map(key => key.id), evidenceIds: check.evidenceByKey.map(row => row.id) } : null : latestCandidateEvidence(candidate, mapping.id, signature);
    const age = evidence ? Date.now() - Date.parse(evidence.testedAt) : Infinity;
    if (evidence?.result === '通过' && age >= 0 && age <= CHANNEL_EVIDENCE_MAX_AGE_MS && (!requireReal || evidence.source === 'server-receipt' && evidence.simulated === false)) tested.set(mapping.id, evidence);
  }
  const real = [...tested.values()].every(test => test.source === 'server-receipt' && test.simulated === false);
  next.connectionTest = { result: '通过', fingerprint: connectionFingerprint(next), testedAt: [...tested.values()].map(test => test.testedAt).sort().at(-1), source: real ? 'server-receipt' : [...tested.values()].every(test => test.source === 'mock') ? 'mock' : 'prototype', simulated: !real, evidenceIds: [...tested.values()].map(test => test.id) };
  const entries = provider.catalogConnections || [];
  const catalogConnections = [...entries.filter(row => row.endpointId !== endpoint.id || row.deletedAt), ...mappings.map(mapping => {
    const row = { ...materializeChannelAssociation(state, provider, mapping), enabled: mapping.enabled };
    const evidence = tested.get(mapping.id);
    if (!evidence) return { ...row, enabled: false, health: null, qualification: null, protocolTests: {} };
    const master = resolveChannelAssociationModel(state, provider, mapping);
    row.type = master.type;
    const apiAddresses = [{ protocol: next.protocol, baseUrl: channelModelUrl(next, master.type, { probe: evidence.task }) }];
    const channel = { ...mapping, endpoint: next, apiAddresses };
    const health = { ...evidence, fingerprint: channelFingerprint(channel) };
    return { ...row, apiAddresses, ...(evidence.task ? { task: evidence.task } : {}), health, qualification: structuredClone(health), protocolTests: { [next.protocol]: health } };
  })];
  const changes = [update('endpoints', endpoint.id, { ...candidate.config, configurationRevision: revision, configurationVersions: [...versions, { version: revision, config: snapshot(next), appliedAt: at, candidateId: candidate.id, rollbackOf: candidate.rollbackOf ?? null, evidenceIds: [...tested.values()].map(row => row.id) }], candidateConfiguration: null, connectionTest: next.connectionTest, connectionQualification: structuredClone(next.connectionTest) }), update('providers', provider.id, { catalogConnections })];
  for (const supply of state.modelSupplies.filter(row => row.endpointId === endpoint.id && row.status !== '已移除')) {
    const mapping = mappings.find(row => row.upstreamModelId === supply.upstreamModelId && row.modelId === (supply.catalogueModelId || supply.upstreamModelId));
    const evidence = mapping && tested.get(mapping.id);
    changes.push(update('modelSupplies', supply.id, evidence ? { validationStatus: '通过', verifiedAt: evidence.testedAt, configurationRevision: revision } : { validationStatus: '待验证', verifiedAt: null, validationCases: [] }));
  }
  return changes;
}

export function activeChannelProcurement(association, at = Date.now()) {
  if (!Array.isArray(association?.procurementVersions)) return undefined;
  const time = typeof at === 'number' ? at : Date.parse(at);
  const version = association.procurementVersions.filter(row => row.status === '已发布' && Date.parse(row.effectiveAt) <= time && Date.parse(row.publishedAt || row.effectiveAt) <= time)
    .sort((left, right) => Date.parse(right.effectiveAt) - Date.parse(left.effectiveAt) || right.version - left.version)[0];
  return !version || version.expiresAt && Date.parse(version.expiresAt) <= time ? null : version;
}
export function channelProcurementSnapshot(association, at = Date.now()) {
  const version = activeChannelProcurement(association, at);
  if (version === null) return null;
  return { versionId: version?.id || null, version: version?.version ?? null, pricing: structuredClone(version?.pricing || association.pricing), selectedAt: new Date(at).toISOString(), effectiveAt: version?.effectiveAt || null, expiresAt: version?.expiresAt || null };
}

function keyGroupContext(state, data, withCandidate = true) {
  const provider = state.providers.find(row => row.id === data.providerId);
  const group = provider && providerKeyGroups(provider).find(row => row.id === data.groupId);
  if (!provider || !group) throw new Error('密钥组不属于当前供应商');
  const revision = provider.keyGroupRevisions?.[group.id] || 0;
  if (data.expectedGroupVersion !== revision) throw new Error('密钥组已有修订，请重新载入');
  const endpoints = state.endpoints.filter(row => row.providerId === provider.id && !row.deletedAt && (row.authMode === 'group' && row.keyGroupId === group.id || group.id === 'default' && row.authMode === 'inherit'));
  const signature = JSON.stringify([group.keyIds, group.keyIds.map(id => {
    const key = provider.apiKeys?.find(row => row.id === id);
    return key && [key.id, key.version || key.fingerprint, key.status, key.revokedAt];
  }), endpoints.map(row => [row.id, configSignature(row, provider)])]);
  const candidate = provider.keyGroupCandidates?.find(row => row.groupId === group.id);
  if (withCandidate && (!candidate || candidate.id !== data.candidateId || candidate.baseSignature !== signature)) throw new Error('密钥组候选或引用配置已变化，请重新创建');
  return { provider, group, endpoints, revision, signature, candidate };
}
function projectedKeyGroup(state, provider, candidate) {
  const projected = { ...provider, apiKeyGroups: providerKeyGroups(provider).map(row => row.id === candidate.groupId ? { ...row, keyIds: candidate.keyIds } : row), ...(candidate.groupId === 'default' ? { defaultApiKeyId: candidate.keyIds[0] } : {}) };
  return { provider: projected, state: { ...state, providers: state.providers.map(row => row.id === provider.id ? projected : row) } };
}
export function candidateTestPlan(state, data) {
  let current, projectedState = state, provider;
  if (data.groupId) {
    current = keyGroupContext(state, data);
    for (const endpoint of current.endpoints) assertCandidateImpact(state, current.provider, endpoint, current.candidate.impactRevisions[endpoint.id]);
    if (!current.endpoints.some(row => row.id === data.endpointId)) throw new Error('渠道不属于当前密钥组候选');
    const projected = projectedKeyGroup(state, current.provider, current.candidate);
    projectedState = projected.state; provider = projected.provider;
    current.endpoint = current.endpoints.find(row => row.id === data.endpointId);
  } else { current = candidateContext(state, data); provider = current.provider; assertCandidateImpact(state, provider, current.endpoint, current.candidate.impactRevision); }
  const { candidate, endpoint } = current;
  const projectedEndpoint = { ...endpoint, ...(data.groupId ? candidate.configs[endpoint.id] : candidate.config) };
  assertCredentials(projectedEndpoint, provider);
  if (projectedEndpoint.authMode === 'pool' && !connectionKeys(projectedEndpoint, provider).some(key => key.id === data.keyId)) throw new Error('请选择一条可用的候选密钥进行测试');
  const records = supplierChannelAssociations(projectedState, provider, endpoint.id).map(mapping => {
    const master = resolveChannelAssociationModel(state, provider, mapping);
    return { associationId: mapping.id, modelId: master.id, upstreamModelId: mapping.upstreamModelId, type: master.type, signature: channelEvidenceSignature(projectedState, provider.id, mapping, projectedEndpoint) };
  });
  return { candidateId: candidate.id, provider, endpoint: projectedEndpoint, records, signature: configSignature(projectedEndpoint, provider) + (projectedEndpoint.authMode === 'pool' ? JSON.stringify(data.keyId) : ''), ...(data.groupId ? { groupId: data.groupId } : {}) };
}

function candidateReceiptTransaction(state, operation, data) {
  const { provider, endpoint } = context(state, data.providerId, data.endpointId), group = operation.startsWith('keyGroup');
  if (group !== Boolean(data.groupId)) throw new Error('候选任务操作与密钥组范围不匹配');
  const field = group ? 'keyGroupTestJobs' : 'candidateTestJobs', jobs = (group ? provider : endpoint)[field] || [];
  const finish = (label, changes) => ({ type: 'batch', objectId: data.candidateId, label, changes });
  if (operation.endsWith('Job')) {
    const existing = jobs.find(row => row.operationId === data.operationId);
    if (existing) {
      const batchId = data.batchId || existing.batchId || '';
      if (existing.endpointId !== endpoint.id || existing.keyId !== data.keyId || existing.serverCredentialId !== data.serverCredentialId || existing.groupId !== data.groupId || existing.candidateId !== data.candidateId || existing.signature !== data.signature || existing.serverSignature !== data.serverSignature || existing.serverChannelId !== data.serverChannelId || requestSignature(existing.request) !== requestSignature(data.request) || existing.batchId && existing.batchId !== batchId || typeof batchId !== 'string' || batchId.length > 120) throw new Error('同一操作 ID 不能替换候选、配置、请求或测试任务');
      return finish('恢复候选测试任务', [update(group ? 'providers' : 'endpoints', group ? provider.id : endpoint.id, { [field]: jobs.map(row => row === existing ? { ...row, batchId } : row) })]);
    }
    const plan = candidateTestPlan(state, data), request = data.request;
    if (plan.endpoint.authMode === 'pool' && (typeof data.serverCredentialId !== 'string' || !data.serverCredentialId || data.serverCredentialId.length > 160)) throw new Error('候选测试缺少密钥引用');
    if (data.signature !== plan.signature || typeof data.serverSignature !== 'string' || !data.serverSignature || typeof data.serverChannelId !== 'string' || !data.serverChannelId || !request || request.channelId !== data.serverChannelId || request.operationId !== data.operationId || typeof data.operationId !== 'string' || !data.operationId || data.operationId.length > 120) throw new Error('候选任务与当前配置或原始请求不匹配');
    if (!Array.isArray(request.models) || !request.models.length || request.models.length > 50 || new Set(request.models.map(row => row.associationId)).size !== request.models.length) throw new Error('请选择 1–50 个不重复的候选模型');
    const models = request.models.map(model => {
      const known = plan.records.find(row => row.associationId === model.associationId);
      if (!known || model.id !== known.modelId || model.upstreamModelId !== known.upstreamModelId || model.type !== known.type || model.check && !['streaming', 'tools', 'structured'].includes(model.check)) throw new Error('测试请求含其他候选模型或模型身份已变化');
      const fields = ['id', 'associationId', 'upstreamModelId', 'type', 'check', 'probe', 'dimensions', 'voice', 'imageSize', 'statusPath', 'maxOutputTokens'];
      if (Object.keys(model).some(key => !fields.includes(key))) throw new Error('候选请求含不支持的模型字段');
      return structuredClone(model);
    });
    const previous = jobs.find(row => row.operationId === data.operationId), batchId = data.batchId || previous?.batchId || '';
    if (typeof batchId !== 'string' || batchId.length > 120) throw new Error('测试任务 ID 无效');
    const record = { ...(plan.endpoint.authMode === 'pool' ? { keyId: data.keyId, serverCredentialId: data.serverCredentialId } : {}), candidateId: plan.candidateId, providerId: provider.id, endpointId: endpoint.id, ...(group ? { groupId: data.groupId } : {}), operationId: data.operationId, batchId, signature: plan.signature, serverChannelId: data.serverChannelId, serverSignature: data.serverSignature, request: { operationId: data.operationId, channelId: data.serverChannelId, confirmExpensive: request.confirmExpensive === true, models }, associationSignatures: Object.fromEntries(models.map(model => [model.associationId, plan.records.find(row => row.associationId === model.associationId).signature])), createdAt: previous?.createdAt || new Date().toISOString(), operator: state.currentRole, configurationRevision: endpoint.configurationRevision || 0 };
    if (previous && (previous.candidateId !== record.candidateId || previous.signature !== record.signature || previous.serverSignature !== record.serverSignature || previous.serverChannelId !== record.serverChannelId || JSON.stringify(previous.request) !== JSON.stringify(record.request) || previous.batchId && previous.batchId !== batchId)) throw new Error('同一操作 ID 不能替换候选、配置、请求或测试任务');
    const next = { ...record, ...(previous?.receivedAt ? { receivedAt: previous.receivedAt, status: previous.status } : {}) }, updated = [...jobs.filter(row => row.operationId !== next.operationId), next];
    const pending = candidate => ({ ...candidate, pendingTests: [...(candidate.pendingTests || []).filter(row => row.operationId !== next.operationId), ...(previous?.receivedAt ? [] : [{ operationId: next.operationId, endpointId: endpoint.id, associationIds: models.map(model => model.associationId) }])] });
    if (group) return finish('跟踪密钥组候选测试', [update('providers', provider.id, { [field]: updated, keyGroupCandidates: provider.keyGroupCandidates.map(row => row.id === plan.candidateId ? pending(row) : row) })]);
    return finish('跟踪渠道候选测试', [update('endpoints', endpoint.id, { [field]: updated, candidateConfiguration: pending(endpoint.candidateConfiguration) })]);
  }
  const batch = data.batch, job = jobs.find(row => row.operationId === data.operationId && row.candidateId === data.candidateId && row.endpointId === endpoint.id);
  if (!job || !job.batchId || batch?.id !== job.batchId || batch.channelId !== job.serverChannelId || batch.signature !== job.serverSignature || batch.providerId !== provider.id || !['completed', 'cancelled', 'interrupted'].includes(batch.status) || !Array.isArray(batch.items)) throw new Error('候选回执不属于已知的已完成任务');
  if (job.keyId && batch.credentialId !== job.serverCredentialId) throw new Error('回执密钥与原提交不一致');
  if (job.receivedAt) return finish('候选测试结果已记录', []);
  const expected = job.request.models;
  if (batch.items.length !== expected.length || new Set(batch.items.map(item => item.model?.associationId)).size !== expected.length) throw new Error('候选回执的模型集合与提交不一致');
  let plan;
  try { plan = candidateTestPlan(state, { ...data, keyId: job.keyId, expectedRevision: endpoint.configurationRevision || 0, expectedGroupVersion: provider.keyGroupRevisions?.[job.groupId] || 0 }); } catch { /* An old job remains history and cannot qualify a changed candidate. */ }
  const at = new Date().toISOString();
  const records = batch.items.map(item => {
    const submitted = expected.find(model => model.associationId === item.model?.associationId);
    if (!submitted || ['id', 'associationId', 'upstreamModelId', 'type', 'check', 'dimensions'].some(key => submitted[key] !== item.model[key]) || (submitted.probe || submitted.type) !== item.model.probe || typeof item.id !== 'string' || !item.id || item.id.length > 120) throw new Error('候选回执模型身份或记录 ID 不匹配');
    const known = plan?.records.find(row => row.associationId === submitted.associationId);
    const current = plan?.candidateId === job.candidateId && plan.signature === job.signature && known?.signature === job.associationSignatures[submitted.associationId] && item.current !== false;
    const result = ({ passed: '通过', failed: '失败', cancelled: '已取消', unknown: '结果未知' })[item.status] || '结果未知';
    const mock = batch.source === 'mock';
    if (result === '通过' && (item.evidenceSource !== (mock ? 'mock' : 'real') || !Number.isFinite(Date.parse(item.endedAt)))) throw new Error('候选通过证据必须来自已完成的对应测试任务');
    return { id: item.id, candidateId: job.candidateId, signature: job.associationSignatures[submitted.associationId], current, source: mock ? 'mock' : 'server-receipt', simulated: mock, ...channelTestDiagnostics({ providerId: provider.id, endpointId: endpoint.id, associationId: submitted.associationId, operator: job.operator, configurationRevision: job.configurationRevision, serverChannelId: job.serverChannelId }, batch, item), ...(job.keyId ? { credentialId: job.keyId, credentialIds: [job.keyId], serverCredentialId: job.serverCredentialId } : {}) };
  });
  const received = jobs.map(row => row.operationId === job.operationId ? { ...row, receivedAt: at, status: batch.status } : row), usable = records.filter(row => row.current);
  const completed = candidate => ({ ...candidate, tests: [...candidate.tests, ...usable], pendingTests: (candidate.pendingTests || []).filter(row => row.operationId !== job.operationId) });
  if (group) return finish('记录密钥组候选测试结果', [update('providers', provider.id, { [field]: received, keyGroupTests: [...(provider.keyGroupTests || []), ...records], keyGroupCandidates: (provider.keyGroupCandidates || []).map(row => row.id === job.candidateId ? completed(row) : row) })]);
  const candidate = endpoint.candidateConfiguration;
  return finish('记录渠道候选测试结果', [update('endpoints', endpoint.id, { [field]: received, configurationTests: [...(endpoint.configurationTests || []), ...records], ...(candidate?.id === job.candidateId ? { candidateConfiguration: completed(candidate) } : {}) })]);
}
export function keyGroupCandidateStatus(state, providerId, groupId, options) {
  const provider = state.providers.find(row => row.id === providerId), candidate = provider?.keyGroupCandidates?.find(row => row.groupId === groupId);
  if (!candidate) return { ready: false, checks: [], reason: '尚未创建密钥组候选' };
  let current;
  try { current = keyGroupContext(state, { providerId, groupId, expectedGroupVersion: provider.keyGroupRevisions?.[groupId] || 0, candidateId: candidate.id }); }
  catch (error) { return { ready: false, checks: [], reason: error.message }; }
  const projected = projectedKeyGroup(state, provider, candidate);
  const checks = current.endpoints.map(endpoint => {
    const single = { ...candidate, config: candidate.configs[endpoint.id], impactRevision: candidate.impactRevisions[endpoint.id], tests: candidate.tests.filter(row => row.endpointId === endpoint.id) };
    const status = candidateChecks(projected.state, projected.provider, endpoint, single, { ...options, requireReal: options?.requireReal || candidate.requireReal === true });
    return { endpointId: endpoint.id, ...status, ready: !status.impact.mappings.length ? !status.credentialError : status.ready };
  });
  return { ready: checks.every(row => row.ready), checks };
}
function keyGroupTransaction(state, operation, data) {
  const saving = operation === 'keyGroupCandidateSave' || operation === 'keyGroupCandidateRollback';
  const { provider, group, endpoints, revision, signature, candidate } = keyGroupContext(state, data, !saving);
  if (saving) {
    let keyId = data.keyId;
    if (operation === 'keyGroupCandidateRollback') {
      const version = provider.keyGroupVersions?.find(row => row.groupId === group.id && row.version === data.targetVersion);
      if (!version || data.targetVersion === revision) throw new Error('请选择其他密钥组历史版本');
      keyId = version.keyIds[0];
    }
    const key = provider.apiKeys?.find(row => row.id === keyId && group.keyIds.includes(row.id));
    if (!key || key.status === 'disabled' || key.revokedAt) throw new Error('请选择组内可用且未撤销的主要密钥');
    const configs = Object.fromEntries(endpoints.map(endpoint => [endpoint.id, { ...snapshot(endpoint), credentialVersion: uid('credential-version') }]));
    const next = { id: uid('key-group-candidate'), groupId: group.id, keyIds: [key.id, ...group.keyIds.filter(id => id !== key.id)], baseSignature: signature, baseRevision: revision, configs, impactRevisions: Object.fromEntries(endpoints.map(endpoint => [endpoint.id, channelChangeImpact(state, provider.id, endpoint.id).revision])), tests: [], createdAt: new Date().toISOString(), ...(operation === 'keyGroupCandidateRollback' ? { rollbackOf: data.targetVersion } : {}) };
    return { type: 'batch', objectId: group.id, label: '保存密钥组候选配置', changes: [update('providers', provider.id, { keyGroupCandidates: [...(provider.keyGroupCandidates || []).filter(row => row.groupId !== group.id), next] })] };
  }
  if (operation === 'keyGroupCandidateDiscard') return { type: 'batch', objectId: group.id, label: '放弃密钥组候选配置', changes: [update('providers', provider.id, { keyGroupCandidates: provider.keyGroupCandidates.filter(row => row.groupId !== group.id) })] };
  const projected = projectedKeyGroup(state, provider, candidate);
  if (operation === 'keyGroupCandidateTest') {
    for (const endpoint of endpoints) assertCandidateImpact(state, provider, endpoint, candidate.impactRevisions[endpoint.id]);
    const ids = data.endpointIds || endpoints.map(row => row.id);
    if (!Array.isArray(ids) || !ids.length || ids.length > 50 || new Set(ids).size !== ids.length || ids.some(id => !endpoints.some(row => row.id === id))) throw new Error('请选择 1–50 个当前密钥组引用渠道');
    const records = ids.flatMap(id => {
      const endpoint = endpoints.find(row => row.id === id);
      if (!supplierChannelAssociations(state, provider, id).length) return [];
      const tested = testedCandidate(projected.state, projected.provider, endpoint, { ...candidate, config: candidate.configs[id], impactRevision: candidate.impactRevisions[id], tests: [] }, { scenarios: data.scenarios });
      return tested.tests;
    });
    const next = { ...candidate, tests: [...candidate.tests, ...records] };
    return { type: 'batch', objectId: candidate.id, label: '测试密钥组全部引用渠道', changes: [update('providers', provider.id, { keyGroupCandidates: provider.keyGroupCandidates.map(row => row.groupId === group.id ? next : row), keyGroupTests: [...(provider.keyGroupTests || []), ...records] })] };
  }
  if (operation !== 'keyGroupCandidateApply') throw new Error('未知密钥组候选操作');
  if (data.confirmed !== true) throw new Error('请确认密钥组全部引用渠道的原子切换');
  const status = keyGroupCandidateStatus(state, provider.id, group.id, { requireReal: data.requireReal === true });
  if (!status.ready) throw new Error(status.reason || status.checks.find(row => !row.ready)?.credentialError || '密钥组引用渠道尚未全部测试通过');
  const changes = [];
  let working = projected.state;
  for (const endpoint of endpoints) {
    if (channelChangeImpact(state, provider.id, endpoint.id).revision !== candidate.impactRevisions[endpoint.id]) throw new Error('密钥组关联模型或服务引用已变化，请重新检查影响');
    const single = { ...candidate, config: candidate.configs[endpoint.id], impactRevision: candidate.impactRevisions[endpoint.id], tests: candidate.tests.filter(row => row.endpointId === endpoint.id) };
    const updates = supplierChannelAssociations(state, provider, endpoint.id).length ? appliedCandidate(working, working.providers.find(row => row.id === provider.id), endpoint, single, data) : [update('endpoints', endpoint.id, { ...single.config, configurationRevision: (endpoint.configurationRevision || 0) + 1, connectionTest: null })];
    for (const change of updates) working = { ...working, [change.collection]: working[change.collection].map(row => row.id === change.id ? { ...row, ...change.changes } : row) };
    changes.push(...updates);
  }
  const at = new Date().toISOString(), versions = [...(provider.keyGroupVersions || [])];
  if (!versions.some(row => row.groupId === group.id)) versions.push({ groupId: group.id, version: revision, keyIds: [...group.keyIds], appliedAt: provider.updatedAt || at });
  versions.push({ groupId: group.id, version: revision + 1, keyIds: [...candidate.keyIds], appliedAt: at, candidateId: candidate.id, rollbackOf: candidate.rollbackOf ?? null, evidenceIds: candidate.tests.map(row => row.id) });
  changes.push(update('providers', provider.id, { apiKeyGroups: projected.provider.apiKeyGroups, ...(group.id === 'default' ? { defaultApiKeyId: candidate.keyIds[0] } : {}), keyGroupRevisions: { ...provider.keyGroupRevisions, [group.id]: revision + 1 }, keyGroupVersions: versions, keyGroupCandidates: provider.keyGroupCandidates.filter(row => row.groupId !== group.id) }));
  return { type: 'batch', objectId: group.id, label: '原子应用密钥组配置', changes };
}

function procurementTransaction(state, operation, data) {
  if (operation !== 'channelProcurementPublish') throw new Error('未知采购价版本操作');
  const { provider, endpoint } = context(state, data.providerId, data.endpointId);
  const projected = supplierChannelAssociations(state, provider, endpoint.id).find(row => row.id === data.associationId);
  if (!projected) throw new Error('采购报价不属于当前模型渠道');
  const entries = provider.catalogConnections || [];
  const saved = entries.find(row => !row.deletedAt && row.endpointId === endpoint.id && (row.id === projected.id || !row.id && row.modelId === projected.modelId));
  const association = saved?.id ? { ...saved } : { ...saved, id: projected.id, modelId: projected.modelId, endpointId: endpoint.id, upstreamModelId: projected.upstreamModelId };
  if (!Object.hasOwn(association, 'pricing')) {
    association.pricing = channelAssociationPricing(state, projected);
  }
  if (data.expectedPriceRevision !== (association.procurementRevision || 0)) throw new Error('采购报价已有修订，请重新载入');
  const at = new Date().toISOString();
  let versions = structuredClone(association.procurementVersions || [{ id: `baseline-${association.id}`, version: 0, pricing: structuredClone(association.pricing), status: '已发布', effectiveAt: association.updatedAt || endpoint.createdAt || new Date(0).toISOString(), publishedAt: association.updatedAt || endpoint.createdAt || new Date(0).toISOString(), expiresAt: null }]);
  if (data.confirmed !== true) throw new Error('请确认发布采购价');
  const pricing = normalizeProviderPrice(provider, { modelId: association.modelId, discountFactor: '1', scenarios: data.scenarios });
  const effectiveAt = data.effectiveAt || at, expiresAt = data.expiresAt || null;
  if (!Number.isFinite(Date.parse(effectiveAt)) || expiresAt && (!Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.parse(effectiveAt))) throw new Error('请填写有效的采购价生效和到期时间');
  if (!pricing.scenarios.length || pricing.scenarios.some(row => row.listPrice == null)) throw new Error('请补齐采购计费项，免费请明确填写 0');
  if (expiresAt && Date.parse(expiresAt) <= Date.parse(at)) throw new Error('采购价已经到期，不能发布');
  versions.push({ id: uid('procurement'), version: Math.max(...versions.map(row => row.version)) + 1, pricing, effectiveAt, expiresAt, status: '已发布', createdAt: at, publishedAt: at });
  const next = { ...association, procurementVersions: versions, procurementRevision: (association.procurementRevision || 0) + 1 };
  const active = activeChannelProcurement(next);
  if (active) next.pricing = structuredClone(active.pricing);
  const catalogConnections = saved ? entries.map(row => row === saved ? next : row) : [...entries, next];
  return { type: 'batch', objectId: association.id, label: '发布采购价版本', changes: [update('providers', provider.id, { catalogConnections })] };
}

function stageCredentialChanges(state, changes) {
  let next = structuredClone(state);
  for (const change of changes) {
    if (change.type !== 'update') throw new Error('密钥候选只能更新现有供应商和渠道');
    next[change.collection] = next[change.collection].map(row => row.id === change.id ? { ...row, ...structuredClone(change.changes) } : row);
  }
  return next;
}
function checkedNewCredential(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['maskedKey', 'fingerprint', 'accountRpm'].includes(key))) throw new Error('新密钥只能提交掩码、指纹和账号上限');
  return value;
}
export function keyGroupRotationSignature(state, providerId, groupId) {
  const provider = state.providers.find(row => row.id === providerId);
  const current = keyGroupContext(state, { providerId, groupId, expectedGroupVersion: provider?.keyGroupRevisions?.[groupId] || 0 }, false);
  return JSON.stringify([current.signature, current.endpoints.map(endpoint => [endpoint.id, channelChangeImpact(state, providerId, endpoint.id).revision])]);
}
function prepareCredentialCandidate(state, operation, data) {
  const provider = state.providers.find(row => row.id === data.providerId);
  if (!provider || provider.deletedAt) throw new Error('供应商已不存在');
  checkedNewCredential(data.newApiKey);
  let groupId = data.groupId, endpoint, working = state;
  const changes = [];
  if (operation === 'channelCandidateCredentialPrepare') {
    endpoint = context(state, provider.id, data.endpointId).endpoint;
    expectedRevision(endpoint, data.expectedRevision);
    if (data.expectedImpactRevision !== channelChangeImpact(state, provider.id, endpoint.id).revision) throw new Error('渠道模型或服务引用已变化，请重新核对替换范围');
    const key = connectionKeys(endpoint, provider, true)[0];
    if ((data.expectedKeyId || '') !== (key?.id || '') || (data.expectedFingerprint || '') !== (key?.fingerprint || '')) throw new Error('渠道当前密钥或绑定范围已变化，请重新打开');
    groupId = key && providerKeyGroups(provider).find(group => group.keyIds.includes(key.id))?.id;
    if (!groupId) {
      const names = new Set(providerKeyGroups(provider).map(group => group.name));
      let name = '渠道专属密钥 ' + endpoint.id.slice(-8), suffix = 2;
      while (names.has(name)) name = '渠道专属密钥 ' + endpoint.id.slice(-8) + ' ' + suffix++;
      const created = providerTransaction(state, { operation: 'keyGroupSave', objectId: provider.id, data: { name } });
      changes.push(...created.changes); working = stageCredentialChanges(state, changes);
      groupId = working.providers.find(row => row.id === provider.id).apiKeyGroups.find(group => group.name === name).id;
    }
  } else {
    keyGroupContext(state, data, false);
    if (data.expectedScope !== keyGroupRotationSignature(state, provider.id, groupId)) throw new Error('密钥组引用范围或凭证已变化，请重新打开');
  }
  const added = providerTransaction(working, { operation: 'addApiKeys', objectId: provider.id, data: { groupId, apiKeys: [data.newApiKey] } });
  const next = stageCredentialChanges(working, added.changes), owner = next.providers.find(row => row.id === provider.id), key = owner.apiKeys.find(row => row.fingerprint === data.newApiKey.fingerprint);
  const prepared = operation === 'channelCandidateCredentialPrepare'
    ? channelChangeTransaction(next, { operation: 'channelCandidateSave', data: { providerId: provider.id, endpointId: endpoint.id, expectedRevision: data.expectedRevision, config: { ...data.config, authMode: 'specific', apiKeyId: key.id } } })
    : keyGroupTransaction(next, 'keyGroupCandidateSave', { ...data, keyId: key.id });
  return { type: 'batch', objectId: prepared.objectId, label: '准备新密钥候选', changes: [...changes, ...added.changes, ...prepared.changes] };
}

export function channelChangeTransaction(state, { operation, data = {} }) {
  if (['channelCandidateCredentialPrepare', 'keyGroupCandidatePrepare'].includes(operation)) return prepareCredentialCandidate(state, operation, data);
  if (/^(channel|keyGroup)CandidateTest(Job|Receipt)$/.test(operation)) return candidateReceiptTransaction(state, operation, data);
  if (operation.startsWith('keyGroupCandidate')) return keyGroupTransaction(state, operation, data);
  if (operation.startsWith('channelProcurement')) return procurementTransaction(state, operation, data);
  if (operation === 'credentialEmergencyRevoke') {
    const provider = state.providers.find(row => row.id === data.providerId);
    const key = provider?.apiKeys?.find(row => row.id === data.keyId);
    if (!key || key.fingerprint !== data.expectedFingerprint) throw new Error('密钥已变化或不属于当前供应商');
    if (data.confirmed !== true) throw new Error('请确认紧急撤销密钥及其全部调用影响');
    const affected = supplierKeyChannels(state, provider, key.id).map(row => row.id), at = new Date().toISOString();
    return { type: 'batch', objectId: key.id, label: '紧急撤销供应凭证', changes: [update('providers', provider.id, { apiKeys: provider.apiKeys.map(row => row.id === key.id ? { ...row, status: 'disabled', revokedAt: at } : row) }), ...invalidateSupplierChannels(state, provider, affected)] };
  }
  if (operation === 'channelCandidateSave' || operation === 'channelCandidateRollback') {
    const { provider, endpoint } = context(state, data.providerId, data.endpointId);
    expectedRevision(endpoint, data.expectedRevision);
    let config = data.config;
    const existing = endpoint.candidateConfiguration;
    if (operation === 'channelCandidateSave' && existing?.baseSignature === configSignature(endpoint, provider) && config && typeof config === 'object' && !Array.isArray(config)) config = { ...Object.fromEntries(editableFields.filter(key => Object.hasOwn(existing.config, key)).map(key => [key, existing.config[key]])), ...config };
    if (operation === 'channelCandidateRollback') {
      const version = endpoint.configurationVersions?.find(row => row.version === data.targetVersion);
      if (!version || data.targetVersion === (endpoint.configurationRevision || 0)) throw new Error('请选择已有的其他配置版本');
      config = Object.fromEntries(editableFields.filter(key => Object.hasOwn(version.config, key)).map(key => [key, version.config[key]]));
    }
    const prepared = configuredEndpoint(state, provider, endpoint, config);
    const candidate = { id: uid('channel-candidate'), baseRevision: endpoint.configurationRevision || 0, baseSignature: configSignature(endpoint, provider), impactRevision: channelChangeImpact(state, provider.id, endpoint.id).revision, config: prepared, tests: [], createdAt: new Date().toISOString(), ...(operation === 'channelCandidateRollback' ? { rollbackOf: data.targetVersion } : {}) };
    return { type: 'batch', objectId: endpoint.id, label: operation === 'channelCandidateRollback' ? '准备配置回滚并重新测试' : '保存候选配置', changes: [update('endpoints', endpoint.id, { candidateConfiguration: candidate })] };
  }
  const { provider, endpoint, candidate } = candidateContext(state, data);
  if (operation === 'channelCandidateTest') {
    const tested = testedCandidate(state, provider, endpoint, candidate, data);
    return { type: 'batch', objectId: candidate.id, label: '测试候选配置', changes: [update('endpoints', endpoint.id, { candidateConfiguration: tested, configurationTests: [...(endpoint.configurationTests || []), ...tested.tests.slice(candidate.tests.length)] })] };
  }
  if (operation === 'channelCandidateDiscard') return { type: 'batch', objectId: endpoint.id, label: '放弃候选配置', changes: [update('endpoints', endpoint.id, { candidateConfiguration: null })] };
  if (operation === 'channelCandidateApply') return { type: 'batch', objectId: endpoint.id, label: '应用已验证候选配置', changes: appliedCandidate(state, provider, endpoint, candidate, data) };
  throw new Error('未知渠道变更操作');
}
