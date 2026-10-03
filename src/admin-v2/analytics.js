export const matchesSelection = (selected, id) => selected == null || selected.includes(id);
import { percentile } from './observability.js';
import { usageMeter, usageValue } from './usage-analysis.js';
export const dayOf = value => new Date((typeof value === "number" ? value : Date.parse(value)) + 8 * 3600000).toISOString().slice(0, 10);
export const tokens = row => Number(row.usage?.input || 0) + Number(row.usage?.output || 0);
export function filterAnalytics(state, filters) {
  return state.requests.filter(row => {
    const provider = state.endpoints.find(e => e.id === row.endpointId)?.providerId;
    const type = state.models.find(m => m.id === row.modelId)?.type;
    return Date.parse(row.createdAt) <= Date.now() && (!filters.start || dayOf(row.createdAt) >= filters.start) && (!filters.end || dayOf(row.createdAt) <= filters.end) && matchesSelection(filters.tenant, row.tenantId) && matchesSelection(filters.model, row.modelId) && matchesSelection(filters.provider, provider) && (!filters.type || type === filters.type) && (!filters.key || row.keyId === filters.key) && (!filters.source || state.providers.find(p => p.id === provider)?.sourceType === filters.source);
  });
}
export function summarize(rows) {
  const success = rows.filter(r => r.httpStatus >= 200 && r.httpStatus < 300).length;
  const input = rows.reduce((s,r) => s + Number(r.usage?.input || 0), 0), output = rows.reduce((s,r) => s + Number(r.usage?.output || 0), 0);
  const latency = rows.map(r=>r.durationMs).filter(Number.isFinite), first = rows.map(r=>r.ttftMs).filter(Number.isFinite);
  return { calls: rows.length, success, failed: rows.length-success, rate: rows.length ? success/rows.length*100 : null, input, output, total: input+output, avg: latency.length ? latency.reduce((a,b)=>a+b,0)/latency.length : null, p95: percentile(latency,.95), ttft: first.length ? first.reduce((a,b)=>a+b,0)/first.length : null };
}
export function timeBuckets(rows, start, end, hourly = false) {
  const from = Date.parse(`${start}T00:00:00+08:00`), until = Date.parse(`${end}T00:00:00+08:00`)+86400000, step=hourly?3600000:86400000;
  return Array.from({length: Math.max(0, Math.min(744, Math.ceil((until-from)/step)))}, (_,i)=>{
    const time=from+i*step, selected=rows.filter(r=>Date.parse(r.createdAt)>=time && Date.parse(r.createdAt)<time+step);
    return { label: new Date(time+8*3600000).toISOString().slice(5,hourly?16:10).replace('T',' '), rows:selected, ...summarize(selected) };
  });
}

export function previousRange(start, end) {
  const days = (Date.parse(end) - Date.parse(start)) / 86400000 + 1;
  const shift = (value, n) => new Date(Date.parse(value) - n * 86400000).toISOString().slice(0, 10);
  return { start: shift(start, days), end: shift(start, 1) };
}
export function usageChanges(current, previous, key = 'modelId', measure = tokens) {
  const totals = rows => rows.reduce((out, row) => { out[row[key]] = (out[row[key]] || 0) + measure(row); return out; }, {});
  const now = totals(current), before = totals(previous);
  return [...new Set([...Object.keys(now), ...Object.keys(before)])].map(id => ({ id, current: now[id] || 0, previous: before[id] || 0, delta: (now[id] || 0) - (before[id] || 0), percent: before[id] ? ((now[id] || 0) / before[id] - 1) * 100 : null })).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}
