import { useEffect, useRef, useState } from 'react';
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowUp, ChevronLeft, ChevronRight, Download, GripVertical, Info, Maximize2, RotateCcw, Save, Search } from 'lucide-react';
import { TimeSeriesChart, RankingChart } from '../components/AnalyticsCharts';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { DateRange, MultiPick } from './AnalyticsFilters';
import SavedFilterViews from '../components/SavedFilterViews';
import { FilterPresets, FilterReset, FilterToolbar, FilterViewRow, TIME_PRESETS } from '../components/FilterControls';
import { formatUsageNumber as amount, usageBuckets, usageCallBuckets, usageCategory, usageFacts, usageGroups, usageMeter, usageModelTypes, usagePreset, usageRates, usageSupplier, usageSuppliers, usageTotals } from './usage-analysis';
import { defaultCardOrder, moveCard, normalizeCardOrder } from './usage-card-order';
import './usage-analysis.css';

const percent = (value, total) => total > 0 ? `${(value / total * 100).toFixed(2)}%` : '—';
const kpiAmount = value => value > 0 && value < 0.01 ? '<0.01' : amount(value);
const delta = (current, before, comparable, hasPrior) => !comparable ? hasPrior ? '计量待确认' : '上期无记录' : before === 0 ? '上期为 0' : `${current >= before ? '+' : ''}${((current / before - 1) * 100).toFixed(2)}%`;
const labelFor = (collection, id) => collection.find(item => item.id === id)?.name || (id === '__unknown__' ? '未归属' : id);
const presets = TIME_PRESETS;
const sources = [{ id: 'selfHosted', name: '自产' }, { id: 'thirdParty', name: '引入' }, { id: 'unknown', name: '未知来源' }];
const otherUsage = row => Object.entries(row.units).map(([unit, value]) => `${amount(value)} ${unit}`).join(' · ') || '—';
const cardOrderKey = 'moma:usage-analysis:card-order:v1';
const navLabels = Object.fromEntries([
  ['usage-token-trend', 'Token 调用量趋势'], ['usage-call-trend', '模型调用次数趋势'],
  ...usageModelTypes.map(type => [`usage-${type.id}`, `${type.name}用量`]),
  ['usage-customer-token-rank', '客户 Token Top 10'], ['usage-model-token-rank', '模型 Token Top 10'],
  ['usage-customer-call-rank', '客户调用 Top 10'], ['usage-model-call-rank', '模型调用 Top 10'],
  ['usage-detail', '用量明细'],
]);
const navGroups = Object.fromEntries(Object.entries(defaultCardOrder).flatMap(([group, ids]) => ids.map(id => [id, group])));
function readCardOrder() {
  try { return normalizeCardOrder(JSON.parse(localStorage.getItem(cardOrderKey))); }
  catch { return normalizeCardOrder(null); }
}
function SortableNavItem({ id, label, active, onSelect, onMove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({ id });
  return <button type="button" ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`ua-sortable-nav ${active ? 'active ' : ''}${isDragging ? 'is-dragging ' : ''}${isOver ? 'is-drop-target' : ''}`} aria-current={active ? 'location' : undefined} {...attributes} {...listeners} aria-label={`${label}，拖动或按上下方向键调整顺序`} onClick={() => { if (!isDragging) onSelect(id); }} onKeyDown={event => { const step = { ArrowUp: -1, ArrowDown: 1 }[event.key]; if (step && !isDragging) { event.preventDefault(); onMove(id, step); } else listeners.onKeyDown?.(event); }}><GripVertical size={12} aria-hidden="true"/><span>{label}</span></button>;
}

