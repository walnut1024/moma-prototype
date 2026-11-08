import { offerKey } from '../service-access.mjs';
import { mappingCandidates } from './service-model-mappings';
import { IconLockStroked } from '@douyinfe/semi-icons';
import { useId, useRef, useState } from 'react';
import { Button, Radio, Space, Typography, Tooltip } from '@douyinfe/semi-ui';
import {Choice, Field} from './ServiceUI';
import { Notice, Modal } from './ServiceUI';
import { SERVICE_MODES } from './model-operations';
import { providerServices } from './service-workspace';
import { supplierDirectory } from './moma-provider';
import { ServiceIdentityDialog } from './ServiceConfigurationDialogs';
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
  const formId = useId();
  const [creatingProvider,setCreatingProvider]=useState(false);
  const [providerId,setProviderId]=useState(''), [channelId,setChannelId]=useState(''), [editing,setEditing]=useState(null), [removing,setRemoving]=useState(null), [changing,setChanging]=useState(null), trigger=useRef(null), associateTrigger=useRef(null);
  const entries=providerServices(model), suppliers=supplierDirectory(state);
  const channels=providerId ? mappingCandidates(state,{modelId:model.id,providerId}).filter(row=>!row.reason && !entries.some(entry=>entry.channelId===row.id)) : [];
  const channel=channels.find(row=>row.id===channelId);
  const rows=entries.map(entry=>{
    const provider=state.providers.find(item=>item.id===entry.providerId);
    return {...entry,name:entry.channelName ? provider?.name+'（'+entry.channelName+'）' : provider?.name};
  });
  const close=()=>ops.proceed(()=>{setEditing(null);setRemoving(null);setChanging(null);setProviderId('');setChannelId('');ops.dirty(false);ops.setError('');if(ops.params.has('providerEdit') || ops.params.has('providerAdd') || ops.params.has('identityProvider'))ops.go({providerEdit:null,providerAdd:null,identityProvider:null},{saved:true,preserveScroll:true});requestAnimationFrame(()=>{if(trigger.current?.isConnected)trigger.current.focus();else associateTrigger.current?.focus();});});
  const editProviderId=editing || ops.params.get('identityProvider');
  return <>
    <RouteWorkbench state={state} model={model} ops={ops} onAddProvider={()=>ops.go({providerAdd:'1',providerChannels:null},{preserveScroll:true})} onIdentity={id=>ops.go({identityProvider:id,routeProvider:id,providerChannels:null},{preserveScroll:true})} onProviderState={(id,operation,enabled)=>ops.proceed(()=>setChanging({providerId:id,operation,enabled,expectedUpdatedAt:model.updatedAt}))} onRemoveProvider={id=>ops.proceed(()=>setRemoving(rows.find(row=>offerKey(row)===id)))}/>

    {ops.params.has('providerAdd') && !creatingProvider && <Modal title="关联服务商及渠道" onClose={close} footer={<><Button htmlType="button" theme="light" onClick={close}>取消</Button><Button form={formId} htmlType="submit" theme="solid" disabled={!ops.can || !channel}>关联并配置调用标识</Button></>}><form id={formId} noValidate onSubmit={async event=>{event.preventDefault();if(!channel)return;const next=await ops.run('associateServiceProvider',{providerId,channelId,catalogueModelId:channel.catalogueModelId,expectedUpdatedAt:model.updatedAt},model.id);if(next){setEditing(channelId);if(ops.params.has('providerAdd'))ops.go({providerAdd:null},{saved:true,preserveScroll:true});}}}><Field label="服务商 *"><Choice label="关联已有服务商" value={providerId || 'none'} disabled={!ops.can} options={[[ 'none','请选择服务商'],...suppliers.map(item=>[item.id,item.name])]} onChange={id=>{setProviderId(id==='none'?'':id);setChannelId('');ops.dirty(true);ops.setError('');}}/></Field><Field label="渠道 *"><Choice label="选择已启用渠道" value={channelId || 'none'} disabled={!ops.can || !providerId} options={[[ 'none', channels.length?'请选择渠道':'暂无可关联渠道'],...channels.map(row=>[row.id,row.name+' · '+row.upstreamModelId])]} onChange={id=>{setChannelId(id==='none'?'':id);ops.dirty(true);ops.setError('');}}/></Field><Button htmlType="button" theme="borderless" disabled={!ops.can} onClick={()=>ops.proceed(()=>setCreatingProvider(true))}>新增服务商</Button>{ops.error && <Notice error>{ops.error}</Notice>}</form></Modal>}
    {creatingProvider && <ServiceSupplierDialog ops={ops} cancel={()=>ops.proceed(()=>setCreatingProvider(false))} done={(next,id)=>{setProviderId(id);setCreatingProvider(false);}}/>}
    {editProviderId && <ServiceIdentityDialog key={editProviderId} model={model} providerId={editProviderId} ops={ops} close={close} onSaved={editing ? ()=>{
      setEditing(null);setProviderId('');setChannelId('');
      ops.go({identityProvider:null,providerChannels:editProviderId,routeProvider:editProviderId},{saved:true,preserveScroll:true});
    } : close}/>}
    {changing && <Modal title={changing.operation==='serviceProviderListing'?(changing.enabled?'上架服务商':'下架服务商'):(changing.enabled?'恢复此服务':'停用此服务')} description={model.name+' · '+rows.find(row=>offerKey(row)===changing.providerId)?.name} onClose={close} footer={<><Button theme="light" onClick={close}>取消</Button><Button disabled={!ops.can || Boolean(ops.conflict)} onClick={async ()=>{if(await ops.run(changing.operation,changing,model.id))close();}}>{changing.operation==='serviceProviderListing'?(changing.enabled?'确认上架服务商':'确认下架服务商'):(changing.enabled?'确认恢复此服务':'确认停用此服务')}</Button></>}><Typography.Paragraph>对外调用标识：<code>{entries.find(row=>offerKey(row)===changing.providerId)?.callId || '未配置'}</code></Typography.Paragraph><Typography.Paragraph>{changing.operation==='serviceProviderListing'?(changing.enabled?'在前台展示该服务商。服务状态保持不变。':'从前台隐藏该服务商，已有 API 调用权限保留。'):(changing.enabled?'恢复此服务的新调用。前台上架状态保持不变。':'停止此服务的新调用；其他渠道服务不受影响。')}已有订购、配置和历史记录保留。</Typography.Paragraph>{ops.error && <Notice error>{ops.error}</Notice>}</Modal>}
    {removing && <Modal title="解绑渠道服务" description={removing.name} onClose={close} footer={<><Button theme="light" onClick={close}>取消</Button><Button disabled={!ops.can} onClick={async ()=>{if(await ops.run('removeServiceProvider',{providerId:offerKey(removing),expectedUpdatedAt:model.updatedAt},model.id))close();}}>确认解绑</Button></>}><Typography.Paragraph>解绑会停用此服务路由并解除渠道关联。接入资源、售价和调用历史保留。</Typography.Paragraph>{ops.error && <Notice error>{ops.error}</Notice>}</Modal>}
  </>;
}
export function ServiceMappingsContent({state,model,ops,act}) {
  return <div className="ss-routing-content"><ServiceModeBar model={model} ops={ops} act={act}/>{model.serviceMode==='provider'?<ProviderContent key={model.id} state={state} model={model} ops={ops}/>:<StandardContent state={state} model={model} ops={ops}/>}</div>;
}
export { default as ServiceCallGuide } from './ServiceCallGuide';
