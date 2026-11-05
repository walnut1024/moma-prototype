import { useRef, useState } from 'react';
import { CircleHelp, LockKeyhole } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '../components/ui/tooltip';
import { Choice, Field } from './ModelMetadataForm';
import { Notice, Modal } from './ModelOperationsUI';
import { SERVICE_MODES } from './model-operations';
import { providerServices } from './service-workspace';
import { supplierDirectory } from './moma-provider';
import { itemMoney } from './SupplyPriceEditor';
import { CommercialDialog, AssociateChannelsDialog, AssociateUnifiedChannelsDialog, ServiceIdentityDialog } from './ServiceWorkspaceDialogs';
import { RouteWorkbench } from './ServiceRouting';

export function BillingItems({items,commonUnit}) {
  const units=[...new Set(items.map(item=>item.unit))];
  return items.length?<div className="sm-billing-items">{units.length===1 && units[0]!==commonUnit && <small className="sm-billing-unit">{units[0]}</small>}{items.map((item,index)=><div key={index}><span>{item.name}{item.condition && <small>{item.condition}</small>}</span><span>{itemMoney(item)}{units.length>1 && <small>{item.unit}</small>}</span></div>)}</div>:<span className="mo-muted">未配置</span>;
}
export function ServiceModeBar({model,ops,act}) {
  return <div className="sm-mode-bar"><h2>服务模式 *</h2>{Object.entries(SERVICE_MODES).map(([value,item])=><div className="sm-mode-reference" key={value}><input type="radio" aria-label={item.label} checked={model.serviceMode===value} disabled readOnly/><span>{item.label}</span><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" aria-label={`${item.label}说明`}><CircleHelp/></Button></TooltipTrigger><TooltipContent>{item.description}</TooltipContent></Tooltip></div>)}{model.serviceMode?<span className="sm-mode-lock"><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" aria-label="解锁并切换服务模式" disabled={!ops.can} onClick={()=>act(model,'serviceMode')}><LockKeyhole aria-hidden="true"/></Button></TooltipTrigger><TooltipContent>解锁并切换服务模式</TooltipContent></Tooltip>已锁定</span>:<Button className="sm-push" variant="outline" disabled={!ops.can} onClick={()=>act(model,'serviceMode')}>选择服务模式</Button>}</div>;
}
function ProviderContent({state,model,ops}) {
  const [adding,setAdding]=useState(false), [providerId,setProviderId]=useState(''), [editing,setEditing]=useState(null), [removing,setRemoving]=useState(null), [changing,setChanging]=useState(null), trigger=useRef(null), associateTrigger=useRef(null);
  const entries=providerServices(model), suppliers=supplierDirectory(state);
  const rows=entries.map(entry=>({...entry,provider:state.providers.find(item=>item.id===entry.providerId)}));
  const close=()=>ops.proceed(()=>{setAdding(false);setEditing(null);setRemoving(null);setChanging(null);setProviderId('');ops.dirty(false);ops.setError('');if(ops.params.has('providerEdit') || ops.params.has('providerAdd') || ops.params.has('identityProvider'))ops.go({providerEdit:null,providerAdd:null,identityProvider:null},{saved:true,preserveScroll:true});requestAnimationFrame(()=>{if(trigger.current?.isConnected)trigger.current.focus();else associateTrigger.current?.focus();});});
  const editProviderId=editing || ops.params.get('identityProvider');
  return <>
    <RouteWorkbench state={state} model={model} ops={ops} onAddProvider={()=>ops.go({providerAdd:'1'},{preserveScroll:true})} onIdentity={id=>ops.go({identityProvider:id,routeProvider:id},{preserveScroll:true})} onAssociate={id=>ops.go({providerAssociate:'1',providerChannels:id,routeProvider:id},{preserveScroll:true})} onProviderState={(id,operation,enabled)=>ops.proceed(()=>setChanging({providerId:id,operation,enabled,expectedUpdatedAt:model.updatedAt}))} onRemoveProvider={id=>ops.proceed(()=>setRemoving(rows.find(row=>row.providerId===id)))}/>

    {(adding || ops.params.has('providerAdd')) && <Modal title="关联供应商" description="选择供应管理中已有的供应商，不会创建供应商。" onClose={close}><form noValidate onSubmit={async event=>{event.preventDefault();const next=await ops.run('associateServiceProvider',{providerId,expectedUpdatedAt:model.updatedAt},model.id);if(next){setAdding(false);setEditing(providerId);if(ops.params.has('providerAdd'))ops.go({providerAdd:null},{saved:true,preserveScroll:true});}}}><Field label="供应商 *"><Choice label="关联已有供应商" value={providerId || 'none'} disabled={!ops.can} options={[[ 'none','请选择供应商'],...suppliers.filter(item=>!entries.some(entry=>entry.providerId===item.id)).map(item=>[item.id,item.name])]} onChange={id=>{setProviderId(id==='none'?'':id);ops.dirty(true);ops.setError('');}}/></Field>{ops.error && <Notice error>{ops.error}</Notice>}<div className="mo-footer"><Button type="button" variant="outline" onClick={close}>取消</Button><Button type="submit" disabled={!ops.can || !providerId}>确认关联</Button></div></form></Modal>}
    {editProviderId && <ServiceIdentityDialog key={editProviderId} model={model} providerId={editProviderId} ops={ops} close={close}/>}
    {changing && <Modal title={changing.operation==='serviceProviderListing'?(changing.enabled?'上架供应商':'下架供应商'):(changing.enabled?'恢复供应商服务':'停服供应商')} description={state.providers.find(row=>row.id===changing.providerId)?.name} onClose={close}><p>{changing.operation==='serviceProviderListing'?(changing.enabled?'在前台展示该供应商。服务状态保持不变。':'从前台隐藏该供应商，已有 API 调用权限保留。'):(changing.enabled?'恢复该供应商的新调用。前台上架状态保持不变。':'停止该供应商的调用，其他供应商服务不受影响。')}已有订购、配置和历史记录保留。</p>{ops.error && <Notice error>{ops.error}</Notice>}<div className="mo-footer"><Button variant="outline" onClick={close}>取消</Button><Button disabled={!ops.can || Boolean(ops.conflict)} onClick={async ()=>{if(await ops.run(changing.operation,changing,model.id))close();}}>确认</Button></div></Modal>}
    {removing && <Modal title="解绑供应商" description={removing.provider?.name} onClose={close}><p>解绑将停止当前供应商服务，停用其服务路由并解除渠道关联。供应管理资源、售价及调用历史保留；其他供应商不受影响。</p>{ops.error && <Notice error>{ops.error}</Notice>}<div className="mo-footer"><Button variant="outline" onClick={close}>取消</Button><Button disabled={!ops.can} onClick={async ()=>{if(await ops.run('removeServiceProvider',{providerId:removing.providerId,expectedUpdatedAt:model.updatedAt},model.id))close();}}>确认解绑</Button></div></Modal>}
  </>;
}
export function ServiceMappingsContent({state,model,ops,act}) {
  const entries=providerServices(model), providerId=ops.params.get('providerChannels') || ops.params.get('routeProvider') || entries[0]?.providerId;
  return <><ServiceModeBar model={model} ops={ops} act={act}/>{model.serviceMode==='provider'?<ProviderContent key={model.id} state={state} model={model} ops={ops}/>:<RouteWorkbench state={state} model={model} ops={ops} onAssociate={()=>ops.go({panel:'associate'},{preserveScroll:true})}/>}
    {model.serviceMode==='standard' && ops.params.get('panel')==='associate' && <AssociateUnifiedChannelsDialog state={state} model={model} ops={ops} close={()=>ops.go({panel:'routing'},{preserveScroll:true})}/>}
    {model.serviceMode==='provider' && ops.params.has('providerAssociate') && <AssociateChannelsDialog state={state} model={model} ops={ops} providerId={providerId} context="service" close={()=>ops.go({providerAssociate:null},{preserveScroll:true})}/>}
  </>;
}
export function ServicePricingContent({state,model,ops}) {
  const [editing,setEditing]=useState(null);
  const selected=editing || ops.params.get('providerEdit');
  const close=()=>ops.proceed(()=>{setEditing(null);ops.dirty(false);ops.setError('');if(ops.params.has('providerEdit'))ops.go({providerEdit:null},{saved:true,preserveScroll:true});});
  if(!model.serviceMode)return <div className="sm-empty"><p>先选择服务模式，再配置平台售价。</p><Button variant="outline" onClick={()=>ops.go({panel:'routing'})}>前往路由及映射</Button></div>;
  const services=model.serviceMode==='standard'?[{providerId:'',callId:model.modelId}]:providerServices(model);
  return services.length?services.map(service=>{
    const id=service.providerId || 'standard', active=selected===id;
    return <CommercialDialog key={`${id}:${active}`} state={state} model={model} providerId={service.providerId} ops={ops} readOnly={!active} onEdit={()=>ops.proceed(()=>{if(!service.callId){ops.go({panel:'routing',identityProvider:service.providerId || null,providerEdit:null});return;}setEditing(id);if(ops.params.has('providerEdit'))ops.go({providerEdit:null},{saved:true,preserveScroll:true});})} close={close}/>;
  }):<div className="sm-empty">尚未关联供应商，请到路由及映射关联。</div>;
}
export { default as ServiceCallGuide } from './ServiceCallGuide';
