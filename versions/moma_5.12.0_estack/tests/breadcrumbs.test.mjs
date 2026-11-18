import test from 'node:test';
import assert from 'node:assert/strict';
import { adminBreadcrumbs } from '../src/admin-v2/breadcrumbs.mjs';
const build = (page, query = '', names = {}) => adminBreadcrumbs(page, new URLSearchParams(query), names);
const labels = crumbs => crumbs.map(c => c.label);
const params = crumb => new URLSearchParams(crumb.href.split('?')[1]);

test('maintenance JSON is a drill-down with an exact return to its module context', () => {
  for (const [page, query] of [['providers', 'provider=p1&tab=connections&listQ=MoMA&listPage=2'], ['listing', 'model=s1&panel=routing&perspective=models&q=GLM&shown=40'], ['model-market', 'view=list&q=GLM&status=gray&page=2'], ['model-prices', 'service=s1&tab=history&q=GLM&page=3']]) {
    const base = build(page, query, { provider: 'MoMA', model: 'GLM' });
    const rows = build(page, query + '&resourceJson=1&resourceTarget=' + encodeURIComponent(JSON.stringify({ level: 'module' })), { provider: 'MoMA', model: 'GLM' });
    assert.deepEqual(rows.slice(0, -2), base.slice(0, -1));
    assert.equal(rows.at(-2).label, base.at(-1).label);
    assert.equal(rows.at(-2).href, '#/admin-2/' + page + '?' + query);
    assert.deepEqual(rows.at(-1), { label: '维护 JSON' });
  }
});

test('supplier workspace keeps its navigation while material drill-down preserves list filters', () => {
  for (const tab of ['catalogue', 'api-keys']) {
    const channels = build('providers', `provider=provider-moma&tab=${tab}&listQ=MoMA&listPage=2`, { provider: '移动云 MoMA' });
    assert.deepEqual(labels(channels), ['模型运营', '渠道管理', '移动云 MoMA']);
    assert.equal(channels[1].href, '#/admin-2/providers?listQ=MoMA&listPage=2');
  }
  const channelImport = build('providers', 'provider=provider-moma&view=modelImport', { provider: '移动云 MoMA' });
  assert.deepEqual(labels(channelImport), ['模型运营', '渠道管理', '移动云 MoMA', '批量新增']);
  assert.equal(channelImport[2].href, '#/admin-2/providers?provider=provider-moma');
  const rows = build('provider-materials', 'provider=provider-moma&tab=profile&edit=1&q=MoMA&page=2&modelQ=GLM&modelPage=3', { provider: '中国移动 MoMA' });
  assert.deepEqual(labels(rows), ['模型运营', '模型资料', '服务商', '中国移动 MoMA']);
  assert.equal(params(rows[2]).get('q'), 'MoMA');
  assert.equal(params(rows[2]).get('page'), '2');
  for (const key of ['provider', 'tab', 'edit', 'modelQ', 'modelPage']) assert.equal(params(rows[2]).has(key), false);
  assert.deepEqual(labels(build('provider-materials', 'view=relations')), ['模型运营', '模型资料', '服务商', '批量导入供应关系']);
  const importing = build('provider-materials', 'provider=provider-moma&view=modelImport&modelQ=GLM', { provider: '中国移动 MoMA' });
  assert.equal(importing[3].href, '#/admin-2/provider-materials?provider=provider-moma&modelQ=GLM&tab=models');
});

test('channel model details return to the model table with the same search and page', () => {
  const rows = build('providers', 'perspective=models&supplyModel=model-1&modelListQ=GLM&modelListPage=2');
  assert.deepEqual(labels(rows), ['模型运营', '渠道管理', '模型', '模型详情']);
  assert.equal(params(rows[2]).get('perspective'), 'models');
  assert.equal(params(rows[2]).get('modelListQ'), 'GLM');
  assert.equal(params(rows[2]).get('modelListPage'), '2');
  assert.equal(params(rows[2]).has('supplyModel'), false);
  assert.equal(params(rows[2]).has('provider'), false);
});

test('a deep-linked model can return to model services with its catalogue and filters', () => {
  const rows = build('listing', 'model=abc&perspective=models&panel=routing&catalogue=all&q=Qwen&type=text&mapping=m1', { model: 'Qwen' });
  assert.deepEqual(rows, [
    { label: '模型运营' },
    { label: '模型服务', href: '#/admin-2/listing?perspective=models&catalogue=all&q=Qwen&type=text' },
    { label: 'Qwen' },
  ]);
  assert.deepEqual(build('listing', 'model=missing').at(-1), { label: '未找到指定模型' });
});

test('tariff categories are direct materials-management children in breadcrumbs', () => {
  for (const [tab, label] of [['scenario', '计费项'], ['unit', '计费单位'], ['currency', '货币']]) {
    assert.deepEqual(build('tariff-dictionary', `tab=${tab}`), [{ label: '模型运营' }, { label: '模型资料', href: '#/admin-2/model-templates' }, { label }]);
  }
  for (const query of ['', 'tab=invalid', 'tab=constructor', 'tab=__proto__']) assert.deepEqual(labels(build('tariff-dictionary', query)), ['模型运营', '模型资料', '计费项']);
});

