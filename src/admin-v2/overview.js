import { dayOf } from './analytics.js';
import { userDemo } from './user-analysis.js';
const DAY = 86400000, HOUR = 3600000, OFFSET = 8 * HOUR;
export const overviewPresets = [['day', '今日'], ['week', '近 7 天'], ['month', '近 30 天']];
export const compactCount = new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 2 }).format;
export const overviewDateTime = time => new Date(time).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
export function overviewPeriods(now = Date.now()) {
  const midnight = Date.parse(`${dayOf(now)}T00:00:00+08:00`);
  return overviewPresets.map(([id, label], i) => {
    const days = [1, 7, 30][i], start = midnight - (days - 1) * DAY;
    return { id, label, start, end: now, previousStart: start - days * DAY, previousEnd: now - days * DAY,
      range: `${dayOf(start)} — ${dayOf(now)}`, comparison: days === 1 ? '对比昨日同期' : `对比前 ${days} 天同期` };
  });
}
const noise = seed => { const n = Math.sin(seed * 12.9898) * 43758.5453; return n - Math.floor(n); };
const models = ['DeepSeek-V4-Pro', 'Qwen3.8-Max', 'GLM-5.2', 'Kimi-K3', 'DeepSeek-V4-Flash', 'Qwen3.5-Plus', 'GLM-5.3', 'MiniMax-H3', 'BGE-M3', 'Qwen3.5-VL', 'Qwen3-Embedding', 'GLM-4.6V'];
const customers = Array.from({ length: 32 }, (_, i) => ({ id: `tenant-demo-${1001 + i}`, name: `客户 ${String.fromCharCode(65 + Math.floor(i / 10))}-${1001 + i}` }));
const empty = () => ({ total: 0, calls: 0, successfulCalls: 0, self: 0, partner: 0 });
const add = (target, row) => { for (const key of ['total', 'calls', 'successfulCalls', 'self', 'partner']) target[key] += row[key]; };
const sort = rows => rows.sort((a, b) => b.total - a.total || a.id.localeCompare(b.id));
export const overviewChange = (value, previous) => previous > 0 ? (value / previous - 1) * 100 : null;

// Registered identity stock at the cutoff, independent of tenant call activity.
export function overviewRegistrations(users, end) {
  const registered = [...new Map(users.filter(user => user.at < end).map(user => [user.id, user])).values()];
  return { total: registered.length, enterprise: registered.filter(user => user.type === '企业').length, personal: registered.filter(user => user.type === '个人').length };
}

// Identity logins use calendar-month MAU, independent of the usage-period picker.
export function overviewMonthlyActive({ users, logins }, end) {
  const date = new Date(end + OFFSET);
  const year = date.getUTCFullYear(), month = date.getUTCMonth();
  const start = Date.UTC(year, month, 1) - OFFSET;
  const previousStart = Date.UTC(year, month - 1, 1) - OFFSET;
  const previousEnd = Math.min(start, previousStart + end - start);
  const identities = new Map(users.map(user => [user.id, user]));
  const count = (from, to) => new Set(logins.filter(event => {
    const user = identities.get(event.userId);
    return user && user.at <= event.at && event.at >= from && event.at < to;
  }).map(event => event.userId)).size;
  return { start, end, total: count(start, end), previousStart, previousEnd, previousTotal: count(previousStart, previousEnd) };
}

// Isolated deterministic demonstration facts, grouped by Beijing hour, tenant and public model.
// Every summary, trend, ranking and detail uses these same facts; no identity/login inference.
function aggregate(start, end, hourly) {
  const summary = empty(), tenants = new Map(), modelMap = new Map(), pairs = new Map(), buckets = new Map();
  const step = hourly ? HOUR : DAY;
  for (let at = start; at < end; at += step) buckets.set(at, { at, label: hourly ? new Date(at + OFFSET).toISOString().slice(11, 16) : dayOf(at).slice(5), ...empty() });
  for (let at = start; at < end; at += HOUR) {
    const hour = new Date(at + OFFSET).getUTCHours(), day = Math.floor((at + OFFSET) / DAY);
    const fraction = Math.min(HOUR, end - at) / HOUR;
    for (let c = 0; c < customers.length; c++) {
      // Smaller tenants have intermittent use. Period customer counts are deduplicated, not summed daily.
      if (c > 10 && noise(day * 17 + c) < .58) continue;
      for (let slot = 0; slot < 2; slot++) {
        const m = (c + slot * 5 + Math.floor(day / 4)) % models.length;
        const seed = at / HOUR + c * 113 + m * 19;
        const load = .25 + Math.exp(-(((hour - 14) / 6) ** 2));
        const calls = Math.floor((32 - c) * 12 * load * (.65 + noise(seed)) * fraction);
        if (!calls) continue;
        const successfulCalls = calls - Math.round(calls * (.002 + noise(seed + 1) * .012));
        const total = successfulCalls * Math.round(500 + noise(day + m) * 1900);
        const self = Math.round(total * (.25 + noise(m + c) * .6));
        const row = { total, calls, successfulCalls, self, partner: total - self };
        const customer = customers[c], model = { id: `model-demo-${m}`, name: models[m] };
        if (!tenants.has(customer.id)) tenants.set(customer.id, { ...customer, ...empty(), modelIds: new Set() });
        if (!modelMap.has(model.id)) modelMap.set(model.id, { ...model, ...empty(), customerIds: new Set() });
        const key = `${customer.id}/${model.id}`;
        if (!pairs.has(key)) pairs.set(key, { customerId: customer.id, customerName: customer.name, modelId: model.id, modelName: model.name, ...empty() });
        const bucketAt = start + Math.floor((at - start) / step) * step;
        for (const target of [summary, tenants.get(customer.id), modelMap.get(model.id), pairs.get(key), buckets.get(bucketAt)]) add(target, row);
        if (successfulCalls) { tenants.get(customer.id).modelIds.add(model.id); modelMap.get(model.id).customerIds.add(customer.id); }
      }
    }
  }
  return { ...summary, activeCustomers: [...tenants.values()].filter(r => r.successfulCalls > 0).length,
    success: summary.calls ? summary.successfulCalls / summary.calls * 100 : null,
    customers: sort([...tenants.values()].map(({ modelIds, ...row }) => ({ ...row, modelCount: modelIds.size }))),
    models: sort([...modelMap.values()].map(({ customerIds, ...row }) => ({ ...row, customerCount: customerIds.size }))),
    pairs: [...pairs.values()], trend: [...buckets.values()] };
}
export function overviewDemo(now = Date.now(), periodId = 'day') {
  const period = overviewPeriods(now).find(p => p.id === periodId) || overviewPeriods(now)[0];
  const current = aggregate(period.start, period.end, period.id === 'day');
  const previous = aggregate(period.previousStart, period.previousEnd, period.id === 'day');
  const previousCustomers = new Map(previous.customers.map(row => [row.id, row]));
  const identities = userDemo(now);
  return { ...current, registrations: overviewRegistrations(identities.users, period.end), monthlyActive: overviewMonthlyActive(identities, period.end), period,
    previous: { ...previous, registrations: overviewRegistrations(identities.users, period.previousEnd) },
    customers: current.customers.map(row => ({ ...row, change: overviewChange(row.total, previousCustomers.get(row.id)?.total || 0) })) };
}
