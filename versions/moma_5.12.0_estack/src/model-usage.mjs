import { callObservations, summarizeObservations } from './admin-v2/call-observations.mjs';

export function modelUsageSummary(records, service, now = Date.now()) {
  const start = now - 7 * 86400000;
  const modelId = service.serviceModelId || service.modelKey;
  const candidates = records.filter(row => row.modelId === modelId);
  const selected = candidates.filter(row => service.mode !== 'provider' || (row.publicModelId || row.callId) === service.callId);
  const { requests } = callObservations({ requests: selected, models: [{ id: modelId, type: service.type }] });
  const rows = requests.filter(row => row.at >= start && row.at < now);
  const summary = summarizeObservations(rows);
  return { ...summary, start, end: now, pendingTokens: rows.filter(row => row.tokenMeter && row.total == null).length,
    successRate: summary.success + summary.failed ? summary.success / (summary.success + summary.failed) * 100 : null };
}
