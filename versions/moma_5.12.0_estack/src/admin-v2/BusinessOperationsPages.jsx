import AdminStatus from './AdminStatus';
import Table from './AdminTable';
import { useId, useState } from 'react';
import { Banner, Button, Card, Form, Input, Space, Toast, Typography } from '@douyinfe/semi-ui';
import { AdminModal as Modal } from './AdminOverlay';
import { IconPlus, IconSearch, IconUpload } from '@douyinfe/semi-icons';
import { DEFAULT_PAGE_SIZE, FilterReset, FilterToolbar, PAGE_SIZES } from '../components/FilterControls';
import OperationInputDialog from '../components/OperationInputDialog';
import { displayBusinessCopy } from '../display-copy.mjs';
import AdminPageHeading from './AdminPageHeading';
import { Choice } from './ServiceUI';
import { usageTotal } from './observability';
import { canMutate } from './store';
import { routingServices } from './service-routing.js';
import { mockCharge, billingPeriod } from './mock-billing.js';

const uid = prefix => `${prefix}-${crypto.randomUUID()}`;
const { Text, Title } = Typography;
const titles = { goods: '商品与套餐', orders: '订单与订阅', announcements: '公告与服务通知', metering: '计量明细',
  ledger: '账户与额度流水', bills: '客户账单', settlement: '服务商对账与结算', adjustments: '退款与调账' };
const configs = {
  goods: { collection: 'products', fields: [
    ['code', '商品编码'], ['name', '商品名称'], ['billingMode', '计费方式'], ['price', '基础价格', 'number'],
  ] },
  announcements: { collection: 'announcements', fields: [
    ['title', '标题'], ['audience', '受众'], ['channel', '渠道'], ['effectiveAt', '生效时间', 'date'],
  ] },
};
const editable = (state, collection) => !state.storageError && canMutate(state.currentRole, { type: 'update', collection });
const statusColumn = { title: '状态', dataIndex: 'status', width: 100, render: value => <AdminStatus value={value === '草稿' ? '未发布' : value}/> };
const money = amount => amount == null ? '—' : `¥${amount}`;
const actionColumn = render => ({ title: '操作', key: 'actions', width: 155, render: (_, row) => render(row) });

function BusinessTable({ rows, columns, minWidth = 850, children, empty = '暂无记录', tableKey }) {
  const [size, setSize] = useState(DEFAULT_PAGE_SIZE);
  return <Card>
    {children}
    <Table key={tableKey} size="small" rowKey="id" dataSource={rows} columns={columns} scroll={{ x: `max(100%, ${minWidth}px)` }}
      empty={empty} pagination={{ pageSize: size, pageSizeOpts: PAGE_SIZES, showSizeChanger: true, showTotal: true, onPageSizeChange: setSize }}/>
  </Card>;
}

