import { IconLockStroked } from '@douyinfe/semi-icons';
import { scopeTenants } from './service-commercial';
import { useRef, useState } from 'react';
import { Button, Radio, Space, Typography, Tooltip } from '@douyinfe/semi-ui';
import {Choice, Field} from './ServiceUI';
import { Notice, Modal } from './ServiceUI';
import { SERVICE_MODES } from './model-operations';
import { providerServices } from './service-workspace';
import { supplierDirectory } from './moma-provider';
import { ServiceScopeEditor, ServiceIdentityDialog } from './ServiceConfigurationDialogs';
import { RouteWorkbench } from './ServiceRouting';
import { ServiceSupplierDialog } from './ServiceConfigurationDialogs';

export function ServiceModeBar({model,ops,act}) {
  return <div className="ss-section-bar"><Space wrap><Typography.Text strong>服务模式</Typography.Text>{Object.entries(SERVICE_MODES).map(([value,item])=><Tooltip key={value} content={item.englishName+' · '+item.description}><Radio checked={model.serviceMode===value} disabled>{item.label}</Radio></Tooltip>)}</Space>{model.serviceMode?<Button theme="borderless" disabled={!ops.can} onClick={()=>act(model,'serviceMode')} icon={<IconLockStroked aria-hidden="true"/>}>解锁并切换服务模式</Button>:<Button disabled={!ops.can} onClick={()=>act(model,'serviceMode')}>选择服务模式</Button>}</div>;
}
function StandardContent({state,model,ops}) {
  const [identity,setIdentity]=useState(false);
  const close=()=>ops.proceed(()=>{setIdentity(false);ops.dirty(false);ops.setError('');});
  return <><RouteWorkbench state={state} model={model} ops={ops} onIdentity={()=>ops.proceed(()=>setIdentity(true))}/>{identity && <ServiceIdentityDialog model={model} ops={ops} close={close}/>}</>;
}
function ProviderContent({state,model,ops}) {
  const [creatingProvider,setCreatingProvider]=useState(false);
  const [providerId,setProviderId]=useState(''), [editing,setEditing]=useState(null), [removing,setRemoving]=useState(null), [changing,setChanging]=useState(null), trigger=useRef(null), associateTrigger=useRef(null);
  const entries=providerServices(model), suppliers=supplierDirectory(state);
  const rows=entries.map(entry=>({...entry,provider:state.providers.find(item=>item.id===entry.providerId)}));
  const close=()=>ops.proceed(()=>{setEditing(null);setRemoving(null);setChanging(null);setProviderId('');ops.dirty(false);ops.setError('');if(ops.params.has('providerEdit') || ops.params.has('providerAdd') || ops.params.has('identityProvider'))ops.go({providerEdit:null,providerAdd:null,identityProvider:null},{saved:true,preserveScroll:true});requestAnimationFrame(()=>{if(trigger.current?.isConnected)trigger.current.focus();else associateTrigger.current?.focus();});});
  const editProviderId=editing || ops.params.get('identityProvider');
  return <>
    <RouteWorkbench state={state} model={model} ops={ops} onAddProvider={()=>ops.go({providerAdd:'1',providerChannels:null},{preserveScroll:true})} onIdentity={id=>ops.go({identityProvider:id,routeProvider:id,providerChannels:null},{preserveScroll:true})} onProviderState={(id,operation,enabled)=>ops.proceed(()=>setChanging({providerId:id,operation,enabled,expectedUpdatedAt:model.updatedAt}))} onRemoveProvider={id=>ops.proceed(()=>setRemoving(rows.find(row=>row.providerId===id)))}/>

    {ops.params.has('providerAdd') && !creatingProvider && <Modal title="关联服务商及渠道" onClose={close}><form noValidate onSubmit={async event=>{event.preventDefault();const next=await ops.run('associateServiceProvider',{providerId,expectedUpdatedAt:model.updatedAt},model.id);if(next){setEditing(providerId);if(ops.params.has('providerAdd'))ops.go({providerAdd:null},{saved:true,preserveScroll:true});}}}><Field label="服务商 *"><Choice label="关联已有服务商" value={providerId || 'none'} disabled={!ops.can} options={[[ 'none','请选择服务商'],...suppliers.filter(item=>!entries.some(entry=>entry.providerId===item.id)).map(item=>[item.id,item.name])]} onChange={id=>{setProviderId(id==='none'?'':id);ops.dirty(true);ops.setError('');}}/></Field><Button htmlType="button" theme="borderless" disabled={!ops.can} onClick={()=>ops.proceed(()=>setCreatingProvider(true))}>新增服务商</Button>{ops.error && <Notice error>{ops.error}</Notice>}<div className="ss-footer"><Button htmlType="button" theme="light" onClick={close}>取消</Button><Button htmlType="submit" disabled={!ops.can || !providerId}>关联并配置调用标识</Button></div></form></Modal>}
    {creatingProvider && <ServiceSupplierDialog ops={ops} cancel={()=>ops.proceed(()=>setCreatingProvider(false))} done={(next,id)=>{setProviderId(id);setCreatingProvider(false);}}/>}
    {editProviderId && <ServiceIdentityDialog key={editProviderId} model={model} providerId={editProviderId} ops={ops} close={close} onSaved={editing ? ()=>{
      setEditing(null);setProviderId('');
      ops.go({identityProvider:null,providerChannels:editProviderId,routeProvider:editProviderId},{saved:true,preserveScroll:true});
    } : close}/>}
    {changing && <Modal title={changing.operation==='serviceProviderListing'?(changing.enabled?'上架服务商':'下架服务商'):(changing.enabled?'恢复此服务商服务':'停用此服务商服务')} description={model.name+' · '+state.providers.find(row=>row.id===changing.providerId)?.name} onClose={close}><Typography.Paragraph>对外调用标识：<code>{entries.find(row=>row.providerId===changing.providerId)?.callId || '未配置'}</code></Typography.Paragraph><Typography.Paragraph>{changing.operation==='serviceProviderListing'?(changing.enabled?'在前台展示该服务商。服务状态保持不变。':'从前台隐藏该服务商，已有 API 调用权限保留。'):(changing.enabled?'恢复该服务商的新调用。前台上架状态保持不变。':'停止当前模型下此服务商服务的新调用；该服务商的其他模型及其他服务商服务不受影响。')}已有订购、配置和历史记录保留。</Typography.Paragraph>{ops.error && <Notice error>{ops.error}</Notice>}<div className="ss-footer"><Button theme="light" onClick={close}>取消</Button><Button disabled={!ops.can || Boolean(ops.conflict)} onClick={async ()=>{if(await ops.run(changing.operation,changing,model.id))close();}}>{changing.operation==='serviceProviderListing'?(changing.enabled?'确认上架服务商':'确认下架服务商'):(changing.enabled?'确认恢复此服务商服务':'确认停用此服务商服务')}</Button></div></Modal>}
    {removing && <Modal title="解绑服务商" description={removing.provider?.name} onClose={close}><Typography.Paragraph>解绑将停止当前服务商服务，停用其服务路由并解除渠道关联。供应管理资源、售价及调用历史保留；其他服务商不受影响。</Typography.Paragraph>{ops.error && <Notice error>{ops.error}</Notice>}<div className="ss-footer"><Button theme="light" onClick={close}>取消</Button><Button disabled={!ops.can} onClick={async ()=>{if(await ops.run('removeServiceProvider',{providerId:removing.providerId,expectedUpdatedAt:model.updatedAt},model.id))close();}}>确认解绑</Button></div></Modal>}
  </>;
}
export function ServiceMappingsContent({state,model,ops,act}) {
  return <div className="ss-routing-content"><ServiceModeBar model={model} ops={ops} act={act}/>{model.serviceMode==='provider'?<ProviderContent key={model.id} state={state} model={model} ops={ops}/>:<StandardContent state={state} model={model} ops={ops}/>}</div>;
}
export function ServiceAccessContent({state,model,ops}) {
  const summary=useRef(null);
  if (ops.params.has('scopeEdit')) return <ServiceScopeEditor state={state} model={model} ops={ops} close={()=>ops.proceed(()=>{
    ops.go({scopeEdit:null},{saved:true,preserveScroll:true});
    requestAnimationFrame(()=>summary.current?.querySelector("[data-edit-scope]")?.focus());
  })}/>;
  return <div className="ss-model-form"><section ref={summary} className="ss-inline-price ss-scope-summary" aria-label="调用授权"><div className="ss-section-bar"><Typography.Title heading={6}>客户开放范围</Typography.Title><Button data-edit-scope className="ss-push" theme="light" disabled={!ops.can} onClick={()=>ops.go({scopeEdit:'1'},{preserveScroll:true})}>编辑开放范围</Button></div><Typography.Paragraph>{model.openScope==='all'?'全部有效客户':(model.tenantIds || []).map(id=>state.tenants.find(row=>row.id===id)?.name || id).join('、') || '尚未配置'}</Typography.Paragraph><Typography.Paragraph className="ss-muted">当前模型的统一模型服务模式或全部服务商服务共用此客户范围。</Typography.Paragraph>{model.openScope==='selected' && model.tenantIds?.some(id=>!scopeTenants(state).some(row=>row.id===id)) && <Notice error>范围内有已停用或删除的客户，请重新核对。</Notice>}</section></div>;
}
export { default as ServiceCallGuide } from './ServiceCallGuide';
