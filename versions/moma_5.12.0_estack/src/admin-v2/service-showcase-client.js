import { isServiceShowcase, SERVICE_SHOWCASE_MODELS } from './service-showcase.js';
import { libraryRecord } from './model-library.js';
import { connectionFingerprint } from './connection-state.js';
import { channelTestModels, channelTestRequest, channelBatchTerminal } from './channel-test-jobs.js';
import { prepareServerChannel, onboardingApi } from './onboarding-client.js';
import { platformAllowedChannels, platformCandidatePlan, runPlatformTrial, publishPlatformCandidate } from './platform-service-client.js';
import { routingServices } from './service-routing.js';
import { scopeTenants } from './service-commercial.js';
import { LINKED_USERS } from '../linked-accounts.mjs';
import { offerKey, providerOffer } from '../service-access.mjs';

// Developer-only fixture completion uses the same local API, receipts and publication gates as the UI.
export async function completeServiceShowcase(initial, save, { onProgress = () => {}, isCurrent = () => true } = {}) {
  let state = initial;
  const models = state.models.filter(isServiceShowcase);
  if (models.length !== SERVICE_SHOWCASE_MODELS.length) throw new Error('请先准备两个模型服务案例');
  const current = () => { if (!isCurrent(state)) throw new Error('配置或后台账号已变化，请刷新后重试'); };
  const commit = async (operation, data, modelId) => { current(); state = await save(state, { type: ['enableService','recordPlatformPublication'].includes(operation) ? 'modelOperation' : 'modelOperations', operation, data, modelId }); };
  const ids = new Set(models.map(row => row.id));
  const materialIds = new Set(models.map(row => libraryRecord(state,row.id)?.id));
  const endpointIds = new Set(routingServices(state).filter(row => ids.has(row.modelId)).flatMap(service => platformAllowedChannels(state, service).map(row => row.supply.endpointId)));
  for (const endpointId of endpointIds) {
    current();
    const endpoint = state.endpoints.find(row => row.id === endpointId), provider = state.providers.find(row => row.id === endpoint.providerId);
    const associations = provider.catalogConnections.filter(row => row.endpointId === endpointId && row.id.startsWith('showcase-association-') && materialIds.has(provider.catalogModels.find(entry => entry.modelId === row.modelId)?.libraryId));
    const records = associations.map(row => ({ associationId: row.id, modelId: provider.catalogModels.find(entry => entry.modelId === row.modelId).libraryId, upstreamModelId: row.upstreamModelId, type: 'text' }));
    const server = await prepareServerChannel(provider, endpoint);
    for (const check of ['', 'streaming']) {
      current(); onProgress(`${provider.name} · ${endpoint.name}：${check ? '流式响应' : '基础调用'}`);
      const request = channelTestRequest(server.id, channelTestModels(records, { check }), { check });
      const job = { providerId: provider.id, endpointId, operationId: request.operationId, serverChannelId: server.id, signature: connectionFingerprint(endpoint), associationIds: records.map(row => row.associationId), request, check };
      await commit('channelTestEvidenceJob', job);
      let batch = await onboardingApi('/tests', { method: 'POST', body: request });
      await commit('channelTestEvidenceJob', { ...job, batchId: batch.id });
      for (let attempt = 0; !channelBatchTerminal(batch) && attempt < 40; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 200)); current();
        batch = await onboardingApi(`/tests/${batch.id}`);
      }
      if (!channelBatchTerminal(batch)) throw new Error('渠道测试仍在进行，请在测试与启用中查询原任务');
      await commit('channelTestEvidenceReceipt', { providerId: provider.id, endpointId, batch });
      if (batch.items.some(row => row.status !== 'passed')) throw new Error(`${provider.name} · ${endpoint.name} 检查未通过，请查看测试结果`);
    }
  }
  const demoAccounts = ['zqzh', 'grzh'];
  const demoIds = state.tenants.some(tenant => demoAccounts.includes(tenant.id))
    ? demoAccounts
    : LINKED_USERS.map(user => user.tenantId);
  const demoTenantIds = scopeTenants(state).filter(tenant => demoIds.includes(tenant.id)).map(tenant => tenant.id);
  for (const id of ids) {
    const services = routingServices(state).filter(row => row.modelId === id);
    if (!services.length) throw new Error('服务模式或待发布服务已变化，请重新配置');
    const currentModel = () => state.models.find(row => row.id === id);
    for (const service of services) {
      current();
      const model = currentModel();
      if (!libraryRecord(state, id)) throw new Error('模型资料已变化');
      onProgress(`${model.name} · ${service.name}：平台试调用`);
      const plan = platformCandidatePlan(state, model, { serviceId: service.id, tenantIds: state.tenants.filter(row => !['已删除', '已停用', '停用'].includes(row.status)).map(row => row.id), supplyIds: platformAllowedChannels(state, service).map(row => row.id) });
      const trial = await runPlatformTrial(plan, { isCurrent: () => isCurrent(state) });
      if (!trial.result.billingReady) throw new Error('平台试调用费用未明确，不能发布');
      current(); const published = await publishPlatformCandidate(trial.service);
      await commit('recordPlatformPublication', { serviceId: service.id, mockServiceId: published.id, publishedVersion: published.published.version, expectedFingerprint: trial.publicationFingerprint }, id);
    }
    const saveRelease = (operation, data) => commit(operation, { ...data, expectedUpdatedAt: currentModel().updatedAt }, id);
    if (!currentModel().callsEnabled) await saveRelease('enableService', {});
    if (!currentModel().salesScope) {
      await saveRelease('salesSettings', { scope: { openScope: 'selected', tenantIds: demoTenantIds }, confirmed: true });
    }
    const model = currentModel();
    const offerKeys = model.serviceMode === 'provider'
      ? services.map(offerKey).filter(key => !providerOffer(model, key)?.listingStage)
      : undefined;
    if (offerKeys ? offerKeys.length : !model.releaseStage) {
      await saveRelease('startSales', { releaseStage: 'formal', confirmed: true, ...(offerKeys ? { offerKeys } : {}) });
    }
  }
  onProgress(models.every(row => state.models.find(model => model.id === row.id)?.listingStatus === '已上架')
    ? '两个案例已完成验证并上架'
    : '两个案例已完成验证，保留已有上架设置');
  return state;
}
