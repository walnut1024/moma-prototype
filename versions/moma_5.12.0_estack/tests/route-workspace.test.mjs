import test from 'node:test';
import assert from 'node:assert/strict';
import {changeRouteStrategy, routeStrategyChoices, routeEditConfig, sameRouteConfig, routeChangeRows} from '../src/admin-v2/route-workspace.js';
import {normalizeRouteConfig} from '../src/admin-v2/service-routing.js';
const service={mode:'standard'};
const config=normalizeRouteConfig({strategy:'weighted',autoFailover:true,autoRecover:true,channels:[{supplyId:'a',weight:60,enabled:true},{supplyId:'b',weight:40,enabled:true}]});
const channels=[{id:'a',channelName:'自营',provider:{name:'MoMA'}},{id:'b',channelName:'转售',provider:{name:'MoMA'}}];

test('unified choices are restricted without rewriting existing route history',()=>{
  assert.deepEqual(routeStrategyChoices(service),['weighted','load','tpm','latency','cost']);
  assert.deepEqual(routeStrategyChoices({mode:'provider'}),['fixed']);
  assert.equal(routeEditConfig({mode:'provider'},null,[channels[0]]).strategy,'fixed');
  const saved={...structuredClone(config),strategy:'random'};
  const route={activeVersion:1,versions:[{version:1,config:saved}]},before=structuredClone(route);
  assert.equal(routeEditConfig(service,route,channels).strategy,'random');
  assert.deepEqual(route,before);
});

test('new unified routes default to weighted with explicit empty selection and no failover',()=>{
  const single=routeEditConfig(service,null,[channels[0]]), multiple=routeEditConfig(service,null,channels);
  assert.equal(single.strategy,'weighted');assert.equal(multiple.strategy,'weighted');
  assert.equal(single.autoFailover,false);assert.equal(single.autoRecover,false);assert.deepEqual(single.channels,[]);
});
test('opening an existing route preserves runtime settings and never mutates its history',()=>{
  const route={activeVersion:1,versions:[{version:1,config}],draft:null},before=structuredClone(route);
  const editing=routeEditConfig(service,route,channels);
  assert.equal(editing.autoFailover,true);assert.equal(editing.autoRecover,true);assert.ok(sameRouteConfig(editing,config));
  editing.channels[0].weight=50;assert.deepEqual(route,before);
  route.draft={...structuredClone(config),autoFailover:false};assert.equal(routeEditConfig(service,route).autoFailover,true);
});
test('publish review lists weight edits, removed and newly participating channels',()=>{
  const next=structuredClone(config);next.channels[0].weight=100;next.channels=next.channels.slice(0,1);
  const rows=routeChangeRows(config,next,channels);
  assert.equal(rows.length,2);assert.match(rows[0].label,/MoMA.*自营/);assert.match(rows[0].before,/60%/);assert.match(rows[0].after,/100%/);
  assert.equal(rows[1].after,'未加入');assert.equal(sameRouteConfig(config,next),false);
  const first=routeChangeRows(null,config,channels);assert.equal(first.length,3);
});
test('publish review detects route parameters without treating typed numeric weights as changes',()=>{
  const typed=structuredClone(config);typed.channels[0].weight='60';
  assert.ok(sameRouteConfig(config,typed));assert.deepEqual(routeChangeRows(config,typed,channels),[]);
  const changed=structuredClone(config);changed.advanced.costBasis='output';changed.autoFailover=false;
  const rows=routeChangeRows(config,changed,channels);assert.deepEqual(rows.map(row=>row.label),['成本口径']);
});

test('fixed strategy selects only one channel while weighted and latency retain multiple selections',()=>{
 const before=structuredClone(config);
 assert.equal(changeRouteStrategy(config,'fixed').channels.filter(row=>row.enabled).length,1);
 for(const strategy of ['weighted','latency'])assert.equal(changeRouteStrategy(config,strategy).channels.filter(row=>row.enabled).length,2);
 assert.deepEqual(config,before);
});

test('service table preserves merged groups, unavailable channel references and an empty service row',async()=>{
  const {legacySupplierState}=await import('./legacy-supplier-fixture.mjs');
  const {routingServices}=await import('../src/admin-v2/service-routing.js');
  const {routeTableRows}=await import('../src/admin-v2/route-workspace.js');
  const state=legacySupplierState(),model=state.models.find(row=>row.serviceMode==='standard'),service=routingServices(state).find(row=>row.modelId===model.id),before=structuredClone(state);
  state.serviceRoutes=state.serviceRoutes.filter(row=>row.serviceId!==service.id);
  const empty=routeTableRows(state,model,service.id);assert.equal(empty.length,1);assert.equal(empty[0].span,1);assert.equal(empty[0].row,null);
  state.serviceRoutes.push({id:'table-test',serviceId:service.id,activeVersion:1,versions:[{version:1,config:{...config,channels:[{supplyId:'missing-a',enabled:true,weight:60},{supplyId:'disabled',enabled:false,weight:1},{supplyId:'missing-b',enabled:true,weight:40}]}}]});
  const snapshot=structuredClone(state),rows=routeTableRows(state,model,service.id);
  assert.equal(rows.length,2);assert.deepEqual(rows.map(row=>row.span),[2,0]);assert.equal(new Set(rows.map(row=>row.id)).size,2);assert.equal(rows[0].channel,undefined);assert.equal(rows[0].row.supplyId,'missing-a');assert.deepEqual(state,snapshot);assert.deepEqual(state.models,before.models);
});
