import { toast } from "sonner";
import { Toaster } from "./components/ui/sonner";
import { createPortal } from "react-dom";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select";
import OperationsOverview from './admin-v2/OperationsOverview';
import { Fragment, useEffect, useState } from "react";
import AnalyticsPages from "./admin-v2/AnalyticsPages";
import { Activity, Users, Bell, Boxes, Building2, ChevronRight, CloudCog, ChartColumn, LayoutDashboard, Network, UserCog, Server, X } from "lucide-react";
import "./admin-v2.css";
import "./admin-v2-fix.css";
import { useAdminStore } from "./admin-v2/store";
import { ClusterManagement, ModelDeployments, ModelObservability } from "./admin-v2/InferencePages";
import ProviderManagement from "./admin-v2/ProviderManagement";
import CustomerPage from "./admin-v2/CustomerPages";
import IndividualUsersPage from "./admin-v2/IndividualUsersPage";
import { individualAccounts, individualName } from "./admin-v2/individual-users";
import CustomerUsageDetail from "./admin-v2/CustomerUsageDetail";
import ModelManagement from "./admin-v2/ModelManagement";
import { privateEnterprise } from "./admin-v2/enterprise";
import GatewayPage from "./admin-v2/GatewayPages";
import ObservabilityPage from "./admin-v2/ObservabilityPages";
import BusinessOperationsPage from "./admin-v2/BusinessOperationsPages";
import AdminAccounts from "./admin-v2/AdminAccounts";
import { ADMIN_ROLES, ADMIN_ROLE_LABELS } from "./admin-v2/admin-accounts";


const sections = [
  { id: "overview", title: "概览", direct: true, items: [
    { id: "overview", label: "概览", children: [["dashboard", "概览"]] },
  ]},
  { id: "analytics", title: "运营分析", items: [
    { id: "usage", label: "用量统计", children: [["usage-analysis", "用量统计"]] },
    { id: "users-analysis", label: "用户分析", children: [["user-analysis", "用户分析"]] },
  ]},
  { id: "models", title: "模型运营", items: [
    { id: "warehouse", label: "模型管理", children: [["listing", "模型管理"]] },
    { id: "channels", label: "模型供应", children: [["providers", "模型供应"]] },
  ]},
  { id: "customers", title: "用户管理", items: [
    { id: "enterprise", label: "政企用户", children: [["tenants", "政企用户"]] },
    { id: "individual", label: "个人用户", children: [["individual-users", "个人用户"]] },
  ]},
  { id: "runtime", title: "运行分析", items: [
    { id: "calls", label: "调用分析", children: [["call-analysis", "调用分析"]] },
  ]},
  { id: "gateway", title: "网关管理", items: [
    { id: "gateway", label: "网关配置", children: [["routes", "路由策略"], ["limits", "限流与并发"], ["fallback", "熔断与回退"], ["cache", "缓存策略"], ["releases", "配置版本与发布"], ["monitoring", "服务监控"], ["logs", "请求日志"], ["alerts", "告警管理"], ["incidents", "事件处理"], ["sla", "服务质量报告"]] },
  ]},
  { id: "production", title: "Token 生产", items: [
    { id: "clusters", label: "集群纳管", children: [["clusters", "集群纳管"]] },
    { id: "deployments", label: "模型部署", children: [["deployments", "模型部署"]] },
    { id: "artifacts", label: "制品镜像", children: [["artifacts", "制品镜像"]] },
    { id: "production-observation", label: "生产观测", children: [["model-observability", "生产观测"]] },
  ]},
  { id: "platform", title: "平台管理", items: [
    { id: "accounts", label: "账号管理", children: [["admins", "账号管理"]] },
  ]},
];

const pages = {
  ...Object.fromEntries(sections.flatMap(group => group.items.flatMap(item => item.children.map(([id, label]) => [id, { id, label, area: item.id, areaLabel: item.label, group: group.title, groupId: group.id }])))),
  ...Object.fromEntries([['goods', '商品与套餐'], ['orders', '订单与订阅'], ['announcements', '公告与服务通知'], ['metering', '计量明细'], ['ledger', '账户与额度流水'], ['bills', '客户账单'], ['settlement', '服务商对账与结算'], ['adjustments', '退款与调账']].map(([id, label]) => [id, { id, label, area: 'warehouse', areaLabel: '模型管理', group: '模型运营', groupId: 'models' }])),
  'customer-usage-detail': { id: 'customer-usage-detail', label: '客户详情', area: 'users-analysis', areaLabel: '用户分析', group: '运营分析', groupId: 'analytics' },
};

