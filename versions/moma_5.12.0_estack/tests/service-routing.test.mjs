import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminSeed, commitAdminState, persistModelAction, parseAdminState } from '../src/admin-v2/store.js';
import { routingServices, routingChannels, serviceRoute, activeRouteVersion, routeSourceVersion, normalizeRouteConfig, validateRouteConfig, routingStatus, routePreview, routeGroups, comparableRouteCosts } from '../src/admin-v2/service-routing.js';
import { activeSupplyPrice } from '../src/admin-v2/model-management.js';
import { connectionFingerprint } from '../src/admin-v2/connection-state.js';
import { canAccessPage, pageFromHash, pages } from '../src/admin-v2/navigation.mjs';

const baseline = () => {
  const state = createAdminSeed(); state.models.find(item=>item.id==='model-1').serviceMode='standard'; const service = routingServices(state).find(item => item.modelId === 'model-1' && item.mode === 'standard');
  for (const endpoint of state.endpoints.filter(item=>state.modelSupplies.some(supply=>supply.modelId===service.modelId && supply.endpointId===item.id))) {endpoint.baseUrl=endpoint.baseUrl.replace(/\/$/,'')+'/chat/completions';endpoint.connectionTest={fingerprint:connectionFingerprint(endpoint),result:'通过',testedAt:'2026-01-01'};}
  const channels = routingChannels(state, service).filter(item => item.available);
  assert.ok(channels.length >= 2);
  const config = { strategy: 'weighted', autoFailover: true, channels: channels.slice(0, 2).map((item, i) => ({ supplyId: item.id, weight: i ? 30 : 70, enabled: true })) };
  return { state, service, channels, config };
};
const action = (state, service, config, operation = 'serviceRoutePublish', patch = {}) => ({ type: 'modelOperations', operation, data: { serviceId: service.id, expectedVersion: serviceRoute(state, service.id)?.activeVersion || 0, sourceVersion: routeSourceVersion(state, service), config, ...patch } });

test('route services reference existing stable model and supplier call IDs without creating or modifying sale records', () => {
  const { state } = baseline(), before = structuredClone(state), services = routingServices(state);
  assert.equal(new Set(services.map(item => item.id)).size, services.length);
  assert.equal(services.filter(item => item.mode === 'standard').length, 1);
  for (const service of services) {
    assert.ok(state.models.some(model => model.id === service.modelId));
    assert.ok(service.mode === 'standard' ? service.callId === service.model.modelId : state.modelSupplies.some(supply => supply.callId === service.callId));
  }
  assert.deepEqual(state, before);
  const model = state.models[0], id = services.find(item => item.modelId === model.id).id;
  model.name = '新的展示名称';
  assert.equal(routingServices(state).find(item => item.id === id).model.name, '新的展示名称');
});

test('weighted routing validates positive exact percentages, duplicate and foreign references', () => {
  const { state, service, config } = baseline();
  assert.equal(validateRouteConfig(state, service, config).channels[0].weight, 70);
  for (const value of [NaN, Infinity, -1, 101, '1e2', '0.001']) {
    const next = structuredClone(config); next.channels[0].weight = value;
    assert.throws(() => validateRouteConfig(state, service, next), /权重/);
  }
  const next = structuredClone(config); next.channels[1].weight = 29.99;
  assert.throws(() => validateRouteConfig(state, service, next), /100%/);
  assert.throws(() => validateRouteConfig(state, service, { ...config, channels: [config.channels[0], config.channels[0]] }), /重复/);
  assert.throws(() => validateRouteConfig(state, service, { ...config, channels: [{ supplyId: 'missing', weight: 100 }] }), /不属于/);
  assert.throws(() => validateRouteConfig(state, service, { ...config, channels: [] }), /至少/);
});

