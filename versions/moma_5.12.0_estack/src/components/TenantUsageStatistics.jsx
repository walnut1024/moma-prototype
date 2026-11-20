import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChartNoAxesCombined, ChevronDown, Download, Info, ListFilter, RefreshCw } from 'lucide-react';
import { useTenantData } from '../useTenantData';
import { shanghaiDate } from '../call-log-data.mjs';
import { bucketLabel, fields, meteringView, usageModelGroups, usagePeriod } from '../usage-data.mjs';
import { NATIVE_METERS, tenantUsageActivity, tenantUsageCategory, tenantUsageMeter, tenantUsageReport, UNASSIGNED, USAGE_ACTIVITY_DAYS, USAGE_OVERVIEW, usageCacheRate, usageDimensionRows, usageMetricValue, usageModelsInScope, usageMoney, usageRanking, usageReportCSV, usageSubscribedTrends, usageSuccessRate, usageWeekday } from '../tenant-usage-report.mjs';
import { tenantUsageDemo } from '../mock/tenant-usage.mjs';
import { SemiDateRange as DateRange, SemiMultiPick as MultiPick } from '../admin-v2/SemiAnalyticsFilters';
import { DonutChart, TimeSeriesChart } from './AnalyticsCharts';
import { chartPalette } from './chart-style.mjs';
import { FilterField, FilterPresets, FilterReset, FilterToolbar, FilterViewRow, TIME_PRESETS } from './FilterControls';
import FrontPageHeader from './FrontPageHeader';
import SavedFilterViews from './SavedFilterViews';
import { Button, Popover, Select, Tabs, Tooltip } from '@douyinfe/semi-ui';
import './usage-statistics.css';

const ALL = '__all__';
const EMPTY = { records: [], projects: [], keys: [], users: [], models: [] };
const BILLINGS = [['按量付费', '按量付费'], ['Token Plan', 'Token Plan']];
const USAGE_TABS = [USAGE_OVERVIEW, ...usageModelGroups.map(group => group.id)];
const RANKINGS = [['modelId', '模型'], ['projectId', '项目'], ['keyId', 'API Key']];
const REFRESH = [[0, '关闭'], [30, '每 30 秒'], [60, '每 1 分钟'], [300, '每 5 分钟']];
const ACTIVITY_MODES = [['daily', '按日'], ['weekly', '按周'], ['cumulative', '累计']];
const TOKEN_CHARTS = meteringView('文本模型').charts.map(([title, [field]]) => ({
  title, id: { total: 'tokens', cacheReadTotal: 'cacheHit', cacheCreate: 'cacheWrite' }[field] || field,
  unit: fields[field][1], hint: field === 'cacheReadTotal' ? '已采集的缓存命中 Token，包含在输入 Token 中。'
    : field === 'cacheReadMinute' ? '已采集的缓存命中 Token 除以时间桶的已观测分钟数。' : fields[field][2],
}));
const PRIMARY_TOKEN = new Set(['tokens', 'input', 'output', 'tpm']);
const PRIMARY_INPUT = new Set(['input', 'inputMinute']);
const MEDIA_CATEGORIES = { 视觉模型: ['images', 'videoSeconds'], 语音模型: ['audio', 'characters'] };
const COMPOSITION_COLORS = { input: '#3568f9', uncached: '#3568f9', cached: '#13947a', unknownInput: '#8292a9', output: '#7956d8' };
const dateTime = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
const asPercent = value => value == null ? '—' : value.toFixed(1) + '%';
const asMoney = (value, currency, maximumFractionDigits = 4) => value == null ? '—' : new Intl.NumberFormat('zh-CN', {
  style: 'currency', currency, maximumFractionDigits,
}).format(value);
const billingOf = row => row.billingType || '按量付费';
const dayLabel = time => bucketLabel(time).slice(0, 5);

function formatQuantity(value, currency) {
  if (value == null) return '—';
  const magnitude = Math.abs(value);
  const scale = magnitude >= 1e8 ? 1e8 : magnitude >= 1e4 ? 1e4 : 1;
  const amount = value / scale;
  const digits = currency && magnitude < 1 ? 6 : scale === 1 || Math.abs(amount) < 100 ? 2 : Math.abs(amount) < 1000 ? 1 : 0;
  const text = amount.toLocaleString('zh-CN', {
    minimumFractionDigits: 0, maximumFractionDigits: digits, useGrouping: scale === 1,
    ...(currency && { style: 'currency', currency }),
  });
  return text + (scale === 1e8 ? ' 亿' : scale === 1e4 ? ' 万' : '');
}

function Pick({ label, value, onChange, items, all }) {
  return <Select aria-label={label} value={value || ALL} onChange={next => onChange(next === ALL ? null : next)}
    optionList={[...(all ? [{value:ALL,label:all}] : []), ...items.map(({id,name}) => ({value:id,label:name}))]}/>;
}

function KeyPicker({ value, onChange, items }) {
  return <Select aria-label="API Key 筛选" value={value || ALL} onChange={next => onChange(next === ALL ? null : next)}
    filter={(query, option) => (option.name + ' ' + option.value).toLowerCase().includes(query.trim().toLowerCase())}
    searchPlaceholder="搜索 Key 名称或 ID" emptyContent="无匹配的 API Key"
    renderSelectedItem={option => option.name}
    optionList={[{value:ALL,label:'全部 Key',name:'全部 Key'}, ...items.map(({id,name}) => ({
      value:id, name, label:<>{name} <small>{id}</small></>,
    }))]}/>;
}

