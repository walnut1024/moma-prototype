import { useEffect, useRef, useState } from 'react';
import { Button, Checkbox, Typography } from '@douyinfe/semi-ui';
import { Choice, Field } from './ModelMetadataForm';
import { GridTable, Row, Cell, Notice } from './ModelOperationsUI';
import { candidateTestPlan } from './channel-change-management';
import { submitCandidateTest, recoverCandidateTest, cancelCandidateTest, candidateTestReceipt } from './candidate-tests';
import { prepareAuthorizedCandidateProbe, candidateProbeResumeIssue, candidateProbeResultCurrent } from './candidate-probe-start';
import { basicChannelUsageButton } from './channel-test-authorization';
import { channelBatchRunning, channelBatchTerminal, CHANNEL_TEST_STATUS, channelTestModels } from './channel-test-jobs';
import { connectionKeys } from './connection-state';
import OnboardingScenarioControl from './OnboardingScenarioControl';

export default function CandidateProbePanel({ state, context: inputContext, ops, beforeTest, initialRecords, startToken, onComplete, onBusyChange, pendingEdits = false, testLabel = '测试候选配置（产生用量）' }) {
  const provider = state.providers.find(row => row.id === inputContext.providerId), endpoint = state.endpoints.find(row => row.id === inputContext.endpointId);
  const [selectedKeyId, setSelectedKeyId] = useState('');
  const projected = { ...endpoint, ...endpoint?.candidateConfiguration?.config }, poolKeys = projected.authMode === 'pool' ? connectionKeys(projected, provider) : [];
  const keyId = poolKeys.find(key => key.id === selectedKeyId)?.id || poolKeys[0]?.id;
  const context = { ...inputContext, ...(keyId ? { keyId } : {}) };
  const saveBeforeTest = beforeTest ? async () => { const saved = await beforeTest(); return saved ? { ...saved, context: { ...saved.context, ...(keyId ? { keyId } : {}) } } : null; } : undefined;
  const jobs = (context.groupId ? provider?.keyGroupTestJobs : endpoint?.candidateTestJobs) || [];
  const restored = [...jobs].reverse().find(row => row.candidateId === context.candidateId && row.endpointId === context.endpointId && row.keyId === context.keyId);
  const [job, setJob] = useState(restored), [batch, setBatch] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [consent, setConsent] = useState(false), [check, setCheck] = useState(''), [expensiveIds, setExpensiveIds] = useState([]), [audioProbes, setAudioProbes] = useState({}), [revision, setRevision] = useState(0), [notSubmitted, setNotSubmitted] = useState(false);
  const active = job || restored, opsRef = useRef(ops), received = useRef(new Set()), pending = useRef(false), mounted = useRef(true), startedTokens = useRef(new Set()); opsRef.current = ops;
  const latest = useRef(null); latest.current = { state, context, beforeTest: saveBeforeTest, initialRecords, onComplete, onBusyChange };
  let plan, issue; try { plan = initialRecords ? { records: initialRecords } : candidateTestPlan(state, context); } catch (failure) { issue = failure.message; }
  let planned = [], planError = issue; try { if (plan) planned = channelTestModels(plan.records, { check, expensiveIds, audioProbes }); } catch (failure) { planError = failure.message; }
  const running = busy || channelBatchRunning(batch), unresolved = Boolean(active && !active.batchId);
  const basic = basicChannelUsageButton(planned, check);
  const record = async data => await opsRef.current.run(context.groupId ? 'keyGroupCandidateTestJob' : 'channelCandidateTestJob', data);
  const saveReceipt = async (tracked, result) => {
    if (!channelBatchTerminal(result) || tracked.receivedAt || received.current.has(result.id)) return;
    const receipt = candidateTestReceipt(tracked, result);
    const next = await opsRef.current.run(receipt.operation, receipt.data);
    if (next) { received.current.add(result.id); latest.current.onComplete?.({ state: next, batch: result, context: { providerId: tracked.providerId, endpointId: tracked.endpointId, candidateId: tracked.candidateId, ...(tracked.groupId ? { groupId: tracked.groupId } : {}) } }); }
    else setError('检查结果尚未保存，请处理保存冲突后刷新进度。');
  };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { latest.current.onBusyChange?.(running || unresolved); }, [running, unresolved]);
  useEffect(() => {
    if (!active?.batchId) return;
    let stopped = false, timer;
    const poll = async () => { try { const result = await recoverCandidateTest(active); if (stopped) return; setBatch(result); await saveReceipt(active, result); if (channelBatchRunning(result)) timer = setTimeout(poll, 700); } catch (failure) { if (!stopped) setError(failure.message); } };
    void poll(); return () => { stopped = true; clearTimeout(timer); };
  }, [active?.batchId, revision]);
  const submit = async tracked => { const saved = await submitCandidateTest(tracked); if (!mounted.current) return; setJob(saved); setBatch(saved.batch); if (!await record(saved)) setError('测试任务已提交，本地跟踪尚未保存，请查询原提交。'); setNotSubmitted(false); setConsent(false); };
  const start = async (explicitBasicClick = false) => {
    if (pending.current || running || unresolved || !opsRef.current.can || planError || !planned.length) return;
    pending.current = true; setBusy(true); setError('');
    try {
      const current = latest.current;
      const prepared = await prepareAuthorizedCandidateProbe(current.state, current.context, { check, expensiveIds, audioProbes }, { records: current.initialRecords, beforeTest: current.beforeTest, consent, explicitBasicClick });
      if (!prepared || !mounted.current || !opsRef.current.can || !await opsRef.current.run(prepared.operation, prepared.data)) return;
      setJob(prepared.data); setBatch(null); await submit(prepared.data);
    } catch (failure) { if (mounted.current) setError(failure.message); }
    finally { pending.current = false; if (mounted.current) setBusy(false); }
  };
  useEffect(() => { if (startToken && !startedTokens.current.has(startToken)) { startedTokens.current.add(startToken); if (basic && !planError) void start(true); } }, [startToken]);
  const query = async () => { setBusy(true); setError(''); try { const result = await recoverCandidateTest(active); const tracked = { ...active, batchId: result.id }; setJob(tracked); setBatch(result); await record(tracked); await saveReceipt(tracked, result); } catch (failure) { setNotSubmitted(failure.code === 'submission_not_found'); setError(failure.message); } finally { setBusy(false); } };
  const resume = async () => {
    if (pending.current || !opsRef.current.can || !notSubmitted) return;
    pending.current = true; setBusy(true); setError('');
    try { const current = latest.current, issue = candidateProbeResumeIssue(current.state, current.context, active); if (issue) throw new Error(issue); await submit(active); }
    catch (failure) { if (mounted.current) setError(failure.message); }
    finally { pending.current = false; if (mounted.current) setBusy(false); }
  };
  return <section className="supplier-change-section"><Typography.Title heading={5} component="h3">候选测试 · {endpoint?.name}</Typography.Title><OnboardingScenarioControl disabled={running}/>
    {poolKeys.length > 0 && <Field label="测试密钥"><Choice label="候选测试密钥" value={keyId} options={poolKeys.map(key => [key.id, key.name || key.id])} disabled={running || unresolved} onChange={value => { setSelectedKeyId(value); setJob(null); setBatch(null); setConsent(false); }}/></Field>}
    {planError && <Notice error>{planError}</Notice>}
    <Field label="验证内容"><Choice label="候选验证内容" value={check || 'basic'} options={[[ 'basic', '基础调用' ], [ 'streaming', '流式响应' ], [ 'tools', '工具调用' ], [ 'structured', '结构化输出' ]]} disabled={running || unresolved || !ops.can} onChange={value => { setCheck(value === 'basic' ? '' : value); setConsent(false); }}/></Field>
    {plan?.records.filter(row => ['image', 'video', 'audio'].includes(row.type)).map(row => <div className="supplier-row-actions" key={row.associationId}><Checkbox checked={expensiveIds.includes(row.associationId)} disabled={running || unresolved || !ops.can} onChange={event => { setExpensiveIds(current => event.target.checked ? [...current, row.associationId] : current.filter(id => id !== row.associationId)); setConsent(false); }}>包含高成本任务 {row.upstreamModelId}</Checkbox>{row.type === 'audio' && <Choice label={`${row.upstreamModelId} 候选语音任务`} value={audioProbes[row.associationId] || 'unselected'} options={[[ 'unselected', '请选择语音任务' ], [ 'speech', '语音合成' ], [ 'transcription', '语音识别' ]]} disabled={running || !expensiveIds.includes(row.associationId)} onChange={value => { setAudioProbes(current => ({ ...current, [row.associationId]: value })); setConsent(false); }}/>}</div>)}
    {!basic && <Checkbox className="supplier-change-check" checked={consent} disabled={running || unresolved || !ops.can} onChange={event => setConsent(event.target.checked)}>确认测试 {planned.length} 个候选模型，费用未知</Checkbox>}
    <div className="supplier-change-actions"><Button theme="light" disabled={!ops.can || !basic && !consent || running || unresolved || Boolean(planError) || !planned.length} onClick={async () => await start(basic)}>{basic ? testLabel : '开始候选任务测试'}</Button>{basic && <span>本次 {planned.length} 个模型，费用未知</span>}{active && <Button type="tertiary" theme="borderless" disabled={busy} onClick={query}>{unresolved ? '查询原提交' : '刷新进度'}</Button>}{notSubmitted && <Button theme="light" disabled={busy || !ops.can} onClick={resume}>继续原提交</Button>}{channelBatchRunning(batch) && <Button theme="light" disabled={busy || !ops.can} onClick={async () => { setBusy(true); try { await cancelCandidateTest(active); setRevision(value => value + 1); } catch (failure) { setError(failure.message); } finally { setBusy(false); } }}>取消待执行测试</Button>}</div>
    {batch && <>{!candidateProbeResultCurrent(context, active, pendingEdits) && <Notice>此结果属于旧候选配置，仅供查看，不能用于当前配置；修改后需重新测试。</Notice>}<GridTable headings={['模型', '任务', '状态', '检查结果', '结果来源']} empty={!batch.items?.length}>{batch.items.map(item => <Row key={item.id}><Cell>{item.model.upstreamModelId}</Cell><Cell>{({ streaming: '流式响应', tools: '工具调用', structured: '结构化输出', text: '文本生成', multimodal: '图像理解', embedding: '向量', rerank: '重排', image: '图片生成', video: '视频生成', speech: '语音合成', transcription: '语音识别' })[item.model.check || item.model.probe || item.model.type] || '任务检查'}</Cell><Cell>{CHANNEL_TEST_STATUS[item.status] || '结果未知'}</Cell><Cell>{item.message || '—'}</Cell><Cell>{item.evidenceSource === 'mock' || batch.source === 'mock' ? '模拟检测' : item.evidenceSource === 'real' ? '服务端回执' : '未记录'}</Cell></Row>)}</GridTable></>}
    {error && <Notice error>{error}</Notice>}
  </section>;
}
