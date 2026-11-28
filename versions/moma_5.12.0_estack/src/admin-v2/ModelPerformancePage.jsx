import { useId, useMemo, useState } from 'react';
import { EMessage } from '@cmss-bfs/haloe/dist/es/index.js';
import { XaButton as Button, XaHelp, XaInput as Input, XaModal as Modal, XaSelect as Select,
  XaTabs as Tabs, XaTag as Tag } from './xa24/HaloComponents.jsx';
import { XaRadio as Radio, XaRadioGroup as RadioGroup } from './xa24/HaloInputs.jsx';
import { XaDatePicker as DatePicker } from './xa24/HaloDatePicker.jsx';
import Table from './xa24/HaloTable.jsx';
import { callObservations, observationTime } from './call-observations.mjs';
import AdminPageHeading from './AdminPageHeading.jsx';
import ModelPerformanceChart from './ModelPerformanceChart';
import ModelPerformanceScenes from './ModelPerformanceScenes.jsx';
import { chartColor, formatMetric, histogramCard, lineCard, ringCard } from './model-performance-charts';
import { defaultPerformanceFilters, maxPerformanceBuckets, modelPerformance, performanceBucketCount, performanceGrain, performanceOptions } from './model-performance-data.mjs';
import { createModelPerformanceDemo } from './model-performance-demo.mjs';
import './model-performance.css';

const minute = 60_000;
const requestsUnit = '次';
const rpmUnit = '次/分钟';
const tokensUnit = '百万 Tokens';
const tpmUnit = '百万 Tokens/分钟';
const inMillions = value => Number.isFinite(value) ? value / 1_000_000 : null;
const tokenSeries = [
  { key: 'prompt', label: '输入 Token', color: chartColor.primary },
  { key: 'completion', label: '输出 Token', color: chartColor.lightBlue },
];
const outcomeLabels = ['成功', '网络错误', '5xx', '400', '401', '429', '其他失败', '已取消', '未采集', '进行中'];
const outcomeColors = [chartColor.success, chartColor.grey, chartColor.fail, chartColor.orange,
  chartColor.warning, chartColor.purple, chartColor.muted, '#64748b', '#aeb5c4', '#0d9488'];
const latencyLines = [
  ['avg', '平均', chartColor.primary], ['p99', 'P99', chartColor.fail], ['p95', 'P95', chartColor.orange],
  ['p90', 'P90', chartColor.warning], ['p50', 'P50', chartColor.success],
];

