import { platformCandidatePlan } from './platform-service-client.js';
import { platformPublicationServices } from './platform-publication-state.js';
import { assertMockModelPublication } from './mock-publication-gate.js';
import { connectionFingerprint } from './connection-state.js';
import { commitMockConfiguration, mockContext, setMockRuntimeState } from './mock-onboarding-service.js';

const changedEndpoints = (previous, next) => (previous.endpoints || []).flatMap(before => {
  const after = next.endpoints?.find(row => row.id === before.id && row.providerId === before.providerId && !row.deletedAt);
  return after && connectionFingerprint(before) !== connectionFingerprint(after) ? [{ before, after }] : [];
});

function appliedCandidate(previous, next, before, after) {
  const provider = previous.providers.find(row => row.id === before.providerId), current = next.providers.find(row => row.id === before.providerId);
  for (const candidate of provider?.keyGroupCandidates || []) {
    const revision = current?.keyGroupRevisions?.[candidate.groupId] || 0;
    const version = current?.keyGroupVersions?.find(row => row.groupId === candidate.groupId && row.version === revision && row.candidateId === candidate.id);
    if (version && revision > (provider.keyGroupRevisions?.[candidate.groupId] || 0) && candidate.configs[before.id]) return { id: candidate.id, scope: 'group', jobs: provider.keyGroupTestJobs || [] };
  }
  const candidate = before.candidateConfiguration;
  const version = after.configurationVersions?.find(row => row.version === after.configurationRevision && row.candidateId === candidate?.id);
  if (candidate && version && !after.candidateConfiguration && after.configurationRevision > (before.configurationRevision || 0)) return { id: candidate.id, scope: 'channels', jobs: before.candidateTestJobs || [] };
  return null;
}

export function planMockOnboardingSync(previous, next, snapshots) {
  const transitions = changedEndpoints(previous, next).map(({ before, after }) => {
    const candidate = appliedCandidate(previous, next, before, after);
    const source = snapshots.filter(row => row.providerId === before.providerId && row.clientChannelId === before.id && row.clientSignature === connectionFingerprint(before) && !row.supersededBy);
    const receivedIds = new Set((candidate?.jobs || []).filter(job => job.candidateId === candidate.id && job.endpointId === before.id && job.receivedAt).map(job => job.serverChannelId));
    const targets = candidate ? snapshots.filter(row => row.providerId === after.providerId && row.clientChannelId === after.id && row.clientSignature === connectionFingerprint(after) && receivedIds.has(row.id) && !row.supersededBy) : [];
    if (targets.length > 1) throw new Error('候选配置对应多个接入快照，请重新测试后应用');
    return { endpointId: before.id, candidateId: candidate?.id || null, scope: candidate?.scope || 'channels', source, target: targets[0] || null };
  }).filter(row => row.source.length);
  const groupIncomplete = transitions.some(row => row.scope === 'group' && !row.target);
  const replacements = [], unverifiedChannelIds = [];
  for (const transition of transitions) {
    if (transition.source.length > 1 && transition.target) throw new Error('当前配置对应多个未替换接入快照，请先核对供给引用');
    for (const source of transition.source) {
      if (transition.target && !groupIncomplete) replacements.push({ channelId: source.id, candidateChannelId: transition.target.id });
      else unverifiedChannelIds.push(source.id);
    }
  }
  return { scope: transitions.some(row => row.scope === 'group') ? 'group' : 'channels', replacements, unverifiedChannelIds, transitions: transitions.map(({ endpointId, candidateId, target }) => ({ endpointId, candidateId, candidateChannelId: target?.id || null })) };
}

export function prepareMockOnboardingSync(previous, next, action) {
  const {getMockChannelSnapshots,getMockServiceSnapshots,prepareMockConfiguration}=mockContext(previous);
  const commercialUpdates = [], publications = action?.operation==='guidedPublish' ? [{serviceId:action.data.mockServiceId,expectedRevision:action.data.expectedMockRevision,operationId:action.data.operationId}] : [];
  const snapshots = getMockServiceSnapshots();
  for (const model of next.models) {
    const before = previous.models.find(row => row.id === model.id);
    if (!before) continue;
    for (const [key, receipt] of Object.entries(model.commercialPublications || {})) {
      if (before.commercialPublications?.[key]?.version === receipt.version) continue;
      for (const service of platformPublicationServices(before).filter(row => receipt.kind === 'scope' || (row.providerId || '') === receipt.providerId)) {
        const snapshot = snapshots.find(row => row.published?.config.publicModelId === service.callId);
        if (!snapshot) { if(service.providerId && before.serviceProviders?.find(row=>row.providerId===service.providerId)?.pendingPublication)continue; if (before.listingStatus === '已上架') throw new Error('当前服务缺少有效发布配置，请先完成平台验证'); continue; }
        assertMockModelPublication(previous, before, service.id, true);
        const tenantIds = model.openScope === 'all' ? next.tenants.filter(row => ['正常', '需关注'].includes(row.status)).map(row => row.id) : model.tenantIds;
        const plan = platformCandidatePlan(next, model, { serviceId: service.id, tenantIds: receipt.kind === 'scope' ? tenantIds : snapshot.published.config.tenantIds, supplyIds: snapshot.published.config.bindings.map(row => row.id), technical:snapshot.published.config.technical===true,audioProbe: snapshot.published.config.bindings.find(row => row.model.type === 'audio')?.model.probe || '' });
        commercialUpdates.push({ serviceId: snapshot.id, ...(receipt.kind === 'scope' ? { tenantIds: plan.candidate.tenantIds } : { salePrices: plan.candidate.salePrices }) });
      }
    }
  }
  if (!changedEndpoints(previous, next).length && !commercialUpdates.length && !publications.length) return null;
  const plan = planMockOnboardingSync(previous, next, getMockChannelSnapshots());
  if (!plan.replacements.length && !plan.unverifiedChannelIds.length && !commercialUpdates.length && !publications.length) return null;
  return prepareMockConfiguration({ operationId: `local-sync-${next.audits?.[0]?.id || crypto.randomUUID()}`, scope: plan.scope, commercialUpdates, publications, replacements: plan.replacements, unverifiedChannelIds: plan.unverifiedChannelIds }, previous.cloudOperations === true);
}

export function commitMockOnboardingSync(prepared, next) {
  const result = prepared ? commitMockConfiguration(prepared) : null;
  setMockRuntimeState(next);
  return result;
}
