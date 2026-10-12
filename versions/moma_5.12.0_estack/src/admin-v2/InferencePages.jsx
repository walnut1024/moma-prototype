import { deploymentSeries, deploymentSummary } from "./observability";
import { useMemo, useState } from "react";
import { TimeSeriesChart as SharedMetricChart } from "../components/AnalyticsCharts";
import { Activity, CirclePlus, Search, Server, X } from "lucide-react";

import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '../components/ui/select';
import { FilterToolbar, FilterField, FilterReset } from '../components/FilterControls';
import { MultiPick } from './AnalyticsFilters';
import './enterprise.css';
import './usage-analysis.css';
import './inference.css';

const uid = prefix => `${prefix}-${Date.now()}`;

function Modal({ title, onClose, children }) {
  const [trigger] = useState(() => document.activeElement);
  return <Dialog open onOpenChange={open => !open && onClose()}><DialogContent className="tp-dialog" showCloseButton={false} aria-describedby={undefined} onCloseAutoFocus={event => {event.preventDefault();trigger?.focus();}}><DialogHeader><DialogTitle>{title}</DialogTitle><Button variant="ghost" size="icon" aria-label="关闭" onClick={onClose}><X/></Button></DialogHeader>{children}</DialogContent></Dialog>;
}

function Header({ title, description, icon: Icon, action }) {
  return <div className="ent-page-head"><div><h1><Icon/>{title}</h1><p>{description}</p></div>{action}</div>;
}

function State({ value }) { return <em className={`v2-status ${["维护中", "失败", "停止"].includes(value) ? "warn" : ""}`}>{value}</em>; }

export function ClusterManagement({ state, dispatch }) {
  const [query, setQuery] = useState(""), [creating, setCreating] = useState(false), [error, setError] = useState("");
  const rows = state.clusters.filter(item => `${item.name} ${item.clusterId} ${item.zone}`.toLowerCase().includes(query.toLowerCase()));
  const save = event => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); const totalGpu = Number(values.totalGpu); if (!values.clusterId || !values.name || totalGpu < 1) return setError("请填写唯一 Cluster ID、集群名称和正整数 GPU 数量"); if (state.clusters.some(item => item.clusterId === values.clusterId)) return setError("Cluster ID 已存在"); if (dispatch({ type: "add", collection: "clusters", record: { id: uid("cluster"), ...values, totalGpu, allocatedGpu: 0, nodes: Number(values.nodes), status: "运行中" } })) setCreating(false); };
  return <div className="enterprise-page ua-page tp-page"><Header title="集群纳管" icon={Server} description="统一纳管自有推理集群，查看节点、GPU 容量和部署占用。" action={<Button onClick={() => setCreating(true)}><CirclePlus/> 纳管集群</Button>}/><Card className="ua-kpis"><CardContent className="tp-kpis"><div><span>GPU 总量</span><strong>{state.clusters.reduce((sum, item) => sum + item.totalGpu, 0)}</strong></div><div><span>已分配 GPU</span><strong>{state.clusters.reduce((sum, item) => sum + item.allocatedGpu, 0)}</strong></div><div><span>运行集群</span><strong>{state.clusters.filter(item => item.status === "运行中").length}</strong></div></CardContent></Card><section className="ent-panel tp-clusters"><FilterToolbar className="ent-toolbar"><label className="ent-search"><Search size={14}/><Input aria-label="搜索集群" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索 Cluster ID、名称或可用区"/></label><FilterReset onClick={() => setQuery("")}/><span className="ent-count">共 {rows.length} 个集群</span></FilterToolbar><div className="cluster-grid">{rows.map(item => { const usage = Math.round(item.allocatedGpu / item.totalGpu * 100); return <article key={item.id}><header><div><b>{item.name}</b><small>{item.clusterId}</small></div><State value={item.status}/></header><dl><span><dt>可用区</dt><dd>{item.zone}</dd></span><span><dt>GPU 型号</dt><dd>{item.gpuType}</dd></span><span><dt>节点</dt><dd>{item.nodes}</dd></span><span><dt>GPU 容量</dt><dd>{item.allocatedGpu} / {item.totalGpu}</dd></span></dl><label>资源占用 <b>{usage}%</b><i><span style={{ width: `${usage}%` }}/></i></label><footer><Button variant="ghost" onClick={() => dispatch({ type: "update", collection: "clusters", id: item.id, changes: { status: item.status === "维护中" ? "运行中" : "维护中" } })}>{item.status === "维护中" ? "恢复服务" : "进入维护"}</Button><span>{state.deployments.filter(deploy => deploy.clusterId === item.id).length} 个部署</span></footer></article>; })}</div>{!rows.length && <p className="ua-empty">{query ? "没有符合筛选条件的集群" : "暂无纳管集群"}</p>}</section>{creating && <Modal title="纳管推理集群" onClose={() => setCreating(false)}><form onSubmit={save} className="inference-form"><label>Cluster ID<Input name="clusterId" placeholder="例如 inference-nj-b"/></label><label>集群名称<Input name="name" placeholder="请输入集群名称"/></label><label>可用区<Input name="zone" defaultValue="南京"/></label><label>GPU 型号<select name="gpuType"><option>H20</option><option>L40S</option><option>A800</option></select></label><label>GPU 总量<Input name="totalGpu" type="number" min="1" defaultValue="8"/></label><label>节点数量<Input name="nodes" type="number" min="1" defaultValue="1"/></label>{error && <p role="alert" className="form-error">{error}</p>}<footer><Button variant="ghost" type="button" onClick={() => setCreating(false)}>取消</Button><Button>确认纳管</Button></footer></form></Modal>}</div>;
}