function performanceCharts(tab, report, histogramMode, histogramVisibility) {
  const { points, summary, distribution } = report;
  const measure = (key, label, color = chartColor.primary, transform = value => value) => ({ label, color, read: point => transform(point[key]) });
  const trend = (key, title, unit, measures, yAxisMax) => lineCard({ key, title, unit, points, measures, yAxisMax });
  const latencyTrend = (key, title) => trend(key, title, 'ms', latencyLines.map(([field, label, color]) => ({
    label, color, read: point => point[key]?.[field] ?? null,
  })));
  if (tab === 'latency') return [
    latencyTrend('ttft', '首 Token 等待 · TTFT'), latencyTrend('tpot', '每 Token 生成间隔 · TPOT'), latencyTrend('e2e', '端到端响应 · E2E'),
    trend('cacheHit', '缓存命中率', '%', [measure('cacheHitRate', '缓存命中率')]),
    trend('otps', '输出 Token 速率 · OTPS', 'Token/s', [measure('otps', 'OTPS', chartColor.teal)]),
    trend('timeout', '超时率', '%', [measure('timeoutRate', '超时率', chartColor.orange)],
      ({ max }) => Math.min(100, Math.max(5, Math.ceil(max / 5) * 5))),
  ];
  if (tab === 'context') return [
    ringCard({ key: 'outcomes', title: '累计调用次数', unit: requestsUnit, values: distribution.outcomes,
      labels: outcomeLabels, colors: outcomeColors, totalLabel: '总次数', total: summary.totalCalls }),
    ringCard({ key: 'tokenSplit', title: '累计 Token 使用', unit: tokensUnit, values: distribution.tokens.map(inMillions),
      labels: ['输入 Token', '输出 Token'], colors: [chartColor.primary, chartColor.orange], totalLabel: '总 Token', total: inMillions(summary.totalTokens) }),
    histogramCard({ title: 'Token 区间分布', unit: histogramMode === 'tokens' ? tokensUnit : requestsUnit,
      categories: distribution.ranges, series: tokenSeries.map((entry, index) => ({
        ...entry, visible: histogramVisibility[entry.key], data: histogramMode === 'tokens'
          ? distribution.histogram.tokens[index].map(inMillions) : distribution.histogram.calls[index],
      })) }),
  ];
  return [
    trend('calls', '调用量', requestsUnit, [measure('totalCalls', '总次数'), measure('successfulCalls', '成功次数', chartColor.success), measure('failedCalls', '失败次数', chartColor.fail)]),
    trend('tokenVolume', '调用 Token 量', tokensUnit, [measure('totalTokens', '总 Token', chartColor.primary, inMillions),
      measure('totalPromptTokens', '输入 Token', chartColor.success, inMillions), measure('totalCompletionTokens', '输出 Token', chartColor.orange, inMillions)]),
    trend('rpm', '每分钟请求数 · RPM', rpmUnit, [measure('rpm', 'RPM')]),
    trend('tpm', '每分钟 Token · TPM', tpmUnit, [measure('tpm', 'TPM', chartColor.primary, inMillions)]),
  ];
}

function MetricTiles({ items, context = false }) {
  return <div className={`performance-metrics${context ? ' context-metrics' : ''}`}>
    {items.map(([label, value, unit, caption, tooltip]) => <div className="metric-tile xa24-metric-card" key={label}>
      <div className="metric-label">{label}{tooltip && <XaHelp label={label + '说明'}>{tooltip}</XaHelp>}</div>
      <div className="metric-value">
        <strong>{formatMetric(value, unit)}</strong>
        {unit && unit !== '%' && <span>{unit}</span>}
      </div>
      {caption && <div className="metric-caption">{caption}</div>}
    </div>)}
  </div>;
}

const tabs = [['volume', '调用与 Token 汇总'], ['context', '上下文与 Token 分布'], ['latency', '延迟与耗时']];

