import AdminStatus from './AdminStatus';
import Table from './AdminTable';
import AdminActionMenu from './AdminActionMenu';
import {useRef,useState} from 'react';
import { IconPlus } from '@douyinfe/semi-icons';
import { Button, Input, Typography, Descriptions } from '@douyinfe/semi-ui';
import {Choice, Field} from './ServiceUI';
import { Modal, Notice, CopyId } from './ServiceUI';
import {modelSupplies,displayTime} from './model-management';
import {SERVICE_MODES} from './model-operations';
import {mappingCandidates,mappingConfig,mappingInterfaces,mappingPreview,mappingSourceVersion,mappingState} from './service-model-mappings';

export default function ServiceModelMappings({state,service,ops,onRoute}) {
  const [editor,setEditor]=useState(null),[preview,setPreview]=useState(null),[confirm,setConfirm]=useState(null),[busy,setBusy]=useState(false);
  const trigger=useRef(null),candidates=mappingCandidates(state,service),interfaces=mappingInterfaces(service.model);
  const rows=modelSupplies(state,service.modelId).filter(row=>!service.providerId || row.provider?.id===service.providerId);
  const blocked=!ops.can || Boolean(ops.conflict) || busy;
  const payload=supply=>({id:supply?.id,serviceId:service.id,expectedRevision:supply?.mappingRevision || 0,expectedSource:mappingSourceVersion(state,service)});
  const restoreFocus=()=>requestAnimationFrame(()=>trigger.current?.isConnected && trigger.current.focus());
  const closePreview=()=>{setPreview(null);restoreFocus();};
  const closeConfirmation=()=>{setConfirm(null);restoreFocus();};
  const close=(saved=false)=>{const finish=()=>{setEditor(null);setPreview(null);setConfirm(null);ops.setError('');ops.dirty(false);restoreFocus();};if(saved)finish();else ops.proceed(finish);};
  const open=(event,supply)=>ops.proceed(()=>{trigger.current=event.currentTarget;const config=supply?(supply.serviceMapping?.pending?.config || mappingConfig(supply,service.model)):{providerId:service.providerId || '',platformInterface:interfaces.length===1 ? interfaces[0][0] : ''};setEditor({supply,config,name:supply?.serviceMapping?.pending?.name || supply?.mappingName || (supply?`${supply.provider?.name || ''} · ${supply.endpoint?.name || '映射'}`:''),side:event.currentTarget.getBoundingClientRect().left+event.currentTarget.getBoundingClientRect().width/2<window.innerWidth/2?'right':'left',base:payload(supply)});ops.setError('');});
  const set=patch=>{setEditor(current=>({...current,...patch,request:null}));ops.dirty(true);ops.setError('');};
  const command=async(operation,data)=>{if(blocked)return;setBusy(true);try{return await ops.run(operation,data,service.modelId);}finally{setBusy(false);}};
  const prepare=()=>{try{const next=mappingPreview(state,service,editor.config);setEditor(current=>({...current,request:next.request}));ops.setError('');}catch(error){ops.setError(error.message);}};
  const save=async()=>{const next=await command(editor.supply?'serviceMappingSave':'serviceMappingCreate',{...editor.base,name:editor.name.trim() || selected?.name || selected?.endpoint?.name || selected?.upstreamModelId,config:editor.config});if(next)close(true);};
  const read=(button,supply)=>{try{trigger.current=button;setPreview({name:supply.mappingName || supply.endpoint?.name,request:mappingPreview(state,service,mappingConfig(supply,service.model)).request});ops.setError('');}catch(error){ops.setError(error.message);}};
  const ask=(button,supply,operation)=>{trigger.current=button;setConfirm({supply,operation,base:payload(supply)});ops.setError('');};
  const providerId=editor?.config.providerId;
  const providerChoices=[...new Map(candidates.map(row=>[row.provider.id,row.provider.name]))];
  const formChoices=candidates.filter(row=>!row.reason && row.provider.id===providerId &&
    !rows.some(supply=>supply.id!==editor?.supply?.id &&
      (supply.endpointId===row.endpointId || supply.serviceMapping?.pending?.config.endpointId===row.endpointId)));
  const selected=editor && formChoices.find(row=>row.id===editor.config.associationId && row.endpointId===editor.config.endpointId);
  const sourceChanged=editor && editor.base.expectedSource!==mappingSourceVersion(state,service);
  const updateLocked=Boolean(editor?.supply && mappingState(state,service,editor.supply).references.length);
  const ready=Boolean(editor?.config.associationId && editor.config.platformInterface);
  const selectSupply=id=>{
    const row=formChoices.find(item=>item.selectionId===id);
    if (!row) return;
    set({config:{providerId:row.provider.id,endpointId:row.endpointId,associationId:row.id,catalogueModelId:row.catalogueModelId,upstreamModelId:row.upstreamModelId,platformInterface:editor.config.platformInterface}});
  };
  return <section className="ss-mappings" aria-label={`${service.name}模型映射`}>
    <div className="ss-route-column-heading"><Typography.Title heading={6}>模型映射</Typography.Title><Button icon={<IconPlus aria-hidden="true"/>} theme="light" disabled={blocked || ops.hasUnsaved?.() || !service.callId || !interfaces.length} onClick={event=>open(event)}>新增映射</Button></div>
    {!service.callId && <Notice>请先配置当前服务商服务的对外调用标识。</Notice>}
    {!interfaces.length && <Notice>当前模型任务尚无可用的平台接口，请先完善模型资料或使用支持的接口。</Notice>}
    {ops.error && !editor && !confirm && <Notice error>{ops.error}</Notice>}
    <Table pagination={false} rowKey="id" scroll={{x:750}} empty="暂无映射。选择已验证的模型渠道建立映射，再配置路由。" columns={['映射 / 渠道','上游模型标识','接口映射','状态 / 引用','操作'].map((title,index)=>({title,render:(_,row)=>row['c'+index]}))} dataSource={rows.map(supply=>{const status=mappingState(state,service,supply),pending=supply.serviceMapping?.pending,used=status.references.length>0;return ({id:supply.id,c0: <><strong>{supply.mappingName || supply.endpoint?.name || '待补齐映射'}</strong>{!service.providerId && <small>{supply.provider?.name}</small>}{pending && <small>{pending.validation?'变更已验证，待应用':'有待验证变更'}</small>}</>,c1: <>{supply.upstreamModelId?<CopyId value={supply.upstreamModelId} label="上游模型标识"/>:'待配置'}</>,c2: <>{interfaces.find(([id])=>id===(supply.serviceMapping?.platformInterface || interfaces[0]?.[0]))?.[1] || '待配置'} → {supply.endpoint?.protocol || '待配置'}</>,c3: <><AdminStatus value={status.label}/><small>{status.references.length?status.references.map(row=>row.kind).join('、'):'备用 · 未参与'}</small>{status.issue && <small>{status.issue}</small>}{used && <Button theme="borderless" onClick={onRoute}>处理路由引用</Button>}</>,c4: <><div className="ss-mapping-actions"><Button theme="borderless" disabled={blocked || ops.hasUnsaved?.()} onClick={event=>open(event,supply)}>编辑</Button>
          {!used && !pending && (status.issue || supply.status!=='已启用') && <Button theme="borderless" disabled={blocked} onClick={()=>command(status.issue?'serviceMappingValidate':supply.status==='已启用'?'serviceMappingValidate':'serviceMappingEnable',payload(supply))}>{status.issue?'验证映射':supply.status==='已启用'?'重新验证':'启用映射'}</Button>}
          <AdminActionMenu label={'更多映射操作 '+(supply.mappingName || supply.endpoint?.name)} items={[
 {node:'item',name:'预览映射',onClick:button=>read(button,supply)},
 {node:'item',name:pending?'验证变更':'验证映射',disabled:blocked,onClick:()=>command('serviceMappingValidate',payload(supply))},
 ...(pending?[{node:'item',name:'应用映射',disabled:blocked || !pending.validation,onClick:button=>ask(button,supply,'serviceMappingApply')},{node:'item',name:'放弃变更',disabled:blocked,onClick:button=>ask(button,supply,'serviceMappingDiscard')}]:[{node:'item',name:supply.status==='已启用'?'停用映射':'启用映射',disabled:blocked || used,onClick:button=>supply.status==='已启用'?ask(button,supply,'serviceMappingDisable'):command('serviceMappingEnable',payload(supply))}]),
 {node:'item',name:'解除映射',disabled:blocked || supply.status==='已启用' || used,onClick:button=>ask(button,supply,'serviceMappingRemove')},
 ...(used?[{node:'title',name:'仍被路由引用，先处理引用后停用、解除。'}]:[]),
]}/>
        </div></>});})}/>
    {editor && <Modal drawer wide drawerSide={editor.side} className="ss-mapping-editor" title={editor.supply?'编辑映射':'新增映射'} onClose={()=>!busy && close()} footer={<><Button theme="light" disabled={busy} onClick={()=>editor.request?setEditor({...editor,request:null}):close()}>{editor.request?'返回修改':'取消'}</Button><Button theme="solid" loading={busy} disabled={blocked || sourceChanged || !ready} onClick={editor.request?save:prepare}>{editor.request?'保存映射':'预览映射'}</Button></>}>
      <Descriptions data={[
        {key:'模型服务',value:service.model.name},
        {key:'服务模式',value:SERVICE_MODES[service.mode]?.label},
        {key:'对外调用标识',value:<CopyId value={service.callId}/>},
        ...(service.providerId ? [{key:'服务商',value:service.name}] : []),
      ]}/>
      {sourceChanged && <Notice error>供给或模型资料已变化，当前输入保留。请关闭后载入最新数据再核对。</Notice>}
      {editor.request?<RequestPreview request={editor.request}/>:<div className="ss-mapping-fields">
        {!service.providerId && <Field label="服务商 *"><Choice label="映射服务商" value={providerId || undefined} placeholder="请选择服务商" options={providerChoices} disabled={blocked || updateLocked} onChange={id=>set({config:{providerId:id,platformInterface:editor.config.platformInterface}})}/></Field>}
        <Field label="渠道模型供给 *">
          <Choice label="渠道模型供给" value={selected?.selectionId || undefined}
            placeholder={providerId ? '请选择已验证并启用的供给' : '请先选择服务商'}
            options={formChoices.map(row=>[row.selectionId,`${row.name} · ${row.upstreamModelId}`])}
            disabled={blocked || updateLocked || !providerId || !formChoices.length} filter onChange={selectSupply}/>
        </Field>
        {!editor.supply && (providerId ? !formChoices.length : !providerChoices.length) && <Notice>暂无可新增的供给。已关联的渠道可在映射列表维护，待接入的供给可前往渠道接入。</Notice>}
        <Descriptions data={[
          {key:'上游模型标识',value:editor.config.upstreamModelId ? <CopyId value={editor.config.upstreamModelId} label="上游模型标识"/> : '—'},
          ...(interfaces.length===1 ? [{key:'平台接口',value:<><code>{interfaces[0][0]}</code> · {interfaces[0][1]}</>}] : []),
          ...(selected ? [
            {key:'上游协议',value:selected.endpoint.protocol},
            {key:'上游 API 地址',value:<code className="ss-code">{selected.apiAddresses?.[0]?.baseUrl || selected.endpoint.baseUrl}</code>},
          ] : []),
        ]}/>
        {updateLocked && <Typography.Paragraph>在用映射只能修改名称。更换渠道或接口，请新增映射后切换路由。</Typography.Paragraph>}
        {interfaces.length!==1 && <Field label="平台接口 *"><Choice label="映射平台接口" value={editor.config.platformInterface || undefined} placeholder="请选择平台接口" options={interfaces} disabled={blocked || updateLocked} onChange={platformInterface=>set({config:{...editor.config,platformInterface}})}/></Field>}
        <Field label="映射名称（选填）"><Input aria-label="映射名称" placeholder="留空时使用渠道名称" value={editor.name} maxLength={60} disabled={blocked} onChange={name=>set({name})}/></Field>
        <Button theme="borderless" onClick={()=>ops.go({perspective:'suppliers',provider:providerId || null,tab:'catalogue',origin:location.hash},{base:'providers'})}>前往渠道接入</Button>
      </div>}
      <Typography.Paragraph>保存不启用、不分配流量。映射验证复用当前供给检测结果，核对调用标识和接口，不产生新用量。</Typography.Paragraph>
      {ops.error && <Notice error>{ops.error}</Notice>}
    </Modal>}
    {preview && <Modal wide title="映射预览" description={preview.name} onClose={closePreview} footer={<Button theme="light" onClick={closePreview}>关闭预览</Button>}><RequestPreview request={preview.request}/><Typography.Paragraph>仅展示标识替换，不发送请求，不展示鉴权内容。</Typography.Paragraph></Modal>}
    {confirm && <Modal wide title={({'serviceMappingApply':'应用模型映射','serviceMappingDiscard':'放弃映射变更','serviceMappingDisable':'停用模型映射','serviceMappingRemove':'解除模型映射'})[confirm.operation]} description={confirm.supply.mappingName || confirm.supply.endpoint?.name} onClose={()=>!busy && closeConfirmation()} footer={<>
        <Button theme="light" disabled={busy} onClick={closeConfirmation}>取消</Button><Button theme="solid" disabled={blocked} onClick={async()=>{if(await command(confirm.operation,{...confirm.base,confirmed:true}))closeConfirmation();}}>{({'serviceMappingApply':'确认应用映射','serviceMappingDiscard':'确认放弃变更','serviceMappingDisable':'确认停用映射','serviceMappingRemove':'确认解除映射'})[confirm.operation]}</Button>
      </>}>
      <Typography.Paragraph>{confirm.operation==='serviceMappingApply'?'应用后使用已验证的新供给关系，未参与的路由不会自动选用它。':confirm.operation==='serviceMappingDiscard'?'放弃待验证变更，保留当前有效映射。':confirm.operation==='serviceMappingRemove'?'仅解除当前服务映射，供应渠道、价格和历史保留。':'停用后不能被新路由选择，映射和历史继续保留。'}</Typography.Paragraph>
      {confirm.supply.serviceMapping?.pending && confirm.operation==='serviceMappingApply' && <RequestPreview request={confirm.supply.serviceMapping.pending.validation?.request}/>}
      {ops.error && <Notice error>{ops.error}</Notice>}
    </Modal>}
    {rows.some(row=>row.serviceMapping?.validation) && <Typography.Paragraph className="ss-mapping-note">最近核验：{displayTime(rows.filter(row=>row.serviceMapping?.validation).at(-1)?.serviceMapping.validation.checkedAt)}。验证结果绑定当前调用标识及供给配置。</Typography.Paragraph>}
  </section>;
}
function RequestPreview({request}) {
  if(!request)return null;
  return <div className="ss-mapping-preview"><section><Typography.Title heading={6}>客户请求平台</Typography.Title><Descriptions data={[{key:<>接口路径</>,value:<><code>{request.platform.path}</code></>},{key:<>model</>,value:<><code>{request.platform.model}</code></>}]}/></section><section><Typography.Title heading={6}>平台请求服务商</Typography.Title><Descriptions data={[{key:<>请求地址</>,value:<><code>{request.upstream.url}</code></>},{key:<>协议</>,value:<>{request.upstream.protocol}</>},{key:<>model</>,value:<><code>{request.upstream.model}</code></>}]}/></section></div>;
}
