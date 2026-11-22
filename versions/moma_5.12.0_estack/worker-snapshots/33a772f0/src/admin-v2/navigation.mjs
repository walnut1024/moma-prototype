import { PRIVATE_SITE } from '../site-config.mjs';

export const monitoringLinks = [['alerts', '告警管理'], ['incidents', '事件处理'], ['sla', '服务质量报告']];

export const sections = [
  { id: "overview", workspace: "operations", title: "概览", direct: true, items: [
    { id: "overview", label: "概览", children: [["dashboard", "概览"]] },
  ]},
  { id: "analytics", workspace: "operations", title: "运营分析", items: [
    { id: "usage", label: "用量数据", children: [["usage-analysis", "用量数据"]] },
    { id: "users-analysis", label: "用户数据", children: [["user-analysis", "用户数据"]] },
    { id: "customers-analysis", label: "客户数据", children: [["customer-analysis", "客户数据"]] },
  ]},
  { id: "models", workspace: "operations", title: "模型运营", items: [
    { id: "channels-reference", label: "渠道管理", children: [["providers-reference", "渠道列表"], ["providers-health", "渠道健康"]] },
    { id: "warehouse-new", label: "模型服务", children: [["listing-new", "模型服务"]] },
    { id: "market", label: "模型广场", children: [["model-market", "模型广场"]] },
    { id: "materials", label: "基础资料", children: [["model-templates", "模型"], ["provider-materials", "服务商"], ["tariff-dictionary", "计费项"]] },
  ]},
  { id: "commerce", workspace: "operations", title: "商业运营", items: [
    { id: "prices", label: "模型销售", children: [["model-prices", "模型销售"]] },
    { id: "commerce-orders", label: "订购与账单", children: [["orders", "订购记录"], ["bills", "账单"], ["metering", "消费明细"]] },
    { id: "package-production", label: "套餐管理", children: [["package-production", "套餐管理"], ["package-data", "套餐数据"]] },
    { id: "business-analysis", label: "经营分析", children: [["business-analysis", "经营分析"]] },
  ]},
  { id: "traffic", workspace: "operations", title: "流量运营", items: [
    { id: "traffic-limits", label: "限流配置", children: [["traffic-limits", "限流配置"]] },
  ]},
  { id: "customers", workspace: "operations", title: "访问控制", items: [
    { id: "enterprise", label: "租户管理", children: [["tenants", "租户管理"]] },
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
    { id: "accounts", label: "后台账号", children: [["admins", "后台账号"]] },
    { id: "audit-logs", label: "审计日志", children: [["audit-logs", "审计日志"]] },
    { id: "site-configuration", label: "站点配置", children: [["site-configuration", "站点配置"]] },
    { id: "license", label: "License 管理", children: [["license", "License 管理"]] },
  ]},
  { id: "getting-started", workspace: "operations", title: "入门指导", items: [
    { id: "getting-started", label: "模型运营", children: [["getting-started", "模型运营"]] },
  ]},
];

export const pages = {
  ...Object.fromEntries(sections.flatMap(group => group.items.flatMap(item => item.children.map(([id, label]) => [id, { id, label, area: item.id, areaLabel: item.label, group: group.title, groupId: group.id }])))),
  'organization-members': {id:'organization-members',label:'组织及成员',area:'enterprise',areaLabel:'租户管理',group:'访问控制',groupId:'customers'},
  projects: {id:'projects',label:'项目管理',area:'enterprise',areaLabel:'租户管理',group:'访问控制',groupId:'customers'},
  ...Object.fromEntries(monitoringLinks.map(([id, label]) => [id, { id, label, area: 'monitoring', areaLabel: '服务监控', group: '网关管理', groupId: 'gateway' }])),
  ...Object.fromEntries([['goods', '商品与套餐'], ['announcements', '公告与服务通知'], ['ledger', '账户与额度流水'], ['settlement', '服务商对账与结算'], ['adjustments', '退款与调账']].map(([id, label]) => [id, { id, label, area: 'commerce-orders', areaLabel: '订购与账单', group: '商业运营', groupId: 'commerce' }])),
  'customer-analysis-detail': { id: 'customer-analysis-detail', label: '客户详情', area: 'customers-analysis', areaLabel: '客户数据', group: '运营分析', groupId: 'analytics' },
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

export const commercialPage = id => pages[id]?.groupId === 'commerce';

export const adminSections = sections.map(group => {
  if (group.id === 'commerce') return { ...group, items: group.items.filter(item => !['commerce-orders', 'business-analysis'].includes(item.id)) };
  return group;
});

export function isOrganizationPage(id, internalSite) {
  return internalSite && ['tenants','customer-usage-detail'].includes(id);
}

export function canAccessPage(role, id, license) {
  if (license && !license.commercial && (
    commercialPage(id) && !['tenants','projects'].includes(id) ||
    ['customer-analysis','customer-analysis-detail'].includes(id)
  )) return false;
  if (['organization-members','projects'].includes(id) && role !== '平台管理员') return false;
  if (!Object.hasOwn(pages, id) || (id === 'site-configuration' && !PRIVATE_SITE)) return false;
  return pages[id].groupId === 'platform' ? role === '平台管理员' : availableWorkspaces(role).includes(pageWorkspace(id));
}

export function channelManagementListRoute(id, params, query) {
  const list = new URLSearchParams(query);
  for (const key of ['q', 'page', 'size', 'channelProvider', 'channelModel', 'returnTo']) {
    if (params.has(key)) list.set(key, params.get(key));
  }
  return id + (list.size ? '?' + list : '');
}

export function pageFromHash(hash, role) {
  const id = hash.match(/^#\/admin-2\/([^/?]+)/)?.[1];
  return Object.hasOwn(pages, id) ? id : WORKSPACE_HOME[availableWorkspaces(role)[0]] || 'dashboard';
}
