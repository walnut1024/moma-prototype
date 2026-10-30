import { useRef, useState } from 'react';
import { Info, Maximize2, MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { TimeSeriesChart } from '../components/AnalyticsCharts';
import { chartColor } from '../components/chart-style.mjs';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Checkbox } from '../components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/tooltip';
import UsageFilterBar from './UsageFilterBar';
import { usageFacts, usageFilterOptions } from './usage-analysis';
import { tokenMetrics, trendDimensions, trendSeries, visibleTrendIds, supplySummary } from './usage-trends';

export default function UsageTrend({ state, range, clock, filters, onChange, calls, settings, onSettings, onCopy }) {
  const expandButton = useRef(null);
  const title = calls ? '模型调用次数趋势' : 'Token 调用量趋势';
  const [expanded, setExpanded] = useState(false), [query, setQuery] = useState(''), [menuOpen, setMenuOpen] = useState(false);
  const facts = usageFacts(state, range, filters, clock);
  const options = usageFilterOptions(state);
  const trend = trendSeries(state, facts, filters, settings, calls);
  const grouped = settings.dimension !== 'total';
  const selected = visibleTrendIds(trend.groups, settings.curves);
  const series = (grouped ? [...(settings.showTotal ? [trend.total] : []), ...trend.groups] : [trend.total]).map(item => ({ ...item, color: item.color || chartColor({ label: item.id }) }));
  const names = series.filter(item => item.total || selected.includes(item.id)).map(item => item.label);
  const matching = trend.groups.filter(item => `${item.label} ${item.code} ${item.id}`.toLowerCase().includes(query.trim().toLowerCase()));
  const change = value => { onChange(value); onSettings({ ...settings, curves: null }); };
  const selectSetting = (key, value) => onSettings({ ...settings, [key]: value, ...(key === 'dimension' ? { curves: null } : {}) });
  const empty = filters.model?.length === 0 ? '未选择模型，请调整筛选' : filters.channels?.length === 0 && !filters.providers.length ? '未选择供应商或渠道，请调整筛选' : filters.user?.length === 0 ? '未选择用户，请调整筛选' : !trend.applicable ? '所选模型不按 Token 计量' : !facts.current.length ? '所选条件下暂无调用记录' : grouped && !names.length ? '暂无可显示曲线，请选择曲线或恢复默认' : null;
  const unknown = settings.dimension === 'tenantId' && facts.current.some(row => !row.tenantId);
  const metricControl = !calls && <Select value={settings.metric} onValueChange={value => selectSetting('metric', value)}><SelectTrigger aria-label={`${title}Token口径`} className="ua-metric-select"><SelectValue/></SelectTrigger><SelectContent><SelectGroup>{tokenMetrics.map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}</SelectGroup></SelectContent></Select>;
  const controls = (inDialog = false) => <div className="ua-trend-controls">
    <Select value={settings.dimension} onValueChange={value => selectSetting('dimension', value)}><SelectTrigger aria-label={`${title}展示方式`}><SelectValue/></SelectTrigger><SelectContent><SelectGroup>{trendDimensions.map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}</SelectGroup></SelectContent></Select>
    {!inDialog && <Button variant="ghost" size="icon" ref={expandButton} aria-label={`放大${title}`} onClick={() => { setMenuOpen(false); setExpanded(true); }}><Maximize2 size={16}/></Button>}
  </div>;
  const curveHelp = <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="ua-curve-help" aria-label={`${title}曲线说明`}><Info size={16}/></Button></TooltipTrigger><TooltipContent>{grouped && `默认显示本时段累计${calls ? '调用次数' : 'Token 用量'}前5项。隐藏曲线不改变范围合计。`}调用次数按最终请求去重；供应商按实际渠道归属。Token仅包含Token计量记录。</TooltipContent></Tooltip>;
  const picker = () => <Popover open={menuOpen} onOpenChange={open => { setMenuOpen(open); if (open) setQuery(''); }}><PopoverTrigger asChild><Button variant={grouped ? 'outline' : 'ghost'} size={grouped ? 'sm' : 'icon'} aria-label={grouped ? `${title}选择曲线` : `${title}更多设置`}>{grouped ? `曲线 ${selected.length}/${trend.groups.length}` : <MoreHorizontal size={16}/>}</Button></PopoverTrigger><PopoverContent align="end" className="ua-trend-menu" aria-label={`${title}曲线设置`}>
    {grouped && <>
      <div className="ua-curve-toolbar"><Input aria-label={`${title}搜索曲线`} placeholder="搜索名称或 ID" value={query} onChange={event => setQuery(event.target.value)}/><Button variant="ghost" size="sm" aria-label="显示全部曲线" onClick={() => selectSetting('curves', trend.groups.map(item => item.id))}>全选</Button><Button variant="ghost" size="sm" aria-label="恢复默认曲线" onClick={() => selectSetting('curves', null)}>重置</Button>{curveHelp}</div>
      <div className="ua-curve-options" role="group" aria-label="显示曲线">{matching.map(item => <label key={item.id}><Checkbox aria-label={`显示 ${item.label}`} checked={selected.includes(item.id)} onCheckedChange={value => selectSetting('curves', value === true ? [...selected, item.id] : selected.filter(id => id !== item.id))}/><span title={item.label}>{item.label}</span></label>)}{!matching.length && <p className="ua-picker-empty" role="status">暂无匹配曲线</p>}</div>
    </>}
    <div className="ua-curve-footer">{grouped && <><span>已选 {selected.length}/{trend.groups.length}</span><label className="ua-curve-total"><Checkbox aria-label="同时显示范围合计" checked={settings.showTotal} onCheckedChange={value => selectSetting('showTotal', value === true)}/>叠加合计</label></>}<Button variant="ghost" size="sm" aria-label="将筛选条件应用到另一张趋势图" title="将筛选条件应用到另一张趋势图" onClick={() => { onCopy(); setMenuOpen(false); toast.success('已将筛选条件应用到另一张趋势图'); }}>同步筛选</Button>{!grouped && curveHelp}</div>
  </PopoverContent></Popover>;
  const filterBar = () => <UsageFilterBar state={state} filters={filters} onChange={change} title={title} controls={metricControl}>{picker()}</UsageFilterBar>;
  const plot = height => <>
    {empty ? <p className="ua-chart-empty" style={{ height }} role="status">{empty}</p> : <TimeSeriesChart compact height={height} showData={false} label={title} labels={trend.buckets.map(bucket => bucket.label)} series={series} selectedNames={names} onSelectNames={next => onSettings({ ...settings, curves: trend.groups.filter(item => next.includes(item.label)).map(item => item.id), showTotal: next.includes(trend.total.label) })} unit={calls ? '次' : 'Token'}/>}
    {!empty && (grouped || trend.pending > 0) && <p className="ua-trend-note" role="status">{grouped && `共 ${trend.groups.length} 项，${settings.curves === null && trend.groups.length > 5 ? `按本时段累计${calls ? '调用次数' : 'Token 用量'}显示前 5 项` : `显示 ${selected.length} 项`}。`}{trend.pending > 0 && ` ${trend.pending} 条记录计量待确认，涉及时间点显示断点。`}{unknown && ' 缺少客户 ID 的请求计入未归属客户。'}</p>}
  </>;
  return <>
    <Card className="ua-panel ua-trend-panel"><CardHeader><CardTitle>{title}</CardTitle>{!expanded && controls()}</CardHeader><CardContent>{expanded ? <div style={{ height: 350 }}/> : <>{filterBar()}{plot(280)}</>}</CardContent></Card>
    <Dialog open={expanded} onOpenChange={setExpanded}><DialogContent className="ua-trend-dialog" onCloseAutoFocus={event => { event.preventDefault(); requestAnimationFrame(() => expandButton.current?.focus()); }}><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{range.start} — {range.end} · 北京时间 · {supplySummary(filters, options, true)}</DialogDescription></DialogHeader>{controls(true)}{filterBar()}{plot(460)}</DialogContent></Dialog>
  </>;
}
