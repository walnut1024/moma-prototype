export const projectTabs = [['overview', '概览'], ['models', '模型'], ['members', '成员'], ['settings', '设置'], ['audit', '操作记录']];
export const enterpriseTabs = [['组织及成员', '组织与成员'], ['账户操作记录', '操作记录']];

export function workspaceNavigation(userType) {
  return [
    ['模型服务', [['catalogue', '模型广场'], ['智能路由', '智能路由']]],
    ['模型体验', [['experience', '文本生成'], ['图片生成', '图片生成'], ['视频生成', '视频生成'], ['语音识别', '语音识别']]],
    ['订单管理', [['模型订购', '模型订购']]],
    ['模型观测', [['usage', '用量统计'], ['调用观测', '调用观测'], ...(userType === 'enterprise' ? [['logs', '调用日志']] : [])]],
    ['项目', [['overview', '项目管理'], ['keys', 'API Key']]],
    ...(userType === 'enterprise' ? [['企业', [['组织及成员', '企业管理']]]] : []),
  ];
}

export function navigationPage(page) {
  if (page === 'projects' || projectTabs.some(([id]) => id === page)) return 'overview';
  if (enterpriseTabs.some(([id]) => id === page)) return '组织及成员';
  return page;
}

export const projectSwitchPage = page => page === 'detail' ? 'catalogue' : page === 'projects' ? 'overview' : page;
