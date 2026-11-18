import { outcomes } from './call-observations.mjs';

const timeValue = value => Number.isFinite(value) && value >= 0;

function withTiming(node, total) {
  const { offset, duration } = node;
  const invalid = offset != null && !timeValue(offset) || duration != null && !timeValue(duration);
  const outside = offset != null && total != null && offset + (duration ?? 0) > total;
  return invalid || outside ? { ...node, offset: null, duration: null, timingConflict: true } : node;
}

function recordedGatewayNodes(row) {
  const nodes = [];
  if (row.routeVersion != null) {
    nodes.push({ id: 'route-version', label: '路由版本', fields: [['路由版本', row.routeVersion]] });
  }
  if (row.blocked) {
    const label = /auth|scope/.test(row.blocked) ? '鉴权' : /limit|quota/.test(row.blocked) ? '限流' : '网关处理';
    nodes.push({ id: 'blocked', label, status: '已拦截', tone: 'red',
      fields: [['错误类型', row.blocked], ['失败原因', row.errorReason]] });
  }
  if (row.cacheHit) nodes.push({ id: 'cache-hit', label: '缓存命中' });
  return nodes;
}

export function buildRequestTrace(row, evidence) {
  const total = ['success', 'failed', 'canceled'].includes(row.outcome) && timeValue(row.duration) ? row.duration : null;
  const attempts = row.attempts.map(attempt => ({
    id: attempt.id,
    label: '第 ' + attempt.index + ' 次 · ' + (attempt.channelName ?? '渠道未采集'),
    status: attempt.timeout ? '超时' : outcomes[attempt.outcome],
    tone: attempt.outcome === 'failed' ? 'red' : attempt.outcome === 'success' ? 'green' : 'grey',
    offset: Number.isFinite(row.at) && Number.isFinite(attempt.at) ? attempt.at - row.at : null,
    duration: attempt.duration,
    attempt,
    next: evidence?.attemptActions?.[attempt.index],
  }));
  const nodes = [...(evidence?.nodes ?? recordedGatewayNodes(row)), ...attempts]
    .map(node => withTiming(node, total))
    .sort((a, b) => (a.offset ?? Infinity) - (b.offset ?? Infinity));
  const recordedCount = attempts.length;
  const knownCount = evidence?.attemptCount;
  const attemptCount = Number.isInteger(knownCount) && knownCount >= recordedCount ? knownCount
    : recordedCount === 0 && (row.blocked || row.cacheHit) ? 0 : null;
  const hasChart = total > 0 && nodes.some(node => node.offset != null && (node.point || node.duration != null));
  const incomplete = nodes.length > 0 && evidence?.traceState !== 'complete';
  const longest = nodes.reduce((current, node) => node.duration != null && !node.point
    && (!current || node.duration > current.duration) ? node : current, null);
  return { nodes, total, hasChart, attemptCount, recordedCount, longest, incomplete };
}

export function readRequestBody(evidence) {
  const body = evidence?.body;
  if (body?.allowed === false) return { state: 'denied', segments: [] };
  if (body?.state) return { state: body.state, segments: [] };
  if (body?.allowed !== true || !body.segments?.length) return { state: 'unavailable', segments: [] };
  const segments = body.segments.map(({ id, label, attemptIndex, state, text }) => {
    const available = state == null && typeof text === 'string';
    return { id, label, attemptIndex, state: available ? 'available' : state ?? 'unavailable', text: available ? text : null };
  });
  return { state: 'available', segments };
}
