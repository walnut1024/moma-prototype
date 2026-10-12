import { useCalcloudConfig } from './CalcloudUI';
import { TooltipProvider } from '../components/ui/tooltip';
import { BaseModelsPage, ModelProvidersPage, TrafficManagementPage, ModelRoutingPage } from './CalcloudConfigPages';
import { CostAnalysisPage, CustomerAnalysisPage, ProviderAnalysisPage, ModelAnalysisPage, BusinessCallStatisticsPage, PerformanceStatisticsPage, ErrorStatisticsPage } from './CalcloudAnalyticsPages';
import './calcloud.css';
export { CALCLOUD_PAGE_IDS } from './calcloud-domain.mjs';
const configPages = { 'base-models':BaseModelsPage, 'model-providers':ModelProvidersPage, 'traffic-management':TrafficManagementPage, 'model-routing':ModelRoutingPage };
const analyticsPages = { 'cost-analysis':CostAnalysisPage, 'customer-analysis':CustomerAnalysisPage, 'provider-analysis':ProviderAnalysisPage, 'model-analysis':ModelAnalysisPage, 'business-call-statistics':BusinessCallStatisticsPage, 'performance-statistics':PerformanceStatisticsPage, 'error-statistics':ErrorStatisticsPage };
function ConfigurationPage({ Component, state, params }) {
  const store = useCalcloudConfig(state);
  return <>{store.banner}{store.config && <Component {...store} state={state} params={params}/>}</>;
}
export default function CalcloudIntegrationPage({ page, state, params }) {
  const Config = configPages[page.id], Analytics = analyticsPages[page.id];
  return <TooltipProvider><div className="cc-page" aria-label={`${page.label}页面`}>{Config ? <ConfigurationPage Component={Config} state={state} params={params}/> : <Analytics state={state}/>}</div></TooltipProvider>;
}
