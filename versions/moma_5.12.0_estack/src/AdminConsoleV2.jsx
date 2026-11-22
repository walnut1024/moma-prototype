import { ChannelLanguageContext, channelEnglish } from './admin-v2/channel-language';
import AdminPageLoading from './admin-v2/AdminPageLoading';
import {
  IconActivity, IconApartment, IconAppCenter, IconBarChartVStroked, IconBellStroked,
  IconBookOpenStroked, IconBookStroked, IconBox, IconChainStroked, IconChecklistStroked,
  IconComponentStroked, IconFlowChartStroked, IconGridStroked, IconLayers,
  IconDoubleChevronLeft, IconDoubleChevronRight, IconLanguage,
  IconMenu, IconMonitorStroked, IconPlayCircle, IconPriceTag, IconPulse, IconServerStroked, IconSetting,
  IconShield, IconUserGroup, IconUserSetting, IconUserStroked,
} from '@douyinfe/semi-icons';
import CloudModelOperations from './admin-v2/CloudModelOperations';
import { modelOperationsView } from './mock/model-data.js';
import { ModelOperationsGuide } from './admin-v2/GettingStarted';
import { Badge, Banner, Breadcrumb, Button, ConfigProvider, Dropdown, Tabs, Tooltip, Typography } from '@douyinfe/semi-ui';
import { AdminModal as Modal } from './admin-v2/AdminOverlay';
import enUS from '@douyinfe/semi-ui/lib/es/locale/source/en_US.js';
import zhCN from '@douyinfe/semi-ui/lib/es/locale/source/zh_CN.js';
import { adminSections, sections, pages, WORKSPACES, WORKSPACE_HOME, availableWorkspaces, pageWorkspace, canAccessPage, commercialPage, isOrganizationPage, pageFromHash, channelManagementListRoute } from './admin-v2/navigation.mjs';
import { adminBreadcrumbs } from './admin-v2/breadcrumbs.mjs';
import { modelMaterial } from './admin-v2/model-library';
import OperationsOverview from './admin-v2/OperationsOverview';
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import AnalyticsPages from "./admin-v2/AnalyticsPages";
import "./admin-v2/admin-shell.css";
import { ClusterManagement, ModelDeployments, ModelObservability } from "./admin-v2/InferencePages";
import { ChannelManagementNew } from "./admin-v2/ChannelDirectory";
const CustomerAnalysis = lazy(() => import('./admin-v2/CustomerAnalysis'));
const TrafficOperations = lazy(() => import('./admin-v2/TrafficOperations'));
const SiteConfiguration = lazy(() => import('./admin-v2/SiteConfiguration'));
const ModelMaterials = lazy(()=>import('./admin-v2/ModelMaterials'));
const ModelServicesNew = lazy(()=>import('./admin-v2/ModelServicesNew'));
const ModelLinks = lazy(() => import('./admin-v2/ModelLinks'));
const ProviderMaterials = lazy(()=>import('./admin-v2/ProviderMaterials'));
const MaterialDictionaryPage = lazy(()=>import('./admin-v2/MaterialDictionaryPage'));
import CustomerPage from "./admin-v2/CustomerPages";
import { managedIndividualAccounts } from "./admin-v2/individual-users";
import CustomerUsageDetail from "./admin-v2/CustomerUsageDetail";
import ModelPrices from './admin-v2/ModelPrices';
import ModelMarket from './admin-v2/ModelMarket';
import { managedEnterpriseTenants } from "./admin-v2/enterprise";
import { useDeploymentLicense } from './useDeploymentLicense';
import GlobalRouting from './admin-v2/GlobalRouting.jsx';
import { LICENSE_UNAVAILABLE } from './deployment-license.mjs';
import LicensePage from './admin-v2/LicensePage';
import CommerceAnalysis from './admin-v2/CommerceAnalysis';
import { Toast } from '@douyinfe/semi-ui';
import GatewayPage, { gatewaySettingsPages } from "./admin-v2/GatewayPages";
import ObservabilityPage from "./admin-v2/ObservabilityPages";
import ArtifactManagement from './admin-v2/ArtifactManagement';
import BusinessOperationsPage from "./admin-v2/BusinessOperationsPages";
import PackageProduction from "./admin-v2/PackageProduction";
import PackageData from "./admin-v2/PackageData";
import AdminPageBoundary from "./admin-v2/AdminPageBoundary";
import AdminAccounts from "./admin-v2/AdminAccounts";
import AuditLogsPage from './admin-v2/AuditLogsPage';
import TenantResources from './admin-v2/TenantResources';
import { tenantHref } from './admin-v2/access-control.mjs';
import { AdminUIContext } from "./components/admin-ui-context";
import { serviceOperationsUi } from "./admin-v2/ServiceUI";

