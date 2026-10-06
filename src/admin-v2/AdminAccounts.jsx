import { toast } from 'sonner';
import { useRef, useState } from 'react';
import { Copy, Eye, EyeOff, Plus, Search, ShieldCheck, UserCog } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '../components/ui/toggle-group';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { FilterPagination, FilterReset, DEFAULT_PAGE_SIZE } from '../components/FilterControls';
import { ADMIN_ROLES, ADMIN_ROLE_LABELS, ROLE_DESCRIPTIONS, generateAdminPassword, lastEnabledAdmin, normalizeAdminLogin } from './admin-accounts';
import { maskMemberPhone } from '../organization-data.mjs';
import './admin-accounts.css';

function Choice({ label, value, options, change }) {
  return <Select value={value} onValueChange={change}><SelectTrigger aria-label={label}><SelectValue/></SelectTrigger><SelectContent><SelectGroup>{options.map(([id, text]) => <SelectItem key={id} value={id}>{text}</SelectItem>)}</SelectGroup></SelectContent></Select>;
}

function AccountEditor({ account, revision, canWrite, transact, close, complete }) {
  const [draft, setDraft] = useState(() => ({ account: '', accountType: 'phone', name: '', phone: '', email: '', role: '运营人员', ...account }));
  const trigger = useRef(document.activeElement);
  const [error, setError] = useState('');
  const [loginError, setLoginError] = useState('');
  const phoneLogin = draft.accountType === 'phone';
  const set = (key, value) => { setDraft(current => ({ ...current, [key]: value })); setError(''); if (['phone', 'email', 'accountType'].includes(key)) setLoginError(''); };
  const validateLogin = () => {
    try { normalizeAdminLogin(draft[phoneLogin ? 'phone' : 'email'], draft.accountType); setLoginError(''); return true; }
    catch (err) { setLoginError(err.message); return false; }
  };
  const submit = event => {
    event.preventDefault();
    if (!account && !validateLogin()) return;
    try {
      const login = account ? account.account : normalizeAdminLogin(draft[phoneLogin ? 'phone' : 'email'], draft.accountType);
      const password = account ? null : generateAdminPassword();
      transact({ type: 'adminAccount', operation: account ? 'edit' : 'create', id: account?.id || `admin-${crypto.randomUUID()}`, values: { ...draft, account: login } }, revision);
      complete(account ? '后台账号已更新' : '后台账号已新建', password ? { account: login, password, label: '初始密码' } : null);
    } catch (err) { toast.error(err.message); setError(err.message); }
  };
  return <Dialog open onOpenChange={open => { if (!open) close(); }}><DialogContent className="aa-dialog" onCloseAutoFocus={event => { event.preventDefault(); trigger.current?.focus(); }}><DialogHeader><DialogTitle>{account ? '编辑后台账号' : '新建后台账号'}</DialogTitle><DialogDescription>{account ? '维护后台人员姓名、角色及联系资料。' : '使用手机号码或邮箱登录，创建成功后自动生成初始密码。'}</DialogDescription></DialogHeader><form noValidate onSubmit={submit}>
    <div className="aa-fields"><label htmlFor="aa-account">登录账号 <span>*</span></label>{!account && <ToggleGroup className="aa-login-type" type="single" aria-label="登录账号类型" value={draft.accountType} onValueChange={value => { if (value) set('accountType', value); }}><ToggleGroupItem value="phone">手机号码</ToggleGroupItem><ToggleGroupItem value="email">邮箱</ToggleGroupItem></ToggleGroup>}<Input id="aa-account" autoFocus={!account} required type={account ? 'text' : phoneLogin ? 'tel' : 'email'} autoComplete={account ? 'off' : phoneLogin ? 'tel' : 'email'} inputMode={account ? undefined : phoneLogin ? 'tel' : 'email'} maxLength={account ? undefined : phoneLogin ? 25 : 254} disabled={!!account} value={account ? account.account : draft[phoneLogin ? 'phone' : 'email']} onChange={event => set(phoneLogin ? 'phone' : 'email', event.target.value)} onBlur={() => { if (!account) validateLogin(); }} aria-invalid={!!loginError} aria-describedby="aa-login-hint" placeholder={phoneLogin ? '请输入手机号码' : '请输入邮箱，如 name@example.com'}/><p id="aa-login-hint" className={loginError ? 'aa-error' : undefined} role={loginError ? 'alert' : undefined}>{loginError || (account ? '登录账号创建后不可修改。' : phoneLogin ? '支持 11 位大陆手机号，或带 +国家区号的号码。' : '请输入完整邮箱地址，登录账号不区分大小写。')}</p>
    <label htmlFor="aa-name">姓名 <span>*</span></label><Input id="aa-name" autoFocus={!!account} required maxLength={40} value={draft.name} onChange={event => set('name', event.target.value)} placeholder="填写后台人员姓名"/>
    {account && account.accountType !== 'phone' && <><label htmlFor="aa-phone">联系手机号码</label><Input id="aa-phone" type="tel" autoComplete="tel" maxLength={25} value={draft.phone} onChange={event => set('phone', event.target.value)} placeholder="选填，用于联系账号使用者"/></>}
    <label>角色 <span>*</span></label><Choice label="角色" value={draft.role} options={ADMIN_ROLES.map(role => [role, ADMIN_ROLE_LABELS[role]])} change={value => set('role', value)}/><p className="aa-role-description"><ShieldCheck size={15}/>{ROLE_DESCRIPTIONS[draft.role]}</p>
    {error && <p className="aa-error" role="alert">{error}</p>}</div><DialogFooter><Button type="button" variant="outline" onClick={close}>取消</Button><Button type="submit" disabled={!canWrite}>{account ? '保存账号' : '新建账号'}</Button></DialogFooter>
  </form></DialogContent></Dialog>;
}

