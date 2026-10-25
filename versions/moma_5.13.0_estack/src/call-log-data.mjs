import { usagePreset } from "./admin-v2/usage-analysis.js";
import { apiKeySamples } from './api-key-data.mjs';
import { maskApiKey } from './api-key-utils.mjs';
export const defaultLogFilters = { range: '7', billing: '', model: '', key: '', source: '', status: '', resource: '', query: '', start: '', end: '' };
export const logStatuses = {
  400: ['参数错误', 'invalid_parameters', '检查输入内容及参数范围。'],
  503: ['服务不可用', 'model_unavailable', '检查可用销售服务及价格配置。'],
  504: ['上游超时', 'upstream_timeout', '稍后重试。'],
  200: ['成功', '', ''],
  403: ['访问被拒绝', 'Model.AccessDenied', '建议检查当前账号或 API Key 是否具有该模型的调用权限。'],
  429: ['请求限流', 'RateLimit.Exceeded', '建议降低并发或请求频率，稍后重试。'],
  500: ['服务异常', 'Service.InternalError', '建议稍后重试；若持续失败，请将 Request ID 提供给管理员排查。'],
};

export function shanghaiDate(now = new Date()) {
  return new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10);
}

// Prototype records are dated relative to the preview day so recent-date filters remain useful.
export function createLogRecords(today = shanghaiDate()) {
  return ['按量付费', 'Token Plan'].flatMap((billing, group) =>
    Array.from({ length: 24 }, (_, i) => {
      const status = [403, 200, 200, 429, 200, 500][i % 6];
      const experience = i % 6 === 0;
      const date = new Date(`${today}T00:00:00+08:00`);
      date.setTime(date.getTime() - Math.floor(i / 3) * 86400000);
      const keyId = `key_${['pay', 'tp'][group]}_${i % 2 ? 'prod' : 'test'}`;
      const input = status === 200 ? 900 + i * 60 : null;
      const output = status === 200 ? 300 + i * 20 : null;
      return {
        id: `${['1cef93b5', '2def84a6'][group]}-5a31-4951-a0b5-${String(96_000_000_000 + i).padStart(12, '0')}`,
        billing, time: `${shanghaiDate(date)} ${['08:36:45', '08:22:17', '07:56:03'][i % 3]}.074`,
        model: ['Qwen3.8-Max', 'DeepSeek-V4-Pro', 'GLM-5.2'][i % 3],
        source: experience ? '模型体验' : 'API 调用', keyId,
        keyName: group === 1 ? (i % 2 ? '研发助手' : '办公助手') : (i % 2 ? '生产环境' : '测试环境'),
        apiKey: maskApiKey(apiKeySamples[group * 2 + i % 2].key),
        resource: group === 1 ? (i % 2 ? '研发团队套餐' : '办公团队套餐') : null,
        input, output, total: input === null ? null : input + output,
        cache: status === 200 ? 200 : null,
        first: status === 200 ? 180 + i * 8 : null,
        duration: status === 200 ? 1800 + i * 120 : status === 403 ? 22 : status === 429 ? 45 : 1200,
        status, stream: true,
      };
    }),
  );
}

export function logPeriod(range, today = shanghaiDate()) {
  return usagePreset({ '1': 'today', yesterday:'yesterday', '7':'7d', '30':'30d' }[range], Date.parse(`${today}T12:00:00+08:00`));
}

export function restoreLogFilters(value, defaults, records) {
  return {
    ...defaults, ...value,
    billing: ['', '按量付费', 'Token Plan'].includes(value.billing) ? value.billing : '',
    resource: records.some(row => row.resource && row.resource === value.resource) ? value.resource : '',
    query: typeof value.query === 'string' ? value.query : '',
  };
}

