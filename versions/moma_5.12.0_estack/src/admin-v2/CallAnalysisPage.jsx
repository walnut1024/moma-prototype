import TableFieldHelp from '../components/TableFieldHelp';
import { useEffect, useMemo, useState } from 'react';
import { Banner, Button, Card, Toast, Typography } from '@douyinfe/semi-ui';
import { IconArrowRight } from '@douyinfe/semi-icons';
import Table from './AdminTable';
import AdminPageHeading from './AdminPageHeading';
import { AnalysisHelp } from './AnalysisMetric';
import { Choice } from './ServiceUI';
import { FilterReset, FilterToolbar } from '../components/FilterControls';
import SavedFilterViews from '../components/SavedFilterViews';
import { HorizontalBarChart } from '../components/AnalyticsCharts';
import { chartPalette } from '../components/chart-style.mjs';
import { inputLengthDistribution } from './analytics';
import {
  ObservationConditions, ObservationFilterGroup, ObservationFilterLayout, ObservationPick, ObservationPlot, ObservationSupplyPick,
  ObservationTimeRange, observationConditions, useObservationSupply,
} from './CallObservationControls';
import {
  callObservations, changeObservationTenant, defaultObservationGrain, filterObservations, httpLabel, modelTypes, observationBuckets,
  observationDrill, observationFilters, observationGrains, observationGroups, observationGroupScope, observationHash, observationKey, observationNumber as fmt,
  observationOptions, observationTime, observationViewFilters, observationWindow, summarizeObservations,
} from './call-observations.mjs';

const { Title, Text, Paragraph } = Typography;
const grouping = [['callId', '模型调用标识'], ['tenant', '客户'], ['project', '项目'], ['provider', '最终服务商'], ['channel', '最终渠道']];
const labels = new Map(grouping);
const selectors = [['model', '模型'], ['tenant', '客户'], ['project', '项目'], ['callId', '模型调用标识'], ['purpose', '调用类型']];
const customerPurpose = ['customer'];
const latencyChoices = [['p95', 'P95 总耗时'], ['ttft', 'P95 首 Token 时延']];
const countChoices = [['count', '请求数'], ['tokens', '输入 Token']];
const requestStates = [['成功', 'success', chartPalette[0]], ['失败', 'failed', chartPalette[5]], ['其他状态', 'other', chartPalette[6]]];
const outcomeForSeries = new Map(requestStates);
const seriesOf = (summary, label, field) => ({ label, values: summary.map(bucket => bucket[field]) });
const percent = value => value == null ? '—' : fmt(value) + '%';
const millis = value => value == null ? '—' : fmt(value) + ' ms';

