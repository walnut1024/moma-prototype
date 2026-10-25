export const projectTabs = [['settings', '基本信息'], ['models', '模型权限'], ['keys', 'API Key'], ['members', '成员权限'], ['budget', '预算与日志'], ['audit', '操作记录']];
export const enterpriseTabs = [['组织及成员', '组织与成员'], ['账户操作记录', '操作记录']];
const accountPages = ['projects', 'catalogue', 'detail', '模型订购', '组织及成员', '账户操作记录', '账号认证'];
const projectPages = ['overview', ...projectTabs.map(([id]) => id), '智能路由', 'experience', 'compare', '图片生成', '视频生成', '语音识别', 'usage', '调用观测', 'logs'];
export const pageScope = page => accountPages.includes(page) ? 'account' : 'project';

export function workspaceNavigation(userType, account = false) {
  return [
    ['模型服务', [['catalogue', '模型广场'], ['智能路由', '智能路由']]],
    ['模型体验', [['experience', '文本生成'], ['图片生成', '图片生成'], ['视频生成', '视频生成'], ['语音识别', '语音识别']]],
    ['订单管理', [['模型订购', '模型订购']]],
    ['模型观测', [['usage', '用量统计'], ['调用观测', '调用观测'], ...(userType === 'enterprise' ? [['logs', '调用日志']] : [])]],
    ...(!account ? [['项目', [['overview', '项目概览'], ['settings', '项目配置']]]] : []),
    ...((account || userType === 'enterprise') ? [['账户', [...(account ? [['projects', '全部项目']] : []), ...(userType === 'enterprise' ? [['组织及成员', '企业管理']] : [])]]] : []),
  ];
}

export function navigationPage(page) {
  if (projectTabs.some(([id]) => id === page)) return 'settings';
  if (enterpriseTabs.some(([id]) => id === page)) return '组织及成员';
  return page;
}

export const projectSwitchPage = page => page === 'detail' ? 'catalogue' : page === 'projects' ? 'overview' : page;

export function workspaceHash(page, projectId = '', values = {}) {
  const params = new URLSearchParams({ page });
  for (const [key, value] of Object.entries(values)) if (value) params.set(key, value);
  return `/${pageScope(page) === 'account' ? 'account' : `projects${projectId ? '/' + encodeURIComponent(projectId) : ''}`}?${params}`;
}

export function readWorkspaceRoute(hash, search = '', pathname = '') {
  const match = hash.match(/^#\/(?:projects(?:\/([^?]+))?|account)(?:\?(.*))?$/);
  const entry = { 'model-order': '模型订购', 'organization-members': '组织及成员', 'operation-records': '账户操作记录', 'api-keys': 'keys', 'account-certification': '账号认证', 'call-logs': 'logs', 'usage-statistics': 'usage' }[new URLSearchParams(search).get('page')];
  const params = new URLSearchParams(match?.[2] || '');
  const requested = params.get('page') || entry || (pathname.includes('/order/serviceOrder') ? '模型订购' : 'catalogue');
  const page = [...accountPages, ...projectPages].includes(requested) ? requested : 'catalogue';
  let projectId = match?.[1] || '';
  try { projectId = decodeURIComponent(projectId); } catch { /* Keep an invalid ID inaccessible instead of selecting another project. */ }
  return { projectId: pageScope(page) === 'project' ? projectId : '', page, model: params.get('model') || '', request: params.get('request') || '', supply: params.get('supply') || '', days: ['1', '7', '30'].includes(params.get('days')) ? params.get('days') : '7', rangeDays: ['1', '7', '30'].includes(params.get('rangeDays')) ? params.get('rangeDays') : '', action: params.get('action') === 'createKey' ? 'createKey' : '' };
}

export function workspaceProject(projects, projectId, recentId) {
  return projectId ? projects.find(project => project.id === projectId) : projects.find(project => project.id === recentId) || projects[0];
}

export function returnProjectLocation(projects, saved, recentId) {
  if (saved && (!projects.some(project => project.id === saved.projectId) || !projectPages.includes(saved.page))) return null;
  return saved || (workspaceProject(projects, '', recentId) ? { projectId: workspaceProject(projects, '', recentId).id, page: 'overview', days: '7' } : null);
}
