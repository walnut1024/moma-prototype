import assert from 'node:assert/strict';
import test from 'node:test';
import { sections, pages, pageFromHash, pageWorkspace, availableWorkspaces, canAccessPage } from '../src/admin-v2/navigation.mjs';
import { canMutate } from '../src/admin-v2/store.js';

test('后台默认页按职责选择，业务详情地址保持可达', () => {
  for (const role of ['平台管理员', '运营人员', '运维人员']) {
    for (const path of ['', '/', '/workbench', '/unknown', '/constructor']) {
      assert.equal(pageFromHash('#/admin-2' + path, role), role === '运维人员' ? 'call-analysis' : 'dashboard');
    }
    assert.equal(pageFromHash('#/admin-2/providers?provider=p1', role), 'providers');
    assert.equal(pageFromHash('#/admin-2/admins', role), role === '运维人员' ? 'call-analysis' : 'dashboard');
  }
});

test('运营与运维的导航及全部已注册页面严格隔离', () => {
  assert.deepEqual(availableWorkspaces('平台管理员'), ['operations', 'maintenance']);
  assert.deepEqual(availableWorkspaces('运营人员'), ['operations']);
  assert.deepEqual(availableWorkspaces('运维人员'), ['maintenance']);
  assert.deepEqual(availableWorkspaces('未知角色'), []);
  assert.deepEqual(sections.filter(group => group.workspace === 'operations').map(group => group.id), ['overview', 'analytics', 'models']);
  assert.deepEqual(sections.filter(group => group.workspace === 'maintenance').map(group => group.id), ['runtime', 'gateway']);
  for (const id of Object.keys(pages)) {
    assert.equal(canAccessPage('平台管理员', id), true, id);
    assert.equal(canAccessPage('运营人员', id), pageWorkspace(id) === 'operations', id);
    assert.equal(canAccessPage('运维人员', id), pageWorkspace(id) === 'maintenance', id);
    assert.equal(canAccessPage('未知角色', id), false, id);
  }
  assert.equal(canAccessPage('平台管理员', 'constructor'), false);
  assert.equal(canAccessPage('平台管理员', 'unknown'), false);
  assert.equal(pageWorkspace('providers'), 'operations');
  assert.equal(pageWorkspace('customer-usage-detail'), 'operations');
  assert.equal(canAccessPage('运营人员', 'admins'), false);
});

test('模型供应操作随导航归运营，运维保留网关和生产权限', () => {
  assert.equal(canMutate('运营人员', { type: 'providerOperation' }), true);
  assert.equal(canMutate('运维人员', { type: 'providerOperation' }), false);
  for (const collection of ['providers', 'endpoints', 'supplyPrices']) {
    assert.equal(canMutate('运营人员', { type: 'update', collection }), true);
    assert.equal(canMutate('运维人员', { type: 'update', collection }), false);
  }
  for (const collection of ['clusters', 'deployments', 'routes']) {
    assert.equal(canMutate('运营人员', { type: 'update', collection }), false);
    assert.equal(canMutate('运维人员', { type: 'update', collection }), true);
  }
});
