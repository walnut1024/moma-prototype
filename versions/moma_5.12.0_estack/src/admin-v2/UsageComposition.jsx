import { useState } from 'react';
import { Info } from 'lucide-react';
import { DonutChart, TimeSeriesChart } from '../components/AnalyticsCharts';
import { chartColor } from '../components/chart-style.mjs';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/tooltip';
import UsageFilterBar from './UsageFilterBar';
import { formatUsageNumber, usageFacts, usageFilterOptions, usageModelTypes } from './usage-analysis';
import { tokenMetrics, usageDimensions } from './usage-trends';
import { usageShare, usageDistributions } from './usage-distributions';

const percent = (value, total) => total > 0 ? `${(value / total * 100).toFixed(2)}%` : '—';
const amount = value => formatUsageNumber(value).replace('w', '万');
const subjects = { category: '模型类型', providerId: '服务商', modelId: '模型', tenantId: '客户' };

export function UsageShare({ state, range, clock, filters, onChange, volume = false, settings, onSettings }) {
  const [showAll, setShowAll] = useState(false);
  const title = volume ? '模型调用量占比' : '模型调用次数占比';
  const facts = usageFacts(state, range, filters, clock)?.current || [];
  const share = usageShare(facts, settings.dimension, volume ? settings.metric : 'calls');
  const unit = volume ? 'Token' : '次';
  const subject = subjects[settings.dimension];
  const options = usageFilterOptions(state);
  const collection = { category: usageModelTypes, providerId: options.providers, modelId: options.models, tenantId: state.tenants }[settings.dimension];
  const name = id => id === '__other__' ? `其他${subject}` : id === '__unknown__' ? `未归属${subject}` : collection.find(item => item.id === id)?.name || id;
  const code = id => id.startsWith('__') || settings.dimension === 'category' ? '' : collection.find(item => item.id === id)?.code || (settings.dimension === 'modelId' ? state.models.find(item => item.id === id)?.modelId : id) || id;
  const slices = (settings.dimension === 'category' ? share.ranked.filter(row => row.value > 0) : share.slices).map(row => ({ ...row, label: name(row.id), color: row.id === '__unknown__' ? '#8a97ac' : row.id === '__other__' ? '#b8c3d5' : chartColor({ label: row.id, color: settings.dimension === 'category' ? collection.find(item => item.id === row.id)?.color : undefined }) }));
  const metricLabel = volume ? tokenMetrics.find(([id]) => id === settings.metric)[1] : '调用次数';
  const valueText = value => volume ? `${amount(value)} Token` : `${amount(value)} 次`;
  const usageNote = volume ? `${metricLabel}占比，仅统计 Token 计量请求；张、秒、字符等不计入。${share.pendingCalls > 0 ? ` ${amount(share.pendingCalls)} 次请求的计量待确认，未计入占比。` : ''}` : '调用次数占比以当前筛选范围内的请求数为分母，同一请求仅计一次。';
  return <Card className="ua-panel ua-share-panel"><CardHeader><CardTitle className="ua-share-title">{title}<Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="ua-share-help" aria-label={`${title}统计说明`}><Info/></Button></TooltipTrigger><TooltipContent>{usageNote}</TooltipContent></Tooltip></CardTitle><div className="ua-trend-controls">
    {volume && <Select value={settings.metric} onValueChange={metric => onSettings({ ...settings, metric })}><SelectTrigger aria-label={`${title}Token口径`} className="ua-metric-select"><SelectValue/></SelectTrigger><SelectContent><SelectGroup>{tokenMetrics.map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}</SelectGroup></SelectContent></Select>}
    <Select value={settings.dimension} onValueChange={dimension => onSettings({ ...settings, dimension })}><SelectTrigger aria-label={`${title}统计维度`}><SelectValue/></SelectTrigger><SelectContent><SelectGroup>{usageDimensions.map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}</SelectGroup></SelectContent></Select>
  </div></CardHeader><CardContent>
    <UsageFilterBar state={state} filters={filters} onChange={onChange} title={title}/>
    {!share.total ? <p className="ua-chart-empty">{!facts.length ? '所选条件下暂无调用记录' : volume ? share.pendingCalls ? '所选条件下暂无已确认 Token 用量' : '所选条件下暂无 Token 用量' : '所选条件下暂无调用次数'}</p> : <div className="ua-share-layout">
      <div className="ua-share-ring"><DonutChart rows={slices} unit={unit} label={title} height={230} centerValue={amount(share.total)} centerLabel={metricLabel} showData={false}/><span>{share.count} 个{subject}{share.unknownValue > 0 ? ` · ${percent(share.unknownValue, share.total)} 未归属` : ''}</span></div>
      <div className="ua-share-breakdown"><div className="ua-share-columns"><span>{subject}</span><span>{volume ? 'Token 用量' : '调用次数'}</span><span>占比</span></div>
        <ol aria-label={`${title}构成`}>{slices.map(row => <li key={row.id}><div className="ua-share-row"><div className="ua-share-name"><i style={{ backgroundColor: row.color }}/><span title={code(row.id) ? `${row.label} / ${code(row.id)}` : row.label}><b>{row.label}</b></span></div><span>{amount(row.value)}</span><strong>{percent(row.value, share.total)}</strong></div><div className="ua-share-track" aria-hidden="true"><div style={{ width: `${row.value / share.total * 100}%`, backgroundColor: row.color }}/></div></li>)}</ol>
        <div className="ua-share-foot"><small>{settings.dimension === 'category' ? '展示全部模型类型；未归属单列。' : '前 5 项单列，其余合并；未归属单列。'}</small><Button variant="link" size="sm" onClick={() => setShowAll(true)}>查看全部（{share.ranked.length}）</Button></div>
      </div>
    </div>}
    <Dialog open={showAll} onOpenChange={setShowAll}><DialogContent className="ua-share-dialog"><DialogHeader><DialogTitle>{title}明细</DialogTitle><DialogDescription>{range.start}—{range.end} · {usageDimensions.find(([id]) => id === settings.dimension)[1]} · {metricLabel}合计 {valueText(share.total)}</DialogDescription></DialogHeader><div className="ua-table-scroll"><Table><TableHeader><TableRow><TableHead>{subject}</TableHead><TableHead>{volume ? 'Token 用量' : '调用次数'}</TableHead><TableHead>占比</TableHead></TableRow></TableHeader><TableBody>{share.ranked.map(row => <TableRow key={row.id}><TableCell>{name(row.id)}{code(row.id) && <small className="ua-share-code">{code(row.id)}</small>}</TableCell><TableCell>{amount(row.value)}</TableCell><TableCell>{percent(row.value, share.total)}</TableCell></TableRow>)}</TableBody></Table></div></DialogContent></Dialog>
  </CardContent></Card>;
}

