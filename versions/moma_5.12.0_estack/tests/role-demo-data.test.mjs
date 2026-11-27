import assert from 'node:assert/strict';
import test from 'node:test';
import { DEMO_ACTORS, ROLE_DEMOS, roleDemoWorkspace } from '../src/role-demo-data.mjs';

const projectIds = workspace => workspace.projects.map(row => row.id);
const fixtureTime = Date.parse('2026-11-26T16:30:00Z');

test.beforeEach(t => {
  t.mock.method(Date, 'now', () => fixtureTime);
});

test('demo roles start in a visible project, even with an unknown role or unauthorized project', () => {
  const initial = roleDemoWorkspace();
  assert.equal(initial.role, 'tenantAdmin');
  assert.equal(initial.project.id, projectIds(initial)[0]);
  assert.deepEqual(roleDemoWorkspace('toString'), initial);
  for (const role of Object.keys(ROLE_DEMOS)) {
    const allowed = roleDemoWorkspace(role);
    const fallback = roleDemoWorkspace(role, 'unknown');
    assert.equal(fallback.project.id, projectIds(allowed)[0]);
    assert.equal(fallback.role, role);
  }
  assert.equal(roleDemoWorkspace('member', 'marketing').project.id, 'company-default');
  assert.equal(roleDemoWorkspace('tenantAdmin', 'personal-default').project.id, 'company-default');
});

test('personal, tenant admin, and project roles obey the demo project and action boundaries', () => {
  const personal = roleDemoWorkspace('personal', 'support');
  const tenant = roleDemoWorkspace('tenantAdmin', 'research');
  const projectAdmin = roleDemoWorkspace('projectAdmin', 'support');
  const member = roleDemoWorkspace('member', 'support');

  assert.deepEqual(projectIds(personal), ['personal-default']);
  assert.deepEqual(projectIds(tenant), ['company-default', 'support', 'marketing', 'research', 'data-platform']);
  assert.deepEqual(projectIds(projectAdmin), ['company-default', 'support']);
  assert.deepEqual(projectIds(member), ['company-default', 'support']);
  assert.equal(projectAdmin.project.id, 'support');
  assert.equal(projectAdmin.canConfigureProject, false);
  assert.equal(tenant.canConfigureProject, true);
  assert.equal(member.project.id, 'support');

  assert.deepEqual([personal, tenant, projectAdmin, member].map(
    ({ canOrder, canManageTenant, canManageProject }) => [canOrder, canManageTenant, canManageProject],
  ), [[true, false, true], [true, true, true], [false, false, true], [false, false, false]]);
});

test('a member sees only their own project records and masked keys', () => {
  for (const project of roleDemoWorkspace('member').projects) {
    const tenant = roleDemoWorkspace('tenantAdmin', project.id);
    const admin = roleDemoWorkspace('projectAdmin', project.id);
    const member = roleDemoWorkspace('member', project.id);
    const name = ROLE_DEMOS.member.name;
    assert.deepEqual(admin.records, tenant.records);
    assert.deepEqual(admin.keys, tenant.keys);
    assert(tenant.records.some(row => row.user !== name));
    assert.deepEqual(member.records, tenant.records.filter(row => row.user === name));
    assert.deepEqual(member.keys, tenant.keys.filter(row => row.user === name));
    assert.deepEqual(member.people.map(row => row.name), [name]);
    assert(member.records.every(row => row.projectId === project.id));
    assert(member.keys.every(row => row.projectId === project.id && /^sk-demo-\*{5}.{4}$/.test(row.masked)));
  }
});

test('demo rows have seven days of attributable usage with distinct projects and plan limits', () => {
  const personal = roleDemoWorkspace('personal');
  const support = roleDemoWorkspace('tenantAdmin', 'support');
  const marketing = roleDemoWorkspace('tenantAdmin', 'marketing');
  for (const workspace of [personal, support, marketing]) {
    const participants = new Set(workspace.people.map(row => row.name));
    assert.equal(new Set(workspace.records.map(row => row.date)).size, 7);
    assert.equal(workspace.records.at(-1).date, '2026-11-27');
    assert.equal(new Set(workspace.records.map(row => row.id)).size, workspace.records.length);
    assert(workspace.records.every(row => /^\d{4}-\d{2}-\d{2}$/.test(row.date) &&
      row.projectId === workspace.project.id && participants.has(row.user)));
    assert(workspace.records.every(row => row.status === '成功' ? row.input && row.output && row.cost > 0
      : row.status === '失败' && row.input === 0 && row.output === 0 && row.cost === 0));
    assert(workspace.plans.every(row => row.used >= 0 && row.total >= row.used && row.expiresAt > workspace.records.at(-1).date));
  }
  assert.notEqual(personal.plans[0].id, support.plans[0].id);
  assert.equal(marketing.plans[0].name, '营销模型包');
  assert.equal(support.plans[0].models.length, 9);
  assert.equal(roleDemoWorkspace('tenantAdmin','research').plans.length, 0);
});

test('all 14 reference enterprise identities have distinct names and access exactly their assigned projects', () => {
  const scope = {
    tenantAdmin:['company-default','support','marketing','research','data-platform'],
    projectAdmin:['company-default','support'], member:['company-default','support'], viewer:['company-default','support'],
    'agent-a':['support'], 'agent-b':['support'], 'marketing-admin':['marketing'], 'marketing-dev':['marketing'],
    'marketing-viewer':['marketing'], 'rd-admin':['research'], 'rd-dev1':['research'], 'rd-dev2':['research'],
    'data-admin':['data-platform'], 'data-dev':['data-platform'],
  };
  assert.equal(Object.keys(DEMO_ACTORS).filter(id => id !== 'personal').length, 14);
  assert.equal(new Set(Object.values(DEMO_ACTORS).map(({name})=>name)).size, 15);
  for (const [actor,projects] of Object.entries(scope)) {
    const view = roleDemoWorkspace(actor,'personal-default');
    assert.deepEqual(projectIds(view), projects);
    assert.equal(view.project.id, projects[0]);
    if (view.role === 'member') {
      assert(view.records.every(row=>row.user===view.actor.name), actor);
      assert(view.previousRecords.every(row=>row.user===view.actor.name), actor);
      assert(view.keys.every(row=>row.user===view.actor.name), actor);
    }
  }
});
