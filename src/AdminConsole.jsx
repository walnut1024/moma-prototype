import { useMemo, useState } from "react";
import { TimeSeriesChart as SharedMetricChart } from "./components/AnalyticsCharts";
import { ChevronDown, ChevronRight, Plus, RefreshCw, Search, X } from "lucide-react";
import "./admin.css";

const modelRows = [
  ["Qwen3.8-Max", "CMSS", "参数量 2.4T · 文本生成", "文本模型 / 文本对话 / Qwen", "2026-09-12 10:30:00"],
  ["Text-Embedding-V4", "TokenHub", "参数量 4B · 向量", "向量模型 / Embedding", "2026-09-11 17:20:00"],
  ["DeepSeek-V4-Pro", "江苏移动", "参数量 1.6T · 文本生成", "文本模型 / 深度推理", "2026-09-11 09:45:00"],
  ["GLM-5.2", "江苏联通", "参数量 744B · 文本生成", "文本模型 / 文本对话 / GLM", "2026-09-10 14:10:00"],
  ["Kimi-K3", "江苏移动", "参数量 2.8T · 多模态", "多模态模型 / Kimi", "2026-09-09 18:00:00"],
  ["MiniMax-H3", "TokenHub", "参数量 456B · 音视频", "多模态模型 / MiniMax", "2026-09-09 15:10:00"],
];

const menu = [
  ["model", "模型管理"], ["image", "镜像管理"], ["calls", "调用统计"],
  ["observation", "模型观测", [["obs-business", "业务调用统计"], ["obs-performance", "性能吞吐统计"], ["obs-error", "错误与异常统计"]]],
  ["analysis", "数据分析", [["data-customer", "客户分析"], ["data-provider", "服务商分析"], ["data-model", "模型分析"]]],
  ["cost", "成本分析"], ["rate", "流量管理"], ["cluster", "集群管理"], ["group", "节点分组"],
  ["provider", "模型服务商管理"], ["route", "模型路由管理"], ["safety", "模型安全"],
];

const titles = Object.fromEntries(menu.flatMap(([key, title, children]) => [[key, title], ...(children || [])]));
function Chart({ type = "line", series = 1, height = 230 }) {
  return <SharedMetricChart labels={["09-09", "09-10", "09-11", "09-12", "09-13", "09-14", "09-15"]} series={Array.from({ length: series }, (_, i) => ({ label: ["调用量", "Token 数", "失败量"][i], values: [18 + i * 4, 34, 25 + i * 6, 52 - i * 5, 39, 61 - i * 8, 46 + i * 2] }))} type={type} height={height} label="统计图表" />;
}

function Switch({ initial = true }) { const [on, setOn] = useState(initial); return <button className={`adm-switch ${on ? "on" : ""}`} onClick={() => setOn(!on)} aria-label={on ? "关闭" : "开启"}><i /></button>; }

function Filters({ kind = "model", onSearch }) {
  const [keyword, setKeyword] = useState("");
  return <div className="adm-filters">
    <label><span>{kind === "user" ? "用户名" : kind === "provider" ? "服务商" : "模型名称"}</span><input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder={`请输入${kind === "user" ? "用户名" : kind === "provider" ? "服务商" : "模型名称"}`} /></label>
    {kind === "model" && <><label><span>模型标签</span><input placeholder="请输入模型标签" /></label><label><span>模型类型</span><select><option>全部</option><option>文本模型</option><option>多模态模型</option><option>向量模型</option></select></label><label><span>启用状态</span><select><option>全部</option><option>已启用</option><option>已停用</option></select></label></>}
    {kind !== "model" && <label><span>时间</span><input type="date" defaultValue="2026-09-15" /></label>}
    <div className="adm-filter-actions"><button className="primary" onClick={() => onSearch?.(keyword)}>查询</button><button onClick={() => { setKeyword(""); onSearch?.(""); }}>重置</button></div>
  </div>;
}

function GridTable({ columns, rows, renderCell }) {
  return <div className="adm-table-wrap"><table><thead><tr>{columns.map(x => <th key={x}>{x}</th>)}</tr></thead><tbody>{rows.map((row, r) => <tr key={r}>{row.map((cell, c) => <td key={c}>{renderCell ? renderCell(cell, c, row) : cell}</td>)}</tr>)}</tbody></table><div className="adm-pagebar">共 {rows.length * 10 + 1} 条记录　 <button>‹</button><b>1</b><button>2</button><button>3</button><span>…</span><button>7</button><button>›</button></div></div>;
}

