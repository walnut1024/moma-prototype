import { Fragment, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Activity, ArrowLeft, ArrowRight, Boxes, ChevronDown, Copy, FileText, FolderKanban, KeyRound, LayoutDashboard, Plus, Settings, Store, Users } from 'lucide-react';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Textarea } from './components/ui/textarea';
import { Checkbox } from './components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from './components/ui/dialog';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from './components/ui/select';
import { Popover, PopoverTrigger, PopoverContent } from './components/ui/popover';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from './components/ui/command';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './components/ui/tabs';
import { projectTabs, enterpriseTabs, workspaceNavigation, navigationPage, projectSwitchPage, pageScope, workspaceHash, readWorkspaceRoute, workspaceProject, returnProjectLocation } from './project-navigation.mjs';
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from './components/ui/table';
import { TimeSeriesChart } from './components/AnalyticsCharts';
import FrontPageHeader from './components/FrontPageHeader';
import ProjectCatalogue from './ProjectCatalogue';
import CallLogs from './CallLogs';
import OperationRecords from './OperationRecords';
import { projectLogRecords } from './project-view-data.mjs';
import ModelComparison from './ModelComparison';
import TextExperience from './TextExperience';
import { useAdminStore } from './admin-v2/store';
import { displayTime } from './admin-v2/model-management';
import { maskApiKey } from './api-key-utils.mjs';
import { productBillingType, effectiveKeyModels, keyAvailability, visibleCatalogue, accountAdmin, accountMember, accountModels, currentSpend, effectiveLimit, modelOffers, money, projectModels, projectRole, visibleProjects, visibleRequests, workspaceIdentity } from './project-domain.mjs';
import './project-console.css';

