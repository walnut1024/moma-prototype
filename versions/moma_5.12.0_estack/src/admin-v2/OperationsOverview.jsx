import { lazy, Suspense, useCallback, useMemo, useRef, useState } from 'react';
import { IconActivity, IconArrowLeft, IconChevronRight, IconLayers, IconTick } from './xa24/HaloIcons.jsx';
import Table from './xa24/HaloTable.jsx';
import { XaButton as Button, XaCard as Card, XaHelp as AnalysisHelp, XaModal as Modal,
  XaSelect as Select, XaSpace as Space, XaTabs as Tabs, XaTypography as Typography } from './xa24/HaloComponents.jsx';
import { XaRadioGroup as RadioGroup } from './xa24/HaloInputs.jsx';
import { dayOf } from './analytics';
import { compactCount, overviewChange, overviewCustomers, overviewDateTime, overviewMetrics, overviewRange, overviewRanks, overviewSummary, overviewTimeline } from './overview';
import './overview.css';

const { Title, Text } = Typography;
const countFormat = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 });
const number = value => value == null ? '—' : countFormat.format(value);
const percent = (value, total) => value != null && total > 0 ? number(value / total * 100) + '%' : '—';
const overviewIllustration = import.meta.env.BASE_URL + 'assets/xa-overview.png';
const overviewPeriods = [
  { value: 'today', label: '今日' }, { value: 'yesterday', label: '昨日' },
  { value: '7d', label: '近 7 日' }, { value: '30d', label: '近 30 日' },
];
const windows = ['近一周工作日日均', '近一月工作日日均'];
const metricIcons = { Token: IconLayers, 次: IconActivity, '%': IconTick };
const overviewIcons = {
  registered: <><circle cx="10" cy="6" r="3"/><path d="M3 18v-2q0-5 7-5t7 5v2"/></>,
  certified: <><circle cx="8" cy="5" r="3"/><path d="M1 17v-2q0-5 7-5 2 0 3 .6 M12 14l2 2 4-5"/></>,
  listed: <path d="m2 5 8-4 8 4v9l-8 4-8-4Z M2 5l8 4 8-4 M10 9v9"/>,
  daily: <path d="M2 18h16 M4 14V9 M10 14V3 M16 14V6"/>,
  peak: <path d="M2 18h16 M4 14v-3 M10 14V5 M16 14V9 M3 7l5-5 4 3 5-3"/>,
  monthly: <><rect x="2" y="4" width="16" height="14" rx="2"/><path d="M6 2v4 M14 2v4 M2 9h16 M6 12h3 M6 15h6"/></>,
  spend: <><circle cx="10" cy="10" r="8"/><path d="m7 6 3 4 3-4 M6 10h8 M6 13h8 M10 10v6"/></>,
  mau: <><circle cx="8" cy="5" r="3"/><path d="M1 17v-2q0-5 7-5 2 0 3 1 M12 14h2l1-3 2 6 1-3h1"/></>,
};
const rankMedals = [
  <><path d="m2 6 4 3 4-6 4 6 4-3-2 11H4Z"/><path d="M5 18h10"/></>,
  <><path d="m6 14-2 5 5-2 M14 14l2 5-5-2"/><circle cx="10" cy="9" r="7"/></>,
  <path d="M3 2h14v8c0 4-3 6-7 9-4-3-7-5-7-9Z"/>,
];
const loadCharts = () => import('../components/AnalyticsCharts');
const TrendChart = lazy(() => loadCharts().then(({ TimeSeriesChart }) => ({ default: TimeSeriesChart })));
const ActivityChart = lazy(() => loadCharts().then(({ DonutChart }) => ({ default: DonutChart })));

function OverviewChart({ component: Chart, height, ...props }) {
  return <Suspense fallback={<div aria-hidden="true" style={{ height: props.overview ? height + 32 : height }}/> }>
    <Chart height={height} {...props}/>
  </Suspense>;
}

