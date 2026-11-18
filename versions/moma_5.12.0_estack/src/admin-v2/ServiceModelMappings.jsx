import AdminStatus from './AdminStatus';
import AdminActionMenu from './AdminActionMenu';
import { useRef, useState } from 'react';
import { Button, Input, Typography, Descriptions, Space } from '@douyinfe/semi-ui';
import { Choice, Field, Modal, Notice, CopyId } from './ServiceUI';
import { modelSupplies } from './model-management';
import { activeRouteVersion, routingChannels, serviceRoute } from './service-routing';
import { additionalMappingOptions, mappingCandidates, mappingConfig, mappingInterfaces, mappingPreview, mappingReferences, mappingSourceVersion, mappingState, routeMappingAddresses } from './service-model-mappings';

const mappingName = supply => supply.mappingName || supply.endpoint?.name || '模型映射';
const payload = (state, service, supply) => ({
  id:supply?.id, serviceId:service.id, expectedRevision:supply?.mappingRevision || 0,
  expectedSource:mappingSourceVersion(state,service),
});

export function mappingOptions(state, service, excludedId) {
  const candidates = mappingCandidates(state,service);
  const qualified = candidates.filter(row=>!row.reason);
  const reserved = new Set(modelSupplies(state,service.modelId)
    .filter(supply=>supply.id!==excludedId)
    .flatMap(supply=>[supply.endpointId, supply.serviceMapping?.pending?.config.endpointId]));
  return {candidates, qualified, available:qualified.filter(row=>!reserved.has(row.endpointId))};
}

export function MappingSummary({supply, status, routed, compact}) {
  const pending = supply.serviceMapping?.pending;
  const references = [...new Set(status.references.map(row=>row.kind).filter(kind=>!(routed || compact) || kind!=='当前使用'))];
  const showStatus = !compact || status.label!=='待验证';
  return <>
    {(showStatus || pending || references.length>0) && <Space wrap spacing={6}>
      {showStatus && <AdminStatus value={status.label}/>}
      {pending && <Typography.Text type="warning" size="small">{pending.validation ? '变更待应用' : '变更待验证'}</Typography.Text>}
      {references.length>0 && <Typography.Text type="tertiary" size="small">{references.join('、')}</Typography.Text>}
    </Space>}
    {!compact && status.issue && <Typography.Text type="danger" size="small">{status.issue}</Typography.Text>}
  </>;
}

export function MappingRowActions({supply, service, status, actions, canWrite, blocked, serviceItems = []}) {
  const used = status.references.length>0;
  const pending = supply.serviceMapping?.pending;
  const open = (mode, operation) => button=>actions.open(button, service, supply, mode, operation);
  const run = operation => ()=>actions.runFromRow(service,supply,operation);
  const items = used ? [] : [{node:'item',name:'编辑映射',disabled:blocked,onClick:open('edit')}];
  if (!pending) items.push({node:'item',name:'修改上游模型调用标识（新页签）',disabled:blocked,onClick:()=>{
    const params = new URLSearchParams({provider:supply.providerId || supply.provider?.id || supply.endpoint?.providerId || service.providerId,tab:'catalogue',upstreamChannel:supply.channelId});
    window.open(location.pathname + '#/admin-2/providers?' + params, '_blank', 'noopener,noreferrer');
  }});
  if (pending) items.push({node:'item',name:'验证变更',disabled:blocked,onClick:run('serviceMappingValidate')});
  if (pending) {
    items.push(
      {node:'item',name:'应用变更',disabled:blocked || used || !pending.validation,onClick:open('confirm','serviceMappingApply')},
      {node:'item',name:'放弃变更',disabled:blocked,onClick:open('confirm','serviceMappingDiscard')},
    );
  } else if (!used) {
    items.push(supply.status==='已启用'
      ? {node:'item',name:'停用映射',disabled:blocked,onClick:open('confirm','serviceMappingDisable')}
      : {node:'item',name:'启用映射',disabled:blocked || Boolean(status.issue) || !supply.serviceMapping?.validation,onClick:run('serviceMappingEnable')});
  }
  if (!used && supply.status!=='已启用') {
    items.push({node:'item',name:'解除映射',disabled:blocked,onClick:open('confirm','serviceMappingRemove')});
  }
  const menu = canWrite ? [...items, ...(items.length && serviceItems.length ? [{node:'divider'}] : []), ...serviceItems] : serviceItems;
  return <Space spacing={4} className="ss-mapping-row-actions">
    <Button size="small" theme="borderless" aria-label={'查看映射 '+mappingName(supply)}
      onClick={event=>open('view')(event.currentTarget)}>查看映射</Button>
    {menu.length>0 && <AdminActionMenu label={'更多映射操作 '+mappingName(supply)} items={menu}/>}
  </Space>;
}

