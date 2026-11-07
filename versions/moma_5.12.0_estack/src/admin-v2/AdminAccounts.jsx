import AdminStatus from './AdminStatus';
import Table from './AdminTable';
import AdminPageHeading from './AdminPageHeading';
import { useState } from 'react';
import { Banner, Button, Card, Form, Input, Radio, RadioGroup, Select, Space, Toast, Typography } from '@douyinfe/semi-ui';
import { AdminModal as Modal } from './AdminOverlay';
import { IconCopy, IconEyeClosed, IconEyeOpened, IconPlus, IconSearch } from '@douyinfe/semi-icons';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES } from '../components/FilterControls';
import { ADMIN_ROLES, ADMIN_ROLE_LABELS, ROLE_DESCRIPTIONS, generateAdminPassword, lastEnabledAdmin, normalizeAdminLogin } from './admin-accounts';
import { maskMemberPhone } from '../organization-data.mjs';
import './admin-accounts.css';

const roleOptions = ADMIN_ROLES.map(value => ({ value, label: ADMIN_ROLE_LABELS[value] }));
const statusOptions = [
  { value: 'all', label: '全部状态' },
  { value: '已启用', label: '已启用' },
  { value: '停用', label: '已停用' },
];
const dateFormat = new Intl.DateTimeFormat('zh-CN', {
  dateStyle: 'short', timeStyle: 'medium', timeZone: 'Asia/Shanghai', hour12: false,
});
const modalWidth = 'min(480px, calc(100vw - 32px))';

function AccountEditor({ account, revision, canWrite, transact, close, complete }) {
  const [draft, setDraft] = useState(() => ({ account: '', accountType: 'phone', name: '', phone: '', email: '', role: '运营人员', ...account }));
  const [error, setError] = useState('');
  const [loginError, setLoginError] = useState('');
  const phoneLogin = draft.accountType === 'phone';
  const loginField = phoneLogin ? 'phone' : 'email';
  const set = (key, value) => {
    setDraft(current => ({ ...current, [key]: value }));
    setError('');
    if (['phone', 'email', 'accountType'].includes(key)) setLoginError('');
  };
  const validateLogin = () => {
    try {
      normalizeAdminLogin(draft[loginField], draft.accountType);
      setLoginError('');
      return true;
    } catch (issue) {
      setLoginError(issue.message);
      return false;
    }
  };
  const submit = event => {
    event.preventDefault();
    if (!canWrite || (!account && !validateLogin())) return;
    try {
      const login = account ? account.account : normalizeAdminLogin(draft[loginField], draft.accountType);
      const password = account ? null : generateAdminPassword();
      transact({
        type: 'adminAccount',
        operation: account ? 'edit' : 'create',
        id: account?.id || `admin-${crypto.randomUUID()}`,
        values: { ...draft, account: login },
      }, revision);
      complete(account ? '后台账号已更新' : '后台账号已新建', password ? { account: login, password, label: '初始密码' } : null);
    } catch (issue) {
      setError(issue.message);
    }
  };
  return (
    <Modal visible width={modalWidth} title={account ? '编辑后台账号' : '新建后台账号'} footer={null} closeOnEsc maskClosable={false} onCancel={close}>
      <Typography.Paragraph type="secondary">{account ? '维护后台人员姓名、角色及联系资料。' : '使用手机号码或邮箱登录，创建成功后自动生成初始密码。'}</Typography.Paragraph>
      <form noValidate onSubmit={submit}>
        <Form.Slot label={{ text: '登录账号', name: 'aa-account', required: true }}>
          {!account && <RadioGroup className="aa-login-type" type="button" aria-label="登录账号类型" value={draft.accountType}
            onChange={event => set('accountType', event.target.value)}>
            <Radio value="phone">手机号码</Radio>
            <Radio value="email">邮箱</Radio>
          </RadioGroup>}
          <Input id="aa-account" autoFocus={!account} required type={account ? 'text' : phoneLogin ? 'tel' : 'email'}
            autoComplete={account ? 'off' : phoneLogin ? 'tel' : 'email'} maxLength={account ? undefined : phoneLogin ? 25 : 254}
            disabled={Boolean(account)} value={account ? account.account : draft[loginField]} onChange={value => set(loginField, value)}
            onBlur={() => { if (!account) validateLogin(); }} validateStatus={loginError ? 'error' : undefined}
            aria-describedby="aa-login-hint" placeholder={phoneLogin ? '请输入手机号码' : '请输入邮箱，如 name@example.com'}/>
          <Typography.Text id="aa-login-hint" size="small" type={loginError ? 'danger' : 'tertiary'} role={loginError ? 'alert' : undefined}>
            {loginError || (account ? '登录账号创建后不可修改。' : phoneLogin ? '支持 11 位大陆手机号，或带 +国家区号的号码。' : '请输入完整邮箱地址，登录账号不区分大小写。')}
          </Typography.Text>
        </Form.Slot>
        <Form.Slot label={{ text: '姓名', name: 'aa-name', required: true }}>
          <Input id="aa-name" autoFocus={Boolean(account)} required maxLength={40} value={draft.name}
            onChange={value => set('name', value)} placeholder="填写后台人员姓名"/>
        </Form.Slot>
        {account && account.accountType !== 'phone' && <Form.Slot label={{ text: '联系手机号码', name: 'aa-phone' }}>
          <Input id="aa-phone" type="tel" autoComplete="tel" maxLength={25} value={draft.phone}
            onChange={value => set('phone', value)} placeholder="选填，用于联系账号使用者"/>
        </Form.Slot>}
        <Form.Slot label={{ text: '角色', id: 'aa-role-label', required: true }}>
          <Select aria-labelledby="aa-role-label" value={draft.role} optionList={roleOptions} onSelect={value => set('role', value)}/>
          <Typography.Paragraph size="small" type="tertiary">{ROLE_DESCRIPTIONS[draft.role]}</Typography.Paragraph>
        </Form.Slot>
        {error && <Banner type="danger" closeIcon={null} description={error}/>}
        <div className="admin-form-actions">
          <Button onClick={close}>取消</Button>
          <Button theme="solid" htmlType="submit" disabled={!canWrite}>{account ? '保存账号' : '新建账号'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function PasswordResult({ result, close }) {
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`登录账号：${result.account}\n${result.label}：${result.password}`);
      setError('');
      Toast.success('账号与密码已复制');
    } catch {
      setError('复制失败，请显示密码后手动复制。');
    }
  };
  return (
    <Modal visible width={modalWidth} title={result.label === '初始密码' ? '账号新建成功' : '密码重置成功'} closeOnEsc maskClosable={false}
      onCancel={close} footer={<Space><Button icon={<IconCopy aria-hidden="true"/>} onClick={copy}>复制账号与密码</Button><Button theme="solid" onClick={close}>完成</Button></Space>}>
      <Typography.Paragraph type="secondary">密码仅在本次弹窗中显示，请及时复制并妥善转交。</Typography.Paragraph>
      <Form.Slot label={{ text: '登录账号', name: 'aa-result-account' }}>
        <Input id="aa-result-account" readonly value={result.account}/>
      </Form.Slot>
      <Form.Slot label={{ text: result.label, name: 'aa-result-password' }}>
        <div className="aa-password">
          <Input id="aa-result-password" readonly type={visible ? 'text' : 'password'} autoComplete="off" value={result.password}/>
          <Button type="tertiary" icon={visible ? <IconEyeClosed aria-hidden="true"/> : <IconEyeOpened aria-hidden="true"/>}
            aria-label={visible ? '隐藏密码' : '显示密码'} onClick={() => setVisible(value => !value)}/>
        </div>
      </Form.Slot>
      <Typography.Paragraph>请提醒账号使用者在首次登录后修改密码。</Typography.Paragraph>
      {error && <Banner type="danger" closeIcon={null} description={error}/>}
    </Modal>
  );
}

