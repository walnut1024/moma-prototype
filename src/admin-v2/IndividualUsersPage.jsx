import { toast } from 'sonner';
import { MODEL_ORDER_COLUMNS } from '../model-order-display.mjs';
import { maskApiKey } from '../api-key-utils.mjs';
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Copy, Search, ShieldCheck, UserRound, Users, X } from 'lucide-react';
import { Checkbox } from '../components/ui/checkbox';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { normalizePageSize, FilterPagination, FilterReset, FilterToolbar } from '../components/FilterControls';
import { filterIndividualAccounts, individualBillingTypes, individualFreezeScope, individualOrders, individualOrderDisplay, individualAccounts, individualName, individualStatus, individualTabs, maskIndividualValue } from './individual-users';
import './enterprise.css';
import './individual-users.css';
import { displayBusinessCopy } from '../display-copy.mjs';

const time = value => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)) : '未记录';
const number = value => Number.isFinite(Number(value)) ? Number(value).toLocaleString('zh-CN') : '—';
function AccountStatus({ tenant }) { return <span className={`ent-status ${tenant.status === '正常' ? 'good' : 'muted'}`}>{individualStatus(tenant)}</span>; }
function Empty({ children }) { return <div className="iu-empty"><Users size={24}/><p>{children}</p></div>; }
function Facts({ rows }) { return <dl className="iu-facts">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>; }
function RecordTable({ columns, rows, empty }) {
  return <><Table className="iu-table"><TableHeader><TableRow>{columns.map((column, index) => <TableHead key={index}>{column}</TableHead>)}</TableRow></TableHeader><TableBody>{rows.map(([id, ...cells]) => <TableRow key={id}>{cells.map((cell, index) => <TableCell key={index}>{cell}</TableCell>)}</TableRow>)}</TableBody></Table>{!rows.length && <Empty>{empty}</Empty>}</>;
}
function Modal({ title, description, children, close, drawer = false }) {
  const trigger = useRef(document.activeElement);
  return <Dialog open onOpenChange={open => { if (!open) close(); }}><DialogContent showCloseButton={false} className={`enterprise-dialog iu-dialog ${drawer ? 'ent-drawer' : ''}`} onCloseAutoFocus={event => { event.preventDefault(); if (trigger.current?.isConnected) trigger.current.focus(); else document.querySelector('.individual-page h1')?.focus(); }}><div className="ent-modal-head"><div><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></div><Button variant="ghost" size="icon" aria-label="关闭" onClick={close}><X/></Button></div>{children}</DialogContent></Dialog>;
}

function UserEditor({ account, transact, canWrite, close, complete }) {
  const [form, setForm] = useState({ nickname: account.user.nickname || '', email: account.user.email || '', notes: account.tenant.notes || '' });
  const [dirty, setDirty] = useState(false), [discard, setDiscard] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const change = (field, value) => { setForm(current => ({ ...current, [field]: value })); setDirty(true); setError(''); };
  const requestClose = () => dirty ? setDiscard(true) : close();
  const submit = event => {
    event.preventDefault(); if (busy) return; setBusy(true); setError('');
    try { transact({ type: 'individual', operation: 'edit', tenantId: account.tenant.id, data: form }); complete('个人用户资料已保存'); }
    catch (err) { toast.error(err.message); setError(err.message); setBusy(false); }
  };
  return <Modal drawer title="编辑个人用户资料" description={`用户 ID：${account.user.id}`} close={requestClose}><form className="ent-form" onSubmit={submit}><div className="ent-form-scroll"><section><div className="iu-editor-grid"><label className="ent-field"><span>注册手机号</span><Input readOnly value={maskIndividualValue('phone', account.user.phone)}/></label><label className="ent-field"><span>昵称</span><Input autoFocus value={form.nickname} maxLength={40} placeholder="选填，最多 40 个字符" onChange={event => change('nickname', event.target.value)}/></label><label className="ent-field iu-wide"><span>邮箱</span><Input type="email" value={form.email} maxLength={120} placeholder="选填" onChange={event => change('email', event.target.value)}/></label><label className="ent-field iu-wide"><span>备注</span><Textarea value={form.notes} maxLength={500} placeholder="记录账号管理备注，最多 500 个字符" onChange={event => change('notes', event.target.value)}/></label></div><p className="ent-hint">手机号用于注册和登录；换绑需由用户完成身份验证。用户 ID 保持不变。</p></section>{error && <p className="ent-error" role="alert">{error}</p>}{discard && <div className="ent-discard"><span>有尚未保存的内容，确定放弃？</span><Button type="button" variant="outline" onClick={() => setDiscard(false)}>继续填写</Button><Button type="button" variant="destructive" onClick={close}>放弃修改</Button></div>}</div><div className="ent-modal-footer"><Button type="button" variant="outline" onClick={requestClose} disabled={busy}>取消</Button><Button type="submit" disabled={!canWrite || !dirty || busy}>{busy ? '正在保存…' : '保存'}</Button></div></form></Modal>;
}

