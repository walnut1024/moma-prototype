import { useId, useMemo, useRef, useState } from 'react';
import { Banner, Button, Card, Dropdown, Empty, Space, Tabs, Tag, Typography } from '@douyinfe/semi-ui';
import { IconChevronDown } from '@douyinfe/semi-icons';
import Table from './AdminTable';
import AdminStatus from './AdminStatus';
import AdminPageHeading from './AdminPageHeading';
import RequestLogDetail from './RequestLogDetail';
import { Choice } from './ServiceUI';
import { DEFAULT_PAGE_SIZE, FilterReset, FilterToolbar } from '../components/FilterControls';
import { chartPalette } from '../components/chart-style.mjs';
import { ObservationFilterGroup, ObservationFilterLayout, ObservationPick, ObservationPlot, ObservationSupplyPick,
  ObservationTimeRange, useObservationSupply } from './CallObservationControls';
import { monitoringLinks } from './navigation.mjs';
import { createCallLogSimulation } from './call-log-simulation.mjs';
import {
  attemptCapacity, attemptPerformance, attemptsForMetric, callObservations, changeObservationTenant,
  compareLogRows, defaultObservationGrain, errorSignals, filterObservations, httpLabel,
  observationBuckets, observationFilters, observationGrains, observationGroups, observationHash, observationKey,
  observationName, observationNumber as fmt, observationTime, observationWindow, outcomes, summarizeObservations,
} from './call-observations.mjs';

const { Title, Text } = Typography;
const grouping = [['channel', '渠道'], ['channelModel', '渠道模型'], ['provider', '服务商'], ['endpoint', '端点'], ['project', '项目']];
const groupLabels = new Map(grouping);
const filtersShown = [['endpoint', '端点'], ['callId', '模型调用标识']];
const customerPurpose = ['customer'];
const capacityOptions = [['Rpm', 'RPM'], ['Tpm', 'TPM']];
const signals = { '429': 'rateLimit', '超时': 'timeout', '回退': 'fallback' };
const metricLabels = { failed: '全部失败', rateLimit: '上游 429', timeout: '超时', fallback: '回退', ttft: '已采集首 Token', otps: '已采集输出速率' };
const pct = value => value == null ? '—' : fmt(value) + '%';
const metricValue = (value, unit) => value == null ? '—' : fmt(value) + (unit ? ' ' + unit : '');
const identity = (rows, field) => {
  const names = new Map(rows.map(row => [observationKey(row, field), observationName(row, field)]));
  return names.size === 1 ? names.values().next().value : names.size + ' 个' + (groupLabels.get(field) ?? '上游模型');
};

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

