import { useMemo, useState } from 'react';
import { Button, Card, Modal, Space, Table, Toast, Typography } from '@douyinfe/semi-ui';
import { IconArrowLeft, IconArrowRight, IconMaximize, IconRefresh } from '@douyinfe/semi-icons';
import { TimeSeriesChart, DonutChart, RankingChart } from '../components/AnalyticsCharts';
import SavedFilterViews from '../components/SavedFilterViews';
import { FilterToolbar, FilterPresets, FilterReset } from '../components/FilterControls';
import { overviewBusiness, overviewPeriod, overviewPresets, overviewDateTime, overviewChange, compactCount } from './overview';
import { DateRange } from './AnalyticsFilters';
import { dayOf } from './analytics';
import AnalysisMetric, { AnalysisHelp as Help } from './AnalysisMetric';
import './overview.css';

const { Title, Text, Paragraph } = Typography;
const number = value => value == null ? '—' : value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
const percent = (value, total) => total ? `${(value / total * 100).toFixed(1)}%` : '—';
const signed = value => `${value > 0 ? '+' : ''}${number(value)}`;
export default function OperationsOverview({state}) {
  const [now, setNow] = useState(() => Date.now()), [periodId, setPeriodId] = useState('day');
  const [customRange, setCustomRange] = useState(null);
  const [detail, setDetail] = useState(null);
  const data = useMemo(() => overviewBusiness(state, now, periodId, customRange), [state, now, periodId, customRange]);
  const { period, previous } = data;
  const choosePeriod = (id, range = null) => { const current = Date.now(); if (!overviewPeriod(current, id, range)) { Toast.error('请选择不晚于今天且不超过 365 天的日期范围'); return; } setPeriodId(id); setCustomRange(range); setNow(current); setDetail(null); };
  const tokenChange = overviewChange(data.total, previous.total), monthlyActive = data.monthlyActive;
  const comparisonNote = `${period.comparison}：${overviewDateTime(period.previousStart)} 至 ${overviewDateTime(period.previousEnd)}。`;
  const topCustomers = data.customers.slice(0, 10), topModels = data.models.slice(0, 10);
  const selected = detail?.id ? data[detail.kind === 'customer' ? 'customers' : 'models'].find(r => r.id === detail.id) : null;
  const related = selected ? data.pairs.filter(row => detail.kind === 'customer' ? row.customerId === selected.id : row.modelId === selected.id).sort((a, b) => b.total - a.total) : [];
  const metrics = [
    { label: '注册用户总数', value: number(data.registrations.total), unit: '人', change: overviewChange(data.registrations.total, previous.registrations.total), breakdown: data.registrations, note: '截至统计结束时，累计注册的政企和个人用户数。同一用户只计一次。' },
    { label: '月活跃用户数', value: number(monthlyActive.total), unit: '人', change: overviewChange(monthlyActive.total, monthlyActive.previousTotal), comparison: '对比上月同期', monthly: true, comparisonNote: '与上月相同进度比较；上月天数不足时取全月。', note: '截至昨日，昨日所在自然月成功登录过的用户数，同一用户只计一次。按北京时间自然月统计，不受时间筛选影响。' },
    { label: '模型请求次数', value: compactCount(data.calls), unit: '次', change: overviewChange(data.calls, previous.calls), note: '所选时间内发起的模型请求次数，包含成功和失败请求。同一次请求的重试或服务商切换只计一次。' },
    { label: 'Token 使用总量', value: compactCount(data.total), unit: 'Token', change: tokenChange, note: '所选时间内，模型实际使用的输入和输出 Token 总量。缓存 Token 只计一次，图片张数、音频时长等不计入。' },
    { label: '日均 Token 调用量', value: data.rates.averageTpd == null ? '—' : compactCount(data.rates.averageTpd), unit: 'Token / 天', change: data.rates.averageTpd == null || data.previous.rates.averageTpd == null ? null : overviewChange(data.rates.averageTpd, data.previous.rates.averageTpd), note: '所选时段 Token 使用总量 ÷ 北京时间自然日数，包含无调用日。今日及包含今日的自定义时段按实际已发生用量计算，不预测全天用量。' },
    { label: '最大小时峰值消耗', value: data.peakHourlyTokens == null ? '—' : compactCount(data.peakHourlyTokens), unit: data.peakHourlyTokens == null ? '' : 'Token', change: overviewChange(data.peakHourlyTokens, previous.peakHourlyTokens), note: '所选时段内，单个北京时间自然小时 Token 消耗总量的最大值。未结束的小时只统计截至当前时刻的实际用量，不外推整小时。' },
  ];
  const openList = kind => setDetail({ kind });
  const openRow = (kind, row) => setDetail({ kind, id: row.id });
  const timeGroup = {
    label: '统计时间',
    text: period.id === 'custom' ? `自定义（${period.range}）` : period.label,
    scope: '用量指标、趋势、供给和排行；月活固定按昨日所在自然月统计',
  };
  return <div className="admin-page-stack ov-page">
    <Card>
      <FilterToolbar>
        <Text type="secondary">统计时间</Text>
        <FilterPresets value={periodId} items={overviewPresets} onChange={choosePeriod}>
          <DateRange start={dayOf(period.start)} end={dayOf(Math.max(period.start, period.end - 1))}
            trigger={<Button aria-label="自定义日期范围" aria-pressed={periodId === 'custom'}>{periodId === 'custom' ? period.range : '自定义'}</Button>}
            presets={[]} allowLongRange rangeHint="单次最多 365 天；单日按小时，多日按天汇总" onChange={range => choosePeriod('custom', range)}/>
        </FilterPresets>
        <Text type="secondary">北京时间</Text>
        <FilterReset onClick={() => choosePeriod('day')}/>
        <Button icon={<IconRefresh aria-hidden="true"/>} onClick={() => { setNow(Date.now()); Toast.success('数据已刷新'); }}>刷新</Button>
      </FilterToolbar>
      <div className="ov-view-row">
        <SavedFilterViews notify={Toast} scope="admin-overview-operations" value={{ periodId, customRange }}
          onApply={view => choosePeriod(view?.periodId, view?.customRange)} groups={[timeGroup]}
          saveDescription="保存用量统计时间；月活始终按昨日所在自然月统计。快捷时间在应用时按当前日期重新计算，自定义保存具体日期。"/>
        <Text type="tertiary" size="small">更新于 {new Date(now).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}</Text>
      </div>
    </Card>
    <div className="admin-analysis-metrics">{metrics.map(item => (
      <AnalysisMetric key={item.label} title={item.label} value={item.value} unit={item.unit} help={
        <div className="ov-help-content">
          <Paragraph>{item.note}</Paragraph>
          <Paragraph>{item.comparisonNote || comparisonNote}上期为 0 时，变化显示“—”。</Paragraph>
          {item.monthly && <>
            <Paragraph>统计月：{overviewDateTime(monthlyActive.start)} 至 {overviewDateTime(monthlyActive.end)}</Paragraph>
            <Paragraph>上一月：{overviewDateTime(monthlyActive.previousStart)} 至 {overviewDateTime(monthlyActive.previousEnd)}</Paragraph>
          </>}
        </div>
      }>
        {item.breakdown && <Space wrap><Text size="small">政企 {number(item.breakdown.enterprise)}</Text><Text size="small">个人 {number(item.breakdown.personal)}</Text></Space>}
        <Space wrap><Text type="tertiary" size="small">{item.comparison || period.comparison}</Text><Change value={item.change}/></Space>
      </AnalysisMetric>
    ))}</div>
    <div className="ov-chart-grid">
      {[
        { key: 'total', title: 'Token 用量趋势', label: 'Token 用量', unit: 'Token', change: tokenChange },
        { key: 'calls', title: '模型请求趋势', label: '模型请求次数', unit: '次', change: overviewChange(data.calls, previous.calls) },
      ].map(chart => <Card key={chart.key} title={<ChartTitle>{chart.title}</ChartTitle>}>
        <Paragraph type="secondary">{period.label} · {period.hourly ? '按小时汇总' : '按天汇总'}</Paragraph>
        {data.trend.length ? <TimeSeriesChart showData={false} labels={data.trend.map(row => row.label)}
          series={[{ label: chart.label, values: data.trend.map(row => row[chart.key]), color: '#3568f9' }]} unit={chart.unit} label={chart.title} height={225}/>
          : <Paragraph type="secondary" className="ov-empty">本期暂无调用记录</Paragraph>}
        <Space wrap>
          <Text size="small" type="tertiary">{period.comparison}</Text><Change value={chart.change}/>
          <Text size="small" type="tertiary">{period.partial ? '截至当前时刻 · 非完整自然日' : '完整自然日'}</Text>
        </Space>
      </Card>)}
    </div>
    <div className="ov-chart-grid">
      {[['customer', '客户', topCustomers], ['model', '模型', topModels]].map(([kind, label, rows]) => (
        <Card key={kind} title={<ChartTitle>{label}用量 Top 10</ChartTitle>}
          headerExtraContent={<Button size="small" theme="borderless" icon={<IconArrowRight aria-hidden="true"/>} iconPosition="right"
            aria-label={`查看全部${label}用量`} onClick={() => openList(kind)}>查看全部</Button>}>
          <Paragraph type="secondary" className="ov-caption">{kind === 'customer'
            ? `前 10 名客户合计占平台用量 ${percent(topCustomers.reduce((sum, row) => sum + row.total, 0), data.total)}`
            : '按对外模型汇总 · 多个服务商合并统计'}</Paragraph>
          <UsageTable rows={rows} kind={kind} total={data.total} onSelect={row => openRow(kind, row)} label={`${label}用量排行`}/>
        </Card>
      ))}
      <Composition title="供给构成" caption="Token 用量占比" empty="本期暂无 Token 用量" total={data.total} unit="Token"
        centerLabel="Token 总量" centerValue={compactCount(data.total)} rows={[
          { label: '自产', value: data.self, color: '#3568f9' }, { label: '引入', value: data.partner, color: '#13aaa7' },
        ]} help="按承接客户调用的实际供给来源汇总 Token 用量。自产指自有推理服务，引入指外部服务；占比以本期平台 Token 总量为分母。"/>
      <Composition title="用户构成" caption="累计注册用户" empty="暂无注册用户" total={data.registrations.total} unit="人"
        centerLabel="注册用户总数" centerValue={number(data.registrations.total)} rows={[
          { label: '政企', value: data.registrations.enterprise, color: '#3568f9' }, { label: '个人', value: data.registrations.personal, color: '#8b5cf6' },
        ]} help="截至统计结束时的注册用户构成，政企与个人数量之和等于注册用户总数。按用户 ID 去重，分类沿用用户分析的身份记录。"/>
      {[['customer', '客户', data.customers], ['model', '模型', data.models]].map(([kind, label, rows]) =>
        <CallRankPanel key={kind} title={`模型调用次数 Top 10 ${label}`} rows={rows} total={data.calls}
          limits={kind === 'customer' ? [30, 50, 100] : [30, 50]} onChoose={id => openRow(kind, rows.find(row => row.id === id))}/>)}
    </div>
    {detail && <Modal visible title={selected ? `${selected.name} · 用量详情` : `全部${detail.kind === 'customer' ? '客户' : '模型'}用量`}
      width="min(800px, calc(100vw - 32px))" closeOnEsc footer={null} onCancel={() => setDetail(null)}>
      <div className="admin-analytics-fields">
        <Paragraph type="secondary">{period.label} · {overviewDateTime(period.start)} 至 {overviewDateTime(period.end)}</Paragraph>
        {selected ? <>
          <div><Button size="small" theme="borderless" icon={<IconArrowLeft aria-hidden="true"/>}
            onClick={() => openList(detail.kind)}>返回全部{detail.kind === 'customer' ? '客户' : '模型'}</Button></div>
          <dl className="ov-detail-summary">
            {[['Token 用量', number(selected.total)], ['模型请求次数', number(selected.calls)], ['占平台用量', percent(selected.total, data.total)],
              ['自产 / 引入', `${percent(selected.self, selected.total)} / ${percent(selected.partner, selected.total)}`]].map(([label, value]) =>
              <div key={label}><dt><Text type="tertiary">{label}</Text></dt><dd><Text strong>{value}</Text></dd></div>)}
          </dl>
          <Table size="small" pagination={false} rowKey={row => `${row.customerId}/${row.modelId}`}
            dataSource={related} scroll={{ x: 'max(100%, 420px)', y: 360 }} columns={[
              { title: detail.kind === 'customer' ? '使用模型' : '调用客户', dataIndex: detail.kind === 'customer' ? 'modelName' : 'customerName' },
              { title: 'Token 用量', dataIndex: 'total', align: 'right', render: number },
              { title: '模型请求次数', dataIndex: 'calls', align: 'right', render: number },
            ]}/>
        </> : <UsageTable rows={data[detail.kind === 'customer' ? 'customers' : 'models']} kind={detail.kind} total={data.total}
          onSelect={row => openRow(detail.kind, row)} label={`全部${detail.kind === 'customer' ? '客户' : '模型'}用量`} expanded/>}
      </div>
    </Modal>}
  </div>;
}

