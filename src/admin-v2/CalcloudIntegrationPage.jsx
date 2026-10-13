import { useEffect, useMemo } from 'react';
import { calcloudAnalyticsState } from './calcloud-domain.mjs';
import { useCalcloudConfig } from './CalcloudUI';
import { TooltipProvider } from '../components/ui/tooltip';
import { BaseModelsPage, ModelProvidersPage, TrafficManagementPage, ModelRoutingPage } from './CalcloudConfigPages';
import { CostAnalysisPage, CustomerAnalysisPage, ProviderAnalysisPage, ModelAnalysisPage, BusinessCallStatisticsPage, PerformanceStatisticsPage, ErrorStatisticsPage } from './CalcloudAnalyticsPages';
import './calcloud.css';
export { CALCLOUD_PAGE_IDS } from './calcloud-domain.mjs';
const configPages = { 'base-models':BaseModelsPage, 'model-providers':ModelProvidersPage, 'traffic-management':TrafficManagementPage, 'model-routing':ModelRoutingPage };
const analyticsPages = { 'cost-analysis':CostAnalysisPage, 'customer-analysis':CustomerAnalysisPage, 'provider-analysis':ProviderAnalysisPage, 'model-analysis':ModelAnalysisPage, 'business-call-statistics':BusinessCallStatisticsPage, 'performance-statistics':PerformanceStatisticsPage, 'error-statistics':ErrorStatisticsPage };
export default function CalcloudIntegrationPage({ page, state, params, observation }) {
  useEffect(()=>{window.scrollTo({top:0,behavior:'instant'});document.querySelector('.v2-content > main')?.scrollTo({top:0});},[page.id,params.get('edit'),params.get('detail')]);
  const store=useCalcloudConfig(state);
  const analyticsState=useMemo(()=>store.config?calcloudAnalyticsState(state,store.config):null,[state,store.config]);
  const Config = configPages[page.id], Analytics = analyticsPages[page.id];
  return <TooltipProvider><div className="cc-page" aria-label={`${page.label}页面`}>{store.banner}{store.config&&(Config ? <Config {...store} state={state} params={params}/> : <Analytics state={analyticsState} observation={observation}/>)}</div></TooltipProvider>;
}