const pages = [['overview', '项目概览', LayoutDashboard], ['catalogue', '模型广场', Store], ['experience', '文本生成', Activity], ['models', '模型权限', Boxes], ['keys', 'API Key', KeyRound], ['usage', '用量统计', Activity], ['logs', '调用日志', FileText], ['members', '成员权限', Users], ['settings', '基本信息', Settings], ['budget', '预算与日志', Settings], ['audit', '操作记录', FileText]];
const readRoute = () => readWorkspaceRoute(location.hash, location.search, location.pathname);
const number = value => Number(value || 0).toLocaleString('zh-CN');
const budgetText = value => value == null ? '' : String(value / 1e6);
const roleName = (state, userId) => state.users.find(user => user.id === userId)?.name || userId;
function Pick({ label, value, options, onChange, disabled = false }) { return <Select value={value || 'all'} onValueChange={value => onChange(value === 'all' ? '' : value)} disabled={disabled}><SelectTrigger aria-label={label}><SelectValue placeholder={label}/></SelectTrigger><SelectContent><SelectGroup>{options.map(([id, name]) => <SelectItem key={id || 'all'} value={id || 'all'}>{name}</SelectItem>)}</SelectGroup></SelectContent></Select>; }
function DataTable({ columns, children, empty }) { return <div className="pc-table-scroll"><Table><TableHeader><TableRow>{columns.map(column => <TableHead key={column}>{column}</TableHead>)}</TableRow></TableHeader><TableBody>{children}</TableBody></Table>{empty && <p className="pc-empty">{empty}</p>}</div>; }
function Row({ cells }) { return <TableRow>{cells.map((cell, index) => <TableCell key={index}>{cell}</TableCell>)}</TableRow>; }
function Tag({ children }) { return <span className="pc-status">{children}</span>; }
function Notice({ children }) { return <p className="pc-notice" role="status">{children}</p>; }
function Field({ label, children, hint }) { return <label className="pc-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>; }
function PanelHeader({ description, actions }) { return <div className="pc-panel-toolbar"><p className="pc-muted">{description}</p>{actions && <div className="pc-actions">{actions}</div>}</div>; }
const copy = async value => { try { await navigator.clipboard.writeText(value); toast.success('已复制'); } catch { toast.error('复制失败，请手动选择内容复制'); } };
export default function ProjectConsole({ auth, userType, renderLegacy }) {
  const store = useAdminStore(), { state, conflict } = store;
  const identity = workspaceIdentity(auth, userType);
  const [route, setRoute] = useState(readRoute), [dialog, setDialog] = useState(null), [error, setError] = useState(''), [dirty, setDirty] = useState(false), [leaving, setLeaving] = useState(null);
  const page = route.page, accountPage = pageScope(page) === 'account';
  const [secret, setSecret] = useState(''), [saving, setSaving] = useState(false);
  const previousIdentity = useRef(identity?.tenantId), dirtyRef = useRef(dirty), savingRef = useRef(saving), currentHash = useRef(location.hash);
  dirtyRef.current = dirty || Boolean(secret); savingRef.current = saving;
  const recent = useRef(null);
  if (recent.current === null) { try { recent.current = JSON.parse(localStorage.getItem('moma-5130-recent-projects') || '{}'); } catch { recent.current = {}; } }
  const lastLocations = useRef(null);
  if (lastLocations.current === null) { try { lastLocations.current = JSON.parse(localStorage.getItem('moma-5130-project-locations') || '{}'); } catch { lastLocations.current = {}; } }
  const projects = visibleProjects(state, identity);
  const project = accountPage ? null : workspaceProject(projects, route.projectId, recent.current?.[identity?.tenantId]);
  const returnLocation = returnProjectLocation(projects, lastLocations.current?.[identity?.tenantId], recent.current?.[identity?.tenantId]);
  const role = projectRole(state, project, identity), admin = role === '管理员';
  const canCall = role && role !== '只读';
  const records = project ? visibleRequests(state, project, identity) : [];
  useEffect(() => {
    const guard = event => { if (saving) { event.preventDefault(); return; } if (dirty || secret) { event.preventDefault(); setLeaving(() => () => { dirtyRef.current = false; setSecret(''); setDialog(null); setError(''); setDirty(false); event.detail(); }); } };
    addEventListener('moma-project-navigation', guard); return () => removeEventListener('moma-project-navigation', guard);
  }, [dirty, secret, saving]);
  const [pendingBootstrap, setPendingBootstrap] = useState(false);
  useEffect(() => { const sync = () => { const incoming = location.hash; if (savingRef.current) { history.replaceState(null, '', location.pathname + location.search + currentHash.current); return; } if (dirtyRef.current) { history.replaceState(null, '', location.pathname + currentHash.current); setLeaving(() => () => { dirtyRef.current = false; setDirty(false); setSecret(''); setDialog(null); setError(''); location.hash = incoming; }); return; } currentHash.current = incoming; setRoute(readRoute()); }; addEventListener('hashchange', sync); return () => removeEventListener('hashchange', sync); }, []);
  useEffect(() => { const beforeUnload = event => { if (dirty || secret) { event.preventDefault(); event.returnValue = ''; } }; addEventListener('beforeunload', beforeUnload); return () => removeEventListener('beforeunload', beforeUnload); }, [dirty, secret]);
  useEffect(() => {
    if (identity && !accountMember(state, identity) && !pendingBootstrap) {
      setPendingBootstrap(true);
      try { store.transactWorkspace({ type: 'workspace', operation: 'bootstrap', identity }); }
      catch (caught) { setError(caught.message); }
    }
  }, [identity?.tenantId, state.revision, pendingBootstrap]);
  useEffect(() => {
    if (previousIdentity.current !== identity?.tenantId) {
      previousIdentity.current = identity?.tenantId; setDialog(null); setSecret(''); setDirty(false); setPendingBootstrap(false); setRoute(readWorkspaceRoute('#/account?page=projects'));
      history.replaceState(null, '', location.pathname + '#/account?page=projects'); currentHash.current = '#/account?page=projects';
    }
  }, [identity?.tenantId]);
  useEffect(() => { if (!project || !identity || recent.current?.[identity.tenantId] === project.id) return; const next = { ...recent.current, [identity.tenantId]: project.id }; try { localStorage.setItem('moma-5130-recent-projects', JSON.stringify(next)); recent.current = next; } catch { setError('最近项目未能保存，请检查浏览器存储'); } }, [identity?.tenantId, project?.id]);
  useEffect(() => {
    if (!project || !identity) return;
    const next = { ...lastLocations.current, [identity.tenantId]: { ...route, projectId: project.id, action: '' } };
    lastLocations.current = next;
    try { localStorage.setItem('moma-5130-project-locations', JSON.stringify(next)); } catch { setError('最近项目页面未能保存，请检查浏览器存储'); }
  }, [identity?.tenantId, project?.id, route]);
  useEffect(() => {
    const hash = '#' + workspaceHash(page, project?.id || route.projectId, { model: route.model, request: route.request, supply: route.supply, rangeDays: route.rangeDays, ...(!accountPage ? { days: route.days } : {}), action: route.action });
    if (location.hash !== hash && !dirtyRef.current) { history.replaceState(null, '', location.pathname + location.search + hash); currentHash.current = hash; }
    if (page === 'keys' && project && route.action === 'createKey') {
      if (canCall) setDialog({ kind: 'key' }); else setError('当前角色不能创建 API Key');
      const clean = { ...route, action: '' }; setRoute(clean);
      const cleanHash = '#' + workspaceHash(page, project.id, { days: route.days });
      history.replaceState(null, '', location.pathname + location.search + cleanHash); currentHash.current = cleanHash;
    }
  }, [route, project?.id, accountPage]);
  const navigate = (page, projectId = project?.id || returnLocation?.projectId || '', model = '', request = '', saved = false, supply = '', extra = {}) => {
    if (saving) return;
    const act = () => { dirtyRef.current = false; setDirty(false); location.hash = workspaceHash(page, projectId, { model, request, supply, ...(!accountPage || pageScope(page) === 'project' ? { days: (accountPage ? returnLocation?.days : route.days) || '7' } : {}), ...extra }); setDialog(null); setSecret(''); setError(''); setDirty(false); };
    if ((dirty || secret) && !saved) setLeaving(() => act); else act();
  };
  const close = () => { if (saving) return; if (dirty || secret) setLeaving(() => () => { setDialog(null); setSecret(''); setDirty(false); setError(''); }); else { setDialog(null); setSecret(''); setError(''); } };
  const reloadWorkspace = () => {
    const act = () => { dirtyRef.current = false; setDirty(false); setDialog(null); setSecret(''); setError(''); store.reload(); };
    if (dirty || secret) setLeaving(() => act); else act();
  };
  const open = value => { setError(''); setDialog(value); };
  const run = (operation, values = {}, projectId = project?.id) => {
    try { const next = store.transactWorkspace({ type: 'workspace', operation, identity, projectId, values }); setError(''); if (operation !== 'request') { setDirty(false); toast.success('已保存'); } return next; }
    catch (caught) { setError(caught.message); return null; }
  };
  const onSaved = () => { setDialog(null); setDirty(false); };
  const title = pages.find(([id]) => id === page)?.[1] || (page === 'projects' ? '全部项目' : page === 'detail' ? '模型详情' : page);
  const forbidden = !identity || userType !== 'enterprise' && ['组织及成员', '账户操作记录', 'logs'].includes(page);
  const managementTabs = projectTabs.some(([id]) => id === page) ? projectTabs : enterpriseTabs.some(([id]) => id === page) ? enterpriseTabs : null;
  const backToProject = () => returnLocation ? navigate(returnLocation.page, returnLocation.projectId, returnLocation.model, returnLocation.request, false, returnLocation.supply, { days: returnLocation.days, rangeDays:returnLocation.rangeDays }) : navigate('projects', '');
  const runtime = project ? {
    storageKey: `moma-5130-conversations:${identity.tenantId}:${project.id}:${identity.userId}`,
    models: projectModels(state, project).filter(model => ['text', 'multimodal'].includes(model.type)).map(model => ({ name: model.id, label: model.name, provider: model.profile?.author || model.maker, type: model.type, inputModalities: (model.profile?.inputModalities || []).map(value => ({ '文本': 'text', '图片': 'image', '图像': 'image', '视频': 'video', '音频': 'audio' }[value] || value)), subscribed: true, billing: '按量计费', desc: model.description, context: model.capabilities?.context ? number(model.capabilities.context) + ' Token' : null, output: model.capabilities?.output ? number(model.capabilities.output) + ' Token' : null, maxOutput: model.capabilities?.output })),
    initialModel: route.model, initialSupply:route.supply,
    offers: id => {const model=state.models.find(item=>item.id===id);return model ? modelOffers(state,model) : [];},
    disabled: !canCall,
    onDirty: setDirty,
    openRequest: requestId => navigate('logs', project.id, '', requestId),
    request: values => {
      const requestId = `req_${crypto.randomUUID()}`;
      const next = run('request', { ...values, modelId: values.model, supplyId: values.supplyId || (values.model === route.model ? route.supply : undefined), keyId: `experience-${project.id}`, requestId });
      if (!next) return { status: 'error', errorMessage: '请求未保存，请检查页面错误并重试' };
      const record = next.requests.find(row => row.requestId === requestId);
      return { ...record, status: record.httpStatus === 200 ? 'success' : 'error', answer: `已收到：${values.prompt.slice(0, 120)}\n\n建议先明确目标和使用场景，再整理关键事实与执行步骤。对具体结论请结合业务资料核验。` };
    },
  } : null;
  return <>
    <aside className="pc-nav"><h3>模型服务平台</h3>
      {accountPage ? <div className="pc-account-context"><span>{identity?.tenantName || '当前账户'}</span><Button variant="outline" onClick={backToProject} disabled={!returnLocation}><ArrowLeft/>返回项目</Button></div> : <ProjectSelector projects={projects} project={project} onSelect={id => navigate(projectSwitchPage(page), id)} onAll={() => navigate('projects', '')}/>}
      {workspaceNavigation(userType, accountPage).map(([group,items]) => <div key={group}><small>{group}</small>{items.map(([id,label]) => <Button variant="ghost" key={id} className={navigationPage(page) === id ? 'active' : ''} aria-current={navigationPage(page) === id ? 'page' : undefined} onClick={() => navigate(id)}>{label}</Button>)}</div>)}
    </aside>
    <main className="front-main pc-main">
      <div className="pc-context"><span>{identity?.tenantName || '请选择可访问账户'}<ArrowRight/>{accountPage ? enterpriseTabs.some(([id]) => id === page) ? <>企业管理<ArrowRight/>{enterpriseTabs.find(([id]) => id === page)[1]}</> : title : <>{project?.name || '项目不可访问'}<ArrowRight/>{managementTabs ? <>项目配置<ArrowRight/>{title}</> : title}</>}</span><span>{accountPage ? <Tag>账户范围</Tag> : project && <Tag>{role}</Tag>}</span></div>
      {(error || state.storageError || conflict) && <div className="pc-error" role="alert">{error || state.storageError || '数据已有更新，请重新载入后继续；当前输入保留'}{conflict && <Button variant="outline" onClick={reloadWorkspace}>重新载入</Button>}</div>}
      {forbidden ? <section className="pc-surface pc-empty"><h1>当前空间不可访问此功能</h1><p>{auth.storageError || '请选择有权限的企业空间。'}</p></section> : page === 'projects' ? <><FrontPageHeader title="全部项目" description="按业务、部门或环境组织模型资源，分别管理授权与预算。" icon={FolderKanban} actions={<>{returnLocation && <Button variant="outline" onClick={backToProject}>返回上次项目</Button>}<Button disabled={!accountAdmin(state, identity)} onClick={() => open({ kind: 'project' })}><Plus/>创建项目</Button></>}/><section className="pc-surface"><DataTable columns={['项目 / ID', '负责人 / 角色', '模型', '本期费用 / 预算', '操作']} empty={!projects.length && '暂无可访问项目，请创建项目或联系账户管理员加入。'}>{projects.map(item => <Row key={item.id} cells={[<><button className="pc-link" onClick={() => navigate('overview', item.id)}>{item.name}</button><small>{item.id}</small></>, <>{roleName(state, item.ownerId)}<small>{projectRole(state, item, identity)}</small></>, state.projectModelGrants.filter(grant => grant.projectId === item.id && grant.enabled).length, <>{money(currentSpend(state, item))}<small>{item.moneyBudget == null ? '不限预算' : money(item.moneyBudget)}</small></>, <div className="pc-actions"><Button variant="link" onClick={() => navigate('overview', item.id)}>进入</Button></div>]}/>)}</DataTable></section></> : !project && !accountPage ? <section className="pc-surface pc-empty"><FolderKanban/><h1>{route.projectId ? '项目不可访问' : '尚无可访问项目'}</h1><p>请查看全部项目创建项目，或联系账户管理员加入项目。</p><Button onClick={() => navigate('projects', '')}>查看全部项目</Button></section> : <>
        <ManagementWorkspace key={project?.id || identity.tenantId} tabs={managementTabs} page={page} navigate={navigate} tenantName={identity.tenantName}>
        {page === 'overview' && <Overview state={state} project={project} records={records} navigate={navigate} canCall={canCall} days={route.days} setDays={days => navigate('overview', project.id, '', '', false, '', { days })}/>}
        {page === 'catalogue' && <ProjectCatalogue state={state} tenantId={identity.tenantId} onOpen={id => navigate('detail', project?.id || '', id)}/>}
        {page === 'detail' && <ModelDetail state={state} tenantId={identity.tenantId} projects={projects} identity={identity} modelId={route.model} run={run} navigate={navigate}/>}
        {page === 'models' && <ProjectModels state={state} project={project} admin={admin} open={open}/>}
        {page === 'members' && <Members key={project.id} state={state} project={project} admin={admin} open={open}/>}
        {page === 'keys' && <Keys state={state} project={project} identity={identity} admin={admin} canCall={canCall} open={open}/>}
        {page === 'settings' && <><SettingsForm key={project.id + project.updatedAt} project={project} state={state} admin={admin} dirty={setDirty} save={values => run('profile', values)}/><section className="pc-surface"><h2>退出、交接与删除</h2><p className="pc-muted">退出或删除项目会影响访问与调用，历史请求和费用记录保留。</p><div className="pc-actions"><Button variant="outline" disabled={!state.projectMemberships.some(member => member.projectId === project.id && member.userId === identity.userId && member.status === '正常')} onClick={() => open({ kind:'leave',project })}>退出项目</Button><Button variant="outline" disabled={project.ownerId !== identity.userId && !accountAdmin(state,identity)} onClick={() => open({ kind:'transfer' })}>交接负责人</Button>{accountAdmin(state, identity) && <Button variant="destructive" onClick={() => open({ kind:'delete',project })}>删除项目</Button>}</div></section></>}
        {page === 'budget' && <BudgetForm key={project.id + project.updatedAt} project={project} admin={admin} dirty={setDirty} save={values => run('budget', values)}/>}
        {page === 'experience' && (runtime.models.length ? <div className="pc-experience"><Notice>当前项目：{project.name} · 使用系统托管体验 Key · 费用归入项目预算</Notice><TextExperience onCompare={runtime.models.length>=2 ? ()=>navigate('compare') : undefined} key={runtime.storageKey} title="文本生成" imageUploadEnabled runtime={runtime}/></div> : <section className="pc-surface pc-empty"><h1>当前项目没有可体验的文本模型</h1><p>请先开通具备可用销售服务的语言或多模态模型。</p><Button onClick={() => navigate('models')}>管理项目模型</Button></section>)}
        {page === 'compare' && (runtime.models.length>=2 ? <ModelComparison runtime={runtime} onBack={()=>navigate('experience')}/> : <Notice>至少需要两个已开通的文本模型。</Notice>)}
        {page === 'logs' && <CallLogs key={project.id} records={projectLogRecords(state, records)} scopeId={'project-logs:' + identity.userId + ':' + project.id} initialRequest={route.request}/>}
        {['usage','调用观测'].includes(page) && renderLegacy(page, { state, identity, project, records, runtime, run, navigate, initialDays:route.rangeDays, onDirty:setDirty, embedded:Boolean(managementTabs) })}
        {['audit','账户操作记录'].includes(page) && <OperationRecords embedded key={page + (page === 'audit' ? project.id : identity.tenantId)} title={page === 'audit' ? '项目操作记录' : '操作记录'} description={page === 'audit' ? '当前项目的配置与调用操作记录。' : '当前账户的操作记录。'} records={state.audits.filter(row => row.tenantId === identity.tenantId && (page !== 'audit' || row.projectId === project.id) && (accountAdmin(state, identity) || admin && page === 'audit' || row.actor === identity.userId)).map(row => ({ id: row.id, time: displayTime(row.createdAt), actor: roleName(state,row.actor), feature: row.projectId ? '项目管理' : '账户管理', description: [row.action,row.objectId,row.result].filter(Boolean).join(' · '), before:row.before, after:row.after }))}/>}
        {!['overview', 'catalogue', 'detail', 'models', 'members', 'keys', 'settings', 'budget', 'experience', 'usage', 'logs', 'audit', '调用观测', '账户操作记录', 'compare'].includes(page) && renderLegacy(page, { state, identity, project, records, runtime, run, navigate, onDirty:setDirty, embedded:Boolean(managementTabs) })}
        </ManagementWorkspace>
      </>}
    </main>
    <Dialog open={Boolean(dialog)} onOpenChange={value => { if (!value) close(); }}><DialogContent className="pc-dialog" onInteractOutside={event => { if (dirty || secret) event.preventDefault(); }}><DialogHeader><DialogTitle>{secret ? 'API Key 已生成' : ({ project: '创建项目', delete: '删除项目', leave: '退出项目', member: '项目成员', model: '配置项目模型', key: dialog?.key ? '编辑 API Key' : '创建 API Key', rotateKey:'轮换 API Key', keyAction: '确认 Key 操作', transfer: '交接项目负责人' }[dialog?.kind] || title)}</DialogTitle><DialogDescription>{secret ? '完整密钥仅展示本次，请妥善保存。关闭后无法再次读取。' : dialog?.project?.name || project?.name || identity?.tenantName}</DialogDescription></DialogHeader>
      {error && <p className="pc-error" role="alert">{error}</p>}
      {secret ? <><pre className="pc-secret">{secret}</pre><DialogFooter><Button variant="outline" onClick={() => copy(secret)}><Copy/>复制密钥</Button><Button onClick={() => { setSecret(''); setDialog(null); }}>已保存，关闭</Button></DialogFooter></> : <form onChange={() => setDirty(true)} onSubmit={async event => {
        event.preventDefault(); if (saving) return;
        const values = Object.fromEntries(new FormData(event.currentTarget));
        const target = dialog?.project || project;
        let next;
        if (dialog.kind === 'project') { next = run('create', values, null); if (next) navigate('models', next.projects[0].id, '', '', true); }
        if (['delete', 'leave'].includes(dialog.kind)) { next = run(dialog.kind, values, target.id); if (next) navigate('projects', '', '', '', true); }
        if (dialog.kind === 'member') next = run('member', { ...values, userId: values.userId || dialog.member?.userId, remove: values.remove === 'on' });
        if (dialog.kind === 'transfer') next = run('transfer', values);
        if (dialog.kind === 'model') next = run('model', { ...values, modelId: dialog.model.id, enabled: values.enabled === 'on' });
        if (dialog.kind === 'keyAction') next = run(dialog.operation, { id: dialog.key.id });
        if (dialog.kind === 'key' || dialog.kind === 'rotateKey') {
          values.modelIds = new FormData(event.currentTarget).getAll('modelIds');
          if (dialog.key && dialog.kind !== 'rotateKey') next = run('editKey', { ...values, id: dialog.key.id });
          else { setSaving(true); try { const bytes = crypto.getRandomValues(new Uint8Array(24)); const raw = 'sk-' + [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join(''); const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw)); const fingerprint = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join(''); next = run(dialog.kind === 'rotateKey' ? 'rotateKey' : 'createKey', { ...values, id:dialog.key?.id, fingerprint, secretPreview: 'sk-*****' + raw.slice(-4) }); if (next) { setSecret(raw); setDirty(false); } } catch { setError('密钥生成失败，请重试'); } finally { setSaving(false); } }
        }
        if (next && !(dialog.kind === 'key' && !dialog.key || dialog.kind === 'rotateKey') && !['project', 'delete', 'leave'].includes(dialog.kind)) onSaved();
      }}>
        <div className="pc-dialog-body">
          {dialog?.kind === 'project' && <><Field label="项目名称 *"><Input name="name" required minLength={2} maxLength={50} autoFocus/></Field><Field label="项目说明"><Textarea name="description" maxLength={200}/></Field><Notice>新项目初始未开通模型，创建后请配置项目模型与预算。</Notice></>}
          {dialog?.kind === 'delete' && <><Notice>删除后该项目及其 Key 停止调用，历史请求和费用保留。</Notice><Field label="输入完整项目名称确认"><Input name="confirmName" required autoComplete="off"/></Field></>}
          {dialog?.kind === 'leave' && <Notice>退出后失去项目成员权限；负责人须先交接。账户管理员仍拥有账户内项目管理权限。</Notice>}
          {dialog?.kind === 'member' && <><Field label="账户成员"><select name="userId" defaultValue={dialog.member?.userId} disabled={Boolean(dialog.member)}>{state.memberships.filter(member => member.tenantId === project?.tenantId && ['正常', '已加入'].includes(member.status) && state.users.some(user => user.id === member.userId && user.status === '正常') && (dialog.member?.userId === member.userId || !state.projectMemberships.some(item => item.projectId === project.id && item.userId === member.userId && item.status === '正常'))).map(member => <option key={member.id} value={member.userId}>{roleName(state, member.userId)}</option>)}</select></Field><Field label="项目角色"><select name="role" defaultValue={dialog.member?.role || '成员'}>{['管理员', '成员', '只读'].map(role => <option key={role}>{role}</option>)}</select></Field>{dialog.member && <Field label="移除成员"><input type="checkbox" name="remove"/>移除后不能继续访问项目</Field>}</>}
          {dialog?.kind === 'transfer' && <Field label="新负责人"><select name="userId" required>{state.projectMemberships.filter(member => member.projectId === project.id && member.status === '正常' && member.role === '管理员' && member.userId !== project.ownerId).map(member => <option key={member.id} value={member.userId}>{roleName(state, member.userId)}</option>)}</select></Field>}
          {dialog?.kind === 'model' && <><p>{dialog.model.name}</p><Field label="项目开通"><input type="checkbox" name="enabled" defaultChecked={dialog.grant?.enabled}/>允许项目成员调用</Field><div className="pc-form-grid"><Field label="项目 RPM（空为继承）"><Input name="rpm" type="number" min="1" defaultValue={dialog.grant?.rpm ?? ''}/></Field><Field label="项目 TPM（空为继承）"><Input name="tpm" type="number" min="1" defaultValue={dialog.grant?.tpm ?? ''}/></Field></div><Notice>关闭后，现有 Key 即使保留模型范围也不能调用。</Notice></>}
          {dialog?.kind === 'rotateKey' && <Notice>轮换后旧密钥立即失效，新密钥仅展示一次。项目、模型范围与预算保持不变。</Notice>}{dialog?.kind === 'keyAction' && <Notice>{dialog.operation === 'deleteKey' ? '删除后此 Key 无法继续调用，历史使用记录保留。' : `将${dialog.key.status === '有效' ? '停用' : '启用'} ${dialog.key.name}。`}</Notice>}
          {dialog?.kind === 'key' && <><Field label="Key 名称 *"><Input name="name" required minLength={2} maxLength={50} defaultValue={dialog.key?.name}/></Field><Field label="计费归属"><select name="subscriptionId" value={dialog.subscriptionId ?? dialog.key?.subscriptionId ?? ""} onChange={event => setDialog({ ...dialog, subscriptionId: event.target.value })}><option value="">按量付费</option>{state.orders.filter(order => order.tenantId === project.tenantId && order.status === "已开通" && state.products.some(product => product.id === order.productId && productBillingType(product) === "plan")).map(order => <option key={order.id} value={order.id}>{state.products.find(product => product.id === order.productId)?.name} · {order.orderNo}</option>)}</select></Field><Field label="IP 白名单（空为不限）"><Textarea name="ips" defaultValue={(dialog.key?.ips || []).join('\n')} placeholder="每行一个 IPv4 地址或 CIDR 网段"/></Field><Field label="用途"><Textarea name="description" maxLength={200} defaultValue={dialog.key?.description}/></Field><fieldset className="pc-checklist"><legend>允许模型（至少一个）</legend>{projectModels(state, project).map(model => <label key={model.id}><input type="checkbox" name="modelIds" value={model.id} defaultChecked={dialog.key?.modelIds?.includes(model.id)}/>{model.name}</label>)}{!projectModels(state, project).length && <p>请先开通项目模型。</p>}</fieldset><div className="pc-form-grid"><Field label="金额预算（元，空为不限）"><Input name="budget" inputMode="decimal" disabled={Boolean(dialog.subscriptionId ?? dialog.key?.subscriptionId)} defaultValue={budgetText(dialog.key?.moneyBudget)}/></Field><Field label="预算周期"><select name="budgetPeriod" defaultValue={dialog.key?.budgetPeriod || 'month'}><option value="month">自然月</option><option value="total">累计</option></select></Field></div><Field label="有效期（空为长期）"><Input name="expiresAt" type="datetime-local" defaultValue={dialog.key?.expiresAt ? new Date(Date.parse(dialog.key.expiresAt) + 8 * 3600000).toISOString().slice(0, 16) : ''}/></Field></>}
        </div><DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={close}>取消</Button><Button type="submit" disabled={saving}>{saving ? '正在保存…' : '确认'}</Button></DialogFooter>
      </form>}
    </DialogContent></Dialog>
    <Dialog open={Boolean(leaving)} onOpenChange={value => { if (!value) setLeaving(null); }}><DialogContent><DialogHeader><DialogTitle>放弃未保存的修改？</DialogTitle><DialogDescription>离开后，本次输入不会保存。</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setLeaving(null)}>继续编辑</Button><Button onClick={() => { const act = leaving; setLeaving(null); setDirty(false); act(); }}>放弃并离开</Button></DialogFooter></DialogContent></Dialog>
  </>;
}

