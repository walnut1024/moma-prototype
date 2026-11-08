import { useEffect, useState } from 'react';
import { MARKET_EVENT, marketRequest, useCloudMarket } from './CloudMarket';

export function useServiceDirectory(task) {
  const market=useCloudMarket();
  return {
    models:market.services.filter(model=>!task || model.tasks.includes(task)),
    tenantId:market.tenant?.id,
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
  return { tenantId:directory.tenantId, serviceId:id, callId:model.callId, requestId:crypto.randomUUID(), modelName:model.name, task, images };
}

export async function finishExperience(ticket, options={}) {
  const result=await marketRequest('completions',{requestId:ticket.requestId,model:ticket.callId,tenantId:ticket.tenantId,
    task:ticket.task,images:ticket.images,...options,messages:[{role:'user',content:'原型体验'}]});
  window.dispatchEvent(new Event(MARKET_EVENT));
  return result;
}
