import { offerKey } from '../service-access.mjs';
import Table from './AdminTable';
import AdminCollapsePanel from './AdminCollapsePanel';
import SupplierChannelBatchTest from './SupplierChannelBatchTest';
import { useEffect, useRef, useState } from 'react';
import { Button, Checkbox, Typography, Descriptions, Collapse } from '@douyinfe/semi-ui';
import {Choice, Field} from './ServiceUI';
import { Modal, Notice } from './ServiceUI';
import { displayTime } from './model-management';
import OnboardingScenarioControl from './OnboardingScenarioControl';
import { platformAllowedChannels, platformCandidatePlan, platformFeeDisplay, platformServices, publishPlatformCandidate, runPlatformTrial, recoverPlatformTrial } from './platform-service-client';
import { redactDiagnostic } from './channel-selection';
import { getMockServiceSnapshots } from './mock-onboarding-service';
import { serviceLifecycle } from './service-workspace';

const safe = value => JSON.stringify(redactDiagnostic(value), null, 2);

export function PlatformTrialDialog({ state, model, ops, providerId, onPublished, close }) {
  const services = platformServices(state, model);
  const initialService = services.find(row => offerKey(row) === (providerId || '')) || services[0];
  const [serviceId, setServiceId] = useState(() => initialService?.id || '');
  const [audioProbe, setAudioProbe] = useState('');
  const tenants = (state.tenants || []).filter(row => !['已删除', '已停用', '停用'].includes(row.status));
  const [tenantIds] = useState(() => tenants.map(row => row.id)), [supplyIds, setSupplyIds] = useState(() => platformAllowedChannels(state, initialService).map(row => row.id)), [confirmExpensive, setConfirmExpensive] = useState(false), [consent, setConsent] = useState(false);
  const [phase, setPhase] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(null), [testingRow, setTestingRow] = useState(null), [server, setServer] = useState(null), [receipt, setReceipt] = useState(null);
  const [pendingReceipt,setPendingReceipt]=useState(null);
  const service = services.find(row => row.id === serviceId);
  const historical=getMockServiceSnapshots().find(row=>row.published?.config.publicModelId===service?.callId || row.candidate.publicModelId===service?.callId);
  const visibleServer=server?.candidate?.publicModelId===service?.callId?server:historical;
  const publication=visibleServer?.published || historical?.published;
  const rows = platformAllowedChannels(state, service);
  let plan, blocker;
  try { plan = platformCandidatePlan(state, model, { serviceId, tenantIds, supplyIds, audioProbe, technical: true }); } catch (issue) { blocker = issue.message; }
  const recovered = !receipt && plan ? recoverPlatformTrial(plan) : null;
  const fingerprint = plan?.fingerprint || '';
  const unsaved = Boolean(ops.hasUnsaved?.());
  const latest = useRef(null); latest.current = { fingerprint, can: ops.can, unsaved };
  const mounted = useRef(false);
  useEffect(() => {mounted.current = true; return () => {mounted.current = false;};}, []);
  const passed = Boolean(receipt && receipt.fingerprint === fingerprint && receipt.result.technicalReady && receipt.result.candidateVersion === receipt.service.candidateVersion);
  const changed = Boolean(receipt && receipt.fingerprint !== fingerprint);
  const expensive = ['image', 'video', 'audio'].includes(model.type);
  const actualBinding = receipt?.service?.candidate?.bindings?.find(binding => binding.channelId === receipt.result.actualSupply?.channelId);
  const actualRow = rows.find(row => row.id === actualBinding?.id);
  const reset = () => { setError(null); setConfirmExpensive(false); setConsent(false); };
  const trial = async () => {
    if (!plan || !ops.can || busy || !consent || unsaved) return;
    const captured = plan;
    setBusy(true); setError(null); setReceipt(null); setPendingReceipt(null);
    try {
      const tested = await runPlatformTrial(captured, { confirmExpensive, isCurrent: () => mounted.current && ops.isCurrent() && latest.current.fingerprint === captured.fingerprint && latest.current.can && !latest.current.unsaved, onProgress: setPhase, onCandidate: setServer });
      setReceipt(tested); setPhase(tested.result.technicalReady ? '平台试调用通过' : '调用完成，计量或费用未知');
    } catch (issue) { setPhase('试调用未通过'); setError({ message: issue.message, code: issue.code, traceId: issue.traceId }); }
    finally { setBusy(false); }
  };
  const recordPublication=async (published,captured)=>{
    const saved=await ops.run('recordPlatformPublication',{serviceId:captured.serviceId,mockServiceId:published.id,publishedVersion:published.published.version,expectedFingerprint:captured.publicationFingerprint},model.id,true);
    if(!saved){setPendingReceipt({published,captured});setError({message:'平台配置已发布，本地验证记录尚未保存。处理保存问题后可同步记录，无需重复试调用。'});return false;}
    setPendingReceipt(null);setError(null);setReceipt(null);setPhase('配置已发布');
    onPublished?.(published,{fingerprint:captured.fingerprint,candidate:captured.service.candidate});
    return true;
  };
  const publish = async () => {
    if (!passed || !ops.can || busy || unsaved || pendingReceipt) return;
    const captured = receipt;
    setBusy(true); setError(null); setPhase('发布验证后的配置');
    try {
      if (!ops.isCurrent() || latest.current.fingerprint !== captured.fingerprint || !latest.current.can || latest.current.unsaved) throw new Error('当前配置或权限已变化，请重新试调用');
      const published = await publishPlatformCandidate(captured.service);
      setServer(published);await recordPublication(published,captured);
    } catch (issue) { setError({ message: issue.message, code: issue.code, traceId: issue.traceId }); }
    finally { setBusy(false); }
  };
  if (testingRow) return <SupplierChannelBatchTest state={state} provider={state.providers.find(row => row.id === testingRow.supply.provider.id)} endpointId={testingRow.supply.endpoint.id} associationIds={[testingRow.association.id]} ops={ops} close={() => setTestingRow(null)}/>;
  const footer = <><Button htmlType="button" theme="light" disabled={busy} onClick={close}>退出试调用</Button><Button htmlType="button" disabled={!ops.can || unsaved || !passed || busy || Boolean(pendingReceipt)} onClick={publish}>保存验证结果</Button></>;
  const body = <div className="ss-change-dialog">
      <Notice>试调用使用模拟请求。用量与费用为试算结果。</Notice>
      <Descriptions data={[{key:<>上架状态</>,value:<>{serviceLifecycle(model)}</>},{key:<>验证配置</>,value:<>{passed?'验证通过':visibleServer?'等待验证':'待验证'}<small>{publication ? `上次验证生效：${displayTime(publication.publishedAt)}` : '尚无有效验证记录'}</small></>}]}/>
      <div className="ss-change-fields"><Field label="调用服务"><Choice label="平台试调用服务" value={service ? serviceId : 'unselected'} options={[...(!service ? [['unselected', services.length ? '请选择当前服务' : '请先配置服务模式']] : []), ...services.map(row => [row.id, `${row.name} · ${row.callId || '调用 ID 待配置'}`])]} disabled={busy || !services.length} onChange={id => { setServiceId(id); setSupplyIds(platformAllowedChannels(state, services.find(row => row.id === id)).map(row => row.id)); reset(); }}/></Field><OnboardingScenarioControl disabled={busy} onConnected={reset}/></div>
      {!ops.can && <Notice error>当前没有试调用或发布权限，可查看配置。</Notice>}{unsaved && <Notice error>请先保存或取消当前服务修改，再执行试调用。</Notice>}
      {model.type === 'audio' && <Field label="语音测试任务"><Choice label="平台语音测试任务" value={audioProbe || 'unselected'} options={[[ 'unselected', '请选择语音测试任务' ], ['speech', '语音合成'], ['transcription', '语音识别']]} disabled={busy} onChange={value => { setAudioProbe(value === 'unselected' ? '' : value); reset(); }}/></Field>}
      <div className="onboarding-trial-scope">
        <section className="ss-change-section"><Typography.Title heading={6}>本次允许供给</Typography.Title><Table pagination={false} rowKey="id" scroll={{x:640}} empty="尚无生效路由渠道，请返回服务配置。" columns={['服务商 / 渠道', '上游模型标识', '路由方式','操作'].map((title,index)=>({title,render:(_,row)=>row['c'+index]}))} dataSource={rows.map(row => ({id:row.id,c0: <>{row.supply?.provider?.name}<small>{row.supply?.endpoint?.name}</small></>,c1: <><code>{row.association?.upstreamModelId}</code></>,c2: <>{row.route.backup?'故障转移备用':model.serviceMode==='provider'?'主渠道':rows.length===1?'单渠道':`优先级 ${row.route.priority} / 权重 ${row.route.weight}`}</>,c3: <><Button htmlType="button" theme="borderless" disabled={busy || !ops.can || !row.association} onClick={()=>setTestingRow(row)}>检查供给</Button></>}))}/></section>
      </div>
      {plan && <Descriptions data={[{key:<>对外调用标识</>,value:<><code>{plan.candidate.publicModelId}</code></>},{key:<>验证范围</>,value:<>{plan.candidate.bindings.length} 条供给，{tenantIds.length} 个客户</>},{key:<>平台售价</>,value:<>{'技术验证不要求售价'}</>},{key:<>能力检查</>,value:<>{plan.candidate.capabilities.length ? plan.candidate.capabilities.join('、') : '基础调用'}</>}]}/>}
      {blocker && <Notice error>{blocker}</Notice>}
      {recovered && <Notice>已有当前配置的有效验证结果，可核对后继续，无需重复产生用量。<Button htmlType="button" theme="borderless" onClick={()=>{setReceipt(recovered);setPhase('已恢复通过的验证');}}>恢复已通过的验证</Button></Notice>}
      <Checkbox checked={consent} disabled={busy} onChange={event => { const checked=event.target.checked; return setConsent(checked === true)}}>确认执行模拟试调用</Checkbox>
      {expensive && <Checkbox checked={confirmExpensive} disabled={busy} onChange={event => { const checked=event.target.checked; return setConfirmExpensive(checked === true)}}>确认执行{model.type === 'image' ? '图片' : model.type === 'video' ? '视频' : '语音'}模拟任务</Checkbox>}
      <div className="ss-change-actions"><Button htmlType="button" disabled={!ops.can || unsaved || busy || !consent || !plan || expensive && !confirmExpensive} onClick={trial}>{busy ? `${phase}…` : '验证当前服务'}</Button><span role="status" aria-live="polite">{!busy && phase}</span></div>
      {error && <Notice error>{String(redactDiagnostic(error.message))}{error.code && <small>错误代码：{error.code}</small>}{error.traceId && <small>追踪 ID：{error.traceId}</small>}</Notice>}
      {pendingReceipt && <Button htmlType="button" theme="light" disabled={!ops.can || busy || unsaved} onClick={async ()=>await recordPublication(pendingReceipt.published,pendingReceipt.captured)}>同步发布验证记录</Button>}
      {changed && <Notice error>服务、路由、价格、供给或验证客户已变化，请重新试调用。</Notice>}
      {receipt && <section className="ss-change-section"><Typography.Title heading={6}>平台试调用结果</Typography.Title><Descriptions data={[{key:<>结果来源</>,value:<>{receipt.result.source === 'mock' ? '模拟试调用' : '未记录'}</>},{key:<>追踪 ID</>,value:<><code>{receipt.result.traceId}</code></>},{key:<>实际供给</>,value:<>{actualRow?.supply?.provider?.name || receipt.result.actualSupply?.providerId || '未知'}<small>{actualRow?.supply?.endpoint?.name || receipt.result.actualSupply?.channelId || '渠道未知'} · {receipt.result.actualSupply?.upstreamModelId || '上游模型未知'}</small></>},{key:<>用量</>,value:<>{receipt.result.usage ? <code>{JSON.stringify(receipt.result.usage)}</code> : '用量未知'}</>},{key:<>采购成本</>,value:<>{platformFeeDisplay(receipt.result.cost)}</>},{key:<>销售费用</>,value:<>不适用<small>{receipt.result.customerDebited === false ? '未扣客户额度' : '客户扣费状态未知'}</small></>}]}/>{!receipt.result.cost && <Notice>成本待核算，技术验证结果保持有效。</Notice>}<Collapse><AdminCollapsePanel itemKey="details" header={<>调用详情</>}><pre>{safe(receipt.result)}</pre></AdminCollapsePanel></Collapse></section>}

    </div>;
  return <Modal wide title="验证当前配置" description={model.name} footer={footer} onClose={() => { if (!busy) close(); }}>{body}</Modal>;
}
