import { offerKey, offerStage, providerOffer, salesPaused } from '../service-access.mjs';
import { publicationChecks } from './model-management.js';
import { platformServices, platformAllowedChannels, platformCandidatePlan } from './platform-service-client.js';
import { servicePurpose } from './service-purpose.js';

export const salesScope = model => model.salesScope || { openScope:'none', tenantIds:[] };

export function salesChecks(state, model, keys) {
  const services = platformServices(state,model).filter(row => !keys || keys.includes(offerKey(row)));
  const checks = keys ? [] : publicationChecks(state,model,{technical:true});
  checks.push({label:'技术服务已启用',passed:model.callsEnabled === true,tab:'technical'});
  const commercial = services.filter(row => servicePurpose(model,offerKey(row)) === 'commercial');
  checks.push({label:'存在经营服务',passed:commercial.length>0 && (!keys || commercial.length===services.length),tab:'purpose'});
  for (const service of commercial) {
    if (keys) {
      checks.push(...publicationChecks(state,model,{technical:true,serviceId:service.id}));
      checks.push({label:service.name+'技术服务已启用',passed:providerOffer(model,offerKey(service))?.callsEnabled!==false,tab:'technical'});
    }
    try {
      const tenantIds = state.tenants.filter(row => ['正常','需关注'].includes(row.status)).map(row => row.id);
      platformCandidatePlan(state,model,{serviceId:service.id,tenantIds,supplyIds:platformAllowedChannels(state,service).map(row => row.id),audioProbe:model.profile?.tasks?.includes('语音合成')?'speech':model.profile?.tasks?.includes('语音识别')?'transcription':''});
      checks.push({label:`${service.name}：成本与模型刊例价有效`,passed:true,tab:'pricing',providerId:offerKey(service)});
    } catch (error) {
      checks.push({label:`${service.name}：${error.message}`,passed:false,tab:'pricing',providerId:offerKey(service)});
    }
  }
  const scope = salesScope(model);
  checks.push({label:'销售对象有效',passed:scope.openScope === 'all' || scope.openScope === 'selected' && scope.tenantIds?.length > 0 && scope.tenantIds.every(id => state.tenants.some(row => row.id === id && ['正常','需关注'].includes(row.status))),tab:'scope'});
  return checks;
}

export function salesStatus(model, providerId) {
  if (salesPaused(model, providerId)) return '已停售';
  const stage = offerStage(model, providerOffer(model, providerId));
  return { unlisted: '未开售', withdrawn: '已停售', gray: '灰度在售', formal: '在售' }[stage];
}
