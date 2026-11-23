import { useChannelText } from './channel-language';
import { channelManagementListRoute } from './navigation.mjs';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Banner, Button, Card, Empty, Space, Tag, Typography } from '@douyinfe/semi-ui';
import Table from './AdminTable';
import AdminStatus from './AdminStatus';
import AdminPageHeading from './AdminPageHeading';
import RequestLogDetail from './RequestLogDetail';
import { Choice } from './ServiceUI';
import { DEFAULT_PAGE_SIZE, FilterReset, FilterToolbar } from '../components/FilterControls';
import { chartPalette } from '../components/chart-style.mjs';
import { ObservationFilterGroup, ObservationFilterLayout, ObservationPick, ObservationPlot, ObservationSupplyPick,
  ObservationTimeRange, useObservationSupply } from './CallObservationControls';
import ChannelHealthTable from './ChannelHealthTable';
import { channelHealthPerformance, channelHealthRows } from './channel-health-observations.mjs';
import { cloudAdminRequest } from './admin-client.mjs';
import { canAccessPage, monitoringLinks } from './navigation.mjs';
import { createCallLogSimulation } from './call-log-simulation.mjs';
import {
  attemptCapacity, attemptPerformance, attemptsForMetric, callObservations, changeObservationTenant,
  compareLogRows, defaultObservationGrain, filterObservations, httpLabel,
  observationBuckets, observationFilters, observationGrains, observationGroups, observationHash, observationKey,
  observationNumber as fmt, observationTime, observationWindow, outcomes,
} from './call-observations.mjs';

const { Title, Text } = Typography;
const emptyCatalogue = [];
const customerPurpose = ['customer'];
const filtersShown = [['endpoint', '端点'], ['callId', '模型调用标识']];
const capacityOptions = [['Rpm', 'RPM'], ['Tpm', 'TPM']];
const metricLabels = { failed: '全部失败', rateLimit: '上游 429', timeout: '超时', fallback: '回退', ttft: '已采集首 Token', otps: '已采集输出速率' };
const pct = value => value == null ? '—' : fmt(value) + '%';
const metricValue = (value, unit) => value == null ? '—' : fmt(value) + (unit ? ' ' + unit : '');

function MonitoringSummary({ metrics }) {
  return <Card className="admin-monitor-summary">
    <dl>
      {metrics.map(([label, value, note]) => <div key={label}>
        <dt>{label}</dt><dd>{value}</dd>
        {note && <dd className="admin-monitor-sample-count">{note}</dd>}
      </div>)}
    </dl>
  </Card>;
}

