import { dayOf } from './analytics.js';
import { usageFacts } from './usage-analysis.js';
import { usageShare, usageTokenValue } from './usage-distributions.js';

const day = 86400000;
const midnight = date => Date.parse(`${date}T00:00:00+08:00`);
const dates = (start, end) => Array.from({ length: (midnight(end) - midnight(start)) / day + 1 }, (_, i) => dayOf(midnight(start) + i * day));

export const billingGroups = [
  ['paid', '付费', '#3568f9'], ['free', '免费', '#18a69a'], ['pending', '归属待确认', '#8a97ac'],
];
export const usageScenes = [['marketplace', '模型广场'], ['dedicated', '专属集群'], ['internal', '内部调用']];
export const modelFamilies = [['jiutian', '九天大模型'], ['qwen', '通义千问'], ['other', '其他大模型']];

function billingGroup(row) {
  if (row.usageBillingClass === 'paid' || row.usageBillingClass === 'free') return row.usageBillingClass;
  if (row.settlement === 'internal' || row.billingStatus === 'not_billable' || row.billingType === 'Token Plan') return 'pending';
  const charge = row.charge?.micros ?? (row.charge?.unit === 'micro' ? row.charge.amount : null);
  return Number.isSafeInteger(charge) && charge > 0 && /^[A-Z]{3}$/.test(row.charge.currency) ? 'paid' : 'pending';
}

function scene(row) {
  if (row.settlement === 'internal') return 'internal';
  return usageScenes.some(([id]) => id === row.usageScene) ? row.usageScene : 'unknown';
}

export function reportTotals(rows) {
  const buckets = Object.fromEntries([...billingGroups, ...usageScenes, ['unknown']].map(([id]) => [id, { tokens: null, calls: 0 }]));
  let tokens = null, pending = 0;
  for (const row of rows) {
    const billed = buckets[billingGroup(row)], scope = buckets[scene(row)];
    billed.calls++;
    scope.calls++;
    if (row.unit !== 'Token') continue;
    const value = usageTokenValue(row);
    if (value === null) { pending++; continue; }
    tokens = (tokens ?? 0) + value;
    billed.tokens = (billed.tokens ?? 0) + value;
    scope.tokens = (scope.tokens ?? 0) + value;
  }
  return { tokens, calls: rows.length, pending, buckets };
}

export function usageChange(current, prior) {
  if (current == null || prior == null || prior === 0) return '—';
  return `${((current - prior) / prior * 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero' })}%`;
}

function modelFamily(model) {
  const code = (model?.modelId || '').toLowerCase().split('/').at(-1);
  if (code?.startsWith('jiutian') || model?.name?.startsWith('九天')) return 'jiutian';
  if (code?.startsWith('qwen') || model?.name?.startsWith('通义千问')) return 'qwen';
  return 'other';
}

export function usageReport(state, range, result, filters, now) {
  const { current, prior } = result;
  const datesEnd = range.end;
  const end = midnight(datesEnd);
  const monthStart = `${datesEnd.slice(0, 7)}-01`;
  const trendStart = dayOf(end - 29 * day);
  const weekStart = dayOf(end - 6 * day);
  const historyStart = monthStart < trendStart ? monthStart : trendStart;
  const history = usageFacts(state, { start: historyStart, end: datesEnd }, filters, now).current;
  const byDate = new Map(dates(historyStart, datesEnd).map(date => [date, []]));
  for (const row of history) byDate.get(dayOf(row.at)).push(row);
  const daily = dates(trendStart, datesEnd).map(date => ({ date, ...reportTotals(byDate.get(date)) }));
  const week = reportTotals(daily.slice(-7).flatMap(({ date }) => byDate.get(date)));
  const models = new Map(state.models.map(model => [model.id, model]));
  const monthDates = dates(monthStart, datesEnd);
  const weeks = [];
  const month = Object.fromEntries([['total'], ...modelFamilies].map(([id]) => [id, null]));
  for (const [dayIndex, date] of monthDates.entries()) {
    const index = Math.floor(dayIndex / 7);
    const bucket = weeks[index] ??= { start: date, end: date, values: { jiutian: null, qwen: null, other: null } };
    bucket.end = date;
    for (const row of byDate.get(date)) {
      const tokens = usageTokenValue(row);
      if (tokens === null) continue;
      const key = modelFamily(models.get(row.modelId));
      month.total = (month.total ?? 0) + tokens;
      month[key] = (month[key] ?? 0) + tokens;
      bucket.values[key] = (bucket.values[key] ?? 0) + tokens;
    }
  }
  for (const key of Object.keys(month)) if (month[key] != null) month[key] /= monthDates.length;
  return {
    selected: reportTotals(current), prior: reportTotals(prior), week, weekStart, daily,
    month, monthStart, weeks,
    models: usageShare(current, 'modelId', 'total'),
    providers: usageShare(current, 'providerId', 'total'),
  };
}