export default function OperationsOverview({ state, workbenchName, shortcuts, onNavigate }) {
  const [now] = useState(() => Date.now());
  const [period, setPeriod] = useState('30d');
  const [history, setHistory] = useState(null);
  const [more, setMore] = useState(false);
  const range = overviewRange(period, now);
  const summary = useMemo(() => overviewSummary(state, { start: range.start, end: range.end }, now),
    [state, range.start, range.end, now]);
  const token = value => value == null ? '—' : compactCount(value);
  const spend = summary.spend.length
    ? summary.spend.map(({ value, currency }) => new Intl.NumberFormat('zh-CN', { style: 'currency', currency }).format(value)).join(' · ')
    : '—';
  const primary = [
    { label: '注册用户数', value: number(summary.registered), unit: '人', icon: overviewIcons.registered },
    { label: '认证用户数', value: number(summary.certified), unit: '人', icon: overviewIcons.certified,
      help: '仅统计已有实人认证通过记录的注册用户。' },
    { label: '上架模型数量', value: number(summary.listed), unit: '个', icon: overviewIcons.listed,
      badge: summary.firstListings > 0 ? '新增 ' + number(summary.firstListings) : undefined,
      badgeTitle: '本月首次上架模型数' },
    { label: '单日 Token 消耗量', value: token(summary.daily.total), unit: 'Token', icon: overviewIcons.daily },
  ];
  const secondary = [
    { label: '单日最大小时峰值消耗 Token', value: token(summary.peak), unit: 'Token', badge: '峰值', icon: overviewIcons.peak },
    { label: '本月累计消耗量', value: token(summary.monthTokens.total), unit: 'Token', icon: overviewIcons.monthly },
    { label: '本月消费金额', value: spend, icon: overviewIcons.spend, badge: summary.spend.length ? '消费' : undefined,
      help: '仅汇总本月调用记录中已确认的客户扣费，各币种分别展示。' },
    { label: '月活跃用户数', value: number(summary.mau), unit: '人', icon: overviewIcons.mau,
      help: '本月发生成功登录的去重用户数。' },
  ];
  const historyActivity = { start: summary.start, end: summary.end, rows: summary.rows, totals: summary.totals };
  const interval = summary.hourly ? '按小时汇总（单小时颗粒度）' : '按天汇总';
  const labels = summary.trend.map(item => item.label);
  return <div className="admin-page-stack xa24-page ov-page">
    <section className="ov-hero xa24-entry-header" aria-labelledby="ov-welcome">
      <div>
        <Title heading={1} component="h1" id="ov-welcome">概览</Title>
        <p>查看平台用户、模型和调用用量的整体情况。</p>
      </div>
      <img src={overviewIllustration} className="xa24-entry-art" alt="" width="80" height="80"/>
    </section>

    <div className="ov-summary">
      <Card className="ov-panel ov-time xa24-page-card">
        <div className="ov-time-controls">
          <Text className="ov-time-label">时间</Text>
          <RadioGroup className="ov-periods" aria-label="时间" type="button" options={overviewPeriods} value={period}
            onChange={event => setPeriod(event.target.value)}/>
          <Text className="ov-range" type="secondary" size="small" aria-live="polite">
            {range.start} 00:00 — {overviewDateTime(Math.max(summary.start, summary.end - 1))}
          </Text>
        </div>
      </Card>
      <OverviewMetrics metrics={primary} label="平台指标"/>
      <OverviewMetrics metrics={secondary} label="经营指标"/>
      <section className="ov-summary-pair" aria-label="调用趋势">
        <OverviewPlot title="Token 用量趋势" note={interval}>
          <OverviewChart component={TrendChart} label="Token 用量趋势" labels={labels} unit="Token" type="area" height={240}
            compact overview tickFormatter={compactCount} showData={false}
            series={[{ label: 'Token 用量', color: '#1a6aff', values: summary.trend.map(item => item.tokens) }]}/>
        </OverviewPlot>
        <OverviewPlot title="模型请求趋势" note={interval}>
          <OverviewChart component={TrendChart} label="模型请求趋势" labels={labels} unit="次" type="area" height={240}
            compact overview tickFormatter={compactCount} showData={false}
            series={[{ label: '模型请求次数', color: '#0fc6c2', values: summary.trend.map(item => item.calls) }]}/>
        </OverviewPlot>
      </section>
      <section className="ov-summary-pair" aria-label="用量排行">
        <OverviewTop kind="customer" rows={summary.customers} total={summary.totals.total}
          onOpen={selected => setHistory({ kind: 'customer', selected })}/>
        <OverviewTop kind="model" rows={summary.models} total={summary.totals.total}
          onOpen={selected => setHistory({ kind: 'model', selected })}/>
      </section>
    </div>

    <div className="ov-more">
      <Button theme="borderless" aria-expanded={more} aria-controls="ov-more-details" onClick={() => setMore(value => !value)}>
        经营与租户明细
      </Button>
      <div id="ov-more-details" hidden={!more}>
        {more && <OverviewDetails state={state} now={now} workbenchName={workbenchName} shortcuts={shortcuts} onNavigate={onNavigate}/>}
      </div>
    </div>
    {history && <OverviewHistory state={state} activity={historyActivity} initialKind={history.kind}
      initialSelected={history.selected} onClose={() => setHistory(null)}/>}
  </div>;
}

