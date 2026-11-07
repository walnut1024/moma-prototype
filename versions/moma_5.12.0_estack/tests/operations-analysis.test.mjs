import test from 'node:test';
import assert from 'node:assert/strict';
import { operationFacts, analysisFilters, supplyGroups, supplySummary, supplyChannelGroups, supplyShareRows, supplyShareSlices, supplyCoverageRows, callMarginWaterfall, operationBuckets, requestPrices, priceRequest, businessFacts, businessSummary, businessBuckets, businessGroups, procurementGroups, unresolvedSupply, unlinkedUsage, analysisCsv } from '../src/admin-v2/operations-analysis.js';
import { operationsPeriod } from '../src/admin-v2/usage-analysis.js';
import { pages, canAccessPage } from '../src/admin-v2/navigation.mjs';
const now = Date.parse('2026-10-31T12:00:00+08:00'), range = { start:'2026-10-30', end:'2026-10-30' };
const state = { models:[{id:'m',name:'模型',type:'text',serviceMode:'standard'}], providers:[{id:'p',name:'甲',sourceType:'thirdParty'},{id:'q',name:'乙',sourceType:'selfHosted'}], endpoints:[{id:'e',providerId:'p'},{id:'f',providerId:'q'}], requests:[], modelSupplies:[{id:'s',modelId:'m',endpointId:'e'},{id:'t',modelId:'m',endpointId:'f'}], modelSalePrices:[], supplyPrices:[] };
const row = (id, extra={}) => ({ id,requestId:id,createdAt:'2026-10-30T10:00:00+08:00',modelId:'m',endpointId:'e',tenantId:'t',serviceMode:'standard',httpStatus:200,usage:{input:1000000,output:100000,cached:200000},usageConfirmed:true,durationMs:100,ttftMs:0,...extra });
const price = (id, effectiveAt, amount=1000000, extra={}) => ({ id,effectiveAt,status:'已发布',items:[{name:'输入 Token',unit:'百万 Token',currency:'CNY',amount}],...extra });
test('four analytics destinations preserve workspace role boundaries',()=>{
  for(const id of ['usage-analysis','user-analysis','supply-analysis','business-analysis']) { assert.ok(pages[id]); assert.equal(canAccessPage('运营人员',id),true); assert.equal(canAccessPage('运维人员',id),false); }
});
test('supply facts deduplicate and use actual channel supplier, never model manufacturer',()=>{
  const facts=operationFacts({...state,requests:[row('one'),row('one',{durationMs:200}),row('two',{endpointId:'f',httpStatus:500}),row('future',{createdAt:'2027-01-01T00:00:00Z'})]},range,analysisFilters(),now);
  assert.equal(facts.length,2); assert.equal(supplyGroups(state,facts).length,2); assert.equal(supplySummary(facts).customers,1); assert.equal(supplySummary(facts).successRate,50); assert.equal(supplySummary(facts).ttftMs,0);
  assert.equal(operationFacts({...state,requests:[row('x'),row('y',{endpointId:'f'})]},range,{...analysisFilters(),providers:['q']},now)[0].providerId,'q');
});
test('separate non-Token units and preserve missing latency and usage',()=>{
  const facts=[{...row('a'),unit:'Token',value:{complete:true,total:12}},{...row('b'),unit:'张',value:{complete:true,total:3},durationMs:null,ttftMs:null},{...row('c'),unit:'秒',value:{complete:false,total:0},durationMs:null,ttftMs:null}];
  const result=supplySummary(facts); assert.equal(result.total,12);assert.deepEqual(result.units,{'张':3});assert.equal(result.pending,1);assert.equal(result.latencySamples,1);assert.equal(supplySummary([]).p95Ms,null);
});
test('operations charts use complete Beijing daily buckets and preserve empty days',()=>{
  const buckets=operationBuckets([row('a')],range,now);assert.equal(buckets.length,1);assert.equal(buckets[0].rows.length,1);assert.equal(buckets[0].label,'10-30');
  const days=operationBuckets([row('a')],{start:'2026-10-29',end:'2026-10-30'},now);assert.equal(days.length,2);assert.equal(days[0].rows.length,0);assert.equal(days[1].rows.length,1);
});
test('historical price references are explicit and effective intervals have an exclusive end',()=>{
 const v1=price('v1','2026-10-01T00:00:00+08:00',1000000,{modelId:'m',scope:'model',expiresAt:'2026-10-30T10:00:00+08:00'}),v2=price('v2','2026-10-30T10:00:00+08:00',2000000,{modelId:'m',scope:'model'});
 const fixture={...state,modelSalePrices:[v1,v2]};
 assert.equal(requestPrices(fixture,row('missing')).sale,null);
 assert.equal(requestPrices(fixture,row('version',{priceVersionId:'v1'})).sale.id,'v1');
 assert.equal(priceRequest(v1,row('boundary'),state.models[0]),null);assert.equal(priceRequest(v2,row('boundary'),state.models[0]).amount,2);
 assert.equal(priceRequest(v2,row('before',{createdAt:'2026-10-29T00:00:00+08:00'}),state.models[0]),null);
});
test('expired channel history does not revive a prior supply cost',()=>{
 const fixture={...state,providers:[{id:'p',catalogConnections:[{modelId:'up',endpointId:'e',procurementVersions:[price('expired','2026-10-01T00:00:00Z',1,{expiresAt:'2026-10-02T00:00:00Z'})]}]}],modelSupplies:[{id:'s',modelId:'m',endpointId:'e',upstreamModelId:'up'}],supplyPrices:[price('old','2026-10-01T00:00:00Z',1,{supplyId:'s',status:'生效中'})]};
 assert.equal(requestPrices(fixture,{...row('x'),providerId:'p'}).cost,null);
});
test('cache is not double billed, explicit free price remains zero, missing usage is unknown',()=>{
 const input=price('v','2026-10-01T00:00:00Z'),cached={name:'缓存读取 Token',unit:'百万 Token',currency:'CNY',amount:100000};
 assert.equal(priceRequest({...input,items:[...input.items,cached]},row('a'),state.models[0]).amount,.82);
 assert.equal(priceRequest(price('free','2026-10-01T00:00:00Z',0),row('a'),state.models[0]).amount,0);
 assert.equal(priceRequest(input,row('b',{usage:{}}),state.models[0]),null);
 assert.equal(priceRequest({...input,items:[{...input.items[0],condition:'长上下文'}]},row('c'),state.models[0]),null);
});
test('different currencies never produce a combined profit or a zero for missing money',()=>{
 const good={...row('a'),serviceId:'standard:m',serviceName:'moma/model',complete:true,currency:'CNY',sale:{amount:10,currency:'CNY'},cost:{amount:4,currency:'CNY'}},unknown={...row('b'),complete:false,currency:null};
 assert.equal(businessSummary([good,unknown]).income,10);assert.equal(businessSummary([good,unknown]).pending,1);assert.equal(businessSummary([unknown]).profit,null);
 const usd={...good,id:'usd',currency:'USD',sale:{amount:10,currency:'USD'},cost:{amount:4,currency:'USD'}};assert.equal(businessGroups(state,[good,usd,unknown]).length,3);assert.equal(businessSummary([good,usd]).profit,null);
});
test('usage fixtures remain unpriced and do not mutate business records',()=>{
 const fixture={...state,requests:[row('usage-demo-a')]},before=JSON.stringify(fixture);const facts=operationFacts(fixture,range,analysisFilters(),now);const priced=businessFacts(fixture,facts);
 assert.deepEqual(priced,[]);assert.equal(unlinkedUsage(facts).length,1);assert.equal(JSON.stringify(fixture),before);assert.deepEqual(businessFacts(fixture,facts),priced);
 assert.equal(businessFacts(fixture,operationFacts({...fixture,requests:[row('real',{purpose:'customer'})]},range,analysisFilters(),now))[0].complete,false);
});
test('CSV quotes values and neutralizes spreadsheet formulas',()=>{
 const csv=analysisCsv(['名称'],[['=HYPERLINK("evil")'],['a,b']]);assert.ok(csv.startsWith('\ufeff'));assert.ok(csv.includes("'=HYPERLINK"));assert.ok(csv.includes('"a,b"'));
});

