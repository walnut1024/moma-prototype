import test from 'node:test';
import assert from 'node:assert/strict';
import {changeRouteStrategy, routeStrategyChoices, routeEditConfig, sameRouteConfig, routeChangeRows, routeTableGroups, formatRouteShare} from '../src/admin-v2/route-workspace.js';
import {normalizeRouteConfig, validateRouteConfig} from '../src/admin-v2/service-routing.js';
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

test('the route table includes routed and unused mappings once, and keeps broken references visible',async()=>{
  const {legacySupplierState}=await import('./legacy-supplier-fixture.mjs');
  const {routingServices,routingChannels}=await import('../src/admin-v2/service-routing.js');
  const state=legacySupplierState(),model=state.models.find(row=>row.serviceMode==='standard'),service=routingServices(state).find(row=>row.modelId===model.id);
  const [routed,...unused]=routingChannels(state,service);
  assert.ok(routed && unused.length);
  state.serviceRoutes=state.serviceRoutes.filter(row=>row.serviceId!==service.id);
  const unmapped={...state,modelSupplies:state.modelSupplies.filter(row=>row.modelId!==model.id)};
  const [{rows:empty}]=routeTableGroups(unmapped,model,service.id);
  assert.equal(empty.length,1);assert.equal(empty[0].span,1);assert.equal(empty[0].channel,null);
  assert.deepEqual(routeTableGroups(state,model,service.id)[0].rows.map(row=>[row.row,row.channel.id]),
    [routed,...unused].map(channel=>[null,channel.id]));
  state.serviceRoutes.push({id:'table-test',serviceId:service.id,activeVersion:1,versions:[{version:1,config:{...config,channels:[
    {supplyId:routed.id,enabled:true,weight:60},
    {supplyId:unused[0].id,enabled:false,weight:1},
    {supplyId:'missing',enabled:true,weight:40},
  ]}}]});
  const snapshot=structuredClone(state),[{rows}]=routeTableGroups(state,model,service.id);
  assert.deepEqual(rows[0].group,{id:'P1',order:1,size:2});
  assert.deepEqual(rows.filter(row=>!row.group).map(row=>[row.row?.supplyId,row.channel?.id]),[
    [routed.id,routed.id],['missing',undefined],...unused.map(channel=>[undefined,channel.id]),
  ]);
  assert.deepEqual(rows.map(row=>row.span),[rows.length,...rows.slice(1).map(()=>0)]);
  assert.equal(new Set(rows.map(row=>row.id)).size,rows.length);
  assert.deepEqual(state,snapshot);
  state.serviceRoutes.at(-1).activeVersion=0;
  assert.deepEqual(routeTableGroups(state,model,service.id)[0].rows.filter(row=>!row.group).map(row=>row.channel.id),[routed,...unused].map(channel=>channel.id));
});

test('direct mode groups channels by provider ID while retaining call IDs and mapping addresses',async()=>{
  const {initialModelWorkspace}=await import('../server/model-repository.js');
  const {mappingAddresses}=await import('../src/admin-v2/service-model-mappings.js');
  const state=initialModelWorkspace(),model=state.models.find(row=>row.id==='model-glm53');
  const groups=routeTableGroups(state,model);
  assert.deepEqual(groups.map(({providerName,rows})=>[providerName,rows.map(row=>row.channel.channelName)]),[
    ['移动云 MoMA',['自营渠道','转售渠道']],['智谱',['原厂渠道']],
  ]);
  const sameNames={...state,providers:state.providers.map(provider=>({...provider,name:'同名服务商'}))};
  assert.deepEqual(routeTableGroups(sameNames,model).map(group=>group.providerId),groups.map(group=>group.providerId));
  const all=groups.flatMap(group=>group.rows),primary=all.filter(data=>data.row?.enabled && !data.row.backup);
  const unused=all.find(data=>data.channel && !data.row);
  assert.ok(unused);
  for (const first of all.filter(data=>data.span)) {
    assert.equal(first.span,all.filter(data=>data.service.id===first.service.id).length);
  }
  assert.deepEqual(primary.map(data=>data.service.callId),['glm-5.3-moma','glm-5.3-zhipu']);
  const ownAddress = ({service,channel})=>mappingAddresses(service,channel);
  assert.deepEqual(primary.map(data=>ownAddress(data).map(({label,path,url})=>[label,path,url])),[
    [
      ['OpenAI Chat','/v1/chat/completions','https://moma-self.example.invalid/v1/chat/completions'],
      ['Anthropic Messages','/v1/messages','https://moma-self.example.invalid/v1/messages'],
    ],
    [['OpenAI Chat','/v1/chat/completions',primary[1].channel.url]],
  ]);
  assert.equal(primary[0].channel.available,true,primary[0].channel.reason);
  assert.deepEqual(ownAddress(unused).map(({path,url})=>[path,url]),[['/v1/chat/completions',unused.channel.url]]);
  assert.notEqual(ownAddress(unused)[0]?.url,ownAddress(primary[0])[0]?.url);
});