function ProjectSelector({ projects, project, onSelect, onAll }) {
  const [open, setOpen] = useState(false);
  return <div className="pc-project-select"><Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button variant="outline" role="combobox" aria-label="切换项目" aria-expanded={open} title={project?.name || '暂无可访问项目'}><span>{project?.name || '暂无可访问项目'}</span><ChevronDown/></Button></PopoverTrigger><PopoverContent className="pc-project-menu" align="start"><Command><CommandInput placeholder="搜索项目"/><CommandList><CommandEmpty>没有匹配的项目</CommandEmpty><CommandGroup heading="切换项目">{projects.map(item => <CommandItem key={item.id} value={item.id} keywords={[item.name]} data-checked={item.id === project?.id} onSelect={() => { setOpen(false); if (item.id !== project?.id) onSelect(item.id); }}>{item.name}</CommandItem>)}</CommandGroup></CommandList></Command><Button variant="ghost" onClick={() => { setOpen(false); onAll(); }}>查看全部项目<ArrowRight/></Button></PopoverContent></Popover></div>;
}

function ManagementWorkspace({ tabs, page, navigate, tenantName, children }) {
  if (!tabs) return children;
  const projectScope = tabs === projectTabs;
  return <Tabs className="pc-management" value={page} onValueChange={navigate} activationMode="manual"><FrontPageHeader title={projectScope ? '项目配置' : '企业管理'} description={projectScope ? '配置当前项目的资源、成员、预算与日志策略。' : tenantName + ' · 维护企业组织、成员与操作记录'} icon={projectScope ? Settings : Users}/><TabsList variant="line" aria-label={projectScope ? '项目配置页签' : '企业管理页签'}>{tabs.map(([id,label]) => <TabsTrigger key={id} value={id}>{label}</TabsTrigger>)}</TabsList><TabsContent key={page} value={page}>{children}</TabsContent></Tabs>;
}

