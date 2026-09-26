import OperationsOverview from './admin-v2/OperationsOverview';
import { Fragment, useEffect, useState } from "react";
import AnalyticsPages from "./admin-v2/AnalyticsPages";
import { Activity, ChartColumn, Users, Bell, Boxes, Building2, ChevronRight, CircleDollarSign, CloudCog, Gauge, LayoutDashboard, Network, Settings, ShieldCheck, Store, X } from "lucide-react";
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
  { title: "运营分析", items: [
    { id: "analytics", label: "运营分析", icon: Gauge, children: [["dashboard", "运营概览", "P0"], ["usage-analysis", "用量分析", "P0"], ["user-analysis", "用户分析", "P0"], ["call-analysis", "调用分析", "P0"]] },
  ]},
  { title: "业务运营", items: [
    { id: "models", label: "模型中心", icon: Boxes, children: [["catalog", "模型目录", "P0"], ["lifecycle", "版本与生命周期", "P1"], ["capability", "能力与规格", "P0"], ["validation", "模型验证", "P0"]] },
    { id: "customers", label: "客户与租户", icon: Building2, children: [["tenants", "租户管理", "P0"], ["projects", "项目空间", "P0"], ["members", "成员与租户角色", "P0"], ["keys", "API Key 管理", "P0"], ["authorization", "授权与额度", "P0"]] },
    { id: "products", label: "产品运营", icon: Store, children: [["goods", "商品与套餐", "P0"], ["prices", "价格管理", "P0"], ["orders", "订单与订阅", "P0"], ["listing", "上架与展示", "P0"], ["announcements", "公告与服务通知", "P1"]] },
    { id: "billing", label: "计费结算", icon: CircleDollarSign, children: [["metering", "计量明细", "P0"], ["ledger", "账户与额度流水", "P0"], ["bills", "客户账单", "P0"], ["settlement", "服务商对账与结算", "P1"], ["adjustments", "退款与调账", "P1"]] },
  ]},
  { title: "服务运维", items: [
    { id: "supply", label: "服务供给", icon: CloudCog, children: [["providers", "服务商管理", "P0"], ["endpoints", "服务端点", "P0"], ["supply-quota", "供给额度与采购价", "P0"], ["artifacts", "模型制品与镜像", "P0"]] },
    { id: "inference-management", label: "模型推理", icon: Boxes, children: [["clusters", "集群纳管", "P0"], ["deployments", "模型部署", "P0"], ["model-observability", "模型观测", "P0"]] },
    { id: "gateway", label: "网关路由", icon: Network, children: [["routes", "路由策略", "P0"], ["limits", "限流与并发", "P0"], ["fallback", "熔断与回退", "P0"], ["cache", "缓存策略", "P2"], ["releases", "配置版本与发布", "P0"]] },
    { id: "operations", label: "监控运维", icon: Activity, children: [["monitoring", "服务监控", "P0"], ["logs", "调用日志与链路", "P0"], ["alerts", "告警管理", "P0"], ["incidents", "事件处理", "P1"], ["sla", "服务质量报告", "P1"]] },
  ]},
  { title: "平台治理", items: [
    { id: "security", label: "安全治理", icon: ShieldCheck, children: [["request-security", "请求安全策略", "P0"], ["data-policy", "数据使用策略", "P0"], ["abuse", "访问与滥用防护", "P0"], ["security-events", "安全事件", "P1"]] },
    { id: "system", label: "系统管理", icon: Settings, children: [["admins", "后台人员与角色", "P0"], ["audit", "操作审计", "P0"], ["approvals", "审批与变更规则", "P1"], ["integrations", "通知与集成", "P0"], ["settings", "基础配置", "P0"]] },
  ]},
];

