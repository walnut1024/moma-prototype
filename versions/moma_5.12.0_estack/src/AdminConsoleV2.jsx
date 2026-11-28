import { channelEnglish } from './admin-v2/channel-language';
import AdminPageLoading from './admin-v2/AdminPageLoading';
import {
  Activity as IconActivity, Network as IconApartment, PanelsTopLeft as IconAppCenter, FileText as IconArticle,
  ChartNoAxesColumn as IconBarChartVStroked, Bell as IconBellStroked, BookOpen as IconBookOpenStroked,
  Book as IconBookStroked, Box as IconBox, Link as IconChainStroked, ListChecks as IconChecklistStroked,
  Component as IconComponentStroked, Workflow as IconFlowChartStroked, LayoutGrid as IconGridStroked, List as IconList,
  Layers as IconLayers, ChevronsLeft as IconDoubleChevronLeft, ChevronsRight as IconDoubleChevronRight, ChevronRight,
  Menu as IconMenu, CirclePlay as IconPlayCircle, Tag as IconPriceTag, HeartPulse as IconPulse,
  Server as IconServerStroked, Settings as IconSetting, Shield as IconShield, Users as IconUserGroup,
  UserCog as IconUserSetting, UserRound as IconUserStroked,
} from 'lucide-react';
import CloudModelOperations from './admin-v2/CloudModelOperations';
import { XaBanner as Banner, XaButton as Button, XaModal as Modal, XaSelect as Select,
  XaTabs as Tabs, XaTypography as Typography } from './admin-v2/xa24/HaloComponents.jsx';
import { XaToastRegion } from './admin-v2/xa24/HaloFeedback.jsx';
import { adminSections, sections, pages, WORKSPACES, WORKSPACE_HOME, availableWorkspaces, pageWorkspace, canAccessPage, commercialPage, isOrganizationPage, isInfrastructurePage, pageFromHash, channelManagementListRoute } from './admin-v2/navigation.mjs';
import { adminBreadcrumbs } from './admin-v2/breadcrumbs.mjs';
import { modelMaterial } from './admin-v2/model-library';
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { createPortal } from 'react-dom';
import "./admin-v2/admin-shell.css";
import './admin-v2/xa24/xa24-overrides.css';
import { managedIndividualAccounts } from "./admin-v2/individual-users";
import { managedEnterpriseTenants } from "./admin-v2/enterprise";
import { LICENSE_NAMES, LICENSE_UNAVAILABLE } from './deployment-license.mjs';
import AdminPageBoundary from "./admin-v2/AdminPageBoundary";
import { tenantHref } from './admin-v2/access-control.mjs';
import { AdminUIContext } from "./components/admin-ui-context";
import { serviceOperationsUi } from "./admin-v2/ServiceUI";

