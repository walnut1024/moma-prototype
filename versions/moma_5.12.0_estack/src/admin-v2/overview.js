import { dayOf } from './analytics.js';
import { requestOutcome } from './call-observations.mjs';
import { analysisFilters, operationFacts } from './operations-analysis.js';
import { usagePreset, usageWindow } from './usage-analysis.js';
import { userBusinessData } from '../business-facts.mjs';
import { userMetrics } from './user-analysis.js';

const DAY = 86400000;
const BEIJING = 8 * 3600000;
const dayStart = day => Date.parse(day + 'T00:00:00+08:00');
const byDate = time => new Date(time + BEIJING);
const dateTime = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', dateStyle: 'short', timeStyle: 'short' });
export const overviewDateTime = time => dateTime.format(time);
export const compactCount = new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 2 }).format;
export const overviewChange = (value, previous) => value != null && previous > 0 ? (value / previous - 1) * 100 : null;
export const overviewRange = (period, now) => usagePreset(period, period === '7d' || period === '30d' ? now + DAY : now);
const HOUR = 3600000;
const sum = (rows, key) => rows.reduce((total, row) => total + row[key], 0);
const within = (rows, start, end) => rows.filter(row => row.at >= start && row.at < end);
const customerIds = rows => new Set(rows.map(row => row.tenantId).filter(Boolean));
const dates = (start, end) => Array.from({ length: Math.round((end - start) / DAY) }, (_, index) => start + index * DAY);

function monthStart(time, offset = 0) {
  const date = byDate(time);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1) - BEIJING;
}

function tokenSummary(rows) {
  const summary = { metered: 0, pending: 0, selfHosted: 0, thirdParty: 0, unknown: 0 };
  for (const row of rows) {
    if (row.unit !== 'Token') continue;
    if (!row.value.complete || row.usageConfirmed === false) summary.pending++;
    else {
      summary.metered++;
      summary[row.source] += row.value.total;
    }
  }
  return { ...summary, total: readTokens(summary, summary.selfHosted + summary.thirdParty + summary.unknown) };
}

function readTokens(summary, total) {
  return summary.pending > 0 && !summary.metered ? null : total;
}

function performance(rows) {
  const outcomes = rows.map(row => requestOutcome(row));
  const successful = outcomes.filter(outcome => outcome === 'success').length;
  const known = successful + outcomes.filter(outcome => outcome === 'failed').length;
  return { ...tokenSummary(rows), calls: rows.length, successRate: known ? successful / known * 100 : null };
}

const customerTypes = [
  { label: '政企租户', color: '#2668dc' },
  { label: '个人租户', color: '#a38bed' },
  { label: '类型未归属', color: '#8498b3' },
];

function customerType(tenant) {
  if (tenant?.type === '个人') return 1;
  return tenant?.type === '企业' || tenant?.type === '政府' ? 0 : 2;
}

function customerComposition(rows, tenants) {
  const types = customerTypes.map(type => ({ ...type, value: 0 }));
  for (const id of customerIds(rows)) types[customerType(tenants.get(id))].value++;
  return types;
}

const supplyTypes = [
  ['selfHosted', '自产 Token', '#9fc7fa'],
  ['thirdParty', '引入 Token', '#2769de'],
  ['unknown', '未归属 Token', '#8195b4'],
];

