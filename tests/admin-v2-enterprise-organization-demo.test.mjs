import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminSeed, parseAdminState } from '../src/admin-v2/store.js';
import { enterpriseMemberView } from '../src/admin-v2/enterprise-members.js';
import { descendantIds } from '../src/organization-data.mjs';

test('organization demo has linked multi-level departments and enough members for pagination', () => {
  const state = createAdminSeed(), tenant = state.tenants.find(item => item.id === 'tenant-gov');
  const view = enterpriseMemberView(state, tenant);
  assert.equal(view.organizations.length, 12);
  assert.equal(view.members.length, 37);
  assert.equal(enterpriseMemberView(state, tenant, { selection: 'admins' }).filtered.length, 1);
  assert.equal(enterpriseMemberView(state, tenant, { selection: 'unassigned' }).filtered.length, 4);
  assert.equal(enterpriseMemberView(state, tenant, { selection: 'org-tenant-gov' }).filtered.length, 33);
  assert.equal(enterpriseMemberView(state, tenant, { selection: 'org-tenant-gov', includeChildren: false }).filtered.length, 2);
  assert.equal(enterpriseMemberView(state, tenant, { selection: 'org-demo-gov-research' }).filtered.length, 0);
  assert.equal(enterpriseMemberView(state, tenant, { status: '停用' }).filtered.length, 4);
  assert.equal(enterpriseMemberView(state, tenant, { query: 'demo.gov.036' }).filtered.length, 1);
  assert.ok(descendantIds(view.organizations, 'org-demo-gov-applications').has('org-demo-gov-standards'));
  for (const member of view.members.filter(item => item.demo)) {
    assert.ok(view.userFor(member)?.demo);
    assert.ok(!member.organizationId || view.organizationFor(member)?.demo || member.organizationId === 'org-tenant-gov');
    assert.ok(member.projectIds.every(id => state.projects.some(project => project.id === id && project.tenantId === tenant.id)));
  }
  assert.ok(!state.tenants.some(item => item.id.includes('demo-gov-')));
});

test('loading the richer demo adds only missing samples and preserves saved identities and assignments', () => {
  const saved = createAdminSeed();
  for (const collection of ['organizations', 'users', 'memberships']) saved[collection] = saved[collection].filter(item => !item.demo || !item.id.includes('demo-gov-'));
  saved.users.find(user => user.id === 'user-zhang').phone = '+12025550199';
  saved.memberships.find(member => member.id === 'member-1').organizationId = 'org-tenant-gov';
  saved.revision = 18;
  const before = structuredClone(saved), restored = parseAdminState(JSON.stringify(saved));
  for (const collection of ['organizations', 'users', 'memberships']) {
    for (const original of before[collection]) assert.deepEqual(restored[collection].find(item => item.id === original.id), original);
  }
  assert.equal(restored.revision, 18);
  const edited = restored.users.find(user => user.id === 'user-demo-gov-01');
  edited.name = '已编辑姓名';
  const reloaded = parseAdminState(JSON.stringify(restored));
  assert.deepEqual(reloaded.users.find(user => user.id === edited.id), edited);
  for (const collection of ['organizations', 'users', 'memberships']) {
    assert.equal(reloaded[collection].length, restored[collection].length);
    assert.equal(new Set(reloaded[collection].map(item => item.id)).size, reloaded[collection].length);
  }
});

test('organization samples require the enterprise root and never recreate it', () => {
  const state = createAdminSeed();
  for (const key of ['organizations', 'users', 'memberships']) state[key] = state[key].filter(item => !item.id.includes('demo-gov-'));
  state.organizations = state.organizations.filter(item => item.id !== 'org-tenant-gov');
  const restored = parseAdminState(JSON.stringify(state));
  assert.ok(!restored.organizations.some(item => item.id === 'org-tenant-gov' || item.id.includes('demo-gov-')));
  assert.ok(!restored.memberships.some(item => item.id.includes('demo-gov-')));
});
