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
  const m={agent:false,mcp:false,upload:false,id:'new',name:'Test-Model',icon:'data:image/png;base64,abc',tags:['推理'],type:'text',series:'Test',precision:'BF16',description:'测试',updatedAt:'2026-10-10T12:00:00+08:00',bindings:[emptyBinding(config.providers[0].id)]};
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

test('配置目录与统计选择对象联动，历史调用与原状态保留',async()=>{
  const {calcloudAnalyticsState}=await import('../src/admin-v2/calcloud-domain.mjs');
  const state=createAdminSeed(),before=JSON.stringify(state),config=createCalcloudSeed(state);
  const provider={id:'p-config',code:'config',name:'配置服务商',ownership:'OpenAI/OpenAI兼容服务',baseUrl:'https://config.invalid/v1',credential:'fixture-only',description:''};
  let next=calcloudTransaction(config,{collection:'providers',operation:'save',record:provider},state);
  const model={id:'m-config',name:'Configured-Model',type:'text',series:'Configured',description:'模型说明',precision:'BF16',icon:'data:image/png;base64,abc',tags:['文本'],agent:false,mcp:false,upload:false,updatedAt:'2026-10-13T00:00:00Z',bindings:[emptyBinding(provider.id)]};
  next=calcloudTransaction(next,{collection:'models',operation:'save',record:model},state,'2026-10-13T00:00:00Z');
  const view=calcloudAnalyticsState(state,next);
  assert.equal(view.models.find(m=>m.id===model.id).name,model.name);
  assert.equal(view.providers.find(p=>p.id===provider.id).name,provider.name);
  assert.ok(view.modelSupplies.some(s=>s.modelId===model.id));
  assert.equal(view.requests,state.requests);assert.equal(JSON.stringify(state),before);
  assert.equal(view.supplyPrices.find(p=>p.modelId===model.id).inputPrice,3000000);
  assert.equal(view.modelSalePrices.find(p=>p.modelId===model.id).inputPrice,4000000);
});
test('身份锁定、必选能力与请求限流周期在事务层拒绝绕过',()=>{
  const state=createAdminSeed(),config=createCalcloudSeed(state),provider=config.providers[0],model=config.models[0],rule=config.traffic[0];
  assert.throws(()=>calcloudTransaction(config,{collection:'providers',operation:'save',record:{...provider,name:'被改名'}},state),/不可修改/);
  assert.throws(()=>calcloudTransaction(config,{collection:'models',operation:'save',record:{...model,name:'Renamed'}},state),/不可修改/);
  assert.throws(()=>calcloudTransaction(config,{collection:'models',operation:'save',record:{...model,agent:null}},state),/请选择/);
  assert.throws(()=>calcloudTransaction(config,{collection:'traffic',operation:'save',record:{...rule,keyId:state.apiKeys.find(k=>k.id!==rule.keyId).id}},state),/不可修改/);
  assert.throws(()=>calcloudTransaction(config,{collection:'traffic',operation:'save',record:{...rule,requestEnabled:true,requestPeriod:'月'}},state),/仅支持分钟/);
});
test('价格修改追加版本，单日筛选仍显示完整价格历史，未命中输入不重复缓存',async()=>{
  const {calcloudAnalyticsState}=await import('../src/admin-v2/calcloud-domain.mjs');
  const state=factsState(),old={modelId:'m',providerId:'p',unit:'元/百万 Token',status:'生效中',effectiveAt:'2026-10-01T00:00:00+08:00',inputPrice:2000000,outputPrice:4000000,cachedPrice:500000};
  state.supplyPrices=[{...old,inputPrice:1000000}];state.modelSalePrices=[old];
  const config={version:1,providers:[{id:'p',name:'P'}],models:[{id:'m',name:'M',bindings:[{...emptyBinding('p'),prices:{costInput:1,costOutput:2,costCached:.25,saleInput:2,saleOutput:4,saleCached:.5}}]}],routes:[],traffic:[],priceVersions:[]};
  const model={...config.models[0],name:'M',type:'text',series:'M',precision:'BF16',description:'说明',icon:'test',tags:['文本'],agent:false,mcp:false,upload:false,updatedAt:'2026-10-11T00:00:00+08:00',bindings:[{...config.models[0].bindings[0],prices:{costInput:1,costOutput:2,costCached:.25,saleInput:4,saleOutput:4,saleCached:.5}}]};
  // M is intentionally invalid: the model name must have two characters.
  model.name='MM';config.models[0].name='MM';
  const next=calcloudTransaction(config,{collection:'models',operation:'save',record:model},{...state,currentRole:'平台管理员'},'2026-10-11T12:00:00+08:00');
  assert.equal(next.priceVersions.length,2);assert.equal(config.priceVersions.length,0);
  const view=calcloudAnalyticsState(state,next),facts=calcloudFacts(view,{start:'2026-10-12',end:'2026-10-12'});
  const history=calcloudCostHistory(view,facts,'m','p');assert.equal(history.length,2);assert.equal(history[1].calls,1);
  const row=calcloudCosts(view,calcloudFacts(view,{start:'2026-10-11',end:'2026-10-11'}))[0];assert.equal(row.uncached,600000);assert.equal(row.cached,400000);assert.equal(row.total,1100000);assert.equal(row.income,1.8);
});
test('观测自定义保留时分秒，快捷范围与参考前端一致',async()=>{
  const {observationWindow}=await import('../src/admin-v2/calcloud-domain.mjs');const clock=Date.parse('2026-10-13T12:34:56+08:00');
  const custom={start:'2026-10-12T09:01:02+08:00',end:'2026-10-12T10:03:04+08:00'};
  assert.deepEqual(observationWindow('custom',clock,custom),{from:Date.parse(custom.start),to:Date.parse(custom.end)});
  assert.equal(observationWindow('7d',clock).from,Date.parse('2026-10-07T00:00:00+08:00'));
  assert.equal(observationWindow('5m',clock).to-observationWindow('5m',clock).from,300000);
  assert.throws(()=>observationWindow('custom',clock,{start:custom.end,end:custom.start}),/时间范围/);
  assert.throws(()=>observationWindow('custom',clock,{start:custom.start,end:'2026-10-14T00:00:00+08:00'}),/时间范围/);
});