test('health, protocol validation, capability mismatch and stopped providers block publish', () => {
  for (const mutate of [
    (s, c) => { s.modelSupplies.find(item => item.id === c.id).status = '已停用'; },
    (s, c) => { s.modelSupplies.find(item => item.id === c.id).validationStatus = '待验证'; },
    (s, c) => { s.endpoints.find(item => item.id === c.endpointId).baseUrl += '/changed'; },
    (s, c) => { s.providers.find(item => item.id === c.provider.id).status = '已停用'; },
    (s, c) => { s.modelSupplies.find(item => item.id === c.id).capabilities.context = 1; },
  ]) {
    const { state, service, config, channels } = baseline(); mutate(state, channels[0]);
    assert.throws(() => validateRouteConfig(state, service, config));
  }
});

test('only explicit model service modes and Provider associations expose routing',()=>{
 const {state,service,config}=baseline();
 assert.equal(routingServices(state).length,1);
 assert.equal(validateRouteConfig(state,service,config).channels.length,2);
 state.models.find(item=>item.id===service.modelId).serviceMode='provider';
 assert.equal(routingServices(state).length,0);
});

test('fixed unified routing keeps distinct same-provider channels and allows cross-provider backups', () => {
  const { state, service, config, channels } = baseline();
  const copy = { ...structuredClone(state.modelSupplies.find(item => item.id === channels[0].id)), id: 'same-provider-backup' };
  const endpoint = structuredClone(state.endpoints.find(item => item.id === copy.endpointId));
  endpoint.id = 'same-provider-second-endpoint'; copy.endpointId = endpoint.id;
  state.endpoints.push(endpoint);
  state.modelSupplies.push(copy);
  state.supplyPrices.push({...structuredClone(activeSupplyPrice(state,channels[0].id)),id:'backup-cost',supplyId:copy.id});
  const next = { strategy: 'fixed', autoFailover: true, channels: [config.channels[0], { supplyId: copy.id, enabled: true, weight: 0 }] };
  assert.equal(validateRouteConfig(state, service, next).channels.length, 2);
  assert.throws(() => validateRouteConfig(state, service, { ...next, autoFailover: false }), /只能启用一个/);
  assert.equal(validateRouteConfig(state,service,{...next,channels:config.channels}).channels.length,2);
});

test('flow preview keeps normal weighted selection separate from failover and reports unavailable traffic', () => {
  const { state, service, config } = baseline();
  assert.deepEqual(routePreview(state, service, config).map(item => item.share), [70, 30]);
  assert.deepEqual(routePreview(state, service, config, config.channels[0].supplyId).map(item => item.share), [0, 100]);
  assert.deepEqual(routePreview(state, service, { ...config, autoFailover: false }, config.channels[0].supplyId).map(item => item.share), [0, 30]);
  assert.deepEqual(routePreview(state, service, { ...config, strategy: 'priority' }).map(item => item.share), [100, 0]);
  assert.deepEqual(routePreview(state, service, { ...config, strategy: 'priority' }, config.channels[0].supplyId).map(item => item.share), [0, 100]);
  state.modelSupplies.find(item => item.id === config.channels[0].supplyId).status = '已停用';
  assert.deepEqual(routePreview(state, service, config).map(item => item.share), [0, 100]);
  state.modelSupplies.find(item => item.id === config.channels[1].supplyId).status = '已停用';
  assert.deepEqual(routePreview(state, service, config).map(item => item.share), [0, 0]);
});

test('route-local exclusion leaves global supply intact and weights only participating channels', () => {
  const { state, service, config } = baseline(), before = structuredClone(state.modelSupplies);
  const next = { ...config, channels: [{ ...config.channels[0], weight: 100 }, { ...config.channels[1], enabled: false }] };
  assert.equal(validateRouteConfig(state, service, next).channels.filter(item => item.enabled).length, 1);
  assert.deepEqual(state.modelSupplies, before);
});

test('draft saves incomplete weights without activation and restores through normal storage parsing', () => {
  const { state, service, config } = baseline(); config.channels[0].weight = 0;
  const next = commitAdminState(state, action(state, service, config, 'serviceRouteDraft'));
  assert.equal(routingStatus(next, service).label, '待配置');
  assert.equal(serviceRoute(next, service.id).activeVersion, 0);
  assert.equal(serviceRoute(next, service.id).versions.length, 0);
  assert.deepEqual(parseAdminState(JSON.stringify(next)).serviceRoutes, next.serviceRoutes);
  assert.throws(() => commitAdminState(next, action(next, service, config)), /100%/);
});

