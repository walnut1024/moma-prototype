import { redactDiagnostic } from './channel-selection.js';

const summary = (value, max = 2000) => value == null ? null : String(redactDiagnostic(String(value))).slice(0, max);
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const version = value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : typeof value === 'string' ? summary(value, 120) : null;
function usageSummary(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const fields = ['input_tokens', 'output_tokens', 'total_tokens', 'prompt_tokens', 'completion_tokens', 'cached_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens', 'characters', 'images', 'audio_seconds', 'video_seconds'];
  const usage = Object.fromEntries(fields.filter(key => number(input[key]) != null).map(key => [key, input[key]]));
  return Object.keys(usage).length ? usage : null;
}
function costSummary(input) {
  if (typeof input === 'number') return number(input);
  if (!input || typeof input !== 'object' || number(input.amount) == null) return null;
  return { amount: input.amount, currency: summary(input.currency, 10), unit: summary(input.unit, 100), versionId: summary(input.versionId, 120) };
}

export function channelTestDiagnostics(context, batch, item) {
  const endedAt = timestamp(item.endedAt) || timestamp(batch.endedAt) || new Date().toISOString();
  const credentialId = summary(batch.credentialId, 120), status = number(item.upstreamStatus);
  const result = ({ passed: '通过', failed: '失败', cancelled: '已取消', unknown: '结果未知' })[item.status] || '结果未知';
  return {
    providerId: context.providerId, endpointId: context.endpointId, associationId: context.associationId,
    configurationRevision: context.configurationRevision ?? null, configVersion: version(batch.configVersion),
    credentialId, credentialIds: credentialId ? [credentialId] : [], credentialVersion: version(batch.credentialVersion), templateVersion: version(item.templateVersion),
    serverBatchId: batch.id, serverChannelId: context.serverChannelId || batch.channelId, serverSignature: summary(batch.signature, 10000),
    operator: context.operator || null, result, check: summary(item.model?.check || '', 100), task: summary(item.model?.probe || item.model?.type, 100),
    testedAt: endedAt, endedAt, startedAt: timestamp(item.startedAt) || timestamp(batch.startedAt), durationMs: number(item.durationMs), status, statusCode: status,
    message: summary(item.message || (result === '通过' ? '模型返回有效响应' : result)), code: summary(item.code || '', 100),
    traceId: summary(item.traceId || batch.id, 200), usage: usageSummary(item.usage), cost: costSummary(item.cost),
    taskId: summary(item.taskId, 120), stage: summary(item.stage, 100), suggestion: summary(item.suggestion), retryAfter: number(item.retryAfter), upstreamRequestId: summary(item.upstreamRequestId, 200),
  };
}
