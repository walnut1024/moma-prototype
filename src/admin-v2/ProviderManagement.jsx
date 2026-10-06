import { toast } from 'sonner';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table';
import { useEffect, useState } from 'react';
import { AlertCircle, ArrowRight, Building2, CheckCircle2, ChevronLeft, ChevronRight, CircleHelp, Cloud, Link2, Plus, RotateCcw, Search, Server, ShieldCheck, Unplug, Settings2, Play, X } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '../components/ui/command';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, normalizePageSize } from '../components/FilterControls';
import { availableSupplies, displayTime, MODEL_TYPES } from './model-management';
import { connectionTestCurrent, PROVIDER_TEMPLATES, PROVIDER_TYPES, PROTOCOLS, providerFacts, providerImpact } from './provider-management';
import { connectionBlockReason } from './connection-state';
import './provider-management.css';
import { displayBusinessCopy } from '../display-copy.mjs';

function Choice({ label, value, options, onChange, disabled }) {
  return <Select value={value} onValueChange={onChange} disabled={disabled}><SelectTrigger aria-label={label}><SelectValue/></SelectTrigger><SelectContent><SelectGroup>{options.map(([id, title]) => <SelectItem key={id} value={id}>{title}</SelectItem>)}</SelectGroup></SelectContent></Select>;
}
function SearchChoice({ label, value, options, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button type="button" variant="outline" className="pm-search-choice" role="combobox" aria-label={label} aria-expanded={open} disabled={disabled}><span>{options.find(([id]) => id === value)?.[1] || '请选择'}</span><ChevronRight/></Button></PopoverTrigger><PopoverContent align="start" className="pm-choice-popover"><Command><CommandInput placeholder={`搜索${label} / ID`} aria-label={`搜索${label}`}/><CommandList><CommandEmpty>没有符合条件的选项</CommandEmpty><CommandGroup>{options.map(([id, title]) => <CommandItem key={id} value={id + ' ' + title} onSelect={() => { onChange(id); setOpen(false); }}>{title}{value === id && <CheckCircle2/>}</CommandItem>)}</CommandGroup></CommandList></Command></PopoverContent></Popover>;
}
function Field({ label, children, hint, required, error }) { return <label className="pm-field"><span>{label}{required && <em aria-label="必填">*</em>}</span>{children}{error && <small className="pm-field-error">{error}</small>}{hint && <small>{hint}</small>}</label>; }
function Status({ value }) {
  const tone = ['已启用', '运行中', '可用', '通过'].includes(value) ? 'success' : ['失败', '测试失败', '不可用'].includes(value) ? 'danger' : ['需关注', '待验证', '未测试'].includes(value) ? 'warning' : 'muted';
  return <span className={`pm-status ${tone}`}><i aria-hidden="true"/>{value}</span>;
}
function Pagination({ total, page, size, change }) {
  const pages = Math.max(1, Math.ceil(total / size));
  return <footer className="pm-pagination"><span>共 {total} 条</span><Choice label="每页数量" value={String(size)} options={PAGE_SIZES.map(value => [String(value), `${value} 条/页`])} onChange={value => change({ size: value, page: null })}/><Button variant="outline" size="icon" aria-label="上一页" disabled={page <= 1} onClick={() => change({ page: String(page - 1) })}><ChevronLeft/></Button><span>{page} / {pages}</span><Button variant="outline" size="icon" aria-label="下一页" disabled={page >= pages} onClick={() => change({ page: String(page + 1) })}><ChevronRight/></Button></footer>;
}
function Empty({ text, children }) { return <div className="pm-empty"><Unplug/><h3>{text}</h3>{children}</div>; }
function ProviderList({ state, params, change, edit, can }) {
  const query = params.get('q') || '', source = params.get('source') || 'all', status = params.get('status') || 'all';
  const facts = state.providers.map(provider => ({ provider, ...providerFacts(state, provider) }));
  const rows = facts.filter(({ provider, attention }) => [provider.name, provider.id].join(' ').toLowerCase().includes(query.trim().toLowerCase()) && (source === 'all' || source === provider.sourceType) && (status === 'all' || (status === 'attention' ? attention.length > 0 : provider.status === status)));
  const size = normalizePageSize(params.get('size')), page = Math.min(Math.max(1, Number(params.get('page')) || 1), Math.max(1, Math.ceil(rows.length / size)));
  const filter = (key, value) => change({ [key]: value === 'all' ? null : value, page: null });
  const reset = () => change({ q: null, source: null, status: null, page: null });
  return <>
    <div className="pm-heading"><div><h1><Cloud/>模型供应</h1><p>统一接入第三方 Token 服务与自有推理服务，管理连接和上游模型。</p></div><Button disabled={!can} onClick={() => edit({ kind: 'create' })}><Plus data-icon="inline-start"/>新增供应商</Button></div>
    <section className="pm-surface pm-list">
      <div className="pm-summary"><span><Building2/>供应商 <b>{facts.length}</b></span><span><Link2/>接入配置 <b>{state.endpoints.length}</b></span><span><ShieldCheck/>可供模型 <b>{new Set(facts.flatMap(fact => fact.available.map(model => model.id))).size}</b></span><Button variant="link" onClick={() => filter('status', status === 'attention' ? 'all' : 'attention')}><AlertCircle/>{facts.filter(fact => fact.attention.length).length} 家供应商需关注<ChevronRight/></Button></div>
      <div className="pm-filters"><div className="pm-search"><Search/><Input aria-label="搜索供应商" placeholder="搜索供应商名称 / ID" value={query} onChange={event => filter('q', event.target.value)}/></div><span>供给类型</span><Choice label="供给类型" value={source} options={[['all', '全部类型'], ...Object.entries(PROVIDER_TYPES)]} onChange={value => filter('source', value)}/><span>状态</span><Choice label="供应商状态" value={status} options={[['all', '全部状态'], ['已启用', '已启用'], ['停用', '已停用'], ['attention', '需关注']]} onChange={value => filter('status', value)}/><Button variant="ghost" onClick={reset}><RotateCcw/>重置</Button></div>
      <div className="pm-table-scroll"><Table className="pm-table pm-provider-table"><TableHeader><TableRow><TableHead>供应商 / ID</TableHead><TableHead>供给类型</TableHead><TableHead>接入配置</TableHead><TableHead>可供模型</TableHead><TableHead>连接检查</TableHead><TableHead>供应商状态</TableHead><TableHead>操作</TableHead></TableRow></TableHeader><TableBody>{rows.slice((page - 1) * size, page * size).map(fact => <TableRow key={fact.provider.id}><TableCell><div className="pm-identity"><span className="pm-provider-symbol">{fact.provider.sourceType === 'selfHosted' ? <Server/> : <Cloud/>}</span><div><button className="pm-name" onClick={() => change({ provider: fact.provider.id, tab: null, detailPage: null })}>{fact.provider.name}</button><small>{fact.provider.id}</small></div></div></TableCell><TableCell>{PROVIDER_TYPES[fact.provider.sourceType]}</TableCell><TableCell><button className="pm-cell-link" onClick={() => change({ provider: fact.provider.id, connection: null, tab: null })}>{fact.endpoints.length} 个配置</button><small>{fact.running.length} 个已启用</small></TableCell><TableCell><button className="pm-cell-link" onClick={() => change({ provider: fact.provider.id, connection: null, tab: null })}>{fact.available.length} / {fact.models.length} 个模型</button><small>可用 / 已映射</small></TableCell><TableCell>{fact.attention.length ? <span className="pm-warning"><AlertCircle/>{fact.attention.length} 个需关注</span> : fact.endpoints.length ? <span className="pm-muted">无已记录异常</span> : <span className="pm-muted">未接入</span>}<small>{fact.endpoints.filter(endpoint => !connectionTestCurrent(endpoint)).length} 个未测试</small></TableCell><TableCell><Status value={fact.provider.status}/></TableCell><TableCell><Button variant="link" onClick={() => change({ provider: fact.provider.id, tab: null })}>管理</Button></TableCell></TableRow>)}</TableBody></Table>{!rows.length && <Empty text="没有符合条件的供应商"><Button variant="outline" onClick={reset}>清除筛选</Button></Empty>}</div>
      <Pagination total={rows.length} page={page} size={size} change={change}/>
    </section>
    <div className="pm-explanation"><CircleHelp/><span>供应商提供模型服务；接入配置保存服务地址与凭证引用；上游模型映射决定平台可调用的模型。</span></div>
  </>;
}
function ProviderDetail({ state, provider, params, change, edit, run, can }) {
  const facts = providerFacts(state, provider);
  const requested = params.get('connection');
  const endpoint = requested ? facts.endpoints.find(item => item.id === requested) : facts.endpoints[0];
  const [query, setQuery] = useState(''), [modelQuery, setModelQuery] = useState(''), [page, setPage] = useState(1), [size, setSize] = useState(DEFAULT_PAGE_SIZE);
  useEffect(() => { setQuery(''); }, [provider.id]);
  useEffect(() => { setModelQuery(''); setPage(1); }, [provider.id, endpoint?.id]);
  const connections = facts.endpoints.filter(item => [item.name, item.endpointId, item.baseUrl].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  const allSupplies = facts.supplies.filter(item => item.endpointId === endpoint?.id);
  const supplies = allSupplies.filter(item => [item.upstreamModelId, state.models.find(model => model.id === item.modelId)?.name].join(' ').toLowerCase().includes(modelQuery.trim().toLowerCase()));
  const currentPage = Math.min(page, Math.max(1, Math.ceil(supplies.length / size)));
  const test = connectionTestCurrent(endpoint) ? endpoint.connectionTest : null;
  const block = connectionBlockReason(endpoint, provider);
  const active = ['运行中', '需关注'].includes(endpoint?.status);
  const selectProvider = id => change({ provider: id, connection: null, tab: null });
  const pagination = patch => { if (patch.size) { setSize(Number(patch.size)); setPage(1); } else setPage(Number(patch.page) || 1); };
  return <>
    <div className="pm-heading"><div><h1><Building2/>{provider.name}<Status value={provider.status}/></h1><p>{PROVIDER_TYPES[provider.sourceType]} · {facts.endpoints.length} 个接入 · {facts.supplies.length} 个模型映射</p></div><div className="pm-heading-actions"><Button variant="outline" onClick={() => edit({ kind: 'profile', provider })}><Building2/>供应商信息</Button><Button variant="outline" onClick={() => change({ provider: null, connection: null, tab: null })}><ChevronLeft/>全部供应商</Button></div></div>
    <div className="pm-detail-layout">
    <aside className="pm-connections" aria-label="供应商与接入">
      <div className="pm-provider-context"><small>当前供应商</small><SearchChoice label="当前供应商" value={provider.id} options={state.providers.map(item => [item.id, item.name])} onChange={selectProvider}/></div>
      <div className="pm-connection-label"><b>接入</b><span>{facts.endpoints.length}</span></div>
      <div className="pm-search"><Search/><Input aria-label="搜索接入" placeholder="搜索接入" value={query} onChange={event => setQuery(event.target.value)}/></div>
      <nav className="pm-connection-list" aria-label="接入配置">{connections.map(item => {
        const checked = connectionTestCurrent(item) ? item.connectionTest : null;
        const label = !checked ? '未测试' : checked.result === '失败' ? '测试失败' : ['运行中', '需关注'].includes(item.status) ? '已启用' : '未启用';
        return <button key={item.id} aria-current={item.id === endpoint?.id ? 'page' : undefined} onClick={() => change({ connection: item.id, tab: null })}><div><b>{item.name}</b><Status value={label}/></div><small>{item.protocol} · {facts.supplies.filter(supply => supply.endpointId === item.id).length} 个模型</small></button>;
      })}{!connections.length && <p className="pm-nav-empty">{query ? '没有匹配的接入' : '尚未配置接入'}</p>}</nav>
      <Button variant="outline" className="pm-add-connection" disabled={!can} onClick={() => edit({ kind: 'connection', provider })}><Plus/>新增接入</Button>
    </aside>
    <section className="pm-model-area" aria-label="当前接入的模型">
      {!endpoint ? <Empty text={requested ? '接入不存在或不属于当前供应商' : '先添加一个接入'}><p>填写服务地址和凭证引用，测试连接后启用接入。</p><Button disabled={!can} onClick={() => requested ? change({ connection: null }) : edit({ kind: 'connection', provider })}>{requested ? '返回当前供应商' : '新增接入'}</Button></Empty> : <>
        <div className="pm-model-heading"><div><h2>{endpoint.name}</h2><small>接入模型 ({allSupplies.length}) · 通过此接入调用</small></div><div className="pm-heading-actions"><Button variant="outline" disabled={!can} onClick={() => edit({ kind: 'connection', provider, endpoint })}><Settings2/>编辑接入</Button><Button variant="outline" disabled={!can} onClick={() => edit({ kind: 'testConnection', provider, endpoint })}><Play/>测试连接</Button><Button disabled={!can} onClick={() => edit({ kind: 'supply', provider, endpoint })}><Plus/>添加模型</Button></div></div>
        <div className={`pm-connection-notice ${block ? 'warning' : 'ready'}`}>
          {block ? <AlertCircle/> : <CheckCircle2/>}<span>{provider.status !== '已启用' ? '供应商已停用，接入和模型暂不可供调用。' : !test ? '接入未测试。先测试连接，再启用接入和验证模型。' : test.result === '失败' ? displayBusinessCopy(test.message) : !active ? '连接测试通过。启用接入后可验证模型。' : '接入已启用。模型须分别验证并启用后才能供调用。'}</span>
          {provider.status !== '已启用' ? <Button variant="link" disabled={!can} onClick={() => run('enableProvider', provider.id)}>启用供应商<ArrowRight/></Button> : !test || test.result !== '通过' ? <Button variant="link" disabled={!can} onClick={() => edit({ kind: 'testConnection', provider, endpoint })}>测试连接<ArrowRight/></Button> : !active ? <Button variant="link" disabled={!can} onClick={() => run('enableConnection', endpoint.id)}>启用接入<ArrowRight/></Button> : <Button variant="link" disabled={!can} onClick={() => edit({ kind: 'disableConnection', provider, endpoint })}>停用接入</Button>}
        </div>
        {test && <p className="pm-tested-at">连接测试：{test.result} · {displayTime(test.testedAt)}</p>}
        {allSupplies.length > 5 && <div className="pm-model-search pm-search"><Search/><Input aria-label="搜索接入模型" placeholder="搜索平台模型 / 上游模型 ID" value={modelQuery} onChange={event => { setModelQuery(event.target.value); setPage(1); }}/></div>}
        <div className="pm-table-scroll"><Table className="pm-table pm-model-table"><TableHeader><TableRow><TableHead>平台模型</TableHead><TableHead>上游模型 ID</TableHead><TableHead>验证结果</TableHead><TableHead>启用</TableHead><TableHead>操作</TableHead></TableRow></TableHeader><TableBody>{supplies.slice((currentPage - 1) * size, currentPage * size).map(supply => {
          const model = state.models.find(item => item.id === supply.modelId);
          const reason = block || (supply.validationStatus !== '通过' ? '先验证模型' : '');
          const available = availableSupplies(state, supply.modelId).some(item => item.id === supply.id);
          return <TableRow key={supply.id}><TableCell><a className="pm-model-name" href={`#/admin-2/listing?model=${encodeURIComponent(supply.modelId)}&tab=supplies`}>{model?.name || '模型不存在'}</a><small>{MODEL_TYPES[model?.type] || '—'}</small></TableCell><TableCell><code>{supply.upstreamModelId}</code></TableCell><TableCell><Status value={supply.validationStatus}/>{supply.verifiedAt && supply.validationStatus !== '待验证' && <small>{displayTime(supply.verifiedAt)}</small>}</TableCell><TableCell><button className="pm-switch" role="switch" aria-label={`启用 ${model?.name || supply.upstreamModelId}`} aria-checked={supply.status === '已启用'} disabled={!can || (supply.status !== '已启用' && Boolean(reason))} title={reason || (available ? '停用模型供给' : '启用模型供给')} onClick={() => run(supply.status === '已启用' ? 'disableSupply' : 'enableSupply', provider.id, { id: supply.id, providerId: provider.id })}><span/></button>{reason && <small className="pm-next-reason">{reason.includes('连接测试') ? '先测试连接' : reason}</small>}{supply.status === '已启用' && !available && <small>暂不可供调用</small>}</TableCell><TableCell><div className="pm-actions"><Button variant="link" disabled={!can || Boolean(block)} title={block || '验证上游模型的实际能力'} onClick={() => edit({ kind: 'verify', provider, endpoint, supply })}>验证</Button><Button variant="ghost" size="icon" aria-label={`编辑 ${model?.name || supply.upstreamModelId} 映射`} disabled={!can} onClick={() => edit({ kind: 'supply', provider, endpoint, supply })}><Settings2/></Button></div></TableCell></TableRow>;
        })}</TableBody></Table>{!supplies.length && <Empty text={modelQuery ? '没有匹配的模型' : '此接入尚未添加模型'}><p>选择平台模型，填写上游模型 ID 和实际规格。可以先保存，接入启用后再验证。</p><Button variant="outline" disabled={!can} onClick={() => modelQuery ? setModelQuery('') : edit({ kind: 'supply', provider, endpoint })}>{modelQuery ? '清除搜索' : '添加模型'}</Button></Empty>}</div>
        <Pagination total={supplies.length} page={currentPage} size={size} change={pagination}/>
      </>}
    </section>
    </div>
  </>;
}

function Editor({ editing, state, transact, close, saved, can }) {
  const { kind, provider, endpoint, supply } = editing;
  const [draft, setDraft] = useState(() => kind === 'supply' ? { modelId: supply?.modelId || '', endpointId: endpoint.id, upstreamModelId: supply?.upstreamModelId || '', capabilities: { ...supply?.capabilities } } : { name: kind === 'connection' ? endpoint?.name || '' : provider?.name || '', sourceType: provider?.sourceType || 'thirdParty', integrationType: provider?.integrationType || (provider?.sourceType === 'selfHosted' ? '自有推理服务' : '其他兼容服务'), contact: displayBusinessCopy(provider?.contact) || '', description: displayBusinessCopy(provider?.description) || '', protocol: endpoint?.protocol || 'OpenAI', baseUrl: endpoint?.baseUrl || '', credentialRef: endpoint?.credentialRef || '', capacity: endpoint?.capacity == null ? '' : String(endpoint.capacity), timeoutSeconds: String(endpoint?.timeoutSeconds || 60), scenario: '成功', result: '通过' });
  const [error, setError] = useState(''), [fieldErrors, setFieldErrors] = useState({}), [dirty, setDirty] = useState(false), [discard, setDiscard] = useState(false), [busy, setBusy] = useState(false), [pendingNavigation, setPendingNavigation] = useState(null);
  const set = (key, value) => { setDraft(current => ({ ...current, [key]: value })); setDirty(true); setError(''); setFieldErrors(current => ({ ...current, [key]: null })); };
  const requestClose = () => { if (dirty && !['testConnection', 'verify'].includes(kind)) setDiscard(true); else close(); };
  useEffect(() => {
    if (!dirty || ['testConnection', 'verify'].includes(kind)) return;
    const guard = event => { event.preventDefault(); event.returnValue = ''; };
    const currentUrl = location.href;
    const guardHash = event => { if (location.href !== currentUrl) { const destination = location.hash; event.stopImmediatePropagation(); history.replaceState(null, '', currentUrl); setPendingNavigation(destination); setDiscard(true); } };
    addEventListener('beforeunload', guard); addEventListener('hashchange', guardHash, true);
    return () => { removeEventListener('beforeunload', guard); removeEventListener('hashchange', guardHash, true); };
  }, [dirty, kind]);
  const disabling = ['disableProvider', 'disableConnection'].includes(kind);
  const confirming = disabling || ['testConnection', 'verify'].includes(kind);
  const impact = disabling ? providerImpact(state, provider.id, endpoint?.id) : null;
  const titles = { create: '新增供应商', profile: '供应商信息', connection: endpoint ? '编辑接入' : '新增接入', testConnection: '测试连接', disableProvider: '停用供应商', disableConnection: '停用接入', supply: supply ? '编辑模型映射' : '添加模型', verify: '验证模型' };
  const model = state.models.find(item => item.id === draft.modelId);
  const field = (key, label, child, hint, required = false) => <Field label={label} hint={hint} required={required} error={fieldErrors[key]}>{child}</Field>;
  const submit = async event => {
    event.preventDefault(); setError('');
    const errors = {};
    const required = (key, label) => { if (!String(draft[key] ?? '').trim()) errors[key] = `请${key === 'modelId' ? '选择' : '填写'}${label}`; };
    if (['create', 'profile', 'connection'].includes(kind)) required('name', kind === 'connection' ? '接入名称' : '供应商名称');
    if (kind === 'connection') { required('baseUrl', '服务地址'); required('credentialRef', '凭证引用'); required('timeoutSeconds', '请求超时'); }
    if (kind === 'supply') { required('modelId', '平台模型'); required('upstreamModelId', '上游模型 ID'); }
    setFieldErrors(errors);
    if (Object.keys(errors).length) { setError('请补全必填项'); event.currentTarget.querySelector(`[aria-invalid="true"]`)?.focus(); return; }
    setBusy(true);
    const progress = ['testConnection', 'verify'].includes(kind) ? toast.loading(kind === 'verify' ? '正在验证模型…' : '正在测试连接…') : null;
    try {
      if (!can) throw new Error('当前角色无写入权限，或存在数据冲突；输入已保留');
      if (['testConnection', 'verify'].includes(kind)) await new Promise(resolve => setTimeout(resolve, 450));
      const next = transact({ type: 'providerOperation', operation: kind, objectId: kind === 'connection' ? endpoint?.id || null : endpoint?.id || provider?.id, data: { ...draft, ...(['supply', 'verify'].includes(kind) ? { id: supply?.id } : {}), providerId: provider?.id, confirmed: disabling } });
      saved(kind, next); close();
    } catch (failure) { toast.error(failure.message); } finally { if (progress !== null) toast.dismiss(progress); setBusy(false); }
  };
  return <Dialog open onOpenChange={open => { if (!open && !busy) requestClose(); }}><DialogContent className={`pm-dialog ${confirming ? 'pm-confirm-dialog' : 'pm-editor'}`} showCloseButton={false}><div className="pm-dialog-head"><DialogTitle>{titles[kind]}</DialogTitle><Button type="button" variant="ghost" size="icon" aria-label="关闭" disabled={busy} onClick={requestClose}><X/></Button></div><DialogDescription>{disabling ? '确认影响后停用，已有记录和引用保留。' : kind === 'testConnection' ? '检查当前服务地址、凭证和协议。通过后仍需启用接入。' : kind === 'verify' ? '检查上游模型的协议、推理与已声明能力。通过后仍需启用模型。' : kind === 'connection' ? '保存接入后，测试连接并启用。' : kind === 'supply' ? '关联当前接入的上游模型和平台模型。' : '维护提供模型服务的主体资料。'}</DialogDescription><form onSubmit={submit} noValidate>
    <div className="pm-form-body">
      {['create', 'profile'].includes(kind) && <>
        {field('name', '供应商名称', <Input aria-label="供应商名称" aria-invalid={Boolean(fieldErrors.name)} maxLength={80} value={draft.name} onChange={event => set('name', event.target.value)}/>, null, true)}
        <div className="pm-field-grid"><Field label="供给类型" required><Choice label="供给类型" value={draft.sourceType} disabled={Boolean(provider && state.endpoints.some(item => item.providerId === provider.id))} options={Object.entries(PROVIDER_TYPES)} onChange={value => { set('sourceType', value); set('integrationType', value === 'selfHosted' ? '自有推理服务' : '其他兼容服务'); }}/></Field><Field label="接入方式" required><Choice label="接入方式" value={draft.integrationType} options={PROVIDER_TEMPLATES.map(value => [value, value])} onChange={value => set('integrationType', value)}/></Field></div>
        <Field label="负责人"><Input aria-label="负责人" value={draft.contact} onChange={event => set('contact', event.target.value)}/></Field><Field label="说明"><Textarea aria-label="供应商说明" rows={3} value={draft.description} onChange={event => set('description', event.target.value)}/></Field>
        {kind === 'profile' && <><dl className="pm-profile">{[['供应商 ID', provider.id], ['合同到期', provider.contractEnd || '未登记'], ['更新时间', displayTime(provider.updatedAt)]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><div className="pm-profile-status"><Status value={provider.status}/><Button type="button" variant="outline" disabled={!can || dirty} onClick={() => { saved('profileStatus', state, provider); }}>{provider.status === '已启用' ? '停用供应商' : '启用供应商'}</Button>{dirty && <small>请先保存或取消资料修改，再变更状态。</small>}</div></>}
      </>}
      {kind === 'connection' && <><div className="pm-context"><Building2/>{provider.name}</div>
        {field('name', '接入名称', <Input aria-label="接入名称" aria-invalid={Boolean(fieldErrors.name)} maxLength={80} placeholder="例如：华东生产账号" value={draft.name} onChange={event => set('name', event.target.value)}/>, null, true)}
        <Field label="接入协议" required><Choice label="接入协议" value={draft.protocol} options={PROTOCOLS.map(value => [value, value])} onChange={value => set('protocol', value)}/></Field>
        {field('baseUrl', '服务地址（Base URL）', <Input aria-label="服务地址" aria-invalid={Boolean(fieldErrors.baseUrl)} value={draft.baseUrl} placeholder="https://provider.example.com/v1" onChange={event => set('baseUrl', event.target.value)}/>, provider.sourceType === 'selfHosted' ? '支持 HTTP / HTTPS，填写推理服务根地址。' : '填写供应商提供的 HTTPS 服务根地址。', true)}
        {field('credentialRef', '凭证引用', <Input aria-label="凭证引用" aria-invalid={Boolean(fieldErrors.credentialRef)} autoComplete="off" value={draft.credentialRef} placeholder="env:PROVIDER_API_KEY" onChange={event => set('credentialRef', event.target.value)}/>, '向服务运维人员获取已配置的环境变量名或凭证引用，使用 env:变量名 或 secret:引用。请勿填写 API Key。', true)}
        <div className="pm-field-grid"><Field label="请求上限（RPM）" hint="选填，按供应商实际限额填写；留空表示未配置。"><Input aria-label="请求上限" type="number" min={1} step={1} value={draft.capacity} onChange={event => set('capacity', event.target.value)}/></Field>{field('timeoutSeconds', '请求超时（秒）', <Input aria-label="请求超时" aria-invalid={Boolean(fieldErrors.timeoutSeconds)} type="number" min={1} max={600} step={1} value={draft.timeoutSeconds} onChange={event => set('timeoutSeconds', event.target.value)}/>, '1–600 秒', true)}</div>
        {endpoint && <div className="pm-message warning"><AlertCircle/><span>修改地址、协议、凭证、请求上限或超时会停用此接入，并将 {state.modelSupplies.filter(item => item.endpointId === endpoint.id && item.status !== '已移除').length} 个关联模型停用、设为待验证。</span></div>}
      </>}
      {kind === 'supply' && <><div className="pm-context"><Link2/><div>{provider.name} / {endpoint.name}<small>{endpoint.baseUrl}</small></div></div>
        {field('modelId', '平台模型', <SearchChoice label="平台模型" value={draft.modelId} disabled={Boolean(supply)} options={state.models.map(item => [item.id, item.name + ' · ' + MODEL_TYPES[item.type]])} onChange={value => { set('modelId', value); set('capabilities', {}); }}/>, '请选择此上游模型对应的平台模型。', true)}
        {field('upstreamModelId', '上游模型 ID', <Input aria-label="上游模型 ID" aria-invalid={Boolean(fieldErrors.upstreamModelId)} value={draft.upstreamModelId} placeholder="填写供应商实际使用的模型 ID" onChange={event => set('upstreamModelId', event.target.value)}/>, null, true)}
        {model && <><h3 className="pm-form-section-title">上游实际规格</h3><p className="pm-hint">按供应商文档填写此上游模型的实际能力。</p>{['text', 'multimodal', 'embedding', 'rerank'].includes(model.type) && <div className="pm-field-grid"><Field label="上下文大小（Token）" required><Input aria-label="上下文大小" type="number" min={1} value={draft.capabilities.context || ''} onChange={event => set('capabilities', { ...draft.capabilities, context: Number(event.target.value) })}/></Field>{['text', 'multimodal'].includes(model.type) && <Field label="最大输出（Token）" required><Input aria-label="最大输出" type="number" min={1} value={draft.capabilities.output || ''} onChange={event => set('capabilities', { ...draft.capabilities, output: Number(event.target.value) })}/></Field>}</div>}<fieldset className="pm-checks"><legend>已确认支持的能力</legend>{[['streaming', '流式响应'], ['tools', '工具调用']].map(([key, label]) => <label key={key}><input type="checkbox" checked={Boolean(draft.capabilities[key])} onChange={event => set('capabilities', { ...draft.capabilities, [key]: event.target.checked })}/>{label}</label>)}</fieldset></>}
        <div className="pm-message info"><CircleHelp/><span>保存后为待验证、未启用。{connectionBlockReason(endpoint, provider) ? '先完成接入测试和启用，再验证此模型。' : '验证通过后再启用模型供给。'}</span></div>
      </>}
      {['testConnection', 'verify'].includes(kind) && <><div className="pm-context"><Link2/>{provider.name} / {endpoint.name}{supply && ` / ${supply.upstreamModelId}`}</div><Field label={kind === 'verify' ? '验证结果' : '测试场景'}><Choice label="测试场景" value={kind === 'verify' ? draft.result : draft.scenario} options={(kind === 'verify' ? ['通过', '失败'] : ['成功', '超时', '鉴权失败', '协议错误']).map(value => [value, value])} onChange={value => set(kind === 'verify' ? 'result' : 'scenario', value)}/></Field><p className="pm-hint">{kind === 'verify' ? '验证通过后，返回模型列表启用供给。' : '连接测试只检查接入；模型能力须分别验证。'}</p></>}
      {disabling && <><div className="pm-context"><AlertCircle/>{provider.name}{endpoint && ' / ' + endpoint.name}</div><dl className="pm-impact"><div><dt>关联接入</dt><dd>{impact.endpoints.length} 个</dd></div><div><dt>上游模型映射</dt><dd>{impact.supplies.length} 个</dd></div><div><dt>路由 / 回退引用</dt><dd>{impact.routes.length} / {impact.fallbacks.length} 条</dd></div></dl>{impact.exposed.length ? <div className="pm-message warning"><AlertCircle/><div>以下已上架模型将失去可用供给：<ul>{impact.exposed.map(item => <li key={item.id}>{item.name}</li>)}</ul>请先配置替代供给，或确认接受当前影响。</div></div> : <p className="pm-hint">未发现会因此失去全部可用供给的已上架模型。</p>}</>}
      {error && <div className="pm-message error" role="alert"><AlertCircle/>{error}</div>}
      {discard && <div className="pm-discard" role="alert"><span>有未保存的修改，是否放弃？</span><Button type="button" variant="outline" onClick={() => { setDiscard(false); setPendingNavigation(null); }}>继续编辑</Button><Button type="button" variant="destructive" onClick={() => { close(); if (pendingNavigation) { location.hash = pendingNavigation; } }}>放弃修改</Button></div>}
    </div><footer className="pm-dialog-footer"><Button type="button" variant="outline" disabled={busy} onClick={requestClose}>取消</Button><Button disabled={!can || busy}>{busy ? '正在检查…' : disabling ? '确认停用' : kind === 'testConnection' ? '开始测试' : kind === 'verify' ? '开始验证' : '保存'}</Button></footer></form></DialogContent></Dialog>;
}

export default function ProviderManagement({ state, transact, conflict }) {
  const [params, setParams] = useState(() => new URLSearchParams(location.hash.split('?')[1] || ''));
  const [editing, setEditing] = useState(null);
  useEffect(() => { const sync = () => setParams(new URLSearchParams(location.hash.split('?')[1] || '')); addEventListener('hashchange', sync); return () => removeEventListener('hashchange', sync); }, []);
  const change = patch => { const next = new URLSearchParams(params); Object.entries(patch).forEach(([key, value]) => value == null || value === '' ? next.delete(key) : next.set(key, value)); setParams(next); location.hash = '/admin-2/providers' + (next.size ? '?' + next : '');  };
  const can = ['平台管理员', '运维人员'].includes(state.currentRole) && !conflict && !state.storageError;
  const providerId = params.get('provider'), provider = state.providers.find(item => item.id === providerId);
  const run = (operation, objectId, data = {}) => { try { transact({ type: 'providerOperation', operation, objectId, data }); toast.success('配置状态已更新'); } catch (error) { toast.error(error.message); } };
  const saved = (kind, next, statusProvider) => {
    if (kind === 'profileStatus') { if (statusProvider.status === '已启用') setEditing({ kind: 'disableProvider', provider: statusProvider }); else { run('enableProvider', statusProvider.id); setEditing(null); } return; }
    if (kind === 'create') { const id = next.providers.find(item => !state.providers.some(old => old.id === item.id)).id; change({ provider: id, connection: null, tab: null }); }
    if (kind === 'connection') { const endpointId = editing.endpoint?.id || next.endpoints.find(item => !state.endpoints.some(old => old.id === item.id))?.id; change({ connection: endpointId, tab: null }); }
    const endpoint = editing?.endpoint && next.endpoints.find(item => item.id === editing.endpoint.id);
    const failed = kind === 'testConnection' ? endpoint?.connectionTest?.result === '失败' : kind === 'verify' && next.modelSupplies.find(item => item.id === editing.supply.id)?.validationStatus === '失败';
    toast[failed ? 'error' : 'success']( kind === 'testConnection' ? displayBusinessCopy(endpoint.connectionTest.message) : kind === 'verify' ? failed ? '模型验证失败，请检查模型 ID、规格和能力后重试。' : '模型验证通过。下一步：启用模型供给。' : kind === 'create' ? '供应商已创建。下一步：新增接入。' : kind === 'connection' ? '接入已保存。下一步：测试连接并启用接入。' : kind === 'supply' ? '模型映射已保存。接入启用后，验证并启用此模型。' : '供应商配置已保存');
  };
  return <div className="pm-workbench">{providerId ? provider ? <ProviderDetail state={state} provider={provider} params={params} change={change} edit={setEditing} run={run} can={can}/> : <Empty text="供应商不存在"><Button variant="outline" onClick={() => change({ provider: null, connection: null, tab: null })}>返回供应商列表</Button></Empty> : <ProviderList state={state} params={params} change={change} edit={setEditing} can={can}/>} {!can && <p className="pm-readonly">{conflict || state.storageError ? '请处理数据冲突或读取错误后再保存。' : '当前角色可查看供应商；平台管理员与运维人员可管理接入。'}</p>}{editing && <Editor key={`${editing.kind}-${editing.endpoint?.id || editing.supply?.id || editing.provider?.id || 'new'}`} editing={editing} state={state} transact={transact} close={() => setEditing(null)} saved={saved} can={can}/>}</div>;
}
