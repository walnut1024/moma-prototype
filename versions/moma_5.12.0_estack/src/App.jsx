import {useTenantData} from './useTenantData';
import { marketModels, customerPriceRows } from './service-directory.mjs';
import MarketModelDetail from './MarketModelDetail';
import ConsoleNavigation from './components/ConsoleNavigation';
import OrganizationWorkspace from './components/OrganizationWorkspace';
import ConsoleHome from './components/ConsoleHome';
import { consoleActiveItem } from './console-navigation.mjs';
import { projectModelEnabled } from './project-access.mjs';
import WorkspaceBilling from './components/WorkspaceBilling';
import { MarketAction, marketRequest, useCloudMarket } from './CloudMarket';
import { readModelDetail, modelDetailLocation } from './model-detail-route.mjs';
import { Banner, Button as SemiButton, Checkbox, ConfigProvider, Modal, RadioGroup, Input as SemiInput, Select as SemiSelect, Slider, Table, Tabs as SemiTabs, Tag, Toast, Typography as SemiTypography } from '@douyinfe/semi-ui';
import zhCN from '@douyinfe/semi-ui/lib/es/locale/source/zh_CN.js';
import DevelopmentNotes from './admin-v2/DevelopmentNotes';
import { AdminSideSheet as SideSheet } from './admin-v2/AdminOverlay';
import { AdminUIContext } from './components/admin-ui-context';
import FrontPageHeader from "./components/FrontPageHeader";
import AuthExperience, { AuthBanner, CustomerSessionGate, useAuthNavigation } from "./AuthExperience";
import { DEFAULT_SITE_LOGO, DEFAULT_USER_CONSOLE_NAME, DEFAULT_WORKBENCH_NAME, PRIVATE_SITE } from "./site-config.mjs";
import { agreementFromHash } from "./agreement-route.mjs";
import PublicAgreement from "./components/PublicAgreement";
import { restoreSiteImage, useSiteChrome, useSiteConfig } from "./useSiteConfig";
import SmartRouting from "./components/SmartRouting";
import ProjectWorkspace from "./components/ProjectWorkspace";
import { ProjectBudgetNotice } from "./components/ProjectOverview";
import UnifiedApiKeys from "./components/UnifiedApiKeys";
import { experiencePages, readProjectScope, useProjectSelection } from "./useProjectSelection";
import { MODEL_ORDER_BILLING_TYPES, MODEL_ORDER_BILLING_LABELS, MODEL_ORDER_COLUMNS } from './model-order-display.mjs';
import { DEFAULT_PAGE_SIZE, FilterPagination } from "./components/FilterControls";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import UsageStatistics from "./components/UsageStatistics";
import { ProjectModels, ProjectSettings } from "./components/ProjectConfiguration";
import "./styles.css";
import "./token-plan-keys.css";
import "./version-index.css";
import "./model-order.css";
import "./ranking.css";
import ModelExperience from "./ModelExperience";
import CallLogs from "./CallLogs";
import TextExperience from "./TextExperience";
import ModelComparison from "./ModelComparison";
import AdminConsoleV2 from "./AdminConsoleV2";
import { shanghaiDate } from "./call-log-data.mjs";
import {
  Activity,
  ArrowRight,
  AudioLines,
  Calculator,
  ChartNoAxesCombined,
  FileText,
  Image,
  Images,
  KeyRound,
  History,
  House,
  Languages,
  RefreshCw,
  Route,
  Search,
  SlidersHorizontal,
  Plug,
  X,
  ShoppingCart,
  ShieldCheck,
  Store,
  FolderKanban,
  Video,
} from "lucide-react";

import "./frontend-pages.css";

const A = "/moma_5.12.0_estack/assets/";

const ToolConnection = lazy(() => import('./components/ToolConnection'));

const navIcons = {
  首页: House, 项目: FolderKanban, 工具接入: Plug,
  概览: ChartNoAxesCombined, 项目概览: ChartNoAxesCombined, 模型体验: Languages, 使用设置: SlidersHorizontal, 项目设置: SlidersHorizontal,
  项目管理: FolderKanban, 我的项目: FolderKanban,
  空间总览: ChartNoAxesCombined,
  模型广场: Store,
  智能路由: Route,
  模型排行: Activity,
  文本生成: Languages,
  图片生成: Images,
  视频生成: Video,
  语音识别: AudioLines,
  模型订购: ShoppingCart,
  订购与账单: FileText,
  用量统计: ChartNoAxesCombined,
  调用观测: Activity,
  运行表现: Activity,
  调用日志: FileText,
  "API Key": KeyRound, "API 密钥": KeyRound,
  操作记录: History,
  账户管理: ShieldCheck,
  按量付费: KeyRound,
  "Token Plan": Calculator,
};
const prototypeVersions = [
  {
    id: "moma_5.12.0_estack",
    state: "当前版本",
    label: "5.12.0",
    releaseDate: "10月8日",
  },
];