const NAVIGATION_ICONS = {
  overview: IconGridStroked,
  usage: IconBarChartVStroked,
  'users-analysis': IconUserGroup,
  'customers-analysis': IconUserStroked,
  'channels-reference': IconChainStroked,
  'warehouse-new': IconLayers,
  'model-links': IconFlowChartStroked,
  market: IconAppCenter,
  prices: IconPriceTag,
  materials: IconBookStroked,
  'package-production': IconBox,
  'package-data': IconChecklistStroked,
  'traffic-limits': IconActivity,
  enterprise: IconApartment,
  projects: IconLayers,
  individual: IconUserStroked,
  'organization-members': IconUserGroup,
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
  'global-routing': IconSetting,
  'site-configuration': IconSetting,
  'model-operations-guide': IconBookOpenStroked,
};
const overviewShortcuts = ['usage-analysis', 'user-analysis', 'listing-new', 'providers-reference'].map(id => ({
  id, label: id === 'providers-reference' ? pages[id].areaLabel : pages[id].label, Icon: NAVIGATION_ICONS[pages[id].area],
}));

const GUIDE_LANGUAGE_KEY = 'moma-5120-admin-guide-language';

export default function AdminConsoleV2(props) {
  const license = useDeploymentLicense();
  const [hash,setHash]=useState(location.hash);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [english, setEnglish] = useState(() => {
    try { return localStorage.getItem(GUIDE_LANGUAGE_KEY) === 'en'; }
    catch { return false; }
  });
  const changeLanguage = value => {
    setEnglish(value);
    try { localStorage.setItem(GUIDE_LANGUAGE_KEY, value ? 'en' : 'zh-CN'); }
    catch { /* The current selection still applies when storage is unavailable. */ }
  };
  useEffect(()=>{const sync=()=>setHash(location.hash);addEventListener('hashchange',sync);return()=>removeEventListener('hashchange',sync);},[]);
  const cloud=/^#\/admin-2\/(listing-new|providers-reference|model-market|model-prices|model-templates|provider-materials|tariff-dictionary)(?:[/?]|$)/.test(hash);
  const packageWorkspace=license?.commercial && /^#\/admin-2\/(?:package-production|package-data)(?:[/?]|$)/.test(hash);
  const area = packageWorkspace ? 'packages' : cloud ? 'models' : 'application';
  if (!license) return <AdminPageLoading label="部署授权"/>;
  return <ChannelLanguageContext.Provider value={english}><ConfigProvider locale={english && ['providers-reference', 'providers-health'].includes(pageFromHash(hash)) ? enUS : zhCN}><CloudModelOperations key={area} packageWorkspace={packageWorkspace} applicationWorkspace={!cloud && !packageWorkspace}>{store=><AdminConsoleV2View {...props} store={store} license={license} sidebarCollapsed={sidebarCollapsed} setSidebarCollapsed={setSidebarCollapsed} english={english} changeLanguage={changeLanguage}/>}</CloudModelOperations></ConfigProvider></ChannelLanguageContext.Provider>;
}
function AdminConsoleV2View({workbenchName,store,license:deploymentLicense,sidebarCollapsed,setSidebarCollapsed,english,changeLanguage}) {
  const { state: workspaceState, dispatch: persist, transact, transactModel, transactIndividual, transactAdminAccount, reload, conflict } = store;
  const internalSite = !deploymentLicense.commercial || (!deploymentLicense.managed && workspaceState.spacePolicy?.operatingMode==='internal');
  const license = internalSite ? { ...deploymentLicense, commercial:false, commerceWritable:false } : deploymentLicense;
  const commerceReadOnly = license.commercial && !license.commerceWritable;
  const state = { ...workspaceState, commerceReadOnly, spacePolicy: {
    ...workspaceState.spacePolicy,
    operatingMode: internalSite ? 'internal' : 'factory',
  } };
  const dispatch = action => {
    if (commercialPage(active) && (active !== 'tenants' || !internalSite) && !license.commerceWritable) {
      Toast.warning(LICENSE_UNAVAILABLE);
      return null;
    }
    return persist(action);
  };
  const factState=state;
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
  const organizationView = isOrganizationPage(active, internalSite);
  const organizationTenant = state.tenants.find(row=>row.id===state.spacePolicy?.internalTenantId);
  const resourceTenant = state.tenants.find(row=>row.id===detailParams.get('tenant') && (!internalSite || row.id===organizationTenant?.id));
  const pageState = organizationView ? {
    ...state, tenants: state.tenants.filter(tenant => tenant.id === organizationTenant?.id),
    spacePolicy: { ...state.spacePolicy, operatingMode: 'internal', internalTenantId: organizationTenant?.id },
    commerceReadOnly: !internalSite || state.commerceReadOnly,
  } : state;
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
      if (canAccessPage(state.currentRole, id, license)) {
        if (nextWorkspace) { setWorkspace(nextWorkspace); lastVisits.current[nextWorkspace] = location.hash; }
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
  const detailProvider = active === 'provider-materials' ? state.providers.find(item => item.id === detailParams.get("provider")) : null;
  const detailConnection = active === 'providers-reference' ? state.endpoints.find(item => item.id === detailParams.get('connection') && !item.deletedAt) : null;
  const activeGroup = page.groupId;
  const activeArea = page.area;
  const activeModule = sections.find(group => group.id === page.groupId)?.items.find(item => item.id === page.area);
  const detailTenant = active === 'customer-usage-detail' ? pageState.tenants.find(item => item.id === detailParams.get('customer')) : null;
  const detailModel = !canVisit ? null : detailParams.get('view') === 'template' && active === 'model-templates' ? modelMaterial(state, detailParams.get('template')) : null;
  const enterpriseDetailId = canVisit && active === 'tenants' ? (organizationView ? organizationTenant?.id : detailParams.get('enterprise')) : null;
  const detailEnterprise = enterpriseDetailId ? managedEnterpriseTenants(pageState).find(item => item.id === enterpriseDetailId) : null;
  const personalTenant = canVisit && active === 'tenants' ? managedIndividualAccounts(state).find(row => row.tenant.ownerId === detailParams.get('personal'))?.tenant : null;
  const breadcrumbs = !canVisit ? [{ label: '无访问权限' }] : adminBreadcrumbs(active, detailParams, { internal:organizationView, onboardingIntent: state.modelOnboardings.find(row=>row.id===detailParams.get('draft'))?.intent, provider: detailProvider?.name, connection: detailConnection && (detailConnection.name || detailConnection.id), model: detailModel?.serviceName || detailModel?.name, deployment: state.deployments.find(item => item.id === detailParams.get('deployment'))?.name, enterprise: detailEnterprise?.name, personal: personalTenant?.name, customer: detailTenant?.name });
  const hasAccount = state.admins.some(account => account.id === state.adminSession?.accountId && account.status === '已启用');
  const showPage = hasAccount && canVisit;
  const gatewaySettings = gatewaySettingsPages.includes(active);
  const renderMenu = collapsed => <nav aria-label="后台导航">{adminSections.filter(group =>
    group.workspace === currentWorkspace || (group.id === 'platform' && state.currentRole === '平台管理员')).map(group => {
      const reason = group.id === 'commerce' && !license.commercial ? '未授权' : '';
      return <section key={group.id} aria-label={group.title}>
        {!collapsed && !group.direct && <Typography.Text type="tertiary" size="small">{group.title}{reason && `（${reason}）`}</Typography.Text>}
        {group.items
          .filter(item => reason || canAccessPage(state.currentRole, item.children[0][0], license)).map(item => {
          const Icon = NAVIGATION_ICONS[item.id];
          const selected = activeGroup === group.id && activeArea === item.id;
          const target = item.children[0][0];
          const label = english && item.id === 'channels-reference' ? channelEnglish(item.label) : item.label;
          const collapsedLabel = (item.id === 'projects' ? `${group.title} · ${label}` : label) + (reason ? `（${reason}）` : '');
          const button = <Button key={item.id} disabled={Boolean(reason)} block icon={<Icon aria-hidden="true"/>} type={selected ? 'primary' : 'tertiary'} theme={selected ? 'light' : 'borderless'}
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
  const renderLanguage = collapsed =>
    <Dropdown trigger="click" position="topLeft" render={<Dropdown.Menu>
      <Dropdown.Item active={!english} onClick={() => changeLanguage(false)}><span lang="zh-CN">简体中文</span></Dropdown.Item>
      <Dropdown.Item active={english} onClick={() => changeLanguage(true)}><span lang="en">English</span></Dropdown.Item>
    </Dropdown.Menu>}>
      <Button theme="borderless" type="tertiary" size="small" icon={<IconLanguage aria-hidden="true"/>}
        aria-label={english ? 'Language: English' : '语言：简体中文'} aria-haspopup="menu">
        {collapsed ? null : english ? 'English' : '简体中文'}
      </Button>
    </Dropdown>;
  return <AdminUIContext.Provider value={true}><div className="admin-v2">
    {!navOpen && <aside className="v2-sidebar-desktop" data-collapsed={sidebarCollapsed}>
      <div id="admin-desktop-navigation" className="v2-sidebar">{renderNavigation(sidebarCollapsed)}</div>
      <div className="v2-sidebar-footer">
        {renderLanguage(sidebarCollapsed)}
      <Tooltip content={sidebarToggleLabel} position="top" clickToHide closeOnEsc>
        <Button className="v2-sidebar-toggle" type="tertiary" theme="borderless"
          icon={sidebarCollapsed ? <IconDoubleChevronRight aria-hidden="true"/> : <IconDoubleChevronLeft aria-hidden="true"/>}
          aria-label={sidebarToggleLabel} aria-controls="admin-desktop-navigation" aria-expanded={!sidebarCollapsed}
          onClick={() => setSidebarCollapsed(collapsed => !collapsed)}/>
      </Tooltip>
      </div>
    </aside>}
    <div className="v2-content">
      <header className="admin-context-bar">
        <Button className="admin-nav-toggle" type="tertiary" theme="borderless" icon={<IconMenu aria-hidden="true"/>} aria-label="展开后台导航" aria-haspopup="dialog" aria-expanded={navOpen} onClick={() => setNavOpen(true)}/>
        <div className="admin-breadcrumb">
          <Breadcrumb aria-label="面包屑">{breadcrumbs.map(({ label, href }, index) => (
            <Breadcrumb.Item key={index} noLink>{href ? <a data-model-list-breadcrumb data-admin-breadcrumb href={href}>{english && activeArea === 'channels-reference' && (href || index < 2 || !detailParams.has('connection')) ? channelEnglish(label) : label}</a> : <span title={english && activeArea === 'channels-reference' && (href || index < 2 || !detailParams.has('connection')) ? channelEnglish(label) : label} aria-current={index === breadcrumbs.length - 1 ? 'page' : undefined}>{english && activeArea === 'channels-reference' && (href || index < 2 || !detailParams.has('connection')) ? channelEnglish(label) : label}</span>}</Breadcrumb.Item>
          ))}</Breadcrumb>
          {detailTenant && <Typography.Text type="tertiary" size="small" className="us-breadcrumb-meta">{detailTenant.id} · {detailTenant.type} · {detailTenant.status}</Typography.Text>}
        </div>
        <Badge count={alertCount} aria-label={`${alertCount} 条待处理告警`}><IconBellStroked aria-hidden="true"/></Badge>
      </header>
      {state.storageError && <Banner type="danger" closeIcon={null} description={<>本地数据异常：{state.storageError.toLowerCase().includes('quota') ? '浏览器本地存储空间不足，原数据未更改。' : state.storageError} <Button onClick={reload}>重新加载</Button></>}/>}
      {conflict && <Banner type="warning" closeIcon={null} description={<>检测到其他页面的新版本数据。 <Button onClick={reload}>载入新版本</Button></>}/>}
      {showPage && !organizationView && commercialPage(active) && active !== 'tenants' && commerceReadOnly && <Banner type="warning" closeIcon={null} description={license.status === 'expired' ? '商业运营授权已到期，可查阅已保存的记录。' : '商业运营授权不可用，可查阅已保存的记录。'}/>}
      {showPage && activeModule?.children.length > 1 && activeModule.id !== 'materials' &&
        !(active === 'providers-reference' && detailParams.get('connection')) && (
        <Tabs className={activeArea === 'channels-reference' ? 'v2-module-tabs channel-management-tabs' : 'v2-module-tabs'}
          activeKey={active} onChange={activeArea === 'channels-reference' ? id => navigate(channelManagementListRoute(id, new URLSearchParams(location.hash.split('?')[1]))) : navigate}>
          {activeModule.children.map(([id, label]) => <Tabs.TabPane key={id} itemKey={id} tab={english && activeArea === 'channels-reference' ? channelEnglish(label) : label}/>)}
        </Tabs>
      )}
      <main data-admin-page={active}>
        <AdminPageBoundary key={active}>
          {!hasAccount ? <Banner title="后台账号不可用" description={<a href="#/auth/login">重新登录</a>} closeIcon={null}/> : !canVisit ? (
            <Banner type="warning" title="无访问权限" description={<Button onClick={() => navigate(WORKSPACE_HOME[allowedWorkspaces[0]] || 'dashboard')}>返回首页</Button>} closeIcon={null}/>
          ) : organizationView && !organizationTenant ? <Banner type="warning" title="尚未配置默认企业租户" closeIcon={null}/> : <>
            {active === "model-operations-guide" ? <ModelOperationsGuide english={english}/>
            : active === "dashboard" ? <OperationsOverview state={factState} workbenchName={workbenchName} onNavigate={navigate}
              shortcuts={overviewShortcuts.filter(({ id }) => canAccessPage(state.currentRole, id, license))}/>
            : ["usage-analysis", "user-analysis", "call-analysis"].includes(active) ? <AnalyticsPages pageId={active} state={factState}/>
            : ['customer-analysis', 'customer-analysis-detail'].includes(active) ? <CustomerAnalysis key={active + detailParams.toString()} detail={active === 'customer-analysis-detail'} params={detailParams}/>
            : active === 'customer-usage-detail' ? <CustomerUsageDetail state={pageState}/>
            : active === "admins" ? <AdminAccounts state={state} transact={transactAdminAccount} conflict={conflict}/>
            : active === 'audit-logs' ? <AuditLogsPage key={state.adminSession.accountId + ':' + detailParams.toString()}
              accountId={state.adminSession.accountId} params={detailParams} tenants={state.tenants} projects={state.projects}/>
            : active === 'site-configuration' ? <Suspense fallback={<AdminPageLoading label="站点配置"/>}><SiteConfiguration key={state.adminSession.accountId} dirtyRef={draftDirty}/></Suspense>
            : active === 'global-routing' ? <GlobalRouting saved={state.globalRoutingParameters} revision={state.revision} transact={transact} conflict={conflict} dirtyRef={draftDirty}/>
            : active === 'license' ? <LicensePage license={license}/>
            : active === 'business-analysis' ? <CommerceAnalysis state={state}/>
            : active === "model-market" ? <ModelMarket state={state} transact={transactModel} conflict={conflict} internal={internalSite}/>
            : active === "model-prices" ? <ModelPrices state={state} transact={transactModel} conflict={conflict} reload={reload} readOnly={commerceReadOnly}/>
            : active === "tariff-dictionary" ? <Suspense fallback={<AdminPageLoading label="基础资料"/>}><MaterialDictionaryPage state={state} transact={transactModel} conflict={conflict}/></Suspense>
            : active === 'providers-reference' ? <ChannelManagementNew state={state} transact={transactModel} conflict={conflict} reload={reload}/>
            : active === 'provider-materials' ? <Suspense fallback={<AdminPageLoading label="服务商资料"/>}><ProviderMaterials state={state} transact={transactModel} conflict={conflict} reload={reload}/></Suspense>
            : active === 'model-templates' ? <Suspense fallback={<AdminPageLoading label="基础资料"/>}><ModelMaterials state={modelOperationsView(state,'all')} transact={transactModel} conflict={conflict} reload={reload}/></Suspense>
            : active === 'listing-new' ? <Suspense fallback={<AdminPageLoading label={pages[active].label}/>}><ModelServicesNew state={factState} params={detailParams} dirtyRef={draftDirty} sourceConflict={conflict} reloadWorkspace={reload}/></Suspense>
            : active === 'model-links' ? <Suspense fallback={<AdminPageLoading label={pages[active].label}/>}><ModelLinks/></Suspense>
            : active === "package-data" ? <PackageData state={state} params={detailParams}/>
            : active === "package-production" ? <PackageProduction state={state} transact={transact} conflict={conflict} params={detailParams} dirty={draftDirty}/>
            : active === 'traffic-limits' ? <Suspense fallback={<AdminPageLoading label="限流配置"/>}><TrafficOperations key={state.adminSession.accountId} state={state} dirtyRef={draftDirty}/></Suspense>
            : active === "tenants" ? <CustomerPage key={organizationView ? 'organization' : 'customers'} state={pageState} transact={transact} transactIndividual={transactIndividual} reload={reload} conflict={conflict} dirtyRef={draftDirty} internal={organizationView}/>
            : ['organization-members','projects'].includes(active) ? <TenantResources key={[active,resourceTenant?.id,detailParams.get('project')].join(':')}
              page={active} tenantId={resourceTenant?.id} tenantName={resourceTenant?.name} tab={detailParams.get('tab')}
              requestedProject={detailParams.get('project')}
              returnHref={resourceTenant && tenantHref(resourceTenant,active==='projects'
                ? {tab:'projects',...(detailParams.get('project') && {project:detailParams.get('project')})} : {tab:'organization'})}
              onTabChange={tab=>navigate(active + '?' + new URLSearchParams({tenant:resourceTenant.id,tab}))}/>
            : gatewaySettings ? <GatewayPage key={active} pageId={active} state={state} dispatch={dispatch}/>
            : ["providers-health", "monitoring", "logs", "alerts", "incidents", "sla"].includes(active) ? <ObservabilityPage pageId={active} params={detailParams}
              state={factState} dispatch={dispatch} navigate={navigate} simulation={logSimulation} setSimulation={setLogSimulation}
              canViewFullLog={state.currentRole === '平台管理员'}/>
            : active === "clusters" ? <ClusterManagement state={state} dispatch={dispatch}/>
            : active === "deployments" ? <ModelDeployments state={state} dispatch={dispatch} conflict={conflict}/>
            : active === "artifacts" ? <ArtifactManagement state={state} dispatch={dispatch}/>
            : active === "model-observability" ? <ModelObservability state={state}/> : <BusinessOperationsPage key={active} pageId={active} state={state} params={detailParams} dispatch={dispatch}/>}
          </>}
        </AdminPageBoundary>
      </main>
    </div>
    {leave && serviceOperationsUi.renderLeaveDialog({ cancel: () => setLeave(null), discard: () => {
      draftDirty.current = false;
      setLeave(null);
      leave();
    } })}
    <Modal title="后台导航" visible={navOpen} footer={navOpen ? <div className="v2-sidebar-footer">{renderLanguage(false)}</div> : null} width="min(320px, calc(100vw - 32px))" closeOnEsc onCancel={() => setNavOpen(false)} bodyStyle={{ maxHeight: '65dvh', overflow: 'auto' }}>
      {navOpen && <div className="v2-sidebar">{renderNavigation()}</div>}
    </Modal>
  </div></AdminUIContext.Provider>;
}
