export const ORGANIZATION_STORAGE_KEY = "moma-organization:moma_5.11.0_estack";
export const roles = ["企业管理员", "部门管理员", "普通成员", "财务审计"];
export const statuses = ["已加入", "待加入", "已停用"];
export const platformAccounts = [
  { name: "林雨", account: "linyu@example.com" },
  { name: "周然", account: "zhouran@example.com" },
  { name: "何川", account: "hechuan@example.com" },
];

export function createOrganization() {
  const departments = [
    { id: "root", name: "示例科技有限公司", parentId: null, ownerId: "m1", description: "企业组织" },
    { id: "research", name: "研发中心", parentId: "root", ownerId: "m2", description: "负责模型应用研发与技术平台建设" },
    { id: "algorithm", name: "算法部", parentId: "research", ownerId: "m3", description: "负责算法研究与模型评测" },
    { id: "application", name: "应用开发部", parentId: "research", ownerId: "m6", description: "负责业务应用开发" },
    { id: "product", name: "产品中心", parentId: "root", ownerId: "m10", description: "负责产品规划与设计" },
    { id: "operations", name: "运营部", parentId: "root", ownerId: "m13", description: "负责客户与业务运营" },
    { id: "finance", name: "财务部", parentId: "root", ownerId: "m15", description: "负责费用核对与审计" },
  ];
  const rows = [
    ["企业管理员", "estack-yy", "root", "企业管理员"],
    ["陈明", "chenming@example.com", "research", "部门管理员"],
    ["李晓", "lixiao@example.com", "algorithm", "部门管理员"],
    ["王宁", "wangning@example.com", "algorithm"],
    ["赵晨", "zhaochen@example.com", "algorithm"],
    ["刘洋", "liuyang@example.com", "application", "部门管理员"],
    ["孙悦", "sunyue@example.com", "application"],
    ["郑浩", "zhenghao@example.com", "application", "普通成员", "待加入"],
    ["吴昊", "wuhao@example.com", "application", "普通成员", "已停用"],
    ["周敏", "zhoumin@example.com", "product", "部门管理员"],
    ["徐佳", "xujia@example.com", "product"],
    ["胡卓", "huzhuo@example.com", "product", "普通成员", "待加入"],
    ["许安", "xuan@example.com", "operations", "部门管理员"],
    ["马琳", "malin@example.com", "operations"],
    ["林静", "linjing@example.com", "finance", "财务审计"],
    ["高远", "gaoyuan@example.com", "unassigned"],
    ["梁禾", "lianghe@example.com", "research"],
  ];
  return { departments, members: rows.map(([name, account, departmentId, role = "普通成员", status = "已加入"], i) => ({
    id: `m${i + 1}`, name, account, departmentId, role, status,
    scopeId: role === "部门管理员" ? departmentId : null, includeChildren: role === "部门管理员",
    source: "平台账号", joinedAt: status === "待加入" ? null : "2026-10-01 09:00", invitedAt: "2026-10-01 09:00",
  })), audit: [] };
}

export function descendantIds(departments, id) {
  const ids = new Set([id]);
  for (let changed = true; changed;) {
    changed = false;
    for (const department of departments) if (ids.has(department.parentId) && !ids.has(department.id)) {
      ids.add(department.id); changed = true;
    }
  }
  return ids;
}

export function departmentPath(departments, id) {
  if (id === "unassigned") return "未分配部门";
  const names = [], seen = new Set();
  let current = departments.find(d => d.id === id);
  while (current && !seen.has(current.id)) {
    names.unshift(current.name); seen.add(current.id);
    current = departments.find(d => d.id === current.parentId);
  }
  return names.join(" / ");
}