function OverviewMetrics({ metrics, label }) {
  return <Card className="ov-panel ov-kpi-panel xa24-page-card">
    <dl className="ov-kpis ov-summary-kpis" aria-label={label}>
      {metrics.map(({ label: title, value, unit, icon, badge, badgeTitle, help }) => <div key={title} className="ov-kpi">
        <dt>
          <svg className="ov-kpi-icon" width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icon}</svg>
          <span>{title}</span>{help && <AnalysisHelp label={title}>{help}</AnalysisHelp>}
        </dt>
        <dd className="ov-kpi-value xa24-metric-value">
          <strong>{value}</strong>{unit && value !== '—' && <span>{unit}</span>}
          {badge && <small className="ov-kpi-badge" data-peak={badge === '峰值'} title={badgeTitle}>{badge}</small>}
        </dd>
      </div>)}
    </dl>
  </Card>;
}

function OverviewTop({ kind, rows, total, onOpen }) {
  const isCustomer = kind === 'customer';
  const label = isCustomer ? '客户' : '模型';
  const title = label + '用量 Top 10';
  const top = rows.slice(0, 10);
  const columns = [
    { title: '排名', key: 'rank', width: 70, align: 'center', render: (_, __, index) =>
      <span className="ov-rank" data-medal={index < 3 ? index + 1 : undefined}>
        {rankMedals[index] && <svg viewBox="0 0 20 20" aria-hidden="true">{rankMedals[index]}</svg>}
        <span>{index + 1}</span>
      </span> },
    { title: label, dataIndex: 'name', width: isCustomer ? 120 : 140, render: (name, row) =>
      <Button size="small" theme="borderless" className="ov-rank-name" onClick={() => onOpen(row)}>{name}</Button> },
    { title: 'Token 用量', dataIndex: 'total', width: 120,
      render: (value, row) => <span title={row.pending ? number(row.pending) + ' 次计量待确认' : undefined}>
        {value == null ? '—' : compactCount(value)}
      </span> },
    ...(isCustomer ? [
      { title: '用量占比', key: 'share', width: 90, render: (_, row) => percent(row.total, total) },
      { title: '周期变化', dataIndex: 'change', width: 100, render: value => <Change value={value}/> },
    ] : [{ title: '模型请求次数', dataIndex: 'calls', width: 120, render: number }]),
  ];
  return <Card className="ov-panel ov-top xa24-page-card" padding={0}>
    <div className="ov-top-content">
      <div className="ov-plot-heading">
        <Title heading={6} component="h2" className="xa24-card-title ov-chart-title">{title}</Title>
        <Text type="secondary" size="small">{isCustomer
          ? '前 ' + top.length + ' 名客户合计占平台用量 ' + percent(top.reduce((sum, row) => sum + (row.total ?? 0), 0), total)
          : '按对外模型汇总 · 多个服务商合并统计'}</Text>
      </div>
      <Table aria-label={title} columns={columns} dataSource={top} scroll={{ x: isCustomer ? 500 : 450 }} empty="本期暂无排行数据"/>
      {rows.length > 0 && <Button className="ov-top-more" size="small" theme="borderless" onClick={() => onOpen(null)}>查看全部</Button>}
    </div>
  </Card>;
}

