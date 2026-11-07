import { usageFacts, usageWindow, usageMeter, usageValue } from './usage-analysis.js';
import { priceItems } from './model-management.js';

export const analysisFilters = () => ({ types: null, tenant: null, model: null, providers: [], channels: null, user: null });
export function operationFacts(state, range, filters, now = Date.now(), upstream = false) {
  const models=new Map(state.models.map(model=>[model.id,model]));
  for(const request of state.requests)if(request.modelId && request.modelType && !models.has(request.modelId))models.set(request.modelId,{id:request.modelId,type:request.modelType});
  const facts = (usageFacts({...state,models:[...models.values()]}, range, upstream ? {...filters,providers:[],channels:null} : filters, now)?.current || []).filter(row=>!diagnosticRequest(row));
  if (!upstream || !filters.providers?.length && filters.channels == null) return facts;
  const selected = attempt => {
    const provider = attempt.procurementSnapshot?.providerId || state.endpoints.find(item => item.id === attempt.endpointId)?.providerId;
    return filters.providers?.includes(provider) || filters.channels?.includes(attempt.endpointId);
  };
  return facts.flatMap(row => {
    const attempts = (row.attempts?.length ? row.attempts : [{endpointId:row.endpointId}]).filter(selected);
    return attempts.length ? [{...row,attempts,served:attempts.some(attempt => attempt.endpointId === row.endpointId)}] : [];
  });
}
const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
export function supplySummary(rows) {
  const durations = rows.map(row => row.durationMs).filter(value => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
  const ttfts = rows.map(row => row.ttftMs).filter(value => Number.isFinite(value) && value >= 0);
  const success = rows.filter(row => row.httpStatus >= 200 && row.httpStatus < 300).length;
  const tokens = rows.filter(row => row.unit === 'Token' && row.value.complete), units = {};
  for (const row of rows) if (row.unit !== 'Token' && row.value.complete) units[row.unit] = (units[row.unit] || 0) + row.value.total;
  return { total: tokens.reduce((sum, row) => sum + row.value.total, 0), pending: rows.filter(row => !row.value.complete).length, units, calls: rows.length, customers: new Set(rows.map(row => row.tenantId).filter(Boolean)).size, models: new Set(rows.map(row => row.modelId)).size, successRate: rows.length ? success / rows.length * 100 : null, errorRate: rows.length ? (rows.length - success) / rows.length * 100 : null, avgMs: mean(durations), p95Ms: durations.length ? durations[Math.ceil(durations.length * .95) - 1] : null, ttftMs: mean(ttfts), latencySamples: durations.length };
}
const preflightErrors = new Set(['auth_rejected','model_not_authorized','enterprise_model_not_authorized','enterprise_quota_exhausted','model_scope_rejected','quota_exhausted','rate_limit_exceeded','no_available_endpoint','provider_service_required','provider_price_unavailable','model_price_unavailable']);
function upstreamAttempt(attempt) {
  return attempt.dispatched !== false && !!attempt.endpointId && !(attempt.durationMs === 0 && preflightErrors.has(attempt.error));
}
function supplyIdentityKnown(state,row,attempt) {
  const snapshot=attempt.procurementSnapshot || (attempt.endpointId===row.endpointId ? row.procurementSnapshot : null);
  if (snapshot?.modelId && snapshot.modelId!==row.modelId) return false;
  if (snapshot || attempt.supplyId || row.supplyId && attempt.endpointId===row.endpointId) return true;
  return (state.modelSupplies || []).some(supply=>supply.modelId===row.modelId && supply.endpointId===attempt.endpointId);
}
export function unresolvedSupply(state,rows) {
  return rows.filter(row=>(row.attempts?.length ? row.attempts : [{endpointId:row.endpointId}]).some(attempt=>upstreamAttempt(attempt) && !supplyIdentityKnown(state,row,attempt)));
}
function upstreamOutcome(attempt) {
  if (attempt.status === 'passed' || attempt.httpStatus >= 200 && attempt.httpStatus < 300) return true;
  if (attempt.status === 'failed' || attempt.error || attempt.httpStatus >= 400) return false;
  return Object.hasOwn(attempt, 'error') && attempt.error === null ? true : null;
}
export function supplyGroups(state, rows, channels = false) {
  const groups = new Map();
  for (const row of rows) {
    const attempts = row.attempts?.length ? row.attempts.filter(upstreamAttempt) : row.endpointId ? [{endpointId:row.endpointId}] : [];
    for (const attempt of attempts) {
      if (!supplyIdentityKnown(state,row,attempt)) continue;
      const providerId = attempt.procurementSnapshot?.providerId || (attempt.endpointId === row.endpointId ? row.procurementSnapshot?.providerId : null) || state.endpoints.find(item => item.id === attempt.endpointId)?.providerId || '__unknown__';
      const id = channels ? attempt.endpointId : providerId;
      if (!groups.has(id)) groups.set(id, new Map());
      const requests = groups.get(id), requestId = row.requestId || row.id;
      if (!requests.has(requestId)) requests.set(requestId, {...row,providerId,served:false,attempts:[]});
      const entry = requests.get(requestId);
      entry.attempts.push(attempt);
      if (row.served !== false && attempt.endpointId === row.endpointId) entry.served = true;
    }
  }
  return [...groups].map(([id, requests]) => {
    const facts = [...requests.values()], served = facts.filter(row => row.served), attempts = facts.flatMap(row => row.attempts);
    const outcomes = attempts.map(upstreamOutcome), known = outcomes.filter(value => value !== null), failed = known.filter(value => value === false).length;
    const durations = attempts.map(row => row.durationMs).filter(value => Number.isFinite(value) && value >= 0).sort((a,b) => a-b);
    return {id,name:(channels ? state.endpoints : state.providers).find(item => item.id === id)?.name || id,provider:state.providers.find(item => item.id === facts[0].providerId)?.name || '未归属',...supplySummary(served),attemptsCount:attempts.length,failedAttempts:failed,unknownAttempts:outcomes.length-known.length,successRate:known.length ? (known.length-failed)/known.length*100 : null,errorRate:known.length ? failed/known.length*100 : null,avgMs:mean(durations),p95Ms:durations.length ? durations[Math.ceil(durations.length*.95)-1] : null,ttftMs:null,latencySamples:durations.length,rows:facts};
  }).sort((a,b) => b.calls-a.calls || b.attemptsCount-a.attemptsCount);
}
export function operationBuckets(rows, range, now = Date.now()) {
  const window = usageWindow(range, now);
  if (!window) return [];
  const step = 86400000, buckets = [];
  for (let start = window.start; start < window.end; start += step) {
    const at = new Date(start + 8 * 3600000).toISOString();
    buckets.push({ start, end: Math.min(start + step, window.end), label: at.slice(5, 10), rows: [] });
  }
  for (const row of rows) {
    const index = Math.floor((Date.parse(row.createdAt) - window.start) / step);
    if (buckets[index]) buckets[index].rows.push(row);
  }
  return buckets;
}
export function supplyChannelGroups(state, rows) {
  const models = [...new Set(rows.map(row=>row.modelId))];
  return models.flatMap(modelId=>supplyGroups(state,rows.filter(row=>row.modelId===modelId),true).map(group=>({...group,endpointId:group.id,id:JSON.stringify([modelId,group.id]),modelId,modelName:state.models.find(model=>model.id===modelId)?.name || modelId})));
}
export function supplyShareRows(groups, unit) {
  const rows = groups.map(group=>({id:group.id,name:group.name,value:unit==='Token'?group.total:group.units?.[unit] || 0}));
  const total = rows.reduce((sum,row)=>sum+row.value,0);
  return total>0?rows.filter(row=>row.value>0).map(row=>({...row,value:row.value/total*100})).sort((a,b)=>b.value-a.value):[];
}
export function supplyShareSlices(groups, unit) {
  const rows = supplyShareRows(groups,unit).map(row=>({...row,share:row.value,value:unit==='Token'?groups.find(group=>group.id===row.id).total:groups.find(group=>group.id===row.id).units[unit]}));
  return rows.length>5 ? [...rows.slice(0,5),{id:null,name:'其他',value:rows.slice(5).reduce((sum,row)=>sum+row.value,0),share:rows.slice(5).reduce((sum,row)=>sum+row.share,0)}] : rows;
}
export function supplyCoverageRows(groups, bucketGroups) {
  return [...groups].sort((a,b)=>b.customers-a.customers || b.calls-a.calls).map(group=>({id:group.id,name:group.name,values:bucketGroups.map(rows=>{
    const daily=rows.find(row=>row.id===group.id);
    return daily?.rows.some(row=>row.served && !row.tenantId) ? null : daily?.customers ?? 0;
  })}));
}
export function requestPrices(state, row) {
  const snapshot = row.procurementSnapshot;
  const sale = Object.hasOwn(row, 'priceSnapshot') ? row.priceSnapshot : (state.modelSalePrices || []).find(item => item.id === row.priceVersionId && item.modelId === row.modelId);
  return { sale: sale || null, cost: snapshot?.items ? { ...snapshot, id: snapshot.versionId || row.procurementVersionId || 'request-price:' + (row.requestId || row.id), effectiveAt: snapshot.effectiveAt || snapshot.selectedAt } : null };
}
function measure(item, row) {
  if (item.condition?.trim()) return null;
  const unit = item.unit?.replace(/^元\//, '').replace(/Tokens?/i, 'Token').trim(), name = item.name || '';
  if (unit === '百万 Token') {
    if (/缓存.*(写|创建)/.test(name)) return ['cacheWrite', 1000000];
    if (/缓存/.test(name)) return ['cached', 1000000];
    if (/输出/.test(name)) return ['output', 1000000];
    if (/输入/.test(name) || name === '单价' && ['embedding', 'rerank'].includes(row.modelType)) return ['input', 1000000];
    if (/总 Token|Token 用量/.test(name)) return ['total', 1000000];
  }
  if (['张', '次', '千次', '秒', '分钟', '字符', '万字符'].includes(unit)) return [{ '张': 'images', '次': 'calls', '千次': 'calls', '秒': 'seconds', '分钟': 'seconds', '字符': 'characters', '万字符': 'characters' }[unit], { '千次': 1000, '分钟': 60, '万字符': 10000 }[unit] || 1];
  return null;
}
export function priceRequest(price, row, model) {
  if (!price?.id || !Number.isFinite(Date.parse(price.effectiveAt)) || !Number.isFinite(Date.parse(row.createdAt)) || Date.parse(price.effectiveAt) > Date.parse(row.createdAt) || price.expiresAt && Date.parse(price.expiresAt) <= Date.parse(row.createdAt) || row.usageConfirmed === false) return null;
  const items = priceItems(price, model), fields = items.map(item => measure(item, row));
  if (!items.length || fields.some(item => !item) || new Set(fields.map(item => item[0])).size !== fields.length || fields.some(([key]) => key === 'total') && fields.length !== 1) return null;
  const currencies = new Set(items.map(item => item.currency));
  if (currencies.size !== 1 || !/^[A-Z]{3}$/.test(items[0].currency)) return null;
  const breakdown = [];
  for (let index = 0; index < items.length; index++) {
    const item = items[index], [field, divisor] = fields[index];
    if (!Number.isSafeInteger(item.amount) || item.amount < 0) return null;
    let quantity = field === 'calls' ? 1 : field === 'total' ? row.value?.complete ? row.value.total : null : row.usage?.[field];
    if (field === 'input' && fields.some(([key]) => key === 'cached')) quantity = Number.isFinite(quantity) && Number.isFinite(row.usage?.cached) ? quantity - row.usage.cached : null;
    if (!Number.isFinite(quantity) || quantity < 0) return null;
    breakdown.push({ name: item.name, quantity, unit: item.unit, price: item.amount / 1000000, amount: Math.ceil(quantity / divisor * item.amount) / 1000000 });
  }
  return { currency: items[0].currency, amount: breakdown.reduce((sum, item) => sum + Math.round(item.amount * 1000000), 0) / 1000000, breakdown, versionId: price.id, effectiveAt: price.effectiveAt, expiresAt: price.expiresAt || null };
}
const sumMoney = values => values.reduce((sum, value) => sum + Math.round(value * 1000000), 0) / 1000000;
export function salesService(row, price) {
  const byPrice = price?.scope === 'model' ? 'standard:' + row.modelId : price?.scope === 'provider' && price.providerId ? 'provider:' + row.modelId + ':' + price.providerId : price?.serviceId;
  if (row.serviceId && byPrice && row.serviceId !== byPrice || price?.modelId && price.modelId !== row.modelId) return null;
  return row.serviceId || byPrice || null;
}
function diagnosticRequest(row) {
  return ['trial','gateway-test','metering-test','platform-trial'].some(value=>row.identityType===value || row.purpose===value) || /^req_(gateway|demo)_/.test(row.requestId || '');
}
export function customerRequest(row) {
  if (diagnosticRequest(row)) return false;
  return row.purpose === 'customer' || row.identityType === 'client' || !!(row.serviceId || row.callId || row.priceSnapshot || row.priceVersionId);
}
export function unlinkedUsage(rows) {
  return rows.filter(row => !row.purpose && !row.identityType && !customerRequest(row));
}
export function procurementFacts(state, row) {
  const model = state.models.find(item => item.id === row.modelId) || {id:row.modelId,type:row.modelType};
  const raw = row.attempts?.length ? row.attempts : row.procurementSnapshot && row.endpointId ? [{endpointId:row.endpointId,procurementSnapshot:row.procurementSnapshot}] : [];
  const final = raw.findLastIndex(attempt => attempt.endpointId === row.endpointId && upstreamOutcome(attempt) !== false);
  return raw.flatMap((attempt, index) => {
    if (!upstreamAttempt(attempt)) return [];
    const snapshot = attempt.procurementSnapshot || (index === final ? row.procurementSnapshot : null);
    const providerId = snapshot?.providerId || state.endpoints.find(item => item.id === attempt.endpointId)?.providerId || null;
    const usage = Object.hasOwn(attempt,'usage') ? attempt.usage : index === final && row.httpStatus >= 200 && row.httpStatus < 300 ? row.usage : null;
    const price = snapshot?.items ? {...snapshot,id:snapshot.versionId || 'attempt-price:' + (row.requestId || row.id) + ':' + index,effectiveAt:snapshot.effectiveAt || snapshot.selectedAt} : null;
    const free = attempt.billingStatus === 'not_billable';
    const measured = usage ? usageValue({...row,usage,usageConfirmed:true},usageMeter(model,{...row,usage}).fields) : null;
    const cost = free ? {currency:price?.items?.[0]?.currency || null,amount:0,breakdown:[],versionId:price?.id || 'not-billable'} : usage ? priceRequest(price,{...row,usage,usageConfirmed:true,value:measured},model) : null;
    return [{id:(row.requestId || row.id) + ':' + index,requestId:row.requestId || row.id,modelId:row.modelId,modelName:model.name || row.modelId,createdAt:row.createdAt,error:attempt.error || attempt.code || '',order:index+1,providerId,provider:state.providers.find(item=>item.id===providerId)?.name || providerId || '未归属',endpointId:attempt.endpointId,channel:state.endpoints.find(item=>item.id===attempt.endpointId)?.name || attempt.endpointId,status:upstreamOutcome(attempt) === true ? '成功' : upstreamOutcome(attempt) === false ? '失败' : '结果待确认',durationMs:attempt.durationMs ?? null,usage,cost,reason:cost ? '' : !usage ? '上游计量缺失' : !price ? '采购价格快照缺失' : '采购计费项或计量无法核算',price,final:index===final}];
  });
}
export function businessFacts(state, rows) {
  return rows.filter(customerRequest).map(row => {
    const prices = requestPrices(state,row), serviceId = salesService(row,prices.sale), model = state.models.find(item=>item.id===row.modelId) || {id:row.modelId,type:row.modelType};
    const sale = serviceId && row.billingStatus === 'not_billable' ? {currency:prices.sale?.items?.[0]?.currency || null,amount:0,breakdown:[],versionId:prices.sale?.id || 'not-billable'} : serviceId && row.httpStatus >= 200 && row.httpStatus < 300 ? priceRequest(prices.sale,row,model) : null;
    const purchases = procurementFacts(state,row), costCurrencies = [...new Set(purchases.map(item=>item.cost?.currency).filter(Boolean))];
    const costsComplete = purchases.length > 0 && purchases.every(item=>item.cost) && costCurrencies.length <= 1;
    const notDispatched = row.attempts?.length > 0 && row.attempts.every(attempt=>attempt.dispatched===false);
    const cost = notDispatched ? {currency:sale?.currency || prices.sale?.items?.[0]?.currency || null,amount:0,breakdown:[],versionId:'not-dispatched'} : costsComplete ? {currency:costCurrencies[0] || sale?.currency || null,amount:sumMoney(purchases.map(item=>item.cost.amount)),breakdown:purchases.flatMap(item=>item.cost.breakdown),versionId:purchases.map(item=>item.cost.versionId).join(' / ')} : null;
    const complete = !!(serviceId && sale && cost && sale.currency && sale.currency === cost.currency);
    const reasons = [!serviceId ? '销售服务未关联' : '', !sale ? !prices.sale ? '销售价格快照缺失' : row.httpStatus >= 400 ? '客户计费结果待确认' : '销售计量或计费项无法核算' : '', !cost ? !purchases.length ? '上游调用记录缺失' : purchases.some(item=>!item.cost) ? '上游采购成本未完整核算' : '采购成本币种不一致' : '',sale && cost && sale.currency !== cost.currency ? '采购与销售币种不同，未换汇' : ''].filter(Boolean);
    return {...row,serviceId,serviceName:row.callId || serviceId || '未归属销售服务',serviceMode:serviceId?.startsWith('standard:') ? '统一服务' : serviceId?.startsWith('provider:') ? '分服务商服务' : '未确认',modelName:model?.name || row.modelId,customer:state.tenants?.find(item=>item.id===row.tenantId)?.name || row.tenantId || '未归属客户',sale,cost,purchases,complete,currency:sale?.currency || cost?.currency || null,profit:complete ? sumMoney([sale.amount,-cost.amount]) : null,reason:reasons.join('；')};
  });
}
export function businessCurrencyRows(rows, currency) {
  return rows.filter(row => row.sale?.currency === currency || row.cost?.currency === currency || row.purchases?.some(item=>item.cost?.currency===currency) || !row.sale?.currency && !row.cost?.currency);
}
export function businessSummary(rows, currency) {
  const selected = currency ? businessCurrencyRows(rows,currency) : rows;
  const currencies = new Set(selected.flatMap(row=>[row.sale?.currency,row.cost?.currency,...(row.purchases || []).map(item=>item.cost?.currency)]).filter(Boolean));
  const target = currency || (currencies.size === 1 ? [...currencies][0] : null);
  const sales = selected.filter(row=>row.sale && (!target || row.sale.currency===target));
  const costs = selected.filter(row=>row.cost && (!target || row.cost.currency===target));
  const confirmed = selected.filter(row=>row.complete && (!target || row.currency===target));
  const pending = selected.length-confirmed.length;
  const knownCosts = selected.flatMap(row=>row.purchases?.length ? row.purchases.map(item=>item.cost).filter(Boolean) : row.cost ? [row.cost] : []).filter(item=>!target || item.currency===target);
  const income = target && sales.length ? sumMoney(sales.map(row=>row.sale.amount)) : null, cost = target && knownCosts.length ? sumMoney(knownCosts.map(item=>item.amount)) : null;
  const profit = !pending && income != null && cost != null ? sumMoney([income,-cost]) : null;
  return {calls:selected.length,confirmed:confirmed.length,pending,income,cost,profit,margin:income && profit != null ? profit/income*100 : null,incomePending:selected.length-sales.length,costPending:selected.length-costs.length,coverage:selected.length ? confirmed.length/selected.length*100 : null};
}
export function callMarginWaterfall(row) {
  if (!row.complete || !row.sale?.currency || row.sale.currency!==row.cost?.currency || !Number.isFinite(row.sale.amount) || !Number.isFinite(row.cost.amount)) return null;
  const income=row.sale.amount,cost=row.cost.amount,profit=sumMoney([income,-cost]);
  return {currency:row.sale.currency,steps:[{name:'应计收入',value:income,base:0,amount:income},{name:'采购成本扣减',value:cost,base:profit,amount:-cost},{name:'调用毛利',value:profit,base:0,amount:profit}]};
}
export function businessBuckets(rows, gaps, range, now, currency) {
  const missing=operationBuckets(gaps,range,now);
  return operationBuckets(rows,range,now).map((bucket,index)=>{
    const values=bucket.rows.length?businessSummary(bucket.rows,currency):{income:rows.length&&!missing[index]?.rows.length?0:null,cost:rows.length&&!missing[index]?.rows.length?0:null};
    return {...bucket,income:values.income,cost:values.cost};
  });
}
export function businessGroups(state, rows, dimension = 'serviceId', currency) {
  const groups = new Map();
  for (const row of currency ? businessCurrencyRows(rows,currency) : rows) {
    const key = JSON.stringify([row.serviceId || '__unattributed__', currency || row.currency]);
    if (!groups.has(key)) groups.set(key,[]);
    groups.get(key).push(row);
  }
  return [...groups].map(([id,facts])=>({id,serviceId:facts[0].serviceId,name:facts[0].serviceName,model:facts[0].modelName,mode:facts[0].serviceMode,currency:currency || facts[0].currency,customers:new Set(facts.map(row=>row.tenantId).filter(Boolean)).size,...businessSummary(facts,currency || facts[0].currency),rows:facts})).sort((a,b)=>(b.income ?? -Infinity)-(a.income ?? -Infinity));
}
export function procurementGroups(rows, currency) {
  const groups = new Map();
  for (const row of rows) for (const purchase of row.purchases || []) {
    if (purchase.cost?.currency && purchase.cost.currency!==currency) continue;
    const key=purchase.providerId || '__unknown__';
    if (!groups.has(key)) groups.set(key,{id:key,name:purchase.provider,cost:0,confirmed:0,pending:0,attemptsCount:0,rows:[]});
    const group=groups.get(key);group.attemptsCount++;group.rows.push(purchase);
    if (purchase.cost) {group.cost=sumMoney([group.cost,purchase.cost.amount]);group.confirmed++;} else group.pending++;
  }
  return [...groups.values()].map(group=>({...group,cost:group.confirmed ? group.cost : null})).sort((a,b)=>(b.cost ?? -1)-(a.cost ?? -1));
}
export function analysisCsv(headers, rows) {
  const escape = value => {
    const text = typeof value === 'string' ? value.replace(/^[=+@\-\t\r]/, match => "'" + match) : String(value ?? '—');
    return '"' + text.replaceAll('"', '""') + '"';
  };
  return '\ufeff' + [headers, ...rows].map(row => row.map(escape).join(',')).join('\r\n');
}
