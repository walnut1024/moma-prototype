import { useEffect, useState } from "react";
import { TimeSeriesChart as SharedMetricChart } from "../components/AnalyticsCharts";
import { Download, Search, X } from "lucide-react";
import { groupRequests, percentile, usageTotal, beijingTime, monitoringWindow } from "./observability";
import { DateRange, MultiPick } from "./AnalyticsFilters";

import { FilterToolbar, FilterPresets, FilterReset, FilterPagination } from "../components/FilterControls";
import { SelectedConditions } from "../components/SavedFilterViews";
import { filterAnalytics, matchesSelection, tokens } from "./analytics";
import { usagePreset } from "./usage-analysis";

const stamp = beijingTime;
const typeNames = {text:"语言模型",multimodal:"多模态理解",image:"图片生成",video:"视频生成",audio:"语音模型",embedding:"向量模型",rerank:"排序模型"};
const labelOf = (state, field, id) => field === "modelId" ? state.models.find(x => x.id === id)?.modelId : field === "keyId" ? state.apiKeys.find(x => x.id === id)?.keyId : state.endpoints.find(x => x.id === id)?.endpointId;
const hiddenByPolicy = (state, request) => state.securityPolicies.some(policy => policy.category === "数据策略" && policy.status === "已启用" && policy.scope === request.tenantId && policy.action === "不留存");
const metricValue = (metric, rows) => metric === "请求数" ? rows.length : metric === "失败率" ? (rows.length ? rows.filter(x => x.httpStatus >= 400).length / rows.length * 100 : 0) : metric === "P95 延迟" ? (percentile(rows.map(x => x.durationMs), .95) || 0) : rows.reduce((sum, x) => sum + (metric === "生成任务数" ? x.usage.tasks || 0 : metric === "生成秒数" ? x.usage.seconds || 0 : metric === "向量数" ? x.usage.vectors || 0 : tokens(x)), 0);
const metricsFor = types => [...new Set(["请求数", ...(types.some(type => ["text","multimodal"].includes(type)) ? ["Token 数"] : []), ...(types.includes("video") || types.includes("image") ? ["生成任务数"] : []), ...(types.includes("video") || types.includes("audio") ? ["生成秒数"] : []), ...(types.includes("embedding") ? ["向量数"] : []), "P95 延迟", "失败率"])];
function PageHead({ title, text, action }) { return <div className="v2-page-head"><div><span>服务运维 / 监控运维</span><h1>{title}</h1><p>{text}</p></div>{action}</div>; }
function Status({ value }) { return <em className={`v2-status ${["待确认", "处理中", "高", "未达标"].includes(value) ? "warn" : ""}`}>{value}</em>; }

function MetricChart({ state, requests, buckets, groupBy, selected, metric }) {
  const series = groupRequests(requests, groupBy, selected).map(group => ({ label: labelOf(state, groupBy, group.key) || group.key, values: buckets.map(bucket => {
    const rows = group.requests.filter(x => Date.parse(x.createdAt) >= bucket.start && Date.parse(x.createdAt) < bucket.end);
    return rows.length ? Number(metricValue(metric, rows).toFixed(2)) : null;
  }) }));
  return <SharedMetricChart labels={buckets.map(bucket => stamp(new Date(bucket.start).toISOString()).slice(5))} series={series} height={420} label={metric} unit={metric === "失败率" ? "%" : metric.includes("延迟") ? "ms" : metric === "Token 数" ? "Token" : metric === "生成秒数" ? "秒" : metric === "向量数" ? "个" : "次"} />;
}

