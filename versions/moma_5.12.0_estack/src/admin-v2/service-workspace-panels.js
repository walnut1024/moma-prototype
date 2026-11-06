export const SERVICE_WORKSPACE_TABS = [['materials', '服务概览'], ['routing', '渠道与路由'], ['access', '调用授权'], ['guide', '验证与调用'], ['history', '操作记录']];

export function serviceWorkspaceTab(params) {
  if (params.get('panel') === 'guide') return 'guide';
  if (params.has('scopeEdit')) return 'access';
  if (params.has('providerAdd') || params.has('identityProvider') || params.has('providerChannels') || params.has('providerAssociate')) return 'routing';
  const panel = params.get('panel');
  if (['routing', 'associate'].includes(panel)) return 'routing';
  return ['access', 'guide', 'history'].includes(panel) ? panel : 'materials';
}
