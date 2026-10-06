import test from 'node:test';
import assert from 'node:assert/strict';
import { displayBusinessCopy, displaySmartRouteName } from '../src/display-copy.mjs';
import { departmentPath } from '../src/organization-data.mjs';

test('stored fixture notes use business copy without changing the stored record', () => {
  const record = { description: 'Kimi K3 多供应商接入与计价示例。映射和价格用于原型演示。' };
  assert.equal(displayBusinessCopy(record.description), 'Kimi K3 支持多供应商接入，各供应服务独立配置价格。');
  assert.match(record.description, /原型演示/);
  assert.equal(displayBusinessCopy('模拟上游连接超时，请检查服务地址与网络'), '上游连接超时，请检查服务地址与网络');
});

test('business descriptions, identifiers and absent values are preserved', () => {
  for (const value of ['客户产品演示培训', '模拟器研发部门', 'catalog-demo-kimi', '', undefined, null, 0]) {
    assert.equal(displayBusinessCopy(value), value);
  }
});

test('old organization paths and default route labels display without rewriting stored identities', () => {
  const departments = [{ id: 'root', name: '示例科技有限公司', parentId: null }, { id: 'research', name: '研发中心', parentId: 'root' }];
  const displayed = departments.map(item => ({ ...item, name: displayBusinessCopy(item.name) }));
  assert.equal(departmentPath(displayed, 'research'), '云启科技有限公司 / 研发中心');
  assert.equal(departments[0].name, '示例科技有限公司');
  const route = { id: 'route-demo-001', name: 'demo-route', models: ['Kimi-K3'] };
  assert.equal(displaySmartRouteName(route), 'primary-route');
  assert.equal(route.name, 'demo-route');
  assert.equal(route.id, 'route-demo-001');
  assert.equal(displaySmartRouteName({ ...route, name: 'customer-route' }), 'customer-route');
  assert.equal(displaySmartRouteName({ ...route, id: 'customer-owned-route' }), 'demo-route');
});
