import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminSeed } from '../src/admin-v2/store.js';
import { createCalcloudSeed, calcloudTransaction, calcloudFacts, calcloudSummary, calcloudBuckets, calcloudCosts, calcloudCostHistory, pricedUsage, validateIcon, emptyBinding } from '../src/admin-v2/calcloud-domain.mjs';

test('独立配置不修改原状态；角色和引用删除保护生效',()=>{
  const state=createAdminSeed(),before=JSON.stringify(state),config=createCalcloudSeed(state);
  assert.equal(JSON.stringify(state),before);
  const provider={id:'p-new',code:'new-provider',name:'新服务商',ownership:'OpenAI/OpenAI兼容服务',baseUrl:'https://service.invalid/v1',credential:'fake-local',external:false};
  const saved=calcloudTransaction(config,{collection:'providers',operation:'save',record:provider},state);
  assert.equal(config.providers.some(p=>p.id==='p-new'),false);
  assert.equal(saved.providers[0].id,'p-new');assert.equal(JSON.stringify(state),before);
  assert.throws(()=>calcloudTransaction(saved,{collection:'providers',operation:'save',record:{...provider,id:'other'}},state),/已存在/);
  assert.throws(()=>calcloudTransaction(saved,{collection:'providers',operation:'save',record:provider},{...state,currentRole:'运维人员'}),/角色/);
  assert.throws(()=>calcloudTransaction(config,{collection:'providers',operation:'delete',id:config.models.find(m=>m.bindings.length).bindings[0].providerId},state),/引用/);
  const model=config.models.find(m=>m.enabled);assert.throws(()=>calcloudTransaction(config,{collection:'models',operation:'delete',id:model.id},state),/停用/);
  assert.equal(calcloudTransaction(config,{collection:'models',operation:'status',id:model.id,record:{enabled:false}},state).models.find(m=>m.id===model.id).enabled,false);
});
test('模型基本字段、图标及绑定价格必须校验',()=>{
  const state=createAdminSeed(),config=createCalcloudSeed(state);
  const m={id:'new',name:'Test-Model',icon:'data:image/png;base64,abc',tags:['推理'],type:'text',series:'Test',precision:'BF16',description:'测试',updatedAt:'2026-10-10T12:00:00+08:00',bindings:[emptyBinding(config.providers[0].id)]};
  assert.equal(calcloudTransaction(config,{collection:'models',operation:'save',record:m},state).models[0].id,'new');
  assert.throws(()=>calcloudTransaction(config,{collection:'models',operation:'save',record:{...m,bindings:[...m.bindings,...m.bindings]}},state),/不同/);
  assert.throws(()=>calcloudTransaction(config,{collection:'models',operation:'save',record:{...m,bindings:[{...m.bindings[0],prices:{costInput:-1}}]}},state),/非负/);
  assert.throws(()=>validateIcon({size:102401,width:50,height:50,type:'image/png'}),/100KB/);
  assert.throws(()=>validateIcon({size:1024,width:101,height:50,type:'image/png'}),/100/);
});
test('限流周期、项目归属及路由权重的错误不能写入',()=>{
  const state=createAdminSeed(),config=createCalcloudSeed(state),key=state.apiKeys.find(k=>!config.traffic.some(r=>r.keyId===k.id));
  const r={id:'t1',keyId:key.id,projectId:key.projectId,tokenEnabled:true,tokenLimit:1000,tokenPeriod:'分钟'};
  const saved=calcloudTransaction(config,{collection:'traffic',operation:'save',record:r},state);
  assert.throws(()=>calcloudTransaction(saved,{collection:'traffic',operation:'save',record:{...r,id:'t2'}},state),/已有/);
  assert.throws(()=>calcloudTransaction(config,{collection:'traffic',operation:'save',record:{...r,projectId:'other'}},state),/属于/);
  assert.throws(()=>calcloudTransaction(config,{collection:'traffic',operation:'save',record:{...r,tokenPeriod:'小时'}},state),/周期/);
  const model=config.models.find(m=>m.bindings.length),route={id:'new-route',name:'new-route',modelMatch:'精确匹配',pathMatch:'前缀匹配',path:'/',headers:[],query:[],targets:[{mappings:[{modelId:model.id,condition:'精确匹配',targetName:'upstream-model'}],providerId:model.bindings[0].providerId,percent:80}],fallback:[],fallbackEnabled:false};
  assert.throws(()=>calcloudTransaction(config,{collection:'routes',operation:'save',record:route},state),/100%/);
  route.targets[0].percent=100;assert.equal(calcloudTransaction(config,{collection:'routes',operation:'save',record:route},state).routes[0].name,'new-route');
});
const request=(extra={})=>({id:'r',requestId:'r',modelId:'m',endpointId:'e',tenantId:'customer',createdAt:'2026-10-11T00:00:00+08:00',httpStatus:200,usage:{input:1000000,output:100000,cached:400000},durationMs:100,ttftMs:20,...extra});
const factsState=()=>({models:[{id:'m',name:'M',type:'text'}],endpoints:[{id:'e',providerId:'p'}],providers:[{id:'p',name:'P'}],modelSupplies:[{id:'s',modelId:'m',endpointId:'e'}],modelSalePrices:[],supplyPrices:[],requests:[request()]});
test('北京时间完整日、过滤、去重、非Token及缺失样本不会混算',()=>{
  const state=factsState();state.requests.push(request(),request({requestId:'end',createdAt:'2026-10-12T00:00:00+08:00'}),request({requestId:'before',createdAt:'2026-10-10T23:59:59+08:00'}));
  const facts=calcloudFacts(state,{start:'2026-10-11',end:'2026-10-11'}, {},Date.parse('2026-10-12T12:00:00+08:00'));
  assert.equal(facts.rows.length,1);assert.equal(facts.rows[0].total,1100000);
  assert.equal(calcloudBuckets(facts).length,24);assert.equal(calcloudBuckets(facts).reduce((n,b)=>n+b.calls,0),1);
  assert.equal(calcloudFacts(state,{start:'2026-10-11',end:'2026-10-11'},{provider:'other'}).rows.length,0);
  assert.equal(calcloudSummary([{token:false,httpStatus:200}]).total,null);
  assert.equal(calcloudSummary([{token:true,input:100,output:null,total:null}]).total,null);
  assert.equal(calcloudSummary([{token:true,input:100},{token:true,input:null}]).input,null);
  assert.equal(calcloudSummary([{httpStatus:500},{httpStatus:null}]).errorRate,null);
});
test('成本不重复累计缓存，不追算未来价，不混用其他供应服务的价',()=>{
  const state=factsState(),facts=calcloudFacts(state,{start:'2026-10-11',end:'2026-10-11'}),row=facts.rows[0];
  const quote={modelId:'m',unit:'元/百万 Token',status:'生效中',effectiveAt:'2026-10-10',inputPrice:2000000,outputPrice:4000000,cachedPrice:500000};
  assert.equal(pricedUsage(row,quote),1.8);
  assert.equal(pricedUsage({...row,total:null},quote),null);
  assert.equal(pricedUsage({...row,cached:2000000},quote),null);
  state.modelSalePrices=[quote,{...quote,supplyId:'other',inputPrice:9000000,effectiveAt:'2026-10-10T12:00:00Z'}];
  state.supplyPrices=[{...quote,providerId:'p',supplyId:'s',inputPrice:1000000,outputPrice:2000000,cachedPrice:250000}];
  let cost=calcloudCosts(state,facts)[0];assert.equal(cost.income,1.8);assert.equal(cost.cost,0.9);assert.equal(cost.profit,0.9);
  state.modelSalePrices=[{...quote,effectiveAt:'2026-10-12'}];cost=calcloudCosts(state,facts)[0];assert.equal(cost.income,null);assert.equal(cost.profit,null);
});