function PasswordResult({ result, close, trigger }) {
  const [visible, setVisible] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(`登录账号：${result.account}\n${result.label}：${result.password}`); toast.success('账号与密码已复制'); }
    catch { toast.error('复制失败，请显示密码后手动复制。'); }
  };
  return <Dialog open onOpenChange={open => { if (!open) close(); }}><DialogContent className="aa-dialog" onCloseAutoFocus={event => { event.preventDefault(); trigger.current?.focus(); }}><DialogHeader><DialogTitle>{result.label === '初始密码' ? '账号新建成功' : '密码重置成功'}</DialogTitle><DialogDescription>密码仅在本次弹窗中显示，请及时复制并妥善转交。</DialogDescription></DialogHeader><div className="aa-fields"><label htmlFor="aa-result-account">登录账号</label><Input id="aa-result-account" readOnly value={result.account}/><label htmlFor="aa-result-password">{result.label}</label><div className="aa-password"><Input id="aa-result-password" readOnly type={visible ? 'text' : 'password'} autoComplete="off" value={result.password}/><Button variant="outline" aria-label={visible ? '隐藏密码' : '显示密码'} onClick={() => setVisible(value => !value)}>{visible ? <EyeOff size={16}/> : <Eye size={16}/>}</Button></div><p>请提醒账号使用者在首次登录后修改密码。</p></div><DialogFooter><Button variant="outline" onClick={copy}><Copy size={15}/>复制账号与密码</Button><Button onClick={close}>完成</Button></DialogFooter></DialogContent></Dialog>;
}

