import mockConfig from '../mock/catalogues.json' with { type: 'json' };
import { connectionFingerprint } from './connection-state.js';
import { channelFingerprint } from './provider-channels.js';
import { routingServices, routingChannels, validateRouteConfig } from './service-routing.js';
import { serviceDirectoryModels, serviceConfiguration } from './service-workspace.js';

export const SERVICE_REVIEW_VERSION = 1;
export const SERVICE_REVIEW_CASES = mockConfig["admin-v2/service-review-cases.js"]["SERVICE_REVIEW_CASES"];
const supplierNames=mockConfig["admin-v2/service-review-cases.js"]["supplierNames"];
const tokens=(input,output,cached)=>[{name:'输入',unit:'元/百万 Token',currency:'CNY',amount:Math.round(input*1000000)},{name:'输出',unit:'元/百万 Token',currency:'CNY',amount:Math.round(output*1000000)},...(cached==null?[]:[{name:'缓存读取',unit:'元/百万 Token',currency:'CNY',amount:Math.round(cached*1000000)}])];
const unitPrice=(name,unit,amount)=>[{name,unit,currency:'CNY',amount:Math.round(amount*1000000)}];

// These five explicit review fixtures never make an upstream request or carry a real credential.
export function prepareServiceReviewCases(source) {
  return prepareServiceCases(source, SERVICE_REVIEW_CASES, 'service-review');
}

