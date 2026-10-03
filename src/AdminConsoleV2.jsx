import OperationsOverview from './admin-v2/OperationsOverview';
import { Fragment, useEffect, useState } from "react";
import AnalyticsPages from "./admin-v2/AnalyticsPages";
import { Activity, Users, Bell, Boxes, Building2, ChevronRight, CloudCog, ChartColumn, LayoutDashboard, Network, Settings, ShieldCheck, Store, Server, X } from "lucide-react";
import "./admin-v2.css";
import "./admin-v2-fix.css";
import { useAdminStore } from "./admin-v2/store";
import { ClusterManagement, ModelDeployments, ModelObservability } from "./admin-v2/InferencePages";
import SupplyPage from "./admin-v2/SupplyPages";
import CustomerPage from "./admin-v2/CustomerPages";
import CustomerUsageDetail from "./admin-v2/CustomerUsageDetail";
import ModelPage from "./admin-v2/ModelPages";
import GatewayPage from "./admin-v2/GatewayPages";
import ObservabilityPage from "./admin-v2/ObservabilityPages";
import BusinessOperationsPage from "./admin-v2/BusinessOperationsPages";


const sections = [
  { id: "analytics", title: "运营分析", icon: ChartColumn, items: [
    { id: "overview", label: "运营概览", children: [["dashboard", "运营概览"]] },
    { id: "usage", label: "用量统计", children: [["usage-analysis", "用量统计"]] },
    { id: "users-analysis", label: "用户分析", children: [["user-analysis", "用户分析"]] },
    { id: "calls", label: "调用分析", children: [["call-analysis", "调用分析"]] },
  ]},
  { id: "models", title: "模型运营", icon: Boxes, items: [
    { id: "warehouse", label: "模型仓库", children: [["catalog", "模型仓库"], ["lifecycle", "版本与生命周期"], ["capability", "能力与规格"], ["validation", "模型验证"], ["prices", "价格配置"], ["supply-quota", "供给额度与采购价"]] },
    { id: "square", label: "模型广场", children: [["listing", "模型广场"]] },
    { id: "channels", label: "渠道管理", children: [["providers", "渠道管理"], ["endpoints", "服务端点"]] },
  ]},
  { id: "customers", title: "用户管理", icon: Users, items: [
    { id: "enterprise", label: "企业用户", children: [["tenants", "企业用户"], ["projects", "项目空间"], ["members", "成员与角色"], ["keys", "API Key 管理"], ["authorization", "授权与额度"]] },
    { id: "individual", label: "个人用户", children: [["individual-users", "个人用户"]] },
  ]},
  { id: "gateway", title: "网关管理", icon: Network, direct: true, items: [
    { id: "gateway", label: "网关管理", children: [["routes", "路由策略"], ["limits", "限流与并发"], ["fallback", "熔断与回退"], ["cache", "缓存策略"], ["releases", "配置版本与发布"], ["monitoring", "服务监控"], ["logs", "请求日志"], ["alerts", "告警管理"], ["incidents", "事件处理"], ["sla", "服务质量报告"]] },
  ]},
  { id: "production", title: "Token 生产", icon: CloudCog, items: [
    { id: "clusters", label: "集群纳管", children: [["clusters", "集群纳管"]] },
    { id: "deployments", label: "模型部署", children: [["deployments", "模型部署"], ["artifacts", "模型制品与镜像"]] },
    { id: "production-observation", label: "生产观测", children: [["model-observability", "生产观测"]] },
  ]},
  { id: "platform", title: "平台管理", icon: Settings, items: [
    { id: "security", label: "安全治理", children: [["request-security", "请求安全策略"], ["data-policy", "数据使用策略"], ["abuse", "访问与滥用防护"], ["security-events", "安全事件"]] },
    { id: "system", label: "系统管理", children: [["admins", "后台人员与角色"], ["audit", "操作审计"], ["approvals", "审批与变更规则"], ["integrations", "通知与集成"], ["settings", "基础配置"]] },
  ]},
];

