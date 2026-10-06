import test from "node:test";
import assert from "node:assert/strict";
import { changeOrganization, createOrganization, normalizeMemberPhone, maskMemberPhone, displayMemberAccount } from "../src/organization-data.mjs";
import { parseMemberText, memberRowsFromCells, validateMemberRows, applyMemberBatch, memberCsv } from "../src/organization-import.mjs";

const row = (extra = {}) => ({ key: "one", name: "新成员", phone: "13700000101", account: "", department: "", ...extra });
const save = (state, member) => changeOrganization(state, { type: "member.save", logId: "log", member });
const member = { ...row(), id: "new", departmentId: "research", role: "普通成员", status: "待加入" };

test("phone is required on creation and edit, normalized and unique across all member states", () => {
  const state = createOrganization();
  assert.throws(() => save(state, { ...member, phone: "" }), /填写手机号/);
  assert.throws(() => save(state, { ...state.members[0], phone: "" }), /填写手机号/);
  assert.throws(() => save(state, { ...member, phone: "12345" }), /格式错误/);
  assert.throws(() => save(state, { ...member, phone: "+8612345678901" }), /格式错误/);
  assert.throws(() => save(state, { ...member, account: "linyu@example.com", source: "平台账号" }), /登记号码不一致/);
  assert.throws(() => save(state, { ...member, phone: "+86 " + state.members[7].phone }), /手机号已在企业/);
  const updated = save(state, { ...member, phone: "+86 137-0000-0101" });
  assert.equal(updated.members.at(-1).phone, "13700000101");
  assert.equal(updated.members.at(-1).account, "13700000101");
  assert.equal(normalizeMemberPhone("+1 (202) 555-0199"), "+12025550199");
  assert.equal(maskMemberPhone("13700000101"), "137****0101");
  assert.equal(save(updated, { ...updated.members.at(-1), phone: "13700000102" }).members.at(-1).id, "new");
  const changed = save(updated, { ...updated.members.at(-1), phone: "13700000102" }).members.at(-1);
  assert.equal(displayMemberAccount(changed.account), "137****0101");
});

test("CSV and Excel pasted cells preserve quoted fields and reject malformed or oversize input", () => {
  assert.equal(parseMemberText('\uFEFF姓名,手机号,账号/邮箱,主部门\r\n"李,明",13700000101,,研发中心')[0].name, "李,明");
  assert.equal(parseMemberText('姓名\t手机号\t账号/邮箱\t主部门\n李明\t13700000101\t\t算法部')[0].department, "算法部");
  assert.throws(() => parseMemberText('"李明,13700000101'), /引号未闭合/);
  assert.throws(() => memberRowsFromCells([["姓名", "手机号", "主部门"]]), /表头/);
  assert.throws(() => memberRowsFromCells(Array.from({ length: 501 }, () => ["成员", "13700000101"])), /最多/);
  assert.match(memberCsv([["=1+1", 'a"b']]), /'=1\+1/);
});

test("review distinguishes invalid phones, duplicate invitations and full department paths", () => {
  const state = createOrganization();
  const review = validateMemberRows(state, [row(), row({ key: "two" }), row({ key: "three", phone: "", department: "待建部门" }), row({ key: "four", phone: state.members[7].phone })], "invite", "research");
  assert.deepEqual(review.map(r => r.status), ["ready", "duplicate", "error", "duplicate"]);
  assert.match(review[2].message, /手机号.*部门未匹配/);
  assert.equal(review[2].departmentIssue, true);
  assert.equal(validateMemberRows(state, [row({ department: "未分配部门" })], "invite", "research")[0].departmentIssue, false);
  assert.match(review[3].message, /待加入邀请/);
  assert.equal(validateMemberRows(state, [row({ department: "云启科技有限公司/研发中心/算法部" })], "invite", "unassigned")[0].departmentId, "algorithm");
  const sameName = { ...state, departments: [...state.departments, { id: "other", name: "算法部", parentId: "product" }] };
  assert.match(validateMemberRows(sameName, [row({ department: "算法部" })], "invite", "unassigned")[0].message, /重名/);
});

test("existing identities cannot be provisioned implicitly or assigned conflicting phone numbers", () => {
  const state = createOrganization();
  const reviewed = validateMemberRows(state, [row({ name: "", phone: "13800000101", account: "linyu@example.com" }), row({ account: "missing@example.com" }), row({ account: "zhouran@example.com" })], "existing", "research");
  assert.equal(reviewed[0].name, "林雨"); assert.equal(reviewed[0].status, "ready");
  assert.match(reviewed[1].message, /未找到平台账号/);
  assert.match(reviewed[2].message, /登记号码不一致/);
});

test("batch submit revalidates, preserves existing roles, and retry cannot add duplicates", () => {
  let i = 0; const id = () => `id-${i++}`;
  const state = createOrganization();
  const rows = [row(), row({ key: "two", phone: state.members[0].phone }), row({ key: "three", phone: "" })];
  const first = applyMemberBatch(state, rows, "invite", "research", id, "2026-10-04 12:00:00");
  assert.deepEqual(first.results.map(r => r.status), ["success", "skipped", "skipped"]);
  assert.equal(first.state.members.length, state.members.length + 1);
  assert.equal(first.state.members[0].role, "企业管理员");
  assert.equal(first.state.members.at(-1).status, "待加入");
  const retry = applyMemberBatch(first.state, rows, "invite", "research", id);
  assert.equal(retry.state.members.length, first.state.members.length);
  assert.equal(retry.results.some(r => r.status === "success"), false);
  assert.equal(state.members.length, 17);
});

test("per-record failure leaves a useful retry result and keeps successful records", () => {
  let i = 0;
  const outcome = applyMemberBatch(createOrganization(), [row(), row({ key: "two", phone: "13700000102" })], "invite", "unassigned", () => { if (i++ === 0) throw new Error("保存失败"); return `id-${i}`; });
  assert.deepEqual(outcome.results.map(r => r.status), ["failed", "success"]);
  assert.equal(outcome.state.members.length, 18);
});