function Switch({ label, value, onChange, options }) {
  return <div role="group" className="us-segmented" aria-label={label}>
    {options.map(([id, name]) => <Button key={id} size="small" theme={value === id ? 'solid' : 'light'}
      aria-pressed={value === id} onClick={() => onChange(id)}>{name}</Button>)}
  </div>;
}

function Hint({ label, children }) {
  return <Tooltip content={children}><Button theme="borderless" type="tertiary" size="small" icon={<Info size={14}/>}
    className="us-info" aria-label={label + '说明'}/></Tooltip>;
}

function optionList(items, records, field, unknown) {
  const options = new Map(items.map(({ id, name }) => [id, { id, name }]));
  for (const row of records) {
    const id = row[field] || UNASSIGNED;
    if (!options.has(id)) options.set(id, { id, name: id === UNASSIGNED ? unknown : id });
  }
  return [...options.values()];
}

function keysFor(source, projectId, billing) {
  const matches = row => billingOf(row) === billing && (!projectId || (row.projectId || UNASSIGNED) === projectId);
  return optionList(source.keys.filter(matches), usageDimensionRows(source.records, { projectId, billing }), 'keyId', '未归属 Key')
    .map(key => ({ ...key, name: source.keys.find(item => item.id === key.id)?.name || key.name }));
}

function usersFor(source, scope) {
  if (!source.canFilterUser) return [];
  const rows = usageDimensionRows(source.records, scope);
  const people = new Set(rows.map(row => row.userId));
  return optionList(source.users.filter(user => people.has(user.id)), rows, 'userId', '未识别用户');
}

function Metric({ label, value, hint }) {
  return <div className="us-report-metric">
    <dt>{label}{hint && <Hint label={label}>{hint}</Hint>}</dt>
    <dd>{value}</dd>
  </div>;
}

function Empty({ children = '当前筛选范围暂无调用数据' }) {
  return <div className="us-report-empty">{children}</div>;
}

function TokenBreakdown({ rows, total, label, centerLabel }) {
  return <div className="us-report-composition-layout">
    <DonutChart rows={rows} unit="Token" label={label} centerValue={formatQuantity(total)}
      centerLabel={centerLabel} showData={false} />
    <dl className="us-report-composition-legend">
      {rows.map(({ id, label, value, color }) => <div key={id ?? 'other-models'}>
        <dt><i style={{ backgroundColor: color }} aria-hidden="true" />{label}</dt>
        <dd>{formatQuantity(value)} <span>{asPercent(total ? value / total * 100 : null)}</span></dd>
      </div>)}
    </dl>
  </div>;
}

function Composition({ summary }) {
  const items = summary.cacheHit === null ? [['input', '输入']] : [
    ['uncached', '未命中输入'], ['cached', '命中输入'],
    ...(summary.unknownInput ? [['unknownInput', '无缓存计量的输入']] : []),
  ];
  if (summary.output !== null) items.push(['output', '输出']);
  const rows = items.map(([id, label]) => ({ id, label, value: summary[id], color: COMPOSITION_COLORS[id] }));
  return <section id="usage-composition" className="us-chart" aria-label="Token 构成">
    <div className="us-chart-head"><h3>Token 构成<Hint label="Token 构成">占比以当前范围的已计量 Token 为分母。命中计入输入，缓存写入单独计量。</Hint></h3></div>
    {summary.tokens === null ? <Empty>当前范围暂无 Token 计量</Empty> :
      <TokenBreakdown rows={rows} total={summary.tokens} label="Token 构成环形图" centerLabel="已计量 Token" />}
  </section>;
}

