import { useChannelText } from './channel-language';
import { resourceId } from '../resource-id.mjs';
import AdminStatus from './AdminStatus';
import Table from './AdminTable';
import { useId, useState } from 'react';
import Descriptions from './AdminDescriptions';
import { Banner, Button, Card, Form, Input, Space, Toast, Typography } from '@douyinfe/semi-ui';
import { AdminModal as Modal } from './AdminOverlay';
import { IconPlus, IconSearch, IconUpload } from '@douyinfe/semi-icons';
import { DEFAULT_PAGE_SIZE, FilterReset, FilterToolbar, PAGE_SIZES } from '../components/FilterControls';
import OperationInputDialog from '../components/OperationInputDialog';
import { displayAdminBusinessCopy } from '../display-copy.mjs';
import AdminPageHeading from './AdminPageHeading';
import { Choice } from './ServiceUI';
import { latestRequests, requestIdentity } from '../request-identity.mjs';
import { requestCharge } from '../project-call.mjs';
import { usageMeter, usageValue } from './usage-analysis.js';
import { canMutate } from './store';
import { routingServices } from './service-routing.js';
import { billingPeriod } from './mock-billing.js';
import { customerKeys, projectBillAmount, yuanMicros } from './customer-projects.mjs';


const { Text, Title } = Typography;
const titles = { goods: '商品与套餐', orders: '订购记录', metering: '消费明细',
  ledger: '账户与额度流水', bills: '账单', settlement: '服务商对账与结算', adjustments: '退款与调账' };
const configs = {
  goods: { noun: '商品', collection: 'products', fields: [
    ['code', '商品编码'], ['name', '商品名称'], ['billingMode', '计费方式'], ['price', '基础价格', 'number'],
  ] },
};
const editable = (state, collection) => !state.commerceReadOnly && !state.storageError && canMutate(state.currentRole, { type: 'update', collection });
const statusColumn = { title: '状态', dataIndex: 'status', width: 100, render: value => <AdminStatus value={value === '草稿' ? '未发布' : value}/> };
const money = amount => amount == null ? '—' : `¥${amount}`;
const actionColumn = render => ({ title: '操作', key: 'actions', width: 155, render: (_, row) => render(row) });

function BusinessTable({ rows, columns, minWidth = 850, children, empty = '暂无记录', tableKey, rowKey = 'id' }) {
  const [size, setSize] = useState(DEFAULT_PAGE_SIZE);
  return <Card>
    {children}
    <Table key={tableKey} size="small" rowKey={rowKey} dataSource={rows} columns={columns} scroll={{ x: `max(100%, ${minWidth}px)` }}
      empty={empty} pagination={{ pageSize: size, pageSizeOpts: PAGE_SIZES, showSizeChanger: true, showTotal: true, onPageSizeChange: setSize }}/>
  </Card>;
}

