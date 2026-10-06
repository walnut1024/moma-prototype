import { parseDelimitedCells } from './tabular-import.mjs';
import { changeOrganization, departmentPath, memberPhoneError, normalizeMemberPhone, platformAccounts } from "./organization-data.mjs";

export const MEMBER_IMPORT_HEADERS = ["姓名", "手机号", "账号/邮箱", "主部门"];
export const MEMBER_IMPORT_LIMIT = 500;

export const parseMemberText = text => memberRowsFromCells(parseDelimitedCells(text));

export function memberRowsFromCells(cells) {
  const rows = cells.map(row => row.map(value => String(value ?? "").trim())).filter(row => row.some(Boolean));
  if (rows[0]?.includes("手机号")) {
    if (MEMBER_IMPORT_HEADERS.some((header, i) => rows[0][i] !== header)) throw new Error("表头不匹配，请使用最新模板：姓名、手机号、账号/邮箱、主部门");
    if (rows[0][4] === "处理结果" && rows[0].length === 5) rows.forEach(row => row.splice(4));
    rows.shift();
  }
  if (!rows.length) throw new Error("没有可导入的成员，请填写至少一条记录");
  if (rows.length > MEMBER_IMPORT_LIMIT) throw new Error(`每批最多 ${MEMBER_IMPORT_LIMIT} 条，请拆分后导入`);
  if (rows.some(row => row.length > 4)) throw new Error("列数超过模板范围，请按姓名、手机号、账号/邮箱、主部门四列填写");
  return rows.map(([name = "", phone = "", account = "", department = ""], index) => ({ key: `row-${index}`, name, phone, account, department }));
}

export function validateMemberRows(state, rows, mode, defaultDepartment) {
  const seenPhones = new Set(), seenAccounts = new Set();
  return rows.map((row, index) => {
    const phone = normalizeMemberPhone(row.phone), rawAccount = row.account.trim().toLowerCase();
    const account = normalizeMemberPhone(rawAccount) === phone && mode === "invite" ? "" : rawAccount;
    const issues = [];
    const phoneIssue = memberPhoneError(phone);
    if (phoneIssue) issues.push(phoneIssue);
    const identity = mode === "existing" ? platformAccounts.find(a => account ? a.account.toLowerCase() === account : phone && normalizeMemberPhone(a.phone) === phone) : null;
    if (mode === "existing" && !identity) issues.push("未找到平台账号，请核对账号或切换邀请新成员");
    if (identity?.phone && phone && normalizeMemberPhone(identity.phone) !== phone) issues.push("手机号与平台账号登记号码不一致");
    const name = identity?.name || row.name.trim();
    if (!name || name.length > 30) issues.push("姓名需为 1–30 个字符");
    if (mode === "invite" && account && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account)) issues.push("邮箱格式错误");
    let departmentId = defaultDepartment, departmentIssue = false;
    if (row.department.trim()) {
      const path = row.department.trim().replace(/\s*\/\s*/g, " / ");
      const matches = state.departments.filter(d => departmentPath(state.departments, d.id) === path || d.name === path || d.id === path);
      if (path === "未分配部门") departmentId = "unassigned";
      else if (matches.length !== 1) { departmentIssue = true; issues.push(matches.length ? "部门重名，请填写完整部门路径" : "部门未匹配，请选择已有部门"); }
      else departmentId = matches[0].id;
    }
    if (departmentId !== "unassigned" && !state.departments.some(d => d.id === departmentId)) { departmentIssue = true; issues.push("默认部门不存在，请重新选择"); }
    const finalAccount = identity?.account || account || phone;
    const existing = state.members.find(m => (phone && normalizeMemberPhone(m.phone) === phone) || (finalAccount && m.account.toLowerCase() === finalAccount.toLowerCase()));
    const duplicate = existing ? existing.status === "待加入" ? "已存在待加入邀请" : "已是企业成员" : (phone && seenPhones.has(phone)) || (finalAccount && seenAccounts.has(finalAccount.toLowerCase())) ? "批次内重复" : "";
    if (phone) seenPhones.add(phone);
    if (finalAccount) seenAccounts.add(finalAccount.toLowerCase());
    return { ...row, rowNumber: index + 1, phone, name, account: finalAccount, departmentId, departmentIssue, status: issues.length ? "error" : duplicate ? "duplicate" : "ready", message: issues.join("；") || duplicate || "可添加" };
  });
}

// Revalidate against the latest state at submission, then save each valid row once.
export function applyMemberBatch(state, rows, mode, defaultDepartment, createId, stamp) {
  let next = state;
  const results = validateMemberRows(state, rows, mode, defaultDepartment).map(row => {
    if (row.status !== "ready") return { ...row, status: "skipped" };
    try {
      next = changeOrganization(next, { type: "member.save", logId: createId(), member: {
        id: `m-${createId()}`, name: row.name, phone: row.phone, account: row.account, departmentId: row.departmentId,
        role: "普通成员", status: mode === "invite" ? "待加入" : "已加入", source: mode === "invite" ? "邀请加入" : "平台账号",
      } }, stamp);
      return { ...row, status: "success", message: mode === "invite" ? "邀请已创建 · 待加入" : "已加入企业" };
    } catch (error) { return { ...row, status: "failed", message: error.message }; }
  });
  return { state: next, results };
}

export function memberCsv(rows) {
  // Guard spreadsheet formula execution in downloaded member-supplied cells.
  return "\uFEFF" + rows.map(row => row.map(value => {
    const cell = String(value ?? "");
    return '"' + (/^[=+@-]/.test(cell) ? "'" : "") + cell.replaceAll('"', '""') + '"';
  }).join(",")).join("\r\n");
}
