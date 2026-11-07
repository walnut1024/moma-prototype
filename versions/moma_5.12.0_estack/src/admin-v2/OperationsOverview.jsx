import { toast } from 'sonner';
import { useMemo, useState } from 'react';
import { Info, RefreshCw, ArrowRight, ArrowLeft, Maximize2 } from 'lucide-react';
import { TimeSeriesChart, DonutChart, RankingChart } from '../components/AnalyticsCharts';
import SavedFilterViews from '../components/SavedFilterViews';
import { FilterToolbar, FilterPresets, FilterReset } from '../components/FilterControls';
import { Button } from '../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '../components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { overviewBusiness, overviewPeriod, overviewPresets, overviewDateTime, overviewChange, compactCount } from './overview';
import { DateRange } from './AnalyticsFilters';
import { dayOf } from './analytics';
import './analytics.css';
import './overview.css';
const number = value => value == null ? '—' : value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
const percent = (value, total) => total ? `${(value / total * 100).toFixed(1)}%` : '—';
const signed = value => `${value > 0 ? '+' : ''}${number(value)}`;
function Help({ label, children }) {
  return <Tooltip><TooltipTrigger asChild><Button className="ov-help" variant="ghost" size="icon" aria-label={`${label}说明`}><Info/></Button></TooltipTrigger><TooltipContent className="ov-tooltip">{children}</TooltipContent></Tooltip>;
}
function Change({ value }) {
  value = value == null ? null : (Number(value.toFixed(2)) || 0);
  return <span className={value == null || value === 0 ? 'ov-change' : value > 0 ? 'ov-change ov-positive' : 'ov-change ov-negative'}>{value == null ? '—' : `${signed(value)}%`}</span>;
}
function UsageTable({ rows, kind, total, onSelect, label }) {
  return <div className="ov-table-scroll"><table className="ov-table" aria-label={label}><thead><tr><th>排名</th><th>{kind === 'customer' ? '客户' : '模型'}</th><th>Token 用量</th>{kind === 'customer' ? <th>用量占比</th> : <th>模型请求次数</th>}</tr></thead><tbody>{rows.map((row, i) => <tr key={row.id}><td><span className={i < 3 ? 'ov-rank-leading' : ''}>{i + 1}</span></td><td><button type="button" className="ov-name" onClick={() => onSelect(row)} title={row.name}>{row.name}</button></td><td title={`${number(row.total)} Token`}>{compactCount(row.total)}</td>{kind === 'customer' ? <td>{percent(row.total, total)}</td> : <td title={`${number(row.calls)} 次`}>{compactCount(row.calls)}</td>}</tr>)}</tbody></table>{!rows.length && <p className="ov-empty">本期暂无调用记录</p>}</div>;
}
function RankingSegments({items,value,onChange,label}) {
  return <div className="ov-ranking-segments" role="group" aria-label={label}>{items.map(([id,name])=><Button key={id} type="button" size="sm" variant={value===id?'default':'outline'} aria-pressed={value===id} onClick={()=>onChange(id)}>{name}</Button>)}</div>;
}
function CallRankPanel({ title, rows, total, limits, onChoose }) {
  const metric='calls', collection=rows;
  const [scale, setScale] = useState('linear'), [open, setOpen] = useState(false), [limit, setLimit] = useState(30);
  const ranked = rows.filter(row => row.id !== '__unknown__' && row[metric] > 0).sort((a, b) => b[metric] - a[metric] || a.id.localeCompare(b.id));
  const top = ranked.slice(0, 10), expanded = ranked.slice(0, limit), unit = '次';
  const scaleControl = <RankingSegments label={`${title}刻度`} items={[["linear", "线性"], ["log", "指数"]]} value={scale} onChange={setScale}/>;
  const choose = id => { setOpen(false); onChoose(id); };
  return <><Card className="ov-call-rank"><CardHeader><div><CardTitle>{title}</CardTitle><small>Top 10 占比 {percent(top.reduce((sum, row) => sum + row[metric], 0), total)}</small></div><div className="ov-rank-scale">{scaleControl}<Help label="排行刻度">指数模式使用 log10(数值＋1) 压缩条长；排序、标签和悬浮数值保持原始值。</Help><Button variant="outline" size="icon" className="ov-rank-expand" aria-label={`放大${title}排行榜`} title="放大排行榜" onClick={() => setOpen(true)}><Maximize2 size={15}/></Button></div></CardHeader><CardContent>{top.length ? <RankingChart showData={false} rows={top} metric={metric} unit={unit} collection={collection} scale={scale} onChoose={choose}/> : <p className="ov-empty">所选范围暂无排行数据</p>}</CardContent></Card><Dialog open={open} onOpenChange={setOpen}><DialogContent className="ov-ranking-dialog"><DialogHeader><DialogTitle>{title.replace('Top 10', `Top ${limit}`)}</DialogTitle><DialogDescription>共 {ranked.length} 个有用量的对象，当前展示 {expanded.length} 个 · 单位：{unit} · 点击条形查看明细</DialogDescription></DialogHeader><div className="ov-expanded-controls"><RankingSegments label="排行数量" value={limit} onChange={setLimit} items={limits.map(value => [value, `Top ${value}`])}/>{scaleControl}</div><div className="ov-expanded-scroll">{expanded.length ? <RankingChart showData={false} rows={expanded} metric={metric} unit={unit} collection={collection} scale={scale} onChoose={choose}/> : <p className="ov-empty">所选范围暂无排行数据</p>}</div></DialogContent></Dialog></>;
}
export default function OperationsOverview({state}) {
  const [now, setNow] = useState(() => Date.now()), [periodId, setPeriodId] = useState('day');
  const [customRange, setCustomRange] = useState(null);
  const [detail, setDetail] = useState(null);
  const data = useMemo(() => overviewBusiness(state, now, periodId, customRange), [state, now, periodId, customRange]);
  const { period, previous } = data;
  const choosePeriod = (id, range = null) => { const current = Date.now(); if (!overviewPeriod(current, id, range)) { toast.error('请选择不晚于今天且不超过 365 天的日期范围'); return; } setPeriodId(id); setCustomRange(range); setNow(current); setDetail(null); };
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
  return <TooltipProvider><div className="an-page ov-page">
    <Card className="ov-filters"><CardContent><FilterToolbar><span className="ov-filter-label">统计时间</span><FilterPresets value={periodId} items={overviewPresets} onChange={choosePeriod}><DateRange start={dayOf(period.start)} end={dayOf(Math.max(period.start, period.end - 1))} trigger={<Button type="button" variant={periodId === 'custom' ? 'default' : 'outline'} aria-label="自定义日期范围" aria-pressed={periodId === 'custom'}>{periodId === 'custom' ? period.range : '自定义'}</Button>} presets={[]} allowLongRange rangeHint="单次最多 365 天；单日按小时，多日按天汇总" onChange={range => choosePeriod('custom', range)}/></FilterPresets><span className="ov-date">北京时间</span><div className="ov-filter-actions"><FilterReset onClick={() => choosePeriod('day')}/><Button variant="outline" size="sm" onClick={() => { setNow(Date.now()); toast.success("数据已刷新"); }}><RefreshCw/>刷新</Button></div></FilterToolbar></CardContent><CardContent className="ov-view-row"><SavedFilterViews notify={toast} scope="admin-overview-operations" value={{periodId, customRange}} onApply={view => choosePeriod(view?.periodId, view?.customRange)} groups={[{label:'统计时间',text:period.id === 'custom' ? `自定义（${period.range}）` : period.label,scope:'用量指标、趋势、供给和排行；月活固定按昨日所在自然月统计'}]} saveDescription="保存用量统计时间；月活始终按昨日所在自然月统计。快捷时间在应用时按当前日期重新计算，自定义保存具体日期。"/><span className="ov-updated">更新于 {new Date(now).toLocaleTimeString('zh-CN', { timeZone:'Asia/Shanghai', hour12:false })}</span></CardContent></Card>
    <div className="ov-kpis">{metrics.map(item => <Card key={item.label}><CardContent><div className="ov-kpi-label"><span className="ov-kpi-name">{item.label}</span><Help label={item.label}><div className="ov-kpi-explanation"><p>{item.note}</p><p>{item.comparisonNote || comparisonNote}上期为 0 时，变化显示“—”。</p>{item.monthly && <div className="ov-tooltip-periods"><p>统计月：{overviewDateTime(monthlyActive.start)} 至 {overviewDateTime(monthlyActive.end)}</p><p>上一月：{overviewDateTime(monthlyActive.previousStart)} 至 {overviewDateTime(monthlyActive.previousEnd)}</p></div>}</div></Help></div><div className="ov-value"><strong>{item.value}</strong><span>{item.unit}</span></div>{item.breakdown && <div className="ov-user-breakdown"><span>政企 <b>{number(item.breakdown.enterprise)}</b></span><span>个人 <b>{number(item.breakdown.personal)}</b></span></div>}<div className="ov-comparison"><span>{item.comparison || period.comparison}</span><Change value={item.change}/></div></CardContent></Card>)}</div>
    <div className="ov-middle">
      {[
        { key: 'total', title: 'Token 用量趋势', label: 'Token 用量', unit: 'Token', change: tokenChange },
        { key: 'calls', title: '模型请求趋势', label: '模型请求次数', unit: '次', change: overviewChange(data.calls, previous.calls) },
      ].map(chart => <Card className="ov-trend" key={chart.key}><CardHeader><CardTitle>{chart.title}</CardTitle></CardHeader><CardContent>
        <p className="ov-caption">{period.label} · {period.hourly ? '按小时汇总' : '按天汇总'}</p>
        {data.trend.length ? <TimeSeriesChart showData={false} labels={data.trend.map(row => row.label)} series={[{ label: chart.label, values: data.trend.map(row => row[chart.key]), color:'#3568f9' }]} unit={chart.unit} label={chart.title} height={225}/> : <p className="ov-empty ov-chart-empty">本期暂无调用记录</p>}
        <p className="ov-trend-summary">{period.comparison} <Change value={chart.change}/> · {period.partial ? '截至当前时刻 · 非完整自然日' : '完整自然日'}</p>
      </CardContent></Card>)}
    </div>
    <div className="ov-rankings">{[['customer','客户',topCustomers],['model','模型',topModels]].map(([kind,label,rows]) => <Card className="ov-ranking" key={kind}><CardHeader><CardTitle>{label}用量 Top 10</CardTitle><Button variant="ghost" size="sm" aria-label={`查看全部${label}用量`} onClick={() => openList(kind)}>查看全部<ArrowRight/></Button></CardHeader><CardContent><p className="ov-caption">{kind === 'customer' ? `前 10 名客户合计占平台用量 ${percent(topCustomers.reduce((n,r) => n+r.total,0),data.total)}` : '按对外模型汇总 · 多个服务商合并统计'}</p><UsageTable rows={rows} kind={kind} total={data.total} onSelect={row => openRow(kind,row)} label={`${label}用量 Top 10`}/></CardContent></Card>)}
      <Card className="ov-supply"><CardHeader><CardTitle>供给构成<Help label="供给构成">按承接客户调用的实际供给来源汇总 Token 用量。自产指自有推理服务，引入指外部服务；占比以本期平台 Token 总量为分母。</Help></CardTitle></CardHeader><CardContent>
        <p className="ov-caption">Token 用量占比</p>
        {data.total > 0 ? <DonutChart showData={false} rows={[{label:'自产',value:data.self,color:'#3568f9'},{label:'引入',value:data.partner,color:'#13aaa7'}]} unit="Token" label="供给构成环形图" height={190} centerValue={compactCount(data.total)} centerLabel="Token 总量"/> : <p className="ov-empty ov-donut-empty">本期暂无 Token 用量</p>}
        <div className="ov-supply-values">{[['self','自产'],['partner','引入']].map(([key,label]) => <div className="ov-supply-row" key={key}><span className="ov-supply-source"><i className={`ov-dot ov-${key}`}/>{label}<b>{percent(data[key],data.total)}</b></span><strong title={`${number(data[key])} Token`}>{compactCount(data[key])}<small> Token</small></strong></div>)}</div>
      </CardContent></Card>
      <Card className="ov-users"><CardHeader><CardTitle>用户构成<Help label="用户构成">截至统计结束时的注册用户构成，政企与个人数量之和等于注册用户总数。按用户 ID 去重，分类沿用用户分析的身份记录。</Help></CardTitle></CardHeader><CardContent>
        <p className="ov-caption">累计注册用户</p>
        {data.registrations.total > 0 ? <DonutChart showData={false} rows={[{label:'政企',value:data.registrations.enterprise,color:'#3568f9'},{label:'个人',value:data.registrations.personal,color:'#8b5cf6'}]} unit="人" label="用户构成环形图" height={190} centerValue={number(data.registrations.total)} centerLabel="注册用户总数"/> : <p className="ov-empty ov-donut-empty">暂无注册用户</p>}
        <div className="ov-supply-values">{[['enterprise','政企'],['personal','个人']].map(([key,label]) => <div className="ov-supply-row" key={key}><span className="ov-supply-source"><i className={`ov-dot ov-${key}`}/>{label}<b>{percent(data.registrations[key],data.registrations.total)}</b></span><strong>{number(data.registrations[key])}<small> 人</small></strong></div>)}</div>
      </CardContent></Card>
    </div>
    <div className="ov-call-rankings">{[['customer','客户',data.customers],['model','模型',data.models]].map(([kind,label,rows])=><CallRankPanel key={kind} title={`模型调用次数 Top 10 ${label}`} rows={rows} total={data.calls} limits={kind==='customer'?[30,50,100]:[30,50]} onChoose={id=>openRow(kind,rows.find(row=>row.id===id))}/>)}</div>
    <Dialog open={Boolean(detail)} onOpenChange={open => { if (!open) setDetail(null); }}><DialogContent className="ov-detail"><DialogHeader><DialogTitle>{selected ? `${selected.name} · 用量详情` : `全部${detail?.kind === 'customer' ? '客户' : '模型'}用量`}</DialogTitle><DialogDescription>{period.label} · {overviewDateTime(period.start)} 至 {overviewDateTime(period.end)}</DialogDescription></DialogHeader>{selected ? <><Button className="ov-detail-back" variant="ghost" size="sm" onClick={() => openList(detail.kind)}><ArrowLeft/>返回全部{detail.kind === 'customer' ? '客户' : '模型'}</Button><dl className="ov-detail-summary"><div><dt>Token 用量</dt><dd>{number(selected.total)}</dd></div><div><dt>模型请求次数</dt><dd>{number(selected.calls)}</dd></div><div><dt>占平台用量</dt><dd>{percent(selected.total,data.total)}</dd></div><div><dt>自产 / 引入</dt><dd>{percent(selected.self,selected.total)} / {percent(selected.partner,selected.total)}</dd></div></dl><div className="ov-table-scroll"><table className="ov-table"><thead><tr><th>{detail.kind === 'customer' ? '使用模型' : '调用客户'}</th><th>Token 用量</th><th>模型请求次数</th></tr></thead><tbody>{related.map(row => <tr key={`${row.customerId}/${row.modelId}`}><td>{detail.kind === 'customer' ? row.modelName : row.customerName}</td><td>{number(row.total)}</td><td>{number(row.calls)}</td></tr>)}</tbody></table></div></> : detail && <UsageTable rows={data[detail.kind === 'customer' ? 'customers' : 'models']} kind={detail.kind} total={data.total} onSelect={row => openRow(detail.kind,row)} label={`全部${detail.kind === 'customer' ? '客户' : '模型'}用量`}/>}</DialogContent></Dialog>
  </div></TooltipProvider>;
}