test('a usage-only fixture never invents procurement or sales prices',()=>{
  const facts=operationFacts({...state,requests:[row('usage-demo-without-business')]},range,analysisFilters(),now);
  const prices=requestPrices(state,facts[0]);
  assert.equal(prices.cost,null);
  assert.equal(prices.sale,null);
});
test('recorded service price and actual supply price snapshots survive later configuration edits',()=>{
 const sale=price('recorded-sale','2026-10-01T00:00:00+08:00',2500000,{scope:'model',modelId:'m'});
 const procurement={versionId:'recorded-cost',selectedAt:'2026-10-30T10:00:00+08:00',providerId:'p',items:price('x','2026-10-01',500000).items};
 const actual={...row('business'),providerId:'p',callId:'moma/model',priceSnapshot:sale,procurementSnapshot:procurement,priceVersionId:sale.id,procurementVersionId:procurement.versionId};
 const changed={...state,models:[{...state.models[0],serviceMode:'provider'}],modelSalePrices:[price('new-current','2026-10-01',999000000,{scope:'provider',modelId:'m',providerId:'p'})]};
 const values=businessFacts(changed,[actual])[0];
 assert.equal(values.sale?.amount,2.5);
 assert.equal(values.cost?.amount,.5);
 assert.equal(values.profit,2);
});

