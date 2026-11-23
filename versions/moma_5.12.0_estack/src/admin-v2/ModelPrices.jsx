import ModelResourceTransfer from './ModelResourceTransfer';
import { useState } from 'react';
import { IconPlus } from '@douyinfe/semi-icons';
import { CopyId, Field, Modal } from './ServiceUI';
import SalesAudience, { salesAudienceLabel } from './SalesAudience';
import ServiceListingDialog from './ServiceListingDialog';
import { offerKey, offerStage, providerOffer, salesPaused } from '../service-access.mjs';
import { callStateLabel, serviceReferenceStarted } from './service-directory';
import AdminStatus from './AdminStatus';
import Table from './AdminTable';
import ModelModuleHeading from './ModelModuleHeading';
import { Button, Card, Descriptions, Select, Space, Tabs, Typography } from '@douyinfe/semi-ui';
import { Notice, serviceOperationsUi } from './ServiceUI';
import { useOperations } from './ModelOperationsUI';
import { CommercialDialog } from './ServiceWorkspaceDialogs';
import PricingFilters from './PricingFilters';
import { priceRecords, filterPricingRecords, pricingTableRows, operationsReturn } from './model-pricing-workspace';
import { salesScope } from './service-sales';
import { displayTime, moneyDisplay, priceItems } from './model-management';
import './model-pricing-workspace.css';