test('the inline route table shows draft channels and per-group shares without changing the published route',async()=>{
  const {legacySupplierState}=await import('./legacy-supplier-fixture.mjs');
  const {routingServices,routingChannels,serviceRoute}=await import('../src/admin-v2/service-routing.js');
  const state=legacySupplierState(),model=state.models.find(row=>row.serviceMode==='standard');
  const service=routingServices(state).find(row=>row.modelId===model.id);
  const channels=routingChannels(state,service);
  const [first,second]=channels;
  const candidate={...second,id:'candidate:test',candidate:true};
  const published=normalizeRouteConfig({strategy:'weighted',channels:[
    {supplyId:first.id,weight:50,enabled:true}, {supplyId:second.id,weight:50,enabled:true},
  ]});
  state.serviceRoutes=state.serviceRoutes.filter(row=>row.serviceId!==service.id);
  state.serviceRoutes.push({id:'inline-test',serviceId:service.id,activeVersion:1,versions:[{version:1,config:published}]});
  const snapshot=structuredClone(state);
  const draft=routeEditConfig(service,serviceRoute(state,service.id));
  const rows=()=>routeTableGroups(state,model,service.id,{serviceId:service.id,config:draft,channels:[...channels,candidate]})[0].rows;
  assert.equal(rows().some(row=>row.channel?.id===candidate.id),false);
  const empty={id:'P2',name:'原保存组名',strategy:'weighted'};
  draft.groups.push(empty);
  const headers=()=>rows().flatMap(row=>row.group ? [[row.group.id,row.group.order,row.group.size]] : []);
  assert.deepEqual(headers(),[['P1',1,2],['P2',2,0]]);
  assert.throws(()=>validateRouteConfig(state,service,draft,false),/P2 至少需要/);
  draft.groups.reverse();
  assert.deepEqual(headers(),[['P2',1,0],['P1',2,2]]);
  assert.throws(()=>validateRouteConfig(state,service,draft,false),/P1 至少需要/);
  draft.groups.reverse();
  draft.channels[0].weight='60';
  draft.channels[1].weight='30';
  draft.channels.push({supplyId:candidate.id,weight:'20',groupId:'P1',enabled:true});
  const selected=()=>rows().filter(row=>row.row?.enabled).map(row=>[row.channel.id,row.groupOrder,formatRouteShare(row.share)]);
  assert.deepEqual(selected(),[[first.id,1,'54.55%'],[second.id,1,'27.27%'],[candidate.id,1,'18.18%']]);
  draft.channels[2].groupId='P2';
  assert.deepEqual(selected(),[[first.id,1,'66.67%'],[second.id,1,'33.33%'],[candidate.id,2,'100%']]);
  const previous=structuredClone(draft);
  draft.groups.reverse();
  assert.deepEqual(selected(),[[candidate.id,1,'100%'],[first.id,2,'66.67%'],[second.id,2,'33.33%']]);
  const review=routeChangeRows(previous,draft,[...channels,candidate]);
  assert.deepEqual(review.map(row=>row.after.split(' · ')[0]),['P1','P2','P2']);
  assert.deepEqual(state,snapshot);
  assert.deepEqual(routeTableGroups(state,model,service.id)[0].rows.filter(row=>row.row).map(row=>formatRouteShare(row.share)),['50%','50%']);
});