function Help({ label, children }) {
  return <Tooltip><TooltipTrigger asChild><button type="button" className="ua-help" aria-label={`${label}口径`}><Info size={14}/></button></TooltipTrigger><TooltipContent className="max-w-72 leading-relaxed">{children}</TooltipContent></Tooltip>;
}
function Segments({ items, value, onChange, label }) {
  return <div className="ua-segments" role="group" aria-label={label}>{items.map(([id, name]) => <Button key={id} type="button" size="sm" variant={value === id ? 'default' : 'outline'} aria-pressed={value === id} onClick={() => onChange(id)}>{name}</Button>)}</div>;
}
function TrendPanel({ title, series, buckets, unit, controls, empty }) {
  return <Card className="ua-panel"><CardHeader><CardTitle>{title}</CardTitle><div className="ua-chart-actions">{controls}</div></CardHeader><CardContent>{empty || !series.length ? <p className="ua-chart-empty">{empty || '所选范围暂无模型用量记录'}</p> : <TimeSeriesChart label={title} labels={buckets.map(bucket => bucket.label)} series={series} unit={unit}/>}</CardContent></Card>;
}
function ModelTrend({ category, models, rows, buckets }) {
  const [chosenUnit, setUnit] = useState(null);
  const scopedModels = models.filter(model => category.types.includes(model.type));
  const scopedRows = rows.filter(row => row.category === category.id);
  const modelUnit = model => usageMeter(model, scopedRows.find(row => row.modelId === model.id)).unit;
  const units = [...new Set([...scopedRows.map(row => row.unit), ...scopedModels.map(modelUnit)])];
  const unit = units.includes(chosenUnit) ? chosenUnit : units[0];
  let series = scopedModels.filter(model => modelUnit(model) === unit || scopedRows.some(row => row.modelId === model.id && row.unit === unit)).map(model => ({ id: model.id, label: model.name, values: buckets.map(bucket => scopedRows.filter(row => row.modelId === model.id && row.unit === unit && row.at >= bucket.start && row.at < bucket.end).reduce((sum, row) => sum + row.value.total, 0)) }));
  if (series.length > 1) series = [{ id: 'total', total: true, label: '总量', values: buckets.map(bucket => scopedRows.filter(row => row.unit === unit && row.at >= bucket.start && row.at < bucket.end).reduce((sum, row) => sum + row.value.total, 0)) }, ...series];
  return <TrendPanel title={`${category.name}用量趋势`} series={series} buckets={buckets} unit={unit} empty={!scopedRows.some(row => row.unit === unit) ? '所选范围暂无该类型的用量记录' : null} controls={units.length > 1 && <Segments label={`${category.name}计量单位`} value={unit} onChange={setUnit} items={units.map(value => [value, value === '张' ? '图片 · 张' : value === '秒' ? '时长 · 秒' : value === '字符' ? '文本 · 字符' : value])}/>}/>;
}
function RankPanel({ title, rows, total, collection, metric, limits, onChoose }) {
  const [scale, setScale] = useState('linear'), [open, setOpen] = useState(false), [limit, setLimit] = useState(30);
  const ranked = rows.filter(row => row.id !== '__unknown__' && row[metric] > 0).sort((a, b) => b[metric] - a[metric] || a.id.localeCompare(b.id));
  const top = ranked.slice(0, 10), expanded = ranked.slice(0, limit), unit = metric === 'calls' ? '次' : 'Token';
  const scaleControl = <Segments label={`${title}刻度`} items={[["linear", "线性"], ["log", "指数"]]} value={scale} onChange={setScale}/>;
  const choose = id => { setOpen(false); onChoose(id); };
  return <><Card className="ua-panel ua-ranking"><CardHeader><div><CardTitle>{title}</CardTitle><small>Top 10 占比 {percent(top.reduce((sum, row) => sum + row[metric], 0), total)}</small></div><div className="ua-rank-scale">{scaleControl}<Help label="排行刻度">指数模式使用 log10(数值＋1) 压缩条长；排序、标签和悬浮数值保持原始值。</Help><Button variant="outline" size="icon" className="ua-series-trigger" aria-label={`放大${title}排行榜`} title="放大排行榜" onClick={() => setOpen(true)}><Maximize2 size={15}/></Button></div></CardHeader><CardContent>{top.length ? <RankingChart rows={top} metric={metric} unit={unit} collection={collection} scale={scale} onChoose={choose}/> : <p className="ua-empty">所选范围暂无排行数据</p>}</CardContent></Card><Dialog open={open} onOpenChange={setOpen}><DialogContent className="ua-ranking-dialog"><DialogHeader><DialogTitle>{title.replace('Top 10', `Top ${limit}`)}</DialogTitle><DialogDescription>共 {ranked.length} 个有用量的对象，当前展示 {expanded.length} 个 · 单位：{unit} · 点击条形查看明细</DialogDescription></DialogHeader><div className="ua-expanded-controls"><Segments label="排行数量" value={limit} onChange={setLimit} items={limits.map(value => [value, `Top ${value}`])}/>{scaleControl}</div><div className="ua-expanded-scroll">{expanded.length ? <RankingChart rows={expanded} metric={metric} unit={unit} collection={collection} scale={scale} onChoose={choose}/> : <p className="ua-empty">所选范围暂无排行数据</p>}</div></DialogContent></Dialog></>;
}
function csvCell(value) { return `"${String(value ?? '').replaceAll('"', '""')}"`; }

