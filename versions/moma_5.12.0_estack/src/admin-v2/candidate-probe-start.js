import { candidateTestPlan } from './channel-change-management.js';
import { channelTestModels } from './channel-test-jobs.js';
import { channelTestUsageAuthorized } from './channel-test-authorization.js';
import { prepareCandidateTest } from './candidate-tests.js';

const requestIdentity = request => JSON.stringify([request?.operationId, request?.channelId, request?.confirmExpensive === true, request?.models?.map(model => Object.entries(model).sort(([left], [right]) => left.localeCompare(right)))]);

export const candidateProbeResultCurrent = (context, job, pendingEdits = false) => Boolean(!pendingEdits && context.candidateId && job?.candidateId === context.candidateId && job.providerId === context.providerId && job.endpointId === context.endpointId);

export async function prepareAuthorizedCandidateProbe(state, context, options, { records, beforeTest, consent, explicitBasicClick } = {}) {
  const models = channelTestModels(records || candidateTestPlan(state, context).records, options);
  if (!channelTestUsageAuthorized(models, { check: options.check, consent, explicitBasicClick })) throw new Error('请明确授权当前候选测试产生用量');
  const prepared = beforeTest ? await beforeTest() : { state, context };
  if (!prepared) return null;
  const job = await prepareCandidateTest(prepared.state, prepared.context, options);
  if (JSON.stringify(job.data.request.models) !== JSON.stringify(models)) throw new Error('候选测试模型范围已变化，请重新核对后测试');
  return job;
}

export function candidateProbeResumeIssue(state, context, job) {
  try {
    const owner = context.groupId ? state.providers.find(row => row.id === context.providerId) : state.endpoints.find(row => row.id === context.endpointId);
    const stored = owner?.[context.groupId ? 'keyGroupTestJobs' : 'candidateTestJobs']?.find(row => row.operationId === job?.operationId);
    if (!stored?.request || stored.candidateId !== context.candidateId || stored.candidateId !== job.candidateId || requestIdentity(stored.request) !== requestIdentity(job.request)) return '原候选提交已变化，不能继续派发';
    const plan = candidateTestPlan(state, context);
    if (stored.signature !== plan.signature || stored.request.models.some(model => !plan.records.some(row => row.associationId === model.associationId && row.signature === stored.associationSignatures?.[model.associationId]))) return '候选配置、凭证或模型已变化，不能继续原提交';
    return '';
  } catch (error) { return error.message; }
}
