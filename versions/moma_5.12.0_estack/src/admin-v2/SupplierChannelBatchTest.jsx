import { resolveChannelAssociationModel } from './channel-association-model';
import { channelServiceParameters } from './channel-service-context';
import { channelEnableConfirmationIssue, prepareChannelEnableConfirmation } from './channel-enable-confirmation';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../components/ui/button';
import SupplierCreationDialog from './SupplierCreationDialog';
import { Choice, Field } from './ModelMetadataForm';
import { GridTable, Row, Cell, Modal, Notice } from './ModelOperationsUI';
import { supplierChannelAssociations } from './supplier-resources';
import { channelCheckCurrent, channelInterfaceIssue } from './provider-channels';
import { SupplierKeyGroupField } from './SupplierKeyGroupField';
import { connectionCredentialsReady, connectionFingerprint, connectionTestPassed } from './connection-state';
import { prepareServerChannel, onboardingApi } from './onboarding-client';
import OnboardingScenarioControl from './OnboardingScenarioControl';
import { CHANNEL_TEST_STATUS, channelBatchRunning, channelBatchTerminal, channelBatchProgress, channelTestItem, channelTestModels, channelTestRequest, recentChannelTestJob } from './channel-test-jobs';

const showUsage = value => value === null || value === undefined ? '未知' : JSON.stringify(value);

