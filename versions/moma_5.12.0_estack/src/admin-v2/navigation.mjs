import { PRIVATE_SITE } from '../site-config.mjs';

export const sections = [
  { id: "overview", workspace: "operations", title: "首页", direct: true, items: [
    { id: "overview", label: "首页", children: [["dashboard", "首页"]] },
  ]},
  { id: "analytics", workspace: "operations", title: "运营分析", items: [
    { id: "usage", label: "用量数据", children: [["usage-analysis", "用量数据"]] },
    { id: "customers-analysis", label: "租户数据", children: [["customer-analysis", "租户数据"]] },
    { id: "users-analysis", label: "用户数据", children: [["user-analysis", "用户数据"]] },
  ]},
  { id: "models", workspace: "operations", title: "模型运营", items: [
    { id: "channels-reference", label: "模型接入", children: [["providers-reference", "连接列表"], ["providers-health", "连接健康"]] },
    { id: "warehouse-new", label: "模型服务", children: [["listing-new", "模型服务"]] },
    { id: "model-links", label: "模型链路", sidebar: false, children: [["model-links", "模型链路"]] },
    { id: "market", label: "模型广场", children: [["model-market", "模型广场"]] },
    { id: "materials", label: "基础资料", children: [["model-templates", "模型"], ["provider-materials", "服务商"], ["tariff-dictionary", "计费项"]] },
  ]},
  { id: "commerce", workspace: "operations", title: "商业运营", items: [
    { id: "prices", label: "模型售卖", children: [["model-prices", "模型售卖"]] },
    { id: "commerce-orders", label: "订购与账单", sidebar: false, children: [["orders", "订购记录"], ["bills", "账单"], ["metering", "消费明细"]] },
    { id: "package-production", label: "套餐管理", sidebar: false, children: [["package-production", "套餐管理"]] },
    { id: "package-data", label: "套餐数据", children: [["package-data", "套餐数据"]] },
    { id: "site-agreements", label: "协议管理", sidebar: false, children: [["site-agreements", "协议管理"]] },
    { id: "business-analysis", label: "经营分析", sidebar: false, children: [["business-analysis", "经营分析"]] },
  ]},
  { id: "traffic", workspace: "operations", title: "流量运营", items: [
    { id: "traffic-limits", label: "限流配置", children: [["traffic-limits", "限流配置"]] },
  ]},
  { id: "customers", workspace: "operations", title: "访问控制", items: [
    { id: "enterprise", label: "租户管理", children: [["tenants", "租户管理"]] },
    { id: "projects", label: "项目管理", children: [["projects", "项目管理"]] },
  ]},
  { id: "platform", workspace: "operations", title: "平台管理", home: "license", items: [
    { id: "site-configuration", label: "站点配置", children: [["site-configuration", "站点配置"]] },
    { id: "announcements", label: "公告管理", children: [["announcements", "公告管理"]] },
    { id: "license", label: "授权管理", children: [["license", "授权管理"]] },
    { id: "accounts", label: "后台账号", children: [["admins", "后台账号"]] },
    { id: "audit-logs", label: "审计日志", sidebar: false, children: [["audit-logs", "审计日志"]] },
  ]},
  { id: "runtime", workspace: "maintenance", title: "运行分析", items: [
    { id: "model-performance", label: "模型性能", children: [["model-performance", "模型性能"]] },
    { id: "logs", label: "调用日志", children: [["logs", "调用日志"]] },
  ]},
  { id: "ops-model-service", workspace: "maintenance", title: "模型推理", items: [
    { id: "clusters", label: "集群管理", children: [["clusters", "集群"], ["ops-nodes", "节点"], ["ops-gpus", "GPU"]] },
    { id: "ops-model-library", label: "模型库", children: [["ops-model-library", "模型库"]] },
    { id: "deployments", label: "模型部署", children: [["deployments", "模型部署"]] },
    { id: "ops-benchmarks", label: "基准测试", children: [["ops-benchmarks", "基准测试"]] },
    { id: "ops-inference-backends", label: "推理后端", children: [["ops-inference-backends", "推理后端"]] },
    { id: "ops-cache-acceleration", label: "KV缓存", children: [["ops-cache-acceleration", "KV缓存"]] },
    { id: "ops-model-files", label: "模型文件", children: [["ops-model-files", "模型文件"]] },
  ]},
  { id: "gateway", workspace: "maintenance", title: "网关管理", items: [
    { id: "gateway", label: "模型路由", children: [["routes", "模型路由"]] },
    { id: "global-routing", label: "路由设置（全局）", children: [["global-routing", "路由设置（全局）"]] },
  ]},
  { id: "getting-started", workspace: "operations", title: "研发须知", items: [
    { id: "model-operations-guide", label: "平台术语", children: [["model-operations-guide", "平台术语"]] },
    { id: "model-operations-requirements", label: "需求文档", children: [["model-operations-requirements", "需求文档"]] },
  ]},
];

