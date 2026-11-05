import { candidateTestPlan } from './channel-change-management.js';
import { channelTestModels, channelTestRequest } from './channel-test-jobs.js';
import { onboardingApi, prepareServerChannel } from './onboarding-client.js';

export async function prepareCandidateTest(state, context, options = {}) {
  const plan = candidateTestPlan(state, context);
  const models = channelTestModels(plan.records, options);
  if (!models.length) throw new Error('请选择可测试的候选模型；高成本任务需要明确选择');
  const serverChannel = await prepareServerChannel(plan.provider, plan.endpoint, context.keyId);
  const request = channelTestRequest(serverChannel.id, models, options);
  return { operation: context.groupId ? 'keyGroupCandidateTestJob' : 'channelCandidateTestJob', data: { ...context, candidateId: plan.candidateId, signature: plan.signature, serverChannelId: serverChannel.id, ...(context.keyId ? { serverCredentialId: serverChannel.credentialId } : {}), serverSignature: serverChannel.signature, operationId: request.operationId, batchId: '', request } };
}

// Persist the prepared job before calling submit; lost responses are recovered by operationId.
export async function submitCandidateTest(job) {
  if (!job?.request || job.request.operationId !== job.operationId || job.request.channelId !== job.serverChannelId) throw new Error('原始候选测试请求缺失，不能派发');
  const batch = await onboardingApi('/tests', { method: 'POST', body: job.request });
  return { ...job, batchId: batch.id, batch };
}
export async function recoverCandidateTest(job) {
  if (!job?.operationId) throw new Error('缺少原候选提交操作 ID');
  return onboardingApi(job.batchId ? `/tests/${encodeURIComponent(job.batchId)}` : `/tests?operationId=${encodeURIComponent(job.operationId)}`);
}
export async function cancelCandidateTest(job) {
  if (!job?.batchId) throw new Error('请先查询原提交状态');
  return onboardingApi(`/tests/${encodeURIComponent(job.batchId)}/cancel`, { method: 'POST', body: { operationId: crypto.randomUUID() } });
}
export function candidateTestReceipt(job, batch) {
  return { operation: job.groupId ? 'keyGroupCandidateTestReceipt' : 'channelCandidateTestReceipt', data: { providerId: job.providerId, endpointId: job.endpointId, ...(job.groupId ? { groupId: job.groupId } : {}), candidateId: job.candidateId, operationId: job.operationId, batch } };
}