export default function SupplierChannelBatchTest({ state, provider, endpointId, associationIds, ops, close, navigation }) {
  const endpoint = state.endpoints.find(row => row.id === endpointId);
  const rows = supplierChannelAssociations(state, provider, endpointId).filter(row => associationIds.includes(row.id));
  const records = rows.map(row => { let master; try { master = resolveChannelAssociationModel(state, provider, row); } catch { /* The plan reports the missing identity without guessing a match. */ } return { associationId: row.id, modelId: master?.id, upstreamModelId: row.upstreamModelId, type: master?.type }; });
  const restored = recentChannelTestJob(endpoint?.serverTestJobs, associationIds);
  const [job, setJob] = useState(restored), [batch, setBatch] = useState(null);
  const [selected, setSelected] = useState([]), [confirmation, setConfirmation] = useState(null), [check, setCheck] = useState(restored?.check || '');
  const [expensiveIds, setExpensiveIds] = useState([]), [audioProbes, setAudioProbes] = useState({}), [plannedIds, setPlannedIds] = useState(null), [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [pollRevision, setPollRevision] = useState(0), [details, setDetails] = useState(null), [notSubmitted, setNotSubmitted] = useState(false), [receiptFailed, setReceiptFailed] = useState(false);
  const mounted = useRef(true), pending = useRef(false), receiptAttempts = useRef(new Set()), opsRef = useRef(ops); opsRef.current = ops;
  const activeJob = job || restored;
  const signature = connectionFingerprint(endpoint), ready = connectionCredentialsReady(endpoint, provider);
  const passed = row => connectionTestPassed(endpoint) && channelCheckCurrent(row) && row.health?.result === '通过' && !channelInterfaceIssue(provider, row);
  const running = channelBatchRunning(batch), unresolved = Boolean(activeJob && !activeJob.batchId), stale = activeJob && activeJob.signature !== signature;
  const confirming = Boolean(confirmation), confirmationIssue = confirming ? channelEnableConfirmationIssue(state, confirmation) : '';
  const selectedReady = selected.length > 0 && selected.every(id => rows.some(row => row.id === id && passed(row)));
  const progress = channelBatchProgress(batch);
  let plannedModels = [], planError = '';
  try { plannedModels = channelTestModels(records, { check, expensiveIds, audioProbes, plannedIds }); } catch (issue) { planError = issue.message; }
  const recordJob = record => opsRef.current.run('channelTestEvidenceJob', { providerId: provider.id, endpointId, ...record });
  const receive = (result, trackedJob) => {
    if (!channelBatchTerminal(result) || trackedJob.receivedAt || receiptAttempts.current.has(result.id)) return;
    const saved = opsRef.current.run('channelTestEvidenceReceipt', { providerId: provider.id, endpointId, batch: result });
    if (!saved) setReceiptFailed(true); else { receiptAttempts.current.add(result.id); setReceiptFailed(false); }
  };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!activeJob?.batchId) return;
    let stopped = false, timer; const controller = new AbortController();
    const poll = async () => {
      try {
        const result = await onboardingApi(`/tests/${encodeURIComponent(activeJob.batchId)}`, { signal: controller.signal });
        if (stopped) return;
        setBatch(result); setError(''); receive(result, activeJob);
        if (channelBatchRunning(result)) timer = setTimeout(poll, 800);
      } catch (issue) { if (!stopped && issue.name !== 'AbortError') setError(`读取任务失败：${issue.message}。可刷新进度，关闭不会取消后台任务。`); }
    };
    poll();
    return () => { stopped = true; clearTimeout(timer); controller.abort(); };
  }, [activeJob?.batchId, pollRevision]);

  const submitRequest = async tracked => {
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const result = await onboardingApi('/tests', { method: 'POST', body: tracked.request, signal: controller.signal });
      if (!mounted.current) return;
      const completed = { ...tracked, batchId: result.id };
      setJob(completed); setBatch(result); setNotSubmitted(false); setConsent(false);
      if (!recordJob(completed)) setError('后台任务已提交，本地记录未保存；请保持当前页面并载入最新数据后恢复。');
    } catch (issue) { if (mounted.current) setError(issue.name === 'AbortError' ? '提交结果待确认，请查询原提交；不会重新创建任务。' : `${issue.message}。请查询原提交确认结果。`); }
    finally { clearTimeout(timeout); }
  };
  const start = async () => {
    if (pending.current || confirming || !consent || !plannedModels.length) return;
    pending.current = true; setBusy(true); setError(''); setSelected([]); setConfirmation(null); setNotSubmitted(false);
    try {
      const serverChannel = await prepareServerChannel(provider, endpoint);
      const request = channelTestRequest(serverChannel.id, plannedModels, { check });
      const tracked = { operationId: request.operationId, batchId: '', signature, serverChannelId: serverChannel.id, associationIds: plannedModels.map(row => row.associationId), request, check, createdAt: new Date().toISOString() };
      if (!recordJob(tracked)) throw new Error('任务提交信息未保存，请处理本地保存问题后继续');
      setJob(tracked); setBatch(null); await submitRequest(tracked);
    } catch (issue) { if (mounted.current) setError(issue.message); }
    finally { pending.current = false; if (mounted.current) setBusy(false); }
  };
  const querySubmission = async () => {
    if (!activeJob?.operationId || pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try {
      const result = await onboardingApi(`/tests?operationId=${encodeURIComponent(activeJob.operationId)}`);
      if (!mounted.current) return;
      const completed = { ...activeJob, batchId: result.id }; setJob(completed); setBatch(result); setNotSubmitted(false);
      if (!recordJob(completed)) setError('已找到后台任务，本地记录未保存，请处理保存冲突后重试。');
    } catch (issue) { if (mounted.current) { setNotSubmitted(issue.code === 'submission_not_found'); setError(issue.code === 'submission_not_found' ? '服务端确认未找到此提交。可明确继续原提交，操作 ID 保持不变。' : issue.message); } }
    finally { pending.current = false; if (mounted.current) setBusy(false); }
  };
  const resumeOriginal = async () => {
    if (pending.current || !activeJob?.request || !notSubmitted) return;
    pending.current = true; setBusy(true); setError('');
    try { await submitRequest(activeJob); } finally { pending.current = false; if (mounted.current) setBusy(false); }
  };
  const cancelTask = async () => {
    if (!activeJob?.batchId || busy) return;
    setBusy(true); setError('');
    try { await onboardingApi(`/tests/${encodeURIComponent(activeJob.batchId)}/cancel`, { method: 'POST', body: { operationId: crypto.randomUUID() } }); setPollRevision(value => value + 1); }
    catch (issue) { setError(issue.message); }
    finally { if (mounted.current) setBusy(false); }
  };
  const planRetry = ids => { setPlannedIds(ids); setConsent(false); setConfirmation(null); setError(''); };
  const failedIds = rows.filter(row => { const item = channelTestItem(batch, row.id); return item ? ['failed', 'unknown', 'cancelled'].includes(item.status) : !passed(row); }).map(row => row.id);
  const canPlan = !busy && !running && !unresolved && !confirming;
  const enable = () => {
    setError('');
    if (!confirmation) {
      try { setConfirmation(prepareChannelEnableConfirmation(state, provider.id, endpointId, selected)); }
      catch (issue) { setError(issue.message); }
      return;
    }
    const issue = channelEnableConfirmationIssue(state, confirmation);
    if (issue) { setError(issue); return; }
    if (opsRef.current.run('supplierSelection', { action: 'enable', selections: confirmation.selections, confirmed: true })) { setSelected([]); setConfirmation(null); }
  };
  return <SupplierCreationDialog title="测试与启用" description="配置已保存，测试后明确选择要启用的模型。" cancel={close} cancelLabel="关闭" disabled={!ops.can || busy || running || unresolved || (confirming ? Boolean(confirmationIssue) : !selectedReady) || provider.status !== '已启用'} action={confirming ? confirmation.restoring ? '确认启用渠道及所选' : '确认启用所选' : ['停用', '已停用'].includes(endpoint?.status) ? '启用渠道并启用所选' : '启用所选'} submit={enable} footer={<>{confirming && <Button type="button" variant="outline" onClick={() => { setConfirmation(null); setSelected([]); setError(''); }}>重新选择</Button>}<Button type="button" variant="outline" disabled={!ops.can || busy || running || unresolved || confirming || !failedIds.length} onClick={() => planRetry(failedIds)}>重试未通过项</Button></>}>
    <ol className="supplier-onboarding-steps" aria-label="接入步骤">{['配置连接', '选择模型', '测试与启用'].map((label, index) => <li key={label} aria-current={index === 2 ? 'step' : undefined}><span>{index + 1}</span>{label}</li>)}</ol>{navigation}
    <div className="supplier-onboarding-context"><strong>{provider.name}</strong><span>{endpoint?.name}</span><span role="status">{batch ? `通过 ${progress.passed}／失败 ${progress.failed}／排队 ${progress.queued}／测试中 ${progress.running}／未知 ${progress.unknown}／取消 ${progress.cancelled}` : `通过 ${rows.filter(passed).length} / ${rows.length}`}</span><OnboardingScenarioControl disabled={busy || running || confirming}/></div>
    {['group', 'inherit'].includes(endpoint?.authMode) && <SupplierKeyGroupField fixed ops={ops} state={state} provider={provider} value={endpoint.authMode === 'group' ? endpoint.keyGroupId : 'default'} disabled={!ops.can || busy || running || confirming} onChange={() => {}}/>}
    {!ready && <Notice error>渠道缺少可用 API 密钥，请添加密钥后重新测试。</Notice>}
    <>
      <div className="supplier-channel-fields"><Field label="验证内容"><Choice label="验证内容" value={check || 'basic'} options={[[ 'basic', '基础调用' ], ['streaming', '流式响应'], ['tools', '工具调用'], ['structured', '结构化输出']]} disabled={!canPlan || !ops.can} onChange={value => { setCheck(value === 'basic' ? '' : value); setPlannedIds(null); setConsent(false); }}/></Field><div className="supplier-row-actions"><span>本次 {plannedModels.length} 个模型，预估费用未知</span>{plannedIds && <Button type="button" variant="link" disabled={!canPlan} onClick={() => planRetry(null)}>选择全部可测试模型</Button>}</div></div>
      <details><summary>高成本任务</summary><div className="supplier-reference-options">{records.filter(row => ['image', 'video', 'audio'].includes(row.type)).map(row => <div key={row.associationId}><label><input type="checkbox" aria-label={`测试高成本任务 ${row.upstreamModelId}`} checked={expensiveIds.includes(row.associationId)} disabled={!canPlan || !ops.can} onChange={event => { setExpensiveIds(current => event.target.checked ? [...current, row.associationId] : current.filter(id => id !== row.associationId)); setConsent(false); }}/>{row.upstreamModelId}</label>{row.type === 'audio' && <Choice label={`${row.upstreamModelId} 语音测试任务`} value={audioProbes[row.associationId] || 'unselected'} options={[[ 'unselected', '选择语音任务' ], ['speech', '语音合成'], ['transcription', '语音识别']]} disabled={!canPlan || !expensiveIds.includes(row.associationId)} onChange={value => { setAudioProbes(current => ({ ...current, [row.associationId]: value })); setConsent(false); }}/>}</div>)}</div><p className="supplier-price-hint">图片、语音和视频须单独勾选；测试可能产生上游费用。</p></details>
      {planError && <Notice error>{planError}</Notice>}
      {canPlan && <div className="supplier-row-actions"><label><input type="checkbox" aria-label="确认产生上游用量" checked={consent} disabled={!ops.can || !ready || !plannedModels.length} onChange={event => setConsent(event.target.checked)}/>确认本次测试产生上游用量，费用未知</label><Button type="button" disabled={!ops.can || !ready || !consent || !plannedModels.length || Boolean(planError)} onClick={start}>开始测试</Button></div>}
      {unresolved && <div className="supplier-row-actions"><span>原提交结果待确认，尚未重新派发。</span><Button type="button" variant="outline" disabled={busy} onClick={querySubmission}>查询原提交</Button>{notSubmitted && <Button type="button" variant="outline" disabled={busy} onClick={resumeOriginal}>继续原提交</Button>}</div>}
      {activeJob?.batchId && <div className="supplier-row-actions"><code>任务 {activeJob.batchId}</code><Button type="button" variant="link" disabled={busy} onClick={() => setPollRevision(value => value + 1)}>刷新进度</Button>{running && <Button type="button" variant="outline" disabled={busy} onClick={cancelTask}>取消待执行测试</Button>}</div>}
      {stale && <Notice>此任务针对旧配置，结果仅保留在检查记录中。当前配置需要重新测试。</Notice>}
      {receiptFailed && <Notice error>后台结果已取得，本地检查记录未保存。<Button type="button" variant="link" onClick={() => { receiptAttempts.current.delete(batch.id); receive(batch, activeJob); }}>重新保存检查记录</Button></Notice>}
    </>
    <GridTable headings={['选择启用', '上游模型 ID', '验证结果', '启用状态', '采购价', '操作']}>
      {rows.map(row => { const item = channelTestItem(batch, row.id); return <Row key={row.id}><Cell><input type="checkbox" aria-label={`选择启用 ${row.upstreamModelId}`} checked={selected.includes(row.id)} disabled={!ops.can || busy || running || unresolved || confirming || !passed(row) && !selected.includes(row.id)} onChange={event => { setSelected(current => event.target.checked ? [...current, row.id] : current.filter(id => id !== row.id)); setConfirmation(null); }}/></Cell><Cell><code>{row.upstreamModelId}</code></Cell><Cell>{channelInterfaceIssue(provider, row) || (item ? CHANNEL_TEST_STATUS[item.status] || '结果未知' : passed(row) ? '通过' : row.health?.message || '待测试')}</Cell><Cell>{row.enabled && endpoint.status === '运行中' ? '已启用' : '未启用'}</Cell><Cell>{row.pricing?.scenarios?.length ? '已配置' : '待配置'}</Cell><Cell><div className="supplier-row-actions"><Button type="button" variant="link" disabled={!ops.can || !ready || busy || running || unresolved || confirming} onClick={() => planRetry([row.id])}>选择重测</Button>{item && <Button type="button" variant="link" onClick={() => setDetails(item)}>检查详情</Button>}</div></Cell></Row>; })}
    </GridTable>
    {confirming && <Notice>将启用渠道及所选 {confirmation.selections.length} 个模型。{confirmation.restoring && '未选模型保持停用。'}采购价待配置的模型暂不能用于正式服务。</Notice>}
    {confirming && confirmation.restoring && confirmation.serviceImpact.length > 0 && <div className="supplier-batch-confirmation"><p>可能恢复 {confirmation.serviceImpact.length} 项已发布服务：</p><ul>{confirmation.serviceImpact.map(service => <li key={service.id}><strong>{service.name}</strong> · <code>{service.callId}</code> · 路由 v{service.routeVersion}</li>)}</ul></div>}
    {confirmationIssue && <Notice error>{confirmationIssue}</Notice>}
    {provider.status !== '已启用' && <Notice error>供应商已停用，请先启用供应商。</Notice>}
    {error && <Notice error>{error}</Notice>}{ops.error && <Notice error>{ops.error}</Notice>}
    <Button type="button" variant="link" onClick={() => { const context = channelServiceParameters({ providerId: provider.id, endpointId, associationIds, origin: location.hash }); let master; try { if (rows[0]) master = resolveChannelAssociationModel(state, provider, rows[0]); } catch { /* The retained selection can be repaired in service configuration. */ } const model = master && state.models.find(item => item.id === master.id || item.templateId === master.id); close(); ops.go({ ...context, model: model?.id || null }, { base: 'listing' }); }}>前往服务管理</Button>
    {details && <Modal title="检查详情" description={details.model.upstreamModelId} onClose={() => setDetails(null)}><dl className="supplier-test-details"><dt>状态</dt><dd>{CHANNEL_TEST_STATUS[details.status] || '结果未知'}</dd><dt>请求阶段</dt><dd>{({ queued: '等待执行', request: '请求上游', parse: '响应解析', poll: '等待异步任务', artifact: '结果文件检查' })[details.stage] || '未记录'}</dd><dt>建议</dt><dd>{details.suggestion || (details.status === 'passed' ? '无需处理' : details.message || '请核对配置后重试')}</dd>{details.retryAfter != null && <><dt>建议等待</dt><dd>{details.retryAfter} 秒</dd></>}<dt>验证内容</dt><dd>{({ streaming: '流式响应', tools: '工具调用', structured: '结构化输出', text: '文本生成', multimodal: '图像理解', embedding: '向量', rerank: '重排', image: '图片生成', video: '视频生成', speech: '语音合成', transcription: '语音识别' })[details.model.check || details.model.probe || details.model.type] || '任务检查'}</dd><dt>上游状态</dt><dd>{details.upstreamStatus ?? '—'}</dd><dt>耗时</dt><dd>{details.durationMs == null ? '—' : `${details.durationMs} ms`}</dd><dt>用量</dt><dd>{showUsage(details.usage)}</dd><dt>费用</dt><dd>{showUsage(details.cost)}</dd>{details.upstreamRequestId && <><dt>上游请求 ID</dt><dd>{details.upstreamRequestId}</dd></>}<dt>追踪 ID</dt><dd><code>{details.traceId}</code></dd>{details.taskId && <><dt>上游任务 ID</dt><dd><code>{details.taskId}</code></dd></>}{details.message && <><dt>检查结果</dt><dd>{details.message}</dd></>}</dl></Modal>}
  </SupplierCreationDialog>;
}
