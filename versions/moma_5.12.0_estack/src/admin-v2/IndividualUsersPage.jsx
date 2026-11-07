import AdminStatus from './AdminStatus';
import Table from './AdminTable';
import { useEffect, useState } from 'react';
import { Avatar, Banner, Button, Card, Checkbox, Descriptions, Form, Input, Progress, Space, Tabs, TextArea, Toast, Typography } from '@douyinfe/semi-ui';
import { AdminModal as Modal } from './AdminOverlay';
import { IconSearch } from '@douyinfe/semi-icons';
import { MODEL_ORDER_COLUMNS } from '../model-order-display.mjs';
import { maskApiKey } from '../api-key-utils.mjs';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, normalizePageSize, FilterReset, FilterToolbar } from '../components/FilterControls';
import { displayBusinessCopy } from '../display-copy.mjs';
import AdminPageHeading from './AdminPageHeading';
import { Choice, CopyId, serviceOperationsUi } from './ServiceUI';
import {
  filterIndividualAccounts, individualBillingTypes, individualFreezeScope, individualOrders, individualOrderDisplay,
  individualAccounts, individualName, individualStatus, individualTabs, maskIndividualValue,
} from './individual-users';
import './individual-users.css';

const { Text, Paragraph, Title } = Typography;
const beijingDate = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
});
const time = value => value && Number.isFinite(Date.parse(value)) ? beijingDate.format(new Date(value)) : '未记录';
const quantity = (value, unit) => value == null || String(value).trim() === '' || !Number.isFinite(Number(value)) ? '未记录'
  : Number(value).toLocaleString('zh-CN') + (unit ? ' ' + unit : '（单位未记录）');
const restoreBulkFocus = () => requestAnimationFrame(() => document.getElementById('iu-bulk-action')?.focus());

function AccountStatus({ tenant }) {
  return <AdminStatus value={individualStatus(tenant)}/>;
}

function Facts({ rows }) {
  return <Descriptions align="left" data={rows.map(([key, value]) => ({ key, value }))}/>;
}

function RecordTable({ columns, rows, empty, pagination = false, minWidth = 520 }) {
  return <Table size="small" rowKey="id" dataSource={rows.map(([id, ...cells]) => ({ id, cells }))}
    columns={columns.map((title, index) => ({ title, key: index, render: (_, row) => row.cells[index] }))}
    empty={empty} pagination={pagination} scroll={{ x: `max(100%, ${minWidth}px)` }}/>;
}

function DetailsModal({ title, description, children, close }) {
  return <Modal visible title={title} width="min(600px, calc(100vw - 32px))" closeOnEsc maskClosable={false}
    onCancel={close} footer={<Button onClick={close}>关闭</Button>}>
    <div className="admin-analytics-fields admin-individual-dialog">
      <Paragraph type="secondary">{description}</Paragraph>
      {children}
    </div>
  </Modal>;
}

