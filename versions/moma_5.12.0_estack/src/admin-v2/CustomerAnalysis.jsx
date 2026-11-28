import { useChannelText } from './channel-language';

import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { EMessage } from '@cmss-bfs/haloe/dist/es/index.js';
import {
  XaButton as Button, XaCard as Card, XaEmpty as Empty, XaInput as Input, XaModal as Modal,
  XaSelect as Select, XaSpace as Space, XaTabs as Tabs, XaTag as Tag, XaTypography as Typography,
} from './xa24/HaloComponents.jsx';
import { XaDatePicker as DatePicker } from './xa24/HaloDatePicker.jsx';
import Table from './xa24/HaloTable.jsx';
import { ChevronLeft, Download, User } from 'lucide-react';
import AdminPageHeading from './AdminPageHeading';
import { DonutChart, HorizontalBarChart, TimeSeriesChart } from '../components/AnalyticsCharts';
import { analysisCsv } from './operations-analysis';
import CustomerCallDetail, { exportCalls, limitColumns, limitRows, modelColumns } from './CustomerCallDetail';
import * as sample from './customer-analysis-demo';
import CustomerFlow from './CustomerFlow';
import { customerFlowSnapshot, flowAmount, flowPercent, observationMinutes, refreshMs } from './customer-flow-demo';
import './customer-analysis.css';

const { Text, Title } = Typography;
const historicalDay = '2026-11-18';
const liveDay = '2026-11-19';
const weekStart = '2026-11-13';
const titleHome = '租户数据';
const titleInfo = '租户信息总览';
const titleFlow = '租户流量拓扑';
const customers = sample.demoTenants;
const customerOptions = customers.map(({ id, name }) => ({ value: id, label: name }));
const detailCustomer = customers.find(row => row.name === sample.beijing);
const lookupFields = [
  { value: 'tenantId', label: '租户 ID', example: detailCustomer.id },
  { value: 'userId', label: '用户 ID', example: sample.demoCallUser.id },
  { value: 'tenantName', label: '租户名称' },
];
const modelOptions = sample.models.filter(row => row[0] !== '未知').map(([model]) => ({ label: model, value: model }));
const dailyCounts = [
  3370, 2530, 2530, 3410, 3430, 1530, 1450, 3450, 3510, 3420, 3480, 3530,
  2590, 2500, 3300, 3270, 3200, 3260, 2960, 2460, 2020, 2730, 2820, 2320,
  3470, 3700, 2540, 2630, 4460, 3450, 3554,
];
const dailyDates = dailyCounts.map((_, index) => new Date(Date.UTC(2026, 9, 19 + index)).toISOString().slice(0, 10));
const empty = message => <Empty description={message}/>;
const fmt = value => Number(value).toLocaleString('zh-CN');
const date = (value, fallback) => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && value <= liveDay ? value : fallback;
const disabledDate = value => value > new Date(2026, 10, 19, 23, 59, 59);
const inRange = (day, { start, end }) => start <= day && day <= end;
const homeHref = range => '#/admin-2/customer-analysis?' + new URLSearchParams(range);
const detailHref = (customer, range, source) => '#/admin-2/customer-analysis-detail?' + new URLSearchParams({
  ...range, customer: customers.find(row => row.name === customer).id, source,
});

