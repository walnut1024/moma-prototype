import { modelOperationsView } from './mock/model-data.js';
import { isServiceShowcase } from './admin-v2/service-showcase.js';
import { libraryRecord } from './admin-v2/model-library.js';
import { AUTH_DATA_KEY, readLinkedState, resolveUserIdentity, serviceReferences, serviceAccess, accessError } from './service-access.mjs';
import { getMockServiceSnapshots, mockServiceReadiness } from './admin-v2/mock-onboarding-service.js';
import { connectionKeys } from './admin-v2/connection-state.js';
import { serviceGuideRequest } from './admin-v2/service-guide.js';
import { MODEL_CATEGORIES, modelCategory } from './admin-v2/model-management.js';
import { IDENTITY_FIELDS, TECHNICAL_FIELDS, INTERFACE_FIELDS, FEATURE_FIELDS, ARCHITECTURE_OPTIONS, LICENSE_OPTIONS, specificationFields, normalizeModelLogo, modelProfileDraft } from './admin-v2/model-profile.js';

function presentation(model) {
  const profile = modelProfileDraft(model), support = value => value == null ? '' : value ? '支持' : '暂无';
  const facts = descriptors => descriptors.map(({ key, label, kind, unit }) => {
    const value = profile[key], choices = kind === 'architecture' ? ARCHITECTURE_OPTIONS : kind === 'license' ? LICENSE_OPTIONS : kind === 'lifecycle' ? [['stable', '稳定版'], ['preview', '预览版'], ['deprecated', '已退役']] : [];
    return { label, value: value == null || value === '' || value === 'unknown' ? '' : kind === 'support' ? (value === 'supported' ? '支持' : '暂无') : Array.isArray(value) ? value.join('、') : (choices.find(([id]) => id === value)?.[1] || String(value)) + (unit ? ` ${unit}` : '') };
  }).filter(row => row.value !== '');
  let logo = ''; try { if (profile.logo) logo = normalizeModelLogo(profile.logo); } catch { /* Invalid stored images are not rendered. */ }
  const sections = [
    { title: '模型资料', facts: [...facts(IDENTITY_FIELDS.filter(row => !['retirementDate', 'replacement'].includes(row.key))), ...['scenarios', 'languages'].map((key, index) => ({ label: ['适用场景', '支持语言'][index], value: profile[key]?.join('、') || '' }))] },
    { title: '能力与规格', facts: [{ label: '最大输出', value: model.capabilities?.output == null ? '' : `${model.capabilities.output} Token` }, ...['streaming', 'tools'].map((key, index) => ({ label: ['流式响应', '工具调用'][index], value: support(model.capabilities?.[key]) })), ...facts(FEATURE_FIELDS.filter(row => ['text', 'multimodal'].includes(model.type) || row.key === 'batch')), ...facts(specificationFields(model.type, model.usageUnit, profile))] },
    { title: '技术与接口', facts: facts([...TECHNICAL_FIELDS.filter(row => row.key !== 'knowledgeCutoff'), ...INTERFACE_FIELDS]) },
  ].map(section => ({ ...section, facts: section.facts.filter(row => row.value !== '') })).filter(section => section.facts.length);
  return { logo, modelId: model.modelId || '', typeLabel: MODEL_CATEGORIES[modelCategory(model.type)] || '', detailDescription: profile.detailDescription || '', detailSections: sections, releaseDate: profile.releaseDate || '' };
}

export function experienceTasks(model) {
  const tasks = model.profile?.tasks || [], inputs = model.profile?.inputModalities || [], outputs = model.profile?.outputModalities || [];
  return [
    inputs.includes('文本') && outputs.includes('文本') && tasks.some(task => ['对话', '文本生成', '代码生成', '图像理解'].includes(task)) && 'text',
    tasks.includes('文生图') && 'image',
    tasks.includes('文生视频') && 'video',
    tasks.includes('语音识别') && 'voice',
  ].filter(Boolean);
}
export function cloudMarketPresentation(offer) {
  const profile=offer.profile || {}, inputs=profile.inputModalities || [], outputs=profile.outputModalities || [];
  return {...presentation(offer),...offer,desc:offer.description,context:offer.capabilities?.context ? Math.round(offer.capabilities.context/1024)+'K' : '未填写',
    contextTokens:offer.capabilities?.context ?? null,series:profile.family || '',input:inputs,outputModalities:outputs,
    businessTasks:profile.tasks || [],tasks:experienceTasks(offer),inputModalities:inputs.map(item=>({文本:'text',图片:'image',音频:'audio',视频:'video'}[item] || item)),
    output:offer.capabilities?.output ?? '未填写',icon:1,billing:'按量计费',reason:offer.callable ? '' : '请先订购此模型服务',documentation:profile.documentation || '',
    date:profile.releaseDate || '',guideRequest:serviceGuideRequest(offer,offer.callId)};
}