function ModelRanking() {
  const [metric,setMetric]=useState('模型调用量'),[scale,setScale]=useState('log');
  const [range,setRange]=useState(7),[hotRange,setHotRange]=useState(7),[hidden,setHidden]=useState([]),[hovered,setHovered]=useState(null);
  const [view,setView]=useState({rows:[],error:'',loading:true});
  useEffect(()=>{
    const controller=new AbortController();
    marketRequest('ranking',null,controller.signal).then(data=>setView({...data,error:'',loading:false}))
      .catch(error=>{if(!controller.signal.aborted)setView({rows:[],error:error.message,loading:false});});
    return ()=>controller.abort();
  },[]);
  const today=Date.parse(shanghaiDate(new Date())+'T00:00:00+08:00');
  const dayAt=offset=>shanghaiDate(new Date(today+offset*86400000));
  const summed=new Map();
  for(const row of view.rows.filter(item=>item.day>=dayAt(1-hotRange))) {
    const prior=summed.get(row.id);
    summed.set(row.id,{...row,tokens:row.tokens+(prior?.tokens || 0),calls:row.calls+(prior?.calls || 0)});
  }
  const hot=[...summed.values()].sort((a,b)=>b.tokens-a.tokens || b.calls-a.calls).slice(0,10);
  const models=[...new Map(view.rows.map(row=>[row.id,row])).values()];
  const color=id=>rankColors[models.findIndex(row=>row.id===id)%rankColors.length];
  const mode=metric==='模型调用量'?'tokens':metric==='模型性能'?'duration':'successes';
  const unit=mode==='tokens'?' Token':mode==='duration'?' ms':'%';
  const fmt=value=>new Intl.NumberFormat('zh-CN',{maximumFractionDigits:1}).format(value)+unit;
  const days=Array.from({length:range},(_,index)=>{
    const day=dayAt(index+1-range), label=day.slice(5).replace(/^0/,'').replace('-','/');
    const rows=view.rows.filter(row=>row.day===day && !hidden.includes(row.id));
    const calls=rows.reduce((sum,row)=>sum+row.calls,0);
    const segments=rows.map(row=>({...row,value:mode==='tokens'?row.tokens:mode==='duration'?(row.duration || 0)/calls:100*row.successes/calls}));
    return {day,label,segments,total:segments.reduce((sum,row)=>sum+row.value,0)};
  });
  const max=Math.max(1,...days.map(row=>row.total));
  const hover=hovered==null?null:days[hovered];
  const chooseRange=event=>{setHovered(null);setRange(Number(event.target.value));};
  return <div className="ranking-page">
    <FrontPageHeader title="模型排行榜" description="公开上架模型的模拟调用表现" icon={ChartNoAxesCombined}/>
    <div className="metric-tabs">{['模型调用量','模型性能','模型稳定性'].map(label=><button key={label} className={metric===label?'active':''} onClick={()=>setMetric(label)}>{label}</button>)}</div>
    <section className="rank-panel trend-panel">
      <div className="panel-title"><div><h2>{mode==='tokens'?'Token 调用趋势':mode==='duration'?'平均耗时趋势':'调用成功率趋势'}</h2>
        <p>按北京时间统计，最多保留最近 7 天的模拟调用</p></div>
        <div className="chart-tools"><select aria-label="时间范围" value={range} onChange={chooseRange}><option value={7}>近 7 日</option><option value={30}>近 30 日</option></select>
          <div className="scale-switch" aria-label="坐标刻度">{[['linear','线性'],['log','对数']].map(([id,label])=><button key={id} className={scale===id?'active':''} onClick={()=>setScale(id)}>{label}</button>)}</div></div>
      </div>
      {view.error && <p role="alert">{view.error}</p>}
      {!view.error && !view.rows.length && <p role="status">{view.loading?'正在加载…':'暂无公开模型的模拟调用记录'}</p>}
      <div className={`stacked-chart ${scale}`} onMouseLeave={()=>setHovered(null)}>
        <div className="chart-axis">{(scale==='log'?[max,Math.expm1(Math.log1p(max)/2),0]:[max,max/2,0]).map((value,index)=><span key={index}>{fmt(value)}</span>)}</div>
        <div className="chart-grid-lines"/>
        <div className="chart-bars">{days.map(({label,day,total,segments},index)=><div key={day} className="chart-column">
          <div className="stacked-bar" tabIndex={0} aria-label={day+'，'+fmt(total)} onMouseEnter={()=>setHovered(index)} onFocus={()=>setHovered(index)}
            style={{height:100*(scale==='log'?Math.log1p(total)/Math.log1p(max):total/max)+'%'}}>
            {segments.filter(row=>row.value>0).map(row=><i key={row.id} style={{height:(100*row.value/total)+'%',background:color(row.id)}}/>)}
          </div>
          <small>{index===0 || index===days.length-1 || index%4===0?label:''}</small>
        </div>)}</div>
        {hover && <div className="chart-tooltip" style={{'--tip-x':((hovered+.5)/days.length*100)+'%'}}><b>{hover.day}</b>
          {hover.segments.map(row=><span key={row.id}><i style={{background:color(row.id)}}/>{row.name}<strong>{fmt(row.value)}</strong></span>)}
          <em>{fmt(hover.total)}</em></div>}
      </div>
      <div className="chart-legend">{models.map(row=><button key={row.id} className={hidden.includes(row.id)?'muted':''}
        onClick={()=>setHidden(current=>current.includes(row.id)?current.filter(id=>id!==row.id):[...current,row.id])}>
        <i style={{background:color(row.id)}}/>{row.name}</button>)}</div>
    </section>
    <section className="rank-panel"><div className="panel-title"><div><h2>热门模型</h2><p>按 Token 用量排序</p></div>
      <select aria-label="热门模型时间范围" value={hotRange} onChange={event=>setHotRange(Number(event.target.value))}><option value={7}>近 7 日</option><option value={30}>近 30 日</option></select></div>
      <div className="rank-list">{hot.map((row,index)=><button key={row.id} type="button">
        <b>{index+1}</b><img alt="" src={A+'model-1.jpg'}/><span>{row.name}<small>{row.maker}</small></span>
        <strong>{new Intl.NumberFormat('zh-CN',{notation:'compact'}).format(row.tokens)} Tokens</strong></button>)}</div>
    </section>
  </div>;
}

