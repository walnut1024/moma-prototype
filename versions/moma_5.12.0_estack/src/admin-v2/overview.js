import {userBusinessData} from '../business-facts.mjs';
import mockConfig from '../mock/catalogues.json' with { type: 'json' };
import { dayOf } from './analytics.js';
import { userDemo } from './user-analysis.js';
const DAY = 86400000, HOUR = 3600000, OFFSET = 8 * HOUR;
export const overviewPresets = [['today', '今日'], ['day', '昨日'], ['week', '近 7 天'], ['month', '近 30 天']];
export const compactCount = new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 2 }).format;
export const overviewDateTime = time => new Date(time).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
export function overviewPeriods(now = Date.now()) {
  const midnight = Date.parse(`${dayOf(now)}T00:00:00+08:00`);
  return overviewPresets.map(([id, label]) => {
    const days = { today: 1, day: 1, week: 7, month: 30 }[id];
    const start = id === 'today' ? midnight : midnight - days * DAY;
    const end = id === 'today' ? now : midnight;
    return { id, label, start, end, previousStart: start - days * DAY, previousEnd: end - days * DAY,
      hourly: days === 1, partial: id === 'today',
      range: `${dayOf(start)} — ${dayOf(Math.max(start, end - 1))}`,
      comparison: id === 'today' ? '对比昨日同时段' : days === 1 ? '对比前日' : `对比前 ${days} 天` };
  });
}
export function overviewPeriod(now, id, range) {
  if (id !== 'custom') return overviewPeriods(now).find(period => period.id === id) || null;
  const parse = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? Date.parse(`${value}T00:00:00+08:00`) : NaN;
  const start = parse(range?.start), last = parse(range?.end);
  const days = (last - start) / DAY + 1;
  if (!Number.isFinite(days) || days < 1 || days > 365 || dayOf(start) !== range.start || dayOf(last) !== range.end || range.end > dayOf(now)) return null;
  const end = Math.min(last + DAY, now), partial = end < last + DAY;
  return { id, label: '自定义', start, end, hourly: days === 1, partial,
    previousStart: start - days * DAY, previousEnd: end - days * DAY,
    range: `${range.start} — ${range.end}`, comparison: partial ? '对比上一等长周期同时段' : '对比上一等长周期' };
}
const noise = seed => { const n = Math.sin(seed * 12.9898) * 43758.5453; return n - Math.floor(n); };
const models = mockConfig["admin-v2/overview.js"]["models"];
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
  const date = new Date(end - 1 + OFFSET);
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
  let peakHourlyTokens = end > start ? 0 : null;
  const step = hourly ? HOUR : DAY;
  for (let at = start; at < end; at += step) buckets.set(at, { at, label: hourly ? new Date(at + OFFSET).toISOString().slice(11, 16) : dayOf(at).slice(5), ...empty() });
  for (let at = start; at < end; at += HOUR) {
    let hourlyTokens = 0;
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
        hourlyTokens += total;
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
    peakHourlyTokens = Math.max(peakHourlyTokens, hourlyTokens);
  }
  return { ...summary, peakHourlyTokens, activeCustomers: [...tenants.values()].filter(r => r.successfulCalls > 0).length,
    success: summary.calls ? summary.successfulCalls / summary.calls * 100 : null,
    customers: sort([...tenants.values()].map(({ modelIds, ...row }) => ({ ...row, modelCount: modelIds.size }))),
    models: sort([...modelMap.values()].map(({ customerIds, ...row }) => ({ ...row, customerCount: customerIds.size }))),
    pairs: [...pairs.values()], trend: [...buckets.values()] };
}
export function overviewRates(total, start, end) {
  if (end <= start) return {averageTpd:null};
  const days = Math.floor((end - 1 + OFFSET) / DAY) - Math.floor((start + OFFSET) / DAY) + 1;
  return {averageTpd:total / days};
}

