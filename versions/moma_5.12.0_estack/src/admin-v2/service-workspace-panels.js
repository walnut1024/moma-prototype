export const SERVICE_WORKSPACE_TABS = [['materials', '服务概览'], ['routing', '渠道与路由'], ['failover', '故障转移'], ['access', '调用授权'], ['guide', '调用指南'], ['trial', '平台试调用'], ['history', '操作记录']];

export function serviceWorkspaceTab(params) {
  if (['guide', 'trial', 'failover'].includes(params.get('panel'))) return params.get('panel');
  if (params.has('scopeEdit')) return 'access';
  if (params.has('providerAdd') || params.has('identityProvider') || params.has('providerChannels') || params.has('providerAssociate')) return 'routing';
  const panel = params.get('panel');
  if (['routing', 'associate'].includes(panel)) return 'routing';
  return ['access', 'guide', 'history'].includes(panel) ? panel : 'materials';
}