function OverviewDetails({ state, now, workbenchName, shortcuts, onNavigate }) {
  const [mode, setMode] = useState('day');
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [history, setHistory] = useState(false);
  const data = useMemo(() => overviewTimeline(state, now), [state, now]);
  const month = selectedMonth || data.months.at(-1).id;
  const customers = useMemo(() => overviewCustomers(data, mode === 'month' ? month : null), [data, mode, month]);
  const metrics = overviewMetrics(data);

  return <div className="ov-details">
    <div className="ov-hero-meta">
      <Text size="small">{workbenchName}</Text>
      <Text type="secondary" size="small">更新于 {overviewDateTime(now)}（北京时间）</Text>
    </div>

    <Card className="ov-panel ov-kpi-panel xa24-page-card">
      <dl className="ov-kpis" aria-label="今日指标">
        {metrics.map(metric => {
          const Icon = metricIcons[metric.unit];
          return <div key={metric.label} className="ov-kpi">
            <dt><Icon aria-hidden="true"/>{metric.label}</dt>
            <dd className="ov-kpi-value xa24-metric-value" title={metric.value == null ? undefined : number(metric.value) + ' ' + metric.unit}>
              <strong>{metric.unit === '%' ? number(metric.value) : metric.value == null ? '—' : compactCount(metric.value)}</strong>
              {metric.value != null && <span>{metric.unit}</span>}
            </dd>
            <dd className="ov-kpi-compare">
              <Change value={metric.change} unit={metric.changeUnit}/>
              <Text size="small" type="secondary">较昨日同时段</Text>
              {metric.pending > 0 && <AnalysisHelp label="Token 计量待确认">
                {number(metric.pending)} 次请求的 Token 计量待确认。总量为已完整计量的 Token。
              </AnalysisHelp>}
            </dd>
          </div>;
        })}
      </dl>
    </Card>

    <nav aria-labelledby="ov-quick-title">
      <Card className="ov-panel ov-quick xa24-page-card">
        <Title heading={6} component="h2" id="ov-quick-title" className="xa24-card-title">快速使用</Title>
        <div className="ov-grid ov-shortcuts">
          {shortcuts.map(({ id, label, Icon }) => <Button key={id} block theme="borderless" type="tertiary"
            icon={<Icon size={16} aria-hidden="true"/>} onClick={() => onNavigate(id)}>
            <span>{label}</span><IconChevronRight aria-hidden="true"/>
          </Button>)}
        </div>
      </Card>
    </nav>

    <section className="ov-section" aria-labelledby="ov-operations-title">
      <div className="ov-heading"><Title heading={4} component="h2" id="ov-operations-title">累计经营指标</Title></div>
      <div className="ov-grid ov-economy">
        <div className="ov-grid ov-averages">
          {data.averages.map(({ start, end, days, value }, index) => <Card key={index} className="ov-panel ov-average xa24-metric-card">
            <Title heading={6} component="h3" className="xa24-card-title">{windows[index]}</Title>
            <div className="ov-kpi-value xa24-metric-value" title={value == null ? undefined : number(value) + ' Token'}>
              <strong>{value == null ? '—' : compactCount(value)}</strong><span>Token</span>
            </div>
            <Text type="secondary" size="small">{start.slice(5)} 至 {end.slice(5)} · {days} 个工作日</Text>
          </Card>)}
        </div>
        <OverviewPlot title="月度工作日 Token 用量" note={'工作日按周一至周五 · 截至 ' + data.daily.at(-1).date}>
          <OverviewChart component={TrendChart} label="月度工作日 Token 用量" labels={data.months.map(row => row.label)}
            compact legendAtTop showData={false} type="bar" stacked unit="Token" height={213}
            series={[
              ...data.supplyTypes.flatMap(([, label, color], index) =>
                index !== 2 || data.months.some(row => row.supply[index] > 0)
                  ? [{ label, color, values: data.months.map(row => row.supply[index]) }] : []),
              { label: '单日峰值（右轴）', color: '#6262bd', values: data.months.map(row => row.peak), rightAxis: true, showPoints: true },
            ]}/>
        </OverviewPlot>
      </div>
      <OverviewPlot title="月度活跃租户数" note={'按自然月去重 · 最后统计日 ' + data.daily.at(-1).date}>
        <OverviewChart component={TrendChart} label="月度活跃租户数" labels={data.months.map(row => row.label)}
          compact legendAtTop showData={false} type="bar" stacked unit="个" height={224}
          series={data.customerTypes.flatMap(({ label, color }, index) =>
            index !== 2 || data.months.some(row => row.customers[index] > 0)
              ? [{ label, color, values: data.months.map(row => row.customers[index]) }] : [])}/>
      </OverviewPlot>
      <OverviewPlot title="每日 Token 用量（TPD）" note="近 30 个完整自然日 · 已计量 Token">
        <OverviewChart component={TrendChart} label="每日 Token 用量" labels={data.daily.map(row => row.date.slice(5))}
          compact legendAtTop showData={false} type="area" unit="Token" height={262}
          series={[
            { label: '每日 Token', color: '#256be3', values: data.daily.map(row => row.total), showPoints: true },
            { label: '近 30 天均值', color: '#7d92b4', values: data.daily.map(() => data.mean), dashed: true },
          ]}/>
      </OverviewPlot>
    </section>

    <section className="ov-section" aria-labelledby="ov-customers-title">
      <div className="ov-heading ov-customer-heading">
        <Title heading={4} component="h2" id="ov-customers-title">租户核心指标</Title>
        <Space spacing={4} role="group" aria-label="租户统计周期">
          {[['day', '昨日'], ['month', '按月']].map(([id, label]) => <Button key={id} size="small"
            theme={mode === id ? 'light' : 'borderless'} type={mode === id ? 'primary' : 'tertiary'}
            aria-pressed={mode === id} onClick={() => setMode(id)}>{label}</Button>)}
        </Space>
        {mode === 'month' && <>
          <span className="sr-only" id="ov-month-label">选择统计月份</span>
          <Select className="ov-month" aria-labelledby="ov-month-label" size="small" value={month}
            onChange={setSelectedMonth} optionList={data.months.toReversed().map(row => ({ label: row.id, value: row.id }))}/>
        </>}
        <span className="ov-history-action">
          <Button size="small" theme="borderless" onClick={() => setHistory(true)}
            icon={<IconChevronRight aria-hidden="true"/>} iconPosition="right">查看历史数据</Button>
        </span>
      </div>
      <div className="ov-grid ov-customers-grid">
        <CustomerActivity activity={customers}/>
        <Card className="ov-panel ov-tiers-panel xa24-page-card">
          <div className="ov-panel-heading">
            <Title heading={6} component="h3" className="xa24-card-title ov-chart-title">按日均 Token 用量分级</Title>
            <AnalysisHelp label="按日均 Token 用量分级">按租户已计量 Token 除以所选周期内的完整自然日数分档。计量待确认与无 Token 类调用分别列示。</AnalysisHelp>
          </div>
          <div className="ov-tiers">
            <CustomerDonut rows={customers.tiers} count={customers.count} label="日均 Token 用量分级" />
            <ul>{customers.tiers.map(row => <li key={row.label}>
              <span className="ov-dot" style={{ backgroundColor: row.color }} aria-hidden="true"/>
              <Text size="small" type="secondary">{row.label}</Text><Text strong size="small">{number(row.value)}</Text>
            </li>)}</ul>
          </div>
        </Card>
      </div>
      <Card className="ov-panel ov-types-panel xa24-page-card">
        <Title heading={6} component="h3" className="xa24-card-title ov-chart-title">租户类型分布</Title>
        <div className="ov-types">
          <CustomerDonut rows={customers.types} count={customers.count} label="租户类型分布" />
          {customers.types.filter((row, index) => index < 2 || row.value > 0).map(row => <div className="ov-mini xa24-metric-card" key={row.label}>
            <Text size="small" type="secondary"><span className="ov-dot" style={{ backgroundColor: row.color }} aria-hidden="true"/>{row.label}</Text>
            <strong>{number(row.value)} <small>个</small></strong>
            <Text size="small" type="secondary">占比 {percent(row.value, customers.count)}</Text>
          </div>)}
        </div>
      </Card>
    </section>

    {history && <OverviewHistory state={state} activity={customers} onClose={() => setHistory(false)}/>}
  </div>;
}

