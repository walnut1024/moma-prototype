import { toast } from "sonner";
import { Toaster } from "./components/ui/sonner";
import { createPortal } from "react-dom";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select";
import { Button } from './components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './components/ui/tabs';
import { sections, pages, WORKSPACES, WORKSPACE_HOME, availableWorkspaces, pageWorkspace, canAccessPage, pageFromHash } from './admin-v2/navigation.mjs';
import OperationsOverview from './admin-v2/OperationsOverview';
import CalcloudIntegrationPage, { CALCLOUD_PAGE_IDS } from './admin-v2/CalcloudIntegrationPage';
import { Fragment, useEffect, useRef, useState } from "react";
import AnalyticsPages from "./admin-v2/AnalyticsPages";
import { Activity, Users, Bell, Boxes, ChevronRight, CloudCog, ChartColumn, LayoutDashboard, Network, X } from "lucide-react";
import "./admin-v2.css";
import "./admin-v2-fix.css";
import { useAdminStore } from "./admin-v2/store";
import ProviderManagement from "./admin-v2/ProviderManagement";
import CustomerUsageDetail from "./admin-v2/CustomerUsageDetail";
import ModelManagement from "./admin-v2/ModelManagement";
import GatewayPage from "./admin-v2/GatewayPages";
import ObservabilityPage from "./admin-v2/ObservabilityPages";
import BusinessOperationsPage from "./admin-v2/BusinessOperationsPages";
import AdminPageBoundary from "./admin-v2/AdminPageBoundary";
import "./admin-v2/gateway.css";
import { ADMIN_ROLES, ADMIN_ROLE_LABELS } from "./admin-v2/admin-accounts";