export function Monitoring({ state }) {
  const [groupBy, setGroupBy] = useState("modelId"), [selected, setSelected] = useState(null), [metric, setMetric] = useState("Token 数"), [days, setDays] = useState('1');
  const items = (groupBy === "modelId" ? state.models : groupBy === "keyId" ? state.apiKeys : state.endpoints).map(x => ({ id: x.id, name: labelOf(state, groupBy, x.id) }));
  const modelTypes = groupBy === "modelId" && selected !== null ? state.models.filter(x => selected.includes(x.id)).map(x => x.type) : state.models.map(x => x.type), metrics = metricsFor(modelTypes);
  useEffect(() => { if (!metrics.includes(metric)) setMetric(metrics[0]); }, [metrics.join("|"), metric]);
  const window = monitoringWindow(state.requests, Number(days));
  const requests = window.rows.filter(row => matchesSelection(selected, row[groupBy]));
  const ranked = groupRequests(requests, groupBy).map(group => ({ id: group.key, value: metricValue(metric, group.requests) })).sort((a,b) => b.value-a.value).slice(0,10);
  return <div className="v2-page"><PageHead title="服务监控" text="按模型、Key 或端点对比调用质量，趋势与排行使用相同的时间和对象范围。"/><FilterToolbar className="ops-filters">
    <FilterPresets value={days} onChange={setDays} items={[['1','近 24 小时'],['7','近 7 天']]}/>
    <select aria-label="统计维度" value={groupBy} onChange={e => { setGroupBy(e.target.value); setSelected(null); }}><option value="modelId">按 Model ID</option><option value="keyId">按 Key ID</option><option value="endpointId">按 Endpoint ID</option></select>
    <MultiPick label={groupBy === "modelId" ? "Model ID" : groupBy === "keyId" ? "Key ID" : "Endpoint ID"} items={items} value={selected} onChange={setSelected}/>
    <select aria-label="监控指标" value={metric} onChange={e => setMetric(e.target.value)}>{metrics.map(value => <option key={value}>{value}</option>)}</select><span>粒度：1 小时 · 北京时间</span>
    <FilterReset onClick={() => { setDays('1'); setGroupBy('modelId'); setSelected(null); setMetric('Token 数'); }}/>
  </FilterToolbar><SelectedConditions groups={[{label:'时间',text:days === '1' ? '近 24 小时' : '近 7 天'},{label:'统计维度',text:{modelId:'模型',keyId:'Key',endpointId:'端点'}[groupBy]},{label:'对象',items:selected === null ? null : selected.map(id=>labelOf(state,groupBy,id)||id),all:'全部'},{label:'监控指标',text:metric}]}/>
  <section className="ops-monitor"><aside><header>{metric} Top 10<small>当前筛选范围</small></header><div>{ranked.map((item, i) => <button key={item.id} onClick={() => setSelected([item.id])} className={selected?.includes(item.id) ? "active" : ""}><i>{String(i+1).padStart(2,"0")}</i><span>{labelOf(state, groupBy, item.id)}</span><b>{item.value.toLocaleString('zh-CN',{maximumFractionDigits:2})}</b></button>)}{!ranked.length && <p className="v2-empty">暂无符合条件的数据</p>}</div></aside><article><header><b>{metric}趋势</b><span>{selected===null ? "全部对象 · 可在图表设置中选择" : `已选 ${selected.length} 项`}</span></header><MetricChart state={state} requests={requests} buckets={window.buckets} groupBy={groupBy} selected={selected} metric={metric}/></article></section></div>;
}

function Detail({ request, state, close }) {
  const key = state.apiKeys.find(x => x.id === request.keyId), endpoint = state.endpoints.find(x => x.id === request.endpointId);
  const hidden=hiddenByPolicy(state,request); return <div className="v2-mask" onClick={close}><aside className="entity-drawer ops-detail" onClick={e => e.stopPropagation()}><header><h2>请求链路详情</h2><button onClick={close}><X/></button></header><div className="ops-detail-body"><h3>{request.requestId}</h3><dl><span><dt>创建时间</dt><dd>{stamp(request.createdAt)}</dd></span><span><dt>HTTP 状态</dt><dd>{request.httpStatus}</dd></span><span><dt>Model ID</dt><dd>{labelOf(state,"modelId",request.modelId)}</dd></span><span><dt>Key ID</dt><dd>{key?.keyId}</dd></span></dl><ol>{[["鉴权", key?.status === "有效" ? "通过" : "拒绝"],["限流", "通过"],["路由", request.releaseId],["上游尝试", `${endpoint?.endpointId} · ${request.attempts[0].error || "成功"}`],["计量", `${usageTotal(request.usage).toLocaleString()} 单位`]].map(([name,result],i) => <li key={name}><b>{i+1}</b><span>{name}<small>{result}</small></span></li>)}</ol><h4>用量明细</h4>{hidden?<div className="v2-system-alert">该租户启用“不留存”策略，请求内容与明细不可查看。</div>:<pre>{JSON.stringify(request.usage, null, 2)}</pre>}</div></aside></div>;
}