function ChartTitle({ children }) {
  return <Title heading={5} component="h2">{children}</Title>;
}


function Change({ value }) {
  value = value == null ? null : Number(value.toFixed(2)) || 0;
  return <Text size="small" type={value == null || value === 0 ? 'tertiary' : value > 0 ? 'success' : 'warning'}>
    {value == null ? '—' : `${signed(value)}%`}
  </Text>;
}

function UsageTable({ rows, kind, total, onSelect, label, expanded }) {
  const customer = kind === 'customer';
  return <section aria-label={label}>
    <Table size="small" pagination={false} rowKey="id" dataSource={rows} empty="本期暂无调用记录"
      scroll={{ x: 'max(100%, 380px)', ...(expanded ? { y: 360 } : {}) }} columns={[
        { title: '排名', key: 'rank', width: 68, render: (_, __, index) => index + 1 },
        { title: customer ? '客户' : '模型', dataIndex: 'name', render: (name, row) =>
          <Button size="small" theme="borderless" className="ov-rank-name" title={name} onClick={() => onSelect(row)}>{name}</Button> },
        { title: 'Token 用量', dataIndex: 'total', align: 'right', render: value => <span title={`${number(value)} Token`}>{compactCount(value)}</span> },
        customer ? { title: '用量占比', key: 'share', align: 'right', render: (_, row) => percent(row.total, total) }
          : { title: '模型请求次数', dataIndex: 'calls', align: 'right', render: value => <span title={`${number(value)} 次`}>{compactCount(value)}</span> },
      ]}/>
  </section>;
}