export default function UsageAnalysisPage({ state }) {
  const route = new URLSearchParams(location.hash.split('?')[1] || '');
  const [clock, setClock] = useState(() => Date.now());
  const [period, setPeriod] = useState(() => route.has('start') && route.has('end') ? 'custom' : 'today');
  const [range, setRange] = useState(() => route.has('start') && route.has('end') ? { start: route.get('start'), end: route.get('end') } : usagePreset('today'));
  const [filters, setFilters] = useState(() => ({ types: null, suppliers: null, tenant: route.has('tenant') ? [route.get('tenant')] : null, model: route.has('model') ? [route.get('model')] : null, source: '' }));
  const [detailMode, setDetailMode] = useState('tenantId'), [query, setQuery] = useState(''), [page, setPage] = useState(0), [inspect, setInspect] = useState(null), [sort, setSort] = useState('total');
  const [navOpen, setNavOpen] = useState(true), [activeSection, setActiveSection] = useState('usage-token-trend');
  const [savedOrder, setSavedOrder] = useState(readCardOrder), [cardOrder, setCardOrder] = useState(savedOrder), [saveError, setSaveError] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const navLock = useRef(0);
  const visibleCategoryIds = cardOrder.categories.filter(id => filters.types === null || filters.types.includes(id.slice(6)));
  const navItems = [...cardOrder.overview, ...visibleCategoryIds, ...cardOrder.rankings, 'usage-detail'].map(id => [id, navLabels[id]]);
  const customOrder = Object.keys(defaultCardOrder).some(group => cardOrder[group].some((id, index) => id !== defaultCardOrder[group][index]));
  const unsavedOrder = Object.keys(defaultCardOrder).some(group => cardOrder[group].some((id, index) => id !== savedOrder[group][index]));
  useEffect(() => {
    const sections = navItems.map(([id]) => document.getElementById(id)).filter(Boolean);
    const update = () => { if (performance.now() >= navLock.current) setActiveSection((sections.filter(section => section.getBoundingClientRect().top <= 160).at(-1) || sections[0])?.id || 'usage-token-trend'); };
    update();
    document.defaultView.addEventListener('scroll', update, { passive: true });
    return () => document.defaultView.removeEventListener('scroll', update);
  });
  const goTo = id => { navLock.current = performance.now() + 700; setActiveSection(id); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const moveNav = (id, step) => {
    const group = navGroups[id], visible = group === 'categories' ? visibleCategoryIds : cardOrder[group];
    const index = visible.indexOf(id), target = visible[Math.max(0, Math.min(visible.length - 1, index + step))];
    if (target) setCardOrder(order => moveCard(order, group, id, target));
  };
  const saveOrder = () => {
    try { localStorage.setItem(cardOrderKey, JSON.stringify(cardOrder)); setSavedOrder(cardOrder); setSaveError(false); }
    catch { setSaveError(true); }
  };
  const setFilter = (key, value) => { setFilters(previous => ({ ...previous, [key]: value, ...(['types', 'suppliers'].includes(key) ? { model: null } : {}) })); setPage(0); };
  const choosePeriod = value => { const current = Date.now(); setClock(current); setPeriod(value); setRange(usagePreset(value, current)); setPage(0); };
  const result = usageFacts(state, range, filters, clock);
  const current = result?.current || [], prior = result?.prior || [], usageWindow = result?.window;
  const tokenRows = current.filter(row => row.unit === 'Token'), priorTokenRows = prior.filter(row => row.unit === 'Token');
  const totals = usageTotals(tokenRows, ['input', 'output']), priorTotals = usageTotals(priorTokenRows, ['input', 'output']);
  const rates = usageWindow ? usageRates(current, usageWindow) : null;
  const priorRates = usageWindow ? usageRates(prior, usageWindow, true) : null;
  const availableModels = state.models.filter(model => (filters.types === null || filters.types.includes(usageCategory(model.type))) && (filters.suppliers === null || filters.suppliers.includes(usageSupplier(model))));
  const selectedModels = availableModels.filter(model => filters.model === null || filters.model.includes(model.id));
  const tokenApplicable = tokenRows.length > 0 || selectedModels.some(model => usageMeter(model).unit === 'Token');
  const comparable = priorTokenRows.length > 0 && priorTokenRows.every(row => row.value.complete) && tokenRows.every(row => row.value.complete);
  const buckets = usageWindow ? usageBuckets(tokenRows, priorTokenRows, usageWindow) : [];
  const callBuckets = usageCallBuckets(current, buckets);
  const customers = usageGroups(current, 'tenantId'), models = usageGroups(current, 'modelId'), providers = usageGroups(current, 'source');
  const collection = detailMode === 'tenantId' ? state.tenants : detailMode === 'modelId' ? state.models : sources;
  const previousById = new Map(usageGroups(prior, detailMode).map(row => [row.id, row]));
  const detailRows = (detailMode === 'tenantId' ? customers : detailMode === 'modelId' ? models : providers).filter(row => labelFor(collection, row.id).toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => b[sort] - a[sort] || a.id.localeCompare(b.id));
  const pageRows = detailRows.slice(page * 5, page * 5 + 5);
  const periodName = period === 'custom' ? `${range.start}—${range.end}` : presets.find(([id]) => id === period)?.[1];
  const viewGroups = [
    { label: '时间', text: `${period === 'custom' ? '自定义' : periodName}（${range.start} — ${range.end}）` },
    { label: '模型类型', items: filters.types?.map(id => labelFor(usageModelTypes, id)) ?? null },
    { label: '供应商', items: filters.suppliers?.map(id => labelFor(usageSuppliers, id)) ?? null },
    { label: '模型 ID', items: filters.model?.map(id => labelFor(state.models, id)) ?? null, all: '全部模型' },
    { label: '供给来源', text: sources.find(source => source.id === filters.source)?.name || '全部' },
    { label: '客户', items: filters.tenant?.map(id => labelFor(state.tenants, id)) ?? null },
  ];
  const compareName = period === 'today' ? '昨日同时段' : period === 'yesterday' ? '前日' : period === '7d' ? '前 7 天' : period === '30d' ? '前 30 天' : '上一等长周期';
  const kpis = [
    { title: 'Token调用总量', value: tokenApplicable ? totals.total : null, before: priorTotals.total, note: 'Total Token Usage（Token 调用总量）：所选时段已确认的输入与输出 Token 合计。缓存不重复计数；张、秒、字符等其他单位不计入。', comparable },
    { title: '模型调用次数', value: current.length, before: prior.length, suffix: ' 次', note: '所选时段的入口模型请求数，包含成功与失败请求；按请求 ID 去重，上游重试不重复计数。', comparable: prior.length > 0 },
    { title: '日均Token调用量', value: tokenApplicable ? rates?.averageTpd ?? null : null, before: priorRates?.averageTpd, note: 'TPD 全称 Token Per Day（每日 Token 数）。日均 Token 调用量＝所选时段 Token 调用总量 ÷ 北京时间自然日数，含无调用日；今日按 1 日计算，不预测全天。', comparable },
    { title: '每分钟 Token 调用量峰值', value: tokenApplicable ? rates?.peakTpm ?? null : null, before: priorRates?.peakTpm, note: 'TPM 全称 Tokens Per Minute（每分钟 Token 数）。峰值是所选时段内单个自然分钟的最大已确认 Token 用量；按请求发生时间聚合，不使用图表的小时／日采样值。', comparable },
    { title: '每分钟 Token 调用量均值', value: tokenApplicable ? rates?.averageTpm ?? null : null, before: priorRates?.averageTpm, note: 'TPM 全称 Tokens Per Minute（每分钟 Token 数）。均值＝所选时段已确认 Token 调用总量 ÷ 实际经过的分钟数，包含无调用分钟；今日只计算至当前时刻。', comparable },
  ];
  const categories = usageModelTypes.filter(type => filters.types === null || filters.types.includes(type.id));
  const tokenOptions = [{ id: 'total', total: true, label: '总 Token', color: '#3568f9' }, ...categories.filter(type => selectedModels.some(model => type.types.includes(model.type) && usageMeter(model).unit === 'Token') || tokenRows.some(row => row.category === type.id)).map(type => ({ ...type, label: type.name }))];
  const callOptions = [{ id: 'total', total: true, label: '总调用次数', color: '#3568f9' }, ...categories.map(type => ({ ...type, label: type.name }))];
  const trendSeries = tokenOptions.map(option => ({ ...option, values: buckets.map(bucket => bucket[option.id]) }));
  const callsSeries = callOptions.map(option => ({ ...option, values: callBuckets.map(bucket => bucket[option.id] || 0) }));
  const inspectGroup = (rows, collection, id) => setInspect({ ...rows.find(row => row.id === id), name: labelFor(collection, id) });
  const exportCsv = () => {
    const header = ['对象', 'Token 调用量', '输入 Token', '输出 Token', '其他用量（分单位）', '模型调用次数', 'Token 占比', '较上期', '计量状态'];
    const data = detailRows.map(row => [labelFor(collection, row.id), row.tokenCalls ? row.total : '—', row.tokenCalls ? row.input : '—', row.tokenCalls ? row.output : '—', otherUsage(row), row.calls, percent(row.total, totals.total), delta(row.total, previousById.get(row.id)?.total || 0, comparable, priorTokenRows.length > 0), row.complete ? '完整' : '待确认']);
    const csv = '\ufeff' + [[`统计范围：${range.start}—${range.end}`, '北京时间', `比较期间：${compareName}`], header, ...data].map(row => row.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `用量明细-${range.start}-${range.end}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  const rankCards = {
    'usage-customer-token-rank': { title: 'Token 用量 Top 10 客户', rows: customers, total: totals.total, collection: state.tenants, metric: 'total', limits: [30, 50, 100], onChoose: id => inspectGroup(customers, state.tenants, id) },
    'usage-model-token-rank': { title: 'Token 用量 Top 10 模型', rows: models, total: totals.total, collection: state.models, metric: 'total', limits: [30, 50], onChoose: id => inspectGroup(models, state.models, id) },
    'usage-customer-call-rank': { title: '模型调用次数 Top 10 客户', rows: customers, total: current.length, collection: state.tenants, metric: 'calls', limits: [30, 50, 100], onChoose: id => inspectGroup(customers, state.tenants, id) },
    'usage-model-call-rank': { title: '模型调用次数 Top 10 模型', rows: models, total: current.length, collection: state.models, metric: 'calls', limits: [30, 50], onChoose: id => inspectGroup(models, state.models, id) },
  };
  return <TooltipProvider><div className="ua-page">
    <Card className="ua-filters"><CardContent><div className="ua-filter-scroll"><FilterToolbar className="ua-filter-controls"><FilterPresets className="ua-segments" label="统计时间范围" value={period} onChange={choosePeriod} items={presets}/><DateRange label="自定义" start={range.start} end={range.end} granularity={usageWindow?.weekly ? 'week' : 'day'} allowLongRange onChange={value => { setPeriod('custom'); setRange(value); setPage(0); }}/><span className="ua-filter-divider"/><div className="ua-select"><span>模型类型</span><MultiPick label="模型类型" value={filters.types} onChange={value => setFilter('types', value)} items={usageModelTypes}/></div><div className="ua-select"><span>供应商</span><MultiPick label="供应商" value={filters.suppliers} onChange={value => setFilter('suppliers', value)} items={usageSuppliers}/></div><div className="ua-select"><span>模型 ID</span><MultiPick label="模型 ID" value={filters.model} onChange={value => setFilter('model', value)} searchPlaceholder="搜索模型，如 DeepSeek-V4-Pro" items={availableModels.map(model => ({ ...model, searchText: model.modelId }))}/></div><label className="ua-select"><span>供给来源</span><Select value={filters.source || 'all'} onValueChange={value => setFilter('source', value === 'all' ? '' : value)}><SelectTrigger aria-label="供给来源"><SelectValue/></SelectTrigger><SelectContent><SelectGroup>{[{ id: 'all', name: '全部' }, ...sources.slice(0, 2)].map(source => <SelectItem key={source.id} value={source.id}>{source.name}</SelectItem>)}</SelectGroup></SelectContent></Select></label>{filters.tenant && <Button variant="outline" size="sm" onClick={() => setFilter('tenant', null)}>客户：{filters.tenant.map(id => labelFor(state.tenants, id)).join('、')} ×</Button>}<FilterReset onClick={() => { setFilters({ types: null, suppliers: null, tenant: null, model: null, source: '' }); choosePeriod('today'); }}/></FilterToolbar></div></CardContent><CardContent className="ua-view-row"><FilterViewRow><SavedFilterViews scope="admin-usage-analysis" value={{period,range,filters}} onApply={view => { if (!view?.filters) return; const current = Date.now(); setClock(current); setPeriod(view.period || 'custom'); setRange(view.period === 'custom' && view.range?.start && view.range?.end ? view.range : usagePreset(view.period || 'today', current)); setFilters(view.filters); setPage(0); }} groups={viewGroups} disabled={!usageWindow}/></FilterViewRow></CardContent></Card>
    {!usageWindow ? <p role="alert">请选择有效日期范围：不超过 365 天，且不能晚于今天。</p> : <>
      <Card className="ua-kpis"><CardContent><div className="ua-kpi-grid">{kpis.map(({ title, value, before, suffix, note, comparable: canCompare }) => <div className="ua-kpi" key={title}><div className="ua-kpi-label">{title}<Help label={title}>{note}</Help></div><strong>{kpiAmount(value)}{value !== null && suffix}</strong>{value === null ? <small>所选模型不按 Token 计量</small> : canCompare && <small>较{compareName}　{delta(value, before, true, true)}</small>}</div>)}</div></CardContent></Card>
      <div className={`ua-content-layout${navOpen ? '' : ' is-nav-collapsed'}`}>
        <div className="ua-content-sections">
          <div className="ua-pair">{cardOrder.overview.map(id => <section key={id} id={id}>{id === 'usage-token-trend' ? <TrendPanel title="Token 调用量趋势" series={trendSeries} buckets={buckets} unit="Token" empty={!tokenApplicable ? '所选模型不按 Token 计量，请查看下方分类用量趋势' : null}/> : <TrendPanel title="模型调用次数趋势" series={callsSeries} buckets={buckets} unit="次"/>}</section>)}</div>
          <div className="ua-pair">{visibleCategoryIds.map(id => { const category = categories.find(item => `usage-${item.id}` === id); return <section key={id} id={id}><ModelTrend category={category} models={selectedModels} rows={current} buckets={buckets}/></section>; })}</div>
          <div className="ua-pair">{cardOrder.rankings.map(id => <section key={id} id={id}><RankPanel {...rankCards[id]}/></section>)}</div>
          <section id="usage-detail"><Card className="ua-panel ua-detail"><CardHeader><div><CardTitle>用量明细</CardTitle><small>{range.start}—{range.end} · 较{compareName}</small></div><div className="ua-detail-controls"><Segments label="明细汇总维度" items={[["tenantId", "按客户"], ["modelId", "按模型"], ["source", "按供给"]]} value={detailMode} onChange={value => { setDetailMode(value); setPage(0); setQuery(''); }}/><Select value={sort} onValueChange={value => { setSort(value); setPage(0); }}><SelectTrigger aria-label="明细排序" className="ua-sort"><SelectValue/></SelectTrigger><SelectContent><SelectGroup><SelectItem value="total">按 Token 排序</SelectItem><SelectItem value="calls">按调用次数排序</SelectItem></SelectGroup></SelectContent></Select><label className="ua-search"><Search size={15}/><Input value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} aria-label="搜索明细" placeholder="搜索名称"/></label><Button variant="outline" size="sm" disabled={!detailRows.length} onClick={exportCsv}><Download size={15}/>导出</Button></div></CardHeader><CardContent><div className="ua-table-scroll"><Table><TableHeader><TableRow>{['对象', 'Token 调用量', '输入 Token', '输出 Token', '其他用量', '模型调用次数', 'Token 占比', `较${compareName}`, '数据状态', '操作'].map(label => <TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader><TableBody>{pageRows.map(row => <TableRow key={row.id}><TableCell>{labelFor(collection, row.id)}</TableCell><TableCell>{amount(row.tokenCalls ? row.total : null)}</TableCell><TableCell>{amount(row.tokenCalls ? row.input : null)}</TableCell><TableCell>{amount(row.tokenCalls ? row.output : null)}</TableCell><TableCell>{otherUsage(row)}</TableCell><TableCell>{amount(row.calls)}</TableCell><TableCell>{percent(row.total, totals.total)}</TableCell><TableCell>{delta(row.total, previousById.get(row.id)?.total || 0, comparable, priorTokenRows.length > 0)}</TableCell><TableCell>{row.complete ? '完整' : '待确认'}</TableCell><TableCell><Button variant="link" size="sm" onClick={() => inspectGroup(detailRows, collection, row.id)}>查看</Button></TableCell></TableRow>)}</TableBody></Table>{!detailRows.length && <p className="ua-empty">所选范围暂无明细记录</p>}</div><div className="ua-pagination"><span>共 {detailRows.length} 条 · 表内搜索仅影响本表</span><Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(value => value - 1)}>上一页</Button><span>{page + 1} / {Math.max(1, Math.ceil(detailRows.length / 5))}</span><Button variant="outline" size="sm" disabled={(page + 1) * 5 >= detailRows.length} onClick={() => setPage(value => value + 1)}>下一页</Button></div></CardContent></Card></section>
        </div>
        <aside className="ua-chart-nav" aria-label="图表导航">
          <div className="ua-chart-nav-head"><strong>{navOpen && '图表导航'}</strong><div className="ua-chart-nav-actions">{navOpen && <><Button type="button" variant="ghost" size="icon" className={unsavedOrder ? 'is-dirty' : ''} aria-label={saveError ? '保存失败，请检查浏览器存储' : '保存当前布局'} title={saveError ? '保存失败，请检查浏览器存储' : '保存当前布局'} disabled={!unsavedOrder} onClick={saveOrder}><Save size={14}/></Button><Button type="button" variant="ghost" size="icon" aria-label="恢复默认布局" title="恢复默认布局（保存后生效）" disabled={!customOrder} onClick={() => setCardOrder(normalizeCardOrder(null))}><RotateCcw size={14}/></Button></>}<Button type="button" variant="ghost" size="icon" aria-label={navOpen ? '收起图表导航' : '展开图表导航'} aria-expanded={navOpen} onClick={() => setNavOpen(value => !value)}>{navOpen ? <ChevronRight size={16}/> : <ChevronLeft size={16}/>}</Button></div></div>
          {navOpen && <><DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={({ active, over }) => { if (over && navGroups[active.id] === navGroups[over.id]) setCardOrder(order => moveCard(order, navGroups[active.id], active.id, over.id)); }}><nav>{Object.entries(defaultCardOrder).map(([group]) => <SortableContext key={group} items={group === 'categories' ? visibleCategoryIds : cardOrder[group]} strategy={verticalListSortingStrategy}>{(group === 'categories' ? visibleCategoryIds : cardOrder[group]).map(id => <SortableNavItem key={id} id={id} label={navLabels[id]} active={activeSection === id} onSelect={goTo} onMove={moveNav}/>)}</SortableContext>)}<button type="button" className={activeSection === 'usage-detail' ? 'active' : ''} aria-current={activeSection === 'usage-detail' ? 'location' : undefined} onClick={() => goTo('usage-detail')}>用量明细</button></nav></DndContext><button type="button" className="ua-back-top" onClick={() => document.defaultView.scrollTo({ top: 0, behavior: 'smooth' })}><ArrowUp size={14}/>回到顶部</button></>}
        </aside>
      </div>
    </>}
    <Dialog open={Boolean(inspect)} onOpenChange={open => { if (!open) setInspect(null); }}><DialogContent><DialogHeader><DialogTitle>{inspect?.name}</DialogTitle><DialogDescription>{range.start}—{range.end} · 所选条件下的已确认用量</DialogDescription></DialogHeader>{inspect && <div className="ua-inspect-list"><div><span>Token 调用量</span><strong>{inspect.tokenCalls ? `${amount(inspect.total)} Token` : '不适用'}</strong></div><div><span>输入 / 输出 Token</span><strong>{amount(inspect.tokenCalls ? inspect.input : null)} / {amount(inspect.tokenCalls ? inspect.output : null)}</strong></div><div><span>其他用量</span><strong>{otherUsage(inspect)}</strong></div><div><span>模型调用次数</span><strong>{amount(inspect.calls)} 次</strong></div><div><span>计量状态</span><strong>{inspect.complete ? '完整' : '待确认'}</strong></div></div>}</DialogContent></Dialog>
  </div></TooltipProvider>;
}
