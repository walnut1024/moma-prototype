import { useRef } from 'react';
import { ArrowLeft, ArrowRight, ChevronDown, ChevronRight, FileText, Store } from 'lucide-react';
import { Button } from './components/ui/button';
import { Tabs, TabsList, TabsTrigger } from './components/ui/tabs';
import { customerPriceRows } from './service-directory.mjs';
import { useTenantData } from './useTenantData';
import { modelUsageSummary } from './model-usage.mjs';
import './market-model-detail.css';

function ModelUsage({ service }) {
  const tenant = useTenantData();
  const summary = modelUsageSummary(tenant.requests, service);
  const number = value => value == null ? '未采集' : value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
  return <section className="market-detail-section"><h2>使用统计与运行表现</h2>
    {tenant.error ? <p role="status">当前空间暂无可查看的运行数据。</p> : <>
      <p>当前空间 · 近 7 天 · 截至 {new Date(summary.end).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}（北京时间）</p>
      <dl className="market-detail-stats market-usage-stats">{[
        ['调用次数', number(summary.count)], ['成功次数', number(summary.success)], ['失败次数', number(summary.failed)],
        ['成功率', summary.successRate == null ? '未采集' : number(summary.successRate) + '%'],
        ['已计量 Token', number(summary.total)], ['P95 总耗时', summary.p95 == null ? '未采集' : number(summary.p95) + ' ms'],
        ['P95 首 Token 时延', summary.ttft == null ? '未采集' : number(summary.ttft) + ' ms'],
      ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      {summary.pendingTokens > 0 && <p>{summary.pendingTokens} 次调用的 Token 计量未完整采集。</p>}
      <p>成功率按已判定成功或失败的请求计算；仅反映当前空间的调用记录。</p>
    </>}
  </section>;
}

export default function MarketModelDetail({ services, selected, onSelect, onBack, onExperience, onProjectExperience, onOrder, projectOffers }) {
  const offers = services.filter(row => row.modelKey === selected?.modelKey);
  const current = selected?.id ? offers.find(row => row.id === selected.id) : offers[0];
  const apiSection = useRef(null);
  if (!current) return <div className="market-detail-page"><nav aria-label="模型详情面包屑"><Button variant="outline" onClick={onBack}><ArrowLeft/>返回模型广场</Button></nav><section className="market-detail-unavailable"><h1>模型服务不可用</h1><p>该服务不存在、已下架或当前账号没有访问权限，请返回模型广场选择可用服务。</p></section></div>;
  return <div className="market-detail-page">
    <nav className="market-detail-breadcrumb" aria-label="模型详情面包屑"><Button variant="outline" size="icon" aria-label="返回模型广场" onClick={onBack}><ArrowLeft/></Button><button onClick={onBack}>模型广场</button><span>/</span><strong>{current.name}</strong></nav>
    <article className="market-detail-sheet">
      <section className="market-detail-hero">
        <div className="market-detail-title">{current.logo ? <img src={current.logo} alt="" onError={event => { event.currentTarget.hidden = true; }}/> : <FileText aria-hidden="true"/>}<h1 tabIndex={-1}>{current.name}</h1><span>{current.maker}</span><span className="market-detail-mode">{current.mode === 'provider' ? '渠道直选模式服务' : '统一模型服务模式'}</span></div>
        <p>{current.desc || '暂无模型介绍'}</p>
        <dl className="market-detail-stats"><div><dt>模态</dt><dd>{current.input.join(' + ') || '未填写'}<ArrowRight/>{current.outputModalities.join(' + ') || '未填写'}</dd></div><div><dt>上下文窗口</dt><dd>{current.context}</dd></div><div><dt>模型发布日期</dt><dd>{current.releaseDate || '未填写'}</dd></div></dl>
      </section>
      <section className="market-detail-section"><h2>{current.mode === 'provider' ? '服务商／渠道' : '统一模型服务模式报价'}</h2>
        <div className="market-provider-list">{offers.map(offer => {
          const prices = customerPriceRows(offer.salePrices), first = prices[0], active = offer.id === current.id;
          return <details key={offer.id} className="market-provider-offer">
            <summary><span className="market-provider-name"><Store/>{offer.offerName}</span><span className="market-provider-meter">{first?.name || '售价待完善'}</span><span className="market-provider-price">{first ? `${first.currency === 'CNY' ? '¥' : first.currency} ${first.amount} / ${first.unit}` : '暂无已生效售价'}</span><span className="market-provider-status">{offer.ordered ? '已订购' : offer.canOrder ? '可订购' : '暂不可订购'}</span><span>共 {prices.length} 项报价</span><span className="market-provider-expand"><span className="when-closed">展开详情</span><span className="when-open">收起详情</span><ChevronRight className="when-closed"/><ChevronDown className="when-open"/></span></summary>
            <div className="market-provider-content"><h3>定价</h3><div className="market-provider-tariffs">{prices.map((price,index) => <div key={index}><span>{price.name}</span><strong>{price.currency === 'CNY' ? '¥' : price.currency} {price.amount}<small> / {price.unit}</small></strong></div>)}</div><div className="market-provider-actions"><span>对外调用标识：<code>{offer.callId}</code></span><Button variant="outline" onClick={() => { onSelect(offer); apiSection.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>{active ? '查看调用入口' : '选择此渠道'}</Button>{offer.ordered ? <Button aria-label={`在线调用 ${offer.offerName}`} disabled={!offer.callable} onClick={() => onExperience(offer)}>在线调用</Button> : <Button aria-label={`订购 ${offer.offerName}`} disabled={!offer.canOrder} onClick={() => onOrder(offer)}>订购</Button>}</div></div>
          </details>;
        })}</div>
      </section>
      <section className="market-detail-section" ref={apiSection}><h2>在线调用</h2>
        {current.mode === 'provider' && <Tabs value={current.id} onValueChange={id => onSelect(offers.find(row => row.id === id))}><TabsList variant="line" aria-label="调用渠道">{offers.map(offer => <TabsTrigger key={offer.id} value={offer.id}>{offer.offerName}</TabsTrigger>)}</TabsList></Tabs>}
        <div className="market-api-identity"><span>对外调用标识：<code>{current.callId}</code></span>
          {projectOffers?.has(current.id) && <Button variant="outline" onClick={() => onProjectExperience(current)}>项目体验</Button>}
          <Button disabled={!current.callable} onClick={() => onExperience(current)}>在线调用</Button>
        </div>
      </section>
      <section className="market-detail-section market-detail-metadata"><h2>模型详情</h2>{current.detailDescription && <p>{current.detailDescription}</p>}<dl><div><dt>模型编码</dt><dd>{current.modelId}</dd></div><div><dt>模型类型</dt><dd>{current.typeLabel}</dd></div><div><dt>支持任务</dt><dd>{current.businessTasks.join('、') || '未填写'}</dd></div>{current.detailSections.flatMap(section => section.facts).map(fact => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>{/^https?:\/\//.test(current.documentation || '') && <a href={current.documentation} target="_blank" rel="noopener noreferrer">查看模型文档</a>}</section>
      <ModelUsage service={projectOffers?.get(current.id) || current}/>
    </article>
  </div>;
}