test('publish produces an immutable version and preserves all models, supply, prices, gateway rules and service visibility', () => {
  const { state, service, config } = baseline(), before = structuredClone(state);
  const next = commitAdminState(state, action(state, service, { ...config, apiKey: 'must-not-persist', baseUrl: 'must-not-persist' }));
  const version = activeRouteVersion(serviceRoute(next, service.id));
  assert.equal(version.version, 1);
  assert.equal(routingStatus(next, service).label, '已配置');
  for (const key of Object.keys(state).filter(key => !['serviceRoutes', 'revision', 'updatedAt', 'audits'].includes(key))) assert.deepEqual(next[key], state[key], key);
  assert.deepEqual(state, before);
  assert.doesNotMatch(JSON.stringify(next.serviceRoutes), /must-not-persist|credentialRef|listPrice|purchasePrice/);
});

test('new costs and channel changes between review and publish require fresh validation', () => {
  for (const mutate of [
    (s, c) => { s.endpoints.find(item => item.id === c.endpointId).capacity++; },
    s => { s.models[0].updatedAt = 'changed'; },
    (s, c) => { activeSupplyPrice(s, c.id).inputPrice++; },
  ]) {
    const { state, service, config, channels } = baseline(), review = action(state, service, config);
    mutate(state, channels[0]);
    assert.throws(() => commitAdminState(state, review), /已变化/);
  }
});

test('stale active version and invalid rollback never overwrite an active route', () => {
  const { state, service, config } = baseline(), next = commitAdminState(state, action(state, service, config));
  assert.throws(() => commitAdminState(next, action(next, service, config, 'serviceRoutePublish', { expectedVersion: 0 })), /生效路由已变化/);
  assert.throws(() => commitAdminState(next, action(next, service, config, 'serviceRouteRollback', { version: 999 })), /历史版本/);
  assert.throws(() => commitAdminState(next, action(next, service, config, 'serviceRouteRollback', { version: 1 })), /历史版本/);
});

test('rollback revalidates live channels and creates a new version without deleting history', () => {
  const { state, service, config } = baseline();
  const first = commitAdminState(state, action(state, service, config));
  const second = commitAdminState(first, action(first, service, { ...config, strategy: 'priority' }));
  const third = commitAdminState(second, action(second, service, null, 'serviceRouteRollback', { version: 1 }));
  const route = serviceRoute(third, service.id);
  assert.equal(route.activeVersion, 3);
  assert.equal(route.versions.length, 3);
  assert.deepEqual(route.versions.slice(0, 2), serviceRoute(second, service.id).versions);
  assert.equal(activeRouteVersion(route).rollbackFrom, 1);
  third.modelSupplies.find(item => item.id === config.channels[0].supplyId).status = '已停用';
  assert.equal(routingStatus(third, service).label, '需调整');
  assert.throws(() => commitAdminState(third, action(third, service, null, 'serviceRouteRollback', { version: 1 })), /停用/);
});

test('only operators can configure service routes; generic collection writes cannot bypass validation', () => {
  const { state, service, config } = baseline();
  assert.equal(pages['service-routing'], undefined);
  for (const role of ['平台管理员', '运营人员', '运维人员', '财务人员', '只读观察员']) assert.equal(canAccessPage(role, 'service-routing'), false);
  for (const role of ['平台管理员', '运营人员']) {
    assert.equal(pageFromHash('#/admin-2/service-routing?service=old', role), 'dashboard');
    assert.equal(canAccessPage(role, 'listing'), true);
  }
  for (const role of ['运维人员', '财务人员', '只读观察员']) {
    assert.throws(() => commitAdminState({ ...state, currentRole: role }, action(state, service, config)), /无权/);
  }
  assert.throws(() => commitAdminState(state, { type: 'add', collection: 'serviceRoutes', record: { id: 'forged' } }), /路由管理/);
});

