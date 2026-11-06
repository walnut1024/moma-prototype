import { materialDrawerSide } from './model-material-drawer';
import { scopeTenants } from './service-commercial';
import { useRef, useState } from 'react';
import { CircleDot, CircleHelp, LockKeyhole } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '../components/ui/tooltip';
import { Choice, Field } from './ModelMetadataForm';
import { Notice, Modal } from './ModelOperationsUI';
import { SERVICE_MODES } from './model-operations';
import { providerServices } from './service-workspace';
import { supplierDirectory } from './moma-provider';
import { itemMoney } from './SupplyPriceEditor';
import { CommercialDialog, ServiceIdentityDialog } from './ServiceWorkspaceDialogs';
import { RouteWorkbench } from './ServiceRouting';

export function BillingItems({items,commonUnit}) {
  const units=[...new Set(items.map(item=>item.unit))];
  return items.length?<div className="sm-billing-items">{units.length===1 && units[0]!==commonUnit && <small className="sm-billing-unit">{units[0]}</small>}{items.map((item,index)=><div key={index}><span>{item.name}{item.condition && <small>{item.condition}</small>}</span><span>{itemMoney(item)}{units.length>1 && <small>{item.unit}</small>}</span></div>)}</div>:<span className="mo-muted">未配置</span>;
}
export function ServiceModeBar({model,ops,act}) {
  return <div className="sm-mode-bar"><h2>服务模式</h2>{Object.entries(SERVICE_MODES).map(([value,item])=><div className={`sm-mode-reference${model.serviceMode===value?' is-selected':''}`} key={value}><CircleDot className="sm-selected-mode" aria-hidden="true"/><input type="radio" aria-label={item.label} checked={model.serviceMode===value} disabled readOnly/><span>{item.label}</span><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" aria-label={`${item.label}说明`}><CircleHelp/></Button></TooltipTrigger><TooltipContent className="sr-route-tooltip">{item.description}</TooltipContent></Tooltip></div>)}{model.serviceMode?<span className="sm-mode-lock"><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" aria-label="解锁并切换服务模式" disabled={!ops.can} onClick={()=>act(model,'serviceMode')}><LockKeyhole aria-hidden="true"/></Button></TooltipTrigger><TooltipContent className="sr-route-tooltip">解锁并切换服务模式</TooltipContent></Tooltip>已锁定</span>:<Button className="sm-push" variant="outline" disabled={!ops.can} onClick={()=>act(model,'serviceMode')}>选择服务模式</Button>}</div>;
}
function StandardContent({state,model,ops}) {
  const [identity,setIdentity]=useState(false);
  const close=()=>ops.proceed(()=>{setIdentity(false);ops.dirty(false);ops.setError('');});
  return <><RouteWorkbench state={state} model={model} ops={ops} onIdentity={()=>ops.proceed(()=>setIdentity(true))}/>{identity && <ServiceIdentityDialog model={model} ops={ops} close={close}/>}</>;
}
function ProviderContent({state,model,ops}) {
  const [adding,setAdding]=useState(false), [providerId,setProviderId]=useState(''), [editing,setEditing]=useState(null), [removing,setRemoving]=useState(null), [changing,setChanging]=useState(null), trigger=useRef(null), associateTrigger=useRef(null);
  const entries=providerServices(model), suppliers=supplierDirectory(state);
  const rows=entries.map(entry=>({...entry,provider:state.providers.find(item=>item.id===entry.providerId)}));
  const close=()=>ops.proceed(()=>{setAdding(false);setEditing(null);setRemoving(null);setChanging(null);setProviderId('');ops.dirty(false);ops.setError('');if(ops.params.has('providerEdit') || ops.params.has('providerAdd') || ops.params.has('identityProvider'))ops.go({providerEdit:null,providerAdd:null,identityProvider:null},{saved:true,preserveScroll:true});requestAnimationFrame(()=>{if(trigger.current?.isConnected)trigger.current.focus();else associateTrigger.current?.focus();});});
  const editProviderId=editing || ops.params.get('identityProvider');
  return <>
    <RouteWorkbench state={state} model={model} ops={ops} onAddProvider={()=>ops.go({providerAdd:'1'},{preserveScroll:true})} onIdentity={id=>ops.go({identityProvider:id,routeProvider:id},{preserveScroll:true})} onProviderState={(id,operation,enabled)=>ops.proceed(()=>setChanging({providerId:id,operation,enabled,expectedUpdatedAt:model.updatedAt}))} onRemoveProvider={id=>ops.proceed(()=>setRemoving(rows.find(row=>row.providerId===id)))}/>

    {(adding || ops.params.has('providerAdd')) && <Modal title="关联供应商" description="选择供应管理中已有的供应商，不会创建供应商。" onClose={close}><form noValidate onSubmit={async event=>{event.preventDefault();const next=await ops.run('associateServiceProvider',{providerId,expectedUpdatedAt:model.updatedAt},model.id);if(next){setAdding(false);setEditing(providerId);if(ops.params.has('providerAdd'))ops.go({providerAdd:null},{saved:true,preserveScroll:true});}}}><Field label="供应商 *"><Choice label="关联已有供应商" value={providerId || 'none'} disabled={!ops.can} options={[[ 'none','请选择供应商'],...suppliers.filter(item=>!entries.some(entry=>entry.providerId===item.id)).map(item=>[item.id,item.name])]} onChange={id=>{setProviderId(id==='none'?'':id);ops.dirty(true);ops.setError('');}}/></Field>{ops.error && <Notice error>{ops.error}</Notice>}<div className="mo-footer"><Button type="button" variant="outline" onClick={close}>取消</Button><Button type="submit" disabled={!ops.can || !providerId}>确认关联</Button></div></form></Modal>}
    {editProviderId && <ServiceIdentityDialog key={editProviderId} model={model} providerId={editProviderId} ops={ops} close={close}/>}
    {changing && <Modal title={changing.operation==='serviceProviderListing'?(changing.enabled?'上架供应商':'下架供应商'):(changing.enabled?'恢复此供应商服务':'停用此供应商服务')} description={model.name+' · '+state.providers.find(row=>row.id===changing.providerId)?.name} onClose={close}><p>对外调用标识：<code>{entries.find(row=>row.providerId===changing.providerId)?.callId || '未配置'}</code></p><p>{changing.operation==='serviceProviderListing'?(changing.enabled?'在前台展示该供应商。服务状态保持不变。':'从前台隐藏该供应商，已有 API 调用权限保留。'):(changing.enabled?'恢复该供应商的新调用。前台上架状态保持不变。':'停止当前模型下此供应商服务的新调用；该供应商的其他模型及其他供应商服务不受影响。')}已有订购、配置和历史记录保留。</p>{ops.error && <Notice error>{ops.error}</Notice>}<div className="mo-footer"><Button variant="outline" onClick={close}>取消</Button><Button disabled={!ops.can || Boolean(ops.conflict)} onClick={async ()=>{if(await ops.run(changing.operation,changing,model.id))close();}}>{changing.operation==='serviceProviderListing'?(changing.enabled?'确认上架供应商':'确认下架供应商'):(changing.enabled?'确认恢复此供应商服务':'确认停用此供应商服务')}</Button></div></Modal>}
    {removing && <Modal title="解绑供应商" description={removing.provider?.name} onClose={close}><p>解绑将停止当前供应商服务，停用其服务路由并解除渠道关联。供应管理资源、售价及调用历史保留；其他供应商不受影响。</p>{ops.error && <Notice error>{ops.error}</Notice>}<div className="mo-footer"><Button variant="outline" onClick={close}>取消</Button><Button disabled={!ops.can} onClick={async ()=>{if(await ops.run('removeServiceProvider',{providerId:removing.providerId,expectedUpdatedAt:model.updatedAt},model.id))close();}}>确认解绑</Button></div></Modal>}
  </>;
}
export function ServiceMappingsContent({state,model,ops,act}) {
  return <div className="sm-routing-content"><ServiceModeBar model={model} ops={ops} act={act}/>{model.serviceMode==='provider'?<ProviderContent key={model.id} state={state} model={model} ops={ops}/>:<StandardContent state={state} model={model} ops={ops}/>}</div>;
}
export function ServiceAccessContent({state,model,ops}) {
  const [side,setSide]=useState('left'),trigger=useRef(null);
  return <div className="sm-model-form"><section className="sm-inline-price sm-scope-summary" aria-label="调用授权"><div className="sm-section-bar"><h3>客户开放范围</h3><Button ref={trigger} className="sm-push" variant="outline" disabled={!ops.can} onClick={event=>ops.proceed(()=>{setSide(materialDrawerSide(event.currentTarget.getBoundingClientRect(),window.innerWidth));ops.go({scopeEdit:'1'},{preserveScroll:true});})}>编辑开放范围</Button></div><p>{model.openScope==='all'?'全部有效客户':(model.tenantIds || []).map(id=>state.tenants.find(row=>row.id===id)?.name || id).join('、') || '尚未配置'}</p><p className="mo-muted">当前模型的统一服务或全部供应商服务共用此客户范围。</p>{model.openScope==='selected' && model.tenantIds?.some(id=>!scopeTenants(state).some(row=>row.id===id)) && <Notice error>范围内有已停用或删除的客户，请重新核对。</Notice>}</section>{ops.params.has('scopeEdit') && <CommercialDialog state={state} model={model} ops={ops} kind="scope" drawerSide={side} close={()=>ops.proceed(()=>{ops.go({scopeEdit:null},{saved:true,preserveScroll:true});requestAnimationFrame(()=>trigger.current?.focus());})}/>}</div>;
}
export { default as ServiceCallGuide } from './ServiceCallGuide';