test('非Token计量不伪造输入零值；本地演示Key可显示，未知掩码不补造凭证',async()=>{
 const {calcloudKeyValue}=await import('../src/admin-v2/calcloud-domain.mjs');
 const state=factsState();state.requests=[request({usage:{unit:'张',total:1},inputTokens:null,outputTokens:null})];
 const facts=calcloudFacts(state,{start:'2026-10-11',end:'2026-10-11'});
 assert.equal(calcloudCosts(state,facts)[0].uncached,null);
 assert.equal(calcloudCosts(state,{...facts,rows:[]})[0].uncached,0);
 assert.equal(calcloudKeyValue({keyId:'ak-demo-001'}),'sk-local-fixture-ak-demo-001');
 assert.equal(calcloudKeyValue({keyId:'unknown',secretPreview:'sk-****'}),'sk-****');
});

test('既有配置的当前价格展示联动，不把缺失的历史生效时间补造成历史费用',async()=>{
 const {calcloudAnalyticsState}=await import('../src/admin-v2/calcloud-domain.mjs');
 const state=createAdminSeed(),config=createCalcloudSeed(state),model=config.models.find(m=>m.bindings.length);
 model.bindings[0].prices.costInput=3.123456;
 const linked=calcloudAnalyticsState(state,config),facts=calcloudFacts(linked,{start:'2026-10-12',end:'2026-10-12'});
 const row=calcloudCosts(linked,facts).find(r=>r.modelId===model.id&&r.providerId===model.bindings[0].providerId);
 assert.equal(row.purchase.inputPrice,3123456);
 assert.deepEqual(linked.supplyPrices,state.supplyPrices);
});