export function marketModels(services, scope = 'showcase') {
  const rows = services.filter(row => row.marketVisible !== false && (scope === 'all' || row.defaultCatalogue !== false));
  const groups = new Map();
  for (const row of rows) {
    const group = groups.get(row.modelKey);
    if (group) group.services.push(row);
    else groups.set(row.modelKey, { ...row, services: [row] });
  }
  return [...groups.values()].map(row => ({ ...row, providers: row.services.map(service => service.provider), provider: row.services.map(service => service.provider).join('、'), callable: row.services.some(service => service.callable) }));
}
export function customerPriceRows(prices, at = Date.now()) {
  const labels = { million_input_tokens: ['输入 Token', '百万 Token'], million_output_tokens: ['输出 Token', '百万 Token'], million_tokens: ['总 Token', '百万 Token'], request: ['请求数', '次'], second: ['时长', '秒'], character: ['字符数', '字符'] };
  return prices.filter(row => Number.isSafeInteger(row.amount) && row.amount >= 0 && labels[row.unit] && Date.parse(row.effectiveAt) <= at && (!row.expiresAt || Date.parse(row.expiresAt) > at)).map(row => ({ name: labels[row.unit][0], unit: labels[row.unit][1], amount: row.amount / 1000000, currency: row.currency }));
}
export function directorySnapshot(storage = globalThis.localStorage) {
  const state = readLinkedState(storage), auth = JSON.parse(storage.getItem(AUTH_DATA_KEY) || 'null');
  let identity = null, identityError = '';
  try { identity = resolveUserIdentity(state, auth); } catch (error) { identityError = error.message; }
  const published = getMockServiceSnapshots();
  const defaultModelIds = new Set(modelOperationsView(state).models.map(row=>row.id));
  const models = serviceReferences(state).flatMap(service => {
    if (service.providerId && service.model.serviceProviders.find(row=>row.providerId===service.providerId)?.marketVisible===false) return [];
    const material = libraryRecord(state, service.model.id);
    const model = { ...material, ...service.model, profile: { ...material?.profile, ...service.model.profile } };
    if (model.listingStatus !== '已上架' || model.visibility !== '公开' || model.callsEnabled !== true) return [];
    const proofs = (model.platformPublications || []).filter(row => row.serviceId === service.id && row.source === 'mock');
    const live = proofs.length === 1 && published.find(row => row.id === proofs[0].mockServiceId);
    if (!identity && (auth?.currentUserId || model.releaseStage==='gray')) return [];
    let access = identity ? serviceAccess(state, service, identity.tenantId, live) : { allowed: false, reason: identityError };
    if (access.code === 'model_forbidden' || access.code === 'customer_unavailable') return [];
    if (access.allowed) access = mockServiceReadiness(state, live);
    const tasks = experienceTasks(model), supplier = service.providerId ? state.providers?.find(row => row.id === service.providerId)?.name : '平台统一模型服务模式';
    return [{ ...presentation(model), modelKey: model.id, marketVisible: model.marketVisible !== false, mode: model.serviceMode, showcase: isServiceShowcase(model), defaultCatalogue: defaultModelIds.has(model.id), guideRequest: serviceGuideRequest(model, service.callId, service.providerId), id: service.id, callId: service.callId, name: model.name, type: model.type === 'audio' ? 'voice' : model.type, provider: supplier || '未配置', maker: model.profile?.author || model.maker || '未填写', desc: model.description || '', description: model.description || '', context: model.capabilities?.context ? `${Math.round(model.capabilities.context / 1024)}K` : '未填写', contextTokens: model.capabilities?.context ?? null, date: model.updatedAt?.slice(0,10) || '', series: model.profile?.family || '', input: (model.profile?.inputModalities || []).map(item => item === '图片' ? '图像' : item), outputModalities: [...new Set([...(model.profile?.outputModalities || []), ...(model.profile?.resultTypes || [])])].map(item => item === '图片' ? '图像' : item), businessTasks: model.profile?.tasks || [], output: model.capabilities?.output ?? '未填写', tags: model.tags || [], tasks, inputModalities: (model.profile?.inputModalities || []).map(item => ({ 文本: 'text', 图片: 'image', 音频: 'audio', 视频: 'video' }[item] || item)), documentation: model.profile?.documentation || '', billing: '按量计费', salePrices: live?.published?.config.salePrices?.map(({ amount, currency, unit, effectiveAt, expiresAt }) => ({ amount, currency, unit, effectiveAt, expiresAt })) || [], icon: 1, callable: access.allowed && tasks.length > 0, reason: access.reason || (tasks.length ? '' : '当前任务暂无在线体验入口'), generation: model.accessGeneration || 0 }];
  });
  return { models, identity, identityError, error: '' };
}
export function beginExperience(serviceId, task, { images = false } = {}) {
  const snapshot = directorySnapshot();
  if (!snapshot.identity) throw accessError('identity_unavailable', snapshot.identityError);
  const model = snapshot.models.find(row => row.id === serviceId);
  if (!model?.callable) throw accessError('model_unavailable', model?.reason || '模型服务已不可用，请重新选择');
  if (!model.tasks.includes(task) || images && !model.inputModalities.includes('image')) throw accessError('task_unsupported', '所选模型不支持当前任务');
  const state = readLinkedState(), service = serviceReferences(state).find(row => row.id === serviceId);
  const proof = service.model.platformPublications.find(row => row.serviceId === serviceId && row.source === 'mock');
  const published = getMockServiceSnapshots().find(row => row.id === proof.mockServiceId);
  const credentials = published.published.config.bindings.flatMap(binding => {
    const supply = state.modelSupplies.find(row => row.id === binding.id), endpoint = state.endpoints.find(row => row.id === supply?.endpointId), provider = state.providers.find(row => row.id === endpoint?.providerId);
    return connectionKeys(endpoint, provider).map(key => ({ providerId: provider?.id, endpointId: endpoint.id, id: key.id, fingerprint: key.fingerprint }));
  });
  return { requestId:crypto.randomUUID(),startedAt:new Date().toISOString(), serviceId, callId:service.callId, modelId:service.modelId, task, images, modelName: model.name, owner: snapshot.identity.key, sessionGeneration: snapshot.identity.generation, requestGeneration: service.model.requestGeneration || 0, credentials };
}
export function validateExperience(ticket) {
  const state = readLinkedState(), auth = JSON.parse(globalThis.localStorage.getItem(AUTH_DATA_KEY) || 'null'), identity = resolveUserIdentity(state, auth);
  const service = serviceReferences(state).find(row => row.id === ticket.serviceId);
  if (identity.key !== ticket.owner || identity.generation !== ticket.sessionGeneration || !service || (service.model.requestGeneration || 0) !== ticket.requestGeneration) throw accessError('task_cancelled', '身份或服务权限已变化，本次任务已停止，请重新发送');
  const proof = service.model.platformPublications?.find(row => row.serviceId === service.id && row.source === 'mock'), published = getMockServiceSnapshots().find(row => row.id === proof?.mockServiceId);
  // Ordinary downlisting blocks admission; an admitted request keeps its original configuration.
  const admitted = service.model.lifecycleStopReason === 'operator' ? { ...service, model: { ...service.model, listingStatus: '已上架', visibility: '公开', callsEnabled: true } } : service;
  const access = serviceAccess(state, admitted, identity.tenantId, published);
  if (!access.allowed) throw accessError(access.code, access.reason);
  for (const original of ticket.credentials) {
    const provider = state.providers.find(row => row.id === original.providerId), endpoint = state.endpoints.find(row => row.id === original.endpointId);
    const key = provider?.apiKeys?.find(row => row.id === original.id) || endpoint?.apiKeys?.find(row => row.id === original.id);
    if (!key || key.revokedAt || key.status === 'disabled' || key.fingerprint !== original.fingerprint) throw accessError('credential_revoked', '本次请求的密钥已撤销或停用，任务已停止');
  }
  return true;
}