function Change({ value, unit = '%' }) {
  const rounded = value == null ? null : Number(value.toFixed(2));
  const direction = rounded > 0 ? 'up' : rounded < 0 ? 'down' : 'flat';
  return <span className="ov-delta" data-direction={direction}>
    {rounded == null ? '—' : (rounded > 0 ? '+' : '') + number(rounded) + (unit === '%' ? unit : ' ' + unit)}
  </span>;
}

function OverviewPlot({ title, note, children }) {
  return <Card className="ov-panel ov-plot xa24-page-card">
    <div className="ov-plot-heading">
      <Title heading={6} component="h3" className="xa24-card-title ov-chart-title">{title}</Title>
      <Text type="secondary" size="small">{note}</Text>
    </div>
    {children}
  </Card>;
}

function CustomerActivity({ activity }) {
  const peak = Math.max(activity.count, activity.previous);
  return <Card className="ov-panel ov-active-panel xa24-page-card">
    <Title heading={6} component="h3" className="xa24-card-title ov-chart-title">调用活跃租户数</Title>
    <div className="ov-active-value" aria-live="polite">
      <div className="ov-kpi-value xa24-metric-value"><strong>{number(activity.count)}</strong><span>个</span></div>
      <Change value={overviewChange(activity.count, activity.previous)}/>
      <Text size="small" type="secondary">新增租户 {number(activity.added)} 个</Text>
    </div>
    <div className="ov-activity-bars">
      {[[activity.label, activity.count], [activity.previousLabel, activity.previous]].map(([label, value], index) =>
        <div key={label}>
          <Text type="secondary" size="small">{label}</Text>
          <progress aria-hidden="true" className="ov-progress" data-comparison={Boolean(index)}
            value={value} max={peak || 1}/>
          <Text size="small" strong>{number(value)}</Text>
        </div>)}
    </div>
    <div className="ov-grid ov-activity-minis">
      {[['期末近 7 日活跃', activity.recent7], ['期末近 30 日活跃', activity.recent30], ['沉默租户', activity.dormant]].map(([label, value]) =>
        <div className="ov-mini xa24-metric-card" key={label}>
          <div><Text type="secondary" size="small">{label}</Text>
            {label === '沉默租户' && <AnalysisHelp label="沉默租户">截至期末已开户满 30 天，最近 30 天无调用记录。</AnalysisHelp>}
          </div>
          <strong>{number(value)}</strong>
        </div>)}
    </div>
  </Card>;
}