const loadOverview = () => import('./admin-v2/OperationsOverview');
const OperationsOverview = lazy(loadOverview);
const AnalyticsPages = lazy(() => import('./admin-v2/AnalyticsPages'));
const ModelPerformancePage = lazy(() => import('./admin-v2/ModelPerformancePage'));
const InfrastructurePage = lazy(() => import('./admin-v2/InfrastructurePage'));
const CustomerPage = lazy(() => import('./admin-v2/CustomerPages'));
const CustomerUsageDetail = lazy(() => import('./admin-v2/CustomerUsageDetail'));
const ModelMarket = lazy(() => import('./admin-v2/ModelMarket'));
const GlobalRouting = lazy(() => import('./admin-v2/GlobalRouting.jsx'));
const LicensePage = lazy(() => import('./admin-v2/LicensePage'));
const CommerceAnalysis = lazy(() => import('./admin-v2/CommerceAnalysis'));
const ObservabilityPage = lazy(() => import('./admin-v2/ObservabilityPages'));
const BusinessOperationsPage = lazy(() => import('./admin-v2/BusinessOperationsPages'));
const PackageProduction = lazy(() => import('./admin-v2/PackageProduction'));
const PackageData = lazy(() => import('./admin-v2/PackageData'));
const AdminAccounts = lazy(() => import('./admin-v2/AdminAccounts'));
const AuditLogsPage = lazy(() => import('./admin-v2/AuditLogsPage'));
const TenantResources = lazy(() => import('./admin-v2/TenantResources'));
const AdminProjects = lazy(() => import('./admin-v2/AdminProjects'));
const ModelOperationsGuide = lazy(() => import('./admin-v2/GettingStarted').then(module => ({ default: module.ModelOperationsGuide })));
const ModelOperationsRequirements = lazy(() => import('./admin-v2/ModelOperationsRequirements'));
const ClusterManagement = lazy(() => import('./admin-v2/InferencePages').then(module => ({ default: module.ClusterManagement })));
const ModelDeployments = lazy(() => import('./admin-v2/InferencePages').then(module => ({ default: module.ModelDeployments })));
const InferenceDemo = lazy(() => import('./admin-v2/InferenceDemo'));
const inferenceDemoPages = new Set([
  'deployments', 'clusters', 'ops-nodes', 'ops-gpus', 'ops-benchmarks', 'ops-cache-acceleration', 'ops-model-files',
]);
const loadModelConnections = () => import('./admin-v2/ChannelDirectory');
const ChannelManagementNew = lazy(() => loadModelConnections().then(module => ({ default: module.ChannelManagementNew })));
const ModelPrices = lazy(() => import('./admin-v2/ModelPrices'));
const GatewayRouteSettings = lazy(() => import('./admin-v2/GatewayRouteSettings.jsx'));
const CustomerAnalysis = lazy(() => import('./admin-v2/CustomerAnalysis'));
const TrafficOperations = lazy(() => import('./admin-v2/TrafficOperations'));
const SiteConfiguration = lazy(() => import('./admin-v2/SiteConfiguration'));
const AnnouncementManagement = lazy(() => import('./admin-v2/AnnouncementManagement'));
const SiteAgreementsEditor = lazy(() => import('./admin-v2/SiteAgreementsEditor'));
const ModelMaterials = lazy(() => import('./admin-v2/ModelMaterials'));
const loadModelServices = () => import('./admin-v2/ModelServicesNew');
const ModelServicesNew = lazy(loadModelServices);
const ModelLinks = lazy(() => import('./admin-v2/ModelLinks'));
const ProviderMaterials = lazy(() => import('./admin-v2/ProviderMaterials'));
const MaterialDictionaryPage = lazy(() => import('./admin-v2/MaterialDictionaryPage'));

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
  'package-data': IconBarChartVStroked,
  'site-agreements': IconArticle,
  'traffic-limits': IconActivity,
  enterprise: IconApartment,
  projects: IconLayers,
  'model-performance': IconBarChartVStroked,
  gateway: IconFlowChartStroked,
  logs: IconChecklistStroked,
  clusters: IconServerStroked,
  'ops-model-library': IconLayers,
  deployments: IconPlayCircle,
  'ops-benchmarks': IconBarChartVStroked,
  'ops-inference-backends': IconComponentStroked,
  'ops-cache-acceleration': IconPulse,
  'ops-model-files': IconBox,
  license: IconShield,
  accounts: IconUserSetting,
  'audit-logs': IconChecklistStroked,
  'global-routing': IconSetting,
  'site-configuration': IconSetting,
  announcements: IconBellStroked,
  'model-operations-guide': IconBookOpenStroked,
  'model-operations-requirements': IconBookStroked,
};
const overviewShortcuts = ['usage-analysis', 'user-analysis', 'listing-new', 'providers-reference'].map(id => ({
  id, label: id === 'providers-reference' ? pages[id].areaLabel : pages[id].label, Icon: NAVIGATION_ICONS[pages[id].area],
}));