export { default as ModelDeployments } from './DeploymentManagement';

function ObservabilityChart({ deployments, metric }) {
  const hours = Array.from({ length: 13 }, (_, index) => `${String(index * 2).padStart(2, "0")}:00`);
  return <SharedMetricChart labels={hours} series={deployments.map(item => ({ label: item.name, values: deploymentSeries(item, metric) }))} height={250} label={metric} unit={metric === "GPU 利用率" ? "%" : metric === "P95 延迟" ? "ms" : ""} />;
}

export function ModelObservability({ state }) {
  const running = state.deployments.filter(item => item.status !== "停止"), [selected, setSelected] = useState(running.map(item => item.id)), [metric, setMetric] = useState("GPU 利用率");
  const visible = useMemo(() => running.filter(item => selected.includes(item.id)), [running, selected]);
  const summary = deploymentSummary(visible);
  return <div className="enterprise-page ua-page tp-page"><Header title="生产观测" icon={Activity} description="按部署实例对比资源与推理性能，图表每个部署对应独立序列。"/>
    <Card className="ua-filters"><CardContent><FilterToolbar className="tp-filters">
      <FilterField className="ua-select" label="监控指标"><Select value={metric} onValueChange={setMetric}><SelectTrigger aria-label="监控指标"><SelectValue/></SelectTrigger><SelectContent><SelectGroup>{["GPU 利用率", "请求吞吐", "P95 延迟"].map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectGroup></SelectContent></Select></FilterField>
      <FilterField className="ua-select" label="部署实例"><MultiPick label="部署实例" value={selected} onChange={value => setSelected(value ?? running.map(item => item.id))} items={running.map(item => ({id:item.id, name:item.deploymentId, searchText:item.name}))}/></FilterField>
      <FilterReset onClick={() => {setMetric("GPU 利用率");setSelected(running.map(item => item.id));}}/>
      <span className="ent-count">近 24 小时 · {visible.length} 个部署</span>
    </FilterToolbar></CardContent></Card>
    <Card className="ua-kpis"><CardContent className="tp-kpis"><div><span>平均 GPU 利用率</span><strong>{summary.gpu === null ? "—" : summary.gpu.toFixed(1) + "%"}</strong></div><div><span>总吞吐</span><strong>{summary.throughput === null ? "—" : summary.throughput.toFixed(1) + " req/s"}</strong></div><div><span>P95 延迟</span><strong>{summary.p95 === null ? "—" : summary.p95 + " ms"}</strong></div></CardContent></Card>
    <Card className="ua-panel"><CardHeader><CardTitle>{metric}趋势</CardTitle><small>近 24 小时 · {visible.length} 个部署 · 监测记录</small></CardHeader><CardContent>{visible.length ? <ObservabilityChart deployments={visible} metric={metric}/> : <div className="ua-chart-empty">请选择至少一个部署</div>}</CardContent></Card>
  </div>;
}