const pages = {
  ...Object.fromEntries(sections.flatMap(group => group.items.flatMap(item => item.children.map(([id, label]) => [id, { id, label, area: item.id, areaLabel: item.label, group: group.title, groupId: group.id }])))),
  ...Object.fromEntries([['goods', '商品与套餐'], ['orders', '订单与订阅'], ['announcements', '公告与服务通知'], ['metering', '计量明细'], ['ledger', '账户与额度流水'], ['bills', '客户账单'], ['settlement', '服务商对账与结算'], ['adjustments', '退款与调账']].map(([id, label]) => [id, { id, label, area: 'warehouse', areaLabel: '模型仓库', group: '模型运营', groupId: 'models' }])),
  workbench: { id: 'workbench', label: '工作台', group: '工作台' },
  'customer-usage-detail': { id: 'customer-usage-detail', label: '客户详情', area: 'users-analysis', areaLabel: '用户分析', group: '运营分析', groupId: 'analytics' },
};

function Workbench({ state, navigate }) {
  const alerts = state.alerts.filter(item => !['已恢复', '已转事件'].includes(item.status));
  return <div className="v2-page"><div className="v2-page-head"><h1>工作台</h1></div><section className="v2-kpis v2-workbench-kpis">{[
    ['待处理告警', alerts.length, 'alerts'], ['模型数量', state.models.length, 'catalog'],
    ['集群数量', state.clusters.length, 'clusters'], ['部署实例', state.deployments.length, 'deployments'],
  ].map(([label, value, target]) => <button className="v2-workbench-metric" key={target} onClick={() => navigate(target)}><span>{label}</span><strong>{value}</strong><small>查看详情 →</small></button>)}</section><section className="v2-list v2-workbench-shortcuts"><h2>常用入口</h2><div>{sections.map(group => <button key={group.id} onClick={() => navigate(group.items[0].children[0][0])}><group.icon size={18}/>{group.title}<ChevronRight size={16}/></button>)}</div></section><section className="v2-list v2-workbench-shortcuts"><h2>待处理告警</h2>{alerts.length ? alerts.map(alert => <button key={alert.id} onClick={() => navigate('alerts')}>{alert.name || alert.title || alert.id}<span>{alert.status}</span><ChevronRight size={16}/></button>) : <p>暂无待处理告警</p>}</section></div>;
}

