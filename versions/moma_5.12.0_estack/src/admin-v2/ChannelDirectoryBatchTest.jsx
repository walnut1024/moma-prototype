import { useEffect, useState } from 'react';
import { Button, Space, Table } from '@douyinfe/semi-ui';
import AdminStatus from './AdminStatus';
import { Modal, Notice } from './ModelOperationsUI';
import SupplierChannelBatchTest from './SupplierChannelBatchTest';
import { resolveChannelAssociationModel } from './channel-association-model';
import { channelBatchProgress } from './channel-test-jobs';
import { connectionCredentialsReady, connectionFingerprint, connectionKeys } from './connection-state';
import { workspaceStoragePrefix } from '../workspace-storage.mjs';

function makePlan(state, connection) {
  const { endpoint, provider, models } = connection;
  const associationIds = [];
  let issues = '';
  try {
    for (const { association } of models) {
      const model = resolveChannelAssociationModel(state, provider, association);
      if (['text', 'multimodal', 'embedding', 'rerank'].includes(model.type) && !model.archivedAt) associationIds.push(association.id);
    }
  } catch (error) { issues = error.message; }
  if (provider.status !== '已启用' || endpoint.frozen) issues = '服务商已停用或连接已冻结';
  else if (!models.length) issues = '尚未接入模型';
  else if (!endpoint.interfaceType) issues = '缺少明确的上游接口';
  else if (!connectionCredentialsReady(endpoint, provider)) issues = '缺少可用凭证';
  else if (!associationIds.length) issues ||= '图片、视频和语音请在单连接中选择任务后测试';
  else if (endpoint.serverTestJobs?.some(job => !job.receivedAt && !job.canceledAt)) issues = '已有未完成的测试，请打开连接继续';
  if (associationIds.includes(endpoint.directoryDefaultTestAssociationId)) associationIds.splice(0, associationIds.length, endpoint.directoryDefaultTestAssociationId);
  const signature = JSON.stringify([provider.status, endpoint.frozen, connectionFingerprint(endpoint),
    connectionKeys(endpoint, provider).map(key => [key.id, key.version || key.fingerprint]),
    models.map(({ association }) => [association.id, association.upstreamModelId, association.modelId]), associationIds]);
  return { ...connection, associationIds, issues, signature, excluded: models.length - associationIds.length };
}