test('upstream attempts attribute failover failures and latency to their actual suppliers',()=>{
 const facts=operationFacts({...state,requests:[row('fallback',{endpointId:'f',durationMs:3600,attempts:[{endpointId:'e',durationMs:3000,error:'upstream_timeout'},{endpointId:'f',durationMs:600,error:null}]})]},range,analysisFilters(),now);
 const groups=supplyGroups(state,facts),a=groups.find(r=>r.id==='p'),b=groups.find(r=>r.id==='q');
 assert.equal(a?.calls,0);assert.equal(a?.attemptsCount,1);assert.equal(a?.failedAttempts,1);assert.equal(a?.avgMs,3000);
 assert.equal(b?.calls,1);assert.equal(b?.avgMs,600);assert.equal(b?.successRate,100);
 assert.deepEqual(supplyGroups(state,a.rows,true).map(r=>r.id),['e']);
});
test('a rejected customer request is not counted as an upstream supplier failure',()=>{
 const facts=operationFacts({...state,requests:[row('rejected',{httpStatus:401,error:'auth_rejected',attempts:[{endpointId:'e',durationMs:0,error:'auth_rejected'}]})]},range,analysisFilters(),now);
 assert.deepEqual(supplyGroups(state,facts),[]);
});
test('supplier filtering retains its failed attempts even when a different supplier serves the result',()=>{
 const r=row('filtered-failover',{endpointId:'f',attempts:[{endpointId:'e',durationMs:3000,error:'upstream_timeout'},{endpointId:'f',durationMs:600,error:null}]});
 const facts=operationFacts({...state,requests:[r]},range,{...analysisFilters(),providers:['p']},now,true);
 const groups=supplyGroups(state,facts);assert.equal(groups.length,1);assert.equal(groups[0].id,'p');assert.equal(groups[0].calls,0);assert.equal(groups[0].failedAttempts,1);
});
test('procurement uses each attempt own usage, not the customer total',()=>{
 const snap=(id)=>({versionId:id,selectedAt:'2026-10-30T09:00:00+08:00',providerId:'p',items:[{name:'总 Token',unit:'百万 Token',currency:'CNY',amount:1000000}]});
 const r=row('attempt-usage',{purpose:'customer',serviceId:'standard:m',priceSnapshot:price('sale','2026-10-01',2000000,{scope:'model',modelId:'m'}),attempts:[{endpointId:'e',error:'upstream_timeout',durationMs:100,usage:{input:100,output:0},procurementSnapshot:snap('a')},{endpointId:'e',error:null,durationMs:100,usage:{input:1000000,output:100000},procurementSnapshot:snap('b')}]});
 const fact=businessFacts(state,[r])[0];assert.equal(fact.purchases[0].cost.amount,.0001);assert.equal(fact.purchases[1].cost.amount,1.1);assert.equal(fact.cost.amount,1.1001);
});
test('an explicitly rejected undispatched request creates no upstream cost or supplier failure',()=>{
 const r=row('preflight',{purpose:'customer',serviceId:'standard:m',billingStatus:'not_billable',httpStatus:401,priceSnapshot:price('sale','2026-10-01',2000000,{scope:'model',modelId:'m'}),attempts:[{endpointId:'e',dispatched:false,error:'auth_rejected',durationMs:0}]});
 const fact=businessFacts(state,[r])[0];assert.equal(fact.sale.amount,0);assert.equal(fact.cost.amount,0);assert.equal(fact.profit,0);assert.equal(supplyGroups(state,[r]).length,0);
});

