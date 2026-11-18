import { useRef, useState } from 'react';
import { Banner, Button, Checkbox, Input, Space, Table, Typography } from '@douyinfe/semi-ui';
import { Modal, CopyId } from './ModelOperationsUI';
import { Field } from './ServiceUI';
import AdminStatus from './AdminStatus';
import SupplierChannelBatchTest from './SupplierChannelBatchTest';
import CandidateProbePanel from './CandidateProbePanel';
import { supplierChannelBatchPlan, channelBatchTasks, channelBatchRowResult, channelBatchInterface } from './supplier-channel-batch';
import { channelCandidateStatus } from './channel-change-management';
import { resolveChannelAssociationModel } from './channel-association-model';
import { channelIdentity } from '../model-identities.mjs';

const labels = { name: '批量编辑渠道名称', address: '批量编辑上游 API 地址', test: '批量测试连接' };

export default function SupplierChannelBulkActions({ state, provider, associationIds, mode, ops, close }) {
  let plan, planError = '';
  try { plan = supplierChannelBatchPlan(state, provider.id, associationIds); } catch (error) { planError = error.message; }
  const [expectedSignature, setExpectedSignature] = useState(plan?.signature);
  const [value, setValue] = useState(''), [preview, setPreview] = useState(false), [prepared, setPrepared] = useState(false), [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false), [tasks, setTasks] = useState([]), [results, setResults] = useState({}), [queue, setQueue] = useState([]), [attempt, setAttempt] = useState('');
  const [testBusy, setTestBusy] = useState(false);
  const saving = useRef(false);
  const active = queue[0], stale = plan?.signature !== expectedSignature;
  const blocked = !ops.can || Boolean(ops.conflict) || Boolean(planError) || stale;
  const disabled = blocked || busy;
  const affected = mode === 'address' ? plan?.affected || [] : plan?.selected || [];
  const statusFor = id => {
    const connection = mode === 'address' && prepared && plan?.connections.find(row => row.rows.some(item => item.id === id));
    const check = connection && channelCandidateStatus(state, provider.id, connection.endpoint.id, { allAssociations: true }).checks.find(row => row.associationId === id);
    return channelBatchRowResult(tasks, results, id, active?.key, check);
  };
  const completed = affected.filter(row => ['通过', '失败'].includes(statusFor(row.id).status)).length;
  const targets = plan?.connections.filter(({ endpoint }) => endpoint.baseUrl !== value.trim()) || [];
  const ready = prepared && targets.length > 0 && targets.every(({ endpoint }) => endpoint.candidateConfiguration?.addressOnly && endpoint.candidateConfiguration.config.baseUrl === value.trim() && channelCandidateStatus(state, provider.id, endpoint.id, { allAssociations: true }).ready);
  const update = input => { setValue(input); setPreview(false); setConfirmed(false); ops.dirty(true); ops.setError(''); };
  const request = async phase => {
    if (saving.current || disabled) return;
    saving.current = true; setBusy(true);
    try {
      const next = await ops.run('supplierChannelBatchEdit', { providerId: provider.id, associationIds, field: mode, value: value.trim(),
        expectedSignature, confirmed: true, ...(phase ? { phase } : {}),
        ...(phase === 'apply' ? { candidates: targets.map(({ endpoint }) => ({ endpointId: endpoint.id, candidateId: endpoint.candidateConfiguration?.id })) } : {}),
      });
      if (next) {
        if (phase === 'prepare') { setExpectedSignature(supplierChannelBatchPlan(next, provider.id, associationIds).signature); setPrepared(true); }
        else close();
      }
    } finally { saving.current = false; setBusy(false); }
  };
  const start = (retry = false) => {
    if (disabled || active || testBusy || mode === 'address' && !prepared) return;
    const nextTasks = channelBatchTasks(state, plan, mode === 'address', mode === 'address' ? targets.map(({ endpoint }) => endpoint.id) : undefined);
    const chosen = retry ? nextTasks.map(task => ({ ...task, associationIds: task.associationIds.filter(id => results[task.key]?.error || !results[task.key]?.batch?.items?.some(item => item.model.associationId === id && item.status === 'passed')) })).filter(task => task.associationIds.length) : nextTasks;
    const nextResults = retry ? { ...results } : {};
    for (const task of chosen) {
      nextResults[task.key] = retry ? { batch: { ...results[task.key]?.batch, items: results[task.key]?.batch?.items?.filter(item => !task.associationIds.includes(item.model.associationId)) || [] }, complete: false } : undefined;
      if (task.issue) nextResults[task.key] = { error: task.issue, complete: true };
    }
    setTasks(nextTasks); setResults(nextResults); setAttempt(crypto.randomUUID()); setQueue(chosen.filter(task => !task.issue)); ops.setError('');
  };
  const progress = result => {
    if (!active) return;
    setTestBusy(result.running || result.unresolved);
    setResults(current => {
      if (current[active.key]?.complete) return current;
      const items = new Map((current[active.key]?.batch?.items || []).map(item => [item.model.associationId, item]));
      for (const item of result.batch?.items || []) items.set(item.model.associationId, item);
      const next = { ...current[active.key], ...result, batch: { ...result.batch, items: [...items.values()] } };
      return JSON.stringify(current[active.key]) === JSON.stringify(next) ? current : { ...current, [active.key]: next };
    });
  };
  const finished = ({ batch }) => {
    const complete = active.associationIds.every(id => batch.items?.some(item => item.model.associationId === id));
    setResults(current => {
      const items = new Map((current[active.key]?.batch?.items || []).map(item => [item.model.associationId, item]));
      for (const item of batch.items || []) items.set(item.model.associationId, item);
      return { ...current, [active.key]: { batch: { ...batch, items: [...items.values()] }, complete } };
    });
    if (complete) { setTestBusy(false); setQueue(current => current.slice(1)); }
  };
  const cancel = () => { if (!busy) ops.proceed(close); };
  const title = labels[mode];
  return <Modal drawer wide title={title} description={provider.name} onClose={cancel} className="supplier-bulk-dialog" footer={<Space wrap>
    <Button disabled={busy} onClick={cancel}>关闭</Button>
    {mode !== 'test' && !prepared && <Button disabled={disabled || !value.trim()} onClick={() => { setPreview(true); ops.setError(''); }}>预览变更</Button>}
    {preview && !prepared && <Button theme="solid" disabled={disabled || mode === 'address' && (!confirmed && plan.additional.length > 0 || !targets.length)} onClick={() => request(mode === 'address' ? 'prepare' : undefined)}>{mode === 'address' ? '确认范围并准备测试' : '确认保存'}</Button>}
    {mode === 'address' && prepared && <Button theme="solid" disabled={disabled || Boolean(active) || testBusy || !ready} onClick={() => request('apply')}>保存全部地址</Button>}
  </Space>}>
    {planError ? <Banner type="danger" description={planError}/> : <div className="supplier-bulk-content">
      {stale && <Banner type="danger" description="渠道配置或影响范围已变化，请关闭后重新选择；当前输入保留。"/>}
      {mode !== 'test' && <Field label={mode === 'name' ? '新渠道名称 *' : '新上游 API 地址（Base URL） *'}>
        <Input aria-label={mode === 'name' ? '批量新渠道名称' : '批量新上游 API 地址'} value={value} maxLength={mode === 'name' ? 60 : 2048}
          placeholder={mode === 'name' ? '统一设置所选渠道的名称' : 'https://api.example.com/v1'} disabled={busy || prepared || Boolean(active)} onChange={update}/>
      </Field>}
      <Typography.Paragraph>已选 {plan.selected.length} 条渠道{mode === 'address' ? `，涉及 ${plan.connections.length} 个连接，实际影响 ${plan.affected.length} 条渠道（其中未勾选 ${plan.additional.length} 条）` : ''}</Typography.Paragraph>
      {mode === 'address' && preview && <>
        <Banner type="info" description="同一连接只修改一次。测试通过并保存前，继续使用当前地址；已准备的候选会保留，可用相同地址重新进入继续验证。"/>
        {plan.additional.length > 0 && <Checkbox checked={confirmed} disabled={prepared || busy} onChange={event => setConfirmed(event.target.checked)}>确认同时影响下表中未勾选但共用连接的 {plan.additional.length} 条渠道</Checkbox>}
      </>}
      <Table className="supplier-bulk-preview" tableLayout="fixed" size="small" rowKey="id" dataSource={affected} pagination={false} scroll={{ x: mode === 'address' ? 1920 : mode === 'name' ? 900 : 1480 }} columns={[
        { title: '模型', width: 150, ellipsis: true, render: (_, row) => { try { return resolveChannelAssociationModel(state, provider, row).name; } catch { return row.modelId; } } },
        { title: '渠道名称', width: 140, ellipsis: true, render: (_, row) => row.sourceName || row.name },
        { title: '渠道 ID', width: 210, render: (_, row) => <CopyId copyAtStart ellipsis value={channelIdentity(state, row.id)} label="渠道 ID"/> },
        ...(mode === 'name' ? [{ title: '新渠道名称', width: 180, render: () => preview ? value.trim() : '—' }] : [
          ...(mode === 'address' ? [{ title: '影响范围', width: 110, render: (_, row) => associationIds.includes(row.id) ? '已勾选' : '共享连接关联' }] : []),
          { title: '上游模型调用标识', width: 180, ellipsis: true, render: (_, row) => row.upstreamModelId },
          { title: '上游协议', width: 110, render: (_, row) => row.endpoint.protocol || '—' },
          { title: '当前上游接口', width: 330, render: (_, row) => <CopyId copyAtStart ellipsis value={channelBatchInterface(state, provider, row)} label="当前上游接口"/> },
          ...(mode === 'address' ? [{ title: '新上游接口', width: 330, render: (_, row) => preview ? <CopyId copyAtStart ellipsis value={channelBatchInterface(state, provider, row, value.trim())} label="新上游接口"/> : '—' }] : []),
          { title: '测试结果', width: 120, render: (_, row) => <AdminStatus value={statusFor(row.id).status}/> },
          { title: '原因', width: 240, ellipsis: true, render: (_, row) => statusFor(row.id).message || '—' },
        ]),
      ]}/>
      {(mode === 'test' || prepared) && <>
        <div className="supplier-bulk-test-actions"><Typography.Text>完成 {completed} / {affected.length} 条</Typography.Text>
          <Button theme="solid" disabled={disabled || Boolean(active) || testBusy} onClick={() => start()}>测试连接（产生用量）</Button>
          <Button disabled={disabled || Boolean(active) || testBusy || !tasks.length || affected.every(row => statusFor(row.id).status === '通过')} onClick={() => start(true)}>重试失败项</Button>
        </div>
        <Typography.Paragraph type="tertiary" size="small">{mode === 'address' ? '验证新的候选地址，不修改当前地址。' : '测试当前已保存配置，不自动启用、修改路由或上架。'}图片、语音和视频需在当前测试任务中明确选择。</Typography.Paragraph>
      </>}
      {active && <div className="supplier-bulk-active-test">
        {mode === 'address' ? <CandidateProbePanel key={attempt + active.key} state={state} ops={{ ...ops, can: !blocked }}
          context={{ providerId: provider.id, endpointId: active.endpointId, candidateId: state.endpoints.find(row => row.id === active.endpointId)?.candidateConfiguration?.id,
            expectedRevision: state.endpoints.find(row => row.id === active.endpointId)?.configurationRevision || 0, ...(active.keyId ? { keyId: active.keyId } : {}) }}
          associationIds={active.associationIds} startToken={attempt} onComplete={finished} onProgress={progress}/>
          : <SupplierChannelBatchTest key={attempt + active.key} state={state} provider={provider} endpointId={active.endpointId} associationIds={active.associationIds}
            embedded testOnly ops={{ ...ops, can: !blocked }} close={cancel} startToken={attempt} onComplete={finished} onProgress={progress}/>}
      </div>}
      {ops.error && <Banner type="danger" description={ops.error}/>}
    </div>}
  </Modal>;
}