test('参数匹配条件必须持久化，正则与不受支持的条件在提交时拒绝',()=>{
 const state=createAdminSeed(),config=createCalcloudSeed(state),m=config.models.find(m=>m.bindings.length);
 const r={id:'condition-route',name:'condition-route',path:'/',pathMatch:'前缀匹配',modelMatch:'精确匹配',headers:[{name:'X-Client',condition:'前缀匹配',value:'web-'}],query:[{name:'version',condition:'正则匹配',value:'^v[12]$'}],targets:[{mappings:[{modelId:m.id,condition:'精确匹配',targetName:'upstream-model'}],providerId:m.bindings[0].providerId,percent:100}],fallback:[],fallbackEnabled:false};
 const saved=calcloudTransaction(config,{collection:'routes',operation:'save',record:r},state);
 assert.deepEqual(saved.routes[0].headers,r.headers);assert.deepEqual(saved.routes[0].query,r.query);
 assert.throws(()=>calcloudTransaction(config,{collection:'routes',operation:'save',record:{...r,query:[{name:'version',condition:'正则匹配',value:'['}]}},state),/正则/);
 assert.throws(()=>calcloudTransaction(config,{collection:'routes',operation:'save',record:{...r,headers:[{name:'X',value:'web'}]}},state),/匹配条件/);
});
test('模型更新时间由用户填写，开关独立持久化，不覆盖时间或其他配置',()=>{
 const state=createAdminSeed(),config=createCalcloudSeed(state),m={...config.models[0],updatedAt:'2026-09-01T10:00:00+08:00',icon:'data:image/png;base64,abc',precision:'BF16',tags:['推理'],series:'测试',description:'说明'};
 const saved=calcloudTransaction(config,{collection:'models',operation:'save',record:m},state,'2026-10-13T00:00:00Z');
 assert.equal(saved.models.find(r=>r.id===m.id).updatedAt,m.updatedAt);
 const switched=calcloudTransaction(saved,{collection:'models',operation:'visibility',id:m.id,record:{visible:!m.visible}},state);
 assert.equal(switched.models.find(r=>r.id===m.id).enabled,m.enabled);assert.equal(switched.models.find(r=>r.id===m.id).updatedAt,m.updatedAt);
 assert.throws(()=>calcloudTransaction(config,{collection:'models',operation:'save',record:{...m,updatedAt:''}},state),/更新时间/);
});
test('按明确用户ID统计，平均请求分母覆盖全部调用，不以租户或Key推断身份',()=>{
 const rows=[{userId:'u1',tenantId:'t',token:true,input:10,output:2,total:12},{userId:'u2',tenantId:'t',token:false}];
 let s=calcloudSummary(rows);assert.equal(s.customers,2);assert.equal(s.averageRequest,6);assert.equal(s.averageCustomer,6);
 s=calcloudSummary([{...rows[0],userId:undefined}]);assert.equal(s.customers,null);assert.equal(s.averageCustomer,null);
});
test('成本按价格生效区间拆分；同日变价与边界调用只计一次，缓存用量可见',()=>{
 const state=factsState(),quote={id:'sale-a',modelId:'m',unit:'元/百万 Token',status:'生效中',effectiveAt:'2026-10-10T00:00:00+08:00',inputPrice:2000000,outputPrice:4000000,cachedPrice:500000};
 state.modelSalePrices=[quote,{...quote,id:'sale-b',effectiveAt:'2026-10-11T12:00:00+08:00',inputPrice:4000000}];
 state.supplyPrices=[{...quote,id:'purchase',providerId:'p',supplyId:'s',inputPrice:1000000,outputPrice:2000000,cachedPrice:250000}];
 state.requests=[request(),request({id:'r2',requestId:'r2',createdAt:'2026-10-11T12:00:00+08:00'})];
 const facts=calcloudFacts(state,{start:'2026-10-11',end:'2026-10-11'}),history=calcloudCostHistory(state,facts,'m','p');
 assert.equal(history.length,2);assert.equal(history.reduce((n,h)=>n+h.calls,0),2);assert.equal(history[0].effectiveTo,null);assert.equal(history[1].effectiveTo,history[0].effectiveFrom);
 assert.equal(history[0].profit,2.1);assert.equal(history[1].profit,.9);assert.equal(calcloudCosts(state,facts)[0].cached,800000);
 state.requests=[];const zero=calcloudCosts(state,{...facts,rows:[]});assert.equal(zero.length,1);assert.equal(zero[0].calls,0);
});

