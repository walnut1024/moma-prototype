import { productBillingType, accountModels, projectModels } from './project-domain.mjs';
import ProjectConsole from './ProjectConsole';
import { AdminUIContext } from './components/admin-ui-context';
import FrontPageHeader from "./components/FrontPageHeader";
import AuthExperience, { AuthBanner, usePrototypeAuth } from "./AuthExperience";

import { displaySmartRouteName } from './display-copy.mjs';
import { MODEL_ORDER_BILLING_TYPES, MODEL_ORDER_COLUMNS } from './model-order-display.mjs';
import { DEFAULT_PAGE_SIZE, FilterPagination } from "./components/FilterControls";
import { useEffect, useState } from "react";
import UsageStatistics from "./components/UsageStatistics";
import OrganizationMembers from "./OrganizationMembers";
import "./styles.css";
import "./token-plan-keys.css";
import "./version-index.css";
import "./legacy-5102.css";
import "./order-5102.css";
import "./ranking.css";
import ModelExperience from "./ModelExperience";

import { Tabs, TabsList, TabsTrigger } from "./components/ui/tabs";

import { toast } from "sonner";
import { TENANT_USER_TYPE_KEY, tenantUserAccess } from "./tenant-user-type.mjs";

import AdminConsole from "./AdminConsole";
import AdminConsoleV2 from "./AdminConsoleV2";

import { orderedRouteModels } from "./route-models.mjs";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./components/ui/select";
import { ArrowRight, Check, Copy, ExternalLink, Info, RefreshCw, Route, Search, ShoppingCart } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./components/ui/dialog";
import { Button } from "./components/ui/button";




import "./frontend-pages.css";

const A = "/moma_5.13.0_estack/assets/";





