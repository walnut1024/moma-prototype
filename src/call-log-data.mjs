import { usagePreset } from "./admin-v2/usage-analysis.js";
export const defaultLogFilters = { range: '7', billing: '', model: '', key: '', source: '', status: '', resource: '', query: '', start: '', end: '' };
export const logStatuses = {
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
  return ['按量付费', 'Token Plan', '资源包'].flatMap((billing, group) =>
    Array.from({ length: 24 }, (_, i) => {
      const status = [403, 200, 200, 429, 200, 500][i % 6];
      const experience = i % 6 === 0;
      const date = new Date(`${today}T00:00:00+08:00`);
      date.setTime(date.getTime() - Math.floor(i / 3) * 86400000);
      const keyId = experience ? null : `key_${['pay', 'tp', 'pack'][group]}_${i % 2 ? 'prod' : 'test'}`;
      const input = status === 200 ? 900 + i * 60 : null;
      const output = status === 200 ? 300 + i * 20 : null;
      return {
        id: `${['1cef93b5', '2def84a6', '3abc75d7'][group]}-5a31-4951-a0b5-${String(96_000_000_000 + i).padStart(12, '0')}`,
        billing, time: `${shanghaiDate(date)} ${['08:36:45', '08:22:17', '07:56:03'][i % 3]}.074`,
        model: ['Qwen3.8-Max', 'DeepSeek-V4-Pro', 'GLM-5.2'][i % 3],
        source: experience ? '模型体验' : 'API 调用', keyId,
        keyName: experience ? null : (group === 1 ? (i % 2 ? '研发助手' : '办公助手') : (i % 2 ? '生产环境' : '测试环境')),
        resource: group === 1 ? (i % 2 ? '研发团队套餐' : '办公团队套餐') : group === 2 ? '通用模型资源包' : null,
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
    request_id: row.id, start_time: row.time, billing_type: row.billing,
    model: row.model, source: row.source === '模型体验' ? 'model-experience' : 'api',
    apikey_id: row.keyId, ...(row.resource ? { resource_name: row.resource } : {}),
    status_code: row.status, error_code: logStatuses[row.status][1] || null,
    input_tokens: row.input, output_tokens: row.output, total_tokens: row.total, cache_tokens: row.cache,
    first_output_duration: row.first, duration: row.duration,
    api: '/v1/chat/completions', is_stream: row.stream,
  }, null, 2);
}

export function logsCSV(rows) {
  const escape = value => `"${String(value ?? '').replace(/^[=+@-]/, "'$&").replaceAll('"', '""')}"`;
  const values = [['Request ID', '计费类型', '请求时间', '模型', '请求来源', 'API Key 名称', 'API Key ID', '所属套餐/资源包', '输入 Token', '输出 Token', '总 Token', '首 Token 耗时(ms)', '总耗时(ms)', '状态码'],
    ...rows.map(r => [r.id, r.billing, r.time, r.model, r.source, r.keyName, r.keyId, r.resource, r.input, r.output, r.total, r.first, r.duration, r.status])];
  return '\ufeff' + values.map(row => row.map(escape).join(',')).join('\r\n');
}
