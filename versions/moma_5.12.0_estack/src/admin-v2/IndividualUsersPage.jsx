import { useChannelText } from './channel-language';
import { resourceId } from '../resource-id.mjs';
import AdminStatus from './AdminStatus';
import Table from './AdminTable';
import { useId, useEffect, useState } from 'react';
import Descriptions from './AdminDescriptions';
import { Avatar, Banner, Button, Card, Checkbox, Form, Input, Space, Tabs, TextArea, Toast, Typography } from '@douyinfe/semi-ui';
import { AdminModal as Modal } from './AdminOverlay';
import { IconSearch } from '@douyinfe/semi-icons';
import { TenantServiceSettings } from './TenantServiceSettings';
import { adminProjectHref } from './access-control.mjs';
import { personalDefaultProject } from '../personal-project.mjs';
import { PAGE_SIZES, normalizePageSize, FilterReset, FilterToolbar } from '../components/FilterControls';
import { displayAdminBusinessCopy } from '../display-copy.mjs';
import AdminPageHeading from './AdminPageHeading';
import { Choice, CopyId, serviceOperationsUi } from './ServiceUI';
import { accountDataSourceLabel, accountDataSourceOptions } from './account-data-source';
import {
  filterIndividualAccounts, individualFreezeScope,
  individualAccounts, managedIndividualAccounts, individualName, individualStatus, individualTabs, maskIndividualValue,
} from './individual-users';
import './individual-users.css';

const { Text, Paragraph, Title } = Typography;
const beijingDate = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
});
const time = value => value && Number.isFinite(Date.parse(value)) ? beijingDate.format(new Date(value)) : '未记录';
const restoreBulkFocus = () => requestAnimationFrame(() => document.getElementById('iu-bulk-action')?.focus());

function OpenIndividual({ state, transact, close, complete, canWrite }) {
  const translateLabel = useChannelText();
  const [form,setForm]=useState({accountMode:'existing',userId:'',name:'',phone:''});
  const [password,setPassword]=useState(''), [busy,setBusy]=useState(false), [error,setError]=useState('');
  const [discard,setDiscard]=useState(false);
  const formId=useId(), existing=form.accountMode==='existing';
  const owners=new Set(individualAccounts(state).map(({tenant})=>tenant.ownerId));
  const accounts=state.users.filter(user=>user.status==='正常' && state.accountUserIds?.includes(user.id) &&
    user.id!=='front-demo-admin-001' && !owners.has(user.id));
  const update=(key,value)=>{setForm(current=>({...current,[key]:value}));setError('');};
  const cancel=()=>{if (busy) return; if (form.userId || form.name || form.phone || password) setDiscard(true); else close();};
  async function submit(event) {
    event.preventDefault();
    if (busy || !canWrite || existing && !form.userId) return;
    setBusy(true); setError('');
    try {
      const ids=Object.fromEntries(['tenant','user','project'].map(kind=>[kind,resourceId(kind)]));
      const loginProof=existing ? undefined : await encodeAuthPassword(password);
      const next=await transact({type:'individual',operation:'create',ids,data:form,loginProof});
      complete(next.tenants.find(row=>row.id===ids.tenant));
    } catch (issue) {setError(issue.message);setBusy(false);}
  }
  return <>
    <Modal visible title={translateLabel("开通个人租户")} onCancel={cancel} footer={<>
      <Button onClick={cancel} disabled={busy}>{translateLabel("取消")}</Button>
      <Button form={formId} htmlType="submit" theme="solid" loading={busy} disabled={!canWrite || existing && !form.userId}>开通</Button>
    </>}>
      <form id={formId} className="admin-individual-dialog" onSubmit={submit}>
        <Choice label="开户方式" value={form.accountMode} onChange={value=>update('accountMode',value)} disabled={busy}
          options={[[ 'existing','使用已有账号' ],[ 'new','新建手机号账号' ]]}/>
        {existing ? <Choice label="登录账号" filter value={form.userId || undefined} onChange={value=>update('userId',value)}
          options={accounts.map(user=>[user.id,user.name+' · '+user.login])} disabled={busy}/>
          : <>
            <Form.Slot label={{text:'姓名',name:'open-personal-name'}}><Input id="open-personal-name" required maxLength={40}
              value={form.name} onChange={value=>update('name',value)} disabled={busy}/></Form.Slot>
            <Form.Slot label={{text:'手机号',name:'open-personal-phone'}}><Input id="open-personal-phone" required
              inputMode="tel" maxLength={24} value={form.phone} onChange={value=>update('phone',value)} disabled={busy}/></Form.Slot>
            <Form.Slot label={{text:'初始密码',name:'open-personal-password'}}><Input id="open-personal-password" required mode="password"
              autoComplete="new-password" minLength={8} maxLength={64} value={password} onChange={setPassword} disabled={busy}/></Form.Slot>
          </>}
        {error && <Banner type="danger" closeIcon={null} description={<span role="alert">{error}</span>}/>}
      </form>
    </Modal>
    {discard && serviceOperationsUi.renderLeaveDialog({cancel:()=>setDiscard(false),discard:close})}
  </>;
}

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

