import { offerKey, providerOffer } from '../service-access.mjs';
import AdminStatus from './AdminStatus';
import Table from './AdminTable';
import { useState } from 'react';
import ModelModuleHeading from './ModelModuleHeading';
import { Button, Card, Descriptions, Tabs, Typography } from '@douyinfe/semi-ui';
import { Choice, Field, Modal, Notice, serviceOperationsUi } from './ServiceUI';
import { useOperations } from './ModelOperationsUI';
import { CommercialDialog } from './ServiceWorkspaceDialogs';
import { ModelOperationRecords } from './ServiceManagementWorkspace';
import PricingFilters from './PricingFilters';
import { priceRecords, filterPricingRecords, pricingTableRows, operationsReturn } from './model-pricing-workspace';
import { salesScope, salesStatus } from './service-sales';
import { scopeTenants } from './service-commercial';
import { servicePurpose } from './service-purpose';
import { displayTime, moneyDisplay, priceItems } from './model-management';
import './model-pricing-workspace.css';

function SalesSettings({state,service,ops,close}) {
  const model=service.model,tenants=scopeTenants(state);
  const [value,setValue]=useState(()=>structuredClone(salesScope(model))),[preview,setPreview]=useState(false),[revision]=useState(model.updatedAt);
  const change=patch=>{setValue(row=>({...row,...patch}));setPreview(false);ops.dirty(true);};
  return <Modal wide title="销售设置" description={model.name+' · 同一模型的经营服务共用销售对象范围'} onClose={close} footer={<><Button onClick={close}>取消</Button><Button disabled={!ops.can || Boolean(ops.conflict)} onClick={async()=>{if(!preview){setPreview(true);return;}if(await ops.run('salesSettings',{scope:value,expectedUpdatedAt:revision,confirmed:true},model.id))close();}}>{preview?'确认保存销售设置':'预览销售设置'}</Button></>}>
    <Field label="销售对象 *"><Choice label="客户范围" value={value.openScope || 'none'} options={[[ 'none','请选择销售对象' ],['all','全部有效客户'],['selected','指定客户']]} disabled={!ops.can} onChange={openScope=>change({openScope})}/></Field>
    {value.openScope==='selected' && <Field label="选择客户 *"><Choice label="客户" multiple filter value={value.tenantIds || []} options={tenants.map(row=>[row.id,row.name+' · '+row.id])} disabled={!ops.can} onChange={tenantIds=>change({tenantIds})}/>{value.tenantIds?.some(id=>!tenants.some(row=>row.id===id)) && <Notice error>范围内有已停用或删除的客户。<Button theme="borderless" disabled={!ops.can} onClick={()=>change({tenantIds:value.tenantIds.filter(id=>tenants.some(row=>row.id===id))})}>移除无效客户</Button></Notice>}</Field>}
    {preview && <Notice>销售范围：{value.openScope==='all'?'全部有效客户':state.tenants.filter(row=>value.tenantIds.includes(row.id)).map(row=>row.name).join('、') || '未选择客户'}。</Notice>}{ops.error && <Notice error>{ops.error}</Notice>}
  </Modal>;
}
export default function ModelPrices(props) {
  const {state}=props,ops=useOperations({...props,...serviceOperationsUi},'model-prices'),{params,go}=ops;
  const services=priceRecords(state),service=services.find(row=>row.id===params.get('service'));
  const [dialog,setDialog]=useState(null);
  const query=(params.get('q') || '').trim().toLowerCase(),rows=filterPricingRecords(services,params).filter(row=>(!params.has('model') || row.modelId===params.get('model')) && [row.model.name,row.name,row.supplierName,row.callId].join(' ').toLowerCase().includes(query));
  const tab=['pricing','sales','history'].includes(params.get('tab'))?params.get('tab'):'pricing',back=operationsReturn(params.get('returnTo'));
  const close=()=>ops.proceed(()=>{setDialog(null);ops.dirty(false);ops.setError('');});
  const model=service?.model,key=offerKey(service),providerEntry=model && providerOffer(model,key);
  const versions=service?state.modelSalePrices.filter(row=>row.modelId===model.id && (service.providerId?row.scope==='provider' && offerKey(row)===key:row.scope==='model')).slice().sort((a,b)=>b.version-a.version):[];
  const merged=render=>(_,row)=>({children:render(row),props:{rowSpan:row.recordSpan}});
  return <div className="admin-page-stack semi-services">
    <ModelModuleHeading module="prices" title={service?`${model.name} · ${service.offerName} · 售价`:undefined}><div className="sp-actions">{back && <Button onClick={()=>ops.proceed(()=>{location.hash=back;})}>返回来源页面</Button>}<Button onClick={()=>go({returnTo:location.hash,tab:'scenario'},{base:'tariff-dictionary',reset:true})}>计量配置</Button></div></ModelModuleHeading>
    {params.has('service') ? service ? <Card>
      <div className="ss-body">
      <Descriptions data={[{key:'对外调用标识',value:service.callId || '待配置'},{key:'技术状态',value:<AdminStatus value={model.callsEnabled?'已启用':'已停用'}/>},{key:'销售状态',value:<AdminStatus value={salesStatus(state,model,key)}/>},{key:'售价版本',value:service.price?`v${service.price.version}`:'待配置'}]}/>
      {servicePurpose(model,service.providerId)==='internal' && <Notice>此服务用于内部使用，无售价记录是合法状态。服务用途在新建模型服务时确定。</Notice>}
      <Tabs activeKey={tab} keepDOM={false} onChange={tab=>go({tab,edit:null},{preserveScroll:true})}>
        <Tabs.TabPane itemKey="pricing" tab="售价配置"><div className="ss-tab-content ss-body"><CommercialDialog key={service.id+params.get('edit')} state={state} model={model} providerId={key} ops={ops} readOnly={params.get('edit')!=='1'} onEdit={()=>go({edit:'1'},{preserveScroll:true})} close={()=>ops.proceed(()=>go({edit:null},{saved:true,preserveScroll:true}))}/><div className="ss-section-bar"><Button theme="borderless" onClick={()=>go({model:model.id,returnTo:location.hash},{base:'model-costs',reset:true})}>查看关联成本</Button><Button theme="borderless" onClick={()=>go({model:model.id,panel:'routing',returnTo:location.hash},{base:'listing',reset:true})}>查看服务与路由</Button></div></div></Tabs.TabPane>
        <Tabs.TabPane itemKey="sales" tab="销售设置"><div className="ss-tab-content ss-body"><div className="ss-section-bar"><Typography.Title heading={5}>销售对象</Typography.Title><Button disabled={!ops.can} onClick={()=>setDialog('settings')}>编辑销售设置</Button></div><Typography.Paragraph>{salesScope(model).openScope==='all'?'全部有效客户':state.tenants.filter(row=>salesScope(model).tenantIds.includes(row.id)).map(row=>row.name).join('、') || '待配置'}</Typography.Paragraph>{providerEntry && <Typography.Paragraph>当前渠道服务展示：{providerEntry.marketVisible===false?'不展示':'展示'} <Button theme="borderless" disabled={!ops.can} onClick={()=>setDialog(providerEntry.marketVisible===false?'showProvider':'hideProvider')}>{providerEntry.marketVisible===false?'展示此渠道服务':'隐藏此渠道服务'}</Button></Typography.Paragraph>}</div></Tabs.TabPane>
        <Tabs.TabPane itemKey="history" tab="变更记录"><div className="ss-tab-content ss-body"><Typography.Title heading={5}>售价版本</Typography.Title><Table size="small" rowKey="id" dataSource={versions} pagination={false} scroll={{x:760,y:420}} empty="尚无售价版本。" columns={[{title:'版本',dataIndex:'version',width:80},{title:'服务模式修订',dataIndex:'serviceModeRevision',width:120,render:value=>value || 0},{title:'生效时间',dataIndex:'effectiveAt',width:180,render:displayTime},{title:'计费项与售价',render:(_,version)=>priceItems(version,model).map((item,index)=><Typography.Paragraph key={index}>{item.name}：{moneyDisplay(item.amount)} {item.currency} / {item.unit}</Typography.Paragraph>)}]}/><Typography.Title heading={5}>相关操作记录</Typography.Title><ModelOperationRecords state={state} model={model}/></div></Tabs.TabPane>
      </Tabs>
      </div>
      {dialog==='settings' && <SalesSettings state={state} service={service} ops={ops} close={close}/>}
      {['showProvider','hideProvider'].includes(dialog) && <Modal title={dialog==='showProvider'?'展示此渠道服务':'隐藏此渠道服务'} description={service.supplierName} onClose={close} footer={<><Button onClick={close}>取消</Button><Button disabled={!ops.can || Boolean(ops.conflict)} onClick={async()=>{if(await ops.run('serviceProviderListing',{providerId:key,enabled:dialog==='showProvider',expectedUpdatedAt:model.updatedAt},model.id))close();}}>确认</Button></>}><Typography.Paragraph>仅修改当前渠道服务的广场展示。</Typography.Paragraph>{ops.error && <Notice error>{ops.error}</Notice>}</Modal>}
    </Card> : <Notice error>指定服务不存在或已归档，请返回售价列表。</Notice> : <Card>
      <PricingFilters records={services} ops={ops} kind="price"/>
      <Table size="small" rowKey="tableKey" pagination={false} scroll={{x:1550,y:'calc(100vh - 330px)'}} dataSource={pricingTableRows(rows,row=>priceItems(row.price,row.model))} empty="没有符合条件的记录" columns={[
        {title:'模型展示名',width:200,render:(_,row)=>({children:row.modelName,props:{rowSpan:row.modelSpan}})},
        {title:'服务商',width:150,render:merged(row=>row.offerName)},
        {title:'对外调用标识',width:230,render:merged(row=>row.callId || '待配置')},
        {title:'计费项',width:180,render:(_,row)=><div>{row.item?.name || '—'}{row.item?.condition && <Typography.Paragraph type="tertiary">{row.item.condition}</Typography.Paragraph>}</div>},
        {title:'售价',width:110,align:'right',render:(_,row)=>row.item?.amount == null?'—':moneyDisplay(row.item.amount)},
        {title:'计费单位',width:140,render:(_,row)=>row.item?.unit || '—'},
        {title:'货币',width:90,render:(_,row)=>row.item?.currency || '—'},
        {title:'售价版本',width:100,render:merged(row=>row.price?`v${row.price.version}`:'待配置')},
        {title:'销售状态',width:120,render:merged(row=><AdminStatus value={row.status}/>)},
        {title:'操作',width:130,fixed:'right',render:merged(row=><Button theme="borderless" size="small" onClick={()=>go({service:row.id,tab:'pricing',edit:null},{preserveScroll:true})}>{row.price?'维护售价':'配置售价'}</Button>)},
      ]}/><Typography.Text type="tertiary">共 {rows.length} 项服务</Typography.Text>
    </Card>}{ops.error && !dialog && <Notice error>{ops.error}</Notice>}{ops.leaveDialog}
  </div>;
}
