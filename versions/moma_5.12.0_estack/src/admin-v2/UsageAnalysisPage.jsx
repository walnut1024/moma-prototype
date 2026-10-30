import { toast } from 'sonner';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES } from '../components/FilterControls';
import { useEffect, useRef, useState } from 'react';
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowUp, CalendarDays, ChevronLeft, ChevronRight, Download, GripVertical, RotateCcw, Save, Search } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { TooltipProvider } from '../components/ui/tooltip';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { DateRange } from './AnalyticsFilters';
import UsageTrend from './UsageTrend';
import { UsageShare, UsageDistribution } from './UsageComposition';
import { ToggleGroup, ToggleGroupItem } from '../components/ui/toggle-group';
import { defaultTrend, validTrendView, trendDimensions, tokenMetrics, usageDimensions, supplySummary } from './usage-trends';
import SavedFilterViews from '../components/SavedFilterViews';
import { FilterPresets, FilterReset, FilterToolbar, FilterViewRow, } from '../components/FilterControls';
import { formatUsageNumber, usageFacts, usageGroups, usageModelTypes, usagePreset, usagePresets, operationsPeriod, usageFilterOptions, usageTotals } from './usage-analysis';
import { defaultCardOrder, moveCard, normalizeCardOrder } from './usage-card-order';
import './usage-analysis.css';

const percent = (value, total) => total > 0 ? `${(value / total * 100).toFixed(2)}%` : '—';
const amount = value => formatUsageNumber(value).replace('w', '万');
const labelFor = (collection, id) => collection.find(item => item.id === id)?.name || (id === '__unknown__' ? '未归属' : id);
const presets = usagePresets;
const otherUsage = row => Object.entries(row.units).filter(([, value]) => value > 0).map(([unit, value]) => `${amount(value)} ${unit}`).join(' · ') || '—';
const cardOrderKey = 'moma:5120:usage-analysis:card-order:v1';
const navLabels = Object.fromEntries([
  ['usage-token-trend', 'Token 调用量趋势'], ['usage-call-trend', '模型调用次数趋势'],
  ['usage-model-share', '模型调用次数占比'], ['usage-volume-share', '模型调用量占比'],
  ['usage-distribution', '客户调用量分层与 Token 分段'],
  ['usage-detail', '用量明细'],
]);
const trendIds = ['usage-token-trend', 'usage-call-trend'];
const shareIds = ['usage-model-share', 'usage-volume-share'];
const filterPanelIds = [...trendIds, ...shareIds];
const navGroups = Object.fromEntries(Object.entries(defaultCardOrder).flatMap(([group, ids]) => ids.map(id => [id, group])));
function readCardOrder() {
  try { return normalizeCardOrder(JSON.parse(localStorage.getItem(cardOrderKey))); }
  catch { return normalizeCardOrder(null); }
}
function SortableNavItem({ id, label, active, onSelect, onMove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({ id });
  return <button type="button" ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`ua-sortable-nav ${active ? 'active ' : ''}${isDragging ? 'is-dragging ' : ''}${isOver ? 'is-drop-target' : ''}`} aria-current={active ? 'location' : undefined} {...attributes} {...listeners} title={label} aria-label={`${label}，拖动或按上下方向键调整顺序`} onClick={() => { if (!isDragging) onSelect(id); }} onKeyDown={event => { const step = { ArrowUp: -1, ArrowDown: 1 }[event.key]; if (step && !isDragging) { event.preventDefault(); onMove(id, step); } else listeners.onKeyDown?.(event); }}><GripVertical size={12} aria-hidden="true"/><span>{label}</span></button>;
}

const emptyFilters = () => ({ types: null, tenant: null, model: null, providers: [], channels: null, user: null });

function csvCell(value) { return `"${String(value ?? '').replaceAll('"', '""')}"`; }

