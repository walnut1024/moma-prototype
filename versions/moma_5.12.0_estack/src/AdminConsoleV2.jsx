import AdminPageLoading from './admin-v2/AdminPageLoading';
import {
  IconActivity, IconApartment, IconAppCenter, IconBarChartVStroked, IconBellStroked,
  IconBookOpenStroked, IconBookStroked, IconBox, IconChainStroked, IconChecklistStroked,
  IconComponentStroked, IconFlowChartStroked, IconGridStroked, IconLayers,
  IconDoubleChevronLeft, IconDoubleChevronRight,
  IconMenu, IconMonitorStroked, IconPlayCircle, IconPriceTag, IconPulse, IconServerStroked, IconSetting,
  IconShield, IconUserGroup, IconUserSetting, IconUserStroked,
} from '@douyinfe/semi-icons';
import CloudModelOperations from './admin-v2/CloudModelOperations';
import { cloudAdminRequest } from './admin-v2/admin-client.mjs';
import { acceptAdminSession } from './admin-v2/store';
import { openLogin } from './login-navigation.mjs';
import {sharedRequests} from './business-facts.mjs';
import { modelOperationsView } from './mock/model-data.js';
import { setMockRuntimeState } from './admin-v2/mock-onboarding-service';
import GettingStarted from './admin-v2/GettingStarted';
import { Badge, Banner, Breadcrumb, Button, ConfigProvider, Tabs, Toast, Tooltip, Typography } from '@douyinfe/semi-ui';
import { AdminModal as Modal } from './admin-v2/AdminOverlay';
import zhCN from '@douyinfe/semi-ui/lib/es/locale/source/zh_CN.js';
import { adminSections, sections, pages, WORKSPACES, WORKSPACE_HOME, availableWorkspaces, pageWorkspace, canAccessPage, commercialPage, isOrganizationPage, pageFromHash } from './admin-v2/navigation.mjs';
import { adminBreadcrumbs } from './admin-v2/breadcrumbs.mjs';
import { libraryRecord } from './admin-v2/model-operations';
import OperationsOverview from './admin-v2/OperationsOverview';
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import AnalyticsPages from "./admin-v2/AnalyticsPages";
import "./admin-v2/admin-shell.css";
import { useAdminStore } from "./admin-v2/store";
import { ClusterManagement, ModelDeployments, ModelObservability } from "./admin-v2/InferencePages";
import ProviderManagement from "./admin-v2/ProviderManagement";
import { ChannelManagementNew } from './admin-v2/ChannelDirectory';
const CustomerAnalysis = lazy(() => import('./admin-v2/CustomerAnalysis'));
const TrafficOperations = lazy(() => import('./admin-v2/TrafficOperations'));
const SiteConfiguration = lazy(() => import('./admin-v2/SiteConfiguration'));
const ModelMaterials = lazy(()=>import('./admin-v2/ModelMaterials'));
const ModelServicesNew = lazy(()=>import('./admin-v2/ModelServicesNew'));
const ProviderMaterials = lazy(()=>import('./admin-v2/ProviderMaterials'));
const MaterialDictionaryPage = lazy(()=>import('./admin-v2/MaterialDictionaryPage'));
import CustomerPage from "./admin-v2/CustomerPages";
import AdminProjects from "./admin-v2/AdminProjects";
import UsersPage from "./admin-v2/UsersPage";

import CustomerUsageDetail from "./admin-v2/CustomerUsageDetail";
import ModelPrices from './admin-v2/ModelPrices';
import ModelMarket from './admin-v2/ModelMarket';
import ModelManagement from "./admin-v2/ModelManagement";
import { internalEnterprise } from "./admin-v2/enterprise";
import { useDeploymentLicense } from './useDeploymentLicense';
import { LICENSE_UNAVAILABLE } from './deployment-license.mjs';
import LicensePage from './admin-v2/LicensePage';
import CommerceAnalysis from './admin-v2/CommerceAnalysis';
import { useSiteConfig } from "./useSiteConfig";
import GatewayPage, { gatewaySettingsPages } from "./admin-v2/GatewayPages";
import ObservabilityPage from "./admin-v2/ObservabilityPages";
import ArtifactManagement from './admin-v2/ArtifactManagement';
import BusinessOperationsPage from "./admin-v2/BusinessOperationsPages";
import PackageProduction from "./admin-v2/PackageProduction";
import PackageData from "./admin-v2/PackageData";
import AdminPageBoundary from "./admin-v2/AdminPageBoundary";
import AdminAccounts from "./admin-v2/AdminAccounts";
import AuditLogsPage from './admin-v2/AuditLogsPage';
import { AdminUIContext } from "./components/admin-ui-context";
import { serviceOperationsUi } from "./admin-v2/ServiceUI";

