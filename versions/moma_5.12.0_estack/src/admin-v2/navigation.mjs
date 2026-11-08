export const monitoringLinks = [['alerts', '告警管理'], ['incidents', '事件处理'], ['sla', '服务质量报告']];

export const sections = [
  { id: "overview", workspace: "operations", title: "概览", direct: true, items: [
    { id: "overview", label: "概览", children: [["dashboard", "概览"]] },
  ]},
  { id: "analytics", workspace: "operations", title: "运营分析", items: [
    { id: "usage", label: "用量数据", children: [["usage-analysis", "用量数据"]] },
    { id: "users-analysis", label: "用户数据", children: [["user-analysis", "用户数据"]] },
  ]},
  { id: "models", workspace: "operations", title: "模型运营", items: [
    { id: "channels", label: "渠道接入", children: [["providers", "渠道接入"]] },
    { id: "warehouse", label: "模型服务", children: [["listing", "模型服务"]] },
    { id: "market", label: "模型广场", children: [["model-market", "模型广场"]] },
    { id: "costs", label: "模型成本", children: [["model-costs", "模型成本"]] },
    { id: "prices", label: "模型售价", children: [["model-prices", "模型售价"]] },
    { id: "materials", label: "模型资料", children: [["model-templates", "模型"], ["provider-materials", "服务商"], ["tariff-dictionary", "计费项"]] },
  ]},
  { id: "packages", workspace: "operations", title: "套餐运营", items: [
    { id: "package-production", label: "套餐制作", children: [["package-production", "套餐制作"]] },
    { id: "package-data", label: "套餐数据", children: [["package-data", "套餐数据"]] },
  ]},
  { id: "traffic", workspace: "operations", title: "流量运营", items: [
    { id: "traffic-limits", label: "限流配置", children: [["traffic-limits", "限流配置"]] },
  ]},
  { id: "customers", workspace: "operations", title: "用户管理", items: [
    { id: "enterprise", label: "政企用户", children: [["tenants", "政企用户"]] },
    { id: "individual", label: "个人用户", children: [["individual-users", "个人用户"]] },
  ]},
  { id: "runtime", workspace: "maintenance", title: "运行分析", items: [
    { id: "calls", label: "调用数据", children: [["call-analysis", "调用数据"]] },
  ]},
  { id: "gateway", workspace: "maintenance", title: "网关管理", items: [
    { id: "gateway", label: "网关配置", children: [["routes", "路由策略"], ["limits", "限流与并发"], ["fallback", "熔断与回退"], ["cache", "缓存策略"], ["releases", "配置版本与发布"]] },
    { id: "logs", label: "调用日志", children: [["logs", "调用日志"]] },
    { id: "monitoring", label: "服务监控", children: [["monitoring", "服务监控"]] },
  ]},
  { id: "production", workspace: "maintenance", title: "Token 生产", items: [
    { id: "clusters", label: "集群纳管", children: [["clusters", "集群纳管"]] },
    { id: "deployments", label: "模型部署", children: [["deployments", "模型部署"]] },
    { id: "artifacts", label: "制品镜像", children: [["artifacts", "制品镜像"]] },
    { id: "production-observation", label: "生产观测", children: [["model-observability", "生产观测"]] },
  ]},
  { id: "platform", title: "平台管理", items: [
    { id: "accounts", label: "账号管理", children: [["admins", "账号管理"]] },
  ]},
  { id: "getting-started", workspace: "operations", title: "入门指导", items: [
    { id: "getting-started", label: "模型运营", children: [["getting-started", "模型运营"]] },
  ]},
];

export const pages = {
  ...Object.fromEntries(sections.flatMap(group => group.items.flatMap(item => item.children.map(([id, label]) => [id, { id, label, area: item.id, areaLabel: item.label, group: group.title, groupId: group.id }])))),
  ...Object.fromEntries(monitoringLinks.map(([id, label]) => [id, { id, label, area: 'monitoring', areaLabel: '服务监控', group: '网关管理', groupId: 'gateway' }])),
  ...Object.fromEntries([['goods', '商品与套餐'], ['orders', '订单与订阅'], ['announcements', '公告与服务通知'], ['metering', '计量明细'], ['ledger', '账户与额度流水'], ['bills', '客户账单'], ['settlement', '服务商对账与结算'], ['adjustments', '退款与调账']].map(([id, label]) => [id, { id, label, area: 'warehouse', areaLabel: '模型服务', group: '模型运营', groupId: 'models' }])),
  'customer-usage-detail': { id: 'customer-usage-detail', label: '客户详情', area: 'users-analysis', areaLabel: '用户数据', group: '运营分析', groupId: 'analytics' },
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
  return pages[id].groupId === 'platform' ? role === '平台管理员' : availableWorkspaces(role).includes(pageWorkspace(id));
}

export function pageFromHash(hash, role) {
  const id = hash.match(/^#\/admin-2\/([^/?]+)/)?.[1];
  return Object.hasOwn(pages, id) ? id : WORKSPACE_HOME[availableWorkspaces(role)[0]] || 'dashboard';
}