export function Logs({ state }) {
  const defaults = () => ({ ...usagePreset('today'), preset:'today', model:null, tenant:null, provider:null, keys:null, type:'', source:'', status:'', failed:false, query:'' });
  const [filters,setFilters]=useState(() => {
    const scope=new URLSearchParams(location.hash.split('?')[1]||'');
    const values=defaults();
    for(const field of ['model','tenant','provider']) if(scope.has(field)) values[field]=scope.get(field)==='__none__'?[]:scope.get(field)?scope.get(field).split(',').filter(Boolean):null;
    for(const field of ['start','end','type']) if(scope.get(field)) values[field]=scope.get(field);
    if(scope.has('start')||scope.has('end')) values.preset='custom';
    values.failed=scope.get('failed')==='1';
    return values;
  });
  const [detail,setDetail]=useState(null),[page,setPage]=useState(1),[size,setSize]=useState(50);
  const update = changes => {setFilters(current=>({...current,...changes}));setPage(1)};
  const rows=filterAnalytics(state,{...filters,source:''}).filter(row => matchesSelection(filters.keys,row.keyId) && (!filters.failed||row.httpStatus>=400) && (!filters.source||row.source===filters.source) && (!filters.status||String(row.httpStatus)===filters.status) && row.requestId.toLowerCase().includes(filters.query.trim().toLowerCase()));
  const current=Math.min(page,Math.max(1,Math.ceil(rows.length/size)));
  const groups=[{label:'时间',text:`${{today:'今日',yesterday:'昨日','7d':'近 7 天','30d':'近 30 天'}[filters.preset]||'自定义'}（${filters.start} — ${filters.end}）`},
    ...[['model','模型',state.models.map(x=>({id:x.id,name:x.modelId}))],['tenant','客户',state.tenants],['provider','供应商',state.providers],['keys','Key ID',state.apiKeys.map(x=>({id:x.id,name:x.keyId}))]].map(([field,label,items])=>({label,items:filters[field]===null?null:filters[field].map(id=>items.find(x=>x.id===id)?.name||id),all:`全部${label}`})),
    {label:'模型类型',text:typeNames[filters.type]||filters.type||'全部'},{label:'请求来源',text:filters.source||'全部'},{label:'状态',text:filters.status||'全部'},{label:'请求结果',text:filters.failed?'仅失败请求':'全部'},{label:'Request ID',text:filters.query.trim()||'全部'}];
  const exportCsv=()=>{const body=[['Request ID','创建时间（北京时间）','Model ID','Key ID','来源','用量','状态'],...rows.map(x=>[x.requestId,stamp(x.createdAt),labelOf(state,'modelId',x.modelId),labelOf(state,'keyId',x.keyId),x.source,hiddenByPolicy(state,x)?'按策略不留存':usageTotal(x.usage),x.httpStatus])].map(row=>row.join(',')).join('\n');const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([`\ufeff${body}`],{type:'text/csv'}));link.download='调用日志.csv';link.click();URL.revokeObjectURL(link.href)};
  return <div className="v2-page"><PageHead title="调用日志与链路" text="查询当前筛选范围内的调用记录，时间均为北京时间。" action={<button className="v2-primary" onClick={exportCsv}><Download/> 导出</button>}/>
    <FilterToolbar className="ops-filters logs"><FilterPresets value={filters.preset} onChange={preset=>update({...usagePreset(preset),preset})}/><DateRange start={filters.start} end={filters.end} allowLongRange onChange={range=>update({...range,preset:'custom'})}/>
    <label><Search/><input value={filters.query} onChange={e=>update({query:e.target.value})} placeholder="搜索 Request ID"/></label>
    {[['model','模型',state.models.map(x=>({id:x.id,name:x.modelId}))],['tenant','客户',state.tenants],['provider','供应商',state.providers],['keys','Key ID',state.apiKeys.map(x=>({id:x.id,name:x.keyId}))]].map(([field,label,items])=><MultiPick key={field} label={label} items={items} value={filters[field]} onChange={value=>update({[field]:value})}/>)}
    <select aria-label="模型类型" value={filters.type} onChange={e=>update({type:e.target.value})}><option value="">全部模型类型</option>{[...new Set(state.models.map(x=>x.type))].map(type=><option key={type} value={type}>{typeNames[type]||type}</option>)}</select>
    <select aria-label="请求来源" value={filters.source} onChange={e=>update({source:e.target.value})}><option value="">全部来源</option>{[...new Set(state.requests.map(x=>x.source))].map(source=><option key={source}>{source}</option>)}</select>
    <select aria-label="请求状态" value={filters.failed?'failed':filters.status} onChange={e=>update({failed:e.target.value==='failed',status:e.target.value==='failed'?'':e.target.value})}><option value="">全部状态</option><option value="failed">仅失败请求</option>{[...new Set(state.requests.map(x=>String(x.httpStatus)))].sort().map(status=><option key={status}>{status}</option>)}</select>
    <FilterReset onClick={()=>{setFilters(defaults());setPage(1);location.hash='/admin-2/logs'}}/></FilterToolbar><SelectedConditions groups={groups}/>
    <section className="v2-list"><div className="v2-table"><table><thead><tr><th>Request ID</th><th>创建时间（北京时间）</th><th>Model ID</th><th>请求来源</th><th>Key ID</th><th>用量</th><th>首包延迟</th><th>延迟</th><th>状态</th><th>操作</th></tr></thead><tbody>{rows.slice((current-1)*size,current*size).map(x=><tr key={x.id}><td><code>{x.requestId}</code></td><td>{stamp(x.createdAt)}</td><td>{labelOf(state,'modelId',x.modelId)}</td><td>{x.source}</td><td>{labelOf(state,'keyId',x.keyId)}</td><td>{hiddenByPolicy(state,x)?'按策略不留存':usageTotal(x.usage).toLocaleString()}</td><td>{x.ttftMs?`${x.ttftMs} ms`:'—'}</td><td>{x.durationMs} ms</td><td><Status value={String(x.httpStatus)}/></td><td><button onClick={()=>setDetail(x)}>详情</button></td></tr>)}{!rows.length&&<tr><td colSpan={10}><div className="v2-empty">没有符合条件的调用记录</div></td></tr>}</tbody></table></div><FilterPagination total={rows.length} page={current} size={size} onPageChange={setPage} onSizeChange={setSize}/></section>{detail&&<Detail request={detail} state={state} close={()=>setDetail(null)}/>}</div>;
}