function ActivityHeatmap({ daily, points, mode }) {
  const byWeek = mode === 'weekly';
  const measure = byWeek ? '周合计' : mode === 'cumulative' ? '截至当天累计' : '日用量';
  const firstWeekday = usageWeekday(daily[0].time);
  const offset = byWeek ? 0 : firstWeekday;
  const rows = byWeek ? 1 : 7;
  const columns = Math.ceil((offset + points.length) / rows);
  const peak = Math.max(0, ...points.map(point => point.value ?? 0));
  const months = daily.flatMap(({ time }, index) => {
    const date = shanghaiDate(new Date(time));
    return date.endsWith('-01') ? [{ column: Math.floor((index + firstWeekday) / 7) + 1, date }] : [];
  });
  const cells = useRef([]);
  const [active, setActive] = useState(points.length - 1);
  function moveFocus(event, index) {
    const row = (offset + index) % rows;
    const steps = { ArrowLeft: -rows, ArrowRight: rows, ...(!byWeek && {
      ArrowUp: row > 0 ? -1 : 0, ArrowDown: row < rows - 1 ? 1 : 0,
    }) };
    const step = steps[event.key];
    if (step === undefined && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? points.length - 1 : index + step;
    cells.current[next]?.focus();
  }
  return <>
    <div className="us-activity-scroll" style={{ '--activity-columns': columns, '--activity-rows': rows }}>
      <p className="sr-only" id="usage-activity-keyboard">
        {byWeek ? '用左右方向键切换周。' : '用左右方向键切换周，用上下方向键切换日期。'}
      </p>
      <div className="us-activity-calendar" role="group"
        aria-label={`近 ${USAGE_ACTIVITY_DAYS} 天 Token 热力图，${measure}`} aria-describedby="usage-activity-keyboard">
        {Array.from({ length: offset }, (_, index) => <span key={index} aria-hidden="true" />)}
        {points.map(({ time, end, value }, index) => {
          const date = shanghaiDate(new Date(time));
          const period = byWeek && end !== time ? date + ' — ' + shanghaiDate(new Date(end)) : date;
          const amount = value === null ? '无 Token 计量' : measure + ' ' + value.toLocaleString('zh-CN') + ' Token';
          const level = value === null ? 'unknown' : value === 0 ? 0 : Math.ceil(value / peak * 5);
          return <Tooltip key={time} content={period + ' · ' + amount}>
              <span className="us-activity-day" role="img" aria-label={period + '：' + amount} data-level={level}
                tabIndex={index === active ? 0 : -1} ref={cell => { cells.current[index] = cell; }}
                onFocus={() => setActive(index)} onKeyDown={event => moveFocus(event, index)} />
          </Tooltip>;
        })}
      </div>
      <div className="us-activity-months" aria-hidden="true">
        {months.map(({ column, date }) => <span key={date} style={{ gridColumnStart: column, justifySelf: column > columns - 2 ? 'end' : undefined }}>
          {Number(date.slice(5, 7))}月
        </span>)}
      </div>
    </div>
    <div className="us-activity-scale">
      <span>{measure}</span>
      {points.some(point => point.value === null) && <><i data-level="unknown" aria-hidden="true" />无计量</>}
      {points.some(point => point.value === 0) && <><i data-level="0" aria-hidden="true" />0</>}
      {peak > 0 && <><span>少</span>{[1, 2, 3, 4, 5].map(level => <i key={level} data-level={level} aria-hidden="true" />)}<span>多</span></>}
    </div>
  </>;
}

const TokenActivity = memo(function TokenActivity({ activity, scopeLabel, internal }) {
  const [mode, setMode] = useState('daily');
  const { range, daily } = activity;
  return <section className="us-chart us-activity" aria-labelledby="usage-activity-heading">
    <div className="us-chart-head">
      <div className="us-activity-heading">
        <h3 id="usage-activity-heading">Token 用量活动<Hint label="Token 用量活动">
          按北京时间汇总可查看的已计量 Token，今日统计至快照时间。周一至周日为一周，首尾按区间截取。累计从区间起点算至当天。下方筛选只影响用量分析。
        </Hint></h3>
        <span>{scopeLabel}{internal ? '' : ' · 全部计费方式'}</span>
      </div>
      <div className="us-activity-controls">
        <span className="us-report-badge" title={range.start + ' — ' + range.end}>近 {USAGE_ACTIVITY_DAYS} 天</span>
        <Switch label="Token 活动视图" value={mode} onChange={setMode} options={ACTIVITY_MODES} />
      </div>
    </div>
    <ActivityHeatmap key={mode} daily={daily} points={activity[mode]} mode={mode} />
  </section>;
});

function SubscribedUsage({ report, subscribed, modelLabel, internal }) {
  const { groups, times, measured } = usageSubscribedTrends(report, subscribed);
  const rows = groups.map((group, index) => ({ ...group, label: group.id === null ? '其他模型' : modelLabel(group.id),
    color: group.id === null ? '#8292a9' : chartPalette[index] }));
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const kind = internal ? '已授权模型' : '已订购模型';
  const title = kind + '用量占比';
  const empty = !subscribed.length ? '当前范围暂无' + kind :
    measured ? kind + '的已计量 Token 为 0' : '当前筛选范围内暂无 Token 计量';
  return <>
    <section className="us-chart" aria-labelledby="usage-model-share-heading">
      <div className="us-chart-head"><h3 id="usage-model-share-heading">{title}<Hint label={title}>按所选范围内的已计量 Token 汇总。用量前 5 的模型单列，其余合并。</Hint></h3></div>
      {rows.length ? <TokenBreakdown rows={rows} total={total} label={title + '环形图'} centerLabel="已计量 Token" /> : <Empty>{empty}</Empty>}
    </section>
    <section className="us-chart" aria-labelledby="usage-model-trend-heading">
      <div className="us-chart-head">
        <h3 id="usage-model-trend-heading">单模型用量趋势<Hint label="单模型用量趋势">与{title}使用相同的模型和 Token 计量范围。</Hint></h3>
        {rows.length > 0 && <span className="us-overview-note">Top 5 · {report.days === 1 ? '按小时' : '按日'}</span>}
      </div>
      {rows.length ? <TimeSeriesChart compact overview height={205} unit="Token" label="单模型用量趋势"
        labels={times.map(report.days === 1 ? bucketLabel : dayLabel)} series={rows} /> : <Empty>{empty}</Empty>}
    </section>
  </>;
}

function CachePanel({ report, labels, currency, plan }) {
  const { summary } = report;
  const rate = usageCacheRate(summary);
  const savings = usageMoney(summary, currency, 'savings');
  return <section id="usage-cache" className="us-chart" aria-labelledby="usage-cache-heading">
    <div className="us-chart-head"><h3 id="usage-cache-heading">Prompt 缓存分析</h3></div>
    {summary.cacheHit === null ? <Empty>当前范围暂无缓存命中计量</Empty> : <>
      <dl className="us-report-cache-metrics">
        <Metric label="命中 Token" value={formatQuantity(summary.cacheHit)} />
        <Metric label="Token 命中率" value={asPercent(rate)} hint="仅统计已采集 Prompt 缓存命中量的调用，命中 Token 总数除以同一批调用的输入 Token 总数。" />
        {!plan && <Metric label="预估节省" value={savings === null ? '待核算' : asMoney(savings, currency)}
          hint="按调用时的客户售价，比较未使用缓存的输入费用与实际输入、缓存读取及写入费用。" />}
      </dl>
      {rate === null ? <Empty>当前范围暂无可计算的缓存命中率</Empty> :
        <TimeSeriesChart compact labels={labels} height={180} unit="%" domain={[0, 100]} label="缓存命中率趋势"
          series={[{ label: 'Token 命中率', color: '#13947a', showPoints: true, values: report.buckets.map(bucket => usageCacheRate(bucket.totals)) }]} />}
    </>}
  </section>;
}

function RankCard({ title, dimension, rows, metricLabel, labelFor, format, canOpenModel, onPick }) {
  const heading = title + ' Top 10';
  return <section className="us-report-card us-report-rank-card" aria-label={heading}>
    <h3>{heading}</h3>
    {rows.length ? <ol className="us-report-rank-list" role="list">
      {rows.map(({ id, amount, share }, index) => {
        const label = labelFor(id);
        const model = dimension === 'modelId';
        return <li key={id}>
          <div className="us-report-rank-row">
            <span className="us-report-rank-index">{index + 1}</span>
            {model && !canOpenModel(id) ? <span>{label}</span> :
              <button type="button" className="us-report-rank-link" aria-label={model ? '查看 ' + label + ' 的趋势' : '筛选 ' + label}
                onClick={() => onPick(dimension, id)}>{label}</button>}
            <strong>{format(amount)}</strong>
          </div>
          {share !== null && <div className="us-report-rank-share">
            <span aria-hidden="true"><i style={{ width: share + '%' }} /></span>
            <small>{asPercent(share)}</small>
          </div>}
        </li>;
      })}
    </ol> : <Empty>当前范围暂无{metricLabel}排行</Empty>}
  </section>;
}

function MeterTrend({ chart, report, labels, modelLabel, currency }) {
  const { id, title, unit, hint } = chart;
  const series = [...report.rankings.modelId].flatMap(([modelId, group], index) => {
    if (usageMetricValue(group, id, currency, report.minutes) === null) return [];
    return [{
      label: modelLabel(modelId), color: chartPalette[index % chartPalette.length],
      values: report.buckets.map(bucket => {
        const model = bucket.models.get(modelId);
        return model ? usageMetricValue(model, id, currency, bucket.minutes) : id.endsWith('PerRequest') ? null : 0;
      }),
    }];
  });
  return <section id={'usage-trend-' + id} className="us-chart">
    <div className="us-chart-head"><h3>{title}{hint && <Hint label={title}>{hint}</Hint>}</h3></div>
    {series.length ? <TimeSeriesChart compact={series.length <= 8} overview={report.days > 1} labels={labels} series={series}
      height={250} unit={unit} label={title} /> :
      <div className="us-empty">{report.summary.requests ? '当前范围暂无此项计量' : '当前范围暂无调用数据'}</div>}
  </section>;
}

function SummaryTiles({ tiles, label, overview }) {
  return <section className="us-summary" aria-label={label}>
    <div className={'us-overview-groups' + (overview ? ' us-overview-kpis' : '')} style={{ '--overview-count': tiles.length }}>
      {tiles.map(([label, value, unit, hint, detail, currency]) => {
        const numeric = typeof value === 'number';
        const exact = numeric ? (currency ? asMoney(value, currency, 6) :
          [value.toLocaleString('zh-CN', { maximumFractionDigits: 4 }), unit].filter(Boolean).join(' ')) : undefined;
        return <div className="us-overview-group" key={label}>
          <span>{label}{hint && <Hint label={label}>{hint}</Hint>}</span>
          <strong title={exact}>{numeric ? formatQuantity(value, currency) : value ?? '—'}
            {value != null && unit && <small> {unit}</small>}</strong>
          {detail && <div className="us-overview-note">{detail}</div>}
        </div>;
      })}
    </div>
  </section>;
}

function OverviewSummary({ report, subscribed, modelCategory, currency, plan, internal, scopedProject }) {
  const { summary, rankings } = report;
  const fee = usageMoney(summary, currency);
  const successRate = usageSuccessRate(summary);
  const hasOutcome = summary.finished > 0 || summary.requests === 0;
  const types = new Map();
  for (const id of subscribed) {
    const type = modelCategory(id) || '未分类';
    types.set(type, (types.get(type) ?? 0) + 1);
  }
  const subscriptionHint = (internal ? '当前范围内可用的已授权模型数，按模型去重。' : '当前范围内有效订单关联的模型数，按模型去重。') +
    (types.size ? ' ' + [...types].map(([type, count]) => type + ' ' + count).join('、') + '。' : '');
  const tiles = [
    ['调用次数', summary.requests, '次', fields.requests[2]],
    ['已计量 Token', summary.tokens, 'Token', '仅汇总有 Token 计量的调用。缓存命中已计入输入 Token。'],
    ['平均每次 Token', summary.inputSamples ? Math.round(summary.tokens / summary.inputSamples) : null, '', fields.average[2]],
    plan ? ['套餐抵扣', summary.planTokens, 'Token', '仅统计已记录的套餐抵扣 Token。'] :
      [internal ? '内部成本' : '调用费用', fee === null && summary.requests ? '待核算' : fee, '', '按币种汇总已核算的金额。', null, currency],
    [internal ? '授权模型数' : '订购模型数', subscribed.length, '款', subscriptionHint, scopedProject ? '当前项目' : '当前空间'],
    ['调用模型数', rankings.modelId.size - Number(rankings.modelId.has(UNASSIGNED)), '款', '按所选范围内有调用记录的模型去重，排除未归属模型。'],
    ['调用成功次数', hasOutcome ? summary.success : null, '次', '以请求的最终状态为准，成功率的分母为已记录最终状态的请求数。',
      successRate === null ? '' : '成功率 ' + asPercent(successRate)],
    ['调用失败次数', hasOutcome ? summary.finished - summary.success : null, '次', '只统计已记录最终状态且未成功的请求。'],
  ];
  return <SummaryTiles tiles={tiles} label="用量与费用总览" overview />;
}

function ModelSummary({ report, tokenScope, inputOnly, native }) {
  const { summary, days, minutes, peakTpm } = report;
  const tiles = [
    ...(tokenScope ? [[inputOnly ? '输入 Token 总量' : 'Token调用总量', summary.tokens, 'Token', fields.total[2]]] : []),
    ...native.map(([id, label, unit]) => [label, usageMetricValue(summary, id), unit]),
    ['模型调用次数', summary.requests, '次', fields.requests[2]],
    ...(tokenScope && native.length === 0 ? [
      ['日均Token调用量', summary.tokens === null ? null : summary.tokens / days, 'TPD', 'Token 总量除以所选北京时间自然日数。'],
      ['TPM峰值', peakTpm, 'TPM', '按请求发生的自然分钟汇总 Token 后取最大值。'],
      ['TPM均值', usageMetricValue(summary, 'tpm', undefined, minutes), 'TPM', fields.tpm[2]],
    ] : []),
  ];
  return <SummaryTiles tiles={tiles} label="模型用量汇总" />;
}

export default function TenantUsageStatistics({ ChartNavigation, projectScope, workspaceOverview, internal }) {
  const demo = import.meta.env.DEV && new URLSearchParams(location.search).get('usageDemo') === '1';
  const tenant = useTenantData({ usageReport: !demo });
  const scope = demo ? 'usage-preview' : [tenant.identity?.key || 'anonymous', projectScope?.id].filter(Boolean).join(':');
  return <UsageDashboard key={scope} demo={demo} tenant={tenant} scope={scope} ChartNavigation={ChartNavigation}
    projectScope={projectScope} workspaceOverview={workspaceOverview} internal={internal} />;
}

function UsageDashboard({ demo, tenant, scope, ChartNavigation, projectScope, workspaceOverview, internal }) {
  const { reload } = tenant;
  const scopedProject=tenant.projects.find(row=>row.id===projectScope?.id);
  const scopedModel=tenant.report?.models.find(row=>row.id===projectScope?.modelId);
  const scopedKey=tenant.report?.keys.find(row=>row.id===projectScope?.keyId && row.projectId===scopedProject?.id);
  const scopedDays=[7,30].includes(projectScope?.days) ? projectScope.days : 1;
  const defaultPreset = demo ? '7d' : scopedDays > 1 ? 'custom' : 'today';
  const initialFilters = { category:tenantUsageCategory(scopedModel?.type) || USAGE_OVERVIEW, billing:scopedKey?.billingType || '按量付费', projectId:scopedProject?.id || null, keyId:scopedKey?.id || null, userId:null, modelIds:scopedModel ? [scopedModel.id] : null, preset:defaultPreset };
  const [now, setNow] = useState(() => new Date());
  const [filters, setFilters] = useState(initialFilters);
  const [customRange, setCustomRange] = useState(() => scopedDays > 1 ? {start:shanghaiDate(new Date(Date.now()-(scopedDays-1)*86400000)),end:shanghaiDate()} : null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [rankMetric, setRankMetric] = useState(null);
  const [currencyPreference, setCurrencyPreference] = useState('CNY');
  const [autoRefresh, setAutoRefresh] = useState(0);
  const [notice, setNotice] = useState('');
  const demoSource = useMemo(() => demo ? tenantUsageDemo(now) : null, [demo, now]);
  const unscoped = demoSource || tenant.report || EMPTY;
  const source = projectScope?.id ? { ...unscoped, records:unscoped.records.filter(row=>scopedProject && row.projectId===scopedProject.id),
    projects:scopedProject ? [scopedProject] : [], keys:unscoped.keys.filter(row=>row.projectId===scopedProject?.id) } : unscoped;
  const subscribed = (source.subscribedModelIds || []).filter(id =>
    !scopedProject?.modelPermissions || scopedProject.modelPermissions.some(model => model.modelId === id));
  const asOf = source.asOf || now;
  const { billing, category, projectId, keyId, userId, modelIds, preset } = filters;
  const overview = category === USAGE_OVERVIEW;
  const hasSource = demo || Boolean(tenant.report && (!projectScope?.id || scopedProject));
  const activity = useMemo(() => overview && hasSource ? tenantUsageActivity({
    records: source.records, models: source.models, now: asOf,
  }) : null, [overview, hasSource, source, asOf]);
  const range = preset === 'custom' && customRange ? customRange : usagePeriod(preset, asOf);
  const plan = billing === 'Token Plan';
  const money = plan ? { id: 'planTokens', title: '套餐抵扣趋势', label: '套餐抵扣', unit: 'Token' } :
    { id: 'fees', title: internal ? '内部成本趋势' : '调用费用趋势', label: internal ? '内部成本' : '调用费用' };
  const projects = optionList(source.projects, source.records, 'projectId', '未归属项目');
  const keys = keysFor(source, projectId, billing);
  const users = usersFor(source, filters);
  const scopeModels = useMemo(() => usageModelsInScope(source.models, source.records, category), [source, category]);
  const models = scopeModels.map(model => ({
    id: model.id, name: model.modelId || model.name || model.id, searchText: model.name,
  }));
  const report = useMemo(() => tenantUsageReport({
    records: source.records, models: source.models, filters, range: { start: range.start, end: range.end }, now: asOf,
  }), [source, filters, range.start, range.end, asOf]);
  const { summary } = report;
  const currencies = [...summary.fees.keys()].sort();
  const currency = currencies.includes(currencyPreference) ? currencyPreference : currencies[0] || 'CNY';
  const valueFor = (items, id) => items.find(item => item.id === id)?.name || id;
  const modelLabel = id => id === UNASSIGNED ? '未归属模型' : valueFor(models, id);
  const modelCategory = id => tenantUsageCategory(scopeModels.find(model => model.id === id)?.type);
  const media = MEDIA_CATEGORIES[category];
  const inputOnly = ['向量模型', '排序模型'].includes(category);
  const modelSelected = modelIds?.length > 0;
  const showCache = modelSelected && summary.cacheHit !== null;
  const showComposition = modelSelected && summary.output !== null;
  const native = Object.entries(NATIVE_METERS).filter(([id]) => summary.units.has(id))
    .map(([id, [label, unit]]) => [id, label, unit]);
  const expected = media && !native.length && summary.tokens === null ? new Set(
    scopeModels.length || modelIds ? scopeModels.filter(model => !modelIds || modelIds.includes(model.id))
      .map(model => tenantUsageMeter(model).metric) : media,
  ) : new Set();
  const displayNative = native.length ? native : media?.filter(id => expected.has(id)).map(id => [id, ...NATIVE_METERS[id]]) || [];
  const tokenScope = !media || summary.tokens !== null || expected.has('tokens');
  const primary = inputOnly ? PRIMARY_INPUT : PRIMARY_TOKEN;
  const labels = report.buckets.map(bucket => report.days === 1 ? bucketLabel(bucket.time) : bucketLabel(bucket.time).slice(0, 5));
  const charts = [
    ...displayNative.map(([id, title, unit]) => ({ id, title, unit })),
    ...TOKEN_CHARTS.filter(({ id }) => tokenScope && primary.has(id)),
    { id: 'requests', title: '模型调用次数', unit: '次', hint: fields.requests[2] },
    { ...money, unit: money.unit || currency },
  ];
  const details = TOKEN_CHARTS.filter(({ id }) => !PRIMARY_TOKEN.has(id) && !primary.has(id) &&
    usageMetricValue(summary, id, currency, report.minutes) !== null);
  const nav = [
    ...charts.map(({ id, title }) => ['usage-trend-' + id, title]),
    ...(showComposition ? [['usage-composition', 'Token 构成']] : []),
    ...(showCache ? [['usage-cache', 'Prompt 缓存分析']] : []),
    ...details.map(({ id, title }) => ['usage-trend-' + id, title]),
  ];
  const rankOptions = [
    ['requests', '调用次数', '次'],
    ...(usageMetricValue(summary, money.id, currency) !== null ? [[money.id, money.label, money.unit]] : []),
    ...(summary.tokens !== null ? [['tokens', '已计量 Token', 'Token']] : []),
    ...native,
  ];
  const [rankBy, rankLabel, rankUnit] = rankOptions.find(([id]) => id === rankMetric) || rankOptions[0];
  const rankFormat = amount => rankBy === 'fees' ? formatQuantity(amount, currency) : formatQuantity(amount) + ' ' + rankUnit;
  const rankScope = rankBy === 'fees' ? currency + ' · 已核算费用' : rankBy === 'planTokens' ? '仅统计已记录的套餐抵扣' :
    rankBy === 'tokens' ? '仅统计有 Token 计量的调用' :
      rankBy !== 'requests' ? '仅统计有此项计量的调用（' + rankUnit + '）' : '';

  function patch(next, message = '') {
    setFilters(previous => ({ ...previous, ...next }));
    setNotice(message);
  }

  function changeScope(next) {
    const scope = { ...filters, ...next };
    const nextKey = keysFor(source, scope.projectId, scope.billing).some(key => key.id === scope.keyId) ? scope.keyId : null;
    const nextUser = usersFor(source, { ...scope, keyId: nextKey }).some(user => user.id === scope.userId) ? scope.userId : null;
    const cleared = [scope.keyId && !nextKey && 'API Key', scope.userId && !nextUser && '调用用户'].filter(Boolean);
    patch({ ...next, keyId: nextKey, userId: nextUser }, cleared.length ? '已清除当前范围不可用的筛选项（' + cleared.join('、') + '）' : '');
  }

  function pickRank(dimension, id) {
    if (dimension !== 'modelId') {
      changeScope({ [dimension]: id });
      return;
    }
    const nextCategory = modelCategory(id);
    if (!nextCategory) return;
    patch({ category: nextCategory, modelIds: [id] });
    requestAnimationFrame(() => document.getElementById('tenant-usage-view-tabs')
      ?.querySelector('[aria-selected="true"]')?.focus());
  }

  const refresh = useCallback(() => {
    setNow(new Date());
    if (!demo) reload();
  }, [demo, reload]);

  useEffect(() => {
    if (!autoRefresh || !hasSource) return;
    const timer = window.setInterval(refresh, autoRefresh * 1000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, hasSource, refresh]);

  function applySaved(view) {
    if (!view || !USAGE_TABS.includes(view.category) || !BILLINGS.some(([id]) => id === view.billing)) {
      setNotice('视图中的模型类别或计费方式已不可用');
      return false;
    }
    const savedKey = view.keyId ?? view.apiKeyId ?? null;
    const savedScope = { ...view, keyId: savedKey };
    const savedModels = view.category === USAGE_OVERVIEW ? [] : usageModelsInScope(source.models, source.records, view.category);
    const savedModelIds = view.category !== USAGE_OVERVIEW && Array.isArray(view.modelIds) ? view.modelIds.map(id =>
      (savedModels.find(model => model.id === id) || savedModels.find(model => model.modelId === id))?.id) : null;
    if (view.projectId && !projects.some(item => item.id === view.projectId) ||
        savedKey && !keysFor(source, view.projectId, view.billing).some(item => item.id === savedKey) ||
        view.userId && !usersFor(source, savedScope).some(item => item.id === view.userId) ||
        savedModelIds?.some(id => !id)) {
      setNotice('视图包含当前范围不可用的筛选项');
      return false;
    }
    if (view.preset === 'custom') {
      const start = Date.parse(view.range?.start + 'T00:00:00+08:00');
      const end = Date.parse(view.range?.end + 'T00:00:00+08:00');
      if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || end - start >= 31 * 86_400_000 || end > asOf.getTime()) {
        setNotice('视图的日期范围无效');
        return false;
      }
      setCustomRange(view.range);
    }
    setRankMetric(null);
    patch({
      category: view.category, billing: view.billing, projectId: view.projectId || null,
      keyId: savedKey, userId: view.userId || null, modelIds: savedModelIds,
      preset: view.preset === 'custom' || TIME_PRESETS.some(([id]) => id === view.preset) ? view.preset : defaultPreset,
    });
    return true;
  }

  function exportCSV() {
    const csv = usageReportCSV(report, { filters, range, now: asOf, demo, models: scopeModels });
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = '用量统计-' + category + '-' + range.start + '-' + range.end + '.csv';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice(overview ? '已导出当前概览的用量数据' : '已导出当前范围的用量趋势');
  }

  const conditions = [
    { label: '模型类别', text: overview ? '全部模型' : category },
    { label: '时间', text: range.start === range.end ? range.start : range.start + ' — ' + range.end, active: true },
    { label: '计费方式', text: billing, active: plan },
    ...(!overview ? [{ label: '模型 ID', items: modelIds?.map(modelLabel) ?? null, all: '全部模型', active: modelIds !== null }] : []),
    { label: '项目', text: projectId ? valueFor(projects, projectId) : '全部项目', active: Boolean(projectId) },
    { label: 'API Key', text: keyId ? valueFor(keys, keyId) : '全部 Key', active: Boolean(keyId) },
    ...(source.canFilterUser ? [{ label: '调用用户', text: userId ? valueFor(users, userId) : '全部用户', active: Boolean(userId) }] : []),
  ];
  const extraCount = Number(Boolean(keyId)) + Number(Boolean(userId)) + Number(!overview && modelIds !== null);
  const renderTrend = chart => <MeterTrend key={chart.id} chart={chart} report={report}
    labels={labels} modelLabel={modelLabel} currency={currency} />;
  const exportLabel = overview ? '导出概览用量' : '导出用量趋势';
  return <div className="us-page us-metering us-report">
    <FrontPageHeader title={workspaceOverview ? '空间总览' : '用量统计'} icon={ChartNoAxesCombined} className="us-report-header"
      description={scopedProject ? '当前项目 · ' + scopedProject.name : tenant.identity?.tenantName}
      actions={hasSource && <>
        {demo && <span className="us-report-badge">模拟数据</span>}
        <span className="us-report-asof">快照更新 <time dateTime={asOf.toISOString()}>{dateTime.format(asOf)}</time>（北京时间）</span>
      </>} />
    <Tabs id="tenant-usage-view-tabs" aria-label="用量视图" activeKey={category}
      onChange={value => patch({ category:value, modelIds:null })}
      tabList={USAGE_TABS.map(tab => ({itemKey:tab,tab}))}/>
    <div className="us-content">
        {!hasSource ? <div className="us-chart"><Empty>{tenant.error || (projectScope?.id ? '当前项目不可访问' : '当前空间暂无可用用量数据')}</Empty></div> : <>
          {activity && <>
            <TokenActivity activity={activity} scopeLabel={scopedProject?.name || (demo || tenant.canManage ? '当前空间' : '当前可见用量')} internal={internal}/>
            <h2 className="us-analysis-heading">用量分析</h2>
          </>}
          <section className="us-filter-panel" aria-label="统计范围">
            <FilterToolbar className="us-filters us-report-filters">
              <FilterPresets value={preset} onChange={value => patch({ preset: value })} />
              <DateRange start={range.start} end={range.end} maxDays={31}
                trigger={<Button className="us-custom-date" aria-pressed={preset === 'custom'} icon={<CalendarDays aria-hidden="true"/>}
                  aria-label="日期范围">自定义</Button>}
                rangeHint={overview ? '概览单日按小时，多日按天，单次最多 31 天' : '模型趋势单日按 10 分钟，多日按天，单次最多 31 天'}
                onChange={next => { setCustomRange(next); patch({ preset: 'custom' }); }} />
              {!internal && <FilterField label="计费方式"><Switch label="计费方式" value={billing} onChange={value => changeScope({ billing: value })} options={BILLINGS} /></FilterField>}
              {!scopedProject && <FilterField label="项目"><Pick label="项目筛选" value={projectId} onChange={value => changeScope({ projectId: value })} items={projects} all="全部项目" /></FilterField>}
              <Button theme="outline" className="us-more-filters" aria-expanded={moreOpen}
                aria-controls="tenant-usage-more-filters" onClick={() => setMoreOpen(value => !value)}>
                <ListFilter aria-hidden="true" />{moreOpen ? '收起筛选' : '更多筛选'}{extraCount > 0 && <span className="us-extra-count">{extraCount}</span>}
              </Button>
              <FilterReset onClick={() => { setFilters({ ...initialFilters, category }); setCustomRange(null); setRankMetric(null); setNotice(''); }} />
              <div className="us-actions">
                <div className="us-refresh-group">
                  <Button theme="outline" size="small" aria-label="刷新用量" title="刷新用量" onClick={() => { refresh(); setNotice('已刷新当前范围的用量'); }}><RefreshCw /></Button>
                  <Popover trigger="click" position="bottomRight" content={<div className="us-refresh-popover">
                    <fieldset><legend>自动刷新</legend>{REFRESH.map(([seconds, label]) => <label key={seconds}>
                      <input type="radio" name="report-auto-refresh" checked={autoRefresh === seconds}
                        onChange={() => { setAutoRefresh(seconds); if (seconds) refresh(); }} />{label}
                    </label>)}</fieldset>
                  </div>}><Button theme="outline" className={'us-refresh-settings' + (autoRefresh ? ' is-active' : '')} aria-label="自动刷新设置">
                    <span>{autoRefresh ? '自动刷新已开启' : '自动刷新'}</span><ChevronDown size={14} />
                  </Button></Popover>
                </div>
                <Button theme="outline" size="small" aria-label={exportLabel} title={exportLabel} disabled={!summary.requests} onClick={exportCSV}><Download /></Button>
              </div>
            </FilterToolbar>
            <div id="tenant-usage-more-filters" hidden={!moreOpen}>
              {moreOpen && <div className="us-extra-filters">
                <div role="group" aria-label="调用方" className="us-extra-filter-group">
                  <b>调用方</b>
                  <FilterField label="API Key"><KeyPicker value={keyId} onChange={value => changeScope({ keyId: value })} items={keys} /></FilterField>
                  {source.canFilterUser && <FilterField label="调用用户"><Pick label="调用用户筛选" value={userId}
                    onChange={value => patch({ userId: value })} items={users} all="全部用户" /></FilterField>}
                </div>
                {!overview && <div role="group" aria-label="模型范围" className="us-extra-filter-group">
                  <b>模型范围</b>
                  <FilterField label="模型 ID"><MultiPick label="模型 ID" value={modelIds} onChange={value => patch({ modelIds: value })}
                    items={models} searchPlaceholder="搜索模型名称或 ID" /></FilterField>
                </div>}
              </div>}
            </div>
            <FilterViewRow className="us-view-row">
              <SavedFilterViews scope={scope + ':tenant-usage'} value={{ ...filters, range }} groups={conditions}
                currentGroups={conditions.filter(group => group.active)} onApply={applySaved} />
            </FilterViewRow>
            <span className="us-report-notice" role="status">{notice || (modelIds?.length === 0 ? '请选择至少一个模型 ID' : '')}</span>
          </section>
          {overview ? <OverviewSummary report={report} subscribed={subscribed} modelCategory={modelCategory} currency={currency}
            plan={plan} internal={internal} scopedProject={scopedProject} /> :
            <ModelSummary report={report} tokenScope={tokenScope} inputOnly={inputOnly} native={displayNative} />}
          {currencies.length > 1 && <div className="us-report-currency">
            <FilterField label="费用显示币种"><Pick label="费用显示币种" value={currency} onChange={setCurrencyPreference}
              items={currencies.map(id => ({ id, name: id }))} /></FilterField>
          </div>}
          {overview && <div className="us-charts us-overview-analysis">
            <Composition summary={summary} />
            <SubscribedUsage report={report} subscribed={subscribed} modelLabel={modelLabel} internal={internal} />
          </div>}
          {overview ? <section className="us-chart us-report-rank" aria-labelledby="usage-rank-heading">
            <div className="us-report-section-head">
              <div className="us-report-rank-title">
                <h2 id="usage-rank-heading">用量排行</h2>
                {rankScope && <span>{rankScope}</span>}
              </div>
              <FilterField label="排序指标"><Pick label="排行排序" value={rankBy} onChange={setRankMetric}
                items={rankOptions.map(([id, name]) => ({ id, name }))} /></FilterField>
            </div>
            <div className="us-report-rank-grid">
              {RANKINGS.map(([dimension, title]) => <RankCard key={dimension} title={title} dimension={dimension} metricLabel={rankLabel}
                rows={usageRanking(report, dimension, rankBy, currency).slice(0, 10)}
                labelFor={dimension === 'modelId' ? modelLabel : id => valueFor(dimension === 'projectId' ? projects : keys, id)}
                format={rankFormat} canOpenModel={modelCategory} onPick={pickRank} />)}
            </div>
          </section> : <div className="us-chart-layout">
            <div className="us-charts">
              {charts.map(renderTrend)}
              {showComposition && <Composition summary={summary} />}
              {showCache && <CachePanel report={report} labels={labels} currency={currency} plan={plan} />}
              {details.length > 0 && <>
                <h3 className="us-report-detail-heading">分项趋势</h3>
                {details.map(renderTrend)}
              </>}
            </div>
            <ChartNavigation key={nav.map(([id]) => id).join('|')} items={nav} />
          </div>}
        </>}
      </div>
  </div>;
}
