export const SERVICE_WORKSPACE_TABS = [['routing', '路由及映射'], ['failover', '故障转移'], ['history', '操作记录']];

export function serviceWorkspaceTab(params) {
  const panel = params.get('panel');
  if (panel === 'failover') return panel;
  if (params.has('providerAdd') || params.has('identityProvider') || params.has('providerChannels') || params.has('providerAssociate')) return 'routing';
  return panel === 'history' ? panel : 'routing';
}
