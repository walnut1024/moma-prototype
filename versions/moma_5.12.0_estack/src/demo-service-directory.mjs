import { modelOperationsView } from './mock/model-data.js';
import { isServiceShowcase } from './admin-v2/service-showcase.js';
import { libraryRecord } from './admin-v2/model-library.js';
import { AUTH_DATA_KEY, readLinkedState, resolveUserIdentity, serviceReferences, serviceAccess, accessError } from './service-access.mjs';
import { getMockServiceSnapshots, mockServiceReadiness } from './admin-v2/mock-onboarding-service.js';
import { connectionKeys } from './admin-v2/connection-state.js';
import { MOMA_PROVIDER } from './admin-v2/moma-provider.js';
import { resourceId } from './resource-id.mjs';
import { modelPresentation } from './model-identities.mjs';
import { serviceGuideRequest } from './admin-v2/service-guide.js';
import { experienceTasks, servicePresentation } from './service-directory.mjs';

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
    const tasks = experienceTasks(model), supplier = service.providerId ? state.providers?.find(row => row.id === service.providerId)?.name : MOMA_PROVIDER.name;
    return [{ ...servicePresentation(model), modelKey: model.id, marketVisible: model.marketVisible !== false, showcase: isServiceShowcase(model), defaultCatalogue: defaultModelIds.has(model.id), guideRequest: serviceGuideRequest(model, service.callId, service.providerId), id: service.id, callId: service.callId, name: modelPresentation(state,model).name, type: model.type === 'audio' ? 'voice' : model.type, providerId: service.providerId || MOMA_PROVIDER.id, providerName: supplier || '未配置', provider: supplier || '未配置', maker: modelPresentation(state,model).profile?.author || modelPresentation(state,model).maker || '未填写', desc: modelPresentation(state,model).description || '', description: modelPresentation(state,model).description || '', context: model.capabilities?.context ? `${Math.round(model.capabilities.context / 1024)}K` : '未填写', contextTokens: model.capabilities?.context ?? null, date: model.updatedAt?.slice(0,10) || '', series: model.profile?.family || '', input: (model.profile?.inputModalities || []).map(item => item === '图片' ? '图像' : item), outputModalities: [...new Set([...(model.profile?.outputModalities || []), ...(model.profile?.resultTypes || [])])].map(item => item === '图片' ? '图像' : item), businessTasks: model.profile?.tasks || [], output: model.capabilities?.output ?? '未填写', tags: model.tags || [], tasks, inputModalities: (model.profile?.inputModalities || []).map(item => ({ 文本: 'text', 图片: 'image', 音频: 'audio', 视频: 'video' }[item] || item)), documentation: modelPresentation(state,model).profile?.documentation || '', billing: '按量计费', salePrices: live?.published?.config.salePrices?.map(({ amount, currency, unit, effectiveAt, expiresAt }) => ({ amount, currency, unit, effectiveAt, expiresAt })) || [], icon: 1, callable: access.allowed && tasks.length > 0, reason: access.reason || (tasks.length ? '' : '当前任务暂无在线体验入口'), generation: model.accessGeneration || 0 }];
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
  return { requestId:resourceId('request'),startedAt:new Date().toISOString(), serviceId, callId:service.callId, modelId:service.modelId, task, images, modelName: model.name, owner: snapshot.identity.key, sessionGeneration: snapshot.identity.generation, requestGeneration: service.model.requestGeneration || 0, credentials };
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