export default function ServiceMonitoringPage({ state, navigate, params, simulation, setSimulation, canViewFullLog }) {
  const [view, setView] = useState('health');
  const [filters, setFilters] = useState(() => observationFilters(params, '24h', simulation ? null : customerPurpose));
  const [grain, setGrain] = useState(() => params.get('grain'));
  const [groupBy, setGroupBy] = useState(() => groupLabels.has(params.get('groupBy')) ? params.get('groupBy') : 'channel');
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
  const supply = useObservationSupply(attempts, filters.supply);
  const window = useMemo(() => observationWindow(filters), [filters, attempts]);
  const grains = observationGrains(window);
  const granularity = grains.some(([id]) => id === grain) ? grain : defaultObservationGrain(filters, window);
  const projectRows = useMemo(() => attempts.filter(row => filters.tenant == null
    || filters.tenant.includes(observationKey(row, 'tenant'))), [attempts, filters.tenant]);
  const rows = useMemo(() => filterObservations(attempts, filters, window), [attempts, filters, window]);
  const buckets = useMemo(() => observationBuckets(rows, window, granularity), [rows, window, granularity]);
  const labels = buckets.map(bucket => bucket.label);
  const grouped = useMemo(() => observationGroups(rows, groupBy), [rows, groupBy]);
  const names = new Map();
  for (const group of grouped) names.set(group.name, (names.get(group.name) || 0) + 1);
  const seriesName = group => names.get(group.name) > 1 ? group.name + ' · ' + group.id : group.name;
  const groupsByName = new Map(grouped.map(group => [seriesName(group), group]));
  const trendGroup = grouped.find(group => group.id === trendGroupId);
  const trendGroups = trendGroup ? [trendGroup] : grouped;
  const selectedGroup = scope?.groupId == null ? null : grouped.find(group => group.id === scope.groupId);
  const scopedRows = scope?.groupId == null ? rows : selectedGroup?.rows ?? [];
  const evidenceRows = scope ? attemptsForMetric(scope.range
    ? scopedRows.filter(row => row.at >= scope.range.start && row.at < scope.range.end)
    : scopedRows, scope.metric).toSorted((a, b) => compareLogRows(a, b, 'at', -1)) : [];
  const summaries = buckets.map(bucket => new Map(observationGroups(bucket.rows, groupBy)
    .map(group => [group.id, summarizeObservations(group.rows)])));
  const bucketStats = buckets.map(bucket => summarizeObservations(bucket.rows));
  const overall = summarizeObservations(rows);
  const groupedSeries = (field, empty = null) => trendGroups.map((group, index) => ({ label: seriesName(group),
    color: chartPalette[index % chartPalette.length], values: summaries.map(item => item.get(group.id)?.[field] ?? empty) }));
  const capacityStats = buckets.map(bucket => attemptCapacity(bucket.rows, bucket));
  const capacitySeries = [['平均', 'average'], ['分钟峰值', 'peak']].map(([label, prefix]) =>
    ({ label: label + ' ' + capacity.toUpperCase(), values: capacityStats.map(stats => stats[prefix + capacity]) }));
  const performance = attemptPerformance(rows);
  const performanceBuckets = view === 'performance' ? buckets.map(bucket => attemptPerformance(bucket.rows)) : [];
  const lastAttemptAt = rows.reduce((latest, row) => Math.max(latest, row.at), -Infinity);
  const change = patch => {
    setScope(null);
    setTrendGroupId(null);
    const next = { ...filters, ...patch };
    setFilters(next);
    if (patch.period) setGrain(null);
    if (!simulation) history.replaceState(history.state, '', observationHash('monitoring', next, { grain: patch.period ? null : granularity, groupBy }));
  };
  const reset = (purpose = simulation ? null : customerPurpose) => {
    setScope(null); setTrendGroupId(null); setFilters(observationFilters(undefined, '24h', purpose)); setGrain(null); setGroupBy('channel');
  };
  const toggleSimulation = () => {
    setSelectedAttempt(null);
    reset(simulation ? customerPurpose : null);
    if (simulation) {
      if (realFilters.current) {
        setFilters(realFilters.current.filters);
        setGrain(realFilters.current.grain);
        setGroupBy(realFilters.current.groupBy);
      }
      setSimulation(null);
    } else {
      realFilters.current = { filters, grain, groupBy };
      setSimulation(createCallLogSimulation());
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
  const groupPoint = (index, name, metric) => {
    const group = groupsByName.get(name);
    if (group && buckets[index]) drill({ groupId: group.id, range: buckets[index], metric });
  };
  const table = grouped.map(group => ({
    id: group.id,
    name: seriesName(group), provider: identity(group.rows, 'provider'), channel: identity(group.rows, 'channel'),
    endpoint: identity(group.rows, 'endpoint'), project: identity(group.rows, 'project'),
    upstreamModelId: identity(group.rows, 'upstreamModelId'),
    ...summarizeObservations(group.rows), ...attemptCapacity(group.rows, window),
  }));
  const numberColumn = ([title, dataIndex, width = 108]) => ({ title, dataIndex, width, align: 'right', render: fmt,
    sorter: (a, b) => (a[dataIndex] ?? -1) - (b[dataIndex] ?? -1) });
  const countColumn = ([title, dataIndex], metric = dataIndex) => ({ ...numberColumn([title, dataIndex]), render: (value, row) => value > 0
    ? <Button theme="borderless" size="small" aria-controls={scope ? detailId : undefined}
      aria-expanded={scope?.groupId === row.id && scope.metric === metric && !scope.range}
      aria-label={`${row.name} ${title} ${fmt(value)}`}
      onClick={event => drill({ groupId: row.id, metric }, event.currentTarget)}>{fmt(value)}</Button>
    : fmt(value) });
  const dimensions = [['服务商', 'provider'], ['渠道', 'channel'], ['端点', 'endpoint'], ['项目', 'project'], ['上游模型', 'upstreamModelId']];
  const columns = [
    { title: groupLabels.get(groupBy), dataIndex: 'name', width: groupBy === 'channelModel' ? 234 : 144, fixed: 'left', render: (name, row) =>
      <Button theme="borderless" className="admin-monitor-group-link" size="small" aria-label={'查看趋势 ' + name}
        aria-pressed={trendGroupId === row.id} onClick={() => {
          setScope(null);
          setTrendGroupId(row.id);
          requestAnimationFrame(() => trendPanel.current?.focus());
        }}>{name}</Button> },
    countColumn(['上游尝试数', 'count'], null),
    countColumn(['失败次数', 'failed']),
    { ...numberColumn(['失败率', 'failureRate', 88]), render: pct },
    ...[['超时次数', 'timeout'], ['上游 429 次数', 'rateLimit']].map(column => countColumn(column)),
    { title: '超时率', width: 88, align: 'right', render: (_, row) => pct(row.timeout * 100 / row.count) },
    ...[['回退次数', 'fallback'], ['P95 上游耗时（ms）', 'p95', 182],
      ['峰值 RPM', 'peakRpm'], ['峰值 TPM', 'peakTpm']].map(numberColumn),
    ...dimensions.filter(([, key]) => key !== groupBy && !(groupBy === 'channelModel' && ['channel', 'upstreamModelId'].includes(key)))
      .map(([title, dataIndex]) => ({ title, dataIndex, width: 132, ellipsis: { showTitle: true } })),
  ];
  const attemptColumns = [
    { title: 'Request ID', dataIndex: 'requestId', width: 185, fixed: 'left', render: (value, attempt) => <>
      <Button theme="borderless" size="small" className="admin-log-request-id"
        aria-label={`查看请求详情 ${value ?? ''} 第 ${attempt.index} 次尝试`}
        onClick={() => setSelectedAttempt(attempt)}>{value ?? '查看详情'}</Button>
      <div><Text type="tertiary" size="small">第 {attempt.index} 次</Text></div>
    </> },
    { title: '发起时间', dataIndex: 'at', width: 168, render: observationTime },
    { title: '实际渠道', dataIndex: 'channelName', width: 148, render: value => value ?? '未采集' },
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
  return <div className="admin-page-stack admin-service-monitor">
    <AdminPageHeading title="服务监控">
      <Space wrap>
        <Button theme="light" onClick={toggleSimulation}>{simulation ? '退出模拟' : '模拟日志'}</Button>
        <Dropdown trigger="click" position="bottomRight" render={<Dropdown.Menu>
          {monitoringLinks.map(([id, label]) => <Dropdown.Item key={id} onClick={() => navigate(id)}>{label}</Dropdown.Item>)}
        </Dropdown.Menu>}>
          <Button icon={<IconChevronDown aria-hidden="true"/>} iconPosition="right">更多</Button>
        </Dropdown>
      </Space>
    </AdminPageHeading>
    <Card>
      <div className="admin-analytics-fields">
        <FilterToolbar>
          <ObservationTimeRange filters={filters} window={window} onChange={change}>
            <Choice label="统计粒度" value={granularity} options={grains} onChange={value => { setScope(null); setGrain(value); }}/>
          </ObservationTimeRange>
          <FilterReset onClick={() => {
            reset();
            if (!simulation) history.replaceState(history.state, '', '#/admin-2/monitoring');
          }}/>
        </FilterToolbar>
        <ObservationFilterLayout primary={<>
          <ObservationPick dimension="tenant" label="客户" rows={attempts} filters={filters}
            onChange={({ tenant }) => change(changeObservationTenant(attempts, filters, tenant))}/>
          <ObservationPick dimension="project" label="项目" rows={projectRows} filters={filters} onChange={change}/>
          <ObservationPick dimension="purpose" label="调用类型" rows={attempts} filters={filters} onChange={change}/>
          <ObservationSupplyPick {...supply} onChange={change}/>
          <ObservationPick dimension="upstreamModelId" label="上游模型" rows={attempts} filters={filters} onChange={change}/>
        </>}>
          <ObservationFilterGroup label="模型与渠道">
            {filtersShown.map(([dimension, label]) => <ObservationPick key={dimension} dimension={dimension} label={label}
              rows={attempts} filters={filters} onChange={change}/>)}
          </ObservationFilterGroup>
        </ObservationFilterLayout>
      </div>
    </Card>
    {!window ? <Banner type="danger" closeIcon={null} description="请选择不超过 365 天的有效时间范围。"/> :
      <Tabs activeKey={view} onChange={key => { setView(key); setScope(null); }} keepDOM={false} tabPaneMotion={false}>
        <Tabs.TabPane itemKey="health" tab="渠道健康">
          <div className="admin-page-stack">
            <MonitoringSummary metrics={[
              ['上游尝试', metricValue(overall.count, '次')], ['上游失败率', pct(overall.failureRate)],
              ['超时', metricValue(overall.timeout, '次')], ['上游 429', metricValue(overall.rateLimit, '次')],
            ]}/>
            <Card title={<Title heading={5} component="h2">{groupLabels.get(groupBy)}对比</Title>} headerExtraContent={
              <Choice label="对比分组" value={groupBy} options={grouping.map(([id, label]) => [id, '按' + label])}
                onChange={value => { setScope(null); setTrendGroupId(null); setGroupBy(value); }}/>
            }>
              <Table rowKey="id" size="small" dataSource={table} columns={columns}
                pagination={table.length > DEFAULT_PAGE_SIZE ? { pageSize: DEFAULT_PAGE_SIZE } : false}
                empty="所选范围暂无可统计的上游尝试"
                scroll={{ x: `max(100%, ${columns.reduce((total, column) => total + column.width, 0)}px)` }}/>
            </Card>
            {view === 'health' && attemptDetails}
            {rows.length > 0 && <section ref={trendPanel} tabIndex={-1} aria-label="渠道趋势" className="admin-page-stack">
              <div className="admin-monitor-section-title">
                <Title heading={5} component="h2">{trendGroup ? seriesName(trendGroup) + ' 趋势' : '渠道趋势'}</Title>
                {trendGroup && <Button size="small" theme="borderless" onClick={() => setTrendGroupId(null)}>查看全部</Button>}
              </div>
              <div className="admin-analysis-plot-grid">
                <ObservationPlot title="上游失败率趋势" compact={trendGroups.length <= 8} labels={labels} unit="%" domain={[0, 100]}
                  series={groupedSeries('failureRate')} onChoose={(index, name) => groupPoint(index, name, 'failed')}/>
                <ObservationPlot title="异常次数趋势" type="bar" labels={labels} unit="次"
                  series={errorSignals.map(([, label]) => ({ label, values: trendGroup
                    ? summaries.map(groups => groups.get(trendGroup.id)?.[signals[label]] ?? 0)
                    : bucketStats.map(stats => stats[signals[label]]) }))}
                  onChoose={(index, label) => trendGroup ? groupPoint(index, seriesName(trendGroup), signals[label]) : chooseBucket(index, signals[label])}/>
                <ObservationPlot title="上游尝试量趋势" compact={trendGroups.length <= 8} labels={labels} unit="次"
                  series={groupedSeries('count', 0)} onChoose={groupPoint}/>
                <ObservationPlot title="P95 上游耗时趋势" compact={trendGroups.length <= 8} labels={labels} unit="ms"
                  series={groupedSeries('p95')} onChoose={groupPoint}/>
              </div>
            </section>}
          </div>
        </Tabs.TabPane>
        <Tabs.TabPane itemKey="performance" tab="模型实时性能">
          <div className="admin-page-stack">
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
            {view === 'performance' && attemptDetails}
          </div>
        </Tabs.TabPane>
      </Tabs>}
    {selectedRequest && <RequestLogDetail key={selectedAttempt.id} row={selectedRequest} attemptId={selectedAttempt.id}
      evidence={simulation?.evidence[selectedRequest.requestId]} canViewFullLog={canViewFullLog} close={() => setSelectedAttempt(null)}/>}
  </div>;
}
