import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterAnalytics, summarize, timeBuckets } from '../src/admin-v2/analytics.js';
test('analytics filters use Beijing boundaries and never add cache or seconds to tokens',()=>{
 const row={createdAt:'2026-09-14T17:00:00Z',tenantId:'a',endpointId:'e',modelId:'m',httpStatus:200,durationMs:20,ttftMs:null,usage:{input:100,output:20,cached:40,seconds:5}};
 const state={requests:[row,{...row,tenantId:'b',httpStatus:500}],endpoints:[{id:'e',providerId:'p'}],models:[{id:'m',type:'text'}],providers:[{id:'p',sourceType:'selfHosted'}]};
 const rows=filterAnalytics(state,{start:'2026-09-15',end:'2026-09-15',tenant:['a'],provider:['p']});
 assert.equal(filterAnalytics(state,{tenant:['a','b'],model:['m'],provider:['p']}).length,2);
 assert.equal(filterAnalytics(state,{tenant:[]}).length,0);
 assert.equal(filterAnalytics(state,{tenant:null}).length,2);
 assert.equal(filterAnalytics(state,{tenant:['a'],provider:['other']}).length,0);
 assert.equal(rows.length,1);assert.equal(summarize(rows).total,120);assert.equal(summarize(rows).ttft,null);
 assert.equal(timeBuckets(rows,'2026-09-15','2026-09-15')[0].total,120);
 assert.equal(filterAnalytics(state,{start:'2026-09-16'}).length,0);assert.equal(summarize([]).rate,null);
});

import { previousRange, usageChanges, inputLengthDistribution, firstTenantCalls } from '../src/admin-v2/analytics.js';
test('period comparison, delta ordering, length boundaries and first calls stay consistent',()=>{
 assert.deepEqual(previousRange('2026-09-09','2026-09-15'),{start:'2026-09-02',end:'2026-09-08'});
 const row=(modelId,input)=>({modelId,usage:{input}});
 const changes=usageChanges([row('a',10),row('b',30)],[row('a',100)]);
 assert.equal(changes[0].delta,-90);assert.equal(changes[0].percent,-90);assert.equal(changes[1].percent,null);
 assert.deepEqual(inputLengthDistribution([row('a',0),row('a',4096),row('a',16384),row('a',32768),{usage:{seconds:10}}]).map(b=>b.calls),[1,1,1,1]);
 assert.equal(firstTenantCalls([{tenantId:'a',createdAt:'2026-09-12T00:00:00Z'},{tenantId:'a',createdAt:'2026-09-10T00:00:00Z'}]).get('a'),'2026-09-10T00:00:00Z');
});

import { dailyTokenSupply } from '../src/admin-v2/analytics.js';
test('daily supply splits source, includes previous day and leaves zero-base growth unavailable',()=>{
 const row=(date,endpointId,input)=>({createdAt:date+'T12:00:00+08:00',endpointId,tenantId:'a',usage:{input},httpStatus:200});
 const state={requests:[row('2026-09-08','s',100),row('2026-09-09','s',80),row('2026-09-09','p',120),row('2026-09-11','x',50)],providers:[{id:'self',sourceType:'selfHosted'},{id:'partner',sourceType:'thirdParty'}],endpoints:[{id:'s',providerId:'self'},{id:'p',providerId:'partner'}],models:[]};
 const days=dailyTokenSupply(state,{start:'2026-09-09',end:'2026-09-11'});
 assert.equal(days.length,3);assert.equal(days[0].self,80);assert.equal(days[0].partner,120);assert.equal(days[0].change,100);
 assert.equal(days[1].change,-100);assert.equal(days[2].change,null);assert.equal(days[2].unknown,50);
 assert.equal(days.reduce((n,d)=>n+d.total,0),250);
});

