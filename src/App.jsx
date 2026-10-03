import { FilterPagination } from "./components/FilterControls";
import { useEffect, useMemo, useState } from "react";
import UsageStatistics from "./components/UsageStatistics";
import OrganizationMembers from "./OrganizationMembers";
import "./styles.css";
import "./version-index.css";
import "./legacy-5102.css";
import "./order-5102.css";
import "./ranking.css";
import ModelExperience from "./ModelExperience";
import CallLogs from "./CallLogs";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./components/ui/tabs";
import TextExperience from "./TextExperience";
import MultimodalExperience from "./MultimodalExperience";
import ModelComparison from "./ModelComparison";
import AdminConsole from "./AdminConsole";
import AdminConsoleV2 from "./AdminConsoleV2";
import { shanghaiDate } from "./call-log-data.mjs";
import { orderedRouteModels } from "./route-models.mjs";
import { Popover as PopoverPrimitive } from "radix-ui";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./components/ui/select";
import {
  Activity,
  ArrowRight,
  AudioLines,
  CalendarDays,
  Calculator,
  ChartNoAxesCombined,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  FileText,
  Image,
  Images,
  Info,
  KeyRound,
  Languages,
  ReceiptText,
  RefreshCw,
  Route,
  ScanSearch,
  Search,
  Settings,
  ShoppingCart,
  Store,
  Users,
  Video,
} from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./components/ui/dialog";
import { Button } from "./components/ui/button";
import { apiKeySamples } from "./api-key-data.mjs";
import { parseIpAllowlist } from "./api-key-utils.mjs";

const A = "/assets/";
const models = [
  {
    name: "DeepSeek-V4-Pro",
    series: "DeepSeek",
    desc: "旗舰级 MoE 大模型，总参1.6T、激活 49B，原生支持百万级超长上下文。依托海量高质量训练数据，具备顶尖数学逻辑、复杂推理、专业代码与长文本深度解析能力。",
    context: "1024K",
    date: "2026-08-16 17:03:37",
    icon: 1,
    hot: true,
  },
  {
    name: "Kimi-K3",
    series: "Kimi",
    desc: "Kimi K3 是 Kimi 迄今能力最强的旗舰模型，拥有 2.8 万亿参数，基于 KDA 混合线性注意力机制和注意力残差技术构建。",
    context: "1024K",
    date: "2026-08-16 17:03:40",
    icon: 2,
    hot: true,
  },
  {
    name: "GLM-5.2",
    series: "GLM",
    desc: "智谱新一代旗舰模型，专为长程任务能力而生，支持 1M 无损上下文，一次任务即可完成“从需求到多端可部署产物”的完整开发链路。",
    context: "1024K",
    date: "2026-08-16 17:03:36",
    icon: 3,
    hot: true,
  },
  {
    name: "Qwen3.7-Max",
    series: "Qwen",
    desc: "qwen3.7 系列中规模最大、综合能力最强的 Max 模型，面向智能体时代，在编程、办公与生产力方面表现出色。",
    context: "1024K",
    date: "2026-08-16 17:03:21",
    icon: 4,
    hot: true,
  },
  {
    name: "MiniMax-M3",
    series: "MiniMax",
    desc: "MiniMax 最新旗舰模型，同时具备前沿 Coding 能力、超长上下文、原生多模态三大核心能力。",
    context: "512K",
    date: "2026-08-16 17:03:39",
    icon: 5,
    score: 176,
  },
  {
    name: "GLM-5",
    series: "GLM",
    desc: "智谱 AI 开源的旗舰大模型，约 744B 参数 MoE 架构，支持百万级上下文，在推理、编程与 Agent 任务上位居开源前列。",
    context: "200K",
    date: "2026-08-16 17:03:43",
    icon: 6,
    score: 165,
  },
  {
    name: "Qwen3.5-397B-A17B",
    series: "Qwen",
    desc: "阿里通义千问开源的多模态 MoE 大模型，原生多模态，面向多语言多模态智能体与科研场景。",
    context: "256K",
    date: "2026-08-16 17:03:43",
    icon: 4,
    score: 147,
  },
  {
    name: "DeepSeek-V4-Flash",
    series: "DeepSeek",
    desc: "DeepSeek 最新一代 MoE 架构大语言模型的轻量版本，标配百万 token 超长上下文，兼顾高性能与低成本。",
    context: "1024K",
    date: "2026-08-16 17:03:39",
    icon: 1,
    score: 119,
  },
  {
    name: "Qwen3.5-4B",
    series: "Qwen",
    desc: "Qwen3.5 融合多模态学习、架构效率、强化学习规模等方面的突破，带来能力与效率的全面提升。",
    context: "128K",
    date: "2026-08-16 17:03:27",
    icon: 4,
    score: 108,
  },
  {
    name: "Qwen3.8-Max",
    series: "Qwen",
    desc: "新一代多模态旗舰模型，支持文本、图像与长视频理解，适合复杂办公与智能体任务。",
    context: "1024K",
    date: "2026-09-10 09:20:00",
    icon: 4,
    input: ["文本", "图像", "视频"],
    output: ["文本"],
    task: ["多模态", "文本与代码"],
  },
  {
    name: "Qwen-Image-3.0-Pro",
    series: "Qwen",
    desc: "高品质图像生成与编辑模型，擅长中英文排版、商业海报与多图参考创作。",
    context: "32K",
    date: "2026-09-09 15:10:00",
    icon: 4,
    input: ["文本", "图像"],
    output: ["图像"],
    task: ["图像", "多模态"],
  },
  {
    name: "Wan3.0-Video",
    series: "Qwen",
    desc: "视频生成旗舰模型，支持文生视频和图生视频，兼顾镜头运动与主体一致性。",
    context: "16K",
    date: "2026-09-08 11:30:00",
    icon: 4,
    input: ["文本", "图像"],
    output: ["视频"],
    task: ["视频", "多模态"],
  },
  {
    name: "Qwen-Audio-TTS",
    series: "Qwen",
    desc: "多语言语音合成模型，支持自然音色、语速调节和情感表达，适合客服与内容播报。",
    context: "8K",
    date: "2026-09-07 16:40:00",
    icon: 4,
    input: ["文本"],
    output: ["音频"],
    task: ["音频"],
  },
  {
    name: "Qwen-Audio-ASR-Flash",
    series: "Qwen",
    desc: "低延迟语音识别模型，适用于会议转录、实时字幕与多语种音频内容理解。",
    context: "8K",
    date: "2026-09-07 10:12:00",
    icon: 4,
    input: ["音频"],
    output: ["文本"],
    task: ["音频", "多模态"],
  },
  {
    name: "BGE-M3",
    series: "Bge",
    desc: "通用文本向量模型，支持多语言语义检索、知识库召回与长文档表示。",
    context: "32K",
    date: "2026-09-06 13:26:00",
    icon: 6,
    input: ["文本"],
    output: ["向量"],
    task: ["向量"],
  },
  {
    name: "GLM-5.3-Flash",
    series: "GLM",
    desc: "原生多模态模型，支持图像、视频与文本理解，以较低成本提供快速推理。",
    context: "1024K",
    date: "2026-09-12 10:30:00",
    icon: 3,
    input: ["图像", "视频", "文本"],
    output: ["文本"],
    task: ["多模态", "文本与代码"],
  },
  {
    name: "Kimi-K2.6",
    series: "Kimi",
    desc: "面向智能体任务的多模态模型，支持文本、图片和视频输入，兼顾复杂推理与代码能力。",
    context: "256K",
    date: "2026-09-11 17:20:00",
    icon: 2,
    input: ["文本", "图像", "视频"],
    output: ["文本"],
    task: ["多模态", "文本与代码"],
  },
  {
    name: "MiniMax-H3",
    series: "MiniMax",
    desc: "原生音视频生成模型，支持文本、图片与音频参考，适用于广告、数字人与影视分镜。",
    context: "32K",
    date: "2026-09-11 09:45:00",
    icon: 5,
    input: ["文本", "图像", "音频"],
    output: ["视频"],
    task: ["视频", "多模态"],
  },
  {
    name: "Wan3.0-I2V-Plus",
    series: "Qwen",
    desc: "专业图生视频模型，可根据参考图生成稳定连贯的镜头运动并保持主体一致性。",
    context: "16K",
    date: "2026-09-10 14:10:00",
    icon: 4,
    input: ["图像", "文本"],
    output: ["视频"],
    task: ["视频", "多模态"],
  },
  {
    name: "Seedance-2.0",
    series: "Doubao",
    desc: "多模态视频创作模型，支持图片、视频、音频等参考输入，并提供视频生成与延长能力。",
    context: "32K",
    date: "2026-09-09 18:00:00",
    icon: 5,
    input: ["文本", "图像", "视频", "音频"],
    output: ["视频"],
    task: ["视频", "多模态"],
  },
];
const hero = [
  { ...models[0], bg: "firstBg-ef3f07b8.png", type: "文本生成" },
  { ...models[1], bg: "secondBg-c502c3d3.png", type: "多模态生成" },
  { ...models[2], bg: "thirdBg-6b946aba.png", type: "文本生成" },
  { ...models[3], bg: "forthBg-982e3d97.png", type: "文本生成" },
];
const nav = [
  ["模型市场", "模型广场"],
  ["", "智能路由"],
  ["", "模型排行"],
  ["模型体验", "文本生成"],
  ["", "多模态理解"],
  ["", "图片生成"],
  ["", "视频生成"],
  ["", "语音生成"],
  ["订单管理", "模型订购"],
  ["API Key", "按量付费"],
  ["", "Token Plan"],
];
const billingTypes = ["按量付费", "Token Plan", "资源包"];
const navIcons5102 = {
  模型广场: Store,
  智能路由: Route,
  模型排行: Activity,
  语言模型: Languages,
  多模态理解: ScanSearch,
  视觉模型: Images,
  语音模型: AudioLines,
  模型订购: ShoppingCart,
  按量付费: KeyRound,
  "Token Plan": Calculator,
};
const usageIcons5102 = {
  按量付费: ChartNoAxesCombined,
  "Token Plan": ReceiptText,
};
const prototypeVersions = [
  {
    id: "moma_5.11.0_estack",
    state: "当前版本",
    releaseDate: "待定",
    changes:
      "新增模型排行、语音模型、资源包与 Coding Plan；完善模型体验、订单管理、API Key、用量统计和调用日志。",
  },
  {
    id: "moma_5.10.2_estack",
    state: "历史版本",
    releaseDate: "9月30日",
    changes:
      "保留模型市场、智能路由、语言与视觉模型体验，以及按量付费、Token Plan、API Key 和历史用量统计。",
  },
];

const routeApiUrl = "https://zhenze-huhehaote.cmecloud.cn/v1/chat/completions";