function Overview({ state, project, records, navigate, canCall, days, setDays }) {
  const now = Date.now(), today = new Date(now + 28800000).toISOString().slice(0,10), cutoff = Date.parse(today + 'T00:00:00+08:00') - (Number(days)-1)*86400000;
  const current = records.filter(row => Date.parse(row.createdAt) >= cutoff), previous = records.filter(row => Date.parse(row.createdAt) >= cutoff - Number(days) * 86400000 && Date.parse(row.createdAt) < cutoff);
  const total = rows => rows.reduce((sum, row) => sum + (row.usage?.input || 0) + (row.usage?.output || 0), 0);
  const cost = rows => rows.length && rows.every(row=>row.customerCharge==null) ? null : rows.reduce((sum,row)=>sum+(row.customerCharge || 0),0);
  const success = rows => rows.length ? rows.filter(row => row.httpStatus === 200).length / rows.length * 100 : null;
  const metrics = [['请求数', current.length, previous.length, '次'], ['Token', total(current), total(previous), 'Token'], ['已记录费用', cost(current), cost(previous), '元'], ['成功率', success(current), success(previous), '%']];
  const buckets = Array.from({ length: Number(days) }, (_, i) => new Date(now - (Number(days) - i - 1) * 86400000).toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }));
  const ranked = field => [...new Set(current.filter(row => row.customerCharge != null).map(row => row[field]))].map(id => ({ id, value: cost(current.filter(row => row[field] === id)) })).sort((a, b) => b.value - a.value).slice(0, 5);
  return <><FrontPageHeader title="项目概览" description="查看项目用量、费用和资源配置。" icon={LayoutDashboard} actions={<><Pick label="统计时间" value={days} options={['1', '7', '30'].map(value => [value, value === '1' ? '今日' : `近 ${value} 天`])} onChange={setDays}/><Button disabled={!canCall} onClick={() => navigate('keys', project.id, '', '', false, '', { action:'createKey' })}><Plus/>创建 API Key</Button></>}/><BudgetNotice state={state} project={project}/><section className="pc-surface pc-metrics">{metrics.map(([name, value, before, unit]) => <div key={name}><span>{name}</span><strong>{value == null ? '—' : unit === '元' ? money(value) : value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}{value != null && unit !== '元' && <small>{unit}</small>}</strong><small>{before == null || before === 0 || value == null ? '前期无可比数据' : `较前期 ${((value - before) / before * 100).toFixed(1)}%`}</small></div>)}</section>
    <div className="pc-two-columns"><section className="pc-surface"><h2>调用量趋势</h2><TimeSeriesChart label="项目调用量趋势" labels={buckets} series={[{ label: '请求数', values: buckets.map(day => current.filter(row => row.createdAt && new Date(row.createdAt).toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }) === day).length) }]} unit="次"/></section><section className="pc-surface"><h2>费用趋势</h2><TimeSeriesChart label="项目费用趋势" labels={buckets} series={[{ label: '已记录费用', values: buckets.map(day => { const value = cost(current.filter(row => new Date(row.createdAt).toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }) === day)); return value == null ? null : value / 1e6; }) }]} unit="元"/></section></div>
    <div className="pc-two-columns">{[['modelId', '模型费用 Top 5'], ['keyId', 'Key 费用 Top 5']].map(([field, title]) => <section className="pc-surface" key={field}><h2>{title}</h2><DataTable columns={['对象', '已记录费用']} empty={!ranked(field).length && '当前时间范围暂无已记录费用的请求'}>{ranked(field).map(row => <Row key={row.id} cells={[field === 'modelId' ? state.models.find(model => model.id === row.id)?.name || row.id : state.apiKeys.find(key => key.id === row.id)?.name || row.id, money(row.value)]}/>)}</DataTable></section>)}</div>
    <section className="pc-surface">{current.some(row => row.customerCharge == null) && <Notice>{current.filter(row => row.customerCharge == null).length} 条历史请求未记录费用，不纳入费用排行和金额预算。</Notice>}<div className="pc-section-title"><h2>配置摘要</h2><Button variant="link" onClick={() => navigate('usage', project.id, '', '', false, '', { rangeDays: days })}>查看详细用量<ArrowRight/></Button></div><div className="pc-config">{[['budget', '预算', `${money(currentSpend(state, project))} / ${project.moneyBudget == null ? '不限' : money(project.moneyBudget)}`], ['models', '已开通模型', state.projectModelGrants.filter(grant => grant.projectId === project.id && grant.enabled).length + ' 个'], ['智能路由', '项目路由', (project.smartRoutes || []).length + ' 条'], ['keys', '可调用 Key', state.apiKeys.filter(key => key.projectId === project.id && keyAvailability(state,key) === '可调用').length + ' 个'], ['members', '项目成员', state.projectMemberships.filter(member => member.projectId === project.id && member.status === '正常').length + ' 人'], ['budget', '输入输出日志', project.logBodies ? '已开启' : '仅元数据']].map(([page, name, value]) => <button key={name} onClick={() => navigate(page)}><span>{name}</span><b>{value}</b><ArrowRight/></button>)}</div></section>
  </>;
}
function BudgetNotice({ state, project }) { const used = currentSpend(state, project); return project.moneyBudget != null && used >= project.moneyBudget * project.warningPercent / 100 ? <Notice>{used >= project.moneyBudget ? '项目预算已达到上限' : '项目预算达到预警阈值'} · {project.overageAction === 'stop' ? '超额后停止调用' : '超额后继续调用并预警'}</Notice> : null; }
function SettingsForm({ project, state, admin, dirty, save }) {
  return <section className="pc-surface"><form className="pc-settings" onChange={() => dirty(true)} onSubmit={event => { event.preventDefault(); save(Object.fromEntries(new FormData(event.currentTarget))); }}><dl className="pc-facts"><dt>项目 ID</dt><dd>{project.id}<Button variant="ghost" size="icon-sm" type="button" aria-label="复制项目 ID" onClick={() => copy(project.id)}><Copy/></Button></dd><dt>负责人</dt><dd>{roleName(state, project.ownerId)}</dd></dl><fieldset disabled={!admin}><Field label="项目名称 *"><Input name="name" defaultValue={project.name} required minLength={2} maxLength={50}/></Field><Field label="项目说明"><Textarea name="description" defaultValue={project.description} maxLength={200}/></Field></fieldset>{admin ? <div className="pc-form-footer"><Button type="submit">保存基本信息</Button></div> : <Notice>当前角色只可查看项目配置。</Notice>}</form></section>;
}
function BudgetForm({ project, admin, dirty, save }) {
  return <section className="pc-surface"><form className="pc-settings" onChange={() => dirty(true)} onSubmit={event => { event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget)); save({ ...data, logBodies: data.logBodies === 'on' }); }}><fieldset disabled={!admin}><h2>消费预算</h2><div className="pc-form-grid"><Field label="预算金额（元，空为不限）"><Input name="budget" inputMode="decimal" defaultValue={budgetText(project.moneyBudget)}/></Field><Field label="预算周期"><select name="budgetPeriod" defaultValue={project.budgetPeriod}><option value="month">自然月</option><option value="total">累计</option></select></Field><Field label="预警阈值（%）"><Input name="warningPercent" type="number" min="1" max="100" defaultValue={project.warningPercent}/></Field><Field label="超额动作"><select name="overageAction" defaultValue={project.overageAction}><option value="stop">停止调用</option><option value="warn">仅预警</option></select></Field></div><Notice>预算按人民币消费金额控制；修改周期不会删除历史用量。</Notice><h2>输入输出日志</h2><Field label="记录请求与响应内容"><input type="checkbox" name="logBodies" defaultChecked={project.logBodies}/>仅影响保存后的新请求</Field><Notice>默认仅保存元数据。关闭不会补采、清除或重写历史记录。</Notice></fieldset>{admin ? <div className="pc-form-footer"><Button type="submit">保存预算与日志</Button></div> : <Notice>当前角色只可查看项目配置。</Notice>}</form></section>;
}
function ProjectModels({ state, project, admin, open }) { const [query, setQuery] = useState(''); const rows = accountModels(state, project.tenantId).filter(model => `${model.name} ${model.modelId}`.toLowerCase().includes(query.toLowerCase())); return <><PanelHeader description="在账户授权范围内开通模型，并配置项目的 RPM / TPM。"/><section className="pc-surface"><div className="pc-toolbar"><Input aria-label="搜索项目模型" placeholder="搜索模型名称 / Model ID" value={query} onChange={event => setQuery(event.target.value)}/></div><DataTable columns={['模型 / Model ID', '平台服务', '项目状态', '有效 RPM / TPM', '操作']} empty={!rows.length && '没有匹配的账户授权模型'}>{rows.map(model => { const grant = state.projectModelGrants.find(item => item.projectId === project.id && item.modelId === model.id); return <Row key={model.id} cells={[<>{model.name}<small>{model.modelId}</small></>, modelOffers(state, model).length && model.callsEnabled !== false ? '可用' : '当前不可用', grant?.enabled ? '已开通' : '未开通', <>{effectiveLimit(state, project, model.id, 'rpm') ?? '不限'} / {effectiveLimit(state, project, model.id, 'tpm') ?? '不限'}<small>{grant?.rpm || grant?.tpm ? '项目与上层限制共同生效' : '继承上层限制'}</small></>, <Button variant="link" disabled={!admin} onClick={() => open({ kind: 'model', model, grant })}>配置</Button>]}/>; })}</DataTable></section></>; }
function Members({ state, project, admin, open }) { const rows = state.projectMemberships.filter(member => member.projectId === project.id && member.status === '正常'); return <><PanelHeader description="从账户成员中添加人员，分别授予项目权限。" actions={<Button disabled={!admin} onClick={() => open({ kind: 'member' })}><Plus/>添加成员</Button>}/><section className="pc-surface"><DataTable columns={['成员', '账号', '项目角色', '操作']}>{rows.map(member => <Row key={member.id} cells={[<>{roleName(state, member.userId)}{member.userId === project.ownerId && <small>项目负责人</small>}</>, state.users.find(user => user.id === member.userId)?.login || member.userId, member.role, <Button variant="link" disabled={!admin} onClick={() => open({ kind: 'member', member })}>管理</Button>]}/>)}</DataTable></section></>; }
function Keys({ state, project, identity, admin, canCall, open }) { const [query, setQuery] = useState(''); const rows = state.apiKeys.filter(key => key.projectId === project.id && key.status !== '已删除' && (admin || key.createdBy === identity.userId || key.managed) && `${key.name} ${key.keyId}`.toLowerCase().includes(query.toLowerCase())); return <><PanelHeader description="密钥归属当前项目，模型范围、金额预算和有效期分别生效。" actions={<Button disabled={!canCall} onClick={() => open({ kind: 'key' })}><Plus/>创建 API Key</Button>}/><section className="pc-surface"><div className="pc-toolbar"><Input aria-label="搜索 Key" value={query} placeholder="搜索名称 / Key ID" onChange={event => setQuery(event.target.value)}/></div><DataTable columns={['Key 名称 / ID', 'API Key', '状态', '模型 / 用途', '本期费用 / 预算', '有效期', '操作']} empty={!rows.length && '暂无匹配的 API Key'}>{rows.map(key => <Row key={key.id} cells={[<>{key.name}<small>{key.keyId}<Button variant="ghost" size="icon-sm" aria-label={'复制 Key ID ' + key.name} onClick={() => copy(key.keyId)}><Copy/></Button></small></>, key.managed ? '系统托管' : maskApiKey(key.secretPreview), <>{key.status}<small>{keyAvailability(state, key)}</small></>, <>{effectiveKeyModels(state,key).map(model => model.name).join('、') || '无可用模型'}<small>{key.subscriptionId ? 'Token Plan · ' + key.subscriptionId : key.description || (key.managed ? '在线体验自动使用' : '按量付费')}</small></>, <>{money(currentSpend(state, key))}<small>{key.moneyBudget == null ? '不限' : money(key.moneyBudget)}</small></>, key.expiresAt ? displayTime(key.expiresAt) : '长期', key.managed ? '系统维护' : <div className="pc-actions"><Button variant="link" disabled={!canCall} onClick={() => open({ kind: 'key', key })}>编辑</Button><Button variant="link" disabled={!canCall} onClick={() => open({ kind: 'keyAction', key, operation: 'keyStatus' })}>{key.status === '有效' ? '停用' : '启用'}</Button><Button variant="link" disabled={!canCall} onClick={() => open({kind:'rotateKey',key})}>轮换</Button><Button variant="link" disabled={!canCall} onClick={() => open({ kind: 'keyAction', key, operation: 'deleteKey' })}>删除</Button></div>]}/>)}</DataTable></section></>; }