function prepareServiceCases(source, cases, prefix) {
  const state=structuredClone(source),at=new Date().toISOString(),routes=[];
  const record=(id,value)=>({id,createdAt:at,updatedAt:at,...value});
  const supplier=key=>{
    const id=`${prefix}-provider-${key}`;
    let provider=state.providers.find(item=>item.id===id);
    if (!provider) {
      provider=record(id,{name:supplierNames[key],code:`review-${key}`,sourceType:'thirdParty',integrationType:'云厂商模型服务',baseUrl:`https://${key}.service-review.example.invalid`,status:'已启用',catalogModelIds:[],catalogModels:[],catalogConnections:[],contact:'',contractEnd:null});
      state.providers.push(provider);
    }
    return provider;
  };
  const addPrice=(model,items,provider)=>{
    const scope=provider?'provider':'model',history=state.modelSalePrices.filter(price=>price.modelId===model.id && price.scope===scope && (!provider || price.providerId===provider.id));
    const version=Math.max(0,...history.map(price=>price.version||0))+1;
    state.modelSalePrices.push(record(`${prefix}-price-${model.id}-${provider?.code || 'unified'}-${version}`,{modelId:model.id,scope,...(provider?{providerId:provider.id,serviceId:`provider:${model.id}:${provider.id}`}:{ }),items,version,serviceModeRevision:model.serviceModeRevision,effectiveAt:at,status:'已发布'}));
  };
  const associateProvider=(model,key,items)=>{
    const provider=supplier(key),entry={providerId:provider.id,code:key,callId:`${model.modelId}-${key}`,status:'已关联',updatedAt:at};
    model.serviceProviders.push(entry);
    if (items) addPrice(model,items,provider);
    return provider;
  };
  const channel=(model,key,index,costs,linked=true)=>{
    const provider=supplier(key),catalogueId=model.modelId,id=`${prefix}-channel-${model.serviceReviewCase}-${key}-${index}`,endpointId=`${prefix}-endpoint-${model.serviceReviewCase}-${key}-${index}`;
    if (!provider.catalogModelIds.includes(catalogueId)) provider.catalogModelIds.push(catalogueId);
    if (!provider.catalogModels.some(item=>item.modelId===catalogueId)) provider.catalogModels.push({modelId:catalogueId,name:model.name,type:model.type});
    const path=model.type==='video'?'videos/generations':model.type==='image'?'images/generations':model.type==='audio'?'audio/speech':'chat/completions';
    const name=index===1?`${supplierNames[key]}主渠道`:`${supplierNames[key]}备用渠道 ${index}`;
    const endpoint=record(endpointId,{endpointId,name,providerId:provider.id,protocol:['text','multimodal'].includes(model.type)?'OpenAI':'其他',baseUrl:`https://${key}-${model.serviceReviewCase}-${index}.service-review.example.invalid/v1/${path}`,credentialRef:'local-service-review-placeholder',modelIds:linked?[model.id]:[],capacity:10000,timeoutSeconds:60,status:'运行中'});
    endpoint.connectionTest={fingerprint:connectionFingerprint(endpoint),result:'通过',message:'连接配置检查通过',testedAt:at,simulated:true};
    state.endpoints.push(endpoint);
    const entry=record(id,{modelId:catalogueId,endpointId,name,origin:index===1?'direct':'resale',upstreamProvider:index===1?'':supplierNames[key],upstreamModelId:catalogueId,enabled:true,pricing:{discountFactor:1000000,scenarios:costs.map(({amount,...item})=>({...item,condition:'',listPrice:amount}))}});
    entry.health={fingerprint:channelFingerprint({...entry,endpoint}),result:'通过',message:'当前配置检查通过',testedAt:at};
    provider.catalogConnections.push(entry);
    if (linked) state.modelSupplies.push(record(`${prefix}-supply-${model.serviceReviewCase}-${key}-${index}`,{modelId:model.id,endpointId,providerId:provider.id,catalogueModelId:catalogueId,channelId:id,upstreamModelId:catalogueId,capabilities:structuredClone(model.capabilities),status:'已启用',validationStatus:'通过',validationCases:[{name:'模型身份及能力',passed:true}],verifiedAt:at,salesEnabled:false}));
  };
  for (const scenario of cases) {
    let model=state.models.find(item=>item.serviceReviewCase===scenario.key);
    if (!model && scenario.key==='deepseek') model=state.models.find(item=>item.id!=='model-1' && item.name==='DeepSeek V4 Pro');
    model ||= state.models.find(item=>item.id===scenario.id);
    if (model?.serviceReviewVersion===SERVICE_REVIEW_VERSION) continue;
    if (!model) {
      model=record(scenario.id,{modelId:scenario.modelId,name:scenario.name,type:scenario.type,description:'',capabilities:{context:null,output:null,streaming:null,tools:null},profile:{},defaultVersionId:`${prefix}-version-${scenario.key}`});
      state.models.push(model);
    }
    const untouched=Date.parse(model.updatedAt)<=Date.parse(model.createdAt);
    for (const supply of state.modelSupplies.filter(item=>item.modelId===model.id)) {supply.status='已移除';supply.salesEnabled=false;}
    for (const route of state.serviceRoutes.filter(item=>item.serviceId===`standard:${model.id}` || item.serviceId.startsWith(`provider:${model.id}:`))) {route.activeVersion=0;route.draft=null;route.draftUpdatedAt=null;}
    Object.assign(model,{serviceReviewCase:scenario.key,serviceReviewVersion:SERVICE_REVIEW_VERSION,serviceModeRevision:(model.serviceModeRevision || 0)+1,listingStatus:scenario.listed?'已上架':'已下架',status:scenario.listed?'运行中':'停用',callsEnabled:scenario.listed,serviceMode:scenario.mode,openScope:'all',tenantIds:[],updatedAt:at});
    if (scenario.listed || scenario.key==='deepseek') model.firstPublishedAt ||= at;
    model.serviceProviders=(model.serviceProviders || []).map(entry=>({...entry,status:'已移除'}));
    const defaults=scenario.type==='text'?{author:'DeepSeek',releaseDate:'2026-04-24',inputModalities:['文本'],outputModalities:['文本']}:scenario.type==='image'?{author:'阿里巴巴',inputModalities:['文本','图片'],outputModalities:['图片']}:scenario.type==='video'?{author:'阿里巴巴',releaseDate:'2026-08-06',inputModalities:['文本','图片'],outputModalities:['视频'],tasks:['文生视频','图生视频'],maxDuration:10,resolutions:'720P、1080P'}:scenario.type==='audio'?{author:'阿里巴巴',releaseDate:'2026-07-14',inputModalities:['文本'],outputModalities:['音频'],tasks:['语音合成'],outputFormats:'mp3、wav',voices:'标准音色',speedControl:'supported'}:{author:'阿里巴巴',releaseDate:'2026-08-02',inputModalities:['文本','图片','视频'],outputModalities:['文本']};
    model.profile={...defaults,...model.profile};
    for (const [key,value] of Object.entries(defaults)) if (model.profile[key]==null || model.profile[key]==='') model.profile[key]=value;
    if (!model.description) model.description=`${model.name}提供${scenario.type==='video'?'文本、图片到视频生成':scenario.type==='audio'?'文本到语音生成':'模型推理'}服务。`;
    if (!state.modelVersions.some(version=>version.id===model.defaultVersionId)) state.modelVersions.push(record(model.defaultVersionId,{modelId:model.id,version:'v1.0',capabilities:structuredClone(model.capabilities),validationStatus:'通过',isDefault:true,status:'已发布'}));
    if (scenario.key==='image') {
      if (untouched) {model.description='';model.profile={author:'阿里巴巴',inputModalities:['文本','图片'],outputModalities:['图片'],tasks:['文生图','图像编辑']};}
      model.visibility='内部';model.status='草稿';
      channel(model,'aliyun',1,unitPrice('生成图像','元/张',0.16),false);
      channel(model,'siliconflow',1,unitPrice('生成图像','元/张',0.14),false);
    } else {
      model.visibility ||= '公开';
      if (scenario.key==='deepseek') {
        addPrice(model,tokens(2.5,9));
        channel(model,'deepseek',1,tokens(1.6,6.4));channel(model,'siliconflow',1,tokens(1.5,6));channel(model,'aggregate',1,tokens(1.8,7));
        routes.push({model,weights:[50,30,20]});
      } else if (scenario.key==='qwen') {
        const aliyun=associateProvider(model,'aliyun',tokens(2,8)),siliconflow=associateProvider(model,'siliconflow',tokens(1.5,6,0.3)),aggregate=associateProvider(model,'aggregate',tokens(1.8,7));
        channel(model,'aliyun',1,tokens(1.6,6.4));channel(model,'aliyun',2,tokens(1.5,6));
        for (let i=1;i<=3;i++) channel(model,'siliconflow',i,tokens(1.2+i*0.05,4.8+i*0.1,0.2));
        channel(model,'aggregate',1,tokens(1.4,5.8));
        routes.push({model,provider:aliyun,weights:[70,30]},{model,provider:siliconflow,weights:[50,30,20]},{model,provider:aggregate,weights:[100]});
      } else if (scenario.key==='video') {
        addPrice(model,unitPrice('视频生成','元/秒',0.8));
        channel(model,'aliyun',1,unitPrice('视频生成','元/秒',0.48));channel(model,'baidu',1,unitPrice('视频生成','元/秒',0.45));channel(model,'stepfun',1,unitPrice('视频生成','元/次',2.4));channel(model,'tencent',1,unitPrice('视频生成','元/秒',0.6));channel(model,'iflytek',1,unitPrice('视频生成','元/秒',0.5));
        channel(model,'aliyun',2,unitPrice('视频生成','元/秒',0.42),false);
        routes.push({model,weights:[30,25,20,15,10]});
      } else {
        const aliyun=associateProvider(model,'aliyun');associateProvider(model,'iflytek',unitPrice('语音合成','元/万字符',1.6));
        channel(model,'aliyun',1,unitPrice('语音合成','元/万字符',1.2));channel(model,'iflytek',1,unitPrice('语音合成','元/万字符',1.1),false);
        routes.push({model,provider:aliyun,weights:[100]});
      }
    }
  }
  for (const {model,provider,weights} of routes) {
    const service=routingServices(state).find(item=>item.modelId===model.id && item.providerId===(provider?.id || null)),channels=routingChannels(state,service);
    const config=validateRouteConfig(state,service,{strategy:service.mode==='standard' || weights.length>1?'weighted':'fixed',channels:channels.map((item,index)=>({supplyId:item.id,enabled:true,weight:weights[index]})),autoFailover:true});
    let route=state.serviceRoutes.find(item=>item.serviceId===service.id);
    if (!route) {route=record(`${prefix}-route-${model.serviceReviewCase}-${provider?.code || 'unified'}`,{serviceId:service.id,activeVersion:0,versions:[],draft:null});state.serviceRoutes.push(route);}
    const version=Math.max(0,...route.versions.map(item=>item.version))+1;
    route.versions.push({id:`${route.id}-v${version}`,version,config,publishedAt:at,actor:'平台管理员',rollbackFrom:null,costVersions:Object.fromEntries(channels.map(item=>[item.id,item.costVersion]))});
    Object.assign(route,{activeVersion:version,draft:null,draftUpdatedAt:null,updatedAt:at});
  }
  return state;
}