function ModelOrderList({
  standalone = false,
  versionId = "moma_5.12.0_estack",
  auth,
  initialCheckout,
}) {
  const initialModel = standalone
    ? new URLSearchParams(location.search).get("model")
    : "";
  const [embeddedCheckout, setEmbeddedCheckout] = useState(Boolean(initialCheckout));
  const [tab, setTab] = useState(initialCheckout || MODEL_ORDER_BILLING_TYPES.payg),
    [query, setQuery] = useState(""),
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
  const market=useCloudMarket(), tenant=useTenantData({enabled:Boolean(market.tenant)});
  const canCheckout=tenant.canManage && tenant.identity?.tenantId === market.tenant?.id;
  const orderOwner=useRef(market.tenant?.id), [submitting,setSubmitting]=useState(false),[quote,setQuote]=useState([]);
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
    return [service.callId,service.name,service.typeLabel,service.providerName,prices.map(row=>row.name).join(' / '),prices.map(row=>row.currency+' '+row.amount+' / '+row.unit).join('\n'),service.ordered?'使用中':'未订购',service.orderedAt ? shanghaiDate(new Date(service.orderedAt)) : '—','长期有效',`service:${service.id}`];
  });
  const historicalRows=market.orders.filter(order=>order.stage==='cancelled' || !market.services.some(service=>service.id===order.offerId)).map(order=>[order.callId,'—','—','—','—','—',order.stage==='cancelled'?'已退订':['gray','formal'].includes(order.stage)?'已订购':'已下架',shanghaiDate(new Date(order.createdAt)),'—',`order:${order.id}`]);
  const subscriptions = {'Token Plan订阅':tenant.plans.filter(row=>!row.product.name.includes('Coding')).map(row=>[row.product.name,'平台','Token Plan','平台','套餐权益',String(row.amount),'已订购',row.createdAt || '—',row.expiresAt || '长期有效',`subscription:${row.id}`]),'Coding Plan订阅':tenant.plans.filter(row=>row.product.name.includes('Coding')).map(row=>[row.product.name,'平台','Coding Plan','平台','套餐权益',String(row.amount),'已订购',row.createdAt || '—',row.expiresAt || '长期有效',`subscription:${row.id}`])};
  const payg=tab===MODEL_ORDER_BILLING_TYPES.payg;
  const options=values=>values.map(value=>({value,label:value}));
  const billingOptions=Object.entries(MODEL_ORDER_BILLING_TYPES).map(([key,value])=>({value,label:MODEL_ORDER_BILLING_LABELS[key]}));
  const lines=value=>value.split("\n").map((text,index)=><small key={index}>{text}</small>);
  const rows = (payg ? [...allRows,...historicalRows] : subscriptions[tab] || []).filter(row => [row[0], row[1]].some(value => value.toLowerCase().includes(query.trim().toLowerCase())));
  const current = Math.min(page, Math.max(1, Math.ceil(rows.length / size)));
  const visibleRows = rows.slice((current - 1) * size, current * size);
  const changeTab = value => { setTab(value); setQuery(""); setPage(1); };
  const orderListUrl = `/${versionId}/?page=model-order`;
  const openOrder = name => {
    setSelectedOrders(name ? [name] : []);
    setQuery('');
    setAgreed(false);
    setOrdered(false);
    setEmbeddedCheckout(true);
    window.scrollTo(0, 0);
  };
  const backToOrders = () => {
    if (standalone) { location.assign(orderListUrl); return; }
    const next = new URL(location.href);
    next.searchParams.delete('checkout');
    if (next.href !== location.href) history.replaceState(history.state, '', next);
    setConfirming(false);
    setSelectedOrders([]);
    setQuote([]);
    setAgreed(false);
    setOrdered(false);
    setEmbeddedCheckout(false);
    setPage(1);
  };
  const toggleOrder = (name) =>
    setSelectedOrders((current) =>
      current.includes(name)
        ? current.filter((x) => x !== name)
        : [...current, name],
    );
  const waitingForSession=standalone && auth.requiresSession && !market.tenant;
  if (standalone && (waitingForSession || auth.route)) return <ConfigProvider locale={zhCN}>
    <main className="auth-enterprise-shell">{waitingForSession ? <CustomerSessionGate auth={auth} market={market} />
      : <AuthExperience auth={auth} market={market} />}</main>
  </ConfigProvider>;
  if (market.tenant?.internal) return <div className="content"><h1>企业内用</h1><p>模型使用权限由项目管理员分配。</p><a href={`/${versionId}/?page=model-market`}>返回模型广场</a></div>;
  if (standalone || embeddedCheckout && canCheckout) {
    const packageOffers=(market.packages || []).filter(row=>row.coding===(tab===MODEL_ORDER_BILLING_TYPES.coding));
    const packageRows=packageOffers.map(row=>[row.id,row.name,row.kind==='pack'?'资源包':'订阅套餐','平台',
      Number(row.quota).toLocaleString('zh-CN')+' 万 Token','CNY '+row.price,'未订购']);
    const orderRows=(payg ? allRows : packageRows).filter(row=>
      (!hideOrdered || row[6]==='未订购') &&
      (payg ? [row[0], row[1]] : [row[1]]).some(value => value.toLowerCase().includes(query.trim().toLowerCase())) &&
      (!payg || ((series==='全部模型系列' || row[0].toLowerCase().startsWith(series.toLowerCase())) &&
        (modelType==='全部模型类别' || row[2]===modelType) && (!provider || byCallId.get(row[0])?.providerId===provider))),
    );
    const available=orderRows.filter(row=>row[6]==='未订购').map(row=>row[0]);
    const allSelected=available.length>0 && available.every(id=>selectedOrders.includes(id));
    const feeLabel=payg?'按实际使用量收费':'按套餐额度抵扣';
    const changeOrderTab=next=>{setTab(next);setSelectedOrders([]);setAgreed(false);};
    const changeQuote=()=>{
      const selected=selectedOrders.map(id=>payg
        ? market.services.find(row=>row.callId===id && row.canOrder)
        : packageOffers.find(row=>row.id===id));
      if(selected.some(row=>!row)){Toast.error('所选服务已有变化，请重新选择');return;}
      setQuote(selected);setConfirming(true);
    };
    const submitOrder=async()=>{
      if(submitting)return;
      setSubmitting(true);
      try{
        if(payg)await market.order(quote);
        else await tenant.command('subscribe',{items:quote.map(({id,revision})=>({id,revision}))});
        setOrdered(true);
      }catch(error){Toast.error(error.message);}
      finally{setSubmitting(false);}
    };
    const columns=[
      {title:<Checkbox aria-label="全选可订购规格" disabled={!available.length} checked={allSelected}
        indeterminate={!allSelected && available.some(id=>selectedOrders.includes(id))}
        onChange={event=>setSelectedOrders(previous=>event.target.checked
          ? [...new Set([...previous,...available])] : previous.filter(id=>!available.includes(id)))}/>,
      width:48,render:(_,row)=><Checkbox aria-label={'选择 '+(payg?row[0]:row[1])}
        disabled={row[6]!=='未订购'} checked={selectedOrders.includes(row[0])} onChange={()=>toggleOrder(row[0])}/>},
      {title:payg?'模型名称':'套餐名称',width:220,render:(_,row)=><><strong>{row[1]}</strong><small>{row[0]}</small></>},
      {title:'模型服务商',width:130,render:(_,row)=>row[3]},
      {title:'模型类别',width:105,render:(_,row)=>row[2]},
      {title:'状态',width:86,render:(_,row)=><Tag color={row[6]==='未订购'?'blue':'green'}>{row[6]==='未订购'?'可订购':'已订购'}</Tag>},
      {title:'资费场景',width:155,render:(_,row)=><>{lines(row[4])}
        {row[4].startsWith('共 ') && <SemiButton size="small" theme="borderless" onClick={()=>setDetail({
          title:row[0]+' 资费场景',content:row[4]+'，参考价格 '+row[5],
        })}>查看详情</SemiButton>}
      </>},
      {title:'参考价格',width:190,render:(_,row)=>lines(row[5])},
    ];
    return <ConfigProvider locale={zhCN}><div className="service-order-page tenant-semi">
      <div className="service-order-title">
        <nav aria-label="面包屑">{standalone ? <a href={orderListUrl}>模型订购</a> : <SemiButton theme="borderless" onClick={backToOrders}>模型订购</SemiButton>}<span aria-hidden="true">/</span><span aria-current="page">订购模型服务</span></nav>
        <h1>订购模型服务</h1>
      </div>
      <section className="service-order-panel">
        {market.error && <p role="alert">{market.error}</p>}
        <div className="billing-choice">
          <strong id="order-billing-label">计费方式</strong>
          <RadioGroup type="button" value={tab} aria-labelledby="order-billing-label" onChange={event=>changeOrderTab(event.target.value)}
            options={billingOptions}/>
        </div>
        <Banner type="info" closeIcon={null} description="高峰期可能出现调用错误，请按业务需要错峰使用。" />
        <div className="service-filter">
          {payg && <>
            <span id="order-series-label" className="sr-only">模型系列</span>
            <SemiSelect aria-labelledby="order-series-label" value={series} onChange={setSeries}
              optionList={options(['全部模型系列','DeepSeek','GLM','Kimi','AICC'])} />
            <span id="order-type-label" className="sr-only">模型类别</span>
            <SemiSelect aria-labelledby="order-type-label" value={modelType} onChange={setModelType}
              optionList={options(['全部模型类别',...new Set(allRows.map(row=>row[2]))])} />
            <span id="order-provider-label" className="sr-only">模型服务商</span>
            <SemiSelect aria-labelledby="order-provider-label" value={provider} onChange={setProvider}
              optionList={[{value:'',label:'全部模型服务商'},...[...new Map(orderServices.map(row=>[row.providerId,row.providerName]))]
                .map(([value,label])=>({value,label}))]} />
          </>}
          <SemiInput value={query} onChange={setQuery} prefix={<Search size={16}/>} showClear
            aria-label={payg?'按模型名称搜索':'搜索套餐名称'} placeholder={payg?'按模型名称搜索':'搜索套餐名称'}/>
          <Checkbox checked={hideOrdered} onChange={event=>setHideOrdered(event.target.checked)}>隐藏已订购规格</Checkbox>
        </div>
        <Table className="service-order-table" columns={columns} dataSource={orderRows} rowKey={row=>row[0]}
          pagination={false} size="small" scroll={{x:934}} empty={payg?'暂无符合条件的模型规格。':'当前账号暂无可订购套餐。'} />
        <p className="selected-count" role="status">当前已选中 <b>{selectedOrders.length}</b> 个规格</p>
      </section>
      <section className="order-meta" aria-label="服务协议">
        <p>预计到期时间　长期有效</p>
        <Checkbox checked={agreed} onChange={event=>setAgreed(event.target.checked)}>我已阅读并同意</Checkbox>
        <div className="agreements">
          {['移动云产品销售协议','智算平台使用声明','模型服务平台MoMA服务使用声明','模型服务平台MoMA服务等级协议'].map(title=>
            <SemiButton key={title} size="small" theme="borderless" onClick={()=>setDetail({
              title,content:'服务条款以移动云官网发布内容为准。',
            })}>《{title}》</SemiButton>)}
        </div>
      </section>
      <footer className="service-order-footer">
        <div>
          配置费用：<b>{feeLabel}</b>
          <small>参考价格，具体扣费请以账单为准</small>
          <SemiButton theme="borderless" size="small" onClick={()=>setDetail({
            title:'计费详情',
            content:payg?'按照模型实际 Token 使用量和对应目录价计费。'
              :tab===MODEL_ORDER_BILLING_TYPES.plan?'优先使用 Token Plan 套餐额度，超出部分按产品规则计费。'
                :'使用 Coding Plan 套餐额度抵扣 AI 编程模型用量。',
          })}>了解计费详情</SemiButton>
        </div>
        <SemiButton theme="solid" disabled={!market.tenant || (!payg && !tenant.identity) || !selectedOrders.length || !agreed}
          onClick={changeQuote}>确认订单</SemiButton>
      </footer>
      <Modal visible={confirming} title={ordered?'模型服务已开通':'确认订单'} className="order-confirm-modal"
        width="min(520px, calc(100vw - 24px))" onCancel={()=>{if(!submitting)setConfirming(false);}}
        maskClosable={false} closeOnEsc={!submitting} closable={!submitting}
        footer={ordered ? <SemiButton theme="solid" onClick={backToOrders}>返回订购管理</SemiButton> : <>
          <SemiButton type="tertiary" disabled={submitting} onClick={()=>setConfirming(false)}>取消</SemiButton>
          <SemiButton theme="solid" loading={submitting} onClick={submitOrder}>确认订购</SemiButton>
        </>}>
        {ordered ? <p>订购记录已保存，可返回订购管理查看。</p> : <dl className="order-quote">
          <div><dt>计费方式</dt><dd>{tab}</dd></div>
          <div><dt>订购规格</dt><dd>{quote.map(row=>payg?row.callId:row.name).join('、')}</dd></div>
          <div><dt>配置费用</dt><dd>{feeLabel}</dd></div>
        </dl>}
      </Modal>
      <Modal visible={Boolean(detail)} title={detail?.title} width="min(520px, calc(100vw - 24px))"
        onCancel={()=>setDetail(null)} footer={<SemiButton theme="solid" onClick={()=>setDetail(null)}>我知道了</SemiButton>}>
        <p>{detail?.content}</p>
      </Modal>
    </div></ConfigProvider>;
  }
  const columns=[
    {title:payg?'模型名称':'套餐名称',width:210,render:(_,row)=><><strong>{payg && row[1] !== '—' ? row[1] : row[0]}</strong><small>{payg ? row[1] !== '—' && row[0] : row[1]}</small></>},
    ...MODEL_ORDER_COLUMNS.slice(0,-1).map((title,index)=>({
      title,width:[116,115,170,180,94,112,112][index],
      render:(_,row)=>index===4 ? <Tag color={['使用中','已订购'].includes(row[index+2])?'green':'grey'}>{row[index+2]}</Tag> : lines(row[index+2]),
    })),
    {title:'操作',width:76,fixed:'right',render:(_,row)=>row[6]==='未订购' && canCheckout
      ? <SemiButton theme="borderless" size="small" onClick={()=>openOrder(row[0])}>订购</SemiButton> : '—'},
  ];
  return <div className="model-orders-page us-page">
    <FrontPageHeader title="模型订购" description="查看付费模型订购情况" icon={ShoppingCart}
      actions={canCheckout && <SemiButton theme="solid" onClick={()=>openOrder()}>开通模型服务</SemiButton>}/>
    <SemiTabs className="model-order-tabs" activeKey={tab} onChange={changeTab}
      tabList={billingOptions.map(({value:itemKey,label:tab})=>({itemKey,tab}))}/>
    <section className="model-order-panel">
      {market.error && <p role="alert">{market.error}</p>}
      <div className="model-order-tools">
        <SemiButton theme="solid" icon={<ShoppingCart size={16}/>} onClick={()=>openOrder()}>立即订购</SemiButton>
        <SemiButton disabled>批量退订</SemiButton>
        <SemiInput value={query} onChange={value=>{setQuery(value);setPage(1);}} prefix={<Search size={16}/>} showClear
          aria-label={payg?'搜索模型名称':'搜索套餐名称'} placeholder={payg?'请按模型名称搜索':'搜索套餐名称'}/>
        <SemiButton type="tertiary" aria-label="刷新" icon={<RefreshCw size={16}/>} onClick={()=>{market.refresh();tenant.reload();}} />
      </div>
      <Table className="model-order-table" columns={columns} dataSource={visibleRows} rowKey={row=>row[9]}
        size="small" pagination={false} scroll={{x:1185}} empty="暂无符合条件的订购记录" />
      <FilterPagination total={rows.length} page={current} size={size} onPageChange={setPage}
        onSizeChange={value=>{setSize(value);setPage(1);}} />
    </section>
  </div>;
}

