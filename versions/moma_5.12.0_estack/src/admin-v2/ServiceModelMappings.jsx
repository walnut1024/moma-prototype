import {useRef,useState} from 'react';
import {Plus} from 'lucide-react';
import {Button} from '../components/ui/button';
import {Input} from '../components/ui/input';
import {Choice,Field} from './ModelMetadataForm';
import {GridTable,Row,Cell,Status,Modal,Notice,CopyId} from './ModelOperationsUI';
import {modelSupplies,displayTime} from './model-management';
import {mappingCandidates,mappingConfig,mappingInterfaces,mappingPreview,mappingSourceVersion,mappingState} from './service-model-mappings';

export default function ServiceModelMappings({state,service,ops}) {
  const [editor,setEditor]=useState(null),[preview,setPreview]=useState(null),[confirm,setConfirm]=useState(null),[busy,setBusy]=useState(false);
  const trigger=useRef(null),candidates=mappingCandidates(state,service),interfaces=mappingInterfaces(service.model);
  const rows=modelSupplies(state,service.modelId).filter(row=>!service.providerId || row.provider?.id===service.providerId);
  const blocked=!ops.can || Boolean(ops.conflict) || busy;
  const payload=supply=>({id:supply?.id,serviceId:service.id,expectedRevision:supply?.mappingRevision || 0,expectedSource:mappingSourceVersion(state,service)});
  const close=(saved=false)=>{const finish=()=>{setEditor(null);setPreview(null);setConfirm(null);ops.setError('');ops.dirty(false);requestAnimationFrame(()=>trigger.current?.isConnected && trigger.current.focus());};if(saved)finish();else ops.proceed(finish);};
  const open=(event,supply)=>ops.proceed(()=>{trigger.current=event.currentTarget;const config=supply?(supply.serviceMapping?.pending?.config || mappingConfig(supply,service.model)):{providerId:service.providerId || '',platformInterface:interfaces[0]?.[0] || ''};setEditor({supply,config,name:supply?.serviceMapping?.pending?.name || supply?.mappingName || (supply?`${supply.provider?.name || ''} · ${supply.endpoint?.name || '映射'}`:''),side:event.currentTarget.getBoundingClientRect().left+event.currentTarget.getBoundingClientRect().width/2<window.innerWidth/2?'right':'left',base:payload(supply)});ops.setError('');});
  const set=patch=>{setEditor(current=>({...current,...patch,request:null}));ops.dirty(true);ops.setError('');};
  const command=async(operation,data)=>{if(blocked)return;setBusy(true);try{return await ops.run(operation,data,service.modelId);}finally{setBusy(false);}};
  const prepare=()=>{try{if(!editor.name.trim())throw Error('请填写映射名称');const next=mappingPreview(state,service,editor.config);setEditor(current=>({...current,request:next.request}));ops.setError('');}catch(error){ops.setError(error.message);}};
  const save=async()=>{const next=await command(editor.supply?'serviceMappingSave':'serviceMappingCreate',{...editor.base,name:editor.name,config:editor.config});if(next)close(true);};
  const read=supply=>{try{setPreview({name:supply.mappingName || supply.endpoint?.name,request:mappingPreview(state,service,mappingConfig(supply,service.model)).request});ops.setError('');}catch(error){ops.setError(error.message);}};
  const ask=(event,supply,operation)=>{trigger.current=event.currentTarget;setConfirm({supply,operation,base:payload(supply)});ops.setError('');};
  const formChoices=candidates.filter(row=>!row.reason && row.provider.id===editor?.config.providerId);
  const selected=editor && formChoices.find(row=>row.id===editor.config.associationId && row.endpointId===editor.config.endpointId);
  const sourceChanged=editor && editor.base.expectedSource!==mappingSourceVersion(state,service);
  const updateLocked=Boolean(editor?.supply && mappingState(state,service,editor.supply).references.length);
  return <section className="service-mappings" aria-label={`${service.name}模型映射`}>
    <div className="sr-column-heading"><h3>模型映射</h3><Button variant="outline" disabled={blocked || ops.hasUnsaved?.() || !service.callId || !interfaces.length} onClick={event=>open(event)}><Plus/>新增映射</Button></div>
    {!service.callId && <Notice>请先配置当前供应商服务的对外调用标识。</Notice>}
    {!interfaces.length && <Notice>当前模型任务尚无可用的平台接口，请先完善模型资料或使用支持的接口。</Notice>}
    <GridTable className="service-mappings-table" headings={['映射名称','对外调用标识','供应商 / 渠道','上游模型标识','平台接口 → 上游协议','状态','路由引用','操作']} empty={!rows.length} emptyMessage="暂无模型映射。新增并启用映射后，再配置路由。">
      {rows.map(supply=>{const status=mappingState(state,service,supply),pending=supply.serviceMapping?.pending;return <Row key={supply.id}>
        <Cell>{supply.mappingName || supply.endpoint?.name || '待补齐映射'}{pending && <small>{pending.validation?'变更已验证，待应用':'有待验证变更'}</small>}</Cell><Cell><code>{service.callId || '待配置'}</code></Cell><Cell>{supply.provider?.name || '供应商缺失'}<small>{supply.endpoint?.name || '渠道缺失'}</small></Cell><Cell>{supply.upstreamModelId?<CopyId value={supply.upstreamModelId} label="上游模型标识"/>:'待配置'}</Cell><Cell>{interfaces.find(([id])=>id===(supply.serviceMapping?.platformInterface || interfaces[0]?.[0]))?.[1] || '待配置'} → {supply.endpoint?.protocol || '待配置'}</Cell><Cell><Status good={!status.issue && supply.status==='已启用'}>{status.label}</Status>{status.issue && <small>{status.issue}</small>}</Cell><Cell>{status.references.length?status.references.map(row=>row.kind).join('、'):'未参与路由'}</Cell><Cell><div className="service-mapping-actions">
          <Button variant="link" onClick={()=>read(supply)}>预览映射</Button><Button variant="link" disabled={blocked || ops.hasUnsaved?.()} onClick={event=>open(event,supply)}>编辑映射</Button><Button variant="link" disabled={blocked} onClick={()=>command('serviceMappingValidate',payload(supply))}>{pending?'验证变更':'验证映射'}</Button>
          {pending?<><Button variant="link" disabled={blocked || !pending.validation} onClick={event=>ask(event,supply,'serviceMappingApply')}>应用映射</Button><Button variant="link" disabled={blocked} onClick={event=>ask(event,supply,'serviceMappingDiscard')}>放弃变更</Button></>:<Button variant="link" disabled={blocked || supply.status==='已启用' && status.references.length>0} title={status.references.length?'先替换路由或停服后停用路由':undefined} onClick={event=>supply.status==='已启用'?ask(event,supply,'serviceMappingDisable'):command('serviceMappingEnable',payload(supply))}>{supply.status==='已启用'?'停用映射':'启用映射'}</Button>}
          <Button variant="link" disabled={blocked || supply.status==='已启用' || status.references.length>0} title="先停用映射并解除路由引用" onClick={event=>ask(event,supply,'serviceMappingRemove')}>解除映射</Button>
        </div></Cell>
      </Row>;})}
    </GridTable>
    {editor && <Modal drawer wide drawerSide={editor.side} className="service-mapping-editor" title={editor.supply?'编辑映射':'新增映射'} description={`${service.model.name} · ${service.name}`} onClose={()=>close()} footer={<><Button variant="outline" disabled={busy} onClick={()=>editor.request?setEditor({...editor,request:null}):close()}>{editor.request?'返回修改':'取消'}</Button><Button disabled={blocked || sourceChanged} onClick={editor.request?save:prepare}>{editor.request?'保存映射':'预览映射'}</Button></>}>
      <p>对外调用标识：<code>{service.callId}</code></p>
      {sourceChanged && <Notice error>供给或模型资料已变化，当前输入保留。请关闭后载入最新数据再核对。</Notice>}
      {editor.request?<RequestPreview request={editor.request}/>:<div className="service-mapping-fields">
        <Field label="映射名称 *"><Input aria-label="映射名称" value={editor.name} maxLength={60} disabled={blocked} onChange={event=>set({name:event.target.value})}/></Field>
        <Field label="供应商 *"><Choice label="映射供应商" value={editor.config.providerId || 'none'} options={[[ 'none','请选择供应商' ],...state.providers.filter(row=>candidates.some(channel=>channel.provider.id===row.id)).map(row=>[row.id,row.name])]} disabled={blocked || Boolean(service.providerId) || updateLocked} onChange={providerId=>set({config:{providerId,platformInterface:editor.config.platformInterface}})}/></Field>
        <Field label="渠道模型供给 *"><Choice label="映射渠道" value={selected?.selectionId || 'none'} options={[[ 'none','请选择已验证并启用的供给' ],...formChoices.map(row=>[row.selectionId,`${row.name} · ${row.upstreamModelId}`])]} disabled={blocked || updateLocked} onChange={id=>{const row=formChoices.find(row=>row.selectionId===id);if(row)set({config:{providerId:row.provider.id,endpointId:row.endpointId,associationId:row.id,catalogueModelId:row.catalogueModelId,upstreamModelId:row.upstreamModelId,platformInterface:editor.config.platformInterface}});}}/></Field>
        {updateLocked && <p>在用映射只能修改名称。更换渠道或接口，请新增映射后切换路由。</p>}
        <Field label="平台接口 *"><Choice label="映射平台接口" value={editor.config.platformInterface || 'none'} options={[[ 'none','请选择平台接口' ],...interfaces]} disabled={blocked || updateLocked} onChange={platformInterface=>set({config:{...editor.config,platformInterface}})}/></Field>
        {selected && <dl><dt>上游模型标识</dt><dd><code>{selected.upstreamModelId}</code></dd><dt>上游协议</dt><dd>{selected.endpoint.protocol}</dd><dt>上游 API 地址</dt><dd><code>{selected.apiAddresses?.[0]?.baseUrl || selected.endpoint.baseUrl}</code></dd></dl>}
        <Button variant="link" onClick={()=>ops.go({perspective:'suppliers',provider:editor.config.providerId || null,tab:'catalogue',origin:location.hash},{base:'providers'})}>维护供应配置</Button>
      </div>}
      <p>保存不启用、不分配流量。映射验证复用当前供给检测结果，核对调用标识和接口，不产生新用量。</p>
      {ops.error && <Notice error>{ops.error}</Notice>}
    </Modal>}
    {preview && <Modal wide title="映射预览" description={preview.name} onClose={()=>setPreview(null)}><RequestPreview request={preview.request}/><p>仅展示标识替换，不发送请求，不展示鉴权内容。</p><Button variant="outline" onClick={()=>setPreview(null)}>关闭预览</Button></Modal>}
    {confirm && <Modal wide title={({'serviceMappingApply':'应用模型映射','serviceMappingDiscard':'放弃映射变更','serviceMappingDisable':'停用模型映射','serviceMappingRemove':'解除模型映射'})[confirm.operation]} description={confirm.supply.mappingName || confirm.supply.endpoint?.name} onClose={()=>setConfirm(null)}>
      <p>{confirm.operation==='serviceMappingApply'?'应用后使用已验证的新供给关系，未参与的路由不会自动选用它。':confirm.operation==='serviceMappingDiscard'?'放弃待验证变更，保留当前有效映射。':confirm.operation==='serviceMappingRemove'?'仅解除当前服务映射，供应渠道、价格和历史保留。':'停用后不能被新路由选择，映射和历史继续保留。'}</p>
      {confirm.supply.serviceMapping?.pending && confirm.operation==='serviceMappingApply' && <RequestPreview request={confirm.supply.serviceMapping.pending.validation?.request}/>}
      <div className="mo-footer"><Button variant="outline" onClick={()=>setConfirm(null)}>取消</Button><Button disabled={blocked} onClick={async()=>{if(await command(confirm.operation,{...confirm.base,confirmed:true}))setConfirm(null);}}>确认操作</Button></div>{ops.error && <Notice error>{ops.error}</Notice>}
    </Modal>}
    {rows.some(row=>row.serviceMapping?.validation) && <p className="service-mapping-note">最近核验：{displayTime(rows.filter(row=>row.serviceMapping?.validation).at(-1)?.serviceMapping.validation.checkedAt)}。验证结果绑定当前调用标识及供给配置。</p>}
  </section>;
}
function RequestPreview({request}) {
  if(!request)return null;
  return <div className="service-mapping-preview"><section><h3>客户请求平台</h3><dl><dt>接口路径</dt><dd><code>{request.platform.path}</code></dd><dt>model</dt><dd><code>{request.platform.model}</code></dd></dl></section><section><h3>平台请求供应商</h3><dl><dt>请求地址</dt><dd><code>{request.upstream.url}</code></dd><dt>协议</dt><dd>{request.upstream.protocol}</dd><dt>model</dt><dd><code>{request.upstream.model}</code></dd></dl></section></div>;
}