export default function AdminConsoleV2({ bannerTarget }) {
  const { state, dispatch, transactModel, transactProvider, recover, reload, conflict } = useAdminStore();
  const initialPage = pageFromHash(location.hash, state.currentRole);
  const [active, setActive] = useState(initialPage), [drawer, setDrawer] = useState('');
  const [workspace, setWorkspace] = useState(pageWorkspace(initialPage) || availableWorkspaces(state.currentRole)[0] || 'operations');
  const [detailParams, setDetailParams] = useState(() => new URLSearchParams(location.hash.split('?')[1] || ''));
  const lastVisits = useRef({ operations: '#/admin-2/dashboard', maintenance: '#/admin-2/call-analysis' });
  const previousRole = useRef(state.currentRole);
  const [observationSelection,setObservationSelection]=useState(()=>({preset:'5m',clock:Date.now(),custom:null}));
  const allowedWorkspaces = availableWorkspaces(state.currentRole);
  const canVisit = canAccessPage(state.currentRole, active);
  const currentWorkspace = allowedWorkspaces.includes(workspace) ? workspace : allowedWorkspaces[0] || 'operations';
  const navigate = id => { location.hash = '/admin-2/' + id; window.scrollTo({ top: 0, behavior: 'instant' }); };
  useEffect(() => {
    const sync = () => {
      const id = pageFromHash(location.hash, state.currentRole), nextWorkspace = pageWorkspace(id);
      setActive(id); setDetailParams(new URLSearchParams(location.hash.split('?')[1] || ''));
      if (canAccessPage(state.currentRole, id) && nextWorkspace) { setWorkspace(nextWorkspace); lastVisits.current[nextWorkspace] = location.hash; }
    };
    if (previousRole.current !== state.currentRole) {
      previousRole.current = state.currentRole;
      if (!canAccessPage(state.currentRole, pageFromHash(location.hash, state.currentRole))) navigate(WORKSPACE_HOME[availableWorkspaces(state.currentRole)[0]] || 'dashboard');
    }
    // Let page leave guards restore the address before changing the rendered page.
    let pendingHash;
    const handleHashChange = () => { clearTimeout(pendingHash); pendingHash = setTimeout(sync, 0); };
    sync(); window.addEventListener('hashchange', handleHashChange);
    return () => { clearTimeout(pendingHash); window.removeEventListener('hashchange', handleHashChange); };
  }, [state.currentRole]);
  useEffect(() => () => toast.dismiss(), []);
  const switchWorkspace = nextWorkspace => {
    if (!allowedWorkspaces.includes(nextWorkspace) || nextWorkspace === currentWorkspace) return;
    if (canVisit && pageWorkspace(active)) lastVisits.current[currentWorkspace] = location.hash;
    location.hash = lastVisits.current[nextWorkspace];
  };
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
  const breadcrumbs = !canVisit ? ['无访问权限'] : [...new Set([page.group, page.areaLabel, detailTenant?.name || detailModel?.name || page.label].filter(Boolean)), ...(detailProvider ? [detailProvider.name] : [])];
  const roleTarget = bannerTarget?.querySelector("[data-admin-role]");
  return <div className="admin-v2">{createPortal(<Toaster position="top-right" offset={{ top: 64, right: 20 }} duration={3000} richColors closeButton containerAriaLabel="操作反馈" toastOptions={{ closeButtonAriaLabel: "关闭提示", classNames: { toast: "cn-toast" } }}/>, document.body)}{roleTarget && createPortal(<div className="admin-banner-field admin-banner-role"><span>当前角色</span><Select value={state.currentRole} onValueChange={role => dispatch({ type: "setRole", role })}><SelectTrigger size="sm" aria-label="当前后台角色"><SelectValue/></SelectTrigger><SelectContent align="end">{ADMIN_ROLES.map(role => <SelectItem key={role} value={role}>{ADMIN_ROLE_LABELS[role]}</SelectItem>)}</SelectContent></Select></div>, roleTarget)}<aside className="v2-sidebar"><Tabs value={currentWorkspace} activationMode="manual" className="v2-workspace-tabs"><TabsList className="v2-workspace-tab-list" aria-label="后台功能区域">{allowedWorkspaces.map(id => <TabsTrigger key={id} value={id} onMouseDown={event => { event.preventDefault(); event.currentTarget.focus(); }} onClick={() => switchWorkspace(id)} onKeyDown={event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); event.currentTarget.click(); } }}>{WORKSPACES[id]}</TabsTrigger>)}</TabsList><TabsContent value={currentWorkspace} className="v2-workspace-navigation"><nav aria-label="后台导航">{sections.filter(group => group.workspace === currentWorkspace).map(group => <section key={group.id} aria-label={group.title}>{!group.direct && <small>{group.title}</small>}{group.items.map(item => {
      const Icon = { overview: LayoutDashboard, usage: ChartColumn, 'users-analysis': Users, calls: Activity, warehouse: Boxes, channels: CloudCog, gateway: Network, 'cost-analysis': ChartColumn, 'customer-analysis': Users, 'provider-analysis': ChartColumn, 'model-analysis': ChartColumn, 'base-models': Boxes, 'model-providers': CloudCog, 'business-call-statistics': ChartColumn, 'performance-statistics': Activity, 'error-statistics': Activity, 'traffic-management': Activity, 'model-routing': Network }[item.id];
      const selected = page.area === item.id;
      return <div key={item.id}><button type="button" aria-current={selected ? 'page' : undefined} className={selected ? 'active' : ''} onClick={() => navigate(item.children[0][0])}><Icon/>{item.label}</button></div>;
    })}</section>)}</nav></TabsContent></Tabs></aside>
    <div className="v2-content"><header><div aria-label="面包屑">{breadcrumbs.map((label,index)=><Fragment key={index}>{index>0&&<ChevronRight aria-hidden="true"/>}{active === "customer-usage-detail" && index === 1 ? <a className="us-breadcrumb-link" href="#/admin-2/user-analysis">{label}</a> : detailProvider && index === breadcrumbs.length - 2 ? <a className="mm-breadcrumb-link" href={providerListHref}>{label}</a> : detailModel && index === breadcrumbs.length - 2 ? <a className="mm-breadcrumb-link" data-model-list-breadcrumb href={modelListHref}>{label}</a> : <span aria-current={index===breadcrumbs.length-1?"page":undefined}>{label}</span>}</Fragment>)}{detailTenant && <small className="us-breadcrumb-meta">{detailTenant.id} · {detailTenant.type} · {detailTenant.status}</small>}</div><span><Bell/><i>{state.alerts.filter(item => !["已恢复", "已转事件"].includes(item.status)).length}</i></span></header>{state.storageError && <div className="v2-system-alert error">数据无法读取：{state.storageError}<button onClick={recover}>恢复数据</button></div>}{conflict && <div className="v2-system-alert">检测到其他页面的新版本数据。<button onClick={reload}>载入新版本</button></div>}<main><AdminPageBoundary key={active}>{!canVisit ? <section className="ent-panel admin-page-error" role="alert"><h1>无访问权限</h1><p>当前角色无法访问此页面，请通过侧栏进入可访问的功能。</p><Button onClick={() => navigate(WORKSPACE_HOME[allowedWorkspaces[0]] || 'dashboard')}>返回首页</Button></section> : <>{activeModule?.children.length > 1 && <nav className="v2-module-tabs" aria-label={`${activeModule.label}页面`}>{activeModule.children.map(([id,label])=><button key={id} type="button" aria-current={active===id?'page':undefined} className={active===id?'active':''} onClick={()=>navigate(id)}>{label}</button>)}</nav>}{CALCLOUD_PAGE_IDS.includes(active) ? <CalcloudIntegrationPage key={active} page={page} state={state} params={detailParams} observation={{selection:observationSelection,setSelection:setObservationSelection}}/> : active === "dashboard" ? <OperationsOverview/> : ["usage-analysis", "user-analysis", "call-analysis"].includes(active) ? <AnalyticsPages pageId={active} state={state}/> : active === 'customer-usage-detail' ? <CustomerUsageDetail state={state}/> : active === "providers" ? <ProviderManagement state={state} transact={transactProvider} conflict={conflict}/> : active === "listing" ? <ModelManagement state={state} transact={transactModel} conflict={conflict}/> : ["routes", "limits", "fallback", "cache", "releases"].includes(active) ? <GatewayPage pageId={active} state={state} dispatch={dispatch}/> : ["monitoring", "logs", "alerts", "incidents", "sla"].includes(active) ? <ObservabilityPage pageId={active} state={state} dispatch={dispatch} navigate={navigate}/> : <BusinessOperationsPage key={active} pageId={active} state={state} dispatch={dispatch}/>}</>}</AdminPageBoundary></main></div>
    {drawer && <div className="v2-mask" onClick={() => setDrawer("")}><aside className="v2-drawer" onClick={e => e.stopPropagation()}><header><h2>{drawer}</h2><button aria-label="关闭" onClick={() => setDrawer("")}><X/></button></header><div><label>名称<input placeholder={`请输入${drawer.replace("新建", "").replace("编辑", "")}名称`}/></label><label>归属空间<select><option>江苏生产环境</option><option>研发测试环境</option></select></label><label>状态<select><option>启用</option><option>停用</option></select></label><label>说明<textarea placeholder="请输入说明"/></label></div><footer><button onClick={() => setDrawer("")}>取消</button><button className="v2-primary" onClick={() => setDrawer("")}>确定</button></footer></aside></div>}
  </div>;
}
