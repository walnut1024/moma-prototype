import { publicationChecks } from './model-management.js';
import { platformServices, platformAllowedChannels, platformCandidatePlan } from './platform-service-client.js';
import { servicePurpose } from './service-purpose.js';

export const salesScope = model => model.salesScope || { openScope:model.openScope, tenantIds:model.tenantIds || [] };

export function salesChecks(state, model) {
  const checks = publicationChecks(state,model,{technical:true});
  checks.push({label:'技术服务已启用',passed:model.callsEnabled === true,tab:'technical'});
  const services = platformServices(state,model).filter(row => servicePurpose(model,row.providerId) === 'commercial');
  checks.push({label:'存在经营服务',passed:services.length > 0,tab:'purpose'});
  for (const service of services) {
    try {
      const tenantIds = state.tenants.filter(row => ['正常','需关注'].includes(row.status) && (model.openScope === 'all' || model.tenantIds?.includes(row.id))).map(row => row.id);
      platformCandidatePlan(state,model,{serviceId:service.id,tenantIds,supplyIds:platformAllowedChannels(state,service).map(row => row.id),audioProbe:model.profile?.tasks?.includes('语音合成')?'speech':model.profile?.tasks?.includes('语音识别')?'transcription':''});
      checks.push({label:`${service.name}：成本与售价有效`,passed:true,tab:'pricing',providerId:service.providerId});
    } catch (error) {
      checks.push({label:`${service.name}：${error.message}`,passed:false,tab:'pricing',providerId:service.providerId});
    }
  }
  const scope = salesScope(model);
  checks.push({label:'销售对象有效',passed:scope.openScope === 'all' || scope.openScope === 'selected' && scope.tenantIds?.length > 0 && scope.tenantIds.every(id => state.tenants.some(row => row.id === id && ['正常','需关注'].includes(row.status))),tab:'scope'});
  return checks;
}

export function salesStatus(state, model, providerId) {
  if (servicePurpose(model,providerId) === 'internal') return '不销售';
  if (model.listingStatus !== '已上架') return model.firstPublishedAt ? '已停售' : '未上架';
  if (!model.callsEnabled) return '服务不可用';
  return salesChecks(state,model).every(row => row.passed) ? model.releaseStage==='gray'?'灰度在售':'在售' : '不可销售';
}
