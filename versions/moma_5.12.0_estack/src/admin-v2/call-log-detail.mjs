import { observationTime, outcomes, purposeLabels } from './call-observations.mjs';

export const requestLogSections = [
  ['请求与结果', [
    ['请求 ID', 'requestId'], ['开始时间', 'at', observationTime], ['模型名称', 'modelName'], ['模型调用标识', 'callId'],
    ['请求状态', 'outcome', value => outcomes[value]], ['状态码', 'status'],
    ['总耗时（ms）', 'duration'], ['首包延迟（ms）', 'firstPacket'], ['首 Token 时延（ms）', 'ttft'],
  ]],
  ['路由归属', [
    ['供应商名称', 'providerName'], ['渠道名称', 'channelName'], ['供应商 ID', 'provider'], ['渠道 ID', 'channel'],
  ]],
  ['Token 用量', [['总 Token', 'total'], ['输入 Token', 'input'], ['输出 Token', 'output']]],
  ['调用方', [
    ['请求来源', 'source'], ['调用类型', 'purpose', value => purposeLabels[value]], ['客户', 'tenantName'],
    ['项目', 'projectName'], ['项目 ID', 'project'], ['调用用户', 'userName'], ['调用用户 ID', 'user'],
    ['API 密钥名称', 'keyName'], ['API 密钥 ID', 'keyDisplayId'], ['API 密钥（脱敏）', 'keyMasked'],
  ]],
];

const timeValue = value => Number.isFinite(value) && value >= 0;

function withTiming(node, total) {
  const { offset, duration } = node;
  const invalid = offset != null && !timeValue(offset) || duration != null && !timeValue(duration);
  const outside = offset != null && total != null && offset + (duration ?? 0) > total;
  return invalid || outside ? { ...node, offset: null, duration: null, timingConflict: true } : node;
}

function recordedGatewayNodes(row) {
  const nodes = [];
  if (row.projectRouteId) {
    const fields = [['项目路由 ID', row.projectRouteId]];
    if (row.routeMatch?.field === 'default') fields.push(['命中规则', '默认规则']);
    else if (row.routeMatch?.field) fields.push(['匹配字段', row.routeMatch.field]);
    if (Number.isInteger(row.routeMatch?.ruleIndex)) fields.push(['规则序号', row.routeMatch.ruleIndex + 1]);
    nodes.push({ id: 'project-route', label: '项目路由', fields });
  }
  if (row.routeVersion != null || row.selectionReason) {
    nodes.push({ id: 'route-version', label: '路由决策', fields: [['路由版本', row.routeVersion], ['选中原因', row.selectionReason]] });
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
  let orderAt = 0;
  const attempts = row.attempts.map(attempt => {
    const node = withTiming({
      id: attempt.id,
      label: '第 ' + attempt.index + ' 次 · ' + (attempt.channelName ?? '渠道未采集'),
      status: outcomes[attempt.outcome],
      tone: attempt.outcome === 'failed' ? 'red' : attempt.outcome === 'success' ? 'green' : 'grey',
      offset: Number.isFinite(row.at) && Number.isFinite(attempt.at) ? attempt.at - row.at : null,
      duration: attempt.duration,
      attempt,
      next: attempt.nextAction ?? evidence?.attemptActions?.[attempt.index],
    }, total);
    // 缺失或倒序的时间戳不改变已记录的尝试顺序。
    orderAt = Math.max(orderAt, node.offset ?? 0);
    return { ...node, orderAt };
  });
  const stages = (evidence?.nodes ?? recordedGatewayNodes(row)).map(node => withTiming(node, total));
  const nodes = [...stages, ...attempts].sort((a, b) => (a.orderAt ?? a.offset ?? Infinity) - (b.orderAt ?? b.offset ?? Infinity));
  const recordedCount = attempts.length;
  const knownCount = evidence?.attemptCount;
  const attemptCount = Number.isInteger(knownCount) && knownCount >= recordedCount ? knownCount
    : recordedCount === 0 && (row.preflightType || row.cacheHit) ? 0 : null;
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
