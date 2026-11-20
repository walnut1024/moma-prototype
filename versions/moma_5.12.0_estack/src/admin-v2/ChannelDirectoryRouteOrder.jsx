import { useState } from 'react';
import { Button, InputNumber, Space, Table, Typography } from '@douyinfe/semi-ui';
import { Modal, Notice } from './ModelOperationsUI';
import { routeDirectoryOrder } from './service-routing';

export default function ChannelDirectoryRouteOrder({ state, service, groupId, href, ops, close }) {
  let plan, error;
  try { plan = routeDirectoryOrder(state, service, groupId); } catch (failure) { error = failure.message; }
  const [original] = useState(() => plan?.rows || []);
  const [signature] = useState(plan?.signature);
  const [order, setOrder] = useState(() => original.map(row => row.supplyId));
  const [weights, setWeights] = useState(() => Object.fromEntries(original.map(row => [row.supplyId, row.weight])));
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(null);
  const stale = !plan || plan.signature !== signature;
  const reordered = order.some((id, index) => id !== original[index]?.supplyId);
  const changed = reordered || original.some(row => weights[row.supplyId] !== row.weight);
  const restricted = !ops.can || busy || stale;
  const move = (id, offset) => {
    const from = order.indexOf(id), to = from + offset;
    if (restricted || from < 0 || to < 0 || to >= order.length || from === to) return;
    const sorted = order.slice();
    sorted.splice(from, 1); sorted.splice(to, 0, id);
    setOrder(sorted); ops.dirty(true);
  };
  const save = async () => {
    setBusy(true);
    try {
      const next = await ops.run('serviceRouteDirectoryOrder', { serviceId: service.id, groupId, expectedVersion: plan.version,
        expectedSignature: signature, order, weights, confirmed: true });
      if (next) close();
    } finally { setBusy(false); }
  };
  return <Modal drawer wide title="配置路由优先级" description={service.callId + ' · ' + (plan?.group.name || groupId)}
    onClose={() => !busy && ops.proceed(close)} footer={<Space wrap>
      <Button disabled={busy} onClick={() => ops.proceed(close)}>关闭</Button>
      <Button disabled={restricted || !changed} onClick={() => {
        setOrder(original.map(row => row.supplyId)); setWeights(Object.fromEntries(original.map(row => [row.supplyId, row.weight]))); ops.dirty(false);
      }}>恢复原顺序和权重</Button>
      <Button onClick={() => window.open(href, '_blank', 'noopener')}>打开服务路由（新页签）</Button>
      <Button theme="solid" loading={busy} disabled={restricted || !changed} onClick={save}>保存该分组的路由草稿</Button>
    </Space>}>
    <Notice>数值越小越优先。拖动行或使用上移、下移，候选优先级按新顺序生成。保存后可到服务路由验证并发布。</Notice>
    {stale && <Notice error>{error || '当前路由已变化，请关闭后重新打开。'}</Notice>}
    <Table size="small" rowKey="supplyId" dataSource={order.map(id => original.find(row => row.supplyId === id))} pagination={false}
      onRow={(row, index) => ({ draggable: !restricted && order.length > 1,
        onDragStart: event => { if (event.target.closest('button, input')) { event.preventDefault(); return; }
          setDragging(row.supplyId); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', row.supplyId); },
        onDragOver: event => { if (dragging && !restricted) event.preventDefault(); },
        onDragEnd: () => setDragging(null), onDrop: event => {
          if (!dragging || restricted) return;
          event.preventDefault(); move(dragging, index - order.indexOf(dragging)); setDragging(null);
        },
      })} columns={[
        { title: '连接', render: (_, row) => row.channel?.endpoint?.name || row.channel?.channelName || '关联已变化' },
        { title: '当前优先级', dataIndex: 'priority' },
        { title: '候选优先级', render: (_, row, index) => reordered ? index + 1 : row.priority },
        { title: '权重', render: (_, row) => <InputNumber aria-label={'权重 ' + (row.channel?.endpoint?.name || row.supplyId)} min={0} precision={2}
          value={weights[row.supplyId]} disabled={restricted} onChange={value => { setWeights(previous => ({ ...previous, [row.supplyId]: value })); ops.dirty(true); }}/> },
        { title: '键盘操作', render: (_, row, index) => <Space>
          <Button size="small" theme="borderless" disabled={restricted || index === 0} aria-label={'上移 ' + (row.channel?.endpoint?.name || row.supplyId)} onClick={() => move(row.supplyId, -1)}>上移</Button>
          <Button size="small" theme="borderless" disabled={restricted || index === order.length - 1} aria-label={'下移 ' + (row.channel?.endpoint?.name || row.supplyId)} onClick={() => move(row.supplyId, 1)}>下移</Button>
        </Space> },
      ]}/>
    {!original.length && <Typography.Paragraph>此分组没有可排序渠道。</Typography.Paragraph>}
    {ops.error && <Notice error>{ops.error}</Notice>}
  </Modal>;
}
