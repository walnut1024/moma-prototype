import CloudModelOperations from './admin-v2/CloudModelOperations';
import {sharedRequests} from './business-facts.mjs';
import { modelOperationsView } from './mock/model-data.js';
import { setMockRuntimeState } from './admin-v2/mock-onboarding-service';
import GettingStarted from './admin-v2/GettingStarted';
import { toast } from "sonner";
import { Toaster } from "./components/ui/sonner";
import { createPortal } from "react-dom";
import { Badge, Banner, Breadcrumb, Button, ConfigProvider, Modal, Select, Tabs, Toast, Typography } from '@douyinfe/semi-ui';
import zhCN from '@douyinfe/semi-ui/lib/es/locale/source/zh_CN.js';
import { sections, pages, WORKSPACES, WORKSPACE_HOME, availableWorkspaces, pageWorkspace, canAccessPage, pageFromHash } from './admin-v2/navigation.mjs';
import { adminBreadcrumbs } from './admin-v2/breadcrumbs.mjs';
import { libraryRecord } from './admin-v2/model-operations';
import OperationsOverview from './admin-v2/OperationsOverview';
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import AnalyticsPages from "./admin-v2/AnalyticsPages";
import {
  Activity, Bell, BookOpen, Building2, Cable, Calculator, ChartColumn,
  Container, Layers, LayoutDashboard, LibraryBig,
  Menu, Radar, Rocket, Route, Server, Tag, UserCog, UserRound,
  UsersRound,
} from "lucide-react";
import "./admin-v2/admin-shell.css";
import { useAdminStore } from "./admin-v2/store";
import { ClusterManagement, ModelDeployments, ModelObservability } from "./admin-v2/InferencePages";
import ProviderManagement from "./admin-v2/ProviderManagement";
const TrafficOperations = lazy(() => import('./admin-v2/TrafficOperations'));
const ModelMaterials = lazy(()=>import('./admin-v2/ModelMaterials'));
const MaterialDictionaryPage = lazy(()=>import('./admin-v2/MaterialDictionaryPage'));
import CustomerPage from "./admin-v2/CustomerPages";
import IndividualUsersPage from "./admin-v2/IndividualUsersPage";
import { individualAccounts, individualName } from "./admin-v2/individual-users";
import CustomerUsageDetail from "./admin-v2/CustomerUsageDetail";
import ModelCosts from './admin-v2/ModelCosts';
import ModelPrices from './admin-v2/ModelPrices';
import ModelManagement from "./admin-v2/ModelManagement";
import { privateEnterprise } from "./admin-v2/enterprise";
import GatewayPage, { gatewaySettingsPages } from "./admin-v2/GatewayPages";
import ObservabilityPage from "./admin-v2/ObservabilityPages";
import ArtifactManagement from './admin-v2/ArtifactManagement';
import BusinessOperationsPage from "./admin-v2/BusinessOperationsPages";
import AdminPageBoundary from "./admin-v2/AdminPageBoundary";
import AdminAccounts from "./admin-v2/AdminAccounts";
import { ADMIN_ROLE_LABELS } from "./admin-v2/admin-accounts";
import "./admin-v2/admin-design.css";
import { AdminUIContext } from "./components/admin-ui-context";
import { serviceOperationsUi } from "./admin-v2/ServiceUI";

const NAVIGATION_ICONS = {
  overview: LayoutDashboard,
  usage: ChartColumn,
  'users-analysis': UsersRound,
  'supply-analysis': Layers,
  'business-analysis': ChartColumn,
  channels: Cable,
  warehouse: Layers,
  costs: Calculator,
  prices: Tag,
  materials: LibraryBig,
  'traffic-limits': Activity,
  enterprise: Building2,
  individual: UserRound,
  calls: Activity,
  gateway: Route,
  clusters: Server,
  deployments: Rocket,
  artifacts: Container,
  'production-observation': Radar,
  accounts: UserCog,
  'getting-started': BookOpen,
};