test('revision conflicts and storage failures retain the original route and supplied draft', () => {
  const { state, service, config } = baseline(), input = action(state, service, config), before = structuredClone(state), draft = structuredClone(config);
  const stale = { getItem: () => JSON.stringify({ ...state, revision: state.revision + 1 }), setItem: () => assert.fail('must not write') };
  assert.throws(() => persistModelAction(state, input, stale), /数据已变化/);
  const full = { getItem: () => JSON.stringify(state), setItem: () => { throw new Error('quota'); } };
  assert.throws(() => persistModelAction(state, input, full), /quota/);
  assert.deepEqual(state, before); assert.deepEqual(config, draft);
});

function threeChannels() {
  const data=baseline(),original=data.channels[0],supply={...structuredClone(data.state.modelSupplies.find(item=>item.id===original.id)),id:'route-third-supply',endpointId:'route-third-endpoint'};
  data.state.endpoints.push({...structuredClone(data.state.endpoints.find(item=>item.id===original.endpointId)),id:supply.endpointId});
  data.state.modelSupplies.push(supply);
  data.state.supplyPrices.push({...structuredClone(activeSupplyPrice(data.state,original.id)),id:'route-third-cost',supplyId:supply.id});
  data.config={strategy:'priority_weighted',autoFailover:true,groups:[{id:'P1',name:'主用组',strategy:'weighted'},{id:'P2',name:'备用组',strategy:'weighted'}],channels:[...data.config.channels.map(row=>({...row,groupId:'P1'})),{supplyId:supply.id,enabled:true,weight:100,groupId:'P2'}]};
  return data;
}
test('priority groups normalize and validate per-group weights, membership and nonempty enabled groups',()=>{
  const {state,service,config}=threeChannels();
  assert.equal(validateRouteConfig(state,service,config).channels.length,3);
  for (const change of [value=>{value.groups[1].id='P1';},value=>{value.groups[0].name='';},value=>{value.channels[0].groupId='P9';},value=>{value.channels[2].weight=99;},value=>{value.channels[2].enabled=false;},value=>{value.groups=Array.from({length:11},(_,index)=>({id:'G'+index,name:'组',strategy:'random'}));}]) {
    const value=structuredClone(config);change(value);assert.throws(()=>validateRouteConfig(state,service,value));
  }
  assert.throws(()=>validateRouteConfig(state,service,{...config,strategy:'weighted'}),/100%/);
  const normal=normalizeRouteConfig({...config,channels:config.channels.map((row,index)=>({...row,enabled:index!==0}))});
  assert.equal(normal.channels[0].weight,70);
  assert.deepEqual(routeGroups({strategy:'random'}),[{id:'P1',name:'主用组',strategy:'random'}]);
});
test('priority weighted preview only uses the first viable group and falls back after its last channel fails',()=>{
  const {state,service,config}=threeChannels(),failed=config.channels.slice(0,2).map(row=>row.supplyId);
  assert.deepEqual(routePreview(state,service,config).map(row=>row.share),[70,30,0]);
  assert.deepEqual(routePreview(state,service,config,failed[0]).map(row=>row.share),[0,100,0]);
  assert.deepEqual(routePreview(state,service,config,failed).map(row=>row.share),[0,0,100]);
  assert.deepEqual(routePreview(state,service,{...config,autoFailover:false},failed).map(row=>row.share),[0,0,0]);
  config.groups[0].strategy='random';
  assert.deepEqual(routePreview(state,service,config).map(row=>row.share),[50,50,0]);
  assert.deepEqual(routePreview(state,service,config,config.channels.map(row=>row.supplyId)).map(row=>row.share),[0,0,0]);
});
test('random and metric strategies use equal shares or measured minima, never fabricated statistics',()=>{
  const {state,service,config,channels}=baseline();
  assert.deepEqual(routePreview(state,service,{...config,strategy:'random'}).map(row=>row.share),[50,50]);
  for (const strategy of ['latency','load']) assert.throws(()=>validateRouteConfig(state,service,{...config,strategy}),/实际/);
  state.endpoints.find(item=>item.id===channels[0].endpointId).metrics={p95LatencyMs:80,activeRequests:4};
  state.endpoints.find(item=>item.id===channels[1].endpointId).metrics={p95LatencyMs:120,activeRequests:0};
  assert.deepEqual(routePreview(state,service,{...config,strategy:'latency'}).map(row=>row.share),[100,0]);
  assert.deepEqual(routePreview(state,service,{...config,strategy:'load'}).map(row=>row.share),[0,100]);
  assert.deepEqual(routePreview(state,service,{...config,strategy:'latency'},channels[0].id).map(row=>row.share),[0,100]);
  state.endpoints.find(item=>item.id===channels[1].endpointId).metrics.p95LatencyMs=80;
  assert.deepEqual(routePreview(state,service,{...config,strategy:'latency'}).map(row=>row.share),[50,50]);
  state.endpoints.find(item=>item.id===channels[0].endpointId).metrics.activeRequests=-1;
  assert.equal(routingChannels(state,service).find(item=>item.id===channels[0].id).activeRequests,null);
});
test('cost ranking compares only identical billing keys, units and currencies for the chosen basis',()=>{
  const {state,service,config,channels}=baseline();
  Object.assign(activeSupplyPrice(state,channels[0].id),{inputPrice:1000000,outputPrice:4000000});
  Object.assign(activeSupplyPrice(state,channels[1].id),{inputPrice:2000000,outputPrice:2000000});
  assert.deepEqual(routePreview(state,service,{...config,strategy:'cost',advanced:{costBasis:'input'}}).map(row=>row.share),[100,0]);
  assert.deepEqual(routePreview(state,service,{...config,strategy:'cost',advanced:{costBasis:'output'}}).map(row=>row.share),[0,100]);
  assert.deepEqual(routePreview(state,service,{...config,strategy:'cost',advanced:{costBasis:'total'}}).map(row=>row.share),[0,100]);
  const candidate=id=>({id,costItems:[{name:'生成',unit:'元/秒',currency:'CNY',amount:100}]});
  for (const patch of [{unit:'元/次'},{currency:'USD'},{condition:'长视频'},{name:'请求'},{unit:''},{amount:null}]) {
    const left=candidate('a'),right=candidate('b');Object.assign(right.costItems[0],patch);
    assert.throws(()=>comparableRouteCosts([left,right],'total'),/不能比较|缺少/);
  }
  assert.throws(()=>comparableRouteCosts([candidate('a')],'input'),/缺少/);
});
test('mapping incompatibility blocks publication and all advanced limits are validated before persistence',()=>{
  const {state,service,config,channels}=baseline(),before=structuredClone(state);
  for (const advanced of [{timeoutSeconds:0},{timeoutSeconds:601},{maxRetries:-1},{failureThreshold:0},{recoverySeconds:0},{latencyWindowSeconds:'1e2'},{costBasis:'cheapest'},[]]) assert.throws(()=>commitAdminState(state,action(state,service,{...config,advanced})));
  const next=commitAdminState(state,action(state,service,{...config,excludeAbnormal:false,autoRecover:false,advanced:{timeoutSeconds:120,maxRetries:2}}));
  const saved=activeRouteVersion(serviceRoute(next,service.id)).config;
  assert.equal(saved.excludeAbnormal,false);assert.equal(saved.autoRecover,false);assert.equal(saved.advanced.timeoutSeconds,120);assert.equal(saved.advanced.maxRetries,2);
  const endpoint=state.endpoints.find(item=>item.id===channels[0].endpointId);endpoint.protocol='Anthropic';endpoint.connectionTest.fingerprint=connectionFingerprint(endpoint);
  assert.equal(routingChannels(state,service).find(item=>item.id===channels[0].id).mapping.valid,false);
  assert.throws(()=>validateRouteConfig(state,service,config),/协议转换适配/);
  endpoint.protocol=before.endpoints.find(item=>item.id===endpoint.id).protocol;endpoint.connectionTest=before.endpoints.find(item=>item.id===endpoint.id).connectionTest;
  assert.deepEqual(state,before);
});