const prototypeVersions = [
  { id: "moma_5.12.0_estack", state: "历史版本", releaseDate: "10月8日", changes: "独立保留的 5.12.0。" },
  {
    id: "moma_5.13.0_estack",
    state: "当前版本",
    releaseDate: "10月8日",
    changes: "基于 5.11.0 复制，独立迭代。",
  },
  {
    id: "moma_5.11.0_estack",
    state: "历史版本",
    releaseDate: "待定",
    changes: "新增模型排行、语音模型与 Coding Plan；完善模型体验、订单管理、API Key、用量统计和调用日志。",
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

function SmartRoute({ versionId, onNavigate, workspace }) {
  const storageKey = `moma-smart-routes:${versionId}`;
  const [creating, setCreating] = useState(false),
    [editingId, setEditingId] = useState(null),
    [apiRoute, setApiRoute] = useState(null),
    [deleting, setDeleting] = useState(null),
    [copyNotice, setCopyNotice] = useState(""),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(1), [size, setSize] = useState(DEFAULT_PAGE_SIZE),
    [name, setName] = useState(""),
    [strategy, setStrategy] = useState("效果优先"),
    [models, setModels] = useState([]),
    [agreed, setAgreed] = useState(false),
    [localRoutes, setLocalRoutes] = useState(() => {
      if (workspace) return [];
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored !== null) {
          const saved = JSON.parse(stored);
          if (Array.isArray(saved)) return saved;
        }
      } catch { /* Keep the prototype usable if browser storage is unavailable. */ }
      return versionId === "moma_5.13.0_estack" ? [{ id: "route-demo-001", name: "primary-route", strategy: "效果优先", models: ["Kimi-K3", "DeepSeek-V4-Pro"], status: "正常", creator: "estack-yy", time: new Date().toLocaleString("sv-SE", { timeZone: "Asia/Shanghai", hour12: false }) }] : [];
    });
  const routes = workspace ? (workspace.project.smartRoutes || []).map(route=>({...route,models:route.modelIds.map(id=>workspace.state.models.find(model=>model.id===id)?.name || id)})) : localRoutes;
  const setRoutes = next => { if (!workspace) {setLocalRoutes(next);return true;} const result=workspace.run('routes',{routes:next.map(route=>({...route,modelIds:route.models.map(name=>workspace.state.models.find(model=>model.name===name)?.id)}))}); return Boolean(result); };
  useEffect(() => { if (workspace) return; try { localStorage.setItem(storageKey, JSON.stringify(routes)); } catch { /* Preview remains usable without persistence. */ } }, [routes, storageKey]);
  useEffect(()=>{workspace?.onDirty(creating && Boolean(name || models.length));},[creating,name,models]);
  useEffect(()=>()=>workspace?.onDirty(false),[]);
  const candidates = workspace ? projectModels(workspace.state,workspace.project).map(model=>({name:model.name,size:model.capabilities?.parameters || 0})) : orderedRouteModels(strategy);
  const filteredRoutes=routes.filter(route=>displaySmartRouteName(route).toLowerCase().includes(query.trim().toLowerCase()));
  const current=Math.min(page,Math.max(1,Math.ceil(filteredRoutes.length/size)));
  const visibleRoutes=filteredRoutes.slice((current-1)*size,current*size);
  const duplicateName = routes.some(route => displaySmartRouteName(route) === name && route.id !== editingId);
  const openForm = route => {
    setEditingId(route?.id ?? null);
    setName(displaySmartRouteName(route));
    setStrategy(route?.strategy ?? "效果优先");
    setModels(route?.models ?? []);
    setAgreed(!!route);
    setCreating(true);
  };
  const closeForm = () => { setCreating(false); setEditingId(null); };
  const submit = () => {
    if (name.length < 2 || name.length > 50 || duplicateName || !models.length || !editingId && !agreed) return;
    const next = editingId ? routes.map(route=>route.id===editingId?{...route,name,strategy,models}:route) : [{id:'route-'+crypto.randomUUID(),name,strategy,models,status:'正常',creator:workspace?.identity.name || 'estack-yy',time:new Date().toLocaleString('sv-SE',{timeZone:'Asia/Shanghai',hour12:false})},...routes];
    if(!setRoutes(next))return;
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
      {versionId === "moma_5.13.0_estack" ? <FrontPageHeader title="智能路由" description="根据输入请求的内容、上下文、性能需求或成本等因素，自动选择最优模型，实现AI资源的高效配置" icon={Route} /> : <div className="route-head">
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
      </div>}
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
                <span>{displaySmartRouteName(r)}</span>
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
        <FilterPagination total={filteredRoutes.length} page={current} size={size} onPageChange={setPage} onSizeChange={value => { setSize(value); setPage(1); }}/>

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
          <DialogHeader><DialogTitle>API 调用</DialogTitle><DialogDescription>通过 API Key 调用“{displaySmartRouteName(apiRoute)}”智能路由。</DialogDescription></DialogHeader>
          <div className="route-api-alert">请求地址和权限以已开通的服务为准。API Key 请妥善保管，避免公开共享。</div>
          <section><h3>1 获取 API Key</h3><p>在 API Key 管理中创建或选择已有密钥。</p><Button variant="outline" onClick={() => { setApiRoute(null); onNavigate("API Key 管理"); }}>前往 API Key 管理</Button></section>
          <section><h3>2 调用智能路由</h3><p>在请求体的 <code>model</code> 字段填写该路由的接入点 ID。</p><div className="route-api-code-head"><span>Curl · 流式调用</span><Button variant="ghost" size="sm" onClick={() => copy(curl, "调用代码")}><Copy size={15}/>复制</Button></div><pre>{curl}</pre><div className="route-api-value"><span>接入点：<code>{apiRoute?.id}</code></span><Button variant="ghost" size="sm" onClick={() => copy(apiRoute?.id ?? "", "接入点")}>复制</Button></div><div className="route-api-value"><span>请求地址：<code>{routeApiUrl}</code></span><Button variant="ghost" size="sm" onClick={() => copy(routeApiUrl, "请求地址")}>复制</Button></div></section>
          <span role="status" className="route-copy-status">{copyNotice}</span>
        </DialogContent>
      </Dialog>
      <Dialog open={!!deleting} onOpenChange={open => { if (!open) setDeleting(null); }}>
        <DialogContent className="route-delete-dialog sm:max-w-md"><DialogHeader><DialogTitle>确认删除该智能路由吗？</DialogTitle><DialogDescription>“{displaySmartRouteName(deleting)}”删除后不可恢复，请谨慎操作。</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleting(null)}>取消</Button><Button onClick={() => { if(setRoutes(routes.filter(route => route.id !== deleting?.id)))setDeleting(null); }}>删除</Button></DialogFooter></DialogContent>
      </Dialog>
    </div>
  );
}











