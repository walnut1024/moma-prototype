import {loadAdminState} from './admin-v2/store.js';
import {useTenantData} from './useTenantData';
import {saveTenantRoutes} from './tenant-data.mjs';
import {toast} from 'sonner';
import { useServiceDirectory } from './useServiceDirectory';
import { marketModels, customerPriceRows } from './service-directory.mjs';
import MarketModelDetail from './MarketModelDetail';
import { MarketAction, MarketSessionControl, useCloudMarket } from './CloudMarket';
import { readModelDetail, modelDetailLocation } from './model-detail-route.mjs';
import { Button as SemiButton, ConfigProvider, Select as SemiSelect, Tabs as SemiTabs, Typography as SemiTypography } from '@douyinfe/semi-ui';
import zhCN from '@douyinfe/semi-ui/lib/es/locale/source/zh_CN.js';
import DevelopmentNotes from './admin-v2/DevelopmentNotes';
import { AdminUIContext } from './components/admin-ui-context';
import FrontPageHeader from "./components/FrontPageHeader";
import AuthExperience, { AuthBanner, usePrototypeAuth } from "./AuthExperience";
import { DEFAULT_SITE_LOGO, PRIVATE_SITE } from "./site-config.mjs";
import { agreementFromHash } from "./agreement-route.mjs";
import PublicAgreement from "./components/PublicAgreement";
import { restoreSiteImage, useSiteChrome, useSiteConfig } from "./useSiteConfig";
import OperationRecords from "./OperationRecords";
import { MODEL_ORDER_BILLING_TYPES, MODEL_ORDER_COLUMNS } from './model-order-display.mjs';
import { DEFAULT_PAGE_SIZE, FilterPagination } from "./components/FilterControls";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import ConsoleObservation from "./components/ConsoleObservation";
import UsageStatistics from "./components/UsageStatistics";
import SmartRouting from "./components/SmartRouting";
import ProjectWorkspace from "./components/ProjectWorkspace";
import WorkspaceCommerce from "./components/WorkspaceCommerce";
import { ProjectBudgetNotice } from "./components/ProjectOverview";
import UnifiedApiKeys from "./components/UnifiedApiKeys";
import { experiencePages, readProjectScope, useProjectSelection } from "./useProjectSelection";
import OrganizationMembers from "./OrganizationMembers";
import "./styles.css";
import "./token-plan-keys.css";
import "./version-index.css";
import "./model-order.css";
import "./ranking.css";
import ModelExperience from "./ModelExperience";
import { Tabs, TabsList, TabsTrigger } from "./components/ui/tabs";
import TextExperience from "./TextExperience";
import { tenantUserAccess } from "./tenant-user-type.mjs";
import ModelComparison from "./ModelComparison";
import AdminConsoleV2 from "./AdminConsoleV2";
import { shanghaiDate } from "./call-log-data.mjs";
import {
  Select,
  SelectContent,
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
  ExternalLink,
  FileText,
  FolderKanban,
  Image,
  Images,
  KeyRound,
  History,
  Languages,
  RefreshCw,
  Route,
  Search,
  SlidersHorizontal,
  X,
  ShoppingCart,
  ShieldCheck,
  Store,
  Users,
  Video,
} from "lucide-react";

import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./components/ui/dialog";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import "./frontend-pages.css";

const A = "/moma_5.12.0_estack/assets/";

