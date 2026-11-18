import { offerKey } from '../service-access.mjs';
import { useState } from 'react';
import { Button, Descriptions, RadioGroup, Radio, Typography, InputNumber, CheckboxGroup, Checkbox } from '@douyinfe/semi-ui';
import { Choice, CopyId, Field, Notice } from './ServiceUI';
import { platformServices } from './platform-service-client';
import { activeRouteVersion, routeSourceVersion, routingChannels, serviceRoute, routeGroups, ROUTE_RETRY_DEFAULTS, ROUTE_RETRY_REASONS } from './service-routing';

export default function ServiceFailover({state, model, ops}) {
  const services = platformServices(state, model);
  const [serviceId, setServiceId] = useState(() => services.find(row=>offerKey(row)===ops.params.get('routeProvider'))?.id || services[0]?.id);
  const service = services.find(row=>row.id===serviceId);
  return <section className="ss-model-form" aria-label="故障转移配置">
    {services.length > 1 && <Field label="渠道服务"><Choice label="渠道服务" value={serviceId} options={services.map(row=>[row.id,row.name])} onChange={id=>ops.proceed(()=>{
      setServiceId(id);ops.dirty(false);ops.setError('');
    })}/></Field>}
    {service?.channelId ? <Notice>当前渠道服务固定调用绑定渠道。</Notice> : service ? <FailoverSettings key={service.id} state={state} service={service} ops={ops}/> : <Notice>请先配置模型服务及渠道。</Notice>}
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
  const savedRetry = active?.config.retry ?? ROUTE_RETRY_DEFAULTS;
  const retry = draft?.retry ?? savedRetry;
  const maxSwitches = active?.config.strategy === 'weighted' ? routeGroups(active.config).length - 1 : 0;
  const modified = enabled!==savedEnabled || explicit && enabled && backupSupplyId!==savedBackup ||
    JSON.stringify(retry) !== JSON.stringify(savedRetry);
  if (!active || explicit && (selected.length!==1 || active.config.strategy!=='fixed')) return <Notice>请先在“路由及映射”保存{explicit ? '一个主渠道' : '路由配置'}。</Notice>;
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
      const next = await ops.run('serviceFailoverConfigure',{
        serviceId:service.id, expectedVersion:draft.expectedVersion, sourceVersion:draft.sourceVersion,
        enabled, backupSupplyId:explicit && enabled ? backupSupplyId : null, confirmed:true,
        ...(!explicit && (draft.retry || enabled) ? {retry} : {}),
      },service.modelId);
      if (next) reset();
    } finally {setBusy(false);}
  };
  return <>
    <Descriptions data={[{key:'模型调用标识',value:<CopyId value={service.callId} label="模型调用标识"/>},explicit ? {key:'主渠道',value:primary?.channelName || '渠道已失效'} : {key:'参与路由',value:selected.length+' 条渠道'}]}/>
    <Field label="故障转移"><RadioGroup aria-label="故障转移" value={enabled ? 'on' : 'off'} disabled={blocked} onChange={event=>update({enabled:event.target.value==='on'})}><Radio value="off">关闭</Radio><Radio value="on">开启</Radio></RadioGroup></Field>
    {explicit && enabled && <Field label="备用渠道"><Choice label="备用渠道" value={backupSupplyId || undefined} placeholder="请选择一个备用渠道" disabled={blocked} options={[...backups.map(row=>[row.id,`${row.channelName} · ${row.upstreamModelId}`]),...(backupSupplyId && !backups.some(row=>row.id===backupSupplyId) ? [[backupSupplyId,unavailableBackup ? unavailableBackup.channelName+'（不可用）' : '当前备用渠道不可用']] : [])]} onChange={id=>update({backupSupplyId:id})}/></Field>}
    {explicit && enabled && !backups.length && <Notice>请先在「路由及映射」中验证并启用同服务商的备用渠道映射。</Notice>}
    {explicit ? <Typography.Paragraph>主渠道不可用或调用失败时，尝试备用渠道。</Typography.Paragraph> : enabled && <>
      <Field label="重试触发条件"><CheckboxGroup aria-label="重试触发条件" direction="horizontal" value={retry.reasons}
        disabled={blocked} onChange={reasons=>update({retry:{...retry,reasons}})}>
        {ROUTE_RETRY_REASONS.map(([id,label])=><Checkbox key={id} value={id}>{label}</Checkbox>)}
      </CheckboxGroup></Field>
      <Field label="组内重试次数" hint="每个优先级组在首次尝试后，可继续尝试的次数。">
        <InputNumber aria-label="组内重试次数" min={0} max={10} step={1} value={retry.withinGroup}
          disabled={blocked} onChange={withinGroup=>update({retry:{...retry,withinGroup}})}/>
      </Field>
      <Field label="跨组切换次数"><InputNumber aria-label="跨组切换次数" min={0} max={maxSwitches} step={1} value={retry.acrossGroups}
        disabled={blocked || maxSwitches === 0} onChange={acrossGroups=>update({retry:{...retry,acrossGroups}})}/>
        <Typography.Text type="tertiary">{maxSwitches === 0 ? '请先在「路由及映射」配置多个优先级组。'
          : '按优先级顺序切换。设为 0 时只在首选组内尝试。'}</Typography.Text>
      </Field>
      <Field label="服务总尝试上限"><InputNumber aria-label="服务总尝试上限" min={1} max={20} step={1} value={retry.maxAttempts}
        disabled={blocked} onChange={maxAttempts=>update({retry:{...retry,maxAttempts}})}/>
        <Typography.Text type="tertiary">包含首次调用。组内按当前路由策略选择其余可用渠道，达到组内上限或无可用渠道时可切到下一组。</Typography.Text>
      </Field>
    </>}
    {route?.draft && <Notice>请先处理已有路由草稿。</Notice>}
    {changed && <Notice error>渠道配置已变化。请取消修改后重新核对。</Notice>}
    {draft && <Typography.Paragraph>保存后需重新验证服务配置。</Typography.Paragraph>}
    {ops.error && <Notice error>{ops.error}</Notice>}
    <div className="ss-footer"><Button theme="light" disabled={!draft || busy} onClick={reset}>取消</Button><Button theme="solid" loading={busy} disabled={blocked || !draft || !modified || !validBackup} onClick={save}>保存故障转移</Button></div>
  </>;
}