function SmartRoute({ versionId, onNavigate }) {
  const storageKey = `moma-smart-routes:${versionId}`;
  const [creating, setCreating] = useState(false),
    [editingId, setEditingId] = useState(null),
    [apiRoute, setApiRoute] = useState(null),
    [deleting, setDeleting] = useState(null),
    [copyNotice, setCopyNotice] = useState(""),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(1), [size, setSize] = useState(10),
    [name, setName] = useState(""),
    [strategy, setStrategy] = useState("效果优先"),
    [models, setModels] = useState([]),
    [agreed, setAgreed] = useState(false),
    [routes, setRoutes] = useState(() => {
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored !== null) {
          const saved = JSON.parse(stored);
          if (Array.isArray(saved)) return saved;
        }
      } catch { /* Keep the prototype usable if browser storage is unavailable. */ }
      return versionId === "moma_5.11.0_estack" ? [{ id: "route-demo-001", name: "demo-route", strategy: "效果优先", models: ["Kimi-K3", "DeepSeek-V4-Pro"], status: "正常", creator: "estack-yy", time: new Date().toLocaleString("sv-SE", { timeZone: "Asia/Shanghai", hour12: false }) }] : [];
    });
  useEffect(() => { try { localStorage.setItem(storageKey, JSON.stringify(routes)); } catch { /* Preview remains usable without persistence. */ } }, [routes, storageKey]);
  const candidates = orderedRouteModels(strategy);
  const filteredRoutes=routes.filter(route=>route.name.toLowerCase().includes(query.trim().toLowerCase()));
  const current=Math.min(page,Math.max(1,Math.ceil(filteredRoutes.length/size)));
  const visibleRoutes=versionId === "moma_5.11.0_estack" ? filteredRoutes.slice((current-1)*size,current*size) : filteredRoutes;
  const duplicateName = routes.some(route => route.name === name && route.id !== editingId);
  const openForm = route => {
    setEditingId(route?.id ?? null);
    setName(route?.name ?? "");
    setStrategy(route?.strategy ?? "效果优先");
    setModels(route?.models ?? []);
    setAgreed(!!route);
    setCreating(true);
  };
  const closeForm = () => { setCreating(false); setEditingId(null); };
  const submit = () => {
    if (name.length < 2 || name.length > 50 || duplicateName || !models.length || !editingId && !agreed) return;
    if (editingId) setRoutes(routes.map(route => route.id === editingId ? { ...route, name, strategy, models } : route));
    else setRoutes([{ id: `route-${crypto.randomUUID()}`, name, strategy, models, status: "正常", creator: "estack-yy", time: new Date().toLocaleString("sv-SE", { timeZone: "Asia/Shanghai", hour12: false }) }, ...routes]);
    closeForm();
    setName("");
    setModels([]);
    setAgreed(false);
  };
  const curl = apiRoute ? `curl --location '${routeApiUrl}' \\\n  --header 'Authorization: Bearer <API_KEY>' \\\n  --header 'Content-Type: application/json' \\\n  --data '${JSON.stringify({ model: apiRoute.id, messages: [{ role: "user", content: "你好，请介绍一下你自己" }], stream: true })}'` : "";
  const copy = async (value, label) => {
    try { await navigator.clipboard.writeText(value); setCopyNotice(`${label}已复制`); }
    catch { setCopyNotice("复制失败，请手动选择文本复制"); }
  };
  return (
    <div className="route-page">
      <div className="route-head">
        <img src={`${A}routeIcon-23840893.svg`} />
        <div>
          <h1>
            智能路由 <button>帮助中心 ↗</button>
          </h1>
          <p>
            根据输入请求的内容、上下文、性能需求或成本等因素，自动选择最优模型，实现AI资源的高效配置
          </p>
        </div>
        <b>操作引导</b>
      </div>
      <div className="route-guide">
        <b>操作引导</b>
        <div>
          <span>
            <i>1</i>
            <strong>创建智能路由</strong>
            <small>配置路由策略，确认模型备选集</small>
          </span>
          <span>
            <i>2</i>
            <strong>体验智能路由</strong>
            <small>
              可在体验中心直接测试效果，也可通过 API
              集成到您的业务系统中实时调用
            </small>
          </span>
          <span>
            <i>3</i>
            <strong>查看使用成效</strong>
            <small>
              实时追踪调用量等关键数据，了解通过智能路由为您节省的成本
            </small>
          </span>
        </div>
      </div>
      <section className="route-list">
        <div className="route-tools">
          <button className="primary" onClick={() => openForm(null)}>
            ＋ 新建智能路由
          </button>
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
            placeholder="按名称搜索"
          />
        </div>
        <div className="route-table">
          <div className="route-row route-table-head">
            <span>智能路由名称</span>
            <span>路由策略</span>
            <span>状态</span>
            <span>创建者</span>
            <span>创建时间</span>
            <span>操作</span>
          </div>
          {visibleRoutes.map((r) => (
              <div className="route-row" key={r.id}>
                <span>{r.name}</span>
                <span>{r.strategy}</span>
                <span><b className="route-status">{r.status}</b></span>
                <span>{r.creator}</span>
                <span>{r.time}</span>
                <span className="route-row-actions">
                  <button className="link" onClick={() => { setCopyNotice(""); setApiRoute(r); }}>API 调用</button>
                  <button className="link" onClick={() => openForm(r)}>编辑</button>
                  <button className="link" onClick={() => setDeleting(r)}>删除</button>
                </span>
              </div>
            ))}
          {!filteredRoutes.length && (
            <div className="route-no-data">
              {routes.length ? "没有匹配的智能路由" : <>暂无数据，您可以 <button onClick={() => openForm(null)}>立即创建</button></>}
            </div>
          )}
        </div>
        <>{versionId === "moma_5.11.0_estack" ? <FilterPagination total={filteredRoutes.length} page={current} size={size} onPageChange={setPage} onSizeChange={setSize}/> : <footer>共{routes.length}条记录　<select><option>10条/页</option></select>　 1</footer>}</>

      </section>
      {creating && (
        <div className="modal route-modal" onClick={closeForm}>
          <div role="dialog" aria-modal="true" aria-labelledby="smart-route-form-title" onClick={(e) => e.stopPropagation()}>
            <button className="close" aria-label="关闭" onClick={closeForm}>
              ×
            </button>
            <h2 id="smart-route-form-title">{editingId ? "编辑智能路由" : "智能模型路由"}</h2>
            <p>
              根据您的业务目标，自动为您调度最优模型组合，实现效果、成本与效率的完美平衡
            </p>
            <div className="route-alert">
              智能路由API端点的创建需要几分钟，请耐心等待后使用。
            </div>
            <label className="field">
              路由名称
              <input
                value={name}
                onChange={(e) =>
                  setName(e.target.value.replace(/[^\w:.-]/g, ""))
                }
                maxLength={50}
                placeholder="路由名称只能由字母、数字、连字符、下划线、冒号、点组成，长度在2-50之间"
              />
              <small>{name.length}/50</small>
            </label>
            {duplicateName && <p className="route-form-error" role="alert">路由名称已存在</p>}
            <div className="route-form-label">路由策略</div>
            <div className="strategy-options">
              {[
                ["效果优先", "按参数规模由大到小排列"],
                ["成本优先", "优先低成本模型"],
                ["平衡模式", "兼顾参数规模与成本"],
              ].map(([x, d]) => (
                <button
                  className={strategy === x ? "active" : ""}
                  onClick={() => setStrategy(x)}
                  key={x}
                >
                  <b>{x}</b>
                  <small>{d}</small>
                </button>
              ))}
            </div>
            <div className="route-form-label">
              模型备选集{" "}
              <button
                onClick={() =>
                  setModels(
                    models.length === candidates.length ? [] : candidates.map(model => model.name),
                  )
                }
              >
                全部选择
              </button>
            </div>
            <div className="model-options">
              {candidates.map((model, index) => (
                <label key={model.name}>
                  <input
                    type="checkbox"
                    checked={models.includes(model.name)}
                    onChange={() =>
                      setModels(
                        models.includes(model.name)
                          ? models.filter((m) => m !== model.name)
                          : [...models, model.name],
                      )
                    }
                  />
                  <span>
                    <b>{index + 1}. {model.name}</b>
                    <small>总参数 {model.size >= 1000 ? `${model.size / 1000}T` : `${model.size}B`}</small>
                  </span>
                </label>
              ))}
            </div>
            {!editingId && <label className="agreement">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
              />{" "}
              我已阅读并同意 <a>《产品销售协议》</a>、
              <a>《模型服务平台MoMA服务使用声明》</a>
            </label>}
            <div className="modal-actions">
              <button onClick={closeForm}>取消</button>
              <button
                className="primary"
                disabled={name.length < 2 || duplicateName || !models.length || !editingId && !agreed}
                onClick={submit}
              >
                {editingId ? "保存" : "确定"}
              </button>
            </div>
          </div>
        </div>
      )}
      <Dialog open={!!apiRoute} onOpenChange={open => { if (!open) setApiRoute(null); }}>
        <DialogContent className="route-api-dialog sm:max-w-3xl">
          <DialogHeader><DialogTitle>API 调用</DialogTitle><DialogDescription>通过 API Key 调用“{apiRoute?.name}”智能路由。</DialogDescription></DialogHeader>
          <div className="route-api-alert">以下为接入示例；请求地址和权限以实际开通的服务为准。API Key 请妥善保管，避免公开共享。</div>
          <section><h3>1 获取 API Key</h3><p>在 API Key 管理中创建或选择已有密钥。</p><Button variant="outline" onClick={() => { setApiRoute(null); onNavigate("API Key 管理"); }}>前往 API Key 管理</Button></section>
          <section><h3>2 调用智能路由</h3><p>在请求体的 <code>model</code> 字段填写该路由的接入点 ID。</p><div className="route-api-code-head"><span>Curl · 流式请求示例</span><Button variant="ghost" size="sm" onClick={() => copy(curl, "Curl 示例")}><Copy size={15}/>复制</Button></div><pre>{curl}</pre><div className="route-api-value"><span>接入点：<code>{apiRoute?.id}</code></span><Button variant="ghost" size="sm" onClick={() => copy(apiRoute?.id ?? "", "接入点")}>复制</Button></div><div className="route-api-value"><span>示例请求地址：<code>{routeApiUrl}</code></span><Button variant="ghost" size="sm" onClick={() => copy(routeApiUrl, "请求地址")}>复制</Button></div></section>
          <span role="status" className="route-copy-status">{copyNotice}</span>
        </DialogContent>
      </Dialog>
      <Dialog open={!!deleting} onOpenChange={open => { if (!open) setDeleting(null); }}>
        <DialogContent className="route-delete-dialog sm:max-w-md"><DialogHeader><DialogTitle>确认删除该智能路由吗？</DialogTitle><DialogDescription>“{deleting?.name}”删除后不可恢复，请谨慎操作。</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleting(null)}>取消</Button><Button onClick={() => { setRoutes(routes.filter(route => route.id !== deleting?.id)); setDeleting(null); }}>删除</Button></DialogFooter></DialogContent>
      </Dialog>
    </div>
  );
}

function UnifiedApiKeys() {
  return <div className="api-key-unified us-page">
    <div className="us-title"><div><h1>API Key 管理</h1><p>管理不同计费方式下的调用凭证与访问权限</p></div></div>
    <Tabs defaultValue="按量付费">
      <TabsList variant="line" className="us-tabs" aria-label="API Key 计费方式">
        {billingTypes.map(type => <TabsTrigger key={type} value={type}>{type}</TabsTrigger>)}
      </TabsList>
      {billingTypes.map(type => <TabsContent key={type} value={type} forceMount className="api-key-billing-panel"><ApiKeys billing={type} hideHeading /></TabsContent>)}
    </Tabs>
  </div>;
}