export function Alerts({ state, dispatch, navigate }) {
  const update=(item,status)=>dispatch({type:"update",collection:"alerts",id:item.id,changes:{status,timeline:[...item.timeline,`${new Date().toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"})} ${status}`]}});
  const incident=item=>{ if(state.incidents.some(x=>x.alertIds.includes(item.id))) return navigate("incidents"); dispatch({type:"batch",objectId:item.id,changes:[{type:"update",collection:"alerts",id:item.id,changes:{status:"已转事件"}},{type:"add",collection:"incidents",record:{id:`incident-${Date.now()}`,incidentId:`INC-${Date.now()}`,title:item.title,alertIds:[item.id],impact:"待评估",assignee:item.assignee,resolution:"",status:"处理中",timeline:["由告警转入事件"]}}]}); navigate("incidents");};
  return <div className="v2-page"><PageHead title="告警管理" text="确认、指派、恢复告警，并把需要协同的问题转入事件处理。"/><section className="v2-summary"><article><span>活跃告警</span><b>{state.alerts.filter(x=>!["已恢复","已转事件"].includes(x.status)).length}</b><small>需要运维关注</small></article><article><span>高等级</span><b>{state.alerts.filter(x=>x.severity==="高").length}</b><small>优先处置</small></article><article><span>告警规则</span><b>6</b><small>4 条已启用</small></article></section><section className="v2-list"><div className="v2-table"><table><thead><tr><th>告警</th><th>级别</th><th>对象</th><th>负责人</th><th>状态</th><th>触发时间</th><th>操作</th></tr></thead><tbody>{state.alerts.map(x=><tr key={x.id}><td>{x.title}</td><td><Status value={x.severity}/></td><td>{x.objectId}</td><td><select value={x.assignee} onChange={e=>dispatch({type:"update",collection:"alerts",id:x.id,changes:{assignee:e.target.value}})}><option>运维人员</option><option>平台管理员</option><option>安全管理员</option></select></td><td><Status value={x.status}/></td><td>{stamp(x.startedAt)}</td><td>{x.status==="待确认"&&<button onClick={()=>update(x,"处理中")}>确认</button>}<button onClick={()=>incident(x)}>转事件</button>{x.status!=="已恢复"&&<button onClick={()=>update(x,"已恢复")}>恢复</button>}</td></tr>)}</tbody></table></div></section></div>;
}