test('每个服务的多条名称映射、降级响应码与单个降级服务一起保存',()=>{
 const state=createAdminSeed(),config=createCalcloudSeed(state),model=config.models.find(m=>m.bindings.length),providerId=model.bindings[0].providerId;
 const target={providerId,percent:100,mappings:[{modelId:model.id,condition:'精确匹配',targetName:'model-alias'}]},route={id:'mapping-route',name:'mapping-route',pathMatch:'前缀匹配',path:'/',headers:[],query:[],targets:[target],fallbackEnabled:true,fallbackCodes:['5xx'],fallback:[{providerId,mappings:target.mappings}]};
 const saved=calcloudTransaction(config,{collection:'routes',operation:'save',record:route},state);assert.deepEqual(saved.routes[0].fallbackCodes,['5xx']);assert.equal(saved.routes[0].targets[0].mappings[0].targetName,'model-alias');
 assert.throws(()=>calcloudTransaction(config,{collection:'routes',operation:'save',record:{...route,fallbackCodes:[]}},state),/响应码/);
 assert.throws(()=>calcloudTransaction(config,{collection:'routes',operation:'save',record:{...route,targets:[{...target,mappings:[]}] }},state),/映射规则/);
 assert.throws(()=>calcloudTransaction(config,{collection:'models',operation:'delete',id:model.id},state),/停用/);
});
