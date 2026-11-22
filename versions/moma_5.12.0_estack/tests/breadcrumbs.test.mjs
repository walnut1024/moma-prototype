import test from 'node:test';
import assert from 'node:assert/strict';
import { adminBreadcrumbs } from '../src/admin-v2/breadcrumbs.mjs';
import { classificationHref } from '../src/admin-v2/model-classification.js';
import { canAccessPage, channelManagementListRoute, pageFromHash } from '../src/admin-v2/navigation.mjs';
const build = (page, query = '', names = {}) => adminBreadcrumbs(page, new URLSearchParams(query), names);
const labels = crumbs => crumbs.map(c => c.label);
const params = crumb => new URLSearchParams(crumb.href.split('?')[1]);

test('maintenance JSON is a drill-down with an exact return to its module context', () => {
  for (const [page, query] of [['model-market', 'view=list&q=GLM&status=gray&page=2'], ['model-prices', 'service=s1&tab=history&q=GLM&page=3']]) {
    const base = build(page, query, { provider: 'MoMA', model: 'GLM' });
    const rows = build(page, query + '&resourceJson=1&resourceTarget=' + encodeURIComponent(JSON.stringify({ level: 'module' })), { provider: 'MoMA', model: 'GLM' });
    assert.deepEqual(rows.slice(0, -2), base.slice(0, -1));
    assert.equal(rows.at(-2).label, base.at(-1).label);
    assert.equal(rows.at(-2).href, '#/admin-2/' + page + '?' + query);
    assert.deepEqual(rows.at(-1), { label: '维护 JSON' });
  }
});

test('channel detail entry preserves the list search and pagination in its breadcrumb', () => {
  const route = 'providers-reference';
  assert.equal(pageFromHash('#/admin-2/' + route, '运营人员'), route);
  assert.equal(canAccessPage('运营人员', route), true);
  assert.equal(canAccessPage('平台管理员', route), true);
  assert.equal(canAccessPage('运维人员', route), false);
  assert.deepEqual(labels(build(route)), ['模型运营', '渠道管理', '渠道列表']);
  const detail = build(route, 'q=GLM&page=2&size=20&connection=c1&tab=models&modelQ=glm-5', { connection: 'GLM 接入' });
  assert.deepEqual(labels(detail), ['模型运营', '渠道管理', '渠道列表', 'GLM 接入']);
  assert.equal(detail[2].href, '#/admin-2/' + route + '?q=GLM&page=2&size=20');
  const costs = build(route, 'q=GLM&page=2&size=20&connection=c1&tab=model-costs', { connection: 'GLM 接入' });
  assert.deepEqual(costs, detail);
  assert.equal(build(route, 'connection=invalid').at(-1).label, '渠道不存在');
});

test('channel management switches between list and health with list context only', () => {
  const query = new URLSearchParams({ q: '移动云', page: '2', size: '20', connection: 'c1', tab: 'models', modelQ: 'Kimi' });
  const health = channelManagementListRoute('providers-health', query);
  const list = channelManagementListRoute('providers-reference', query);
  const restored = new URLSearchParams(health.split('?')[1]);
  assert.deepEqual([...restored], [['q', '移动云'], ['page', '2'], ['size', '20']]);
  const withHealthFilters = channelManagementListRoute('providers-health', restored, 'grain=day');
  assert.equal(channelManagementListRoute('providers-reference', new URLSearchParams(withHealthFilters.split('?')[1])), list);
  assert.equal(build('providers-health', restored.toString())[1].href, '#/admin-2/' + list);
  assert.equal(build('providers-reference', query.toString(), { connection: 'c1' })[2].href, '#/admin-2/' + list);
});

test('supplier material drill-down preserves list filters', () => {
  const rows = build('provider-materials', 'provider=provider-moma&tab=profile&edit=1&q=MoMA&page=2&modelQ=GLM&modelPage=3', { provider: '中国移动 MoMA' });
  assert.deepEqual(labels(rows), ['模型运营', '基础资料', '服务商', '中国移动 MoMA']);
  assert.equal(params(rows[2]).get('q'), 'MoMA');
  assert.equal(params(rows[2]).get('page'), '2');
  for (const key of ['provider', 'tab', 'edit', 'modelQ', 'modelPage']) assert.equal(params(rows[2]).has(key), false);
  assert.deepEqual(labels(build('provider-materials', 'view=relations')), ['模型运营', '基础资料', '服务商', '批量导入供应关系']);
  const importing = build('provider-materials', 'provider=provider-moma&view=modelImport&modelQ=GLM', { provider: '中国移动 MoMA' });
  assert.equal(importing[3].href, '#/admin-2/provider-materials?provider=provider-moma&modelQ=GLM&tab=models');
});

