import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Progress, Select, Space, Tabs, Typography } from '@douyinfe/semi-ui';
import { IconArrowLeft, IconChevronRight } from '@douyinfe/semi-icons';
import Table from './AdminTable';
import { AdminModal } from './AdminOverlay';
import { AnalysisHelp } from './AnalysisMetric';
import { DonutChart, TimeSeriesChart } from '../components/AnalyticsCharts';
import { dayOf } from './analytics';
import { compactCount, overviewChange, overviewCustomers, overviewDateTime, overviewMetrics, overviewRanks, overviewTimeline } from './overview';
import './overview.css';

const { Title, Text } = Typography;
const countFormat = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 });
const number = value => value == null ? '—' : countFormat.format(value);
const percent = (value, total) => total ? number(value / total * 100) + '%' : '—';
const welcomeImage = 'url(' + import.meta.env.BASE_URL + 'assets/token-workbench-welcome.webp)';
const windows = ['近一周工作日日均', '近一月工作日日均'];

export default function OperationsOverview({ state, workbenchName, shortcuts, onNavigate }) {
  const [now] = useState(() => Date.now());
  const [mode, setMode] = useState('day');
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [history, setHistory] = useState(false);
  const data = useMemo(() => overviewTimeline(state, now), [state, now]);
  const month = selectedMonth || data.months.at(-1).id;
  const customers = useMemo(() => overviewCustomers(data, mode === 'month' ? month : null), [data, mode, month]);
  const metrics = overviewMetrics(data);

  return <div className="admin-page-stack ov-page">
    <section className="ov-hero" aria-labelledby="ov-welcome" style={{ '--ov-welcome-image': welcomeImage }}>
      <div className="ov-hero-content">
        <Title heading={1} component="h1" id="ov-welcome">欢迎使用<br/><span>{workbenchName}</span></Title>
        <Text className="ov-hero-time" size="small" type="secondary">更新于 {overviewDateTime(now)}（北京时间）</Text>
      </div>
    </section>

    <Card className="ov-panel ov-kpi-panel">
      <dl className="ov-kpis" aria-label="今日指标">
        {metrics.map(metric => <div key={metric.label}>
          <dt>{metric.label}</dt>
          <dd className="ov-kpi-value" title={metric.value == null ? undefined : number(metric.value) + ' ' + metric.unit}>
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
        </div>)}
      </dl>
    </Card>

    <nav aria-labelledby="ov-quick-title">
      <Card className="ov-panel ov-quick">
        <Title heading={6} component="h2" id="ov-quick-title">快速使用</Title>
        <div className="ov-grid ov-shortcuts">
          {shortcuts.map(({ id, label, Icon }) => <Button key={id} block theme="borderless" type="tertiary"
            icon={<Icon aria-hidden="true"/>} onClick={() => onNavigate(id)}>
            <span>{label}</span><IconChevronRight aria-hidden="true"/>
          </Button>)}
        </div>
      </Card>
    </nav>

    <section className="ov-section" aria-labelledby="ov-operations-title">
      <div className="ov-heading"><Title heading={4} component="h2" id="ov-operations-title">累计经营指标</Title></div>
      <div className="ov-grid ov-economy">
        <div className="ov-grid ov-averages">
          {data.averages.map(({ start, end, days, value }, index) => <Card key={index} className="ov-panel ov-average">
            <Title heading={6} component="h3">{windows[index]}</Title>
            <div className="ov-kpi-value" title={value == null ? undefined : number(value) + ' Token'}>
              <strong>{value == null ? '—' : compactCount(value)}</strong><span>Token</span>
            </div>
            <Text type="secondary" size="small">{start.slice(5)} 至 {end.slice(5)} · {days} 个工作日</Text>
          </Card>)}
        </div>
        <OverviewPlot title="月度工作日 Token 用量" note={'工作日按周一至周五 · 截至 ' + data.daily.at(-1).date}>
          <TimeSeriesChart label="月度工作日 Token 用量" labels={data.months.map(row => row.label)}
            compact legendAtTop showData={false} type="bar" stacked unit="Token" height={213}
            series={[
              ...data.supplyTypes.flatMap(([, label, color], index) =>
                index !== 2 || data.months.some(row => row.supply[index] > 0)
                  ? [{ label, color, values: data.months.map(row => row.supply[index]) }] : []),
              { label: '单日峰值（右轴）', color: '#6262bd', values: data.months.map(row => row.peak), rightAxis: true, showPoints: true },
            ]}/>
        </OverviewPlot>
      </div>
      <OverviewPlot title="月度活跃客户数" note={'按自然月去重 · 最后统计日 ' + data.daily.at(-1).date}>
        <TimeSeriesChart label="月度活跃客户数" labels={data.months.map(row => row.label)}
          compact legendAtTop showData={false} type="bar" stacked unit="个" height={224}
          series={data.customerTypes.flatMap(({ label, color }, index) =>
            index !== 2 || data.months.some(row => row.customers[index] > 0)
              ? [{ label, color, values: data.months.map(row => row.customers[index]) }] : [])}/>
      </OverviewPlot>
      <OverviewPlot title="每日 Token 用量（TPD）" note="近 30 个完整自然日 · 已计量 Token">
        <TimeSeriesChart label="每日 Token 用量" labels={data.daily.map(row => row.date.slice(5))}
          compact legendAtTop showData={false} type="area" unit="Token" height={262}
          series={[
            { label: '每日 Token', color: '#256be3', values: data.daily.map(row => row.total), showPoints: true },
            { label: '近 30 天均值', color: '#7d92b4', values: data.daily.map(() => data.mean), dashed: true },
          ]}/>
      </OverviewPlot>
    </section>

    <section className="ov-section" aria-labelledby="ov-customers-title">
      <div className="ov-heading ov-customer-heading">
        <Title heading={4} component="h2" id="ov-customers-title">客户核心指标</Title>
        <Space spacing={4} role="group" aria-label="客户统计周期">
          {[['day', '昨日'], ['month', '按月']].map(([id, label]) => <Button key={id} size="small"
            theme={mode === id ? 'light' : 'borderless'} type={mode === id ? 'primary' : 'tertiary'}
            aria-pressed={mode === id} onClick={() => setMode(id)}>{label}</Button>)}
        </Space>
        {mode === 'month' && <>
          <span className="sr-only" id="ov-month-label">选择统计月份</span>
          <Select className="ov-month" aria-labelledby="ov-month-label" size="small" value={month}
            onChange={setSelectedMonth} optionList={data.months.toReversed().map(row => ({ label: row.id, value: row.id }))}/>
        </>}
        <Button className="ov-history-link" size="small" theme="borderless" onClick={() => setHistory(true)}
          icon={<IconChevronRight aria-hidden="true"/>} iconPosition="right">查看历史数据</Button>
      </div>
      <div className="ov-grid ov-customers-grid">
        <CustomerActivity activity={customers}/>
        <Card className="ov-panel ov-tiers-panel">
          <div className="ov-panel-heading">
            <Title heading={6} component="h3">按日均 Token 用量分级</Title>
            <AnalysisHelp label="按日均 Token 用量分级">按客户已计量 Token 除以所选周期内的完整自然日数分档。计量待确认与无 Token 类调用分别列示。</AnalysisHelp>
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
      <Card className="ov-panel ov-types-panel">
        <Title heading={6} component="h3">客户类型分布</Title>
        <div className="ov-types">
          <CustomerDonut rows={customers.types} count={customers.count} label="客户类型分布" />
          {customers.types.filter((row, index) => index < 2 || row.value > 0).map(row => <div className="ov-mini" key={row.label}>
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
  return <Card className="ov-panel ov-plot">
    <div className="ov-plot-heading"><Title heading={6} component="h3">{title}</Title><Text type="secondary" size="small">{note}</Text></div>
    {children}
  </Card>;
}

function CustomerActivity({ activity }) {
  const peak = Math.max(activity.count, activity.previous);
  return <Card className="ov-panel ov-active-panel">
    <Title heading={6} component="h3">调用活跃客户数</Title>
    <div className="ov-active-value" aria-live="polite">
      <div className="ov-kpi-value"><strong>{number(activity.count)}</strong><span>个</span></div>
      <Change value={overviewChange(activity.count, activity.previous)}/>
      <Text size="small" type="secondary">新增客户 {number(activity.added)} 个</Text>
    </div>
    <div className="ov-activity-bars">
      {[[activity.label, activity.count], [activity.previousLabel, activity.previous]].map(([label, value], index) =>
        <div key={label}>
          <Text type="secondary" size="small">{label}</Text>
          <div aria-hidden="true"><Progress percent={peak ? value / peak * 100 : 0} showInfo={false}
            stroke={index ? '#9cbfff' : '#337cf2'} strokeWidth={7}/></div>
          <Text size="small" strong>{number(value)}</Text>
        </div>)}
    </div>
    <div className="ov-grid ov-activity-minis">
      {[['期末近 7 日活跃', activity.recent7], ['期末近 30 日活跃', activity.recent30], ['沉默客户', activity.dormant]].map(([label, value]) =>
        <div className="ov-mini" key={label}>
          <div><Text type="secondary" size="small">{label}</Text>
            {label === '沉默客户' && <AnalysisHelp label="沉默客户">截至期末已开户满 30 天，最近 30 天无调用记录。</AnalysisHelp>}
          </div>
          <strong>{number(value)}</strong>
        </div>)}
    </div>
  </Card>;
}

function CustomerDonut({ rows, count, label }) {
  return count > 0 ? <DonutChart rows={rows.filter(row => row.value > 0)} unit="个" label={label} height={142}
    centerValue={number(count)} centerLabel="活跃客户" showData={false}/>
    : <div className="ov-donut-empty"><Text type="secondary" size="small">暂无活跃客户</Text></div>;
}

function OverviewHistory({ state, activity, onClose }) {
  const [kind, setKind] = useState('customer');
  const [metric, setMetric] = useState('total');
  const [selected, setSelected] = useState(null);
  const historyContent = useRef(null);
  const lastRank = useRef(null);
  const label = kind === 'customer' ? '客户' : '模型';
  const otherKind = kind === 'customer' ? 'model' : 'customer';
  const ranked = useMemo(() => overviewRanks(activity.rows, kind, state, metric), [activity.rows, kind, state, metric]);
  const related = useMemo(() => selected
    ? overviewRanks(activity.rows.filter(row => row[kind === 'customer' ? 'tenantId' : 'modelId'] === selected.id), otherKind, state, metric)
    : [], [activity.rows, kind, metric, otherKind, selected, state]);
  useEffect(() => {
    if (selected) historyContent.current?.querySelector('.ov-detail-back')?.focus();
    else if (lastRank.current) {
      const control = [...(historyContent.current?.querySelectorAll('.ov-rank-name') || [])]
        .find(button => button.dataset.rankId === lastRank.current);
      control?.focus();
      lastRank.current = null;
    }
  }, [selected]);
  const renderToken = (value, row) => <span title={row.pending ? number(row.pending) + ' 次计量待确认' : undefined}>
    {value == null ? '—' : compactCount(value)}{value != null && row.pending > 0 ? ' · 部分待确认' : ''}
  </span>;
  const columns = [
    { title: '排名', key: 'rank', width: 62, render: (_, __, index) => index + 1 },
    { title: label, dataIndex: 'name', render: (name, row) =>
      <Button size="small" theme="borderless" className="ov-rank-name" data-rank-id={row.id}
        onClick={() => { lastRank.current = row.id; setSelected(row); }}>{name}</Button> },
    { title: '已计量 Token', dataIndex: 'total', align: 'right', render: renderToken },
    { title: '请求次数', dataIndex: 'calls', align: 'right', render: number },
    { title: '占比', key: 'share', align: 'right', render: (_, row) =>
      metric === 'total' ? row.total == null ? '—' : percent(row.total, activity.totals.total) : percent(row.calls, activity.rows.length) },
  ];
  return <AdminModal visible title={selected ? selected.name + ' · 用量详情' : '历史数据'} footer={null} closeOnEsc
    width="min(860px, calc(100vw - 24px))" onCancel={selected ? () => setSelected(null) : onClose}>
    <div className="ov-history" ref={historyContent}>
      <Text type="secondary" size="small">{dayOf(activity.start)} 至 {dayOf(activity.end - 1)} · 北京时间</Text>
      {selected ? <>
        <div><Button size="small" theme="borderless" className="ov-detail-back" icon={<IconArrowLeft aria-hidden="true"/>} onClick={() => setSelected(null)}>返回{label}排行</Button></div>
        <Space wrap><Text>已计量 Token {number(selected.total)}</Text><Text>请求次数 {number(selected.calls)}</Text></Space>
        <Table size="small" pagination={false} rowKey="id" dataSource={related} scroll={{ x: 410, y: 360 }}
          columns={[
            { title: kind === 'customer' ? '模型' : '客户', dataIndex: 'name' },
            { title: '已计量 Token', dataIndex: 'total', align: 'right', render: renderToken },
            { title: '请求次数', dataIndex: 'calls', align: 'right', render: number },
          ]}/>
      </> : <>
        <Tabs type="button" size="small" activeKey={kind} onChange={setKind} aria-label="排行对象">
          <Tabs.TabPane tab="客户排行" itemKey="customer"/>
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
  </AdminModal>;
}
