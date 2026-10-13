import { useEffect, useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { DateRange } from './AnalyticsFilters';
import { FilterPresets } from '../components/FilterControls';
import { DonutChart, RankingChart } from '../components/AnalyticsCharts';
import { chartPalette } from '../components/chart-style.mjs';
import { usagePreset, operationsPresets } from './usage-analysis';
import { CALCLOUD_TYPES, calcloudFacts, calcloudSummary, calcloudBuckets, calcloudGroups, calcloudCosts, calcloudCostHistory, beijingDay } from './calcloud-domain.mjs';
import { PageHead, Field, TextField, Choice, Metrics, Trend, DataTable, Modal, Refresh, Hint, number, money, time } from './CalcloudUI';

const tokenHint='仅汇总按Token计量且已记录的用量；缓存命中已包含在输入中。缺失计量显示“—”。';
const errorHint='非2xx请求占比；缺少响应状态时不计算。';
const series=(label,values)=>({label,values});
const percent=value=>Number.isFinite(value)?`${number(value)}%`:'—';
const priceLabel=p=>p&&p.unit==='元/百万 Token'?<div className="cc-price">输入 {number(Number.isFinite(p.inputPrice)?p.inputPrice/1e6:null)}<br/>缓存 {number(Number.isFinite(p.cachedPrice)?p.cachedPrice/1e6:null)}<br/>输出 {number(Number.isFinite(p.outputPrice)?p.outputPrice/1e6:null)}</div>:'—';
function DateControls({range,preset,setRange,choose,observation=false}) {
  return <><FilterPresets value={preset} onChange={choose} items={observation?[['5m','5分钟'],['today','今日'],['3d','近3日'],['7d','近7日']]:operationsPresets}/><DateRange start={range.start} end={range.end} presets={observation?[['today','今日']]:operationsPresets} latestDay={observation?undefined:usagePreset('yesterday').end} maxDays={observation?30:365} rangeHint={observation?'最长30天，记录截至当前时刻':'按北京时间完整自然日统计'} onChange={setRange}/></>;
}
function usePeriod() {
  const [range,setRange]=useState(()=>usagePreset('yesterday')),[preset,setPreset]=useState('yesterday');
  return {range,preset,choose:id=>{setRange(usagePreset(id));setPreset(id);},setRange:r=>{setRange(r);setPreset('custom');},reset:()=>{setRange(usagePreset('yesterday'));setPreset('yesterday');}};
}
function PeriodToolbar({period,children,apply,reset}) {
  return <section className="cc-surface"><div className="cc-toolbar"><DateControls {...period}/>{children}{apply&&<Button type="button" onClick={apply}>查询</Button>}<Button type="button" variant="outline" onClick={reset}>重置</Button></div></section>;
}
function useObservedFacts(state,observation) {
  const {selection,setSelection}=observation;
  const {preset,clock,custom}=selection;
  useEffect(()=>{setSelection(v=>({...v,clock:Date.now()}));},[setSelection]);
  const today=beijingDay(clock),range=custom||{start:preset==='3d'?beijingDay(clock-2*86400000):preset==='7d'?beijingDay(clock-6*86400000):today,end:today};
  const facts=useMemo(()=>calcloudFacts(state,preset==='5m'?{from:clock-300000,to:clock}:range,{},clock),[state,clock,preset,custom]);
  return {facts,buckets:calcloudBuckets(facts),summary:calcloudSummary(facts.rows),clock,range,preset,choose:id=>setSelection({clock:Date.now(),custom:null,preset:id}),setRange:r=>setSelection({custom:r,preset:'custom',clock:Date.now()}),refresh:()=>setSelection(v=>({...v,clock:Date.now()}))};
}
function ObservationControls({observed}) {
  return <><section className="cc-surface"><div className="cc-toolbar"><DateControls {...observed} observation/><Refresh onClick={observed.refresh}/></div></section><p className="cc-context">北京时间 · 截至 {time(new Date(observed.clock).toISOString())} · {observed.preset==='5m'?'按分钟汇总':observed.buckets[0]?.minutes<=60?'按小时汇总':'按日汇总'}</p></>;
}
export function BusinessCallStatisticsPage({state,observation}) {
  const o=useObservedFacts(state,observation),s=o.summary,models=calcloudGroups(o.facts.rows,'modelId',state.models);
  return <><PageHead title="业务调用统计" note="查看客户调用规模、Token构成和模型调用排行。"/><ObservationControls observed={o}/><Metrics items={[
    ['客户数',number(s.customers),'调用记录中的用户ID去重；身份缺失时不计算。'],['调用总次数',number(s.calls)],['单客户平均Token消耗',number(s.averageCustomer),'Token总量除以全部调用客户数。'],['单请求平均Token长度',number(s.averageRequest),'Token总量除以全部调用次数。']
  ]}/><div className="cc-charts"><section className="cc-chart"><h2>Token数统计<Hint label="Token数统计">输入与输出构成；缓存包含在输入中。</Hint></h2>{s.input!=null&&s.output!=null&&s.total===s.input+s.output?<><DonutChart label="Token数统计" unit="Token" rows={[{label:'输入Token数',value:s.input},{label:'输出Token数',value:s.output}]} centerValue={number(s.total)} centerLabel="Token总量" height={280}/><div className="cc-donut-values"><span>输入Token数 <strong>{number(s.input)}</strong></span><span>输出Token数 <strong>{number(s.output)}</strong></span></div></>:<p className="cc-empty">缺少完整Token计量</p>}</section><section className="cc-chart"><h2>各模型调用次数</h2>{models.length?<div className="cc-rank-scroll"><RankingChart rows={models} metric="calls" unit="次" collection={state.models}/></div>:<p className="cc-empty">暂无调用记录</p>}</section></div></>;
}
export function PerformanceStatisticsPage({state,observation}) {
  const o=useObservedFacts(state,observation),labels=o.buckets.map(b=>b.label);
  const charts=[['TPM','Token/分钟',b=>b.total==null?null:b.total/b.minutes,'已记录Token量除以区间分钟数。'],['RPM','次/分钟',b=>b.calls/b.minutes],['平均请求时延','ms',b=>b.latency,'仅计算已记录请求耗时的样本。'],['平均首Token返回时延','ms',b=>b.ttft,'仅计算已上报首Token时延的样本。'],['每秒处理请求数（QPS）','次/秒',b=>b.calls/(b.minutes*60)]];
  return <><PageHead title="性能吞吐统计" note="查看请求速率、Token吞吐与响应时延。"/><ObservationControls observed={o}/><div className="cc-charts">{charts.map(([title,unit,get,hint])=><Trend key={title} title={title} labels={labels} unit={unit} hint={hint} series={[series(title,o.buckets.map(get))]}/>)}</div></>;
}
export function ErrorStatisticsPage({state,observation}) {
  const o=useObservedFacts(state,observation),s=o.summary,labels=o.buckets.map(b=>b.label);
  return <><PageHead title="错误与异常统计" note="查看失败、错误率、超时及错误类型。"/><ObservationControls observed={o}/><div className="cc-charts">
    <Trend title="调用失败总次数" labels={labels} unit="次" series={[series('失败次数',o.buckets.map(b=>b.failed))]}/><Trend title="整体错误率" labels={labels} unit="%" hint={errorHint} series={[series('错误率',o.buckets.map(b=>b.errorRate))]}/><Trend title="超时请求次数" labels={labels} unit="次" hint="状态408、504或请求尝试明确记录timeout。" series={[series('超时次数',o.buckets.map(b=>b.timeout))]}/>
    <section className="cc-chart"><h2>错误类型分布<Hint label="错误类型">按已记录的非2xx响应状态分类。</Hint></h2><DonutChart label="错误类型分布" unit="次" rows={[{label:'4xx',value:s.four},{label:'5xx',value:s.five},{label:'其他',value:s.other}]} height={250}/></section>
  </div></>;
}
export function CustomerAnalysisPage({state}) {
  const period=usePeriod(),[query,setQuery]=useState(''),[applied,setApplied]=useState({range:period.range,query:''});
  const facts=calcloudFacts(state,applied.range),groups=calcloudGroups(facts.rows,'userId',state.users).filter(c=>`${c.id} ${c.name}`.toLowerCase().includes(applied.query.toLowerCase()));
  const reset=()=>{period.reset();setQuery('');setApplied({range:usagePreset('yesterday'),query:''});};
  return <><PageHead title="客户分析" note="按用户查看调用量、Token消耗与错误率。"/><PeriodToolbar period={period} apply={()=>setApplied({range:period.range,query})} reset={reset}><TextField label="用户名或用户ID" value={query} onChange={setQuery}/></PeriodToolbar><section className="cc-surface"><DataTable key={JSON.stringify(applied)} rows={groups} columns={[
    ['用户ID',c=>c.id],['用户名称',c=>c.name],['调用总次数',c=>number(c.calls)],['输入Tokens',c=>number(c.input)],['输出Tokens',c=>number(c.output)],['总Tokens',c=>number(c.total)],['错误率',c=>percent(c.errorRate)]
  ]}/></section><p className="cc-context">{applied.range.start} — {applied.range.end} · 北京时间完整自然日 · 未归属用户的调用 {number(facts.rows.filter(r=>!r.userId).length)} 次 · Token用量仅统计按Token计量的模型</p></>;
}
export function ProviderAnalysisPage({state}) {
  const period=usePeriod(),[provider,setProvider]=useState(()=>state.providers[0]?.id||'');
  const buckets=calcloudBuckets(calcloudFacts(state,period.range,{provider})),labels=buckets.map(b=>b.label);
  const fields=[['活跃客户数','customers','个'],['调用总次数','calls','次'],['输入Tokens','input','Token'],['输出Tokens','output','Token'],['总消耗Tokens','total','Token'],['调用失败次数','failed','次'],['错误率','errorRate','%']];
  const reset=()=>{period.reset();setProvider(state.providers[0]?.id||'');};
  return <><PageHead title="服务商分析" note="按服务商查看客户活动、调用和计量趋势。"/><PeriodToolbar period={period} reset={reset}><Field label="模型服务商"><Choice label="服务商" value={provider} options={state.providers} onChange={setProvider}/></Field></PeriodToolbar><p className="cc-context">{period.range.start} — {period.range.end} · 北京时间完整自然日</p><div className="cc-charts">{fields.map(([label,key,unit])=><Trend key={key} title={label} labels={labels} unit={unit} hint={unit==='Token'?tokenHint:key==='errorRate'?errorHint:undefined} series={[series(label,buckets.map(b=>b[key]))]}/>)}</div></>;
}
export function ModelAnalysisPage({state}) {
  const period=usePeriod(),[type,setType]=useState(''),[model,setModel]=useState(()=>state.models[0]?.id||'');
  const facts=calcloudFacts(state,period.range,{type,model}),groups=calcloudGroups(facts.rows,'providerId',state.providers),buckets=calcloudBuckets(facts),labels=buckets.map(b=>b.label);
  const curves=key=>groups.map((g,index)=>({...series(g.name,buckets.map(b=>calcloudSummary(b.rows.filter(r=>r.providerId===g.id))[key])),color:chartPalette[index%chartPalette.length]}));
  const reset=()=>{period.reset();setType('');setModel(state.models[0]?.id||'');};
  const knownTokens=groups.every(g=>g.total!=null);
  return <><PageHead title="模型分析" note="查看模型在各服务商的调用趋势、Token消耗和错误分布。"/><PeriodToolbar period={period} reset={reset}><Field label="模型类型"><Choice label="模型类型" value={type} all options={Object.entries(CALCLOUD_TYPES)} onChange={v=>{setType(v);setModel(state.models.find(m=>!v||m.type===v)?.id||'');}}/></Field><Field label="模型名称"><Choice label="模型" value={model} options={state.models.filter(m=>!type||m.type===type)} onChange={setModel}/></Field></PeriodToolbar><div className="cc-charts">
    <Trend title="各服务商调用次数" labels={labels} unit="次" series={curves('calls')}/><Trend title="各服务商Token消耗" labels={labels} unit="Token" hint={tokenHint} series={curves('total')}/>
    <section className="cc-chart"><h2>调用占比</h2><DonutChart label="调用占比" rows={groups.map(g=>({label:g.name,value:g.calls}))} unit="次" height={280}/><div className="cc-donut-values">{groups.map(g=><span key={g.id}>{g.name} <strong>{number(g.calls)}</strong></span>)}</div></section>
    <section className="cc-chart"><h2>Token消耗占比<Hint label="Token占比">计量不完整时不计算占比。</Hint></h2>{knownTokens?<><DonutChart label="Token消耗占比" rows={groups.map(g=>({label:g.name,value:g.total}))} unit="Token" height={280}/><div className="cc-donut-values">{groups.map(g=><span key={g.id}>{g.name} <strong>{number(g.total)}</strong></span>)}</div></>:<p className="cc-empty">缺少完整Token计量，暂无法计算占比。</p>}</section>
    <Trend title="各服务商调用失败次数" labels={labels} unit="次" series={curves('failed')}/><Trend title="各服务商错误率" labels={labels} unit="%" hint={errorHint} series={curves('errorRate')}/>
  </div></>;
}
export function CostAnalysisPage({state}) {
  const period=usePeriod(),[model,setModel]=useState(''),[provider,setProvider]=useState(''),[applied,setApplied]=useState({range:period.range,model:'',provider:''}),[detail,setDetail]=useState(null);
  const facts=calcloudFacts(state,applied.range,applied),rows=calcloudCosts(state,facts,applied),sum=key=>rows.every(r=>r[key]!=null)?rows.reduce((s,r)=>s+r[key],0):null;
  const reset=()=>{period.reset();setModel('');setProvider('');setApplied({range:usagePreset('yesterday'),model:'',provider:''});};
  const history=detail?calcloudCostHistory(state,facts,detail.modelId,detail.providerId):[];
  return <><PageHead title="成本分析" note="按调用时生效的采购价与目录价计算收入和利润。"/><PeriodToolbar period={period} apply={()=>setApplied({range:period.range,model,provider})} reset={reset}><Field label="模型名称"><Choice label="模型" value={model} all options={state.models} onChange={setModel}/></Field><Field label="模型服务商"><Choice label="服务商" value={provider} all options={state.providers} onChange={setProvider}/></Field></PeriodToolbar><Metrics items={[
    ['调用总次数',number(facts.rows.length)],['收入',money(sum('income')),'按调用时的目录价计算；未记录历史价格时显示“—”。'],['利润',money(sum('profit')),'收入减采购成本；缺少任一历史价格时不计算。']
  ]}/><section className="cc-surface"><DataTable key={JSON.stringify(applied)} rows={rows} columns={[
    ['模型名称',r=>r.name],['服务商名称',r=>r.provider],['模型接入时间',r=>time(r.createdAt)],['模型成本价（元/百万Tokens）',r=>priceLabel(r.purchase)],['模型目录价（元/百万Tokens）',r=>priceLabel(r.sale)],['调用量',r=><>输入 {number(r.input)}<small>缓存命中 {number(r.cached)}</small><small>输出 {number(r.output)}</small></>],['利润',r=>money(r.profit)],['操作',r=><Button variant="ghost" size="sm" onClick={()=>setDetail(r)}>详情</Button>]
  ]}/></section><p className="cc-context">历史计量、价格缺失或计费单位不适用时显示“—”；不使用当前价格追算历史费用。</p><Modal title="成本详情" description={detail?`${detail.name} · ${detail.provider} · ${applied.range.start} — ${applied.range.end}`:''} open={!!detail} close={()=>setDetail(null)} wide><DataTable rows={history} columns={[
    ['价格生效区间',r=><>{time(new Date(r.effectiveFrom).toISOString())}<small>{r.effectiveTo?`至 ${time(new Date(r.effectiveTo).toISOString())}`:'至今'}</small></>],['成本价格（元/百万Tokens）',r=>priceLabel(r.purchase)],['目录价格（元/百万Tokens）',r=>priceLabel(r.sale)],['周期内利润',r=>money(r.profit)]
  ]}/><div className="cc-form-footer"><Button variant="outline" onClick={()=>setDetail(null)}>关闭</Button></div></Modal></>;
}
