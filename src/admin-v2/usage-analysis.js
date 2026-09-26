import { dayOf } from './analytics.js';

const displayNumber = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 });
export function formatUsageNumber(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const number = Number(value), magnitude = Math.abs(number);
  return magnitude >= 1e8 ? displayNumber.format(number / 1e8) + '亿' : magnitude >= 1e4 ? displayNumber.format(number / 1e4) + 'w' : displayNumber.format(number);
}

const DAY = 86400000;
const dayStart = day => Date.parse(`${day}T00:00:00+08:00`);
const addDays = (day, count) => dayOf(dayStart(day) + count * DAY);

export const usageModelTypes = [
  { id: 'text', name: '语言模型', types: ['text'], color: '#18a69a' },
  { id: 'multimodal', name: '多模态理解', types: ['multimodal'], color: '#f09b38' },
  { id: 'visual', name: '视觉模型', types: ['image', 'video'], color: '#dd659d' },
  { id: 'audio', name: '语音模型', types: ['audio'], color: '#865bd6' },
  { id: 'embedding', name: '向量模型', types: ['embedding'], color: '#7199ca' },
  { id: 'rerank', name: '排序模型', types: ['rerank'], color: '#8a97ac' },
];
export const tokenModelTypes = usageModelTypes.filter(type => ['text', 'multimodal', 'embedding', 'rerank'].includes(type.id));
export const usageCategory = type => usageModelTypes.find(item => item.types.includes(type))?.id;
export const usageSuppliers = [
  { id: 'deepseek', name: '深度求索（DeepSeek）' }, { id: 'zhipu', name: '智谱（Zhipu）' },
  { id: 'alibaba', name: '阿里（Qwen）' }, { id: 'moonshot', name: '月之暗面（Kimi）' },
  { id: 'minimax', name: 'MiniMax' }, { id: 'bytedance', name: '字节跳动（豆包）' },
  { id: 'tencent', name: '腾讯（混元）' }, { id: 'baidu', name: '百度（文心）' },
  { id: 'baichuan', name: '百川智能' }, { id: 'lingyi', name: '零一万物（Yi）' },
  { id: 'baai', name: '智源研究院（BGE）' }, { id: 'shanghai-ai', name: '上海人工智能实验室（InternLM）' },
  { id: 'blackforest', name: 'Black Forest Labs（FLUX）' },
  { id: 'openai', name: 'OpenAI' }, { id: 'anthropic', name: 'Anthropic' },
  { id: 'google', name: 'Google（Gemini）' }, { id: 'meta', name: 'Meta（Llama）' },
  { id: 'other', name: '其他供应商' },
];
export function usageSupplier(model) {
  if (model?.supplierId) return model.supplierId;
  const id = (model?.modelId || model?.name || '').toLowerCase();
  if (/^(qwen|gte|sensevoice|cosyvoice|wan-)/.test(id)) return 'alibaba';
  return [
    [/^deepseek/, 'deepseek'], [/^glm/, 'zhipu'], [/^kimi/, 'moonshot'], [/^minimax/, 'minimax'],
    [/^doubao/, 'bytedance'], [/^hunyuan/, 'tencent'], [/^ernie/, 'baidu'],
    [/^baichuan/, 'baichuan'], [/^yi-/, 'lingyi'], [/^bge/, 'baai'],
    [/^internlm/, 'shanghai-ai'], [/^flux/, 'blackforest'], [/^gpt-/, 'openai'],
    [/^claude/, 'anthropic'], [/^gemini/, 'google'], [/^llama/, 'meta'],
  ].find(([pattern]) => pattern.test(id))?.[1] || 'other';
}
export function usageMeter(model, row) {
  const fallback = ['text', 'multimodal', 'embedding', 'rerank'].includes(model?.type) ? 'Token' : model?.type === 'image' ? '张' : model?.type === 'audio' && Number.isFinite(row?.usage?.characters) ? '字符' : '秒';
  const unit = row?.usageUnit || model?.usageUnit || fallback;
  const fields = unit === 'Token' ? ['embedding', 'rerank'].includes(model?.type) ? ['input'] : ['input', 'output'] : { '张': ['images'], '秒': ['seconds'], '字符': ['characters'] }[unit] || ['unavailable'];
  return { unit, fields };
}