function Composition({ title, caption, empty, total, unit, centerLabel, centerValue, rows, help }) {
  return <Card title={<ChartTitle>{title}</ChartTitle>} headerExtraContent={<Help label={title}>{help}</Help>}>
    <Paragraph type="secondary">{caption}</Paragraph>
    {total > 0 ? <DonutChart showData={false} rows={rows} unit={unit} label={`${title}环形图`} height={190}
      centerValue={centerValue} centerLabel={centerLabel}/> : <Paragraph className="ov-empty" type="secondary">{empty}</Paragraph>}
    <div className="ov-composition-values">
      {rows.map(row => <div key={row.label}>
        <Space><span className="ov-dot" style={{ background: row.color }}/><Text>{row.label}</Text><Text type="secondary">{percent(row.value, total)}</Text></Space>
        <Text strong title={`${number(row.value)} ${unit}`}>{unit === 'Token' ? compactCount(row.value) : number(row.value)} {unit}</Text>
      </div>)}
    </div>
  </Card>;
}

function RankingSegments({ items, value, onChange, label }) {
  return <div className="admin-time-presets" role="group" aria-label={label}>
    {items.map(([id, name]) => <Button key={id} size="small" theme={value === id ? 'solid' : 'light'}
      aria-pressed={value === id} onClick={() => onChange(id)}>{name}</Button>)}
  </div>;
}