export function inputLengthDistribution(rows) {
  const bands = [{ label: '0–4K', max: 4096 }, { label: '4–16K', max: 16384 }, { label: '16–32K', max: 32768 }, { label: '32K+', max: Infinity }].map(b => ({ ...b, calls: 0, tokens: 0 }));
  for (const row of rows) {
    const value = row.usage?.input;
    if (!Number.isFinite(value) || value < 0) continue;
    const band = bands.find(b => value < b.max);
    band.calls++; band.tokens += value;
  }
  return bands;
}
export function firstTenantCalls(rows) {
  const first = new Map();
  for (const row of rows) if (row.tenantId && (!first.has(row.tenantId) || Date.parse(row.createdAt) < Date.parse(first.get(row.tenantId)))) first.set(row.tenantId, row.createdAt);
  return first;
}

// Daily buckets include the preceding day so the first visible day's change is comparable.
export function dailyTokenSupply(state, filters) {
  const start = previousRange(filters.start, filters.start).start;
  const rows = filterAnalytics(state, { ...filters, start });
  const sources = new Map(state.providers.map(p => [p.id, p.sourceType]));
  const endpoints = new Map(state.endpoints.map(e => [e.id, e.providerId]));
  const days = timeBuckets(rows, start, filters.end).map(bucket => {
    const amounts = { self: 0, partner: 0, unknown: 0 };
    for (const row of bucket.rows) {
      const source = sources.get(endpoints.get(row.endpointId));
      amounts[source === 'selfHosted' ? 'self' : source === 'thirdParty' ? 'partner' : 'unknown'] += tokens(row);
    }
    return { label: bucket.label, ...amounts, total: bucket.total };
  });
  return days.slice(1).map((day, i) => ({ ...day, days:1, partial:day.label===dayOf(Date.now()).slice(5), change: day.label!==dayOf(Date.now()).slice(5)&&days[i].total > 0 ? (day.total / days[i].total - 1) * 100 : null }));
}

export function validAnalyticsRange(start, end, granularity = 'day', now = Date.now(), maxDays = granularity === 'week' ? 365 : 30) {
  const days = (Date.parse(end) - Date.parse(start)) / 86400000 + 1;
  return Number.isFinite(days) && days >= 1 && days <= maxDays && end <= dayOf(now);
}
export function weeklyBuckets(rows, start, end, now = Date.now()) {
  const from = Date.parse(`${start}T00:00:00+08:00`), until = Date.parse(`${end}T00:00:00+08:00`) + 86400000;
  const offset = (new Date(from + 8*3600000).getUTCDay()+6)%7;
  const result=[];
  for(let monday=from-offset*86400000; monday<until; monday+=7*86400000) {
    const a=Math.max(from,monday), b=Math.min(until,monday+7*86400000,now);
    const selected=rows.filter(r=>Date.parse(r.createdAt)>=a&&Date.parse(r.createdAt)<b);
    const partial=a!==monday || b!==monday+7*86400000;
    result.push({label:`${dayOf(a).slice(5)}~${dayOf(Math.max(a,b-1)).slice(5)}${partial?'*':''}`,rows:selected,partial,days:Math.max(0,Math.ceil((b-a)/86400000)),...summarize(selected)});
  }
  return result;
}
export function weeklyTokenSupply(state, filters, now = Date.now()) {
  const from=Date.parse(`${filters.start}T00:00:00+08:00`);
  const offset=(new Date(from+8*3600000).getUTCDay()+6)%7;
  const extended={...filters,start:dayOf(from-(offset+7)*86400000)};
  const rows=filterAnalytics(state,extended);
  const provider=new Map(state.providers.map(p=>[p.id,p.sourceType]));
  const endpoint=new Map(state.endpoints.map(e=>[e.id,e.providerId]));
  return weeklyBuckets(rows,filters.start,filters.end,now).map((bucket,index)=>{
    const amounts={self:0,partner:0,unknown:0};
    for(const row of bucket.rows){const source=provider.get(endpoint.get(row.endpointId));amounts[source==='selfHosted'?'self':source==='thirdParty'?'partner':'unknown']+=tokens(row)}
    // Derive the prior calendar week from the first actual bucket boundary, including year rollover.
    const indexStart=from-offset*86400000+index*7*86400000;
    const prior=rows.filter(r=>Date.parse(r.createdAt)>=indexStart-7*86400000&&Date.parse(r.createdAt)<indexStart);
    const total=summarize(prior).total;
    return {label:bucket.label,...amounts,total:bucket.total,days:bucket.days,partial:bucket.partial,change:!bucket.partial&&total>0?(bucket.total/total-1)*100:null};
  });
}