function StatusDialog({ account, accounts, role, transact, canWrite, close, complete }) {
  const bulk = Boolean(accounts), targets = accounts || [account];
  const [status] = useState(bulk || account.tenant.status !== '停用' ? '停用' : '正常');
  const freezing = status === '停用', action = freezing ? '冻结' : '解冻';
  const [reason, setReason] = useState(''), [code, setCode] = useState(''), [challenge, setChallenge] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [now, setNow] = useState(Date.now());
  useEffect(() => { if (!challenge) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [challenge]);
  const expired = challenge && now >= challenge.issuedAt + 300000;
  const getCode = () => { const issuedAt = Date.now(); setChallenge({ code: String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0'), issuedAt, scope: bulk ? individualFreezeScope(targets.map(item => item.tenant.id)) : `individual:${account.tenant.id}:freeze`, actor: role }); setNow(issuedAt); setCode(''); setError(''); };
  const submit = event => {
    event.preventDefault(); if (busy) return; setBusy(true); setError('');
    try { transact(bulk ? { type: 'individual', operation: 'batch-freeze', tenantIds: targets.map(item => item.tenant.id), data: { reason, code, challenge } } : { type: 'individual', operation: 'set-status', tenantId: account.tenant.id, data: { status, reason, code, challenge } }); complete(bulk ? `已冻结 ${targets.length} 个个人账号` : `个人账号已${action}`); }
    catch (err) { toast.error(err.message); setError(err.message); setBusy(false); }
  };
  return <Modal title={bulk ? `批量冻结个人账号（${targets.length} 个）` : `${action}个人账号`} description="请核对账号和影响范围后确认。" close={close}><form className="ent-form" onSubmit={submit}><div className="ent-form-scroll iu-status-body">{bulk ? <div className="iu-bulk-targets"><RecordTable columns={['用户 / User ID', '手机号码']} rows={targets.map(item => [item.tenant.id, <>{individualName(item)}<small>{item.tenant.ownerId}</small></>, maskIndividualValue('phone', item.user?.phone)])}/></div> : <Facts rows={[["用户", individualName(account)], ["用户 ID", account.tenant.ownerId || '未关联'], ["手机号", maskIndividualValue('phone', account.user?.phone)], ["操作角色", role]]}/>}<div className="iu-impact">{freezing ? <AlertTriangle size={17}/> : <ShieldCheck size={17}/>}<p>{freezing ? '冻结后禁止个人空间访问及个人 API Key 调用，历史记录保留。企业成员关系和企业资源保持原状态。' : '解冻后恢复个人空间访问；已单独停用的项目和 API Key 保持原状态。'}</p></div><label className="ent-field"><span>{action}原因 <span className="ent-required">*</span></span><Textarea required maxLength={500} autoFocus value={reason} onChange={event => { setReason(event.target.value); setError(''); }} placeholder="填写操作原因"/></label>{freezing && <section className="iu-verification"><h3><ShieldCheck size={16}/>管理员校验</h3><label className="ent-field"><span>管理员校验码 <span className="ent-required">*</span></span><div className="iu-code-controls"><Input required inputMode="numeric" aria-label="管理员校验码" value={code} maxLength={6} onChange={event => { setCode(event.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }} placeholder="6 位校验码"/><Button type="button" variant="outline" onClick={getCode}>{challenge ? '重新获取' : '获取校验码'}</Button></div></label>{challenge && <p className="iu-demo-code" role="status">{expired ? '校验码已过期，请重新获取' : <>校验码：<b>{challenge.code}</b> · 5 分钟有效</>}</p>}</section>}{error && <p className="ent-error" role="alert">{error}</p>}</div><div className="ent-modal-footer"><Button type="button" variant="outline" disabled={busy} onClick={close}>取消</Button><Button type="submit" variant={freezing ? 'destructive' : 'default'} disabled={!canWrite || busy || !reason.trim() || (freezing && (!challenge || code.length !== 6 || expired))}>{busy ? '正在提交…' : `确认${action}`}</Button></div></form></Modal>;
}

function SubscriptionDetails({ state, tenantId }) {
  const entries = individualOrders(state, tenantId).map(entry => ({ ...entry, display: individualOrderDisplay(state, entry) }));
  const [billing, setBilling] = useState('all'), [status, setStatus] = useState('all'), [inspect, setInspect] = useState(null), [query, setQuery] = useState(''), [page, setPage] = useState(1), [size, setSize] = useState(20);
  const statuses = [...new Set(entries.map(item => item.display.status))];
  const records = entries.filter(item => (billing === 'all' || item.billingType === billing) && (status === 'all' || item.display.status === status) && [item.display.name, item.display.modelNames, item.order.orderNo, item.order.id].some(value => String(value || '').toLowerCase().includes(query.trim().toLowerCase())));
  const unknown = entries.filter(item => !item.billingType).length;
  const currentPage = Math.min(page, Math.ceil(records.length / size) || 1);
  const quantity = (value, unit) => value == null || String(value).trim() === '' || !Number.isFinite(Number(value)) ? '未记录' : number(value) + (unit ? ' ' + unit : '（单位未记录）');
  const columns = ['模型 / 套餐 / 资源包名称', '计费方式', ...MODEL_ORDER_COLUMNS];
  return <>
    <div className="iu-subscriptions">
        <FilterToolbar className="iu-subscription-toolbar">
          <div className="ent-search"><Search size={16}/><Input aria-label="搜索订购记录" value={query} placeholder="搜索模型、套餐、资源包或订单编号" onChange={event => { setQuery(event.target.value); setPage(1); }}/></div>
          <div className="iu-billing-filter"><span id="iu-billing-label">计费方式</span><Select value={billing} onValueChange={value => { setBilling(value); setQuery(''); setPage(1); }}><SelectTrigger aria-labelledby="iu-billing-label" size="sm"><SelectValue/></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">全部计费方式</SelectItem>{Object.entries(individualBillingTypes).map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}</SelectGroup></SelectContent></Select></div>
          <div className="iu-order-filter"><span id="iu-order-status-label">订购状态</span><Select value={status} onValueChange={value => { setStatus(value); setPage(1); }}><SelectTrigger aria-labelledby="iu-order-status-label" size="sm"><SelectValue/></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">全部状态</SelectItem>{statuses.map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectGroup></SelectContent></Select></div>
          <FilterReset onClick={() => { setBilling('all'); setStatus('all'); setQuery(''); setPage(1); }}/>
        </FilterToolbar>
        <div className="iu-subscription-table"><RecordTable columns={columns} rows={records.slice((currentPage - 1) * size, currentPage * size).map(entry => {
          const { order, display } = entry;
          return [order.id, <span className="iu-subscription-name">{display.name}</span>, <span className="iu-billing-value">{individualBillingTypes[entry.billingType] || '未记录'}</span>, display.type, <span className="iu-subscription-cell">{display.provider}</span>, <span className="iu-subscription-cell">{display.tariff}</span>, <span className="iu-subscription-cell">{display.catalogPrice}</span>, <span className="iu-order-status" data-status={display.status}>{display.status}</span>, time(display.orderedAt), time(display.expiresAt), <Button variant="link" aria-label={'查看 ' + display.name + ' 订购详情'} onClick={() => setInspect(entry)}>详情</Button>];
        })} empty={query.trim() || status !== 'all' ? '没有匹配的订购记录' : billing === 'all' ? '暂无订购记录' : '暂无' + individualBillingTypes[billing] + '记录'}/></div>
        <FilterPagination total={records.length} page={currentPage} size={size} onPageChange={setPage} onSizeChange={value => { setSize(value); setPage(1); }}/>
    </div>
    {unknown > 0 && <p className="iu-readonly">有 {unknown} 条订购记录尚未填写计费类型，可在全部计费方式中查看。</p>}
    {inspect && <Modal title="订购详情" description={inspect.display.name} close={() => setInspect(null)}><Facts rows={[
      ['订单编号', inspect.order.orderNo || inspect.order.id], ['计费方式', individualBillingTypes[inspect.billingType] || '未记录'], ['商品名称', inspect.product?.name || '未记录'], ['模型', inspect.display.modelNames], ['类型', inspect.display.type], ['模型服务商', inspect.display.provider], ['资费场景', inspect.display.tariff], ['目录价', inspect.display.catalogPrice], ['订购状态', inspect.display.status], ['订购时间', time(inspect.display.orderedAt)], ['生效时间', time(inspect.order.startAt)], ['到期时间', time(inspect.display.expiresAt)], ...(inspect.billingType === 'payg' ? [] : [['订购额度', quantity(inspect.order.entitlement, inspect.order.quotaUnit)], ['已用额度', quantity(inspect.order.used, inspect.order.quotaUnit)]])
    ]}/>{inspect.billingType !== 'payg' && typeof inspect.order.entitlement === 'number' && inspect.order.entitlement > 0 && typeof inspect.order.used === 'number' && inspect.order.used >= 0 && <div className="iu-quota-usage"><div><span>额度使用情况</span><span>剩余 {quantity(Math.max(0, inspect.order.entitlement - inspect.order.used), inspect.order.quotaUnit)}</span></div><progress aria-label="订购额度使用比例" max={inspect.order.entitlement} value={Math.min(inspect.order.used, inspect.order.entitlement)}/></div>}<div className="ent-modal-footer"><Button variant="outline" onClick={() => setInspect(null)}>关闭</Button></div></Modal>}
  </>;
}

function UserDetails({ account, state, tab, navigate, canWrite, setEditor }) {
  const { tenant, user } = account;
  const [inspectKey, setInspectKey] = useState(null);
  const projects = state.projects.filter(item => item.tenantId === tenant.id), keys = state.apiKeys.filter(item => item.tenantId === tenant.id);
  const membershipRows = state.memberships.filter(member => member.userId === tenant.ownerId).map(member => ({ member, enterprise: state.tenants.find(item => item.id === member.tenantId && ['企业', '政府'].includes(item.type)) })).filter(item => item.enterprise);
  const modelNames = modelIds => (modelIds || []).map(id => state.models.find(model => model.id === id)?.name || id).join('、') || '无';
  const copyId = async () => { try { await navigator.clipboard.writeText(user?.id || tenant.ownerId); toast.success('用户 ID 已复制'); } catch { toast.error('复制失败，请手动复制用户 ID'); } };
  return <><Tabs value={tab} onValueChange={value => navigate({ tab: value }, true)} className="ent-panel ent-detail iu-detail"><TabsList variant="line">{Object.entries(individualTabs).map(([id, label]) => <TabsTrigger key={id} value={id}>{label}</TabsTrigger>)}</TabsList>
    <TabsContent value="info"><div className="ent-section-head"><h2>用户信息</h2><Button variant="outline" disabled={!canWrite || !user} onClick={() => setEditor(true)}>编辑信息</Button></div><Facts rows={[
      ['用户 ID', <span className="iu-copy-value">{user?.id || tenant.ownerId || '未关联'}{tenant.ownerId && <Button variant="ghost" size="icon-sm" aria-label="复制用户 ID" onClick={copyId}><Copy/></Button>}</span>], ['手机号码', maskIndividualValue('phone', user?.phone)], ['昵称', user?.nickname || '未设置'], ['邮箱', maskIndividualValue('email', user?.email)], ['账号状态', <AccountStatus tenant={tenant}/>], ['注册方式', tenant.source || '未记录'], ['注册时间', time(user?.registeredAt)], ['手机号验证', user?.phoneVerifiedAt ? `已验证 · ${time(user.phoneVerifiedAt)}` : '未记录'], ['最近登录', user?.lastLoginAt ? time(user.lastLoginAt) : user && Object.hasOwn(user, 'lastLoginAt') ? '尚未登录' : '未记录'], ['备注', tenant.notes || '未填写'], ...(tenant.status === '停用' ? [['冻结原因', displayBusinessCopy(tenant.freezeReason) || '未记录']] : []),
    ]}/>{membershipRows.length > 0 && <><div className="ent-section-head"><h2>所属企业</h2><span>企业成员关系</span></div><RecordTable columns={['企业', '企业角色', '成员状态']} rows={membershipRows.map(({ member, enterprise }) => [member.id, enterprise.name, member.role, member.status])} empty="暂无企业成员关系"/></>}</TabsContent>
    <TabsContent value="entitlements"><SubscriptionDetails state={state} tenantId={tenant.id}/></TabsContent>
    <TabsContent value="projects"><div className="ent-section-head"><h2>项目空间</h2><span>{projects.length} 个项目</span></div><RecordTable columns={['项目名称', '项目 ID', 'API Key 数', '创建时间', '状态']} rows={projects.map(project => [project.id, project.name, project.id, keys.filter(key => key.projectId === project.id).length, time(project.createdAt), project.status])} empty="尚未创建个人项目空间"/></TabsContent>
    <TabsContent value="keys"><div className="ent-section-head"><h2>API Key</h2><span>{keys.length} 个 Key</span></div><RecordTable columns={['Key 名称/Key ID', 'API Key', '所属项目', '授权模型', 'Key 状态', '操作']} rows={keys.map(key => [key.id, <><span>{key.name}</span><small>{key.keyId}</small></>, maskApiKey(key.secretPreview), projects.find(project => project.id === key.projectId)?.name || '归属异常', <span className="iu-wrapped">{modelNames(key.modelIds)}</span>, key.status, <Button variant="link" onClick={() => setInspectKey(key)}>详情</Button>])} empty="尚未创建个人 API Key"/></TabsContent>
  </Tabs>
  {inspectKey && <Modal title="API Key 详情" description={inspectKey.name} close={() => setInspectKey(null)}><Facts rows={[["Key ID", inspectKey.keyId], ["所属项目", projects.find(project => project.id === inspectKey.projectId)?.name || '归属异常'], ["Key 状态", inspectKey.status], ["个人账号状态", <AccountStatus tenant={tenant}/>], ["授权模型", modelNames(inspectKey.modelIds)], ["最近调用", time(inspectKey.lastUsedAt)], ["调用条件", tenant.status === '停用' ? '个人账号已冻结，后续调用将被拒绝' : '需同时满足 Key、项目、模型授权、额度和网关规则']]}/><div className="ent-modal-footer"><Button variant="outline" onClick={() => setInspectKey(null)}>关闭</Button></div></Modal>}
  </>;
}

export default function IndividualUsersPage({ state, transact, conflict }) {
  const [params, setParams] = useState(() => new URLSearchParams(location.hash.split('?')[1] || ''));
  const [editing, setEditing] = useState(false), [confirmation, setConfirmation] = useState(null), [selected, setSelected] = useState([]), [bulkMode, setBulkMode] = useState(false);
  useEffect(() => { const sync = () => { setParams(new URLSearchParams(location.hash.split('?')[1] || '')); setEditing(false); setConfirmation(null); setSelected([]); setBulkMode(false);  }; addEventListener('hashchange', sync); return () => removeEventListener('hashchange', sync); }, []);
  const navigate = (patch, replace = false) => { setSelected([]); if (Object.hasOwn(patch, 'user')) setBulkMode(false); const next = new URLSearchParams(location.hash.split('?')[1] || ''); Object.entries(patch).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key)); const hash = `#/admin-2/individual-users${next.size ? '?' + next : ''}`; if (replace) history.replaceState(null, '', hash); else location.hash = hash; setParams(next);  };
  const userId = params.get('user'), account = individualAccounts(state).find(item => item.tenant.ownerId === userId);
  const filters = { q: params.get('q') || '', status: params.get('status') || '' };
  const rows = filterIndividualAccounts(state, filters);
  const size = normalizePageSize(params.get('size'));
  const page = Math.max(1, Math.min(Number(params.get('page')) || 1, Math.ceil(rows.length / size) || 1));
  const tab = Object.hasOwn(individualTabs, params.get('tab')) ? params.get('tab') : 'info';
  const canWrite = !conflict && !state.storageError && ['平台管理员', '运营人员'].includes(state.currentRole);
  useEffect(() => { if (!canWrite) { setSelected([]); setBulkMode(false); } }, [canWrite]);
  const selecting = bulkMode && canWrite && !userId;
  const complete = text => { setEditing(false); setConfirmation(null); setSelected([]); setBulkMode(false); toast.success(text); };
  const pageRows = rows.slice((page - 1) * size, page * size);
  const eligible = pageRows.filter(item => item.tenant.status === '正常');
  const selectedAccounts = eligible.filter(item => selected.includes(item.tenant.id));
  const selectAll = selectedAccounts.length > 0 && selectedAccounts.length === eligible.length;
  const toggle = (id, checked) => setSelected(current => checked ? [...new Set([...current, id])] : current.filter(value => value !== id));
  const openAccount = item => navigate({ user: item.tenant.ownerId, tab: '' });
  return <div className={`enterprise-page individual-page ${userId ? 'ent-detail-page' : ''}`}><div className="ent-page-head"><div><div className="ent-title-line"><h1 tabIndex={-1}>{userId ? <UserRound size={16} aria-hidden="true"/> : <Users size={16} aria-hidden="true"/>}{userId ? account ? individualName(account) : '用户不存在' : '个人用户'}</h1>{account && <AccountStatus tenant={account.tenant}/>}</div><p>{userId ? account?.tenant.ownerId || '请通过面包屑返回个人用户列表' : '通过手机号自主注册，以个人身份订购和使用模型服务的用户。'}</p></div>{account && <Button variant="outline" disabled={!canWrite} onClick={() => setConfirmation(account)}>{account.tenant.status === '停用' ? '账号解冻' : '账号冻结'}</Button>}{!userId && !selecting && <Button variant="outline" disabled={!canWrite} onClick={() => { setSelected([]); setBulkMode(true); }}>批量操作</Button>}</div>{!canWrite && <p className="iu-readonly">{conflict ? '数据已变化，请载入新版本后再操作。' : state.storageError ? '数据读取失败，请恢复数据后再操作。' : `${state.currentRole}仅可查看个人用户资料。`}</p>}
    {!userId ? <section className={`ent-panel iu-list ${selecting ? 'iu-bulk-mode' : ''}`}><FilterToolbar className="iu-toolbar"><label className="ent-search"><Search size={15}/><Input aria-label="搜索个人用户" value={filters.q} placeholder="搜索手机号、昵称或用户 ID" onChange={event => navigate({ q: event.target.value, page: '' }, true)}/></label><label className="ent-filter-status"><span>账号状态</span><Select value={filters.status || 'all'} onValueChange={value => navigate({ status: value === 'all' ? '' : value, page: '' }, true)}><SelectTrigger aria-label="账号状态"><SelectValue/></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">全部状态</SelectItem><SelectItem value="正常">正常</SelectItem><SelectItem value="停用">已冻结</SelectItem></SelectGroup></SelectContent></Select></label><FilterReset onClick={() => navigate({ q: '', status: '', page: '' }, true)}/></FilterToolbar>{selecting && <div className="iu-bulk-toolbar"><span>{selectedAccounts.length ? '已选择 ' + selectedAccounts.length + ' 个正常账号' : '勾选正常账号进行批量冻结'}</span><Button variant="outline" disabled={!canWrite || !selectedAccounts.length} onClick={() => setConfirmation({ accounts: selectedAccounts })}>批量冻结</Button><Button variant="ghost" onClick={() => { setSelected([]); setBulkMode(false); }}>取消批量操作</Button></div>}<RecordTable columns={[...(selecting ? [<Checkbox aria-label="选择本页全部正常账号" disabled={!canWrite || !eligible.length} checked={selectAll ? true : selectedAccounts.length ? 'indeterminate' : false} onCheckedChange={checked => setSelected(checked ? eligible.map(item => item.tenant.id) : [])}/>] : []), '用户 / User ID', '手机号码', '账号状态', '注册时间', '最近登录时间', '操作']} rows={pageRows.map(item => [item.tenant.id, ...(selecting ? [<Checkbox aria-label={'选择用户 ' + individualName(item)} disabled={!canWrite || item.tenant.status !== '正常'} checked={selected.includes(item.tenant.id)} onCheckedChange={checked => toggle(item.tenant.id, checked)}/>] : []), <div className="iu-user-identity"><span className="iu-user-avatar" aria-hidden="true">{Array.from(individualName(item))[0]}</span><div className="iu-identity-text"><Button variant="link" className="iu-user-link" onClick={() => openAccount(item)}>{individualName(item)}</Button><small title={item.user?.id || item.tenant.ownerId}>{item.user?.id || item.tenant.ownerId || '未关联身份'}</small></div></div>, maskIndividualValue('phone', item.user?.phone), <AccountStatus tenant={item.tenant}/>, time(item.user?.registeredAt), item.user?.lastLoginAt ? time(item.user.lastLoginAt) : item.user && Object.hasOwn(item.user, 'lastLoginAt') ? <span className="iu-muted">尚未登录</span> : '未记录', <div className="iu-row-actions"><Button variant="link" onClick={() => openAccount(item)}>详情</Button><Button variant="link" disabled={!canWrite} onClick={() => setConfirmation(item)}>{item.tenant.status === '停用' ? '解冻' : '冻结'}</Button></div>])} empty={Object.values(filters).some(Boolean) ? '没有匹配的个人用户，请调整或重置筛选条件。' : '尚无个人用户，手机号注册完成后将在此展示。'}/><FilterPagination total={rows.length} page={page} size={size} onPageChange={value => navigate({ page: String(value) }, true)} onSizeChange={value => navigate({ size: String(value), page: '' }, true)}/></section> : !account ? <section className="ent-panel"><Empty>用户不存在，请通过面包屑返回个人用户列表。</Empty></section> : <>{account.tenant.status === '停用' && <div className="iu-frozen-banner"><AlertTriangle size={16}/><span>个人账号已冻结，个人空间访问和个人 Key 调用受限。{account.tenant.freezeReason && `原因：${displayBusinessCopy(account.tenant.freezeReason)}`}</span></div>}<UserDetails key={account.tenant.id} account={account} state={state} tab={tab} navigate={navigate} canWrite={canWrite} setEditor={setEditing}/></>}
    {editing && account?.user && <UserEditor account={account} transact={transact} canWrite={canWrite} close={() => setEditing(false)} complete={complete}/>}
    {confirmation && <StatusDialog key={confirmation.accounts ? 'bulk' : confirmation.tenant.id} accounts={confirmation.accounts} account={confirmation.accounts ? undefined : individualAccounts(state).find(item => item.tenant.id === confirmation.tenant.id) || confirmation} role={state.currentRole} transact={transact} canWrite={canWrite} close={() => setConfirmation(null)} complete={complete}/>}
  </div>;
}