export default function ChannelDirectoryBatchTest({ state, connections, title, ops, close }) {
  const plan = connections.map(row => makePlan(state, row));
  const [captured] = useState(() => new Map(plan.map(row => [row.id, row.signature])));
  const key = workspaceStoragePrefix + 'channel-batch-tests:' + (state.adminSession?.accountId || state.currentRole);
  const scope = JSON.stringify([...captured.keys()].sort());
  const [saved] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(key));
      return stored?.scope === scope ? stored : null;
    } catch { return null; }
  });
  const [queue, setQueue] = useState([]);
  const [results, setResults] = useState(() => Object.fromEntries(Object.entries(saved?.results || {})
    .filter(([id, row]) => captured.get(id) === row.signature)));
  const [runToken, setRunToken] = useState(saved?.token || '');
  const [resumeIds, setResumeIds] = useState(saved?.remaining || []);
  const [progress, setProgress] = useState(null);
  const [stop, setStop] = useState(false);
  const active = queue[0], row = active && plan.find(connection => connection.id === active.id);
  const changed = active && row?.signature !== active.signature;
  const started = Boolean(runToken);
  useEffect(() => {
    if (!started) return;
    try { localStorage.setItem(key, JSON.stringify({ scope, token: runToken, results,
      remaining: queue.length ? queue.map(row => row.id) : resumeIds })); }
    catch { /* Per-connection test receipts remain available. */ }
  }, [key, scope, started, runToken, results, resumeIds, queue]);
  const begin = (retry = false) => {
    const chosen = retry ? plan.filter(row => results[row.id]?.status !== '通过') : plan;
    const nextQueue = [], nextResults = retry ? { ...results } : {};
    for (const item of chosen) {
      const recover = resumeIds.includes(item.id) && item.endpoint.serverTestJobs?.some(job => !job.receivedAt && !job.canceledAt &&
        job.signature === connectionFingerprint(item.endpoint) && job.associationIds.every(id => item.associationIds.includes(id)));
      const issue = (recover ? '' : item.issues) || (captured.get(item.id) !== item.signature ? '连接或模型范围已变化，请重新打开核对' : '');
      if (issue) nextResults[item.id] = { status: '已跳过', message: issue, signature: item.signature };
      else {
        delete nextResults[item.id];
        nextQueue.push(item);
      }
    }
    setStop(false);
    setResumeIds([]);
    setProgress(null);
    setResults(nextResults);
    setRunToken(crypto.randomUUID());
    setQueue(nextQueue);
  };
  const finished = ({ batch }) => {
    if (!active) return;
    const counts = channelBatchProgress(batch);
    const passed = counts.passed === active.associationIds.length;
    setResults(previous => ({ ...previous, [active.id]: {
      status: passed ? '通过' : '未通过',
      signature: active.signature,
      message: `通过 ${counts.passed} / ${active.associationIds.length}${active.excluded ? ' · ' + active.excluded + ' 项需单独测试' : ''}`,
    } }));
    setProgress(null);
    setQueue(current => stop ? [] : current.slice(1));
  };
  const skip = () => {
    if (!active) return;
    setResults(current => ({ ...current, [active.id]: { status: '待处理',
      signature: active.signature,
      message: changed ? '连接配置或模型范围已变化' : progress?.error || '原测试保留，可在连接内继续' } }));
    setProgress(null);
    setQueue(current => stop ? [] : current.slice(1));
  };
  const outdated = !started && (plan.length !== captured.size || plan.some(item => captured.get(item.id) !== item.signature));
  return <Modal drawer wide title={title} description={connections.length + ' 条连接'} onClose={() => !active && close()}
    footer={<Space wrap><Button disabled={Boolean(active)} onClick={close}>关闭</Button>
      {active ? <Button disabled={stop} onClick={() => setStop(true)}>结束当前项后停止</Button>
        : <Button theme="solid" disabled={!ops.can || outdated || !plan.some(item => (!item.issues || resumeIds.includes(item.id)) && results[item.id]?.status !== '通过')}
        onClick={() => begin(started)}>{resumeIds.length > 0 ? '继续测试' : started ? '重试失败或未完成项' : '开始模拟测试'}</Button>}</Space>}>
    {resumeIds.length > 0 && <Notice>有未完成的测试，可以从上次进度继续。</Notice>}
    {outdated && <Notice error>测试范围已变化，请重新选择连接。</Notice>}
    <Table size="small" rowKey="id" dataSource={plan} pagination={{ pageSize: 10, hideOnSinglePage: true }} columns={[
      { title: '连接名称', dataIndex: 'name' },
      { title: '服务商', render: (_, item) => item.provider.name },
      { title: '测试模型数', render: (_, item) => item.associationIds.length },
      { title: '结果', render: (_, item) => <AdminStatus value={results[item.id]?.status || (active?.id === item.id ? '测试中' : item.issues ? '无法测试' : '待测试')}/> },
      { title: '说明', render: (_, item) => results[item.id]?.message || item.issues || '—' },
    ]}/>
    {active && row && !changed && <SupplierChannelBatchTest key={runToken + active.id} state={state} provider={row.provider} endpointId={row.id}
      associationIds={active.associationIds} ops={ops} close={skip} onComplete={finished} onProgress={setProgress}
      startToken={runToken} directory embedded testOnly/>}
    {changed && <Notice error>当前连接或模型范围已变化。已提交任务可在连接中查看。</Notice>}
    {active && (changed || progress?.error) && <Button theme="light" onClick={skip}>
      保留本项任务并处理下一条
    </Button>}
  </Modal>;
}