export function useServiceMappingActions(state, services, ops, fallbackFocus) {
  const [dialog,setDialog] = useState(null);
  const [busy,setBusy] = useState(false);
  const trigger = useRef(null);
  const service = dialog && services.find(item=>item.id===dialog.serviceId);
  const blocked = !ops.can || Boolean(ops.conflict) || busy;
  const open = (button, target, supply, mode, operation) => ops.proceed(()=>{
    trigger.current = button;
    const box = button?.getBoundingClientRect();
    setDialog({
      serviceId:target.id, supply, mode, operation, base:mode==='view' ? null : payload(state,target,supply),
      side:box && box.left+box.width/2>=window.innerWidth/2 ? 'left' : 'right',
    });
    ops.setError('');
  });
  const close = (saved=false) => {
    const finish = ()=>{
      setDialog(null);
      ops.dirty(false);
      ops.setError('');
      requestAnimationFrame(()=>{
        const button = trigger.current;
        (button?.isConnected && !button.disabled ? button : fallbackFocus.current)?.focus();
      });
    };
    if (saved) finish();
    else ops.proceed(finish);
  };
  const command = async (operation,data,target)=>{
    if (blocked) return;
    setBusy(true);
    try { return await ops.run(operation,data,target.modelId); }
    finally { setBusy(false); }
  };
  return {
    active:Boolean(dialog && service), busy, open,
    runFromRow:(target,supply,operation)=>ops.proceed(()=>command(operation,payload(state,target,supply),target)),
    overlay:dialog && service && <MappingDialog state={state} service={service} dialog={dialog} ops={ops}
      blocked={blocked} busy={busy} close={close} command={(operation,data)=>command(operation,data,service)}/>,
  };
}

const confirmationCopy = {
  serviceMappingApply:['应用模型映射','确认应用映射','应用后使用已验证的供给。可在编辑路由时选择此渠道。'],
  serviceMappingDiscard:['放弃映射变更','确认放弃变更','放弃待应用变更，继续使用当前映射。'],
  serviceMappingDisable:['停用模型映射','确认停用映射','停用后该映射不可用于路由。'],
  serviceMappingRemove:['解除模型映射','确认解除映射','解除当前服务与该渠道模型的映射。'],
};

function MappingDialog({state,service,dialog,ops,blocked,busy,close,command}) {
  const {mode,supply,operation,base,side} = dialog;
  if (mode==='view') return <MappingDetails state={state} service={service} supply={supply} side={side} close={close}/>;
  if (mode==='confirm') {
    const [title,action,description] = confirmationCopy[operation];
    return <Modal wide title={title} description={mappingName(supply)} onClose={()=>!busy && close()} footer={<>
      <Button theme="light" disabled={busy} onClick={()=>close()}>取消</Button>
      <Button theme="solid" loading={busy} disabled={blocked} onClick={async()=>{
        if(await command(operation,{...base,confirmed:true})) close(true);
      }}>{action}</Button>
    </>}>
      <Typography.Paragraph>{description}</Typography.Paragraph>
      {operation==='serviceMappingApply' && <RequestPreview request={supply.serviceMapping?.pending?.validation?.request}/>}
      {ops.error && <Notice error>{ops.error}</Notice>}
    </Modal>;
  }
  return <MappingEditor state={state} service={service} dialog={dialog} ops={ops}
    blocked={blocked} busy={busy} close={close} command={command}/>;
}

