import { connectionFingerprint } from './connection-state.js';
import { commitMockConfiguration, getMockChannelSnapshots, prepareMockConfiguration, setMockRuntimeState } from './mock-onboarding-service.js';

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

export function prepareMockOnboardingSync(previous, next) {
  if (!changedEndpoints(previous, next).length) return null;
  const plan = planMockOnboardingSync(previous, next, getMockChannelSnapshots());
  if (!plan.replacements.length && !plan.unverifiedChannelIds.length) return null;
  return prepareMockConfiguration({ operationId: `local-sync-${next.audits?.[0]?.id || crypto.randomUUID()}`, scope: plan.scope, replacements: plan.replacements, unverifiedChannelIds: plan.unverifiedChannelIds });
}

export function commitMockOnboardingSync(prepared, next) {
  const result = prepared ? commitMockConfiguration(prepared) : null;
  setMockRuntimeState(next);
  return result;
}