export default function AdminConsoleV2(props) {
  const [hash,setHash]=useState(location.hash);
  useEffect(()=>{const sync=()=>setHash(location.hash);addEventListener('hashchange',sync);return()=>removeEventListener('hashchange',sync);},[]);
  const cloud=/^#\/admin-2\/(listing|providers|model-costs|model-prices|model-templates|tariff-dictionary)(?:[/?]|$)/.test(hash);
  return <ConfigProvider locale={zhCN}>{cloud?<CloudModelOperations>{store=><AdminConsoleV2View {...props} store={store}/>}</CloudModelOperations>:<LocalAdminConsole {...props}/>}</ConfigProvider>;
}
function LocalAdminConsole(props){const store=useAdminStore(Toast);return <AdminConsoleV2View {...props} store={store}/>;}
function AdminConsoleV2View({bannerTarget,store}) {
  const { state, dispatch, transact, transactModel, transactIndividual, transactAdminAccount, transactTraffic, reload, conflict } = store;
  useEffect(() => { if(!state.cloudOperations)setMockRuntimeState(state); }, [state]);
  const factState={...state,requests:sharedRequests(state)};
  const initialPage = pageFromHash(location.hash, state.currentRole);
  const [navOpen, setNavOpen] = useState(false);
  const [leave, setLeave] = useState(null);
  const draftDirty = useRef(false);
  useEffect(() => {
    let accepted = location.hash;
    const sync = () => {
      const next = location.hash;
      if (next === accepted) return;
      if (draftDirty.current) {
        history.replaceState(null, '', accepted);
        setNavOpen(false);
        setLeave(() => () => {
          accepted = next;
          location.hash = next;
        });
      } else {
        accepted = next;
      }
    };
    const unload = event => { if (draftDirty.current) { event.preventDefault(); event.returnValue = ''; } };
    addEventListener('hashchange', sync, true);
    addEventListener('beforeunload', unload);
    return () => { removeEventListener('hashchange', sync, true); removeEventListener('beforeunload', unload); };
  }, []);
  const [active, setActive] = useState(initialPage);
  const [workspace, setWorkspace] = useState(pageWorkspace(initialPage) || availableWorkspaces(state.currentRole)[0] || 'operations');
  const [detailParams, setDetailParams] = useState(() => new URLSearchParams(location.hash.split('?')[1] || ''));
  const lastVisits = useRef({ operations: '#/admin-2/dashboard', maintenance: '#/admin-2/call-analysis' });
  const previousRole = useRef(state.currentRole);
  const allowedWorkspaces = availableWorkspaces(state.currentRole);
  const canVisit = canAccessPage(state.currentRole, active);
  const currentWorkspace = allowedWorkspaces.includes(workspace) ? workspace : allowedWorkspaces[0] || 'operations';
  const navigate = id => { setNavOpen(false); location.hash = '/admin-2/' + id; window.scrollTo({ top: 0, behavior: 'instant' }); };
  useEffect(() => {
    const sync = () => {
      const id = pageFromHash(location.hash, state.currentRole), nextWorkspace = pageWorkspace(id);
      setNavOpen(false); setActive(id); setDetailParams(new URLSearchParams(location.hash.split('?')[1] || ''));
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
  const activeModule = sections.flatMap(group => group.items).find(item => item.id === page.area);
  const detailTenant = active === 'customer-usage-detail' ? state.tenants.find(item => item.id === new URLSearchParams(location.hash.split('?')[1] || '').get('customer')) : null;
  const detailModel = detailParams.get('view') === 'template' && ['listing', 'model-templates'].includes(active) ? libraryRecord(state, detailParams.get('template'))
            : active === 'listing' ? state.models.find(item => item.id === detailParams.get('model')) : null;
  const enterpriseDetailId = active === 'tenants' ? detailParams.get('enterprise') : null;
  const detailEnterprise = enterpriseDetailId ? state.tenants.find(item => item.id === enterpriseDetailId && ['企业', '政府'].includes(item.type) && (detailParams.get('scenario') !== 'private' || privateEnterprise(state)?.id === item.id)) : null;
  const individualDetailId = active === 'individual-users' ? detailParams.get('user') : null;
  const detailIndividual = individualDetailId ? individualAccounts(state).find(account => account.tenant.ownerId === individualDetailId) : null;
  const breadcrumbs = !canVisit ? [{ label: '无访问权限' }] : adminBreadcrumbs(active, detailParams, { onboardingIntent: state.modelOnboardings.find(row=>row.id===detailParams.get('draft'))?.intent, provider: detailProvider?.name, model: detailModel?.name, deployment: state.deployments.find(item => item.id === detailParams.get('deployment'))?.name, enterprise: detailEnterprise?.name, user: detailIndividual && individualName(detailIndividual), customer: detailTenant?.name });
  const enterAdmin = accountId => {
    if (accountId === state.adminSession?.accountId) return;
    const selectAccount = () => dispatch({ type: 'enterAdmin', accountId });
    if (draftDirty.current) setLeave(() => selectAccount);
    else selectAccount();
  };
  const roleTarget = bannerTarget?.querySelector("[data-admin-role]");
  const deploymentTarget = bannerTarget?.querySelector("[data-admin-deployment]");
  const hasAccount = state.admins.some(account => account.id === state.adminSession?.accountId && account.status === '已启用');
  const showPage = hasAccount && canVisit;
  const gatewaySettings = gatewaySettingsPages.includes(active);
  const legacyPage = page.groupId === 'analytics' && !['usage-analysis', 'user-analysis', 'customer-usage-detail'].includes(active);
  const menu = <nav aria-label="后台导航">{sections.filter(group => group.workspace === currentWorkspace || (group.id === 'platform' && state.currentRole === '平台管理员')).map(group => (
      <section key={group.id} aria-label={group.title}>
        {!group.direct && <Typography.Text type="tertiary" size="small">{group.title}</Typography.Text>}
        {group.items.map(item => {
          const Icon = NAVIGATION_ICONS[item.id];
          const selected = page.area === item.id;
          return <Button key={item.id} block icon={<Icon size={16} aria-hidden="true"/>} type={selected ? 'primary' : 'tertiary'} theme={selected ? 'light' : 'borderless'} aria-current={selected ? 'page' : undefined} onClick={() => navigate(item.children[0][0])}>{item.label}</Button>;
        })}
      </section>
    ))}</nav>;
  const navigation = <Tabs type="button" size="small" activeKey={currentWorkspace} onChange={switchWorkspace}>
    {allowedWorkspaces.map(id => <Tabs.TabPane key={id} itemKey={id} tab={WORKSPACES[id]}>{id === currentWorkspace && menu}</Tabs.TabPane>)}
  </Tabs>;
  useEffect(() => { const media = matchMedia('(min-width: 901px)'); const close = () => { if (media.matches) setNavOpen(false); }; media.addEventListener('change', close); return () => media.removeEventListener('change', close); }, []);
  const alertCount = state.alerts.filter(item => !["已恢复", "已转事件"].includes(item.status)).length;
  return <AdminUIContext.Provider value={true}><div className="admin-v2">
    {createPortal(<Toaster position="top-right" offset={{ top: 64, right: 20 }} duration={3000} richColors closeButton containerAriaLabel="操作反馈" toastOptions={{ closeButtonAriaLabel: "关闭提示", classNames: { toast: "cn-toast admin-ui-toast" } }}/>, document.body)}
    {roleTarget && createPortal(<div className="admin-banner-field">
      <Typography.Text id="admin-account-picker-label" type="secondary" size="small">后台账号</Typography.Text>
      <Select aria-labelledby="admin-account-picker-label" size="small" position="bottomRight" value={state.adminSession?.accountId || ''} placeholder="选择 mock 账号" onSelect={enterAdmin}
        optionList={state.admins.filter(account => account.status === '已启用').map(account => ({ value: account.id, label: `${account.name} · ${ADMIN_ROLE_LABELS[account.role]}` }))}/>
    </div>, roleTarget)}
    {!navOpen && <aside className="v2-sidebar v2-sidebar-desktop">{navigation}</aside>}
    <div className="v2-content">
      <header className="admin-context-bar">
        <Button className="admin-nav-toggle" type="tertiary" theme="borderless" icon={<Menu size={18}/>} aria-label="展开后台导航" aria-haspopup="dialog" aria-expanded={navOpen} onClick={() => setNavOpen(true)}/>
        <div className="admin-breadcrumb">
          <Breadcrumb aria-label="面包屑">{breadcrumbs.map(({ label, href }, index) => (
            <Breadcrumb.Item key={index} noLink>{href ? <a className="mm-breadcrumb-link" data-model-list-breadcrumb data-admin-breadcrumb href={href}>{label}</a> : <span title={label} aria-current={index === breadcrumbs.length - 1 ? 'page' : undefined}>{label}</span>}</Breadcrumb.Item>
          ))}</Breadcrumb>
          {detailTenant && <Typography.Text type="tertiary" size="small" className="us-breadcrumb-meta">{detailTenant.id} · {detailTenant.type} · {detailTenant.status}</Typography.Text>}
        </div>
        <Badge count={alertCount} aria-label={`${alertCount} 条待处理告警`}><Bell size={16} aria-hidden="true"/></Badge>
      </header>
      {state.storageError && <Banner type="danger" closeIcon={null} description={<>本地数据异常：{state.storageError.toLowerCase().includes('quota') ? '浏览器本地存储空间不足，原数据未更改。' : state.storageError} <Button onClick={reload}>重新加载</Button></>}/>}
      {conflict && <Banner type="warning" closeIcon={null} description={<>检测到其他页面的新版本数据。 <Button onClick={reload}>载入新版本</Button></>}/>}
      {showPage && activeModule?.children.length > 1 && activeModule.id !== 'materials' && (
        <Tabs className="v2-module-tabs" activeKey={active} onChange={navigate}>
          {activeModule.children.map(([id, label]) => <Tabs.TabPane key={id} itemKey={id} tab={label}/>)}
        </Tabs>
      )}
      <main data-admin-page={active} className={showPage && legacyPage ? 'admin-legacy' : undefined}>
        <AdminPageBoundary key={active}>
          {!hasAccount ? <Banner title="选择后台账号" description="请在顶部选择后台 mock 账号进入。用户面登录独立保留。" closeIcon={null}/> : !canVisit ? (
            <Banner type="warning" title="无访问权限" description={<Button onClick={() => navigate(WORKSPACE_HOME[allowedWorkspaces[0]] || 'dashboard')}>返回首页</Button>} closeIcon={null}/>
          ) : <>
            {['supply-analysis', 'business-analysis'].includes(active) && <h1 className="sr-only">{page.label}</h1>}
            {active === "getting-started" ? <GettingStarted guideId={detailParams.get('guide')}/>
            : active === "dashboard" ? <OperationsOverview state={factState}/>
            : ["usage-analysis", "user-analysis", "supply-analysis", "business-analysis", "call-analysis"].includes(active) ? <AnalyticsPages pageId={active} state={factState}/>
            : active === 'customer-usage-detail' ? <CustomerUsageDetail state={factState}/>
            : active === "admins" ? <AdminAccounts state={state} transact={transactAdminAccount} conflict={conflict}/>
            : active === "model-costs" ? <ModelCosts state={state} transact={transactModel} conflict={conflict} reload={reload}/>
            : active === "model-prices" ? <ModelPrices state={state} transact={transactModel} conflict={conflict} reload={reload}/>
            : active === "tariff-dictionary" ? <Suspense fallback={<p role="status">正在加载模型资料…</p>}><MaterialDictionaryPage state={state} transact={transactModel} conflict={conflict}/></Suspense>
            : active === "providers" ? <ProviderManagement state={state} transact={transactModel} conflict={conflict} reload={reload}/>
            : active === 'model-templates' ? <Suspense fallback={<p role="status">正在加载模型资料…</p>}><ModelMaterials state={modelOperationsView(state,'all')} transact={transactModel} conflict={conflict} reload={reload}/></Suspense>
            : active === 'listing' ? <ModelManagement sourceState={state} state={modelOperationsView(state,new URLSearchParams(location.hash.split('?')[1]).get('catalogue'),new URLSearchParams(location.hash.split('?')[1]).get('model'))} transact={transactModel} conflict={conflict} reload={reload}/>
            : active === 'traffic-limits' ? <Suspense fallback={<p role="status">正在加载流量运营…</p>}><TrafficOperations key={state.adminSession.accountId} state={state} transact={transactTraffic} conflict={conflict} dirtyRef={draftDirty}/></Suspense>
            : active === "individual-users" ? <IndividualUsersPage state={state} transact={transactIndividual} conflict={conflict}/>
            : active === "tenants" ? <CustomerPage state={state} transact={transact} deploymentTarget={deploymentTarget}/>
            : gatewaySettings ? <GatewayPage key={active} pageId={active} state={state} dispatch={dispatch}/>
            : ["monitoring", "logs", "alerts", "incidents", "sla"].includes(active) ? <ObservabilityPage pageId={active} state={factState} dispatch={dispatch} navigate={navigate}/>
            : active === "clusters" ? <ClusterManagement state={state} dispatch={dispatch}/>
            : active === "deployments" ? <ModelDeployments state={state} dispatch={dispatch} conflict={conflict}/>
            : active === "artifacts" ? <ArtifactManagement state={state} dispatch={dispatch}/>
            : active === "model-observability" ? <ModelObservability state={state}/> : <BusinessOperationsPage key={active} pageId={active} state={state} dispatch={dispatch}/>}
          </>}
        </AdminPageBoundary>
      </main>
    </div>
    {leave && serviceOperationsUi.renderLeaveDialog({ cancel: () => setLeave(null), discard: () => {
      draftDirty.current = false;
      setLeave(null);
      leave();
    } })}
    <Modal title="后台导航" visible={navOpen} footer={null} width="min(320px, calc(100vw - 32px))" closeOnEsc onCancel={() => setNavOpen(false)} bodyStyle={{ maxHeight: '65dvh', overflow: 'auto' }}>
      {navOpen && <div className="v2-sidebar">{navigation}</div>}
    </Modal>
  </div></AdminUIContext.Provider>;
}
