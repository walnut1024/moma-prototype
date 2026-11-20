import { useRef, useState } from 'react';
import { Button, Checkbox, Space, Steps, Table, Typography } from '@douyinfe/semi-ui';
import { Modal, Notice } from './ModelOperationsUI';
import AdminStatus from './AdminStatus';
import { directoryArchivePlan, directoryDisabledKind } from './channel-directory-archive';
import { downloadJsonFile } from './provider-files';

export default function ChannelDirectoryArchive({ state, connections, mode, ops, close, inspect }) {
  const [includeAutomatic, setIncludeAutomatic] = useState(false);
  const [review, setReview] = useState(null);
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const options = { mode, includeAutomatic };
  const cleanup = mode === 'disabled';
  const title = cleanup ? '清理已停用连接' : '批量删除连接';
  const plan = connections.flatMap(row => {
    const kind = directoryDisabledKind(row.endpoint);
    if (cleanup && kind !== 'manual' && !(includeAutomatic && kind === 'automatic')) return [];
    const detail = directoryArchivePlan(state, row.provider.id, row.id, options);
    return [{ id: row.id, name: row.name, provider: row.provider.name,
      status: kind === 'automatic' ? '自动停用' : row.status, ...detail }];
  });
  const [selected, setSelected] = useState(() => plan.filter(row => !row.reason).slice(0, 100).map(row => row.id));
  const ready = plan.filter(row => !row.reason);
  const selection = ready.filter(row => selected.includes(row.id));
  const stale = review && review.some(saved => !ready.some(row => row.id === saved.id && row.signature === saved.signature));
  const receipt = results && new Map(results.map(row => [row.endpointId, row]));
  const display = results ? review.map(row => ({ ...row, outcome: receipt.get(row.id) })) : review || plan;
  const submit = async () => {
    if (!review || stale || lock.current || !ops.can) return;
    lock.current = true;
    setBusy(true);
    try {
      const next = await ops.run('channelDirectoryArchive', { ...options, confirmed: true,
        targets: review.map(row => ({ ...row.target, signature: row.signature })) });
      if (next?.audits[0]?.archiveResults) setResults(next.audits[0].archiveResults);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const exportRows = () => downloadJsonFile(display.map(row => ({
    connectionId: row.id, name: row.name, providerId: row.target.providerId, supplier: row.provider,
    connectionStatus: row.status, modelChannels: row.associations, services: row.services, routeReferences: row.routes,
    check: row.reason || '可归档', ...(row.outcome ? { result: row.outcome.status, reason: row.outcome.reason || '' } : {}),
  })), 'channel-archive-review.json');
  return <Modal drawer wide title={title} onClose={() => !busy && close()} footer={<Space wrap>
    <Button disabled={busy} onClick={close}>{results ? '完成' : '取消'}</Button>
    <Button disabled={busy || !display.length} onClick={exportRows}>{results ? '导出结果' : '导出核对清单'}</Button>
    {review && !results && <Button disabled={busy} onClick={() => { setReview(null); ops.setError(''); }}>返回检查</Button>}
    {!results && <Button theme="solid" type={review ? 'danger' : 'primary'} loading={busy}
      disabled={!ops.can || busy || (review ? stale : !selection.length || selection.length > 100)}
      onClick={review ? submit : () => setReview(selection)}>{review ? '确认归档所选连接' : '下一步：风险确认'}</Button>}
    {results?.some(row => row.status !== '已归档') && <Button disabled={!ops.can}
      onClick={() => { setSelected(results.filter(row => row.status !== '已归档').map(row => row.endpointId)); setReview(null); setResults(null); }}>复核未归档项</Button>}
  </Space>}>
    <Steps type="basic" current={results ? 2 : review ? 1 : 0}><Steps.Step title="关联检查"/><Steps.Step title="风险确认"/><Steps.Step title="归档结果"/></Steps>
    {cleanup && !review && <Checkbox checked={includeAutomatic} onChange={event => {
      const checked = event.target.checked;
      setIncludeAutomatic(checked);
      if (!checked) setSelected(ids => ids.filter(id => !plan.some(row => row.id === id && row.kind === 'automatic')));
    }}>同时检查自动停用</Checkbox>}
    {results ? <Typography.Paragraph>已归档 {results.filter(row => row.status === '已归档').length} 条 · 已跳过 {results.filter(row => row.status === '已跳过').length} 条 · 失败 {results.filter(row => row.status === '失败').length} 条</Typography.Paragraph>
      : review ? <Notice>确认归档 {review.length} 条连接。归档后，这些连接会从当前目录移除。服务商、模型资料、采购报价、调用记录和测试回执继续可查。</Notice>
        : <Typography.Paragraph>检查到 {plan.length} 条连接，其中 {ready.length} 条可直接归档，已选择 {selection.length} 条。</Typography.Paragraph>}
    <Table size="small" rowKey="id" dataSource={display} pagination={{ pageSize: 10, hideOnSinglePage: true }}
      rowSelection={review ? undefined : { selectedRowKeys: selection.map(row => row.id), onChange: setSelected,
        getCheckboxProps: record => ({ disabled: Boolean(record.reason) }) }}
      empty={cleanup ? '当前范围内没有已停用的连接' : '所选连接已变化，请重新选择'} columns={[
        { title: '连接名称', dataIndex: 'name' }, { title: '服务商', dataIndex: 'provider' },
        { title: '状态', render: (_, row) => <AdminStatus value={row.status}/> },
        { title: '影响检查', render: (_, row) => row.outcome?.status === '已归档' ? '历史记录已保留' :
          row.outcome?.reason || row.reason || `${row.associations} 条模型渠道 · 可归档` },
        ...(results ? [{ title: '归档结果', render: (_, row) => <AdminStatus value={row.outcome?.status || '待核对'}/> }]
          : review ? [] : [{ title: '操作', render: (_, row) => row.reason && <Button theme="borderless" size="small"
            onClick={event => inspect(event, row.id)}>检查关联</Button> }]),
      ]}/>
    {stale && !results && <Notice error>连接或引用范围已变化，请返回检查。</Notice>}
    {ops.error && <Notice error>{ops.error}</Notice>}
  </Modal>;
}