function ModelDetail({ state, tenantId, projects, identity, modelId, run, navigate }) {
  const model = visibleCatalogue(state, tenantId).find(model => model.id === modelId), [selected, setSelected] = useState(''), [language, setLanguage] = useState('curl'), [stream, setStream] = useState(false), [targetId, setTargetId] = useState('');
  const project = projects.find(item => item.id === targetId), role = projectRole(state, project, identity), admin = role === '管理员';
  if (!model) return <Notice>模型不存在或未向当前账户开放。<Button variant="link" onClick={() => navigate('catalogue')}>返回模型广场</Button></Notice>;
  const offers = modelOffers(state, model), offer = offers.find(item => item.id === selected) || offers[0], profile = model.profile || {};
  const enabled = project && state.projectModelGrants.some(grant => grant.projectId === project.id && grant.modelId === model.id && grant.enabled);
  const text = ['text', 'multimodal'].includes(model.type), openai = offer?.endpoint?.protocol === 'OpenAI';
  const endpoint = text ? '/chat/completions' : model.type === 'embedding' ? '/embeddings' : model.type === 'image' ? '/images/generations' : null;
  const body = text ? { model: offer?.callId, messages: [{ role: 'user', content: '你好，请介绍一下自己' }], stream } : model.type === 'embedding' ? { model: offer?.callId, input: '需要向量化的文本' } : { model: offer?.callId, prompt: '清晨的城市公园' };
  const base = 'https://api.moma.example/v1', json = JSON.stringify(body, null, 2);
  const code = language === 'curl' ? `curl "$MOMA_BASE_URL${endpoint || ''}" \\\n  -H "Authorization: Bearer $MOMA_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '${json}'` : language === 'python' ? `import os\nimport requests\n\nresponse = requests.post(\n    os.environ['MOMA_BASE_URL'] + '${endpoint || ''}',\n    headers={'Authorization': 'Bearer ' + os.environ['MOMA_API_KEY']},\n    json=${JSON.stringify(body).replaceAll('true', 'True').replaceAll('false', 'False')},\n    stream=${stream ? 'True' : 'False'},\n)\nresponse.raise_for_status()\n${stream ? 'for line in response.iter_lines():\n    if line: print(line.decode())' : 'print(response.json())'}` : `const response = await fetch(process.env.MOMA_BASE_URL + '${endpoint || ''}', {\n  method: 'POST',\n  headers: { Authorization: 'Bearer ' + process.env.MOMA_API_KEY, 'Content-Type': 'application/json' },\n  body: JSON.stringify(${json}),\n});\nif (!response.ok) throw new Error(await response.text());\n${stream ? 'for await (const chunk of response.body) process.stdout.write(chunk);' : 'console.log(await response.json());'}`;
  return <><Button variant="link" onClick={() => navigate('catalogue')}><ArrowLeft/>返回模型广场</Button><FrontPageHeader title={model.name} icon={Boxes} description={model.description} actions={<><Pick label="目标项目" value={targetId} options={[['', '选择目标项目'], ...projects.map(item => [item.id, item.name])]} onChange={setTargetId}/><Button variant="outline" disabled={!admin} onClick={() => { const grant = state.projectModelGrants.find(item => item.projectId === project.id && item.modelId === model.id); run('model', { modelId: model.id, enabled: !enabled, rpm: grant?.rpm ?? '', tpm: grant?.tpm ?? '' }, project.id); }}>{enabled ? '关闭项目开通' : '开通到项目'}</Button><Button disabled={!enabled || !text || !offer || !role || role === '只读'} onClick={() => navigate('experience', project.id, model.id, '', false, offer.id)}>在线体验</Button></>}/><section className="pc-surface"><h2>模型能力</h2><dl className="pc-facts">{[['模型编码', model.modelId], ['作者 / 系列', `${profile.author || model.maker || '—'} / ${profile.family || '—'}`], ['目标项目', project?.name || '请先选择目标项目'], ['项目状态', project ? enabled ? '已开通' : '未开通' : '尚未选择项目'], ['输入', profile.inputModalities?.join('、') || '—'], ['输出 / 结果', [...(profile.outputModalities || []), ...(profile.resultTypes || [])].join('、') || '—'], ['上下文', model.capabilities?.context ? number(model.capabilities.context) + ' Token' : '—'], ['最大输出', model.capabilities?.output ? number(model.capabilities.output) + ' Token' : '—'], ['任务', profile.tasks?.join('、') || '—'], ['支持参数', profile.supportedParameters?.join('、') || '未填写']].map(([label, value]) => <Fragment key={label}><dt>{label}</dt><dd>{value}</dd></Fragment>)}</dl></section><section className="pc-surface"><h2>销售服务与价格</h2><DataTable columns={['供应商 / 对客 Model ID', '计费项', '售价', '计价单位']} empty={!offers.length && '当前暂无可用销售服务'}>{offers.flatMap(item => item.items.length ? item.items.map((price, i) => <Row key={item.id + i} cells={[<>{item.provider.name}<small>{item.callId}</small></>, price.name, price.amount == null ? '待配置' : `${price.currency || 'CNY'} ${price.amount / 1e6}`, price.unit]}/>) : [<Row key={item.id} cells={[item.provider.name, '—', '待配置', '—']}/>])}</DataTable></section><section className="pc-surface"><h2>快速开始</h2><div className="pc-toolbar"><Pick label="销售服务" value={offer?.id || ''} options={offers.length ? offers.map(item => [item.id, item.provider.name + ' · ' + item.callId]) : [['', '无可用服务']]} onChange={setSelected}/><Pick label="编程语言" value={language} options={['curl', 'python', 'javascript'].map(item => [item, item])} onChange={setLanguage}/>{text && <label className="pc-check"><Checkbox checked={stream} onCheckedChange={value => setStream(value === true)}/>流式输出</label>}</div><p>协议：{openai ? text ? 'OpenAI Chat Completions' : 'OpenAI 兼容' : '未配置'} · 对客模型标识：<code>{offer?.callId || '—'}</code></p><Notice>将 MOMA_BASE_URL 设置为部署提供的统一 API 地址（格式：{base}），MOMA_API_KEY 设置为当前项目密钥。地址由部署配置提供。</Notice>{offer && openai && endpoint ? <><div className="pc-code-tools"><Button variant="outline" onClick={() => copy(code)}><Copy/>复制代码</Button></div><pre className="pc-code">{code}</pre></> : <Notice>该模型的调用协议或端点尚未配置，请联系平台管理员。</Notice>}<details><summary>鉴权与错误处理</summary><p>Authorization: Bearer &lt;API_KEY&gt;。调用前需满足账户授权、项目开通和 Key 模型范围。</p><pre className="pc-code">{'{"error":{"code":"model_not_authorized","message":"项目未开通该模型"},"request_id":"req_…"}'}</pre></details></section></>;
}