const navIcons = {
  模型广场: Store,
  智能路由: Route,
  模型排行: Activity,
  文本生成: Languages,
  图片生成: Images,
  视频生成: Video,
  语音识别: AudioLines,
  模型订购: ShoppingCart,
  项目概览: FolderKanban,
  项目设置: ShieldCheck,
  模型体验: Languages,
  项目管理: FolderKanban,
  空间总览: FolderKanban,
  订购与账单: ShoppingCart,
  用量统计: ChartNoAxesCombined,
  调用观测: Activity,
  调用日志: FileText,
  "API Key 管理": KeyRound,
  组织及成员: Users,
  操作记录: History,
  账号认证: ShieldCheck,
  按量付费: KeyRound,
  "Token Plan": Calculator,
};
const frontPages = {
  'project-overview':'项目概览', 'project-settings':'项目设置',
  workspace:'空间总览', projects:'项目管理', market:'模型广场', 'model-detail':'模型详情',
  'model-order':'模型订购', billing:'订购与账单', 'api-keys':'API Key 管理',
  'organization-members':'组织及成员', 'operation-records':'操作记录', 'account-certification':'账号认证',
  'call-logs':'调用日志', 'usage-statistics':'用量统计', 'call-observation':'调用观测', 'smart-route':'智能路由',
};
const projectPages = {
  '项目概览':['project-overview'], '项目设置':['project-settings'],
  'API Key 管理':['api-keys'], 用量统计:['usage-statistics'], 调用日志:['call-logs'], 调用观测:['call-observation'],
  '模型体验':['experience', {task:'text'}],
  ...Object.fromEntries(Object.entries(experiencePages).map(([task, title]) => [title, ['experience', { task }]])),
};
function frontPage(params) {
  const page = params.get('page');
  const task = params.get('task');
  if (page === 'experience' && Object.hasOwn(experiencePages, task)) return experiencePages[task];
  if (Object.hasOwn(frontPages, page)) return frontPages[page];
  return PRIVATE_SITE ? '空间总览' : '模型广场';
}
const prototypeVersions = [
  {
    id: "moma_5.12.0_estack",
    state: "当前版本",
    releaseDate: "10月8日",
    changes: "基于 5.11.0 复制，独立迭代。",
  },
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
  auth,
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
    [provider, setProvider] = useState(""),
    [agreed, setAgreed] = useState(false),
    [confirming, setConfirming] = useState(false),
    [ordered, setOrdered] = useState(false),
    [detail, setDetail] = useState(null), [page, setPage] = useState(1), [size, setSize] = useState(DEFAULT_PAGE_SIZE);
  const tenant=useTenantData(), market=useCloudMarket();
  const openMarketLogin = () => auth.navigate('login');
  const orderOwner=useRef(market.tenant?.id), [submitting,setSubmitting]=useState(false);
  useEffect(()=>{
    if(orderOwner.current!==market.tenant?.id){
      orderOwner.current=market.tenant?.id;
      setSelectedOrders(initialModel && market.tenant ? [initialModel] : []);setAgreed(false);setConfirming(false);setOrdered(false);
    }
  },[market.tenant?.id,initialModel]);
  const orderServices=market.services.filter(service=>service.canOrder || service.ordered);
  const byCallId=new Map(orderServices.map(service=>[service.callId,service]));
  const allRows=orderServices.map(service=>{
    const prices=customerPriceRows(service.salePrices);
    return [service.callId,service.mode==='standard'?'统一模型服务模式':'渠道直选模式',service.typeLabel,service.provider,prices.map(row=>row.name).join(' / '),prices.map(row=>row.currency+' '+row.amount+' / '+row.unit).join('\n'),service.ordered?'使用中':'未订购',service.orderedAt ? shanghaiDate(new Date(service.orderedAt)) : '—','长期有效'];
  });
  const historicalRows=market.orders.filter(order=>!market.services.some(service=>service.id===order.offerId)).map(order=>[order.callId,'—','—','—','—','—',['gray','formal'].includes(order.stage)?'已订购':'已下架',shanghaiDate(new Date(order.createdAt)),'—']);
  const subscriptions = {'Token Plan订阅':tenant.plans.filter(row=>!row.product.name.includes('Coding')).map(row=>[row.product.name,'平台','Token Plan','平台','套餐权益',String(row.amount),'已订购',row.createdAt || '—',row.expiresAt || '长期有效']),'Coding Plan订阅':tenant.plans.filter(row=>row.product.name.includes('Coding')).map(row=>[row.product.name,'平台','Coding Plan','平台','套餐权益',String(row.amount),'已订购',row.createdAt || '—',row.expiresAt || '长期有效'])};
  const rows = (historical || tab === "按Token用量计费" ? [...allRows,...historicalRows] : subscriptions[tab] || []).filter(row => row[0].toLowerCase().includes(query.trim().toLowerCase()));
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
  if (standalone && auth.route === 'login') return <ConfigProvider locale={zhCN}>
    <main className="auth-enterprise-shell"><AuthExperience auth={auth} /></main>
  </ConfigProvider>;
  if (ordering) {
    const orderRows = (tab === '按Token用量计费' ? allRows : []).filter(
      (row) =>
        (!hideOrdered || row[6] === "未订购") &&
        row[0].toLowerCase().includes(query.toLowerCase()) &&
        (series === "全部模型系列" ||
          row[0].toLowerCase().startsWith(series.toLowerCase())) &&
        (modelType === "全部模型类别" || row[2] === modelType) &&
        (!provider || byCallId.get(row[0])?.providerId === provider),
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
          <MarketSessionControl market={market} onLogin={openMarketLogin}/>{market.error && <p role="alert">{market.error}</p>}
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
              <option value="">全部模型服务商</option>
              {[...new Map(orderServices.map(service=>[service.providerId,service.provider]))].map(([id,name])=><option key={id} value={id}>{name}</option>)}
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
            disabled={!market.tenant || !selectedOrders.length || !agreed}
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
                      disabled={submitting}
                      onClick={async()=>{
                        setSubmitting(true);
                        try {
                          if(tab!=='按Token用量计费')throw Error('暂无可订购套餐');
                          const ids=selectedOrders.map(callId=>market.services.find(row=>row.callId===callId && row.canOrder)?.id);
                          if(ids.some(id=>!id))throw Error('所选服务已有变化，请重新选择');
                          await market.order(ids);setOrdered(true);
                        }catch(error){toast.error(error.message);}
                        finally{setSubmitting(false);}
                      }}
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
        <MarketSessionControl market={market} onLogin={openMarketLogin}/>{market.error && <p role="alert">{market.error}</p>}
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
  const site = useSiteConfig();
  useSiteChrome(site);
  useState(()=>{try{loadAdminState(localStorage);}catch{/* Existing storage errors are surfaced by the affected workspace. */}return null;});
  const auth = usePrototypeAuth();
  const modeFromHash = () =>
    location.hash.startsWith("#/admin") ? "v2" : "front";
  if (location.pathname.includes("/order/serviceOrder")) {
    return site.personalEnabled ? <ModelOrderList standalone versionId={version.id} auth={auth} />
      : <div className="project-workspace"><FrontPageHeader title="内部模型服务"/>
        <a href={import.meta.env.BASE_URL}>返回使用空间</a></div>;
  }
  const directory = useServiceDirectory();
  const projectTenant = useTenantData({ usageReport:true });
  const [catalogueScope, setCatalogueScope] = useState('showcase');
  const owner = directory.identity?.key || '';
  const [projectScope, setProjectScope] = useState(readProjectScope);
  const [entryService, setEntryService] = useState(() => new URLSearchParams(location.search).get('service') || '');
  const [marketAction,setMarketAction]=useState(null);
  const [activePage, setActivePage] = useState(() => frontPage(new URLSearchParams(location.search))),
    [admin, setAdmin] = useState(modeFromHash),
    [adminBannerTarget, setAdminBannerTarget] = useState(null),
    [textCompare, setTextCompare] = useState(false),
    [query, setQuery] = useState(""),
    [filters, setFilters] = useState({}),
    [selected, setSelected] = useState(() => readModelDetail(location.search)),
    [sortMode, setSortMode] = useState("latest");
  const openMarketLogin = () => auth.navigate('login');
  const internal = !site.personalEnabled;
  const workspaceCatalogue = internal || Boolean(owner);
  const personal = projectTenant.identity?.spaceId === 'personal';
  const market=useCloudMarket(admin==='front' && !workspaceCatalogue && !auth.route && ['模型广场','模型详情'].includes(activePage));
  const marketServices=market.services;
  const projectOffers = new Map(activePage === '模型详情' && owner ? marketServices.flatMap(offer => {
    const local = directory.models.find(row => row.callable && row.callId === offer.callId && row.modelId === offer.modelId);
    return local ? [[offer.id, local]] : [];
  }) : []);
  const models = useMemo(() => marketModels(marketServices, catalogueScope), [marketServices, catalogueScope]);
  const marketProviders = new Map(models.flatMap(model => [...model.providers]));
  const selectedCard = useRef('');
  const projects = owner && projectTenant.identity?.key === owner ? projectTenant.projects : [];
  const { project, select:rememberProject } = useProjectSelection(owner, projects, activePage, projectScope);
  const openProjectPage = (row, page = 'projects', extra = {}) => {
    const query = new URLSearchParams({page,...(row ? {project:row.id} : {}),...extra});
    if (row?.status === '正常') rememberProject(row.id);
    const next = location.pathname + '?' + query + location.hash;
    if (next !== location.pathname + location.search + location.hash) history.pushState(null, '', next);
    setProjectScope(readProjectScope(query));
    setEntryService(query.get('service') || '');
    if (page === 'experience') setTextCompare(false);
    setActivePage(frontPage(query));
  };
  const showProjects = (row, tab) => openProjectPage(row, tab === 'keys' ? 'api-keys' : row ? tab && tab !== 'overview' ? 'project-settings' : 'project-overview' : 'projects', tab ? {tab} : {});
  const projectExperience = (row, service) => openProjectPage(row, 'experience',
    {task:service?.tasks?.[0] || 'text', ...(service ? {service:service.id} : {}) });
  useEffect(() => {
    if (personal && project && ['空间总览', '项目管理'].includes(activePage)) openProjectPage(project, 'project-overview');
  }, [personal, project?.id, activePage]);
  useEffect(() => {
    const syncDetail = () => {
      const detail = readModelDetail(location.search);
      setSelected(detail); setMarketAction(null);
      const query = new URLSearchParams(location.search);
      setProjectScope(readProjectScope(query));
      setEntryService(query.get('service') || '');
      setActivePage(detail ? '模型详情' : frontPage(query));
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
    history.replaceState(history.state, '', modelDetailLocation(location.href, service));
  };
  const openModelDetails = (_event, model) => {
    const service = model.services.find(row => row.providerId === filters.provider) || model.services.find(row => row.callable) || model.services[0];
    selectedCard.current = model.modelKey;
    history.replaceState(null, '', modelDetailLocation(location.href));
    history.pushState({ marketFromList: true }, '', modelDetailLocation(location.href, service));
    setSelected({ modelKey: service.modelKey, id: service.id }); setActivePage('模型详情');
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
  const tenantAccess = tenantUserAccess(auth.state, 'personal');
  const enterprisePagesAllowed = Boolean(owner) && !auth.storageError && tenantAccess.canViewOrganization;
  const tenantShell = useRef(null);
  const getTenantPopupContainer = useCallback(() => tenantShell.current ?? document.body, []);
  const spaceNav = [
    ...(owner && !personal ? [["", "空间总览"]] : []),
    ["", "模型广场"], ["", "智能路由"],
    ...(!internal && projectTenant.canManage ? [["", "订购与账单"]] : []),
    ...(!personal && owner ? [["", "项目管理"]] : []),
    ...(enterprisePagesAllowed ? [["", "组织及成员"]] : []),
  ];
  const projectNav = [
    ["", "项目概览", personal ? "概览" : "项目概览"],
    ["", "模型体验"], ["", "API Key 管理", "API Key"],
    ["", "调用观测"], ["", "项目设置", personal ? "使用设置" : "项目设置"],
  ];
  const tenantNav = personal ? [projectNav[0], ...spaceNav, ...projectNav.slice(1)] : [...spaceNav, ...projectNav];
  const currentNav = activePage === "模型详情" ? "模型广场"
    : Object.values(experiencePages).includes(activePage) ? "模型体验"
    : ['用量统计', '调用日志'].includes(activePage) ? '调用观测' : activePage;
  const navigateTenant = item => {
    if (item === "项目管理") { showProjects(); return; }
    if (projectPages[item]) {
      const [page, extra] = projectPages[item];
      openProjectPage(project, page, extra);
      return;
    }
    const page = Object.keys(frontPages).find(key => frontPages[key] === item);
    if (page) { openProjectPage(null, page); return; }
    history.replaceState(null, '', location.pathname + location.hash);
    setProjectScope(readProjectScope(new URLSearchParams()));
    setEntryService('');
    setActivePage(item);
    if (item === "文本生成") setTextCompare(false);
  };
  useEffect(() => {
    if (!enterprisePagesAllowed && (['组织及成员', '操作记录'].includes(activePage) || activePage === '调用日志' && !projectScope.id)) {
      setActivePage('模型广场');
      const query = new URLSearchParams(location.search);
      if (['organization-members', 'operation-records', 'call-logs'].includes(query.get('page'))) {
        query.delete('page');
        history.replaceState(null, '', location.pathname + (query.size ? '?' + query : '') + location.hash);
      }
    }
  }, [enterprisePagesAllowed, activePage, projectScope.id]);
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
  }, []);
  const navigateAdmin = (mode) => {
    if (mode === "front" && location.hash.split("?")[0] === "#/admin-2/site-configuration") {
      location.hash = "";
      return;
    }
    setAdmin(mode);
    if (mode === "front")
      history.replaceState(null, "", location.pathname + location.search);
    else location.hash = "/admin-2/dashboard";
  };
  const toggleFilter = (group, value) =>
    setFilters((current) => ({
      ...current,
      [group]: current[group] === value ? "" : value,
    }));
  const meta = m => ({ task: ({ text: ['文本与代码'], multimodal: ['多模态', '文本与代码'], image: ['图像'], video: ['视频'], voice: ['音频'], embedding: ['向量'], rerank: ['重排'] })[m.type] || [], input: m.input, output: m.outputModalities, author: m.maker });
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
                  : group === "provider"
                  ? m.providers.has(value)
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
  const option = (group, value, label = value) => (
    <button
      key={value}
      className={`filter-option ${filters[group] === value ? "selected" : ""}`}
      onClick={() => toggleFilter(group, value)}
    >
      <i />
      {label}
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
                  {[...marketProviders].map(([id, name]) => option("provider", id, name))}
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
    {(query.trim() || activeFilters.length > 0) && <div className="catalogue-conditions" aria-label="已选条件"><span>已选条件</span>{query.trim() && <Button variant="outline" size="sm" aria-label="移除搜索条件" onClick={() => setQuery('')}>搜索：{query.trim()}<X/></Button>}{activeFilters.map(([group,value]) => <Button key={group} variant="outline" size="sm" aria-label={'移除' + (filterLabels[group] || group) + '条件'} onClick={() => removeFilter(group)}>{filterLabels[group] || group}：{group === 'provider' ? marketProviders.get(value) || '服务商已不可用' : value}{group === 'context' ? 'K' : ''}<X/></Button>)}<Button variant="ghost" size="sm" onClick={resetFilters}>清空</Button></div>}
  </section>;

  const shell = (
    <AdminUIContext.Provider value={admin === "v2"}><div ref={tenantShell} className={`app-shell ${admin === "front" ? "tenant-semi" : ""} ${auth.route ? "auth-shell auth-enterprise-shell" : ""}`}>
      <header className={admin === "v2" ? "admin-banner" : undefined}>
        <div className="brand-mark">
          <img src={site.logo || DEFAULT_SITE_LOGO} alt="" onError={event => restoreSiteImage(event, DEFAULT_SITE_LOGO)} />
          {admin === "v2"
            ? <SemiTypography.Text strong>{site.name || '大模型服务平台运营运维中心'}</SemiTypography.Text>
            : <span>{site.name || '模型服务平台 MoMA 政企版'}</span>}
        </div>
        <div className="top-actions">
          {admin === "v2" && (
            <div className="admin-banner-controls" ref={setAdminBannerTarget}/>
          )}
          <div className="banner-version-tools">
            <DevelopmentNotes admin={admin === "v2"}/>
          </div>
          {admin === "front" ? (
            <SemiButton theme="borderless" onClick={() => navigateAdmin("v2")}>后台</SemiButton>
          ) : null}
          <AuthBanner auth={auth} showToast onSpaceChange={() => openProjectPage(null, 'workspace')}/>
        </div>
        {admin === "v2" && (
          <SemiButton className="admin-banner-return" type="tertiary" theme="borderless" size="small" onClick={() => navigateAdmin("front")}>返回前台</SemiButton>
        )}
      </header>
      {admin === "front" && !auth.route && (
        <aside className="tenant-nav" role="navigation" aria-label="用户面导航">
          {owner && <div className="tenant-space-name">{personal ? '个人空间' : projectTenant.identity?.tenantName}</div>}
          {tenantNav.map(([, item, label = item], index) => {
            const NavIcon = navIcons[item];
            return <div key={item} className="tenant-nav-item">
              {!personal && owner && index === spaceNav.length && <div className="tenant-project-context">
                <label id="tenant-project-label">当前项目</label>
                <SemiSelect aria-labelledby="tenant-project-label" value={project?.id || ''} placeholder="选择项目"
                  optionList={projects.filter(row => row.status === '正常').map(row => ({value:row.id, label:row.name}))}
                  onChange={id => {
                    const next = projects.find(row => row.id === id && row.status === '正常');
                    if (!next) return;
                    rememberProject(id);
                    const target = projectPages[activePage];
                    if (target) openProjectPage(next, ...target);
                  }} />
              </div>}
              <SemiButton theme="borderless" type="tertiary" className={currentNav === item ? "active" : undefined}
                aria-current={currentNav === item ? "page" : undefined}
                icon={NavIcon && <NavIcon size={15} aria-hidden="true" />} onClick={() => navigateTenant(item)}>{label}</SemiButton>
            </div>;
          })}
          <div className="tenant-nav-mobile">
            <span id="tenant-nav-label" className="sr-only">切换页面</span>
            <SemiSelect aria-labelledby="tenant-nav-label" value={currentNav} onSelect={navigateTenant}
              optionList={tenantNav.map(([, item, label = item]) => ({ value: item, label }))}/>
          </div>
        </aside>
      )}
      <main key={auth.route ? "auth" : admin === "front" ? owner || "anonymous" : "admin"} className={admin !== "front" ? "admin-main" : "front-main"}>
        {admin === 'front' && !auth.route && Object.values(experiencePages).includes(activePage) &&
          <div className="console-experience-tabs"><Tabs value={activePage} onValueChange={page => openProjectPage(project, 'experience', {task:Object.keys(experiencePages).find(task => experiencePages[task] === page)})}>
            <TabsList variant="line" aria-label="体验类型">{Object.values(experiencePages).map(page => <TabsTrigger key={page} value={page}>{page}</TabsTrigger>)}</TabsList>
          </Tabs></div>}
        {admin === 'front' && !auth.route && projectPages[activePage] && project?.canManage &&
          <div className="project-page-notice"><ProjectBudgetNotice project={project} spend={projectTenant.projectBudgets?.[project.id]} /></div>}
        {auth.route ? (
          <AuthExperience key={auth.route} auth={auth} />
        ) : admin === "v2" ? (
          <AdminConsoleV2 bannerTarget={adminBannerTarget} />
        ) : ["项目管理", "项目概览", "项目设置"].includes(activePage) ? (
          <ProjectWorkspace key={owner + activePage + projectScope.id} tenant={projectTenant}
            view={activePage === "项目管理" ? "detail" : activePage === "项目设置" ? "settings" : "overview"}
            initialTab={new URLSearchParams(location.search).get("tab") || undefined}
            projectId={activePage === "项目管理" ? projectScope.id : projectScope.id || project?.id} onOpen={showProjects} onList={() => showProjects()}
            onLogin={() => auth.navigate('login')} onExperience={projectExperience}
            onNavigate={(row, page, params) => openProjectPage(row, page === 'route' ? 'project-settings' : 'call-observation',
              page === 'route' ? {tab:'routes'} : {view:page === 'logs' ? 'logs' : 'usage', ...params})}
            renderKeys={(row,onModels,onAudit) => <UnifiedApiKeys key={row.id} project={row} onModels={onModels} onAudit={onAudit} internal={internal} embedded />} />
        ) : activePage === '空间总览' ? (
          <UsageStatistics key={owner} workspaceOverview internal={internal}/>
        ) : (workspaceCatalogue && ['模型广场','模型详情'].includes(activePage)) ||
          (['模型订购','订购与账单'].includes(activePage) && Boolean(owner)) ? (
          <WorkspaceCommerce key={owner + ':' + activePage} tenant={projectTenant} services={directory.models} internal={internal}
            view={activePage === '订购与账单' ? 'billing' : activePage === '模型订购' ? 'order' : 'catalogue'}
            onLogin={() => auth.navigate('login')} onOrder={() => openProjectPage(null, 'model-order')}
            onBilling={() => openProjectPage(null, 'billing')} onProjects={() => showProjects(project)}
            project={project} onExperience={projectExperience} onConfigure={row => showProjects(row, 'models')}
            onPlanOrder={() => window.open('/moma_5.12.0_estack/order/serviceOrder/', '_blank', 'noopener,noreferrer')}/>
        ) : activePage === "模型详情" ? (
          <><div className="market-detail-session"><MarketSessionControl market={market} onLogin={openMarketLogin}/></div>{market.loading || market.error ? <p className="content" role="status">{market.error || '正在加载模型广场…'}</p> : <MarketModelDetail services={marketServices} selected={selected} onSelect={selectDetailService} onBack={returnToMarket}
            projectOffers={projectOffers} onProjectExperience={offer => {
              if (!project) { showProjects(); return; }
              const local = projectOffers.get(offer.id);
              if (!local) return;
              setEntryService(local.id);
              setTextCompare(false);
              setActivePage(experiencePages[local.tasks[0]]);
            }} onExperience={service=>setMarketAction({kind:'call',service})} onOrder={service=>setMarketAction({kind:'order',service})}/>}
          {marketAction && <MarketAction key={marketAction.kind+marketAction.service.id} action={marketAction} market={market} close={()=>setMarketAction(null)}/>}</>
        ) : activePage === "智能路由" ? (
          <SmartRouting key={JSON.stringify([owner, projectScope.projectRules])}
            tenant={projectTenant} projectId={project?.id || projectScope.id}
            saveRoute={saveTenantRoutes}
            apiUrl={'$MOMA_BASE_URL/chat/completions'}
            openOrders={() => window.open('/moma_5.12.0_estack/order/serviceOrder/', '_blank', 'noopener,noreferrer')}
            openKeys={() => navigateTenant('API Key 管理')} />
        ) : activePage === "模型排行" ? (
          <ModelRanking />
        ) : Object.values(experiencePages).includes(activePage) && !project ? (
          <div className="project-panel project-experience-empty">
            <h2>{activePage}</h2><p>选择项目后开始在线体验。</p>
            <Button onClick={() => owner ? showProjects() : auth.navigate('login')}>{owner ? '前往项目管理' : '登录'}</Button>
          </div>
        ) : activePage === "文本生成" ? (
          textCompare ? (
          <ModelComparison key={project.id} owner={owner} project={project}
              onBack={() => setTextCompare(false)}
            />
          ) : (
            <TextExperience key={`${project.id}:text:${entryService}`} owner={owner} initialServiceId={entryService} project={project}
              imageUploadEnabled
              title="文本生成"
              onCompare={() => setTextCompare(true)}
            />
          )
        ) : activePage === "图片生成" || activePage === "视频生成" ? (
          <ModelExperience
            key={`${project.id}:${activePage}:${entryService}`} owner={owner} initialServiceId={entryService} project={project}
            kind={activePage === "图片生成" ? "image" : "video"}
            groupLabel={activePage}
          />
        ) : activePage === "语音识别" ? (
          <ModelExperience
            key={`${project.id}:voice:${entryService}`} owner={owner} initialServiceId={entryService} project={project}
            kind="voice"
            groupLabel="语音识别"
          />
        ) : activePage === "模型订购" ? (
          <ModelOrderList versionId={version.id} auth={auth} />
        ) : activePage === "账号认证" ? (
          <AuthExperience auth={{ ...auth, route: "account", close: () => setActivePage("模型广场") }} accountTitle="账号认证" />
        ) : activePage === "API Key 管理" ? (
          <UnifiedApiKeys key={project?.id || 'no-project'} project={project} onProjects={() => showProjects()} onModels={() => showProjects(project, 'models')} onAudit={() => showProjects(project, 'settings')} internal={internal}/>
        ) : ['操作记录', '组织及成员'].includes(activePage) && enterprisePagesAllowed ? (
          <div className="console-organization"><SemiTabs activeKey={activePage === '操作记录' || new URLSearchParams(location.search).get('tab') === 'audit' ? 'audit' : 'members'}
            onChange={tab => openProjectPage(null, 'organization-members', {tab})}
            tabList={[{itemKey:'members',tab:'组织与成员'}, {itemKey:'audit',tab:'操作记录'}]} />
            {activePage === '操作记录' || new URLSearchParams(location.search).get('tab') === 'audit' ? <OperationRecords /> : <OrganizationMembers />}
          </div>
        ) : ['调用观测', '用量统计', '调用日志'].includes(activePage) ? (
          <ConsoleObservation key={owner + ':' + project?.id} project={project} projectScope={projectScope}
            view={activePage === '调用日志' ? 'logs' : activePage === '用量统计' ? 'usage' : new URLSearchParams(location.search).get('view')}
            onView={view => openProjectPage(project, 'call-observation', {view})} internal={internal} />
        ) : (
          <div className="content">

            <MarketSessionControl market={market} onLogin={openMarketLogin}/>
            {(market.loading || market.error) && <p role="status">{market.error || '正在加载模型广场…'}</p>}
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
  return admin === "front" ? <ConfigProvider locale={zhCN} getPopupContainer={getTenantPopupContainer}>{shell}</ConfigProvider> : shell;
}

function subscribeAgreementRoute(update) {
  addEventListener('hashchange', update);
  return () => removeEventListener('hashchange', update);
}

function activeAgreementRoute() {
  return PRIVATE_SITE ? agreementFromHash(location.hash) : null;
}

export function App() {
  const documentKey = useSyncExternalStore(subscribeAgreementRoute, activeAgreementRoute);
  const version = prototypeVersions.find((item) =>
    location.pathname.startsWith(`/${item.id}/`),
  );
  return version ? (documentKey ? <PublicAgreement documentKey={documentKey} /> : <PrototypeApp version={version} />) : <VersionIndex />;
}
