import Table from './AdminTable';
import { Button, Descriptions, Typography } from '@douyinfe/semi-ui';
import PricingFilters from './PricingFilters';
import { Notice, serviceOperationsUi } from './ServiceUI';
import { useOperations } from './ModelOperationsUI';
import { costRecords, filterPricingRecords, pricingTableRows, operationsReturn } from './model-pricing-workspace';
import { displayTime, moneyDisplay } from './model-management';
import { supplierChannelName } from './supplier-resources';
import ProcurementVersionEditor from './ProcurementVersionEditor';
import { cataloguePurchasePrice } from './provider-catalogue-pricing';
import './model-pricing-workspace.css';

export default function ModelCosts(props) {
  const {state}=props,ops=useOperations({...props,...serviceOperationsUi},'model-costs'),{params,go}=ops;
  const records=costRecords(state),selected=records.find(row=>row.provider.id===params.get('provider') && row.association.id===params.get('association'));
  const query=(params.get('q') || '').trim().toLowerCase();
  const rows=filterPricingRecords(records,params).filter(row=>(!params.has('model') || state.modelSupplies.some(supply=>supply.modelId===params.get('model') && supply.endpointId===row.association.endpointId && (supply.catalogueModelId || supply.upstreamModelId)===row.association.modelId)) && [row.modelName,row.association.modelId,row.provider.name,row.association.upstreamModelId,supplierChannelName(row.provider,row.association.endpoint)].join(' ').toLowerCase().includes(query));
  const back=operationsReturn(params.get('returnTo'));
  return <div className="semi-services sp-workspace">
    <div className="ss-heading"><Typography.Title heading={4}>{selected?`${selected.modelName} · 模型成本`:'模型成本'}</Typography.Title><div className="sp-actions">{back && <Button onClick={()=>ops.proceed(()=>{location.hash=back;})}>返回来源页面</Button>}<Button onClick={()=>go({returnTo:location.hash,tab:'scenario'},{base:'tariff-dictionary',reset:true})}>计量配置</Button></div></div>
    {params.has('association') ? selected ? <>
      <Descriptions data={[{key:'服务商',value:selected.provider.name},{key:'渠道',value:supplierChannelName(selected.provider,selected.association.endpoint)},{key:'上游模型标识',value:selected.association.upstreamModelId || '—'},{key:'成本状态',value:selected.status}]}/>
      <div className="ss-section-bar"><Typography.Title heading={5}>当前成本</Typography.Title><Button disabled={!ops.can} onClick={()=>go({edit:'1'},{preserveScroll:true})}>编辑成本</Button></div>
      <Table size="small" rowKey="tableKey" pagination={false} scroll={{x:680}} empty="成本待配置，缺失金额不计为零。" dataSource={selected.items.map((item,index)=>({...item,tableKey:index}))} columns={[{title:'计费项',dataIndex:'name'},{title:'适用条件',dataIndex:'condition',render:value=>value || '—'},{title:'采购单价',dataIndex:'amount',render:moneyDisplay},{title:'计价单位',dataIndex:'unit'},{title:'货币',dataIndex:'currency',render:value=>value || '—'}]}/>
      <Typography.Title heading={5}>变更记录</Typography.Title><Table size="small" rowKey="id" pagination={false} scroll={{x:720,y:440}} empty="尚无版本化采购记录，现有报价原样保留。" dataSource={[...(selected.association.procurementVersions || [])].reverse()} columns={[{title:'版本',dataIndex:'version',width:80},{title:'生效时间',dataIndex:'effectiveAt',width:180,render:displayTime},{title:'到期时间',dataIndex:'expiresAt',width:180,render:displayTime},{title:'采购计费项',render:(_,version)=>version.pricing.scenarios.map((item,index)=><Typography.Paragraph key={index}>{item.name}：{moneyDisplay(cataloguePurchasePrice(item.listPrice,version.pricing.discountFactor,item.purchasePrice))} {item.currency} / {item.unit}</Typography.Paragraph>)}]}/>
      {params.get('edit')==='1' && <ProcurementVersionEditor state={state} provider={selected.provider} association={selected.association} ops={ops} close={()=>go({edit:null},{saved:true,preserveScroll:true})}/>}
    </> : <Notice error>指定成本对象不存在或已归档，请返回成本列表。</Notice> : <>
      <PricingFilters records={records} ops={ops} kind="cost"/>
      <Table size="small" rowKey="tableKey" pagination={false} scroll={{x:1080,y:'calc(100vh - 330px)'}} empty="没有符合条件的记录" dataSource={pricingTableRows(rows)} columns={[
        {title:'模型展示名',width:210,render:(_,row)=>({children:row.modelName,props:{rowSpan:row.modelSpan}})},
        {title:'服务商',dataIndex:'supplierName',width:160},
        {title:'渠道',width:160,render:(_,row)=>supplierChannelName(row.provider,row.association.endpoint)},
        {title:'上游模型标识',width:220,render:(_,row)=>row.association.upstreamModelId || '—'},
        {title:'成本状态',dataIndex:'status',width:110},
        {title:'计费项',width:90,render:(_,row)=>row.items.length || '—'},
        {title:'操作',width:130,fixed:'right',render:(_,row)=><Button theme="borderless" onClick={()=>go({provider:row.provider.id,association:row.association.id,edit:null},{preserveScroll:true})}>查看成本</Button>},
      ]}/><Typography.Text type="tertiary">共 {rows.length} 条成本记录</Typography.Text>
    </>}{ops.error && <Notice error>{ops.error}</Notice>}{ops.leaveDialog}
  </div>;
}
