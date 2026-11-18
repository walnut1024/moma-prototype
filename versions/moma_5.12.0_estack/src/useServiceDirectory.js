import { resourceId } from './resource-id.mjs';
import { useEffect, useState } from 'react';
import { MARKET_EVENT, marketRequest, useCloudMarket } from './CloudMarket';

import { projectModelEnabled } from './project-access.mjs';

export function useServiceDirectory(task, project) {
  const market=useCloudMarket();
  return {
    models:market.services.filter(model=>!task || model.tasks.includes(task)).map(model=>project && !projectModelEnabled(project,model.serviceModelId)
      ? { ...model, callable:false, reason:'该模型未在当前项目开通' } : model),
    projectId:project?.id,
    tenantId:market.tenant?.id, internal:market.tenant?.internal === true,
    identityError:!market.loading && !market.tenant ? '请先登录客户账号' : '',
    error:market.error,
  };
}

export function useExperienceSettings(task) {
  const [result,setResult]=useState({task,settings:null,error:''});
  useEffect(()=>{
    const controller=new AbortController();
    marketRequest('experience-options?'+new URLSearchParams({task}),null,controller.signal).then(settings=>{
      if(!controller.signal.aborted)setResult({task,settings,error:''});
    }).catch(error=>{
      if(!controller.signal.aborted)setResult({task,settings:null,error:error.message});
    });
    return ()=>controller.abort();
  },[task]);
  return result.task===task?result:{settings:null,error:''};
}

export function beginExperience(directory, id, task, { images=false }={}) {
  if (!directory.tenantId) throw Error('请先登录客户账号');
  const model=directory.models.find(row=>row.id===id);
  if (!model?.callable) throw Error(model?.reason || '请先订购此模型服务');
  if (!model.tasks.includes(task) || (images && !model.inputModalities.includes('image'))) throw Error('所选模型不支持当前任务');
  return { tenantId:directory.tenantId, projectId:directory.projectId, serviceId:id, callId:model.callId, requestId:resourceId('request'), modelName:model.name, task, images };
}

export async function finishExperience(ticket, { prompt, ...options } = {}) {
  const body={requestId:ticket.requestId,model:ticket.callId,tenantId:ticket.tenantId,projectId:ticket.projectId,
    task:ticket.task,images:ticket.images,...options,messages:[{role:'user',content:prompt?.trim().slice(0,2000) || '原型体验'}]};
  for (let attempt=0; ; attempt++) {
    try {
      const result=await marketRequest('completions',body);
      window.dispatchEvent(new Event(MARKET_EVENT));
      return result;
    } catch (error) {
      if (error.code!=='REVISION_CONFLICT' || attempt===2) throw error;
    }
  }
}
