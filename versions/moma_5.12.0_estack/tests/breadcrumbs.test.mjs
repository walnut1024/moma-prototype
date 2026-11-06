import test from 'node:test';
import assert from 'node:assert/strict';
import { adminBreadcrumbs } from '../src/admin-v2/breadcrumbs.mjs';
const build = (page, query = '', names = {}) => adminBreadcrumbs(page, new URLSearchParams(query), names);
const labels = crumbs => crumbs.map(c => c.label);
const params = crumb => new URLSearchParams(crumb.href.split('?')[1]);

test('supplier workspace has one level and editors return to the same supplier and tab', () => {
  const rows = build('providers', 'provider=provider-moma&tab=api-keys&view=profile&endpoint=ep&q=model-search&listQ=MoMA&listPage=2&status=已启用', { provider: '中国移动 MoMA' });
  assert.deepEqual(labels(rows), ['模型运营', '渠道接入', '编辑供应商资料']);
  assert.equal(params(rows[1]).get('provider'), 'provider-moma');
  assert.equal(params(rows[1]).get('tab'), 'api-keys');
  for (const key of ['endpoint', 'view', 'q', 'page', 'listQ', 'listPage']) assert.equal(params(rows[1]).has(key), false);
  assert.equal(rows.at(-1).href, undefined);
  assert.deepEqual(labels(build('providers', 'provider=provider-moma&tab=catalogue')), ['模型运营', '渠道接入']);
  assert.deepEqual(labels(build('providers', 'provider=provider-moma&tab=api-keys')), ['模型运营', '渠道接入']);
  assert.deepEqual(labels(build('providers', 'view=new&q=MoMA')), ['模型运营', '渠道接入', '添加供应商']);
});

test('supplier and history drawers stay on model management without a detail breadcrumb', () => {
  for (const tab of ['supplies', 'history', 'basic']) {
    const rows = build('listing', `model=abc&tab=${tab}&q=Qwen&type=text&page=3`, { model: 'Qwen' });
    assert.deepEqual(labels(rows), ['模型运营', '模型服务']);
    assert.equal(rows[1].href, undefined);
  }
});

test('tariff categories are direct materials-management children in breadcrumbs', () => {
  for (const [tab, label] of [['scenario', '计费项'], ['unit', '计价单位'], ['currency', '货币']]) {
    assert.deepEqual(build('tariff-dictionary', `tab=${tab}`), [{ label: '模型运营' }, { label: '模型成本', href: '#/admin-2/model-costs' }, { label }]);
  }
  for (const query of ['', 'tab=invalid', 'tab=constructor', 'tab=__proto__']) assert.deepEqual(labels(build('tariff-dictionary', query)), ['模型运营', '模型成本', '计费项']);
});

test('model creation and metadata workflows retain the correct parent', () => {
  assert.deepEqual(labels(build('listing', 'view=add&step=select')), ['模型运营', '模型服务', '添加模型']);
  const rows = build('listing', 'view=add&draft=d1&step=metadata&provider=p1&catalogue=x&q=GLM&page=2');
  assert.deepEqual(labels(rows), ['模型运营', '模型服务', '添加模型']);
  assert.equal(params(rows[1]).get('q'), 'GLM');
  for (const key of ['draft', 'step', 'provider', 'catalogue']) assert.equal(params(rows[1]).has(key), false);
  assert.deepEqual(labels(build('model-templates', 'view=templateImport')), ['模型运营', '模型资料', '模型', '批量导入模型资料']);
});

