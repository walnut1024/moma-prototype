export const sections = [
  { id: "overview", workspace: "operations", title: "概览", direct: true, items: [
    { id: "overview", label: "概览", children: [["dashboard", "概览"]] },
  ]},
  { id: "analytics", workspace: "operations", title: "运营分析", items: [
    { id: "usage", label: "用量统计", children: [["usage-analysis", "用量统计"]] },
    { id: "users-analysis", label: "用户分析", children: [["user-analysis", "用户分析"]] },
  ]},
  { id: "models", workspace: "operations", title: "模型运营", items: [
    { id: "warehouse", label: "模型管理", children: [["listing", "模型管理"]] },
    { id: "channels", label: "模型供应", children: [["providers", "模型供应"]] },
  ]},
  { id: "runtime", workspace: "maintenance", title: "运行分析", items: [
    { id: "calls", label: "调用分析", children: [["call-analysis", "调用分析"]] },
  ]},
  { id: "gateway", workspace: "maintenance", title: "网关管理", items: [
    { id: "gateway", label: "网关配置", children: [["routes", "路由策略"], ["limits", "限流与并发"], ["fallback", "熔断与回退"], ["cache", "缓存策略"], ["releases", "配置版本与发布"], ["monitoring", "服务监控"], ["logs", "请求日志"], ["alerts", "告警管理"], ["incidents", "事件处理"], ["sla", "服务质量报告"]] },
  ]},
];

export const pages = {
  ...Object.fromEntries(sections.flatMap(group => group.items.flatMap(item => item.children.map(([id, label]) => [id, { id, label, area: item.id, areaLabel: item.label, group: group.title, groupId: group.id }])))),
  ...Object.fromEntries([['goods', '商品与套餐'], ['orders', '订单与订阅'], ['announcements', '公告与服务通知'], ['metering', '计量明细'], ['ledger', '账户与额度流水'], ['bills', '客户账单'], ['settlement', '服务商对账与结算'], ['adjustments', '退款与调账']].map(([id, label]) => [id, { id, label, area: 'warehouse', areaLabel: '模型管理', group: '模型运营', groupId: 'models' }])),
  'customer-usage-detail': { id: 'customer-usage-detail', label: '客户详情', area: 'users-analysis', areaLabel: '用户分析', group: '运营分析', groupId: 'analytics' },
};

export const WORKSPACES = { operations: '运营', maintenance: '运维' };
export const WORKSPACE_HOME = { operations: 'dashboard', maintenance: 'call-analysis' };

export function availableWorkspaces(role) {
  return role === '平台管理员' ? Object.keys(WORKSPACES) : role === '运营人员' ? ['operations'] : role === '运维人员' ? ['maintenance'] : [];
}

export function pageWorkspace(id) {
  return sections.find(group => group.id === pages[id]?.groupId)?.workspace;
}

export function canAccessPage(role, id) {
  if (!Object.hasOwn(pages, id)) return false;
  return availableWorkspaces(role).includes(pageWorkspace(id));
}

export function pageFromHash(hash, role) {
  const id = hash.match(/^#\/admin-2\/([^/?]+)/)?.[1];
  return Object.hasOwn(pages, id) ? id : WORKSPACE_HOME[availableWorkspaces(role)[0]] || 'dashboard';
}