function FilterSection({ title, count = 0, children }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="filter-section">
      <SemiButton block theme="borderless" type="tertiary" className="filter-section-toggle"
        aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>{title}</span>
        {count > 0 && <Tag size="small" color="blue">{count}</Tag>}
        <span className="filter-section-indicator" aria-hidden="true">{open ? "−" : "＋"}</span>
      </SemiButton>
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
                <th>状态</th>
                <th><span className="sr-only">操作</span></th>
              </tr>
            </thead>
            <tbody>
              {prototypeVersions.map((version) => (
                <tr key={version.id}>
                  <td><strong>{version.label}</strong></td>
                  <td><time>{version.releaseDate}</time></td>
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

const frontPages = {
  home:'首页','model-ranking':'模型排行','tool-connection':'工具接入',
  'model-market':'模型广场','model-detail':'模型详情','model-order':'模型订购',
  'api-keys':'API 密钥','projects':'项目管理','my-projects':'我的项目','smart-route':'智能路由',
  'organization-members':'组织及成员','account-certification':'账户管理','call-logs':'调用日志','usage-statistics':'用量统计','call-observation':'调用观测',
  'project-models':'配额管理','project-logs':'调用日志留存','project-audit':'密钥操作记录',
  'space-overview':'空间总览', billing:'订购与账单', 'project-overview':'项目概览', 'project-settings':'项目设置',
};
const projectConfigPages = ['project-models','project-logs','project-audit'];
const projectPages = new Set(['project-overview','project-settings','smart-route','api-keys','experience','usage-statistics','call-observation','call-logs',...projectConfigPages]);
const projectReportPages = new Set(['usage-statistics','call-observation','call-logs']);

function frontPage(params) {
  const page=params.get('page');
  return (page==='experience' ? experiencePages[params.get('task')] : frontPages[page]) || '首页';
}
function frontDestination(label) {
  const task=Object.keys(experiencePages).find(key=>experiencePages[key]===label);
  return task ? ['experience',{task}] : [Object.keys(frontPages).find(key=>frontPages[key]===label) || 'model-market',{}];
}

function PrototypeApp({ version }) {
  const site = useSiteConfig();
  const workbenchName = site.workbenchName || DEFAULT_WORKBENCH_NAME;
  useSiteChrome(site);
  const auth = useAuthNavigation();
  const modeFromHash = () =>
    location.hash.startsWith("#/admin") ? "v2" : "front";
  if (location.pathname.includes("/order/serviceOrder"))
    return (
      <ModelOrderList standalone versionId={version.id} auth={auth} />
    );
  const [catalogueScope, setCatalogueScope] = useState('showcase');
  const [entryService, setEntryService] = useState(() => new URLSearchParams(location.search).get('service') || '');
  const [marketAction,setMarketAction]=useState(null);
  const [entryChoice,setEntryChoice]=useState(null);
  const [activePage,setActivePage]=useState(()=>frontPage(new URLSearchParams(location.search))),
    [admin, setAdmin] = useState(modeFromHash),
    [adminBannerTarget, setAdminBannerTarget] = useState(null),
    [textCompare, setTextCompare] = useState(false),
    [query, setQuery] = useState(""),
    [filters, setFilters] = useState({}),
    [selected, setSelected] = useState(() => readModelDetail(location.search)),
    [sortMode, setSortMode] = useState("latest");
  const market=useCloudMarket(admin==='front');
  const waitingForSession=admin==='front' && auth.requiresSession && !market.tenant;
  const projectTenant=useTenantData({ enabled:admin === 'front' && Boolean(market.tenant) });
  const [projectScope, setProjectScope] = useState(readProjectScope);
  const [projectAction, setProjectAction] = useState(null);
  const routingDirty = useRef(false);
  const routingLocation = useRef(location.href);
  const setRoutingDirty = useCallback(dirty => {
    routingDirty.current = dirty;
    if (dirty) routingLocation.current = location.href;
  }, []);
  useEffect(() => {
    const onUnload = event => { if (routingDirty.current) event.preventDefault(); };
    window.addEventListener('beforeunload',onUnload);
    return () => window.removeEventListener('beforeunload',onUnload);
  },[]);
  const owner = projectTenant.identity?.tenantId === market.tenant?.id ? projectTenant.identity?.key || '' : '';
  const { project, select:selectProject, active:activeProjects } =
    useProjectSelection(owner, owner ? projectTenant.projects : [], projectScope);
  const selectedProject = project?.id || '';
  const selectMarketProject = market.selectProject;
  useEffect(() => { selectMarketProject(selectedProject); }, [selectedProject, selectMarketProject]);
  const internal=market.tenant?.internal===true;
  const personal=market.tenant?.type==='个人';
  const [activeRoute, routeParams] = frontDestination(activePage);
  const checkoutKind = new URLSearchParams(location.search).get('checkout');
  const detailRoute = ['project-overview','project-settings'].includes(activeRoute);
  const workspaceRoute = detailRoute || ['projects','my-projects'].includes(activeRoute);
  const requestedSource = new URLSearchParams(location.search).get('from');
  const detailProject = owner && projectScope.id ? projectTenant.projects.find(row=>row.id===projectScope.id) : project;
  const projectList = projectTenant.canCreateProject && (activeRoute==='projects' || requestedSource==='projects' ||
    (requestedSource!=='my-projects' && detailRoute && detailProject &&
      !projectTenant.accountProjects.some(row=>row.id===detailProject.id))) ? 'projects' : 'my-projects';
  const spaceLogs = activeRoute==='call-logs' && projectScope.space && !projectScope.id && market.tenant?.type!=='个人';
  const reportScope = { ...projectScope, id:projectScope.id || selectedProject };
  const projectRequired = projectPages.has(activeRoute) &&
    (projectReportPages.has(activeRoute) ? !spaceLogs && !reportScope.id : detailRoute ? personal && !detailProject : !project);
  const openProjectPage = (row, page = 'my-projects', extra = {}, replace = false) => {
    const query = new URLSearchParams({page,...(row ? {project:row.id} : {}),...extra});
    const next = location.pathname + '?' + query + location.hash;
    if (next !== location.pathname + location.search + location.hash) {
      if (routingDirty.current && !window.confirm('放弃未保存的修改？')) return;
      routingDirty.current = false;
      if (replace) history.replaceState(null, '', next);
      else history.pushState(null, '', next);
    }
    if (row?.status === '正常' && (!row.tenantId || row.tenantId === market.tenant?.id)) selectProject(row.id);
    setSelected(null);
    setProjectScope(readProjectScope(query));
    setEntryService(query.get('service') || '');
    setMarketAction(null);
    setProjectAction(null);
    if (page === 'experience') setTextCompare(false);
    setActivePage(frontPage(query));
    return true;
  };
  const openProjectTab = (row, view, from = projectList, params = {}) => {
    const page = personal && view==='keys' ? 'api-keys' : personal && view!=='overview' ? 'project-settings' : 'project-overview';
    return openProjectPage(row,page,{...params,...(!personal ? {from} : {}),...(['overview','members'].includes(view) ? {} : {view})});
  };
  const enterProject = async (row, action) => {
    try {
      if (row.tenantId && row.tenantId !== market.tenant?.id) {
        if (routingDirty.current && !window.confirm('放弃未保存的修改？')) return;
        await market.switchSpace(row.tenantId);
        routingDirty.current = false;
      }
      if (openProjectTab(row,action ? projectScope.view || 'members' : 'members',projectList) && action) setProjectAction(action);
    } catch(error) { Toast.error(error.message); }
  };
  useEffect(() => {
    if (personal && project && ['space-overview','projects','my-projects'].includes(activeRoute)) openProjectPage(project,'project-overview',{},true);
  },[personal,project?.id,activeRoute]);
  const projectExperience = (row, service) => openProjectPage(row, 'experience',
    { task:service?.tasks?.[0] || 'text', ...(service ? {service:service.id} : {}) });
  const marketServices=market.services;
  const models = useMemo(() => marketModels(marketServices, catalogueScope, market.cards), [marketServices, catalogueScope, market.cards]);
  const marketProviders = new Map(models.flatMap(model => [...model.providers]));
  const selectedCard = useRef('');
  useEffect(()=>{setMarketAction(null);setEntryChoice(null);},[owner]);
  const beginExperience = (service,row=project) => {
    if (!owner) { setEntryChoice({kind:'blocked',message:projectTenant.error || '正在加载项目，请稍后重试。'}); return; }
    if (!service.callable) {
      setEntryChoice({kind:!internal && service.canOrder && !service.ordered && projectTenant.canManage ? 'order' : 'blocked', service,
        message:internal ? '当前企业尚未获得此模型授权，请联系企业管理员。' : !service.ordered ? projectTenant.canManage ? '请先为当前空间订购此模型服务。' : '请联系企业管理员订购此模型服务。' : service.reason || '此模型服务当前不可调用。'});
      return;
    }
    if (!row) { setEntryChoice({kind:'project',service}); return; }
    if (!projectModelEnabled(row,service.serviceModelId)) {
      setEntryChoice({kind:'models',service,project:row,message:row.canManage ? '当前项目尚未开通此模型。' : '当前项目尚未开通此模型，请联系项目管理员授权。'}); return;
    }
    setEntryChoice(null);
    if (service.tasks?.length) projectExperience(row,service);
    else setMarketAction({kind:'call',service});
  };
  useEffect(() => {
    const syncDetail = () => {
      if (routingDirty.current && location.href !== routingLocation.current) {
        if (!window.confirm('放弃未保存的修改？')) {
          history.pushState(null,'',routingLocation.current);
          return;
        }
        routingDirty.current = false;
      }
      const detail = readModelDetail(location.search);
      setSelected(detail); setMarketAction(null);
      const query=new URLSearchParams(location.search);
      setEntryService(query.get('service') || '');
      setProjectScope(readProjectScope(query));
      setActivePage(frontPage(query));
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
    const target = market.cards.some(card => card.modelKey === model.modelKey) ? { modelKey: model.modelKey } :
      model.services.find(row => row.providerId === filters.provider) || model.services.find(row => row.callable) || model.services[0];
    selectedCard.current = model.modelKey;
    history.pushState({ marketFromList: true }, '', modelDetailLocation(location.href, target));
    setSelected({ modelKey: target.modelKey, id: target.id }); setActivePage('模型详情');
  };
  const returnToMarket = () => {
    if (history.state?.marketFromList) { history.back(); return; }
    openProjectPage(undefined,'model-market',{},true);
  };
  const [compactFilters, setCompactFilters] = useState(() => window.matchMedia('(max-width: 900px)').matches);
  const [filtersExpanded, setFiltersExpanded] = useState(() => !window.matchMedia('(max-width: 900px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 900px)');
    const change = () => { setCompactFilters(media.matches); setFiltersExpanded(!media.matches); };
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  const enterpriseSpace = Boolean(market.tenant && market.tenant.type!=='个人');
  const tenantShell = useRef(null);
  const getTenantPopupContainer = useCallback(() => tenantShell.current ?? document.body, []);
  const currentNav = consoleActiveItem(activePage,personal);
  const navigateTenant = item => {
    const [page, params]=item === '项目管理' ? ['my-projects',{}]
      : item === '使用设置' ? ['project-settings',{}] : frontDestination(item);
    openProjectPage(projectPages.has(page) ? project : undefined, page, params);
  };
  const changeCurrentProject = id => {
    const next=activeProjects.find(row=>row.id===id);
    if (!next) return;
    if (!personal && workspaceRoute) {
      const scope = projectList==='my-projects' && projectTenant.canCreateProject && !projectTenant.accountProjects.some(row=>row.id===id)
        ? 'projects' : projectList;
      openProjectTab(next,projectScope.view || 'members',scope);
    }
    else if (projectPages.has(activeRoute) && !spaceLogs) {
      openProjectPage(next,activeRoute,{...routeParams,...(projectScope.view ? {view:projectScope.view} : {}),
        ...(activeRoute==='smart-route' ? (projectScope.projectRules ? {routeType:'project'} : projectScope.routing.type==='preset' ? {routeType:'preset'} :
          projectScope.routing.settings ? {routing:'settings',strategy:projectScope.routing.strategy} : {}) : {})});
    } else selectProject(next.id);
  };
  useEffect(() => {
    if (owner && enterpriseSpace && !projectTenant.canCreateProject && activeRoute==='projects') openProjectPage(undefined,'my-projects',{},true);
  }, [projectTenant.canCreateProject, enterpriseSpace, activeRoute, owner]);
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
    if (routingDirty.current && !window.confirm('放弃未保存的修改？')) return;
    routingDirty.current = false;
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
  const meta = m => ({ task: ({ text: ['文本与代码'], multimodal: ['多模态', '文本与代码'], image: ['图像'], video: ['视频'], voice: ['音频'], audio: ['音频'], embedding: ['向量'], rerank: ['重排'] })[m.type] || [], input: m.input, output: m.outputModalities, author: m.classification?.authorId });
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
            : (b.heat ?? 0) - (a.heat ?? 0) ||
              models.indexOf(a) - models.indexOf(b),
        ),
    [query, filters, sortMode, models],
  );
  const option = (group, value, label = value) => {
    const selected = filters[group] === value;
    return <SemiButton key={value} className="filter-option" size="small"
      type={selected ? 'primary' : 'tertiary'} theme={selected ? 'light' : 'borderless'}
      aria-pressed={selected} onClick={() => group === 'author'
        ? setFilters(current => ({ ...current, author: current.author === value ? '' : value, series: '' }))
        : toggleFilter(group, value)}>{label}</SemiButton>;
  };
  const resetFilters = () => { setFilters({}); setQuery(""); };
  const catalogueFilters = (<div className="filters" id="catalogue-filters">
                <div className="filter-heading">
                  <h3>模型筛选</h3>
                  <SemiButton size="small" theme="borderless"
                    onClick={resetFilters}
                    disabled={!query.trim() && !Object.values(filters).some(Boolean)}
                  >
                    重置
                  </SemiButton>
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
                  <Slider
                    className="filter-range"
                    min={4}
                    max={1024}
                    value={filters.context || 1024}
                    onChange={context => setFilters(current => ({...current, context}))}
                    aria-label="上下文长度上限"
                  />
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
      <SemiButton id="catalogue-filter-toggle" type="tertiary" icon={<SlidersHorizontal size={16}/>}
        aria-expanded={filtersExpanded} aria-controls={!compactFilters || filtersExpanded ? 'catalogue-filters' : undefined}
        onClick={() => setFiltersExpanded(value => !value)}>
        {filtersExpanded ? '收起筛选' : '展开筛选'}{activeFilters.length > 0 && ' · ' + activeFilters.length}
      </SemiButton>
      {compactFilters && <SideSheet visible={filtersExpanded} title="模型筛选" placement="left"
        width="min(320px, 90vw)" className="catalogue-filter-drawer" closeOnEsc
        onCancel={() => setFiltersExpanded(false)}
        afterVisibleChange={visible => { if (!visible) document.getElementById('catalogue-filter-toggle')?.focus(); }}>
        {catalogueFilters}
      </SideSheet>}
      <SemiInput className="catalogue-search" aria-label="搜索模型" prefix={<Search size={16} aria-hidden="true"/>}
        value={query} placeholder="搜索模型名称或模型 ID" onChange={setQuery} showClear />
      <span className="catalogue-count" role="status">{query.trim() || activeFilters.length ? '找到 ' : '模型 '}{visible.length} 个</span>
      <SemiSelect aria-label="模型目录范围" value={catalogueScope} onChange={setCatalogueScope}
        optionList={[{value:'showcase',label:'演示模型'},{value:'all',label:'全部模型'}]} />
      <SemiSelect aria-label="模型排序" value={sortMode} onChange={setSortMode}
        optionList={[{value:'latest',label:'最新'},{value:'recommended',label:'推荐'}]} />
    </div>
    {(query.trim() || activeFilters.length > 0) && <div className="catalogue-conditions" aria-label="已选条件">
      <span>已选条件</span>
      {query.trim() && <SemiButton size="small" type="tertiary" aria-label="移除搜索条件" icon={<X size={12}/>} iconPosition="right"
        onClick={() => setQuery('')}>搜索：{query.trim()}</SemiButton>}
      {activeFilters.map(([group,value]) => <SemiButton key={group} size="small" type="tertiary"
        aria-label={'移除' + (filterLabels[group] || group) + '条件'} icon={<X size={12}/>} iconPosition="right"
        onClick={() => removeFilter(group)}>{filterLabels[group] || group}：{group === 'provider' ? marketProviders.get(value) || '服务商已不可用' : value}{group === 'context' ? 'K' : ''}</SemiButton>)}
      <SemiButton theme="borderless" size="small" onClick={resetFilters}>清空</SemiButton>
    </div>}
  </section>;

  const marketTabs = <SemiTabs className="console-market-tabs" aria-label="模型广场"
    activeKey={activePage==='模型排行' ? 'model-ranking' : 'model-market'}
    tabList={[{itemKey:'model-market',tab:'模型列表'},{itemKey:'model-ranking',tab:'模型排行'}]}
    onChange={page=>openProjectPage(undefined,page)} />;
  const shell = (
    <AdminUIContext.Provider value={admin === "v2"}><div ref={tenantShell} className={`app-shell ${admin === "front" ? "tenant-semi" : ""} ${auth.route ? "auth-shell auth-enterprise-shell" : ""}`}>
      <header className={admin === "v2" ? "admin-banner" : !auth.route ? "tenant-banner" : undefined}>
        <div className="brand-mark">
          <img src={site.logo || DEFAULT_SITE_LOGO} alt="" onError={event => restoreSiteImage(event, DEFAULT_SITE_LOGO)} />
          {admin === "v2"
            ? <SemiTypography.Text strong>{workbenchName}</SemiTypography.Text>
            : <span>{site.userConsoleName || DEFAULT_USER_CONSOLE_NAME}</span>}
        </div>
        <div className="top-actions">
          {admin === "v2" && (
            <div className="admin-banner-controls" ref={setAdminBannerTarget}/>
          )}
          <div className="banner-version-tools">
            <DevelopmentNotes admin={admin === "v2"}/>
          </div>
          {admin === "front" && !waitingForSession && auth.route !== 'login' ? (
            <SemiButton theme="borderless" onClick={() => navigateAdmin("v2")}>后台</SemiButton>
          ) : null}
          {admin === "v2" ? <AuthBanner auth={auth} market={market} admin/> : !waitingForSession && auth.route !== 'login' ? <AuthBanner auth={auth} market={market}
            onSwitchSpace={()=>openProjectPage(undefined,'home',{},true)}/> : null}
        </div>
        {admin === "v2" && (
          <SemiButton className="admin-banner-return" type="tertiary" theme="borderless" size="small" onClick={() => navigateAdmin("front")}>返回前台</SemiButton>
        )}
      </header>
      {admin === "front" && !auth.route && !waitingForSession && (
        <ConsoleNavigation personal={personal} internal={internal} canManage={projectTenant.canManage} canManageOrganization={Boolean(owner && projectTenant.canManageOrganization)} projectId={selectedProject}
          projects={activeProjects} enabled={Boolean(owner)} onProjectChange={changeCurrentProject}
          active={currentNav} navigate={navigateTenant} icons={navIcons}/>
      )}
      <main key={auth.route ? "auth" : admin === "front" ? owner || "anonymous" : "admin"} className={admin !== "front" ? "admin-main" : "front-main"}>
        {admin === 'front' && !auth.route && !detailRoute && projectPages.has(activeRoute) && !spaceLogs && project?.canManage &&
          <div className="project-page-notice"><ProjectBudgetNotice project={project} spend={projectTenant.projectBudgets?.[project.id]} /></div>}
        {entryChoice && <Modal visible title={entryChoice.kind==='project' ? '选择体验项目' : '模型体验'} footer={null}
          onCancel={()=>setEntryChoice(null)} className="project-modal">
          {entryChoice.message && <p role="status">{entryChoice.message}</p>}
          {entryChoice.kind==='project' && (activeProjects.length ? <div><span id="experience-project-label">体验项目</span><SemiSelect aria-labelledby="experience-project-label" placeholder="选择项目"
            optionList={activeProjects.map(row=>({value:row.id,label:row.name}))}
            onChange={id=>beginExperience(entryChoice.service,activeProjects.find(row=>row.id===id))}/></div> : <p>暂无可访问的项目，请联系企业管理员。</p>)}
          {entryChoice.kind==='models' && entryChoice.project.canManage && <SemiButton theme="solid"
            onClick={()=>{openProjectPage(entryChoice.project,'project-models');setEntryChoice(null);}}>配置模型权限</SemiButton>}
          {entryChoice.kind==='order' && <SemiButton theme="solid" onClick={()=>{setMarketAction({kind:'order',service:entryChoice.service});setEntryChoice(null);}}>订购模型</SemiButton>}
        </Modal>}
        {waitingForSession ? (
          <CustomerSessionGate auth={auth} market={market} />
        ) : auth.route ? (
          <AuthExperience key={auth.route} auth={auth} market={market} />
        ) : admin === "v2" ? (
          <AdminConsoleV2 bannerTarget={adminBannerTarget} workbenchName={workbenchName} adminAccount={auth.adminAccount} />
        ) : internal && ['model-order','billing'].includes(activeRoute) ? (
          <div className="project-panel project-experience-empty"><h2>企业内用</h2><p>模型使用权限由项目管理员分配。</p>
            <SemiButton theme="solid" onClick={()=>openProjectPage(undefined,'model-market')}>返回模型广场</SemiButton></div>
        ) : projectRequired ? (
          <div className="project-panel project-experience-empty"><h2>{activePage}</h2>
            <p role="status">{projectTenant.error || (!owner ? '正在加载项目…' : projectScope.id ? '当前项目不可用，请重新选择。' : '请先选择项目。')}</p>
            <SemiButton theme="solid" onClick={personal ? projectTenant.reload : () => openProjectPage()}>{personal ? '重新加载' : '前往项目'}</SemiButton>
          </div>
        ) : activePage === "首页" ? (
          <ConsoleHome tenant={projectTenant} personal={personal} internal={internal}
            models={marketModels(owner ? projectTenant.services : [],'all')}
            onOpenModel={model=>openModelDetails(null,model)}
            onPage={page=>openProjectPage(projectPages.has(page) ? project : undefined,page)} />
        ) : activePage === "空间总览" ? (
          <UsageStatistics key={owner+':space-overview'} overview
            onSpaceLogs={enterpriseSpace ? ()=>openProjectPage(undefined,'call-logs',{scope:'space'}) : undefined}/>
        ) : activeRoute === 'organization-members' ? (
          <div className="project-workspace">
            <FrontPageHeader title="组织及成员" description={market.tenant?.name}/>
            <OrganizationWorkspace key={owner} tenant={projectTenant} tab={new URLSearchParams(location.search).get('tab')}
              onTabChange={tab=>openProjectPage(undefined,'organization-members',{tab})}/>
          </div>
        ) : workspaceRoute ? (
          <ProjectWorkspace key={owner+':'+projectList} tenant={projectTenant}
            view={!personal ? 'detail' : activeRoute==='project-settings' ? 'settings' : 'overview'}
            initialTab={projectScope.view || (activeRoute==='project-settings' ? 'settings' : 'overview')}
            listMode={projectList} projectId={detailRoute ? projectScope.id || detailProject?.id : undefined}
            currentProjectId={selectedProject} onSelect={selectProject}
            initialAction={projectAction} onActionClose={()=>setProjectAction(null)}
            onOpen={enterProject} onList={()=>openProjectPage(undefined,projectList)} onListModeChange={page=>openProjectPage(undefined,page)} onExperience={projectExperience}
            onNavigate={(row,page,params)=>page==='tab' ? openProjectTab(row,params.view,projectList)
              : page==='route' ? openProjectPage(row,'smart-route',{routeType:'project'}) : openProjectPage(row,page==='usage' ? 'usage-statistics' : 'call-logs',params)}
            renderRoutes={row=><SmartRouting tenant={projectTenant} projectId={row.id} projectRules embedded view={projectScope.routing}
              setDirty={setRoutingDirty} navigate={params=>openProjectPage(row,'smart-route',params)}
              saveRoute={(input,revision)=>projectTenant.command('routes',input,revision)} projectCallId={code=>'project@'+code}
              apiUrl={location.origin+'/api/v1/chat/completions'} openOrders={()=>openProjectPage(undefined,'billing')}
              openExperience={route=>openProjectPage(row,'experience',{task:'text',service:route.callId})}
              openKeys={()=>openProjectPage(row,'api-keys')} />} />
        ) : projectConfigPages.includes(activeRoute) ? (
          <div className="project-workspace">
            <FrontPageHeader title={activePage} description={project.name} />
            {project.canManage && activeRoute === 'project-models' ? <ProjectModels key={project.id} tenant={projectTenant} project={project}
              onExperience={service=>projectExperience(project,service)} />
              : project.canManage ? <ProjectSettings key={project.id+':'+activeRoute} tenant={projectTenant} project={project}
                mode={activeRoute==='project-logs' ? 'logs' : 'audit'} />
              : <p role="status">只有项目管理员可以查看此配置。</p>}
          </div>
        ) : activePage === "模型详情" ? (
          <>{market.loading || market.error ? <p className="content" role="status">{market.error || '正在加载模型广场…'}</p> : <MarketModelDetail usageRecords={owner ? projectTenant.requests : null} services={marketServices} cards={market.cards} selected={selected} onSelect={selectDetailService} onBack={returnToMarket} onExperience={beginExperience} onOrder={service=>projectTenant.canManage ? setMarketAction({kind:'order',service}) : setEntryChoice({kind:'blocked',message:'请联系企业管理员订购此模型服务。'})}/>}
          {marketAction && <MarketAction key={marketAction.kind+marketAction.service.id} action={marketAction} market={market} project={project} close={()=>setMarketAction(null)}/>}</>
        ) : activePage === "智能路由" ? (
          <SmartRouting key={JSON.stringify([owner, selectedProject])}
            tenant={projectTenant} projectId={selectedProject}
            projectRules={projectScope.projectRules} view={projectScope.routing} setDirty={setRoutingDirty}
            navigate={(params,replace) => openProjectPage(project,'smart-route',params,replace)}
            saveRoute={(input, revision) => projectTenant.command('routes', {...input,projectId:selectedProject}, revision)}
            projectCallId={code => 'project@' + code}
            apiUrl={location.origin + '/api/v1/chat/completions'}
            openOrders={() => openProjectPage(undefined,'billing')}
            openExperience={route => openProjectPage(project, 'experience', { task:'text',service:route.callId })}
            openKeys={id => openProjectPage(projectTenant.projects.find(row => row.id === id), 'api-keys')} />
        ) : activePage === "模型排行" ? (
          <>{marketTabs}<ModelRanking /></>
        ) : activePage === "工具接入" ? (
          <Suspense fallback={<p role="status">正在加载工具接入指南…</p>}>
            <ToolConnection onKeys={()=>navigateTenant('API 密钥')} onModels={()=>openProjectPage(undefined,'model-market')} />
          </Suspense>
        ) : activePage === "文本生成" ? (
          textCompare ? (
            <ModelComparison key={owner+':'+selectedProject} owner={owner} project={project}
              onBack={() => setTextCompare(false)}
            />
          ) : (
            <TextExperience key={`${owner}:text:${selectedProject}:${entryService}`} owner={owner} initialServiceId={entryService} project={project}
              tenantRoutes={projectTenant.routes.filter(row=>row.projectId===selectedProject)}
              onReturnToRouting={() => openProjectPage(project, 'smart-route', entryService.startsWith('@preset/') ? {preset:entryService} :
                entryService === 'moma/auto' ? {} : {routing:'settings'})}
              imageUploadEnabled
              title="文本生成"
              onCompare={() => setTextCompare(true)}
            />
          )
        ) : activePage === "图片生成" || activePage === "视频生成" ? (
          <ModelExperience
            key={`${owner}:${activePage}:${selectedProject}:${entryService}`} owner={owner} initialServiceId={entryService} project={project}
            kind={activePage === "图片生成" ? "image" : "video"}
            groupLabel={activePage}
          />
        ) : activePage === "语音识别" ? (
          <ModelExperience
            key={`${owner}:voice:${selectedProject}:${entryService}`} owner={owner} initialServiceId={entryService} project={project}
            kind="voice"
            groupLabel="语音识别"
          />
        ) : activePage === "订购与账单" ? (
          <WorkspaceBilling key={owner} tenant={owner ? projectTenant : { ...projectTenant, identity: null }} orders={owner ? market.orders : []}
            onOrder={kind=>openProjectPage(undefined,'model-order',{ checkout:kind })}/>
        ) : activePage === "模型订购" ? (
          <ModelOrderList key={owner + ':' + (checkoutKind || '')} versionId={version.id} auth={auth}
            initialCheckout={Object.hasOwn(MODEL_ORDER_BILLING_TYPES, checkoutKind) ? MODEL_ORDER_BILLING_TYPES[checkoutKind] : undefined}/>
        ) : activePage === "账户管理" ? (
          <AuthExperience auth={{ ...auth, route:"account",close:()=>openProjectPage(undefined,'home') }} market={market} accountTitle="账户管理" />
        ) : activePage === "API 密钥" ? (
          <UnifiedApiKeys key={project?.id || "no-project"} project={project} internal={internal} onProjects={() => openProjectPage()}
            onModels={project?.canManage ? () => openProjectPage(project,'project-models') : undefined}
            onAudit={() => openProjectPage(project,'project-audit')} />
        ) : activePage === "调用观测" || activePage === "用量统计" ? (
          <UsageStatistics key={activeRoute+':'+owner+':'+selectedProject} observation={activePage==='调用观测'} projectScope={reportScope}/>
        ) : activePage === "调用日志" ? (
          <CallLogs key={owner+':'+(spaceLogs ? 'space' : reportScope.id+':'+reportScope.requestId)}
            projectId={spaceLogs ? '' : reportScope.id} requestId={spaceLogs ? '' : reportScope.requestId} space={spaceLogs}
            openRetention={row=>openProjectPage(row,'project-logs')} />
        ) : (
          <div className="content">
            {marketTabs}
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
                        key={m.modelKey}
                        {...(!m.preview && { tabIndex: 0, role: "button", onKeyDown: event => {
                          if (["Enter", " "].includes(event.key)) { event.preventDefault(); openModelDetails(event, m); }
                        }, onClick: event => openModelDetails(event, m) })}
                      >
                        {m.hot && (
                          <img className="hot" alt="热门" src={`${A}hot-7601e629.svg`} />
                        )}{" "}
                        {m.score != null && <span className="score">{m.score}</span>}
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
                        <div className="context">上下文长度：{m.context}</div>
                        {m.preview ? <footer>敬请期待</footer> : <footer>{m.callable && m.features?.online_experience !== false ? "可体验" : !m.callable && m.reason}{m.date && ` · 发布于 ${m.date}`}</footer>}
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
