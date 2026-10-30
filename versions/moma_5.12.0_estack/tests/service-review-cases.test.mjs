import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdminSeed,commitAdminState,parseAdminState} from '../src/admin-v2/store.js';
import {prepareServiceReviewCases,SERVICE_REVIEW_CASES,SERVICE_REVIEW_VERSION} from '../src/admin-v2/service-review-cases.js';
import {modelSupplies,publicationChecks} from '../src/admin-v2/model-management.js';
import {activeModelSalePrice,activeProviderPrice,providerServices,serviceAssociationChannels,serviceSupplyRows} from '../src/admin-v2/service-workspace.js';
import {routingServices,routingChannels,serviceRoute,activeRouteVersion,validateRouteConfig} from '../src/admin-v2/service-routing.js';

const prepared=()=>prepareServiceReviewCases(createAdminSeed());
const byCase=(state,key)=>state.models.find(model=>model.serviceReviewCase===key);

test('five explicit cases have distinct modes, lifecycle states, metadata and exact configuration gaps',()=>{
  const state=prepared(),models=state.models.filter(model=>model.serviceReviewVersion===SERVICE_REVIEW_VERSION);
  assert.equal(models.length,5);assert.equal(new Set(models.map(model=>model.type)).size,5);
  assert.deepEqual(models.map(model=>model.serviceReviewCase),SERVICE_REVIEW_CASES.map(item=>item.key));
  for (const key of ['deepseek','qwen','video']) assert.ok(publicationChecks(state,byCase(state,key)).every(check=>check.passed),key);
  const deepseek=byCase(state,'deepseek'),qwen=byCase(state,'qwen'),video=byCase(state,'video'),image=byCase(state,'image'),audio=byCase(state,'audio');
  assert.equal(deepseek.listingStatus,'已下架');assert.ok(deepseek.firstPublishedAt);
  assert.equal(qwen.listingStatus,'已上架');assert.equal(video.listingStatus,'已上架');
  assert.equal(image.serviceMode,null);assert.equal(image.status,'草稿');assert.equal(image.description,'');assert.equal(image.profile.releaseDate,undefined);
  assert.equal(modelSupplies(state,image.id).length,0);assert.equal(routingServices(state).filter(service=>service.modelId===image.id).length,0);assert.equal(activeModelSalePrice(state,image.id),undefined);
  assert.equal(audio.listingStatus,'已下架');assert.equal(audio.firstPublishedAt,undefined);
  const gaps=publicationChecks(state,audio).filter(check=>!check.passed);
  assert.equal(gaps.length,2);assert.ok(gaps.some(check=>check.label.includes('阿里云百炼') && check.tab==='pricing'));assert.ok(gaps.some(check=>check.label.includes('讯飞星火') && check.tab==='routing'));
});

test('configured fixtures have complete valid routes, independent Provider IDs and prices, and dynamic billing units',()=>{
  const state=prepared(),deepseek=byCase(state,'deepseek'),qwen=byCase(state,'qwen'),video=byCase(state,'video');
  assert.equal(modelSupplies(state,deepseek.id).length,3);assert.equal(modelSupplies(state,video.id).length,5);
  assert.equal(activeModelSalePrice(state,video.id).items[0].amount,800000);assert.equal(activeModelSalePrice(state,video.id).items[0].unit,'元/秒');
  assert.deepEqual(new Set(serviceSupplyRows(state,video).flatMap(row=>row.cost.items.map(item=>item.unit))),new Set(['元/秒','元/次']));
  const providers=providerServices(qwen);assert.equal(providers.length,3);assert.equal(new Set(providers.map(entry=>entry.callId)).size,3);
  assert.equal(new Set(providers.map(entry=>activeProviderPrice(state,qwen.id,entry.providerId).items[0].amount)).size,3);
  for (const service of routingServices(state).filter(service=>['deepseek','qwen','video'].includes(service.model.serviceReviewCase))) {
    const current=activeRouteVersion(serviceRoute(state,service.id));
    assert.ok(current);assert.ok(routingChannels(state,service).every(channel=>channel.available));
    assert.doesNotThrow(()=>validateRouteConfig(state,service,current.config));
    assert.equal(current.config.autoFailover,true);
    if (service.providerId) assert.ok(routingChannels(state,service).every(channel=>channel.provider.id===service.providerId));
  }
});