test('用户总额度按明确项目管理员共享，编辑Key不重设额度，旧演示字段保留',async()=>{
 const {projectQuotaOwner}=await import('../src/admin-v2/calcloud-domain.mjs');
 const state=createAdminSeed(),config=createCalcloudSeed(state),key=state.apiKeys[1];
 const owner=projectQuotaOwner(state,key.projectId),projects=state.projects.filter(p=>projectQuotaOwner(state,p.id)===owner);
 assert.ok(projects.length>1);
 const rule={id:'shared-quota',projectId:key.projectId,keyId:key.id,tokenEnabled:true,tokenPeriod:'分钟',tokenLimit:1000,totalEnabled:true,totalLimit:50000};
 const saved=calcloudTransaction(config,{collection:'traffic',operation:'save',record:rule},state);
 assert.equal(saved.userTokenQuotas.length,1);assert.equal(saved.userTokenQuotas[0].ownerId,owner);
 assert.equal(saved.traffic.find(r=>r.id===rule.id).totalLimit,undefined);
 const sharedKey=state.apiKeys.find(k=>k.projectId===projects[0].id&&!saved.traffic.some(r=>r.keyId===k.id));
 const next=calcloudTransaction(saved,{collection:'traffic',operation:'save',record:{...rule,id:'shared-quota-2',keyId:sharedKey.id,projectId:sharedKey.projectId,totalLimit:70000}},state);
 assert.equal(next.userTokenQuotas.length,1);assert.equal(next.userTokenQuotas[0].totalLimit,70000);
 const retained=calcloudTransaction(next,{collection:'traffic',operation:'save',record:{...rule,totalEnabled:false,totalLimit:''}},state);
 assert.deepEqual(retained.userTokenQuotas,next.userTokenQuotas);
 const legacy={...config.traffic[0],totalEnabled:true,totalLimit:12000};config.traffic[0]=legacy;
 const kept=calcloudTransaction(config,{collection:'traffic',operation:'save',record:{...legacy,totalEnabled:false,totalLimit:''}},state);
 assert.equal(kept.traffic.find(r=>r.id===legacy.id).totalLimit,12000);
 assert.throws(()=>calcloudTransaction(config,{collection:'traffic',operation:'save',record:{...rule,tokenLimit:1e15}},state),/999999999999999/);
 const unknown={...state,projects:state.projects.map(p=>({...p,managerId:'',ownerId:''}))};
 assert.throws(()=>calcloudTransaction(config,{collection:'traffic',operation:'save',record:rule},unknown),/管理员身份/);
});

test('源表单边界：未来模型日期、路由身份锁定与零权重，绑定允许为空',async()=>{
 const {bindingContext}=await import('../src/admin-v2/calcloud-domain.mjs');
 const state=createAdminSeed(),config=createCalcloudSeed(state),m={...config.models[0],updatedAt:'2026-10-13T10:00:00+08:00',icon:'test',precision:'BF16',tags:['文本'],series:'测试',description:'说明',bindings:[]};
 assert.equal(calcloudTransaction(config,{collection:'models',operation:'save',record:m},state,'2026-10-13T00:00:00Z').models.find(v=>v.id===m.id).bindings.length,0);
 assert.throws(()=>calcloudTransaction(config,{collection:'models',operation:'save',record:{...m,updatedAt:'2026-10-14T00:00:00+08:00'}},state,'2026-10-13T00:00:00Z'),/不能晚于今天/);
 assert.deepEqual(bindingContext({functionType:'NO_CALL',input:1,output:1},32768),{functionType:'NO_CALL',context:32768,step:4096,input:16384,output:16384});
 const route=structuredClone(config.routes.find(r=>r.targets.length>1));assert.ok(route);
 route.targets[0].percent=0;route.targets[1].percent=100;
 assert.equal(calcloudTransaction(config,{collection:'routes',operation:'save',record:route},state).routes.find(r=>r.id===route.id).targets[0].percent,0);
 assert.throws(()=>calcloudTransaction(config,{collection:'routes',operation:'save',record:{...route,name:'renamed'}},state),/不可修改/);
 assert.throws(()=>calcloudTransaction(config,{collection:'routes',operation:'save',record:{...route,pathMatch:'精确匹配'}},state),/路径匹配/);
});