function UserEditor({ account, transact, canWrite, close, complete }) {
  const translateLabel = useChannelText();
  const formId = useId();
  const [form, setForm] = useState({ nickname: account.user.nickname || '', email: account.user.email || '', notes: account.tenant.notes || '' });
  const [dirty, setDirty] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const change = (field, value) => { setForm(current => ({ ...current, [field]: value })); setDirty(true); setError(''); };
  const requestClose = () => { if (!busy) { if (dirty) setDiscard(true); else close(); } };
  const submit = async event => {
    event.preventDefault();
    if (busy || !canWrite || !dirty) return;
    setBusy(true);
    setError('');
    try {
      await transact({ type: 'individual', operation: 'edit', tenantId: account.tenant.id, data: form });
      complete('个人租户资料已保存');
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return <>
    <Modal visible title="编辑个人租户资料" width="min(560px, calc(100vw - 32px))" closeOnEsc={!discard}
      maskClosable={false} onCancel={requestClose} footer={<>
        <Button onClick={requestClose} disabled={busy}>{translateLabel("取消")}</Button>
        <Button form={formId} htmlType="submit" theme="solid" loading={busy} disabled={!canWrite || !dirty}>{translateLabel("保存")}</Button>
      </>}>
      <form id={formId} className="admin-individual-dialog" onSubmit={submit}>
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
      </form>
    </Modal>
    {discard && serviceOperationsUi.renderLeaveDialog({ cancel: () => setDiscard(false), discard: close })}
  </>;
}

function StatusDialog({ account, accounts, role, transact, canWrite, close, complete }) {
  const translateLabel = useChannelText();
  const formId = useId();
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
  const submit = async event => {
    event.preventDefault();
    if (busy || disabled) return;
    setBusy(true);
    setError('');
    try {
      await transact(bulk
        ? { type: 'individual', operation: 'batch-freeze', tenantIds: targets.map(item => item.tenant.id), data: { reason, code, challenge } }
        : { type: 'individual', operation: 'set-status', tenantId: account.tenant.id, data: { status, reason, code, challenge } });
      complete(bulk ? `已冻结 ${targets.length} 个个人账号` : `个人账号已${action}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return <Modal visible title={bulk ? `批量冻结个人租户（${targets.length} 个）` : `${action}个人租户`}
    width="min(620px, calc(100vw - 32px))" closeOnEsc maskClosable={false} onCancel={close} footer={<>
      <Button disabled={busy} onClick={close}>{translateLabel("取消")}</Button>
      <Button form={formId} htmlType="submit" theme="solid" type={freezing ? 'danger' : 'primary'} disabled={disabled} loading={busy}>确认{action}</Button>
    </>}>
    <form id={formId} className="admin-analytics-fields admin-individual-dialog" onSubmit={submit}>
      {bulk ? <RecordTable columns={['个人租户', '租户 ID', '用户 ID', '手机号码']}
        rows={targets.map(item => [item.tenant.id, <div className="admin-table-record">
          <Text>{individualName(item)}</Text>
        </div>, item.tenant.id, item.user?.id || item.tenant.ownerId, maskIndividualValue('phone', item.user?.phone)])}/>
        : <Facts rows={[
          ['个人租户', individualName(account)], ['用户 ID', account.tenant.ownerId || '未关联'],
          ['手机号', maskIndividualValue('phone', account.user?.phone)], ['操作角色', role],
        ]}/>}
      <Banner type={freezing ? 'warning' : 'info'} closeIcon={null} description={freezing
        ? '冻结后禁止个人空间访问及个人 API 密钥调用，历史记录和企业成员关系保留。'
        : '解冻后恢复个人空间访问，已停用的 API 密钥保持原状态。'}/>
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
    </form>
  </Modal>;
}

function UserDetails({ account, state, tab, navigate, canWrite, transact, setEditor }) {
  const { tenant, user } = account;
  const memberships = state.memberships.filter(member => member.userId === tenant.ownerId)
    .map(member => ({ member, enterprise: state.tenants.find(item => item.id === member.tenantId && ['企业', '政府'].includes(item.type)) }))
    .filter(item => item.enterprise);
  const userId = user?.id || tenant.ownerId;
  return <Card>
    <Tabs activeKey={tab} onChange={tab => navigate({ tab }, true)}>
      {Object.entries(individualTabs).map(([id, label]) => <Tabs.TabPane key={id} itemKey={id} tab={label}/>)}
    </Tabs>
    <div className="admin-analytics-fields">
      {tab === 'info' && <>
        <Title heading={5} component="h2">租户信息</Title>
        <Facts rows={[
          ['租户 ID', <CopyId value={tenant.id} label="租户 ID"/>], ['租户状态', <AccountStatus tenant={tenant}/>],
          ['服务等级', <TenantServiceSettings state={state} tenant={tenant} section="level" canWrite={canWrite} transact={transact}/>],
          ['备注', tenant.notes || '未填写'], ...(tenant.status === '停用' ? [['冻结原因', displayAdminBusinessCopy(tenant.freezeReason) || '未记录']] : []),
        ]}/>
        <div className="admin-page-heading">
          <Title heading={5} component="h2">登录账号</Title>
          <Button disabled={!canWrite || !user} onClick={() => setEditor(true)}>编辑账号资料</Button>
        </div>
        <Facts rows={[
          ['用户 ID', userId ? <CopyId value={userId} label="用户 ID"/> : '未关联'],
          ['手机号码', maskIndividualValue('phone', user?.phone)], ['昵称', user?.nickname || '未设置'], ['邮箱', maskIndividualValue('email', user?.email)],
          ['注册时间', time(user?.registeredAt)],
          ['手机号验证', user?.phoneVerifiedAt ? `已验证 · ${time(user.phoneVerifiedAt)}` : '未记录'],
          ['最近登录', user?.lastLoginAt ? time(user.lastLoginAt) : '未记录'],
        ]}/>
        {memberships.length > 0 && <>
          <Title heading={5} component="h2">所属企业</Title>
          <RecordTable columns={['企业', '企业角色', '成员状态']}
            rows={memberships.map(({ member, enterprise }) => [member.id, enterprise.name, member.role, member.status])}/>
        </>}
      </>}
      {tab==='models' && <TenantServiceSettings state={state} tenant={tenant} section="models" canWrite={canWrite} transact={transact}/>}
    </div>
  </Card>;
}

export default function IndividualUsersPage({ state, transact, conflict }) {
  const translateLabel = useChannelText();
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
    if (Object.hasOwn(patch, 'personal')) setBulkMode(false);
    const next = new URLSearchParams(location.hash.split('?')[1] || '');
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const hash = `#/admin-2/tenants${next.size ? '?' + next : ''}`;
    if (replace) history.replaceState(null, '', hash);
    else location.hash = hash;
    setParams(next);
  };
  const [opening,setOpening]=useState(() => new URLSearchParams(location.hash.split('?')[1] || '').get('create') === 'personal');
  const userId = params.get('personal');
  const account = managedIndividualAccounts(state).find(item => item.tenant.ownerId === userId);
  const filters = { q: params.get('q') || '', status: params.get('status') || '', source: params.get('source') || '' };
  const rows = filterIndividualAccounts(state, filters);
  const size = normalizePageSize(params.get('size'));
  const page = Math.max(1, Math.min(Math.floor(Number(params.get('page'))) || 1, Math.ceil(rows.length / size) || 1));
  const tab = Object.hasOwn(individualTabs, params.get('tab')) ? params.get('tab') : 'info';
  const canWrite = !state.commerceReadOnly && !conflict && !state.storageError && ['平台管理员', '运营人员'].includes(state.currentRole);
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
  const openAccount = item => navigate({ create:"", personal: item.tenant.ownerId, tab: '' });
  const openDefaultProject = () => {
    try {
      const project = personalDefaultProject(state,account.tenant.id);
      location.hash = adminProjectHref({tenant:account.tenant.id,project:project.id});
    } catch (error) {
      Toast.error(error.message);
    }
  };

  return <div className="admin-page-stack admin-individual-page">
    <AdminPageHeading title={userId ? account ? individualName(account) : '个人租户不存在' : '个人租户'}
      description={userId ? account?.tenant.ownerId : undefined}>
      {account && <Space wrap>
        <AccountStatus tenant={account.tenant}/>
        <Button onClick={openDefaultProject}>{translateLabel('查看默认项目')}</Button>
        <Button disabled={!canWrite} type={account.tenant.status === '停用' ? 'primary' : 'danger'} onClick={() => setConfirmation(account)}>
          {account.tenant.status === '停用' ? '解冻租户' : '冻结租户'}
        </Button>
      </Space>}
      {!userId && !selecting && state.spacePolicy?.personalEnabled && <Button theme="solid" disabled={!canWrite} onClick={()=>setOpening(true)}>{translateLabel("开通个人租户")}</Button>}
      {!userId && !selecting && <Button id="iu-bulk-action" disabled={!canWrite} onClick={() => { setSelected([]); setBulkMode(true); }}>批量操作</Button>}
    </AdminPageHeading>
    {!canWrite && <Banner type="info" closeIcon={null} description={conflict ? '数据已变化，请载入新版本后再操作。'
      : state.storageError ? '数据读取失败，请恢复数据后再操作。' : `${state.currentRole}仅可查看个人租户资料。`}/>}
    {!userId ? <Card>
      <FilterToolbar className="admin-list-toolbar">
        <Input className="admin-list-search" prefix={<IconSearch aria-hidden="true"/>} showClear aria-label="搜索个人租户"
          value={filters.q} placeholder="搜索手机号、昵称或用户 ID" onChange={q => navigate({ q, page: '' }, true)}/>
        <Choice label="租户状态" value={filters.status || 'all'}
          options={[[ 'all', '全部状态' ], [ '正常', '正常' ], [ '停用', '已冻结' ]]}
          onChange={value => navigate({ status: value === 'all' ? '' : value, page: '' }, true)}/>
        <Choice label="数据来源" value={filters.source || 'all'} options={accountDataSourceOptions}
          onChange={value => navigate({ source: value === 'all' ? '' : value, page: '' }, true)}/>
        <FilterReset onClick={() => navigate({ q: '', status: '', source: '', page: '' }, true)}/>
      </FilterToolbar>
      {selecting && <div className="admin-list-toolbar">
        <Text id="iu-selection-count" type="secondary" role="status">已选 {selectedAccounts.length} / {eligible.length} 位正常租户</Text>
        <Button type="danger" disabled={!selectedAccounts.length} onClick={() => setConfirmation({ accounts: selectedAccounts })}>批量冻结</Button>
        <Button theme="borderless" type="tertiary" onClick={() => { setSelected([]); setBulkMode(false); restoreBulkFocus(); }}>
          取消批量操作
        </Button>
      </div>}
      <RecordTable minWidth={selecting ? 1080 : 1040} columns={[
        ...(selecting ? [<Checkbox aria-label="选择本页全部正常租户" aria-describedby="iu-selection-count" disabled={!eligible.length}
          checked={selectAll} indeterminate={!selectAll && selectedAccounts.length > 0}
          onChange={event => setSelected(event.target.checked ? eligible.map(item => item.tenant.id) : [])}/>] : []),
        '个人租户', '租户 ID', '用户 ID', '手机号码', '数据来源', '租户状态', '注册时间', '最近登录时间', '操作',
      ]} rows={pageRows.map(item => [
        item.tenant.id,
        ...(selecting ? [<Checkbox aria-label={`选择租户 ${individualName(item)}`} disabled={item.tenant.status !== '正常'}
          checked={selected.includes(item.tenant.id)} onChange={event => toggle(item.tenant.id, event.target.checked)}/>] : []),
        <Space>
          <Avatar size="extra-small" aria-hidden="true">{Array.from(individualName(item))[0]}</Avatar>
          <div className="admin-table-record">
            <Button size="small" theme="borderless" onClick={() => openAccount(item)}>{individualName(item)}</Button>

          </div>
        </Space>, item.tenant.id, item.user?.id || item.tenant.ownerId,
        maskIndividualValue('phone', item.user?.phone), accountDataSourceLabel(item.tenant),
        <AccountStatus tenant={item.tenant}/>, time(item.user?.registeredAt),
        item.user?.lastLoginAt ? time(item.user.lastLoginAt) : '未记录',
        <Space spacing={4}>
          <Button size="small" theme="borderless" onClick={() => openAccount(item)}>{translateLabel("详情")}</Button>
          <Button size="small" theme="borderless" disabled={!canWrite} onClick={() => setConfirmation(item)}>
            {item.tenant.status === '停用' ? '解冻' : '冻结'}
          </Button>
        </Space>,
      ])} empty={Object.values(filters).some(Boolean) ? '没有匹配的个人租户，请调整或重置筛选条件。' : '尚无个人租户。'}
        pagination={{ currentPage: page, pageSize: size, total: rows.length, pageSizeOpts: PAGE_SIZES, showTotal: true, showSizeChanger: true,
          onPageChange: value => navigate({ page: String(value) }, true), onPageSizeChange: value => navigate({ size: String(value), page: '' }, true) }}/>
    </Card> : !account ? <Banner type="warning" closeIcon={null} description="请通过面包屑返回个人租户列表。"/> : <>
      {account.tenant.status === '停用' && <Banner type="warning" closeIcon={null} description={
        `个人租户已冻结，个人空间访问和个人 API 密钥调用受限。${account.tenant.freezeReason ? `原因：${displayAdminBusinessCopy(account.tenant.freezeReason)}` : ''}`
      }/>}
      <UserDetails key={account.tenant.id} account={account} state={state} tab={tab}
        navigate={navigate} canWrite={canWrite} transact={transact} setEditor={setEditing}/>
    </>}
    {opening && <OpenIndividual state={state} transact={transact} canWrite={canWrite} close={()=>{setOpening(false);if(params.has("create"))location.hash="#/admin-2/tenants";}}
      complete={tenant=>{setOpening(false);Toast.success('个人空间和默认项目已开通');navigate({personal:tenant.ownerId,create:'',tab:''});}}/>}
    {editing && account?.user && <UserEditor account={account} transact={transact} canWrite={canWrite} close={() => setEditing(false)} complete={complete}/>}
    {confirmation && <StatusDialog key={confirmation.accounts ? 'bulk' : confirmation.tenant.id} accounts={confirmation.accounts}
      account={confirmation.accounts ? undefined : managedIndividualAccounts(state).find(item => item.tenant.id === confirmation.tenant.id) || confirmation}
      role={state.currentRole} transact={transact} canWrite={canWrite} close={() => setConfirmation(null)} complete={complete}/>}
  </div>;
}