function CallRankPanel({ title, rows, total, limits, onChoose }) {
  const [scale, setScale] = useState('linear');
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(30);
  const ranked = rows.filter(row => row.id !== '__unknown__' && row.calls > 0).sort((a, b) => b.calls - a.calls || a.id.localeCompare(b.id));
  const top = ranked.slice(0, 10), expanded = ranked.slice(0, limit);
  const scaleControl = <RankingSegments label={`${title}刻度`} items={[[ 'linear', '线性' ], [ 'log', '指数' ]]} value={scale} onChange={setScale}/>;
  const choose = id => { setOpen(false); onChoose(id); };
  const chart = values => values.length
    ? <RankingChart showData={false} rows={values} metric="calls" unit="次" collection={rows} scale={scale} onChoose={choose}/>
    : <Paragraph type="secondary" className="ov-empty">所选范围暂无排行数据</Paragraph>;
  return <>
    <Card title={<ChartTitle>{title}</ChartTitle>} headerExtraContent={
      <Button size="small" theme="borderless" icon={<IconMaximize aria-hidden="true"/>} aria-label={`放大${title}排行榜`} onClick={() => setOpen(true)}/>
    }>
      <div className="ov-rank-controls">
        <Text size="small" type="secondary">Top 10 占比 {percent(top.reduce((sum, row) => sum + row.calls, 0), total)}</Text>
        <Space wrap>{scaleControl}<Help label="排行刻度">指数模式使用 log10(数值＋1) 压缩条长；排序、标签和悬浮数值保持原始值。</Help></Space>
      </div>
      {chart(top)}
    </Card>
    {open && <Modal visible title={title.replace('Top 10', `Top ${limit}`)} closeOnEsc footer={null}
      width="min(1100px, calc(100vw - 32px))" onCancel={() => setOpen(false)}>
      <div className="admin-analytics-fields">
        <Paragraph type="secondary">共 {ranked.length} 个有调用的对象，当前展示 {expanded.length} 个 · 单位：次 · 点击条形查看明细</Paragraph>
        <div className="ov-rank-controls">
          <RankingSegments label="排行数量" value={limit} onChange={setLimit} items={limits.map(value => [value, `Top ${value}`])}/>
          {scaleControl}
        </div>
        <div className="ov-expanded-scroll">{chart(expanded)}</div>
      </div>
    </Modal>}
  </>;
}