test('unmapped model-channel history is a reconciliation gap, not a claimed supplier contribution',()=>{
const bad={...row('unmapped'),endpointId:'missing',attempts:[{endpointId:'missing',error:null,durationMs:100}]};assert.equal(supplyGroups(state,[bad]).length,0);assert.equal(unresolvedSupply(state,[bad]).length,1);
const historical={...bad,attempts:[{...bad.attempts[0],supplyId:'retired-supply',procurementSnapshot:{providerId:'p'}}]};assert.equal(supplyGroups(state,operationFacts({...state,requests:[historical]},range,analysisFilters(),now)).length,1);
});
test('different purchase and sales currencies stay visible and never create a converted profit',()=>{
 const fact={...row('cross-currency'),serviceId:'standard:m',serviceName:'moma/model',currency:'USD',complete:false,sale:{amount:10,currency:'USD'},cost:{amount:4,currency:'CNY'}};
 const cny=businessGroups(state,[fact],'serviceId','CNY')[0];assert.equal(cny.currency,'CNY');assert.equal(cny.income,null);assert.equal(cny.cost,4);assert.equal(cny.profit,null);
 const usd=businessSummary([fact],'USD');assert.equal(usd.income,10);assert.equal(usd.cost,null);assert.equal(usd.profit,null);
});
test('losses remain negative and CSV keeps numeric losses numeric',()=>{
 const fact={...row('loss'),serviceId:'standard:m',currency:'CNY',complete:true,sale:{amount:1,currency:'CNY'},cost:{amount:2.4,currency:'CNY'}};
 assert.equal(businessSummary([fact],'CNY').profit,-1.4);assert.ok(analysisCsv(['利润'],[[-1.4]]).includes('"-1.4"'));
});
test('removing current model configuration cannot erase an attributed historical service receipt',()=>{
 const r=row('retired-model',{purpose:'customer',serviceId:'standard:m',modelType:'text',priceSnapshot:price('sale','2026-10-01',4000000,{scope:'model',modelId:'m'}),procurementSnapshot:{versionId:'cost',selectedAt:'2026-10-30T09:00:00+08:00',providerId:'p',items:price('c','2026-10-01',2000000).items}});
 const retired={...state,models:[],modelSupplies:[],modelSalePrices:[],requests:[r]};const facts=operationFacts(retired,range,analysisFilters(),now);assert.equal(facts.length,1);const value=businessFacts(retired,facts)[0];assert.equal(value.sale.amount,4);assert.equal(value.cost.amount,2);assert.equal(value.profit,2);
});
test('provider services stay distinct while channels under one provider share the sales service',()=>{
 const make=(id,provider,endpoint,saleAmount)=>{const cost={versionId:'cost-'+id,selectedAt:'2026-10-30T09:00:00+08:00',providerId:provider,items:price('c','2026-10-01',500000).items};return row(id,{purpose:'customer',callId:provider+'/model',endpointId:endpoint,priceSnapshot:price('sale-'+provider,'2026-10-01',saleAmount,{scope:'provider',modelId:'m',providerId:provider}),procurementSnapshot:cost});};
 const facts=businessFacts(state,[make('a','p','e',2000000),make('b','p','another-p-channel',2000000),make('c','q','f',3000000)]);const groups=businessGroups(state,facts,'serviceId','CNY');assert.equal(groups.length,2);assert.equal(groups.find(group=>group.serviceId==='provider:m:p').calls,2);assert.equal(groups.find(group=>group.serviceId==='provider:m:p').income,4);assert.equal(groups.find(group=>group.serviceId==='provider:m:q').income,3);
});
test('known attempt costs reconcile with supplier totals while missing and mixed-currency attempts keep profit pending',()=>{
 const make=(currency,amount)=>({cost:amount==null?null:{currency,amount},providerId:'p',provider:'甲'});
 const fact={...row('partial-cost'),serviceId:'standard:m',complete:false,sale:{currency:'CNY',amount:10},cost:null,purchases:[make('CNY',2),make('USD',3),make('CNY',null)]};
 const cny=businessSummary([fact],'CNY');assert.equal(cny.income,10);assert.equal(cny.cost,2);assert.equal(cny.profit,null);assert.equal(cny.costPending,1);
 const usd=businessSummary([fact],'USD');assert.equal(usd.calls,1);assert.equal(usd.income,null);assert.equal(usd.cost,3);assert.equal(usd.profit,null);
 assert.equal(procurementGroups([fact],'CNY')[0].cost,cny.cost);assert.equal(procurementGroups([fact],'USD')[0].cost,usd.cost);
 assert.equal(businessSummary([fact]).cost,null);
});