test('价格保存按分钟生效，同分钟后保存版本取最新；空趋势与长范围不伪造或漏计',async()=>{
 const {calcloudAnalyticsState}=await import('../src/admin-v2/calcloud-domain.mjs');
 const state=createAdminSeed(),config=createCalcloudSeed(state),m={...config.models.find(m=>m.bindings.length),icon:'test',precision:'BF16',tags:['文本'],series:'测试',description:'说明',updatedAt:'2026-10-13T09:00:00+08:00'};
 const first=calcloudTransaction(config,{collection:'models',operation:'save',record:m},state,'2026-10-13T10:00:12+08:00');
 const same=calcloudTransaction(first,{collection:'models',operation:'save',record:m},state,'2026-10-13T10:00:20+08:00');
 assert.equal(same.priceVersions.length,first.priceVersions.length*2);
 assert.equal(same.priceVersions[0].effectiveAt,'2026-10-13T02:00:00.000Z');
 const changed={...m,bindings:m.bindings.map(b=>({...b,prices:{...b.prices,costInput:3.123456}}))};
 const last=calcloudTransaction(same,{collection:'models',operation:'save',record:changed},state,'2026-10-13T10:00:30+08:00');
 const view=calcloudAnalyticsState(state,last),history=calcloudCostHistory(view,{rows:[]},m.id,m.bindings[0].providerId);
 assert.equal(history[0].purchase.inputPrice,3123456);
 const empty={from:0,to:60000,rows:[]};assert.deepEqual(calcloudBuckets(empty),[]);
 const duration=400*86400000,lastAt=duration-1,buckets=calcloudBuckets({from:0,to:duration,rows:[{at:lastAt,token:true,input:10,output:2,total:12,cached:0}]});
 assert.equal(buckets.reduce((n,b)=>n+b.calls,0),1);assert.equal(buckets.at(-1).end,duration);
});

test('实际观测响应窗口：近7日完整日、近3日完整小时、5分钟含当前分钟',async()=>{
 const {observationWindow}=await import('../src/admin-v2/calcloud-domain.mjs'),clock=Date.parse('2026-10-13T14:25:30+08:00');
 const seven=observationWindow('7d',clock,null,'operational');assert.equal(seven.from,Date.parse('2026-10-06T00:00:00+08:00'));assert.equal(seven.to,Date.parse('2026-10-13T00:00:00+08:00'));
 const three=observationWindow('3d',clock,null,'operational');assert.equal(three.from,Date.parse('2026-10-10T00:00:00+08:00'));assert.equal(three.to,Date.parse('2026-10-13T14:00:00+08:00'));
 const state=factsState(),five=observationWindow('5m',clock,null,'operational'),facts=calcloudFacts({...state,requests:[]},five,{},clock),bins=calcloudBuckets(facts);
 assert.equal(bins.length,5);assert.equal(bins[0].label,'10-13 14:21');assert.equal(bins.at(-1).label,'10-13 14:25');assert.equal(bins.at(-1).minutes,1);
 assert.equal(calcloudBuckets(calcloudFacts({...state,requests:[]},three,{},clock)).length,86);
 const custom=observationWindow('custom',clock,{start:'2026-10-12T09:00:00+08:00',end:'2026-10-12T11:00:00+08:00'},'operational');assert.equal(calcloudBuckets(calcloudFacts({...state,requests:[]},custom,{},clock)).length,1);
 assert.equal(calcloudSummary([{httpStatus:200,token:true,input:1,output:1,total:2,userId:'u',attempts:[{error:'upstream_timeout'}]}]).timeout,1);
});

test('遗留默认日期包含今日；自定义业务/分类按日期，趋势保留时分秒',async()=>{
 const {calcloudPeriod,calcloudCalendarWindow}=await import('../src/admin-v2/calcloud-domain.mjs'),clock=Date.parse('2026-10-13T14:25:30+08:00');
 assert.deepEqual(calcloudPeriod('7d',clock),{start:'2026-10-07',end:'2026-10-13'});assert.deepEqual(calcloudPeriod('30d',clock),{start:'2026-09-14',end:'2026-10-13'});
 assert.deepEqual(calcloudPeriod('yesterday',clock),{start:'2026-10-12',end:'2026-10-12'});
 const selected={from:Date.parse('2026-10-12T09:00:00+08:00'),to:Date.parse('2026-10-12T11:00:00+08:00')},state=factsState();state.requests=[request({createdAt:'2026-10-12T08:00:00+08:00',httpStatus:504})];
 assert.equal(calcloudFacts(state,selected,{},clock).rows.length,0);assert.equal(calcloudFacts(state,calcloudCalendarWindow(selected),{},clock).rows.length,1);
});

 test('服务商和模型按日补零，含今日的日期范围不会丢失桶终点',()=>{
 const clock=Date.parse('2026-10-13T14:25:30+08:00'),facts=calcloudFacts({...factsState(),requests:[]},{start:'2026-10-07',end:'2026-10-13',bucketMs:86400000},{},clock);
 assert.equal(facts.to,clock);const bins=calcloudBuckets(facts);assert.equal(bins.length,7);assert.equal(bins.at(-1).label,'10-13');assert.ok(bins.every(b=>b.calls===0&&b.total===0));
 });