test('author, series and tariff tabs are direct materials-management children in breadcrumbs', () => {
  for (const [kind, label] of [['authors', '模型作者'], ['series', '模型系列']]) {
    const [route, query] = classificationHref(kind).split('?');
    assert.equal(route, '#/admin-2/model-templates');
    assert.deepEqual(build('model-templates', query), [{ label: '模型运营' }, { label: '基础资料', href: route }, { label }]);
  }
  for (const [tab, label] of [['scenario', '计费项'], ['unit', '计费单位'], ['currency', '货币']]) {
    assert.deepEqual(build('tariff-dictionary', `tab=${tab}`), [{ label: '模型运营' }, { label: '基础资料', href: '#/admin-2/model-templates' }, { label }]);
  }
  for (const query of ['', 'tab=invalid', 'tab=constructor', 'tab=__proto__']) assert.deepEqual(labels(build('tariff-dictionary', query)), ['模型运营', '基础资料', '计费项']);
});

test('model library editor shows the current model name and keeps identity out of the list link', () => {
  const query = 'view=template&template=catalog-demo-kimi&returnModel=catalog-demo-kimi&q=Kimi&page=2';
  const rows = build('model-templates', query, { model: 'Kimi K3' });
  assert.deepEqual(labels(rows), ['模型运营', '基础资料', '模型', 'Kimi K3']);
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

test('analytics detail breadcrumbs preserve their original list scope', () => {
  const enterprise = build('tenants', 'enterprise=t1&scenario=private&tab=members&q=企业', { enterprise: '某企业' });
  assert.equal(params(enterprise[1]).get('scenario'), 'private');
  assert.equal(params(enterprise[1]).has('enterprise'), false);
  assert.equal(enterprise.at(-1).label, '某企业');
  const customer = build('customer-usage-detail', 'customer=t1&start=2026-10-01&end=2026-10-18', { customer: '某客户' });
  assert.ok(customer[1].href.startsWith('#/admin-2/user-analysis?'));
  assert.equal(params(customer[1]).get('customer'), null);
  assert.equal(params(customer[1]).get('start'), '2026-10-01');
});

test('section breadcrumbs open a real landing page and current pages remain plain text', () => {
  assert.deepEqual(build('dashboard'), [{ label: '概览' }]);
  assert.deepEqual(build('listing-new'), [{ label: '模型运营' }, { label: '模型服务' }]);
  assert.deepEqual(build('model-links'), [{ label: '模型运营' }, { label: '模型链路' }]);
  assert.deepEqual(labels(build('logs')), ['网关管理', '调用日志']);
  assert.equal(build('logs')[0].href, '#/admin-2/routes');
  assert.deepEqual(labels(build('tenants')), ['访问控制', '租户管理']);
  assert.deepEqual(labels(build('tenants', 'scope=organization', { internal: true })), ['访问控制', '租户管理']);
  const organizationProject = build('projects', 'scope=organization&project=my-project', { internal: true });
  assert.deepEqual(labels(organizationProject), ['访问控制', '项目管理', '项目详情']);
  assert.equal(organizationProject[1].href, '#/admin-2/projects?scope=organization');
  assert.equal(build('deployments')[0].href, '#/admin-2/clusters');
  const operationsHealth = build('providers-health');
  assert.deepEqual(labels(operationsHealth), ['模型运营', '渠道管理', '渠道健康']);
  assert.equal(operationsHealth[1].href, '#/admin-2/providers-reference');
  assert.deepEqual(labels(build('monitoring')), ['网关管理', '服务监控']);
  assert.equal(build('limits')[1].href, '#/admin-2/routes');
  const alerts = build('alerts');
  assert.equal(alerts[1].href, '#/admin-2/monitoring');
  assert.equal(alerts.at(-1).href, undefined);
});

test('model operations is a navigation group, not a link to a sibling model-service page', () => {
  for (const page of ['providers-reference', 'listing-new', 'model-market', 'model-templates', 'tariff-dictionary', 'provider-materials']) {
    for (const query of ['', 'perspective=models', 'provider=p1&listQ=MoMA&listPage=2']) {
      assert.deepEqual(build(page, query)[0], { label: '模型运营' });
    }
  }
});


test('cost editing stays on the list and sale detail returns to its filtered list',()=>{
  const params=new URLSearchParams({q:'GLM',filterModel:'master-1',filterSupplier:'provider-1',filterStatus:'在售',page:'2',model:'service-context',service:'detail-service',edit:'1',tab:'sales'});
  const link=adminBreadcrumbs('model-prices',params).find(row=>row.href?.startsWith('#/admin-2/model-prices'));
  assert.ok(link);const back=new URLSearchParams(link.href.split('?')[1]);
  for(const key of ['q','filterModel','filterSupplier','filterStatus','page','model'])assert.equal(back.get(key),params.get(key));
  for(const key of ['service','edit','tab'])assert.equal(back.has(key),false);
});

test('customer data drill-down returns to the customer analysis date range', () => {
  const crumbs = build('customer-analysis-detail', 'customer=demo-7&source=history&mode=range&start=2026-11-15&end=2026-11-18');
  assert.deepEqual(labels(crumbs), ['运营分析', '客户数据', '客户详情']);
  assert.equal(crumbs[1].href, '#/admin-2/customer-analysis?mode=range&start=2026-11-15&end=2026-11-18');
});