export default function AdminConsoleV2() {
  const pageFromHash = () => { const id = location.hash.match(/^#\/admin-2\/([^/?]+)/)?.[1]; return id === "dashboard" || pages[id] ? id : "workbench"; };
  const initialPage = pageFromHash(), { state, dispatch, recover, reload, conflict } = useAdminStore();
  const [active, setActive] = useState(initialPage), [drawer, setDrawer] = useState("");
  useEffect(() => { const sync = () => setActive(pageFromHash()); window.addEventListener("hashchange", sync); return () => window.removeEventListener("hashchange", sync); }, []);
  const navigate = id => { setActive(id); location.hash = `/admin-2/${id}`; window.scrollTo({ top: 0, behavior: "instant" }); };
  const page = pages[active];
  const activeModule = sections.flatMap(group => group.items).find(item => item.id === page.area);
  const detailTenant = active === 'customer-usage-detail' ? state.tenants.find(item => item.id === new URLSearchParams(location.hash.split('?')[1] || '').get('customer')) : null;
  const breadcrumbs = [...new Set([page.group, page.areaLabel, detailTenant?.name || page.label].filter(Boolean))];
  return <div className="admin-v2"><aside className="v2-sidebar"><button type="button" className="v2-sidebar-title v2-workbench-entry" aria-current={active === 'workbench' ? 'page' : undefined} onClick={() => navigate('workbench')}><LayoutDashboard size={17}/><b>工作台</b></button><nav aria-label="后台导航">{sections.map(group => <section key={group.id}>{!group.direct && <small>{group.title}</small>}{group.items.map(item => {
      const Icon = { overview: LayoutDashboard, usage: ChartColumn, 'users-analysis': Users, calls: Activity, warehouse: Boxes, square: Store, channels: CloudCog, enterprise: Building2, individual: Users, gateway: Network, clusters: Server, deployments: Boxes, 'production-observation': Activity, security: ShieldCheck, system: Settings }[item.id];
      const selected = page.area === item.id;
      return <div key={item.id}><button type="button" aria-current={selected ? 'page' : undefined} className={selected ? 'active' : ''} onClick={() => navigate(item.children[0][0])}><Icon/>{item.label}</button></div>;
    })}</section>)}</nav></aside>
    <div className="v2-content"><header><div aria-label="面包屑">{breadcrumbs.map((label,index)=><Fragment key={index}>{index>0&&<ChevronRight aria-hidden="true"/>}{active === "customer-usage-detail" && index === 1 ? <a className="us-breadcrumb-link" href="#/admin-2/user-analysis">{label}</a> : <span aria-current={index===breadcrumbs.length-1?"page":undefined}>{label}</span>}</Fragment>)}{detailTenant && <small className="us-breadcrumb-meta">{detailTenant.id} · {detailTenant.type} · {detailTenant.status}</small>}</div><span><Bell/><i>{state.alerts.filter(item => !["已恢复", "已转事件"].includes(item.status)).length}</i></span><select className="v2-role" aria-label="当前后台角色" value={state.currentRole} onChange={event => dispatch({ type: "setRole", role: event.target.value })}>{["平台管理员", "运营人员", "运维人员", "财务人员", "安全管理员", "只读观察员"].map(role => <option key={role}>{role}</option>)}</select><span className="v2-environment">{state.settings.environmentLabel}</span></header>{state.storageError && <div className="v2-system-alert error">演示数据无法读取：{state.storageError}<button onClick={recover}>恢复演示数据</button></div>}{conflict && <div className="v2-system-alert">检测到其他页面的新版本数据。<button onClick={reload}>载入新版本</button></div>}<main>{activeModule?.children.length > 1 && <nav className="v2-module-tabs" aria-label={`${activeModule.label}页面`}>{activeModule.children.map(([id,label])=><button key={id} type="button" aria-current={active===id?'page':undefined} className={active===id?'active':''} onClick={()=>navigate(id)}>{label}</button>)}</nav>}{active === "workbench" ? <Workbench state={state} navigate={navigate}/> : active === "dashboard" ? <OperationsOverview/> : ["usage-analysis", "user-analysis", "call-analysis"].includes(active) ? <AnalyticsPages pageId={active} state={state}/> : active === 'customer-usage-detail' ? <CustomerUsageDetail state={state}/> : ["catalog", "providers", "endpoints", "supply-quota"].includes(active) ? <SupplyPage pageId={active} state={state} dispatch={dispatch} navigate={navigate}/> : ["lifecycle", "capability", "validation"].includes(active) ? <ModelPage pageId={active} state={state} dispatch={dispatch}/> : ["tenants", "individual-users", "projects", "members", "keys", "authorization"].includes(active) ? <CustomerPage key={active} userType={active === "tenants" ? "企业" : active === "individual-users" ? "个人" : undefined} pageId={active === "individual-users" ? "tenants" : active} state={state} dispatch={dispatch}/> : ["routes", "limits", "fallback", "cache", "releases"].includes(active) ? <GatewayPage pageId={active} state={state} dispatch={dispatch}/> : ["monitoring", "logs", "alerts", "incidents", "sla"].includes(active) ? <ObservabilityPage pageId={active} state={state} dispatch={dispatch} navigate={navigate}/> : active === "clusters" ? <ClusterManagement state={state} dispatch={dispatch}/> : active === "deployments" ? <ModelDeployments state={state} dispatch={dispatch}/> : active === "model-observability" ? <ModelObservability state={state}/> : <BusinessOperationsPage pageId={active} state={state} dispatch={dispatch}/>}</main></div>
    {drawer && <div className="v2-mask" onClick={() => setDrawer("")}><aside className="v2-drawer" onClick={e => e.stopPropagation()}><header><h2>{drawer}</h2><button aria-label="关闭" onClick={() => setDrawer("")}><X/></button></header><div><label>名称<input placeholder={`请输入${drawer.replace("新建", "").replace("编辑", "")}名称`}/></label><label>归属空间<select><option>江苏生产环境</option><option>研发测试环境</option></select></label><label>状态<select><option>启用</option><option>停用</option></select></label><label>说明<textarea placeholder="请输入说明"/></label></div><footer><button onClick={() => setDrawer("")}>取消</button><button className="v2-primary" onClick={() => setDrawer("")}>确定</button></footer></aside></div>}
  </div>;
}
