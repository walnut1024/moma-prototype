import { useRef } from 'react';
import { ArrowLeft, ArrowRight, ChevronDown, ChevronRight, FileText, Info, KeyRound, Store } from 'lucide-react';
import { Button } from './components/ui/button';
import { Tabs, TabsList, TabsTrigger } from './components/ui/tabs';
import { customerPriceRows } from './service-directory.mjs';
import MarketServiceOffer from './MarketServiceOffer';
import './market-model-detail.css';

export default function MarketModelDetail({ services, selected, onSelect, onBack, onExperience, error, confirm, onManageKeys }) {
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
      <section className="market-detail-section"><h2>{current.mode === 'provider' ? '模型服务商' : '统一模型服务模式报价'}</h2>
        <div className="market-provider-list">{offers.map(offer => {
          const prices = customerPriceRows(offer.salePrices), first = prices[0], active = offer.id === current.id;
          return <details key={offer.id} className="market-provider-offer">
            <summary><span className="market-provider-name"><Store/>{offer.provider}</span><span className="market-provider-meter">{first?.name || '售价待完善'}</span><span className="market-provider-price">{first ? `${first.currency === 'CNY' ? '¥' : first.currency} ${first.amount} / ${first.unit}` : '暂无已生效售价'}</span><span className="market-provider-status">{offer.callable ? '可体验' : '暂不可体验'}</span><span>共 {prices.length} 项报价</span><span className="market-provider-expand"><span className="when-closed">展开详情</span><span className="when-open">收起详情</span><ChevronRight className="when-closed"/><ChevronDown className="when-open"/></span></summary>
            <div className="market-provider-content"><h3>定价</h3><div className="market-provider-tariffs">{prices.map(price => <div key={price.name}><span>{price.name}</span><strong>{price.currency === 'CNY' ? '¥' : price.currency} {price.amount}<small> / {price.unit}</small></strong></div>)}</div><div className="market-provider-actions"><span>对外调用标识：<code>{offer.callId}</code></span><Button variant="outline" onClick={() => { onSelect(offer); apiSection.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>{active ? '查看调用指南' : '使用此服务'}</Button><Button disabled={!offer.callable} onClick={() => { onSelect(offer); onExperience(offer); }}>{confirm === offer.id ? '保留草稿并切换' : '在线体验'}</Button></div>{!offer.callable && <p>{offer.reason}</p>}</div>
          </details>;
        })}</div>
      </section>
      <section className="market-detail-section" ref={apiSection}><h2>API 调用</h2><div className="market-api-notice"><Info/><p>调用时使用所选服务的对外调用标识 和已授权的 API Key。{current.mode === 'provider' && '服务商切换后，下方代码示例同步更新。'}</p></div>
        <details className="market-api-step" open><summary><span>1</span>获取 API Key<ChevronDown/></summary><div className="market-api-step-body"><p>在 API Key 管理中创建或管理密钥，并确认该密钥可访问当前模型服务。</p><Button variant="outline" onClick={onManageKeys}><KeyRound/>前往 API Key 管理<ArrowRight/></Button></div></details>
        <details className="market-api-step" open><summary><span>2</span>调用模型服务<ChevronDown/></summary><div className="market-api-step-body">
          {current.mode === 'provider' && <Tabs value={current.id} onValueChange={id => onSelect(offers.find(row => row.id === id))}><TabsList variant="line" aria-label="调用服务商">{offers.map(offer => <TabsTrigger key={offer.id} value={offer.id}>{offer.provider}</TabsTrigger>)}</TabsList></Tabs>}
          <div className="market-api-identity"><span>对外调用标识：<code>{current.callId}</code></span><Button disabled={!current.callable} onClick={() => onExperience(current)}>{confirm === current.id ? '保留草稿并切换' : '在线体验'}</Button></div>
          <MarketServiceOffer key={current.id} service={current}/>
        </div></details><p role="status" className="market-detail-feedback">{error || current.reason}</p>
      </section>
      <section className="market-detail-section market-detail-metadata"><h2>模型详情</h2>{current.detailDescription && <p>{current.detailDescription}</p>}<dl><div><dt>模型编码</dt><dd>{current.modelId}</dd></div><div><dt>模型类型</dt><dd>{current.typeLabel}</dd></div><div><dt>支持任务</dt><dd>{current.businessTasks.join('、') || '未填写'}</dd></div>{current.detailSections.flatMap(section => section.facts).map(fact => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>{/^https?:\/\//.test(current.documentation || '') && <a href={current.documentation} target="_blank" rel="noopener noreferrer">查看模型文档</a>}</section>
    </article>
  </div>;
}
