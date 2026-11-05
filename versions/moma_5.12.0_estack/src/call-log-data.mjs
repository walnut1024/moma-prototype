import mockConfig from './mock/catalogues.json' with {type:'json'};
import { usagePreset } from "./admin-v2/usage-analysis.js";
import { maskApiKey } from './api-key-utils.mjs';
export const defaultLogFilters = { range: '7', billing: '', model: '', key: '', source: '', status: '', resource: '', query: '', start: '', end: '' };
export const logStatuses = {
  200: ['成功', '', ''],
  403: ['访问被拒绝', 'Model.AccessDenied', '建议检查当前账号或 API Key 是否具有该模型的调用权限。'],
  429: ['请求限流', 'RateLimit.Exceeded', '建议降低并发或请求频率，稍后重试。'],
  500: ['服务异常', 'Service.InternalError', '建议稍后重试；若持续失败，请将 Request ID 提供给管理员排查。'],
  504: ['上游超时', 'Service.UpstreamTimeout', '请稍后重试，或将 Request ID 提供给管理员排查上游响应。'],
};

export function shanghaiDate(now = new Date()) {
  return new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10);
}

// Prototype records are dated relative to the preview day so recent-date filters remain useful.
export function createLogRecords(today = shanghaiDate()) {
  const config=mockConfig['call-log-data.mjs'],shift=Date.parse(today)-Date.parse(config.anchorDate);
  return structuredClone(config.initialRecords).map(row=>({...row,time:shanghaiDate(new Date(Date.parse(row.time.slice(0,10)+'T00:00:00+08:00')+shift))+row.time.slice(10)}));
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
    request_id: row.id, created_at: row.time, finished_at: row.finishedAt ?? null, billing_type: row.billing,
    model: row.model, source: row.source === '模型体验' ? 'model-experience' : 'api',
    api_key_id: row.keyId, api_key_name: row.keyName, api_key: row.apiKey ? maskApiKey(row.apiKey) : null, client_ip: row.clientIp ?? null,
    endpoint_id: row.endpointId ?? null, endpoint_name: row.endpointName ?? null,
    resource_id: row.resourceId ?? null, resource_name: row.resource,
    status: row.status, error_code: logStatuses[row.status]?.[1] || null,
    input_tokens: row.input, output_tokens: row.output, total_tokens: row.total, cache_tokens: row.cache,
    thinking_tokens: row.thinking ?? null, ttft: row.first, tpot: row.tpot ?? null, duration_ms: row.duration,
    is_timeout: row.isTimeout ?? null, is_canceled: row.isCanceled ?? null,
    api: '/v1/chat/completions', is_stream: row.stream,
    user_agent: row.userAgent ?? null, input: row.requestBody ?? null, output: row.responseBody ?? null,
  }, null, 2);
}

export function logsCSV(rows) {
  const escape = value => `"${String(value ?? '').replace(/^[=+@-]/, "'$&").replaceAll('"', '""')}"`;
  const values = [['请求时间', 'Request ID', '模型 ID', '计费方式', '服务名称', '服务 ID', '套餐名称', '套餐 ID', 'Key 名称', 'Key ID', 'API Key', '状态码', '输入 Tokens', '输出 Tokens', '缓存命中 Tokens', '总 Tokens', '首 Token 时延(ms)', '总时延(ms)', '请求来源', '流式调用', '客户端 IP', '思考 Tokens', 'TPOT(ms)', '请求结束时间', '是否超时', '是否取消'],
    ...rows.map(r => [r.time, r.id, r.model, r.billing, r.endpointName, r.endpointId, r.resource, r.resourceId, r.keyName, r.keyId, r.apiKey ? maskApiKey(r.apiKey) : '', r.status, r.input, r.output, r.cache, r.total, r.first, r.duration, r.source, r.stream, r.clientIp, r.thinking, r.tpot, r.finishedAt, r.isTimeout, r.isCanceled])];
  return '\ufeff' + values.map(row => row.map(escape).join(',')).join('\r\n');
}

export function tenantLogRecords({requests=[],models=[],keys=[]}) {
  return requests.map(row=>{const usage=row.usage||{},key=keys.find(item=>item.id===row.keyId),model=models.find(item=>item.id===row.modelId),input=usage.input??null,output=usage.output??null;return {id:row.requestId||row.id,billing:row.billingType||'按量付费',time:new Date(row.createdAt).toLocaleString('sv-SE',{timeZone:'Asia/Shanghai',hour12:false}),model:row.publicModelId||model?.modelId||row.modelId,source:row.source==='网页端调用'?'模型体验':row.source||'API 调用',keyId:row.keyId||'',keyName:key?.name||'',apiKey:key?.secretPreview||'',resource:row.subscriptionId||null,input,output,total:input!==null&&output!==null?input+output:null,cache:usage.cached??null,first:row.ttftMs??null,duration:row.durationMs??null,status:row.httpStatus,stream:row.stream??null,endpointId:row.serviceId||null};});
}