function PageShell({ title, actions, children }) { return <><div className="adm-page-title"><h1>{title}</h1>{actions}</div>{children}</>; }

function ModelPage({ open }) {
  const [query, setQuery] = useState("");
  const rows = modelRows.filter(x => x[0].toLowerCase().includes(query.toLowerCase())).map(x => [...x.slice(0, 3), "已启用", "可见", x[4], "操作"]);
  return <PageShell title="模型管理"><div className="adm-tabs"><button className="active">基础模型</button></div><Filters onSearch={setQuery} /><div className="adm-toolbar"><button className="primary" onClick={() => open("新建基础模型")}><Plus size={14} />新建</button></div><GridTable columns={["模型名称", "服务商名称", "模型属性", "状态", "是否现网可见", "更新时间", "操作"]} rows={rows} renderCell={(cell, c, row) => c === 3 || c === 4 ? <span className="adm-status">{cell}</span> : c === 6 ? <span className="adm-actions"><button>上下架</button><button onClick={() => open(`编辑 ${row[0]}`)}>编辑</button><button disabled>删除</button></span> : cell} /></PageShell>;
}

const simpleTables = {
  image: { title: "镜像管理", tabs: ["镜像实例", "基础镜像", "官方镜像"], columns: ["镜像实例 ID", "镜像名称", "镜像类型", "资源池", "状态", "现网是否可见", "更新时间", "操作"], rows: [["img-2041", "moma-text-runtime:v5", "部署基础镜像", "南京一池", "已启用", "可见", "2026-09-12 11:20:08", "详情"], ["img-1938", "vllm-cu128:latest", "微调基础镜像", "苏州智算池", "已启用", "不可见", "2026-09-10 08:14:52", "详情"]] },
  rate: { title: "流量管理", columns: ["用户名称", "项目", "API Key 名称", "API Key", "流量限制", "操作"], rows: [["江苏政务云", "moma-prod", "api-key-prod", "sk-***8L2", "100,000 tokens/分钟 · 1,000 次/分钟", "编辑　删除"], ["研发测试组", "moma-test", "api-key-test", "sk-***A71", "10,000 tokens/天", "编辑　删除"]] },
  cluster: { title: "集群管理", columns: ["IP", "节点名称", "主机类型", "规格类型", "GPU 类型", "所属分组", "是否占有", "操作"], rows: [["10.25.18.12", "gpu-node-01", "物理机", "8卡", "H20", "推理生产组", "是", "编辑　删除"], ["10.25.18.18", "gpu-node-07", "云主机", "4卡", "L20", "弹性资源组", "否", "编辑　删除"]] },
  group: { title: "节点分组", columns: ["分组名称", "标签", "主 GPU 型号", "成员数", "可用", "状态", "操作"], rows: [["推理生产组", "生产", "H20", "32", "28", "启用", "成员　编辑"], ["弹性资源组", "弹性", "L20", "16", "11", "启用", "成员　编辑"]] },
  provider: { title: "模型服务商管理", columns: ["服务商归属", "服务商英文名称", "服务商中文名称", "服务地址", "是否外部供应商", "操作"], rows: [["OpenAI 兼容服务", "cmss", "中国移动", "https://moma.cmecloud.cn/v1", "否", "编辑　删除"], ["OpenAI 兼容服务", "tokenhub", "TokenHub", "https://api.tokenhub.cn/v1", "是", "编辑　删除"], ["OpenAI 兼容服务", "jslt", "江苏联通", "https://llm.jslt.cn/v1", "是", "编辑　删除"]] },
  route: { title: "模型路由管理", columns: ["名称", "路径匹配规则", "模型匹配规则", "服务提供商", "请求授权", "操作"], rows: [["deepseek-prod", "前缀匹配 | /v1/chat", "精确匹配 | DeepSeek-V4-Pro", "中国移动: 70% · TokenHub: 30%", "已开启", "编辑　删除"], ["embedding-route", "前缀匹配 | /v1/embeddings", "前缀匹配 | Text-Embedding", "TokenHub", "未开启", "编辑　删除"]] },
  safety: { title: "模型安全", columns: ["策略名称", "检测范围", "处置动作", "状态", "更新时间", "操作"], rows: [["政务敏感信息防护", "输入与输出", "拦截", "已启用", "2026-09-12 14:22:10", "编辑"], ["提示词攻击检测", "输入", "告警", "已启用", "2026-09-11 09:18:02", "编辑"]] },
};