export const pages = {
  ...Object.fromEntries(sections.flatMap(group => group.items.flatMap(item => item.children.map(([id, label]) => [id, { id, label, area: item.id, areaLabel: item.label, group: group.title, groupId: group.id }])))),
  'organization-members': {id:'organization-members',label:'组织及成员',area:'enterprise',areaLabel:'租户管理',group:'访问控制',groupId:'customers'},
  ...Object.fromEntries([['goods', '商品与套餐'], ['ledger', '账户与额度流水'], ['settlement', '服务商对账与结算'], ['adjustments', '退款与调账']].map(([id, label]) => [id, { id, label, area: 'commerce-orders', areaLabel: '订购与账单', group: '商业运营', groupId: 'commerce' }])),
  'customer-analysis-detail': { id: 'customer-analysis-detail', label: '租户详情', area: 'customers-analysis', areaLabel: '租户数据', group: '运营分析', groupId: 'analytics' },
  'customer-usage-detail': { id: 'customer-usage-detail', label: '租户详情', area: 'users-analysis', areaLabel: '用户数据', group: '运营分析', groupId: 'analytics' },
};

export const WORKSPACES = { operations: '运营', maintenance: '运维' };
export const WORKSPACE_HOME = { operations: 'dashboard', maintenance: 'model-performance' };

export function availableWorkspaces(role) {
  return role === '平台管理员' ? Object.keys(WORKSPACES) : role === '运营人员' ? ['operations'] : role === '运维人员' ? ['maintenance'] : [];
}

export function pageWorkspace(id) {
  return sections.find(group => group.id === pages[id]?.groupId)?.workspace;
}

export function isInfrastructurePage(id) {
  return pages[id]?.groupId === 'ops-model-service' && !['clusters', 'deployments'].includes(id);
}

export const commercialPage = id => pages[id]?.groupId === 'commerce';

export const adminSections = sections.filter(group => group.sidebar !== false).map(group => ({
  ...group,
  items: group.items.filter(item => item.sidebar !== false),
}));

export function isOrganizationPage(id, internalSite) {
  return internalSite && ['tenants','projects','customer-usage-detail'].includes(id);
}

export function canAccessPage(role, id, license, params) {
  if (license && !license.commercial && (
    commercialPage(id) && !['tenants','projects'].includes(id) ||
    ['customer-analysis','customer-analysis-detail'].includes(id)
  )) return false;
  if (id === 'organization-members' && role !== '平台管理员') return false;
  if (id === 'projects' && role !== '平台管理员' && !(role === '运营人员' && params?.get('tenant'))) return false;
  if (!Object.hasOwn(pages, id)) return false;
  if (id === 'site-configuration' || id === 'site-agreements') return PRIVATE_SITE && role === '平台管理员';
  if (pages[id].groupId === 'platform' || id === 'global-routing') return role === '平台管理员';
  return availableWorkspaces(role).includes(pageWorkspace(id));
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
