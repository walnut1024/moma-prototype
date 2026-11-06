import { Button } from '../components/ui/button';
import { GridTable, Row, Cell, Notice, SearchBox, Pagination, useOperations } from './ModelOperationsUI';
import { costRecords, operationsReturn } from './model-pricing-workspace';
import { displayTime, moneyDisplay } from './model-management';
import { supplierChannelName } from './supplier-resources';
import ProcurementVersionEditor from './ProcurementVersionEditor';
import { cataloguePurchasePrice } from './provider-catalogue-pricing';
import './model-pricing-workspace.css';

export default function ModelCosts(props) {
  const {state} = props, ops = useOperations(props,'model-costs'), {params,go} = ops;
  const records = costRecords(state), selected = records.find(row => row.provider.id === params.get('provider') && row.association.id === params.get('association'));
  const query = (params.get('q') || '').trim().toLowerCase();
  const rows = records.filter(row => (!params.has('model') || state.modelSupplies.some(supply=>supply.modelId===params.get('model') && supply.endpointId===row.association.endpointId && (supply.catalogueModelId || supply.upstreamModelId)===row.association.modelId)) && [row.master?.name,row.association.modelId,row.provider.name,row.association.upstreamModelId,supplierChannelName(row.provider,row.association.endpoint)].join(' ').toLowerCase().includes(query));
  const page = Math.min(Math.max(1,Number(params.get('page')) || 1),Math.max(1,Math.ceil(rows.length/20)));
  const open = row => go({provider:row.provider.id,association:row.association.id,edit:null},{preserveScroll:true});
  const back = operationsReturn(params.get('returnTo'));
  return <div className="mo-workbench mp-workspace">
    <div className="mp-heading"><h1>{selected ? `${selected.master?.name || selected.association.modelId} · 模型成本` : '模型成本'}</h1><div>{back && <Button variant="outline" onClick={()=>ops.proceed(()=>{location.hash=back;})}>返回来源页面</Button>}<Button variant="outline" onClick={()=>go({returnTo:location.hash,tab:'scenario'},{base:'tariff-dictionary',reset:true})}>计量配置</Button></div></div>
    {params.has('association') ? selected ? <>
      <dl className="mp-facts"><div><dt>供应商</dt><dd>{selected.provider.name}</dd></div><div><dt>渠道</dt><dd>{supplierChannelName(selected.provider,selected.association.endpoint)}</dd></div><div><dt>上游模型标识</dt><dd>{selected.association.upstreamModelId}</dd></div><div><dt>成本状态</dt><dd>{selected.status}</dd></div></dl>
      <div className="mp-section-heading"><h2>当前成本</h2><Button variant="outline" disabled={!ops.can} onClick={()=>go({edit:'1'},{preserveScroll:true})}>编辑成本</Button></div>
      <GridTable headings={['计费项','适用条件','采购单价','货币','计价单位']} empty={!selected.items.length} emptyMessage="成本待配置，缺失金额不计为零。">{selected.items.map((item,index)=><Row key={index}><Cell>{item.name}</Cell><Cell>{item.condition || '—'}</Cell><Cell>{moneyDisplay(item.amount)}</Cell><Cell>{item.currency || '—'}</Cell><Cell>{item.unit}</Cell></Row>)}</GridTable>
      <h2>变更记录</h2><GridTable headings={['版本','生效时间','到期时间','采购计费项']} empty={!selected.association.procurementVersions?.length} emptyMessage="尚无版本化采购记录，现有报价原样保留。">{[...(selected.association.procurementVersions || [])].reverse().map(version=><Row key={version.id}><Cell>{version.version}</Cell><Cell>{displayTime(version.effectiveAt)}</Cell><Cell>{displayTime(version.expiresAt)}</Cell><Cell>{version.pricing.scenarios.map((item,index)=><div key={index}>{item.name}：{moneyDisplay(cataloguePurchasePrice(item.listPrice,version.pricing.discountFactor,item.purchasePrice))} {item.currency} / {item.unit}</div>)}</Cell></Row>)}</GridTable>
      {params.get('edit')==='1' && <ProcurementVersionEditor state={state} provider={selected.provider} association={selected.association} ops={ops} close={()=>go({edit:null},{saved:true,preserveScroll:true})}/>}
    </> : <Notice error>指定成本对象不存在或已归档，请返回成本列表。</Notice> : <>
      <SearchBox value={params.get('q') || ''} placeholder="搜索模型 / 供应商 / 渠道" onChange={q=>go({q:q || null,page:null},{replace:true,preserveScroll:true})}/>
      <GridTable headings={['模型','供应商','渠道','上游模型标识','成本状态','计费项','操作']} empty={!rows.length}>{rows.slice((page-1)*20,page*20).map(row=><Row key={row.key}><Cell>{row.master?.name || row.association.modelId}</Cell><Cell>{row.provider.name}</Cell><Cell>{supplierChannelName(row.provider,row.association.endpoint)}</Cell><Cell>{row.association.upstreamModelId}</Cell><Cell>{row.status}</Cell><Cell>{row.items.length || '—'}</Cell><Cell><Button variant="link" onClick={()=>open(row)}>查看成本</Button></Cell></Row>)}</GridTable>
      <Pagination count={rows.length} page={page} size={20} setPage={page=>go({page:String(page)},{preserveScroll:true})}/>
    </>}
    {ops.error && <Notice error>{ops.error}</Notice>}{ops.leaveDialog}
  </div>;
}