function ApiKeys({ billing, hideHeading = false }) {
  const maskKey = (value) =>
    value.length > 12 ? `${value.slice(0, 8)}*****${value.slice(-4)}` : value;
  const initial = apiKeySamples;
  const editModels = [
    ["AITC-MiniMax-M2.5", "文本模型"],
    ["Kimi/Kimi-K3", "多模态模型"],
    ["YKD/minimax-m2.5", "文本模型"],
    ["YKD/deepseek-v3.2", "文本模型"],
    ["ZHIPU/GLM-5.3-Flash", "多模态模型"],
    ["ZHIPU/GLM-5.3", "文本模型"],
    ["MiniMax/MiniMax-M3", "多模态模型"],
    ["Qwen/Qwen3.7-Plus", "多模态模型"],
    ["ZHIPU/GLM-5.2", "文本模型"],
    ["ZHIPU/GLM-5.1", "文本模型"],
    ["DeepSeek/DeepSeek-V4-Pro", "文本模型"],
    ["DeepSeek/DeepSeek-V4-Flash", "文本模型"],
    ["Qwen/Qwen3.8-Max", "多模态模型"],
    ["Qwen/Qwen3.5-397B", "多模态模型"],
    ["Kimi/Kimi-K2.6", "多模态模型"],
    ["BGE/BGE-M3", "向量模型"],
  ];
  const [keys, setKeys] = useState(() => initial.map(key => ({ ...key, models: key.scope === "无限制" ? null : editModels.slice(0, parseInt(key.scope)).map(([model]) => model), ips: key.ip === "办公网段" ? ["192.168.1.0/24"] : key.ip.includes("个 IP") ? Array.from({length: parseInt(key.ip)}, (_, i) => `10.0.1.${100 + i}`) : [], id: `${key.id}-${billingTypes.indexOf(billing)}`, key: `${key.key}-${billingTypes.indexOf(billing)}` }))),
    [query, setQuery] = useState(""),
    [selectedSearchId, setSelectedSearchId] = useState(null),
    [searchOpen, setSearchOpen] = useState(false),
    [activeSuggestion, setActiveSuggestion] = useState(0),
    [panel, setPanel] = useState(null),
    [name, setName] = useState(""),
    [desc, setDesc] = useState(""),
    [ipList, setIpList] = useState(""),
    [quotaEnabled, setQuotaEnabled] = useState(true),
    [quotaType, setQuotaType] = useState("日"),
    [quota, setQuota] = useState("10000"),
    [tpmEnabled, setTpmEnabled] = useState(true),
    [qpmEnabled, setQpmEnabled] = useState(true),
    [modelScope, setModelScope] = useState("限定范围"),
    [selectedModels, setSelectedModels] = useState([]),
    [copied, setCopied] = useState(""),
    [copiedValue, setCopiedValue] = useState(""),
    [action, setAction] = useState(null),
    [formError, setFormError] = useState(""),
    [scopeQuery, setScopeQuery] = useState("");
  useEffect(() => {
    if (!copied && !copiedValue) return;
    const timer = setTimeout(() => { setCopied(""); setCopiedValue(""); }, 2000);
    return () => clearTimeout(timer);
  }, [copied, copiedValue]);
  const openPanel = (kind, key) => {
    setPanel({ kind, key });
    setName(key?.name || "");
    setDesc(key?.desc || "");
    setIpList((key?.ips || []).join("\n"));
    setFormError("");
    setSelectedModels(key?.models || []);
    setQuotaType(kind === "edit" ? "不限额度" : "日");
    setModelScope(key?.models ? "限定范围" : "全选");
  };
  const save = () => {
    if (name.trim().length < 2) return;
    let ips;
    try { ips = parseIpAllowlist(ipList); } catch (error) { setFormError(error.message); return; }
    if (modelScope === "限定范围" && !selectedModels.length) { setFormError("请至少选择一个模型"); return; }
    const access = { ips, models: modelScope === "全选" ? null : selectedModels };
    if (panel.kind === "create")
      setKeys([
        {
          name: name.trim(),
          id: `ak-${Date.now()}`,
          key: `sk-${crypto.randomUUID().replaceAll("-", "")}`,
          ...access,
          created: new Date().toLocaleString("sv-SE"),
          desc,
          enabled: true,
        },
        ...keys,
      ]);
    else
      setKeys(
        keys.map((k) =>
          k === panel.key ? { ...k, name: name.trim(), desc, ...access } : k,
        ),
      );
    setPanel(null);
    setCopied(panel.kind === "create" ? "API Key 已创建" : "API Key 已保存");
  };
  const toggle = (key) =>
    setKeys(keys.map((k) => (k === key ? { ...k, enabled: !k.enabled } : k)));
  const copyText = (value, label) =>
    navigator.clipboard
      .writeText(value)
      .then(() => {
        setCopied(`${label} 已复制到剪贴板`);
        setCopiedValue(value);
      })
      .catch(() => { setCopiedValue(""); setCopied("复制失败，请允许剪贴板访问后重试"); });
  const suggestions = keys.filter((k) => `${k.name} ${k.id}`.toLowerCase().includes(query.trim().toLowerCase()));
  const filteredKeys = selectedSearchId ? keys.filter((k) => k.id === selectedSearchId) : suggestions;
  const chooseSuggestion = (key) => {
    setSelectedSearchId(key.id);
    setQuery(key.name);
    setSearchOpen(false);
  };
  return (
    <div className="api-key-page">
      {!hideHeading && <div className="api-key-heading">
        <h1>API Key 管理</h1>
        <span>{billing}</span>
      </div>}
      <div className="api-key-tools">
        <button className="primary" onClick={() => openPanel("create")}>
          创建 API Key
        </button>
        <div>
          <div className="api-key-search" onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) setSearchOpen(false);
          }}>
            <label>
              <Search size={16} />
              <input
                role="combobox"
                aria-label="搜索 Key 名称或 Track ID"
                aria-autocomplete="list"
                aria-expanded={searchOpen}
                aria-controls={`api-key-suggestions-${billingTypes.indexOf(billing)}`}
                value={query}
                onFocus={() => setSearchOpen(true)}
                onChange={(e) => { setQuery(e.target.value); setSelectedSearchId(null); setActiveSuggestion(0); setSearchOpen(true); }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setSearchOpen(false);
                  if (e.key === "ArrowDown") { e.preventDefault(); setSearchOpen(true); setActiveSuggestion((activeSuggestion + 1) % Math.max(suggestions.length, 1)); }
                  if (e.key === "ArrowUp") { e.preventDefault(); setActiveSuggestion((activeSuggestion - 1 + Math.max(suggestions.length, 1)) % Math.max(suggestions.length, 1)); }
                  if (e.key === "Enter" && searchOpen && suggestions.length) { e.preventDefault(); chooseSuggestion(suggestions[activeSuggestion]); }
                }}
                placeholder="搜索 Key 名称或 Track ID"
              />
            </label>
            {searchOpen && <div className="api-key-search-menu" id={`api-key-suggestions-${billingTypes.indexOf(billing)}`} role="listbox" aria-label="Key 搜索建议">
              <button role="option" aria-selected={!query} onClick={() => { setQuery(""); setSelectedSearchId(null); setSearchOpen(false); }}>全部 Key</button>
              {suggestions.map((key, index) => <button key={key.id} role="option" aria-selected={selectedSearchId === key.id} className={index === activeSuggestion ? "is-active" : ""} onClick={() => chooseSuggestion(key)}><strong>{key.name}</strong><small>{key.id}</small></button>)}
              {!suggestions.length && <p>没有匹配的 Key</p>}
            </div>}
          </div>
          <button aria-label="刷新">
            <RefreshCw size={17} />
          </button>
          <button aria-label="设置">
            <Settings size={17} />
          </button>
        </div>
      </div>
      <div className="api-key-table">
        <div className="api-key-row api-key-head">
          {[
            "Key 名称/Track ID",
            "API Key",
            "状态",
            "访问范围",
            "安全与额度",
            "操作",
          ].map((x) => (
            <span key={x}>{x}</span>
          ))}
        </div>
        {filteredKeys
          .map((k) => (
            <div className="api-key-row" key={k.id}>
              <span className="api-key-identity">
                <b>{k.name}</b>
                <small className="key-id-line">
                  {k.id}
                  <button
                    className="inline-action"
                    aria-label={copiedValue === k.id ? "Track ID 已复制到剪贴板" : "复制 Track ID"}
                    title={copiedValue === k.id ? "已复制到剪贴板" : "复制 Track ID"}
                    onClick={() => copyText(k.id, "Track ID")}
                  >
                    {copiedValue === k.id ? <Check size={14} className="copy-success" /> : <Copy size={14} />}
                  </button>
                </small>
                <small>创建于 {k.created}</small>
              </span>
              <span className="api-key-value">
                {maskKey(k.key)}
                <button
                  className="inline-action"
                  aria-label={copiedValue === k.key ? "API Key 已复制到剪贴板" : "复制 API Key"}
                  title={copiedValue === k.key ? "已复制到剪贴板" : "复制 API Key"}
                  onClick={() => copyText(k.key, "API Key")}
                >
                  {copiedValue === k.key ? <Check size={14} className="copy-success" /> : <Copy size={14} />}
                </button>
              </span>
              <span>
                <button
                  className={`switch ${k.enabled ? "on" : ""}`}
                  aria-label={`${k.enabled ? "停用" : "启用"}${k.name}`}
                  onClick={() => toggle(k)}
                >
                  <i />
                </button>
              </span>
              <span>
                {k.models === null ? <span className="key-unrestricted">无限制</span> : <button className="key-scope-link" onClick={() => { setAction({ kind: "models", key: k }); setScopeQuery(""); }}>{k.models.length} 个模型</button>}
              </span>
              <span className="api-key-security">
                <b>每日 {k.quota || "0 / 10 K"} tokens</b>
                <i className="quota-bar">
                  <i style={{ width: `${k.progress || 0}%` }} />
                </i>
                <small>
                  <button className="key-ip-link" onClick={() => { setAction({ kind: "ip", key: k }); setIpList(k.ips.join("\n")); setFormError(""); }}>IP 白名单：{k.ips.length ? `${k.ips.length} 项` : "不限制"}</button>
                  {k.desc ? ` · ${k.desc}` : ""}
                </small>
              </span>
              <span className="api-key-actions">
                <button onClick={() => openPanel("edit", k)}>编辑</button>
                <button onClick={() => setAction({ kind: "reset", key: k })}>重置</button>
                <button className="danger-link" onClick={() => setAction({ kind: "delete", key: k })}>删除</button>
              </span>
            </div>
          ))}
      </div>
      {copied && (
        <div className="copy-toast" role="status">
          {copied}
        </div>
      )}
      <Dialog open={Boolean(action)} onOpenChange={open => { if (!open) setAction(null); }}>
        <DialogContent className="key-action-dialog sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{action?.kind === "models" ? "可访问模型" : action?.kind === "ip" ? "IP 白名单" : action?.kind === "reset" ? "重置 API Key" : "删除 API Key"}</DialogTitle>
            <DialogDescription>{action?.key.name} · {action?.kind === "models" ? "查看此 Key 允许访问的模型" : action?.kind === "ip" ? "仅允许白名单来源调用；留空表示不限制。原型配置不拦截真实请求。" : action?.kind === "reset" ? "重置后旧密钥立即失效，请及时替换业务系统中的密钥。Key ID、额度和访问权限保持不变。" : "删除后该 Key 将无法继续调用，且不可恢复。"}</DialogDescription>
          </DialogHeader>
          {action?.kind === "models" && <><input aria-label="搜索可访问模型" className="key-dialog-input" placeholder="搜索模型名称" value={scopeQuery} onChange={e => setScopeQuery(e.target.value)} /><div className="key-model-list">{(action.key.models === null ? editModels.map(([model]) => model) : action.key.models).filter(model => model.toLowerCase().includes(scopeQuery.toLowerCase())).map(model => <div key={model}>{model}</div>)}{!(action.key.models === null ? editModels.map(([model]) => model) : action.key.models).some(model => model.toLowerCase().includes(scopeQuery.toLowerCase())) && <div>没有匹配的模型</div>}</div><small>{action.key.models === null ? "可访问全部模型，包含后续新增模型；此处展示原型模型目录。" : `共 ${action.key.models.length} 个模型`}</small></>}
          {action?.kind === "ip" && <label className="key-ip-field">IPv4 地址 / CIDR 网段<textarea aria-label="IP 白名单" rows={5} value={ipList} onChange={e => { setIpList(e.target.value); setFormError(""); }} placeholder={"例如：10.0.1.100\n192.168.1.0/24"}/><small>多个地址用逗号或换行分隔，重复项自动合并。</small>{formError && <span role="alert" className="key-error">{formError}</span>}</label>}
          <DialogFooter><Button variant="outline" onClick={() => setAction(null)}>{action?.kind === "models" ? "关闭" : "取消"}</Button>{action?.kind !== "models" && <Button variant={action?.kind === "delete" ? "destructive" : "default"} onClick={() => {
            const target = action.key.id;
            if (action.kind === "ip") { let ips; try { ips = parseIpAllowlist(ipList); } catch (error) { setFormError(error.message); return; } setKeys(keys.map(key => key.id === target ? { ...key, ips } : key)); setCopied("IP 白名单已保存"); }
            else if (action.kind === "reset") { setKeys(keys.map(key => key.id === target ? { ...key, key: 'sk-' + crypto.randomUUID().replaceAll('-', '') } : key)); setCopied("API Key 已重置，请复制新密钥并更新调用配置"); }
            else { setKeys(keys.filter(key => key.id !== target)); setCopied("API Key 已删除"); }
            setAction(null);
          }}>{action?.kind === "ip" ? "保存" : action?.kind === "reset" ? "确认重置" : "确认删除"}</Button>}</DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="api-key-footer">
        <span>共 {filteredKeys.length} 条</span>
        <span>
          10 条 / 页　 <button disabled>‹</button>
          <b>1</b>
          <button disabled>›</button>
        </span>
      </div>
      {panel && (
        <div className="drawer-backdrop" onClick={() => setPanel(null)}>
          <aside
            className={`api-key-drawer ${panel.kind === "edit" ? "edit-drawer" : ""}`}
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <h2>{panel.kind === "edit" ? "编辑" : "创建"} API Key</h2>
              <button aria-label="关闭" onClick={() => setPanel(null)}>
                ×
              </button>
            </header>
            <div className="drawer-form">
              {panel.kind === "edit" ? (
                <>
                  <section className="edit-section">
                    <h3>基本信息</h3>
                    <label>
                      <span>
                        <i>*</i> Key 名称
                      </span>
                      <div>
                        <input
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="请输入 Key 名称"
                        />
                        <small>
                          长度为3–24个字符，支持中文、英文、数字、下划线和中划线字符
                        </small>
                      </div>
                    </label>
                    <label>
                      <span>描述</span>
                      <textarea
                        maxLength="200"
                        value={desc}
                        onChange={(e) => setDesc(e.target.value)}
                        placeholder="请输入描述"
                      />
                    </label>
                  </section>
                  <section className="edit-section">
                    <h3>
                      额度限制{" "}
                      <small>
                        API key限额仅对域名为 https://moma.cmecloud.cn
                        且消耗tokens的按量计费文本模型生效。
                      </small>
                    </h3>
                    <label>
                      <span>Tokens限额策略</span>
                      <div>
                        <div className="radio-row">
                          {["不限额度", "日", "月", "总额度"].map((x) => (
                            <button
                              className={quotaType === x ? "active" : ""}
                              onClick={() => setQuotaType(x)}
                              key={x}
                            >
                              <i />
                              {x}
                            </button>
                          ))}
                        </div>
                        <small className="quota-help">
                          {quotaType === "日" ? (
                            "按自然日统计，每日 00:00 重置用量重新累积，后续编辑更换限额策略时，历史用量会清空，用量重新统计"
                          ) : quotaType === "月" ? (
                            <>
                              1、按自然月统计，每月1日00:00重置用量重新累积，后续编辑更换限额策略时，历史用量会清空，用量重新统计；
                              <br />
                              2、按所选生效日统计，周期结束自动重置。默认每月1日至月末。
                            </>
                          ) : quotaType === "总额度" ? (
                            "开启后持续累积用量，不自动重置，后续编辑更换限额策略时，历史用量会清空，用量重新统计"
                          ) : (
                            "后续编辑更换限额策略时，历史用量会清空，用量重新统计"
                          )}
                        </small>
                      </div>
                    </label>
                    {quotaType !== "不限额度" && (
                      <div className="token-quota-panel">
                        <div className="token-quota-notice">
                          <Info size={15} />
                          切换限额策略或修改月度生效日后，历史用量将清零，并按新规则重新累积。
                        </div>
                        {quotaType !== "总额度" && (
                          <label>
                            <span>生效范围</span>
                            {quotaType === "月" ? (
                              <div className="month-range">
                                <select>
                                  <option>每月</option>
                                </select>
                                <select>
                                  <option>1日</option>
                                </select>
                                <input value="00:00:00" readOnly />
                                <b>至</b>
                                <input value="每月30/31日 23:59:00" readOnly />
                                <small>自动续配</small>
                                <button
                                  className="switch"
                                  aria-label="自动续配"
                                >
                                  <i />
                                </button>
                              </div>
                            ) : (
                              <input value="00:00:00 ~ 23:59:59" readOnly />
                            )}
                          </label>
                        )}
                        <label>
                          <span>额度上限</span>
                          <div className="quota-input">
                            <input
                              value={quota}
                              placeholder="请输入限额"
                              onChange={(e) =>
                                setQuota(e.target.value.replace(/\D/g, ""))
                              }
                            />
                            <b>Tokens</b>
                          </div>
                        </label>
                      </div>
                    )}
                    {quotaType !== "不限额度" && (
                      <>
                        <label>
                          <span>TPM 限制</span>
                          <div className="rate-limit">
                            <button
                              className={`switch ${tpmEnabled ? "on" : ""}`}
                              onClick={() => setTpmEnabled(!tpmEnabled)}
                            >
                              <i />
                            </button>
                            <small>
                              当实时TPM达到设定阈值时，将触发限流策略
                            </small>
                            <input
                              disabled={!tpmEnabled}
                              defaultValue="100000"
                            />
                          </div>
                        </label>
                        <label>
                          <span>QPM 限制</span>
                          <div className="rate-limit">
                            <button
                              className={`switch ${qpmEnabled ? "on" : ""}`}
                              onClick={() => setQpmEnabled(!qpmEnabled)}
                            >
                              <i />
                            </button>
                            <small>
                              当实时QPM达到设定阈值时，将触发限流策略
                            </small>
                            <input disabled={!qpmEnabled} defaultValue="1000" />
                          </div>
                        </label>
                      </>
                    )}
                  </section>
                  <section className="edit-section"><h3>IP 白名单</h3><label><span>允许的来源</span><div><textarea aria-label="编辑 IP 白名单" value={ipList} onChange={e => setIpList(e.target.value)} placeholder="IPv4 或 CIDR 网段，用逗号或换行分隔；留空不限制"/><small>原型配置，不拦截真实请求。</small></div></label></section>
                  <section className="edit-section access-edit">
                    <h3>可访问范围</h3>
                    <label>
                      <span>模型限制</span>
                      <div className="radio-row">
                        {["全选", "限定范围"].map((x) => (
                          <button
                            className={modelScope === x ? "active" : ""}
                            onClick={() => setModelScope(x)}
                            key={x}
                          >
                            <i />
                            {x}
                          </button>
                        ))}
                      </div>
                    </label>
                    {modelScope === "限定范围" && (
                      <>
                        <div className="model-filter-row">
                          <select>
                            <option>全部模型系列</option>
                          </select>
                          <select>
                            <option>全部模型类别</option>
                          </select>
                          <select>
                            <option>全部模型服务商</option>
                          </select>
                          <label>
                            <input placeholder="按规格名称搜索" />
                            <Search size={16} />
                          </label>
                          <label className="hide-models">
                            <input type="checkbox" /> 隐藏不可选模型
                          </label>
                        </div>
                        <div className="scope-table">
                          <div className="scope-row scope-head">
                            <span>
                              <input type="checkbox" />
                            </span>
                            <b>模型名称</b>
                            <b>订购状态</b>
                            <b>模型类别</b>
                          </div>
                          {editModels.map(([model, type]) => (
                            <div className="scope-row" key={model}>
                              <span>
                                <input
                                  type="checkbox"
                                  checked={selectedModels.includes(model)}
                                  onChange={() =>
                                    setSelectedModels(
                                      selectedModels.includes(model)
                                        ? selectedModels.filter(
                                            (x) => x !== model,
                                          )
                                        : [...selectedModels, model],
                                    )
                                  }
                                />
                              </span>
                              <span>{model}</span>
                              <span>
                                <em>未开通</em>
                                <button>去开通 →</button>
                              </span>
                              <span>{type}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </section>
                </>
              ) : (
                <>
                  <label>
                    <span>Key 名称</span>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="请输入 Key 名称"
                    />
                  </label>
                  <label>
                    <span>说明（选填）</span>
                    <textarea
                      value={desc}
                      onChange={(e) => setDesc(e.target.value)}
                      placeholder="用于区分 Key 的用法"
                    />
                  </label>
                  <label>
                    <span>IP 白名单（选填）</span>
                    <textarea
                      value={ipList}
                      onChange={(e) => setIpList(e.target.value)}
                      placeholder={
                        "多个 IP 用逗号或换行分隔，例如：\n10.0.1.100, 10.0.1.101"
                      }
                    />
                  </label>
                  <div className="quota-label">
                    <span>额度限制</span>
                    <button
                      className={`switch ${quotaEnabled ? "on" : ""}`}
                      aria-label="额度限制"
                      onClick={() => setQuotaEnabled(!quotaEnabled)}
                    >
                      <i />
                    </button>
                    <small>
                      开启后，该 API Key 的 token 用量达到配额上限将停止服务。
                    </small>
                  </div>
                  {quotaEnabled && (
                    <section className="quota-settings">
                      <div className="quota-warning">
                        切换限额策略或修改生效日后，历史用量将清零，并按新规则重新累积。
                      </div>
                      <label>
                        <span>限额策略</span>
                        <div className="radio-row">
                          {["日", "月", "总额度"].map((x) => (
                            <button
                              className={quotaType === x ? "active" : ""}
                              onClick={() => setQuotaType(x)}
                              key={x}
                            >
                              <i />
                              {x}
                            </button>
                          ))}
                        </div>
                      </label>
                      <label>
                        <span>生效范围</span>
                        <input disabled value="00:00:00 ~ 23:59:59" readOnly />
                      </label>
                      <label>
                        <span>额度上限</span>
                        <div className="quota-input">
                          <input
                            value={quota}
                            onChange={(e) =>
                              setQuota(e.target.value.replace(/\D/g, ""))
                            }
                          />
                          <b>tokens</b>
                        </div>
                      </label>
                    </section>
                  )}
                  <div className="access-scope">
                    <span>可访问范围</span>
                    <label>
                      <input type="radio" checked={modelScope === "全选"} onChange={() => setModelScope("全选")} name="scope" /> 全选{" "}
                      <small>（可访问所有模型和推理服务）</small>
                    </label>
                    <label>
                      <input type="radio" checked={modelScope === "限定范围"} onChange={() => setModelScope("限定范围")} name="scope" /> 限定范围{" "}
                      <small>
                        （包含模型对应的默认和自定义推理服务接入点）
                      </small>
                    </label>
                  </div>
                  {modelScope === "限定范围" && <div className="key-model-list">{editModels.map(([model]) => <label key={model}><input type="checkbox" checked={selectedModels.includes(model)} onChange={e => setSelectedModels(e.target.checked ? [...selectedModels, model] : selectedModels.filter(value => value !== model))}/>{model}</label>)}</div>}
                </>
              )}
            </div>
            {formError && <p role="alert" className="key-error">{formError}</p>}
            <footer>
              <span>
                已选范围　<small>{modelScope === "全选" ? "全部模型和服务" : `${selectedModels.length} 个模型`}</small>
              </span>
              <div>
                <button onClick={() => setPanel(null)}>取消</button>
                <button
                  className="primary"
                  disabled={name.trim().length < 2}
                  onClick={save}
                >
                  确定
                </button>
              </div>
            </footer>
          </aside>
        </div>
      )}
    </div>
  );
}

const rankingModels = [
  "DeepSeek-V4-Flash",
  "Qwen3.7-Max",
  "Qwen3.8-Max",
  "GLM-5.2",
  "Kimi-K3",
  "MiniMax-M3",
  "Qwen3.5-4B",
  "GLM-5.2",
  "Qwen3-32B",
  "DeepSeek-V4-Pro",
];
const rankingSeries = [
  { name: "DeepSeek-V4-Flash", color: "#f45bad", share: 44 },
  { name: "Qwen3.7-Max", color: "#0f8be8", share: 15 },
  { name: "Qwen3.8-Max", color: "#15bfa8", share: 13 },
  { name: "GLM-5.2", color: "#91cd2b", share: 11 },
  { name: "Kimi-K3", color: "#ffb829", share: 9 },
  { name: "MiniMax-M3", color: "#a256ca", share: 8 },
];
function ModelRanking() {
  const [metric, setMetric] = useState("模型调用量"),
    [scale, setScale] = useState("log"),
    [range, setRange] = useState(7),
    [hotRange, setHotRange] = useState(7),
    [hidden, setHidden] = useState([]),
    [hovered, setHovered] = useState(null);
  const values = [175200, 14800, 10900, 4200, 3400, 2500, 2200, 1800, 692, 0]
    .map(value => `${new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(Math.round(value * (hotRange === 7 ? 1 : 4.1)))} Tokens`);
  const today = shanghaiDate(new Date());
  const todayStart = Date.parse(`${today}T00:00:00+08:00`);
  const start = todayStart - (range - 1) * 86400000;
  const days = Array.from({ length: Math.floor((todayStart - start) / 86400000) + 1 }, (_, i) => {
    const dayStart = start + i * 86400000;
    const day = new Date(dayStart + 8 * 3600000).toISOString().slice(0, 10);
    const daysAgo = (todayStart - dayStart) / 86400000;
    return [day.slice(5).replace(/^0/, '').replace('-', '/'), Math.round(66 - daysAgo * 1.1 + Math.sin(dayStart / 86400000 * .85) * 6), day];
  });
  return (
    <div className="ranking-page">
      <div className="ranking-hero">
        <h1>模型排行榜</h1>
        <p>从调用趋势、性能与稳定性，多维了解模型表现</p>
      </div>
      <div className="metric-tabs">
        {["模型调用量", "模型性能", "模型稳定性"].map((x) => (
          <button
            className={metric === x ? "active" : ""}
            onClick={() => setMetric(x)}
            key={x}
          >
            {x}
          </button>
        ))}
      </div>
      <section className="rank-panel trend-panel">
        <div className="panel-title">
          <div>
            <h2>
              {metric === "模型调用量"
                ? "Token 调用趋势"
                : metric === "模型性能"
                  ? "模型性能趋势"
                  : "模型稳定性趋势"}
            </h2>
            <p>按北京时间逐日展示，本日截至当前</p>
          </div>
          <div className="chart-tools">
            <select
              aria-label="时间范围"
              value={range}
              onChange={(e) => setRange(Number(e.target.value))}
            >
              <option value={7}>近 7 日</option>
              <option value={30}>近 30 日</option>
            </select>
            <div className="scale-switch" aria-label="坐标刻度">
              {[
                ["linear", "线性"],
                ["log", "对数"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  className={scale === value ? "active" : ""}
                  onClick={() => setScale(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div
          className={`stacked-chart ${scale}`}
          onMouseLeave={() => setHovered(null)}
        >
          <div className="chart-axis">
            {(scale === "log"
              ? ["100M", "10M", "1M"]
              : ["120M", "60M", "0"]
            ).map((x) => (
              <span key={x}>{x}</span>
            ))}
          </div>
          <div className="chart-grid-lines" />
          <div className="chart-bars">
            {days.map(([label, total], i) => (
              <div className="chart-column" key={label}>
                <div
                  className="stacked-bar"
                  tabIndex="0"
                  onMouseEnter={() => setHovered(i)}
                  onFocus={() => setHovered(i)}
                  style={{
                    height: `${scale === "log" ? 48 + (Math.log10(total) - 1.5) * 78 : total / 1.18}%`,
                  }}
                  aria-label={`${label}，${total}M Tokens`}
                >
                  {rankingSeries.map((series, j) =>
                    hidden.includes(series.name) ? null : (
                      <i
                        key={series.name}
                        style={{
                          height: `${series.share + (((i + j) % 3) - 1) * 2}%`,
                          background: series.color,
                        }}
                      />
                    ),
                  )}
                </div>
                <small>
                  {i === 0 || i === days.length - 1 || i % 4 === 0
                    ? label
                    : ""}
                </small>
              </div>
            ))}
          </div>
          {hovered !== null && (
            <div
              className="chart-tooltip"
              style={{
                "--tip-x": `${((hovered + 0.5) / days.length) * 100}%`,
              }}
            >
              <b>
                {days[hovered][2].slice(0, 4)} 年 {Number(days[hovered][2].slice(5, 7))} 月{" "}
                {Number(days[hovered][2].slice(8, 10))} 日
              </b>
              {rankingSeries
                .filter((x) => !hidden.includes(x.name))
                .map((series) => (
                  <span key={series.name}>
                    <i style={{ background: series.color }} />
                    {series.name}
                    <strong>
                      {((days[hovered][1] * series.share) / 100).toFixed(1)}M
                    </strong>
                  </span>
                ))}
              <em>
                合计 <strong>{days[hovered][1]}M Tokens</strong>
              </em>
            </div>
          )}
        </div>
        <div className="chart-legend">
          {rankingSeries.map((series) => (
            <button
              key={series.name}
              className={hidden.includes(series.name) ? "muted" : ""}
              onClick={() =>
                setHidden(
                  hidden.includes(series.name)
                    ? hidden.filter((x) => x !== series.name)
                    : [...hidden, series.name],
                )
              }
            >
              <i style={{ background: series.color }} />
              {series.name}
            </button>
          ))}
        </div>
      </section>
      <section className="rank-panel">
        <div className="panel-title">
          <div>
            <h2>热门模型</h2>
            <p>按 Token 调用量查看模型市场热度</p>
          </div>
          <select aria-label="热门模型时间范围" value={hotRange} onChange={e => setHotRange(Number(e.target.value))}>
            <option value={7}>近 7 日</option>
            <option value={30}>近 30 日</option>
          </select>
        </div>
        <div className="rank-list">
          {rankingModels.map((name, i) => (
            <button key={`${name}-${i}`}>
              <b>{i + 1}</b>
              <img src={`${A}model-${[1, 4, 4, 3, 2, 5, 4, 3, 4, 1][i]}.jpg`} />
              <span>
                {name}
                <small>
                  by{" "}
                  {i === 0 || i === 6 || i === 7 || i === 8
                    ? "移动云-震泽"
                    : i === 9
                      ? "电信"
                      : "移动云-MoMA"}
                </small>
              </span>
              <strong>{values[i]}</strong>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function ModelOrderList({
  standalone = false,
  versionId = "moma_5.10.2_estack",
  historical = true,
}) {
  const initialModel = standalone
    ? new URLSearchParams(location.search).get("model")
    : "";
  const [tab, setTab] = useState("按Token用量计费"),
    [query, setQuery] = useState(""),
    [ordering, setOrdering] = useState(standalone),
    [selectedOrders, setSelectedOrders] = useState(
      initialModel ? [initialModel] : [],
    ),
    [hideOrdered, setHideOrdered] = useState(false),
    [series, setSeries] = useState("全部模型系列"),
    [modelType, setModelType] = useState("全部模型类别"),
    [provider, setProvider] = useState("全部模型服务商"),
    [agreed, setAgreed] = useState(false),
    [confirming, setConfirming] = useState(false),
    [ordered, setOrdered] = useState(false),
    [detail, setDetail] = useState(null), [page, setPage] = useState(1), [size, setSize] = useState(10);
  const allRows = [
    [
      "AICC-doubao-seedance-2.0",
      "合营",
      "视觉模型",
      "火山引擎",
      "共 4 个资费场景",
      "56 ~ 102 元/百万tokens",
      "未订购",
      "—",
      "—",
    ],
    [
      "AITC-DeepSeek-V4-flash",
      "自营",
      "文本模型",
      "移动云",
      "AITC-DeepSeek-V4-flash-输入\nAITC-DeepSeek-V4-flash-输出",
      "2 元/百万tokens\n4 元/百万tokens",
      "使用中",
      "2026-09-14 21:21:42",
      "362天后到期\n2027-09-14 21:21:42",
    ],
    [
      "CosyVoice",
      "自营",
      "语音模型",
      "移动云",
      "处理字符数资费",
      "2 元/万字符",
      "使用中",
      "2026-09-14 21:21:47",
      "362天后到期\n2027-09-14 21:21:47",
    ],
    [
      "DeepSeek-R1,DeepSeek-R1-0528",
      "自营",
      "文本模型",
      "移动云",
      "输入tokens\n输出tokens",
      "4 元/百万tokens\n16 元/百万tokens",
      "使用中",
      "2026-09-14 21:21:36",
      "362天后到期\n2027-09-14 21:21:36",
    ],
    [
      "DeepSeek-R1-Distill-Llama-70B",
      "自营",
      "文本模型",
      "移动云",
      "输入/输出tokens",
      "4.13 元/百万tokens",
      "使用中",
      "2026-09-14 21:21:39",
      "362天后到期\n2027-09-14 21:21:39",
    ],
    [
      "DeepSeek-R1-Distill-Llama-8B",
      "自营",
      "文本模型",
      "移动云",
      "输入/输出tokens",
      "0.42 元/百万tokens",
      "使用中",
      "2026-09-14 21:21:31",
      "362天后到期\n2027-09-14 21:21:31",
    ],
    [
      "DeepSeek-R1-Distill-Qwen-14B",
      "自营",
      "文本模型",
      "移动云",
      "输入/输出tokens",
      "0.7 元/百万tokens",
      "使用中",
      "2026-09-14 21:21:35",
      "362天后到期\n2027-09-14 21:21:35",
    ],
    [
      "DeepSeek-R1-Distill-Qwen-32B",
      "自营",
      "文本模型",
      "移动云",
      "输入/输出tokens",
      "1.26 元/百万tokens",
      "使用中",
      "2026-09-14 21:21:34",
      "362天后到期\n2027-09-14 21:21:34",
    ],
    [
      "DeepSeek-V2-Lite-Chat",
      "自营",
      "文本模型",
      "移动云",
      "输入/输出tokens",
      "1.33 元/百万tokens",
      "使用中",
      "2026-09-14 21:21:35",
      "362天后到期\n2027-09-14 21:21:35",
    ],
    [
      "DeepSeek-V3.2,DeepSeek-V3,DeepSeek-V3.1",
      "自营",
      "文本模型",
      "移动云",
      "输入tokens\n输出tokens",
      "2 元/百万tokens\n8 元/百万tokens",
      "使用中",
      "2026-09-14 21:21:33",
      "362天后到期\n2027-09-14 21:21:33",
    ],
    [
      "deepseek-v3.2",
      "合营",
      "文本模型",
      "优刻得科技股份有限公司",
      "DeepSeek-V3.2-输入\nDeepSeek-V3.2-输出\nDeepSeek-V3.2-缓存",
      "2 元/百万tokens\n3 元/百万tokens\n0.4 元/百万tokens",
      "未订购",
      "—",
      "—",
    ],
    [
      "GLM-5.1",
      "合营",
      "文本模型",
      "智谱 AI",
      "共 6 个资费场景",
      "1.3 ~ 28 元/百万tokens",
      "未订购",
      "—",
      "—",
    ],
    [
      "GLM-5.3-Flash",
      "合营",
      "多模态模型",
      "智谱 AI",
      "共 3 个资费场景",
      "0.23 ~ 2.8 元/百万tokens",
      "未订购",
      "—",
      "—",
    ],
    [
      "Kimi-K2.6",
      "合营",
      "多模态模型",
      "月之暗面",
      "共 3 个资费场景",
      "1.1 ~ 27 元/百万tokens",
      "未订购",
      "—",
      "—",
    ],
  ];
  const subscriptions = {
    "按资源包计费": [["通用模型资源包", "自营", "资源包", "移动云", "1000 万 Token", "¥100 / 包", "已订购", "2026-09-15", "2027-09-15"]],
    "Token Plan订阅": [["办公团队套餐", "自营", "Token Plan", "移动云", "月度额度", "¥99 / 月", "已订购", "2026-09-15", "2026-10-15"], ["研发团队套餐", "自营", "Token Plan", "移动云", "月度额度", "¥199 / 月", "已订购", "2026-09-20", "2026-10-20"]],
    "Coding Plan订阅": [["研发助手 Coding Plan", "自营", "Coding Plan", "移动云", "月度编程套餐", "¥199 / 月", "已订购", "2026-09-15", "2026-10-15"]],
  };
  const rows = (historical || tab === "按Token用量计费" ? allRows : subscriptions[tab] || []).filter(row => row[0].toLowerCase().includes(query.trim().toLowerCase()));
  const current = Math.min(page, Math.max(1, Math.ceil(rows.length / size)));
  const visibleRows = historical ? rows : rows.slice((current - 1) * size, current * size);
  const changeTab = value => { setTab(value); setQuery(""); setPage(1); };
  const openOrder = (name) =>
    window.open(
      `/${versionId}/order/serviceOrder?serviceType=presetModelService${name ? `&model=${encodeURIComponent(name)}` : ""}`,
      "_blank",
      "noopener",
    );
  const closeOrder = () => (standalone ? window.close() : setOrdering(false));
  const toggleOrder = (name) =>
    setSelectedOrders((current) =>
      current.includes(name)
        ? current.filter((x) => x !== name)
        : [...current, name],
    );
  if (ordering) {
    const orderRows = allRows.filter(
      (row) =>
        (!hideOrdered || row[6] === "未订购") &&
        row[0].toLowerCase().includes(query.toLowerCase()) &&
        (series === "全部模型系列" ||
          row[0].toLowerCase().startsWith(series.toLowerCase())) &&
        (modelType === "全部模型类别" || row[2] === modelType) &&
        (provider === "全部模型服务商" || row[3] === provider),
    );
    const availableNames = orderRows
      .filter((row) => row[6] === "未订购")
      .map((row) => row[0]);
    const allAvailableSelected =
      availableNames.length > 0 &&
      availableNames.every((name) => selectedOrders.includes(name));
    const feeLabel =
      tab === "按Token用量计费"
        ? "按实际使用量收费"
        : tab === "按资源包计费"
          ? "按资源包额度抵扣"
          : "按套餐额度抵扣";
    const resetSelection = (nextTab) => {
      setTab(nextTab);
      setSelectedOrders([]);
      setAgreed(false);
    };
    return (
      <div className="legacy-page legacy-service-order">
        <div className="service-order-title">
          <button onClick={closeOrder}>‹ 返回</button>
          <h1>【订购】模型服务平台MoMA</h1>
          <span>产品介绍　|　帮助文档　|　产品控制台</span>
        </div>
        <section className="service-order-panel">
          <div className="billing-choice">
            <strong>
              计费方式<small>模型计费说明</small>
            </strong>
            {(historical
              ? [
                  ["按Token用量计费", "按实际使用量Token收费"],
                  ["Token Plan订阅", "个人和团队的AI服务套餐"],
                ]
              : [
                  ["按Token用量计费", "按实际使用量Token收费"],
                  ["按资源包计费", "有效期内包含一定数量的额度"],
                  ["Token Plan订阅", "个人和团队的AI服务套餐"],
                  ["Coding Plan订阅", "AI编程订阅套餐"],
                ]
            ).map(([x, description]) => (
              <button
                className={tab === x ? "active" : ""}
                onClick={() => resetSelection(x)}
                key={x}
              >
                <b>{x}</b>
                <small>{description}</small>
              </button>
            ))}
          </div>
          <p className="rate-tip">
            限流说明：高峰期可能会出现调用错误提示，建议错峰使用
          </p>
          <div className="service-filter">
            <strong>
              <i>*</i> 资源规格
            </strong>
            <select value={series} onChange={(e) => setSeries(e.target.value)}>
              <option>全部模型系列</option>
              <option>DeepSeek</option>
              <option>GLM</option>
              <option>Kimi</option>
              <option>AICC</option>
            </select>
            <select
              value={modelType}
              onChange={(e) => setModelType(e.target.value)}
            >
              <option>全部模型类别</option>
              <option>文本模型</option>
              <option>多模态模型</option>
              <option>视觉模型</option>
              <option>语音模型</option>
            </select>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
            >
              <option>全部模型服务商</option>
              <option>移动云</option>
              <option>火山引擎</option>
              <option>智谱 AI</option>
              <option>月之暗面</option>
              <option>优刻得科技股份有限公司</option>
            </select>
            <label>
              <input
                value={query}
                onChange={(e) => { setQuery(e.target.value); setPage(1); }}
                placeholder="按模型名称搜索"
              />
              <Search size={15} />
            </label>
            <label className="hide-ordered">
              <input
                type="checkbox"
                checked={hideOrdered}
                onChange={(e) => setHideOrdered(e.target.checked)}
              />{" "}
              隐藏已订购规格
            </label>
          </div>
          <div className="service-order-table">
            <div className="service-order-row head">
              {[
                "",
                "模型名称",
                "模型服务商",
                "模型类别",
                "状态",
                "资费场景",
                "参考价格",
              ].map((x, i) => (
                <span key={i}>
                  {i === 0 ? (
                    <input
                      aria-label="全选可订购规格"
                      type="checkbox"
                      disabled={!availableNames.length}
                      checked={allAvailableSelected}
                      onChange={() =>
                        setSelectedOrders(
                          allAvailableSelected
                            ? selectedOrders.filter(
                                (name) => !availableNames.includes(name),
                              )
                            : [
                                ...new Set([
                                  ...selectedOrders,
                                  ...availableNames,
                                ]),
                              ],
                        )
                      }
                    />
                  ) : (
                    x
                  )}
                </span>
              ))}
            </div>
            {orderRows.map((row) => {
              const available = row[6] === "未订购";
              return (
                <div className="service-order-row" key={row[0]}>
                  <span>
                    <input
                      type="checkbox"
                      disabled={!available}
                      checked={selectedOrders.includes(row[0])}
                      onChange={() => toggleOrder(row[0])}
                    />
                  </span>
                  <span>
                    <b>{row[0]}</b>
                    <em>{row[1]}</em>
                  </span>
                  <span>{row[3]}</span>
                  <span>{row[2]}</span>
                  <span>
                    <small className={available ? "available" : "subscribed"}>
                      {available ? "可订购" : "已订购"}
                    </small>
                  </span>
                  <span>
                    {row[4].split("\n").map((x) => (
                      <small key={x}>{x}</small>
                    ))}
                    {row[4].startsWith("共 ") && (
                      <button
                        className="scenario-detail"
                        onClick={() =>
                          setDetail({
                            title: `${row[0]} 资费场景`,
                            content: `${row[4]}，参考价格 ${row[5]}`,
                          })
                        }
                      >
                        查看详情
                      </button>
                    )}
                  </span>
                  <span className="price">
                    {row[5].split("\n").map((x) => (
                      <small key={x}>{x}</small>
                    ))}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="selected-count">
            当前已选中 <b>{selectedOrders.length}</b> 个规格
          </div>
        </section>
        <section className="order-meta">
          <strong>预计到期时间</strong>
          <span>2027-09-17 23:59:59</span>
          <p>
            <Info size={14} /> 默认 1
            年后到期自动退订，订购成功后可在控制台按需延长到期时间
          </p>
          <strong>
            <i>*</i> 服务协议
          </strong>
          <label>
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
            />{" "}
            我已阅读并同意
          </label>
          <div className="agreements">
            {[
              "移动云产品销售协议",
              "智算平台使用声明",
              "模型服务平台MoMA服务使用声明",
              "模型服务平台MoMA服务等级协议",
            ].map((title) => (
              <button
                key={title}
                onClick={() =>
                  setDetail({
                    title,
                    content:
                      "本原型展示协议阅读交互；正式条款以移动云官网发布内容为准。",
                  })
                }
              >
                《{title}》
              </button>
            ))}
          </div>
        </section>
        <footer className="service-order-footer">
          <div>
            配置费用：<b>{feeLabel}</b>
            <small>参考价格，具体扣费请以账单为准</small>
            <button
              className="billing-detail"
              onClick={() =>
                setDetail({
                  title: "计费详情",
                  content:
                    tab === "按Token用量计费"
                      ? "按照模型实际 Token 使用量和对应目录价计费。"
                      : tab === "按资源包计费"
                        ? "优先抵扣已购资源包额度，额度不足时按产品规则处理。"
                        : tab === "Token Plan订阅"
                          ? "优先使用 Token Plan 套餐额度，超出部分按产品规则计费。"
                          : "使用 Coding Plan 套餐额度抵扣 AI 编程模型用量。",
                })
              }
            >
              了解计费详情
            </button>
          </div>
          <button
            disabled={!selectedOrders.length || !agreed}
            onClick={() => setConfirming(true)}
          >
            确认订单
          </button>
        </footer>
        {confirming && (
          <div
            className="order-confirm-backdrop"
            onClick={() => setConfirming(false)}
          >
            <div onClick={(e) => e.stopPropagation()}>
              <button className="close" onClick={() => setConfirming(false)}>
                ×
              </button>
              {ordered ? (
                <div className="order-success">
                  <Check size={32} />
                  <h2>订购申请已提交</h2>
                  <p>所选模型规格将进入开通流程。</p>
                  <button
                    onClick={() => {
                      setConfirming(false);
                      closeOrder();
                    }}
                  >
                    返回订购管理
                  </button>
                </div>
              ) : (
                <>
                  <h2>确认订单</h2>
                  <p>请确认以下模型规格及计费方式。</p>
                  <dl>
                    <dt>计费方式</dt>
                    <dd>{tab}</dd>
                    <dt>订购规格</dt>
                    <dd>{selectedOrders.join("、")}</dd>
                    <dt>配置费用</dt>
                    <dd>{feeLabel}</dd>
                  </dl>
                  <div className="confirm-actions">
                    <button onClick={() => setConfirming(false)}>取消</button>
                    <button
                      className="primary"
                      onClick={() => setOrdered(true)}
                    >
                      确认订购
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
        {detail && (
          <div
            className="order-confirm-backdrop"
            onClick={() => setDetail(null)}
          >
            <div onClick={(e) => e.stopPropagation()}>
              <button className="close" onClick={() => setDetail(null)}>
                ×
              </button>
              <h2>{detail.title}</h2>
              <p>{detail.content}</p>
              <div className="confirm-actions">
                <button className="primary" onClick={() => setDetail(null)}>
                  我知道了
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className={`legacy-page legacy-orders${historical ? "" : " orders-current us-page"}`}>
      {!historical ? <div className="us-title"><div><h1>模型订购</h1><p>查看付费模型订购情况{!historical && " · 演示订购记录"}</p></div></div> : <section className="legacy-hero">
        <span>
          <ShoppingCart />
        </span>
        <div>
          <h1>
            订购模型管理{" "}
            <a>
              帮助中心 <ExternalLink size={13} />
            </a>
          </h1>
          <p>查看付费模型订购情况{!historical && " · 演示订购记录"}</p>
        </div>
      </section>}
      {!historical ? <div className="us-page"><Tabs value={tab} onValueChange={changeTab}>
        <TabsList variant="line" className="us-tabs" aria-label="模型订购计费方式">
          {["按Token用量计费", "按资源包计费", "Token Plan订阅", "Coding Plan订阅"].map(type => <TabsTrigger key={type} value={type}>{type}</TabsTrigger>)}
        </TabsList>
      </Tabs></div> : <nav className="legacy-tabs">
        {(historical
          ? ["按Token用量计费", "Token Plan订阅"]
          : [
              "按Token用量计费",
              "按资源包计费",
              "Token Plan订阅",
              "Coding Plan订阅",
            ]
        ).map((x) => (
          <button
            className={tab === x ? "active" : ""}
            onClick={() => setTab(x)}
            key={x}
          >
            {x}
          </button>
        ))}
      </nav>}
      <section className="legacy-panel">
        <div className="legacy-order-tools">
          <span>
            <button className="legacy-primary" onClick={() => openOrder()}>
              <ShoppingCart size={15} />
              立即订购
            </button>
            <button disabled>批量退订</button>
          </span>
          <label>
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(1); }}
              placeholder={tab === "按Token用量计费" ? "请按模型名称搜索" : "搜索套餐或资源包名称"}
            />
            <Search size={15} />
          </label>
          <button aria-label="刷新">
            <RefreshCw size={15} />
          </button>
        </div>
        <div className="legacy-order-table">
          <div className="legacy-order-row head">
            {[
              "",
              historical || tab === "按Token用量计费" ? "模型名称" : "套餐 / 资源包名称",
              historical ? "模型类别" : "类型",
              "模型服务商",
              "资费场景",
              "目录价",
              "订购状态",
              "订购时间",
              "到期时间",
              "操作",
            ].map((x, i) => (
              <span key={i}>{i === 0 ? <input type="checkbox" /> : x}</span>
            ))}
          </div>
          {visibleRows.map((row) => (
            <div className="legacy-order-row" key={row[0]}>
              <span>
                <input type="checkbox" />
              </span>
              <span>
                <b>{row[0]}</b>
                <em>{row[1]}</em>
              </span>
              {row.slice(2).map((cell, j) => (
                <span
                  key={j}
                  className={j === 3 ? "price" : j === 4 ? "state" : ""}
                >
                  {cell.split("\n").map((x) => (
                    <small key={x}>{x}</small>
                  ))}
                </span>
              ))}
              <span>
                {row[6] === "未订购" && (
                  <button onClick={() => openOrder(row[0])}>订购</button>
                )}
                <button>更多 ⌄</button>
              </span>
            </div>
          ))}
        </div>
        {!historical && !rows.length && <div className="v2-empty">暂无符合条件的订购记录</div>}
        {!historical ? <FilterPagination total={rows.length} page={current} size={size} onPageChange={setPage} onSizeChange={setSize}/> : <footer className="legacy-pager">
          <span>
            共74条记录　{" "}
            <select>
              <option>10条/页</option>
            </select>
          </span>
          <span>
            ‹　<b>1</b>　2　3　…　8　›　前往 <input defaultValue="1" /> 页
          </span>
        </footer>}
      </section>
    </div>
  );
}

function UsageStatistics5102() {
  const [type, setType] = useState("语言模型");
  const [subtype, setSubtype] = useState("时长产出型");
  const [multiFilters, setMultiFilters] = useState({
    providers: [],
    models: [],
    apiKeys: [],
    tenants: [],
  });
  const [dateRange, setDateRange] = useState([
    "2026-09-16T00:00",
    "2026-09-16T23:59",
  ]);
  const callMetrics = [
    ["调用模型数", "0 个"],
    ["调用成功次数", "0 次"],
    ["调用失败次数", "0 次"],
  ];
  const tokenMetrics = [
    ["Token 总量", "—"],
    ["输入总 Token 数", "—"],
    ["输出总 Token 数", "—"],
    ["平均单次请求 Token", "—"],
  ];
  const tokenColumns = [
    "模型名称",
    "模型类型",
    "模型服务商",
    "调用总量",
    "调用成功量",
    "调用失败量",
    "失败率",
    "调用Tokens数",
    "输入Tokens数",
    "输出Tokens数",
    "隐式缓存命中Tokens数",
    "显式缓存创建Tokens数",
    "显式缓存命中Tokens数",
    "隐式缓存命中率",
    "显式缓存命中率",
    "平均RPM",
    "平均TPM",
    "TTFT/首Token时延",
    "平均Token时延",
    "操作",
  ];
  const visualColumns =
    subtype === "时长产出型"
      ? [
          "模型名称",
          "类别",
          "模型服务商",
          "调用总量",
          "调用成功量",
          "调用失败量",
          "失败率",
          "视频分辨率",
          "视频总时长(输入+输出)",
          "操作",
        ]
      : subtype === "图片产出型"
        ? [
            "模型名称",
            "类别",
            "模型服务商",
            "调用总量",
            "调用成功量",
            "调用失败量",
            "失败率",
            "图片生成数量",
            "操作",
          ]
        : tokenColumns;
  const voiceColumns = [
    "模型名称",
    "调用总量",
    "调用成功量",
    "调用失败量",
    "失败率",
    subtype === "语音识别" ? "处理语音时长" : "处理字符数",
    "操作",
  ];
  const columns =
    type === "视觉模型"
      ? visualColumns
      : type === "语音模型"
        ? voiceColumns
        : tokenColumns;
  const modelOptions = {
    语言模型: [
      "DeepSeek/DeepSeek-V4-Pro",
      "DeepSeek/DeepSeek-V4-Flash",
      "ZHIPU/GLM-5.2",
      "Moonshot/Kimi-K3",
      "Qwen/Qwen3.7-Max",
    ],
    视觉模型: [
      "AICC-doubao-seedance-2.0",
      "Qwen/Qwen-Image-3.0-Pro",
      "Wan3.0-I2V-Plus",
      "Wan3.0-Video",
    ],
    多模态模型: ["Qwen/Qwen3.8-Max", "Qwen/Qwen3.5-397B-A17B", "Kimi/Kimi-K3"],
    语音模型: ["Qwen-Audio-ASR-Flash", "Qwen-Audio-TTS", "CosyVoice"],
  }[type];
  const selectType = (nextType) => {
    setType(nextType);
    setSubtype(nextType === "语音模型" ? "语音识别" : "时长产出型");
    setMultiFilters((current) => ({ ...current, models: [] }));
  };
  const setMultiFilter = (name, value) =>
    setMultiFilters((current) => ({ ...current, [name]: value }));
  return (
    <div className="legacy-page legacy-usage">
      <section className="legacy-hero">
        <span>
          <Activity />
        </span>
        <div>
          <h1>
            用量统计{" "}
            <a>
              帮助中心 <ExternalLink size={13} />
            </a>
          </h1>
          <p>观测模型的使用情况以及性能指标。</p>
        </div>
      </section>
      <nav className="legacy-tabs model-tabs">
        {["语言模型", "视觉模型", "多模态模型", "语音模型"].map((x) => (
          <button
            className={type === x ? "active" : ""}
            onClick={() => selectType(x)}
            key={x}
          >
            {x}
          </button>
        ))}
      </nav>
      <section className="legacy-panel">
        {type === "语音模型" && (
          <div className="legacy-balance-tip">
            剩余语音识别时长：72000秒，剩余语音合成字符数：19996字符，到期时间：2027.02.02。
          </div>
        )}
        <div className="legacy-notice">
          <Info size={15} />
          <div>
            <strong>注意：</strong>
            <p>
              1、页面数据更新会有约10-15分钟的延迟，机密模型数据更新会有约2-3小时的延迟，最新调用可能尚未显示，请稍后刷新查看。
            </p>
            <p>
              2、7月与8月的数据请分别按单月查询；其他月份跨月查询最长支持31天。
            </p>
            <p>3、资源包、Token Plan、Coding Plan 用量请前往对应页面查看。</p>
          </div>
        </div>
        <div className="legacy-filter-grid">
          <UsageMultiSelect
            label="模型服务商"
            placeholder="请选择模型服务商"
            options={["移动云", "火山引擎", "阿里云", "智谱 AI"]}
            value={multiFilters.providers}
            onChange={(value) => setMultiFilter("providers", value)}
          />
          <UsageMultiSelect
            label="模型名称"
            placeholder="请选择模型名称"
            options={modelOptions}
            value={multiFilters.models}
            onChange={(value) => setMultiFilter("models", value)}
          />
          <UsageFilterSelect
            label="调用类型"
            defaultValue="全部"
            options={["全部", "成功", "失败"]}
          />
          <UsageMultiSelect
            label="API Key"
            placeholder="请选择API Key"
            options={["test", "生产环境", "测试环境"]}
            value={multiFilters.apiKeys}
            onChange={(value) => setMultiFilter("apiKeys", value)}
          />
          <UsageMultiSelect
            label="租户"
            placeholder="请选择租户"
            options={["当前租户", "默认租户"]}
            value={multiFilters.tenants}
            onChange={(value) => setMultiFilter("tenants", value)}
          />
          <UsageFilterSelect
            label="时间精度"
            defaultValue="按日"
            options={["按日", "按小时"]}
          />
          <UsageDateRange value={dateRange} onChange={setDateRange} />
          <button type="button" className="legacy-refresh">
            <RefreshCw size={15} />
            刷新
          </button>
        </div>
        {type === "视觉模型" && (
          <nav className="legacy-subtabs">
            {["时长产出型", "图片产出型", "Token消耗型"].map((item) => (
              <button
                className={subtype === item ? "active" : ""}
                key={item}
                onClick={() => setSubtype(item)}
              >
                {item}
              </button>
            ))}
          </nav>
        )}
        {type === "语音模型" && (
          <nav className="legacy-subtabs">
            {["语音识别", "语音合成"].map((item) => (
              <button
                className={subtype === item ? "active" : ""}
                key={item}
                onClick={() => setSubtype(item)}
              >
                {item}
              </button>
            ))}
          </nav>
        )}
        <LegacyMetricSection title="调用指标" items={callMetrics} />
        {type === "视觉模型" && subtype !== "Token消耗型" ? (
          <LegacyMetricSection
            title={subtype === "时长产出型" ? "视频生成指标" : "图片生成指标"}
            items={[
              [
                subtype === "时长产出型" ? "视频总时长" : "图片生成总数",
                subtype === "时长产出型" ? "0 秒" : "0 张",
              ],
            ]}
          />
        ) : type === "语音模型" ? (
          <LegacyMetricSection
            title="语音处理指标"
            items={[
              [
                subtype === "语音识别" ? "处理语音时长" : "处理字符数",
                subtype === "语音识别" ? "0 秒" : "0 字符",
              ],
            ]}
          />
        ) : (
          <LegacyMetricSection title="Token指标" items={tokenMetrics} />
        )}
        <h3 className="legacy-list-title">模型列表</h3>
        <div className="legacy-usage-table">
          <div
            style={{
              gridTemplateColumns: `repeat(${columns.length}, minmax(110px, 1fr))`,
            }}
          >
            {columns.map((x) => (
              <span key={x}>{x}</span>
            ))}
          </div>
          <p>暂无数据</p>
        </div>
      </section>
    </div>
  );
}

function UsageFilterSelect({ label, placeholder, defaultValue, options }) {
  return (
    <label>
      <span>{label}</span>
      <Select defaultValue={defaultValue}>
        <SelectTrigger className="legacy-filter-select" aria-label={label}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent align="start">
          <SelectGroup>
            {options.map((option) => (
              <SelectItem value={option} key={option}>
                {option}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </label>
  );
}

function UsageMultiSelect({ label, placeholder, options, value, onChange }) {
  const [search, setSearch] = useState("");
  const filteredOptions = options.filter((option) =>
    option.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const toggle = (option) =>
    onChange(
      value.includes(option)
        ? value.filter((item) => item !== option)
        : [...value, option],
    );

  return (
    <label>
      <span>{label}</span>
      <PopoverPrimitive.Root
        onOpenChange={(open) => {
          if (!open) setSearch("");
        }}
      >
        <PopoverPrimitive.Trigger asChild>
          <button
            type="button"
            className="legacy-filter-select legacy-multi-trigger"
            aria-label={label}
          >
            <span>{value.length ? value.join("、") : placeholder}</span>
            <ChevronDown />
          </button>
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            className="legacy-multi-options"
            align="start"
            sideOffset={4}
          >
            <div className="legacy-multi-search">
              <Search />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={`搜索${label}`}
                aria-label={`搜索${label}`}
                autoFocus
              />
            </div>
            {filteredOptions.map((option) => {
              const selected = value.includes(option);
              return (
                <button
                  type="button"
                  key={option}
                  data-selected={selected}
                  onClick={() => toggle(option)}
                >
                  <span>{option}</span>
                  {selected && <Check />}
                </button>
              );
            })}
            {!filteredOptions.length && (
              <p className="legacy-multi-empty">无匹配数据</p>
            )}
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </label>
  );
}

function UsageDateRange({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const valid = draft[0] && draft[1] && draft[0] <= draft[1];
  const display = value.every(Boolean)
    ? value.map((item) => item.replace("T", " ") + ":00").join(" - ")
    : "请选择时间范围";

  return (
    <label className="legacy-date">
      <span>时间范围</span>
      <PopoverPrimitive.Root
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (nextOpen) setDraft(value);
        }}
      >
        <PopoverPrimitive.Trigger asChild>
          <button
            type="button"
            className="legacy-filter-select legacy-date-trigger"
            aria-label="时间范围"
          >
            <span>{display}</span>
            <CalendarDays />
          </button>
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            className="legacy-date-options"
            align="start"
            sideOffset={4}
          >
            <label>
              <span>开始时间</span>
              <input
                type="datetime-local"
                value={draft[0]}
                onChange={(event) => setDraft([event.target.value, draft[1]])}
              />
            </label>
            <label>
              <span>结束时间</span>
              <input
                type="datetime-local"
                value={draft[1]}
                onChange={(event) => setDraft([draft[0], event.target.value])}
              />
            </label>
            <div>
              <button type="button" onClick={() => setDraft(["", ""])}>
                清空
              </button>
              <button
                type="button"
                className="primary"
                disabled={!valid}
                onClick={() => {
                  onChange(draft);
                  setOpen(false);
                }}
              >
                确定
              </button>
            </div>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </label>
  );
}

function LegacyMetricSection({ title, items }) {
  return (
    <section className="legacy-metrics">
      <h3>{title}</h3>
      <div>
        {items.map(([label, value]) => (
          <article key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </div>
    </section>
  );
}

function FilterSection({ title, count = 0, children }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="filter-section">
      <button onClick={() => setOpen(!open)}>
        <b>{title}</b>
        {count > 0 && <small>{count}</small>}
        <span>{open ? "−" : "＋"}</span>
      </button>
      {open && <div className="filter-body">{children}</div>}
    </section>
  );
}

function VersionIndex() {
  return (
    <div className="version-index">
      <header className="version-header">
        <div className="brand-mark">
          <img src={`${A}jiangSuZhengWu.png`} />
          <span>模型服务平台 MoMA 政企版</span>
        </div>
        <span>原型版本</span>
      </header>
      <main className="version-main">
        <div className="version-intro">
          <small>PROTOTYPE ARCHIVE</small>
          <h1>原型版本</h1>
          <p>
            选择版本进入对应的独立原型。每个版本保留当时的界面、交互与产品范围。
          </p>
        </div>
        <section className="version-table-wrap" aria-label="原型版本列表">
          <table className="version-table">
            <thead>
              <tr>
                <th>版本号</th>
                <th>发布时间</th>
                <th>迭代内容</th>
                <th>状态</th>
                <th><span className="sr-only">操作</span></th>
              </tr>
            </thead>
            <tbody>
              {prototypeVersions.map((version) => (
                <tr key={version.id}>
                  <td><strong>{version.id}</strong></td>
                  <td><time>{version.releaseDate}</time></td>
                  <td><p>{version.changes}</p></td>
                  <td>
                    <span className={`version-state ${version.state === "历史版本" ? "archived" : ""}`}>
                      {version.state}
                    </span>
                  </td>
                  <td>
                    <a className="version-entry" href={`/${version.id}/`}>
                      进入原型 <ArrowRight aria-hidden="true" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}

function PrototypeApp({ version }) {
  const is5102 = version.id === "moma_5.10.2_estack";
  const versionAdmin = is5102 ? "legacy" : "v2";
  const modeFromHash = () =>
    location.hash.startsWith("#/admin") ? versionAdmin : "front";
  if (location.pathname.includes("/order/serviceOrder"))
    return (
      <ModelOrderList standalone versionId={version.id} historical={is5102} />
    );
  const versionNav = nav
    .map(([group, item]) => [
      group,
      { 文本生成: "语言模型", 图片生成: "视觉模型", 语音生成: "语音模型" }[
        item
      ] || item,
    ])
    .filter(
      ([, item]) =>
        item !== "视频生成" &&
        (is5102 || !["按量付费", "Token Plan"].includes(item)) &&
        (!is5102 || !["模型排行", "语音模型"].includes(item)),
    );
  const [activePage, setActivePage] = useState(() => {
    const requestedPage = new URLSearchParams(location.search).get("page");
    return requestedPage === "model-order" ? "模型订购" : !is5102 && requestedPage === "organization-members" ? "组织及成员" : "模型广场";
  }),
    [admin, setAdmin] = useState(modeFromHash),
    [textCompare, setTextCompare] = useState(false),
    [visualKind, setVisualKind] = useState("image"),
    [featured, setFeatured] = useState(true),
    [query, setQuery] = useState(""),
    [filters, setFilters] = useState({}),
    [selected, setSelected] = useState(null),
    [sortMode, setSortMode] = useState("latest");
  useEffect(() => {
    if (is5102 && activePage === "模型排行") setActivePage("模型广场");
  }, [is5102, activePage]);
  useEffect(() => {
    const sync = () => {
      if (is5102 && location.hash.startsWith("#/admin-2")) {
        location.hash = "/admin";
        return;
      }
      if (!is5102 && location.hash.startsWith("#/admin") && !location.hash.startsWith("#/admin-2")) {
        location.hash = "/admin-2/workbench";
        return;
      }
      setAdmin(modeFromHash());
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [is5102, versionAdmin]);
  const navigateAdmin = (mode) => {
    const nextMode = mode === "front" ? "front" : versionAdmin;
    setAdmin(nextMode);
    if (mode === "front")
      history.replaceState(null, "", location.pathname + location.search);
    else location.hash = versionAdmin === "legacy" ? "/admin" : "/admin-2/workbench";
  };
  const toggleFilter = (group, value) =>
    setFilters((current) => ({
      ...current,
      [group]: current[group] === value ? "" : value,
    }));
  const meta = (m) => {
    const multimodal =
      m.series === "Kimi" || m.series === "MiniMax" || m.name.includes("397B");
    return {
      task: m.task || (multimodal ? ["多模态", "文本与代码"] : ["文本与代码"]),
      input: m.input || (multimodal ? ["文本", "图像", "视频"] : ["文本"]),
      output: m.output || ["文本"],
      author: {
        DeepSeek: "深度求索",
        Kimi: "月之暗面",
        GLM: "智谱 AI",
        Qwen: "阿里巴巴",
        MiniMax: "稀宇科技",
        Bge: "北京智源",
        Doubao: "字节跳动",
      }[m.series],
      provider:
        m.series === "GLM"
          ? "联通"
          : m.series === "DeepSeek"
            ? "电信"
            : "移动云",
    };
  };
  const visible = useMemo(
    () =>
      models
        .filter((m) => {
          const data = meta(m);
          return (
            m.name.toLowerCase().includes(query.trim().toLowerCase()) &&
            Object.entries(filters).every(
              ([group, value]) =>
                !value ||
                (group === "context"
                  ? parseFloat(m.context) <= Number(value)
                  : group === "series"
                  ? m.series === value
                  : Array.isArray(data[group])
                    ? data[group].includes(value)
                    : data[group] === value),
            )
          );
        })
        .sort((a, b) =>
          sortMode === "latest"
            ? b.date.localeCompare(a.date)
            : Number(Boolean(b.hot)) - Number(Boolean(a.hot)) ||
              models.indexOf(a) - models.indexOf(b),
        ),
    [query, filters, sortMode],
  );
  const option = (group, value) => (
    <button
      key={value}
      className={`filter-option ${filters[group] === value ? "selected" : ""}`}
      onClick={() => toggleFilter(group, value)}
    >
      <i />
      {value}
    </button>
  );
  const resetFilters = () => { setFilters({}); setQuery(""); };
  return (
    <div className={`app-shell ${is5102 ? "version-5102" : ""}`}>
      <header>
        <div className="brand-mark">
          <img src={`${A}jiangSuZhengWu.png`} />
          <span>
            {admin === "front"
              ? "模型服务平台 MoMA 政企版"
              : admin === "legacy"
                ? "大模型服务平台后台运营系统"
                : "大模型服务平台运营运维中心"}
          </span>
        </div>
        <div className="top-actions">
          <div className="version-switch">
            <Select
              value={version.id}
              onValueChange={(value) => location.assign(`/${value}/`)}
            >
              <SelectTrigger size="sm" aria-label="切换原型版本">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="end">
                <SelectGroup>
                  {prototypeVersions.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.id}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          {admin === "front" ? (
            <button onClick={() => navigateAdmin(versionAdmin)}>
              后台
            </button>
          ) : (
            <button className="active" onClick={() => navigateAdmin("front")}>
              返回前台
            </button>
          )}
          <div className="user">estack-yy</div>
        </div>
      </header>
      {admin === "front" && (
        <aside>
          <h3>模型服务平台</h3>
          {versionNav.map(([group, item], i) => {
            const NavIcon = navIcons5102[item];
            return (
              <div key={item}>
                {group && i > 0 && <small>{group}</small>}
                <button
                  className={activePage === item ? "active" : ""}
                  onClick={() => {
                    setActivePage(item);
                    if (item === "文本生成" || item === "语言模型")
                      setTextCompare(false);
                  }}
                >
                  {NavIcon && <NavIcon aria-hidden="true" />}
                  {item}
                </button>
              </div>
            );
          })}
          {is5102 ? (
            <div>
              <small>用量统计</small>
              {billingTypes
                .filter((x) => x !== "资源包")
                .map((billing) => {
                  const page = `用量统计·${billing}`;
                  const NavIcon = usageIcons5102[billing];
                  return (
                    <button
                      key={billing}
                      className={activePage === page ? "active" : ""}
                      onClick={() => setActivePage(page)}
                    >
                      <NavIcon aria-hidden="true" />
                      {billing}
                    </button>
                  );
                })}
            </div>
          ) : (
            <>
              <div>
                <small>模型观测</small>
                <button
                  className={activePage === "用量统计" ? "active" : ""}
                  onClick={() => setActivePage("用量统计")}
                >
                  <ChartNoAxesCombined aria-hidden="true" />
                  用量统计
                </button>
                <button className={activePage === "调用观测" ? "active" : ""} onClick={() => setActivePage("调用观测")}><Activity aria-hidden="true" />调用观测</button>
                <button className={activePage === "调用日志" ? "active" : ""} onClick={() => setActivePage("调用日志")}><FileText aria-hidden="true" />调用日志</button>
              </div>
              <div>
                <small>系统管理</small>
                <button className={activePage === "API Key 管理" ? "active" : ""} onClick={() => setActivePage("API Key 管理")}><KeyRound aria-hidden="true" />API Key</button>
                <button className={activePage === "组织及成员" ? "active" : ""} onClick={() => setActivePage("组织及成员")}><Users aria-hidden="true" />组织及成员</button>
              </div>
            </>
          )}
          {(activePage === "文本生成" || activePage === "语言模型") &&
            !textCompare && <div id="text-history-slot" />}
        </aside>
      )}
      <main className={admin !== "front" ? "admin-main" : is5102 ? "" : "front-main"}>
        {admin === "legacy" ? (
          <AdminConsole />
        ) : admin === "v2" ? (
          <AdminConsoleV2 />
        ) : activePage === "智能路由" ? (
          <SmartRoute key={is5102 ? "moma_5.10.2_estack" : "moma_5.11.0_estack"} versionId={is5102 ? "moma_5.10.2_estack" : "moma_5.11.0_estack"} onNavigate={setActivePage} />
        ) : activePage === "模型排行" ? (
          <ModelRanking />
        ) : activePage === "文本生成" || activePage === "语言模型" ? (
          textCompare ? (
            <ModelComparison
              onBack={() => setTextCompare(false)}
            />
          ) : (
            <TextExperience
              title="语言模型"
              onCompare={is5102 ? undefined : () => setTextCompare(true)}
            />
          )
        ) : activePage === "多模态理解" ? (
          <MultimodalExperience />
        ) : activePage === "视觉模型" ? (
          <ModelExperience
            key={visualKind}
            kind={visualKind}
            groupLabel="视觉模型"
            onKindChange={setVisualKind}
          />
        ) : activePage === "图片生成" ? (
          <ModelExperience
            key="image"
            kind="image"
          />
        ) : activePage === "视频生成" ? (
          <ModelExperience
            key="video"
            kind="video"
          />
        ) : activePage === "语音生成" || activePage === "语音模型" ? (
          <ModelExperience
            key="voice"
            kind="voice"
            groupLabel={is5102 ? "语音生成" : "语音模型"}
          />
        ) : activePage === "模型订购" ? (
          <ModelOrderList versionId={version.id} historical={is5102} />
        ) : activePage === "按量付费" || activePage === "Token Plan" ? (
          <ApiKeys key={activePage} billing={activePage} />
        ) : activePage === "API Key 管理" ? (
          <UnifiedApiKeys />
        ) : activePage === "组织及成员" && !is5102 ? (
          <OrganizationMembers />
        ) : activePage.startsWith("API Key 管理·") ? (
          <ApiKeys key={activePage} billing={activePage.split("·")[1]} />
        ) : activePage === "调用观测" ? (
          <UsageStatistics key="observation" observation />
        ) : activePage === "用量统计" ? (
          <UsageStatistics />
        ) : activePage === "调用日志" ? (
          <CallLogs />
        ) : activePage.startsWith("用量统计·") ? (
          is5102 ? (
            <UsageStatistics5102 />
          ) : (
            <UsageStatistics
              key={activePage}
              billing={activePage.split("·")[1]}
            />
          )
        ) : activePage.startsWith("调用日志·") ? (
          <CallLogs key={activePage} billing={activePage.split("·")[1]} />
        ) : (
          <div className="content">
            {featured ? (
              <section className="featured">
                <div className="title-row">
                  <h1>
                    模型市场 <em>探索精选模型</em>
                  </h1>
                  <button onClick={() => setFeatured(false)}>
                    <img src={`${A}look-e200be1b.svg`} /> 隐藏精选模型
                  </button>
                </div>
                <div className="hero-grid">
                  {hero.map((m) => (
                    <article key={m.name} onClick={() => setSelected(m)}>
                      <div
                        className="hero-image"
                        style={{ backgroundImage: `url(${A}${m.bg})` }}
                      >
                        <strong>{m.name}</strong>
                        <span>{m.type}</span>
                      </div>
                      <h2>{m.name}</h2>
                      <p>{m.desc}</p>
                    </article>
                  ))}
                </div>
              </section>
            ) : (
              <button
                className="show-featured"
                onClick={() => setFeatured(true)}
              >
                展开精选模型
              </button>
            )}
            <section className="catalog">
              <div className="filters">
                <div className="filter-heading">
                  <h3>模型筛选</h3>
                  <button
                    onClick={resetFilters}
                    disabled={!query.trim() && !Object.values(filters).some(Boolean)}
                  >
                    重置
                  </button>
                </div>
                <FilterSection title="任务分类" count={filters.task ? 1 : 0}>
                  {[
                    "多模态",
                    "文本与代码",
                    "图像",
                    "视频",
                    "音频",
                    "音乐",
                    "向量",
                    "重排",
                    "3D",
                  ].map((x) => option("task", x))}
                </FilterSection>
                <FilterSection title="输入" count={filters.input ? 1 : 0}>
                  {["文本", "图像", "音频", "视频"].map((x) =>
                    option("input", x),
                  )}
                </FilterSection>
                <FilterSection title="输出" count={filters.output ? 1 : 0}>
                  {["文本", "图像", "音频", "视频"].map((x) =>
                    option("output", x),
                  )}
                </FilterSection>
                <FilterSection title={`上下文上限：${filters.context || 1024}K`}>
                  <div className="range-values">
                    <span>4K</span>
                    <span>1M</span>
                  </div>
                  <input
                    className="filter-range"
                    type="range"
                    min="4"
                    max="1024"
                    value={filters.context || 1024}
                    onChange={event => setFilters(current => ({...current, context:Number(event.target.value)}))}
                    aria-label="上下文长度上限"
                  />
                </FilterSection>
                <FilterSection title="模型作者" count={filters.author ? 1 : 0}>
                  {[
                    "阿里巴巴",
                    "深度求索",
                    "月之暗面",
                    "智谱 AI",
                    "稀宇科技",
                  ].map((x) => option("author", x))}
                </FilterSection>
                <FilterSection
                  title="推理服务商"
                  count={filters.provider ? 1 : 0}
                >
                  {["移动云", "联通", "电信"].map((x) => option("provider", x))}
                </FilterSection>
              </div>
              <div className="results">
                <div className="toolbar">
                  <h3>
                    模型{" "}
                    {query || Object.values(filters).some(Boolean)
                      ? visible.length
                      : 61}
                    个 <img src={`${A}refresh-3e0d92ae.svg`} />
                  </h3>
                  <div>
                    <select
                      className="sort"
                      aria-label="模型排序"
                      value={sortMode}
                      onChange={(e) => setSortMode(e.target.value)}
                    >
                      <option value="latest">最新</option>
                      <option value="recommended">推荐</option>
                    </select>
                    <label>
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="请输入模型名称"
                      />
                    </label>
                  </div>
                </div>
                <div className="cards">
                  {visible.map((m) => {
                    const data = meta(m),
                      icons = {
                        文本: FileText,
                        图像: Image,
                        视频: Video,
                        音频: AudioLines,
                      },
                      OutputIcon = icons[data.output[0]] || FileText;
                    return (
                      <article
                        className="model-card"
                        key={m.name}
                        onClick={() => setSelected(m)}
                      >
                        {m.hot && (
                          <img className="hot" src={`${A}hot-7601e629.svg`} />
                        )}{" "}
                        {m.score && <span className="score">{m.score}</span>}
                        <h4>
                          <img src={`${A}model-${m.icon}.jpg`} />
                          {m.name}
                        </h4>
                        <p>{m.desc}</p>
                        <div
                          className="modalities"
                          aria-label={`${data.input.join("+")} 转 ${data.output.join("+")}`}
                        >
                          <span>
                            {data.input.map((type) => {
                              const InputIcon = icons[type] || FileText;
                              return <InputIcon key={type} />;
                            })}
                          </span>
                          <img
                            className="arrow"
                            src={`${A}modelArrow-ae18ab15.svg`}
                          />
                          <OutputIcon />
                        </div>
                        <div className="context">上下文窗口：{m.context}</div>
                        <footer>更新于&nbsp; {m.date}</footer>
                      </article>
                    );
                  })}
                </div>
                {!visible.length && <div className="empty">暂无匹配模型</div>}
              </div>
            </section>
          </div>
        )}
      </main>
      {selected && (
        <div className="modal" onClick={() => setSelected(null)}>
          <div onClick={(e) => e.stopPropagation()}>
            <button className="close" onClick={() => setSelected(null)}>
              ×
            </button>
            <img src={`${A}model-${selected.icon}.jpg`} />
            <h2>{selected.name}</h2>
            <p>{selected.desc}</p>
            <dl>
              <dt>上下文窗口</dt>
              <dd>{selected.context}</dd>
              <dt>功能</dt>
              <dd>在线体验、API调用</dd>
            </dl>
            <button className="primary">查看详情</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function App() {
  const version = prototypeVersions.find((item) =>
    location.pathname.startsWith(`/${item.id}/`),
  );
  return version ? <PrototypeApp version={version} /> : <VersionIndex />;
}