import { validAnalyticsRange, weeklyBuckets, weeklyTokenSupply, dayOf } from '../src/admin-v2/analytics.js';
test('day/week limits are inclusive and weeks use Monday boundaries with partial periods',()=>{
 const now=Date.parse('2026-09-23T12:00:00+08:00');
 assert.equal(validAnalyticsRange('2026-08-25','2026-09-23','day',now),true);
 assert.equal(validAnalyticsRange('2026-08-24','2026-09-23','day',now),false);
 assert.equal(validAnalyticsRange('2025-09-24','2026-09-23','week',now),true);
 assert.equal(validAnalyticsRange('2025-09-23','2026-09-23','week',now),false);
 assert.equal(validAnalyticsRange('2026-09-23','2026-09-23','day',now),true);
 assert.equal(validAnalyticsRange('2026-09-23','2026-09-24','day',now),false);
 assert.equal(validAnalyticsRange('2026-08-24','2026-09-23','day',now,31),true);
 assert.equal(validAnalyticsRange('2026-08-23','2026-09-23','day',now,31),false);
 assert.equal(validAnalyticsRange('2026-09-24','2026-09-23','day',now,31),false);
 const buckets=weeklyBuckets([],'2025-12-31','2026-01-12',now);
 assert.deepEqual(buckets.map(b=>b.days),[5,7,1]);assert.deepEqual(buckets.map(b=>b.partial),[true,false,true]);
 const row=(date,input)=>({createdAt:date+'T12:00:00+08:00',usage:{input},endpointId:'s'});
 const state={requests:[row('2026-01-01',100),row('2026-01-06',200)],models:[],providers:[{id:'p',sourceType:'selfHosted'}],endpoints:[{id:'s',providerId:'p'}]};
 const supply=weeklyTokenSupply(state,{start:'2026-01-05',end:'2026-01-11'},now);
 assert.equal(supply[0].change,100);assert.equal(supply[0].self,200);
 assert.equal(weeklyTokenSupply(state,{start:'2026-01-06',end:'2026-01-11'},now)[0].change,null);
 const today=dayOf(Date.now());state.requests=[{createdAt:today+'T00:00:00+08:00',usage:{input:1}},{createdAt:new Date(Date.now()+86400000).toISOString(),usage:{input:2}}];
 assert.equal(filterAnalytics(state,{start:today,end:today}).length,1);
});

import { customerModelDetails } from '../src/admin-v2/analytics.js';
test('customer model details group independently, count minute peaks and preserve absent metrics',()=>{
 const r={tenantId:'a',modelId:'m',createdAt:'2026-09-15T00:00:10+08:00',httpStatus:200,usage:{input:100,output:20},ttftMs:40};
 const state={tenants:[{id:'a',name:'客户',type:'企业'}],models:[{id:'m',name:'模型',type:'text',capabilities:{streaming:true}},{id:'n',name:'视频模型',type:'video'}]};
 const out=customerModelDetails(state,[r,{...r,httpStatus:500,ttftMs:null},{...r,modelId:'n',usage:{seconds:5}}],'2026-09-15','2026-09-15',Date.parse('2026-09-16T00:00:00+08:00'));
 assert.equal(out.length,2);assert.equal(out[0].unit,'Token');assert.equal(out[0].total,120);assert.equal(out[0].pending,1);assert.equal(out[0].peakTpm,120);assert.equal(out[0].maxRpm,2);assert.equal(out[0].avgTpm,120/1440);assert.equal(out[0].success,50);assert.equal(out[0].ttft,40);assert.equal(out[0].ttftSamples,1);assert.equal(out[0].activeDays,1);assert.equal(out[0].endUsage,120);assert.equal(out[1].unit,'秒');assert.equal(out[1].total,5);assert.equal(out[1].peakTpm,null);assert.equal(out[1].maxInput,null);
});
test('customer details keep incompatible meters separate and confirmed failures count only when reported',()=>{
 const at='2026-09-15T08:00:00+08:00';
 const state={tenants:[{id:'t',name:'客户'}],models:[{id:'m',name:'语音',type:'audio'}]};
 const base={tenantId:'t',modelId:'m',createdAt:at};
 const rows=[{...base,httpStatus:200,usage:{characters:100}},{...base,httpStatus:500,usageConfirmed:true,usage:{characters:30}},{...base,httpStatus:500,usage:{characters:20}},{...base,httpStatus:200,usage:{seconds:5}}];
 const out=customerModelDetails(state,rows,'2026-09-15','2026-09-15',Date.parse('2026-09-16T00:00:00+08:00'));
 assert.equal(out.length,2);
 assert.deepEqual(out.map(row=>[row.unit,row.total,row.pending,row.peakTpm]),[['字符',130,1,null],['秒',5,0,null]]);
});
test('detail status segments are exclusive and cover every request including missing status',()=>{
 const requests=[200,201,400,401,429,500,599,0,null,undefined,302].map(httpStatus=>({tenantId:'t',modelId:'m',httpStatus,createdAt:'2026-09-15T08:00:00+08:00'}));
 const [row]=customerModelDetails({tenants:[],models:[]},requests,'2026-09-15','2026-09-15');
 assert.deepEqual(row.statuses,[2,1,2,1,5]);assert.equal(row.statuses.reduce((a,b)=>a+b,0),row.calls);assert.equal(row.success,2/11*100);
});