const pages = { ...Object.fromEntries(sections.flatMap(group => group.items.flatMap(item => item.children.map(([id, label, priority]) => [id, { id, label, priority, area: item.id, areaLabel: item.label, group: group.title }])))), 'customer-usage-detail': { id: 'customer-usage-detail', label: '客户详情', area: 'analytics', areaLabel: '用户分析', group: '运营分析' } };
export default function AdminConsoleV2() {
  const pageFromHash = () => { const id = location.hash.match(/^#\/admin-2\/([^/?]+)/)?.[1]; return id === "dashboard" || pages[id] ? id : "dashboard"; };
  const initialPage = pageFromHash(), { state, dispatch, recover, reload, conflict } = useAdminStore();
  const [active, setActive] = useState(initialPage), [drawer, setDrawer] = useState("");
  useEffect(() => { const sync = () => setActive(pageFromHash()); window.addEventListener("hashchange", sync); return () => window.removeEventListener("hashchange", sync); }, []);
  const navigate = id => { setActive(id); location.hash = `/admin-2/${id}`; };
  const page = pages[active];
  const activeModule = sections.flatMap(group => group.items).find(item => item.id === page.area && item.id !== 'analytics');
  const detailTenant = active === 'customer-usage-detail' ? state.tenants.find(item => item.id === new URLSearchParams(location.hash.split('?')[1] || '').get('customer')) : null;
  const breadcrumbs = [page.group, ...(page.areaLabel === page.group ? [] : [page.areaLabel]), detailTenant?.name || page.label];
  return <div className="admin-v2"><aside className="v2-sidebar"><div className="v2-sidebar-title"><LayoutDashboard size={17}/><div><b>工作台</b></div></div><nav>{sections.map(group => <section key={group.title}><small>{group.title}</small>{group.items.map(item => { const Icon = item.icon, selected = page?.area === item.id; if (item.id === "analytics") return <div key={item.id} className="v2-flat-analysis">{item.children.map(([id,label])=>{const PageIcon = {dashboard:LayoutDashboard,'usage-analysis':ChartColumn,'user-analysis':Users,'call-analysis':Activity}[id], isActive = active===id || (active==='customer-usage-detail' && id==='user-analysis');return <button key={id} aria-current={isActive?'page':undefined} className={isActive?'active':''} onClick={()=>navigate(id)}><PageIcon/>{label}</button>})}</div>; return <div key={item.id}><button aria-current={selected?'page':undefined} className={selected ? "active" : ""} onClick={() => navigate(item.children[0][0])}><Icon/>{item.label}</button></div>})}</section>)}</nav></aside>
    <div className="v2-content"><header><div aria-label="面包屑">{breadcrumbs.map((label,index)=><Fragment key={index}>{index>0&&<ChevronRight aria-hidden="true"/>}{active === "customer-usage-detail" && index === 1 ? <a className="us-breadcrumb-link" href="#/admin-2/user-analysis">{label}</a> : <span aria-current={index===breadcrumbs.length-1?"page":undefined}>{label}</span>}</Fragment>)}{detailTenant && <small className="us-breadcrumb-meta">{detailTenant.id} · {detailTenant.type} · {detailTenant.status}</small>}</div><span><Bell/><i>{state.alerts.filter(item => !["已恢复", "已转事件"].includes(item.status)).length}</i></span><select className="v2-role" aria-label="当前后台角色" value={state.currentRole} onChange={event => dispatch({ type: "setRole", role: event.target.value })}>{["平台管理员", "运营人员", "运维人员", "财务人员", "安全管理员", "只读观察员"].map(role => <option key={role}>{role}</option>)}</select><span className="v2-environment">{state.settings.environmentLabel}</span></header>{state.storageError && <div className="v2-system-alert error">演示数据无法读取：{state.storageError}<button onClick={recover}>恢复演示数据</button></div>}{conflict && <div className="v2-system-alert">检测到其他页面的新版本数据。<button onClick={reload}>载入新版本</button></div>}<main>{activeModule && <nav className="v2-module-tabs" aria-label={`${activeModule.label}页面`}>{activeModule.children.map(([id,label])=><button key={id} type="button" aria-current={active===id?'page':undefined} className={active===id?'active':''} onClick={()=>navigate(id)}>{label}</button>)}</nav>}{active === "dashboard" ? <OperationsOverview/> : ["usage-analysis", "user-analysis", "call-analysis"].includes(active) ? <AnalyticsPages pageId={active} state={state}/> : active === 'customer-usage-detail' ? <CustomerUsageDetail state={state}/> : ["catalog", "providers", "endpoints", "supply-quota"].includes(active) ? <SupplyPage pageId={active} state={state} dispatch={dispatch} navigate={navigate}/> : ["lifecycle", "capability", "validation"].includes(active) ? <ModelPage pageId={active} state={state} dispatch={dispatch}/> : ["tenants", "projects", "members", "keys", "authorization"].includes(active) ? <CustomerPage pageId={active} state={state} dispatch={dispatch}/> : ["routes", "limits", "fallback", "cache", "releases"].includes(active) ? <GatewayPage pageId={active} state={state} dispatch={dispatch}/> : ["monitoring", "logs", "alerts", "incidents", "sla"].includes(active) ? <ObservabilityPage pageId={active} state={state} dispatch={dispatch} navigate={navigate}/> : active === "clusters" ? <ClusterManagement state={state} dispatch={dispatch}/> : active === "deployments" ? <ModelDeployments state={state} dispatch={dispatch}/> : active === "model-observability" ? <ModelObservability state={state}/> : <BusinessOperationsPage pageId={active} state={state} dispatch={dispatch}/>}</main></div>
    {drawer && <div className="v2-mask" onClick={() => setDrawer("")}><aside className="v2-drawer" onClick={e => e.stopPropagation()}><header><h2>{drawer}</h2><button aria-label="关闭" onClick={() => setDrawer("")}><X/></button></header><div><label>名称<input placeholder={`请输入${drawer.replace("新建", "").replace("编辑", "")}名称`}/></label><label>归属空间<select><option>江苏生产环境</option><option>研发测试环境</option></select></label><label>状态<select><option>启用</option><option>停用</option></select></label><label>说明<textarea placeholder="请输入说明"/></label></div><footer><button onClick={() => setDrawer("")}>取消</button><button className="v2-primary" onClick={() => setDrawer("")}>确定</button></footer></aside></div>}
  </div>;
}
