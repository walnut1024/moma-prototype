import { useEffect, useMemo, useRef, useState } from 'react';
import { Banner, Button, Card, Space, Typography } from '@douyinfe/semi-ui';
import AdminPageHeading from './AdminPageHeading';
import ChannelHealthTable from './ChannelHealthTable';
import { Choice } from './ServiceUI';
import { FilterReset, FilterToolbar } from '../components/FilterControls';
import { chartPalette } from '../components/chart-style.mjs';
import { ObservationFilterGroup, ObservationFilterLayout, ObservationPick, ObservationPlot, ObservationSupplyPick,
  ObservationTimeRange, useObservationSupply } from './CallObservationControls';
import { channelHealthObservationFilters, channelHealthPerformance, channelHealthRows } from './channel-health-observations.mjs';
import { useChannelText } from './channel-language';
import { cloudAdminRequest } from './admin-client.mjs';
import { canAccessPage, channelManagementListRoute } from './navigation.mjs';
import { createCallLogSimulation } from './call-log-simulation.mjs';
import { callObservations, defaultObservationGrain, filterObservations, observationBuckets, observationGrains,
  observationGroups, observationHash, observationWindow } from './call-observations.mjs';

const { Title } = Typography;
const emptyCatalogue = [];
const filtersShown = [['endpoint', '端点'], ['callId', '模型 ID']];
const pageId = 'providers-health';

