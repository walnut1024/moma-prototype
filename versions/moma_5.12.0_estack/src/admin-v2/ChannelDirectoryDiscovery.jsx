import { useChannelText } from './channel-language';
import { useEffect, useId, useRef, useState } from 'react';
import Descriptions from './AdminDescriptions';
import { Button, Checkbox, Empty, Input, InputNumber, Pagination, Space, Table, TextArea, Typography } from '@douyinfe/semi-ui';
import { IconSearch } from '@douyinfe/semi-icons';
import { Modal, Notice, CopyId } from './ModelOperationsUI';
import { channelDiscoveryPreview, directoryDiscoveryPolicy, directoryDiscoveryReceipt, directoryDiscoverySignature, ignoredDiscoveryModel } from './channel-discovery-diff';
import { connectionCredentialsReady } from './connection-state';
import { libraryRecord, modelLibrary } from './model-library';
import { onboardingApi, prepareServerChannel } from './onboarding-client';
import OnboardingScenarioControl from './OnboardingScenarioControl';
import { Field } from './ServiceUI';

import { modelListRequestUrl } from './channel-interface';

const sampleModels = ['demo-chat', 'demo-vision', 'demo-embedding'].map(upstreamModelId => ({ upstreamModelId }));

function modelListRequest(endpoint) {
  const baseUrl = endpoint?.baseUrl;
  const custom = endpoint?.interfaceType === 'custom';
  const adapter = custom ? endpoint.customAdapter?.models : null;
  const configured = Boolean(endpoint?.interfaceType && (!custom || adapter?.path));
  const protocol = adapter ? '自定义 API' : configured ? 'OpenAI 兼容' : '未配置';
  let url;
  if (baseUrl && configured) {
    try {
      url = modelListRequestUrl(endpoint);
    } catch { /* A missing or invalid address has no request preview. */ }
  }
  return { baseUrl, protocol, url, method: adapter?.method || 'GET' };
}

