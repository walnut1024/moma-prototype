import SupplierChannelBatchTest from './SupplierChannelBatchTest';
import { useRef, useState } from 'react';
import { Button, Checkbox, Table, Typography, Descriptions, Collapse } from '@douyinfe/semi-ui';
import {Choice, Field} from './ServiceUI';
import { Modal, Notice } from './ServiceUI';
import { displayTime } from './model-management';
import OnboardingScenarioControl from './OnboardingScenarioControl';
import { platformAllowedChannels, platformCandidatePlan, platformFeeDisplay, platformServices, publishPlatformCandidate, runPlatformTrial, recoverPlatformTrial } from './platform-service-client';
import { redactDiagnostic } from './channel-selection';
import { getMockServiceSnapshots } from './mock-onboarding-service';
import { serviceLifecycle } from './service-workspace';

const safe = value => JSON.stringify(redactDiagnostic(value), null, 2);

export default function ServicePlatformTrial({ state, model, ops, providerId, onPublished }) {
  const [open, setOpen] = useState(false);
  return <><Button htmlType="button" theme="light" onClick={() => setOpen(true)}>平台试调用</Button>{open && <PlatformTrialDialog state={state} model={model} ops={ops} providerId={providerId} onPublished={onPublished} close={() => setOpen(false)}/>}</>;
}