test('the create-service dialog keeps the background model breadcrumbs', () => {
  assert.deepEqual(labels(build('listing', 'view=add')), ['模型运营', '模型服务']);
  const rows = build('listing', 'view=add&model=glm&panel=guide&sourceLibrary=other&q=GLM&page=2', { model: 'GLM' });
  assert.deepEqual(labels(rows), ['模型运营', '模型服务', 'GLM']);
  assert.equal(params(rows[1]).get('q'), 'GLM');
  for (const key of ['view', 'sourceLibrary', 'panel', 'model']) assert.equal(params(rows[1]).has(key), false);
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
  const individual = build('users', 'user=u1&status=active', { user: '某用户' });
  assert.equal(params(individual[1]).get('status'), 'active');
  const customer = build('customer-usage-detail', 'customer=t1&start=2026-10-01&end=2026-10-18', { customer: '某客户' });
  assert.ok(customer[1].href.startsWith('#/admin-2/user-analysis?'));
  assert.equal(params(customer[1]).get('customer'), null);
  assert.equal(params(customer[1]).get('start'), '2026-10-01');
});

test('section breadcrumbs open a real landing page and current pages remain plain text', () => {
  assert.deepEqual(build('dashboard'), [{ label: '概览' }]);
  assert.deepEqual(build('listing', 'perspective=models'), [{ label: '模型运营' }, { label: '模型服务' }]);
  assert.deepEqual(build('providers'), [{ label: '模型运营' }, { label: '渠道管理' }]);
  assert.deepEqual(labels(build('logs')), ['网关管理', '调用日志']);
  assert.equal(build('logs')[0].href, '#/admin-2/routes');
  assert.equal(build('users')[0].href, '#/admin-2/tenants');
  assert.equal(build('deployments')[0].href, '#/admin-2/clusters');
  assert.deepEqual(labels(build('monitoring')), ['网关管理', '服务监控']);
  assert.equal(build('limits')[1].href, '#/admin-2/routes');
  const alerts = build('alerts');
  assert.equal(alerts[1].href, '#/admin-2/monitoring');
  assert.equal(alerts.at(-1).href, undefined);
});

test('model operations is a navigation group, not a link to a sibling model-service page', () => {
  for (const page of ['providers', 'listing', 'model-market', 'model-prices', 'model-templates', 'tariff-dictionary', 'provider-materials']) {
    for (const query of ['', 'perspective=models', 'provider=p1&listQ=MoMA&listPage=2']) {
      assert.deepEqual(build(page, query)[0], { label: '模型运营' });
    }
  }
});


test('supplier batches use their return link while model details use their own list context', () => {
  const target = '#/admin-2/listing?perspective=suppliers&supplier=p1&catalogueQ=GLM&cataloguePage=3';
  const rows = build('listing', 'view=supplier-batch&provider=p1&listingReturn=' + encodeURIComponent(target));
  assert.equal(rows[1].href, target);
  assert.equal(rows.at(-1).label, '批量配置与上架');
  const detail = build('listing', 'model=abc&tab=supplies&listingReturn=' + encodeURIComponent(target), { model: 'GLM' });
  assert.deepEqual(labels(detail), ['模型运营', '模型服务', 'GLM']);
  assert.equal(detail[1].href, '#/admin-2/listing?perspective=models');
  assert.ok(build('listing', 'view=supplier-batch&listingReturn=https%3A%2F%2Fexternal.invalid')[1].href.startsWith('#/admin-2/listing'));
});

test('onboarding belongs directly to model operations and names the selected task goal',()=>{
  assert.deepEqual(labels(build('listing','view=onboarding')),['模型运营','接入并上架模型']);
  assert.deepEqual(labels(build('listing','view=onboarding',{onboardingIntent:'reserve'})),['模型运营','准备备用供应']);
  assert.deepEqual(labels(build('listing','view=onboarding',{onboardingIntent:'activate'})),['模型运营','投入当前服务']);
});

test('cost editing stays on the list and sale detail returns to its filtered list',()=>{
  const params=new URLSearchParams({q:'GLM',filterModel:'master-1',filterSupplier:'provider-1',filterStatus:'在售',page:'2',model:'service-context',service:'detail-service',edit:'1',tab:'sales'});
  const link=adminBreadcrumbs('model-prices',params).find(row=>row.href?.startsWith('#/admin-2/model-prices'));
  assert.ok(link);const back=new URLSearchParams(link.href.split('?')[1]);
  for(const key of ['q','filterModel','filterSupplier','filterStatus','page','model'])assert.equal(back.get(key),params.get(key));
  for(const key of ['service','edit','tab'])assert.equal(back.has(key),false);
});
