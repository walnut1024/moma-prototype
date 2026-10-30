import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdminSeed,commitAdminState,parseAdminState,persistModelAction} from '../src/admin-v2/store.js';
import {serviceDirectoryModels,serviceConfiguration,serviceLifecycle,serviceIndexModels,serviceConfigurationTarget,serviceAssociationChannels,modelSaleRevision} from '../src/admin-v2/service-workspace.js';
import {serviceModelDraft} from '../src/admin-v2/model-profile.js';
import {publicationChecks} from '../src/admin-v2/model-management.js';
import {serviceGuideRequest,serviceGuideCode} from '../src/admin-v2/service-guide.js';
import {routingServices,routingChannels,routeSourceVersion,serviceRoute,activeRouteVersion} from '../src/admin-v2/service-routing.js';

test('fresh review directory contains five distinct progress and lifecycle scenarios with Wan available as default',()=>{
  const state=parseAdminState(null),models=serviceDirectoryModels(state);
  assert.deepEqual(models.map(model=>model.serviceReviewCase),['deepseek','qwen','image','video','audio']);
  assert.deepEqual(models.map(model=>serviceLifecycle(model)),['已下架','已上架','草稿','已上架','未上架']);
  assert.deepEqual(models.map(model=>serviceConfiguration(state,model).label),['已配置','已配置','未配置','已配置','待完善']);
  for(const status of ['listed','unlisted','draft','unpublished'])assert.ok(serviceIndexModels(state,new URLSearchParams({status})).every(model=>serviceLifecycle(model)==={listed:'已上架',unlisted:'已下架',draft:'草稿',unpublished:'未上架'}[status]));
  assert.equal(serviceIndexModels(state,new URLSearchParams({mode:'provider'})).length,2);
});
test('audio missing price and missing mapping link directly to the correct Provider and panel',()=>{
  const state=parseAdminState(null),audio=state.models.find(model=>model.serviceReviewCase==='audio'),issues=serviceConfiguration(state,audio).issues;
  assert.equal(issues.length,2);
  const price=issues.find(issue=>issue.tab==='pricing'),mapping=issues.find(issue=>issue.tab==='routing');
  assert.equal(serviceConfigurationTarget(audio,price).providerEdit,price.providerId);
  const target=serviceConfigurationTarget(audio,mapping);
  assert.equal(target.panel,null);assert.equal(target.providerChannels,mapping.providerId);assert.equal(target.providerAssociate,'1');
});
test('new service creates a genuine mode-less draft and cannot publish before configuration',()=>{
  const state=parseAdminState(null),source=state.models.find(model=>model.serviceReviewCase==='deepseek'),data={...serviceModelDraft(source),name:'新增服务',modelId:'new-review-service'};
  const saved=commitAdminState(state,{type:'modelOperations',operation:'createServiceModel',data}),model=saved.models.find(item=>item.modelId===data.modelId);
  assert.equal(model.serviceMode,undefined);assert.equal(serviceLifecycle(model),'草稿');
  assert.equal(saved.modelSupplies.some(item=>item.modelId===model.id),false);
  assert.equal(publicationChecks(saved,model).some(check=>check.tab==='serviceMode' && !check.passed),true);
  assert.throws(()=>commitAdminState(saved,{type:'modelOperation',operation:'publish',modelId:model.id,data:{}}),/服务模式/);
  assert.equal(serviceDirectoryModels(saved).length,6);
});
test('scenario preparation is explicit, atomic, permission checked and saved edits survive later parsing',()=>{
  const state=createAdminSeed(),action={type:'modelOperations',operation:'prepareServiceReviewCases',data:{confirmed:true}};
  assert.throws(()=>commitAdminState(state,{...action,data:{}}),/确认/);
  assert.throws(()=>commitAdminState({...state,currentRole:'运维人员'},action),/无权/);
  const saved=commitAdminState(state,action),video=saved.models.find(model=>model.serviceReviewCase==='video');
  assert.equal(saved.revision,state.revision+1);assert.equal(saved.audits[0].action,'配置服务管理评审场景');
  video.name='手工维护后的视频服务';
  assert.equal(parseAdminState(JSON.stringify(saved)).models.find(model=>model.id===video.id).name,video.name);
  for(const patch of [{serviceMode:'provider'},{serviceModeRevision:0}])assert.throws(()=>commitAdminState(saved,{type:'update',collection:'models',id:video.id,changes:patch}),/服务管理操作/);
  assert.throws(()=>persistModelAction(state,action,{getItem:()=>JSON.stringify({...state,revision:state.revision+1}),setItem:()=>assert.fail()}),/数据已变化/);
});
test('type-aware guide uses the selected public Provider ID and does not use text-chat payloads for media',()=>{
  const expected={text:'/chat/completions',image:'/images/generations',video:'/videos',audio:'/audio/speech'};
  for(const [type,path] of Object.entries(expected)) {
    const request=serviceGuideRequest({type},'selected-provider-id');
    assert.equal(request.path,path);assert.equal(request.body.model,'selected-provider-id');
    assert.equal(Boolean(request.body.messages),type==='text');
    for(const language of ['cURL','Python','Java','Go']) {const code=serviceGuideCode(request,language);assert.ok(code.includes(path));assert.ok(code.includes('selected-provider-id'));assert.ok(code.includes('MOMA_API_KEY'));}
  }
});
test('image first configuration reaches publication through metadata, unified price, an existing channel and an explicit route',()=>{
  let state=parseAdminState(null);const id=state.models.find(model=>model.serviceReviewCase==='image').id;
  const model=()=>state.models.find(item=>item.id===id),run=(operation,data)=>{state=commitAdminState(state,{type:'modelOperations',operation,modelId:id,data});};
  run('serviceMode',{serviceMode:'standard',expectedUpdatedAt:model().updatedAt});
  run('serviceBasics',{...serviceModelDraft(model()),releaseDate:'2026-10-01',description:'根据文本和参考图片生成图像。',expectedUpdatedAt:model().updatedAt});
  run('unifiedPrice',{items:[{name:'生成图像',unit:'元/张',condition:'',currency:'CNY',amount:'0.2'}],expectedUpdatedAt:model().updatedAt,expectedSaleVersion:modelSaleRevision(state,id)});
  const channel=serviceAssociationChannels(state).find(item=>item.catalogueModelId===model().modelId && !item.reason);
  run('associateServiceChannelsBatch',{groups:[{providerId:channel.provider.id,catalogueModelId:channel.catalogueModelId,channelIds:[channel.id]}],confirmedIdentity:true,expectedUpdatedAt:model().updatedAt});
  const service=routingServices(state).find(item=>item.modelId===id),mapped=routingChannels(state,service);
  run('serviceRoutePublish',{serviceId:service.id,expectedVersion:0,sourceVersion:routeSourceVersion(state,service),config:{strategy:'fixed',autoFailover:true,channels:[{supplyId:mapped[0].id,enabled:true,priority:1}]}});
  assert.equal(serviceConfiguration(state,model()).label,'已配置');
  state=commitAdminState(state,{type:'modelOperation',operation:'publish',modelId:id,data:{}});
  assert.equal(serviceLifecycle(model()),'已上架');assert.ok(model().firstPublishedAt);
});
test('video sixth-channel association leaves published routing unchanged until a revised route is explicitly published',()=>{
  let state=parseAdminState(null);const model=state.models.find(item=>item.serviceReviewCase==='video'),service=routingServices(state).find(item=>item.modelId===model.id),before=structuredClone(activeRouteVersion(serviceRoute(state,service.id)));
  const candidate=serviceAssociationChannels(state).find(item=>item.name.includes('备用') && item.catalogueModelId===model.modelId);
  state=commitAdminState(state,{type:'modelOperations',operation:'associateServiceChannelsBatch',modelId:model.id,data:{groups:[{providerId:candidate.provider.id,catalogueModelId:candidate.catalogueModelId,channelIds:[candidate.id]}],confirmedIdentity:true,expectedUpdatedAt:model.updatedAt}});
  assert.equal(routingChannels(state,service).length,6);assert.deepEqual(activeRouteVersion(serviceRoute(state,service.id)),before);
  const current=routingServices(state).find(item=>item.id===service.id),weights=[30,20,15,15,10,10],config={strategy:'weighted',autoFailover:true,channels:routingChannels(state,current).map((item,index)=>({supplyId:item.id,enabled:true,weight:weights[index]}))};
  state=commitAdminState(state,{type:'modelOperations',operation:'serviceRoutePublish',data:{serviceId:service.id,expectedVersion:before.version,sourceVersion:routeSourceVersion(state,current),config}});
  assert.equal(activeRouteVersion(serviceRoute(state,service.id)).config.channels.length,6);assert.equal(state.models.find(item=>item.id===model.id).listingStatus,'已上架');
});