test('supply charts exclude explicit diagnostics while retaining unattributed historical customer usage',()=>{
 const requests=[row('legacy'),row('trial',{identityType:'trial'}),row('check',{identityType:'client',purpose:'gateway-test'}),row('req_demo_old'),row('metering',{purpose:'metering-test'}),row('customer',{purpose:'customer'})];
 const facts=operationFacts({...state,requests},range,analysisFilters(),now,true);assert.deepEqual(facts.map(row=>row.requestId),['legacy','customer']);
});
test('daily customer coverage deduplicates independently of period customer coverage',()=>{
 const requests=[row('a',{createdAt:'2026-10-29T12:00:00+08:00'}),row('b'),row('c')],period={start:'2026-10-29',end:'2026-10-30'};
 const facts=operationFacts({...state,requests},period,analysisFilters(),now,true),daily=operationBuckets(facts,period,now).map(bucket=>supplyGroups(state,bucket.rows)[0].customers);
 assert.deepEqual(daily,[1,1]);assert.equal(supplyGroups(state,facts)[0].customers,1);assert.equal(supplyGroups(state,facts)[0].calls,3);
});
test('usage share separates units and does not invent a zero-percent chart',()=>{
 const groups=[{id:'a',name:'甲',total:60,units:{'张':2,'秒':0}},{id:'b',name:'乙',total:40,units:{'张':6}}];
 assert.deepEqual(supplyShareRows(groups,'Token').map(row=>row.value),[60,40]);assert.deepEqual(supplyShareRows(groups,'张').map(row=>[row.id,row.value]),[['b',75],['a',25]]);assert.deepEqual(supplyShareRows(groups,'秒'),[]);
});
test('channel detail keeps model-channel grains and each actual attempt scoped to that model and channel',()=>{
 const two={...state,models:[...state.models,{id:'n',name:'第二模型',type:'text'}],modelSupplies:[...state.modelSupplies,{id:'n-e',modelId:'n',endpointId:'e'}]};
 const facts=operationFacts({...two,requests:[row('one'),row('two',{modelId:'n'})]},range,analysisFilters(),now,true),details=supplyChannelGroups(two,facts);
 assert.equal(details.length,2);assert.equal(new Set(details.map(row=>row.id)).size,2);assert.deepEqual(details.map(row=>row.calls),[1,1]);assert.ok(details.every(row=>row.endpointId==='e'&&row.rows.every(request=>request.modelId===row.modelId)));
});
test('unknown upstream outcomes stay outside success denominators and P95 uses only attempt duration samples',()=>{
 const r=row('unknown-outcomes',{durationMs:99999,attempts:[{endpointId:'e',status:'failed',durationMs:100},{endpointId:'e',status:'unknown'},{endpointId:'e',status:'passed',durationMs:300}]});
 const facts=operationFacts({...state,requests:[r]},range,analysisFilters(),now,true),group=supplyGroups(state,facts)[0];assert.equal(group.successRate,50);assert.equal(group.unknownAttempts,1);assert.equal(group.p95Ms,300);assert.equal(group.latencySamples,2);
});
test('monetary daily trends distinguish missing historical facts from a genuinely empty day',()=>{
 const period={start:'2026-10-28',end:'2026-10-30'},known={...row('known'),serviceId:'standard:m',sale:{currency:'CNY',amount:4},cost:{currency:'CNY',amount:2},complete:true};
 const daily=businessBuckets([known],[row('gap',{createdAt:'2026-10-29T10:00:00+08:00'})],period,now,'CNY');
 assert.deepEqual(daily.map(row=>row.income),[0,null,4]);assert.deepEqual(daily.map(row=>row.cost),[0,null,2]);assert.ok(businessBuckets([],[],period,now,'CNY').every(row=>row.income===null&&row.cost===null));
});
test('supplier donut preserves the full same-unit denominator when grouping the tail',()=>{
 const groups=Array.from({length:7},(_,i)=>({id:String(i),name:'服务商'+i,total:(i+1)*100,units:{'张':i+1}}));
 for(const unit of ['Token','张']){
  const slices=supplyShareSlices(groups,unit),total=unit==='Token'?2800:28;
  assert.equal(slices.length,6);assert.equal(slices.at(-1).id,null);assert.equal(slices.at(-1).name,'其他');
  assert.equal(slices.reduce((sum,row)=>sum+row.value,0),total);assert.ok(Math.abs(slices.reduce((sum,row)=>sum+row.share,0)-100)<1e-10);
  assert.deepEqual(slices.slice(0,5).map(row=>row.id),['6','5','4','3','2']);assert.equal(slices.at(-1).value,unit==='Token'?300:3);
 }
 assert.deepEqual(supplyShareSlices(groups,'秒'),[]);assert.equal(supplyShareSlices(groups.slice(0,1),'Token')[0].share,100);
});
test('coverage matrix deduplicates each day and marks missing customer identity without inventing zero',()=>{
 const facts=operationFacts({...state,requests:[row('a'),row('b'),row('c',{createdAt:'2026-10-29T10:00:00+08:00'}),row('unknown',{endpointId:'f',tenantId:null})]},{start:'2026-10-29',end:'2026-10-30'},analysisFilters(),now,true);
 const buckets=operationBuckets(facts,{start:'2026-10-29',end:'2026-10-30'},now),groups=supplyGroups(state,facts);
 const rows=supplyCoverageRows(groups,buckets.map(bucket=>supplyGroups(state,bucket.rows)));
 assert.deepEqual(rows.find(row=>row.id==='p').values,[1,1]);assert.equal(groups.find(row=>row.id==='p').customers,1);
 assert.deepEqual(rows.find(row=>row.id==='q').values,[0,null]);
});
test('call margin waterfall connects income to cost and preserves negative or zero gross profit',()=>{
 for(const [income,cost,profit] of [[4,2.4,1.6],[1,2.4,-1.4],[0,0,0],[0,2,-2]]){
  const data=callMarginWaterfall({complete:true,sale:{amount:income,currency:'CNY'},cost:{amount:cost,currency:'CNY'}});
  assert.deepEqual(data.steps.map(row=>row.amount),[income,-cost,profit]);assert.equal(data.steps[1].base,profit);
  assert.ok(Math.abs(data.steps[1].base+data.steps[1].value-income)<1e-10);assert.equal(data.steps[2].value,profit);
 }
 for(const row of [{complete:false,sale:{amount:4,currency:'CNY'},cost:null},{complete:true,sale:{amount:4,currency:'CNY'},cost:{amount:2,currency:'USD'}},{complete:true,sale:{amount:NaN,currency:'CNY'},cost:{amount:0,currency:'CNY'}}])assert.equal(callMarginWaterfall(row),null);
});