export function PlatformTrialDialog({ state, model, ops, providerId, onPublished, close, embedded = false, review = false, onValidated }) {
  const scoped = embedded || review;
  const services = platformServices(state, model);
  const initialService = services.find(row => row.providerId === (providerId || null)) || services[0];
  const [serviceId, setServiceId] = useState(() => initialService?.id || '');
  const [audioProbe, setAudioProbe] = useState('');
  const [tenantIds, setTenantIds] = useState(() => scoped ? (state.tenants || []).filter(row => !['已删除', '已停用', '停用'].includes(row.status) && (model.openScope === 'all' || model.tenantIds?.includes(row.id))).map(row => row.id) : []), [supplyIds, setSupplyIds] = useState(() => scoped ? platformAllowedChannels(state, initialService).map(row => row.id) : []), [confirmExpensive, setConfirmExpensive] = useState(false), [consent, setConsent] = useState(false);
  const [phase, setPhase] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(null), [testingRow, setTestingRow] = useState(null), [server, setServer] = useState(null), [receipt, setReceipt] = useState(null), [confirmPublish, setConfirmPublish] = useState(false);
  const [pendingReceipt,setPendingReceipt]=useState(null);
  const service = services.find(row => row.id === serviceId);
  const historical=getMockServiceSnapshots().find(row=>row.published?.config.publicModelId===service?.callId || row.candidate.publicModelId===service?.callId);
  const visibleServer=server?.candidate?.publicModelId===service?.callId?server:historical;
  const publication=visibleServer?.published || historical?.published;
  const rows = platformAllowedChannels(state, service);
  const tenants = (state.tenants || []).filter(row => !['已删除', '已停用', '停用'].includes(row.status));
  let plan, blocker;
  try { plan = platformCandidatePlan(state, model, { serviceId, tenantIds, supplyIds, audioProbe, technical: true }); } catch (issue) { blocker = issue.message; }
  const recovered = !receipt && plan ? recoverPlatformTrial(plan) : null;
  const fingerprint = plan?.fingerprint || '';
  const unsaved = Boolean(ops.hasUnsaved?.());
  const latest = useRef(null); latest.current = { fingerprint, can: ops.can, unsaved };
  const passed = Boolean(receipt && receipt.fingerprint === fingerprint && receipt.result.technicalReady && receipt.result.candidateVersion === receipt.service.candidateVersion);
  const changed = Boolean(receipt && receipt.fingerprint !== fingerprint);
  const expensive = ['image', 'video', 'audio'].includes(model.type);
  const actualBinding = receipt?.service?.candidate?.bindings?.find(binding => binding.channelId === receipt.result.actualSupply?.channelId);
  const actualRow = rows.find(row => row.id === actualBinding?.id);
  const reset = () => { onValidated?.(null); setError(null); setConfirmPublish(false); setConfirmExpensive(false); setConsent(false); };
  const trial = async () => {
    if (!plan || !ops.can || busy || !consent || unsaved) return;
    const captured = plan;
    onValidated?.(null);setBusy(true); setError(null); setReceipt(null); setConfirmPublish(false); setPendingReceipt(null);
    try {
      const tested = await runPlatformTrial(captured, { confirmExpensive, isCurrent: () => ops.isCurrent() && latest.current.fingerprint === captured.fingerprint && latest.current.can && !latest.current.unsaved, onProgress: setPhase, onCandidate: setServer });
      setReceipt(tested); onValidated?.(tested); setPhase(tested.result.technicalReady ? '平台试调用通过' : '调用完成，计量或费用未知');
    } catch (issue) { setPhase('试调用未通过'); setError({ message: issue.message, code: issue.code, traceId: issue.traceId }); }
    finally { setBusy(false); }
  };
  const recordPublication=async (published,captured)=>{
    const saved=await ops.run('recordPlatformPublication',{serviceId:captured.serviceId,mockServiceId:published.id,publishedVersion:published.published.version,expectedFingerprint:captured.publicationFingerprint},model.id,true);
    if(!saved){setPendingReceipt({published,captured});setError({message:'平台配置已发布，本地验证记录尚未保存。处理保存问题后可同步记录，无需重复试调用。'});return false;}
    setPendingReceipt(null);setError(null);setReceipt(null);setConfirmPublish(false);setPhase('配置已发布');
    onPublished?.(published,{fingerprint:captured.fingerprint,candidate:captured.service.candidate});
    return true;
  };
  const publish = async () => {
    if (!passed || !ops.can || busy || unsaved || pendingReceipt) return;
    if (!review && !confirmPublish) { setConfirmPublish(true); return; }
    const captured = receipt;
    setBusy(true); setError(null); setPhase('发布验证后的配置');
    try {
      if (!ops.isCurrent() || latest.current.fingerprint !== captured.fingerprint || !latest.current.can || latest.current.unsaved) throw new Error('当前配置或权限已变化，请重新试调用');
      const published = await publishPlatformCandidate(captured.service);
      setServer(published);await recordPublication(published,captured);
    } catch (issue) { setError({ message: issue.message, code: issue.code, traceId: issue.traceId }); setConfirmPublish(false); }
    finally { setBusy(false); }
  };
  if (testingRow) return <SupplierChannelBatchTest state={state} provider={state.providers.find(row => row.id === testingRow.supply.provider.id)} endpointId={testingRow.supply.endpoint.id} associationIds={[testingRow.association.id]} ops={ops} close={() => setTestingRow(null)}/>;
  const footer = onValidated ? <Button htmlType="button" theme="light" disabled={busy} onClick={close}>退出试调用</Button> : <>{confirmPublish && <Button htmlType="button" theme="light" disabled={busy} onClick={() => setConfirmPublish(false)}>取消发布</Button>}<Button htmlType="button" theme="light" disabled={busy} onClick={close}>{scoped ? '退出试调用' : '关闭'}</Button><Button htmlType="button" disabled={!ops.can || unsaved || !passed || busy || Boolean(pendingReceipt)} onClick={publish}>{review?'保存验证并继续上架':confirmPublish ? '确认生效' : '保存验证结果'}</Button></>;
  const body = <div className="ss-change-dialog">
      <Descriptions data={[{key:<>上架状态</>,value:<>{serviceLifecycle(model)}</>},{key:<>验证配置</>,value:<>{passed?'验证通过':visibleServer?'等待验证':'待验证'}<small>{publication ? `上次验证生效：${displayTime(publication.publishedAt)}` : '尚无有效验证记录'}</small></>}]}/>
      <div className="ss-change-fields"><Field label="调用服务"><Choice label="平台试调用服务" value={service ? serviceId : 'unselected'} options={[...(!service ? [['unselected', services.length ? '请选择当前服务' : '请先配置服务模式']] : []), ...services.map(row => [row.id, `${row.name} · ${row.callId || '调用 ID 待配置'}`])]} disabled={busy || !services.length} onChange={id => { setServiceId(id); setSupplyIds(scoped ? platformAllowedChannels(state, services.find(row => row.id === id)).map(row => row.id) : []); reset(); }}/></Field><OnboardingScenarioControl disabled={busy} onConnected={reset}/></div>
      {!ops.can && <Notice error>当前没有试调用或发布权限，可查看配置。</Notice>}{unsaved && <Notice error>请先保存或取消当前服务修改，再执行试调用。</Notice>}
      {model.type === 'audio' && <Field label="语音测试任务"><Choice label="平台语音测试任务" value={audioProbe || 'unselected'} options={[[ 'unselected', '请选择语音测试任务' ], ['speech', '语音合成'], ['transcription', '语音识别']]} disabled={busy} onChange={value => { setAudioProbe(value === 'unselected' ? '' : value); reset(); }}/></Field>}
      {scoped ? <div className="onboarding-trial-scope">
        <section className="ss-change-section"><Typography.Title heading={6}>客户范围</Typography.Title><Typography.Paragraph>{model.openScope === 'all' ? '全部客户' : tenants.filter(row => tenantIds.includes(row.id)).map(row => row.name).join('、') || '当前没有可用客户'} · {tenantIds.length} 个客户</Typography.Paragraph></section>
        <section className="ss-change-section"><Typography.Title heading={6}>本次允许供给</Typography.Title><Table pagination={false} rowKey="id" scroll={{x:640}} empty="尚无生效路由渠道，请返回服务配置。" columns={['服务商 / 渠道', '上游模型标识', '路由方式','操作'].map((title,index)=>({title,render:(_,row)=>row['c'+index]}))} dataSource={rows.map(row => ({id:row.id,c0: <>{row.supply?.provider?.name}<small>{row.supply?.endpoint?.name}</small></>,c1: <><code>{row.association?.upstreamModelId}</code></>,c2: <>{plan?.candidate.route.config?.strategy==='fixed' || rows.length===1?'单渠道':`优先级 ${row.route.priority} / 权重 ${row.route.weight}`}</>,c3: <><Button htmlType="button" theme="borderless" disabled={busy || !ops.can || !row.association} onClick={()=>setTestingRow(row)}>检查供给</Button></>}))}/></section>
      </div> : <>
      <section className="ss-change-section"><Typography.Title heading={6}>客户范围</Typography.Title><div className="ss-change-actions"><span>已选 {tenantIds.length} 个租户</span><Button htmlType="button" theme="borderless" disabled={busy || !tenants.length} onClick={() => { setTenantIds(tenants.map(tenant => tenant.id)); reset(); }}>选择全部租户</Button><Button htmlType="button" theme="borderless" disabled={busy || !tenantIds.length} onClick={() => { setTenantIds([]); reset(); }}>清空</Button></div><div className="ss-trial-tenant-scroll"><Table pagination={false} rowKey="id" scroll={{x:640}} empty="尚无可选择的租户。" columns={['选择', '租户', '状态'].map((title,index)=>({title,render:(_,row)=>row['c'+index]}))} dataSource={tenants.map(tenant => ({id:tenant.id,c0: <><Checkbox aria-label={`授权租户 ${tenant.name}`} checked={tenantIds.includes(tenant.id)} disabled={busy} onChange={event => { const checked=event.target.checked; setTenantIds(current => checked === true ? [...current, tenant.id] : current.filter(id => id !== tenant.id)); reset(); }}/></>,c1: <>{tenant.name}<small><code>{tenant.id}</code></small></>,c2: <>{tenant.status || '—'}</>}))}/></div></section>
      <section className="ss-change-section"><Typography.Title heading={6}>允许供给</Typography.Title><div className="ss-change-actions"><Button htmlType="button" theme="borderless" disabled={busy || !rows.length} onClick={() => { setSupplyIds(rows.map(row => row.id)); reset(); }}>全选生效路由渠道</Button><Button htmlType="button" theme="borderless" disabled={busy || !supplyIds.length} onClick={() => { setSupplyIds([]); reset(); }}>清空</Button></div><Table pagination={false} rowKey="id" scroll={{x:900}} empty="当前生效路由中没有参与调度的渠道。" columns={['选择', '服务商 / 渠道', '上游模型标识', '优先级 / 权重', '当前检查', '操作'].map((title,index)=>({title,render:(_,row)=>row['c'+index]}))} dataSource={rows.map(row => ({id:row.id,c0: <><Checkbox aria-label={`选择允许供给 ${row.supply?.provider?.name || row.id} ${row.supply?.endpoint?.name || ''}`} checked={supplyIds.includes(row.id)} disabled={busy} onChange={event => { const checked=event.target.checked; setSupplyIds(current => checked === true ? [...current, row.id] : current.filter(id => id !== row.id)); reset(); }}/></>,c1: <>{row.supply?.provider?.name || '服务商已不存在'}<small>{row.supply?.endpoint?.name || row.supply?.endpointId || '渠道已不存在'}</small></>,c2: <><code title={row.association?.upstreamModelId}>{row.association?.upstreamModelId || '待关联'}</code></>,c3: <>{row.route.priority} / {row.route.weight}</>,c4: <>{row.association?.health?.result || '未记录'}<small>{row.association?.health?.source === 'server-receipt' ? '上游调用检查' : '配置检查'}</small></>,c5: <><div className="ss-change-actions"><Button theme="borderless" disabled={busy || !ops.can || !row.association} onClick={() => setTestingRow(row)}>测试</Button><Button theme="borderless" disabled={busy || !ops.can || !row.association} onClick={() => ops.go({provider:row.supply.provider.id,association:row.association.id,returnTo:location.hash},{base:'model-costs',reset:true})}>采购价</Button><Button theme="borderless" disabled={busy || !ops.can} onClick={() => ops.proceed(() => { close(); ops.go({ provider: row.supply.provider.id, perspective: 'suppliers', tab: 'catalogue', resource: row.supply.endpoint.id, origin: location.hash }, { base: 'providers' }); })}>维护供给</Button></div></>}))}/></section>
      </>}
      {plan && <Descriptions data={[{key:<>对外调用标识</>,value:<><code>{plan.candidate.publicModelId}</code></>},{key:<>验证范围</>,value:<>{plan.candidate.bindings.length} 条供给，{tenantIds.length} 个客户</>},{key:<>平台售价</>,value:<>{'技术验证不要求售价'}</>},{key:<>能力检查</>,value:<>{plan.candidate.capabilities.length ? plan.candidate.capabilities.join('、') : '基础调用'}</>}]}/>}
      {blocker && <Notice error>{blocker}</Notice>}
      {recovered && <Notice>已有当前配置的有效验证结果，可核对后继续，无需重复产生用量。<Button htmlType="button" theme="borderless" onClick={()=>{setReceipt(recovered);onValidated?.(recovered);setPhase('已恢复通过的验证');}}>恢复已通过的验证</Button></Notice>}
      <Checkbox checked={consent} disabled={busy} onChange={event => { const checked=event.target.checked; return setConsent(checked === true)}}>确认平台试调用产生上游用量，费用以实际返回为准</Checkbox>
      {expensive && <Checkbox checked={confirmExpensive} disabled={busy} onChange={event => { const checked=event.target.checked; return setConfirmExpensive(checked === true)}}>确认执行{model.type === 'image' ? '图片' : model.type === 'video' ? '视频' : '语音'}任务，可能产生上游费用</Checkbox>}
      <div className="ss-change-actions"><Button htmlType="button" disabled={!ops.can || unsaved || busy || !consent || !plan || expensive && !confirmExpensive} onClick={trial}>{busy ? `${phase}…` : '验证当前服务'}</Button><span role="status" aria-live="polite">{!busy && phase}</span></div>
      {error && <Notice error>{String(redactDiagnostic(error.message))}{error.code && <small>错误代码：{error.code}</small>}{error.traceId && <small>追踪 ID：{error.traceId}</small>}</Notice>}
      {pendingReceipt && <Button htmlType="button" theme="light" disabled={!ops.can || busy || unsaved} onClick={async ()=>await recordPublication(pendingReceipt.published,pendingReceipt.captured)}>同步发布验证记录</Button>}
      {changed && <Notice error>服务、路由、价格、供给或客户范围已变化，请重新试调用。</Notice>}
      {receipt && <section className="ss-change-section"><Typography.Title heading={6}>平台试调用结果</Typography.Title><Descriptions data={[{key:<>验证来源</>,value:<>平台试调用</>},{key:<>追踪 ID</>,value:<><code>{receipt.result.traceId}</code></>},{key:<>实际供给</>,value:<>{actualRow?.supply?.provider?.name || receipt.result.actualSupply?.providerId || '未知'}<small>{actualRow?.supply?.endpoint?.name || receipt.result.actualSupply?.channelId || '渠道未知'} · {receipt.result.actualSupply?.upstreamModelId || '上游模型未知'}</small></>},{key:<>用量</>,value:<>{receipt.result.usage ? <code>{JSON.stringify(receipt.result.usage)}</code> : '用量未知'}</>},{key:<>采购成本</>,value:<>{platformFeeDisplay(receipt.result.cost)}</>},{key:<>销售费用</>,value:<>不适用<small>{receipt.result.customerDebited === false ? '未扣客户额度' : '客户扣费状态未知'}</small></>}]}/>{!receipt.result.cost && <Notice>成本待核算，技术验证结果保持有效。</Notice>}<Collapse><Collapse.Panel itemKey="details" header={<>调用详情</>}><pre>{safe(receipt.result)}</pre></Collapse.Panel></Collapse></section>}
      {confirmPublish && <Notice>将使本次验证的服务配置生效，请核对供给、客户范围和计费结果。</Notice>}

    </div>;
  return embedded ? <section className="onboarding-platform" aria-label="平台试调用">{body}<footer className="onboarding-footer">{footer}</footer></section> : <Modal wide title={review?"验证当前配置":"平台试调用"} description={model.name} footer={footer} onClose={() => { if (!busy) close(); }}>{body}</Modal>;
}
