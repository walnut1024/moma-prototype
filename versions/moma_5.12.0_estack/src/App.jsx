import {loadAdminState} from './admin-v2/store.js';
import {useTenantData} from './useTenantData';
import {saveTenantKeys,orderTenantServices,saveTenantRoutes} from './tenant-data.mjs';
import {toast} from 'sonner';
import mockConfig from './mock/catalogues.json' with { type: 'json' };
import { readExperienceDraft } from './experience-drafts.mjs';
import { useServiceDirectory } from './useServiceDirectory';
import { beginExperience, marketModels, customerPriceRows } from './service-directory.mjs';
import MarketModelDetail from './MarketModelDetail';
import { readModelDetail, modelDetailLocation } from './model-detail-route.mjs';
import { Button as SemiButton, Select as SemiSelect } from '@douyinfe/semi-ui';
import DevelopmentNotes from './admin-v2/DevelopmentNotes';
import { AdminUIContext } from './components/admin-ui-context';
import FrontPageHeader from "./components/FrontPageHeader";
import AuthExperience, { AuthBanner, usePrototypeAuth } from "./AuthExperience";
import OperationRecords from "./OperationRecords";
import { displaySmartRouteName } from './display-copy.mjs';
import { MODEL_ORDER_BILLING_TYPES, MODEL_ORDER_COLUMNS } from './model-order-display.mjs';
import { DEFAULT_PAGE_SIZE, FilterPagination } from "./components/FilterControls";
import { useEffect, useMemo, useRef, useState } from "react";
import UsageStatistics from "./components/UsageStatistics";
import OrganizationMembers from "./OrganizationMembers";
import "./styles.css";
import "./token-plan-keys.css";
import "./version-index.css";
import "./model-order.css";
import "./ranking.css";
import ModelExperience from "./ModelExperience";
import CallLogs from "./CallLogs";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./components/ui/tabs";
import TextExperience from "./TextExperience";
import { tenantUserAccess } from "./tenant-user-type.mjs";
import ModelComparison from "./ModelComparison";
import AdminConsole from "./AdminConsole";
import AdminConsoleV2 from "./AdminConsoleV2";
import { shanghaiDate } from "./call-log-data.mjs";
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
  Calculator,
  ChartNoAxesCombined,
  Check,
  Copy,
  ExternalLink,
  FileText,
  Image,
  Images,
  Info,
  KeyRound,
  History,
  Languages,
  RefreshCw,
  Route,
  Search,
  SlidersHorizontal,
  X,
  Settings,
  ShoppingCart,
  ShieldCheck,
  Store,
  Users,
  Video,
} from "lucide-react";

import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./components/ui/dialog";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { maskApiKey, parseIpAllowlist } from "./api-key-utils.mjs";
import "./frontend-pages.css";

const A = "/moma_5.12.0_estack/assets/";

const nav = [
  ["模型市场", "模型广场"],
  ["", "智能路由"],
  ["模型体验", "文本生成"],
  ["", "图片生成"],
  ["", "视频生成"],
  ["", "语音生成"],
  ["订单管理", "模型订购"],
  ["API Key", "按量付费"],
  ["", "Token Plan"],
];
const billingTypes = ["按量付费", "Token Plan"];
const navIcons = {
  模型广场: Store,
  智能路由: Route,
  模型排行: Activity,
  文本生成: Languages,
  图片生成: Images,
  视频生成: Video,
  语音识别: AudioLines,
  模型订购: ShoppingCart,
  按量付费: KeyRound,
  "Token Plan": Calculator,
};
const prototypeVersions = [
  {
    id: "moma_5.12.0_estack",
    state: "当前版本",
    releaseDate: "10月8日",
    changes: "基于 5.11.0 复制，独立迭代。",
  },
];

const routeApiUrl = "$MOMA_BASE_URL/chat/completions";