function SimpleTablePage({ page, open }) {
  const data = simpleTables[page];
  const [tab, setTab] = useState(data.tabs?.[0]);
  return <PageShell title={data.title}>{data.tabs && <div className="adm-tabs">{data.tabs.map(x => <button onClick={() => setTab(x)} className={tab === x ? "active" : ""} key={x}>{x}</button>)}</div>}<div className="adm-toolbar"><div className="adm-search"><Search size={15} /><input placeholder="请输入名称或 ID 搜索" /></div><span /><button className="primary" onClick={() => open(`${page === "rate" ? "创建规则" : "新建"}${data.title.replace("管理", "")}`)}><Plus size={14} />新建</button><button aria-label="刷新"><RefreshCw size={14} /></button></div><GridTable columns={data.columns} rows={data.rows} renderCell={(cell, c) => c === data.columns.length - 1 ? <span className="adm-actions">{String(cell).split("　").map(x => <button key={x}>{x}</button>)}</span> : ["已启用", "启用", "可见"].includes(cell) ? <span className="adm-status">{cell}</span> : cell} /></PageShell>;
}

function CostPage({ open }) {
  const rows = modelRows.slice(0, 5).map((x, i) => [x[0], x[1], x[4], `输入 ${1 + i}.20 / 缓存 0.${i + 2}0 / 输出 ${3 + i}.80`, `输入 ${2 + i}.00 / 缓存 0.${i + 4}0 / 输出 ${5 + i}.00`, (128640 - i * 12240).toLocaleString(), `¥${(0.38 - i * .04).toFixed(2)}`, "详情"]);
  return <PageShell title="成本分析"><Filters /><div className="adm-kpis"><article><span>总调用量</span><b>969,771</b></article><article><span>总收入</span><b>¥10.87</b></article><article><span>总利润</span><b>¥1.21</b></article></div><GridTable columns={["模型名称", "模型服务商", "模型接入时间", "模型成本价（元/百万 tokens）", "模型目录价（元/百万 tokens）", "调用量", "利润", "操作"]} rows={rows} renderCell={(cell, c, row) => c === 7 ? <button className="adm-link" onClick={() => open(`${row[0]} 成本详情`)}>详情</button> : cell} /></PageShell>;
}

function CallsPage() { return <PageShell title="调用统计"><div className="adm-filters"><label><span>时间范围</span><select><option>近三日</option><option>今日</option><option>近七日</option></select></label><label><span>调用类型</span><select><option>全部</option><option>在线体验</option><option>API 调用</option><option>智能体调用</option></select></label><label><span>模型名称</span><input placeholder="请选择模型名称" /></label><div className="adm-filter-actions"><button className="primary">查询</button><button>重置</button></div></div><div className="adm-kpis four"><article><span>客户量</span><b>128</b></article><article><span>调用总量</span><b>969,771</b></article><article><span>调用失败量</span><b>1,203</b></article><article><span>调用 tokens 数</span><b>586.21 M</b></article></div><div className="adm-charts"><article><h3>调用量趋势</h3><Chart /></article><article><h3>调用 tokens 趋势</h3><Chart series={2} /></article></div></PageShell>; }

function ObservationPage({ page, navigate }) {
  const names = page === "obs-performance" ? ["TPM（每分钟 Token 吞吐量）", "RPM（每分钟请求吞吐量）", "平均请求时延", "平均首 Token 返回", "每秒处理请求 QPS"] : page === "obs-error" ? ["调用失败总次数", "整体错误率", "超时请求次数", "分类型错误计数"] : ["Token 数统计", "各模型调用次数"];
  return <PageShell title="模型观测"><div className="adm-tabs">{[["obs-business","业务调用统计"], ["obs-performance","性能吞吐统计"], ["obs-error","错误与异常统计"]].map(([key, x]) => <button onClick={() => navigate(key)} className={page === key ? "active" : ""} key={key}>{x}</button>)}</div><div className="adm-period"><span>时间</span><button>5 分钟</button><button>今日</button><button className="active">近 3 日</button><button>近 7 日</button><input type="date" defaultValue="2026-09-15" /></div>{page === "obs-business" && <div className="adm-kpis four"><article><span>客户数</span><b>128</b></article><article><span>调用总次数</span><b>969,771</b></article><article><span>单客户平均 Token 消耗</span><b>4.58 M</b></article><article><span>单请求平均 Token 长度</span><b>604</b></article></div>}<div className="adm-charts">{names.map((x, i) => <article key={x}><h3>{x}</h3><Chart type={page === "obs-business" ? "bar" : "line"} series={i === names.length - 1 && page === "obs-error" ? 3 : 1} /></article>)}</div></PageShell>;
}

