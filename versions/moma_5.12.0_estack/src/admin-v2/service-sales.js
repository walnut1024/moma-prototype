import { offerGrayTenants, offerKey, offerStage, providerOffer, salesPaused } from '../service-access.mjs';
import { modelServiceIdentity } from '../model-identities.mjs';
import { platformAllowedChannels, platformServices, platformPriceVersions } from './platform-service-client.js';
import { activeModelSalePrice, activeProviderPrice } from './service-workspace.js';
import { activeSupplyPrice } from './model-management.js';
import { activeRouteSupplyIds, activeRouteVersion, routingChannels, serviceRoute } from './service-routing.js';
import { serviceReferenceStarted } from './service-directory.js';

export function offerSalesScope(model, key) {
  const entry = providerOffer(model, key);
  const stage = offerStage(model, entry);
  return {
    openScope: stage === 'formal' ? 'all' : stage === 'gray' ? 'selected' : 'none',
    tenantIds: stage === 'gray' ? offerGrayTenants(model, entry) : [],
  };
}

export function salesChecks(state, model, keys) {
  const at = Date.now();
  const services = platformServices(state,model).filter(row => !keys || keys.includes(offerKey(row)));
  const checks = [];
  if (!services.length) return [{ label: '请选择有效模型服务', passed: false, tab: 'technical' }];
  for (const service of services) {
    const identity = modelServiceIdentity(state, model, offerKey(service));
    checks.push({ label: keys ? service.name + '模型服务为服务中' : '模型服务为服务中',
      passed: serviceReferenceStarted(model, service) && !state.stoppedModelOfferIds?.includes(identity), tab:'technical' });
    try {
      const price = service.providerId ? activeProviderPrice(state, model.id, offerKey(service)) : activeModelSalePrice(state, model.id);
      platformPriceVersions(price, model, '模型刊例价', at);
      checks.push({label:`${service.name}：模型刊例价已发布`,passed:true,tab:'pricing',providerId:offerKey(service)});
    } catch (error) {
      checks.push({label:`${service.name}：${error.message}`,passed:false,tab:'pricing',providerId:offerKey(service)});
    }
    const supplyIds = new Set(activeRouteSupplyIds(activeRouteVersion(serviceRoute(state, service.id))?.config));
    const available = routingChannels(state, service, at).some(row => supplyIds.has(row.id) && row.available);
    checks.push({label:'存在已启用且检测通过的上游模型',passed:available,tab:'technical'});
    for (const { id, supply, association } of platformAllowedChannels(state, service)) {
      if (!supplyIds.has(id)) continue;
      try {
        platformPriceVersions(activeSupplyPrice(state, id, at), model, '服务商成本价', at);
      } catch {
        const upstreamId = supply?.upstreamModelId || id;
        const name = association?.modelSnapshot?.name ||
          supply?.provider?.catalogModels?.find(row => row.modelId === association?.modelId)?.name || upstreamId;
        checks.push({label:`缺少有效服务商成本价：${name}（${upstreamId}）`,
          passed:false,warning:true,connectionId:association?.endpointId,upstreamId:association?.id});
      }
    }
  }
  return checks;
}

export function salesStatus(model, providerId) {
  if (salesPaused(model, providerId)) return '已停售';
  const stage = offerStage(model, providerOffer(model, providerId));
  return { unlisted: '未开售', withdrawn: '已停售', gray: '灰度在售', formal: '在售' }[stage];
}