export function completeServiceProviderExample(source) {
  if (source.serviceProviderExampleVersion === 1) return source;
  const state = structuredClone(source);
  state.serviceProviderExampleVersion = 1;
  const ready = serviceDirectoryModels(source).some(model => model.serviceMode === 'provider' && !serviceConfiguration(source, model).setupIssues.length);
  if (ready) return state;
  const collections = ['models', 'modelVersions', 'providers', 'endpoints', 'modelSupplies', 'modelSalePrices', 'serviceRoutes'];
  let prefix = 'service-delivery', serial = 1;
  while (collections.some(key => source[key].some(item => item.id.startsWith(prefix + '-')))) prefix = `service-delivery-${++serial}`;
  const occupied = new Set(source.models.flatMap(model => [model.modelId, ...(model.serviceProviders || []).map(entry => entry.callId)]));
  let modelId = 'qwen3.8-max', suffix = 1;
  while ([modelId, ...['aliyun', 'siliconflow', 'aggregate'].map(key => `${modelId}-${key}`)].some(id => occupied.has(id))) modelId = `qwen3.8-max-provider-${suffix++}`;
  const isolated = { ...source, ...Object.fromEntries(collections.map(key => [key, []])) };
  const sample = prepareServiceCases(isolated, [{ ...SERVICE_REVIEW_CASES.find(item => item.key === 'qwen'), id: `${prefix}-model-qwen`, modelId }], prefix);
  const model = sample.models[0];
  model.serviceManaged = true;
  delete model.serviceReviewCase;
  delete model.serviceReviewVersion;
  for (const key of collections) state[key].push(...sample[key]);
  return state;
}
