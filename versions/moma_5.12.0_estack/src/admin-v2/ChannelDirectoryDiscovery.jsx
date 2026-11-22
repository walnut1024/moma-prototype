import { useEffect, useId, useRef, useState } from 'react';
import { Button, Checkbox, Empty, InputNumber, Pagination, Space, Table, TextArea, Typography } from '@douyinfe/semi-ui';
import { Modal, Notice, CopyId } from './ModelOperationsUI';
import { channelDiscoveryPreview, directoryDiscoveryPolicy, directoryDiscoveryReceipt, directoryDiscoverySignature, ignoredDiscoveryModel } from './channel-discovery-diff';
import { connectionCredentialsReady } from './connection-state';
import { libraryRecord, modelLibrary } from './model-library';
import { onboardingApi, prepareServerChannel } from './onboarding-client';
import OnboardingScenarioControl from './OnboardingScenarioControl';
import { Field } from './ServiceUI';

export default function ChannelDirectoryDiscovery({ state, connections, ops, close, append, scope: targetScope, initialConnectionId, initialSelection, reference = false }) {
  const [checking, setChecking] = useState(false);
  const [progress, setProgress] = useState(null);
  const [selection, setSelection] = useState(initialSelection || {});
  const selectionSummaryId = useId();
  const [policyDraft, setPolicyDraft] = useState(null), [review, setReview] = useState(null), [applying, setApplying] = useState(false);
  const [activeId, setActiveId] = useState(() => connections.some(row => row.id === initialConnectionId)
    ? initialConnectionId : connections.length === 1 ? connections[0].id : '');
  const [error, setError] = useState('');
  const stop = useRef(false), mounted = useRef(true), lock = useRef(false);
  const scope = useRef({}); scope.current = { ops, connections };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; stop.current = true; }; }, []);
  const archivedIds = new Set(reference ? state.modelData?.archivedCatalogueIds : []);
  const archivedCodes = new Set(reference
    ? modelLibrary(state).filter(model => archivedIds.has(model.id)).map(model => model.modelId?.toLowerCase()) : []);
  const archivedModel = row => reference && !row.libraryId && archivedCodes.has(row.upstreamModelId.toLowerCase());
  const rows = connections.map(row => {
    const signature = directoryDiscoverySignature(row.provider, row.endpoint);
    const saved = row.endpoint.directoryDiscovery;
    const receipt = saved?.signature === signature ? saved : null;
    const result = receipt?.result && channelDiscoveryPreview(state, row.provider, row.id, receipt.result);
    const policy = row.endpoint.directoryDiscoveryPolicy;
    return { ...row, receipt, signature, outdated: saved && !receipt, result,
      additions: result?.rows.filter(item => !item.existingAssociationId &&
        (reference ? !archivedModel(item) : !ignoredDiscoveryModel(policy, item.upstreamModelId))) || [],
      ignored: result?.rows.filter(item => !item.existingAssociationId && ignoredDiscoveryModel(policy, item.upstreamModelId)) || [] };
  });
  const active = rows.find(row => row.id === activeId);
  const selected = selection[activeId] || [];
  const chosen = active?.additions.filter(row => selected.includes(row.upstreamModelId)) || [];
  const hasCandidates = Boolean(active?.additions.length);
  const allSelected = hasCandidates && chosen.length === active.additions.length;
  const configureDisabled = !ops.can || checking || !chosen.length || chosen.length > 50 || Boolean(active?.endpoint.candidateConfiguration);
  const configureSelected = () => append(active.id, chosen.map(row => ({ ...row, selected: true, confirmed: false })), selection);
  const bulk = rows.flatMap(row => {
    const eligible = row.result?.complete ? row.additions.filter(model => selection[row.id]?.includes(model.upstreamModelId) && model.libraryId && model.candidates.length === 1) : [];
    return eligible.length ? [{ endpointId: row.id, providerId: row.provider.id, name: row.name, taskId: row.receipt.taskId,
      modelIds: eligible.map(model => model.upstreamModelId) }] : [];
  });
  const load = async (targets, automated = false) => {
    if (lock.current || checking || !targets.length || !ops.can) return;
    if (targets.length > 100) { setError('每个任务最多检测 100 条连接，请按筛选范围分批检测'); return; }
    lock.current = true; stop.current = false; setChecking(true); setError('');
    const testedIds = new Set(targets.map(row => row.id));
    setSelection(current => Object.fromEntries(Object.entries(current).filter(([id]) => !testedIds.has(id))));
    const taskId = crypto.randomUUID(), results = [];
    try {
      for (const [index, row] of targets.entries()) {
        if (stop.current || !scope.current.ops.isCurrent()) break;
        setProgress({ done: index, total: targets.length, name: row.name });
        const data = { providerId: row.provider.id, endpointId: row.id, signature: row.signature };
        if (row.provider.status !== '已启用' || row.endpoint.frozen || !row.endpoint.interfaceType ||
          row.endpoint.interfaceType === 'custom' && !row.endpoint.customAdapter?.models || !connectionCredentialsReady(row.endpoint, row.provider)) {
          results.push({ ...data, reason: '连接配置暂不支持检测' });
          continue;
        }
        try {
          const channel = await prepareServerChannel(row.provider, row.endpoint);
          const result = await onboardingApi('/discover', { method: 'POST', body: { channelId: channel.id } });
          if (result.signature !== channel.signature && channel.signature) throw Error('配置已变化');
          results.push({ ...data, result: directoryDiscoveryReceipt(result) });
        } catch { results.push({ ...data, reason: '上游模型列表检测失败' }); }
      }
      if (mounted.current && results.length) {
        // The simulator saves its own receipts before a workspace command can record the comparison.
        await scope.current.ops.reload?.();
        if (!mounted.current) return;
        const next = await ops.run('channelDiscoveryRecord', { taskId, rows: results });
        if (automated && next) {
          const scopes = results.flatMap(receipt => {
            const endpoint = next.endpoints.find(row => row.id === receipt.endpointId);
            const provider = next.providers.find(row => row.id === receipt.providerId);
            const policy = endpoint?.directoryDiscoveryPolicy;
            if (!policy?.enabled || !receipt.result?.complete || endpoint.candidateConfiguration || !provider) return [];
            const matches = channelDiscoveryPreview(next, provider, endpoint.id, receipt.result).rows.filter(model =>
              model.libraryId && model.candidates.length === 1 && !model.existingAssociationId && policy.whitelist.includes(model.upstreamModelId) &&
              !ignoredDiscoveryModel(policy, model.upstreamModelId));
            return matches.length ? [{ endpointId: endpoint.id, providerId: provider.id, taskId, modelIds: matches.map(model => model.upstreamModelId) }] : [];
          });
          if (scopes.length && scopes.length <= 10 && scopes.reduce((sum, item) => sum + item.modelIds.length, 0) <= 25) {
            await ops.run('channelDirectoryApplyDiscovery', { targets: scopes, automatic: true, confirmed: true });
          }
        }
      }
    } catch (failure) { if (mounted.current) setError(failure.message); }
    finally { lock.current = false; if (mounted.current) { setChecking(false); setProgress(null); } }
  };
  const due = () => rows.filter(row => {
    const policy = row.endpoint.directoryDiscoveryPolicy, last = Date.parse(row.endpoint.directoryDiscovery?.discoveredAt);
    return policy?.enabled && (!Number.isFinite(last) || Date.now() - last >= policy.intervalMinutes * 60000);
  });
  const openPolicy = () => {
    const policy = active.endpoint.directoryDiscoveryPolicy;
    setPolicyDraft({ enabled: Boolean(policy?.enabled), intervalMinutes: policy?.intervalMinutes || 30,
      ignored: policy?.ignored?.join('\n') || '', whitelist: policy?.whitelist?.join('\n') || '' });
  };
  const savePolicy = async () => {
    try {
      const policy = directoryDiscoveryPolicy({ ...policyDraft, ignored: policyDraft.ignored.split(/\s+/).filter(Boolean),
        whitelist: policyDraft.whitelist.split(/\s+/).filter(Boolean) });
      setApplying(true);
      if (await ops.run('channelDirectoryDiscoveryPolicy', { endpointId: active.id, providerId: active.provider.id,
        expectedUpdatedAt: active.endpoint.updatedAt, policy })) { setPolicyDraft(null); setError(''); }
    } catch (failure) { setError(failure.message); }
    finally { setApplying(false); }
  };
  const apply = async () => {
    setApplying(true);
    try {
      if (await ops.run('channelDirectoryApplyDiscovery', { targets: review, confirmed: true })) {
        const applied = new Map(review.map(row => [row.endpointId, new Set(row.modelIds)]));
        setSelection(current => Object.fromEntries(Object.entries(current).map(([id, models]) =>
          [id, models.filter(model => !applied.get(id)?.has(model))])));
        setReview(null);
      }
    } finally { setApplying(false); }
  };
  const summary = active?.result && [...active.additions.map(row => ({ ...row, kind: row.libraryId ? '可新增' : '待核对' })),
    ...active.ignored.map(row => ({ ...row, kind: '已忽略' })),
    ...active.result.missing.map(row => ({ ...row, kind: '疑似移除' })),
    ...active.result.rows.filter(row => row.existingAssociationId && row.attributes.some(item => item.different)).map(row => ({ ...row, kind: '属性差异' }))];
  const scopeLabel = targetScope === 'all' ? '全部连接' : targetScope === 'selected' ? '所选连接' : '';
  return <><Modal drawer wide title={reference ? '获取模型列表' : scopeLabel ? `上游模型更新 · ${scopeLabel}` : '上游模型更新'} description={scopeLabel ? connections.length + ' 条连接' : connections[0]?.name}
    onClose={() => !checking && close()} footer={<Space wrap>
      <Button disabled={checking} onClick={close}>关闭</Button>
      {checking ? <Button disabled={stop.current} onClick={() => { stop.current = true; }}>完成当前检测后停止</Button> :
        <Button theme={reference && hasCandidates ? 'light' : 'solid'} disabled={!ops.can || !connections.length} onClick={() => load(rows)}>{reference ? '获取上游模型' : scopeLabel ? `检测${scopeLabel}` : '立即检测'}</Button>}
      {reference && hasCandidates && <Button theme="solid" disabled={configureDisabled} onClick={configureSelected}>配置所选模型</Button>}
      {!reference && !checking && <Button disabled={!ops.can || !due().length} onClick={() => load(due().slice(0, 10), true)}>检查到期连接</Button>}
      {!checking && connections.length > 1 && bulk.length > 0 && <Button disabled={!ops.can || bulk.length > 10 || bulk.reduce((n, row) => n + row.modelIds.length, 0) > 25}
        onClick={() => setReview(bulk)}>核对批量接入</Button>}
    </Space>}>
    {!reference && <OnboardingScenarioControl disabled={checking}/>}
    <Notice>{reference ? '上游模型列表为模拟结果。接入所选模型前需核对模型资料和采购范围。' : '检测使用本地模拟列表。新增模型需核对资料和采购范围。疑似移除项保留当前供给。'}</Notice>
    {progress && <Typography.Text aria-live="polite">已完成 {progress.done} / {progress.total} 条 · 正在检测 {progress.name}</Typography.Text>}
    {connections.length > 1 && <Table size="small" rowKey="id" dataSource={rows} pagination={{ pageSize: 10, hideOnSinglePage: true }} columns={[
      { title: '连接', dataIndex: 'name' },
      { title: '本次检测', render: (_, row) => row.result ? row.result.complete ? '完整' : '部分' : row.receipt?.reason || (row.outdated ? '配置已变更' : '待检测') },
      { title: '新增候选', render: (_, row) => row.result ? row.additions.length : '—' },
      { title: '疑似移除', render: (_, row) => row.result?.complete ? row.result.missing.length : '—' },
      { title: '操作', render: (_, row) => <Space>
        <Button theme="borderless" size="small" disabled={checking} onClick={() => setActiveId(row.id)}>查看差异和策略</Button>
        <Button theme="borderless" size="small" disabled={!ops.can || checking} onClick={() => load([row])}>检测此连接</Button>
      </Space> },
    ]}/>}
    {!reference && active && <Space wrap>
      <Button theme="light" disabled={!ops.can || checking} onClick={openPolicy}>同步策略</Button>
      {active.endpoint.directoryDiscoveryApply && <Typography.Text>上次接入 {active.endpoint.directoryDiscoveryApply.modelIds.length} 款 · {new Date(active.endpoint.directoryDiscoveryApply.appliedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</Typography.Text>}
    </Space>}
    {active?.outdated && <Notice>{reference ? '连接配置或模型关联已变化，请重新获取模型列表。' : '连接配置或模型关联已变化，请重新检测获取差异。'}</Notice>}
    {active?.receipt?.reason && <Notice error>{active.receipt.reason}</Notice>}
    {active?.result && <section className="supplier-change-section">
      <Typography.Title heading={5}>{reference ? '上游模型' : active.name + ' · 模型差异'}</Typography.Title>
      <Typography.Text>{active.result.complete ? '完整列表' : reference ? '部分列表' : '部分列表 · 无法判断移除项'} · {new Date(active.receipt.discoveredAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</Typography.Text>
      <Table size="small" rowKey="upstreamModelId" dataSource={reference ? active.result.rows : summary} empty={<Empty description={reference ? '未获取到模型' : '未发现模型差异'}/>}
        pagination={reference && active.result.rows.length <= 10 ? false : { pageSize: 10, hideOnSinglePage: true }}
        renderPagination={reference ? pagination => <Pagination {...pagination} showTotal={false} style={{ marginInlineStart: 'auto' }}/> : undefined} columns={[
          ...(!reference ? [{ title: '变化', dataIndex: 'kind' }] : []),
          { title: '上游模型调用标识', render: (_, row) => <CopyId value={row.upstreamModelId} label="上游模型调用标识"/> },
          { title: '当前资料', render: (_, row) => archivedModel(row) ? '模型资料已归档' : libraryRecord(state, row.libraryId)?.name || row.modelId || '待关联资料' },
          ...(!reference ? [{ title: '处理方式', render: (_, row) => row.kind === '疑似移除' ? '保留现有供给，经复测与影响核对再处理' :
            row.kind === '属性差异' ? row.attributes.filter(item => item.different).map(item => item.label + '：' + item.current + ' → ' + item.observed).join('、') : '确认采购范围和模型身份' }] : []),
          { title: reference ? <>
            <Checkbox aria-label="全选上游模型" aria-describedby={selectionSummaryId} checked={allSelected} indeterminate={chosen.length > 0 && !allSelected}
              disabled={!ops.can || checking || !hasCandidates} onChange={event => setSelection(current => ({
                ...current, [active.id]: event.target.checked ? active.additions.map(row => row.upstreamModelId) : [],
              }))}>全选</Checkbox>
            <span className="sr-only" id={selectionSummaryId}>已选 {chosen.length} 款，可选 {active.additions.length} 款</span>
          </> : '选择',
            render: (_, row) => reference && row.existingAssociationId ? '已添加' : active.additions.some(item => item.upstreamModelId === row.upstreamModelId) &&
            <Checkbox aria-label={'选择上游模型 ' + row.upstreamModelId} checked={selected.includes(row.upstreamModelId)} disabled={!ops.can || checking}
              onChange={event => setSelection(current => ({ ...current, [active.id]: event.target.checked ? [...selected, row.upstreamModelId] : selected.filter(id => id !== row.upstreamModelId) }))}/> },
        ]}/>
      {reference && chosen.length > 50 && <Typography.Text type="secondary" role="status">每批最多接入 50 款模型，请减少所选模型。</Typography.Text>}
      {!reference && <Button theme="light" disabled={configureDisabled} onClick={configureSelected}>核对所选 {chosen.length} 款模型</Button>}
    </section>}
    {(error || ops.error) && <Notice error>{error || ops.error}</Notice>}
  </Modal>
  {policyDraft && <Modal wide title="上游模型同步策略" description={active?.name} onClose={() => !applying && setPolicyDraft(null)} footer={<>
    <Button disabled={applying} onClick={() => setPolicyDraft(null)}>取消</Button>
    <Button theme="solid" disabled={applying || !ops.can || !active} onClick={savePolicy}>保存同步策略</Button>
  </>}>
    <Notice>使用「检查到期连接」运行扫描。仅完整列表中身份唯一、在采购白名单内的模型会自动接入为待验证供给。</Notice>
    <Checkbox checked={policyDraft.enabled} disabled={applying} onChange={event => setPolicyDraft(value => ({ ...value, enabled: event.target.checked }))}>启用到期检测规则</Checkbox>
    <Field label="间隔（分钟）"><InputNumber aria-label="检测间隔" min={5} max={1440} value={policyDraft.intervalMinutes}
      disabled={applying} onChange={intervalMinutes => setPolicyDraft(value => ({ ...value, intervalMinutes: Number(intervalMinutes) }))}/></Field>
    <Field label="忽略模型（每行一项）"><TextArea aria-label="忽略模型" value={policyDraft.ignored} placeholder="模型标识、test-model-* 或 re:^test-[0-9]+$"
      disabled={applying} maxLength={5000} onChange={ignored => setPolicyDraft(value => ({ ...value, ignored }))}/></Field>
    <Field label="采购白名单（每行一个精确上游标识）"><TextArea aria-label="采购白名单" value={policyDraft.whitelist}
      disabled={applying} maxLength={5000} onChange={whitelist => setPolicyDraft(value => ({ ...value, whitelist }))}/></Field>
    {(error || ops.error) && <Notice error>{error || ops.error}</Notice>}
  </Modal>}
  {review && <Modal wide title="核对批量接入" onClose={() => !applying && setReview(null)} footer={<>
    <Button disabled={applying} onClick={() => setReview(null)}>返回</Button>
    <Button theme="solid" disabled={applying || !ops.can} onClick={apply}>确认所列模型属于采购范围并接入</Button>
  </>}>
    <Notice>以下只列出来源完整且已唯一匹配资料的所选模型。接入后待验证，疑似移除项留待人工处理。</Notice>
    {review.map(row => <Typography.Paragraph key={row.endpointId}>{row.name} · {row.modelIds.join('、')}</Typography.Paragraph>)}
    {ops.error && <Notice error>{ops.error}</Notice>}
  </Modal>}</>;
}