test('video maintenance can bind a sixth existing channel without resource creation or automatic route changes',()=>{
  const state=prepared(),model=byCase(state,'video'),supplies=modelSupplies(state,model.id);
  const extra=serviceAssociationChannels(state).find(channel=>channel.catalogueModelId===model.modelId && !channel.reason && !supplies.some(supply=>supply.endpointId===channel.endpointId));
  assert.ok(extra);
  const next=commitAdminState(state,{type:'modelOperations',operation:'associateServiceChannels',modelId:model.id,data:{providerId:extra.provider.id,catalogueModelId:extra.catalogueModelId,channelIds:[extra.id],confirmedIdentity:true,expectedUpdatedAt:model.updatedAt}});
  assert.equal(modelSupplies(next,model.id).length,6);assert.equal(next.endpoints.length,state.endpoints.length);assert.deepEqual(next.providers,state.providers);assert.deepEqual(next.serviceRoutes,state.serviceRoutes);assert.deepEqual(next.modelSalePrices,state.modelSalePrices);
});

test('preparing cases preserves original inventory and unrelated records, makes prior service bindings historical, and is idempotent',()=>{
  const source=createAdminSeed(),model=source.models.find(item=>item.id==='model-1');
  const oldVersion={id:'old-route-v1',version:1,config:{strategy:'fixed',channels:[],autoFailover:false},publishedAt:'2026-09-15'};
  source.serviceRoutes.push({id:'prior-review-route',serviceId:`standard:${model.id}`,activeVersion:1,versions:[oldVersion],draft:{strategy:'fixed',channels:[],autoFailover:false}});
  source.modelSalePrices.push({id:'prior-review-price',modelId:model.id,scope:'model',version:1,status:'已发布',items:[{name:'输入',amount:100,unit:'元/百万 Token'}],effectiveAt:'2026-09-15'});
  const before=structuredClone(source),state=prepareServiceReviewCases(source);
  assert.deepEqual(source,before);
  for (const key of ['tenants','projects','apiKeys','requests','users','audits','supplyPrices','routes','settings']) assert.deepEqual(state[key],source[key],key);
  for (const key of ['providers','endpoints']) for (const original of source[key]) assert.deepEqual(state[key].find(item=>item.id===original.id),original);
  assert.deepEqual(state.serviceRoutes.find(route=>route.id==='prior-review-route').versions[0],oldVersion);
  assert.deepEqual(state.modelSalePrices.find(price=>price.id==='prior-review-price'),source.modelSalePrices.find(price=>price.id==='prior-review-price'));
  for (const supply of source.modelSupplies.filter(item=>item.modelId===model.id)) assert.equal(state.modelSupplies.find(item=>item.id===supply.id).status,'已移除');
  const video=byCase(state,'video');video.description='手工修改的内容，刷新后必须保留';
  assert.deepEqual(prepareServiceReviewCases(state),state);
  const refreshed=parseAdminState(JSON.stringify(state));assert.equal(byCase(refreshed,'video').description,video.description);
});

test('a named user-created DeepSeek preserves its identity and manual metadata while the legacy seed model stays unchanged',()=>{
  const source=createAdminSeed(),legacy=source.models.find(model=>model.id==='model-1');
  source.models.push({...structuredClone(legacy),id:'model-user-deepseek',modelId:'deepseek-v4-pro222',name:'DeepSeek V4 Pro',description:'用户手工填写的模型简介',profile:{author:'自定义作者',releaseDate:'2026-10-01',inputModalities:['文本'],outputModalities:['文本'],family:'手工资料'},serviceModeRevision:4});
  const state=prepareServiceReviewCases(source),current=byCase(state,'deepseek');
  assert.equal(current.id,'model-user-deepseek');assert.equal(current.modelId,'deepseek-v4-pro222');assert.equal(current.description,'用户手工填写的模型简介');assert.equal(current.profile.family,'手工资料');assert.equal(current.profile.author,'自定义作者');assert.equal(current.serviceModeRevision,5);
  assert.equal(activeModelSalePrice(state,current.id).serviceModeRevision,5);assert.ok(publicationChecks(state,current).every(check=>check.passed));assert.deepEqual(state.models.find(model=>model.id==='model-1'),legacy);
});
