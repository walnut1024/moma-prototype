import test from "node:test";
import assert from "node:assert/strict";
import { changeOrganization, createOrganization, departmentPath, descendantIds } from "../src/organization-data.mjs";

const act = (state, action) => changeOrganization(state, { ...action, logId: "test-log" }, "2026-10-03 10:00:00");
const department = { id: "new", name: "测试部", parentId: "research", ownerId: null, description: "测试" };

test("department descendants and member chargeback hierarchy stay distinct", () => {
  const state = createOrganization();
  assert.deepEqual([...descendantIds(state.departments, "research")], ["research", "algorithm", "application"]);
  assert.equal(departmentPath(state.departments, "algorithm"), "示例科技有限公司 / 研发中心 / 算法部");
  const updated = act(state, { type: "member.move", ids: ["m3", "m4"], departmentId: "product" });
  assert.equal(updated.members.find(m => m.id === "m3").departmentId, "product");
  assert.equal(updated.members.find(m => m.id === "m3").scopeId, "algorithm");
  assert.equal(state.members.find(m => m.id === "m3").departmentId, "algorithm");
});

test("reject a department cycle and sibling duplicate name", () => {
  const state = createOrganization();
  assert.throws(() => act(state, { type: "department.save", department: { ...state.departments[1], parentId: "algorithm" } }), /子部门/);
  assert.throws(() => act(state, { type: "department.save", department: { ...department, name: "算法部" } }), /同名/);
  assert.equal(act(state, { type: "department.save", department: { ...department, name: "算法部", parentId: "product" } }).departments.length, 8);
});

test("owner assignment only grants management when explicitly requested", () => {
  const state = createOrganization();
  const first = act(state, { type: "department.save", department: { ...department, ownerId: "m4" } });
  assert.equal(first.members.find(m => m.id === "m4").role, "普通成员");
  const second = act(state, { type: "department.save", department: { ...department, ownerId: "m4" }, grantAdmin: true });
  assert.equal(second.members.find(m => m.id === "m4").scopeId, "new");
  assert.equal(second.members.find(m => m.id === "m4").includeChildren, true);
  const admin = act(state, { type: "department.save", department: { ...department, ownerId: "m1" }, grantAdmin: true });
  assert.equal(admin.members.find(m => m.id === "m1").role, "企业管理员");
});

test("occupied departments and management scopes prevent deletion", () => {
  const state = createOrganization();
  assert.throws(() => act(state, { type: "department.remove", id: "research" }), /迁移/);
  const created = act(state, { type: "department.save", department });
  const empty = act(created, { type: "department.remove", id: "new" });
  assert.equal(empty.departments.some(d => d.id === "new"), false);
  const scoped = act(created, { type: "member.save", member: { ...created.members[3], role: "部门管理员", scopeId: "new", includeChildren: false } });
  assert.throws(() => act(scoped, { type: "department.remove", id: "new" }), /管理范围/);
});

test("keep one active enterprise admin and prevent self-removal", () => {
  const state = createOrganization();
  assert.throws(() => act(state, { type: "member.save", member: { ...state.members[0], role: "普通成员" } }), /至少保留/);
  assert.throws(() => act(state, { type: "member.status", ids: ["m1"], status: "已停用" }), /当前登录/);
  assert.throws(() => act(state, { type: "member.remove", ids: ["m1"] }), /当前登录/);
});

test("bulk suspension is atomic and owners require handover", () => {
  const state = createOrganization();
  assert.throws(() => act(state, { type: "member.status", ids: ["m3", "m4"], status: "已停用" }), /先交接/);
  assert.equal(state.members.find(m => m.id === "m4").status, "已加入");
  const stopped = act(state, { type: "member.status", ids: ["m4", "m5"], status: "已停用" });
  assert.equal(stopped.members.find(m => m.id === "m4").status, "已停用");
  const restored = act(stopped, { type: "member.status", ids: ["m4"], status: "已加入" });
  assert.equal(restored.audit.length, 2);
});

test("duplicate member accounts are case insensitive and management scope is required", () => {
  const state = createOrganization();
  assert.throws(() => act(state, { type: "member.save", member: { ...state.members[3], id: "new", account: "WANGNING@EXAMPLE.COM" } }), /已在企业/);
  assert.throws(() => act(state, { type: "member.save", member: { ...state.members[3], role: "部门管理员", scopeId: "unassigned" } }), /管理范围/);
  assert.throws(() => act(state, { type: "member.move", ids: ["m4"], departmentId: "missing" }), /不存在/);
});

test("invitation acceptance and cancellation preserve operation history", () => {
  const state = createOrganization();
  const invited = act(state, { type: "member.save", member: { id: "new", name: "新成员", account: "new@example.com", departmentId: "algorithm", role: "普通成员", status: "待加入", source: "邀请加入" } });
  assert.equal(invited.members.find(m => m.id === "new").joinedAt, null);
  const accepted = act(invited, { type: "member.accept", ids: ["new"] });
  assert.equal(accepted.members.find(m => m.id === "new").status, "已加入");
  assert.equal(accepted.members.find(m => m.id === "new").joinedAt, "2026-10-03 10:00:00");
  const removed = act(accepted, { type: "member.remove", ids: ["new"] });
  assert.equal(removed.members.some(m => m.id === "new"), false);
  assert.equal(removed.audit.length, 3);
  assert.equal(removed.audit[2].description.includes("邀请成员（模拟）"), true);
  assert.throws(() => act(state, { type: "member.status", ids: ["m8"], status: "已加入" }), /接受邀请/);
});
