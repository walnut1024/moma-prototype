import { useRef, useState } from 'react';
import { Plus, Search, CircleHelp, LockKeyhole } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Tooltip, TooltipTrigger, TooltipContent } from '../components/ui/tooltip';
import { Choice, Field } from './ModelMetadataForm';
import { GridTable, Row, Cell, Status, CopyId, Notice, Modal } from './ModelOperationsUI';
import { priceItems } from './model-management';
import { SERVICE_MODES } from './model-operations';
import { serviceSupplyRows, activeModelSalePrice, activeProviderPrice, providerServices, serviceConfiguration } from './service-workspace';
import { supplierDirectory } from './moma-provider';
import { itemMoney } from './SupplyPriceEditor';
import { AssociateChannelsDialog, AssociateUnifiedChannelsDialog, ProviderServiceDialog } from './ServiceWorkspaceDialogs';
import { RouteWorkbench } from './ServiceRouting';

export function BillingItems({items,commonUnit}) {
  const units=[...new Set(items.map(item=>item.unit))];
  return items.length?<div className="sm-billing-items">{units.length===1 && units[0]!==commonUnit && <small className="sm-billing-unit">{units[0]}</small>}{items.map((item,index)=><div key={index}><span>{item.name}{item.condition && <small>{item.condition}</small>}</span><span>{itemMoney(item)}{units.length>1 && <small>{item.unit}</small>}</span></div>)}</div>:<span className="mo-muted">未配置</span>;
}
function SearchInput({value,onChange,label}) {
  return <label className="sm-search sm-content-search"><Search aria-hidden="true"/><Input aria-label={label} placeholder={label} value={value} onChange={event=>onChange(event.target.value)}/></label>;
}
export function ServiceModeBar({model,ops,act}) {
  return <div className="sm-mode-bar"><h2>服务模式 *</h2>{Object.entries(SERVICE_MODES).map(([value,item])=><div className="sm-mode-reference" key={value}><input type="radio" aria-label={item.label} checked={model.serviceMode===value} disabled readOnly/><span>{item.label}</span><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" aria-label={`${item.label}说明`}><CircleHelp/></Button></TooltipTrigger><TooltipContent>{item.description}</TooltipContent></Tooltip></div>)}{model.serviceMode?<span className="sm-mode-lock"><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" aria-label="解锁并切换服务模式" disabled={!ops.can} onClick={()=>act(model,'serviceMode')}><LockKeyhole aria-hidden="true"/></Button></TooltipTrigger><TooltipContent>解锁并切换服务模式</TooltipContent></Tooltip>已锁定</span>:<Button className="sm-push" variant="outline" disabled={!ops.can} onClick={()=>act(model,'serviceMode')}>选择服务模式</Button>}</div>;
}
function ChannelContent({state,model,ops,act,providerId}) {
  const [query,setQuery]=useState(''), [removing,setRemoving]=useState(null), trigger=useRef(null), associateTrigger=useRef(null);
  const supplies=serviceSupplyRows(state,model).filter(item=>!providerId || item.provider?.id===providerId), editable=ops.can && Boolean(model.serviceMode), items=priceItems(activeModelSalePrice(state,model.id),model);
  const units=[...new Set(supplies.flatMap(item=>priceItems(item.cost,model).map(cost=>cost.unit)))], commonUnit=units.length===1?units[0]:null;
  const saleUnits=[...new Set(items.map(item=>item.unit))], saleUnit=saleUnits.length===1?saleUnits[0]:null;
  const rows=supplies.filter(item=>[item.channelName,item.channelId,item.provider?.name].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  const close=()=>{setRemoving(null);ops.setError('');requestAnimationFrame(()=>{if(trigger.current?.isConnected)trigger.current.focus();else associateTrigger.current?.focus();});};
  return <>
    {model.serviceMode==='standard' && <div className="sm-unified-summary"><h2>统一服务定价</h2><span className="mo-muted">{items.length?items.every(item=>item.unit.includes('Token'))?'按 Token 计费':'按量计费':'尚未配置统一售价'}</span><div className="sm-unified-amounts">{items.slice(0,2).map((item,index)=><span key={index} title={item.condition || undefined}>{item.name}<strong>{itemMoney(item)}</strong>{!saleUnit && <small>{item.unit}</small>}</span>)}{saleUnit && <small>{saleUnit}</small>}{items.length>2 && <span className="mo-muted">另 {items.length-2} 项</span>}</div><Button variant="outline" className="sm-push" onClick={()=>act(model,'unifiedPrice')}>{ops.can?'编辑售价':'查看售价'}</Button></div>}
    <div className="sm-section-bar"><h2>关联渠道（{supplies.length}）</h2><Button ref={associateTrigger} variant="outline" disabled={!editable} onClick={()=>ops.go(providerId?{panel:null,providerChannels:providerId,providerAssociate:'1',service:null,mapping:null}:{panel:'associate',service:null,mapping:null})}><Plus/>关联渠道</Button><SearchInput value={query} onChange={setQuery} label="搜索渠道名称 / 渠道 ID / 供应商"/></div>
    <GridTable className="sm-content-channel-table" headings={['渠道 ID / 名称','供应商','渠道 API URL','上游 Model ID',`供应商售价${commonUnit?`（${commonUnit}）`:''}`,'操作']} empty={!rows.length} emptyMessage={query?'没有匹配的渠道，请调整查询。':'尚未关联渠道，请从供应管理选择已有渠道。'}>{rows.map(item=><Row key={item.id}><Cell><strong>{item.channelName}</strong><small className="sm-channel-id" title={item.channelId}>{item.channelId}</small></Cell><Cell>{item.provider?.name || '供应商已不存在'}</Cell><Cell>{item.url?<CopyId value={item.url} label="渠道 API URL"/>:'—'}</Cell><Cell><code title={item.upstreamModelId}>{item.upstreamModelId}</code></Cell><Cell><BillingItems items={priceItems(item.cost,model)} commonUnit={commonUnit}/></Cell><Cell><Button variant="link" className="sm-remove" disabled={!editable} onClick={event=>{trigger.current=event.currentTarget;setRemoving(item);}}>移除</Button></Cell></Row>)}</GridTable>
    {removing && <Modal title="移除渠道关联" description={`${removing.channelName} · ${removing.channelId}`} onClose={close}><p>仅解除当前模型服务的关联，供应管理中的渠道和历史记录保留。已发布路由或草稿仍引用该渠道时，请先处理引用。</p>{ops.error && <Notice error>{ops.error}</Notice>}<div className="mo-footer"><Button variant="outline" onClick={close}>取消</Button><Button disabled={!ops.can} onClick={()=>{if(ops.run('removeServiceChannel',{supplyId:removing.id,expectedUpdatedAt:model.updatedAt},model.id))close();}}>确认移除关联</Button></div></Modal>}
  </>;
}
function ProviderContent({state,model,ops}) {
  const [query,setQuery]=useState(''), [adding,setAdding]=useState(false), [providerId,setProviderId]=useState(''), [editing,setEditing]=useState(null), [removing,setRemoving]=useState(null), trigger=useRef(null), associateTrigger=useRef(null);
  const entries=providerServices(model), supplies=serviceSupplyRows(state,model), suppliers=supplierDirectory(state);
  const rows=entries.map(entry=>({...entry,provider:state.providers.find(item=>item.id===entry.providerId),price:activeProviderPrice(state,model.id,entry.providerId)})).filter(entry=>[entry.provider?.name,entry.code,entry.callId].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  const close=()=>ops.proceed(()=>{setAdding(false);setEditing(null);setRemoving(null);setProviderId('');ops.dirty(false);ops.setError('');if(ops.params.has('providerEdit') || ops.params.has('providerAdd'))ops.go({providerEdit:null,providerAdd:null},{saved:true,preserveScroll:true});requestAnimationFrame(()=>{if(trigger.current?.isConnected)trigger.current.focus();else associateTrigger.current?.focus();});});
  const begin=(event,callback)=>{trigger.current=event.currentTarget;callback();};
  const editProviderId=editing || ops.params.get('providerEdit'), channelProvider=entries.find(entry=>entry.providerId===ops.params.get('providerChannels'));
  const closeChannels=()=>ops.go({providerAssociate:null},{preserveScroll:true});
  return <>
    <div className="sm-section-bar"><h2>已关联供应商（{entries.length}）</h2><Button ref={associateTrigger} variant="outline" disabled={!ops.can} onClick={event=>begin(event,()=>setAdding(true))}><Plus/>关联供应商</Button><SearchInput value={query} onChange={setQuery} label="搜索供应商 / Provider 标识 / 调用 ID"/></div>
    <GridTable className="sm-provider-services" headings={['Provider 名称','Provider 标识','对外调用 ID','关联渠道数','Provider 售价','配置状态','操作']} empty={!rows.length} emptyMessage={query?'没有匹配的 Provider。':'尚未关联供应商，请选择供应管理中已有的供应商。'}>{rows.map(entry=><Row key={entry.providerId}><Cell><strong>{entry.provider?.name || '供应商已不存在'}</strong></Cell><Cell><code>{entry.code}</code></Cell><Cell>{entry.callId?<CopyId value={entry.callId} label="对外调用 ID"/>:'未配置'}</Cell><Cell><Button variant="link" onClick={()=>ops.go({panel:null,providerChannels:entry.providerId,providerAssociate:null},{preserveScroll:true})}>{supplies.filter(item=>item.provider?.id===entry.providerId).length} 个 · 管理</Button></Cell><Cell><BillingItems items={priceItems(entry.price,model)}/></Cell><Cell><Status good={!serviceConfiguration(state,model).issues.some(issue=>issue.providerId===entry.providerId)}>{serviceConfiguration(state,model).issues.some(issue=>issue.providerId===entry.providerId)?'待完善':'已配置'}</Status></Cell><Cell><div className="mo-row-actions"><Button variant="link" disabled={!ops.can} onClick={event=>begin(event,()=>setEditing(entry.providerId))}>配置</Button><Button variant="link" className="sm-remove" disabled={!ops.can} onClick={event=>begin(event,()=>setRemoving(entry))}>移除</Button></div></Cell></Row>)}</GridTable>
    {channelProvider && <><div className="sm-section-bar"><h2>{state.providers.find(item=>item.id===channelProvider.providerId)?.name} · 渠道关联</h2><Button variant="link" className="sm-push" onClick={()=>ops.go({providerChannels:null,providerAssociate:null},{preserveScroll:true})}>收起渠道</Button></div><ChannelContent key={channelProvider.providerId} state={state} model={model} ops={ops} providerId={channelProvider.providerId}/>{ops.params.has('providerAssociate') && <AssociateChannelsDialog state={state} model={model} ops={ops} providerId={channelProvider.providerId} context="service" close={closeChannels}/>}</>}
    {(adding || ops.params.has('providerAdd')) && <Modal title="关联供应商" description="选择供应管理中已有的供应商，不会创建供应商。" onClose={close}><form noValidate onSubmit={event=>{event.preventDefault();const next=ops.run('associateServiceProvider',{providerId,expectedUpdatedAt:model.updatedAt},model.id);if(next){setAdding(false);setEditing(providerId);if(ops.params.has('providerAdd'))ops.go({providerAdd:null},{saved:true,preserveScroll:true});}}}><Field label="供应商 *"><Choice label="关联已有供应商" value={providerId || 'none'} disabled={!ops.can} options={[[ 'none','请选择供应商'],...suppliers.filter(item=>!entries.some(entry=>entry.providerId===item.id)).map(item=>[item.id,item.name])]} onChange={id=>{setProviderId(id==='none'?'':id);ops.dirty(true);ops.setError('');}}/></Field>{ops.error && <Notice error>{ops.error}</Notice>}<div className="mo-footer"><Button type="button" variant="outline" onClick={close}>取消</Button><Button type="submit" disabled={!ops.can || !providerId}>确认关联</Button></div></form></Modal>}
    {editProviderId && <ProviderServiceDialog key={editProviderId} state={state} model={model} providerId={editProviderId} ops={ops} close={close}/>}
    {removing && <Modal title="移除供应商关联" description={removing.provider?.name} onClose={close}><p>解除当前 Provider 及其渠道与模型的关联，供应管理资源和价格历史保留。请先下架模型，并处理生效路由及草稿引用。</p>{ops.error && <Notice error>{ops.error}</Notice>}<div className="mo-footer"><Button variant="outline" onClick={close}>取消</Button><Button disabled={!ops.can} onClick={()=>{if(ops.run('removeServiceProvider',{providerId:removing.providerId,expectedUpdatedAt:model.updatedAt},model.id))close();}}>确认移除关联</Button></div></Modal>}
  </>;
}
export function ServiceContent({state,model,ops,act}) {
  return <><ServiceModeBar model={model} ops={ops} act={act}/> {!model.serviceMode?<div className="sm-empty sm-first-config"><h2>请先选择服务模式</h2><p>服务模式为必选项，选择后才能配置售价、关联渠道和路由。</p><Button disabled={!ops.can} onClick={()=>act(model,'serviceMode')}>选择服务模式</Button><Button variant="link" onClick={()=>ops.go({panel:'metadata'})}>查看模型信息</Button></div>:model.serviceMode==='standard'?<><ChannelContent key={model.id} state={state} model={model} ops={ops} act={act}/>{ops.params.get('panel')==='associate' && <AssociateUnifiedChannelsDialog state={state} model={model} ops={ops} close={()=>ops.go({panel:null},{preserveScroll:true})}/>}</>:<ProviderContent key={model.id} state={state} model={model} ops={ops}/>}</>;
}
export function ServiceRoutesContent({state,model,ops}) {
  return <RouteWorkbench state={state} model={model} ops={ops}/>;
}
export { default as ServiceCallGuide } from './ServiceCallGuide';