export function usagePreset(preset, now = Date.now()) {
  const today = dayOf(now);
  if (preset === 'today') return { start: today, end: today };
  if (preset === 'yesterday') return { start: addDays(today, -1), end: addDays(today, -1) };
  const days = preset === '7d' ? 7 : 30;
  return { start: addDays(today, -days), end: addDays(today, -1) };
}

export function usageWindow(range, now = Date.now()) {
  const start = dayStart(range.start);
  const end = Math.min(dayStart(range.end) + DAY, now);
  const days = Math.round((dayStart(range.end) - start) / DAY) + 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || days < 1 || days > 365 || end <= start) return null;
  return { start, end, days, priorStart: start - days * DAY, priorEnd: end - days * DAY, hourly: days === 1, weekly: days > 30 };
}

export function usageValue(row, fields) {
  const success = Number(row.httpStatus) >= 200 && Number(row.httpStatus) < 300;
  const confirmed = row.usageConfirmed === true || row.usageStatus === 'confirmed';
  const allowed = success || confirmed;
  const known = Object.fromEntries(fields.map(field => [field, allowed && Number.isFinite(row.usage?.[field]) && row.usage[field] >= 0 ? row.usage[field] : null]));
  return { ...known, total: Object.values(known).reduce((sum, value) => sum + (value ?? 0), 0), complete: allowed && fields.every(field => known[field] !== null) };
}

export function usageSource(state, row) {
  const endpoint = state.endpoints.find(item => item.id === row.endpointId);
  const provider = state.providers.find(item => item.id === endpoint?.providerId);
  return provider?.sourceType === 'selfHosted' ? 'selfHosted' : provider?.sourceType === 'thirdParty' ? 'thirdParty' : 'unknown';
}

export function usageFacts(state, range, filters, now = Date.now()) {
  const window = usageWindow(range, now);
  if (!window) return null;
  const models = new Map(state.models.map(item => [item.id, item]));
  const requests = new Map();
  for (const row of state.requests) {
    const at = Date.parse(row.createdAt);
    if (!Number.isFinite(at) || at < window.priorStart || at >= window.end || at > now) continue;
    const model = models.get(row.modelId);
    const modelType = model?.type;
    if (!usageCategory(modelType) || (filters.types !== null && !filters.types.includes(usageCategory(modelType)))) continue;
    if (filters.suppliers != null && !filters.suppliers.includes(usageSupplier(model))) continue;
    if (filters.tenant !== null && !filters.tenant.includes(row.tenantId)) continue;
    if (filters.model !== null && !filters.model.includes(row.modelId)) continue;
    const source = usageSource(state, row);
    if (filters.source && source !== filters.source) continue;
    const key = row.requestId || row.id;
    if (!key) continue;
    const existing = requests.get(key);
    if (!existing || Date.parse(existing.updatedAt || existing.createdAt) <= Date.parse(row.updatedAt || row.createdAt)) requests.set(key, row);
  }
  const facts = [...requests.values()].map(row => { const model = models.get(row.modelId), meter = usageMeter(model, row); return { ...row, modelType: model.type, category: usageCategory(model.type), unit: meter.unit, at: Date.parse(row.createdAt), source: usageSource(state, row), value: usageValue(row, meter.fields) }; });
  return { window, current: facts.filter(row => row.at >= window.start && row.at < window.end), prior: facts.filter(row => row.at >= window.priorStart && row.at < window.priorEnd) };
}

export function usageTotals(rows, fields) {
  const totals = { calls: rows.length, completeCalls: 0, input: 0, output: 0, total: 0, customers: new Set(), unknownCustomers: 0 };
  for (const row of rows) {
    totals.total += row.value.total;
    for (const field of fields) totals[field] = (totals[field] || 0) + (row.value[field] ?? 0);
    if (row.value.complete) totals.completeCalls++;
    if (row.tenantId) totals.customers.add(row.tenantId);
    else totals.unknownCustomers++;
  }
  return { ...totals, customers: totals.customers.size, pendingCalls: rows.length - totals.completeCalls };
}