export default function AdminConsoleV2(props) {
  const { license } = props;
  const [hash,setHash]=useState(location.hash);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarGroups, setSidebarGroups] = useState({});
  const [menuPreview, setMenuPreview] = useState(null);
  const { english, changeLanguage } = props;
  useEffect(()=>{const sync=()=>setHash(location.hash);addEventListener('hashchange',sync);return()=>removeEventListener('hashchange',sync);},[]);
  const cloud=/^#\/admin-2\/(listing-new|providers-reference|model-market|model-prices|model-templates|provider-materials|tariff-dictionary)(?:[/?]|$)/.test(hash);
  // Fetch the requested module while its workspace data is loading.
  const routeId = pageFromHash(hash);
  useEffect(() => {
    const loadPage = { dashboard: loadOverview, 'listing-new': loadModelServices, 'providers-reference': loadModelConnections, 'providers-health': loadModelConnections }[routeId];
    loadPage?.().catch(() => {}); // The page boundary handles rendering failures.
  }, [routeId]);
  const packageWorkspace=license?.commercial && /^#\/admin-2\/(?:package-production|package-data)(?:[/?]|$)/.test(hash);
  const area = packageWorkspace ? 'packages' : cloud ? 'models' : 'application';
  if (!license) return <AdminPageLoading label="部署授权"/>;
  return <CloudModelOperations key={area} packageWorkspace={packageWorkspace} applicationWorkspace={!cloud && !packageWorkspace}>{store=><AdminConsoleV2View {...props} store={store} license={license} sidebarCollapsed={sidebarCollapsed} setSidebarCollapsed={setSidebarCollapsed} english={english} changeLanguage={changeLanguage}
    sidebarGroups={sidebarGroups} setSidebarGroups={setSidebarGroups} menuPreview={menuPreview} setMenuPreview={setMenuPreview}/>}</CloudModelOperations>;
}
function AdminConsoleV2View({workbenchName,store,license:deploymentLicense,sidebarCollapsed,setSidebarCollapsed,sidebarGroups,setSidebarGroups,english,changeLanguage,draftDirty,bannerTarget,menuPreview,setMenuPreview}) {
  const { state: workspaceState, dispatch: persist, transact, transactModel, transactIndividual, transactAdminAccount, reload, refreshRead, conflict } = store;
  const internalSite = !deploymentLicense.commercial || (!deploymentLicense.managed && workspaceState.spacePolicy?.operatingMode==='internal');
  const license = internalSite ? { ...deploymentLicense, commercial:false, commerceWritable:false } : deploymentLicense;
  const commerceReadOnly = license.commercial && !license.commerceWritable;
  const state = { ...workspaceState, commerceReadOnly, spacePolicy: {
    ...workspaceState.spacePolicy,
    operatingMode: internalSite ? 'internal' : 'factory',
  } };
  const [notice, setNotice] = useState(null);
  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(timeout);
  }, [notice]);
  const dispatch = action => {
    if (commercialPage(active) && (active !== 'tenants' || !internalSite) && !license.commerceWritable) {
      setNotice({ type: 'warning', text: LICENSE_UNAVAILABLE });
      return null;
    }
    return persist(action);
  };
  const factState=state;
  const initialPage = pageFromHash(location.hash, state.currentRole);
  const [navOpen, setNavOpen] = useState(false);
  const [leave, setLeave] = useState(null);
  const [logSimulation, setLogSimulation] = useState(null);
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
    return () => {
      removeEventListener('hashchange', sync, true);
      removeEventListener('beforeunload', unload);
      draftDirty.current = false;
    };
  }, [draftDirty]);
  const [active, setActive] = useState(initialPage);
  const demoMode = new URLSearchParams(location.search).get('demo');
  const interactiveDemo = demoMode === 'inference-interactive';
  const [workspace, setWorkspace] = useState(pageWorkspace(initialPage) || availableWorkspaces(state.currentRole)[0] || 'operations');
  const [detailParams, setDetailParams] = useState(() => new URLSearchParams(location.hash.split('?')[1] || ''));
  const organizationView = isOrganizationPage(active, internalSite);
  const organizationTenant = state.tenants?.find(row=>row.id===state.spacePolicy?.internalTenantId);
  const resourceTenant = state.tenants?.find(row=>row.id===detailParams.get('tenant') && (!internalSite || row.id===organizationTenant?.id));
  const pageState = organizationView ? {
    ...state, tenants: state.tenants.filter(tenant => tenant.id === organizationTenant?.id),
    spacePolicy: { ...state.spacePolicy, operatingMode: 'internal', internalTenantId: organizationTenant?.id },
    commerceReadOnly: !internalSite || state.commerceReadOnly,
  } : state;
  const lastVisits = useRef({
    operations: '#/admin-2/' + WORKSPACE_HOME.operations,
    maintenance: '#/admin-2/' + WORKSPACE_HOME.maintenance,
  });
  const previousRole = useRef(state.currentRole);
  const allowedWorkspaces = availableWorkspaces(state.currentRole);
  const canVisit = canAccessPage(state.currentRole, active, license, detailParams);
  const currentWorkspace = allowedWorkspaces.includes(workspace) ? workspace : allowedWorkspaces[0] || 'operations';
  const navigate = id => {
    if (interactiveDemo && !inferenceDemoPages.has(id.split('?')[0])) return;
    setNavOpen(false);
    location.hash = '/admin-2/' + id;
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  useEffect(() => {
    const sync = () => {
      const id = pageFromHash(location.hash, state.currentRole), nextWorkspace = pageWorkspace(id);
      const path = location.hash.split('?')[0];
      const canonical = '#/admin-2/' + id;
      if (path !== canonical && !path.startsWith(canonical + '/')) {
        location.replace(canonical);
        return;
      }
      const params = new URLSearchParams(location.hash.split('?')[1] || '');
      setNavOpen(false); setActive(id); setDetailParams(params);
      if (canAccessPage(state.currentRole, id, license, params)) {
        if (nextWorkspace) { setWorkspace(nextWorkspace); lastVisits.current[nextWorkspace] = location.hash; }
      }
    };
    if (previousRole.current !== state.currentRole) {
      previousRole.current = state.currentRole;
      const params = new URLSearchParams(location.hash.split('?')[1] || '');
      if (!canAccessPage(state.currentRole, pageFromHash(location.hash, state.currentRole), license, params)) navigate(WORKSPACE_HOME[availableWorkspaces(state.currentRole)[0]] || 'dashboard');
    }
    // Let page leave guards restore the address before changing the rendered page.
    let pendingHash;
    const handleHashChange = () => { clearTimeout(pendingHash); pendingHash = setTimeout(sync, 0); };
    sync(); window.addEventListener('hashchange', handleHashChange);
    return () => { clearTimeout(pendingHash); window.removeEventListener('hashchange', handleHashChange); };
  }, [state.currentRole, license.commercial]);
  const switchWorkspace = nextWorkspace => {
    if (interactiveDemo || !allowedWorkspaces.includes(nextWorkspace) || nextWorkspace === currentWorkspace) return;
    if (canVisit && pageWorkspace(active)) lastVisits.current[currentWorkspace] = location.hash;
    location.hash = lastVisits.current[nextWorkspace];
  };
  const page = pages[active];
  const detailProvider = active === 'provider-materials' ? state.providers.find(item => item.id === detailParams.get("provider")) : null;
  const detailConnection = active === 'providers-reference' ? state.endpoints.find(item => item.id === detailParams.get('connection') && !item.deletedAt) : null;
  const activeGroup = page.groupId;
  useEffect(() => {
    setSidebarGroups(current => current[activeGroup] === false ? { ...current, [activeGroup]: true } : current);
  }, [activeGroup, setSidebarGroups]);
  const activeArea = page.area;
  const activeModule = sections.find(group => group.id === page.groupId)?.items.find(item => item.id === page.area);
  const detailTenant = active === 'customer-usage-detail' ? pageState.tenants.find(item => item.id === detailParams.get('customer')) : null;
  const detailModel = !canVisit ? null : detailParams.get('view') === 'template' && active === 'model-templates' ? modelMaterial(state, detailParams.get('template')) : null;
  const enterpriseDetailId = canVisit && active === 'tenants' ? (organizationView ? organizationTenant?.id : detailParams.get('enterprise')) : null;
  const detailEnterprise = enterpriseDetailId ? managedEnterpriseTenants(pageState).find(item => item.id === enterpriseDetailId) : null;
  const personalTenant = canVisit && active === 'tenants' ? managedIndividualAccounts(state).find(row => row.tenant.ownerId === detailParams.get('personal'))?.tenant : null;
  const projectTenant = resourceTenant || (organizationView && !detailParams.has('tenant') ? organizationTenant : null);
  const detailProject = active==='projects' && projectTenant && state.projects.find(row=>row.id===detailParams.get('project') && row.tenantId===projectTenant.id);
  const projectName = detailProject && (projectTenant.type==='个人' ? '默认项目' : detailProject.name);
  const breadcrumbs = !canVisit ? [{ label: '无访问权限' }] : adminBreadcrumbs(active, detailParams, { internal:organizationView, onboardingIntent: state.modelOnboardings.find(row=>row.id===detailParams.get('draft'))?.intent, provider: detailProvider?.name, connection: detailConnection && (detailConnection.name || detailConnection.id), model: detailModel?.serviceName || detailModel?.name, deployment: state.deployments.find(item => item.id === detailParams.get('deployment'))?.name, enterprise: detailEnterprise?.name, personal: personalTenant?.name, customer: detailTenant?.name, project:projectName });
  const resourceNames = new Set([detailProvider?.name, detailConnection?.name, detailEnterprise?.name,
    personalTenant?.name, detailTenant?.name, detailModel?.name, detailModel?.serviceName, projectName,
    state.deployments.find(item => item.id === detailParams.get('deployment'))?.name]);
  const breadcrumbLabel = label => english && !resourceNames.has(label) ? channelEnglish(label) : label;
  const detailView = active === 'model-templates'
    ? ['template', 'templateImport'].includes(detailParams.get('view'))
    : ['customer-analysis-detail', 'customer-usage-detail', 'organization-members'].includes(active)
      || active === 'tenants' && detailParams.has('create')
      || breadcrumbs.slice(1, -1).some(({ href }) => href?.split('?')[0] === '#/admin-2/' + active);
  const hasAccount = state.admins.some(account => account.id === state.adminSession?.accountId && account.status === '已启用');
  const showPage = hasAccount && canVisit;
  const channelWorkspace = activeArea === 'channels-reference';
  const moduleTabs = showPage && activeModule?.children.length > 1 && activeModule.id !== 'materials'
    && !(active === 'providers-reference' && detailParams.has('connection')) ? (
      <Tabs className={channelWorkspace ? 'channel-management-tabs' : 'v2-module-tabs'}
        aria-label={english ? channelEnglish(page.areaLabel) : page.areaLabel}
        activeKey={active}
        onChange={channelWorkspace ? id => navigate(channelManagementListRoute(id, new URLSearchParams(location.hash.split('?')[1]))) : navigate}>
        {activeModule.children.map(([id, label]) => {
          const text = english ? channelEnglish(label) : label;
          const Icon = id === 'providers-reference' ? IconList : IconActivity;
          return <Tabs.TabPane key={id} itemKey={id} tab={channelWorkspace
            ? <span className="channel-workspace-tab-label"><Icon size={16} aria-hidden="true"/>{text}</span>
            : text}/>;
        })}
      </Tabs>
    ) : null;
  const workspaceTabs = channelWorkspace ? moduleTabs : null;
  const inferenceDemo = inferenceDemoPages.has(active) && (demoMode === 'inference' || interactiveDemo);
  const renderInferencePage = (inferenceState, demo = false, {
    refresh = refreshRead, interactive = false, infrastructure, dispatch: demoDispatch, changeInfrastructure,
  } = {}) => {
    const save = demo ? demoDispatch : dispatch;
    const demoProps = { inferenceDemo: demo, interactiveDemo: interactive, demoInfrastructure: infrastructure,
      changeDemoInfrastructure: changeInfrastructure };
    if (active === 'clusters') return <ClusterManagement state={inferenceState} params={detailParams}
      dispatch={save} refreshShared={refresh} onNavigate={navigate} dirtyRef={draftDirty} {...demoProps}/>;
    if (active === 'deployments') return <ModelDeployments state={inferenceState} dispatch={save}
      conflict={!demo && conflict} onNavigate={navigate} refreshRead={refresh} {...demoProps}/>;
    return <InfrastructurePage key={active + ':' + detailParams.toString()} pageId={active}
      state={inferenceState} params={detailParams} navigate={navigate} dirtyRef={draftDirty}
      dispatch={save} conflict={!demo && conflict} {...demoProps}/>;
  };
  const canPreviewMenu = hasAccount && !interactiveDemo && canAccessPage(state.currentRole, 'license', license);
  const licenseMenu = license.commercial ? 'commercial' : 'internal';
  const selectedMenu = canPreviewMenu ? menuPreview ?? licenseMenu : licenseMenu;
  const previewingMenu = selectedMenu !== licenseMenu;
  const menuLicense = previewingMenu ? { commercial: selectedMenu === 'commercial' } : license;
  const menuLabel = previewingMenu ? (english ? 'Workbench Navigation Preview' : '后台导航预览') : '后台导航';
  const renderMenu = collapsed => <nav aria-label={menuLabel}>{adminSections.filter(group => group.workspace === currentWorkspace).map(group => {
      const locked = group.id === 'commerce' && !menuLicense.commercial;
      const visibilityLicense = locked ? { ...menuLicense, commercial: true } : menuLicense;
      const items = group.items.filter(item => {
        const target = item.children[0][0];
        if (interactiveDemo && !inferenceDemoPages.has(target)) return false;
        return canAccessPage(state.currentRole, target, visibilityLicense);
      });
      if (!items.length) return null;
      const label = english ? channelEnglish(group.title) : group.title;
      const expanded = sidebarGroups[group.id] ?? (activeGroup === group.id || group.id === 'models' || group.id === 'commerce');
      const grouped = !collapsed && !group.direct;
      const GroupIcon = NAVIGATION_ICONS[items[0].id];
      const sectionId = 'admin-sidebar-group-' + group.id;
      return <section key={group.id} aria-label={label}>
        {grouped && <Button className="v2-sidebar-item v2-sidebar-group" theme="borderless" block
          icon={<GroupIcon size={16} aria-hidden="true"/>} aria-expanded={expanded} aria-controls={sectionId}
          onClick={() => setSidebarGroups(current => ({ ...current, [group.id]: !expanded }))}>
          <span>{label}{locked && '（未授权）'}</span><ChevronRight size={13} className="v2-sidebar-chevron" aria-hidden="true"/>
        </Button>}
        <div className="v2-sidebar-children" id={grouped ? sectionId : undefined} hidden={grouped && !expanded}>
          {items.map(item => {
            const Icon = NAVIGATION_ICONS[item.id];
            const target = item.children[0][0];
            const selected = activeGroup === group.id && activeArea === item.id;
            const text = english ? channelEnglish(item.label) : item.label;
            const collapsedLabel = text + (locked ? '（未授权）' : '');
            return <Button key={target} className={group.direct ? 'v2-sidebar-item' : 'v2-sidebar-item v2-sidebar-item-child'}
              disabled={locked} block icon={grouped ? undefined : <Icon size={16} aria-hidden="true"/>}
              type={selected ? 'primary' : 'tertiary'} theme={selected ? 'light' : 'borderless'}
              aria-current={selected ? 'page' : undefined} aria-label={collapsed ? collapsedLabel : undefined} title={collapsed ? collapsedLabel : undefined} onClick={() => {
                if (previewingMenu && !canAccessPage(state.currentRole, target, license)) {
                  setNotice({ type: 'info', text: english ? 'Preview only. This page requires commercial authorization.' : '仅供预览，该入口需要商业运营授权。' });
                  return;
                }
                navigate(target);
              }}>{collapsed ? null : text}</Button>;
          })}
        </div>
      </section>;
    })}</nav>;
  const renderNavigation = (collapsed = false) => <>
    {!collapsed && <p className="v2-sidebar-title" title={workbenchName}>{workbenchName}</p>}
    <div className="v2-sidebar-workspaces" role="group" aria-label={english ? 'Workbench mode' : '工作台模式'}>
      {allowedWorkspaces.filter(id => !interactiveDemo || id === currentWorkspace).map(id => {
        const label = english ? channelEnglish(WORKSPACES[id]) : WORKSPACES[id];
        const Icon = id === 'operations' ? IconBarChartVStroked : IconSetting;
        return <Button key={id} className="v2-sidebar-workspace" theme="borderless" size="small" block
          aria-pressed={id === currentWorkspace} aria-label={collapsed ? label : undefined}
          title={collapsed ? label : undefined} icon={collapsed ? <Icon size={16} aria-hidden="true"/> : undefined}
          onClick={() => switchWorkspace(id)}>{collapsed ? null : label}</Button>;
      })}
    </div>
    {renderMenu(collapsed)}
  </>;
  useEffect(() => { const media = matchMedia('(min-width: 901px)'); const close = () => { if (media.matches) setNavOpen(false); }; media.addEventListener('change', close); return () => media.removeEventListener('change', close); }, []);
  const alertCount = state.alerts.filter(item => !["已恢复", "已转事件"].includes(item.status)).length;
  const sidebarToggleLabel = sidebarCollapsed ? '展开侧边栏' : '收起侧边栏';
  const renderLanguage = collapsed => <Select className={collapsed ? 'xa24-language-collapsed' : 'xa24-language'}
    placement="top-start" aria-label={english ? 'Language: English' : '语言：简体中文'}
    value={english ? 'en' : 'zh'} onChange={locale => changeLanguage(locale === 'en')}
    optionList={[{ value: 'zh', label: '简体中文' }, { value: 'en', label: 'English' }]}/>;
  return <AdminUIContext.Provider value={true}><div className="admin-v2 xa24-shell">
    <XaToastRegion/>
    {bannerTarget && createPortal(<>
      <span className="xa24-mobile-nav"><Button className="admin-nav-toggle" type="tertiary" theme="borderless"
        icon={<IconMenu size={16} aria-hidden="true"/>} aria-label="展开后台导航" aria-haspopup="dialog"
        aria-expanded={navOpen} onClick={() => setNavOpen(true)}/></span>
      {canPreviewMenu && <div className="admin-banner-field">
        <span id="admin-menu-preview-label">{english ? channelEnglish('菜单模拟') : '菜单模拟'}</span>
        <Select size="small" aria-labelledby="admin-menu-preview-label" value={selectedMenu}
          optionList={Object.entries(LICENSE_NAMES).map(([value,label])=>({ value,label:english ? channelEnglish(label) : label }))}
          onChange={value => setMenuPreview(value === licenseMenu ? null : value)}/>
      </div>}
      <span className="xa24-alert-count" role="img" aria-label={`${alertCount} 条待处理告警`}>
        <IconBellStroked size={16} aria-hidden="true"/>{alertCount > 0 && <span aria-hidden="true">{alertCount}</span>}
      </span>
    </>, bannerTarget)}
    {!navOpen && <aside className="v2-sidebar-desktop xa24-sidebar" data-collapsed={sidebarCollapsed}>
      <div id="admin-desktop-navigation" className="v2-sidebar">{renderNavigation(sidebarCollapsed)}</div>
      <div className="v2-sidebar-footer">
        {renderLanguage(sidebarCollapsed)}
        <Button className="v2-sidebar-toggle" type="tertiary" theme="borderless"
          icon={sidebarCollapsed ? <IconDoubleChevronRight size={16} aria-hidden="true"/> : <IconDoubleChevronLeft size={16} aria-hidden="true"/>}
          title={sidebarToggleLabel}
          aria-label={sidebarToggleLabel} aria-controls="admin-desktop-navigation" aria-expanded={!sidebarCollapsed}
          onClick={() => setSidebarCollapsed(collapsed => !collapsed)}/>
      </div>
    </aside>}
    <div className="v2-content xa24-main" data-admin-layout={detailView ? 'detail' : 'entry'}>
      {detailView && <header className="admin-context-bar">
        <div className="admin-breadcrumb">
          <nav aria-label="面包屑"><ol className="xa24-breadcrumbs">{breadcrumbs.map(({ label, href }, index) => (
            <li key={index}>{href ? <a data-model-list-breadcrumb data-admin-breadcrumb href={href}>{breadcrumbLabel(label)}</a> : <span title={breadcrumbLabel(label)} aria-current={index === breadcrumbs.length - 1 ? 'page' : undefined}>{breadcrumbLabel(label)}</span>}</li>
          ))}</ol></nav>
          {detailTenant && <Typography.Text type="tertiary" size="small" className="us-breadcrumb-meta">{detailTenant.id} · {detailTenant.type} · {detailTenant.status}</Typography.Text>}
        </div>
      </header>}
      {notice && <div className="xa24-shell-notice"><Banner type={notice.type} description={notice.text}/></div>}
      {!interactiveDemo && state.storageError && <Banner type="danger" closeIcon={null} description={<>本地数据异常：{state.storageError.toLowerCase().includes('quota') ? '浏览器本地存储空间不足，原数据未更改。' : state.storageError} <Button onClick={reload}>重新加载</Button></>}/>}
      {!interactiveDemo && conflict && <Banner type="warning" closeIcon={null} description={<>检测到其他页面的新版本数据。 <Button onClick={reload}>载入新版本</Button></>}/>}
      {showPage && !organizationView && commercialPage(active) && active !== 'tenants' && commerceReadOnly && <Banner type="warning" closeIcon={null} description={license.status === 'expired' ? '商业运营授权已到期，可查阅已保存的记录。' : '商业运营授权不可用，可查阅已保存的记录。'}/>}
      {!channelWorkspace && moduleTabs}
      <main data-admin-page={active}>
        <AdminPageBoundary key={interactiveDemo ? demoMode : active}>
          {!hasAccount ? <Banner title="后台账号不可用" description={<a href="#/auth/login">重新登录</a>} closeIcon={null}/> : !canVisit ? (
            <Banner type="warning" title="无访问权限" description={<Button onClick={() => navigate(WORKSPACE_HOME[allowedWorkspaces[0]] || 'dashboard')}>返回首页</Button>} closeIcon={null}/>
          ) : interactiveDemo && !inferenceDemo ? <Banner type="info" title="此页面不在可操作演示范围内" closeIcon={null}
            description={<Button onClick={() => navigate('deployments')}>返回可操作演示</Button>}/>
          : organizationView && !organizationTenant ? <Banner type="warning" title="尚未配置默认政企租户" closeIcon={null}/> : <Suspense fallback={<AdminPageLoading label={pages[active].label}/>}>
            {active === "model-operations-guide" ? <ModelOperationsGuide english={english}/>
            : active === "model-operations-requirements" ? <ModelOperationsRequirements english={english}/>
            : active === "dashboard" ? <OperationsOverview state={factState} workbenchName={workbenchName} onNavigate={navigate}
              shortcuts={overviewShortcuts.filter(({ id }) => canAccessPage(state.currentRole, id, license))}/>
            : ["usage-analysis", "user-analysis"].includes(active) ? <AnalyticsPages pageId={active} state={factState}/>
            : active === 'model-performance' ? <ModelPerformancePage state={factState}/>
            : ['customer-analysis', 'customer-analysis-detail'].includes(active) ? <CustomerAnalysis key={active + detailParams.toString()} detail={active === 'customer-analysis-detail'} params={detailParams}/>
            : active === 'customer-usage-detail' ? <CustomerUsageDetail state={pageState}/>
            : active === "admins" ? <AdminAccounts state={state} transact={transactAdminAccount} conflict={conflict}/>
            : active === 'audit-logs' ? <AuditLogsPage key={state.adminSession.accountId + ':' + detailParams.toString()}
              accountId={state.adminSession.accountId} params={detailParams} tenants={state.tenants} projects={state.projects}/>
            : active === 'site-configuration' ? <SiteConfiguration key={state.adminSession.accountId} dirtyRef={draftDirty}/>
            : active === 'announcements' ? <AnnouncementManagement key={state.adminSession.accountId}
              accountId={state.adminSession.accountId} dirtyRef={draftDirty}/>
            : active === 'site-agreements' ? <SiteAgreementsEditor key={state.adminSession.accountId} dirtyRef={draftDirty} readOnly={commerceReadOnly}/>
            : active === 'global-routing' ? <GlobalRouting saved={state.globalRoutingParameters} revision={state.revision} transact={transact} conflict={conflict} dirtyRef={draftDirty}/>
            : active === 'license' ? <LicensePage license={license}/>
            : active === 'business-analysis' ? <CommerceAnalysis state={state}/>
            : active === "model-market" ? <ModelMarket state={state} transact={transactModel} conflict={conflict} internal={internalSite}/>
            : active === "model-prices" ? <ModelPrices state={state} transact={transactModel} conflict={conflict} reload={reload} readOnly={commerceReadOnly}/>
            : active === "tariff-dictionary" ? <MaterialDictionaryPage state={state} transact={transactModel} conflict={conflict}/>
            : active === 'providers-reference' ? <ChannelManagementNew state={state} transact={transactModel} conflict={conflict} reload={reload}
              workspaceTabs={workspaceTabs}/>
            : active === 'provider-materials' ? <ProviderMaterials state={state} transact={transactModel} conflict={conflict} reload={reload}/>
            : active === 'model-templates' ? <ModelMaterials state={state} transact={transactModel} conflict={conflict} reload={reload}/>
            : active === 'listing-new' ? <ModelServicesNew state={factState} params={detailParams} dirtyRef={draftDirty} sourceConflict={conflict} reloadWorkspace={reload}/>
            : active === 'model-links' ? <ModelLinks/>
            : active === "package-data" ? <PackageData state={state} params={detailParams} refreshRead={refreshRead}/>
            : active === "package-production" ? <PackageProduction state={state} transact={transact} conflict={conflict} params={detailParams} dirty={draftDirty}/>
            : active === 'traffic-limits' ? <TrafficOperations key={state.adminSession.accountId} state={state} dirtyRef={draftDirty}/>
            : active === "tenants" ? <CustomerPage key={organizationView ? 'organization' : 'customers'} state={pageState} transact={transact} transactIndividual={transactIndividual} reload={reload} conflict={conflict} dirtyRef={draftDirty} internal={organizationView}/>
            : active === 'projects' ? <AdminProjects state={pageState} params={detailParams} internal={internalSite}
              reload={reload} conflict={conflict} dirtyRef={draftDirty}/>
            : active === 'organization-members' ? <TenantResources key={resourceTenant?.id}
              tenantId={resourceTenant?.id} tenantName={resourceTenant?.name} tab={detailParams.get('tab')}
              returnHref={resourceTenant && tenantHref(resourceTenant,{tab:'organization'})}
              onTabChange={tab=>navigate(active + '?' + new URLSearchParams({tenant:resourceTenant.id,tab}))}/>
            : active === 'routes' ? <GatewayRouteSettings state={state} dispatch={dispatch} refreshRead={refreshRead}/>
            : ["providers-health", "logs"].includes(active) ? <ObservabilityPage pageId={active} params={detailParams}
              state={factState} dispatch={dispatch} navigate={navigate} simulation={logSimulation} setSimulation={setLogSimulation} refreshRead={refreshRead}
              canViewFullLog={state.currentRole === '平台管理员'} workspaceTabs={workspaceTabs}/>
            : inferenceDemo ? <InferenceDemo key={state.currentRole} role={state.currentRole} interactive={interactiveDemo}>
              {(...args) => <AdminPageBoundary key={active}>{renderInferencePage(...args)}</AdminPageBoundary>}
            </InferenceDemo>
            : inferenceDemoPages.has(active) || isInfrastructurePage(active) ? renderInferencePage(state)
            : <BusinessOperationsPage key={active} pageId={active} state={state} params={detailParams} dispatch={dispatch}/>}
          </Suspense>}
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