export default function ModelPerformancePage({ state }) {
  const labelId = useId();
  const recordedAttempts = useMemo(() => callObservations(state).attempts.filter(row => row.purpose === 'customer'), [state]);
  const [demoAt, setDemoAt] = useState(Date.now);
  const [initial] = useState(() => defaultPerformanceFilters(demoAt));
  const [simulation, setSimulation] = useState(() => !recordedAttempts.some(row => row.at >= initial.start && row.at < initial.end));
  const [draft, setDraft] = useState(initial);
  const [applied, setApplied] = useState(initial);
  const [tab, setTab] = useState('volume');
  const [errorOpen, setErrorOpen] = useState(false);
  const [histogramMode, setHistogramMode] = useState('calls');
  const [histogramVisibility, setHistogramVisibility] = useState({ prompt: true, completion: true });
  const simulatedAttempts = useMemo(() => simulation ? createModelPerformanceDemo(demoAt) : [], [demoAt, simulation]);
  const attempts = simulation ? simulatedAttempts : recordedAttempts;
  const options = useMemo(() => performanceOptions(attempts, draft.model), [attempts, draft.model]);
  const report = useMemo(() => modelPerformance(attempts, applied), [attempts, applied]);
  const charts = useMemo(() => performanceCharts(tab, report, histogramMode, histogramVisibility),
    [tab, report, histogramMode, histogramVisibility]);
  const { summary, errorUsers } = report;
  const knownCalls = summary.successfulCalls + summary.failedCalls;
  const rangeDates = useMemo(() => [new Date(draft.start), new Date(draft.end - minute)], [draft.start, draft.end]);
  const popupClass = 'model-performance-popup';

  function reset() {
    const now = Date.now();
    const filters = defaultPerformanceFilters(now);
    setDemoAt(now);
    setDraft(filters);
    setApplied(filters);
  }

  function query(event) {
    event.preventDefault();
    if (!Number.isFinite(draft.start) || !Number.isFinite(draft.end) || draft.end <= draft.start
        || draft.end > defaultPerformanceFilters().end) {
      EMessage.warning('请选择有效的时间范围');
      return;
    }
    if (performanceBucketCount(draft) > maxPerformanceBuckets) {
      EMessage.warning('请缩短时间范围');
      return;
    }
    setApplied(draft);
  }

  function selectModel(value) {
    const model = value || '';
    const { upstreams } = performanceOptions(attempts, model);
    setDraft(current => ({ ...current, model, upstream: upstreams.some(item => item.value === current.upstream) ? current.upstream : '' }));
  }

  function selectUpstream(upstream) {
    setDraft(current => ({ ...current, upstream: upstream || '' }));
  }

  const overview = [
    ['平均 TPM', inMillions(summary.tpm), tpmUnit], ['平均 RPM', summary.rpm, rpmUnit],
    ['区间调用成功率', summary.successRate, '%', knownCalls ? `${formatMetric(summary.successfulCalls)} / ${formatMetric(knownCalls)} 次` : null,
      '按已判定成功或失败的上游调用计算。'],
    ['平均 TTFT', summary.ttft, 'ms'], ['平均 TPOT', summary.tpot, 'ms'],
    ['区间缓存命中率', summary.cacheHitRate, '%', '按输入 Token 加权'],
  ];
  const context = [
    ['区间累计调用', summary.totalCalls, requestsUnit, knownCalls ? `成功率 ${formatMetric(summary.successRate, '%')} · ${formatMetric(summary.failedCalls)} 次失败` : null],
    ['区间 Token 总量', inMillions(summary.totalTokens), tokensUnit], ['累计输入 Token', inMillions(summary.totalPromptTokens), tokensUnit],
    ['累计输出 Token', inMillions(summary.totalCompletionTokens), tokensUnit],
  ];
  const errorColumns = [
    { title: '调用用户', dataIndex: 'userName' }, { title: '用户 ID', dataIndex: 'userId', render: value => value ?? '—' },
    { title: '失败次数', dataIndex: 'failures', align: 'right', render: value => formatMetric(value) },
    { title: '占失败比例', dataIndex: 'failures', key: 'share', align: 'right', render: value => formatMetric(value * 100 / summary.failedCalls, '%') },
  ];

  return <div className="model-performance xa24-page">
    <AdminPageHeading title="模型性能" className="xa24-entry-header"/>
    <form className="performance-filters xa24-page-card xa24-toolbar" aria-label="模型性能筛选" onSubmit={query}>
      <div className="filter-field filter-granularity">
        <label htmlFor={`${labelId}-grain`}>显示粒度</label>
        <Input id={`${labelId}-grain`} value={performanceGrain(draft) === 'hour' ? '按小时' : '按天'} readOnly/>
      </div>
      <div className="filter-field filter-range">
        <span id={`${labelId}-range`}>时间范围</span>
        <DatePicker className="performance-range-picker" aria-labelledby={`${labelId}-range`} type="dateTimeRange" format="yyyy-MM-dd HH:mm"
          timeZone="Asia/Shanghai" timePickerOpts={{ format: 'HH:mm' }} needConfirm showClear={false} inputReadOnly
          rangeSeparatorNode="–"
          dropdownClassName={popupClass} value={rangeDates} onChangeWithDateFirst
          onChange={([start, end]) => {
            if (start && end) setDraft(current => ({ ...current, start: start.getTime(), end: end.getTime() + minute }));
          }}/>
      </div>
      <div className="filter-field filter-model">
        <span id={`${labelId}-model`}>模型服务</span>
        <Select aria-labelledby={`${labelId}-model`} placeholder="全部模型" filter showClear
          optionList={options.models} value={draft.model || undefined} onChange={selectModel}/>
      </div>
      <div className="filter-field filter-upstream-model">
        <span id={`${labelId}-upstream`}>上游模型</span>
        <Select aria-labelledby={`${labelId}-upstream`} placeholder="全部上游模型" filter showClear
          optionList={options.upstreams} value={draft.upstream || undefined} onChange={selectUpstream}/>
      </div>
      <div className="filter-actions">
        <Button type="tertiary" onClick={reset}>重置</Button>
        <Button theme="solid" htmlType="submit">查询</Button>
      </div>
    </form>

    <section className="performance-overview xa24-page-card" aria-labelledby={`${labelId}-overview`} aria-live="polite">
      <div className="overview-heading">
        <h2 id={`${labelId}-overview`}>数据总览</h2>
        <div className="performance-mode">
          {Number.isFinite(summary.latestAt) && <span>截至 {observationTime(summary.latestAt).slice(0, 16)}</span>}
          {simulation && <Tag color="blue" size="small">模拟数据</Tag>}
          <Button size="small" theme="borderless" onClick={() => { setSimulation(!simulation); reset(); }}>
            {simulation ? '退出模拟' : '模拟数据'}
          </Button>
        </div>
      </div>
      <MetricTiles items={overview}/>
    </section>

    <section className="performance-tabs-panel xa24-page-card" aria-label="模型性能图表">
      <Tabs className="performance-tabs" activeKey={tab} onChange={setTab}>
        {tabs.map(([key, label]) => <Tabs.TabPane itemKey={key} tab={label} key={key}>
          {tab === key && <>
            {tab === 'context' && <MetricTiles items={context} context/>}
            <div className="performance-chart-grid">
              {charts.map(chart => <ModelPerformanceChart chart={chart} key={chart.key}>
                {chart.key === 'outcomes' && <Button size="small" theme="borderless" disabled={!errorUsers.length} onClick={() => setErrorOpen(true)}>错误明细</Button>}
                {chart.key === 'histogram' && <>
                  {chart.hasData && <div className="histogram-legend">
                    {tokenSeries.map(({ key, label, color }) => <Button key={key} htmlType="button" theme="borderless" size="small"
                      aria-pressed={histogramVisibility[key]} onClick={() => setHistogramVisibility(current => ({ ...current, [key]: !current[key] }))}>
                      <span aria-hidden="true" className="histogram-swatch" style={{ backgroundColor: color }}/>{label}
                    </Button>)}
                  </div>}
                  <RadioGroup aria-label="Token 分布统计方式" type="button" value={histogramMode} onChange={event => setHistogramMode(event.target.value)}>
                    <Radio value="calls">调用次数</Radio><Radio value="tokens">Token 量</Radio>
                  </RadioGroup>
                </>}
              </ModelPerformanceChart>)}
            </div>
          </>}
        </Tabs.TabPane>)}
      </Tabs>
    </section>

    {tab === 'context' && <ModelPerformanceScenes scenes={report.distribution.scenes}/>}

    {errorOpen && <Modal visible closeOnEsc title="错误明细" className={popupClass} width="min(660px, calc(100vw - 32px))"
      onCancel={() => setErrorOpen(false)} footer={<Button onClick={() => setErrorOpen(false)}>关闭</Button>}>
      <Table columns={errorColumns} dataSource={errorUsers} rowKey={row => row.userId ?? ''} pagination={false} size="small"
        scroll={{ x: 515, y: 350 }}/>
    </Modal>}
  </div>;
}