const NAVIGATION_ICONS = {
  overview: IconGridStroked,
  usage: IconBarChartVStroked,
  'users-analysis': IconUserGroup,
  'customers-analysis': IconUserStroked,
  channels: IconChainStroked,
  'channels-new': IconChainStroked,
  'channels-reference': IconChainStroked,
  warehouse: IconLayers,
  'warehouse-new': IconLayers,
  market: IconAppCenter,
  prices: IconPriceTag,
  materials: IconBookStroked,
  'package-production': IconBox,
  'package-data': IconChecklistStroked,
  'traffic-limits': IconActivity,
  enterprise: IconApartment,
  projects: IconLayers,
  individual: IconUserStroked,
  calls: IconPulse,
  gateway: IconFlowChartStroked,
  logs: IconChecklistStroked,
  monitoring: IconMonitorStroked,
  clusters: IconServerStroked,
  deployments: IconPlayCircle,
  artifacts: IconComponentStroked,
  'production-observation': IconMonitorStroked,
  accounts: IconUserSetting,
  'audit-logs': IconChecklistStroked,
  'commerce-orders': IconChecklistStroked,
  'business-analysis': IconBarChartVStroked,
  license: IconShield,
  'site-configuration': IconSetting,
  'getting-started': IconBookOpenStroked,
};
const overviewShortcuts = ['usage-analysis', 'user-analysis', 'listing', 'providers'].map(id => ({
  id, label: pages[id].label, Icon: NAVIGATION_ICONS[pages[id].area],
}));

export default function AdminConsoleV2(props) {
  const [session, setSession] = useState(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const verify = async () => {
      try {
        const { account } = await cloudAdminRequest('/auth/me', { signal: controller.signal });
        if (controller.signal.aborted) return;
        acceptAdminSession(account);
        setSession({ account });
      } catch (error) {
        if (controller.signal.aborted) return;
        setSession({ error });
        if (error.status === 401) openLogin();
      }
    };
    void verify();
    addEventListener('focus', verify);
    return () => { controller.abort(); removeEventListener('focus', verify); };
  }, [retry]);
  if (!session) return <AdminPageLoading label="后台"/>;
  if (session.error) return <Banner type="warning" closeIcon={null} description={<>{session.error.message}{' '}
    {session.error.status === 401 ? <Button onClick={() => openLogin()}>前往登录</Button>
      : <Button onClick={() => { setSession(null); setRetry(value => value + 1); }}>重新加载</Button>}</>}/>;
  return <AdminWorkspace key={session.account.id + ':' + session.account.role} {...props}/>;
}

