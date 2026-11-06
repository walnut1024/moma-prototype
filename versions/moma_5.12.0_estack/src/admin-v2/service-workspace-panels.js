export const SERVICE_WORKSPACE_TABS = [['materials', '模型卡片'], ['routing', '路由及映射'], ['pricing', '售价与开放范围'], ['guide', 'API 调用指南'], ['history', '操作记录']];

export function serviceWorkspaceTab(params) {
  if (params.get('panel') === 'guide') return 'guide';
  if (params.has('providerEdit')) return 'pricing';
  if (params.has('providerAdd') || params.has('identityProvider') || params.has('providerChannels') || params.has('providerAssociate')) return 'routing';
  const panel = params.get('panel');
  if (['routing', 'associate'].includes(panel)) return 'routing';
  return ['pricing', 'guide', 'history'].includes(panel) ? panel : 'materials';
}
