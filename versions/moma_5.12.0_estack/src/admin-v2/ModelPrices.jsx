import ModelResourceJsonPage from './ModelResourceJsonPage';
import ModelResourceTransfer from './ModelResourceTransfer';
import { CopyId } from './ServiceUI';
import { offerKey } from '../service-access.mjs';
import { callStateLabel, serviceReferenceStarted } from './service-directory';
import AdminStatus from './AdminStatus';
import Table from './AdminTable';
import ModelModuleHeading from './ModelModuleHeading';
import { Button, Card, Descriptions, Tabs, Typography } from '@douyinfe/semi-ui';
import { Notice, serviceOperationsUi } from './ServiceUI';
import { useOperations } from './ModelOperationsUI';
import { CommercialDialog } from './ServiceWorkspaceDialogs';
import PricingFilters from './PricingFilters';
import { priceRecords, filterPricingRecords, pricingTableRows, operationsReturn } from './model-pricing-workspace';
import { salesStatus } from './service-sales';
import { servicePurpose } from './service-purpose';
import { displayTime, moneyDisplay, priceItems } from './model-management';
import './model-pricing-workspace.css';

export default function ModelPrices(props) {
  const {state}=props,ops=useOperations({...props,...serviceOperationsUi},'model-prices'),{params,go}=ops;
  const services=priceRecords(state),service=services.find(row=>row.id===params.get('service'));
  const query=(params.get('q') || '').trim().toLowerCase(),rows=filterPricingRecords(services,params).filter(row=>(!params.has('model') || row.modelId===params.get('model')) && [row.modelName,row.name,row.supplierName,row.callId,row.canonical_slug,row.model_service_id].join(' ').toLowerCase().includes(query));
  const tab=['pricing','history'].includes(params.get('tab'))?params.get('tab'):'pricing',back=operationsReturn(params.get('returnTo'));
  const model=service?.model,key=offerKey(service);
  const versions=service?state.modelSalePrices.filter(row=>row.modelId===model.id && (service.providerId?row.scope==='provider' && offerKey(row)===key:row.scope==='model')).slice().sort((a,b)=>b.version-a.version):[];
  const merged=render=>(_,row)=>({children:render(row),props:{rowSpan:row.recordSpan}});
  if (params.get('resourceJson') === '1') return <ModelResourceJsonPage state={state} ops={ops} scope="prices"/>;
  return <div className="admin-page-stack semi-services">
    <ModelModuleHeading module="prices" title={service?`${model.name} · ${service.offerName} · 售价`:undefined}><div className="sp-actions">{!params.has('service') && <ModelResourceTransfer state={state} ops={ops} scope="prices"/>}{back && <Button onClick={()=>ops.proceed(()=>{location.hash=back;})}>返回来源页面</Button>}<Button onClick={()=>go({returnTo:location.hash,tab:'scenario'},{base:'tariff-dictionary',reset:true})}>计量配置</Button></div></ModelModuleHeading>
    {params.has('service') ? service ? <Card>
      <div className="ss-body">
      <div className="ss-section-bar"><Typography.Title heading={5}>服务售价</Typography.Title><ModelResourceTransfer state={state} ops={ops} scope="prices"/></div>
      <Descriptions data={[{key:'模型服务 ID',value:<CopyId value={service.model_service_id} label="模型服务 ID"/>},{key:'模型编码',value:service.canonical_slug},{key:'模型调用标识',value:service.callId || '待配置'},{key:'服务状态',value:<AdminStatus value={callStateLabel(serviceReferenceStarted(model, service))}/>},{key:'销售状态',value:<AdminStatus value={salesStatus(state,model,key)}/>},{key:'售价版本',value:service.price?`v${service.price.version}`:'待配置'}]}/>
      {servicePurpose(model,key)==='internal' && <Notice>内部服务可在「模型服务」完成技术验证与启用。</Notice>}
      <Tabs activeKey={tab} keepDOM={false} onChange={tab=>go({tab,edit:null},{preserveScroll:true})}>
        <Tabs.TabPane itemKey="pricing" tab="售价配置"><div className="ss-tab-content ss-body"><CommercialDialog key={service.id+params.get('edit')} state={state} model={model} providerId={key} ops={ops} readOnly={params.get('edit')!=='1'} onEdit={()=>go({edit:'1'},{preserveScroll:true})} close={()=>ops.proceed(()=>go({edit:null},{saved:true,preserveScroll:true}))}/></div></Tabs.TabPane>
        <Tabs.TabPane itemKey="history" tab="变更记录"><div className="ss-tab-content ss-body"><Typography.Title heading={5}>售价版本</Typography.Title><Table size="small" rowKey="id" dataSource={versions} pagination={false} scroll={{x:760,y:420}} empty="尚无售价版本。" columns={[{title:'价格版本 ID',dataIndex:'id',width:280,render:value=><CopyId value={value} label="价格版本 ID"/>},{title:'版本',dataIndex:'version',width:80},{title:'生效时间',dataIndex:'effectiveAt',width:180,render:displayTime},{title:'计费项与售价',render:(_,version)=>priceItems(version,model).map((item,index)=><Typography.Paragraph key={index}>{item.name}：{moneyDisplay(item.amount)} {item.currency} / {item.unit}</Typography.Paragraph>)}]}/></div></Tabs.TabPane>
      </Tabs>
      </div>
    </Card> : <Notice error>指定服务不存在或已归档，请返回售价列表。</Notice> : <Card>
      <PricingFilters records={services} ops={ops} kind="price"/>
      <Table size="small" rowKey="tableKey" pagination={false} scroll={{x:1490,y:'calc(100vh - 330px)'}} dataSource={pricingTableRows(rows,row=>priceItems(row.price,row.model))} empty="没有符合条件的记录" columns={[
        {title:'模型展示名',width:160,render:(_,row)=>({children:row.modelName,props:{rowSpan:row.modelSpan}})},
        {title:'模型编码',width:140,render:merged(row=><CopyId value={row.canonical_slug} label="模型编码" ellipsis={{showTooltip:true}}/>)},
        {title:'模型服务 ID',width:190,render:merged(row=><CopyId value={row.model_service_id} label="模型服务 ID" ellipsis={{showTooltip:true}}/>)},
        {title:'服务商 / 渠道',width:120,render:merged(row=>row.offerName)},
        {title:'模型调用标识',width:160,render:merged(row=>row.callId || '待配置')},
        {title:'计费项',width:130,render:(_,row)=><div>{row.item?.name || '—'}{row.item?.condition && <Typography.Paragraph type="tertiary">{row.item.condition}</Typography.Paragraph>}</div>},
        {title:'售价',width:110,align:'right',render:(_,row)=>row.item?.amount == null?'—':moneyDisplay(row.item.amount)},
        {title:'计费单位',width:140,render:(_,row)=>row.item?.unit || '—'},
        {title:'货币',width:90,render:(_,row)=>row.item?.currency || '—'},
        {title:'售价版本',width:100,render:merged(row=>row.price?`v${row.price.version}`:'待配置')},
        {title:'销售状态',width:120,render:merged(row=><AdminStatus value={row.status}/>)},
        {title:'操作',width:130,fixed:'right',render:merged(row=><Button theme="borderless" size="small" onClick={()=>go({service:row.id,tab:'pricing',edit:null},{preserveScroll:true})}>{row.price?'维护售价':'配置售价'}</Button>)},
      ]}/><Typography.Text type="tertiary">共 {rows.length} 项服务</Typography.Text>
    </Card>}{ops.error && <Notice error>{ops.error}</Notice>}{ops.leaveDialog}
  </div>;
}