function exportCsv(filename, headings, rows) {
  const url = URL.createObjectURL(new Blob([analysisCsv(headings, rows)], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename + '.csv';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function CopyTitle({ children, note, id }) {
  return <div className="ca-title"><Title id={id} heading={5} component="h2" className="xa24-card-title">{children}</Title>
    {note && <Text type="tertiary" size="small">{note}</Text>}</div>;
}
function Section({ title, note, children, className = '' }) {
  return <Card className={'ca-card xa24-page-card ' + className}>{title && <CopyTitle note={note}>{title}</CopyTitle>}{children}</Card>;
}
function ExportButton({ onClick, disabled, children = '数据导出' }) {
  return <Button theme="light" type="tertiary" icon={<Download size={16} aria-hidden="true"/>} onClick={onClick} disabled={disabled}>{children}</Button>;
}
function DateFields({ draft, onChange, single = false }) {
  const update = (start, end) => onChange({ ...draft, start, end });
  return <DatePicker className={single ? 'ca-date-single' : 'ca-date-range'} aria-label={single ? '统计日期' : '日期范围'} type={single ? 'date' : 'dateRange'}
    value={single ? draft.end : [draft.start, draft.end]} format="yyyy-MM-dd" showClear={false}
    disabledDate={disabledDate} onChangeWithDateFirst={false}
    onChange={value => {
      if (single && typeof value === 'string' && value) update(value, value);
      if (!single && Array.isArray(value) && value.every(Boolean)) update(value[0], value[1]);
    }}/>;
}
function Metrics({ rows }) {
  return <div className="ca-metrics">{rows.map(([label, value, unit]) => <div className="ca-metric xa24-metric-card" key={label}>
    <span className="ca-dot" aria-hidden="true"/><div><Text type="secondary" size="small">{label}</Text>
      <div className="ca-reading"><strong>{value}</strong>{unit && <Text type="tertiary" size="small">{unit}</Text>}</div>
    </div>
  </div>)}</div>;
}
function Ring({ title, data, number, center, reverse = false, available = true }) {
  return <Section title={title}>{available ? <div className={'ca-ring' + (reverse ? ' ca-ring-reverse' : '')}>
    <DonutChart rows={data.map(([label, value, , , color]) => ({ label, value, color }))}
      label={title} centerValue={number} centerLabel={center} height={216} showData={false} seamless/>
    <dl>{data.map(([label, , amount, percent, color]) => <div className="ca-legend-row" key={label}>
      <i style={{ backgroundColor: color }} aria-hidden="true"/><dt>{label}</dt><dd>{amount}</dd><dd>{percent}</dd>
    </div>)}</dl>
  </div> : empty('所选条件暂无演示数据')}</Section>;
}
function Rankings({ title, range, rows, direction, onOpen }) {
  return <Section title={title + '（亿 Token）'} note={direction && '当日 vs 前日'} className="ca-rank-panel">
    {rows.length ? <ol className="ca-ranks">{rows.map(([name, description, amount, change], index) => <li key={name}>
      <span>{index + 1}.</span><User size={14} className={'ca-rank-icon ca-rank-' + (index + 1)} aria-hidden="true"/>
      <div className="ca-rank-copy">
        <a href={detailHref(name, range, 'history')} onClick={onOpen} title={name}>{name}</a>
        <small title={description}>{description}</small>
      </div>
      <div className="ca-rank-value">{amount}{change && <small className={'ca-' + direction}>
        {direction === 'up' ? '↑ ' : '↓ -'}{change}
      </small>}</div>
    </li>)}</ol> : empty('所选日期暂无榜单样本')}
  </Section>;
}

function TenantLookup({ lookup, onChange, range, onOpen }) {
  const { field, keyword, submitted } = lookup;
  const { label, example } = lookupFields.find(option => option.value === field);
  const missing = submitted === '';
  const matches = submitted ? sample.lookupDemoTenants(field, submitted) : [];
  const prompt = `请输入${label}`;
  return <Section className="ca-filter ca-tenant-lookup">
    <CopyTitle id="ca-lookup-title">租户实时数据查询</CopyTitle>
    <search>
      <form aria-labelledby="ca-lookup-title" noValidate onSubmit={event => {
        event.preventDefault();
        const next = keyword.trim();
        onChange({ ...lookup, submitted: next });
        if (!next) event.currentTarget.querySelector('#ca-lookup-keyword')?.focus();
      }}>
        <Select aria-label="查询条件" optionList={lookupFields} value={field} showClear={false}
          onChange={value => onChange({ field: value, keyword: '', submitted: null })}/>
        <label className="sr-only" htmlFor="ca-lookup-keyword">{label}</label>
        <Input id="ca-lookup-keyword" className="ca-lookup-input" name="keyword" value={keyword} required autoComplete="off" spellCheck={false}
          placeholder={example ? `${prompt}（如 ${example}）` : prompt}
          aria-invalid={missing || undefined} aria-describedby={missing ? 'ca-lookup-status' : undefined}
          onChange={value => onChange({ ...lookup, keyword: value, submitted: null })}/>
        <Button theme="solid" htmlType="submit">查询</Button>
      </form>
      <div id="ca-lookup-status" role="status" className="ca-lookup-status" data-invalid={missing}>
        {missing ? prompt : submitted ? (matches.length ? `找到 ${matches.length} 个租户` : '未找到匹配的租户') : null}
      </div>
      {matches.length > 0 && <ul aria-label="匹配租户" className="ca-lookup-results">
        {matches.map(tenant => <li key={tenant.id}>
          <a href={detailHref(tenant.name, range, 'live')} onClick={onOpen}>{tenant.name}</a>
          <span>租户 ID {tenant.displayId}</span>
          <span>{tenant.liveTokens == null ? '暂无实时用量样本' : `今日调用量 ${tenant.liveTokens} 亿 Token`}</span>
        </li>)}
      </ul>}
    </search>
  </Section>;
}

function Overview({ params }) {
  const end = date(params.get('end'), historicalDay);
  const start = date(params.get('start'), end);
  const range = { start: start <= end ? start : end, end, mode: params.get('mode') === 'range' ? 'range' : 'day' };
  const [savedList] = useState(() => history.state?.customerAnalysisList);
  const [draft, setDraft] = useState(savedList?.draft ?? range);
  const [lookup, setLookup] = useState(savedList?.lookup ?? { field: 'tenantId', keyword: '', submitted: null });
  useLayoutEffect(() => {
    if (savedList) window.scrollTo({ top: savedList.scrollY, behavior: 'instant' });
  }, [savedList]);
  const dayMode = draft.mode === 'day';
  const hasSnapshot = range.start === historicalDay && range.end === historicalDay;
  const amount = dailyCounts[dailyDates.indexOf(range.end)];
  const hasSelectedDay = range.mode === 'day' && Number.isFinite(amount);
  const trendStart = range.mode === 'day' ? dailyDates[0] : range.start;
  const points = dailyDates.flatMap((day, index) => day >= trendStart && day <= range.end ? [[day, dailyCounts[index]]] : []);
  const metrics = sample.metrics.map(([label, value, unit], index) => [
    label, hasSnapshot ? value : index === 0 && hasSelectedDay ? fmt(amount) : '—', unit,
  ]);
  const download = () => exportCsv('租户数据_' + range.end, ['统计日期', '区块', '指标或租户', '数值', '单位或占比'], [
    ...sample.liveCustomers.map(([, name, value]) => [liveDay, '今日实时', name, Number(value), '亿 Token']),
    ...metrics.map(([label, value, unit]) => [range.end, '数据概览', label, value, unit]),
    ...points.map(([day, count]) => [day, '日活跃租户数趋势', '日活跃租户数', count, '个']),
    ...(hasSnapshot ? [
      ...sample.categories.map(([label, count, , percent]) => [range.end, '租户分类情况', label, count, percent]),
      ...[['租户调用量排行榜', sample.usageRanks], ['Token 用量增长', sample.gains], ['Token 用量下降', sample.drops]]
        .flatMap(([group, rows]) => rows.map(([name, , value, change]) => [range.end, group, name, Number(value), change || '亿 Token'])),
    ] : []),
  ]);
  function openCustomer(event) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    history.replaceState({ ...history.state, customerAnalysisList: { draft, lookup, scrollY: window.scrollY } }, '');
    location.hash = event.currentTarget.hash;
    history.replaceState({ ...history.state, fromCustomerAnalysisList: true }, '');
  }
  function query(event) {
    event.preventDefault();
    location.hash = homeHref(draft);
  }
  return <>
    <AdminPageHeading title={titleHome} className="xa24-entry-header"><Space><Text type="tertiary" size="small">演示数据</Text><ExportButton onClick={download}/></Space></AdminPageHeading>
    <Section title="租户 Token 总调用量" note="今日实时">
      <div className="ca-live">{sample.liveCustomers.map(([code, name, value], index) => <a
        href={detailHref(name, range, 'live')} onClick={openCustomer} className={'ca-live-customer ca-top-' + (index + 1)} key={code}>
        <span className="ca-place">{index + 1}</span>
        <div className="ca-live-copy"><div className="ca-live-line"><span title={'CIDC-U-' + code + '…'}>CIDC-U-{code}…</span>
          <strong>{value} <small>亿</small></strong></div><small title={name}>{name}</small></div>
      </a>)}</div>
    </Section>
    <TenantLookup lookup={lookup} onChange={setLookup} range={range} onOpen={openCustomer}/>
    <Section className="ca-filter"><form onSubmit={query}>
      <div className="ca-segment" aria-label="统计方式" role="group">
        <Button theme={dayMode ? 'borderless' : 'light'} aria-pressed={dayMode} onClick={() => setDraft({ ...draft, start: draft.end, mode: 'day' })}>按日</Button>
        <Button theme={dayMode ? 'light' : 'borderless'} aria-pressed={!dayMode} onClick={() => setDraft({ ...draft, mode: 'range' })}>按时间范围</Button>
      </div>
      <DateFields draft={draft} onChange={setDraft} single={dayMode}/>
      <span className="ca-query-right"><Button theme="solid" htmlType="submit">查询</Button></span>
    </form></Section>
    <Section title="数据概览"><Metrics rows={metrics}/></Section>
    <div className="ca-two">
      <Ring title="租户分类情况" data={sample.categories} number="3,554" center="总租户数" available={hasSnapshot}/>
      <Section title="日活跃租户数趋势（个）">
        {points.length ? <TimeSeriesChart compact legendAtTop showData={false} type="area" unit="个" label="日活跃租户数趋势"
          height={238} domain={[0, 5000]} labels={points.map(row => row[0])}
          series={[{ label: '日活跃租户数', color: '#0874f8', values: points.map(row => row[1]), smooth: true }]}/> : empty('所选日期暂无趋势样本')}
      </Section>
    </div>
    <div className="ca-three">
      <Rankings onOpen={openCustomer} title="租户调用量排行榜" rows={hasSnapshot ? sample.usageRanks : []} range={range}/>
      <Rankings onOpen={openCustomer} title="Token 用量增长 TOP10 租户" rows={hasSnapshot ? sample.gains : []} range={range} direction="up"/>
      <Rankings onOpen={openCustomer} title="Token 用量下降 TOP10 租户" rows={hasSnapshot ? sample.drops : []} range={range} direction="down"/>
    </div>
  </>;
}

const flowTime = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
});
function initialFocus(snapshot) {
  const cluster = snapshot.clusters.find(item => item.tpm > 0);
  return { gateway: cluster?.gateway || '', cluster: cluster?.id || '' };
}
function Traffic({ initialCustomer }) {
  const translateLabel = useChannelText();
  const initial = { customer: initialCustomer.id, model: '' };
  const [draft, setDraft] = useState(initial);
  const [applied, setApplied] = useState(initial);
  const [focus, setFocus] = useState(() => initialFocus(customerFlowSnapshot(0)));
  const [nodeId, setNodeId] = useState(null);
  const [view, setView] = useState('current');
  const [running, setRunning] = useState(true);
  const [frame, setFrame] = useState(() => ({ index: 0, time: Date.now() }));
  const observed = applied.customer === detailCustomer.id;
  const snapshot = useMemo(() => customerFlowSnapshot(frame.index, applied.model), [frame.index, applied.model]);
  const node = observed ? snapshot.clusters.find(item => item.id === nodeId) : null;
  const hasSummary = observed && !applied.model;
  const active = observed && running && view === 'current';
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setFrame(previous => ({ index: previous.index + 1, time: Date.now() })), refreshMs);
    return () => clearInterval(timer);
  }, [active]);
  return <div className="ca-detail-stack">
    <form id="ca-flow-export" hidden onSubmit={event => {
      event.preventDefault();
      if (!observed || view !== 'current' || !snapshot.edges.length) { EMessage.info('暂无可导出的流量样本'); return; }
      exportCsv('租户流量拓扑', ['起点', '去向', '模型', '实时 TPM', '占上游流量'],
        snapshot.edges.map(edge => [edge.fromName, edge.toName, edge.model, edge.tpm, flowPercent(edge.tpm, edge.total)]));
    }}/>
    <Section className="ca-filter"><form onSubmit={event => {
      event.preventDefault();
      setApplied(draft);
      setFrame({ index: 0, time: Date.now() });
      setFocus(initialFocus(customerFlowSnapshot(0, draft.model)));
      setNodeId(null);
    }}>
      <label>{translateLabel("租户")}<Select aria-label={translateLabel("租户")} filter optionList={customerOptions} value={draft.customer}
        onChange={customer => setDraft({ ...draft, customer })}/></label>
      <label>{translateLabel("模型")}<Select aria-label="拓扑模型" filter showClear placeholder="全部模型 / 输入关键词" optionList={modelOptions}
        value={draft.model || undefined} onChange={model => setDraft({ ...draft, model: model || '' })}/></label>
      <Button theme="solid" htmlType="submit">查询</Button>
    </form></Section>
    <div className="ca-rate-columns">
      <Section className="ca-rate">
        <div className="ca-title ca-spread"><Title heading={5} component="h2">实时调用速率</Title>
          <a className="ca-action-link" href="#/admin-2/traffic-limits">{translateLabel("限流配置")}</a>
        </div>
        <Metrics rows={[[ 'RPM', observed ? fmt(snapshot.calls / observationMinutes) : '—'], ['TPM', observed ? flowAmount(snapshot.tpm) : '—']]}/>
      </Section>
      <Section title="调用汇总">
        <Metrics rows={[[ '累计调用', '13.37万'], ['成功次数', '13.23万'], ['失败次数', '1,379'], ['成功率', '98.97%']]
          .map(([label, value]) => [label, hasSummary ? value : '—'])}/>
        {hasSummary && <>
          <div className="ca-status-bar" role="img" aria-label="请求状态占比">
            {sample.liveStates.map(([name, , color, width]) => <i key={name} style={{ width: width + '%', backgroundColor: color }}/>)}
          </div>
          <div className="ca-status-key">{sample.liveStates.map(([name, value, color]) => <span key={name}>
            <i style={{ backgroundColor: color }}/>{name} {value}</span>)}</div>
        </>}
      </Section>
    </div>
    <Section>
      <Tabs type="button" activeKey={view} onChange={setView}>
        <Tabs.TabPane tab="当前观测" itemKey="current">
          <div className="ca-flow">
            <div className="ca-spread ca-flow-heading">
              <CopyTitle note="点击网关或集群聚焦分流">流量去向</CopyTitle>
              {observed && <Space>
                <Text type="tertiary" size="small">演示观测 · {flowTime.format(frame.time)}</Text>
                <Button size="small" theme="borderless" onClick={() => setRunning(previous => !previous)}>
                  {running ? '暂停更新' : '继续更新'}
                </Button>
              </Space>}
            </div>
            {observed ? <CustomerFlow snapshot={snapshot} focus={focus} onFocus={setFocus} onDetails={setNodeId} running={active}/>
              : empty('所选租户暂无流量观测样本')}
          </div>
        </Tabs.TabPane>
        <Tabs.TabPane tab="历史流量" itemKey="history">{empty('暂无历史流量样本')}</Tabs.TabPane>
      </Tabs>
      {node && <Modal title={node.name} visible footer={null} onCancel={() => setNodeId(null)}>
        {node && <dl className="ca-node-modal">
          <div><dt>网关</dt><dd>{node.gateway || '—'}</dd></div><div><dt>请求数</dt><dd>{fmt(node.requests)}</dd></div>
          <div><dt>实时 TPM</dt><dd>{flowAmount(node.tpm)}</dd></div><div><dt>{translateLabel("模型")}</dt><dd>{node.model || '—'}</dd></div>
          <div><dt>产能 TPM</dt><dd>{flowAmount(node.capacity)}</dd></div>
          <div><dt>剩余 TPM</dt><dd>{flowAmount(node.capacity == null ? null : Math.max(0, node.capacity - node.tpm))}</dd></div>
          <div><dt>负载</dt><dd>{node.capacity ? flowPercent(node.tpm, node.capacity) : '—'}</dd></div>
          <div><dt>实例数</dt><dd>{node.registered ? node.instances.length : '—'}</dd></div>
        </dl>}
      </Modal>}
    </Section>
  </div>;
}