export default function ModelPrices(props) {
  const { state, readOnly } = props;
  const pageOps = useOperations({ ...props, ...serviceOperationsUi }, 'model-prices');
  const ops = { ...pageOps, can: pageOps.can && !readOnly };
  const { params, go } = ops;
  const [salesDialog, setSalesDialog] = useState(null);
  const [salePick, setSalePick] = useState('');
  const [busy, setBusy] = useState(false);
  const candidatesVisible = params.get('add') === '1';
  const services=priceRecords(state),service=services.find(row=>row.id===params.get('service'));
  const query=(params.get('q') || '').trim().toLowerCase(),rows=filterPricingRecords(services,params, false).filter(row=>(!params.has('model') || row.modelId===params.get('model')) && [row.modelName,row.name,row.callId,row.canonical_slug,row.model_service_id].join(' ').toLowerCase().includes(query));
  const tab=['pricing','history','scope'].includes(params.get('tab'))?params.get('tab'):'pricing',back=operationsReturn(params.get('returnTo'));
  const model=service?.model,key=offerKey(service);
  const versions=service?state.modelSalePrices.filter(row=>row.modelId===model.id && (service.providerId?row.scope==='provider' && offerKey(row)===key:row.scope==='model')).slice().sort((a,b)=>b.version-a.version):[];
  const saleStage = row => offerStage(row.model, providerOffer(row.model, offerKey(row)));
  const onSale = row => ['gray', 'formal'].includes(saleStage(row)) && !salesPaused(row.model, offerKey(row));
  const configure = (row, tab = 'pricing') => go({ service: row.id, tab, add: null, edit: null }, { preserveScroll: true });
  const showSales = (row, stage) => setSalesDialog({ row, stage, revision: row.model.updatedAt });
  const closeSales = () => ops.proceed(() => { setSalesDialog(null); ops.setError(''); });
  const saleRow = salesDialog && services.find(row => row.id === salesDialog.row.id);
  const saleActions = row => <Space spacing={4} wrap>
    {onSale(row) ? <Button size="small" theme="borderless" disabled={!ops.can} onClick={() => showSales(row, 'pause')}>停售</Button>
      : <Button size="small" theme="borderless" disabled={!ops.can} onClick={() => showSales(row, 'formal')}>开售</Button>}
    <Button size="small" theme="borderless" disabled={!ops.can} onClick={() => showSales(row, 'gray')}>灰度开售</Button>
  </Space>;
  const eligible = services.filter(row => !row.price);
  const merged=render=>(_,row)=>({children:render(row),props:{rowSpan:row.recordSpan}});
  return <div className="admin-page-stack semi-services">
    <ModelModuleHeading module="prices" title={service?`${model.name} · ${service.offerName}`:"模型销售"}><div className="sp-actions">{!params.has('service') && <>
        <Button icon={<IconPlus/>} theme="solid" disabled={!ops.can || !eligible.length}
          onClick={() => { setSalePick(''); go({ add:'1' }, { preserveScroll:true }); }}>添加模型售卖</Button>
        <ModelResourceTransfer state={state} ops={ops} scope="prices"/>
      </>}{back && <Button onClick={()=>ops.proceed(()=>{location.hash=back;})}>返回来源页面</Button>}<Button onClick={()=>go({returnTo:location.hash,tab:'scenario'},{base:'tariff-dictionary',reset:true})}>计量配置</Button></div></ModelModuleHeading>
    {params.has('service') ? service ? <Card>
      <div className="ss-body">
      <div className="ss-section-bar"><Typography.Title heading={5}>模型售卖</Typography.Title>{saleActions(service)}<ModelResourceTransfer state={state} ops={ops} scope="prices"/></div>
      <Descriptions data={[{key:'模型服务 ID',value:<CopyId value={service.model_service_id} label="模型服务 ID"/>},{key:'模型编码',value:service.canonical_slug},{key:'模型 ID',value:service.callId || '待配置'},{key:'服务状态',value:<AdminStatus value={callStateLabel(serviceReferenceStarted(model, service))}/>},{key:'售卖状态',value:<Space><AdminStatus value={service.status}/>{!service.price && <AdminStatus value="不可售"/>}</Space>},{key:'模型刊例价版本',value:service.price?`v${service.price.version}`:'待配置'}]}/>
      <Tabs activeKey={tab} keepDOM={false} onChange={tab=>go({tab,edit:null},{preserveScroll:true})}>
        <Tabs.TabPane itemKey="pricing" tab="模型刊例价配置"><div className="ss-tab-content ss-body"><CommercialDialog key={service.id+params.get('edit')} state={state} model={model} providerId={key} ops={ops} readOnly={readOnly || params.get('edit')!=='1'} onEdit={()=>go({edit:'1'},{preserveScroll:true})} close={()=>ops.proceed(()=>go({edit:null},{saved:true,preserveScroll:true}))}/></div></Tabs.TabPane>
        <Tabs.TabPane itemKey="scope" tab="销售对象">
          <SalesAudience key={model.id + ':' + model.updatedAt} state={state} model={model} services={services} ops={ops}/>
        </Tabs.TabPane>
        <Tabs.TabPane itemKey="history" tab="变更记录"><div className="ss-tab-content ss-body"><Typography.Title heading={5}>模型刊例价版本</Typography.Title><Table size="small" rowKey="id" dataSource={versions} pagination={false} scroll={{x:760,y:420}} empty="尚无模型刊例价版本。" columns={[{title:'模型刊例价版本 ID',dataIndex:'id',width:280,render:value=><CopyId value={value} label="模型刊例价版本 ID"/>},{title:'版本',dataIndex:'version',width:80},{title:'生效时间',dataIndex:'effectiveAt',width:180,render:displayTime},{title:'计费项与模型刊例价',render:(_,version)=>priceItems(version,model).map((item,index)=><Typography.Paragraph key={index}>{item.name}：{moneyDisplay(item.amount)} {item.currency} / {item.unit}</Typography.Paragraph>)}]}/></div></Tabs.TabPane>
      </Tabs>
      </div>
    </Card> : <Notice error>指定服务不存在或已归档，请返回模型刊例价列表。</Notice> : <Card>
      <PricingFilters records={services} ops={ops} kind="price"/>
      <Table size="small" rowKey="tableKey" pagination={false} scroll={{x:1740,y:'calc(100vh - 330px)'}} dataSource={pricingTableRows(rows,row=>priceItems(row.price,row.model))} empty="没有符合条件的记录" columns={[
        {title:'模型展示名称',width:160,render:(_,row)=>({children:row.modelName,props:{rowSpan:row.modelSpan}})},
        {title:'模型编码',width:140,render:merged(row=><CopyId value={row.canonical_slug} label="模型编码" ellipsis={{showTooltip:true}}/>)},
        {title:'模型服务 ID',width:190,render:merged(row=><CopyId value={row.model_service_id} label="模型服务 ID" ellipsis={{showTooltip:true}}/>)},
        {title:'模型 ID',width:160,render:merged(row=>row.callId || '待配置')},
        {title:'计费项',width:130,render:(_,row)=><div>{row.item?.name || '—'}{row.item?.condition && <Typography.Paragraph type="tertiary">{row.item.condition}</Typography.Paragraph>}</div>},
        {title:'模型刊例价',width:110,align:'right',render:(_,row)=>row.item?.amount == null?'—':moneyDisplay(row.item.amount)},
        {title:'计费单位',width:140,render:(_,row)=>row.item?.unit || '—'},
        {title:'货币',width:90,render:(_,row)=>row.item?.currency || '—'},
        {title:'模型刊例价版本',width:100,render:merged(row=>row.price?`v${row.price.version}`:'待配置')},
        {title:'售卖状态',width:120,render:merged(row=><Space><AdminStatus value={row.status}/>{!row.price && <AdminStatus value="不可售"/>}</Space>)},
        {title:'销售对象',width:140,render:merged(row=><Button theme="borderless" size="small" onClick={() => configure(row, 'scope')}>{salesAudienceLabel(state, salesScope(row.model))}</Button>)},
        {title:'操作',width:230,fixed:'right',render:merged(row=><Space wrap spacing={4}>
          <Button theme="borderless" size="small" onClick={() => configure(row)}>{readOnly ? '查看配置' : row.price ? '维护模型刊例价' : '配置模型刊例价'}</Button>
          {saleActions(row)}
        </Space>)},
      ]}/><Typography.Text type="tertiary">共 {rows.length} 项服务</Typography.Text>
    </Card>}
    {candidatesVisible && !readOnly && <Modal wide title="添加模型售卖" onClose={() => go({ add:null }, { preserveScroll:true })} footer={<>
      <Button onClick={() => go({ add:null }, { preserveScroll:true })}>取消</Button>
      <Button theme="solid" disabled={!eligible.some(row => row.id === salePick) || !ops.can} onClick={() => go({ service:salePick, tab:'pricing', add:null, edit:'1' }, { preserveScroll:true })}>添加并配置</Button>
    </>}>
      <Field label="模型服务" required><Select value={salePick || undefined} filter style={{ width:'100%' }}
        placeholder="选择已有模型服务" optionList={eligible.map(row => ({ value:row.id, label:row.name + ' · ' + row.callId }))} onChange={setSalePick}/></Field>
    </Modal>}
    {salesDialog && saleRow && salesDialog.stage !== 'pause' && !readOnly && <ServiceListingDialog state={state} model={saleRow.model}
      initialOfferKey={offerKey(saleRow)} ops={ops} stage={salesDialog.stage} close={closeSales}/>}
    {salesDialog?.stage === 'pause' && saleRow && !readOnly && <Modal title="停售" description={saleRow.callId}
      centered onClose={() => !busy && closeSales()} footer={<>
        <Button disabled={busy} onClick={closeSales}>取消</Button>
        <Button theme="solid" type="danger" loading={busy} disabled={!ops.can || saleRow.model.updatedAt !== salesDialog.revision}
          onClick={async () => {
            setBusy(true);
            try {
              if (await ops.run('pauseSales', { offerKey: offerKey(saleRow), expectedUpdatedAt: salesDialog.revision, confirmed:true }, saleRow.model.id)) closeSales();
            } finally { setBusy(false); }
          }}>确认停售</Button>
      </>}>
      <p>停售后暂停新订购，已有订单与调用权限继续有效。</p>
      {ops.error && <Notice error>{ops.error}</Notice>}
    </Modal>}
    {ops.error && !salesDialog && <Notice error>{ops.error}</Notice>}{ops.leaveDialog}
  </div>;
}