function MappingDetails({state,service,supply,side,close}) {
  const channel = routingChannels(state,service).find(row=>row.id===supply.id);
  const addresses = routeMappingAddresses(service,channel,activeRouteVersion(serviceRoute(state,service.id))?.config);
  const issue = channel ? mappingState(state,service,supply).issue : '该渠道的映射已不存在。';
  return <Modal drawer drawerSide={side} title="映射详情" description={mappingName(supply)} onClose={()=>close()}
    footer={<Button theme="light" onClick={()=>close()}>关闭</Button>}>
    <Descriptions data={[
      {key:'模型调用标识',value:service.callId ? <CopyId value={service.callId}/> : '待配置'},
      {key:'上游模型调用标识',value:supply.upstreamModelId ? <CopyId value={supply.upstreamModelId} label="上游模型调用标识"/> : '待配置'},
      {key:'上游协议',value:channel?.mapping.upstreamProtocol || supply.endpoint?.protocol || '待配置'},
    ]}/>
    <section className="ss-route-editor-section">
      <Typography.Title heading={6}>API 地址映射</Typography.Title>
      {addresses.length ? addresses.map(({label,path,url,forwarding})=><Descriptions key={path} className="ss-mapping-address" data={[
        {key:'对外协议 / 接口路径',value:<Space wrap spacing={8}>
          <Typography.Text strong>{label || '—'}</Typography.Text><code className="ss-code">POST {path}</code>
        </Space>},
        {key:'上游请求地址',value:url ? <CopyId value={url} label="上游请求地址"/> : '—'},
        {key:'转发方式',value:forwarding},
      ]}/>) : <Typography.Text type="secondary">暂无已配置的 API 地址映射</Typography.Text>}
    </section>
    {issue && <Notice error>{issue}</Notice>}
  </Modal>;
}

