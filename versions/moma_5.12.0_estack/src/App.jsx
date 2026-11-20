import {loadAdminState} from './admin-v2/store.js';
import {useTenantData} from './useTenantData';
import {accountProjects, saveTenantRoutes} from './tenant-data.mjs';
import {toast} from 'sonner';
import { useServiceDirectory } from './useServiceDirectory';
import { marketModels, customerPriceRows } from './service-directory.mjs';
import MarketModelDetail from './MarketModelDetail';
import { useDeploymentLicense } from './useDeploymentLicense';
import { MarketAction, MarketSessionControl, useCloudMarket } from './CloudMarket';
import { readModelDetail, modelDetailLocation } from './model-detail-route.mjs';
import { Button as SemiButton, Checkbox, ConfigProvider, Input, Select as SemiSelect, Slider, Table, Tabs as SemiTabs, Tag, Typography as SemiTypography } from '@douyinfe/semi-ui';
import zhCN from '@douyinfe/semi-ui/lib/es/locale/source/zh_CN.js';
import DevelopmentNotes from './admin-v2/DevelopmentNotes';
import { AdminUIContext } from './components/admin-ui-context';
import FrontPageHeader from "./components/FrontPageHeader";
import AuthExperience, { AuthBanner, usePrototypeAuth } from "./AuthExperience";
import { DEFAULT_SITE_LOGO, DEFAULT_USER_CONSOLE_NAME, DEFAULT_WORKBENCH_NAME, PRIVATE_SITE } from "./site-config.mjs";
import { agreementFromHash } from "./agreement-route.mjs";
import PublicAgreement from "./components/PublicAgreement";
import { restoreSiteImage, useSiteChrome, useSiteConfig } from "./useSiteConfig";
import OperationRecords from "./OperationRecords";
import { MODEL_ORDER_BILLING_TYPES, MODEL_ORDER_COLUMNS } from './model-order-display.mjs';
import { DEFAULT_PAGE_SIZE, FilterPagination } from "./components/FilterControls";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
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
import TextExperience from "./TextExperience";
import { tenantUserAccess } from "./tenant-user-type.mjs";
import ModelComparison from "./ModelComparison";
import AdminConsoleV2 from "./AdminConsoleV2";
import { shanghaiDate } from "./call-log-data.mjs";
import {
  Activity,
  ArrowRight,
  AudioLines,
  Calculator,
  ChartNoAxesCombined,
  ExternalLink,
  FileText,
  FolderKanban,
  Image,
  Images,
  KeyRound,
  History,
  Languages,
  Plug,
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

import { AdminModal, AdminSideSheet } from './admin-v2/AdminOverlay';
import "./frontend-pages.css";

const A = "/moma_5.12.0_estack/assets/";
const ToolAccess = lazy(() => import("./components/ToolAccess"));

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
  我的项目: FolderKanban,
  模型体验: Languages,
  项目管理: FolderKanban,
  空间总览: FolderKanban,
  订购与账单: ShoppingCart,
  用量统计: ChartNoAxesCombined,
  调用观测: Activity,
  调用日志: FileText,
  "API Key 管理": KeyRound,
  工具接入: Plug,
  组织及成员: Users,
  操作记录: History,
  账号认证: ShieldCheck,
  按量付费: KeyRound,
  "Token Plan": Calculator,
};
const frontPages = {
  'project-overview':'项目概览', 'project-settings':'项目设置',
  workspace:'空间总览', 'my-projects':'我的项目', projects:'项目管理', market:'模型广场', 'model-detail':'模型详情',
  'model-order':'模型订购', billing:'订购与账单', 'api-keys':'API Key 管理',
  'organization-members':'组织及成员', 'operation-records':'操作记录', 'account-certification':'账号认证',
  'call-logs':'调用日志', 'usage-statistics':'用量统计', 'call-observation':'调用观测', 'smart-route':'智能路由',
  'tool-access':'工具接入',
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
    return [service.callId,service.mode==='standard'?'统一模型服务模式':'渠道直选模式',service.typeLabel,service.provider,prices.map(row=>row.name).join(' / '),prices.map(row=>row.currency+' '+row.amount+' / '+row.unit).join('\n'),service.ordered?'使用中':'未订购',service.orderedAt ? shanghaiDate(new Date(service.orderedAt)) : '—','长期有效',service.id];
  });
  const historicalRows=market.orders.filter(order=>!market.services.some(service=>service.id===order.offerId)).map(order=>[order.callId,'—','—','—','—','—',['gray','formal'].includes(order.stage)?'已订购':'已下架',shanghaiDate(new Date(order.createdAt)),'—',order.id]);
  const subscriptions = {'Token Plan订阅':tenant.plans.filter(row=>!row.product.name.includes('Coding')).map(row=>[row.product.name,'平台','Token Plan','平台','套餐权益',String(row.amount),'已订购',row.createdAt || '—',row.expiresAt || '长期有效',row.id]),'Coding Plan订阅':tenant.plans.filter(row=>row.product.name.includes('Coding')).map(row=>[row.product.name,'平台','Coding Plan','平台','套餐权益',String(row.amount),'已订购',row.createdAt || '—',row.expiresAt || '长期有效',row.id])};
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
  const lines = cell => cell.split("\n").map((text, index) => <small key={index}>{text}</small>);
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
    const columns = [
      { key:'select', width:50, title:<Checkbox aria-label="全选可订购规格" disabled={!availableNames.length}
        checked={allAvailableSelected} onChange={() => setSelectedOrders(allAvailableSelected
          ? selectedOrders.filter(name => !availableNames.includes(name))
          : [...new Set([...selectedOrders, ...availableNames])])}/>,
        render:(_, {row}) => <Checkbox aria-label={'选择 ' + row[0]} disabled={row[6] !== '未订购'}
          checked={selectedOrders.includes(row[0])} onChange={() => toggleOrder(row[0])}/> },
      { title:'模型名称', width:250, render:(_, {row}) => <div className="order-record"><b>{row[0]}</b><small>{row[1]}</small></div> },
      { title:'模型服务商', width:140, render:(_, {row}) => row[3] },
      { title:'模型类别', width:140, render:(_, {row}) => row[2] },
      { title:'状态', width:100, render:(_, {row}) => <Tag color={row[6] === '未订购' ? 'blue' : 'grey'}>{row[6] === '未订购' ? '可订购' : '已订购'}</Tag> },
      { title:'资费场景', width:200, render:(_, {row}) => <div className="order-record">{lines(row[4])}
        {row[4].startsWith('共 ') && <SemiButton theme="borderless" size="small" onClick={() => setDetail({
          title:row[0] + ' 资费场景', content:row[4] + '，参考价格 ' + row[5],
        })}>查看详情</SemiButton>}</div> },
      { title:'参考价格', width:180, render:(_, {row}) => <div className="order-record">{lines(row[5])}</div> },
    ];
    async function submitOrder() {
      if (submitting) return;
      setSubmitting(true);
      try {
        if (tab !== '按Token用量计费') throw Error('暂无可订购套餐');
        const ids = selectedOrders.map(callId => market.services.find(row => row.callId === callId && row.canOrder)?.id);
        if (ids.some(id => !id)) throw Error('所选服务已有变化，请重新选择');
        await market.order(ids);
        setOrdered(true);
      } catch (error) { toast.error(error.message); }
      finally { setSubmitting(false); }
    }
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
              <SemiButton
                className={tab === x ? "active" : ""}
                onClick={() => resetSelection(x)}
                key={x}
              >
                <b>{x}</b>
                <small>{description}</small>
              </SemiButton>
            ))}
          </div>
          <p className="rate-tip">
            限流说明：高峰期可能会出现调用错误提示，建议错峰使用
          </p>
          <div className="service-filter">
            <strong>
              <i>*</i> 资源规格
            </strong>
            <SemiSelect aria-label="模型系列" value={series} onChange={setSeries}
              optionList={['全部模型系列','DeepSeek','GLM','Kimi','AICC'].map(value => ({value,label:value}))}/>
            <SemiSelect aria-label="模型类别" value={modelType} onChange={setModelType}
              optionList={['全部模型类别', ...new Set(allRows.map(row => row[2]))].map(value => ({value,label:value}))}/>
            <SemiSelect aria-label="模型服务商" value={provider} onChange={setProvider}
              optionList={[{value:'',label:'全部模型服务商'}, ...Array.from(new Map(orderServices.map(service =>
                [service.providerId,service.provider])), ([value,label]) => ({value,label}))]}/>
            <Input className="order-search" aria-label="按模型名称搜索" prefix={<Search size={15}/>}
              value={query} onChange={value => { setQuery(value); setPage(1); }} placeholder="按模型名称搜索"/>
            <Checkbox className="hide-ordered" checked={hideOrdered} onChange={event => setHideOrdered(event.target.checked)}>隐藏已订购规格</Checkbox>
          </div>
          {tab !== '按Token用量计费' && <p role="status">本轮暂不提供新套餐订购；已有订阅读取后台订单，可在订购管理中查看。</p>}
          <Table className="service-order-table" columns={columns} dataSource={orderRows.map(row => ({id:row[9],row}))}
            rowKey="id" size="small" pagination={false} scroll={{x:1060}} empty="暂无符合条件的规格"/>
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
          <Checkbox checked={agreed} onChange={event => setAgreed(event.target.checked)}>我已阅读并同意</Checkbox>
          <div className="agreements">
            {[
              "移动云产品销售协议",
              "智算平台使用声明",
              "模型服务平台MoMA服务使用声明",
              "模型服务平台MoMA服务等级协议",
            ].map((title) => (
              <SemiButton
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
              </SemiButton>
            ))}
          </div>
        </section>
        <footer className="service-order-footer">
          <div>
            配置费用：<b>{feeLabel}</b>
            <small>参考价格，具体扣费请以账单为准</small>
            <SemiButton
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
            </SemiButton>
          </div>
          <SemiButton theme="solid"
            disabled={!market.tenant || !selectedOrders.length || !agreed}
            onClick={() => setConfirming(true)}
          >
            确认订单
          </SemiButton>
        </footer>
        {confirming && <AdminModal visible title={ordered ? '模型服务已开通' : '确认订单'} closable={!submitting}
          closeOnEsc={!submitting} maskClosable={!submitting} onCancel={() => setConfirming(false)}
          footer={ordered
            ? <SemiButton theme="solid" onClick={() => { setConfirming(false); closeOrder(); }}>返回订购管理</SemiButton>
            : <><SemiButton disabled={submitting} onClick={() => setConfirming(false)}>取消</SemiButton>
              <SemiButton theme="solid" loading={submitting} onClick={submitOrder}>确认订购</SemiButton></>}>
          {ordered ? <p>订购记录已保存，可返回订购管理查看。</p> : <>
            <p>请确认以下模型规格及计费方式。</p>
            <dl className="order-confirm-facts"><dt>计费方式</dt><dd>{tab}</dd>
              <dt>订购规格</dt><dd>{selectedOrders.join('、')}</dd><dt>配置费用</dt><dd>{feeLabel}</dd></dl>
          </>}
        </AdminModal>}
        {detail && <AdminModal visible title={detail.title} onCancel={() => setDetail(null)} maskClosable
          footer={<SemiButton theme="solid" onClick={() => setDetail(null)}>我知道了</SemiButton>}>
          <p>{detail.content}</p>
        </AdminModal>}
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
      {!historical ? <div className="us-page"><SemiTabs activeKey={tab} onChange={changeTab} aria-label="模型订购计费方式"
        tabList={Object.values(MODEL_ORDER_BILLING_TYPES).map(tab => ({itemKey:tab,tab}))}/></div> : <nav className="legacy-tabs">
        {(historical
          ? ["按Token用量计费", "Token Plan订阅"]
          : [
              "按Token用量计费",
              "Token Plan订阅",
              "Coding Plan订阅",
            ]
        ).map((x) => (
          <SemiButton
            className={tab === x ? "active" : ""}
            onClick={() => setTab(x)}
            key={x}
          >
            {x}
          </SemiButton>
        ))}
      </nav>}
      <section className="legacy-panel">
        <MarketSessionControl market={market} onLogin={openMarketLogin}/>{market.error && <p role="alert">{market.error}</p>}
        <div className="legacy-order-tools">
          <span>
            <SemiButton theme="solid" className="legacy-primary" onClick={() => openOrder()}>
              <ShoppingCart size={15} />
              立即订购
            </SemiButton>
            <SemiButton disabled>批量退订</SemiButton>
          </span>
          <Input className="order-search" prefix={<Search size={15}/>} aria-label="搜索订购记录"
            value={query} onChange={value => { setQuery(value); setPage(1); }}
            placeholder={tab === '按Token用量计费' ? '请按模型名称搜索' : '搜索套餐名称'}/>
          <SemiButton theme="borderless" aria-label="刷新" icon={<RefreshCw size={15}/>} onClick={tenant.reload}/>
        </div>
        <Table className="legacy-order-table" rowKey="id" dataSource={visibleRows.map(row => ({id:row[9],row}))}
          size="small" pagination={false} scroll={{x:1060}} empty={historical ? '' : '暂无符合条件的订购记录'}
          columns={[
            { key:'select', width:50, title:<Checkbox aria-label="全选订购记录"/>, render:() => <Checkbox aria-label="选择订购记录"/> },
            { title:historical || tab === '按Token用量计费' ? '模型名称' : '套餐名称', width:240,
              render:(_, {row}) => <div className="order-record"><b>{row[0]}</b><small>{row[1]}</small></div> },
            ...[historical ? '模型类别' : '类型', ...MODEL_ORDER_COLUMNS.slice(1,-1)].map((title,index) => ({
              title, key:title, render:(_, {row}) => <div className="order-record">{lines(row[index + 2])}</div>,
            })),
            { title:'操作', width:116, render:(_, {row}) => <>
              {row[6] === '未订购' && <SemiButton size="small" theme="borderless" onClick={() => openOrder(row[0])}>订购</SemiButton>}
              <SemiButton size="small" theme="borderless">更多 ⌄</SemiButton>
            </> },
          ]}/>
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
  const workbenchName = site.workbenchName || DEFAULT_WORKBENCH_NAME;
  const deploymentLicense = useDeploymentLicense();
  useSiteChrome(site);
  useState(()=>{try{loadAdminState(localStorage);}catch{/* Existing storage errors are surfaced by the affected workspace. */}return null;});
  const auth = usePrototypeAuth();
  const modeFromHash = () =>
    location.hash.startsWith("#/admin") ? "v2" : "front";
  if (location.pathname.includes("/order/serviceOrder")) {
    return site.personalEnabled ? <ConfigProvider locale={zhCN}><ModelOrderList standalone versionId={version.id} auth={auth} /></ConfigProvider>
      : <div className="project-workspace"><FrontPageHeader title="内部模型服务"/>
        <a href={import.meta.env.BASE_URL + (PRIVATE_SITE ? '?page=workspace' : '')}>返回使用空间</a></div>;
  }
  const directory = useServiceDirectory();
  const projectTenant = useTenantData({ usageReport:true });
  const [catalogueScope, setCatalogueScope] = useState('showcase');
  const owner = directory.identity?.key || '';
  const [projectScope, setProjectScope] = useState(readProjectScope);
  const [projectAction, setProjectAction] = useState(null);
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
  const workspaceCatalogue = Boolean(owner) || internal && !deploymentLicense?.managed;
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
  const projectParams = new URLSearchParams(location.search);
  const projectSource = !personal && projectTenant.canManage && (activePage === '项目管理' || projectParams.get('from') === 'projects') ? 'projects'
    : projectParams.get('from') === 'api-keys' ? 'api-keys' : 'my-projects';
  const projectTab = projectParams.get('tab');
  const openProjectPage = (row, page = 'projects', extra = {}) => {
    const query = new URLSearchParams({page,...(row ? {project:row.id} : {}),...extra});
    if (row?.status === '正常' && (!row.spaceId || row.spaceId === projectTenant.identity?.spaceId)) rememberProject(row.id);
    const next = location.pathname + '?' + query + location.hash;
    if (next !== location.pathname + location.search + location.hash) history.pushState(null, '', next);
    setProjectScope(readProjectScope(query));
    setEntryService(query.get('service') || '');
    setProjectAction(null);
    if (page === 'experience') setTextCompare(false);
    setActivePage(frontPage(query));
  };
  const showProjects = (row, tab, from = projectSource, action) => {
    if (!row) { openProjectPage(null, from === 'projects' ? 'projects' : 'my-projects'); return; }
    if (row.spaceId && row.spaceId !== auth.state.activeSpace) {
      try {
        if (!auth.spaces.some(space => space.id === row.spaceId)) throw Error('该空间当前不可访问');
        auth.commit({ ...auth.state, activeSpace:row.spaceId });
      } catch (error) { toast.error(error.message); return; }
    }
    const page = personal && tab === 'keys' ? 'api-keys'
      : personal && tab && tab !== 'overview' ? 'project-settings' : 'project-overview';
    openProjectPage(row, page, { ...(tab ? {tab} : {}), ...(!personal ? {from} : {}) });
    if (action) setProjectAction(action);
  };
  const projectExperience = (row, service) => openProjectPage(row, 'experience',
    {task:service?.tasks?.[0] || 'text', ...(service ? {service:service.id} : {}) });
  useEffect(() => {
    if (personal && project && ['空间总览', '我的项目', '项目管理'].includes(activePage)) openProjectPage(project, 'project-overview');
  }, [personal, project?.id, activePage]);
  useEffect(() => {
    const syncDetail = () => {
      const detail = readModelDetail(location.search);
      setSelected(detail); setMarketAction(null);
      const query = new URLSearchParams(location.search);
      setProjectScope(readProjectScope(query));
      setEntryService(query.get('service') || '');
      setProjectAction(null);
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
  const enterprisePagesAllowed = Boolean(owner) && projectTenant.canManage && !auth.storageError && tenantAccess.canViewOrganization;
  let myProjects;
  if (activePage === '我的项目' && owner && !personal && !auth.storageError) {
    try { myProjects = accountProjects(auth.state, auth.spaces); }
    catch { /* The project page surfaces storage errors from the current tenant. */ }
  }
  const tenantShell = useRef(null);
  const getTenantPopupContainer = useCallback(() => tenantShell.current ?? document.body, []);
  const spaceNav = [
    ...(owner && !personal ? [["", "空间总览"]] : []),
    ["", "模型广场"], ["", "智能路由"],
    ...(!personal && owner ? [["", "我的项目"]] : []),
    ["", "工具接入"],
  ];
  const projectNav = [
    ["", "模型体验"], ["", "API Key 管理", "API Key"],
    ["", "调用观测"],
  ];
  const billingNav = !internal && projectTenant.canManage ? [["", "订购与账单"]] : [];
  const tenantNav = personal ? [["", "项目概览", "概览"], ...spaceNav, ...projectNav, ...billingNav, ["", "项目设置", "使用设置"]]
    : [...spaceNav, ...projectNav, ...billingNav, ...(enterprisePagesAllowed ? [["企业管理", "项目管理"], ["", "组织及成员"]] : [])];
  const currentNav = activePage === "模型详情" ? "模型广场"
    : Object.values(experiencePages).includes(activePage) ? "模型体验"
    : !personal && ["项目概览", "项目设置"].includes(activePage) ? frontPages[projectSource]
    : ['用量统计', '调用日志'].includes(activePage) ? '调用观测' : activePage;
  const navigateTenant = item => {
    if (item === "项目管理") { openProjectPage(null, 'projects'); return; }
    if (item === "API Key 管理" && !personal && project) { showProjects(project, 'keys', 'api-keys'); return; }
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
    if (owner && !personal && !enterprisePagesAllowed && activePage === '项目管理') openProjectPage(null, 'my-projects');
    if (!enterprisePagesAllowed && (['组织及成员', '操作记录'].includes(activePage) || activePage === '调用日志' && !projectScope.id)) {
      setActivePage('模型广场');
      const query = new URLSearchParams(location.search);
      if (['organization-members', 'operation-records', 'call-logs'].includes(query.get('page'))) {
        query.delete('page');
        history.replaceState(null, '', location.pathname + (query.size ? '?' + query : '') + location.hash);
      }
    }
  }, [enterprisePagesAllowed, activePage, projectScope.id, owner, personal]);
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
  const marketAuthors = new Map(), marketSeries = new Map();
  for (const model of models) {
    const item = model.classification;
    if (item?.authorId) marketAuthors.set(item.authorId, item.author);
    if (item?.seriesId && (!filters.author || item.authorId === filters.author)) {
      marketSeries.set(item.seriesId, filters.author ? item.series : `${item.series} · ${item.author}`);
    }
  }
  const meta = m => ({ task: ({ text: ['文本与代码'], multimodal: ['多模态', '文本与代码'], image: ['图像'], video: ['视频'], voice: ['音频'], embedding: ['向量'], rerank: ['重排'] })[m.type] || [], input: m.input, output: m.outputModalities, author: m.classification?.authorId });
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
                  ? m.classification?.seriesId === value
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
      onClick={() => group === 'author'
        ? setFilters(current => ({ ...current, author: current.author === value ? '' : value, series: '' }))
        : toggleFilter(group, value)}
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
                  <Slider className="filter-range" min={4} max={1024} value={filters.context || 1024}
                    onChange={context => setFilters(current => ({...current, context}))} aria-label="上下文长度上限" />
                </FilterSection>
                <FilterSection title="模型作者" count={filters.author ? 1 : 0}>
                  {[...marketAuthors].map(([id, name]) => option("author", id, name))}
                </FilterSection>
                {marketSeries.size > 0 && <FilterSection title="模型系列" count={filters.series ? 1 : 0}>
                  {[...marketSeries].map(([id, name]) => option("series", id, name))}
                </FilterSection>}
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
  const catalogueToolbar = <section className="catalogue-tools" aria-label="模型查找">
    <div className="catalogue-toolbar">
      <SemiButton theme="outline" aria-expanded={filtersExpanded} aria-controls="catalogue-filters"
        icon={<SlidersHorizontal/>} onClick={() => setFiltersExpanded(value => !value)}>
        {filtersExpanded ? '收起筛选' : '展开筛选'}{activeFilters.length > 0 && ' · ' + activeFilters.length}
      </SemiButton>
      {compactFilters && filtersExpanded && <AdminSideSheet visible title="模型筛选" placement="left" width="min(360px, 100vw)"
        onCancel={() => setFiltersExpanded(false)} className="catalogue-filter-sheet">{catalogueFilters}</AdminSideSheet>}
      <Input className="catalogue-search-input" aria-label="搜索模型" prefix={<Search size={15} aria-hidden="true"/>}
        value={query} placeholder="搜索模型名称或模型 ID" onChange={setQuery} showClear/>
      <span className="catalogue-count" role="status">{query.trim() || activeFilters.length ? '找到 ' : '模型 '}{visible.length} 个</span>
      <SemiSelect value={catalogueScope} onChange={setCatalogueScope} aria-label="模型目录范围"
        optionList={[{value:'showcase',label:'演示模型'},{value:'all',label:'全部模型'}]} />
      <SemiSelect value={sortMode} onChange={setSortMode} aria-label="模型排序"
        optionList={[{value:'latest',label:'最新'},{value:'recommended',label:'推荐'}]} />
    </div>
    {(query.trim() || activeFilters.length > 0) && <div className="catalogue-conditions" aria-label="已选条件"><span>已选条件</span>{query.trim() && <SemiButton theme="outline" size="small" aria-label="移除搜索条件" onClick={() => setQuery('')}>搜索：{query.trim()}<X/></SemiButton>}{activeFilters.map(([group,value]) => <SemiButton key={group} theme="outline" size="small" aria-label={'移除' + (filterLabels[group] || group) + '条件'} onClick={() => removeFilter(group)}>{filterLabels[group] || group}：{group === 'provider' ? marketProviders.get(value) || '服务商已不可用' : value}{group === 'context' ? 'K' : ''}<X/></SemiButton>)}<SemiButton theme="borderless" size="small" onClick={resetFilters}>清空</SemiButton></div>}
  </section>;

  const shell = (
    <AdminUIContext.Provider value={admin === "v2"}><div ref={tenantShell} className={`app-shell ${admin === "front" ? "tenant-semi" : ""} ${auth.route ? "auth-shell auth-enterprise-shell" : ""}`}>
      <header className={admin === "v2" ? "admin-banner" : auth.route ? undefined : "tenant-banner"}>
        <div className="brand-mark">
          <img src={site.logo || DEFAULT_SITE_LOGO} alt="" onError={event => restoreSiteImage(event, DEFAULT_SITE_LOGO)} />
          {admin === "v2"
            ? <SemiTypography.Text strong>{workbenchName}</SemiTypography.Text>
            : <SemiTypography.Text strong>{site.userConsoleName || DEFAULT_USER_CONSOLE_NAME}</SemiTypography.Text>}
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
          {tenantNav.map(([group, item, label = item], index) => {
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
                    if (['项目概览', '项目设置'].includes(activePage)) showProjects(next, projectTab || undefined);
                    else {
                      const target = projectPages[activePage];
                      if (target) openProjectPage(next, ...target);
                    }
                  }} />
              </div>}
              {group && <div className="tenant-nav-group-label">{group}</div>}
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
          <div className="console-experience-tabs"><SemiTabs activeKey={activePage} onChange={page => openProjectPage(project, 'experience', {task:Object.keys(experiencePages).find(task => experiencePages[task] === page)})}
            aria-label="体验类型" tabList={Object.values(experiencePages).map(page => ({itemKey:page,tab:page}))} /></div>}
        {admin === 'front' && !auth.route && projectPages[activePage] && project?.canManage &&
          <div className="project-page-notice"><ProjectBudgetNotice project={project} spend={projectTenant.projectBudgets?.[project.id]} /></div>}
        {auth.route ? (
          <AuthExperience key={auth.route} auth={auth} />
        ) : admin === "v2" ? (
          <AdminConsoleV2 bannerTarget={adminBannerTarget} workbenchName={workbenchName} />
        ) : ["我的项目", "项目管理", "项目概览", "项目设置"].includes(activePage) ? (
          <ProjectWorkspace key={JSON.stringify([owner, activePage, projectScope.id, projectTab])} tenant={projectTenant}
            listMode={activePage === '我的项目' ? 'mine' : 'manage'} myProjects={myProjects}
            listLabel={projectSource === 'projects' ? '项目管理' : '我的项目'}
            view={!personal ? 'detail' : activePage === "项目设置" ? "settings" : "overview"}
            initialTab={projectTab || (activePage === '项目设置' ? 'settings' : undefined)}
            initialAction={projectAction} onActionClose={() => setProjectAction(null)}
            projectId={['我的项目', '项目管理'].includes(activePage) ? projectScope.id : projectScope.id || project?.id}
            onOpen={showProjects} onList={() => showProjects()}
            onLogin={() => auth.navigate('login')} onExperience={projectExperience}
            onNavigate={(row, page, params) => page === 'route' ? showProjects(row, 'routes')
              : openProjectPage(row, 'call-observation', {view:page === 'logs' ? 'logs' : 'usage', ...params})}
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
          <><div className="market-detail-session"><MarketSessionControl market={market} onLogin={openMarketLogin}/></div>{market.loading || market.error ? <p className="content" role="status">{market.error || '正在加载模型广场…'}</p> : <MarketModelDetail internal={internal} services={marketServices} selected={selected} onSelect={selectDetailService} onBack={returnToMarket}
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
            <SemiButton onClick={() => owner ? showProjects() : auth.navigate('login')}>{owner ? '前往项目管理' : '登录'}</SemiButton>
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
        ) : activePage === "工具接入" ? (
          <Suspense fallback={<p role="status">正在加载工具接入指南…</p>}>
            <ToolAccess onOpenMarket={() => navigateTenant('模型广场')} onOpenKeys={() => navigateTenant('API Key 管理')} />
          </Suspense>
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
                {!visible.length && <div className="empty">未找到符合条件的模型<SemiButton theme="borderless" onClick={resetFilters}>清空条件</SemiButton></div>}
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