export function filterLogRecords(records, billing, filters, today = shanghaiDate()) {
  const period = billing === '全部' && filters.range !== 'custom' ? logPeriod(filters.range, today) : null;
  const start = period ? period.start : filters.range === 'custom' ? filters.start : new Date(Date.parse(`${today}T00:00:00Z`) - (Number(filters.range) - 1) * 86400000).toISOString().slice(0, 10);
  const end = period ? period.end : filters.range === 'custom' ? filters.end : today;
  return records.filter(row => (billing === '全部' ? !filters.billing || row.billing === filters.billing : row.billing === billing) &&
    (!start || row.time.slice(0, 10) >= start) && (!end || row.time.slice(0, 10) <= end) &&
    (!filters.model || row.model === filters.model) && (!filters.key || row.keyId === filters.key) &&
    (!filters.source || row.source === filters.source) && (!filters.resource || row.resource === filters.resource) &&
    (!filters.status || String(row.status) === filters.status) && row.id.toLowerCase().includes(filters.query.trim().toLowerCase())
  ).sort((a, b) => b.time.localeCompare(a.time));
}

export function logJSON(row) {
  return JSON.stringify({
    usage: row.usage, project_id: row.projectId, user_id: row.userId, customer_charge: row.charge, quota_debit: row.quotaDebit, parameters: row.parameters, stages: row.stages, price_snapshot: row.priceSnapshot, request_id: row.id, created_at: row.time, finished_at: row.finishedAt ?? null, billing_type: row.billing,
    model: row.model, source: row.source === '模型体验' ? 'model-experience' : 'api',
    api_key_id: row.keyId, api_key_name: row.keyName, api_key: row.apiKey ? (row.apiKey === '系统托管' ? '系统托管' : maskApiKey(row.apiKey)) : null, client_ip: row.clientIp ?? null,
    endpoint_id: row.endpointId ?? null, endpoint_name: row.endpointName ?? null,
    resource_id: row.resourceId ?? null, resource_name: row.resource,
    status: row.status, error_code: (row.errorCode || logStatuses[row.status]?.[1]) || null,
    input_tokens: row.input, output_tokens: row.output, total_tokens: row.total, cache_tokens: row.cache,
    thinking_tokens: row.thinking ?? null, ttft: row.first, tpot: row.tpot ?? null, duration_ms: row.duration,
    is_timeout: row.isTimeout ?? null, is_canceled: row.isCanceled ?? null,
    api: row.api ?? (row.projectId ? null : '/v1/chat/completions'), is_stream: row.stream,
    user_agent: row.userAgent ?? null, input: row.requestBody ?? null, output: row.responseBody ?? null,
  }, null, 2);
}

export function logsCSV(rows) {
  const escape = value => `"${String(value ?? '').replace(/^[=+@-]/, "'$&").replaceAll('"', '""')}"`;
  const values = [['请求时间', 'Request ID', '模型 ID', '计费方式', '服务名称', '服务 ID', '套餐名称', '套餐 ID', 'Key 名称', 'Key ID', 'API Key', '状态码', '输入 Tokens', '输出 Tokens', '缓存命中 Tokens', '总 Tokens', '首 Token 时延(ms)', '总时延(ms)', '请求来源', '流式调用', '客户端 IP', '思考 Tokens', 'TPOT(ms)', '请求结束时间', '是否超时', '是否取消', '项目', '调用人', '费用(微元)', '套餐扣减', '图片张数', '音视频秒数', '字符数'],
    ...rows.map(r => [r.time, r.id, r.model, r.billing, r.endpointName, r.endpointId, r.resource, r.resourceId, r.keyName, r.keyId, r.apiKey ? (r.apiKey === '系统托管' ? '系统托管' : maskApiKey(r.apiKey)) : '', r.status, r.input, r.output, r.cache, r.total, r.first, r.duration, r.source, r.stream, r.clientIp, r.thinking, r.tpot, r.finishedAt, r.isTimeout, r.isCanceled, r.projectName, r.userName, r.charge, r.quotaDebit, r.usage?.images, r.usage?.seconds, r.usage?.characters])];
  return '\ufeff' + values.map(row => row.map(escape).join(',')).join('\r\n');
}
