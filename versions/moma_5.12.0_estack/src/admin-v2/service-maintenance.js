import { offerKey, offerStage, providerOffer, serviceCallsEnabled } from '../service-access.mjs';

export function serviceDeleteIssues(state, model, key) {
  if (!key) return serviceArchiveIssues(state, model);
  const entry = providerOffer(model, key), issues = [];
  if (!entry) return ['模型服务关联已不存在'];
  if (serviceCallsEnabled(model, entry)) issues.push('请先停止当前模型服务');
  if (['formal', 'gray'].includes(offerStage(model, entry))) issues.push('请先在模型广场下架当前模型服务');
  const serviceId = 'provider:' + model.id + ':' + offerKey(entry);
  if ((state.serviceRoutes || []).some(row => row.serviceId === serviceId && (row.activeVersion || row.draft))) issues.push('请先停用当前服务路由并处理路由草稿');
  if ((state.modelOnboardings || []).some(row => row.modelId === model.id && !['已完成', '已放弃'].includes(row.status))) issues.push('完成或放弃接入任务');
  return issues;
}

export function serviceArchiveIssues(state, model) {
  const issues=[];
  if(model.listingStatus==='已上架')issues.push('请先在模型广场下架服务');
  if(model.serviceMode!=='provider' && model.callsEnabled===true)issues.push('请先停止服务');
  const routes=(state.serviceRoutes || []).filter(row=>row.serviceId===`standard:${model.id}` || row.serviceId.startsWith(`provider:${model.id}:`));
  if(routes.some(row=>row.activeVersion || row.draft))issues.push('停用路由并清理路由草稿');
  if((state.modelSupplies || []).some(row=>row.modelId===model.id && row.status!=='已移除'))issues.push('解除全部模型映射');
  if((model.serviceProviders || []).some(row=>row.status!=='已移除'))issues.push('下架并解绑服务商服务');
  if((state.modelOnboardings || []).some(row=>row.modelId===model.id && !['已完成','已放弃'].includes(row.status)))issues.push('完成或放弃接入任务');
  return issues;
}
export function checkedServiceCallId(state,model,providerId,value) {
  const callId=typeof value==='string'?value.trim():'';
  if(!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(callId))throw Error('模型调用标识必填，最多 200 字，仅支持英文、数字及 . _ : / -');
  if(state.models.some(row=>(row.id!==model.id && [row.id,row.modelId].includes(callId)) || (!providerId && row.id===model.id?false:row.modelId===callId) || (row.serviceProviders || []).some(entry=>entry.status!=='已移除' && !(row.id===model.id && entry.providerId===providerId) && entry.callId===callId)))throw Error('模型调用标识已存在');
  return callId;
}
