import { offerKey, serviceReferences } from '../service-access.mjs';

export const SERVICE_PANEL_LABELS = { routing: '路由及映射', failover: '故障转移配置', history: '操作记录' };

export function serviceWorkspacePanel(params) {
  const panel = params.get('panel');
  if (panel === 'failover') return panel;
  if (params.has('providerAdd') || params.has('identityProvider') || params.has('providerChannels') || params.has('providerAssociate')) return 'routing';
  return panel === 'history' ? panel : 'routing';
}

export function serviceDrawerTarget(state, model, params) {
  const services = serviceReferences({ ...state, models: model && !model.deletedAt ? [model] : [] });
  if (params.has('serviceRecord')) return services.find(service => service.model_service_id === params.get('serviceRecord'));
  if (params.has('routeProvider')) return services.find(service => offerKey(service) === params.get('routeProvider'));
  return model?.serviceMode === 'standard' ? services[0] : undefined;
}
