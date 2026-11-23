import { offerKey, offerStage, providerOffer, salesPaused } from '../service-access.mjs';
import { platformServices, platformPriceVersions } from './platform-service-client.js';
import { activeModelSalePrice, activeProviderPrice } from './service-workspace.js';

export const salesScope = model => model.salesScope || { openScope:'none', tenantIds:[] };

export function salesChecks(state, model, keys, stage = 'formal') {
  const services = platformServices(state,model).filter(row => !keys || keys.includes(offerKey(row)));
  const checks = [];
  checks.push({label:'模型服务为服务中',passed:model.callsEnabled === true,tab:'technical'});
  if (!services.length) return [{ label: '请选择有效模型服务', passed: false, tab: 'technical' }];
  for (const service of services) {
    if (keys) {
      checks.push({label:service.name+'模型服务为服务中',passed:providerOffer(model,offerKey(service))?.callsEnabled!==false,tab:'technical'});
    }
    try {
      const price = service.providerId ? activeProviderPrice(state, model.id, offerKey(service)) : activeModelSalePrice(state, model.id);
      platformPriceVersions(price, model, '模型刊例价');
      checks.push({label:`${service.name}：模型刊例价已发布`,passed:true,tab:'pricing',providerId:offerKey(service)});
    } catch (error) {
      checks.push({label:`${service.name}：${error.message}`,passed:false,tab:'pricing',providerId:offerKey(service)});
    }
  }
  const scope = salesScope(model);
  if (stage === 'gray') checks.push({label:'销售对象有效',passed:scope.openScope === 'all' || scope.openScope === 'selected' && scope.tenantIds?.length > 0 && scope.tenantIds.every(id => state.tenants.some(row => row.id === id && ['正常','需关注'].includes(row.status))),tab:'scope'});
  return checks;
}

export function salesStatus(model, providerId) {
  if (salesPaused(model, providerId)) return '已停售';
  const stage = offerStage(model, providerOffer(model, providerId));
  return { unlisted: '未开售', withdrawn: '已停售', gray: '灰度在售', formal: '在售' }[stage];
}