function Managed({ pageId, state, dispatch }) {
  const formId = useId();
  const { collection, fields } = configs[pageId];
  const title = titles[pageId];
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const canWrite = editable(state, collection);
  const rows = state[collection].filter(row => row.billingType !== 'package'
    && Object.values(row).join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  const toggle = row => dispatch({ type: 'update', collection, id: row.id,
    changes: { status: ['已启用', '已上架', '生效中'].includes(row.status) ? '停用' : '已启用' } });
  const columns = [
    ...fields.map(([dataIndex, title, type]) => ({
      title, dataIndex, align: type === 'number' ? 'right' : 'left',
      render: value => Array.isArray(value) ? value.length : displayBusinessCopy(value),
    })),
    statusColumn,
    actionColumn(row => <Button size="small" theme="borderless" disabled={!canWrite} onClick={() => toggle(row)}>
      {row.status === '停用' ? '启用' : '变更状态'}
    </Button>),
  ];
  const close = () => { setEditing(false); setError(''); };
  const save = async values => {
    const record = { ...values };
    for (const [field, label, type] of fields) {
      if (type === 'number') {
        record[field] = Number(values[field]);
        if (record[field] < 0) return setError(`${label}不能为负数`);
      }
      if (!record[field]) return setError('请填写全部必填项');
    }
    if (await dispatch({ type: 'add', collection, record: { id: uid(collection), ...record, status: '已启用' } })) close();
  };
  return <>
    <AdminPageHeading title={title}>
      <Button theme="solid" icon={<IconPlus aria-hidden="true"/>} disabled={!canWrite} onClick={() => setEditing(true)}>新建</Button>
    </AdminPageHeading>
    <BusinessTable tableKey={query} rows={rows} columns={columns} minWidth={760} empty={query ? '没有符合条件的记录' : '暂无记录'}>
      <FilterToolbar className="admin-list-toolbar">
        <Input className="admin-list-search" showClear prefix={<IconSearch aria-hidden="true"/>} aria-label={`搜索${title}`}
          placeholder={`搜索${title}`} value={query} onChange={setQuery}/>
        <FilterReset onClick={() => setQuery('')}/>
      </FilterToolbar>
    </BusinessTable>
    {editing && <Modal visible title={`新建${title}`} width="min(520px, calc(100vw - 32px))"
      maskClosable={false} closeOnEsc footer={<>
        <Button onClick={close}>取消</Button>
        <Button form={formId} htmlType="submit" theme="solid" disabled={!canWrite}>保存</Button>
      </>} onCancel={close}>
      <Form id={formId} onSubmit={save} onValueChange={() => setError('')}>
        {fields.map(([field, label, type]) => type === 'date'
          ? <Form.DatePicker key={field} field={field} label={label} type="date" format="yyyy-MM-dd" onChangeWithDateFirst={false} zIndex={1200}/>
          : <Form.Input key={field} field={field} label={label} type={type || 'text'}/>)}
        {error && <Banner type="danger" closeIcon={null} description={error}/>}
      </Form>
    </Modal>}
  </>;
}

function Orders({ state, dispatch }) {
  const canWrite = editable(state, 'orders');
  const productFor=order=>order.product || state.products.find(item=>item.id===order.productId);
  const rows = state.orders.filter(order => (order.billingType || productFor(order)?.billingType) !== 'package');
  const create = () => {
    const product = state.products.find(item => item.code === 'TOKEN-100M' && item.status === '已上架');
    const tenant = state.tenants[0];
    if (!product || !tenant) return Toast.error('缺少可订购商品或客户');
    dispatch({ type: 'add', collection: 'orders', record: {
      id: uid('order'), orderNo: `ORD-${Date.now()}`, tenantId: tenant.id, productId: product.id, amount: product.price,
      entitlement: 100000000, quotaUnit: 'Token', status: '待开通', timeline: ['订单创建'],
    } });
  };
  const activate = order => dispatch({ type: 'activateOrder', id: order.id });
  const cancel = order => order.marketOrder ? dispatch({type:'cancelMarketOrder',id:order.id}) : dispatch({ type: 'update', collection: 'orders', id: order.id,
    changes: { status: '已退订', timeline: [...(order.timeline ?? []), '用户退订'] } });
  return <>
    <AdminPageHeading title={titles.orders}>
      <Button theme="solid" icon={<IconPlus aria-hidden="true"/>} disabled={!canWrite} onClick={create}>创建订单</Button>
    </AdminPageHeading>
    <BusinessTable rows={rows} minWidth={1100} columns={[
      { title: '订单号', dataIndex: 'orderNo', render: value => value || '—' },
      { title: '租户', render: (_, order) => state.tenants.find(item => item.id === order.tenantId)?.name || '未记录' },
      { title: '商品', render: (_, order) => order.serviceName || productFor(order)?.name || '未记录' },
      { title: '金额', dataIndex: 'amount', align: 'right', render: amount =>
        Number.isFinite(amount) ? money(amount.toLocaleString('zh-CN')) : '未记录' },
      { title: '权益', render: (_, order) => {
        const product = productFor(order);
        if ((order.billingType || product?.billingType) === 'payg' || product?.billingMode === '按量付费') return '不适用';
        const unit = order.quotaUnit || product?.quotaUnit || (product?.code?.startsWith('TOKEN-') ? 'Token' : '（单位未记录）');
        return Number.isFinite(order.entitlement) ? `${order.entitlement.toLocaleString('zh-CN')} ${unit}` : '未记录';
      } },
      statusColumn,
      { title: '时间线', dataIndex: 'timeline', render: timeline => timeline?.length ? timeline.join(' → ') : '未记录' },
      actionColumn(order => order.status === '待开通'
        ? <Button size="small" theme="borderless" disabled={!canWrite} onClick={() => activate(order)}>开通</Button>
        : ['已开通', '生效中'].includes(order.status) && <Button size="small" theme="borderless" disabled={!canWrite} onClick={() => cancel(order)}>退订</Button>),
    ]}/>
  </>;
}

function Metering({ state, dispatch }) {
  const [keyId, setKeyId] = useState(state.apiKeys.find(row => row.status === '有效')?.id || '');
  const [modelId,setModelId]=useState(routingServices(state).find(row=>row.callId)?.callId || '');
  const [result, setResult] = useState(null);
  const run = async () => {
    try {
      const requestId = crypto.randomUUID();
      const next = await dispatch({ type: 'simulateInvocation', data: { requestId, keyId, modelId, purpose: 'metering-test' }, feedback: false });
      const request = next?.requests.find(row => row.requestId === requestId);
      if (!request) return;
      const { httpStatus, attempts } = request;
      setResult({ failed: httpStatus >= 400, message: `HTTP ${httpStatus} · ${requestId} · ${attempts?.at(-1)?.error || '已计量扣减'}` });
    } catch (error) { setResult({ failed: true, message: error.message }); }
  };
  return <>
    <AdminPageHeading title={titles.metering}/>
    <Card title={<Title heading={5} component="h2">调用测试</Title>}>
      <div className="admin-analytics-fields">
        <FilterToolbar>
          <Choice label="调用测试 API 密钥" value={keyId} options={state.apiKeys.map(row => [row.id, row.keyId])} onChange={setKeyId}/>
          <Choice label="调用测试模型" value={modelId} options={routingServices(state).filter(row=>row.callId).map(row=>[row.callId,row.callId])} onChange={setModelId}/>
          <Button theme="solid" disabled={!keyId || !modelId || !editable(state, 'requests')} onClick={run}>发送请求</Button>
        </FilterToolbar>
        {result && <Banner type={result.failed ? 'danger' : 'success'} closeIcon={null} description={result.message}/>}
      </div>
    </Card>
    <BusinessTable rows={state.requests.slice(0, 40)} minWidth={980} columns={[
      { title: 'Request ID', dataIndex: 'requestId', render: value => <Text code>{value}</Text> },
      { title: '客户', render: (_, row) => state.tenants.find(tenant => tenant.id === row.tenantId)?.name },
      { title: 'Model ID', render: (_, row) => state.models.find(model => model.id === row.modelId)?.modelId },
      { title: '计量项', key: 'usage-fields', dataIndex: 'usage', render: usage => Object.keys(usage || {}).join(' / ') || '—' },
      { title: '数量', dataIndex: 'usage', align: 'right', render: usage => usageTotal(usage).toLocaleString() },
      { title: '价格快照', render: (_,row) => row.priceVersionId || '未记录' },
      { title: '金额', align: 'right', render: (_,row) => { const charge=mockCharge(state,row);return charge?`${charge.currency} ${charge.amount}`:'—'; } },
      { ...statusColumn, dataIndex: 'httpStatus', render: value => <AdminStatus value={value === 200 ? '已计量' : '不计费'}/> },
    ]}/>
  </>;
}

function Ledger({ state }) {
  const count = (value, row) => [value?.toLocaleString(), row.unit].filter(Boolean).join(' ') || '—';
  return <>
    <AdminPageHeading title={titles.ledger}/>
    <BusinessTable rows={state.ledger} minWidth={980} columns={[
      { title: '流水 ID', dataIndex: 'id', render: value => <Text code>{value}</Text> },
      { title: '账户', dataIndex: 'accountId' },
      { title: '来源', dataIndex: 'sourceId' },
      { title: '类型', dataIndex: 'type' },
      { title: '变动', dataIndex: 'delta', align: 'right', render: count },
      { title: '余额', dataIndex: 'balance', align: 'right', render: count },
      { title: '原因', dataIndex: 'reason' },
      statusColumn,
    ]}/>
  </>;
}

function Bills({ state, dispatch }) {
  const canWrite = editable(state, 'bills');
  const period=billingPeriod();
  const generate=()=>dispatch({type:'generateBills'});
  return <>
    <AdminPageHeading title={titles.bills}>
      <Button theme="solid" disabled={!canWrite} onClick={generate}>生成 {period} 模拟账单</Button>
    </AdminPageHeading>
    <BusinessTable rows={state.bills} minWidth={940} columns={[
      { title: '账单号', dataIndex: 'billNo', width: 240 },
      { title: '租户', render: (_, row) => state.tenants.find(tenant => tenant.id === row.tenantId)?.name },
      { title: '账期', dataIndex: 'period' },
      { title: '应收', dataIndex: 'amount', align: 'right', render: money },
      { title: '优惠', dataIndex: 'discount', align: 'right', render: money },
      { title: '实收', dataIndex: 'paid', align: 'right', render: money },
      statusColumn,
      actionColumn(row => row.status === '待出账' && <Button size="small" theme="borderless" disabled={!canWrite}
        onClick={() => dispatch({ type: 'update', collection: 'bills', id: row.id, changes: { status: '已出账' } })}>确认出账</Button>),
    ]}/>
  </>;
}

function Settlements({ state, dispatch }) {
  const [previewed, setPreviewed] = useState(false);
  const canWrite = editable(state, 'settlements');
  const update = (row, changes) => dispatch({ type: 'update', collection: 'settlements', id: row.id, changes });
  return <>
    <AdminPageHeading title={titles.settlement}>
      <Button theme="solid" icon={<IconUpload aria-hidden="true"/>} onClick={() => setPreviewed(true)}>导入对账预览</Button>
    </AdminPageHeading>
    {previewed && <Banner type="info" closeIcon={null} description="导入预览：12 行匹配，1 行金额差异 ¥2.50，0 行格式错误"/>}
    <BusinessTable rows={state.settlements} minWidth={1000} columns={[
      { title: '结算单', dataIndex: 'settlementNo' },
      { title: '服务商', render: (_, row) => state.providers.find(provider => provider.id === row.providerId)?.name },
      { title: '账期', dataIndex: 'period' },
      { title: '平台金额', dataIndex: 'platformAmount', align: 'right', render: money },
      { title: '服务商金额', dataIndex: 'providerAmount', align: 'right', render: money },
      { title: '差异', dataIndex: 'difference', align: 'right', render: money },
      statusColumn,
      actionColumn(row => <Space wrap spacing={4}>
        <Button size="small" theme="borderless" disabled={!canWrite || !previewed || row.difference !== 0}
          onClick={() => update(row, { status: '已确认' })}>确认结算</Button>
        {row.difference !== 0 && <Button size="small" theme="borderless" disabled={!canWrite}
          onClick={() => update(row, { difference: 0, status: '差异已处理' })}>处理差异</Button>}
      </Space>),
    ]}/>
  </>;
}

function Adjustments({ state, dispatch }) {
  const [review, setReview] = useState(null);
  const canWrite = editable(state, 'adjustments');
  const billFor = id => state.bills.find(bill => bill.id === id);
  const decide = reason => {
    const item = state.adjustments.find(row => row.id === review.id);
    if (!item || item.status !== '待审批') throw new Error('申请状态已变化，请重新打开操作');
    const bill = billFor(item.billId);
    if (!bill) throw new Error('关联账单不存在');
    if (review.approved && Math.abs(item.amount) > bill.amount) throw new Error('调账金额不能超过账单应收');
    return dispatch({ type: 'adjustment', id: item.id, approved: review.approved, reason });
  };
  return <>
    <AdminPageHeading title={titles.adjustments}/>
    <BusinessTable rows={state.adjustments} minWidth={940} columns={[
      { title: '申请号', dataIndex: 'adjustmentNo' },
      { title: '账单', render: (_, row) => billFor(row.billId)?.billNo },
      { title: '金额', dataIndex: 'amount', align: 'right', render: money },
      { title: '原因', dataIndex: 'reason' },
      { title: '审批意见', dataIndex: 'approvalReason', render: value => value || '—' },
      statusColumn,
      actionColumn(row => row.status === '待审批' && <Space spacing={4}>
        <Button size="small" theme="borderless" disabled={!canWrite}
          onClick={() => setReview({ id: row.id, number: row.adjustmentNo, approved: true })}>通过并执行</Button>
        <Button size="small" theme="borderless" disabled={!canWrite}
          onClick={() => setReview({ id: row.id, number: row.adjustmentNo, approved: false })}>驳回</Button>
      </Space>),
    ]}/>
    {review && <OperationInputDialog title={review.approved ? '通过调账' : '驳回调账'} description={review.number}
      label="审批意见" onSubmit={decide} onClose={() => setReview(null)}/>}
  </>;
}

const pages = { goods: Managed, announcements: Managed, orders: Orders, metering: Metering, ledger: Ledger,
  bills: Bills, settlement: Settlements, adjustments: Adjustments };

export default function BusinessOperationsPage({ pageId, state, dispatch }) {
  const Page = pages[pageId];
  return Page ? <div className="admin-page-stack"><Page pageId={pageId} state={state} dispatch={dispatch}/></div> : null;
}