function Managed({ pageId, state, dispatch }) {
  const translateLabel = useChannelText();
  const formId = useId();
  const { collection, fields, noun } = configs[pageId];
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
      render: value => Array.isArray(value) ? value.length : displayAdminBusinessCopy(value),
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
    if (await dispatch({ type: 'add', collection, record: { id: resourceId('product'), ...record, status: '已启用' } })) close();
  };
  return <>
    <AdminPageHeading title={title}>
      <Button theme="solid" icon={<IconPlus aria-hidden="true"/>} disabled={!canWrite} onClick={() => setEditing(true)}>新建{noun}</Button>
    </AdminPageHeading>
    <BusinessTable tableKey={query} rows={rows} columns={columns} minWidth={760} empty={query ? '没有符合条件的记录' : '暂无记录'}>
      <FilterToolbar className="admin-list-toolbar">
        <Input className="admin-list-search" showClear prefix={<IconSearch aria-hidden="true"/>} aria-label={`搜索${title}`}
          placeholder={`搜索${title}`} value={query} onChange={setQuery}/>
        <FilterReset onClick={() => setQuery('')}/>
      </FilterToolbar>
    </BusinessTable>
    {editing && <Modal visible title={`新建${noun}`} width="min(520px, calc(100vw - 32px))"
      maskClosable={false} closeOnEsc footer={<>
        <Button onClick={close}>{translateLabel("取消")}</Button>
        <Button form={formId} htmlType="submit" theme="solid" disabled={!canWrite}>创建{noun}</Button>
      </>} onCancel={close}>
      <Form id={formId} onSubmit={save} onValueChange={() => setError('')}>
        {fields.map(([field, label, type]) => <Form.Input key={field} field={field} label={label} type={type || 'text'}/>)}
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
    if (!product || !tenant) return Toast.error('缺少可订购商品或租户');
    dispatch({ type: 'add', collection: 'orders', record: {
      id: resourceId('order'), orderNo: `ORD-${Date.now()}`, tenantId: tenant.id, productId: product.id, amount: product.price,
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
      { title: '所属租户', render: (_, order) => state.tenants.find(item => item.id === order.tenantId)?.name || '未记录' },
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
  const keys = customerKeys(state);
  const [keyId, setKeyId] = useState(keys.find(row => row.status === '有效')?.id || '');
  const [modelId,setModelId]=useState(routingServices(state).find(row=>row.callId)?.callId || '');
  const [result, setResult] = useState(null);
  const key = keys.find(row => row.id === keyId);
  const models = new Map(state.models.map(model => [model.id, model]));
  const modelFor = row => models.get(row.modelId) || { type:row.modelType };
  const run = async () => {
    if (!key) return;
    try {
      const requestId = crypto.randomUUID();
      const identity = requestIdentity({ tenantId:key.tenantId, requestId });
      const next = await dispatch({ type: 'simulateInvocation', data: { requestId, keyId, modelId, purpose: 'metering-test' }, feedback: false });
      if (!next) return;
      const request = next.requests.find(row => requestIdentity(row) === identity && row.keyId === key.id && row.projectId === key.projectId);
      if (!request) { setResult({ failed:true, message:'未查到当前项目的调用结果，请重新载入核对。' }); return; }
      const { httpStatus, attempts } = request;
      setResult({ failed: httpStatus >= 400, message: `HTTP ${httpStatus} · ${requestId} · ${request.error || attempts?.at(-1)?.error || '模拟计量完成'}` });
    } catch (error) { setResult({ failed: true, message: error.message }); }
  };
  return <>
    <AdminPageHeading title={titles.metering}/>
    <Card title={<Title heading={5} component="h2">调用测试</Title>}>
      <div className="admin-analytics-fields">
        <FilterToolbar>
          <Choice label="调用测试 API 密钥" value={keyId} options={keys.map(row => [row.id, row.keyId])} onChange={setKeyId}/>
          <Choice label="调用测试模型" value={modelId} options={routingServices(state).filter(row=>row.callId).map(row=>[row.callId,row.callId])} onChange={setModelId}/>
          <Button theme="solid" disabled={!key || !modelId || !editable(state, 'requests')} onClick={run}>发送请求</Button>
        </FilterToolbar>
        {result && <Banner type={result.failed ? 'danger' : 'success'} closeIcon={null} description={result.message}/>}
      </div>
    </Card>
    <BusinessTable rows={latestRequests(state.requests).toSorted((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 40)}
      rowKey={requestIdentity} minWidth={1080} columns={[
      { title: 'Request ID', dataIndex: 'requestId', render: value => <Text code>{value}</Text> },
      { title: '所属租户', render: (_, row) => state.tenants.find(tenant => tenant.id === row.tenantId)?.name },
      { title: '项目', render: (_, row) => state.projects.find(project => project.id === row.projectId && project.tenantId === row.tenantId)?.name || row.projectId || '未归属' },
      { title: 'Model ID', render: (_, row) => row.publicModelId || modelFor(row).modelId || row.modelId || '—' },
      { title: '计量用量', align:'right', render: (_, row) => {
        const meter = usageMeter(modelFor(row), row);
        const value = usageValue(row, meter.fields);
        return value.complete ? value.total.toLocaleString('zh-CN') + ' ' + meter.unit : '未记录';
      } },
      { title: '价格快照', render: (_,row) => row.priceVersionId || '未记录' },
      { title: '金额', align: 'right', render: (_, row) => {
        const charge = requestCharge(state, row, modelFor(row));
        return !charge ? '未记录' : charge.currency === 'CNY' ? yuanMicros(charge.micros) : charge.currency + ' ' + charge.micros / 1_000_000;
      } },
      { ...statusColumn, dataIndex: 'httpStatus', render: value => <AdminStatus value={value === 200 ? '已计量' : '不计费'}/> },
    ]}/>
  </>;
}

function Ledger({ state }) {
  const owners = new Map((state.apiKeys || []).map(key => [key.id, 'API 密钥']));
  for (const tenant of state.tenants) owners.set(tenant.id, '租户');
  const accountLabel = (id, row) => {
    const kind = owners.get(id) || { '调用扣减': 'API 密钥', '企业额度扣减': '租户', '套餐抵扣': '套餐' }[row.type];
    return kind ? kind + ' · ' + id : id;
  };
  const count = (value, row) => [value?.toLocaleString(), row.unit].filter(Boolean).join(' ') || '—';
  return <>
    <AdminPageHeading title={titles.ledger}/>
    <BusinessTable rows={state.ledger} minWidth={980} columns={[
      { title: '流水 ID', dataIndex: 'id', render: value => <Text code>{value}</Text> },
      { title: '额度归属', dataIndex: 'accountId', render: accountLabel },
      { title: '来源', dataIndex: 'sourceId' },
      { title: '类型', dataIndex: 'type' },
      { title: '变动', dataIndex: 'delta', align: 'right', render: count },
      { title: '余额', dataIndex: 'balance', align: 'right', render: count },
      { title: '原因', dataIndex: 'reason' },
      statusColumn,
    ]}/>
  </>;
}

function Bills({ state, dispatch, params }) {
  const translateLabel = useChannelText();
  const [inspectId, setInspectId] = useState(null);
  const canWrite = editable(state, 'bills');
  const period = billingPeriod();
  const customerId = params.get('tenant') || '';
  const projectId = params.get('project') || '';
  const selectedPeriod = params.get('period') || '';
  const tenants = new Map(state.tenants.map(row => [row.id, row]));
  const projects = state.projects.filter(row => !customerId || row.tenantId === customerId);
  const project = projects.find(row => row.id === projectId);
  const scopeInvalid = (customerId && !tenants.has(customerId)) || (projectId && !project);
  const scopedTenant = customerId || project?.tenantId || '';
  const customerBills = state.bills.filter(row => !scopeInvalid && (!scopedTenant || row.tenantId === scopedTenant));
  const periods = [...new Set(customerBills.map(row => row.period).filter(Boolean))].sort().reverse();
  const rows = customerBills.filter(row => (!selectedPeriod || row.period === selectedPeriod) &&
    (!project || projectBillAmount(row, project.id) !== null))
    .toSorted((left, right) => String(right.period || '').localeCompare(String(left.period || '')));
  const inspect = rows.find(row => row.id === inspectId);
  const select = patch => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setInspectId(null);
    location.hash = '#/admin-2/bills' + (next.size ? '?' + next : '');
  };
  const billItems = inspect && Array.isArray(inspect.projectBreakdown) ? [
    ...inspect.projectBreakdown.map(entry => ({
      id:'project:' + entry.projectId, name:entry.projectName || entry.projectId, projectId:entry.projectId, amountMicros:entry.amountMicros,
    })),
    ...(inspect.unassignedMicros > 0 ? [{ id:'unassigned', name:'未归属项目', amountMicros:inspect.unassignedMicros }] : []),
  ] : null;
  return <>
    <AdminPageHeading title={titles.bills}>
      <Button theme="solid" disabled={!canWrite || scopeInvalid} onClick={() => dispatch({type:'generateBills', ...(scopedTenant && {tenantId:scopedTenant})})}>生成 {period} 模拟账单</Button>
    </AdminPageHeading>
    {scopeInvalid && <Banner type="warning" closeIcon={null} description="所选租户或项目不存在，请调整筛选条件。"/>}
    <BusinessTable rows={rows} minWidth={project ? 1110 : 940} tableKey={params.toString()} columns={[
      { title: '账单号', dataIndex: 'billNo', width: 240 },
      { title: '所属租户', render: (_, row) => tenants.get(row.tenantId)?.name || row.tenantId },
      { title: '账期', dataIndex: 'period' },
      { title: '租户应收', dataIndex: 'amount', align: 'right', render: money },
      ...(project ? [{ title: '项目金额', align: 'right', render: (_, row) => yuanMicros(projectBillAmount(row, project.id)) }] : []),
      { title: '优惠', dataIndex: 'discount', align: 'right', render: money },
      { title: '实收', dataIndex: 'paid', align: 'right', render: money },
      statusColumn,
      actionColumn(row => <Space>
        <Button size="small" theme="borderless" onClick={() => setInspectId(row.id)}>{translateLabel("详情")}</Button>
        {row.status === '待出账' && <Button size="small" theme="borderless" disabled={!canWrite}
          onClick={() => dispatch({ type:'update', collection:'bills', id:row.id, changes:{ status:'已出账' } })}>确认出账</Button>}
      </Space>),
    ]}>
      <FilterToolbar>
        <Choice label="账单租户" value={scopedTenant} options={[[ '', '全部租户' ],
          ...state.tenants.map(row => [row.id, row.name]), ...(customerId && !tenants.has(customerId) ? [[customerId, '租户不存在']] : [])]}
          onChange={tenant => select({ tenant, project:'', period:'' })}/>
        <Choice label="账单项目" value={projectId} options={[[ '', '全部项目' ],
          ...projects.map(row => [row.id, scopedTenant ? row.name : row.name + ' · ' + (tenants.get(row.tenantId)?.name || row.tenantId)]),
          ...(projectId && !project ? [[projectId, '项目不存在']] : [])]}
          onChange={id => select({ tenant:customerId || projects.find(row => row.id === id)?.tenantId || '', project:id, period:'' })}/>
        <Choice label="账期" value={selectedPeriod} options={[[ '', '全部账期' ], ...periods.map(value => [value, value]),
          ...(selectedPeriod && !periods.includes(selectedPeriod) ? [[selectedPeriod, selectedPeriod]] : [])]}
          onChange={value => select({ period:value })}/>
        <FilterReset onClick={() => select({ tenant:'', project:'', period:'' })}/>
      </FilterToolbar>
    </BusinessTable>
    {inspect && <Modal visible title="账单详情" width="min(680px, calc(100vw - 32px))" onCancel={() => setInspectId(null)}
      closeOnEsc maskClosable={false} footer={<Button onClick={() => setInspectId(null)}>{translateLabel("关闭")}</Button>}>
      <div className="admin-analytics-fields">
        <Descriptions align="left" data={[
          { key:'账单号', value:inspect.billNo }, { key:'所属租户', value:tenants.get(inspect.tenantId)?.name || inspect.tenantId },
          { key:'账期', value:inspect.period }, { key:'租户应收', value:money(inspect.amount) },
        ]}/>
        <Title heading={5}>项目费用明细</Title>
        {billItems ? <Table size="small" rowKey="id" dataSource={billItems} pagination={false} empty="本期没有已归集的项目费用"
          columns={[
            { title:'项目', dataIndex:'name' }, { title:'项目 ID', dataIndex:'projectId', render:value => value || '—' },
            { title:'金额', dataIndex:'amountMicros', align:'right', render:yuanMicros },
          ]}/> : <Text type="secondary">该账单未记录项目费用明细。</Text>}
      </div>
    </Modal>}
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

const pages = { goods: Managed, orders: Orders, metering: Metering, ledger: Ledger,
  bills: Bills, settlement: Settlements, adjustments: Adjustments };

export default function BusinessOperationsPage({ pageId, state, dispatch, params = new URLSearchParams() }) {
  const Page = pages[pageId];
  return Page ? <div className="admin-page-stack"><Page pageId={pageId} state={state} dispatch={dispatch} params={params}/></div> : null;
}