export function overviewTimeline(state, now = Date.now()) {
  const cutoff = dayStart(dayOf(now));
  const latest = byDate(cutoff - 1);
  const firstMonth = Date.UTC(latest.getUTCFullYear(), 0, 1) - BEIJING;
  const split = Math.max(firstMonth, cutoff - 180 * DAY);
  const facts = [[firstMonth - 62 * DAY, split - DAY], [split, cutoff]].flatMap(([start, end]) =>
    operationFacts(state, { start: dayOf(start), end: dayOf(end) }, analysisFilters(), now));
  const tenants = new Map(state.tenants.map(tenant => [tenant.id, tenant]));
  const dailyRows = Map.groupBy(facts, row => dayOf(row.at));
  const dayRows = time => dailyRows.get(dayOf(time)) || [];
  const isWorkday = time => {
    const day = byDate(time).getUTCDay();
    return day > 0 && day < 6;
  };
  const workdayAverage = count => {
    const start = cutoff - count * DAY;
    const workdays = dates(start, cutoff).filter(isWorkday);
    const summary = tokenSummary(workdays.flatMap(dayRows));
    return { start: dayOf(start), end: dayOf(cutoff - DAY), days: workdays.length,
      value: summary.total == null ? null : summary.total / workdays.length };
  };
  const months = Array.from({ length: latest.getUTCMonth() + 1 }, (_, index) => {
    const start = monthStart(firstMonth, index), end = Math.min(cutoff, monthStart(start, 1));
    const workdays = dates(start, end).filter(isWorkday);
    const totals = tokenSummary(workdays.flatMap(dayRows));
    const values = workdays.map(day => tokenSummary(dayRows(day)).total).filter(value => value != null);
    return { id: dayOf(start).slice(0, 7), label: (index + 1) + '月', start, end,
      supply: supplyTypes.map(([key]) => readTokens(totals, totals[key])),
      peak: values.length ? Math.max(...values) : null,
      customers: customerComposition(within(facts, start, end), tenants).map(type => type.value) };
  });
  const daily = dates(cutoff - 30 * DAY, cutoff).map(at => ({
    date: dayOf(at), total: tokenSummary(dayRows(at)).total,
  }));
  const measuredDays = daily.filter(row => row.total != null);
  const mean = measuredDays.length ? sum(measuredDays, 'total') / measuredDays.length : null;
  const today = performance(within(dayRows(cutoff), cutoff, now));
  const yesterday = performance(within(dayRows(cutoff - DAY), cutoff - DAY, now - DAY));
  return { now, cutoff, facts, tenants, months, supplyTypes, customerTypes, daily, mean, today, yesterday,
    averages: [workdayAverage(7), workdayAverage(30)] };
}

const usageTiers = [
  { threshold: 1e10, label: '超过 100 亿', color: '#1556be' },
  { threshold: 5e9, label: '50–100 亿', color: '#3279ed' },
  { threshold: 1e9, label: '10–50 亿', color: '#649bf5' },
  { threshold: 1e8, label: '1–10 亿', color: '#9cc1fc' },
  { threshold: -1, label: '1 亿及以下', color: '#dbe9ff' },
];

export function overviewCustomers(snapshot, monthId) {
  const { cutoff, facts, months, tenants } = snapshot;
  const month = months.find(row => row.id === monthId);
  const start = month?.start ?? cutoff - DAY, end = month?.end ?? cutoff;
  const previousStart = month ? monthStart(start, -1) : start - DAY;
  const partialMonth = Boolean(month && end < monthStart(start, 1));
  const previousEnd = partialMonth ? Math.min(start, previousStart + end - start) : start;
  const rows = within(facts, start, end);
  const groups = Map.groupBy(rows.filter(row => row.tenantId), row => row.tenantId);
  const previous = customerIds(within(facts, previousStart, previousEnd)).size;
  const days = (end - start) / DAY;
  const tiers = usageTiers.map(tier => ({ ...tier, value: 0 }));
  const unmeasured = { label: 'Token 未确认', value: 0, color: '#949eb2' };
  const nonToken = { label: '无 Token 类调用', value: 0, color: '#a49cbf' };
  for (const requests of groups.values()) {
    const usage = tokenSummary(requests);
    const tier = usage.pending ? unmeasured : !usage.metered ? nonToken
      : tiers.find(item => usage.total / days > item.threshold);
    tier.value++;
  }
  const recent30 = customerIds(within(facts, end - 30 * DAY, end));
  const registered = [...tenants.values()].map(tenant => [tenant.id, Date.parse(tenant.createdAt)]);
  return { rows, totals: tokenSummary(rows), start, end, previousStart, previousEnd,
    label: month ? '本期' : '昨日', previousLabel: partialMonth ? '上月同期' : month ? '上月' : '前日',
    count: groups.size, previous, added: registered.filter(([, at]) => at >= start && at < end).length,
    recent7: customerIds(within(facts, end - 7 * DAY, end)).size, recent30: recent30.size,
    dormant: registered.filter(([id, at]) => at <= end - 30 * DAY && !recent30.has(id)).length,
    tiers: [...tiers, ...[unmeasured, nonToken].filter(row => row.value)], types: customerComposition(rows, tenants) };
}

