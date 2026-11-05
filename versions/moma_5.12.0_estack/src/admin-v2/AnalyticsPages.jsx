import { toast } from 'sonner';
import UserAnalysisPage from './UserAnalysisPage';
import OperationsDataPage from './OperationsDataPage';
import UsageAnalysisPage from './UsageAnalysisPage';
import { useState } from 'react';
import { CalendarDays, Info, ArrowRight } from 'lucide-react';
import { TimeSeriesChart, TimeSeriesChart as MetricChart } from '../components/AnalyticsCharts';
import { FilterPresets, FilterReset, FilterToolbar, FilterViewRow, TIME_PRESETS } from '../components/FilterControls';
import SavedFilterViews from '../components/SavedFilterViews';
import { usagePreset } from './usage-analysis';
import { Button } from '../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '../components/ui/select';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '../components/ui/tooltip';
import { DateRange, MultiPick } from './AnalyticsFilters';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table';
import { dayOf, filterAnalytics, summarize, timeBuckets, inputLengthDistribution, weeklyBuckets, validAnalyticsRange } from './analytics';
import './analytics.css';
import './call-analysis.css';
import './enterprise.css';
const types=[['','全部类型'],['text','语言模型'],['multimodal','多模态模型'],['image','图片生成'],['video','视频生成'],['audio','语音模型'],['embedding','向量模型'],['rerank','重排模型']];
const fmt=v=>v==null?'—':Number(v).toLocaleString('zh-CN',{maximumFractionDigits:2});
function Pick({label,value,onChange,items}) {return <Select value={value||'all'} onValueChange={v=>onChange(v==='all'?'':v)}><SelectTrigger aria-label={label}><SelectValue placeholder={label}/></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">全部{label}</SelectItem>{items.map(x=><SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectGroup></SelectContent></Select>}
function Help({label,children}) {return <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="ca-help" aria-label={label}><Info/></Button></TooltipTrigger><TooltipContent>{children}</TooltipContent></Tooltip>}
function Summary({title,items,action}) {return <Card className="ua-panel ca-summary"><CardHeader><CardTitle>{title}</CardTitle>{action}</CardHeader><CardContent className="ca-metrics">{items.map(([name,value,note])=><div key={name}><span>{name}{note&&<Help label={`${name}说明`}>{note}</Help>}</span><strong>{typeof value==='number'?fmt(value):value}</strong></div>)}</CardContent></Card>}
function Plot({title,labels,series,unit=''}) {return <Card className="ua-panel ca-plot"><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent><TimeSeriesChart compact labels={labels} series={series} unit={unit} valueFormatter={unit==='次/分钟' ? value=>Number(value.toFixed(4)) : undefined} label={title} height={260}/></CardContent></Card>}
export default function AnalyticsPages({pageId,state}) {
  return pageId === 'supply-analysis' ? <OperationsDataPage key={pageId} state={state}/> : pageId === 'business-analysis' ? <OperationsDataPage key={pageId} state={state} business/> : pageId === 'usage-analysis' ? <UsageAnalysisPage state={state}/> : pageId === 'user-analysis' ? <UserAnalysisPage state={state}/> : <OtherAnalyticsPages pageId={pageId} state={state}/>;
}
function OtherAnalyticsPages({pageId,state}) {
  const latest=dayOf(state.requests.length?Math.max(...state.requests.map(r=>Date.parse(r.createdAt))):Date.now());
  const routeFilters = new URLSearchParams(location.hash.split("?")[1]||"");
  const initialStart = routeFilters.get("start") || usagePreset('today').start;
  const initialEnd = routeFilters.get("end") || usagePreset('today').end;
  const initialGranularity = (Date.parse(initialEnd)-Date.parse(initialStart))/86400000>=30?"week":"day";
  const [filters,setFilters]=useState({start:initialStart,end:initialEnd,tenant:routeFilters.has('tenant')?[routeFilters.get('tenant')]:null,model:routeFilters.has('model')?[routeFilters.get('model')]:null,provider:null,type:'',key:'',source:''});
  const [granularity,setGranularity]=useState(initialGranularity),[,setPage]=useState(0),[lengthMetric,setLengthMetric]=useState('calls');
  const [period,setPeriod]=useState(routeFilters.has('start') || routeFilters.has('end') ? 'custom' : 'today');
  const choosePeriod=value=>{setPeriod(value);setFilters(f=>({...f,...usagePreset(value)}));setGranularity('day');setPage(0)};
  const set=(key,value)=>{setFilters(f=>({...f,[key]:['tenant','model','provider'].includes(key)&&typeof value==='string'?[value]:value,...(key==='type'?{model:null}:{})}));setPage(0)};
  const invalid=!validAnalyticsRange(filters.start,filters.end,granularity);
  const changeGranularity=v=>{if(!v)return;setGranularity(v);setPage(0)};
  const rows=invalid?[]:filterAnalytics(state,{...filters,key:'',source:''}), summary=summarize(rows), buckets=invalid?[]:(granularity==='week'?weeklyBuckets(rows,filters.start,filters.end):timeBuckets(rows,filters.start,filters.end)),labels=buckets.map(b=>b.label);
  const name=(collection,id)=>state[collection].find(x=>x.id===id)?.name||(id==='undefined'?'未识别':id)||'未识别';
  const series=(label,key)=>({label,values:buckets.map(b=>b[key])});
  const viewGroups=[
    {label:'时间',text:`${TIME_PRESETS.find(([id])=>id===period)?.[1] || '自定义'}（${filters.start} — ${filters.end}）`},
    {label:'统计粒度',text:granularity==='week'?'按周':'按天'},
    {label:'租户',items:filters.tenant?.map(id=>name('tenants',id))??null},
    {label:'模型类型',text:types.find(([id])=>id===filters.type)?.[1]||'全部'},
    {label:'模型 ID',items:filters.model?.map(id=>name('models',id))??null,all:'全部模型'},
    {label:'供应商',items:filters.provider?.map(id=>name('providers',id))??null},
  ];
  const lengths=inputLengthDistribution(rows);
  return <TooltipProvider><div className="ua-page ca-page">
  <h1 className="sr-only">调用数据</h1>
  <Card className="ua-filters"><CardContent className="ca-filter-top"><FilterToolbar className="ca-time-controls">
    <FilterPresets className="ua-segments" value={period} onChange={choosePeriod}/>
    <DateRange granularity={granularity} start={filters.start} end={filters.end} latest={latest} trigger={<Button variant="outline" className="filter-date-trigger" aria-label="日期范围"><CalendarDays/>{filters.start===filters.end?filters.start:`${filters.start} — ${filters.end}`}</Button>} onChange={range=>{setPeriod('custom');setFilters(f=>({...f,...range}));setPage(0)}}/>
    <span className="ca-time-scope">北京时间<Help label="统计时间说明">记录截至 {latest}。{filters.end===dayOf(Date.now())?'当日截至当前时刻。':''}{granularity==='week'?'按周一至周日汇总，* 表示不足一周。':''}</Help></span>
    <Select value={granularity} onValueChange={changeGranularity}><SelectTrigger aria-label="统计粒度" className="ca-granularity"><SelectValue/></SelectTrigger><SelectContent><SelectGroup><SelectItem value="day">按天</SelectItem><SelectItem value="week">按周</SelectItem></SelectGroup></SelectContent></Select>
    <FilterReset onClick={()=>{setFilters({ ...usagePreset('today'),tenant:null,model:null,provider:null,key:"",source:"",type:"" });setPeriod('today');setGranularity('day');setPage(0)}}/>
  </FilterToolbar></CardContent><CardContent className="ua-view-row"><FilterViewRow><SavedFilterViews notify={toast} scope="admin-call-analysis" legacyKey="moma-admin2-5120-analytics-views" showCurrent={false} disabled={invalid} groups={viewGroups} value={{period,filters,granularity}} onApply={v=>{if(!v?.filters)return;setPeriod(v.period || 'custom');setFilters({...v.filters,...(v.period && v.period !== 'custom' ? usagePreset(v.period) : {})});setGranularity(v.granularity==="week"?"week":"day");setPage(0)}}/></FilterViewRow></CardContent><CardContent className="ca-object-filters" role="group" aria-label="调用数据对象筛选">
    <MultiPick compact label="租户" value={filters.tenant} onChange={v=>set('tenant',v)} items={state.tenants}/>
    <Pick label="模型类型" value={filters.type} onChange={v=>set('type',v)} items={types.filter(([id])=>id).map(([id,name])=>({id,name}))}/>
    <MultiPick compact label="模型 ID" value={filters.model} onChange={v=>set('model',v)} items={state.models.filter(m=>!filters.type||m.type===filters.type)}/>
    <MultiPick compact label="供应商" value={filters.provider} onChange={v=>set('provider',v)} items={state.providers}/>
  </CardContent></Card>
  {!invalid&&!rows.length&&<p className="ca-data-note" role="status">所选时段暂无调用记录。</p>}
  {invalid?<p className="ca-range-error" role="alert">{granularity==='week'?'周粒度最多 365 天':'日粒度最多 30 天'}，结束日期不能晚于今天，请调整日期范围。</p>:<>
  {pageId==='call-analysis'&&<><Summary title="调用概览" action={<Button variant="outline" onClick={()=>{location.hash=`/admin-2/logs?failed=1&model=${encodeURIComponent(filters.model===null?'':filters.model.join(',')||'__none__')}&start=${filters.start}&end=${filters.end}&provider=${encodeURIComponent(filters.provider===null?'':filters.provider.join(',')||'__none__')}&tenant=${encodeURIComponent(filters.tenant===null?'':filters.tenant.join(',')||'__none__')}&type=${filters.type}`}}>查看失败日志<ArrowRight/></Button>} items={[["总请求",summary.calls],['成功 / 失败',`${summary.success} / ${summary.failed}`],['模型请求成功率 / 失败率',summary.rate==null?'—':`${fmt(summary.rate)}% / ${fmt(100-summary.rate)}%`,'按当前筛选范围内请求统计，HTTP 2xx 计为成功，其余计为失败；暂无请求时显示 —。'],['平均 / P95 时延',`${fmt(summary.avg)} / ${fmt(summary.p95)} ms`,'对当前筛选内请求样本计算']]} /><div className="an-grid"><Plot title="请求量趋势" labels={labels} unit="次" series={[series('全部请求','calls'),series('失败请求','failed')]}/><Plot title="成功率趋势" labels={labels} unit="%" series={[series('成功率','rate')]}/><Plot title="响应时延趋势" labels={labels} unit="ms" series={[series('平均','avg'),series('P95','p95')]}/>{(!filters.type||['text','multimodal'].includes(filters.type))&&<Plot title="首 Token 时延（已上报样本）" labels={labels} unit="ms" series={[series('平均 TTFT','ttft')]}/>}<Plot title="请求吞吐 RPM" labels={labels} unit="次/分钟" series={[{label:'平均 RPM',values:buckets.map(b=>b.calls/(granularity==='week'?b.days*1440:1440))}]}/>{!['audio','video','image'].includes(filters.type)&&<Plot title="Token 吞吐 TPM" labels={labels} unit="Token/分钟" series={[{label:'平均 TPM',values:buckets.map(b=>b.total/(granularity==='hour'?60:1440))}]}/>}<Plot title="状态码分布趋势" labels={labels} unit="次" series={[2,4,5,'其他'].map(code=>({label:code==='其他'?code:`${code}xx`,values:buckets.map(b=>b.rows.filter(r=>code==='其他'?![2,4,5].includes(Math.floor(r.httpStatus/100)):Math.floor(r.httpStatus/100)===code).length)}))}/><Card className="ua-panel ca-plot ca-distribution"><CardHeader><CardTitle>单次调用输入长度分布<Help label="输入长度分布说明">按单次客户请求的输入 Token 分段；缺失字段不当作零。</Help></CardTitle><Select value={lengthMetric} onValueChange={setLengthMetric}><SelectTrigger aria-label="长度分布指标"><SelectValue/></SelectTrigger><SelectContent><SelectGroup><SelectItem value="calls">请求数</SelectItem><SelectItem value="tokens">输入 Token</SelectItem></SelectGroup></SelectContent></Select></CardHeader><CardContent>{rows.some(row=>Number.isFinite(row.usage?.input))?<MetricChart compact type="bar" labels={lengths.map(bucket=>bucket.label)} series={[{label:lengthMetric==='calls'?'请求数':'输入 Token',values:lengths.map(bucket=>bucket[lengthMetric])}]} unit={lengthMetric==='calls'?'次':'Token'} label="单次调用输入长度分布" height={260}/>:<p className="an-unavailable">当前范围没有已上报输入 Token 的调用</p>}</CardContent></Card></div>{['image','video'].includes(filters.type)&&<p className="an-note">当前为请求接收统计；任务终态与完成时长未采集，不代表生成成功率。</p>}</>}
  {pageId==='call-analysis'&&<Card className="ua-panel ca-detail"><CardHeader><CardTitle>模型性能明细<Help label="模型性能统计说明">TTFT 仅统计已上报样本；TPM 为所选完整时间区间平均值。</Help></CardTitle></CardHeader><CardContent><div className="ua-table-scroll"><Table><TableHeader><TableRow>{['模型','请求数','成功率','失败率','平均时延 (ms)','P95 (ms)','TTFT (ms)','TPM'].map(x=><TableHead key={x}>{x}</TableHead>)}</TableRow></TableHeader><TableBody>{[...new Set(rows.map(r=>r.modelId))].map(id=>{const m=summarize(rows.filter(r=>r.modelId===id));return <TableRow key={id}><TableCell><span className="ca-model-name" title={name('models',id)}>{name('models',id)}</span></TableCell><TableCell>{m.calls}</TableCell><TableCell>{fmt(m.rate)}%</TableCell><TableCell>{fmt(100-m.rate)}%</TableCell><TableCell>{fmt(m.avg)}</TableCell><TableCell>{fmt(m.p95)}</TableCell><TableCell>{fmt(m.ttft)}</TableCell><TableCell>{rows.some(r=>r.modelId===id&&r.usage?.input!=null)?fmt(m.total/(((Date.parse(filters.end)-Date.parse(filters.start))/86400000+1)*1440)):'—'}</TableCell></TableRow>})}{!rows.length&&<TableRow><TableCell colSpan={8} className="ca-table-empty">所选范围暂无记录</TableCell></TableRow>}</TableBody></Table></div></CardContent></Card>}
  </>}</div></TooltipProvider>;
}
