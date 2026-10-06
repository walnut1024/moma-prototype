import test from 'node:test';
import assert from 'node:assert/strict';
import { enterpriseMemberView, enterpriseProjectDepartment } from '../src/admin-v2/enterprise-members.js';

const tenant = { id: 'a' };
const state = {
  organizations: [{ id: 'root', tenantId: 'a', parentId: null }, { id: 'research', tenantId: 'a', parentId: 'root' }, { id: 'other', tenantId: 'b', parentId: null }],
  users: [{ id: 'u1', name: '张敏', login: 'zhang' }, { id: 'u2', name: '李晨', login: 'li' }],
  memberships: [
    { id: 'm1', userId: 'u1', tenantId: 'a', role: '租户管理员', status: '正常' },
    { id: 'm2', userId: 'u2', tenantId: 'a', organizationId: 'research', role: '普通成员', status: '停用' },
    { id: 'm3', tenantId: 'b', organizationId: 'other', role: '企业管理员', status: '正常' },
    { id: 'm4', tenantId: 'a', organizationId: 'other', role: '普通成员', status: '正常' },
  ],
};

test('enterprise views exclude other enterprises and never infer a missing department', () => {
  const original = structuredClone(state);
  const view = enterpriseMemberView(state, tenant);
  assert.deepEqual(view.members.map(member => member.id), ['m1', 'm2', 'm4']);
  assert.deepEqual(view.organizations.map(org => org.id), ['root', 'research']);
  assert.equal(view.organizationFor(view.members[0]), undefined);
  assert.deepEqual(enterpriseMemberView(state, tenant, { selection: 'unassigned' }).filtered.map(member => member.id), ['m1', 'm4']);
  assert.deepEqual(enterpriseMemberView(state, tenant, { selection: 'other' }).filtered, []);
  assert.deepEqual(state, original);
});

test('organization scope includes descendants only when selected', () => {
  assert.deepEqual(enterpriseMemberView(state, tenant, { selection: 'root' }).filtered.map(member => member.id), ['m2']);
  assert.deepEqual(enterpriseMemberView(state, tenant, { selection: 'root', includeChildren: false }).filtered, []);
  assert.deepEqual(enterpriseMemberView(state, tenant, { selection: 'research' }).filtered.map(member => member.id), ['m2']);
});

test('administrator shortcuts and combined member filters keep their enterprise scope', () => {
  assert.deepEqual(enterpriseMemberView(state, tenant, { selection: 'admins' }).filtered.map(member => member.id), ['m1']);
  assert.deepEqual(enterpriseMemberView(state, tenant, { query: ' LI ', role: '普通成员', status: '停用' }).filtered.map(member => member.id), ['m2']);
  assert.deepEqual(enterpriseMemberView(state, tenant, { query: 'li', status: '正常' }).filtered, []);
});

test('project department uses its explicit same-enterprise association and full path', () => {
  const data = structuredClone(state);
  data.organizations[0].name = '企业A';
  data.organizations[1].name = '技术中心';
  data.organizations.push({ id: 'models', tenantId: 'a', parentId: 'research', name: '模型研发部' });
  const before = structuredClone(data);
  const project = { tenantId: 'a', ownerId: 'u2', organizationId: 'models' };
  assert.equal(enterpriseProjectDepartment(data, project), '企业A / 技术中心 / 模型研发部');
  assert.equal(enterpriseProjectDepartment(data, { ...project, organizationId: 'root' }), '企业A');
  assert.equal(enterpriseProjectDepartment(data, { tenantId: 'a', ownerId: 'u2' }), '未登记部门归属');
  for (const organizationId of ['other', 'missing']) {
    assert.equal(enterpriseProjectDepartment(data, { ...project, organizationId }), '部门归属异常');
  }
  assert.deepEqual(data, before);
});

test('invalid department ancestry cannot reveal another enterprise or a partial path', () => {
  for (const parentId of ['other', 'missing', 'research']) {
    const data = structuredClone(state);
    data.organizations[1] = { ...data.organizations[1], name: '技术中心', parentId };
    assert.equal(enterpriseProjectDepartment(data, { tenantId: 'a', organizationId: 'research' }), '部门归属异常');
  }
});