export function UsageDistribution({ state, range, clock }) {
  const facts = usageFacts(state, range, { types: null, tenant: null, model: null, providers: [], channels: null, user: null }, clock)?.current || [];
  const data = usageDistributions(facts);
  const excluded = [data.pendingTokenCalls ? `${amount(data.pendingTokenCalls)} 次计量待确认` : '', data.nonTokenCalls ? `${amount(data.nonTokenCalls)} 次非 Token 计量` : ''].filter(Boolean);
  const charts = [
    { title: '客户调用量分层', subtitle: '按周期内每客户的调用次数分层', rows: data.customers, unit: '个客户', total: `${amount(data.customerCount)} 个调用客户`, note: data.unknownCustomerCalls ? `${amount(data.unknownCustomerCalls)} 次调用未归属客户，未计入客户数量。` : '' },
    { title: 'Token 分段', subtitle: '按单次请求的总 Token（输入＋输出）分段', rows: data.tokens, unit: '次', total: `${amount(data.tokenCalls)} 次已确认调用`, note: excluded.length ? `${excluded.join('、')}，未计入分段。` : '' },
  ];
  return <Card className="ua-panel ua-distribution-panel"><CardHeader><CardTitle>客户调用量分层与 Token 分段</CardTitle></CardHeader><CardContent>
    {!facts.length ? <p className="ua-chart-empty">所选条件下暂无调用记录</p> : <div className="ua-distribution-grid">{charts.map(chart => <div key={chart.title} className="ua-distribution-chart"><div className="ua-distribution-heading"><strong>{chart.title}</strong><span>{chart.total}</span></div><p className="ua-trend-note">{chart.subtitle}</p>
      <TimeSeriesChart compact showData={false} type="bar" height={250} label={chart.title} labels={chart.rows.map(row => row.label.replace('及以上', '+').replace('–', '–\n'))} series={[{ label: chart.unit === '次' ? '调用次数' : '客户数量', values: chart.rows.map(row => row.value), total: true, showValues: true }]} unit={chart.unit}/>
      <span className="sr-only">{chart.rows.map(row => `${row.label}：${row.value}${chart.unit}`).join('；')}</span>{chart.note && <p className="ua-trend-note">{chart.note}</p>}
    </div>)}</div>}
  </CardContent></Card>;
}