function AnalysisTabs({ page, navigate }) { return <div className="adm-tabs">{[["data-customer","客户分析"], ["data-provider","服务商分析"], ["data-model","模型分析"]].map(([key, label]) => <button key={key} onClick={() => navigate(key)} className={page === key ? "active" : ""}>{label}</button>)}</div>; }
function AnalysisPage({ page, navigate }) {
  if (page === "data-customer") return <PageShell title="数据分析"><AnalysisTabs page={page} navigate={navigate} /><Filters kind="user" /><GridTable columns={["用户 ID", "用户名称", "调用总量", "输入 Token 数", "输出 Token 数", "总 Token 数", "错误率(%)"]} rows={[["u-02831", "江苏政务云", "382,194", "218.32 M", "41.28 M", "259.60 M", "0.12"], ["u-01920", "南京智算中心", "198,442", "129.22 M", "32.04 M", "161.26 M", "0.08"], ["u-03117", "苏州工业园", "86,152", "62.28 M", "10.81 M", "73.09 M", "0.21"]]} /></PageShell>;
  const model = page === "data-model";
  const charts = model ? ["模型对应服务商调用占比", "模型对应服务商 Token 消耗占比", "模型对应服务商调用次数", "模型对应服务商 Token 消耗", "模型对应服务商失败次数", "模型对应服务商错误率"] : ["服务商活跃客户数", "服务商总调用次数", "服务商输入 Token", "服务商输出 Token", "服务商总 Token 量", "服务商调用失败总数", "服务商整体错误率"];
  return <PageShell title="数据分析"><AnalysisTabs page={page} navigate={navigate} /><Filters kind="provider" /><div className="adm-charts">{charts.map((x, i) => <article key={x}><h3>{x}</h3><Chart type={i < 2 && model ? "bar" : "line"} /></article>)}</div></PageShell>;
}

function Modal({ title, close }) { return <div className="adm-mask" onClick={close}><aside className="adm-drawer" onClick={e => e.stopPropagation()}><header><h2>{title}</h2><button aria-label="关闭" onClick={close}><X /></button></header><div className="adm-form"><label>名称<input placeholder="请输入名称" /></label><label>类型<select><option>请选择</option><option>文本模型</option><option>OpenAI 兼容服务</option></select></label><label>描述<textarea placeholder="请输入描述" /></label><label>是否启用<Switch /></label></div><footer><button onClick={close}>取消</button><button className="primary" onClick={close}>确定</button></footer></aside></div>; }

export default function AdminConsole() {
  const [page, setPage] = useState("model"), [expanded, setExpanded] = useState(["observation", "analysis"]), [modal, setModal] = useState("");
  const render = useMemo(() => page === "model" ? <ModelPage open={setModal} /> : page === "cost" ? <CostPage open={setModal} /> : page === "calls" ? <CallsPage /> : page.startsWith("obs-") ? <ObservationPage page={page} navigate={setPage} /> : page.startsWith("data-") ? <AnalysisPage page={page} navigate={setPage} /> : <SimpleTablePage page={page} open={setModal} />, [page]);
  const choose = (key, children) => { if (children) setExpanded(x => x.includes(key) ? x.filter(y => y !== key) : [...x, key]); else setPage(key); };
  return <div className="admin-console"><aside className="adm-sidebar"><nav>{menu.map(([key, title, children]) => <div key={key}><button className={page === key ? "active" : ""} onClick={() => choose(key, children)}><span>{title}</span>{children && (expanded.includes(key) ? <ChevronDown /> : <ChevronRight />)}</button>{children && expanded.includes(key) && <div className="adm-subnav">{children.map(([child, label]) => <button className={page === child ? "active" : ""} onClick={() => setPage(child)} key={child}>{label}</button>)}</div>}</div>)}</nav></aside><section className="adm-work"><div className="adm-breadcrumb">首页　/　{titles[page]}</div><main>{render}</main></section>{modal && <Modal title={modal} close={() => setModal("")} />}</div>;
}
