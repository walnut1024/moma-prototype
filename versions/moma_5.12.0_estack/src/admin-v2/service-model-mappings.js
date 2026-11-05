import { libraryRecord } from './model-library.js';
import { resolveChannelAssociationModel } from './channel-association-model.js';
import { supplierDirectory, displayedCatalogueIds } from './moma-provider.js';
import { catalogueChannels, channelBlockReason, channelFingerprint, channelUrl } from './provider-channels.js';
import { routingServices } from './service-routing.js';
import { platformRouteInterface, routeMappingStatus } from './service-route-mapping.js';

export function mappingInterfaces(model) {
  const route=platformRouteInterface(model);
  return route.path ? [[route.path,route.protocol==='OpenAI'?'OpenAI Chat':route.protocol]] : [];
}
export const mappingConfig = (supply,model) => ({providerId:supply.providerId || supply.provider?.id || supply.endpoint?.providerId,endpointId:supply.endpointId,associationId:supply.channelId,catalogueModelId:supply.catalogueModelId || supply.upstreamModelId,upstreamModelId:supply.upstreamModelId,platformInterface:supply.serviceMapping?.platformInterface || platformRouteInterface(model).path});
export function mappingCandidates(state,service) {
  const master=libraryRecord(state,service.modelId);
  return supplierDirectory(state).filter(provider=>!service.providerId || provider.id===service.providerId).flatMap(provider=>displayedCatalogueIds(provider,state).flatMap(catalogueModelId=>catalogueChannels(state,provider,catalogueModelId).flatMap(channel=>{
    let source;try{source=resolveChannelAssociationModel(state,provider,channel);}catch{return [];}
    if(!master || source.id!==master.id)return [];
    return [{...channel,provider,catalogueModelId,selectionId:JSON.stringify([provider.id,channel.id]),reason:channelBlockReason(provider,channel)}];
  })));
}
function relation(state,service,config) {
  const provider=state.providers.find(row=>row.id===config.providerId);
  const channel=provider && catalogueChannels(state,provider,config.catalogueModelId).find(row=>row.id===config.associationId && row.endpointId===config.endpointId && row.upstreamModelId===config.upstreamModelId);
  if(!channel || service.providerId && service.providerId!==provider.id)throw Error('供应商或渠道模型关联已变化，请重新选择');
  const source=resolveChannelAssociationModel(state,provider,channel),master=libraryRecord(state,service.modelId);
  if(!master || source.id!==master.id)throw Error('只能选择当前模型资料对应的供给，不能按名称关联其他模型');
  return {...channel,provider,catalogueModelId:config.catalogueModelId};
}
export function mappingPreview(state,service,config) {
  const channel=relation(state,service,config),url=channelUrl(channel.provider,channel);
  if(!mappingInterfaces(service.model).some(([id])=>id===config.platformInterface))throw Error('请选择当前模型支持的平台接口');
  const check=routeMappingStatus(state,service,{modelId:service.modelId,catalogueModelId:channel.catalogueModelId,upstreamModelId:channel.upstreamModelId,provider:channel.provider,endpoint:channel.endpoint,url});
  if(!check.valid)throw Error(check.reason);
  return {channel,request:{platform:{path:config.platformInterface,model:service.callId},upstream:{url,protocol:channel.endpoint.protocol,model:channel.upstreamModelId}},check};
}
export function mappingSignature(state,service,config) {
  const {channel,request}=mappingPreview(state,service,config);
  return JSON.stringify([service.id,service.model.serviceModeRevision || 0,service.model.templateId || service.model.id,service.model.type,service.model.capabilities,service.model.profile?.tasks,request,channel.provider.id,channel.id,channelFingerprint(channel)]);
}
export function mappingReadiness(state,service,supply,{runtime=false}={}) {
  if(!supply.serviceMapping)return '';
  try {
    const config=mappingConfig({...supply,providerId:supply.providerId || supply.provider?.id || supply.endpoint?.providerId},service.model),preview=mappingPreview(state,service,config);
    const reason=channelBlockReason(preview.channel.provider,preview.channel,{runtime});
    if(reason)return reason;
    const validation=supply.serviceMapping.validation;
    if(validation===undefined)return ''; // Existing effective relations retain their recorded qualification until explicitly changed.
    return validation?.signature===mappingSignature(state,service,config)?'':'模型映射尚未验证或验证已失效';
  }catch(error){return error.message;}
}
export function mappingReferences(state,supply) {
  return (state.serviceRoutes || []).flatMap(route=>{
    const active=route.versions.find(row=>row.version===route.activeVersion);
    return [[active?.config,'生效路由'],[route.draft,'路由草稿']].filter(([config])=>config?.channels.some(row=>row.supplyId===supply.id)).map(([,kind])=>({serviceId:route.serviceId,kind}));
  });
}
export function mappingPendingTasks(state,supply) {
  return (state.modelOnboardings || []).some(task=>!['已放弃','已完成'].includes(task.status) && !task.completion && (task.supplyId===supply.id || task.selectedSupplyId===supply.id)) || (state.cloudMockState?.usage || []).some(row=>!row.endedAt && row.attempts?.some(attempt=>attempt.bindingId===supply.id));
}
export function mappingSourceVersion(state,service) {
  return JSON.stringify([service.id,service.callId,service.model.updatedAt,mappingCandidates(state,service).map(row=>[row.selectionId,row.reason,channelFingerprint(row)])]);
}
export function mappingState(state,service,supply) {
  let issue=mappingReadiness(state,service,supply);
  if(!issue)try{const preview=mappingPreview(state,service,mappingConfig(supply,service.model));issue=channelBlockReason(preview.channel.provider,preview.channel) || (supply.validationStatus!=='通过'?'模型映射尚未验证':'');}catch(error){issue=error.message;}
  return {label:issue?'待验证':supply.status==='已启用'?'已启用':supply.validationStatus==='通过'?'已验证 · 未启用':'待验证',issue,pending:Boolean(supply.serviceMapping?.pending),references:mappingReferences(state,supply)};
}
function checkedConfig(state,service,input,supply) {
  if(!input || typeof input!=='object')throw Error('请选择模型映射配置');
  const config=Object.fromEntries(['providerId','endpointId','associationId','catalogueModelId','upstreamModelId','platformInterface'].map(key=>[key,input[key]]));
  if(Object.values(config).some(value=>typeof value!=='string' || !value || value.length>2048))throw Error('映射配置不完整');
  const channel=relation(state,service,config),reason=channelBlockReason(channel.provider,channel);
  if(reason)throw Error(reason);
  if(!mappingInterfaces(service.model).some(([id])=>id===config.platformInterface))throw Error('请选择当前模型支持的平台接口');
  const duplicate=state.modelSupplies.some(row=>row.id!==supply?.id && row.modelId===service.modelId && row.status!=='已移除' && (row.endpointId===config.endpointId || row.serviceMapping?.pending?.config.endpointId===config.endpointId));
  if(duplicate)throw Error('该渠道已建立模型映射，请维护原映射');
  return config;
}
export function serviceMappingTransaction(state,{operation,modelId,data={}}) {
  const service=routingServices(state).find(row=>row.modelId===modelId && row.id===data.serviceId);
  if(!service || !service.callId)throw Error('请先配置当前服务的模式和对外调用标识');
  if(data.expectedSource!==mappingSourceVersion(state,service))throw Error('模型或供给已变化，请载入最新数据后核对，当前输入保留');
  if(operation==='serviceMappingCreate' && data.id)throw Error('新增映射不能提交已有映射标识');
  const supply=data.id && state.modelSupplies.find(row=>row.id===data.id && row.modelId===modelId && row.status!=='已移除');
  const providerId=supply && (supply.providerId || state.endpoints.find(row=>row.id===supply.endpointId)?.providerId);
  if(data.id && (!supply || service.providerId && providerId!==service.providerId))throw Error('当前服务的模型映射已不存在');
  if(supply && data.expectedRevision!==(supply.mappingRevision || 0))throw Error('模型映射已有修订，请重新核对');
  const time=new Date().toISOString(),changes=[];
  const update=(id,patch)=>changes.push({type:'update',collection:'modelSupplies',id,changes:{...patch,mappingRevision:(supply?.mappingRevision || 0)+1,updatedAt:time}});
  const config=supply && mappingConfig({...supply,providerId},service.model),meta=supply?.serviceMapping || {platformInterface:config?.platformInterface};
  let label;
  if(operation==='serviceMappingCreate' || operation==='serviceMappingSave') {
    const name=typeof data.name==='string'?data.name.trim():'';
    if(!name || name.length>60 || /[\r\n]/.test(name))throw Error('映射名称必填，最多60字');
    const next=checkedConfig(state,service,data.config,supply);
    if(!supply) {
      if(operation!=='serviceMappingCreate')throw Error('请选择已有映射');
      if(state.modelSupplies.filter(row=>row.modelId===modelId && row.status!=='已移除').length>=20)throw Error('每款服务最多配置20条模型映射');
      changes.push({type:'add',collection:'modelSupplies',record:{id:'supply-'+crypto.randomUUID(),modelId,providerId:next.providerId,endpointId:next.endpointId,channelId:next.associationId,catalogueModelId:next.catalogueModelId,upstreamModelId:next.upstreamModelId,capabilities:structuredClone(service.model.capabilities),status:'已停用',validationStatus:'待验证',verifiedAt:null,validationCases:[],salesEnabled:false,mappingName:name,mappingRevision:1,serviceMapping:{platformInterface:next.platformInterface,validation:null},createdAt:time,updatedAt:time}});
      const endpoint=state.endpoints.find(row=>row.id===next.endpointId);
      if(!endpoint.modelIds.includes(modelId))changes.push({type:'update',collection:'endpoints',id:endpoint.id,changes:{modelIds:[...endpoint.modelIds,modelId]}});
      label='新增模型映射';
    } else {
      if(JSON.stringify(next)!==JSON.stringify(config) && mappingReferences(state,supply).length)throw Error('映射仍被路由引用，更换渠道或接口请新建映射后切换路由');
      if(JSON.stringify(next)===JSON.stringify(config)){const {pending:_pending,...active}=meta;update(supply.id,{mappingName:name,...(meta.pending?{serviceMapping:active}:{})});}
      else update(supply.id,{serviceMapping:{...meta,pending:{name,config:next,validation:JSON.stringify(next)===JSON.stringify(meta.pending?.config)?meta.pending.validation:null,savedAt:time}}});
      label='保存模型映射';
    }
  } else {
    if(!supply)throw Error('请选择已有模型映射');
    if(operation==='serviceMappingValidate') {
      const target=meta.pending?.config || config;
      const preview=mappingPreview(state,service,target),reason=channelBlockReason(preview.channel.provider,preview.channel);
      if(reason)throw Error(reason);
      const validation={signature:mappingSignature(state,service,target),checkedAt:time,source:'supply-evidence',supplyCheckedAt:preview.channel.health?.testedAt || preview.channel.qualification?.testedAt || preview.channel.endpoint.connectionTest?.testedAt,request:preview.request};
      if(meta.pending)update(supply.id,{serviceMapping:{...meta,pending:{...meta.pending,validation}}});
      else update(supply.id,{serviceMapping:{...meta,validation},validationStatus:'通过',verifiedAt:time,validationCases:[{name:'平台标识、接口及当前供给检测',passed:true}]});
      label='验证模型映射';
    } else if(operation==='serviceMappingApply') {
      const pending=meta.pending;if(!pending)throw Error('没有待应用的映射变更');
      checkedConfig(state,service,pending.config,supply);
      if(mappingReferences(state,supply).length || mappingPendingTasks(state,supply))throw Error('映射仍有路由或未完成任务引用，请先处理依赖');
      if(!pending.validation || pending.validation.signature!==mappingSignature(state,service,pending.config))throw Error('请先验证当前映射变更');
      if(data.confirmed!==true)throw Error('请确认映射变更的影响范围');
      const next=pending.config;
      update(supply.id,{providerId:next.providerId,endpointId:next.endpointId,channelId:next.associationId,catalogueModelId:next.catalogueModelId,upstreamModelId:next.upstreamModelId,mappingName:pending.name,serviceMapping:{platformInterface:next.platformInterface,validation:pending.validation},validationStatus:'通过',verifiedAt:time});
      const endpoint=state.endpoints.find(row=>row.id===next.endpointId);
      if(!endpoint.modelIds.includes(modelId))changes.push({type:'update',collection:'endpoints',id:endpoint.id,changes:{modelIds:[...endpoint.modelIds,modelId]}});
      label='应用模型映射';
    } else if(operation==='serviceMappingDiscard') {
      if(!meta.pending)throw Error('没有待放弃的映射变更');
      const {pending:_pending,...rest}=meta;update(supply.id,{serviceMapping:rest});label='放弃模型映射变更';
    } else if(operation==='serviceMappingEnable') {
      if(meta.pending)throw Error('请先应用或放弃待验证的映射变更');
      const preview=mappingPreview(state,service,config),reason=channelBlockReason(preview.channel.provider,preview.channel) || mappingReadiness(state,service,supply);
      if(reason || supply.validationStatus!=='通过')throw Error(reason || '请先验证当前模型映射');
      if(!meta.validation)throw Error('请先验证当前模型映射');
      update(supply.id,{status:'已启用'});label='启用模型映射';
    } else if(['serviceMappingDisable','serviceMappingRemove'].includes(operation)) {
      if(mappingReferences(state,supply).length)throw Error('映射仍被生效路由或草稿引用，请先替换路由或停服后停用路由');
      if(mappingPendingTasks(state,supply))throw Error('映射仍有未完成任务，请先处理后再操作');
      if(data.confirmed!==true)throw Error('请确认模型映射的操作影响');
      if(operation==='serviceMappingRemove' && supply.status==='已启用')throw Error('请先停用映射再解除关系');
      update(supply.id,{status:operation==='serviceMappingRemove'?'已移除':'已停用',salesEnabled:false});label=operation==='serviceMappingRemove'?'解除模型映射':'停用模型映射';
    } else throw Error('不支持的模型映射操作');
  }
  return {type:'batch',objectId:modelId,label,changes};
}