// Pure local-demo mutations. These do not provision accounts or enforce gateway permissions.
export function changeOrganization(state, action, stamp = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Shanghai", hour12: false })) {
  let departments = state.departments.map(d => ({ ...d }));
  let members = state.members.map(m => ({ ...m }));
  let description = "";
  const fail = message => { throw new Error(message); };
  const requireDepartment = id => id === "unassigned" || departments.some(d => d.id === id) || fail("部门不存在，请重新选择");
  if (action.type === "department.save") {
    const draft = { ...action.department, name: action.department.name.trim() };
    const existing = departments.find(d => d.id === draft.id);
    if (!draft.name || draft.name.length > 30) fail("部门名称需为 1–30 个字符");
    if (draft.id === "root") fail("企业根节点不能修改");
    if (!draft.parentId || draft.parentId === "unassigned") fail("请选择上级部门");
    requireDepartment(draft.parentId);
    if (descendantIds(departments, draft.id).has(draft.parentId)) fail("上级部门不能是当前部门或其子部门");
    if (departments.some(d => d.id !== draft.id && d.parentId === draft.parentId && d.name === draft.name)) fail("同一上级下已存在同名部门");
    if (draft.ownerId && !members.some(m => m.id === draft.ownerId && m.status === "已加入")) fail("负责人必须是已加入的成员");
    if (draft.description.length > 200) fail("部门描述不能超过 200 个字符");
    departments = existing ? departments.map(d => d.id === draft.id ? draft : d) : [...departments, draft];
    if (action.grantAdmin && draft.ownerId) members = members.map(m => m.id === draft.ownerId && m.role !== "企业管理员" ? { ...m, role: "部门管理员", scopeId: draft.id, includeChildren: true } : m);
    description = `${existing ? "编辑" : "新建"}部门：${draft.name}${action.grantAdmin && draft.ownerId ? "；授权负责人管理该部门及子部门" : ""}`;
  } else if (action.type === "department.remove") {
    const department = departments.find(d => d.id === action.id);
    if (!department || department.id === "root") fail("企业根节点不能删除");
    if (departments.some(d => d.parentId === action.id) || members.some(m => m.departmentId === action.id)) fail("请先迁移成员并删除子部门，再删除该部门");
    if (members.some(m => m.role === "部门管理员" && m.scopeId === action.id)) fail("该部门仍被用于管理范围，请先调整对应成员角色");
    departments = departments.filter(d => d.id !== action.id);
    description = `删除部门：${department.name}`;
  } else if (action.type === "member.save") {
    const draft = { ...action.member, name: action.member.name.trim(), account: action.member.account.trim().toLowerCase() };
    const existing = members.find(m => m.id === draft.id);
    if (!draft.name || draft.name.length > 30 || !draft.account) fail("请填写成员姓名及登录账号");
    if (!existing && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.account)) fail("请输入有效的邮箱账号");
    if (members.some(m => m.id !== draft.id && m.account.toLowerCase() === draft.account)) fail("该账号已在企业中，请直接调整现有成员");
    requireDepartment(draft.departmentId);
    if (!roles.includes(draft.role) || !statuses.includes(draft.status)) fail("成员角色或状态无效");
    if (draft.role === "部门管理员") {
      if (!draft.scopeId || draft.scopeId === "unassigned") fail("请设置部门管理员的管理范围");
      requireDepartment(draft.scopeId);
    } else { draft.scopeId = null; draft.includeChildren = false; }
    if (existing && draft.account !== existing.account.toLowerCase()) fail("登录账号不能在组织内修改");
    members = existing ? members.map(m => m.id === draft.id ? draft : m) : [...members, { ...draft, joinedAt: draft.status === "已加入" ? stamp : null, invitedAt: stamp }];
    description = `${existing ? "编辑成员" : draft.status === "待加入" ? "邀请成员（模拟）" : "添加已有账号"}：${draft.name}；${draft.role}；${departmentPath(departments, draft.departmentId)}`;
  } else {
    const targets = members.filter(m => action.ids?.includes(m.id));
    if (!targets.length || targets.length !== action.ids.length) fail("请选择有效成员");
    const targetIds = new Set(action.ids);
    if (action.type === "member.move") {
      requireDepartment(action.departmentId);
      members = members.map(m => targetIds.has(m.id) ? { ...m, departmentId: action.departmentId } : m);
      description = `移动成员：${targets.map(m => m.name).join("、")} → ${departmentPath(departments, action.departmentId)}`;
    } else if (action.type === "member.status") {
      if (!["已加入", "已停用"].includes(action.status) || targets.some(m => m.status === "待加入")) fail("待加入成员请先接受邀请或撤销邀请");
      if (targetIds.has("m1") && action.status === "已停用") fail("不能停用当前登录成员");
      members = members.map(m => targetIds.has(m.id) ? { ...m, status: action.status } : m);
      description = `${action.status === "已停用" ? "停用" : "恢复"}成员：${targets.map(m => m.name).join("、")}`;
    } else if (action.type === "member.remove") {
      if (targetIds.has("m1")) fail("不能移除当前登录成员");
      members = members.filter(m => !targetIds.has(m.id));
      description = `${targets.every(m => m.status === "待加入") ? "撤销邀请" : "移除成员"}：${targets.map(m => m.name).join("、")}`;
    } else if (action.type === "member.accept" || action.type === "member.reinvite") {
      if (targets.some(m => m.status !== "待加入")) fail("只能操作待加入成员的邀请");
      members = members.map(m => targetIds.has(m.id) ? action.type === "member.accept" ? { ...m, status: "已加入", joinedAt: stamp } : { ...m, invitedAt: stamp } : m);
      description = `${action.type === "member.accept" ? "模拟接受邀请" : "重新邀请（模拟）"}：${targets.map(m => m.name).join("、")}`;
    } else fail("不支持的操作");
  }
  if (!members.some(m => m.role === "企业管理员" && m.status === "已加入")) fail("企业至少保留一位已加入的企业管理员");
  if (departments.some(d => d.ownerId && !members.some(m => m.id === d.ownerId && m.status === "已加入"))) fail("该成员是部门负责人，请先交接负责人");
  return { departments, members, audit: [{ id: action.logId, time: stamp, actor: "estack-yy", description }, ...state.audit].slice(0, 200) };
}
