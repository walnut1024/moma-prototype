import { useEffect, useRef, useState } from 'react';
import { Button } from '../components/ui/button';
import { Choice, Field } from './ModelMetadataForm';
import { GridTable, Row, Cell, Notice } from './ModelOperationsUI';
import { candidateTestPlan } from './channel-change-management';
import { prepareCandidateTest, submitCandidateTest, recoverCandidateTest, cancelCandidateTest, candidateTestReceipt } from './candidate-tests';
import { channelBatchRunning, channelBatchTerminal, CHANNEL_TEST_STATUS, channelTestModels } from './channel-test-jobs';
import OnboardingScenarioControl from './OnboardingScenarioControl';

export default function CandidateProbePanel({ state, context, ops }) {
  const provider = state.providers.find(row => row.id === context.providerId), endpoint = state.endpoints.find(row => row.id === context.endpointId);
  const jobs = (context.groupId ? provider?.keyGroupTestJobs : endpoint?.candidateTestJobs) || [];
  const restored = [...jobs].reverse().find(row => row.candidateId === context.candidateId && row.endpointId === context.endpointId);
  const [job, setJob] = useState(restored), [batch, setBatch] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [consent, setConsent] = useState(false), [check, setCheck] = useState(''), [expensiveIds, setExpensiveIds] = useState([]), [audioProbes, setAudioProbes] = useState({}), [revision, setRevision] = useState(0), [notSubmitted, setNotSubmitted] = useState(false);
  const active = job || restored, opsRef = useRef(ops), received = useRef(new Set()); opsRef.current = ops;
  let plan, issue; try { plan = candidateTestPlan(state, context); } catch (failure) { issue = failure.message; }
  let planned = [], planError = issue; try { if (plan) planned = channelTestModels(plan.records, { check, expensiveIds, audioProbes }); } catch (failure) { planError = failure.message; }
  const running = busy || channelBatchRunning(batch), unresolved = Boolean(active && !active.batchId);
  const record = data => opsRef.current.run(context.groupId ? 'keyGroupCandidateTestJob' : 'channelCandidateTestJob', data);
  const saveReceipt = (tracked, result) => {
    if (!channelBatchTerminal(result) || tracked.receivedAt || received.current.has(result.id)) return;
    const receipt = candidateTestReceipt(tracked, result);
    if (opsRef.current.run(receipt.operation, receipt.data)) received.current.add(result.id);
    else setError('检查结果尚未保存，请处理保存冲突后刷新进度。');
  };
  useEffect(() => {
    if (!active?.batchId) return;
    let stopped = false, timer;
    const poll = async () => { try { const result = await recoverCandidateTest(active); if (stopped) return; setBatch(result); saveReceipt(active, result); if (channelBatchRunning(result)) timer = setTimeout(poll, 700); } catch (failure) { if (!stopped) setError(failure.message); } };
    poll(); return () => { stopped = true; clearTimeout(timer); };
  }, [active?.batchId, revision]);
  const submit = async tracked => { const saved = await submitCandidateTest(tracked); setJob(saved); setBatch(saved.batch); if (!record(saved)) setError('测试任务已提交，本地跟踪尚未保存，请查询原提交。'); setNotSubmitted(false); setConsent(false); };
  const start = async () => { setBusy(true); setError(''); try { const prepared = await prepareCandidateTest(state, context, { check, expensiveIds, audioProbes }); if (!opsRef.current.run(prepared.operation, prepared.data)) return; setJob(prepared.data); setBatch(null); await submit(prepared.data); } catch (failure) { setError(failure.message); } finally { setBusy(false); } };
  const query = async () => { setBusy(true); setError(''); try { const result = await recoverCandidateTest(active); const tracked = { ...active, batchId: result.id }; setJob(tracked); setBatch(result); record(tracked); saveReceipt(tracked, result); } catch (failure) { setNotSubmitted(failure.code === 'submission_not_found'); setError(failure.message); } finally { setBusy(false); } };
  return <section className="supplier-change-section"><h3>候选测试 · {endpoint?.name}</h3><OnboardingScenarioControl disabled={running}/>
    {planError && <Notice error>{planError}</Notice>}
    <Field label="验证内容"><Choice label="候选验证内容" value={check || 'basic'} options={[[ 'basic', '基础调用' ], [ 'streaming', '流式响应' ], [ 'tools', '工具调用' ], [ 'structured', '结构化输出' ]]} disabled={running || unresolved || !ops.can} onChange={value => { setCheck(value === 'basic' ? '' : value); setConsent(false); }}/></Field>
    {plan?.records.filter(row => ['image', 'video', 'audio'].includes(row.type)).map(row => <div className="supplier-row-actions" key={row.associationId}><label><input type="checkbox" checked={expensiveIds.includes(row.associationId)} disabled={running || unresolved || !ops.can} onChange={event => { setExpensiveIds(current => event.target.checked ? [...current, row.associationId] : current.filter(id => id !== row.associationId)); setConsent(false); }}/>包含高成本任务 {row.upstreamModelId}</label>{row.type === 'audio' && <Choice label={`${row.upstreamModelId} 候选语音任务`} value={audioProbes[row.associationId] || 'unselected'} options={[[ 'unselected', '请选择语音任务' ], [ 'speech', '语音合成' ], [ 'transcription', '语音识别' ]]} disabled={running || !expensiveIds.includes(row.associationId)} onChange={value => setAudioProbes(current => ({ ...current, [row.associationId]: value }))}/>}</div>)}
    <label className="supplier-change-check"><input type="checkbox" checked={consent} disabled={running || unresolved || !ops.can} onChange={event => setConsent(event.target.checked)}/>确认测试 {planned.length} 个候选模型，费用未知</label>
    <div className="supplier-change-actions"><Button variant="outline" disabled={!ops.can || !consent || running || unresolved || Boolean(planError) || !planned.length} onClick={start}>开始候选测试</Button>{active && <Button variant="link" disabled={busy} onClick={query}>{unresolved ? '查询原提交' : '刷新进度'}</Button>}{notSubmitted && <Button variant="outline" disabled={busy} onClick={async () => { setBusy(true); try { await submit(active); } catch (failure) { setError(failure.message); } finally { setBusy(false); } }}>继续原提交</Button>}{channelBatchRunning(batch) && <Button variant="outline" disabled={busy} onClick={async () => { setBusy(true); try { await cancelCandidateTest(active); setRevision(value => value + 1); } catch (failure) { setError(failure.message); } finally { setBusy(false); } }}>取消待执行测试</Button>}</div>
    {batch && <GridTable headings={['模型', '任务', '状态', '检查结果']} empty={!batch.items?.length}>{batch.items.map(item => <Row key={item.id}><Cell>{item.model.upstreamModelId}</Cell><Cell>{({ streaming: '流式响应', tools: '工具调用', structured: '结构化输出', text: '文本生成', multimodal: '图像理解', embedding: '向量', rerank: '重排', image: '图片生成', video: '视频生成', speech: '语音合成', transcription: '语音识别' })[item.model.check || item.model.probe || item.model.type] || '任务检查'}</Cell><Cell>{CHANNEL_TEST_STATUS[item.status] || '结果未知'}</Cell><Cell>{item.message || '—'}</Cell></Row>)}</GridTable>}
    {error && <Notice error>{error}</Notice>}
  </section>;
}
