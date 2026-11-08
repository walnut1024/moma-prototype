import { useMemo, useState } from 'react';
import { Banner, Button, Card, Dropdown, Typography } from '@douyinfe/semi-ui';
import { IconChevronDown } from '@douyinfe/semi-icons';
import Table from './AdminTable';
import AdminPageHeading from './AdminPageHeading';
import { Choice } from './ServiceUI';
import { FilterReset, FilterToolbar } from '../components/FilterControls';
import { chartPalette } from '../components/chart-style.mjs';
import { ObservationPick, ObservationPlot, ObservationSupplyPick, ObservationTimeRange, useObservationSupply } from './CallObservationControls';
import { monitoringLinks } from './navigation.mjs';
import {
  attemptCapacity, callObservations, defaultObservationGrain, errorSignals, filterObservations, observationBuckets,
  observationDrill, observationFilters, observationGrains, observationGroups, observationGroupScope, observationHash, observationKey,
  observationName, observationNumber as fmt, observationWindow, summarizeObservations,
} from './call-observations.mjs';

const { Title, Paragraph } = Typography;
const grouping = [['channel', '渠道'], ['provider', '服务商'], ['endpoint', '端点']];
const groupLabels = new Map(grouping);
const filtersShown = [['endpoint', '端点'], ['callId', '对外调用标识']];
const capacityOptions = [['Rpm', 'RPM'], ['Tpm', 'TPM']];
const signals = { '429': 'rateLimit', '超时': 'timeout', '回退': 'fallback' };
const identity = (rows, field) => {
  const names = new Map(rows.map(row => [observationKey(row, field), observationName(row, field)]));
  return names.size === 1 ? names.values().next().value : names.size + ' 个' + groupLabels.get(field);
};