function AdminWorkspace(props) {
  const internal = !useSiteConfig().personalEnabled;
  const license = useDeploymentLicense();
  const [hash,setHash]=useState(location.hash);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  useEffect(()=>{const sync=()=>setHash(location.hash);addEventListener('hashchange',sync);return()=>removeEventListener('hashchange',sync);},[]);
  const cloud = ['listing', 'listing-new', 'providers', 'providers-new', 'providers-reference', 'model-market', 'model-prices',
    'model-templates', 'provider-materials', 'tariff-dictionary'].includes(pageFromHash(hash));
  const packageWorkspace=/^#\/admin-2\/(?:package-production|package-data)(?:[/?]|$)/.test(hash);
  if (!license) return <AdminPageLoading label="部署授权"/>;
  const deployment = { ...license, commercial: !internal && license.commercial, commerceWritable: !internal && license.commerceWritable };
  const cloudAllowed = !commercialPage(pageFromHash(hash)) || deployment.commercial;
  const viewProps = { ...props, internal, license: deployment, sidebarCollapsed, setSidebarCollapsed };
  return <ConfigProvider locale={zhCN}>{cloudAllowed && (cloud || packageWorkspace)
    ? <CloudModelOperations key={packageWorkspace?'packages':'models'} packageWorkspace={packageWorkspace}>{store=><AdminConsoleV2View {...viewProps} store={store}/>}</CloudModelOperations>
    : <LocalAdminConsole {...viewProps}/>}</ConfigProvider>;
}
function LocalAdminConsole(props){const store=useAdminStore(Toast);return <AdminConsoleV2View {...props} store={store}/>;}
function AdminConsoleV2View({bannerTarget,workbenchName,store,internal,license,sidebarCollapsed,setSidebarCollapsed}) {
  const { state: workspaceState, dispatch: workspaceDispatch, transact, transactModel, transactIndividual, transactAdminAccount, reload, conflict } = store;
  const commerceReadOnly = !internal && !license.commerceWritable;
  const state = { ...workspaceState, commerceReadOnly };
  const dispatch = action => {
    if (commercialPage(active) && (active !== 'tenants' || !internal) && !license.commerceWritable) {
      Toast.warning(LICENSE_UNAVAILABLE);
      return null;
    }
    return workspaceDispatch(action);
  };
  useEffect(() => { if(!state.cloudOperations)setMockRuntimeState(state); }, [workspaceState]);
  const company = internal ? internalEnterprise(state) : null;
  const own = row => row.tenantId === company?.id;
  const requests = sharedRequests(state);
  const internalMembers = internal ? state.memberships.filter(own) : [];
  const memberUsers = new Set(internalMembers.map(row => row.userId));
  const factState = internal ? {
    ...state, requests:requests.filter(own), tenants:company ? [company] : [], memberships:internalMembers,
    users:state.users.filter(row => memberUsers.has(row.id)), identityEvents:(state.identityEvents || []).filter(own),
    projects:state.projects.filter(own), apiKeys:state.apiKeys.filter(own),
  } : { ...state, requests };
  const initialPage = pageFromHash(location.hash, state.currentRole);
  const [navOpen, setNavOpen] = useState(false);
  const [leave, setLeave] = useState(null);
  const [logSimulation, setLogSimulation] = useState(null);
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
  const organizationView = isOrganizationPage(active, detailParams, !license.commercial);
  const organizationTenant = organizationView ? company || internalEnterprise(state) : null;
  const organizationState = organizationView && !internal ? {
    ...factState, tenants:organizationTenant ? [organizationTenant] : [], commerceReadOnly:true,
  } : factState;
  const lastVisits = useRef({ operations: '#/admin-2/dashboard', maintenance: '#/admin-2/call-analysis' });
  const previousRole = useRef(state.currentRole);
  const allowedWorkspaces = availableWorkspaces(state.currentRole);
  const canVisit = canAccessPage(state.currentRole, active, license);
  const currentWorkspace = allowedWorkspaces.includes(workspace) ? workspace : allowedWorkspaces[0] || 'operations';
  const navigate = id => { setNavOpen(false); location.hash = '/admin-2/' + id; window.scrollTo({ top: 0, behavior: 'instant' }); };
  useEffect(() => {
    const sync = () => {
      const id = pageFromHash(location.hash, state.currentRole), nextWorkspace = pageWorkspace(id);
      const params = new URLSearchParams(location.hash.split('?')[1] || '');
      setNavOpen(false); setActive(id); setDetailParams(params);
      if (nextWorkspace && canAccessPage(state.currentRole, id, license)) {
        setWorkspace(nextWorkspace); lastVisits.current[nextWorkspace] = location.hash;
      }
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
  }, [state.currentRole, license.commercial]);
  const switchWorkspace = nextWorkspace => {
    if (!allowedWorkspaces.includes(nextWorkspace) || nextWorkspace === currentWorkspace) return;
    if (canVisit && pageWorkspace(active)) lastVisits.current[currentWorkspace] = location.hash;
    location.hash = lastVisits.current[nextWorkspace];
  };
  const page = pages[active];
  const detailProvider = ['providers', 'providers-new', 'provider-materials'].includes(active) ? state.providers.find(item => item.id === detailParams.get("provider")) : null;
  const detailConnection = ['providers-new', 'providers-reference'].includes(active) && detailParams.has('connection')
    ? state.endpoints.find(item => item.id === detailParams.get('connection') && !item.deletedAt) : null;
  const activeGroup = organizationView ? 'organization' : page.groupId;
  const activeArea = organizationView && active === 'customer-usage-detail'
    ? (detailParams.has('project') ? 'projects' : 'enterprise') : page.area;
  const activeModule = sections.find(group => group.id === page.groupId)?.items.find(item => item.id === page.area);
  const detailTenant = active === 'customer-usage-detail' ? organizationState.tenants.find(item => item.id === detailParams.get('customer')) : null;
  const detailModel = detailParams.get('view') === 'template' && ['listing', 'model-templates'].includes(active) ? libraryRecord(state, detailParams.get('template')) : null;
  const enterpriseDetailId = active === 'tenants' && !organizationView ? detailParams.get('enterprise') : null;
  const detailEnterprise = enterpriseDetailId ? state.tenants.find(item => item.id === enterpriseDetailId && ['企业', '政府'].includes(item.type) && (!internal || company?.id === item.id)) : null;
  const detailUser = active === 'users' ? state.users.find(user => user.id === detailParams.get('user')) : null;
  const personalTenant = active === 'tenants' && !organizationView ? state.tenants.find(tenant => tenant.type === '个人' && tenant.ownerId === detailParams.get('personal')) : null;
  const breadcrumbs = !canVisit ? [{ label: '无访问权限' }] : adminBreadcrumbs(active, detailParams, { internal:organizationView, onboardingIntent: state.modelOnboardings.find(row=>row.id===detailParams.get('draft'))?.intent, provider: detailProvider?.name, connection: detailConnection && (detailConnection.name || detailConnection.id), model: detailModel?.serviceName || detailModel?.name, deployment: state.deployments.find(item => item.id === detailParams.get('deployment'))?.name, enterprise: detailEnterprise?.name, user: detailUser?.name || detailUser?.nickname, personal: personalTenant?.name, customer: detailTenant?.name });
  const hasAccount = state.admins.some(account => account.id === state.adminSession?.accountId && account.status === '已启用');
  const showPage = hasAccount && canVisit;
  const gatewaySettings = gatewaySettingsPages.includes(active);
  const renderMenu = collapsed => <nav aria-label="后台导航">{adminSections.filter(group =>
    group.workspace === currentWorkspace || (group.id === 'platform' && state.currentRole === '平台管理员')).map(group => {
      const locked = group.id === 'commerce' && !license.commercial;
      return <section key={group.id} aria-label={group.title}>
        {!collapsed && !group.direct && <Typography.Text type="tertiary" size="small">{group.title}{locked && '（未授权）'}</Typography.Text>}
        {group.items
          .filter(item => locked || canAccessPage(state.currentRole, item.children[0][0], license)).map(item => {
          const Icon = NAVIGATION_ICONS[item.id];
          const organization = group.id === 'organization';
          const selected = activeGroup === group.id && activeArea === item.id;
          const target = item.children[0][0] + (organization ? '?scope=organization' : '');
          const label = item.label;
          const collapsedLabel = (item.id === 'projects' ? `${group.title} · ${label}` : label) + (locked ? '（未授权）' : '');
          const button = <Button key={item.id} disabled={locked} block icon={<Icon aria-hidden="true"/>} type={selected ? 'primary' : 'tertiary'} theme={selected ? 'light' : 'borderless'}
            aria-current={selected ? 'page' : undefined} aria-label={collapsed ? collapsedLabel : undefined} onClick={() => navigate(target)}>{collapsed ? null : label}</Button>;
          return collapsed ? <Tooltip key={item.id} content={collapsedLabel} position="right" clickToHide closeOnEsc>{button}</Tooltip> : button;
        })}
      </section>;
    })}</nav>;
  const renderNavigation = (collapsed = false) => <Tabs type="button" size="small" activeKey={currentWorkspace} onChange={switchWorkspace}>
    {allowedWorkspaces.map(id => <Tabs.TabPane key={id} itemKey={id} tab={WORKSPACES[id]}>{id === currentWorkspace && renderMenu(collapsed)}</Tabs.TabPane>)}
  </Tabs>;
  useEffect(() => { const media = matchMedia('(min-width: 901px)'); const close = () => { if (media.matches) setNavOpen(false); }; media.addEventListener('change', close); return () => media.removeEventListener('change', close); }, []);
  const alertCount = state.alerts.filter(item => !["已恢复", "已转事件"].includes(item.status)).length;
  const sidebarToggleLabel = sidebarCollapsed ? '展开侧边栏' : '收起侧边栏';
  return <AdminUIContext.Provider value={true}><div className="admin-v2">
    {!navOpen && <aside className="v2-sidebar-desktop" data-collapsed={sidebarCollapsed}>
      <div id="admin-desktop-navigation" className="v2-sidebar">{renderNavigation(sidebarCollapsed)}</div>
      <Tooltip content={sidebarToggleLabel} position="top" clickToHide closeOnEsc>
        <Button className="v2-sidebar-toggle" type="tertiary" theme="borderless"
          icon={sidebarCollapsed ? <IconDoubleChevronRight aria-hidden="true"/> : <IconDoubleChevronLeft aria-hidden="true"/>}
          aria-label={sidebarToggleLabel} aria-controls="admin-desktop-navigation" aria-expanded={!sidebarCollapsed}
          onClick={() => setSidebarCollapsed(collapsed => !collapsed)}/>
      </Tooltip>
    </aside>}
    <div className="v2-content">
      <header className="admin-context-bar">
        <Button className="admin-nav-toggle" type="tertiary" theme="borderless" icon={<IconMenu aria-hidden="true"/>} aria-label="展开后台导航" aria-haspopup="dialog" aria-expanded={navOpen} onClick={() => setNavOpen(true)}/>
        <div className="admin-breadcrumb">
          <Breadcrumb aria-label="面包屑">{breadcrumbs.map(({ label, href }, index) => (
            <Breadcrumb.Item key={index} noLink>{href ? <a data-model-list-breadcrumb data-admin-breadcrumb href={href}>{label}</a> : <span title={label} aria-current={index === breadcrumbs.length - 1 ? 'page' : undefined}>{label}</span>}</Breadcrumb.Item>
          ))}</Breadcrumb>
          {detailTenant && <Typography.Text type="tertiary" size="small" className="us-breadcrumb-meta">{detailTenant.id} · {detailTenant.type} · {detailTenant.status}</Typography.Text>}
        </div>
        <Badge count={alertCount} aria-label={`${alertCount} 条待处理告警`}><IconBellStroked aria-hidden="true"/></Badge>
      </header>
      {state.storageError && <Banner type="danger" closeIcon={null} description={<>本地数据异常：{state.storageError.toLowerCase().includes('quota') ? '浏览器本地存储空间不足，原数据未更改。' : state.storageError} <Button onClick={reload}>重新加载</Button></>}/>}
      {conflict && <Banner type="warning" closeIcon={null} description={<>检测到其他页面的新版本数据。 <Button onClick={reload}>载入新版本</Button></>}/>}
      {showPage && !organizationView && commercialPage(active) && active !== 'tenants' && commerceReadOnly && <Banner type="warning" closeIcon={null} description={license.status === 'expired' ? '商业运营授权已到期，可查阅已保存的记录。' : '商业运营授权不可用，可查阅已保存的记录。'}/>}
      {showPage && activeModule?.children.length > 1 && activeModule.id !== 'materials' && (
        <Tabs className="v2-module-tabs" activeKey={active} onChange={navigate}>
          {activeModule.children.map(([id, label]) => <Tabs.TabPane key={id} itemKey={id} tab={label}/>)}
        </Tabs>
      )}
      <main data-admin-page={active}>
        <AdminPageBoundary key={active}>
          {!hasAccount ? <Banner title="后台账号不可用" description={<a href="#/auth/login">重新登录</a>} closeIcon={null}/> : !canVisit ? (
            <Banner type="warning" title="无访问权限" description={<Button onClick={() => navigate(WORKSPACE_HOME[allowedWorkspaces[0]] || 'dashboard')}>返回首页</Button>} closeIcon={null}/>
          ) : <>
            {active === "getting-started" ? <GettingStarted guideId={detailParams.get('guide')}/>
            : active === "dashboard" ? <OperationsOverview state={factState} workbenchName={workbenchName} onNavigate={navigate}
              shortcuts={overviewShortcuts.filter(({ id }) => canAccessPage(state.currentRole, id, license))}/>
            : ["usage-analysis", "user-analysis", "call-analysis"].includes(active) ? <AnalyticsPages pageId={active} state={factState}/>
            : ['customer-analysis', 'customer-analysis-detail'].includes(active) ? <CustomerAnalysis key={active + detailParams.toString()} detail={active === 'customer-analysis-detail'} params={detailParams}/>
            : active === 'customer-usage-detail' ? <CustomerUsageDetail state={organizationState} internal={organizationView}/>
            : active === "admins" ? <AdminAccounts state={state} transact={transactAdminAccount} conflict={conflict}/>
            : active === 'audit-logs' ? <AuditLogsPage key={state.adminSession.accountId} accountId={state.adminSession.serverAccountId || state.adminSession.accountId}/>
            : active === 'license' ? <LicensePage license={license}/>
            : active === 'business-analysis' ? <CommerceAnalysis state={factState}/>
            : active === 'site-configuration' ? <Suspense fallback={<AdminPageLoading label="站点配置"/>}><SiteConfiguration key={state.adminSession.accountId} dirtyRef={draftDirty}/></Suspense>
            : active === "model-market" ? <ModelMarket state={state} transact={transactModel} conflict={conflict} reload={reload} internal={internal}/>
            : active === "model-prices" ? <ModelPrices state={state} transact={transactModel} conflict={conflict} reload={reload} readOnly={commerceReadOnly}/>
            : active === "tariff-dictionary" ? <Suspense fallback={<AdminPageLoading label="模型资料"/>}><MaterialDictionaryPage state={state} transact={transactModel} conflict={conflict}/></Suspense>
            : ['providers', 'providers-new'].includes(active) ? <ProviderManagement key={active} page={active} state={state} transact={transactModel} conflict={conflict} reload={reload}/>
            : active === 'providers-reference' ? <ChannelManagementNew state={state} transact={transactModel} conflict={conflict} reload={reload}/>
            : active === 'provider-materials' ? <Suspense fallback={<AdminPageLoading label="服务商资料"/>}><ProviderMaterials state={state} transact={transactModel} conflict={conflict} reload={reload}/></Suspense>
            : active === 'model-templates' ? <Suspense fallback={<AdminPageLoading label="模型资料"/>}><ModelMaterials state={modelOperationsView(state,'all')} transact={transactModel} conflict={conflict} reload={reload}/></Suspense>
            : active === 'listing' ? <ModelManagement sourceState={state} state={modelOperationsView(state,detailParams.get('catalogue'))} transact={transactModel} conflict={conflict} reload={reload}/>
            : active === 'listing-new' ? <Suspense fallback={<AdminPageLoading label="模型服务（新）"/>}><ModelServicesNew state={factState} params={detailParams} dirtyRef={draftDirty} sourceConflict={conflict}/></Suspense>
            : active === "package-data" ? <PackageData state={state} params={detailParams}/>
            : active === "package-production" ? <PackageProduction state={state} transact={transact} conflict={conflict} params={detailParams} dirty={draftDirty}/>
            : active === 'traffic-limits' ? <Suspense fallback={<AdminPageLoading label="限流配置"/>}><TrafficOperations key={state.adminSession.accountId} state={state} dirtyRef={draftDirty}/></Suspense>
            : active === "users" ? <UsersPage state={factState}/>
            : active === "projects" ? <AdminProjects key={organizationView ? 'organization' : 'customers'} state={organizationState} params={detailParams} internal={organizationView}/>
            : active === "tenants" ? <CustomerPage key={organizationView ? 'organization' : 'customers'} state={organizationView && !internal ? organizationState : state} transact={transact} transactIndividual={transactIndividual} conflict={conflict} dirtyRef={draftDirty} deploymentTarget={bannerTarget} internal={organizationView}/>
            : gatewaySettings ? <GatewayPage key={active} pageId={active} state={state} dispatch={dispatch}/>
            : ["monitoring", "logs", "alerts", "incidents", "sla"].includes(active) ? <ObservabilityPage pageId={active} params={detailParams}
              state={factState} dispatch={dispatch} navigate={navigate} simulation={logSimulation} setSimulation={setLogSimulation}
              canViewFullLog={state.currentRole === '平台管理员'}/>
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
      {navOpen && <div className="v2-sidebar">{renderNavigation()}</div>}
    </Modal>
  </div></AdminUIContext.Provider>;
}