function CustomerDonut({ rows, count, label }) {
  return count > 0 ? <OverviewChart component={ActivityChart} rows={rows.filter(row => row.value > 0)} unit="个" label={label} height={142}
    centerValue={number(count)} centerLabel="活跃租户" showData={false}/>
    : <div className="ov-donut-empty"><Text type="secondary" size="small">暂无活跃租户</Text></div>;
}

function OverviewHistory({ state, activity, onClose, initialKind = 'customer', initialSelected = null }) {
  const [kind, setKind] = useState(initialKind);
  const [metric, setMetric] = useState('total');
  const [selected, setSelected] = useState(initialSelected);
  const lastRank = useRef(initialSelected?.id ?? null);
  const label = kind === 'customer' ? '租户' : '模型';
  const otherKind = kind === 'customer' ? 'model' : 'customer';
  const ranked = useMemo(() => overviewRanks(activity.rows, kind, state, metric), [activity.rows, kind, state, metric]);
  const related = useMemo(() => selected
    ? overviewRanks(activity.rows.filter(row => row[kind === 'customer' ? 'tenantId' : 'modelId'] === selected.id), otherKind, state, metric)
    : [], [activity.rows, kind, metric, otherKind, selected, state]);
  const focusRank = useCallback(button => {
    if (button && button.dataset.rankId === lastRank.current) {
      button.focus();
      lastRank.current = null;
    }
  }, []);
  const focusBack = useCallback(button => { button?.focus(); }, []);
  const renderToken = (value, row) => <span title={row.pending ? number(row.pending) + ' 次计量待确认' : undefined}>
    {value == null ? '—' : compactCount(value)}{value != null && row.pending > 0 ? ' · 部分待确认' : ''}
  </span>;
  const columns = [
    { title: '排名', key: 'rank', width: 62, render: (_, __, index) => index + 1 },
    { title: label, dataIndex: 'name', render: (name, row) =>
      <Button size="small" theme="borderless" className="ov-rank-name" data-rank-id={row.id} ref={focusRank}
        onClick={() => { lastRank.current = row.id; setSelected(row); }}>{name}</Button> },
    { title: '已计量 Token', dataIndex: 'total', align: 'right', render: renderToken },
    { title: '请求次数', dataIndex: 'calls', align: 'right', render: number },
    { title: '占比', key: 'share', align: 'right', render: (_, row) =>
      metric === 'total' ? row.total == null ? '—' : percent(row.total, activity.totals.total) : percent(row.calls, activity.rows.length) },
  ];
  return <Modal visible title={selected ? selected.name + ' · 用量详情' : '历史数据'} footer={null} closeOnEsc
    width="min(860px, calc(100vw - 24px))" onCancel={selected ? () => setSelected(null) : onClose}>
    <div className="ov-history">
      <Text type="secondary" size="small">{dayOf(activity.start)} 至 {dayOf(activity.end - 1)} · 北京时间</Text>
      {selected ? <>
        <div><Button size="small" theme="borderless" className="ov-detail-back" icon={<IconArrowLeft aria-hidden="true"/>}
          ref={focusBack} onClick={() => setSelected(null)}>返回{label}排行</Button></div>
        <Space wrap><Text>已计量 Token {number(selected.total)}</Text><Text>请求次数 {number(selected.calls)}</Text></Space>
        <Table size="small" pagination={false} rowKey="id" dataSource={related} scroll={{ x: 410, y: 360 }}
          columns={[
            { title: kind === 'customer' ? '模型' : '租户', dataIndex: 'name' },
            { title: '已计量 Token', dataIndex: 'total', align: 'right', render: renderToken },
            { title: '请求次数', dataIndex: 'calls', align: 'right', render: number },
          ]}/>
      </> : <>
        <Tabs type="button" size="small" activeKey={kind} onChange={setKind} aria-label="排行对象">
          <Tabs.TabPane tab="租户排行" itemKey="customer"/>
          <Tabs.TabPane tab="模型排行" itemKey="model"/>
        </Tabs>
        <div>
          <span className="sr-only" id="ov-sort-label">排序指标</span>
          <Select aria-labelledby="ov-sort-label" size="small" value={metric} onChange={setMetric}
            optionList={[{ label: '按 Token 用量', value: 'total' }, { label: '按请求次数', value: 'calls' }]}/>
        </div>
        <Table key={kind + metric} size="small" pagination={false} rowKey="id" dataSource={ranked} scroll={{ x: 540, y: 360 }}
          columns={columns} empty="本期暂无排行数据"/>
      </>}
    </div>
  </Modal>;
}