export function overviewDemo(now = Date.now(), periodId = 'day', range) {
  const period = overviewPeriod(now, periodId, range);
  if (!period) throw new RangeError('无效统计时间范围');
  const current = aggregate(period.start, period.end, period.hourly);
  const previous = aggregate(period.previousStart, period.previousEnd, period.hourly);
  const identities = userDemo(now);
  return { ...current, rates:overviewRates(current.total,period.start,period.end), registrations: overviewRegistrations(identities.users, period.end), monthlyActive: overviewMonthlyActive(identities, Date.parse(`${dayOf(now)}T00:00:00+08:00`)), period,
    previous: { ...previous, rates:overviewRates(previous.total,period.previousStart,period.previousEnd), registrations: overviewRegistrations(identities.users, period.previousEnd) } };
}

export function overviewBusiness(state, now=Date.now(), periodId='day',range) {
  const period=overviewPeriod(now,periodId,range);
  if(!period)throw new RangeError('无效统计时间范围');
  const aggregateFacts=(start,end)=>{
    const summary=empty(),tenants=new Map(),modelMap=new Map(),pairs=new Map(),buckets=new Map(),hours=new Map(),seen=new Set();
    const step=period.hourly?HOUR:DAY;
    for(let at=start;at<end;at+=step)buckets.set(at,{at,label:period.hourly?new Date(at+OFFSET).toISOString().slice(11,16):dayOf(at).slice(5),...empty()});
    for(const request of state.requests){const id=request.requestId||request.id,time=Date.parse(request.createdAt);if(seen.has(id)||time<start||time>=end||!Number.isFinite(time))continue;seen.add(id);
      const model=state.models.find(row=>row.id===request.modelId),tenant=state.tenants.find(row=>row.id===request.tenantId),usage=request.usage||{},token=['text','multimodal','embedding','rerank'].includes(model?.type)&&Number.isFinite(usage.input)&&Number.isFinite(usage.output)?usage.input+usage.output:0;
      const row={total:token,calls:1,successfulCalls:request.httpStatus>=200&&request.httpStatus<300?1:0,self:0,partner:0};
      const endpoint=state.endpoints.find(row=>row.id===request.endpointId),provider=state.providers.find(row=>row.id===endpoint?.providerId);
      if(provider?.sourceType==='selfHosted')row.self=token;else if(provider)row.partner=token;
      const cid=tenant?.id||request.tenantId||'__unknown__',mid=model?.id||request.modelId||'__unknown__',key=cid+'/'+mid;
      if(!tenants.has(cid))tenants.set(cid,{id:cid,name:tenant?.name||cid,...empty(),modelIds:new Set()});if(!modelMap.has(mid))modelMap.set(mid,{id:mid,name:model?.name||mid,...empty(),customerIds:new Set()});if(!pairs.has(key))pairs.set(key,{customerId:cid,customerName:tenant?.name||cid,modelId:mid,modelName:model?.name||mid,...empty()});
      for(const target of [summary,tenants.get(cid),modelMap.get(mid),pairs.get(key),buckets.get(start+Math.floor((time-start)/step)*step)])add(target,row);
      tenants.get(cid).modelIds.add(mid);modelMap.get(mid).customerIds.add(cid);const hour=Math.floor(time/HOUR);hours.set(hour,(hours.get(hour)||0)+token);
    }
    return {...summary,peakHourlyTokens:Math.max(0,...hours.values()),activeCustomers:tenants.size,success:summary.calls?summary.successfulCalls/summary.calls*100:null,customers:sort([...tenants.values()].map(({modelIds,...row})=>({...row,modelCount:modelIds.size}))),models:sort([...modelMap.values()].map(({customerIds,...row})=>({...row,customerCount:customerIds.size}))),pairs:[...pairs.values()],trend:[...buckets.values()]};
  };
  const current=aggregateFacts(period.start,period.end),previous=aggregateFacts(period.previousStart,period.previousEnd),identities=userBusinessData(state);
  return {...current,period,rates:overviewRates(current.total,period.start,period.end),registrations:overviewRegistrations(identities.users,period.end),monthlyActive:overviewMonthlyActive(identities,now),previous:{...previous,rates:overviewRates(previous.total,period.previousStart,period.previousEnd),registrations:overviewRegistrations(identities.users,period.previousEnd)}};
}
