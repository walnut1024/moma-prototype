import { offerKey } from '../service-access.mjs';
import { serviceChannelOptions } from './service-channel-options';
import { modelChannelName } from './model-channel-name';
import { useId, useRef, useState } from 'react';
import { Button, Select, Typography } from '@douyinfe/semi-ui';
import {Choice, Field} from './ServiceUI';
import { Notice, Modal } from './ServiceUI';
import { SERVICE_MODES } from './model-operations';
import { providerServices } from './service-workspace';
import { supplierDirectory } from './moma-provider';
import { ServiceIdentityDialog } from './ServiceConfigurationDialogs';
import { RouteWorkbench } from './ServiceRouting';

function ServiceModeBar({model,ops,act}) {
  const label = SERVICE_MODES[model.serviceMode]?.label;
  return <div className="ss-section-bar">
    <Typography.Title heading={5} component="h2">服务模式：{label || '待配置'}</Typography.Title>
    {!label && <Button disabled={!ops.can} onClick={() => act(model,'serviceMode')}>选择服务模式</Button>}
  </div>;
}
function StandardContent({state,sourceState,model,ops}) {
  const [identity,setIdentity]=useState(false);
  const close=()=>ops.proceed(()=>{setIdentity(false);ops.dirty(false);ops.setError('');});
  return <><RouteWorkbench state={state} sourceState={sourceState} model={model} ops={ops} onIdentity={()=>ops.proceed(()=>setIdentity(true))}/>{identity && <ServiceIdentityDialog model={model} ops={ops} close={close}/>}</>;
}
function ProviderContent({state,sourceState,model,ops,act}) {
  const formId = useId();
  const [providerId,setProviderId]=useState(''), [channelId,setChannelId]=useState(''), [editing,setEditing]=useState(null), [removing,setRemoving]=useState(null), trigger=useRef(null);
  const entries=providerServices(model), suppliers=supplierDirectory(state);
  const channels=serviceChannelOptions(sourceState,model,providerId);
  const channel=channels.find(row=>row.id===channelId && !row.reason);
  const provider=suppliers.find(row=>row.id===providerId);
  const unavailable=providerId && !channels.some(row=>!row.reason);
  const channelPlaceholder=!providerId ? '请先选择服务商' : channels.length ? '请选择渠道' : '当前模型暂无渠道';
  const rows=entries.map(entry=>{
    const provider=state.providers.find(item=>item.id===entry.providerId);
    return {...entry,name:entry.channelName ? provider?.name+'（'+entry.channelName+'）' : provider?.name};
  });
  const close=()=>ops.proceed(()=>{setEditing(null);setRemoving(null);setProviderId('');setChannelId('');ops.dirty(false);ops.setError('');if(ops.params.has('providerEdit') || ops.params.has('providerAdd') || ops.params.has('identityProvider'))ops.go({providerEdit:null,providerAdd:null,identityProvider:null},{saved:true,preserveScroll:true});requestAnimationFrame(()=>{if(trigger.current?.isConnected)trigger.current.focus();});});
  const editProviderId=editing || ops.params.get('identityProvider');
  return <>
    <RouteWorkbench state={state} sourceState={sourceState} model={model} ops={ops}
      onAddProvider={button=>{
        trigger.current = button;
        ops.go({providerAdd:'1',providerChannels:null},{preserveScroll:true});
      }}
      onIdentity={(id,button)=>{
        trigger.current = button;
        ops.go({identityProvider:id,routeProvider:id,providerChannels:null},{preserveScroll:true});
      }}
      onProviderState={(id,enabled,button)=>act(model,enabled?'enableService':'disableService',id,button)}
      onRemoveProvider={(id,button)=>ops.proceed(()=>{
        trigger.current = button;
        setRemoving(rows.find(row=>offerKey(row)===id));
      })}/>

    {ops.params.has('providerAdd') && <Modal title="选择已有渠道" onClose={close} footer={<><Button htmlType="button" theme="light" onClick={close}>取消</Button><Button form={formId} htmlType="submit" theme="solid" disabled={!ops.can || !channel}>关联并配置模型调用标识</Button></>}><form id={formId} noValidate onSubmit={async event=>{event.preventDefault();if(!channel)return;const next=await ops.run('associateServiceProvider',{providerId,channelId,catalogueModelId:channel.catalogueModelId,expectedUpdatedAt:model.updatedAt},model.id);if(next){setEditing(channelId);if(ops.params.has('providerAdd'))ops.go({providerAdd:null},{saved:true,preserveScroll:true});}}}><Field label="服务商 *"><Choice label="关联已有服务商" value={providerId || 'none'} disabled={!ops.can} options={[[ 'none','请选择服务商'],...suppliers.map(item=>[item.id,item.name])]} onChange={id=>{setProviderId(id==='none'?'':id);setChannelId('');ops.dirty(true);ops.setError('');}}/></Field><Field label="渠道 *"><Select aria-label="选择已有渠道" value={channelId || undefined} placeholder={channelPlaceholder} disabled={!ops.can || !providerId || !channels.length}
      optionList={channels.map(row=>({ value:row.id,label:modelChannelName(row.provider,row)+' · '+row.upstreamModelId+(row.reason?'（'+row.reason+'）':''),disabled:Boolean(row.reason) }))}
      onChange={id=>{setChannelId(id);ops.dirty(true);ops.setError('');}}/></Field>
      {unavailable && <Notice>{channels.length ? '当前模型的渠道暂不可关联，请查看下拉项中的原因。' : provider?.name+'尚未接入 '+model.name+' 的模型渠道。'}
        <Button htmlType="button" theme="borderless" onClick={()=>window.open(location.pathname+'#/admin-2/providers?provider='+encodeURIComponent(providerId),'_blank','noopener,noreferrer')}>前往渠道管理</Button>
      </Notice>}{ops.error && <Notice error>{ops.error}</Notice>}</form></Modal>}
    {editProviderId && <ServiceIdentityDialog key={editProviderId} model={model} providerId={editProviderId} ops={ops} close={close} onSaved={editing ? ()=>{
      setEditing(null);setProviderId('');setChannelId('');
      ops.go({identityProvider:null,providerChannels:editProviderId,routeProvider:editProviderId},{saved:true,preserveScroll:true});
    } : close}/>}
    {removing && <Modal title="解绑渠道服务" description={removing.name} onClose={close} footer={<><Button theme="light" onClick={close}>取消</Button><Button disabled={!ops.can} onClick={async ()=>{if(await ops.run('removeServiceProvider',{providerId:offerKey(removing),expectedUpdatedAt:model.updatedAt},model.id))close();}}>确认解绑</Button></>}><Typography.Paragraph>解绑会停用此服务路由并解除渠道关联。接入资源、售价和调用历史保留。</Typography.Paragraph>{ops.error && <Notice error>{ops.error}</Notice>}</Modal>}
  </>;
}
export function ServiceMappingsContent({state,sourceState=state,model,ops,act}) {
  const Content=model.serviceMode==='provider' ? ProviderContent : StandardContent;
  return <div className="ss-routing-content">
    <ServiceModeBar model={model} ops={ops} act={act}/>
    <Content key={model.id} state={state} sourceState={sourceState} model={model} ops={ops} act={act}/>
  </div>;
}