export default function AdminAccounts({ state, transact, conflict }) {
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('all');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(DEFAULT_PAGE_SIZE);
  const [editor, setEditor] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [error, setError] = useState('');
  const [passwordResult, setPasswordResult] = useState(null);
  const canWrite = state.currentRole === '平台管理员' && !state.storageError && !conflict;
  const term = query.trim().toLowerCase();
  const rows = state.admins.filter(account => (!term || [account.account, account.name, account.phone].join(' ').toLowerCase().includes(term))
    && (role === 'all' || account.role === role) && (status === 'all' || account.status === status));
  const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / size)));
  const complete = (message, result = null) => {
    setEditor(null);
    setConfirmation(null);
    setError('');
    setPasswordResult(result);
    if (!result) Toast.success(message);
  };
  const confirm = () => {
    if (!canWrite) return;
    try {
      const password = confirmation.operation === 'resetPassword' ? generateAdminPassword() : null;
      transact({ type: 'adminAccount', operation: confirmation.operation, id: confirmation.account.id }, confirmation.revision);
      complete(password ? '后台账号密码已重置' : `后台账号已${confirmation.account.status === '已启用' ? '停用' : '启用'}`,
        password ? { account: confirmation.account.account, password, label: '新密码' } : null);
    } catch (issue) {
      setError(issue.message);
    }
  };
  const askConfirm = (account, operation) => {
    setError('');
    setConfirmation({ account, operation, revision: state.revision });
  };
  const reset = () => { setQuery(''); setRole('all'); setStatus('all'); setPage(1); };
  const columns = [
    { title: '登录账号 / ID', dataIndex: 'account', render: (value, account) => <div className="aa-identity">
      <Typography.Text strong>{value}</Typography.Text>
      <Typography.Text type="tertiary" size="small">{account.id}</Typography.Text>
    </div> },
    { title: '姓名', dataIndex: 'name' },
    { title: '手机号码', dataIndex: 'phone', render: value => value ? maskMemberPhone(value) : '—' },
    { title: '角色', dataIndex: 'role', render: value => ADMIN_ROLE_LABELS[value] || '未配置角色' },
    { title: '账号状态', dataIndex: 'status', render: value => <AdminStatus value={value === '已启用' ? '已启用' : '已停用'}/> },
    { title: '创建时间', dataIndex: 'createdAt', render: value => value && Number.isFinite(Date.parse(value)) ? dateFormat.format(new Date(value)) : '—' },
    { title: '操作', key: 'actions', render: (_, account) => {
      const protectedAdmin = lastEnabledAdmin(state, account.id);
      return <Space spacing={4}>
        <Button size="small" theme="borderless" disabled={!canWrite} onClick={() => setEditor({ account, revision: state.revision })}>编辑</Button>
        <Button size="small" theme="borderless" disabled={!canWrite || protectedAdmin} title={protectedAdmin ? '至少保留一个启用的系统管理员' : undefined}
          onClick={() => askConfirm(account, 'toggle')}>{account.status === '已启用' ? '停用' : '启用'}</Button>
        <Button size="small" theme="borderless" disabled={!canWrite} onClick={() => askConfirm(account, 'resetPassword')}>重置密码</Button>
      </Space>;
    } },
  ];
  const resetting = confirmation?.operation === 'resetPassword';
  const disabling = confirmation?.operation === 'toggle' && confirmation.account.status === '已启用';
  const verb = resetting ? '重置' : disabling ? '停用' : '启用';
  return (
    <div className="aa-page admin-page-stack">
      <AdminPageHeading title="账号管理" description="管理后台人员的账号、手机号码、角色及启停状态。">
        <Button theme="solid" icon={<IconPlus aria-hidden="true"/>} disabled={!canWrite} onClick={() => setEditor({ account: null, revision: state.revision })}>新建账号</Button>
      </AdminPageHeading>
      {!canWrite && <Banner type="warning" closeIcon={null}
        description={conflict ? '数据已变化，请载入新版本后再操作。' : state.storageError ? '数据读取失败，请恢复数据后再操作。' : '仅系统管理员可新建、编辑、启停后台账号或重置密码。'}/>}
      <Card>
        <div className="admin-list-toolbar" role="group" aria-label="账号筛选">
          <Input className="admin-list-search" prefix={<IconSearch aria-hidden="true"/>} showClear aria-label="搜索后台账号" placeholder="搜索登录账号 / 姓名 / 手机号"
            value={query} onChange={value => { setQuery(value); setPage(1); }}/>
          <Space>
            <Typography.Text id="aa-filter-role-label" type="secondary">角色</Typography.Text>
            <Select aria-labelledby="aa-filter-role-label" value={role} optionList={[{ value: 'all', label: '全部角色' }, ...roleOptions]}
              onSelect={value => { setRole(value); setPage(1); }}/>
          </Space>
          <Space>
            <Typography.Text id="aa-filter-status-label" type="secondary">状态</Typography.Text>
            <Select aria-labelledby="aa-filter-status-label" value={status} optionList={statusOptions}
              onSelect={value => { setStatus(value); setPage(1); }}/>
          </Space>
          <Button theme="borderless" type="tertiary" onClick={reset}>重置筛选</Button>
        </div>
        <Table size="small" rowKey="id" dataSource={rows.slice((currentPage - 1) * size, currentPage * size)}
          columns={columns} scroll={{ x: 'max(100%, 880px)' }}
          pagination={{ currentPage, total: rows.length, pageSize: size, pageSizeOpts: PAGE_SIZES, showSizeChanger: true, showTotal: true, onPageChange: setPage,
            onPageSizeChange: value => { setSize(value); setPage(1); } }}
          empty={state.admins.length ? '没有符合条件的后台账号，请调整或重置筛选。' : '暂无后台账号。'}/>
      </Card>
      {editor && <AccountEditor account={editor.account} revision={editor.revision} canWrite={canWrite}
        transact={transact} close={() => setEditor(null)} complete={complete}/>}
      {confirmation && <Modal visible width={modalWidth} title={resetting ? '重置密码' : `${verb}后台账号`}
        okText={`确认${verb}`} cancelButtonProps={{ "aria-label": "取消" }}
        okButtonProps={{ "aria-label": `确认${verb}`, disabled: !canWrite, type: disabling ? 'danger' : 'primary' }}
        onOk={confirm} onCancel={() => setConfirmation(null)} closeOnEsc maskClosable={false}>
        <Typography.Paragraph strong>{confirmation.account.account} · {confirmation.account.name}</Typography.Paragraph>
        <Typography.Paragraph type="secondary">
          {resetting ? '确认后将生成新的随机密码。请妥善转交账号使用者，账号角色及启停状态保持。'
            : disabling ? '停用后该账号将无法访问后台，账号资料及历史操作记录保留。' : '启用后该账号可按已配置的角色访问后台。'}
        </Typography.Paragraph>
        {error && <Banner type="danger" closeIcon={null} description={error}/>}
      </Modal>}
      {passwordResult && <PasswordResult result={passwordResult} close={() => setPasswordResult(null)}/>}
    </div>
  );
}