// Customer × model, using observed request fields only.
export function customerModelDetails(state, rows, start, end, now = Date.now()) {
  const days = Math.max(1, (Date.parse(end) - Date.parse(start)) / 86400000 + 1);
  const minutes = Math.max(1, (Math.min(Date.parse(`${end}T00:00:00+08:00`) + 86400000, now) - Date.parse(`${start}T00:00:00+08:00`)) / 60000);
  const models = new Map(state.models.map(model => [model.id, model]));
  const groups = new Map();
  for (const row of rows) {
    const key = JSON.stringify([row.tenantId, row.modelId, usageMeter(models.get(row.modelId), row).unit]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups].map(([id, requests]) => {
    const tenant = state.tenants.find(t => t.id === requests[0].tenantId);
    const model = models.get(requests[0].modelId);
    const unit = usageMeter(model, requests[0]).unit;
    const confirmed = requests.map(row => ({ row, value: usageValue(row, usageMeter(model, row).fields) })).filter(item => item.value.complete);
    const total = confirmed.length ? confirmed.reduce((sum, item) => sum + item.value.total, 0) : null;
    const values = getter => requests.map(getter).filter(Number.isFinite);
    const stats = numbers => ({ avg: numbers.length ? numbers.reduce((a,b)=>a+b,0)/numbers.length : null, max: numbers.length ? Math.max(...numbers) : null });
    const input = stats(unit === 'Token' ? confirmed.map(item => item.row.usage?.input).filter(Number.isFinite) : []);
    const output = stats(unit === 'Token' ? confirmed.map(item => item.row.usage?.output).filter(Number.isFinite) : []);
    const ttftValues = model?.capabilities?.streaming && unit === 'Token' ? values(r=>r.ttftMs) : [];
    const ttft = stats(ttftValues);
    const buckets = new Map();
    for (const r of requests) {
      const minute = Math.floor(Date.parse(r.createdAt)/60000);
      const bucket = buckets.get(minute) || { calls:0, usage:0 };
      bucket.calls++; buckets.set(minute,bucket);
    }
    for (const { row, value } of confirmed) buckets.get(Math.floor(Date.parse(row.createdAt)/60000)).usage += value.total;
    const statuses = [0,0,0,0,0];
    for (const r of requests) {
      const code = r.httpStatus;
      statuses[code >= 200 && code < 300 ? 0 : code === 400 ? 1 : code >= 500 && code < 600 ? 2 : code === 0 ? 3 : 4]++;
    }
    const summary = summarize(requests);
    const peakTpm = unit === 'Token' && confirmed.length ? Math.max(...[...buckets.values()].map(b=>b.usage)) : null;
    const avgTpm = unit === 'Token' && confirmed.length ? total/minutes : null;
    return { id, model:model?.name || requests[0].modelId, customer:tenant?.name || requests[0].tenantId, customerId:requests[0].tenantId,
      unit, total, pending:requests.length-confirmed.length, dailyUsage:total==null?null:total/days, endUsage:confirmed.length?confirmed.filter(item=>dayOf(item.row.createdAt)===end).reduce((sum,item)=>sum+item.value.total,0):null,
      statuses, calls:summary.calls, success:summary.rate, peakTpm, avgTpm,
      ttft:ttft.avg, maxTtft:ttft.max, ttftSamples:ttftValues.length, avgRpm:summary.calls/minutes, maxRpm:Math.max(...[...buckets.values()].map(b=>b.calls)),
      maxInput:input.max, maxOutput:output.max, avgInput:input.avg, avgOutput:output.avg, customerType:tenant?.type,
      activeDays:new Set(requests.map(r=>dayOf(r.createdAt))).size };
  });
}