function ModelOrderList({
  standalone = false,
  versionId = "moma_5.10.2_estack",
  historical = true,
  workspace,
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
    [detail, setDetail] = useState(null), [page, setPage] = useState(1), [size, setSize] = useState(DEFAULT_PAGE_SIZE);
  useEffect(()=>{workspace?.onDirty(ordering && !ordered && Boolean(selectedOrders.length || agreed));},[ordering,ordered,selectedOrders,agreed]);
  useEffect(()=>()=>workspace?.onDirty(false),[]);
  const sampleRows = [
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
  const productRows = workspace ? workspace.state.products.filter(product => product.status === '已上架' && product.modelIds?.every(id=>accountModels(workspace.state,workspace.identity.tenantId).some(model=>model.id===id))).map(product => {
    const order=workspace.state.orders.find(item=>item.tenantId===workspace.identity.tenantId && item.productId===product.id && !['已取消','已到期'].includes(item.status));
    return [product.name,'自营',productBillingType(product) === 'plan' ? 'Token Plan' : productBillingType(product)==='coding' ? 'Coding Plan' : '文本模型',product.providerName || '移动云',product.tariffScenario || (productBillingType(product) === 'plan'?'套餐额度':'按实际用量'),product.catalogPrice || (product.price==null?'待配置':'¥'+product.price),order?.status || '未订购',order?.createdAt?.slice(0,19) || '—',order?.expiresAt || '长期',product.id];
  }) : [];
  const allRows = workspace ? productRows.filter(row => tab === 'Token Plan订阅' ? row[2] === 'Token Plan' : tab === 'Coding Plan订阅' ? row[2] === 'Coding Plan' : !['Token Plan','Coding Plan'].includes(row[2])) : sampleRows;
  const subscriptions = {
    "Token Plan订阅": [["办公团队套餐", "自营", "Token Plan", "移动云", "月度额度", "¥99 / 月", "已订购", "2026-09-15", "2026-10-15"], ["研发团队套餐", "自营", "Token Plan", "移动云", "月度额度", "¥199 / 月", "已订购", "2026-09-20", "2026-10-20"]],
    "Coding Plan订阅": [["研发助手 Coding Plan", "自营", "Coding Plan", "移动云", "月度编程套餐", "¥199 / 月", "已订购", "2026-09-15", "2026-10-15"]],
  };
  const rows = (workspace || historical || tab === "按Token用量计费" ? allRows : subscriptions[tab] || []).filter(row => row[0].toLowerCase().includes(query.trim().toLowerCase()));
  const current = Math.min(page, Math.max(1, Math.ceil(rows.length / size)));
  const visibleRows = rows.slice((current - 1) * size, current * size);
  const changeTab = value => { setTab(value); setQuery(""); setPage(1); };
  const openOrder = (name) => workspace ? (setSelectedOrders(name ? [name] : []), setOrdering(true)) : window.open(
      `/${versionId}/order/serviceOrder/?serviceType=presetModelService${name ? `&model=${encodeURIComponent(name)}` : ""}`,
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
        : "按套餐额度抵扣";
    const resetSelection = (nextTab) => {
      setTab(nextTab);
      setSelectedOrders([]);
      setAgreed(false);
    };
    return (
      <div className="legacy-page legacy-service-order">
        <div className="service-order-title">
          <nav aria-label="面包屑"><ol><li><a href={`/${versionId}/?page=model-order`} onClick={event => { if (!standalone) { event.preventDefault(); closeOrder(); } }}>模型订购</a></li><li><span aria-hidden="true">/</span><span aria-current="page">订购模型服务</span></li></ol></nav>
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
                      "服务条款以移动云官网发布内容为准。",
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
                      onClick={() => { if (!workspace || workspace.run('order', { productIds: allRows.filter(row=>selectedOrders.includes(row[0])).map(row=>row[10]) }, null)) setOrdered(true); }}
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
      {!historical ? <FrontPageHeader title="模型订购" description="查看付费模型订购情况" icon={ShoppingCart} /> : <section className="legacy-hero">
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
          <p>查看付费模型订购情况</p>
        </div>
      </section>}
      {!historical ? <div className="us-page"><Tabs value={tab} onValueChange={changeTab}>
        <TabsList variant="line" className="us-tabs" aria-label="模型订购计费方式">
          {Object.values(MODEL_ORDER_BILLING_TYPES).map(type => <TabsTrigger key={type} value={type}>{type}</TabsTrigger>)}
        </TabsList>
      </Tabs></div> : <nav className="legacy-tabs">
        {(historical
          ? ["按Token用量计费", "Token Plan订阅"]
          : [
              "按Token用量计费",
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
              placeholder={tab === "按Token用量计费" ? "请按模型名称搜索" : "搜索套餐名称"}
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
              historical || tab === "按Token用量计费" ? "模型名称" : "套餐名称",
              historical ? "模型类别" : "类型",
              ...MODEL_ORDER_COLUMNS.slice(1),
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
        <FilterPagination total={rows.length} page={current} size={size} onPageChange={setPage} onSizeChange={value => { setSize(value); setPage(1); }}/>
      </section>
    </div>
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
        <span>平台版本</span>
      </header>
      <main className="version-main">
        <div className="version-intro">
          <small>PROTOTYPE ARCHIVE</small>
          <h1>平台版本</h1>
          <p>
            选择平台版本，查看对应的功能与服务。
          </p>
        </div>
        <section className="version-table-wrap" aria-label="版本列表">
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
                      进入平台 <ArrowRight aria-hidden="true" />
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

function guardProjectNavigation(proceed) {
  const event = new CustomEvent('moma-project-navigation', { cancelable: true, detail: proceed });
  if (window.dispatchEvent(event)) proceed();
}
function PrototypeApp({ version }) {
  const is5102 = version.id === "moma_5.10.2_estack";
  const versionAdmin = is5102 ? "legacy" : "v2";
  const modeFromHash = () =>
    location.hash.startsWith("#/admin") ? versionAdmin : "front";
  const [admin,setAdmin] = useState(modeFromHash), [adminBannerTarget,setAdminBannerTarget] = useState(null);
  const auth = usePrototypeAuth();
  const [previewUserType, setPreviewUserType] = useState(() => {
    try { return localStorage.getItem(TENANT_USER_TYPE_KEY) === 'personal' ? 'personal' : 'enterprise'; }
    catch { return 'enterprise'; }
  });
  const tenantAccess = tenantUserAccess(auth.state, previewUserType);
  const changeUserType = (value, confirmed = false) => {
    if (!confirmed) return guardProjectNavigation(() => changeUserType(value, true));
    if (!['personal', 'enterprise'].includes(value)) return;
    try {
      if (auth.user) {
        const target = value === 'personal'
          ? auth.spaces.find(space => space.id === 'personal')
          : auth.spaces.find(space => space.id === auth.state.activeSpace && space.id !== 'personal') || auth.spaces.find(space => space.id !== 'personal');
        if (!target) return;
        auth.commit({ ...auth.state, activeSpace: target.id });
      } else {
        localStorage.setItem(TENANT_USER_TYPE_KEY, value);
        setPreviewUserType(value);
      }
      toast.success(value === 'personal' ? '已切换为个人用户' : '已切换为政企用户');
    } catch (error) { toast.error(auth.user && error.message ? error.message : '用户类型未能保存，请检查浏览器存储后重试。'); }
  };
  useEffect(() => {
    const sync = () => {
      if (is5102 && location.hash.startsWith("#/admin-2")) {
        location.hash = "/admin";
        return;
      }
      if (!is5102 && location.hash.startsWith("#/admin") && !location.hash.startsWith("#/admin-2")) {
        location.hash = "/admin-2/dashboard";
        return;
      }
      setAdmin(modeFromHash());
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [is5102, versionAdmin]);
  const navigateAdmin = (mode, confirmed = false) => {
    if (!confirmed) return guardProjectNavigation(() => navigateAdmin(mode, true));
    const nextMode = mode === "front" ? "front" : versionAdmin;
    setAdmin(nextMode);
    if (mode === "front")
      history.replaceState(null, "", location.pathname + location.search);
    else location.hash = versionAdmin === "legacy" ? "/admin" : "/admin-2/dashboard";
  };

  return (
    <AdminUIContext.Provider value={admin === "v2"}><div className={`app-shell ${is5102 ? "version-5102" : ""} ${auth.route ? "auth-shell" : ""} ${auth.route ? "auth-enterprise-shell" : ""}`}>
      <header className={admin === "v2" ? "admin-banner" : undefined}>
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
          {admin === "v2" && (
            <div className="admin-banner-controls" ref={setAdminBannerTarget}>
              <div data-admin-deployment />
              <div data-admin-role />
            </div>
          )}
          <div className="version-switch">
            <Select
              value={version.id}
              onValueChange={(value) => guardProjectNavigation(() => location.assign(`/${value}/`))}
            >
              <SelectTrigger size="sm" aria-label="切换版本">
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
          {admin === 'front' && !auth.route && <div className="version-switch user-type-switch">
            <Select value={tenantAccess.userType} onValueChange={changeUserType} disabled={Boolean(auth.storageError) || Boolean(auth.user && !auth.spaces.length)}>
              <SelectTrigger size="sm" aria-label="切换用户类型"><SelectValue /></SelectTrigger>
              <SelectContent position="popper" align="end"><SelectGroup>
                <SelectItem value="enterprise" disabled={Boolean(auth.user && !auth.spaces.some(space => space.id !== 'personal'))}>政企用户</SelectItem>
                <SelectItem value="personal" disabled={Boolean(auth.user && !auth.spaces.some(space => space.id === 'personal'))}>个人用户</SelectItem>
              </SelectGroup></SelectContent>
            </Select>
          </div>}
          {is5102 ? <div className="user">estack-yy</div> : <AuthBanner auth={auth} showToast={admin === "front"} />}
        </div>
      </header>
      {admin === 'front' && !auth.route ? <ProjectConsole auth={auth} userType={tenantAccess.userType} renderLegacy={(page, workspace) => page === '智能路由' ? <SmartRoute key={workspace.project.id} workspace={workspace} versionId={version.id} onNavigate={() => { location.hash = '/projects?page=keys'; }}/> : page === '模型订购' ? <ModelOrderList standalone={location.pathname.includes('/order/serviceOrder')} versionId={version.id} historical={false} workspace={workspace}/> : page === 'usage' || page === '调用观测' ? <UsageStatistics key={workspace.project.id + page} observation={page === '调用观测'} workspace={workspace}/> : page === '组织及成员' ? <OrganizationMembers workspace={workspace}/> : page === '账号认证' ? <AuthExperience auth={{ ...auth, route: 'account' }} accountTitle="账号认证"/> : <ModelExperience key={workspace.project?.id + page} runtime={{...workspace.runtime, models: projectModels(workspace.state,workspace.project).filter(model=>(page === "语音识别" ? model.type === "audio" && model.profile?.tasks?.includes("语音识别") : model.type === ({图片生成:"image",视频生成:"video"}[page]))).map(model=>({name:model.id,label:model.name,desc:model.description,subscribed:true,provider:model.profile?.author || model.maker}))}} kind={page === '图片生成' ? 'image' : page === '视频生成' ? 'video' : 'voice'} groupLabel={page}/>}/> : <main className={admin === 'v2' ? 'admin-main' : 'front-main'}>{auth.route ? <AuthExperience key={auth.route} auth={auth}/> : admin === 'v2' ? <AdminConsoleV2 bannerTarget={adminBannerTarget}/> : <AdminConsole/>}</main>}</div></AdminUIContext.Provider>
  );
}

export function App() {
  const version = prototypeVersions.find((item) =>
    location.pathname.startsWith(`/${item.id}/`),
  );
  return version ? <PrototypeApp version={version} /> : <VersionIndex />;
}
