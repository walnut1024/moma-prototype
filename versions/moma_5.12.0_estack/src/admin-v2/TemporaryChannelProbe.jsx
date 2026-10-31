import { useEffect, useRef, useState } from 'react';
import { Button } from '../components/ui/button';
import { Choice, Field } from './ModelMetadataForm';
import { Notice } from './ModelOperationsUI';
import { onboardingApi, prepareServerChannel } from './onboarding-client';
import { resolveChannelAssociationModel } from './channel-association-model';
import { channelBatchRunning, channelBatchTerminal, CHANNEL_TEST_STATUS } from './channel-test-jobs';
import OnboardingScenarioControl from './OnboardingScenarioControl';

export default function TemporaryChannelProbe({ state, provider, association, selectedEndpoint, fingerprint, ops }) {
  const endpoint = state.endpoints.find(row => row.id === association.endpointId);
  const restored = [...(endpoint.temporaryTestJobs || [])].reverse().find(row => row.signature === fingerprint);
  const [job, setJob] = useState(restored), [batch, setBatch] = useState(null), [consent, setConsent] = useState(false), [probe, setProbe] = useState('speech'), [busy, setBusy] = useState(false), [error, setError] = useState(''), [refresh, setRefresh] = useState(0);
  const opsRef = useRef(ops); opsRef.current = ops;
  const current = job || restored;
  let model; try { model = resolveChannelAssociationModel(state, provider, association); } catch { /* Missing identity blocks submission. */ }
  const record = data => opsRef.current.run('channelTemporaryTestJob', { providerId: provider.id, endpointId: endpoint.id, signature: fingerprint, ...data });
  useEffect(() => {
    if (!current?.batchId) return;
    let stopped = false, timer;
    const poll = async () => { try { const result = await onboardingApi(`/tests/${current.batchId}`); if (stopped) return; setBatch(result); if (channelBatchRunning(result)) timer = setTimeout(poll, 700); else if (channelBatchTerminal(result) && !current.receivedAt) opsRef.current.run('channelTemporaryTestReceipt', { providerId: provider.id, endpointId: endpoint.id, batch: result }); } catch (issue) { if (!stopped) setError(issue.message); } };
    poll(); return () => { stopped = true; clearTimeout(timer); };
  }, [current?.batchId, refresh]);
  const submit = async request => { const result = await onboardingApi('/tests', { method: 'POST', body: request }); const tracked = { operationId: request.operationId, request, batchId: result.id }; setJob(tracked); setBatch(result); record(tracked); };
  const start = async () => { setBusy(true); setError(''); try { const channel = await prepareServerChannel(provider, { ...selectedEndpoint, id: `${endpoint.id}-temporary-${selectedEndpoint.keyGroupId}` }); const request = { operationId: crypto.randomUUID(), channelId: channel.id, confirmExpensive: ['image', 'video', 'audio'].includes(model.type), models: [{ id: model.id, associationId: association.id, upstreamModelId: association.upstreamModelId, type: model.type, ...(model.type === 'audio' ? { probe } : {}) }] }; const tracked = { operationId: request.operationId, request, batchId: '' }; if (!record(tracked)) return; setJob(tracked); await submit(request); setConsent(false); } catch (issue) { setError(issue.message); } finally { setBusy(false); } };
  return <section className="supplier-change-section"><h3>临时密钥组检查</h3><OnboardingScenarioControl disabled={busy || channelBatchRunning(batch)}/>{model?.type === 'audio' && <Field label="语音任务"><Choice label="临时语音任务" value={probe} options={[[ 'speech', '语音合成' ], [ 'transcription', '语音识别' ]]} onChange={setProbe}/></Field>}<label><input type="checkbox" checked={consent} disabled={busy || channelBatchRunning(batch)} onChange={event => setConsent(event.target.checked)}/>确认检查当前模型，可能产生上游用量，费用未知</label><div className="supplier-change-actions"><Button disabled={!ops.can || !model || !consent || busy || channelBatchRunning(batch) || Boolean(current && !current.batchId)} onClick={start}>开始临时检查</Button>{current && <Button variant="outline" onClick={async () => { try { const result = await onboardingApi(current.batchId ? `/tests/${current.batchId}` : `/tests?operationId=${current.operationId}`); const tracked = { ...current, batchId: result.id }; setJob(tracked); setBatch(result); record(tracked); setRefresh(value => value + 1); } catch (issue) { setError(issue.message); } }}>查询原任务</Button>}{channelBatchRunning(batch) && <Button variant="outline" onClick={async () => { await onboardingApi(`/tests/${current.batchId}/cancel`, { method: 'POST', body: { operationId: crypto.randomUUID() } }); setRefresh(value => value + 1); }}>取消待执行检查</Button>}</div>{batch?.items.map(item => <Notice key={item.id} error={item.status === 'failed'}>{CHANNEL_TEST_STATUS[item.status]} · {item.message || association.upstreamModelId}</Notice>)}{error && <Notice error>{error}</Notice>}<p className="supplier-price-hint">本次结果保留在临时检查记录中；正式配置、启用资格和服务路由保持当前值。</p></section>;
}
