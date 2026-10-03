import { useEffect, useState } from "react";
import { Building2, ChevronDown, ChevronRight, Folder, FolderPlus, History, MoreHorizontal, Search, ShieldCheck, UserPlus, Users } from "lucide-react";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Textarea } from "./components/ui/textarea";
import { Checkbox } from "./components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./components/ui/dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "./components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "./components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./components/ui/table";
import { ORGANIZATION_STORAGE_KEY, changeOrganization, createOrganization, departmentPath, descendantIds, platformAccounts, roles, statuses } from "./organization-data.mjs";
import "./organization-members.css";

function Choice({ label, value, onChange, options, disabled = false }) {
  return <label className="org-field"><span>{label}</span><Select value={value} onValueChange={onChange} disabled={disabled}>
    <SelectTrigger aria-label={label}><SelectValue /></SelectTrigger>
    <SelectContent position="popper"><SelectGroup>{options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectGroup></SelectContent>
  </Select></label>;
}

function RoleFields({ form, setForm, departments }) {
  return <>
    <Choice label="管理角色" value={form.role} onChange={role => setForm({ ...form, role, scopeId: form.scopeId || (form.departmentId !== "unassigned" ? form.departmentId : "root") })} options={roles.map(role => ({ value: role, label: role }))} />
    <p className="org-hint">{({ 企业管理员: "管理企业全部部门、成员及平台配置。", 部门管理员: "在指定部门范围内管理组织与成员。", 普通成员: "使用已授权的项目与模型服务。", 财务审计: "查看企业用量与费用，不管理组织及成员。" })[form.role]}</p>
    {form.role === "部门管理员" && <>
      <Choice label="管理范围" value={form.scopeId || "root"} onChange={scopeId => setForm({ ...form, scopeId })} options={departments.map(d => ({ value: d.id, label: departmentPath(departments, d.id) }))} />
      <label className="org-check"><Checkbox checked={!!form.includeChildren} onCheckedChange={includeChildren => setForm({ ...form, includeChildren: !!includeChildren })} />包含该部门的子部门</label>
      <p className="org-hint">主部门用于组织归属；管理范围单独配置，移动主部门不会自动改变管理范围。</p>
    </>}
  </>;
}

export default function OrganizationMembers() {
  const [data, setData] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(ORGANIZATION_STORAGE_KEY));
      if (saved?.departments?.length && Array.isArray(saved.members) && Array.isArray(saved.audit)) return saved;
    } catch { /* Browser preview can start without saved data. */ }
    return createOrganization();
  });
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    try { localStorage.setItem(ORGANIZATION_STORAGE_KEY, JSON.stringify(data)); setStorageError(false); }
    catch { setStorageError(true); }
  }, [data]);
  const [selectedDepartment, setSelectedDepartment] = useState("all");
  const [treeQuery, setTreeQuery] = useState("");
  const [collapsed, setCollapsed] = useState([]);
  const [includeChildren, setIncludeChildren] = useState(true);
  const [filters, setFilters] = useState({ query: "", role: "all", status: "all" });
  const [applied, setApplied] = useState(filters);
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [inviteMode, setInviteMode] = useState("existing");
  const { departments, members } = data;
  const department = departments.find(d => d.id === selectedDepartment);
  const title = department?.name || (selectedDepartment === "unassigned" ? "未分配部门" : "全部成员");
  const scopedIds = includeChildren ? descendantIds(departments, selectedDepartment) : new Set([selectedDepartment]);
  const scopedMembers = members.filter(m => selectedDepartment === "all" || scopedIds.has(m.departmentId));
  const filtered = scopedMembers.filter(m =>
    (!applied.query || `${m.name} ${m.account}`.toLowerCase().includes(applied.query.trim().toLowerCase())) &&
    (applied.role === "all" || m.role === applied.role) && (applied.status === "all" || m.status === applied.status));
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const checked = members.filter(m => selectedMembers.includes(m.id));
  const departmentOptions = [{ value: "unassigned", label: "未分配部门" }, ...departments.map(d => ({ value: d.id, label: departmentPath(departments, d.id) }))];
  const selectDepartment = id => { setSelectedDepartment(id); setSelectedMembers([]); setPage(1); };
  const open = (nextModal, nextForm = {}) => { setModal(nextModal); setForm(nextForm); setError(""); };
  const close = () => { setModal(null); setError(""); };
  const commit = (action, success) => {
    try {
      setData(changeOrganization(data, { ...action, logId: crypto.randomUUID() }));
      setSelectedMembers([]); setNotice(success); close(); return true;
    } catch (e) { setError(e.message); return false; }
  };
  const newDepartment = parentId => open({ type: "department", title: "新建部门" }, { id: `d-${crypto.randomUUID()}`, name: "", parentId: parentId || department?.id || "root", ownerId: "none", description: "", grantAdmin: false });
  const editDepartment = d => open({ type: "department", title: "部门设置" }, { ...d, ownerId: d.ownerId || "none", grantAdmin: false });
  const addMember = () => {
    setInviteMode("existing");
    open({ type: "member", title: "添加成员", isNew: true }, { id: `m-${crypto.randomUUID()}`, name: "", account: "", departmentId: department?.id || "unassigned", role: "普通成员", scopeId: department?.id || "root", includeChildren: true, status: "已加入", source: "平台账号" });
  };
  const confirm = (title, description, action, success) => open({ type: "confirm", title, description, action, success });
  const move = ids => open({ type: "move", title: "移动部门", ids }, { departmentId: "unassigned" });
  const roleScope = m => m.role === "部门管理员" ? `${departmentPath(departments, m.scopeId)}${m.includeChildren ? "（含子部门）" : "（仅本部门）"}` : m.role === "普通成员" ? "按项目授权" : "全企业";
  const submit = e => {
    e.preventDefault();
    if (modal.type === "department") {
      const { grantAdmin, ...draft } = form;
      if (commit({ type: "department.save", department: { ...draft, ownerId: draft.ownerId === "none" ? null : draft.ownerId }, grantAdmin }, "部门已保存")) selectDepartment(draft.id);
    } else if (modal.type === "member") {
      commit({ type: "member.save", member: { ...form, status: modal.isNew ? inviteMode === "invite" ? "待加入" : "已加入" : form.status, source: modal.isNew ? inviteMode === "invite" ? "邀请加入" : "平台账号" : form.source } }, modal.isNew && inviteMode === "invite" ? "已创建模拟邀请，可在成员菜单中模拟接受邀请" : "成员信息已保存");
    } else if (modal.type === "move") commit({ type: "member.move", ids: modal.ids, departmentId: form.departmentId }, "成员主部门已更新，管理范围保持原设置");
  };
  const tree = (id, depth = 0) => {
    const node = departments.find(d => d.id === id);
    const children = departments.filter(d => d.parentId === id);
    const ids = descendantIds(departments, id);
    if (treeQuery && !departments.some(d => ids.has(d.id) && d.name.includes(treeQuery.trim()))) return null;
    const expanded = treeQuery || !collapsed.includes(id);
    const count = members.filter(m => ids.has(m.departmentId)).length;
    return <div key={id}>
      <div className={`org-tree-row ${selectedDepartment === id ? "is-selected" : ""}`} style={{ paddingLeft: 8 + depth * 16 }}>
        <Button variant="ghost" size="icon-xs" className={children.length ? "org-expand" : "org-expand invisible"} aria-label={`${expanded ? "收起" : "展开"}${node.name}`} aria-expanded={!!expanded} onClick={() => setCollapsed(collapsed.includes(id) ? collapsed.filter(i => i !== id) : [...collapsed, id])}>{expanded ? <ChevronDown /> : <ChevronRight />}</Button>
        <button className="org-tree-select" onClick={() => selectDepartment(id)} title={departmentPath(departments, id)}>{id === "root" ? <Building2 /> : <Folder />}<span>{node.name}</span><small>{count}</small></button>
        {id !== "root" && <Popover><PopoverTrigger asChild><Button size="icon-xs" variant="ghost" aria-label={`${node.name}操作`} className="org-tree-more"><MoreHorizontal /></Button></PopoverTrigger><PopoverContent className="org-menu" align="start"><Button variant="ghost" onClick={() => newDepartment(id)}>新建子部门</Button><Button variant="ghost" onClick={() => editDepartment(node)}>部门设置</Button></PopoverContent></Popover>}
      </div>
      {expanded && children.map(child => tree(child.id, depth + 1))}
    </div>;
  };

  return <div className="org-page">
    <div className="org-page-head"><div><h1>组织及成员</h1><p>维护企业组织架构、成员归属与管理权限</p></div><Button variant="outline" onClick={() => open({ type: "audit", title: "操作记录" })}><History data-icon="inline-start" />操作记录</Button></div>
    <div className="org-demo-note"><span>本地演示</span>组织与成员数据保存在当前浏览器；邀请、角色授权和停用均为模拟操作。{storageError && <strong> 浏览器存储不可用，本次修改无法持久保存。</strong>}</div>
    {notice && <div className="org-notice" role="status">{notice}<Button variant="ghost" size="xs" onClick={() => setNotice("")}>关闭</Button></div>}
    <div className="org-workspace">
      <aside className="org-directory" aria-label="部门导航">
        <div className="org-company"><span><Building2 /></span><div><strong>{departments[0].name}</strong><small>{departments.length - 1} 个部门 · {members.length} 位成员</small></div></div>
        <div className="org-tree-tools"><div className="org-search"><Search /><Input aria-label="搜索部门" placeholder="搜索部门" value={treeQuery} onChange={e => setTreeQuery(e.target.value)} /></div><Button variant="outline" onClick={() => newDepartment()}><FolderPlus data-icon="inline-start" />新建部门</Button></div>
        <button className={`org-directory-view ${selectedDepartment === "all" ? "is-selected" : ""}`} onClick={() => selectDepartment("all")}><Users /><span>全部成员</span><small>{members.length}</small></button>
        <button className={`org-directory-view ${selectedDepartment === "unassigned" ? "is-selected" : ""}`} onClick={() => selectDepartment("unassigned")}><Users /><span>未分配部门</span><small>{members.filter(m => m.departmentId === "unassigned").length}</small></button>
        <div className="org-tree-heading">组织架构 <span>人数含子部门及待加入成员</span></div>
        <div className="org-tree">{tree("root")}{treeQuery && !departments.some(d => d.name.includes(treeQuery.trim())) && <p className="org-hint">未找到匹配部门</p>}</div>
      </aside>
      <section className="org-members-panel" aria-label="成员列表">
        <div className="org-department-head"><div className="org-department-icon">{department ? <Folder /> : <Users />}</div><div className="org-department-info"><h2>{title}</h2><p>{department ? departmentPath(departments, department.id) : selectedDepartment === "all" ? "查看企业内所有部门及未分配部门的成员" : "已加入企业，尚未设置主部门的成员"}</p><small>{department && <>负责人：{members.find(m => m.id === department.ownerId)?.name || "未设置"}<i /> </>}已加入 {scopedMembers.filter(m => m.status === "已加入").length} 人 <i />待加入 {scopedMembers.filter(m => m.status === "待加入").length} 人 <i />已停用 {scopedMembers.filter(m => m.status === "已停用").length} 人</small></div>{department && department.id !== "root" && <Button variant="outline" onClick={() => editDepartment(department)}>部门设置</Button>}</div>
        <form className="org-filters" onSubmit={e => { e.preventDefault(); setApplied(filters); setPage(1); setSelectedMembers([]); }}>
          <div className="org-search"><Search /><Input aria-label="搜索成员" placeholder="姓名或登录账号" value={filters.query} onChange={e => setFilters({ ...filters, query: e.target.value })} /></div>
          <Choice label="成员状态" value={filters.status} onChange={status => setFilters({ ...filters, status })} options={[{ value: "all", label: "全部状态" }, ...statuses.map(s => ({ value: s, label: s }))]} />
          <Choice label="管理角色筛选" value={filters.role} onChange={role => setFilters({ ...filters, role })} options={[{ value: "all", label: "全部角色" }, ...roles.map(r => ({ value: r, label: r }))]} />
          <Button type="submit" variant="outline">查询</Button><Button type="button" variant="ghost" onClick={() => { const reset = { query: "", status: "all", role: "all" }; setFilters(reset); setApplied(reset); setPage(1); setSelectedMembers([]); }}>重置</Button>
        </form>
        <div className="org-member-tools"><div><Button onClick={addMember}><UserPlus data-icon="inline-start" />添加成员</Button><Button variant="outline" disabled={!checked.length} onClick={() => move(selectedMembers)}>移动部门</Button><Button variant="outline" disabled={!checked.length || checked.some(m => m.status !== "已加入")} onClick={() => confirm("批量停用成员", `停用所选 ${checked.length} 位成员？成员归属与历史操作记录会保留。`, { type: "member.status", ids: selectedMembers, status: "已停用" }, "所选成员已停用")}>批量停用</Button><small>{checked.length ? `已选择 ${checked.length} 人` : `共 ${filtered.length} 人`}</small></div>{department && <label className="org-check"><Checkbox checked={includeChildren} onCheckedChange={value => { setIncludeChildren(!!value); setSelectedMembers([]); setPage(1); }} />包含子部门成员</label>}</div>
        <Table className="org-member-table"><TableHeader><TableRow><TableHead><Checkbox aria-label="选择当前页全部成员" checked={visible.length > 0 && visible.every(m => selectedMembers.includes(m.id)) ? true : visible.some(m => selectedMembers.includes(m.id)) ? "indeterminate" : false} disabled={!visible.length} onCheckedChange={value => setSelectedMembers(value ? [...new Set([...selectedMembers, ...visible.map(m => m.id)])] : selectedMembers.filter(id => !visible.some(m => m.id === id)))} /></TableHead>{["成员", "登录账号", "主部门", "管理角色", "状态", "操作"].map(label => <TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader>
          <TableBody>{visible.map(m => <TableRow key={m.id} data-state={selectedMembers.includes(m.id) ? "selected" : undefined}>
            <TableCell><Checkbox aria-label={`选择${m.name}`} checked={selectedMembers.includes(m.id)} onCheckedChange={value => setSelectedMembers(value ? [...selectedMembers, m.id] : selectedMembers.filter(id => id !== m.id))} /></TableCell>
            <TableCell><button className="org-member-name" onClick={() => open({ type: "detail", title: "成员详情", member: m })}><span className="org-avatar">{m.name.slice(-2)}</span><span>{m.name}{m.id === "m1" && <small>当前账号</small>}</span></button></TableCell>
            <TableCell className="org-account">{m.account}</TableCell>
            <TableCell title={departmentPath(departments, m.departmentId)}>{departments.find(d => d.id === m.departmentId)?.name || "未分配部门"}</TableCell>
            <TableCell><span className="org-role">{m.role !== "普通成员" && <ShieldCheck />}{m.role}</span>{m.role === "部门管理员" && <small className="org-cell-sub" title={roleScope(m)}>{departments.find(d => d.id === m.scopeId)?.name}{m.includeChildren ? " · 含子部门" : " · 仅本部门"}</small>}</TableCell>
            <TableCell><span className={`org-status ${m.status === "已加入" ? "joined" : m.status === "待加入" ? "pending" : "disabled"}`}>{m.status}</span></TableCell>
            <TableCell><div className="org-row-actions"><Button variant="link" size="xs" onClick={() => open({ type: "member", title: "编辑成员" }, { ...m })}>编辑</Button><Popover><PopoverTrigger asChild><Button size="icon-xs" variant="ghost" aria-label={`${m.name}更多操作`}><MoreHorizontal /></Button></PopoverTrigger><PopoverContent className="org-menu" align="end"><Button variant="ghost" onClick={() => open({ type: "detail", title: "成员详情", member: m })}>成员详情</Button><Button variant="ghost" onClick={() => move([m.id])}>移动部门</Button>{m.status === "待加入" ? <><Button variant="ghost" onClick={() => confirm("重新邀请", `为 ${m.name} 更新模拟邀请记录？此原型不会发送邮件。`, { type: "member.reinvite", ids: [m.id] }, "已更新模拟邀请记录")}>重新邀请</Button><Button variant="ghost" onClick={() => confirm("模拟接受邀请", `模拟 ${m.name} 接受邀请并加入企业？`, { type: "member.accept", ids: [m.id] }, "成员已模拟加入企业")}>模拟接受邀请</Button></> : <Button variant="ghost" onClick={() => confirm(m.status === "已停用" ? "恢复成员" : "停用成员", `${m.status === "已停用" ? "恢复" : "停用"} ${m.name}？成员归属和历史记录会保留。`, { type: "member.status", ids: [m.id], status: m.status === "已停用" ? "已加入" : "已停用" }, m.status === "已停用" ? "成员已恢复" : "成员已停用")}>{m.status === "已停用" ? "恢复成员" : "停用成员"}</Button>}<Button variant="ghost" className="org-danger" onClick={() => confirm(m.status === "待加入" ? "撤销邀请" : "移除成员", `${m.status === "待加入" ? "撤销" : "移除"} ${m.name} 的企业成员关系？操作记录会保留，平台账号不会被删除。`, { type: "member.remove", ids: [m.id] }, m.status === "待加入" ? "邀请已撤销" : "成员已移除")}>{m.status === "待加入" ? "撤销邀请" : "移除成员"}</Button></PopoverContent></Popover></div></TableCell>
          </TableRow>)}{!visible.length && <TableRow><TableCell colSpan={7}><div className="org-empty"><Users /><strong>{members.length ? "当前范围内没有匹配成员" : "企业暂无成员"}</strong><p>调整筛选条件，或添加成员到当前部门。</p><Button variant="outline" onClick={addMember}>添加成员</Button></div></TableCell></TableRow>}</TableBody>
        </Table>
        <div className="org-pagination"><small>共 {filtered.length} 人 · 第 {currentPage} / {pageCount} 页</small><div><Choice label="每页人数" value={String(pageSize)} onChange={value => { setPageSize(Number(value)); setPage(1); setSelectedMembers([]); }} options={[10, 20, 50].map(size => ({ value: String(size), label: `${size} 人 / 页` }))} /><Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>上一页</Button><Button variant="outline" size="sm" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>下一页</Button></div></div>
      </section>
    </div>
    <Dialog open={!!modal} onOpenChange={value => { if (!value) close(); }}><DialogContent className={`org-dialog ${modal?.type === "confirm" ? "org-confirm" : "org-drawer"}`}>
      <DialogHeader><DialogTitle>{modal?.title}</DialogTitle><DialogDescription>{modal?.type === "confirm" ? modal.description : modal?.type === "audit" ? "记录当前浏览器中的组织及成员操作，最多保留最近 200 条。" : "示例企业 · 组织及成员"}</DialogDescription></DialogHeader>
      <div className="org-dialog-body">
        {modal?.type === "department" && <form id="org-edit-form" onSubmit={submit} className="org-form">
          <label className="org-field"><span>部门名称 <b>*</b></span><Input aria-label="部门名称" placeholder="输入部门名称" maxLength={30} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></label>
          <Choice label="上级部门" value={form.parentId} onChange={parentId => setForm({ ...form, parentId })} options={departments.filter(d => !descendantIds(departments, form.id).has(d.id)).map(d => ({ value: d.id, label: departmentPath(departments, d.id) }))} />
          <Choice label="部门负责人" value={form.ownerId} onChange={ownerId => setForm({ ...form, ownerId, grantAdmin: false })} options={[{ value: "none", label: "暂不设置" }, ...members.filter(m => m.status === "已加入").map(m => ({ value: m.id, label: `${m.name} · ${m.account}` }))]} />
          <label className="org-check"><Checkbox disabled={form.ownerId === "none"} checked={!!form.grantAdmin} onCheckedChange={value => setForm({ ...form, grantAdmin: !!value })} />同时授权负责人为部门管理员</label><p className="org-hint">负责人是业务归属；勾选后授予该部门及子部门的管理范围。已有企业管理员保留企业角色。</p>
          <label className="org-field"><span>部门描述</span><Textarea aria-label="部门描述" placeholder="说明部门职责（选填）" maxLength={200} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></label>
          {departments.some(d => d.id === form.id) && <div className="org-delete-department"><p>删除部门前，请先迁移成员、处理子部门及相关管理范围。</p><Button type="button" variant="destructive" onClick={() => confirm("删除部门", `删除“${form.name}”？包含子部门或成员时无法删除。`, { type: "department.remove", id: form.id }, "部门已删除")}>删除部门</Button></div>}
        </form>}
        {modal?.type === "member" && <form id="org-edit-form" onSubmit={submit} className="org-form">
          {modal.isNew && <Tabs value={inviteMode} onValueChange={value => { setInviteMode(value); setForm({ ...form, name: "", account: "" }); setError(""); }}><TabsList><TabsTrigger value="existing">已有平台账号</TabsTrigger><TabsTrigger value="invite">邀请新成员</TabsTrigger></TabsList></Tabs>}
          {modal.isNew && inviteMode === "existing" ? <><Choice label="选择平台账号" value={form.account || "none"} onChange={account => { const identity = platformAccounts.find(a => a.account === account); if (identity) setForm({ ...form, ...identity }); }} options={[{ value: "none", label: "请选择已有平台账号" }, ...platformAccounts.filter(a => !members.some(m => m.account === a.account)).map(a => ({ value: a.account, label: `${a.name} · ${a.account}` }))]} /><p className="org-hint">此处提供独立的演示账号，选择后直接加入企业。</p></> : <><label className="org-field"><span>成员姓名 <b>*</b></span><Input aria-label="成员姓名" value={form.name} maxLength={30} required onChange={e => setForm({ ...form, name: e.target.value })} placeholder="输入成员姓名" /></label><label className="org-field"><span>登录账号 <b>*</b></span><Input aria-label="登录账号" type={modal.isNew ? "email" : "text"} value={form.account} required readOnly={!modal.isNew} onChange={e => setForm({ ...form, account: e.target.value })} placeholder="成员邮箱" /></label>{modal.isNew && <p className="org-hint">创建后为“待加入”，可在列表中模拟接受邀请；不会发送实际邮件。</p>}</>}
          <Choice label="主部门" value={form.departmentId} onChange={departmentId => setForm({ ...form, departmentId })} options={departmentOptions} />
          <RoleFields form={form} setForm={setForm} departments={departments} />
        </form>}
        {modal?.type === "move" && <form id="org-edit-form" onSubmit={submit} className="org-form"><p>将 {members.filter(m => modal.ids.includes(m.id)).map(m => m.name).join("、")} 的主部门调整为：</p><Choice label="目标部门" value={form.departmentId} onChange={departmentId => setForm({ ...form, departmentId })} options={departmentOptions} /><p className="org-hint">管理角色与管理范围保持不变。此操作会保留操作记录。</p></form>}
        {modal?.type === "detail" && <><div className="org-profile"><span className="org-avatar">{modal.member.name.slice(-2)}</span><div><strong>{modal.member.name}</strong><p>{modal.member.account}</p></div></div><dl className="org-detail">{[["成员 ID", modal.member.id], ["主部门", departmentPath(departments, modal.member.departmentId)], ["管理角色", modal.member.role], ["管理范围", roleScope(modal.member)], ["成员状态", modal.member.status], ["成员来源", modal.member.source], ["邀请时间", modal.member.invitedAt], ["加入时间", modal.member.joinedAt || "尚未加入"]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></>}
        {modal?.type === "audit" && <div className="org-audit">{data.audit.length ? data.audit.map(record => <article key={record.id}><small>{record.time} · {record.actor}</small><p>{record.description}</p></article>) : <div className="org-empty"><History /><strong>暂无操作记录</strong><p>新建部门、成员调整等操作会记录在这里。</p></div>}</div>}
      </div>
      {error && <p className="org-form-error" role="alert">{error}</p>}
      <DialogFooter>{modal?.type === "detail" ? <Button onClick={() => open({ type: "member", title: "编辑成员" }, { ...modal.member })}>编辑成员</Button> : modal?.type === "audit" ? <Button variant="outline" onClick={close}>关闭</Button> : <><Button variant="outline" onClick={close}>取消</Button>{modal?.type === "confirm" ? <Button variant={["删除部门", "移除成员", "撤销邀请", "停用成员", "批量停用成员"].includes(modal.title) ? "destructive" : "default"} onClick={() => { const removed = modal.action.type === "department.remove"; if (commit(modal.action, modal.success) && removed) selectDepartment("all"); }}>确认</Button> : <Button type="submit" form="org-edit-form">{modal?.isNew && inviteMode === "invite" ? "创建模拟邀请" : "保存"}</Button>}</>}</DialogFooter>
    </DialogContent></Dialog>
  </div>;
}