function UserEditor({ account, transact, canWrite, close, complete }) {
  const [form, setForm] = useState({ nickname: account.user.nickname || '', email: account.user.email || '', notes: account.tenant.notes || '' });
  const [dirty, setDirty] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const change = (field, value) => { setForm(current => ({ ...current, [field]: value })); setDirty(true); setError(''); };
  const requestClose = () => { if (!busy) { if (dirty) setDiscard(true); else close(); } };
  const submit = event => {
    event.preventDefault();
    if (busy || !canWrite || !dirty) return;
    setBusy(true);
    setError('');
    try {
      transact({ type: 'individual', operation: 'edit', tenantId: account.tenant.id, data: form });
      complete('个人用户资料已保存');
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return <>
    <Modal visible title="编辑个人用户资料" width="min(560px, calc(100vw - 32px))" closeOnEsc={!discard}
      maskClosable={false} onCancel={requestClose} footer={null}>
      <form className="admin-individual-dialog" onSubmit={submit}>
        <Paragraph type="secondary">用户 ID：{account.user.id}</Paragraph>
        <Form.Slot label={{ text: '注册手机号', name: 'iu-phone' }}>
          <Input id="iu-phone" readOnly value={maskIndividualValue('phone', account.user.phone)}/>
        </Form.Slot>
        <Form.Slot label={{ text: '昵称', name: 'iu-nickname' }}>
          <Input id="iu-nickname" value={form.nickname} maxLength={40} disabled={!canWrite} onChange={value => change('nickname', value)}/>
        </Form.Slot>
        <Form.Slot label={{ text: '邮箱', name: 'iu-email' }}>
          <Input id="iu-email" type="email" value={form.email} maxLength={120} disabled={!canWrite} onChange={value => change('email', value)}/>
        </Form.Slot>
        <Form.Slot label={{ text: '备注', name: 'iu-notes' }}>
          <TextArea id="iu-notes" value={form.notes} maxLength={500} disabled={!canWrite} onChange={value => change('notes', value)}/>
        </Form.Slot>
        <Paragraph type="secondary">换绑手机号需由用户完成身份验证，用户 ID 保持不变。</Paragraph>
        {error && <Banner type="danger" closeIcon={null} description={error}/>}
        <div className="admin-form-actions">
          <Button onClick={requestClose} disabled={busy}>取消</Button>
          <Button htmlType="submit" theme="solid" loading={busy} disabled={!canWrite || !dirty}>保存</Button>
        </div>
      </form>
    </Modal>
    {discard && serviceOperationsUi.renderLeaveDialog({ cancel: () => setDiscard(false), discard: close })}
  </>;
}

function StatusDialog({ account, accounts, role, transact, canWrite, close, complete }) {
  const bulk = Boolean(accounts);
  const targets = accounts || [account];
  const [status] = useState(bulk || account.tenant.status !== '停用' ? '停用' : '正常');
  const freezing = status === '停用';
  const action = freezing ? '冻结' : '解冻';
  const [reason, setReason] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!challenge) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [challenge]);
  const expired = challenge && now >= challenge.issuedAt + 300000;
  const getCode = () => {
    const issuedAt = Date.now();
    setChallenge({
      code: String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0'), issuedAt,
      scope: bulk ? individualFreezeScope(targets.map(item => item.tenant.id)) : `individual:${account.tenant.id}:freeze`, actor: role,
    });
    setNow(issuedAt);
    setCode('');
    setError('');
  };
  const disabled = !canWrite || !reason.trim() || (freezing && (!challenge || code.length !== 6 || expired));
  const submit = event => {
    event.preventDefault();
    if (busy || disabled) return;
    setBusy(true);
    setError('');
    try {
      transact(bulk
        ? { type: 'individual', operation: 'batch-freeze', tenantIds: targets.map(item => item.tenant.id), data: { reason, code, challenge } }
        : { type: 'individual', operation: 'set-status', tenantId: account.tenant.id, data: { status, reason, code, challenge } });
      complete(bulk ? `已冻结 ${targets.length} 个个人账号` : `个人账号已${action}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return <Modal visible title={bulk ? `批量冻结个人账号（${targets.length} 个）` : `${action}个人账号`}
    width="min(620px, calc(100vw - 32px))" closeOnEsc maskClosable={false} onCancel={close} footer={null}>
    <form className="admin-analytics-fields admin-individual-dialog" onSubmit={submit}>
      {bulk ? <RecordTable columns={['用户 / User ID', '手机号码']}
        rows={targets.map(item => [item.tenant.id, <div className="admin-table-record">
          <Text>{individualName(item)}</Text><Text type="secondary" size="small">{item.tenant.ownerId}</Text>
        </div>, maskIndividualValue('phone', item.user?.phone)])}/>
        : <Facts rows={[
          ['用户', individualName(account)], ['用户 ID', account.tenant.ownerId || '未关联'],
          ['手机号', maskIndividualValue('phone', account.user?.phone)], ['操作角色', role],
        ]}/>}
      <Banner type={freezing ? 'warning' : 'info'} closeIcon={null} description={freezing
        ? '冻结后禁止个人空间访问及个人 API 密钥调用，历史记录和企业成员关系保留。'
        : '解冻后恢复个人空间访问，已单独停用的项目和 API 密钥保持原状态。'}/>
      <Form.Slot label={{ text: `${action}原因`, name: 'iu-reason' }}>
        <TextArea id="iu-reason" required maxLength={500} value={reason} onChange={value => { setReason(value); setError(''); }}/>
      </Form.Slot>
      {freezing && <>
        <Form.Slot label={{ text: '管理员校验码', name: 'iu-code' }}>
          <Space wrap>
            <Input id="iu-code" inputMode="numeric" required value={code} maxLength={6}
              onChange={value => { setCode(value.replace(/\D/g, '').slice(0, 6)); setError(''); }} placeholder="6 位校验码"/>
            <Button onClick={getCode}>{challenge ? '重新获取' : '获取校验码'}</Button>
          </Space>
        </Form.Slot>
        {challenge && <Paragraph type="secondary" role="status">
          {expired ? '校验码已过期，请重新获取' : <>校验码：<Text strong>{challenge.code}</Text> · 5 分钟有效</>}
        </Paragraph>}
      </>}
      {error && <Banner type="danger" closeIcon={null} description={error}/>}
      <div className="admin-form-actions">
        <Button disabled={busy} onClick={close}>取消</Button>
        <Button htmlType="submit" theme="solid" type={freezing ? 'danger' : 'primary'} disabled={disabled} loading={busy}>确认{action}</Button>
      </div>
    </form>
  </Modal>;
}

function SubscriptionDetails({ state, tenantId }) {
  const entries = individualOrders(state, tenantId).map(entry => ({ ...entry, display: individualOrderDisplay(state, entry) }));
  const [billing, setBilling] = useState('all');
  const [status, setStatus] = useState('all');
  const [inspect, setInspect] = useState(null);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(DEFAULT_PAGE_SIZE);
  const statuses = [...new Set(entries.map(item => item.display.status))];
  const records = entries.filter(item =>
    (billing === 'all' || item.billingType === billing) && (status === 'all' || item.display.status === status)
    && [item.display.name, item.display.modelNames, item.order.orderNo, item.order.id]
      .some(value => String(value || '').toLowerCase().includes(query.trim().toLowerCase())));
  const unknown = entries.filter(item => !item.billingType).length;
  const currentPage = Math.min(page, Math.ceil(records.length / size) || 1);
  const hasProgress = inspect && inspect.billingType !== 'payg' && typeof inspect.order.entitlement === 'number'
    && inspect.order.entitlement > 0 && typeof inspect.order.used === 'number' && inspect.order.used >= 0;

  return <div className="admin-analytics-fields">
    <FilterToolbar>
      <Input className="admin-list-search" prefix={<IconSearch aria-hidden="true"/>} showClear aria-label="搜索订购记录"
        value={query} placeholder="搜索模型、套餐或订单编号" onChange={value => { setQuery(value); setPage(1); }}/>
      <Choice label="计费方式" value={billing} options={[[ 'all', '全部计费方式' ], ...Object.entries(individualBillingTypes)]}
        onChange={value => { setBilling(value); setQuery(''); setPage(1); }}/>
      <Choice label="订购状态" value={status} options={[[ 'all', '全部状态' ], ...statuses.map(value => [value, value])]}
        onChange={value => { setStatus(value); setPage(1); }}/>
      <FilterReset onClick={() => { setBilling('all'); setStatus('all'); setQuery(''); setPage(1); }}/>
    </FilterToolbar>
    <RecordTable minWidth={1120} columns={['模型 / 套餐名称', '计费方式', ...MODEL_ORDER_COLUMNS]}
      rows={records.slice((currentPage - 1) * size, currentPage * size).map(entry => {
        const { order, display } = entry;
        return [
          order.id, display.name, individualBillingTypes[entry.billingType] || '未记录', display.type, display.provider, display.tariff,
          display.catalogPrice, <AdminStatus value={display.status}/>,
          time(display.orderedAt), time(display.expiresAt),
          <Button size="small" theme="borderless" aria-label={`查看 ${display.name} 订购详情`} onClick={() => setInspect(entry)}>详情</Button>,
        ];
      })}
      empty={query.trim() || status !== 'all' ? '没有匹配的订购记录' : billing === 'all' ? '暂无订购记录' : `暂无${individualBillingTypes[billing]}记录`}
      pagination={{ currentPage, pageSize: size, total: records.length, pageSizeOpts: PAGE_SIZES, showTotal: true, showSizeChanger: true,
        onPageChange: setPage, onPageSizeChange: value => { setSize(value); setPage(1); } }}/>
    {unknown > 0 && <Paragraph type="secondary">有 {unknown} 条订购记录尚未填写计费类型，可在全部计费方式中查看。</Paragraph>}
    {inspect && <DetailsModal title="订购详情" description={inspect.display.name} close={() => setInspect(null)}>
      <Facts rows={[
        ['订单编号', inspect.order.orderNo || inspect.order.id], ['计费方式', individualBillingTypes[inspect.billingType] || '未记录'],
        ['商品名称', inspect.product?.name || '未记录'], ['模型', inspect.display.modelNames], ['类型', inspect.display.type],
        ['模型服务商', inspect.display.provider], ['资费场景', inspect.display.tariff], ['目录价', inspect.display.catalogPrice],
        ['订购状态', inspect.display.status], ['订购时间', time(inspect.display.orderedAt)], ['生效时间', time(inspect.order.startAt)],
        ['到期时间', time(inspect.display.expiresAt)], ...(inspect.billingType === 'payg' ? [] : [
          ['订购额度', quantity(inspect.order.entitlement, inspect.order.quotaUnit)], ['已用额度', quantity(inspect.order.used, inspect.order.quotaUnit)],
        ]),
      ]}/>
      {hasProgress && <>
        <Text>额度使用情况</Text>
        <Progress aria-label="订购额度使用比例" percent={Math.min(100, inspect.order.used / inspect.order.entitlement * 100)}/>
        <Text type="secondary">剩余 {quantity(Math.max(0, inspect.order.entitlement - inspect.order.used), inspect.order.quotaUnit)}</Text>
      </>}
    </DetailsModal>}
  </div>;
}

function UserDetails({ account, state, tab, navigate, canWrite, setEditor }) {
  const { tenant, user } = account;
  const [inspectKey, setInspectKey] = useState(null);
  const projects = state.projects.filter(item => item.tenantId === tenant.id);
  const keys = state.apiKeys.filter(item => item.tenantId === tenant.id);
  const memberships = state.memberships.filter(member => member.userId === tenant.ownerId)
    .map(member => ({ member, enterprise: state.tenants.find(item => item.id === member.tenantId && ['企业', '政府'].includes(item.type)) }))
    .filter(item => item.enterprise);
  const modelNames = modelIds => (modelIds || []).map(id => state.models.find(model => model.id === id)?.name || id).join('、') || '无';
  const userId = user?.id || tenant.ownerId;
  return <Card>
    <Tabs activeKey={tab} onChange={tab => navigate({ tab }, true)}>
      {Object.entries(individualTabs).map(([id, label]) => <Tabs.TabPane key={id} itemKey={id} tab={label}/>)}
    </Tabs>
    <div className="admin-analytics-fields">
      {tab === 'info' && <>
        <div className="admin-page-heading">
          <Title heading={5} component="h2">用户信息</Title>
          <Button disabled={!canWrite || !user} onClick={() => setEditor(true)}>编辑信息</Button>
        </div>
        <Facts rows={[
          ['用户 ID', userId ? <CopyId value={userId} label="用户 ID"/> : '未关联'],
          ['手机号码', maskIndividualValue('phone', user?.phone)], ['昵称', user?.nickname || '未设置'], ['邮箱', maskIndividualValue('email', user?.email)],
          ['账号状态', <AccountStatus tenant={tenant}/>], ['注册方式', tenant.source || '未记录'], ['注册时间', time(user?.registeredAt)],
          ['手机号验证', user?.phoneVerifiedAt ? `已验证 · ${time(user.phoneVerifiedAt)}` : '未记录'],
          ['最近登录', user?.lastLoginAt ? time(user.lastLoginAt) : user && Object.hasOwn(user, 'lastLoginAt') ? '尚未登录' : '未记录'],
          ['备注', tenant.notes || '未填写'], ...(tenant.status === '停用' ? [['冻结原因', displayBusinessCopy(tenant.freezeReason) || '未记录']] : []),
        ]}/>
        {memberships.length > 0 && <>
          <Title heading={5} component="h2">所属企业</Title>
          <RecordTable columns={['企业', '企业角色', '成员状态']}
            rows={memberships.map(({ member, enterprise }) => [member.id, enterprise.name, member.role, member.status])}/>
        </>}
      </>}
      {tab === 'entitlements' && <SubscriptionDetails state={state} tenantId={tenant.id}/>}
      {tab === 'projects' && <>
        <Title heading={5} component="h2">项目空间</Title>
        <RecordTable columns={['项目名称', '项目 ID', 'API 密钥数', '创建时间', '状态']} minWidth={760}
          rows={projects.map(project => [
            project.id, project.name, project.id, keys.filter(key => key.projectId === project.id).length, time(project.createdAt), project.status,
          ])} empty="尚未创建个人项目空间"/>
      </>}
      {tab === 'keys' && <>
        <Title heading={5} component="h2">API 密钥</Title>
        <RecordTable columns={['API 密钥名称/ID', 'API 密钥', '所属项目', '授权模型', 'API 密钥状态', '操作']} minWidth={840}
          rows={keys.map(key => [key.id, <div className="admin-table-record"><Text>{key.name}</Text><Text size="small" type="secondary">{key.keyId}</Text></div>,
            maskApiKey(key.secretPreview), projects.find(project => project.id === key.projectId)?.name || '归属异常',
            modelNames(key.modelIds), key.status, <Button size="small" theme="borderless" onClick={() => setInspectKey(key)}>详情</Button>])}
          empty="尚未创建个人 API 密钥"/>
      </>}
    </div>
    {inspectKey && <DetailsModal title="API 密钥详情" description={inspectKey.name} close={() => setInspectKey(null)}>
      <Facts rows={[
        ['API 密钥 ID', inspectKey.keyId], ['所属项目', projects.find(project => project.id === inspectKey.projectId)?.name || '归属异常'],
        ['API 密钥状态', inspectKey.status], ['个人账号状态', <AccountStatus tenant={tenant}/>], ['授权模型', modelNames(inspectKey.modelIds)],
        ['最近调用', time(inspectKey.lastUsedAt)], ['调用条件', tenant.status === '停用' ? '个人账号已冻结，后续调用将被拒绝'
          : '需同时满足 API 密钥、项目、模型授权、额度和网关规则'],
      ]}/>
    </DetailsModal>}
  </Card>;
}

export default function IndividualUsersPage({ state, transact, conflict }) {
  const [params, setParams] = useState(() => new URLSearchParams(location.hash.split('?')[1] || ''));
  const [editing, setEditing] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [selected, setSelected] = useState([]);
  const [bulkMode, setBulkMode] = useState(false);
  useEffect(() => {
    const sync = () => {
      setParams(new URLSearchParams(location.hash.split('?')[1] || ''));
      setEditing(false); setConfirmation(null); setSelected([]); setBulkMode(false);
    };
    addEventListener('hashchange', sync);
    return () => removeEventListener('hashchange', sync);
  }, []);
  const navigate = (patch, replace = false) => {
    setSelected([]);
    if (Object.hasOwn(patch, 'user')) setBulkMode(false);
    const next = new URLSearchParams(location.hash.split('?')[1] || '');
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const hash = `#/admin-2/individual-users${next.size ? '?' + next : ''}`;
    if (replace) history.replaceState(null, '', hash);
    else location.hash = hash;
    setParams(next);
  };
  const userId = params.get('user');
  const account = individualAccounts(state).find(item => item.tenant.ownerId === userId);
  const filters = { q: params.get('q') || '', status: params.get('status') || '' };
  const rows = filterIndividualAccounts(state, filters);
  const size = normalizePageSize(params.get('size'));
  const page = Math.max(1, Math.min(Math.floor(Number(params.get('page'))) || 1, Math.ceil(rows.length / size) || 1));
  const tab = Object.hasOwn(individualTabs, params.get('tab')) ? params.get('tab') : 'info';
  const canWrite = !conflict && !state.storageError && ['平台管理员', '运营人员'].includes(state.currentRole);
  useEffect(() => { if (!canWrite) { setSelected([]); setBulkMode(false); } }, [canWrite]);
  const selecting = bulkMode && canWrite && !userId;
  const complete = text => {
    setEditing(false); setConfirmation(null); setSelected([]); setBulkMode(false);
    Toast.success(text);
    if (selecting) restoreBulkFocus();
  };
  const pageRows = rows.slice((page - 1) * size, page * size);
  const eligible = pageRows.filter(item => item.tenant.status === '正常');
  const selectedAccounts = eligible.filter(item => selected.includes(item.tenant.id));
  const selectAll = selectedAccounts.length > 0 && selectedAccounts.length === eligible.length;
  const toggle = (id, checked) => setSelected(current => checked ? [...new Set([...current, id])] : current.filter(value => value !== id));
  const openAccount = item => navigate({ user: item.tenant.ownerId, tab: '' });

  return <div className="admin-page-stack admin-individual-page">
    <AdminPageHeading title={userId ? account ? individualName(account) : '用户不存在' : '个人用户'}
      description={userId ? account?.tenant.ownerId : '通过手机号自主注册，以个人身份订购和使用模型服务的用户。'}>
      {account && <Space wrap>
        <AccountStatus tenant={account.tenant}/>
        <Button disabled={!canWrite} type={account.tenant.status === '停用' ? 'primary' : 'danger'} onClick={() => setConfirmation(account)}>
          {account.tenant.status === '停用' ? '账号解冻' : '账号冻结'}
        </Button>
      </Space>}
      {!userId && !selecting && <Button id="iu-bulk-action" disabled={!canWrite} onClick={() => { setSelected([]); setBulkMode(true); }}>批量操作</Button>}
    </AdminPageHeading>
    {!canWrite && <Banner type="info" closeIcon={null} description={conflict ? '数据已变化，请载入新版本后再操作。'
      : state.storageError ? '数据读取失败，请恢复数据后再操作。' : `${state.currentRole}仅可查看个人用户资料。`}/>}
    {!userId ? <Card>
      <FilterToolbar className="admin-list-toolbar">
        <Input className="admin-list-search" prefix={<IconSearch aria-hidden="true"/>} showClear aria-label="搜索个人用户"
          value={filters.q} placeholder="搜索手机号、昵称或用户 ID" onChange={q => navigate({ q, page: '' }, true)}/>
        <Choice label="账号状态" value={filters.status || 'all'}
          options={[[ 'all', '全部状态' ], [ '正常', '正常' ], [ '停用', '已冻结' ]]}
          onChange={value => navigate({ status: value === 'all' ? '' : value, page: '' }, true)}/>
        <FilterReset onClick={() => navigate({ q: '', status: '', page: '' }, true)}/>
      </FilterToolbar>
      {selecting && <div className="admin-list-toolbar">
        <Text id="iu-selection-count" type="secondary" role="status">已选 {selectedAccounts.length} / {eligible.length} 个正常账号</Text>
        <Button type="danger" disabled={!selectedAccounts.length} onClick={() => setConfirmation({ accounts: selectedAccounts })}>批量冻结</Button>
        <Button theme="borderless" type="tertiary" onClick={() => { setSelected([]); setBulkMode(false); restoreBulkFocus(); }}>
          取消批量操作
        </Button>
      </div>}
      <RecordTable minWidth={selecting ? 980 : 940} columns={[
        ...(selecting ? [<Checkbox aria-label="选择本页全部正常账号" aria-describedby="iu-selection-count" disabled={!eligible.length}
          checked={selectAll} indeterminate={!selectAll && selectedAccounts.length > 0}
          onChange={event => setSelected(event.target.checked ? eligible.map(item => item.tenant.id) : [])}/>] : []),
        '用户 / User ID', '手机号码', '账号状态', '注册时间', '最近登录时间', '操作',
      ]} rows={pageRows.map(item => [
        item.tenant.id,
        ...(selecting ? [<Checkbox aria-label={`选择用户 ${individualName(item)}`} disabled={item.tenant.status !== '正常'}
          checked={selected.includes(item.tenant.id)} onChange={event => toggle(item.tenant.id, event.target.checked)}/>] : []),
        <Space>
          <Avatar size="extra-small" aria-hidden="true">{Array.from(individualName(item))[0]}</Avatar>
          <div className="admin-table-record">
            <Button size="small" theme="borderless" onClick={() => openAccount(item)}>{individualName(item)}</Button>
            <Text size="small" type="secondary" code>{item.user?.id || item.tenant.ownerId || '未关联身份'}</Text>
          </div>
        </Space>,
        maskIndividualValue('phone', item.user?.phone), <AccountStatus tenant={item.tenant}/>, time(item.user?.registeredAt),
        item.user?.lastLoginAt ? time(item.user.lastLoginAt)
          : item.user && Object.hasOwn(item.user, 'lastLoginAt') ? '尚未登录' : '未记录',
        <Space spacing={4}>
          <Button size="small" theme="borderless" onClick={() => openAccount(item)}>详情</Button>
          <Button size="small" theme="borderless" disabled={!canWrite} onClick={() => setConfirmation(item)}>
            {item.tenant.status === '停用' ? '解冻' : '冻结'}
          </Button>
        </Space>,
      ])} empty={Object.values(filters).some(Boolean) ? '没有匹配的个人用户，请调整或重置筛选条件。' : '尚无个人用户。'}
        pagination={{ currentPage: page, pageSize: size, total: rows.length, pageSizeOpts: PAGE_SIZES, showTotal: true, showSizeChanger: true,
          onPageChange: value => navigate({ page: String(value) }, true), onPageSizeChange: value => navigate({ size: String(value), page: '' }, true) }}/>
    </Card> : !account ? <Banner type="warning" closeIcon={null} description="请通过面包屑返回个人用户列表。"/> : <>
      {account.tenant.status === '停用' && <Banner type="warning" closeIcon={null} description={
        `个人账号已冻结，个人空间访问和个人 API 密钥调用受限。${account.tenant.freezeReason ? `原因：${displayBusinessCopy(account.tenant.freezeReason)}` : ''}`
      }/>}
      <UserDetails key={account.tenant.id} account={account} state={state} tab={tab} navigate={navigate} canWrite={canWrite} setEditor={setEditing}/>
    </>}
    {editing && account?.user && <UserEditor account={account} transact={transact} canWrite={canWrite} close={() => setEditing(false)} complete={complete}/>}
    {confirmation && <StatusDialog key={confirmation.accounts ? 'bulk' : confirmation.tenant.id} accounts={confirmation.accounts}
      account={confirmation.accounts ? undefined : individualAccounts(state).find(item => item.tenant.id === confirmation.tenant.id) || confirmation}
      role={state.currentRole} transact={transact} canWrite={canWrite} close={() => setConfirmation(null)} complete={complete}/>}
  </div>;
}
