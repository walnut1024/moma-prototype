import AdminStatus from './AdminStatus';
import Table from './AdminTable';
import { useRef } from 'react';
import ModelModuleHeading from './ModelModuleHeading';
import { Button, Card, Typography } from '@douyinfe/semi-ui';
import PricingFilters from './PricingFilters';
import { Notice, serviceOperationsUi } from './ServiceUI';
import { useOperations } from './ModelOperationsUI';
import { costRecords, filterPricingRecords, pricingTableRows, operationsReturn } from './model-pricing-workspace';
import { moneyDisplay } from './model-management';
import { supplierChannelName } from './supplier-resources';
import ProcurementVersionEditor from './ProcurementVersionEditor';
import './model-pricing-workspace.css';

export default function ModelCosts(props) {
  const {state}=props,ops=useOperations({...props,...serviceOperationsUi},'model-costs'),{params,go}=ops;
  const editTrigger=useRef(null);
  const records=costRecords(state);
  const providerId=params.get('provider'),associationId=params.get('association');
  const query=(params.get('q') || '').trim().toLowerCase();
  const channelName=row=>supplierChannelName(row.provider,row.association.endpoint);
  const rows=filterPricingRecords(records,params).filter(row=>
    (!associationId || (row.association.id===associationId && row.provider.id===providerId)) &&
    (!params.has('model') || state.modelSupplies.some(supply=>supply.modelId===params.get('model') && supply.endpointId===row.association.endpointId && (supply.catalogueModelId || supply.upstreamModelId)===row.association.modelId)) &&
    [row.modelName,row.association.modelId,row.supplierName,row.association.upstreamModelId,channelName(row)].join(' ').toLowerCase().includes(query)
  );
  const editing=records.find(row=>row.key===params.get('edit'));
  const back=operationsReturn(params.get('returnTo'));
  const merged=render=>(_,row)=>({children:row.recordSpan ? render(row) : null,props:{rowSpan:row.recordSpan}});
  const closeEdit=()=>{
    go({edit:null},{saved:true,preserveScroll:true});
    requestAnimationFrame(()=>editTrigger.current?.focus({preventScroll:true}));
  };
  return <div className="admin-page-stack semi-services">
    <ModelModuleHeading module="costs">
      {(back || associationId) && <div className="sp-actions">
        {back && <Button onClick={()=>ops.proceed(()=>{location.hash=back;})}>返回来源页面</Button>}
        {associationId && <Button onClick={()=>go({provider:null,association:null},{preserveScroll:true})}>查看全部渠道</Button>}
      </div>}
    </ModelModuleHeading>
    <Card>
      <PricingFilters records={records} ops={ops} kind="cost"/>
      <Table size="small" rowKey="tableKey" pagination={false} scroll={{x:1060,y:'calc(100vh - 330px)'}} empty="没有符合条件的记录" dataSource={pricingTableRows(rows,row=>row.items)} columns={[
      {title:'模型展示名',width:165,render:(_,row)=>({children:row.modelName,props:{rowSpan:row.modelSpan}})},
      {title:'服务商',width:112,render:merged(row=>row.supplierName)},
      {title:'渠道',width:100,render:merged(channelName)},
      {title:'上游模型标识',width:150,render:merged(row=>row.association.upstreamModelId || '—')},
      {title:'计费项',width:125,render:(_,row)=><div>{row.item?.name || '—'}{row.item?.condition && <Typography.Paragraph type="tertiary">{row.item.condition}</Typography.Paragraph>}</div>},
      {title:'渠道采购价',width:100,align:'right',render:(_,row)=>moneyDisplay(row.item?.amount)},
      {title:'计费单位',width:100,render:(_,row)=>row.item?.unit || '—'},
      {title:'货币',width:60,render:(_,row)=>row.item?.currency || '—'},
      {title:'成本状态',width:88,render:merged(row=><AdminStatus value={row.status}/>)},
      {title:'操作',width:68,fixed:'right',render:merged(row=><Button theme="borderless" size="small" disabled={!ops.can} aria-label={`编辑 ${row.modelName} · ${row.supplierName} · ${channelName(row)}`} onClick={event=>{editTrigger.current=event.currentTarget;go({edit:row.key},{preserveScroll:true});}}>编辑</Button>)},
    ]}/><Typography.Text type="tertiary">共 {rows.length} 条成本记录</Typography.Text>
    </Card>
    {editing && <ProcurementVersionEditor key={editing.key} state={state} provider={editing.provider} association={editing.association} ops={ops} close={closeEdit}/>}
    {ops.error && !editing && <Notice error>{ops.error}</Notice>}{ops.leaveDialog}
  </div>;
}