export function Incidents({ state, dispatch }) {
  const act=(item,status)=>{ const resolution=status==="已关闭" ? prompt("请输入复盘结论") : item.resolution; if(status==="已关闭"&&!resolution) return; dispatch({type:"update",collection:"incidents",id:item.id,changes:{status,resolution,timeline:[...item.timeline,`${new Date().toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"})} ${status}`]}}); };
  return <div className="v2-page"><PageHead title="事件处理" text="协同处理服务故障；恢复服务与复盘关闭是两个独立阶段。"/><div className="incident-grid">{state.incidents.map(x=><article key={x.id}><header><div><b>{x.title}</b><small>{x.incidentId}</small></div><Status value={x.status}/></header><p>{x.impact}</p><dl><span>负责人<b>{x.assignee}</b></span><span>关联告警<b>{x.alertIds.length}</b></span></dl><ol>{x.timeline.map((line,i)=><li key={i}>{line}</li>)}</ol><footer>{x.status==="处理中"&&<button onClick={()=>act(x,"已恢复")}>标记恢复</button>}{x.status==="已恢复"&&<button className="v2-primary" onClick={()=>act(x,"已关闭")}>填写结论并关闭</button>}</footer></article>)}</div></div>;
}

export function Sla({ state }) {
  const byModel=groupRequests(state.requests,"modelId");
  return <div className="v2-page"><PageHead title="服务质量报告" text="基于请求样本计算可用率和延迟分位数，并关联故障事件。"/><section className="v2-list"><div className="v2-table"><table><thead><tr><th>Model ID</th><th>样本数</th><th>可用率</th><th>P50 延迟</th><th>P95 延迟</th><th>故障事件</th><th>SLA 目标</th><th>结果</th></tr></thead><tbody>{byModel.map(group=>{const ok=group.requests.filter(x=>x.httpStatus<400).length/group.requests.length*100,p50=percentile(group.requests.map(x=>x.durationMs),.5),p95=percentile(group.requests.map(x=>x.durationMs),.95),pass=ok>=99;return <tr key={group.key}><td>{labelOf(state,"modelId",group.key)}</td><td>{group.requests.length}</td><td>{ok.toFixed(2)}%</td><td>{p50} ms</td><td>{p95} ms</td><td>{state.incidents.filter(x=>x.title.includes(state.models.find(m=>m.id===group.key)?.name.split("-")[0])).length}</td><td>≥ 99.00%</td><td><Status value={pass?"达标":"未达标"}/></td></tr>})}</tbody></table></div></section></div>;
}

export default function ObservabilityPage({ pageId, ...props }) { return pageId==="monitoring"?<Monitoring {...props}/>:pageId==="logs"?<Logs {...props}/>:pageId==="alerts"?<Alerts {...props}/>:pageId==="incidents"?<Incidents {...props}/>:<Sla {...props}/>; }