function CustomerInfo({ customer, initial }) {
  const translateLabel = useChannelText();
  const [draft, setDraft] = useState(initial);
  const [query, setQuery] = useState(initial);
  const [section, setSection] = useState('models');
  const [tagged, setTagged] = useState(false);
  const ownsSample = customer.id === detailCustomer.id;
  const whole = ownsSample && inRange(weekStart, query) && inRange(liveDay, query);
  const keyword = query.model.trim().toLowerCase();
  const matchesModel = name => name.toLowerCase().includes(keyword);
  const hasSummary = whole && !query.model.trim();
  const models = whole ? sample.models.filter(row => matchesModel(row[0])) : [];
  const minutes = useMemo(() => ownsSample && inRange(liveDay, query)
    ? sample.detailRows.filter(row => row[1].toLowerCase().includes(keyword)) : [], [ownsSample, query, keyword]);
  const limits = ownsSample ? limitRows.filter(row => matchesModel(row.model)) : [];
  const identity = [
    ['租户名称', customer.name], ['租户 ID', customer.displayId],
    ['租户类型', ownsSample ? sample.enterpriseCustomer : '—'],
    ['省份 / 城市 / 区县', ownsSample ? '江苏　苏州　相城区分公司' : '—'],
    ['活跃天数', hasSummary ? '7 天' : '—'], ['专业公司名称', '—'],
  ];
  const [grain, setGrain] = useState('minute');
  const downloads = {
    calls: () => exportCalls(minutes, grain, query.end, exportCsv),
    models: () => exportCsv('模型使用概览_' + query.end, modelColumns.map(column => column.title),
      models.map(row => [...row.slice(0, -1).map((value, index) => index === 0 || String(value).includes('%') ? value : Number(String(value).replaceAll(',', ''))), row.at(-1).join(' / ')])),
    limits: () => exportCsv('用户模型限流信息', limitColumns.map(column => column.title),
      limits.map(row => limitColumns.map(column => row[column.dataIndex]))),
  };
  const canExport = section === 'models' ? models.length : section === 'calls' ? minutes.length : limits.length;
  return <div className="ca-detail-stack">
    <form id="ca-info-export" hidden onSubmit={event => {
      event.preventDefault();
      if (canExport) downloads[section]();
      else EMessage.info('所选条件暂无可导出的样本');
    }}/>
    <Section className="ca-filter"><form onSubmit={event => { event.preventDefault(); setQuery(draft); }}>
      <label>{translateLabel("模型")}<Input aria-label={translateLabel("模型展示名称")} placeholder="输入模型展示名称" value={draft.model}
        onChange={model => setDraft({ ...draft, model })}/></label>
      <label>{translateLabel("日期范围")}<DateFields draft={draft} onChange={setDraft}/></label>
      <Button theme="solid" htmlType="submit">查询</Button>
      <ExportButton onClick={downloads[section]} disabled={!canExport}>导出表格</ExportButton>
    </form></Section>
    <Section title="租户基础信息">
      <dl className="ca-identity">{identity.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>
        {value}{label === '租户类型' && ownsSample && (tagged ? <Tag size="small" color="blue">大租户</Tag>
          : <Button theme="borderless" size="small" onClick={() => setTagged(true)}>添加大租户标签</Button>)}
      </dd></div>)}</dl>
    </Section>
    <div className="ca-two">
      <Ring title="请求状态分布" data={sample.requestStates} number="145.7 万次" center="总请求数" reverse available={hasSummary}/>
      <Ring title="Token 分布（亿 Token）" data={sample.tokenParts} number="1855.61" center="总 Token" reverse available={hasSummary}/>
    </div>
    <Section title="客户端分布">
      {hasSummary ? <HorizontalBarChart label="客户端分布" unit="%" rows={sample.clientMix.map(([name, value, color]) => ({ name, value, color }))}
        height={248}/> : empty('所选条件暂无客户端样本')}
    </Section>
    <div className="ca-lower"><Tabs type="button" activeKey={section} onChange={setSection}>
      <Tabs.TabPane itemKey="models" tab="模型使用概览"><Section>
        <Table size="small" pagination={false} rowKey="model" scroll={{ x: 'max(100%, 1060px)' }}
          columns={modelColumns} dataSource={models.map(row => Object.fromEntries(modelColumns.map((column, index) => [column.dataIndex, row[index]])))}
          empty={empty('所选条件暂无模型用量样本')}/>
      </Section></Tabs.TabPane>
      <Tabs.TabPane itemKey="calls" tab="租户调用明细"><Section>
        {section === 'calls' && <CustomerCallDetail rows={minutes} grain={grain} setGrain={setGrain}
          showSampleTrend={whole} matchesModel={matchesModel}/>}
      </Section></Tabs.TabPane>
      <Tabs.TabPane itemKey="limits" tab="用户模型限流信息"><Section>
        <Table size="small" rowKey="model" columns={limitColumns} pagination={false} dataSource={limits}
          empty={empty('暂无该租户的用户模型限流样本')}/>
      </Section></Tabs.TabPane>
    </Tabs></div>
  </div>;
}

