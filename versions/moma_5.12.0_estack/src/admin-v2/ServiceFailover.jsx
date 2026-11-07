import { useState } from 'react';
import { Button, Descriptions, RadioGroup, Radio, Typography } from '@douyinfe/semi-ui';
import { Choice, CopyId, Field, Notice } from './ServiceUI';
import { platformServices } from './platform-service-client';
import { activeRouteVersion, routeSourceVersion, routingChannels, serviceRoute } from './service-routing';

export default function ServiceFailover({state, model, ops}) {
  const services = platformServices(state, model);
  const [serviceId, setServiceId] = useState(() => services.find(row=>row.providerId===ops.params.get('routeProvider'))?.id || services[0]?.id);
  const service = services.find(row=>row.id===serviceId);
  return <section className="ss-model-form" aria-label="故障转移配置">
    {services.length > 1 && <Field label="服务商"><Choice label="故障转移服务商" value={serviceId} options={services.map(row=>[row.id,row.name])} onChange={id=>ops.proceed(()=>{
      setServiceId(id);ops.dirty(false);ops.setError('');
    })}/></Field>}
    {service ? <FailoverSettings key={service.id} state={state} service={service} ops={ops}/> : <Notice>请先配置模型服务及渠道。</Notice>}
  </section>;
}

function FailoverSettings({state, service, ops}) {
  const route = serviceRoute(state,service.id), active = activeRouteVersion(route);
  const channels = routingChannels(state,service);
  const selected = active?.config.channels.filter(row=>row.enabled && !row.backup) || [];
  const primary = channels.find(row=>row.id===selected[0]?.supplyId);
  const explicit = service.mode === 'provider';
  const savedBackup = active?.config.channels.find(row=>row.backup)?.supplyId || '';
  const savedEnabled = explicit ? Boolean(savedBackup) : active?.config.autoFailover === true;
  const [draft,setDraft] = useState(null);
  const [busy,setBusy] = useState(false);
  const sourceVersion = routeSourceVersion(state,service);
  const enabled = draft?.enabled ?? savedEnabled;
  const backupSupplyId = draft?.backupSupplyId ?? savedBackup;
  const backups = channels.filter(row=>row.endpointId!==primary?.endpointId && row.available);
  const changed = draft && (draft.expectedVersion!==active?.version || draft.sourceVersion!==sourceVersion);
  const blocked = !ops.can || busy || Boolean(changed) || Boolean(route?.draft);
  const unavailableBackup = channels.find(row=>row.id===backupSupplyId);
  const validBackup = !explicit || !enabled || backups.some(row=>row.id===backupSupplyId);
  const modified = enabled!==savedEnabled || explicit && enabled && backupSupplyId!==savedBackup;
  if (!active || explicit && (selected.length!==1 || active.config.strategy!=='fixed')) return <Notice>请先在“渠道与路由”保存{explicit ? '一个主渠道' : '路由配置'}。</Notice>;
  const update = patch => {
    const next = {...(draft || {enabled:savedEnabled,backupSupplyId:savedBackup,expectedVersion:active.version,sourceVersion}),...patch};
    setDraft(next);
    ops.dirty(true);
    ops.setError('');
  };
  const reset = () => {setDraft(null);ops.dirty(false);ops.setError('');};
  const save = async () => {
    if (blocked || !draft || !modified || !validBackup) return;
    setBusy(true);
    try {
      const next = await ops.run('serviceFailoverConfigure',{serviceId:service.id,expectedVersion:draft.expectedVersion,sourceVersion:draft.sourceVersion,enabled,backupSupplyId:explicit && enabled ? backupSupplyId : null,confirmed:true},service.modelId);
      if (next) reset();
    } finally {setBusy(false);}
  };
  return <>
    <Descriptions data={[{key:'对外调用标识',value:<CopyId value={service.callId} label="对外调用标识"/>},explicit ? {key:'主渠道',value:primary?.channelName || '渠道已失效'} : {key:'参与路由',value:selected.length+' 条渠道'}]}/>
    <Field label="故障转移"><RadioGroup aria-label="故障转移" value={enabled ? 'on' : 'off'} disabled={blocked} onChange={event=>update({enabled:event.target.value==='on'})}><Radio value="off">关闭</Radio><Radio value="on">开启</Radio></RadioGroup></Field>
    {explicit && enabled && <Field label="备用渠道"><Choice label="备用渠道" value={backupSupplyId || undefined} placeholder="请选择一个备用渠道" disabled={blocked} options={[...backups.map(row=>[row.id,`${row.channelName} · ${row.upstreamModelId}`]),...(backupSupplyId && !backups.some(row=>row.id===backupSupplyId) ? [[backupSupplyId,unavailableBackup ? unavailableBackup.channelName+'（不可用）' : '当前备用渠道不可用']] : [])]} onChange={id=>update({backupSupplyId:id})}/></Field>}
    {explicit && enabled && !backups.length && <Notice>请先通过“渠道与路由”的“模型映射”启用同服务商的备用渠道。</Notice>}
    <Typography.Paragraph>{explicit ? '主渠道不可用或调用失败时，尝试备用渠道。' : '当前渠道调用失败时，按已配置的路由策略尝试其余可用渠道。'}</Typography.Paragraph>
    {route?.draft && <Notice>请先处理已有路由草稿。</Notice>}
    {changed && <Notice error>渠道配置已变化。请取消修改后重新核对。</Notice>}
    {draft && <Typography.Paragraph>保存后需重新验证服务配置。</Typography.Paragraph>}
    {ops.error && <Notice error>{ops.error}</Notice>}
    <div className="ss-footer"><Button theme="light" disabled={!draft || busy} onClick={reset}>取消</Button><Button theme="solid" loading={busy} disabled={blocked || !draft || !modified || !validBackup} onClick={save}>保存故障转移</Button></div>
  </>;
}
