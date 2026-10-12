import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminSeed } from '../src/admin-v2/store.js';
import { createCalcloudSeed, calcloudTransaction, calcloudFacts, calcloudSummary, calcloudBuckets, calcloudCosts, pricedUsage, validateIcon, emptyBinding } from '../src/admin-v2/calcloud-domain.mjs';

test('独立配置不修改原状态；角色和引用删除保护生效',()=>{
  const state=createAdminSeed(),before=JSON.stringify(state),config=createCalcloudSeed(state);
  assert.equal(JSON.stringify(state),before);
  const provider={id:'p-new',code:'new-provider',name:'新服务商',ownership:'自定义服务',baseUrl:'https://service.invalid/v1',credential:'fake-local',external:false};
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
  const m={id:'new',name:'Test-Model',icon:'data:image/png;base64,abc',tags:['推理'],type:'text',series:'Test',precision:'BF16',description:'测试',bindings:[emptyBinding(config.providers[0].id)]};
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
  const model=config.models.find(m=>m.bindings.length),route={id:'new-route',name:'new-route',modelMatch:'精确匹配',pathMatch:'前缀匹配',path:'/',headers:[],query:[],targets:[{modelId:model.id,providerId:model.bindings[0].providerId,percent:80}],fallback:[],fallbackEnabled:false};
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
