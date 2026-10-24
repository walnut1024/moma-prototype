import { toast } from 'sonner';
import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import { Building2, CheckCircle2, Copy, Plus, Search, ShieldCheck, X } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../components/ui/dialog';
import { normalizePageSize, FilterPagination, FilterReset, FilterToolbar } from '../components/FilterControls';
import { effectiveEnterpriseAdmins, enterpriseAdmins, enterpriseMetadataFields, enterpriseTenants, privateEnterprise } from './enterprise';
import EnterpriseDetails from './EnterpriseDetails';
import EnterpriseStatusDialog from './EnterpriseStatusDialog';
import { countries, chinaRegions, industries, changeEnterpriseLocation } from './enterprise-options';
import './enterprise.css';

const newIds = () => Object.fromEntries(['tenant', 'user', 'member', 'organization'].map(key => [key, `${key}-${crypto.randomUUID()}`]));
const statusText = value => value === '正常' ? '已启用' : value === '停用' ? '已停用' : value;
function Status({ value, enterprise = false }) { return <span className={`ent-status ${['正常', '有效'].includes(value) ? 'good' : 'muted'}`}>{enterprise && value === '停用' ? '已冻结' : statusText(value)}</span>; }
function Field({ label, children, className = '', ...props }) { return <label className={`ent-field ${className}`}><span>{label}</span>{children || <Input {...props}/>}</label>; }
function DropdownField({ label, value, options, onChange, placeholder = '请选择', disabled = false, required = false, className = '' }) {
  return <Field label={label} className={className}><select aria-label={label} value={value} required={required} disabled={disabled} onChange={e => onChange(e.target.value)}><option value="">{placeholder}</option>{value && !options.some(option => option.value === value) && <option value={value}>{value}（原值）</option>}{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>;
}
function Empty({ children }) { return <div className="ent-empty"><Building2 size={28}/><p>{children}</p></div>; }
function Modal({ title, description, close, children, drawer = false, className = '', icon }) {
  const trigger = useRef(document.activeElement);
  return <Dialog open onOpenChange={open => { if (!open) close(); }}><DialogContent className={`enterprise-dialog ${drawer ? 'ent-drawer' : ''} ${className}`} showCloseButton={false} onCloseAutoFocus={event => { event.preventDefault(); if (trigger.current?.isConnected) trigger.current.focus(); else document.querySelector('.enterprise-page h1')?.focus(); }}><div className="ent-modal-head"><div><div className="ent-modal-title-row">{icon && <span className="ent-modal-icon">{icon}</span>}<DialogTitle>{title}</DialogTitle></div><DialogDescription>{description}</DialogDescription></div><Button variant="ghost" size="icon" aria-label="关闭" onClick={close}><X/></Button></div>{children}</DialogContent></Dialog>;
}

function EnterpriseEditor({ state, tenant, kind, mode, apply, close, complete, inline = false, canWrite = true }) {
  const admins = tenant ? enterpriseAdmins(state, tenant) : [];
  const [form, setForm] = useState({ type: tenant?.type || '企业', notes: tenant?.notes || '', ...Object.fromEntries(enterpriseMetadataFields.map(field => [field.key, tenant?.[field.key] || (field.key === 'countryRegion' ? '中国' : field.key === 'companyName' && kind === 'edit' ? tenant.name : '')])), accountMode: 'new', adminName: '', login: '', email: '', phone: '', userId: '', adminPhones: Object.fromEntries(admins.map(member => [member.userId, state.users.find(user => user.id === member.userId)?.phone || ''])) });
  const [dirty, setDirty] = useState(false), [discard, setDiscard] = useState(false), [error, setError] = useState(''), [query, setQuery] = useState(''), [busy, setBusy] = useState(false);
  const pendingLeave = useRef(null);
  useEffect(() => {
    if (!inline || !dirty) return;
    const savedHash = location.hash;
    const guardUnload = event => { event.preventDefault(); event.returnValue = ''; };
    const guardNavigation = event => {
      const target = event.target.closest?.('.v2-sidebar button, .v2-module-tabs button, a[href^="#/"]');
      if (!target || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault(); event.stopPropagation();
      pendingLeave.current = () => target.click(); setDiscard(true);
    };
    const guardHash = event => {
      if (location.hash === savedHash) return;
      const destination = location.hash;
      history.replaceState(null, '', savedHash); event.stopImmediatePropagation();
      pendingLeave.current = () => { location.hash = destination; }; setDiscard(true);
    };
    addEventListener('beforeunload', guardUnload);
    document.addEventListener('click', guardNavigation, true);
    addEventListener('popstate', guardHash, true);
    addEventListener('hashchange', guardHash, true);
    return () => { removeEventListener('beforeunload', guardUnload); document.removeEventListener('click', guardNavigation, true); removeEventListener('popstate', guardHash, true); removeEventListener('hashchange', guardHash, true); };
  }, [inline, dirty]);
  const edit = kind === 'edit', addAdmin = kind === 'add-admin';
  const update = (key, value) => { setForm(current => ({ ...current, [key]: value })); setDirty(true); setError(''); };
  const [regionState, setRegionState] = useState({ country: '', regions: [], loading: false, error: '' });
  const [regionRetry, setRegionRetry] = useState(0);
  const countryCode = countries.find(country => country.name === form.countryRegion)?.code;
  useEffect(() => {
    if (!countryCode || countryCode === 'CN' || addAdmin) return;
    let cancelled = false;
    setRegionState({ country: countryCode, regions: [], loading: true, error: '' });
    fetch(`/moma_5.13.0_estack/enterprise-regions/${countryCode}.json`).then(response => { if (!response.ok) throw new Error(); return response.json(); }).then(regions => {
      if (!cancelled) setRegionState({ country: countryCode, regions, loading: false, error: '' });
    }).catch(() => { if (!cancelled) setRegionState({ country: countryCode, regions: [], loading: false, error: '地域选项加载失败，请重试。' }); });
    return () => { cancelled = true; };
  }, [countryCode, addAdmin, regionRetry]);
  const regions = countryCode === 'CN' ? chinaRegions : regionState.country === countryCode ? regionState.regions : [];
  const regionLoaded = countryCode === 'CN' || (regionState.country === countryCode && !regionState.loading && !regionState.error);
  const provinceOptions = regions.length ? regions.map(region => ({ value: region.name, label: region.name })) : regionLoaded ? [{ value: '不适用', label: '不适用（无省份/州）' }] : [];
  const cities = regions.find(region => region.name === form.province)?.cities || [];
  const locationChange = (key, value) => { setForm(current => changeEnterpriseLocation(current, key, value)); setDirty(true); setError(''); };
  const candidates = state.users.filter(user => user.status === '正常' && `${user.name} ${user.login}`.toLowerCase().includes(query.toLowerCase()));
  const selected = state.users.find(user => user.id === form.userId);
  const sameName = !addAdmin && state.tenants.find(item => item.id !== tenant?.id && item.name.trim() === form.companyName.trim());
  const submit = event => {
    event.preventDefault(); if (busy || !canWrite) return; setBusy(true); setError('');
    try {
      const ids = newIds();
      const next = apply({ type: 'enterprise', operation: kind, tenantId: tenant?.id, mode, ids, data: form });
      const company = next.tenants.find(item => item.id === (tenant?.id || ids.tenant));
      if (edit) complete({ edited: true, tenant: company });
      else complete({ tenant: company, user: next.users.find(user => user.id === (form.accountMode === 'existing' ? form.userId : ids.user)), added: addAdmin });
    } catch (err) { toast.error(err.message); setError(err.message); setBusy(false); }
  };
  const requestClose = () => { pendingLeave.current = null; if (dirty) setDiscard(true); else close(); };
  const abandon = () => { const leave = pendingLeave.current; close(); if (leave) setTimeout(leave, 0); };
  const content = <>
    <form className={`ent-form ${inline ? 'ent-inline-form' : ''}`} onSubmit={submit} aria-label={edit ? '编辑政企用户信息' : addAdmin ? '添加企业管理员' : '新用户'}>
      {inline && <div className="ent-section-head ent-edit-head"><div><h2>编辑信息</h2><p>User ID：{tenant.id}</p></div><div className="ent-row-actions"><Button type="button" variant="outline" onClick={requestClose}>取消</Button><Button type="submit" disabled={busy || !canWrite}>{busy ? '正在保存…' : '保存修改'}</Button></div></div>}
      <div className="ent-form-scroll">
        {edit && <section><h3>用户信息</h3><div className="ent-form-grid"><DropdownField label="客户类型" value={form.type} options={['政府', '企业'].map(value => ({ value, label: value }))} onChange={value => update('type', value)}/><Field label="备注"><Textarea rows={1} value={form.notes} maxLength={500} onChange={e => update('notes', e.target.value)}/></Field></div></section>}
        {edit && <section><h3><ShieldCheck size={16}/>企业管理员</h3>{admins.length ? admins.map(member => {
          const user = state.users.find(item => item.id === member.userId);
          return <div className="ent-form-grid ent-admin-edit" key={member.id}><Field label="姓名"><span className="ent-edit-value">{user?.name || member.name}</span></Field><Field label="账号"><span className="ent-edit-value">{user?.login || '登录身份缺失'}</span></Field><Field label={`手机号 *（${user?.login || member.name}）`} required type="tel" maxLength={24} value={form.adminPhones[member.userId] || ''} placeholder="中国大陆手机号，或 + 国际区号" onChange={e => update('adminPhones', { ...form.adminPhones, [member.userId]: e.target.value })}/><Field label="邮箱"><span className="ent-edit-value">{user?.email || '未填写'}</span></Field></div>;
        }) : <p className="ent-unfilled">待配置，可在组织及成员中添加管理员。</p>}<p className="ent-hint">手机号保存到该账号，供其所属政企用户共用。</p></section>}
        {!addAdmin && <section><h3><Building2 size={16}/>企业信息</h3><div className="ent-form-grid"><Field className="ent-field-wide" label="公司/机构名称 *" value={form.companyName} maxLength={120} required autoFocus={!inline} onChange={e => update('companyName', e.target.value)} placeholder="企业或机构主体全称"/><Field label="税号/统一社会信用代码 *" required value={form.taxId} maxLength={32} onChange={e => update('taxId', e.target.value)} placeholder="填写主体税务标识"/></div>{sameName && <p className="ent-note">已有同名企业（{sameName.id}），请核对是否需要重复开户。</p>}</section>}
        {!edit && <section><h3><ShieldCheck size={16}/>{addAdmin ? '管理员账号' : '首位企业管理员'}</h3><div className="ent-account-modes"><label><input type="radio" name="accountMode" checked={form.accountMode === 'new'} onChange={() => update('accountMode', 'new')}/>创建新登录账号</label><label><input type="radio" name="accountMode" checked={form.accountMode === 'existing'} onChange={() => update('accountMode', 'existing')}/>选择已有登录账号</label></div>
          {form.accountMode === 'new' ? <><div className="ent-form-grid"><Field label="管理员姓名 *" value={form.adminName} maxLength={40} required onChange={e => update('adminName', e.target.value)} placeholder="请输入姓名"/><Field label="登录账号 *" value={form.login} required minLength={3} maxLength={64} onChange={e => update('login', e.target.value)} placeholder="如 zhangsan"/><Field label="手机号码 *" type="tel" value={form.phone} maxLength={24} required onChange={e => update('phone', e.target.value)} placeholder="中国大陆手机号，或 + 国际区号"/><Field className="ent-field-wide" label="管理员邮箱" type="email" value={form.email} onChange={e => update('email', e.target.value)} placeholder="选填，用于记录账号联系信息"/></div><p className="ent-hint">3–64 位字母、数字或 . _ @ -，不区分大小写。</p></> : <><Field label="查找登录账号" value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索姓名或登录账号"/><div className="ent-account-options" role="group" aria-label="已有登录账号">{candidates.map(user => { const relation = tenant && enterpriseAdmins(state, tenant).find(member => member.userId === user.id); return <button key={user.id} type="button" disabled={Boolean(relation)} aria-pressed={form.userId === user.id} className={form.userId === user.id ? 'selected' : ''} onClick={() => { setForm(current => ({ ...current, userId: user.id, phone: user.phone || '' })); setDirty(true); setError(''); }}><span><b>{user.name}</b><small>{user.login}</small>{relation && <small>{relation.status === '停用' ? '已停用，请在管理员列表启用' : '已是本企业管理员'}</small>}</span>{form.userId === user.id && <CheckCircle2 size={16}/>}</button>; })}{!candidates.length && <p>没有匹配的账号，请调整搜索或创建新账号。</p>}</div>{selected && <><p className="ent-selected">已选择：{selected.name} · {selected.login}</p><div className="ent-form-grid"><Field label="手机号码 *" type="tel" value={form.phone} maxLength={24} required onChange={e => update('phone', e.target.value)} placeholder="请补录管理员手机号"/><p className="ent-hint ent-field-wide">手机号保存到该登录账号，供其所属企业共用；关联账号前须填写。</p></div></>}</>}
          <div className="ent-role-note"><ShieldCheck size={17}/><div><b>企业管理员</b><p>管理当前企业的组织、成员和项目。平台后台权限另行授予。</p></div></div><p className="ent-hint">{form.accountMode === 'new' ? '开通后查看账号初始化信息，并交接给企业管理员。' : '关联后沿用该人员现有登录方式。'}</p>
        </section>}
        {!addAdmin && <><section><h3>地域与行业</h3><div className="ent-form-grid">
          <DropdownField label="国家/地区 *" required value={form.countryRegion} options={countries.map(country => ({ value: country.name, label: country.name }))} onChange={value => locationChange('countryRegion', value)}/>
          <DropdownField label="省份/州 *" required value={form.province} options={provinceOptions} disabled={!countryCode || !regionLoaded} placeholder={!countryCode ? '请先选择国家/地区' : countryCode !== 'CN' && regionState.loading ? '正在加载…' : regionLoaded ? '请选择省份/州' : '等待地域选项'} onChange={value => locationChange('province', value)}/>
          <DropdownField label="城市" value={form.city} options={cities.map(city => ({ value: city, label: city }))} disabled={!form.province || !cities.length} placeholder={!form.province ? '请先选择省份/州' : cities.length ? '请选择城市' : '暂无城市选项'} onChange={value => locationChange('city', value)}/>
          <Field className="ent-field-wide" label="详细地址" value={form.address} maxLength={200} onChange={e => update('address', e.target.value)} placeholder="区县、街道及门牌等"/>
          <DropdownField label="所属行业" value={form.industry} options={industries.map(([code, name]) => ({ value: name, label: code + ' ' + name }))} onChange={value => update('industry', value)} placeholder="请选择行业门类"/>
        </div>{regionState.country === countryCode && regionState.error && <p className="ent-error" role="alert">{regionState.error}<button type="button" className="ent-link" onClick={() => setRegionRetry(value => value + 1)}>重试</button></p>}<p className="ent-hint">行业：GB/T 4754—2017（20 个门类）。<a href="/moma_5.13.0_estack/enterprise-regions/README.txt" target="_blank" rel="noreferrer">地域数据来源</a>；选项未覆盖的地址可填入详细地址。</p></section><section><h3>业务联系</h3><p className="ent-hint">联系人用于企业业务沟通，不自动获得管理员权限。</p><div className="ent-form-grid">{enterpriseMetadataFields.slice(7).map(field => <Field key={field.key} label={field.label + (field.required ? ' *' : '')} required={field.required} type={field.type || 'text'} value={form[field.key]} maxLength={field.max} placeholder={field.placeholder} onChange={e => update(field.key, e.target.value)}/>)}{!edit && <Field className="ent-field-wide" label="备注"><Textarea rows={1} value={form.notes} maxLength={500} onChange={e => update('notes', e.target.value)} placeholder="客户背景、开户说明等（选填）"/></Field>}</div></section></>}
        {error && <p className="ent-error" role="alert">{error}</p>}
        {discard && !inline && <div className="ent-discard" role="alert"><span>有尚未保存的内容，确定放弃？</span><Button type="button" variant="outline" onClick={() => setDiscard(false)}>继续填写</Button><Button type="button" variant="destructive" onClick={abandon}>放弃修改</Button></div>}
      </div>
      {!inline && <div className="ent-modal-footer"><Button type="button" variant="outline" onClick={requestClose}>取消</Button><Button type="submit" disabled={busy || !canWrite}>{busy ? '正在保存…' : addAdmin ? '添加管理员' : '创建并开通'}</Button></div>}
    </form>
    {inline && discard && <Modal title="放弃修改？" description="当前修改尚未保存，离开后不会保留。" close={() => setDiscard(false)}><div className="ent-modal-footer"><Button variant="outline" onClick={() => setDiscard(false)}>继续编辑</Button><Button variant="destructive" onClick={abandon}>放弃修改</Button></div></Modal>}
  </>;
  return inline ? <div className="ent-editor ent-inline-editor">{content}</div> : <Modal drawer className="ent-editor" title={addAdmin ? '添加企业管理员' : '新用户'} description={addAdmin ? `所属企业：${tenant.name}` : '建立政企主体，并为其开通首位企业管理员。'} close={requestClose}>{content}</Modal>;
}

export default function EnterprisePage({ state, transact, deploymentTarget }) {
  const [params, setParams] = useState(() => new URLSearchParams(location.hash.split('?')[1] || ''));
  const [editor, setEditor] = useState(null), [result, setResult] = useState(null), [confirmation, setConfirmation] = useState(null);
  useEffect(() => { const sync = () => setParams(new URLSearchParams(location.hash.split('?')[1] || '')); addEventListener('hashchange', sync); return () => removeEventListener('hashchange', sync); }, []);
  const navigate = (patch, replace = false) => { const next = new URLSearchParams(location.hash.split('?')[1] || ''); Object.entries(patch).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key)); const hash = `#/admin-2/tenants${next.size ? `?${next}` : ''}`; if (replace) history.replaceState(null, '', hash); else location.hash = hash; setParams(next);  };
  const mode = params.get('scenario') === 'private' ? 'private' : 'cloud';
  const all = enterpriseTenants(state), defaultTenant = privateEnterprise(state);
  const companies = mode === 'private' ? all.filter(item => item.id === defaultTenant?.id) : all;
  const detailId = params.get('enterprise'), tenant = companies.find(item => item.id === detailId);
  const query = params.get('q') || '', status = params.get('status') || '';
  const canWrite = ['平台管理员', '运营人员'].includes(state.currentRole);
  const hasCapacity = mode === 'cloud' || !all.length;
  const apply = action => transact({ ...action, mode });
  const adminsFor = item => enterpriseAdmins(state, item);
  const accountFor = member => state.users.find(user => user.id === member.userId);
  const rows = companies.filter(item => (!status || item.status === status) && [item.id, item.name].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  const size = normalizePageSize(params.get('size'));
  const page = Math.max(1, Math.min(Number(params.get('page')) || 1, Math.ceil(rows.length / size) || 1));
  const askToggle = (company, member) => { setConfirmation({ tenant: company, member }); };
  const copy = async text => { try { await navigator.clipboard.writeText(text); toast.success('已复制账号交接信息'); } catch { toast.error('复制失败，请选择下方文本手动复制'); } };
  const handover = result ? `【企业账号交接信息】\n企业：${result.tenant.name}\nuser_id：${result.tenant.id}\n管理员：${result.user.name}\n登录账号：${result.user.login}\n手机号码：${result.user.phone || '未填写'}\n账号初始化：${result.user.initialized ? '已完成，沿用现有登录方式' : '待设置密码'}` : '';
  return <div className={`v2-page enterprise-page ${detailId ? 'ent-detail-page' : ''}`}>
    {deploymentTarget && createPortal(<div className="admin-banner-field admin-banner-deployment"><span>部署方式</span><Select value={mode} onValueChange={value => navigate({ scenario: value === 'private' ? 'private' : '', enterprise: '', tab: '', page: '', q: '', status: '' })}><SelectTrigger size="sm" aria-label="部署方式" disabled={editor?.kind === 'edit'}><SelectValue/></SelectTrigger><SelectContent align="end"><SelectGroup><SelectItem value="cloud">私有云</SelectItem><SelectItem value="private">私有化</SelectItem></SelectGroup></SelectContent></Select></div>, deploymentTarget)}
    <div className="ent-page-head"><div><div className="ent-title-line"><h1 tabIndex={-1}><Building2 size={16}/>{detailId ? tenant?.name || '政企详情' : '政企用户'}</h1>{tenant && <Status value={tenant.status} enterprise/>}</div><p>{detailId ? '管理企业管理员、查看组织成员、项目空间及 API Key。' : '以政府机构或企业为主体开通，由管理员统一管理组织成员及模型服务资源的用户。'}</p></div><div className="ent-head-actions">{tenant && <Button variant="outline" disabled={!canWrite || editor?.kind === 'edit'} onClick={() => askToggle(tenant)}>{tenant.status === '停用' ? '账号解冻' : '账号冻结'}</Button>}{!detailId && <Button disabled={!canWrite || !hasCapacity} title={!hasCapacity ? '单企业容量已用完，请进入企业详情管理账号' : !canWrite ? '当前角色仅可查看' : undefined} onClick={() => setEditor({ kind: 'create' })}><Plus size={14}/>新用户</Button>}</div></div>
    {mode === 'private' && <div className="ent-banner">默认企业：{defaultTenant?.name || '尚未开户'}<span>当前部署仅管理默认企业。</span></div>}
    {!canWrite && <div className="ent-banner">当前角色仅可查看企业信息。平台管理员和运营人员可执行开户及账号管理。</div>}

    {!detailId ? <section className="ent-panel ent-list">
      <FilterToolbar className="ent-toolbar"><div className="ent-search"><Search size={15}/><Input aria-label="搜索企业" value={query} placeholder="搜索 User ID、用户名" onChange={e => navigate({ q: e.target.value, page: '' }, true)}/></div><div className="ent-filter-status"><span>状态</span><Select value={status || 'all'} onValueChange={value => navigate({ status: value === 'all' ? '' : value, page: '' }, true)}><SelectTrigger aria-label="企业状态"><SelectValue/></SelectTrigger><SelectContent><SelectGroup>{[{value:'all',label:'全部状态'},{value:'正常',label:'已启用'},{value:'需关注',label:'需关注'},{value:'停用',label:'已冻结'}].map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></div><FilterReset onClick={() => navigate({ q: '', status: '', page: '' }, true)}/></FilterToolbar>
      <Table className="ent-table ent-list-table"><TableHeader><TableRow>{['用户名 / User ID', '客户类型', '企业管理员', '成员数', '状态', '操作'].map(label => <TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader><TableBody>{rows.slice((page - 1) * size, page * size).map(item => {
        const members = adminsFor(item), primary = effectiveEnterpriseAdmins(state, item)[0] || members[0], user = primary && accountFor(primary);
        return <TableRow key={item.id}>
          <TableCell><div className="ent-user-identity"><span className="ent-user-avatar" aria-hidden="true"><Building2 size={16}/></span><div className="ent-identity-text"><Button variant="link" className="ent-user-link" title={item.name} onClick={() => navigate({ enterprise: item.id, tab: '', project: '' })}>{item.name}</Button><small title={item.id}>{item.id}</small></div></div></TableCell>
          <TableCell>{item.type}</TableCell><TableCell><span>{primary?.name || '待配置'}{members.length > 1 ? ' 等 ' + members.length + ' 人' : ''}</span><small>{user?.login || '—'}</small></TableCell><TableCell>{state.memberships.filter(member => member.tenantId === item.id).length}</TableCell><TableCell><Status value={item.status} enterprise/></TableCell>
          <TableCell><div className="ent-row-actions"><Button variant="link" onClick={() => navigate({ enterprise: item.id, tab: '', project: '' })}>详情</Button><Button variant="link" disabled={!canWrite} onClick={() => { navigate({ enterprise: item.id, tab: 'info', project: '' }); setEditor({ kind: 'edit', tenant: item }); }}>编辑</Button><Button variant="link" disabled={!canWrite} onClick={() => askToggle(item)}>{item.status === '停用' ? '解冻' : '冻结'}</Button></div></TableCell>
        </TableRow>;
      })}</TableBody></Table>
      {!rows.length && <Empty>{query || status ? '没有匹配的企业，请调整筛选条件。' : '尚未创建企业，点击“新用户”开始开户。'}</Empty>}
      <FilterPagination total={rows.length} page={page} size={size} onPageChange={value => navigate({ page: String(value) }, true)} onSizeChange={value => navigate({ size: String(value), page: '' }, true)}/>
    </section> : !tenant ? <section className="ent-panel"><Empty>企业不存在或不属于当前部署方式，请返回企业列表。</Empty></section> : <>
      {tenant.status === '停用' && <div className="ent-banner">企业账号已冻结，所属成员和资源记录保留。解冻后可继续管理账号。</div>}
      <EnterpriseDetails key={tenant.id} state={state} tenant={tenant} params={params} navigate={navigate} canWrite={canWrite} setEditor={setEditor} setResult={setResult} askToggle={askToggle} askKey={key => { setConfirmation({ tenant, key }); }} Modal={Modal} Status={Status} editing={editor?.kind === 'edit'} editForm={editor?.kind === 'edit' && <EnterpriseEditor key={`edit-${tenant.id}`} inline state={state} tenant={tenant} kind="edit" mode={mode} apply={apply} canWrite={canWrite} close={() => setEditor(null)} complete={() => { setEditor(null); toast.success('政企用户信息已保存'); }}/>} />

    </>}
    {editor && editor.kind !== 'edit' && <EnterpriseEditor key={`${editor.kind}-${editor.tenant?.id || 'new'}`} state={state} tenant={editor.tenant} kind={editor.kind} mode={mode} apply={apply} close={() => setEditor(null)} complete={value => { setEditor(null);  setResult(value); }}/>}
    {result && <Modal title={result.handover ? '账号交接信息' : result.added ? '企业管理员已添加' : '企业账号已开通'} description="请核对企业与管理员信息，妥善保管账号交接资料。" close={() => { setResult(null);  }}><div className="ent-result"><CheckCircle2 size={38}/><dl className="ent-facts"><dt>用户名称</dt><dd>{result.tenant.name}</dd><dt>user_id</dt><dd>{result.tenant.id}</dd><dt>管理员</dt><dd>{result.user.name}</dd><dt>登录账号</dt><dd>{result.user.login}</dd><dt>手机号码</dt><dd>{result.user.phone || '未填写'}</dd><dt>账号初始化</dt><dd>{result.user.initialized ? '已完成，沿用现有登录方式' : '待设置密码'}</dd></dl><label className="ent-field"><span>账号交接信息</span><Textarea readOnly value={handover} aria-label="账号交接信息"/></label></div><div className="ent-modal-footer"><Button variant="outline" onClick={() => copy(handover)}><Copy size={15}/>复制交接信息</Button><Button onClick={() => { navigate({ enterprise: result.tenant.id, tab: 'members' }); setResult(null); }}>查看企业</Button></div></Modal>}
    {confirmation && <EnterpriseStatusDialog key={(confirmation.key || confirmation.member || confirmation.tenant).id} state={state} confirmation={confirmation} apply={apply} close={() => setConfirmation(null)} complete={() => { setConfirmation(null); toast.success('状态已更新'); }} Modal={Modal}/>}
  </div>;
}
