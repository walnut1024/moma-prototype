import ServiceListingDialog from './ServiceListingDialog';
import { useState } from 'react';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { GridTable, Row, Cell, Notice, Modal, SearchBox, Pagination, ScopeFields, useOperations } from './ModelOperationsUI';
import { CommercialDialog } from './ServiceWorkspaceDialogs';
import { ModelOperationRecords } from './ServiceManagementWorkspace';
import { priceRecords, operationsReturn } from './model-pricing-workspace';
import { salesScope, salesStatus } from './service-sales';
import { servicePurpose } from './service-purpose';
import { displayTime, moneyDisplay, priceItems } from './model-management';
import './model-pricing-workspace.css';

function SalesSettings({state,service,ops,close}) {
  const model=service.model;
  const [value,setValue]=useState(()=>structuredClone(salesScope(model))),[visible,setVisible]=useState(model.marketVisible!==false),[preview,setPreview]=useState(false),[revision]=useState(model.updatedAt);
  return <Modal wide title="销售设置" description={model.name+' · 同一模型的经营服务共用销售对象范围'} onClose={close}>
    <ScopeFields state={state} {...value} disabled={!ops.can} onChange={(openScope,tenantIds)=>{setValue({openScope,tenantIds});setPreview(false);ops.dirty(true);}}/>
    <label className="mp-checkbox"><Checkbox checked={visible} disabled={!ops.can} onCheckedChange={checked=>{setVisible(checked===true);ops.dirty(true);setPreview(false);}}/>在销售入口展示</label>
    {preview && <Notice>销售范围：{value.openScope==='all'?'全部有效客户':state.tenants.filter(row=>value.tenantIds.includes(row.id)).map(row=>row.name).join('、') || '未选择客户'}。调用授权在模型服务中独立维护，本次不修改。</Notice>}
    {ops.error && <Notice error>{ops.error}</Notice>}
    <div className="mo-footer"><Button variant="outline" onClick={close}>取消</Button><Button disabled={!ops.can || Boolean(ops.conflict)} onClick={async()=>{if(!preview){setPreview(true);return;}if(await ops.run('salesSettings',{scope:value,visible,expectedUpdatedAt:revision,confirmed:true},model.id))close();}}>{preview?'确认保存销售设置':'预览销售设置'}</Button></div>
  </Modal>;
}

