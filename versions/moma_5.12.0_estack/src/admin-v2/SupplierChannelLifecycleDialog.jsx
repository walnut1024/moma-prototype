import { useRef, useState } from 'react';
import { Banner, Button, Checkbox, Space, Table, Typography } from '@douyinfe/semi-ui';
import { Modal, CopyId } from './ModelOperationsUI';
import { supplierChannelLifecyclePlan } from './supplier-channel-batch';
import { channelIdentity } from '../model-identities.mjs';

export default function SupplierChannelLifecycleDialog({ state, provider, associationIds, action, ops, close, modelOnly = false }) {
  let plan, error;
  try { plan = supplierChannelLifecyclePlan(state, provider.id, associationIds, action, { modelOnly }); } catch (issue) { error = issue.message; }
  const [signature] = useState(plan?.signature), [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false);
  const saving = useRef(false), verb = action === 'enable' ? '启用' : '停用';
  const stale = signature !== plan?.signature;
  const disabled = !ops.can || Boolean(ops.conflict) || busy || !plan || stale || Boolean(plan.blockers.length);
  const submit = async () => {
    if (saving.current || disabled || !confirmed) return;
    saving.current = true; setBusy(true);
    try {
      const next = await ops.run('supplierChannelBatchLifecycle', { providerId: provider.id, associationIds, action, modelOnly, expectedSignature: signature, confirmed: true });
      if (next) close();
    } finally { saving.current = false; setBusy(false); }
  };
  return <Modal drawer wide title={modelOnly ? verb + '模型渠道' : '批量' + verb + '渠道'} description={provider.name} onClose={() => !busy && close()}
    footer={<Space><Button disabled={busy} onClick={close}>取消</Button><Button theme="solid" type={action === 'disable' ? 'danger' : 'primary'} disabled={disabled || !confirmed} loading={busy} onClick={submit}>确认{verb}</Button></Space>}>
    {error ? <Banner type="danger" description={error}/> : <>
      <Typography.Paragraph>已选 {plan.selected.length} 条渠道，涉及 {plan.connections.length} 个连接。{action === 'enable' ? '启用前校验当前连接及每款模型的有效测试；不自动启用其他渠道或上架。' : '仅停用所选模型渠道，不停用共享连接；相关服务可能暂时不可用。'}</Typography.Paragraph>
      <Table size="small" rowKey="id" pagination={false} scroll={{ x: 900 }} dataSource={plan.selected} columns={[
        { title: '渠道名称', render: (_, row) => row.sourceName || row.name },
        { title: '渠道 ID', width: 260, render: (_, row) => <CopyId copyAtStart ellipsis value={channelIdentity(state, row.id)} label="渠道 ID"/> },
        { title: '上游模型调用标识', dataIndex: 'upstreamModelId' },
        { title: '当前启用状态', render: (_, row) => row.enabled ? '已启用' : '已停用' },
      ]}/>
      {plan.shared.length > 0 && <><Typography.Title heading={6}>共用连接的其他渠道（{plan.shared.length}）</Typography.Title>
        <Table size="small" rowKey="id" pagination={false} dataSource={plan.shared} columns={[
          { title: '渠道名称', render: (_, row) => row.sourceName || row.name }, { title: '上游模型调用标识', dataIndex: 'upstreamModelId' }, { title: '影响', dataIndex: 'effect' },
        ]}/></>}
      {plan.references.rows.length > 0 && <><Typography.Title heading={6}>关联模型服务</Typography.Title>
        <Table size="small" rowKey="id" pagination={false} dataSource={plan.references.rows} columns={[
          { title: '模型服务', dataIndex: 'name' }, { title: '模型调用标识', dataIndex: 'callId' },
          { title: '当前状态', render: (_, row) => `${row.callsEnabled ? '已启用' : '已停服'} · ${row.listed ? '已上架' : '未上架'}` },
        ]}/></>}
      {action === 'disable' && plan.serviceImpact.map(row => <Banner key={row.id} type="warning" description={`${row.name}：${row.unavailable ? '停用后当前路由没有其他可用渠道' : '其他可用渠道继续服务'}。`}/>)}
      {plan.blockers.map(message => <Banner key={message} type="danger" description={message}/>)}
      {stale && <Banner type="danger" description="渠道或引用范围已变化，请关闭后重新选择。"/>}
      <Checkbox checked={confirmed} disabled={disabled} onChange={event => setConfirmed(event.target.checked)}>我已核对所选渠道、关联服务及共享连接影响，确认{verb}</Checkbox>
    </>}
    {ops.error && <Banner type="danger" description={ops.error}/>}
  </Modal>;
}