export default function CallAnalysisPage({ state }) {
  const [initial] = useState(() => new URLSearchParams(location.hash.split('?')[1] || ''));
  const [filters, setFilters] = useState(() => observationFilters(initial, 'today', customerPurpose));
  const [grain, setGrain] = useState(() => initial.get('grain'));
  const [groupBy, setGroupBy] = useState(() => labels.has(initial.get('groupBy')) ? initial.get('groupBy') : 'callId');
  const [latency, setLatency] = useState('p95');
  const [lengthMetric, setLengthMetric] = useState('count');
  useEffect(() => {
    const restore = () => {
      const [route, query] = location.hash.split('?');
      if (route !== '#/admin-2/call-analysis') return;
      const params = new URLSearchParams(query);
      setFilters(observationFilters(params, 'today', customerPurpose));
      setGrain(params.get('grain'));
      setGroupBy(labels.has(params.get('groupBy')) ? params.get('groupBy') : 'callId');
    };
    addEventListener('hashchange', restore);
    return () => removeEventListener('hashchange', restore);
  }, []);
  const { requests } = useMemo(() => callObservations(state), [state]);
  const supply = useObservationSupply(requests, filters.supply);
  const window = observationWindow(filters);
  const grains = observationGrains(window);
  const granularity = grains.some(([id]) => id === grain) ? grain : defaultObservationGrain(filters, window);
  const rows = filterObservations(requests, filters, window);
  const summary = summarizeObservations(rows);
  const buckets = observationBuckets(rows, window, granularity);
  const trend = buckets.map(bucket => summarizeObservations(bucket.rows));
  const timeLabels = buckets.map(bucket => bucket.label);
  const modelRows = useMemo(() => filters.type ? requests.filter(row => row.modelType === filters.type) : requests, [requests, filters.type]);
  const callRows = filters.model === null ? modelRows : modelRows.filter(row => filters.model.includes(row.model));
  const change = patch => {
    const next = { ...filters, ...patch };
    setFilters(next);
    if (patch.period) setGrain(null);
    history.replaceState(history.state, '', observationHash('call-analysis', next, { grain: patch.period ? null : granularity, groupBy }));
  };
  const changeTenant = ({ tenant }) => change(changeObservationTenant(requests, filters, tenant));
  const projectRows = requests.filter(row => filters.tenant == null || filters.tenant.includes(observationKey(row, 'tenant')));
  const changeModel = ({ model }) => {
    const retained = filters.callId?.filter(id => model == null || modelRows.some(row => observationKey(row, 'callId') === id && model.includes(row.model)));
    change({ model, callId: retained?.length ? retained : null });
  };
  const applyView = view => {
    if (!view?.filters) return false;
    setFilters({ ...observationFilters(undefined, 'today', customerPurpose), ...observationViewFilters(view.filters), period: view.period || 'custom', key: null, source: null });
    setGrain(view.granularity);
    if (labels.has(view.groupBy)) setGroupBy(view.groupBy);
    return true;
  };
  const reset = () => {
    setFilters(observationFilters(undefined, 'today', customerPurpose));
    setGrain(null);
    setGroupBy('callId');
    history.replaceState(history.state, '', '#/admin-2/call-analysis');
  };
  const drill = (range, extra) => {
    if (!range) return;
    history.replaceState(history.state, '', observationHash('call-analysis', filters, { grain: granularity, groupBy }));
    location.hash = observationDrill(filters, range, extra);
  };

  const viewGroups = [
    { label: '时间', text: window ? observationTime(window.start) + ' — ' + observationTime(window.end) : '自定义' },
    { label: '统计粒度', text: new Map(grains).get(granularity) },
    { label: '分组', text: labels.get(groupBy) },
    { label: '模型类型', text: new Map(modelTypes).get(filters.type) || '全部' },
    ...selectors.map(([dimension, label]) => {
      const names = new Map(observationOptions(requests, dimension).map(item => [item.id, item.name]));
      return { label, items: filters[dimension]?.map(id => names.get(id) || id) ?? null };
    }),
    supply.group,
  ];
  const conditions = observationConditions(requests, filters, selectors, patch => 'model' in patch ? changeModel(patch) : 'tenant' in patch ? changeTenant(patch) : change(patch));
  if (filters.type) conditions.push(['模型类型', new Map(modelTypes).get(filters.type), () => change({ type: '' })]);
  if (supply.group.items !== null) conditions.push([supply.group.label, supply.group.items.join('、') || '未选择', () => change({ supply: null })]);
  const grouped = observationGroups(rows, groupBy).map(group => ({ ...group, ...summarizeObservations(group.rows) }));
  const failures = new Map();
  for (const row of rows) {
    if (row.outcome !== 'failed') continue;
    const code = String(row.status ?? 'unreported');
    failures.set(code, (failures.get(code) || 0) + 1);
  }
  const statusRows = [...failures].map(([id, value]) => ({ id, value, name: httpLabel(id === 'unreported' ? null : Number(id)) }))
    .sort((a, b) => b.value - a.value || a.id.localeCompare(b.id));
  const lengths = inputLengthDistribution(rows.map(row => ({ usage: { input: row.input } })));
  const failureRateHelp = '失败数除以成功与失败请求之和。取消、进行中和未采集单列。';
  const stats = [
    ['请求数', fmt(summary.count)],
    ['最终失败率', percent(summary.failureRate), fmt(summary.failed) + ' 次失败', failureRateHelp],
    ['P95 总耗时', millis(summary.p95)],
    ['Token 用量', fmt(summary.total), '输入 ' + fmt(summary.input) + ' / 输出 ' + fmt(summary.output)],
    ...(summary.ttftSamples ? [['P95 首 Token 时延', millis(summary.ttft), fmt(summary.ttftSamples) + ' 个有效样本']] : []),
  ];
  const columns = [
    { title: labels.get(groupBy), render: (_, row) => <Button theme="borderless" size="small"
      onClick={() => drill(window, observationGroupScope(groupBy, row))}>{row.name}</Button> },
    { title: '请求数', dataIndex: 'count', align: 'right', sorter: (a, b) => a.count - b.count, render: fmt },
    { title: '失败数', dataIndex: 'failed', align: 'right', sorter: (a, b) => a.failed - b.failed, render: fmt },
    { title: <TableFieldHelp name="失败率" description={failureRateHelp}/>, dataIndex: 'failureRate', align: 'right', render: percent },
    { title: <TableFieldHelp name="P95 总耗时（ms）" description="有耗时记录的请求中，约 95% 的请求耗时不超过此值。"/>,
      dataIndex: 'p95', align: 'right', render: fmt },
    ...[['输入 Token', 'input'], ['输出 Token', 'output']].map(([title, dataIndex]) =>
      ({ title, dataIndex, align: 'right', render: fmt })),
  ];
  return <div className="admin-page-stack">
    <AdminPageHeading title="调用数据"/>
    <Card>
      <div className="admin-analytics-fields">
        <FilterToolbar>
          <ObservationTimeRange filters={filters} window={window} onChange={change}>
            <Choice label="统计粒度" value={granularity} options={grains} onChange={setGrain}/>
          </ObservationTimeRange>
          <FilterReset onClick={reset}/>
        </FilterToolbar>
        <ObservationFilterLayout primary={<>
          <ObservationPick dimension="model" label="模型" rows={modelRows} filters={filters} onChange={changeModel}/>
          <ObservationPick dimension="tenant" label="客户" rows={requests} filters={filters} onChange={changeTenant}/>
          <ObservationPick dimension="project" label="项目" rows={projectRows} filters={filters} onChange={change}/>
        </>} actions={<SavedFilterViews notify={Toast} scope="admin-call-analysis" legacyKey="moma-admin2-5120-analytics-views" showCurrent={false}
          disabled={!window} groups={viewGroups} value={{ period: filters.period, filters, granularity, groupBy }} onApply={applyView}/>}>
          <ObservationFilterGroup label="调用方">
            <ObservationPick dimension="purpose" label="调用类型" rows={requests} filters={filters} onChange={change}/>
          </ObservationFilterGroup>
          <ObservationFilterGroup label="模型与渠道">
            <Choice size="small" label="模型类型" value={filters.type || 'all'} options={modelTypes.map(([id, label]) => [id || 'all', label])}
              onChange={value => change({ type: value === 'all' ? '' : value, callId: null, model: null })}/>
            <ObservationPick dimension="callId" label="模型调用标识" rows={callRows} filters={filters} onChange={change}/>
            <ObservationSupplyPick {...supply} onChange={change}/>
          </ObservationFilterGroup>
        </ObservationFilterLayout>
        <ObservationConditions conditions={conditions}/>
      </div>
    </Card>
    {!window ? <Banner type="danger" closeIcon={null} description="请选择不超过 365 天的有效时间范围。"/> : <>
      {!rows.length && <Paragraph type="secondary" role="status">所选时段暂无调用记录。</Paragraph>}
      <Card title={<Title heading={5} component="h2">调用概览</Title>} headerExtraContent={
        <Button icon={<IconArrowRight aria-hidden="true"/>} iconPosition="right" onClick={() => drill(window, { outcome: 'failed' })}>查看失败日志</Button>
      }>
        <div className="admin-analysis-metrics admin-call-metrics">
          {stats.map(([title, value, detail, help]) => <div key={title} className="admin-analysis-metric">
            <div className="admin-analysis-metric-label"><Text type="secondary">{title}</Text>{help && <AnalysisHelp label={title}>{help}</AnalysisHelp>}</div>
            <Title heading={4} component="span">{value}</Title>
            {detail && <Text type="tertiary" size="small">{detail}</Text>}
          </div>)}
        </div>
      </Card>
      <div className="admin-analysis-plot-grid">
        <ObservationPlot title="请求量趋势" type="bar" stacked labels={timeLabels} unit="次"
          series={requestStates.map(([label, field, color]) => ({ ...seriesOf(trend, label, field), color }))}
          onChoose={(index, name) => drill(buckets[index], { outcome: outcomeForSeries.get(name) })}/>
        <ObservationPlot title="耗时趋势" labels={timeLabels} unit="ms"
          actions={<Choice label="耗时指标" value={latency} options={latencyChoices} onChange={setLatency}/>}
          series={[seriesOf(trend, new Map(latencyChoices).get(latency), latency)]} onChoose={index => drill(buckets[index])}/>
        <ObservationPlot title="Token 用量趋势" type="bar" stacked labels={timeLabels} unit="Token"
          series={[seriesOf(trend, '输入 Token', 'input'), seriesOf(trend, '输出 Token', 'output')]} onChoose={index => drill(buckets[index])}/>
        <Card title={<Title heading={5} component="h2">失败请求状态码分布</Title>}>
          {statusRows.length ? <HorizontalBarChart rows={statusRows} label="失败请求状态码分布" unit="次" showData
            onChoose={http => drill(window, { outcome: 'failed', http })}/> : <Paragraph type="secondary">所选范围暂无失败请求。</Paragraph>}
        </Card>
        <ObservationPlot title="单次请求输入长度分布" type="bar" labels={lengths.map(bucket => bucket.label)}
          unit={lengthMetric === 'count' ? '次' : 'Token'} actions={
            <Choice label="长度分布指标" value={lengthMetric} options={countChoices} onChange={setLengthMetric}/>
          } series={[{ label: new Map(countChoices).get(lengthMetric), values: lengths.map(bucket => summary.input == null
            ? null : bucket[lengthMetric === 'count' ? 'calls' : 'tokens']) }]}/>
      </div>
      <Card title={<Title heading={5} component="h2">分组明细</Title>}
        headerExtraContent={<Choice label="统计分组" value={groupBy} options={grouping} onChange={setGroupBy}/>}>
        <Table rowKey="id" size="small" dataSource={grouped} columns={columns} pagination={false}
          empty="所选范围暂无记录" scroll={{ x: 'max(100%, 840px)' }}/>
      </Card>
    </>}
  </div>;
}