export default function UsageAnalysisPage({ state }) {
  const route = new URLSearchParams(location.hash.split('?')[1] || '');
  const [clock, setClock] = useState(() => Date.now());
  const initial = operationsPeriod(route.has('start') && route.has('end') ? 'custom' : 'yesterday', { start: route.get('start'), end: route.get('end') }, clock, true);
  const [period, setPeriod] = useState(initial.period);
  const [range, setRange] = useState(initial.range);
  const [panelFilters, setPanelFilters] = useState(() => Object.fromEntries(filterPanelIds.map(id => [id, { ...emptyFilters(), user: route.has('user') ? [route.get('user')] : null, model: route.has('model') ? [route.get('model')] : null }])));
  const [trends, setTrends] = useState(() => Object.fromEntries(trendIds.map(id => [id, defaultTrend()])));
  const [shares, setShares] = useState(() => Object.fromEntries(shareIds.map(id => [id, { dimension: 'modelId', metric: 'total' }])));
  const [detailMode, setDetailMode] = useState('tenantId'), [query, setQuery] = useState(''), [page, setPage] = useState(0), [size, setSize] = useState(DEFAULT_PAGE_SIZE), [sort, setSort] = useState('total');
  const [navOpen, setNavOpen] = useState(true), [activeSection, setActiveSection] = useState('usage-token-trend');
  const [savedOrder, setSavedOrder] = useState(readCardOrder), [cardOrder, setCardOrder] = useState(savedOrder), [saveError, setSaveError] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const navLock = useRef(0);
  const navItems = [...cardOrder.overview, 'usage-detail'].map(id => [id, navLabels[id]]);
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
    const group = navGroups[id], visible = cardOrder[group];
    const index = visible.indexOf(id), target = visible[Math.max(0, Math.min(visible.length - 1, index + step))];
    if (target) setCardOrder(order => moveCard(order, group, id, target));
  };
  const saveOrder = () => {
    try { localStorage.setItem(cardOrderKey, JSON.stringify(cardOrder)); setSavedOrder(cardOrder); setSaveError(false); toast.success("图表布局已保存"); }
    catch { setSaveError(true); toast.error("布局保存失败，请检查浏览器存储"); }
  };
  const setPanelFilter = (id, value) => setPanelFilters(previous => ({ ...previous, [id]: value }));
  const choosePeriod = value => { const current = Date.now(); setClock(current); setPeriod(value); setRange(usagePreset(value, current)); setPage(0); };
  const result = usageFacts(state, range, emptyFilters(), clock);
  const current = result?.current || [], usageWindow = result?.window;
  const tokenRows = current.filter(row => row.unit === 'Token');
  const totals = usageTotals(tokenRows, ['input', 'output']);
  const customers = usageGroups(current, 'tenantId'), models = usageGroups(current, 'modelId');
  const collection = detailMode === 'tenantId' ? state.tenants : state.models;
  const detailRows = (detailMode === 'tenantId' ? customers : models).filter(row => labelFor(collection, row.id).toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => b[sort] - a[sort] || a.id.localeCompare(b.id));
  const detailPages = Math.max(1, Math.ceil(detailRows.length / size));
  const detailPage = Math.min(page, detailPages - 1);
  const pageRows = detailRows.slice(detailPage * size, (detailPage + 1) * size);
  const periodName = period === 'custom' ? `${range.start}—${range.end}` : presets.find(([id]) => id === period)?.[1];
  const viewGroups = [
    { label: '时间', text: `${period === 'custom' ? '自定义' : periodName}（${range.start} — ${range.end}）` },
  ];
  const filterOptions = usageFilterOptions(state);
  const curveOptions = { modelId: filterOptions.models, category: usageModelTypes, providerId: filterOptions.providers, tenantId: state.tenants };
  const savedGroups = [...viewGroups, ...Object.entries(panelFilters).map(([id, value]) => ({ label: navLabels[id], text: [
    ['model', '模型', filterOptions.models], ['channels', '渠道', filterOptions.channels], ['user', '用户', filterOptions.users],
  ].map(([key, label, items]) => key === 'channels' && value.providers.length ? supplySummary(value, filterOptions, true) : value[key] === null ? `全部${label}` : value[key].map(item => labelFor(items, item)).join('、') || `未选择${label}`).concat(trends[id] ? [trendDimensions.find(([key]) => key === trends[id].dimension)[1], ...(id === 'usage-token-trend' ? [tokenMetrics.find(([key]) => key === trends[id].metric)[1]] : []), trends[id].showTotal ? '显示范围合计' : '', trends[id].dimension !== 'total' ? trends[id].curves === null ? '默认曲线' : `已选曲线：${trends[id].curves.map(key => labelFor(curveOptions[trends[id].dimension] || [], key)).join('、') || '无'}` : ''] : shares[id] ? [usageDimensions.find(([key]) => key === shares[id].dimension)[1], ...(id === 'usage-volume-share' ? [tokenMetrics.find(([key]) => key === shares[id].metric)[1]] : [])] : []).filter(Boolean).join(' · ') }))];
  const exportCsv = () => {
    try {
    const header = [detailMode === 'tenantId' ? '用户名/ID' : '模型名称/ID', 'Token 调用量', '输入 Token', '输出 Token', '其他用量（分单位）', '模型调用次数', 'Token 占比'];
    const data = detailRows.map(row => [labelFor(collection, row.id), row.tokenCalls ? row.total : '—', row.tokenCalls ? row.input : '—', row.tokenCalls ? row.output : '—', otherUsage(row), row.calls, percent(row.total, totals.total)]);
    const csv = '\ufeff' + [[`统计范围：${range.start}—${range.end}`, '北京时间'], header, ...data].map(row => row.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `用量明细-${range.start}-${range.end}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 0); toast.success("已开始下载用量明细");
    } catch { toast.error("导出失败，请重试"); }
  };
  return <TooltipProvider><div className="ua-page ua-usage-analysis">
    <Card className="ua-filters"><CardContent><div className="ua-filter-scroll"><FilterToolbar className="ua-filter-controls"><FilterPresets className="ua-segments" label="统计时间范围" value={period} onChange={choosePeriod} items={presets}/><DateRange presets={presets} trigger={<Button variant="outline" className="filter-date-trigger" aria-label="日期范围"><CalendarDays data-icon="inline-start"/>{range.start === range.end ? range.start : `${range.start} — ${range.end}`}</Button>} start={range.start} end={range.end} granularity={usageWindow?.weekly ? 'week' : 'day'} allowLongRange onChange={value => { const current = Date.now(); setClock(current); const selected = operationsPeriod('custom', value, current, true); setPeriod(selected.period); setRange(selected.range); setPage(0); }}/><span className="ua-time-scope" title="时间范围作用于全部图表与明细">北京时间</span><FilterReset onClick={() => choosePeriod('yesterday')}/></FilterToolbar></div></CardContent><CardContent className="ua-view-row"><FilterViewRow><SavedFilterViews notify={toast} scope="admin-usage-analysis-composition" showCurrent={false} saveDescription="保存时间、各图筛选、趋势展示方式、Token口径及占比统计维度。" value={{period,range,panelFilters,trends,shares}} onApply={view => { if (!validTrendView(view, filterPanelIds, trendIds, shareIds)) { toast.error('视图配置无效，请重新保存'); return false; } const current = Date.now(); setClock(current); const restored = operationsPeriod(view.period, view.range, current, true); setPeriod(restored.period); setRange(restored.range); setPanelFilters(Object.fromEntries(filterPanelIds.map(id => [id, view.panelFilters[id]]))); setTrends(view.trends); setShares(view.shares); setPage(0); }} groups={savedGroups} currentGroups={viewGroups} disabled={!usageWindow}/></FilterViewRow></CardContent></Card>
    {!usageWindow ? <p role="alert">请选择有效日期范围：不超过 365 天，且不能晚于今日。</p> : <>
      <div className={`ua-content-layout${navOpen ? '' : ' is-nav-collapsed'}`}>
        <div className="ua-content-sections">
          <div className="ua-trend-stack">{cardOrder.overview.map(id => <section key={id} id={id}>{shareIds.includes(id) ? <UsageShare state={state} range={range} clock={clock} filters={panelFilters[id]} onChange={value => setPanelFilter(id, value)} volume={id === 'usage-volume-share'} settings={shares[id]} onSettings={value => setShares(previous => ({ ...previous, [id]: value }))}/> : id === 'usage-distribution' ? <UsageDistribution state={state} range={range} clock={clock}/> : <UsageTrend state={state} range={range} clock={clock} filters={panelFilters[id]} onChange={value => setPanelFilter(id, value)} calls={id === 'usage-call-trend'} settings={trends[id]} onSettings={value => setTrends(previous => ({ ...previous, [id]: value }))} onCopy={() => { const target = trendIds.find(item => item !== id); setPanelFilter(target, structuredClone(panelFilters[id])); setTrends(previous => ({ ...previous, [target]: { ...previous[target], curves: null } })); }}/>}</section>)}</div>
          <section id="usage-detail"><Card className="ua-panel ua-detail"><CardHeader><div className="ua-heading"><CardTitle>用量明细</CardTitle><small>{range.start}—{range.end}</small></div><Button variant="outline" size="sm" disabled={!detailRows.length} onClick={exportCsv}><Download size={15}/>导出</Button></CardHeader><CardContent><div className="ua-detail-controls"><ToggleGroup className="ua-segments" type="single" variant="outline" size="sm" aria-label="明细汇总维度" value={detailMode} onValueChange={value => { if (value) { setDetailMode(value); setPage(0); setQuery(''); } }}><ToggleGroupItem value="tenantId">按客户</ToggleGroupItem><ToggleGroupItem value="modelId">按模型</ToggleGroupItem></ToggleGroup><Select value={sort} onValueChange={value => { setSort(value); setPage(0); }}><SelectTrigger aria-label="明细排序" className="ua-sort"><SelectValue/></SelectTrigger><SelectContent><SelectGroup><SelectItem value="total">按 Token 排序</SelectItem><SelectItem value="calls">按调用次数排序</SelectItem></SelectGroup></SelectContent></Select><label className="ua-search"><Search size={15}/><Input value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} aria-label="搜索明细" placeholder="搜索名称"/></label></div><div className="ua-table-scroll"><Table><TableHeader><TableRow>{[detailMode === 'tenantId' ? '用户名/ID' : '模型名称/ID', 'Token 调用量', '输入 Token', '输出 Token', '其他用量', '模型调用次数', 'Token 占比'].map(label => <TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader><TableBody>{pageRows.map(row => <TableRow key={row.id}><TableCell>{labelFor(collection, row.id)}</TableCell><TableCell>{amount(row.tokenCalls ? row.total : null)}</TableCell><TableCell>{amount(row.tokenCalls ? row.input : null)}</TableCell><TableCell>{amount(row.tokenCalls ? row.output : null)}</TableCell><TableCell>{otherUsage(row)}</TableCell><TableCell>{amount(row.calls)}</TableCell><TableCell>{percent(row.total, totals.total)}</TableCell></TableRow>)}</TableBody></Table>{!detailRows.length && <p className="ua-empty">所选范围暂无明细记录</p>}</div><div className="ua-pagination"><span>共 {detailRows.length} 条</span><Select value={String(size)} onValueChange={value => { setSize(Number(value)); setPage(0); }}><SelectTrigger aria-label="用量明细每页条数"><SelectValue/></SelectTrigger><SelectContent><SelectGroup>{PAGE_SIZES.map(value => <SelectItem key={value} value={String(value)}>{value} 条 / 页</SelectItem>)}</SelectGroup></SelectContent></Select><Button variant="outline" size="sm" disabled={detailPage === 0} onClick={() => setPage(detailPage - 1)}>上一页</Button><span>{detailPage + 1} / {detailPages}</span><Button variant="outline" size="sm" disabled={detailPage + 1 >= detailPages} onClick={() => setPage(detailPage + 1)}>下一页</Button></div></CardContent></Card></section>
        </div>
        <aside className="ua-chart-nav" aria-label="图表导航">
          <div className="ua-chart-nav-head">{navOpen && <strong>图表导航</strong>}<Button type="button" variant="ghost" size="icon" aria-label={navOpen ? '收起图表导航' : '展开图表导航'} aria-expanded={navOpen} onClick={() => setNavOpen(value => !value)}>{navOpen ? <ChevronRight/> : <ChevronLeft/>}</Button></div>
          {navOpen && <div className="ua-chart-nav-actions"><Button type="button" variant="ghost" size="icon" className={unsavedOrder ? 'is-dirty' : ''} aria-label={saveError ? '保存失败，请检查浏览器存储' : '保存当前布局'} title={saveError ? '保存失败，请检查浏览器存储' : '保存当前布局'} disabled={!unsavedOrder} onClick={saveOrder}><Save/></Button><Button type="button" variant="ghost" size="icon" aria-label="恢复默认布局" title="恢复默认布局（保存后生效）" disabled={!customOrder} onClick={() => setCardOrder(normalizeCardOrder(null))}><RotateCcw/></Button></div>}
          {navOpen && <><DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={({ active, over }) => { if (over && navGroups[active.id] === navGroups[over.id]) setCardOrder(order => moveCard(order, navGroups[active.id], active.id, over.id)); }}><nav>{Object.entries(defaultCardOrder).map(([group]) => <SortableContext key={group} items={cardOrder[group]} strategy={verticalListSortingStrategy}>{(cardOrder[group]).map(id => <SortableNavItem key={id} id={id} label={navLabels[id]} active={activeSection === id} onSelect={goTo} onMove={moveNav}/>)}</SortableContext>)}<button type="button" className={activeSection === 'usage-detail' ? 'active' : ''} aria-current={activeSection === 'usage-detail' ? 'location' : undefined} onClick={() => goTo('usage-detail')}>用量明细</button></nav></DndContext><button type="button" className="ua-back-top" onClick={() => document.defaultView.scrollTo({ top: 0, behavior: 'smooth' })}><ArrowUp size={14}/>回到顶部</button></>}
        </aside>
      </div>
    </>}
  </div></TooltipProvider>;
}