export default function ServiceMonitoringPage({ state, navigate, params }) {
  const [filters, setFilters] = useState(() => observationFilters(params, '24h'));
  const [grain, setGrain] = useState(() => params.get('grain'));
  const [groupBy, setGroupBy] = useState(() => groupLabels.has(params.get('groupBy')) ? params.get('groupBy') : 'channel');
  const [capacity, setCapacity] = useState('Rpm');
  const { attempts } = useMemo(() => callObservations(state), [state]);
  const supply = useObservationSupply(attempts, filters.supply);
  const window = observationWindow(filters);
  const grains = observationGrains(window);
  const granularity = grains.some(([id]) => id === grain) ? grain : defaultObservationGrain(filters, window);
  const rows = filterObservations(attempts, filters, window);
  const buckets = observationBuckets(rows, window, granularity);
  const labels = buckets.map(bucket => bucket.label);
  const grouped = observationGroups(rows, groupBy);
  const names = new Map();
  for (const group of grouped) names.set(group.name, (names.get(group.name) || 0) + 1);
  const seriesName = group => names.get(group.name) > 1 ? group.name + ' · ' + group.id : group.name;
  const groupsByName = new Map(grouped.map(group => [seriesName(group), group]));
  const summaries = buckets.map(bucket => new Map(observationGroups(bucket.rows, groupBy)
    .map(group => [group.id, summarizeObservations(group.rows)])));
  const bucketStats = buckets.map(bucket => summarizeObservations(bucket.rows));
  const groupedSeries = (field, empty = null) => grouped.map((group, index) => ({ label: seriesName(group),
    color: chartPalette[index % chartPalette.length], values: summaries.map(item => item.get(group.id)?.[field] ?? empty) }));
  const capacityStats = buckets.map(bucket => attemptCapacity(bucket.rows, bucket));
  const capacitySeries = [['平均', 'average'], ['分钟峰值', 'peak']].map(([label, prefix]) =>
    ({ label: label + ' ' + capacity.toUpperCase(), values: capacityStats.map(stats => stats[prefix + capacity]) }));
  const change = patch => {
    setFilters(current => ({ ...current, ...patch }));
    if (patch.period) setGrain(null);
  };
  const reset = () => { setFilters(observationFilters(undefined, '24h')); setGrain(null); setGroupBy('channel'); };
  const drill = (range, extra) => {
    if (!range) return;
    history.replaceState(history.state, '', observationHash('monitoring', filters, { grain: granularity, groupBy }));
    location.hash = observationDrill(filters, range, 'attempts', extra);
  };
  const groupPoint = (index, name, extra) => {
    const group = groupsByName.get(name);
    if (group) drill(buckets[index], { ...observationGroupScope(groupBy, group), ...extra });
  };
  const table = grouped.map(group => ({
    id: group.id, scope: observationGroupScope(groupBy, group),
    provider: identity(group.rows, 'provider'), channel: identity(group.rows, 'channel'), endpoint: identity(group.rows, 'endpoint'),
    ...summarizeObservations(group.rows), ...attemptCapacity(group.rows, window),
  }));
  const numberColumn = ([title, dataIndex]) => ({ title, dataIndex, align: 'right', render: fmt,
    sorter: (a, b) => (a[dataIndex] ?? -1) - (b[dataIndex] ?? -1) });
  const columns = [
    ...[['服务商', 'provider'], ['渠道', 'channel'], ['端点', 'endpoint']].map(([title, dataIndex]) => ({
      title, dataIndex, render: (value, row) => dataIndex === groupBy
        ? <Button theme="borderless" size="small" onClick={() => drill(window, row.scope)}>{value}</Button> : value,
    })),
    ...[['尝试数', 'count'], ['失败数', 'failed']].map(numberColumn),
    { title: '失败率', dataIndex: 'failureRate', align: 'right', render: value => value == null ? '—' : fmt(value) + '%' },
    ...[['429 次数', 'rateLimit'], ['超时次数', 'timeout'], ['回退次数', 'fallback'], ['P95 上游耗时（ms）', 'p95'],
      ['峰值 RPM', 'peakRpm'], ['峰值 TPM', 'peakTpm']].map(numberColumn),
  ];
  return <div className="admin-page-stack">
    <AdminPageHeading title="服务监控">
      <Dropdown trigger="click" position="bottomRight" render={<Dropdown.Menu>
        {monitoringLinks.map(([id, label]) => <Dropdown.Item key={id} onClick={() => navigate(id)}>{label}</Dropdown.Item>)}
      </Dropdown.Menu>}>
        <Button icon={<IconChevronDown aria-hidden="true"/>} iconPosition="right">更多</Button>
      </Dropdown>
    </AdminPageHeading>
    <Card>
      <div className="admin-analytics-fields">
        <FilterToolbar>
          <ObservationTimeRange filters={filters} window={window} onChange={change}>
            <Choice label="统计粒度" value={granularity} options={grains} onChange={setGrain}/>
          </ObservationTimeRange>
          <FilterReset onClick={reset}/>
        </FilterToolbar>
        <FilterToolbar>
          <ObservationSupplyPick {...supply} onChange={change}/>
          {filtersShown.map(([dimension, label]) => <ObservationPick key={dimension} dimension={dimension} label={label}
            rows={attempts} filters={filters} onChange={change}/>)}
          <Choice label="对比分组" value={groupBy} options={grouping.map(([id, label]) => [id, '按' + label])} onChange={setGroupBy}/>
        </FilterToolbar>
      </div>
    </Card>
    {!window ? <Banner type="danger" closeIcon={null} description="请选择不超过 365 天的有效时间范围。"/> : <>
      {!rows.length && <Paragraph role="status" type="secondary">所选时段暂无可统计的上游尝试。</Paragraph>}
      <div className="admin-analysis-plot-grid">
        <ObservationPlot title="上游尝试量趋势" compact={grouped.length <= 8} labels={labels} unit="次"
          series={groupedSeries('count', 0)} onChoose={groupPoint}/>
        <ObservationPlot title="上游失败率趋势" compact={grouped.length <= 8} labels={labels} unit="%" domain={[0, 100]}
          series={groupedSeries('failureRate')} onChoose={(index, name) => groupPoint(index, name, { outcome: 'failed' })}/>
        <ObservationPlot title="异常次数趋势" type="bar" labels={labels} unit="次"
          series={errorSignals.map(([, label]) => ({ label, values: bucketStats.map(stats => stats[signals[label]]) }))}
          onChoose={(index, label) => drill(buckets[index], { signal: errorSignals.find(([, name]) => name === label)?.[0] })}/>
        <ObservationPlot title="上游耗时趋势" compact={grouped.length <= 8} labels={labels} unit="ms"
          series={groupedSeries('p95')} onChoose={groupPoint}/>
        <ObservationPlot title="容量趋势" labels={labels} unit={capacity === 'Rpm' ? '次/分钟' : 'Token/分钟'}
          actions={<Choice label="容量指标" value={capacity} options={capacityOptions} onChange={setCapacity}/>}
          series={capacitySeries} onChoose={index => drill(buckets[index])}/>
      </div>
      <Card title={<Title heading={5} component="h2">{groupLabels.get(groupBy)}对比</Title>}>
        <Table rowKey="id" size="small" dataSource={table} columns={columns} pagination={false}
          empty="所选范围暂无记录" scroll={{ x: 'max(100%, 1180px)' }}/>
      </Card>
    </>}
  </div>;
}
