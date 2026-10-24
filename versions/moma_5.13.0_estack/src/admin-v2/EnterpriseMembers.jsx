import { useState } from 'react';
import { ChevronDown, ChevronRight, Folder, Layers3, Network, Search, ShieldCheck, UserPlus, Users, UsersRound } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Checkbox } from '../components/ui/checkbox';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { DEFAULT_PAGE_SIZE, FilterPagination } from '../components/FilterControls';
import { departmentPath, descendantIds } from '../organization-data.mjs';
import { effectiveEnterpriseAdmins, isEnterpriseAdmin } from './enterprise';
import { enterpriseMemberView } from './enterprise-members';
import '../organization-members.css';

function Choice({ label, value, options, onChange }) {
  return <label className="org-field"><span>{label}</span><Select value={value} onValueChange={onChange}><SelectTrigger aria-label={label}><SelectValue/></SelectTrigger><SelectContent><SelectGroup>{options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectGroup></SelectContent></Select></label>;
}

export default function EnterpriseMembers({ state, tenant, projects, canWrite, setEditor, setResult, askToggle, Modal, Status }) {
  const [selection, setSelection] = useState('all'), [treeQuery, setTreeQuery] = useState(''), [collapsed, setCollapsed] = useState([]);
  const [includeChildren, setIncludeChildren] = useState(true), [query, setQuery] = useState(''), [role, setRole] = useState('all'), [status, setStatus] = useState('all');
  const [page, setPage] = useState(1), [size, setSize] = useState(DEFAULT_PAGE_SIZE), [inspectId, setInspectId] = useState(null);
  const { organizations, members, organization, scoped, filtered, organizationFor, userFor } = enterpriseMemberView(state, tenant, { selection, includeChildren, query, role, status });
  const admins = members.filter(member => isEnterpriseAdmin(member, tenant)), validAdmins = effectiveEnterpriseAdmins(state, tenant);
  const title = organization?.name || ({ all: '全部成员', admins: '企业管理员', unassigned: '未分配部门' })[selection] || '组织不存在';
  const organizationPath = organization && departmentPath(organizations, organization.id);
  const scopeDescription = organization ? organizationPath !== title ? organizationPath : '' : selection === 'admins' ? '管理企业管理员；至少保留一位有效管理员。' : selection === 'unassigned' ? '查看尚未登记主部门的成员。' : '查看企业内所有组织及未分配部门的成员。';
  const current = Math.max(1, Math.min(page, Math.ceil(filtered.length / size) || 1));
  const inspect = members.find(member => member.id === inspectId), inspectUser = inspect && userFor(inspect);
  const select = value => { setSelection(value); setPage(1); };
  const reset = () => { setQuery(''); setRole('all'); setStatus('all'); setPage(1); };
  const projectScope = member => isEnterpriseAdmin(member, tenant) ? '企业全部项目' : projects.filter(project => member.projectIds?.includes(project.id)).map(project => project.name).join('、') || '未分配项目';
  const canToggle = member => canWrite && tenant.status !== '停用' && !(validAdmins.some(admin => admin.id === member.id) && validAdmins.length <= 1) && !(member.status === '停用' && userFor(member)?.status !== '正常');
  const pathFor = member => organizationFor(member) ? departmentPath(organizations, member.organizationId) : '未登记部门归属';
  const tree = (node, depth = 0, visited = new Set()) => {
    if (visited.has(node.id)) return null;
    const branch = new Set([...visited, node.id]), children = organizations.filter(org => org.parentId === node.id && !branch.has(org.id));
    const ids = descendantIds(organizations, node.id), search = treeQuery.trim().toLowerCase();
    if (search && !organizations.some(org => ids.has(org.id) && org.name.toLowerCase().includes(search))) return null;
    const expanded = search || !collapsed.includes(node.id);
    const Icon = depth === 0 ? Network : children.length ? Layers3 : UsersRound;
    return <div key={node.id} className="ent-org-branch"><div className={`org-tree-row ${depth === 0 ? 'ent-org-root' : ''} ${children.length ? 'ent-org-parent' : ''} ${selection === node.id ? 'is-selected' : ''}`}>
      <button className="org-tree-select" aria-label={`查看组织：${node.name}`} aria-current={selection === node.id ? 'true' : undefined} title={departmentPath(organizations, node.id)} onClick={() => select(node.id)}><Icon aria-hidden="true"/><span>{node.name}</span><small title="已登记到该组织及子部门的成员数">{members.filter(member => ids.has(member.organizationId)).length}</small></button>
      {children.length > 0 && <Button variant="ghost" size="icon-xs" className="org-expand" aria-label={`${expanded ? '收起' : '展开'}${node.name}`} aria-expanded={!!expanded} onClick={() => setCollapsed(previous => previous.includes(node.id) ? previous.filter(id => id !== node.id) : [...previous, node.id])}>{expanded ? <ChevronDown/> : <ChevronRight/>}</Button>}
    </div>{expanded && children.length > 0 && <div className="ent-org-children" role="group" aria-label={`${node.name}的子部门`}>{children.map(child => tree(child, depth + 1, branch))}</div>}</div>;
  };
  return <div className="org-page ent-members-workspace"><div className="org-workspace">
    <div className="org-directory" role="navigation" aria-label="企业组织导航">
      <div className="ent-directory-group" role="group" aria-label="成员范围"><h3 className="ent-directory-group-title">成员范围</h3>
      {[['all', '全部成员', members.length, Users], ['admins', '企业管理员', admins.length, ShieldCheck], ['unassigned', '未分配部门', members.filter(member => !organizationFor(member)).length, Users]].map(([id, label, count, Icon]) => <button key={id} className={`org-directory-view ${selection === id ? 'is-selected' : ''}`} aria-current={selection === id ? 'true' : undefined} onClick={() => select(id)}><Icon/><span>{label}</span><small>{count}</small></button>)}
      </div>
      <div className="ent-directory-group" role="group" aria-label="组织架构"><h3 className="ent-directory-group-title">组织架构</h3>
      <div className="org-tree-tools"><div className="org-search"><Search/><Input aria-label="搜索企业组织" placeholder="搜索组织名称" value={treeQuery} onChange={event => setTreeQuery(event.target.value)}/></div></div>
      <div className="org-tree">{organizations.filter(org => org.parentId === null || !organizations.some(parent => parent.id === org.parentId)).map(org => tree(org))}</div>
      {(!organizations.length || (treeQuery.trim() && !organizations.some(org => org.name.toLowerCase().includes(treeQuery.trim().toLowerCase())))) && <p className="ent-directory-empty">{organizations.length ? '没有匹配的组织' : '尚未配置组织'}</p>}
      </div>
    </div>
    <section className="org-members-panel" aria-label="企业成员列表">
      <div className="org-department-head"><span className="org-department-icon">{selection === 'admins' ? <ShieldCheck/> : organization ? <Folder/> : <Users/>}</span><div className="org-department-info"><h2>{title}</h2>{scopeDescription && <p>{scopeDescription}</p>}<small>已启用 {scoped.filter(member => member.status === '正常').length} 人<i/>已停用 {scoped.filter(member => member.status === '停用').length} 人</small></div><Button disabled={!canWrite || tenant.status === '停用'} onClick={() => setEditor({ kind: 'add-admin', tenant })}><UserPlus size={15}/>添加管理员</Button></div>
      {!validAdmins.length && <p className="ent-note ent-inline-note">当前没有有效企业管理员，请配置明确的企业管理员角色。</p>}
      <div className="org-filters"><div className="org-search"><Search/><Input aria-label="搜索企业成员" placeholder="姓名、登录账号或角色" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }}/></div>
        <Choice label="企业成员状态" value={status} onChange={value => { setStatus(value); setPage(1); }} options={[{ value: 'all', label: '全部状态' }, { value: '正常', label: '已启用' }, { value: '停用', label: '已停用' }]}/>
        <Choice label="企业角色筛选" value={role} onChange={value => { setRole(value); setPage(1); }} options={[{ value: 'all', label: '全部角色' }, ...[...new Set(members.map(member => member.role))].map(value => ({ value, label: value }))]}/>
        {organization && <label className="org-check"><Checkbox checked={includeChildren} onCheckedChange={value => { setIncludeChildren(!!value); setPage(1); }}/>包含子部门</label>}
        <Button variant="ghost" size="sm" onClick={reset}>重置</Button>
        <small className="ent-member-count">共 {filtered.length} 位成员</small>
      </div>
      <Table className="org-member-table ent-members-table"><TableHeader><TableRow>{(selection === 'admins' ? ['成员 / 登录账号', '手机号码', '登录身份状态', '账号初始化', '成员状态', '操作'] : ['成员', '登录账号', '主部门', '企业角色', '成员状态', '操作']).map(label => <TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader><TableBody>
        {filtered.slice((current - 1) * size, current * size).map(member => { const user = userFor(member), name = user?.name || member.name, admin = isEnterpriseAdmin(member, tenant); return <TableRow key={member.id}>
          <TableCell><button className="org-member-name" aria-label={`查看成员：${name}`} onClick={() => setInspectId(member.id)}><span className="org-avatar">{name.slice(-2)}</span><span>{name}<small>{selection === 'admins' ? user?.login || member.userId : member.userId}</small></span></button></TableCell>
          {selection === 'admins' ? <><TableCell>{user?.phone || '未填写'}</TableCell><TableCell>{user ? <Status value={user.status}/> : '身份不存在'}</TableCell><TableCell>{user?.initialized ? '已完成' : '待初始化'}</TableCell></> : <><TableCell className="org-account">{user?.login || member.userId}</TableCell><TableCell title={pathFor(member)}>{organizationFor(member)?.name || '未分配部门'}</TableCell><TableCell><span className="org-role">{admin && <ShieldCheck/>}{member.role}</span></TableCell></>}
          <TableCell><Status value={member.status}/></TableCell><TableCell><div className="org-row-actions"><button className="ent-link" onClick={() => setInspectId(member.id)}>详情</button>{admin && <><button className="ent-link" disabled={!canWrite || !user} onClick={() => setResult({ tenant, user, handover: true })}>交接信息</button><button className="ent-link" disabled={!canToggle(member)} title={validAdmins.some(item => item.id === member.id) && validAdmins.length <= 1 ? '至少保留一位有效企业管理员' : undefined} onClick={() => askToggle(tenant, member)}>{member.status === '停用' ? '启用' : '停用'}</button></>}</div></TableCell>
        </TableRow>; })}
        {!filtered.length && <TableRow><TableCell colSpan={6}><div className="org-empty"><Users/><strong>{members.length ? '当前范围内没有匹配成员' : '企业暂无成员'}</strong><p>{organization ? '成员未登记到该组织时，可在“未分配部门”查看。' : '调整筛选条件，或切换左侧成员范围。'}</p><Button variant="outline" size="sm" onClick={reset}>重置筛选</Button></div></TableCell></TableRow>}
      </TableBody></Table>
      <FilterPagination total={filtered.length} page={current} size={size} onPageChange={setPage} onSizeChange={value => { setSize(value); setPage(1); }}/>
    </section>
  </div>
    {inspect && <Modal drawer title="成员详情" description={`${tenant.name} · ${inspectUser?.name || inspect.name}`} close={() => setInspectId(null)}><div className="ent-result"><div className="org-profile"><span className="org-avatar">{(inspectUser?.name || inspect.name).slice(-2)}</span><div><strong>{inspectUser?.name || inspect.name}</strong><p>{inspectUser?.login || inspect.userId}</p></div></div><dl className="org-detail">{[['成员 ID', inspect.id], ['登录身份 ID', inspect.userId], ['手机号码', inspectUser?.phone || '未填写'], ['主部门', pathFor(inspect)], ['企业角色', inspect.role], ['项目范围', projectScope(inspect)], ['登录身份状态', inspectUser ? <Status value={inspectUser.status}/> : '身份不存在'], ['账号初始化', inspectUser?.initialized ? '已完成' : '待初始化'], ['本企业成员状态', <Status value={inspect.status}/>]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></div><div className="ent-modal-footer"><Button variant="outline" onClick={() => setInspectId(null)}>关闭</Button></div></Modal>}
  </div>;
}