export function overviewRanks(rows, kind, state, metric) {
  const isCustomer = kind === 'customer';
  const key = isCustomer ? 'tenantId' : 'modelId';
  const names = new Map((isCustomer ? state.tenants : state.models).map(row => [row.id, row.name]));
  return [...Map.groupBy(rows.filter(row => row[key]), row => row[key])].map(([id, requests]) => {
    const usage = tokenSummary(requests);
    return { id, name: names.get(id) || id, calls: requests.length, total: usage.total, pending: usage.pending };
  }).sort((a, b) => (b[metric] ?? -1) - (a[metric] ?? -1) || a.id.localeCompare(b.id));
}

export function overviewMetrics(snapshot) {
  const { today, yesterday } = snapshot;
  const successChange = today.successRate == null || yesterday.successRate == null ? null : today.successRate - yesterday.successRate;
  return [
    { label: '今日 Token 总量', value: today.total, unit: 'Token', change: overviewChange(today.total, yesterday.total), pending: today.pending },
    { label: '今日模型请求次数', value: today.calls, unit: '次', change: overviewChange(today.calls, yesterday.calls) },
    { label: '调用成功率', value: today.successRate, unit: '%', change: successChange, changeUnit: '个百分点' },
  ];
}

export function overviewSummary(state, range, now) {
  const { start, end, priorStart, priorEnd, hourly } = usageWindow(range, now);
  const today = usagePreset('today', now);
  const day = dayStart(today.end);
  const month = monthStart(day);
  const facts = operationFacts(state, { start: dayOf(Math.min(priorStart, month)), end: today.end }, analysisFilters(), now);
  const rows = within(facts, start, end);
  const prior = within(facts, priorStart, priorEnd);
  const dayRows = within(facts, day, now);
  const monthRows = within(facts, month, now);
  const totals = tokenSummary(rows);
  const daily = tokenSummary(dayRows);
  const users = userBusinessData(state, state.requests);
  const identity = userMetrics(users, today, now);
  const registered = new Set(users.users.filter(user => user.at < now).map(user => user.id));
  const certified = new Set(state.users.filter(user => registered.has(user.id) && user.realNameCertification?.status === '已认证')
    .map(user => user.id));
  const listed = state.models.filter(model => model.listingStatus === '已上架');
  const firstListings = state.models.filter(model => {
    const at = Date.parse(model.firstPublishedAt);
    return at >= month && at < now;
  }).length;
  const confirmedCharges = new Map();
  for (const row of monthRows) {
    if (row.settlement === 'internal' || row.billingStatus === 'not_billable') continue;
    const charge = row.charge;
    const micros = charge?.micros ?? (charge?.unit === 'micro' ? charge.amount : null);
    if (Number.isSafeInteger(micros) && micros >= 0 && /^[A-Z]{3}$/.test(charge.currency)) {
      confirmedCharges.set(charge.currency, (confirmedCharges.get(charge.currency) || 0) + micros);
    }
  }
  const hourlyTokens = [...Map.groupBy(dayRows, row => Math.floor(row.at / HOUR)).values()]
    .map(tokenSummary).filter(bucket => bucket.metered).map(bucket => bucket.total);
  const step = hourly ? HOUR : DAY;
  const buckets = Map.groupBy(rows, row => Math.floor((row.at - start) / step));
  const trend = Array.from({ length: Math.ceil((end - start) / step) }, (_, index) => {
    const at = start + index * step;
    const bucket = buckets.get(index) || [];
    return { label: hourly ? byDate(at).toISOString().slice(11, 16) : dayOf(at),
      tokens: tokenSummary(bucket).total, calls: bucket.length };
  });
  const priorCustomers = new Map(overviewRanks(prior, 'customer', state, 'total').map(row => [row.id, row.total]));
  return { start, end, hourly, rows, totals, trend,
    registered: registered.size, certified: certified.size, listed: listed.length, firstListings,
    daily, peak: hourlyTokens.length ? Math.max(...hourlyTokens) : daily.total,
    monthTokens: tokenSummary(monthRows), spend: [...confirmedCharges].map(([currency, micros]) => ({ currency, value: micros / 1e6 })),
    mau: identity.mau.at(-1) ?? null,
    customers: overviewRanks(rows, 'customer', state, 'total').map(row => ({ ...row, change: overviewChange(row.total, priorCustomers.get(row.id)) })),
    models: overviewRanks(rows, 'model', state, 'total'),
  };
}