export default function AdminConsoleV2({ bannerTarget }) {
  const pageFromHash = () => { const id = location.hash.match(/^#\/admin-2\/([^/?]+)/)?.[1]; return Object.hasOwn(pages, id) ? id : "dashboard"; };
  const initialPage = pageFromHash(), { state, dispatch, transact, transactModel, transactIndividual, transactProvider, transactAdminAccount, recover, reload, conflict } = useAdminStore();
  const [active, setActive] = useState(initialPage), [drawer, setDrawer] = useState("");
  const [detailParams, setDetailParams] = useState(() => new URLSearchParams(location.hash.split('?')[1] || ''));
  useEffect(() => { const sync = () => { setActive(pageFromHash()); setDetailParams(new URLSearchParams(location.hash.split('?')[1] || '')); }; window.addEventListener("hashchange", sync); return () => window.removeEventListener("hashchange", sync); }, []);
  useEffect(() => () => toast.dismiss(), []);
  const navigate = id => { setActive(id); location.hash = `/admin-2/${id}`; window.scrollTo({ top: 0, behavior: "instant" }); };
  const page = pages[active];
  const detailProvider = active === "providers" ? state.providers.find(item => item.id === detailParams.get("provider")) : null;
  const providerListParams = new URLSearchParams(detailParams);
  ["provider", "connection", "tab"].forEach(key => providerListParams.delete(key));
  const providerListHref = "#/admin-2/providers" + (providerListParams.size ? "?" + providerListParams : "");
  const activeModule = sections.flatMap(group => group.items).find(item => item.id === page.area);
  const detailTenant = active === 'customer-usage-detail' ? state.tenants.find(item => item.id === new URLSearchParams(location.hash.split('?')[1] || '').get('customer')) : null;
  const detailModel = active === 'listing' ? state.models.find(item => item.id === detailParams.get('model')) : null;
  const modelListParams = new URLSearchParams(detailParams);
  ['model', 'tab'].forEach(key => modelListParams.delete(key));
  const modelListHref = '#/admin-2/listing' + (modelListParams.size ? '?' + modelListParams : '');
  const enterpriseDetailId = active === 'tenants' ? detailParams.get('enterprise') : null;
  const detailEnterprise = enterpriseDetailId ? state.tenants.find(item => item.id === enterpriseDetailId && ['企业', '政府'].includes(item.type) && (detailParams.get('scenario') !== 'private' || privateEnterprise(state)?.id === item.id)) : null;
  const enterpriseListParams = new URLSearchParams(detailParams);
  ['enterprise', 'tab', 'project'].forEach(key => enterpriseListParams.delete(key));
  const enterpriseListHref = `#/admin-2/tenants${enterpriseListParams.size ? '?' + enterpriseListParams : ''}`;
  const individualDetailId = active === 'individual-users' ? detailParams.get('user') : null;
  const detailIndividual = individualDetailId ? individualAccounts(state).find(account => account.tenant.ownerId === individualDetailId) : null;
  const individualListParams = new URLSearchParams(detailParams);
  ['user', 'tab'].forEach(key => individualListParams.delete(key));
  const individualListHref = '#/admin-2/individual-users' + (individualListParams.size ? '?' + individualListParams : '');
  const breadcrumbs = [...new Set([page.group, page.areaLabel, detailTenant?.name || detailModel?.name || page.label].filter(Boolean)), ...(detailProvider ? [detailProvider.name] : enterpriseDetailId ? [detailEnterprise?.name || '企业不存在'] : individualDetailId ? [detailIndividual ? individualName(detailIndividual) : '用户不存在'] : [])];
  const roleTarget = bannerTarget?.querySelector("[data-admin-role]");
  const deploymentTarget = bannerTarget?.querySelector("[data-admin-deployment]");
  return <div className="admin-v2">{createPortal(<Toaster position="top-right" offset={{ top: 64, right: 20 }} duration={3000} richColors closeButton containerAriaLabel="操作反馈" toastOptions={{ closeButtonAriaLabel: "关闭提示", classNames: { toast: "cn-toast" } }}/>, document.body)}{roleTarget && createPortal(<div className="admin-banner-field admin-banner-role"><span>当前角色</span><Select value={state.currentRole} onValueChange={role => dispatch({ type: "setRole", role })}><SelectTrigger size="sm" aria-label="当前后台角色"><SelectValue/></SelectTrigger><SelectContent align="end">{ADMIN_ROLES.map(role => <SelectItem key={role} value={role}>{ADMIN_ROLE_LABELS[role]}</SelectItem>)}</SelectContent></Select></div>, roleTarget)}<aside className="v2-sidebar"><nav aria-label="后台导航">{sections.map(group => <section key={group.id} aria-label={group.title}>{!group.direct && <small>{group.title}</small>}{group.items.map(item => {
      const Icon = { overview: LayoutDashboard, usage: ChartColumn, 'users-analysis': Users, calls: Activity, warehouse: Boxes, channels: CloudCog, enterprise: Building2, individual: Users, gateway: Network, clusters: Server, deployments: Boxes, artifacts: Boxes, 'production-observation': Activity, accounts: UserCog }[item.id];
      const selected = page.area === item.id;
      return <div key={item.id}><button type="button" aria-current={selected ? 'page' : undefined} className={selected ? 'active' : ''} onClick={() => navigate(item.children[0][0])}><Icon/>{item.label}</button></div>;
    })}</section>)}</nav></aside>
    <div className="v2-content"><header><div aria-label="面包屑" className={enterpriseDetailId || individualDetailId ? "ent-breadcrumb" : undefined}>{breadcrumbs.map((label,index)=><Fragment key={index}>{index>0&&<ChevronRight aria-hidden="true"/>}{active === "customer-usage-detail" && index === 1 ? <a className="us-breadcrumb-link" href="#/admin-2/user-analysis">{label}</a> : detailProvider && index === breadcrumbs.length - 2 ? <a className="mm-breadcrumb-link" href={providerListHref}>{label}</a> : detailModel && index === breadcrumbs.length - 2 ? <a className="mm-breadcrumb-link" data-model-list-breadcrumb href={modelListHref}>{label}</a> : individualDetailId && index === breadcrumbs.length - 2 ? <a className="ent-breadcrumb-link" href={individualListHref}>{label}</a> : enterpriseDetailId && index === breadcrumbs.length - 2 ? <a className="ent-breadcrumb-link" href={enterpriseListHref}>{label}</a> : <span title={(enterpriseDetailId || individualDetailId) && index === breadcrumbs.length - 1 ? label : undefined} aria-current={index===breadcrumbs.length-1?"page":undefined}>{label}</span>}</Fragment>)}{detailTenant && <small className="us-breadcrumb-meta">{detailTenant.id} · {detailTenant.type} · {detailTenant.status}</small>}</div><span><Bell/><i>{state.alerts.filter(item => !["已恢复", "已转事件"].includes(item.status)).length}</i></span></header>{state.storageError && <div className="v2-system-alert error">数据无法读取：{state.storageError}<button onClick={recover}>恢复数据</button></div>}{conflict && <div className="v2-system-alert">检测到其他页面的新版本数据。<button onClick={reload}>载入新版本</button></div>}<main>{activeModule?.children.length > 1 && <nav className="v2-module-tabs" aria-label={`${activeModule.label}页面`}>{activeModule.children.map(([id,label])=><button key={id} type="button" aria-current={active===id?'page':undefined} className={active===id?'active':''} onClick={()=>navigate(id)}>{label}</button>)}</nav>}{active === "dashboard" ? <OperationsOverview/> : ["usage-analysis", "user-analysis", "call-analysis"].includes(active) ? <AnalyticsPages pageId={active} state={state}/> : active === 'customer-usage-detail' ? <CustomerUsageDetail state={state}/> : active === "admins" ? <AdminAccounts state={state} transact={transactAdminAccount} conflict={conflict}/> : active === "providers" ? <ProviderManagement state={state} transact={transactProvider} conflict={conflict}/> : active === "listing" ? <ModelManagement state={state} transact={transactModel} conflict={conflict}/> : active === "individual-users" ? <IndividualUsersPage state={state} transact={transactIndividual} conflict={conflict}/> : active === "tenants" ? <CustomerPage state={state} transact={transact} deploymentTarget={deploymentTarget}/> : ["routes", "limits", "fallback", "cache", "releases"].includes(active) ? <GatewayPage pageId={active} state={state} dispatch={dispatch}/> : ["monitoring", "logs", "alerts", "incidents", "sla"].includes(active) ? <ObservabilityPage pageId={active} state={state} dispatch={dispatch} navigate={navigate}/> : active === "clusters" ? <ClusterManagement state={state} dispatch={dispatch}/> : active === "deployments" ? <ModelDeployments state={state} dispatch={dispatch}/> : active === "model-observability" ? <ModelObservability state={state}/> : <BusinessOperationsPage key={active} pageId={active} state={state} dispatch={dispatch}/>}</main></div>
    {drawer && <div className="v2-mask" onClick={() => setDrawer("")}><aside className="v2-drawer" onClick={e => e.stopPropagation()}><header><h2>{drawer}</h2><button aria-label="关闭" onClick={() => setDrawer("")}><X/></button></header><div><label>名称<input placeholder={`请输入${drawer.replace("新建", "").replace("编辑", "")}名称`}/></label><label>归属空间<select><option>江苏生产环境</option><option>研发测试环境</option></select></label><label>状态<select><option>启用</option><option>停用</option></select></label><label>说明<textarea placeholder="请输入说明"/></label></div><footer><button onClick={() => setDrawer("")}>取消</button><button className="v2-primary" onClick={() => setDrawer("")}>确定</button></footer></aside></div>}
  </div>;
}