test('model library editor shows the current model name and keeps identity out of the list link', () => {
  const query = 'view=template&template=catalog-demo-kimi&returnModel=catalog-demo-kimi&q=Kimi&page=2';
  const rows = build('model-templates', query, { model: 'Kimi K3' });
  assert.deepEqual(labels(rows), ['模型运营', '模型资料', '模型', 'Kimi K3']);
  assert.equal(rows.at(-1).href, undefined);
  assert.equal(params(rows[2]).get('q'), 'Kimi');
  assert.equal(params(rows[2]).get('page'), '2');
  for (const key of ['view', 'template', 'returnModel']) assert.equal(params(rows[2]).has(key), false);
  assert.equal(build('model-templates', query, { model: '更新后的名称' }).at(-1).label, '更新后的名称');
  assert.equal(build('model-templates', query).at(-1).label, '模型资料不存在');
  assert.equal(build('model-templates', 'view=template').at(-1).label, '新建模型资料');
});

test('deployment list, detail and editor have explicit hierarchy and preserve filters', () => {
  const rows = build('deployments', 'deployment=d1&view=edit&tab=events&cluster=gpu&page=2', { deployment: '生产服务' });
  assert.deepEqual(labels(rows), ['Token 生产', '模型部署', '生产服务', '更新部署配置']);
  assert.equal(params(rows[1]).get('cluster'), 'gpu');
  assert.equal(params(rows[1]).has('deployment'), false);
  assert.equal(params(rows[2]).get('deployment'), 'd1');
  assert.equal(params(rows[2]).has('view'), false);
  assert.deepEqual(labels(build('deployments', 'view=create')), ['Token 生产', '模型部署', '部署模型']);
});

test('user and analytics detail breadcrumbs preserve their original list scope', () => {
  const enterprise = build('tenants', 'enterprise=t1&scenario=private&tab=members&q=企业', { enterprise: '某企业' });
  assert.equal(params(enterprise[1]).get('scenario'), 'private');
  assert.equal(params(enterprise[1]).has('enterprise'), false);
  assert.equal(enterprise.at(-1).label, '某企业');
  const individual = build('individual-users', 'user=u1&status=active', { user: '某用户' });
  assert.equal(params(individual[1]).get('status'), 'active');
  const customer = build('customer-usage-detail', 'customer=t1&start=2026-10-01&end=2026-10-18', { customer: '某客户' });
  assert.ok(customer[1].href.startsWith('#/admin-2/user-analysis?'));
  assert.equal(params(customer[1]).get('customer'), null);
  assert.equal(params(customer[1]).get('start'), '2026-10-01');
});

test('top-level pages do not invent a back destination; gateway parents remain navigable', () => {
  assert.deepEqual(build('dashboard'), [{ label: '概览' }]);
  assert.deepEqual(labels(build('providers')), ['模型运营', '渠道接入']);
  const gateway = build('alerts');
  assert.equal(gateway[1].href, '#/admin-2/routes');
  assert.equal(gateway.at(-1).href, undefined);
});


test('supplier batches return to the same supplier perspective and page while drawers keep the list hierarchy', () => {
  const target = '#/admin-2/listing?perspective=suppliers&supplier=p1&catalogueQ=GLM&cataloguePage=3';
  const rows = build('listing', 'view=supplier-batch&provider=p1&listingReturn=' + encodeURIComponent(target));
  assert.equal(rows[1].href, target);
  assert.equal(rows.at(-1).label, '批量配置与上架');
  assert.deepEqual(labels(build('listing', 'model=abc&tab=supplies&listingReturn=' + encodeURIComponent(target), { model: 'GLM' })), ['模型运营', '模型服务']);
  assert.ok(build('listing', 'view=supplier-batch&listingReturn=https%3A%2F%2Fexternal.invalid')[1].href.startsWith('#/admin-2/listing'));
});

test('onboarding belongs directly to model operations and names the selected task goal',()=>{
  assert.deepEqual(labels(build('listing','view=onboarding')),['模型运营','接入并上架模型']);
  assert.deepEqual(labels(build('listing','view=onboarding',{onboardingIntent:'reserve'})),['模型运营','准备备用供应']);
  assert.deepEqual(labels(build('listing','view=onboarding',{onboardingIntent:'activate'})),['模型运营','投入当前服务']);
});
