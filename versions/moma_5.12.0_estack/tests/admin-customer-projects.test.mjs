import assert from 'node:assert/strict';
import test from 'node:test';
import { customerKeys, customerModelIds, keyProjectAccess, projectBillAmount, yuanMicros } from '../src/admin-v2/customer-projects.mjs';
import { enterpriseTransaction } from '../src/admin-v2/enterprise.js';
import { changeOrganization } from '../src/organization-data.mjs';
import { organizationProjection, tenantOrganizationChanges } from '../src/tenant-data.mjs';

const tenant = { id:'tenant', type:'企业', status:'正常' };
const project = { id:'project', name:'应用项目', tenantId:tenant.id, status:'正常', ownerId:'u1', organizationId:'dept',
  memberRoles:{ mu1:'项目管理员' }, modelPermissions:[{ modelId:'allowed' }, { modelId:'withdrawn' }] };

test('customer Keys exclude history and managed experience Keys, and scope availability to the owning project', () => {
  const key = { id:'key', tenantId:tenant.id, projectId:project.id, status:'有效', modelIds:['allowed','withdrawn','tenantOnly'] };
  const state = {
    tenants:[tenant], grants:[{ subjectType:'tenant', subjectId:tenant.id, status:'生效中', modelIds:key.modelIds }],
    models:key.modelIds.map(id => ({ id, serviceMode:'standard', listingStatus:id === 'withdrawn' ? '已下架' : '已上架', visibility:'公开', callsEnabled:true })),
    apiKeys:[key, { ...key, id:'other-customer', tenantId:'other' }, { ...key, id:'old', status:'已删除' },
      { ...key, id:'managed', kind:'experience' }, { ...key, id:'experience:project' }],
  };
  assert.deepEqual(customerKeys(state, tenant.id), [key]);
  const allowed = customerModelIds(state, tenant.id);
  assert.deepEqual(keyProjectAccess(tenant, project, key, allowed), { models:['allowed'], reason:'' });
  assert.equal(keyProjectAccess(tenant, project, { ...key, expiresAt:'2026-11-12T00:00:00.000Z' }, allowed, Date.UTC(2026, 10, 12)).reason, 'API 密钥已过期');
  assert.equal(keyProjectAccess(tenant, { ...project, status:'已删除' }, key, allowed).reason, '项目当前不可用');
  assert.deepEqual(keyProjectAccess(tenant, { ...project, tenantId:'other' }, key, allowed), { models:[], reason:'项目归属异常' });
  assert.equal(yuanMicros(1_000_001), '1.000001 元');
  assert.equal(yuanMicros(0), '0 元');
  assert.equal(yuanMicros(undefined), '未记录');
});

test('a project’s bill history distinguishes zero charges from unknown attribution and known absence', () => {
  const bill = { projectBreakdown:[{ projectId:project.id, amountMicros:0 }], unassignedMicros:0 };
  assert.equal(projectBillAmount(bill, project.id), 0);
  assert.equal(projectBillAmount(bill, 'other-project'), null);
  assert.equal(projectBillAmount({ ...bill, unassignedMicros:20 }, 'other-project'), undefined);
  assert.equal(projectBillAmount({ amount:2 }, project.id), undefined);
});

function organizationFixture() {
  const users = ['u1', 'u2'].map(id => ({ id, login:id, name:id, status:'正常' }));
  const memberships = users.map(({ id }) => ({ id:'m'+id, userId:id, tenantId:tenant.id, role:'租户管理员', status:'正常', organizationId:'root-id' }));
  const state = {
    tenants:[tenant], users, memberships, projects:[project], audits:[],
    organizations:[{ id:'root-id', tenantId:tenant.id, parentId:null, name:'总部', status:'正常' },
      { id:'dept', tenantId:tenant.id, parentId:'root-id', name:'研发部', status:'正常' }],
  };
  const context = { state, identity:{ tenantId:tenant.id, spaceId:tenant.id }, link:{ backendMembershipId:'mu2' }, canManage:true };
  return { state, context, organization:organizationProjection(state, tenant.id) };
}

test('platform admin and customer organization edits preserve a project’s last active administrator', () => {
  const { state, context, organization } = organizationFixture();
  const disable = { operation:'toggle-admin', tenantId:tenant.id, memberId:'mu1' };
  const draft = { ...organization, members:organization.members.map(row => row.id === 'mu1' ? { ...row, status:'已停用' } : row) };
  assert.throws(() => enterpriseTransaction(state, disable), /请先为「应用项目」指定另一位项目管理员/);
  assert.throws(() => tenantOrganizationChanges(context, draft), /请先为「应用项目」指定另一位项目管理员/);
  const sharedProject = { ...project, memberRoles:{ ...project.memberRoles, mu2:'项目管理员' } };
  const shared = { ...state, projects:[sharedProject] };
  assert.equal(enterpriseTransaction(shared, disable).changes[0].changes.status, '停用');
});

test('customer and server reject deleting a department used by a retained active project', () => {
  const { context, organization } = organizationFixture();
  const remove = { type:'department.remove', id:'dept' };
  assert.throws(() => changeOrganization({ ...organization, projects:[project] }, remove), /请先调整「应用项目」的所属部门/);
  const draft = changeOrganization(organization, remove);
  assert.throws(() => tenantOrganizationChanges(context, draft), /请先调整「应用项目」的所属部门/);
  const history = { ...context.state, projects:[{ ...project, status:'已删除' }] };
  assert.equal(tenantOrganizationChanges({ ...context, state:history }, draft).organizations.some(row => row.id === 'dept'), false);
});

test('D1 customer details show purchased space models; internal space uses authorization without orders', () => {
  const model={id:'model',serviceMode:'standard',callsEnabled:true,listingStatus:'已上架',visibility:'公开'};
  const owner={id:'personal',type:'个人',status:'正常'};
  const state={tenants:[owner],models:[model],grants:[],orders:[],customerOrderScope:'space',spacePolicy:{}};
  assert.deepEqual([...customerModelIds(state,owner.id)],[]);
  state.orders.push({id:'purchase',tenantId:owner.id,status:'生效中',modelIds:[model.id]});
  assert.deepEqual([...customerModelIds(state,owner.id)],[model.id]);
  state.orders[0].status='已退订';
  assert.deepEqual([...customerModelIds(state,owner.id)],[]);
  owner.type='企业';state.spacePolicy.internalTenantId=owner.id;
  assert.deepEqual([...customerModelIds(state,owner.id)],[model.id]);
  model.callsEnabled=false;
  assert.deepEqual([...customerModelIds(state,owner.id)],[]);
});