export default function CustomerAnalysis({ detail, params }) {
  const [tab, setTab] = useState(params.get('tab') === 'flow' ? 'flow' : 'info');
  useEffect(() => { if (detail) window.scrollTo({ top: 0, behavior: 'instant' }); }, [detail]);
  if (!detail) return <div className="admin-page-stack xa24-page ca-page"><Overview params={params}/></div>;
  const customer = customers.find(item => item.id === params.get('customer'));
  const sourceRange = { start: date(params.get('start'), historicalDay), end: date(params.get('end'), historicalDay), mode: params.get('mode') || 'day' };
  const initial = params.get('source') === 'live' || sourceRange.start === sourceRange.end && sourceRange.end === historicalDay
    ? { start: weekStart, end: liveDay, model: '' }
    : { start: sourceRange.start, end: sourceRange.end, model: '' };
  function returnToList() {
    if (history.state?.fromCustomerAnalysisList) {
      history.back();
      return;
    }
    location.hash = homeHref(sourceRange);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  return <div className="admin-page-stack xa24-page ca-page">
    <div className="ca-detail-heading xa24-detail-header"><Button icon={<ChevronLeft size={16} aria-hidden="true"/>} aria-label="返回租户数据" theme="borderless" onClick={returnToList}/>
      <AdminPageHeading title="租户详情"><Space><Text type="tertiary" size="small">演示数据</Text>
        <Button htmlType="submit" form={tab === 'flow' ? 'ca-flow-export' : 'ca-info-export'} theme="light" type="tertiary"
          icon={<Download size={16} aria-hidden="true"/>} disabled={!customer}>数据导出</Button></Space></AdminPageHeading></div>
    {customer ? <Tabs activeKey={tab} onChange={setTab}>
      <Tabs.TabPane itemKey="info" tab={titleInfo}><CustomerInfo key={customer.id} customer={customer} initial={initial}/></Tabs.TabPane>
      <Tabs.TabPane itemKey="flow" tab={titleFlow}><Traffic key={customer.id} initialCustomer={customer}/></Tabs.TabPane>
    </Tabs> : empty('租户不存在，请返回租户数据重新选择')}
  </div>;
}