export default function ModelPrices(props) {
  const {state}=props,ops=useOperations(props,'model-prices'),{params,go}=ops;
  const services=priceRecords(state),service=services.find(row=>row.id===params.get('service'));
  const [dialog,setDialog]=useState(null);
  const query=(params.get('q') || '').trim().toLowerCase(),rows=services.filter(row=>(!params.has('model') || row.modelId===params.get('model')) && [row.model.name,row.name,row.callId].join(' ').toLowerCase().includes(query));
  const page=Math.min(Math.max(1,Number(params.get('page')) || 1),Math.max(1,Math.ceil(rows.length/20)));
  const tab=['pricing','sales','history'].includes(params.get('tab'))?params.get('tab'):'pricing';
  const back=operationsReturn(params.get('returnTo'));
  const close=()=>ops.proceed(()=>{setDialog(null);ops.dirty(false);ops.setError('');});
  const model=service?.model;
  const providerEntry=model?.serviceProviders?.find(row=>row.providerId===service?.providerId);
  const versions=service?state.modelSalePrices.filter(row=>row.modelId===model.id && (service.providerId?row.scope==='provider' && row.providerId===service.providerId:row.scope==='model')).slice().sort((a,b)=>b.version-a.version):[];
  return <div className="mo-workbench mp-workspace">
    <div className="mp-heading"><h1>{service?`${model.name} · ${service.name} · 售价`:'模型售价'}</h1><div>{back && <Button variant="outline" onClick={()=>ops.proceed(()=>{location.hash=back;})}>返回来源页面</Button>}<Button variant="outline" onClick={()=>go({returnTo:location.hash,tab:'scenario'},{base:'tariff-dictionary',reset:true})}>计量配置</Button></div></div>
    {params.has('service') ? service ? <>
      <dl className="mp-facts"><div><dt>对外调用标识</dt><dd>{service.callId || '待配置'}</dd></div><div><dt>技术状态</dt><dd>{model.callsEnabled?'已启用':'已停用'}</dd></div><div><dt>销售状态</dt><dd>{salesStatus(state,model,service.providerId)}</dd></div><div><dt>售价版本</dt><dd>{service.price?`v${service.price.version}`:'待配置'}</dd></div></dl>
      {servicePurpose(model,service.providerId)==='internal' && <Notice>此服务用于内部使用，无售价记录是合法状态。变更用途请进入模型服务。</Notice>}
      <Tabs value={tab} onValueChange={tab=>go({tab,edit:null},{preserveScroll:true})}>
        <TabsList variant="line" aria-label="服务售价详情"><TabsTrigger value="pricing">售价配置</TabsTrigger><TabsTrigger value="sales">销售设置</TabsTrigger><TabsTrigger value="history">变更记录</TabsTrigger></TabsList>
        <TabsContent value="pricing"><CommercialDialog key={service.id+params.get('edit')} state={state} model={model} providerId={service.providerId || ''} ops={ops} readOnly={params.get('edit')!=='1'} onEdit={()=>go({edit:'1'},{preserveScroll:true})} close={()=>ops.proceed(()=>go({edit:null},{saved:true,preserveScroll:true}))}/><div className="mp-section-heading"><Button variant="link" onClick={()=>go({model:model.id,returnTo:location.hash},{base:'model-costs',reset:true})}>查看关联成本</Button><Button variant="link" onClick={()=>go({model:model.id,panel:'routing',returnTo:location.hash},{base:'listing',reset:true})}>查看服务与路由</Button></div></TabsContent>
        <TabsContent value="sales">
          <div className="mp-section-heading"><h2>销售对象</h2><Button variant="outline" disabled={!ops.can} onClick={()=>setDialog('settings')}>编辑销售设置</Button></div>
          <p>{salesScope(model).openScope==='all'?'全部有效客户':state.tenants.filter(row=>salesScope(model).tenantIds.includes(row.id)).map(row=>row.name).join('、') || '待配置'}</p>
          <p>销售展示：{model.marketVisible===false?'不展示':'展示'}</p>
          {providerEntry && <p>当前供应商展示：{providerEntry.marketVisible===false?'不展示':'展示'} <Button variant="link" disabled={!ops.can} onClick={()=>setDialog(providerEntry.marketVisible===false?'showProvider':'hideProvider')}>{providerEntry.marketVisible===false?'展示此供应商':'隐藏此供应商'}</Button></p>}
          <div className="mp-section-heading"><h2>销售操作</h2><Button disabled={!ops.can || servicePurpose(model,service.providerId)==='internal'} onClick={()=>setDialog(model.listingStatus==='已上架'?'stop':'start')}>{model.listingStatus==='已上架'?'停止销售':'上架销售'}</Button></div>
          <p>销售操作作用于当前模型的经营服务，技术启停在模型服务中维护。</p>
        </TabsContent>
        <TabsContent value="history"><h2>售价版本</h2><GridTable headings={['版本','服务模式修订','生效时间','计费项与售价']} empty={!versions.length} emptyMessage="尚无售价版本。">{versions.map(version=><Row key={version.id}><Cell>{version.version}</Cell><Cell>{version.serviceModeRevision || 0}</Cell><Cell>{displayTime(version.effectiveAt)}</Cell><Cell>{priceItems(version,model).map((item,index)=><div key={index}>{item.name}：{moneyDisplay(item.amount)} {item.currency} / {item.unit}</div>)}</Cell></Row>)}</GridTable><h2>相关操作记录</h2><ModelOperationRecords state={state} model={model}/></TabsContent>
      </Tabs>
      {dialog==='settings' && <SalesSettings state={state} service={service} ops={ops} close={close}/>}
      {['showProvider','hideProvider'].includes(dialog) && <Modal title={dialog==='showProvider'?'展示此供应商':'隐藏此供应商'} description={service.name} onClose={close}><p>仅修改当前供应商的销售展示，技术状态、调用授权、价格与历史保留。</p>{ops.error && <Notice error>{ops.error}</Notice>}<div className="mo-footer"><Button variant="outline" onClick={close}>取消</Button><Button disabled={!ops.can || Boolean(ops.conflict)} onClick={async()=>{if(await ops.run('serviceProviderListing',{providerId:service.providerId,enabled:dialog==='showProvider',expectedUpdatedAt:model.updatedAt},model.id))close();}}>确认</Button></div></Modal>}
      {dialog==='start' && <ServiceListingDialog state={state} model={model} ops={ops} stage="formal" close={close}/>}
      {dialog==='stop' && <Modal title="下架" description={model.name} onClose={close}><p>停止新增销售，保留技术启用状态、价格及历史。</p>{ops.error && <Notice error>{ops.error}</Notice>}<div className="mo-footer"><Button variant="outline" onClick={close}>取消</Button><Button disabled={!ops.can || Boolean(ops.conflict)} onClick={async()=>{if(await ops.run('stopSales',{expectedUpdatedAt:model.updatedAt,confirmed:true},model.id))close();}}>确认下架</Button></div></Modal>}
    </> : <Notice error>指定服务不存在或已归档，请返回售价列表。</Notice> : <>
      <SearchBox value={params.get('q') || ''} placeholder="搜索模型 / 服务提供方 / 调用标识" onChange={q=>go({q:q || null,page:null},{replace:true,preserveScroll:true})}/>
      <GridTable headings={['模型','服务提供方','对外调用标识','售价版本','销售状态','操作']} empty={!rows.length}>{rows.slice((page-1)*20,page*20).map(row=><Row key={row.id}><Cell>{row.model.name}</Cell><Cell>{row.name}</Cell><Cell>{row.callId || '待配置'}</Cell><Cell>{row.price?`v${row.price.version}`:'待配置'}</Cell><Cell>{salesStatus(state,row.model,row.providerId)}</Cell><Cell><Button variant="link" onClick={()=>go({service:row.id,tab:'pricing',edit:null},{preserveScroll:true})}>{row.price?'维护售价':'配置售价'}</Button></Cell></Row>)}</GridTable>
      <Pagination count={rows.length} page={page} size={20} setPage={page=>go({page:String(page)},{preserveScroll:true})}/>
    </>}
    {ops.error && !dialog && <Notice error>{ops.error}</Notice>}{ops.leaveDialog}
  </div>;
}