function ReferenceModelList({ active, canEdit, checking, selected, onSelect, onRefresh, onConfigure, configureDisabled, close, error }) {
  const translateLabel = useChannelText();
  const [search, setSearch] = useState('');
  const [demo, setDemo] = useState(null);
  const selectionSummaryId = useId();
  const { baseUrl, protocol, url, method } = modelListRequest(active?.endpoint);
  const result = active?.result;
  const models = demo ? sampleModels : result?.rows ?? [];
  const query = demo ? demo.search : search;
  const visible = models.filter(row => row.upstreamModelId.toLowerCase().includes(query.trim().toLowerCase()));
  const displayedSelection = demo ? demo.selected : selected;
  const candidateIds = new Set((demo ? sampleModels : active?.additions ?? []).map(row => row.upstreamModelId));
  const visibleIds = visible.filter(row => candidateIds.has(row.upstreamModelId)).map(row => row.upstreamModelId);
  const visibleSelectedCount = visibleIds.filter(id => displayedSelection.includes(id)).length;
  const allSelected = visibleIds.length > 0 && visibleSelectedCount === visibleIds.length;
  const canSelect = !checking && (demo || canEdit);
  const changeSelection = (ids, checked) => {
    const next = checked ? [...new Set([...displayedSelection, ...ids])] : displayedSelection.filter(id => !ids.includes(id));
    if (demo) setDemo({ ...demo, selected: next });
    else onSelect(next);
  };
  const discoveredAt = result && active.receipt.discoveredAt;
  const listSummary = demo ? `共 ${models.length} 个模型` : result ? [
    `共 ${models.length} 个模型`,
    result.complete ? '完整列表' : '部分列表',
    discoveredAt && '最近获取 ' + new Date(discoveredAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
  ].filter(Boolean).join(' · ') : '';
  const empty = checking ? '正在获取模型列表…' : query ? '没有匹配的模型' : result ? '未获取到模型' : '尚未获取模型列表';
  return <Modal drawer wide title={translateLabel("获取模型列表")} description={active?.name} onClose={() => !checking && close()}
    footer={<Space wrap>
      <Button disabled={checking} onClick={close}>{translateLabel("关闭")}</Button>
      <Button theme="solid" disabled={Boolean(demo) || configureDisabled} onClick={onConfigure}>配置所选模型</Button>
    </Space>}>
    <Notice>{protocol === '自定义 API'
      ? '自动获取模型列表需要上游服务商提供当前连接配置的模型列表接口。如果上游未提供该接口，可从「添加上游模型」选择或录入。'
      : '自动获取模型列表需要上游服务商提供 OpenAI 兼容的模型列表接口（GET /models）。如果上游未提供该接口，可从「添加上游模型」选择或录入。'}</Notice>
    <Descriptions align="left" data={[
      { key: '模型列表接口格式', value: protocol },
      { key: '服务地址（Base URL）', value: <CopyId copyAtStart value={baseUrl} label="服务地址"/> },
      { key: '模型列表请求地址', value: <CopyId copyAtStart value={url} displayValue={method + ' ' + url} label="模型列表请求地址"/> },
    ]}/>
    <section className="supplier-change-section" aria-label={translateLabel("上游模型")} aria-busy={checking} style={{ display: 'grid', gap: 12 }}>
      <Space wrap style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div>
          <Typography.Title heading={5}>{translateLabel("上游模型")}</Typography.Title>
          {listSummary && <Typography.Text type="tertiary" aria-live="polite">{listSummary}</Typography.Text>}
        </div>
        <Space wrap>
          <Button theme="light" disabled={checking} onClick={() => setDemo(demo ? null : { search: '', selected: [] })}>
            {demo ? '退出模拟' : '模拟数据'}
          </Button>
          <Button theme="solid" loading={checking} disabled={Boolean(demo) || !canEdit || !active}
            onClick={onRefresh}>{result ? '更新模型列表' : '获取模型列表'}</Button>
        </Space>
      </Space>
      {demo ? <Notice>当前显示模拟数据，仅供预览。</Notice> : <>
        {active?.outdated && <Notice>连接配置或模型关联已变化，请重新获取模型列表。</Notice>}
        {active?.receipt?.reason && <Notice error>{active.receipt.reason}</Notice>}
        {result?.source === 'mock' && <Notice>上游模型列表为模拟结果。</Notice>}
        {error && <Notice error>{error}</Notice>}
      </>}
      {models.length > 0 && <Input aria-label="搜索上游模型 ID" placeholder="搜索上游模型 ID"
        prefix={<IconSearch aria-hidden="true"/>} style={{ width: 280, maxWidth: '100%' }} showClear value={query}
        onChange={value => demo ? setDemo({ ...demo, search: value }) : setSearch(value)}/>}
      <Table size="small" rowKey="upstreamModelId" dataSource={visible} empty={<Empty description={empty}/>}
        pagination={visible.length > 10 && { pageSize: 10, hideOnSinglePage: true }}
        renderPagination={pagination => <Pagination {...pagination} showTotal={false} style={{ marginInlineStart: 'auto' }}/>}
        columns={[
          { title: <Checkbox aria-label="全选上游模型" aria-describedby={selectionSummaryId} checked={allSelected}
            indeterminate={visibleSelectedCount > 0 && !allSelected} disabled={!canSelect || !visibleIds.length}
            onChange={event => changeSelection(visibleIds, event.target.checked)}>全选</Checkbox>,
            width: 96,
            render: (_, row) => row.existingAssociationId ? '已添加' : candidateIds.has(row.upstreamModelId) &&
              <Checkbox aria-label={'选择上游模型 ' + row.upstreamModelId} checked={displayedSelection.includes(row.upstreamModelId)}
                disabled={!canSelect} onChange={event => changeSelection([row.upstreamModelId], event.target.checked)}/> },
          { title: '上游模型 ID', render: (_, row) => <CopyId value={row.upstreamModelId} label="上游模型 ID"/> },
        ]}/>
      <span className="sr-only" id={selectionSummaryId}>已选 {displayedSelection.length} 款，可选 {visibleIds.length} 款</span>
      {!demo && selected.length > 50 && <Typography.Text type="secondary" role="status">每批最多接入 50 款模型，请减少所选模型。</Typography.Text>}
    </section>
  </Modal>;
}

export default function ChannelDirectoryDiscovery({ state, connections, ops, close, append, initialConnectionId, initialSelection, reference = false }) {
  const translateLabel = useChannelText();
  const [checking, setChecking] = useState(false);
  const [progress, setProgress] = useState(null);
  const [selection, setSelection] = useState(initialSelection || {});
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
  const configureDisabled = !ops.can || checking || !chosen.length || chosen.length > 50 || Boolean(active?.endpoint.candidateConfiguration);
  const configureSelected = event => append(event, active.id, chosen.map(row => ({ ...row, selected: true, confirmed: false })), selection);
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
        setSelection(current => Object.fromEntries(Object.entries(current).map(([id, ids]) =>
          [id, ids.filter(model => !applied.get(id)?.has(model))])));
        setReview(null);
      }
    } finally { setApplying(false); }
  };
  if (reference) return <ReferenceModelList active={active} canEdit={ops.can} checking={checking} selected={selected}
    onSelect={ids => setSelection(current => ({ ...current, [active.id]: ids }))} onRefresh={() => load(rows)}
    onConfigure={configureSelected} configureDisabled={configureDisabled} close={close} error={error || ops.error}/>;

  const summary = active?.result && [...active.additions.map(row => ({ ...row, kind: row.libraryId ? '可新增' : '待核对' })),
    ...active.ignored.map(row => ({ ...row, kind: '已忽略' })),
    ...active.result.missing.map(row => ({ ...row, kind: '疑似移除' })),
    ...active.result.rows.filter(row => row.existingAssociationId && row.attributes.some(item => item.different)).map(row => ({ ...row, kind: '属性差异' }))];
  return <><Modal drawer wide title={connections.length === 1 ? '上游模型更新' : '上游变更任务'} description={connections.length === 1 ? connections[0].name : connections.length + ' 条连接'}
    onClose={() => !checking && close()} footer={<Space wrap>
      <Button disabled={checking} onClick={close}>{translateLabel("关闭")}</Button>
      {checking ? <Button disabled={stop.current} onClick={() => { stop.current = true; }}>完成当前检测后停止</Button> :
        <Button theme="solid" disabled={!ops.can || !connections.length} onClick={() => load(rows)}>{connections.length === 1 ? '立即检测' : '检测全部所选连接'}</Button>}
      {!checking && <Button disabled={!ops.can || !due().length} onClick={() => load(due().slice(0, 10), true)}>检查到期连接</Button>}
      {!checking && <Button disabled={!ops.can || !bulk.length || bulk.length > 10 || bulk.reduce((n, row) => n + row.modelIds.length, 0) > 25}
        onClick={() => setReview(bulk)}>核对批量接入</Button>}
    </Space>}>
    <OnboardingScenarioControl disabled={checking}/>
    <Notice>检测使用本地模拟列表。新增模型需核对资料和采购范围。疑似移除项保留当前供给。</Notice>
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
    {active && <Space wrap>
      <Button theme="light" disabled={!ops.can || checking} onClick={openPolicy}>同步策略</Button>
      {active.endpoint.directoryDiscoveryApply && <Typography.Text>上次接入 {active.endpoint.directoryDiscoveryApply.modelIds.length} 款 · {new Date(active.endpoint.directoryDiscoveryApply.appliedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</Typography.Text>}
    </Space>}
    {active?.outdated && <Notice>连接配置或模型关联已变化，请重新检测获取差异。</Notice>}
    {active?.receipt?.reason && <Notice error>{active.receipt.reason}</Notice>}
    {active?.result && <section className="supplier-change-section">
      <Typography.Title heading={5}>{active.name + ' · 模型差异'}</Typography.Title>
      <Typography.Text>{active.result.complete ? '完整列表' : '部分列表 · 无法判断移除项'} · {new Date(active.receipt.discoveredAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</Typography.Text>
      <Table size="small" rowKey="upstreamModelId" dataSource={summary} empty={<Empty description="未发现模型差异"/>}
        pagination={{ pageSize: 10, hideOnSinglePage: true }} columns={[
          { title: '变化', dataIndex: 'kind' },
          { title: '上游模型 ID', render: (_, row) => <CopyId value={row.upstreamModelId} label="上游模型 ID"/> },
          { title: '当前资料', render: (_, row) => libraryRecord(state, row.libraryId)?.name || row.modelId || '待关联资料' },
          { title: '处理方式', render: (_, row) => row.kind === '疑似移除' ? '保留现有供给，经复测与影响核对再处理' :
            row.kind === '属性差异' ? row.attributes.filter(item => item.different).map(item => item.label + '：' + item.current + ' → ' + item.observed).join('、') : '确认采购范围和模型身份' },
          { title: '选择',
            render: (_, row) => active.additions.some(item => item.upstreamModelId === row.upstreamModelId) &&
            <Checkbox aria-label={'选择上游模型 ' + row.upstreamModelId} checked={selected.includes(row.upstreamModelId)} disabled={!ops.can || checking}
              onChange={event => setSelection(current => ({ ...current, [active.id]: event.target.checked ? [...selected, row.upstreamModelId] : selected.filter(id => id !== row.upstreamModelId) }))}/> },
        ]}/>
      <Button theme="light" disabled={configureDisabled} onClick={configureSelected}>核对所选 {chosen.length} 款模型</Button>
    </section>}
    {(error || ops.error) && <Notice error>{error || ops.error}</Notice>}
  </Modal>
  {policyDraft && <Modal wide title="上游模型同步策略" description={active?.name} onClose={() => !applying && setPolicyDraft(null)} footer={<>
    <Button disabled={applying} onClick={() => setPolicyDraft(null)}>{translateLabel("取消")}</Button>
    <Button theme="solid" disabled={applying || !ops.can || !active} onClick={savePolicy}>保存同步策略</Button>
  </>}>
    <Notice>使用「检查到期连接」运行扫描。仅完整列表中身份唯一、在采购白名单内的模型会自动接入为待验证供给。</Notice>
    <Checkbox checked={policyDraft.enabled} disabled={applying} onChange={event => setPolicyDraft(value => ({ ...value, enabled: event.target.checked }))}>启用到期检测规则</Checkbox>
    <Field label="间隔（分钟）"><InputNumber aria-label="检测间隔" min={5} max={1440} value={policyDraft.intervalMinutes}
      disabled={applying} onChange={intervalMinutes => setPolicyDraft(value => ({ ...value, intervalMinutes: Number(intervalMinutes) }))}/></Field>
    <Field label="忽略模型（每行一项）"><TextArea aria-label="忽略模型" value={policyDraft.ignored} placeholder="上游模型 ID、test-model-* 或 re:^test-[0-9]+$"
      disabled={applying} maxLength={5000} onChange={ignored => setPolicyDraft(value => ({ ...value, ignored }))}/></Field>
    <Field label="采购白名单（每行一个精确上游模型 ID）"><TextArea aria-label="采购白名单" value={policyDraft.whitelist}
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