function MappingEditor({state,service,dialog,ops,blocked,busy,close,command}) {
  const {supply,base,side,mode} = dialog;
  const interfaces = mappingInterfaces(service.model);
  const [editor,setEditor] = useState(()=>{
    const config = supply
      ? (mode==='edit' && supply.serviceMapping?.pending?.config || mappingConfig(supply,service.model))
      : {providerId:service.providerId || '',platformInterface:interfaces.length===1 ? interfaces[0][0] : ''};
    const name = supply ? (mode==='edit' && supply.serviceMapping?.pending?.name || mappingName(supply)) : '';
    return {config,name,request:null};
  });
  const {config,name,request} = editor;
  const options = mappingOptions(state,service,supply?.id);
  const providers = options && [...new Map((supply ? options.candidates : options.available).map(row=>[row.provider.id,row.provider.name]))];
  const choices = options?.available.filter(row=>row.provider.id===config.providerId) || [];
  const selected = choices.find(row=>row.id===config.associationId && row.endpointId===config.endpointId);
  const additional = additionalMappingOptions(service.model,selected);
  const sourceChanged = base.expectedSource!==mappingSourceVersion(state,service);
  const nowUsed = mode==='edit' && mappingReferences(state,supply).length>0;
  const ready = config.associationId && config.platformInterface;
  const set = patch=>{
    setEditor(current=>({...current,...patch,request:null}));
    ops.dirty(true);
    ops.setError('');
  };
  const selectSupply = id=>{
    const row = choices.find(item=>item.selectionId===id);
    if (!row) return;
    set({config:{
      providerId:row.provider.id, endpointId:row.endpointId, associationId:row.id,
      catalogueModelId:row.catalogueModelId, upstreamModelId:row.upstreamModelId, platformInterface:config.platformInterface,
    }});
  };
  const prepare = ()=>{
    try {
      const {request:nextRequest} = mappingPreview(state,service,config);
      setEditor(current=>({...current,request:nextRequest}));
      ops.setError('');
    } catch (error) { ops.setError(error.message); }
  };
  const save = async ()=>{
    const next = await command(supply ? 'serviceMappingSave' : 'serviceMappingCreate',{
      ...base,name:name.trim() || selected?.name || selected?.endpoint?.name || selected?.upstreamModelId,config,
    });
    if (next) close(true);
  };
  return <Modal drawer wide drawerSide={side}
    title={supply ? '编辑映射' : '新增映射'} onClose={()=>!busy && close()} footer={<>
      <Button theme="light" disabled={busy} onClick={()=>request ? setEditor({...editor,request:null}) : close()}>{request ? '返回修改' : '取消'}</Button>
      <Button theme="solid" loading={busy} disabled={blocked || sourceChanged || nowUsed || !ready}
        onClick={request ? save : prepare}>{request ? '保存映射' : '预览映射'}</Button>
    </>}>
    <Descriptions data={[
      {key:'模型服务',value:service.model.name},
      {key:'模型调用标识',value:<CopyId value={service.callId}/>},
      ...(service.providerId ? [{key:'服务商 / 渠道',value:service.name}] : []),
    ]}/>
    {sourceChanged && <Notice error>供给或模型资料已变化，请关闭后载入最新数据。</Notice>}
    {nowUsed && <Notice error>映射已被路由引用。请在「编辑路由」中处理该渠道。</Notice>}
    {request ? <RequestPreview request={request}/> : <div className="ss-mapping-fields">
      <>
        {!service.providerId && <Field label="服务商 *"><Choice label="映射服务商" value={config.providerId || undefined}
          placeholder="请选择服务商" options={providers} disabled={blocked || nowUsed}
          onChange={providerId=>set({config:{providerId,platformInterface:config.platformInterface}})}/></Field>}
        <Field label="渠道模型供给 *">
          <Choice label="渠道模型供给" value={selected?.selectionId || undefined}
            placeholder={config.providerId ? '请选择已验证并启用的供给' : '请先选择服务商'}
            options={choices.map(row=>[row.selectionId,row.name+' · '+row.upstreamModelId])}
            disabled={blocked || nowUsed || !choices.length} filter onChange={selectSupply}/>
        </Field>
        <Descriptions data={[
          {key:'上游模型调用标识',value:config.upstreamModelId ? <CopyId value={config.upstreamModelId} label="上游模型调用标识"/> : '—'},
          ...(interfaces.length===1 ? [{key:'平台接口',value:interfaces[0][1]}] : []),
        ]}/>
        {interfaces.length!==1 && <Field label="平台接口 *"><Choice label="映射平台接口"
          value={config.platformInterface || undefined} placeholder="请选择平台接口" options={interfaces}
          disabled={blocked || nowUsed} onChange={platformInterface=>set({config:{...config,platformInterface}})}/></Field>}
        {(additional.length>0 || config.additionalInterfaces?.length>0) && <Field label="附加对外接口">
          <Choice label="附加对外接口" multiple showClear placeholder="请选择附加对外接口"
            value={config.additionalInterfaces || []} options={additional.map(option=>[option.path,option.label])}
            disabled={blocked || nowUsed} onChange={additionalInterfaces=>set({config:{...config,additionalInterfaces}})}/>
        </Field>}
      </>
      <Field label="映射名称（选填）"><Input aria-label="映射名称"
        placeholder="留空时使用渠道名称" value={name} maxLength={60}
        disabled={blocked || nowUsed} onChange={name=>set({name})}/></Field>
    </div>}
    <Typography.Paragraph type="secondary">映射保存后可验证并启用。分流配置在「编辑路由」中生效。</Typography.Paragraph>
    {ops.error && <Notice error>{ops.error}</Notice>}
  </Modal>;
}

function RequestPreview({request}) {
  if (!request) return null;
  return <><div className="ss-request-preview">
    <section><Typography.Title heading={6}>客户请求平台</Typography.Title><Descriptions data={[
      {key:'接口路径',value:<code className="ss-code">{request.platform.path}</code>},
      {key:'model',value:<code className="ss-code">{request.platform.model}</code>},
    ]}/></section>
    <section><Typography.Title heading={6}>平台请求服务商</Typography.Title><Descriptions data={[
      {key:'请求地址',value:<code className="ss-code">{request.upstream.url}</code>},
      {key:'协议',value:request.upstream.protocol},
      {key:'model',value:<code className="ss-code">{request.upstream.model}</code>},
    ]}/></section>
  </div>
    {request.additional?.length>0 && <section className="ss-route-editor-section">
      <Typography.Title heading={6}>附加对外接口</Typography.Title>
      <Descriptions data={request.additional.map(({label,path,url})=>({
        key:<>{label} <code>{path}</code></>,value:<CopyId value={url} label="上游请求地址"/>,
      }))}/>
    </section>}
  </>;
}