export default function ChannelHealthPage({ state, params, simulation, setSimulation }) {
  const t = useChannelText();
  const updateObservationRoute = hash => {
    const [path, query] = hash.split('?');
    history.replaceState(history.state, '', channelManagementListRoute(path, params, query));
  };
  const [statusFilter, setStatusFilter] = useState('');
  const [healthFilter, setHealthFilter] = useState('');
  const [filters, setFilters] = useState(() => channelHealthObservationFilters(params));
  const [grain, setGrain] = useState(() => params.get('grain'));
  const [trendGroupId, setTrendGroupId] = useState(null);
  const trendPanel = useRef(null);
  const realFilters = useRef(null);
  const source = simulation?.data ?? state;
  const { attempts } = useMemo(() => callObservations(source), [source]);
  const [liveCatalogue, setCatalogue] = useState(emptyCatalogue);
  const catalogue = simulation ? simulation.channelTrendCatalogue ?? emptyCatalogue : liveCatalogue;
  const [catalogueError, setCatalogueError] = useState('');
  const [loadingCatalogue, setLoadingCatalogue] = useState(!simulation);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    setCatalogue(emptyCatalogue);
    setCatalogueError('');
    setLoadingCatalogue(!simulation);
    if (simulation) return;
    const controller = new AbortController();
    cloudAdminRequest('/channel-health', { signal: controller.signal }).then(({ catalogue }) => {
      if (!controller.signal.aborted) setCatalogue(catalogue);
    }).catch(error => {
      if (!controller.signal.aborted) setCatalogueError(error.message);
    }).finally(() => { if (!controller.signal.aborted) setLoadingCatalogue(false); });
    return () => controller.abort();
  }, [simulation, retry]);
  const supplyOptions = useMemo(() => [...attempts, ...catalogue], [attempts, catalogue]);
  const supply = useObservationSupply(supplyOptions, filters.supply);
  const window = useMemo(() => observationWindow(filters), [filters, attempts]);
  const grains = observationGrains(window);
  const granularity = grains.some(([id]) => id === grain) ? grain : defaultObservationGrain(filters, window);
  const rows = useMemo(() => filterObservations(attempts, filters, window), [attempts, filters, window]);
  const buckets = useMemo(() => observationBuckets(rows, window, granularity), [rows, window, granularity]);
  const labels = buckets.map(bucket => bucket.label);
  const grouped = useMemo(() => observationGroups(rows, 'channelModel'), [rows]);
  const healthRows = useMemo(() => channelHealthRows(catalogue, grouped, filters, attempts), [catalogue, grouped, filters, attempts]);
  const visibleHealthRows = healthRows.filter(row => (!statusFilter || statusFilter === row.enabledLabel) &&
    (!healthFilter || healthFilter === row.health));
  const trendGroup = grouped.find(group => group.id === trendGroupId);
  const summaries = buckets.map(bucket => new Map(observationGroups(bucket.rows, 'channelModel')
    .map(group => [group.id, channelHealthPerformance(group.rows)])));
  const trendName = trendGroup && (grouped.some(group => group.id !== trendGroup.id && group.name === trendGroup.name)
    ? trendGroup.name + ' · ' + trendGroup.id : trendGroup.name);
  const trendSeries = field => [{ label: trendName, color: chartPalette[0],
    values: summaries.map(item => item.get(trendGroup.id)?.[field] ?? null) }];
  const change = patch => {
    setTrendGroupId(null);
    const next = { ...filters, ...patch };
    setFilters(next);
    if (patch.period) setGrain(null);
    if (!simulation) updateObservationRoute(observationHash(pageId, next,
      { grain: patch.period ? null : granularity, groupBy: 'channelModel' }));
  };
  const reset = () => {
    setTrendGroupId(null);
    setFilters(channelHealthObservationFilters());
    setGrain(null);
    setStatusFilter('');
    setHealthFilter('');
  };
  const toggleSimulation = () => {
    reset();
    if (simulation) {
      if (realFilters.current) {
        setFilters(realFilters.current.filters);
        setGrain(realFilters.current.grain);
        setStatusFilter(realFilters.current.statusFilter);
        setHealthFilter(realFilters.current.healthFilter);
      }
      setSimulation(null);
    } else {
      realFilters.current = { filters, grain, statusFilter, healthFilter };
      const session = createCallLogSimulation(Date.now(), { channelTrend: true });
      if (session.channelTrendFilters) setFilters({ ...channelHealthObservationFilters(), ...session.channelTrendFilters });
      setSimulation(session);
    }
  };
  const resetFromToolbar = () => {
    reset();
    if (!simulation) updateObservationRoute('#/admin-2/' + pageId);
  };
  const filterPanel = <div className="admin-analytics-fields">
    <FilterToolbar><ObservationTimeRange filters={filters} window={window} onChange={change}/></FilterToolbar>
    <ObservationFilterLayout actions={<FilterReset label={t('重置筛选')} onClick={resetFromToolbar}/>} primary={<>
      <ObservationSupplyPick {...supply} onChange={change}/>
      <ObservationPick dimension="upstreamModelId" label="上游模型" rows={supplyOptions} filters={filters} onChange={change}/>
      <Choice label={t('状态')} size="small" value={statusFilter}
        options={['', '已启用', '已停用'].map(value => [value, t(value || '全部状态')])} onChange={setStatusFilter}/>
      <Choice label={t('健康度')} size="small" value={healthFilter}
        options={['', '异常', '健康', '样本不足', '暂无观测'].map(value => [value, t(value || '全部健康度')])} onChange={setHealthFilter}/>
    </>}>
      <ObservationFilterGroup label={t('模型与连接')}>
        {filtersShown.filter(([dimension]) => dimension !== 'endpoint' || filters.endpoint != null)
          .map(([dimension, label]) => <ObservationPick key={dimension} dimension={dimension} label={label}
            rows={attempts} filters={filters} onChange={change}/>)}
      </ObservationFilterGroup>
    </ObservationFilterLayout>
  </div>;
  return <div className="admin-page-stack">
    <AdminPageHeading title={t('连接健康')}>
      <Space wrap><Button theme="light" onClick={toggleSimulation}>{t(simulation ? '退出模拟' : '模拟数据')}</Button></Space>
    </AdminPageHeading>
    {!window && <Card>{filterPanel}</Card>}
    {catalogueError && <Banner type="danger" closeIcon={null} description={<Space>连接清单加载失败：{catalogueError}
      <Button size="small" onClick={() => setRetry(value => value + 1)}>重新加载</Button></Space>}/>}
    {!window ? <Banner type="danger" closeIcon={null} description="请选择不超过 365 天的有效时间范围。"/> :
      <div className="admin-page-stack">
        <Card title={<Title heading={5} component="h2">{t('上游模型观测列表')}</Title>} headerExtraContent={
          <Choice label={t('对比分组')} value="channelModel" options={[[ 'channelModel', t('按上游模型') ]]}/>
        }>
          <div className="channel-health-filters">{filterPanel}</div>
          <ChannelHealthTable loading={loadingCatalogue} rows={visibleHealthRows} labels={labels} summaries={summaries}
            simulated={Boolean(simulation)} canManageChannels={canAccessPage(state.currentRole, 'providers-reference')}
            onTrend={id => {
              setTrendGroupId(id);
              requestAnimationFrame(() => trendPanel.current?.focus());
            }}/>
        </Card>
        {trendGroup && <section ref={trendPanel} tabIndex={-1} aria-label="上游模型趋势" className="admin-page-stack">
          <div className="channel-health-trend-heading">
            <Title heading={5} component="h2">{trendName} 趋势</Title>
            <Button size="small" theme="borderless" onClick={() => setTrendGroupId(null)}>{t('查看全部')}</Button>
          </div>
          <div className="admin-analysis-plot-grid">
            <ObservationPlot title="TTFT (P50) 趋势" labels={labels} unit="ms" series={trendSeries('ttft')}/>
            <ObservationPlot title="吞吐量 (P50) 趋势" labels={labels} unit="Token/s" series={trendSeries('otps')}/>
            <ObservationPlot title="缓存命中率趋势" labels={labels} unit="%" domain={[0, 100]} series={trendSeries('cacheRate')}/>
          </div>
        </section>}
      </div>}
  </div>;
}