export default function ServiceMonitoringPage({ pageId, state, navigate, params, simulation, setSimulation, canViewFullLog }) {
  const t = useChannelText();
  const updateObservationRoute = hash => {
    const [path, query] = hash.split('?');
    history.replaceState(history.state, '', pageId === 'providers-health' ? channelManagementListRoute(path, params, query) : hash);
  };
  const healthPage = pageId === 'providers-health';
  const [statusFilter, setStatusFilter] = useState('');
  const [healthFilter, setHealthFilter] = useState('');
  const [filters, setFilters] = useState(() => observationFilters(params, '24h', simulation ? null : customerPurpose));
  const [grain, setGrain] = useState(() => params.get('grain'));
  const [capacity, setCapacity] = useState('Rpm');
  const [scope, setScope] = useState(null);
  const [trendGroupId, setTrendGroupId] = useState(null);
  const [selectedAttempt, setSelectedAttempt] = useState(null);
  const detailId = useId();
  const detailPanel = useRef(null);
  const detailTrigger = useRef(null);
  const trendPanel = useRef(null);
  const realFilters = useRef(null);
  const source = simulation?.data ?? state;
  const { requests, attempts } = useMemo(() => callObservations(source), [source]);
  const parents = useMemo(() => new Map(requests.map(row => [row.id, row])), [requests]);
  const selectedRequest = parents.get(selectedAttempt?.parentId);
  const [liveCatalogue, setCatalogue] = useState(emptyCatalogue);
  const catalogue = simulation ? simulation.channelTrendCatalogue ?? emptyCatalogue : liveCatalogue;
  const [catalogueError, setCatalogueError] = useState('');
  const [loadingCatalogue, setLoadingCatalogue] = useState(healthPage && !simulation);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    setCatalogue(emptyCatalogue);
    setCatalogueError('');
    setLoadingCatalogue(healthPage && !simulation);
    if (!healthPage || simulation) return;
    const controller = new AbortController();
    cloudAdminRequest('/channel-health', { signal: controller.signal }).then(({ catalogue }) => {
      if (!controller.signal.aborted) setCatalogue(catalogue);
    }).catch(error => {
      if (!controller.signal.aborted) setCatalogueError(error.message);
    }).finally(() => { if (!controller.signal.aborted) setLoadingCatalogue(false); });
    return () => controller.abort();
  }, [healthPage, simulation, retry]);
  const supplyOptions = useMemo(() => [...attempts, ...catalogue], [attempts, catalogue]);
  const supply = useObservationSupply(supplyOptions, filters.supply);
  const window = useMemo(() => observationWindow(filters), [filters, attempts]);
  const grains = observationGrains(window);
  const granularity = grains.some(([id]) => id === grain) ? grain : defaultObservationGrain(filters, window);
  const projectRows = useMemo(() => attempts.filter(row => filters.tenant == null
    || filters.tenant.includes(observationKey(row, 'tenant'))), [attempts, filters.tenant]);
  const rows = useMemo(() => filterObservations(attempts, filters, window), [attempts, filters, window]);
  const buckets = useMemo(() => observationBuckets(rows, window, granularity), [rows, window, granularity]);
  const labels = buckets.map(bucket => bucket.label);
  const grouped = useMemo(() => healthPage ? observationGroups(rows, 'channelModel') : [], [rows, healthPage]);
  const healthRows = useMemo(() => healthPage ? channelHealthRows(catalogue, grouped, filters, attempts) : [],
    [healthPage, catalogue, grouped, filters, attempts]);
  const visibleHealthRows = healthRows.filter(row => (!statusFilter || statusFilter === row.enabledLabel) &&
    (!healthFilter || healthFilter === row.health));
  const names = new Map();
  for (const group of grouped) names.set(group.name, (names.get(group.name) || 0) + 1);
  const seriesName = group => names.get(group.name) > 1 ? group.name + ' · ' + group.id : group.name;
  const trendGroup = grouped.find(group => group.id === trendGroupId);
  const trendGroups = trendGroup ? [trendGroup] : grouped;
  const selectedGroup = scope?.groupId == null ? null : grouped.find(group => group.id === scope.groupId);
  const scopedRows = scope?.groupId == null ? rows : selectedGroup?.rows ?? [];
  const evidenceRows = scope ? attemptsForMetric(scope.range
    ? scopedRows.filter(row => row.at >= scope.range.start && row.at < scope.range.end)
    : scopedRows, scope.metric).toSorted((a, b) => compareLogRows(a, b, 'at', -1)) : [];
  const summaries = !healthPage ? [] : buckets.map(bucket => new Map(observationGroups(bucket.rows, 'channelModel')
    .map(group => [group.id, channelHealthPerformance(group.rows)])));
  const groupedSeries = (field, empty = null) => trendGroups.map((group, index) => ({ label: seriesName(group),
    color: chartPalette[index % chartPalette.length], values: summaries.map(item => item.get(group.id)?.[field] ?? empty) }));
  const capacityStats = buckets.map(bucket => attemptCapacity(bucket.rows, bucket));
  const capacitySeries = [['平均', 'average'], ['分钟峰值', 'peak']].map(([label, prefix]) =>
    ({ label: label + ' ' + capacity.toUpperCase(), values: capacityStats.map(stats => stats[prefix + capacity]) }));
  const performance = attemptPerformance(rows);
  const performanceBuckets = !healthPage ? buckets.map(bucket => attemptPerformance(bucket.rows)) : [];
  const lastAttemptAt = rows.reduce((latest, row) => Math.max(latest, row.at), -Infinity);
  const change = patch => {
    setScope(null);
    setTrendGroupId(null);
    const next = { ...filters, ...patch };
    setFilters(next);
    if (patch.period) setGrain(null);
    if (!simulation) updateObservationRoute(observationHash(pageId, next, { grain: patch.period ? null : granularity, groupBy: healthPage ? 'channelModel' : null }));
  };
  const reset = (purpose = simulation ? null : customerPurpose) => {
    setScope(null); setTrendGroupId(null); setFilters(observationFilters(undefined, '24h', purpose)); setGrain(null);
    setStatusFilter(''); setHealthFilter('');
  };
  const toggleSimulation = () => {
    setSelectedAttempt(null);
    reset(simulation ? customerPurpose : null);
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
      const session = createCallLogSimulation(Date.now(), { channelTrend: healthPage });
      if (session.channelTrendFilters) {
        setFilters({ ...observationFilters(), ...session.channelTrendFilters });
      }
      setSimulation(session);
    }
  };
  const drill = (next, trigger = document.activeElement) => {
    detailTrigger.current = trigger;
    setScope(next);
    requestAnimationFrame(() => detailPanel.current?.focus());
  };
  const closeEvidence = () => {
    setScope(null);
    detailTrigger.current?.focus();
  };
  const attemptColumns = [
    { title: 'Request ID', dataIndex: 'requestId', width: 185, fixed: 'left', render: (value, attempt) => <>
      <Button theme="borderless" size="small" className="admin-log-request-id"
        aria-label={`查看请求详情 ${value ?? ''} 第 ${attempt.index} 次尝试`}
        onClick={() => setSelectedAttempt(attempt)}>{value ?? '查看详情'}</Button>
      <div><Text type="tertiary" size="small">第 {attempt.index} 次</Text></div>
    </> },
    { title: '发起时间', dataIndex: 'at', width: 168, render: observationTime },
    { title: '实际连接', dataIndex: 'channelName', width: 148, render: value => value ?? '未采集' },
    { title: '上游模型', dataIndex: 'upstreamModelId', width: 160, render: value => value ?? '未采集' },
    { title: '上游结果', dataIndex: 'outcome', width: 140, render: (value, attempt) => <>
      <AdminStatus value={outcomes[value]}/>
      <div><Text type="tertiary" size="small">{attempt.status > 0 ? 'HTTP ' + attempt.status : httpLabel(attempt.status)}</Text></div>
    </> },
    { title: '耗时', dataIndex: 'duration', width: 95, render: value => value == null ? '未采集' : fmt(value) + ' ms' },
    { title: '失败原因', dataIndex: 'errorReason', width: 212, ellipsis: { showTitle: true },
      render: (value, attempt) => value ?? attempt.code ?? (attempt.outcome === 'failed' ? '未采集' : '—') },
    { title: '请求最终结果', width: 125, render: (_, attempt) => <AdminStatus value={outcomes[parents.get(attempt.parentId)?.outcome] ?? '未采集'}/> },
  ];
  const evidenceWindow = scope?.range ?? window;
  const chooseBucket = (index, metric) => { if (buckets[index]) drill({ range: buckets[index], metric }); };
  const performanceTrend = (title, field, unit, metric = field, domain) =>
    <ObservationPlot title={title} labels={labels} unit={unit} domain={domain}
      series={[{ label: title, values: performanceBuckets.map(stats => stats[field]) }]}
      onChoose={index => chooseBucket(index, metric)}/>;
  const capacityPlot = <ObservationPlot title="容量趋势" labels={labels} unit={capacity === 'Rpm' ? '次/分钟' : 'Token/分钟'}
    actions={<Choice label="容量指标" value={capacity} options={capacityOptions} onChange={setCapacity}/>}
    series={capacitySeries} onChoose={index => chooseBucket(index)}/>;
  const attemptDetails = scope && window && <section ref={detailPanel} id={detailId} tabIndex={-1} aria-label="上游尝试明细">
    <Card className="admin-monitor-attempt-detail" title={<Title heading={5} component="h2">上游尝试明细</Title>}
      headerExtraContent={<Button theme="borderless" size="small" onClick={closeEvidence}>收起明细</Button>}>
      <div className="admin-analytics-fields">
        <Space wrap>
          {selectedGroup && <Tag>{seriesName(selectedGroup)}</Tag>}
          {scope.metric && <Tag>{metricLabels[scope.metric]}</Tag>}
          <Text type="secondary">{observationTime(evidenceWindow.start)} 至 {observationTime(evidenceWindow.end)} · 北京时间</Text>
          <Text role="status">匹配 {fmt(evidenceRows.length)} 条</Text>
        </Space>
        <Table key={JSON.stringify([scope.groupId, scope.metric, scope.range?.start])} rowKey="id" dataSource={evidenceRows}
          columns={attemptColumns} pagination={evidenceRows.length > DEFAULT_PAGE_SIZE ? { pageSize: DEFAULT_PAGE_SIZE } : false}
          empty="所选范围暂无对应尝试" scroll={{ x: 'max(100%, 1233px)' }}/>
      </div>
    </Card>
  </section>;
  const resetFromToolbar = () => {
    reset();
    if (!simulation) updateObservationRoute('#/admin-2/' + pageId);
  };
  const requestFilters = <>
    <ObservationPick dimension="tenant" label="客户" rows={attempts} filters={filters}
      onChange={({ tenant }) => change(changeObservationTenant(attempts, filters, tenant))}/>
    <ObservationPick dimension="project" label="项目" rows={projectRows} filters={filters} onChange={change}/>
    <ObservationPick dimension="purpose" label="调用类型" rows={attempts} filters={filters} onChange={change}/>
  </>;
  const filterPanel = <div className="admin-analytics-fields">
    <FilterToolbar>
      <ObservationTimeRange filters={filters} window={window} onChange={change}>
        {!healthPage && <Choice label="统计粒度" value={granularity} options={grains} onChange={value => { setScope(null); setGrain(value); }}/>}
      </ObservationTimeRange>
      {!healthPage && <FilterReset onClick={resetFromToolbar}/>}
    </FilterToolbar>
    <ObservationFilterLayout actions={healthPage ? <FilterReset onClick={resetFromToolbar}/> : undefined} primary={<>
      {!healthPage && requestFilters}
      <ObservationSupplyPick {...supply} onChange={change}/>
      <ObservationPick dimension="upstreamModelId" label="上游模型" rows={supplyOptions} filters={filters} onChange={change}/>
      {healthPage && <>
        <Choice label="状态" size="small" value={statusFilter}
          options={['', '已启用', '已停用'].map(value => [value, value || '全部状态'])} onChange={setStatusFilter}/>
        <Choice label="健康状态" size="small" value={healthFilter}
          options={['', '异常', '健康', '样本不足', '暂无观测'].map(value => [value, value || '全部健康状态'])} onChange={setHealthFilter}/>
      </>}
    </>}>
      <ObservationFilterGroup label={healthPage ? '请求范围' : '模型与连接'}>
        {healthPage && requestFilters}
        {filtersShown.filter(([dimension]) => !healthPage || dimension !== 'endpoint' || filters.endpoint != null)
          .map(([dimension, label]) => <ObservationPick key={dimension} dimension={dimension} label={label}
          rows={attempts} filters={filters} onChange={change}/>)}
      </ObservationFilterGroup>
    </ObservationFilterLayout>
  </div>;
  return <div className="admin-page-stack admin-service-monitor">
    <AdminPageHeading title={healthPage ? t('连接健康') : "服务监控"}>
      <Space wrap>
        <Button theme="light" onClick={toggleSimulation}>{simulation ? '退出模拟' : '模拟数据'}</Button>
        {!healthPage && monitoringLinks.filter(([id]) => canAccessPage(state.currentRole, id)).map(([id, label]) =>
          <Button key={id} onClick={() => navigate(id)}>{label}</Button>)}
      </Space>
    </AdminPageHeading>
    {(!healthPage || !window) && <Card>{filterPanel}</Card>}
    {catalogueError && <Banner type="danger" closeIcon={null} description={<Space>连接清单加载失败：{catalogueError}
      <Button size="small" onClick={() => setRetry(value => value + 1)}>重新加载</Button></Space>}/>}
    {!window ? <Banner type="danger" closeIcon={null} description="请选择不超过 365 天的有效时间范围。"/> :
      healthPage ?
          <div className="admin-page-stack">
            <Card title={<Title heading={5} component="h2">{t('上游模型观测列表')}</Title>} headerExtraContent={
              <Choice label={t('对比分组')} value="channelModel" options={[['channelModel', t('按上游模型')]]}/>
            }>
              <div className="channel-health-filters">{filterPanel}</div>
              <ChannelHealthTable loading={loadingCatalogue} rows={visibleHealthRows} labels={labels} summaries={summaries}
                simulated={Boolean(simulation)} canManageChannels={canAccessPage(state.currentRole, 'providers-reference')}
                onTrend={id => {
                  setTrendGroupId(id); requestAnimationFrame(() => trendPanel.current?.focus());
                }}/>
            </Card>
            {attemptDetails}
            {rows.length > 0 && trendGroup && <section ref={trendPanel} tabIndex={-1} aria-label="上游模型趋势" className="admin-page-stack">
              <div className="admin-monitor-section-title">
                <Title heading={5} component="h2">{seriesName(trendGroup)} 趋势</Title>
                <Button size="small" theme="borderless" onClick={() => setTrendGroupId(null)}>查看全部</Button>
              </div>
              <div className="admin-analysis-plot-grid">
                  <ObservationPlot title="TTFT (P50) 趋势" labels={labels} unit="ms" series={groupedSeries('ttft')}/>
                  <ObservationPlot title="吞吐量 (P50) 趋势" labels={labels} unit="Token/s" series={groupedSeries('otps')}/>
                  <ObservationPlot title="缓存命中率趋势" labels={labels} unit="%" domain={[0, 100]} series={groupedSeries('cacheRate')}/>
              </div>
            </section>}
          </div>
        :
          <div className="admin-page-stack">
            <Title heading={5} component="h2">模型实时性能</Title>
            <MonitoringSummary metrics={[
              ['P95 首 Token 时延（TTFT）', metricValue(performance.ttft, 'ms'), `有效样本 ${fmt(performance.ttftSamples)} 条`],
              ['输出 Token 速率（OTPS）', metricValue(performance.otps, 'Token/s'), `有效样本 ${fmt(performance.otpsSamples)} 条`],
              ['超时率', pct(performance.timeoutRate)], ['最近一条尝试', observationTime(lastAttemptAt)],
            ]}/>
            {rows.length ? <div className="admin-analysis-plot-grid">
              {performanceTrend('P95 首 Token 时延', 'ttft', 'ms')}
              {performanceTrend('输出 Token 速率', 'otps', 'Token/s')}
              {performanceTrend('超时率', 'timeoutRate', '%', 'timeout', [0, 100])}
              {capacityPlot}
            </div> : <Card><Empty description="所选范围暂无可统计的上游尝试"/></Card>}
            {attemptDetails}
          </div>}
    {selectedRequest && <RequestLogDetail key={selectedAttempt.id} row={selectedRequest} attemptId={selectedAttempt.id}
      evidence={simulation?.evidence[selectedRequest.id]} canViewFullLog={canViewFullLog} close={() => setSelectedAttempt(null)}/>}
  </div>;
}