test('today and custom including today use elapsed supplier and business facts without future requests',()=>{
 const sale=price('sale','2026-10-01T00:00:00+08:00',2500000,{scope:'model',modelId:'m'}),procurement={versionId:'cost',selectedAt:'2026-10-31T10:00:00+08:00',providerId:'p',items:price('cost-price','2026-10-01',500000).items};
 const requests=[row('elapsed',{createdAt:'2026-10-31T11:00:00+08:00',purpose:'customer',callId:'moma/model',priceSnapshot:sale,procurementSnapshot:procurement}),row('future',{createdAt:'2026-10-31T13:00:00+08:00'}),row('yesterday')];
 for(const selected of [operationsPeriod('today',null,now),operationsPeriod('custom',{start:'2026-10-31',end:'2026-10-31'},now)]){
  const facts=operationFacts({...state,requests},selected.range,analysisFilters(),now,true);assert.deepEqual(facts.map(row=>row.requestId),['elapsed']);
  const buckets=operationBuckets(facts,selected.range,now);assert.equal(buckets.length,1);assert.equal(buckets[0].end,now);assert.equal(supplyGroups(state,facts)[0].calls,1);
  const finance=businessFacts(state,facts),summary=businessSummary(finance,'CNY');assert.equal(summary.income,2.5);assert.equal(summary.cost,.5);assert.equal(summary.profit,2);
  const daily=businessBuckets(finance,[],selected.range,now,'CNY');assert.equal(daily.length,1);assert.equal(daily[0].end,now);assert.equal(daily[0].income,2.5);
 }
});
