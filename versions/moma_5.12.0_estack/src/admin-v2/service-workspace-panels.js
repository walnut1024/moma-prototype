export const SERVICE_WORKSPACE_TABS = [['materials', '服务概览'], ['routing', '路由及映射'], ['failover', '故障转移'], ['guide', '调用指南'], ['history', '操作记录']];

export function serviceWorkspaceTab(params) {
  const panel = params.get('panel');
  if (['guide', 'failover'].includes(panel)) return panel;
  if (params.has('providerAdd') || params.has('identityProvider') || params.has('providerChannels') || params.has('providerAssociate')) return 'routing';
  if (['routing', 'associate'].includes(panel)) return 'routing';
  return panel === 'history' ? panel : 'materials';
}
