import test from 'node:test';
import assert from 'node:assert/strict';
import {changeRouteStrategy, routeStrategyChoices, routeEditConfig, sameRouteConfig, routeChangeRows} from '../src/admin-v2/route-workspace.js';
import {normalizeRouteConfig} from '../src/admin-v2/service-routing.js';
const service={mode:'standard'};
const config=normalizeRouteConfig({strategy:'weighted',autoFailover:true,autoRecover:true,channels:[{supplyId:'a',weight:60,enabled:true},{supplyId:'b',weight:40,enabled:true}]});
const channels=[{id:'a',channelName:'自营',provider:{name:'MoMA'}},{id:'b',channelName:'转售',provider:{name:'MoMA'}}];

test('unified choices are restricted without rewriting existing route history or provider choices',()=>{
  assert.deepEqual(routeStrategyChoices(service),['fixed','weighted','latency']);
  assert.deepEqual(routeStrategyChoices({mode:'provider'}),['fixed','weighted','latency']);
  assert.equal(routeEditConfig({mode:'provider'},null,[channels[0]]).strategy,'fixed');
  const saved={...structuredClone(config),strategy:'random'};
  const route={activeVersion:1,versions:[{version:1,config:saved}]},before=structuredClone(route);
  assert.equal(routeEditConfig(service,route,channels).strategy,'random');
  assert.deepEqual(route,before);
});

test('new unified routes use weighted strategy even for a single channel without enabling failover',()=>{
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
test('publish review detects parameter-only and preserved runtime changes without treating typed numeric weights as changes',()=>{
  const typed=structuredClone(config);typed.channels[0].weight='60';
  assert.ok(sameRouteConfig(config,typed));assert.deepEqual(routeChangeRows(config,typed,channels),[]);
  const changed=structuredClone(config);changed.advanced.costBasis='output';changed.autoFailover=false;
  const rows=routeChangeRows(config,changed,channels);assert.deepEqual(rows.map(row=>row.label),['故障转移','成本口径']);
});

test('fixed strategy selects only one channel while weighted and latency retain multiple selections',()=>{
 const before=structuredClone(config);
 assert.equal(changeRouteStrategy(config,'fixed').channels.filter(row=>row.enabled).length,1);
 for(const strategy of ['weighted','latency'])assert.equal(changeRouteStrategy(config,strategy).channels.filter(row=>row.enabled).length,2);
 assert.deepEqual(config,before);
});
