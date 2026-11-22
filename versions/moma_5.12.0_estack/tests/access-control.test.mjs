import test from 'node:test';
import assert from 'node:assert/strict';
import { tenantHref, userAffiliations } from '../src/admin-v2/access-control.mjs';
import { sections, canAccessPage } from '../src/admin-v2/navigation.mjs';

test('tenant detail links preserve list filters and distinguish accounts from tenants', () => {
  const href = tenantHref({ id:'personal-space', ownerId:'u1', type:'个人' }, { tab:'projects' }, new URLSearchParams('q=Alice&type=个人&enterprise=old&create=personal'));
  const params = new URLSearchParams(href.split('?')[1]);
  assert.equal(params.get('personal'), 'u1');
  assert.equal(params.get('q'), 'Alice');
  assert.equal(params.has('enterprise'), false);
  assert.equal(params.has('create'), false);
  assert.equal(params.get('tab'), 'projects');
});

test('user project affiliations stay inside explicit tenant membership', () => {
  const state = { tenants:[{ id:'a', type:'企业' }, { id:'b', type:'企业' }, { id:'p', type:'个人', ownerId:'u1' }],
    memberships:[{ id:'ma', userId:'u1', tenantId:'a', role:'普通成员', status:'正常' }],
    projects:[{ id:'pa', tenantId:'a', memberRoles:{ ma:'项目成员' } }, { id:'pb', tenantId:'b', memberRoles:{ ma:'项目管理员' } }, { id:'pp', tenantId:'p' }] };
  const rows = userAffiliations(state, 'u1');
  assert.deepEqual(rows.map(row => row.tenant.id), ['a', 'p']);
  assert.deepEqual(rows.flatMap(row => row.projects.map(item => item.project.id)), ['pa', 'pp']);
  assert.deepEqual(userAffiliations(state, 'missing'), []);
});

test('access control centralizes tenant management without standalone organization or user navigation', () => {
  const group = sections.find(row => row.title === '访问控制');
  assert.deepEqual(group.items.flatMap(row => row.children), [['tenants', '租户管理']]);
  const customers = sections.find(row => row.id === 'commerce').items.find(row => row.id === 'enterprise');
  assert.equal(customers, undefined);
  assert.equal(sections.some(row => row.title === '组织运营'), false);
  assert.equal(canAccessPage('运营人员', 'tenants'), true);
  assert.equal(canAccessPage('运维人员', 'tenants'), false);
  assert.equal(canAccessPage('平台管理员', 'users'), false);
});