export default function AdminAccounts({ state, transact, conflict }) {
  const [query, setQuery] = useState(''), [role, setRole] = useState('all'), [status, setStatus] = useState('all');
  const [page, setPage] = useState(1), [size, setSize] = useState(DEFAULT_PAGE_SIZE);
  const [editor, setEditor] = useState(null), [confirmation, setConfirmation] = useState(null), [error, setError] = useState('');
  const [passwordResult, setPasswordResult] = useState(null);
  const trigger = useRef(null);
  const canWrite = state.currentRole === '平台管理员' && !state.storageError && !conflict;
  const term = query.trim().toLowerCase();
  const rows = state.admins.filter(item => (!term || [item.account, item.name, item.phone].join(' ').toLowerCase().includes(term)) && (role === 'all' || item.role === role) && (status === 'all' || item.status === status));
  const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / size)));
  const complete = (text, result = null) => { setEditor(null); setConfirmation(null); if (!result) toast.success(text); setError(''); setPasswordResult(result); };
  const confirm = () => {
    try {
      const password = confirmation.operation === 'resetPassword' ? generateAdminPassword() : null;
      transact({ type: 'adminAccount', operation: confirmation.operation, id: confirmation.account.id }, confirmation.revision);
      complete(password ? '后台账号密码已重置' : `后台账号已${confirmation.account.status === '已启用' ? '停用' : '启用'}`, password ? { account: confirmation.account.account, password, label: '新密码' } : null);
    } catch (err) { toast.error(err.message); }
  };
  const reset = () => { setQuery(''); setRole('all'); setStatus('all'); setPage(1); };
  return <div className="aa-page"><div className="aa-head"><div><h1><UserCog size={16}/>账号管理</h1><p>管理后台人员的账号、手机号码、角色及启停状态。</p></div><Button disabled={!canWrite} onClick={event => { trigger.current = event.currentTarget; setEditor({ account: null, revision: state.revision }); }}><Plus data-icon="inline-start"/>新建账号</Button></div>
    {!canWrite && <p className="aa-readonly">{conflict ? '数据已变化，请载入新版本后再操作。' : state.storageError ? '数据读取失败，请恢复数据后再操作。' : '仅系统管理员可新建、编辑、启停后台账号或重置密码。'}</p>}
    <section className="aa-surface">
      <div className="aa-filters" role="group" aria-label="账号筛选"><label className="aa-search"><Search size={15}/><Input aria-label="搜索后台账号" placeholder="搜索登录账号 / 姓名 / 手机号" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }}/></label><label><span>角色</span><Choice label="筛选后台角色" value={role} options={ [['all', '全部角色'], ...ADMIN_ROLES.map(value => [value, ADMIN_ROLE_LABELS[value]])] } change={value => { setRole(value); setPage(1); }}/></label><label><span>状态</span><Choice label="账号状态" value={status} options={ [['all', '全部状态'], ['已启用', '已启用'], ['停用', '已停用']] } change={value => { setStatus(value); setPage(1); }}/></label><FilterReset onClick={reset}/></div>
      <Table className="aa-table"><TableHeader><TableRow>{['登录账号 / ID', '姓名', '手机号码', '角色', '账号状态', '创建时间', '操作'].map(label => <TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader><TableBody>{rows.slice((currentPage - 1) * size, currentPage * size).map(account => {const protectedAdmin = lastEnabledAdmin(state, account.id); return <TableRow key={account.id}><TableCell><b>{account.account}</b><small>{account.id}</small></TableCell><TableCell>{account.name}</TableCell><TableCell>{account.phone ? maskMemberPhone(account.phone) : '—'}</TableCell><TableCell>{ADMIN_ROLE_LABELS[account.role] || '未配置角色'}</TableCell><TableCell><span className={`aa-status ${account.status === '已启用' ? '' : 'disabled'}`}>{account.status === '已启用' ? '已启用' : '已停用'}</span></TableCell><TableCell>{account.createdAt ? new Date(account.createdAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '—'}</TableCell><TableCell><div className="aa-actions"><Button variant="link" disabled={!canWrite} onClick={() => setEditor({ account, revision: state.revision })}>编辑</Button><Button variant="link" disabled={!canWrite || protectedAdmin} title={protectedAdmin ? '至少保留一个启用的系统管理员' : undefined} onClick={event => {trigger.current = event.currentTarget; setError(''); setConfirmation({ account, revision: state.revision, operation: 'toggle' });}}>{account.status === '已启用' ? '停用' : '启用'}</Button><Button variant="link" disabled={!canWrite} onClick={event => { trigger.current = event.currentTarget; setError(''); setConfirmation({ account, revision: state.revision, operation: 'resetPassword' }); }}>重置密码</Button></div></TableCell></TableRow>; })}{!rows.length && <TableRow><TableCell colSpan={7} className="aa-empty">{state.admins.length ? '没有符合条件的后台账号，请调整或重置筛选。' : '暂无后台账号。'}</TableCell></TableRow>}</TableBody></Table>
      <FilterPagination total={rows.length} page={currentPage} size={size} onPageChange={setPage} onSizeChange={value => {setSize(value); setPage(1);}}/>
    </section>
    {editor && <AccountEditor account={editor.account} revision={editor.revision} canWrite={canWrite} transact={transact} close={() => setEditor(null)} complete={complete}/>}
    {confirmation && <Dialog open onOpenChange={open => {if (!open) setConfirmation(null);}}><DialogContent className="aa-dialog" onCloseAutoFocus={event => { event.preventDefault(); trigger.current?.focus(); }}><DialogHeader><DialogTitle>{confirmation.operation === 'resetPassword' ? '重置密码' : `${confirmation.account.status === '已启用' ? '停用' : '启用'}后台账号`}</DialogTitle><DialogDescription>{confirmation.account.account} · {confirmation.account.name}</DialogDescription></DialogHeader><p>{confirmation.operation === 'resetPassword' ? '确认后将生成新的随机密码。请妥善转交账号使用者，账号角色及启停状态保持。' : confirmation.account.status === '已启用' ? '停用后该账号将无法访问后台，账号资料及历史操作记录保留。' : '启用后该账号可按已配置的角色访问后台。'}</p>{error && <p className="aa-error" role="alert">{error}</p>}<DialogFooter><Button variant="outline" onClick={() => setConfirmation(null)}>取消</Button><Button disabled={!canWrite} variant={confirmation.operation === 'toggle' && confirmation.account.status === '已启用' ? 'destructive' : 'default'} onClick={confirm}>确认{confirmation.operation === 'resetPassword' ? '重置' : confirmation.account.status === '已启用' ? '停用' : '启用'}</Button></DialogFooter></DialogContent></Dialog>}
    {passwordResult && <PasswordResult result={passwordResult} close={() => setPasswordResult(null)} trigger={trigger}/>}
  </div>;
}
