import assert from 'node:assert/strict';
import test from 'node:test';
import { sections, pages, pageFromHash, canAccessPage } from '../src/admin-v2/navigation.mjs';
import { pages as pages5120, canAccessPage as access5120 } from '../versions/moma_5.12.0_estack/src/admin-v2/navigation.mjs';

test('5.11.0 移除用户及账号管理页面，旧地址仅进入职责首页', () => {
  assert.ok(sections.every(section => !['customers', 'platform'].includes(section.id)));
  for (const id of ['tenants', 'individual-users', 'admins']) {
    assert.equal(Object.hasOwn(pages, id), false);
    for (const role of ['平台管理员', '运营人员', '运维人员']) {
      assert.equal(canAccessPage(role, id), false);
      assert.equal(pageFromHash(`#/admin-2/${id}?user=existing`, role), role === '运维人员' ? 'call-analysis' : 'dashboard');
    }
    assert.ok(Object.hasOwn(pages5120, id));
    assert.equal(access5120('平台管理员', id), true);
  }
  for (const id of ['user-analysis', 'customer-usage-detail']) {
    assert.equal(canAccessPage('运营人员', id), true);
    assert.equal(pageFromHash(`#/admin-2/${id}`, '运营人员'), id);
  }
});


test('5.11.0 移除全部 Token 生产页面，5.12.0 仍可访问', () => {
  assert.ok(sections.every(section => section.id !== 'production'));
  for (const id of ['clusters', 'deployments', 'artifacts', 'model-observability']) {
    assert.equal(Object.hasOwn(pages, id), false);
    for (const role of ['平台管理员', '运营人员', '运维人员']) {
      assert.equal(canAccessPage(role, id), false);
      assert.equal(pageFromHash(`#/admin-2/${id}`, role), role === '运维人员' ? 'call-analysis' : 'dashboard');
    }
    assert.ok(Object.hasOwn(pages5120, id));
    assert.equal(access5120('平台管理员', id), true);
    assert.equal(access5120('运维人员', id), true);
  }
  for (const id of ['call-analysis', 'routes']) assert.equal(canAccessPage('运维人员', id), true);
});
