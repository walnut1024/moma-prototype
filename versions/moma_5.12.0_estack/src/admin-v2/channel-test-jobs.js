export const CHANNEL_TEST_STATUS = { queued: '排队中', running: '测试中', passed: '通过', failed: '失败', unknown: '结果未知', cancelled: '已取消' };
export const channelBatchRunning = batch => Boolean(batch && ['queued', 'running'].includes(batch.status));
export const channelBatchTerminal = batch => Boolean(batch && ['completed', 'cancelled', 'interrupted'].includes(batch.status));
export const channelTestItem = (batch, associationId) => batch?.items?.find(item => item.model?.associationId === associationId);
export function channelBatchProgress(batch) {
  const counts = { queued: 0, running: 0, passed: 0, failed: 0, unknown: 0, cancelled: 0 };
  for (const item of batch?.items || []) counts[Object.hasOwn(counts, item.status) ? item.status : 'unknown']++;
  return counts;
}
export function recentChannelTestJob(jobs, associationIds) {
  const wanted = new Set(associationIds);
  return [...(jobs || [])].reverse().filter(job => job.associationIds?.some(id => wanted.has(id))).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0] || null;
}
export function channelTestModels(records, { check = '', expensiveIds = [], audioProbes = {}, plannedIds = null } = {}) {
  return records.filter(row => !plannedIds || plannedIds.includes(row.associationId)).flatMap(row => {
    if (!row.modelId || !row.upstreamModelId || !row.type) throw new Error('请先关联完整的模型资料');
    if (check && !['text', 'multimodal'].includes(row.type)) return [];
    const expensive = ['image', 'audio', 'video'].includes(row.type);
    if (expensive && !expensiveIds.includes(row.associationId)) return [];
    const probe = row.type === 'audio' ? audioProbes[row.associationId] : row.type;
    if (row.type === 'audio' && !['speech', 'transcription'].includes(probe)) throw new Error('请为已勾选语音模型选择识别或合成任务');
    return [{ id: row.modelId, associationId: row.associationId, upstreamModelId: row.upstreamModelId, type: row.type, ...(probe !== row.type ? { probe } : {}), ...(check ? { check } : {}) }];
  });
}
export function channelTestRequest(serverChannelId, models, { check = '', operationId = crypto.randomUUID() } = {}) {
  if (!serverChannelId || !models.length || models.length > 50) throw new Error('请选择 1–50 个可测试模型');
  if (!['', 'streaming', 'tools', 'structured'].includes(check)) throw new Error('验证内容无效');
  return { operationId, channelId: serverChannelId, models, confirmExpensive: models.some(row => ['image', 'video', 'speech', 'transcription'].includes(row.probe || row.type)) };
}
