import { useEffect, useRef, useState } from 'react';
import { appVersionId } from './prototype-ui.mjs';
import { Banner, Button as SemiButton, Checkbox, ConfigProvider, Input as SemiInput, Modal, RadioGroup, Select as SemiSelect, Table, Tabs as SemiTabs, Tag, Toast } from '@douyinfe/semi-ui';
import zhCN from '@douyinfe/semi-ui/lib/es/locale/source/zh_CN.js';
import { RefreshCw, Search, ShoppingCart } from 'lucide-react';
import AuthExperience, { CustomerSessionGate } from './AuthExperience';
import { useCloudMarket } from './CloudMarket';
import { useTenantData } from './useTenantData';
import FrontPageHeader from './components/FrontPageHeader';
import { DEFAULT_PAGE_SIZE, FilterPagination } from './components/FilterControls';
import { MODEL_ORDER_BILLING_TYPES, MODEL_ORDER_BILLING_LABELS, MODEL_ORDER_COLUMNS } from './model-order-display.mjs';
import { customerPriceRows } from './service-directory.mjs';
import { shanghaiDate } from './shanghai-date.mjs';
import './model-order.css';

export default function ModelOrderList({
  standalone = false,
  versionId = appVersionId,
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