function SmartRoute({ versionId, onNavigate }) {
  const tenant=useTenantData();
  const routes=tenant.routes;
  const setRoutes=rows=>{try{saveTenantRoutes(rows,draftRevision ?? tenant.revision);return true;}catch(error){toast.error(error.message);return false;}};
  const [draftRevision,setDraftRevision]=useState(null);
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
    [agreed, setAgreed] = useState(false);
  const candidates=tenant.services.filter(row=>row.callable).map(row=>({name:row.callId,size:row.parameters ?? null,price:row.salePrices.reduce((sum,item)=>sum+item.amount/1000000,0),type:row.type}));
  const filteredRoutes=routes.filter(route=>displaySmartRouteName(route).toLowerCase().includes(query.trim().toLowerCase()));
  const current=Math.min(page,Math.max(1,Math.ceil(filteredRoutes.length/size)));
  const visibleRoutes=filteredRoutes.slice((current-1)*size,current*size);
  const duplicateName = routes.some(route => displaySmartRouteName(route) === name && route.id !== editingId);
  const openForm = route => {
    setDraftRevision(tenant.revision);
    setEditingId(route?.id ?? null);
    setName(displaySmartRouteName(route));
    setStrategy(route?.strategy ?? "效果优先");
    setModels(route?.models ?? []);
    setAgreed(!!route);
    setCreating(true);
  };
  const closeForm = () => { setCreating(false); setEditingId(null); setDraftRevision(null); };
  const submit = () => {
    if (name.length < 2 || name.length > 50 || duplicateName || !models.length || !editingId && !agreed) return;
    let saved;
    if (editingId) saved=setRoutes(routes.map(route => route.id === editingId ? { ...route, name, strategy, models } : route));
    else saved=setRoutes([{ id: `route-${crypto.randomUUID()}`, name, strategy, models, status: "正常", creator: tenant.identity?.name || "", time: new Date().toLocaleString("sv-SE", { timeZone: "Asia/Shanghai", hour12: false }) }, ...routes]);
    if(!saved)return;
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
      {versionId === "moma_5.12.0_estack" ? <FrontPageHeader title="智能路由" description="根据输入请求的内容、上下文、性能需求或成本等因素，自动选择最优模型，实现AI资源的高效配置" icon={Route} /> : <div className="route-head">
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
                    <small>{model.size==null?"参数规模未填写":`总参数 ${model.size >= 1000 ? `${model.size / 1000}T` : `${model.size}B`}`}</small>
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

function UnifiedApiKeys() {
  return <div className="api-key-unified us-page">
    <FrontPageHeader title="API Key 管理" description="管理不同计费方式下的调用凭证与访问权限" icon={KeyRound} />
    <Tabs defaultValue="按量付费">
      <TabsList variant="line" className="us-tabs" aria-label="API Key 计费方式">
        {billingTypes.map(type => <TabsTrigger key={type} value={type}>{type}</TabsTrigger>)}
      </TabsList>
      {billingTypes.map(type => <TabsContent key={type} value={type} forceMount className="api-key-billing-panel">{type === "Token Plan" ? <TokenPlanApiKeys /> : <ApiKeys billing={type} hideHeading />}</TabsContent>)}
    </Tabs>
  </div>;
}

function TokenPlanApiKeys() {
  const tenant=useTenantData();
  const tokenPlanSubscriptions=tenant.plans.map(row=>({id:row.id,name:row.product.name,startAt:row.createdAt?.slice(0,10) || '',endAt:row.expiresAt || '长期有效'}));
  const [planId, setPlanId] = useState(tokenPlanSubscriptions[0]?.id || "");
  const [planQuery, setPlanQuery] = useState("");
  const selectedPlan = tokenPlanSubscriptions.find(plan => plan.id === planId) || tokenPlanSubscriptions[0];
  const effectivePlanId=selectedPlan?.id;
  const visiblePlans = tokenPlanSubscriptions.filter(plan => `${plan.name} ${plan.id}`.toLowerCase().includes(planQuery.trim().toLowerCase()));
  if (!selectedPlan) return <div className="v2-empty">暂无 Token Plan 订阅，<a href="?page=model-order">前往模型订购</a></div>;
  return <div className="token-plan-workspace">
    <nav className="token-plan-sidebar" aria-label="已购 Token Plan">
      <h2>已购套餐</h2>
      <div className="token-plan-search"><Search size={16} aria-hidden="true" /><Input aria-label="搜索套餐名称或订阅编号" placeholder="搜索套餐名称或编号" value={planQuery} onChange={e => setPlanQuery(e.target.value)} /></div>
      <div className="token-plan-list">
        {visiblePlans.map(plan => <Button key={plan.id} variant="ghost" className="token-plan-item" aria-label={`选择套餐：${plan.name} ${plan.id}`} aria-pressed={plan.id === effectivePlanId} onClick={() => setPlanId(plan.id)}>
          <strong>{plan.name}</strong><span>{plan.id}</span><small>{plan.startAt} 至 {plan.endAt}</small>
        </Button>)}
        {!visiblePlans.length && <p className="token-plan-empty" role="status">没有匹配的套餐</p>}
      </div>
    </nav>
    <div className="token-plan-detail">
      {tokenPlanSubscriptions.map(plan => <div key={plan.id} hidden={plan.id !== effectivePlanId}><ApiKeys billing="Token Plan" subscription={plan} hideHeading /></div>)}
    </div>
  </div>;
}

function ApiKeys({ billing, subscription, hideHeading = false }) {
  const tenant=useTenantData();
  const keyScope=subscription?.id || billing;
  const [revealedKeys,setRevealedKeys]=useState({});
  const editModels = [...new Map(tenant.services.filter(row=>row.callable).map(row=>[row.modelId,[row.modelId,row.typeLabel || row.type]])).values()];
  const keys=tenant.keys.filter(row=>(row.billingType || '按量付费')===billing && (row.subscriptionId || '')===(subscription?.id || '')).map(row=>({...row,key:revealedKeys[row.id] || row.secretPreview || '****',desc:row.description,created:row.createdAt,enabled:row.status==='有效',models:row.modelIds?.map(id=>tenant.models.find(model=>model.id===id)?.modelId || id) || [],ips:row.ipAllowlist || []}));
  const setKeys=rows=>{try {saveTenantKeys(rows,{billing,subscriptionId:subscription?.id,expectedRevision:panel?.revision ?? action?.revision ?? tenant.revision});setRevealedKeys(current=>({...current,...Object.fromEntries(rows.filter(row=>row.key && !row.key.includes('*')).map(row=>[row.id,row.key]))}));return true;}catch(error){setFormError(error.message);toast.error(error.message);return false;}};
  const     [query, setQuery] = useState(""),
    [selectedSearchId, setSelectedSearchId] = useState(null),
    [page, setPage] = useState(1), [size, setSize] = useState(DEFAULT_PAGE_SIZE),
    [searchOpen, setSearchOpen] = useState(false),
    [activeSuggestion, setActiveSuggestion] = useState(0),
    [panel, setPanel] = useState(null),
    [name, setName] = useState(""),
    [desc, setDesc] = useState(""),
    [ipList, setIpList] = useState(""),
    [quotaEnabled, setQuotaEnabled] = useState(true),
    [quotaType, setQuotaType] = useState("日"),
    [quota, setQuota] = useState("10000"),
    [tpmEnabled, setTpmEnabled] = useState(false),
    [qpmEnabled, setQpmEnabled] = useState(false),
    [tpmLimit,setTpmLimit]=useState("100000"),
    [qpmLimit,setQpmLimit]=useState("1000"),
    [modelScope, setModelScope] = useState("限定范围"),
    [selectedModels, setSelectedModels] = useState([]),
    [copied, setCopied] = useState(""),
    [copiedValue, setCopiedValue] = useState(""),
    [action, setActionState] = useState(null),
    [formError, setFormError] = useState(""),
    [scopeQuery, setScopeQuery] = useState("");
  const setAction=value=>setActionState(value?{...value,revision:tenant.revision}:null);
  useEffect(() => {
    if (!copied && !copiedValue) return;
    const timer = setTimeout(() => { setCopied(""); setCopiedValue(""); }, 2000);
    return () => clearTimeout(timer);
  }, [copied, copiedValue]);
  const openPanel = (kind, key) => {
    setPanel({ kind, key, revision:tenant.revision });
    setName(key?.name || "");
    setDesc(key?.desc || "");
    setIpList((key?.ips || []).join("\n"));
    setTpmEnabled(key?.tpmLimit!=null);setQpmEnabled(key?.qpmLimit!=null);
    setTpmLimit(String(key?.tpmLimit ?? 100000));setQpmLimit(String(key?.qpmLimit ?? 1000));
    setFormError("");
    setSelectedModels(key?.models || []);
    setQuotaEnabled(kind==='create' || key?.quotaLimit!=null);
    setQuotaType(key?.quotaType || (kind==='edit'?'不限额度':'日'));
    setQuota(key?.quotaLimit==null?(kind==='edit'?'':'10000'):String(key.quotaLimit));
    setModelScope(key?.models ? "限定范围" : "全选");
  };
  const save = () => {
    if (name.trim().length < 2) return;
    let ips;
    try { ips = parseIpAllowlist(ipList); } catch (error) { setFormError(error.message); return; }
    if (modelScope === "限定范围" && !selectedModels.length) { setFormError("请至少选择一个模型"); return; }
    const access = { ips,tpmLimit:tpmEnabled?Number(tpmLimit):null,qpmLimit:qpmEnabled?Number(qpmLimit):null,quotaType,quotaEnabled:quotaEnabled && quotaType!=='不限额度',quotaLimit:!quotaEnabled || quotaType==='不限额度'?null:Number(quota), models: modelScope === "全选" ? null : selectedModels };
    let saved;
    if (panel.kind === "create")
      saved=setKeys([
        {
          name: name.trim(),
          id: `key-${crypto.randomUUID()}`,
          key: `sk-${crypto.randomUUID().replaceAll("-", "")}`,
          ...(subscription ? { subscriptionId: subscription.id } : {}),
          ...access,
          created: new Date().toLocaleString("sv-SE"),
          desc,
          enabled: true,
        },
        ...keys,
      ]);
    else
      saved=setKeys(
        keys.map((k) =>
          k.id === panel.key.id ? { ...k, name: name.trim(), desc, ...access } : k,
        ),
      );
    if(!saved)return;
    setPanel(null);
    setCopied(panel.kind === "create" ? "API Key 已创建" : "API Key 已保存");
  };
  const toggle = (key) =>
    setKeys(keys.map((k) => (k.id === key.id ? { ...k, enabled: !k.enabled } : k)));
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
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filteredKeys.length / size)));
  const visibleKeys = filteredKeys.slice((currentPage - 1) * size, currentPage * size);
  const chooseSuggestion = (key) => {
    setPage(1);
    setSelectedSearchId(key.id);
    setQuery(key.name);
    setSearchOpen(false);
  };
  return (
    <div className="api-key-page">
      {tenant.error && <p role="alert">{tenant.error}</p>}
      {!hideHeading && <div className="api-key-heading">
        <h1>API Key 管理</h1>
        <span>{billing}</span>
      </div>}
      <div className="api-key-tools">
        <div className="api-key-tools-leading">
        {subscription && <h2 className="token-plan-title" title={subscription.name}>{subscription.name}</h2>}
        <button className="primary" onClick={() => openPanel("create")}>
          创建 API Key
        </button>
        </div>
        <div>
          <div className="api-key-search" onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) setSearchOpen(false);
          }}>
            <label>
              <Search size={16} />
              <input
                role="combobox"
                aria-label="搜索 Key 名称或 Key ID"
                aria-autocomplete="list"
                aria-expanded={searchOpen}
                aria-controls={`api-key-suggestions-${keyScope}`}
                value={query}
                onFocus={() => setSearchOpen(true)}
                onChange={(e) => { setQuery(e.target.value); setPage(1); setSelectedSearchId(null); setActiveSuggestion(0); setSearchOpen(true); }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setSearchOpen(false);
                  if (e.key === "ArrowDown") { e.preventDefault(); setSearchOpen(true); setActiveSuggestion((activeSuggestion + 1) % Math.max(suggestions.length, 1)); }
                  if (e.key === "ArrowUp") { e.preventDefault(); setActiveSuggestion((activeSuggestion - 1 + Math.max(suggestions.length, 1)) % Math.max(suggestions.length, 1)); }
                  if (e.key === "Enter" && searchOpen && suggestions.length) { e.preventDefault(); chooseSuggestion(suggestions[activeSuggestion]); }
                }}
                placeholder="搜索 Key 名称或 Key ID"
              />
            </label>
            {searchOpen && <div className="api-key-search-menu" id={`api-key-suggestions-${keyScope}`} role="listbox" aria-label="Key 搜索建议">
              <button role="option" aria-selected={!query} onClick={() => { setQuery(""); setSelectedSearchId(null); setSearchOpen(false); }}>全部 Key</button>
              {suggestions.map((key, index) => <button key={key.id} role="option" aria-selected={selectedSearchId === key.id} className={index === activeSuggestion ? "is-active" : ""} onClick={() => chooseSuggestion(key)}><strong>{key.name}</strong><small>{key.id}</small></button>)}
              {!suggestions.length && <p>没有匹配的 Key</p>}
            </div>}
          </div>
          <button aria-label="刷新" onClick={tenant.reload}>
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
            "Key 名称/Key ID",
            "API Key",
            "状态",
            ...(subscription ? ["访问权限"] : ["访问范围", "安全与额度"]),
            "操作",
          ].map((x) => (
            <span key={x}>{x}</span>
          ))}
        </div>
        {visibleKeys
          .map((k) => (
            <div className="api-key-row" key={k.id}>
              <span className="api-key-identity">
                <b>{k.name}</b>
                <small className="key-id-line">
                  {k.id}
                  <button
                    className="inline-action"
                    aria-label={copiedValue === k.id ? "Key ID 已复制到剪贴板" : "复制 Key ID"}
                    title={copiedValue === k.id ? "已复制到剪贴板" : "复制 Key ID"}
                    onClick={() => copyText(k.id, "Key ID")}
                  >
                    {copiedValue === k.id ? <Check size={14} className="copy-success" /> : <Copy size={14} />}
                  </button>
                </small>
                <small>创建于 {k.created}</small>
              </span>
              <span className="api-key-value">
                {maskApiKey(k.key)}
                <button
                  className="inline-action"
                  aria-label={copiedValue === k.key ? "API Key 已复制到剪贴板" : "复制 API Key"}
                  disabled={!revealedKeys[k.id]}
                  title={!revealedKeys[k.id] ? "密钥仅在本次创建或重置后可复制" : copiedValue === k.key ? "已复制到剪贴板" : "复制 API Key"}
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
              <span className={subscription ? "api-key-security" : undefined}>
                {k.models === null ? <span className="key-unrestricted">无限制</span> : <button className="key-scope-link" onClick={() => { setAction({ kind: "models", key: k }); setScopeQuery(""); }}>{k.models.length} 个模型</button>}
                {subscription && <small><button className="key-ip-link" onClick={() => { setAction({ kind: "ip", key: k }); setIpList(k.ips.join("\n")); setFormError(""); }}>IP 白名单：{k.ips.length ? `${k.ips.length} 项` : "不限制"}</button>{k.desc ? ` · ${k.desc}` : ""}</small>}
              </span>
              {!subscription && <span className="api-key-security">
                <b>{k.quota || "未配置额度"} tokens</b>
                <i className="quota-bar">
                  <i style={{ width: `${k.progress || 0}%` }} />
                </i>
                <small>
                  <button className="key-ip-link" onClick={() => { setAction({ kind: "ip", key: k }); setIpList(k.ips.join("\n")); setFormError(""); }}>IP 白名单：{k.ips.length ? `${k.ips.length} 项` : "不限制"}</button>
                  {k.desc ? ` · ${k.desc}` : ""}
                </small>
              </span>}
              <span className="api-key-actions">
                <button onClick={() => openPanel("edit", k)}>编辑</button>
                <button onClick={() => setAction({ kind: "reset", key: k })}>重置</button>
                <button className="danger-link" onClick={() => setAction({ kind: "delete", key: k })}>删除</button>
              </span>
            </div>
          ))}
      </div>
      {!visibleKeys.length && <div className="v2-empty">{query ? "没有匹配的 API Key" : "暂无 API Key"}</div>}
      {copied && (
        <div className="copy-toast" role="status">
          {copied}
        </div>
      )}
      <Dialog open={Boolean(action)} onOpenChange={open => { if (!open) setAction(null); }}>
        <DialogContent className="key-action-dialog sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{action?.kind === "models" ? "可访问模型" : action?.kind === "ip" ? "IP 白名单" : action?.kind === "reset" ? "重置 API Key" : "删除 API Key"}</DialogTitle>
            <DialogDescription>{action?.key.name} · {action?.kind === "models" ? "查看此 Key 允许访问的模型" : action?.kind === "ip" ? "仅允许白名单来源调用；留空表示不限制。" : action?.kind === "reset" ? "重置后旧密钥立即失效，请及时替换业务系统中的密钥。Key ID、额度和访问权限保持不变。" : "删除后该 Key 将无法继续调用，且不可恢复。"}</DialogDescription>
          </DialogHeader>
          {action?.kind === "models" && <><input aria-label="搜索可访问模型" className="key-dialog-input" placeholder="搜索模型名称" value={scopeQuery} onChange={e => setScopeQuery(e.target.value)} /><div className="key-model-list">{(action.key.models === null ? editModels.map(([model]) => model) : action.key.models).filter(model => model.toLowerCase().includes(scopeQuery.toLowerCase())).map(model => <div key={model}>{model}</div>)}{!(action.key.models === null ? editModels.map(([model]) => model) : action.key.models).some(model => model.toLowerCase().includes(scopeQuery.toLowerCase())) && <div>没有匹配的模型</div>}</div><small>{action.key.models === null ? "可访问当前已授权的全部模型。" : `共 ${action.key.models.length} 个模型`}</small></>}
          {action?.kind === "ip" && <label className="key-ip-field">IPv4 地址 / CIDR 网段<textarea aria-label="IP 白名单" rows={5} value={ipList} onChange={e => { setIpList(e.target.value); setFormError(""); }} placeholder={"例如：10.0.1.100\n192.168.1.0/24"}/><small>多个地址用逗号或换行分隔，重复项自动合并。</small>{formError && <span role="alert" className="key-error">{formError}</span>}</label>}
          <DialogFooter><Button variant="outline" onClick={() => setAction(null)}>{action?.kind === "models" ? "关闭" : "取消"}</Button>{action?.kind !== "models" && <Button variant={action?.kind === "delete" ? "destructive" : "default"} onClick={() => {
            const target = action.key.id;
            if (action.kind === "ip") { let ips; try { ips = parseIpAllowlist(ipList); } catch (error) { setFormError(error.message); return; } if(!setKeys(keys.map(key => key.id === target ? { ...key, ips } : key)))return; setCopied("IP 白名单已保存"); }
            else if (action.kind === "reset") { if(!setKeys(keys.map(key => key.id === target ? { ...key, key: 'sk-' + crypto.randomUUID().replaceAll('-', ''),credentialVersion:(key.credentialVersion || 1)+1 } : key)))return; setCopied("API Key 已重置，请复制新密钥并更新调用配置"); }
            else { if(!setKeys(keys.filter(key => key.id !== target)))return; setCopied("API Key 已删除"); }
            setAction(null);
          }}>{action?.kind === "ip" ? "保存" : action?.kind === "reset" ? "确认重置" : "确认删除"}</Button>}</DialogFooter>
        </DialogContent>
      </Dialog>
      <FilterPagination total={filteredKeys.length} page={currentPage} size={size} onPageChange={setPage} onSizeChange={setSize}/>
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
              {subscription && <div className="token-plan-drawer-context">所属 Token Plan<strong>{subscription.name}</strong><small>订阅编号：{subscription.id}</small></div>}
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
                  {!subscription && <section className="edit-section">
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
                              aria-label="TPM 上限" value={tpmLimit} onChange={e=>setTpmLimit(e.target.value)}
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
                            <input aria-label="QPM 上限" disabled={!qpmEnabled} value={qpmLimit} onChange={e=>setQpmLimit(e.target.value)} />
                          </div>
                        </label>
                      </>
                    )}
                  </section>}
                  <section className="edit-section"><h3>IP 白名单</h3><label><span>允许的来源</span><div><textarea aria-label="编辑 IP 白名单" value={ipList} onChange={e => setIpList(e.target.value)} placeholder="IPv4 或 CIDR 网段，用逗号或换行分隔；留空不限制"/></div></label></section>
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
                                {tenant.orders.some(order=>['生效中','已开通'].includes(order.status)&&tenant.services.some(service=>service.id===order.serviceId&&service.modelId===model)) ? <em>已订购</em> : <><em>未订购</em><button onClick={()=>window.open(`/${'moma_5.12.0_estack'}/?page=model-order`,'_blank','noopener')}>去订购 →</button></>}
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
                  {!subscription && <div className="quota-label">
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
                  </div>}
                  {!subscription && quotaEnabled && (
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

const rankingModels = mockConfig["App.jsx"]["rankingModels"];
const rankingSeries = mockConfig["App.jsx"]["rankingSeries"];
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
      <FrontPageHeader title="模型排行榜" description="从调用趋势、性能与稳定性，多维了解模型表现" icon={ChartNoAxesCombined} />
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
  versionId = "moma_5.12.0_estack",
  historical = false,
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
  const tenant=useTenantData();
  const orderOwner=useRef(tenant.identity?.key);
  useEffect(()=>{if(orderOwner.current!==tenant.identity?.key){orderOwner.current=tenant.identity?.key;setSelectedOrders([]);setAgreed(false);setConfirming(false);setOrdered(false);}},[tenant.identity?.key]);
  const allRows = tenant.services.map(service=>{const order=tenant.orders.find(row=>row.serviceId===service.id && ['已开通','生效中'].includes(row.status));return [service.callId,service.mode==='standard'?'统一模型服务模式':'渠道直选模式',service.typeLabel,service.provider,customerPriceRows(service.salePrices).map(row=>row.name).join(' / '),customerPriceRows(service.salePrices).map(row=>row.currency+' '+row.amount+' / '+row.unit).join('\n'),order?'使用中':'未订购',order?.createdAt || '—',order?.expiresAt || '长期有效'];});
  const subscriptions = {'Token Plan订阅':tenant.plans.filter(row=>!row.product.name.includes('Coding')).map(row=>[row.product.name,'平台','Token Plan','平台','套餐权益',String(row.amount),'已订购',row.createdAt || '—',row.expiresAt || '长期有效']),'Coding Plan订阅':tenant.plans.filter(row=>row.product.name.includes('Coding')).map(row=>[row.product.name,'平台','Coding Plan','平台','套餐权益',String(row.amount),'已订购',row.createdAt || '—',row.expiresAt || '长期有效'])};
  const rows = (historical || tab === "按Token用量计费" ? allRows : subscriptions[tab] || []).filter(row => row[0].toLowerCase().includes(query.trim().toLowerCase()));
  const current = Math.min(page, Math.max(1, Math.ceil(rows.length / size)));
  const visibleRows = rows.slice((current - 1) * size, current * size);
  const changeTab = value => { setTab(value); setQuery(""); setPage(1); };
  const openOrder = (name) =>
    window.open(
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
    const orderRows = (tab === '按Token用量计费' ? allRows : []).filter(
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
              {[...new Set(allRows.map(row=>row[2]))].map(name=><option key={name}>{name}</option>)}
            </select>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
            >
              <option>全部模型服务商</option>
              {[...new Set(allRows.map(row=>row[3]))].map(name=><option key={name}>{name}</option>)}
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
          {tab !== '按Token用量计费' && <p role="status">本轮暂不提供新套餐订购；已有订阅读取后台订单，可在订购管理中查看。</p>}
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
          <span>长期有效</span>
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
                  <h2>模型服务已开通</h2>
                  <p>订购记录已保存，可返回订购管理查看。</p>
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
                      onClick={() => {try{if(tab!=='按Token用量计费')throw Error('暂无可订购套餐');orderTenantServices(selectedOrders.map(callId=>tenant.services.find(row=>row.callId===callId)?.id),tenant.revision);setOrdered(true);}catch(error){toast.error(error.message);}}}
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
          <button aria-label="刷新" onClick={tenant.reload}>
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

function PrototypeApp({ version }) {
  useState(()=>{try{loadAdminState(localStorage);}catch{/* Existing storage errors are surfaced by the affected workspace. */}return null;});
  const versionAdmin = "v2";
  const modeFromHash = () =>
    location.hash.startsWith("#/admin") ? versionAdmin : "front";
  if (location.pathname.includes("/order/serviceOrder"))
    return (
      <ModelOrderList standalone versionId={version.id} />
    );
  const versionNav = nav
    .map(([group, item]) => [
      group,
      { 语音生成: "语音识别" }[
        item
      ] || item,
    ])
    .filter(
      ([, item]) =>
        !["按量付费", "Token Plan"].includes(item),
    );
  const directory = useServiceDirectory();
  const [catalogueScope, setCatalogueScope] = useState('showcase');
  const models = useMemo(() => marketModels(directory.models, catalogueScope), [directory.models, catalogueScope]);
  const owner = directory.identity?.key || '';
  const [entryService, setEntryService] = useState(() => new URLSearchParams(location.search).get('service') || '');
  const [entryError, setEntryError] = useState('');
  const [entryConfirm, setEntryConfirm] = useState('');
  useEffect(() => { setEntryError(''); setEntryConfirm(''); }, [owner]);
  const [activePage, setActivePage] = useState(() => {
    const requestedPage = new URLSearchParams(location.search).get("page");
    return requestedPage === 'model-detail' ? '模型详情' : requestedPage === 'experience' ? ({text:'文本生成', image:'图片生成', video:'视频生成', voice:'语音识别'}[new URLSearchParams(location.search).get('task')] || '模型广场') : requestedPage === "model-order" ? "模型订购" : ({ "organization-members": "组织及成员", "operation-records": "操作记录", "api-keys": "API Key 管理", "account-certification": "账号认证", "call-logs": "调用日志", "usage-statistics": "用量统计" }[requestedPage] || "模型广场");
  }),
    [admin, setAdmin] = useState(modeFromHash),
    [adminBannerTarget, setAdminBannerTarget] = useState(null),
    [textCompare, setTextCompare] = useState(false),
    [query, setQuery] = useState(""),
    [filters, setFilters] = useState({}),
    [selected, setSelected] = useState(() => readModelDetail(location.search)),
    [sortMode, setSortMode] = useState("latest");
  const selectedCard = useRef('');
  useEffect(() => {
    const syncDetail = () => {
      const detail = readModelDetail(location.search);
      setSelected(detail); setEntryError(''); setEntryConfirm('');
      const page = new URLSearchParams(location.search).get('page');
      const query = new URLSearchParams(location.search);
      setEntryService(query.get('service') || '');
      setActivePage(detail ? '模型详情' : page === 'api-keys' ? 'API Key 管理' : page === 'experience' ? ({text:'文本生成',image:'图片生成',video:'视频生成',voice:'语音识别'}[query.get('task')] || '模型广场') : '模型广场');
    };
    window.addEventListener('popstate', syncDetail);
    return () => window.removeEventListener('popstate', syncDetail);
  }, []);
  useEffect(() => {
    if (activePage !== '模型详情' && readModelDetail(location.search)) history.replaceState(null, '', modelDetailLocation(location.href));
    if (activePage === '模型广场' && selectedCard.current) document.querySelector('[data-model-key="' + CSS.escape(selectedCard.current) + '"]')?.focus();
    if (activePage === '模型详情') { window.scrollTo(0, 0); document.querySelector('.market-detail-title h1')?.focus({ preventScroll: true }); }
  }, [activePage]);
  const selectDetailService = service => {
    setSelected({ modelKey: service.modelKey, id: service.id });
    setEntryError(''); setEntryConfirm('');
    history.replaceState(history.state, '', modelDetailLocation(location.href, service));
  };
  const openModelDetails = (_event, model) => {
    const service = model.services.find(row => row.provider === filters.provider) || model.services.find(row => row.callable) || model.services[0];
    selectedCard.current = model.modelKey;
    history.replaceState(null, '', modelDetailLocation(location.href));
    history.pushState({ marketFromList: true }, '', modelDetailLocation(location.href, service));
    setSelected({ modelKey: service.modelKey, id: service.id }); setEntryError(''); setEntryConfirm(''); setActivePage('模型详情');
  };
  const returnToMarket = () => {
    if (history.state?.marketFromList) { history.back(); return; }
    history.replaceState(null, '', modelDetailLocation(location.href));
    setSelected(null); setEntryError(''); setEntryConfirm(''); setActivePage('模型广场');
  };
  const [compactFilters, setCompactFilters] = useState(() => window.matchMedia('(max-width: 900px)').matches);
  const [filtersExpanded, setFiltersExpanded] = useState(() => !window.matchMedia('(max-width: 900px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 900px)');
    const change = () => { setCompactFilters(media.matches); setFiltersExpanded(!media.matches); };
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  const auth = usePrototypeAuth();
  const tenantAccess = tenantUserAccess(auth.state, 'personal');
  const enterprisePagesAllowed = !auth.storageError && tenantAccess.canViewOrganization;
  useEffect(() => {
    if (!enterprisePagesAllowed && ['组织及成员', '操作记录', '调用日志'].includes(activePage)) {
      setActivePage('模型广场');
      const query = new URLSearchParams(location.search);
      if (['organization-members', 'operation-records', 'call-logs'].includes(query.get('page'))) {
        query.delete('page');
        history.replaceState(null, '', location.pathname + (query.size ? '?' + query : '') + location.hash);
      }
    }
  }, [enterprisePagesAllowed, activePage]);
  useEffect(() => {
    const sync = () => {
      if (location.hash.startsWith("#/admin") && !location.hash.startsWith("#/admin-2")) {
        location.hash = "/admin-2/dashboard";
        return;
      }
      setAdmin(modeFromHash());
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [versionAdmin]);
  const navigateAdmin = (mode) => {
    const nextMode = mode === "front" ? "front" : versionAdmin;
    setAdmin(nextMode);
    if (mode === "front")
      history.replaceState(null, "", location.pathname + location.search);
    else location.hash = versionAdmin === "legacy" ? "/admin" : "/admin-2/dashboard";
  };
  const toggleFilter = (group, value) =>
    setFilters((current) => ({
      ...current,
      [group]: current[group] === value ? "" : value,
    }));
  const meta = m => ({ task: ({ text: ['文本与代码'], multimodal: ['多模态', '文本与代码'], image: ['图像'], video: ['视频'], voice: ['音频'], embedding: ['向量'], rerank: ['重排'] })[m.type] || [], input: m.input, output: m.outputModalities, author: m.maker, provider: m.providers });
  const enterExperience = selected => {
    try {
      const task = selected.tasks[0];
      beginExperience(selected.id, task);
      const draft = readExperienceDraft(owner, task);
      if (draft.model && draft.model !== selected.id && (draft.text || draft.file || draft.images?.length) && entryConfirm !== selected.id) { setEntryConfirm(selected.id); setEntryError('当前体验有未发送内容。切换模型将保留草稿，请确认后继续。'); return; }
      if (readModelDetail(location.search)) { const url = new URL(location.href); url.searchParams.set('page', 'experience'); url.searchParams.set('task', task); url.searchParams.set('service', selected.id); url.searchParams.delete('model'); history.pushState(null, '', url.pathname + url.search); }
      setEntryService(selected.id); setTextCompare(false); setSelected(null); setEntryError('');
      setActivePage({ text: '文本生成', image: '图片生成', video: '视频生成', voice: '语音识别' }[task]);
    } catch (error) { setEntryError(error.message); }
  };
  const visible = useMemo(
    () =>
      models
        .filter((m) => {
          const data = meta(m);
          return (
            [m.name, m.modelId, m.id].some(value => String(value ?? '').toLowerCase().includes(query.trim().toLowerCase())) &&
            Object.entries(filters).every(
              ([group, value]) =>
                !value ||
                (group === "context"
                  ? m.contextTokens != null && m.contextTokens / 1024 <= Number(value)
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
            ? (b.releaseDate || b.date).localeCompare(a.releaseDate || a.date)
            : Number(Boolean(b.hot)) - Number(Boolean(a.hot)) ||
              models.indexOf(a) - models.indexOf(b),
        ),
    [query, filters, sortMode, models],
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
  const catalogueFilters = (<div className="filters" id="catalogue-filters">
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
                  {[...new Set(models.map(model => model.maker))].map((x) => option("author", x))}
                </FilterSection>
                <FilterSection
                  title="推理服务商"
                  count={filters.provider ? 1 : 0}
                >
                  {[...new Set(models.flatMap(model => model.providers))].map((x) => option("provider", x))}
                </FilterSection>
              </div>);
  const filterLabels = {task:'任务分类', input:'输入', output:'输出', context:'上下文上限', author:'模型作者', provider:'推理服务商', series:'模型系列'};
  const activeFilters = Object.entries(filters).filter(([, value]) => Boolean(value));
  const removeFilter = group => setFilters(current => { const next = {...current}; delete next[group]; return next; });
  const filterToggle = <Button variant="outline" aria-expanded={filtersExpanded} aria-controls="catalogue-filters" onClick={compactFilters ? undefined : () => setFiltersExpanded(value => !value)}><SlidersHorizontal/>{filtersExpanded ? '收起筛选' : '展开筛选'}{activeFilters.length > 0 && ' · ' + activeFilters.length}</Button>;
  const catalogueToolbar = <section className="catalogue-tools" aria-label="模型查找">
    <div className="catalogue-toolbar">
      {compactFilters ? <Dialog open={filtersExpanded} onOpenChange={setFiltersExpanded}><DialogTrigger asChild>{filterToggle}</DialogTrigger><DialogContent className="catalogue-filter-drawer"><DialogHeader><DialogTitle>模型筛选</DialogTitle><DialogDescription className="sr-only">选择筛选条件查找模型</DialogDescription></DialogHeader>{catalogueFilters}</DialogContent></Dialog> : filterToggle}
      <div className="catalogue-search"><Search aria-hidden="true"/><Input aria-label="搜索模型" value={query} placeholder="搜索模型名称或模型 ID" onChange={event => { setQuery(event.target.value); }}/>{query && <Button variant="ghost" size="icon" aria-label="清除搜索" onClick={() => setQuery('')}><X/></Button>}</div>
      <span className="catalogue-count" role="status">{query.trim() || activeFilters.length ? '找到 ' : '模型 '}{visible.length} 个</span>
      <Select value={catalogueScope} onValueChange={setCatalogueScope}><SelectTrigger aria-label="模型目录范围"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="showcase">演示模型</SelectItem><SelectItem value="all">全部模型</SelectItem></SelectContent></Select><Select value={sortMode} onValueChange={setSortMode}><SelectTrigger aria-label="模型排序"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="latest">最新</SelectItem><SelectItem value="recommended">推荐</SelectItem></SelectContent></Select>
    </div>
    {(query.trim() || activeFilters.length > 0) && <div className="catalogue-conditions" aria-label="已选条件"><span>已选条件</span>{query.trim() && <Button variant="outline" size="sm" aria-label="移除搜索条件" onClick={() => setQuery('')}>搜索：{query.trim()}<X/></Button>}{activeFilters.map(([group,value]) => <Button key={group} variant="outline" size="sm" aria-label={'移除' + (filterLabels[group] || group) + '条件'} onClick={() => removeFilter(group)}>{filterLabels[group] || group}：{value}{group === 'context' ? 'K' : ''}<X/></Button>)}<Button variant="ghost" size="sm" onClick={resetFilters}>清空</Button></div>}
  </section>;

  return (
    <AdminUIContext.Provider value={admin === "v2"}><div className={`app-shell ${auth.route ? "auth-shell" : ""} ${auth.route ? "auth-enterprise-shell" : ""}`}>
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
          <div className="banner-version-tools">
            <DevelopmentNotes admin={admin === "v2"}/>
            <div className="version-switch">
              {admin === "v2" ? (
                <>
                  <span id="admin-version-picker-label" className="sr-only">切换版本</span>
                  <SemiSelect aria-labelledby="admin-version-picker-label" size="small" position="bottomRight" value={version.id}
                    onSelect={value => { if (value !== version.id) location.assign(`/${value}/`); }}
                    optionList={prototypeVersions.map(item => ({ value: item.id, label: item.id }))}/>
                </>
              ) : (
                <Select value={version.id} onValueChange={value => location.assign(`/${value}/`)}>
                  <SelectTrigger size="sm" aria-label="切换版本"><SelectValue /></SelectTrigger>
                  <SelectContent position="popper" align="end">
                    <SelectGroup>
                      {prototypeVersions.map(item => <SelectItem key={item.id} value={item.id}>{item.id}</SelectItem>)}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
          {admin === "front" ? (
            <button onClick={() => navigateAdmin(versionAdmin)}>后台</button>
          ) : admin === "legacy" && (
            <button className="active" onClick={() => navigateAdmin("front")}>返回前台</button>
          )}
          {admin === 'front' && auth.user && <span>{auth.state.activeSpace === 'personal' ? '个人用户' : '政企用户'}</span>}
          {admin === "front" ? <AuthBanner auth={auth} showToast /> : null}
        </div>
        {admin === "v2" && (
          <SemiButton className="admin-banner-return" type="tertiary" theme="borderless" size="small" onClick={() => navigateAdmin("front")}>返回前台</SemiButton>
        )}
      </header>
      {admin === "front" && !auth.route && (
        <aside>
          {versionNav.map(([group, item], i) => {
            const NavIcon = navIcons[item];
            return (
              <div key={item}>
                {group && i > 0 && <small>{group}</small>}
                <button
                  className={activePage === item || item === "模型广场" && activePage === "模型详情" ? "active" : ""}
                  onClick={() => {
                    setEntryService(''); setActivePage(item);
                    if (item === "文本生成")
                      setTextCompare(false);
                  }}
                >
                  {NavIcon && <NavIcon aria-hidden="true" />}
                  {item}
                </button>
              </div>
            );
          })}
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
            {enterprisePagesAllowed && <button className={activePage === "调用日志" ? "active" : ""} onClick={() => setActivePage("调用日志")}><FileText aria-hidden="true" />调用日志</button>}
          </div>
          <div>
            <small>账号管理</small>
            <button className={activePage === "API Key 管理" ? "active" : ""} onClick={() => setActivePage("API Key 管理")}><KeyRound aria-hidden="true" />API Key</button>
            {enterprisePagesAllowed && <button className={activePage === "组织及成员" ? "active" : ""} onClick={() => setActivePage("组织及成员")}><Users aria-hidden="true" />组织及成员</button>}
            {enterprisePagesAllowed && <button className={activePage === "操作记录" ? "active" : ""} onClick={() => setActivePage("操作记录")}><History aria-hidden="true" />操作记录</button>}
            <button className={activePage === "账号认证" ? "active" : ""} onClick={() => setActivePage("账号认证")}><ShieldCheck aria-hidden="true" />账号认证</button>
          </div>
        </aside>
      )}
      <main key={admin === "front" ? owner || "anonymous" : "admin"} className={admin !== "front" ? "admin-main" : "front-main"}>
        {auth.route ? (
          <AuthExperience key={auth.route} auth={auth} />
        ) : admin === "legacy" ? (
          <AdminConsole />
        ) : admin === "v2" ? (
          <AdminConsoleV2 bannerTarget={adminBannerTarget} />
        ) : activePage === "模型详情" ? (
          <MarketModelDetail services={directory.models} selected={selected} onSelect={selectDetailService} onBack={returnToMarket} onExperience={enterExperience} error={entryError} confirm={entryConfirm} onManageKeys={() => { const url = new URL(location.href); url.searchParams.set('page', 'api-keys'); url.searchParams.delete('model'); url.searchParams.delete('service'); history.pushState(null, '', url.pathname + url.search); setActivePage('API Key 管理'); }}/>
        ) : activePage === "智能路由" ? (
          <SmartRoute key={`${version.id}:${owner}`} versionId="moma_5.12.0_estack" onNavigate={setActivePage} />
        ) : activePage === "模型排行" ? (
          <ModelRanking />
        ) : activePage === "文本生成" ? (
          textCompare ? (
            <ModelComparison key={owner || "anonymous"} owner={owner}
              onBack={() => setTextCompare(false)}
            />
          ) : (
            <TextExperience key={`${owner}:text:${entryService}`} owner={owner} initialServiceId={entryService}
              imageUploadEnabled
              title="文本生成"
              onCompare={() => setTextCompare(true)}
            />
          )
        ) : activePage === "图片生成" || activePage === "视频生成" ? (
          <ModelExperience
            key={`${owner}:${activePage}:${entryService}`} owner={owner} initialServiceId={entryService}
            kind={activePage === "图片生成" ? "image" : "video"}
            groupLabel={activePage}
          />
        ) : activePage === "语音识别" ? (
          <ModelExperience
            key={`${owner}:voice:${entryService}`} owner={owner} initialServiceId={entryService}
            kind="voice"
            groupLabel="语音识别"
          />
        ) : activePage === "模型订购" ? (
          <ModelOrderList versionId={version.id} />
        ) : activePage === "账号认证" ? (
          <AuthExperience auth={{ ...auth, route: "account", close: () => setActivePage("模型广场") }} accountTitle="账号认证" />
        ) : activePage === "API Key 管理" ? (
          <UnifiedApiKeys key={owner || "anonymous"} />
        ) : activePage === "操作记录" && enterprisePagesAllowed ? (
          <OperationRecords />
        ) : activePage === "组织及成员" && enterprisePagesAllowed ? (
          <OrganizationMembers />
        ) : activePage === "调用观测" ? (
          <UsageStatistics key="observation" observation />
        ) : activePage === "用量统计" ? (
          <UsageStatistics />
        ) : activePage === "调用日志" && enterprisePagesAllowed ? (
          <CallLogs />
        ) : (
          <div className="content">

            {(directory.error || directory.identityError) && <p role="status">{directory.error || directory.identityError}</p>}
            {catalogueToolbar}
            <section className={`catalog catalogue-layout ${compactFilters || !filtersExpanded ? 'catalogue-collapsed' : ''}`}>
              {!compactFilters && <div hidden={!filtersExpanded}>{catalogueFilters}</div>}
              <div className="results">
                <div className="cards">
                  {visible.map((m) => {
                    const data = meta(m),
                      icons = {
                        文本: FileText,
                        图像: Image,
                        视频: Video,
                        音频: AudioLines,
                      },
                      outputs = data.output;
                    return (
                      <article
                        className="model-card"
                        data-model-key={m.modelKey}
                        key={m.id}
                        tabIndex={0} role="button" onKeyDown={event => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); openModelDetails(event, m); } }}
                        onClick={event => openModelDetails(event, m)}
                      >
                        {m.hot && (
                          <img className="hot" src={`${A}hot-7601e629.svg`} />
                        )}{" "}
                        {m.score && <span className="score">{m.score}</span>}
                        <h4>
                          {m.logo ? <img className="model-card-logo" src={m.logo} alt="" onError={event => { event.currentTarget.hidden = true; }}/> : <FileText aria-hidden="true" />}
                          {m.name}
                        </h4>
                        <small>{[m.typeLabel, m.provider].filter(Boolean).join(' · ')}</small><p>{m.desc}</p>
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
                          <span>{outputs.map(type => { const OutputIcon = icons[type] || FileText; return <OutputIcon key={type} aria-label={type}/>; })}</span>
                        </div>
                        <div className="context">上下文窗口：{m.context}</div>
                        <footer>{m.callable ? "可体验" : m.reason}{m.date && ` · 更新于 ${m.date}`}</footer>
                      </article>
                    );
                  })}
                </div>
                {!visible.length && <div className="empty">未找到符合条件的模型<Button variant="link" onClick={resetFilters}>清空条件</Button></div>}
              </div>
            </section>
          </div>
        )}
      </main>


    </div></AdminUIContext.Provider>
  );
}

export function App() {
  const version = prototypeVersions.find((item) =>
    location.pathname.startsWith(`/${item.id}/`),
  );
  return version ? <PrototypeApp version={version} /> : <VersionIndex />;
}