export function usageRates(rows, window, prior = false) {
  const start = prior ? window.priorStart : window.start;
  const end = prior ? window.priorEnd : window.end;
  const dailyTokens = new Map(), minuteTokens = new Map(), minuteCalls = new Map();
  let totalTokens = 0;
  for (const row of rows) {
    const minute = Math.floor(row.at / 60000);
    minuteCalls.set(minute, (minuteCalls.get(minute) || 0) + 1);
    if (row.unit !== 'Token') continue;
    const tokens = row.value.total;
    totalTokens += tokens;
    const day = dayOf(row.at);
    dailyTokens.set(day, (dailyTokens.get(day) || 0) + tokens);
    minuteTokens.set(minute, (minuteTokens.get(minute) || 0) + tokens);
  }
  const minutes = Math.max(1, (end - start) / 60000);
  const peak = values => [...values].reduce((max, value) => Math.max(max, value), 0);
  return {
    averageTpd: totalTokens / window.days,
    peakTpd: peak(dailyTokens.values()),
    peakTpm: peak(minuteTokens.values()),
    peakRpm: peak(minuteCalls.values()),
    averageTpm: totalTokens / minutes,
    averageRpm: rows.length / minutes,
  };
}

export function usageGroups(rows, key) {
  const groups = new Map();
  for (const row of rows) {
    const id = row[key] || '__unknown__';
    const group = groups.get(id) || { id, input: 0, output: 0, total: 0, units: {}, calls: 0, tokenCalls: 0, complete: true, models: new Set() };
    if (row.unit === 'Token') {
      group.tokenCalls++;
      group.input += row.value.input ?? 0;
      group.output += row.value.output ?? 0;
      group.total += row.value.total;
    } else group.units[row.unit] = (group.units[row.unit] || 0) + row.value.total;
    group.calls++;
    group.complete &&= row.value.complete;
    if (row.modelId) group.models.add(row.modelId);
    groups.set(id, group);
  }
  return [...groups.values()].sort((a, b) => b.total - a.total || a.id.localeCompare(b.id));
}

export function usageBuckets(rows, priorRows, window) {
  const buckets = [];
  const step = window.hourly ? 3600000 : DAY;
  for (let cursor = window.start; cursor < window.end;) {
    let next = Math.min(cursor + step, window.end);
    if (window.weekly) {
      const weekday = new Date(cursor + 8 * 3600000).getUTCDay();
      next = Math.min(cursor + (weekday === 0 ? 1 : 8 - weekday) * DAY, window.end);
    }
    const current = rows.filter(row => row.at >= cursor && row.at < next);
    const prior = priorRows.filter(row => row.at >= cursor - window.days * DAY && row.at < next - window.days * DAY);
    const label = window.hourly ? new Date(cursor + 8 * 3600000).toISOString().slice(11, 16) : window.weekly ? `${dayOf(cursor).slice(5)}–${dayOf(next - 1).slice(5)}` : dayOf(cursor).slice(5);
    const byType = Object.fromEntries(usageModelTypes.map(type => [type.id, current.filter(row => row.category === type.id).reduce((sum, row) => sum + row.value.total, 0)]));
    buckets.push({ start: cursor, end: next, label, total: current.reduce((sum, row) => sum + row.value.total, 0), ...byType, input: current.reduce((sum, row) => sum + (row.value.input ?? 0), 0), output: current.reduce((sum, row) => sum + (row.value.output ?? 0), 0), selfHosted: current.filter(row => row.source === 'selfHosted').reduce((sum, row) => sum + row.value.total, 0), thirdParty: current.filter(row => row.source === 'thirdParty').reduce((sum, row) => sum + row.value.total, 0), unknown: current.filter(row => row.source === 'unknown').reduce((sum, row) => sum + row.value.total, 0), calls: current.length, priorTotal: prior.reduce((sum, row) => sum + row.value.total, 0), priorCalls: prior.length, partial: window.hourly ? next - cursor < step : window.weekly ? next - cursor < 7 * DAY : next - cursor < DAY });
    cursor = next;
  }
  return buckets;
}

export function usageCallBuckets(rows, buckets) {
  return buckets.map(bucket => {
    const counts = Object.fromEntries(usageModelTypes.map(type => [type.id, 0]));
    counts.total = 0;
    for (const row of rows) {
      if (row.at >= bucket.start && row.at < bucket.end) { counts.total++; counts[row.category]++; }
    }
    return counts;
  });
}
