import { channelManagementListRoute, pages, sections } from './navigation.mjs';
import { TARIFF_KINDS } from './tariff-dictionary.js';
import { CLASSIFICATION_KINDS, classificationKind } from './model-classification.js';
import { adminProjectListHref } from './access-control.mjs';

export function adminBreadcrumbs(active, params, names = {}) {
  const page = pages[active];
  const href = (id, patch = {}, omit = []) => {
    const next = new URLSearchParams(params);
    omit.forEach(key => next.delete(key));
    Object.entries(patch).forEach(([key, value]) => value == null ? next.delete(key) : next.set(key, value));
    return `#/admin-2/${id}${next.size ? '?' + next : ''}`;
  };
  const detailKeys = ['model', 'provider', 'view', 'tab', 'step', 'template', 'return', 'supply', 'endpoint', 'connection', 'deployment', 'chosen', 'draft', 'catalogue', 'origin', 'onboarding', 'returnModel', 'returnDraft', 'library', 'code'];
  const listHref = href(active, {}, [...detailKeys, 'materialTab']);
  const currentHref = href(active);
  const group = sections.find(section => section.id === page.groupId);
  const groupHome = group.home || group.items[0].children[0][0];
  const crumbs = [];
  const add = (label, target) => crumbs.push({ label, ...(target && target !== currentHref ? { href: target } : {}) });
  add(page.group,
    names.internal || group.direct || ['models', 'commerce', 'customers'].includes(group.id) ? null : `#/admin-2/${groupHome}`);
  const view = params.get('view');
  if (active === 'package-production') {
    const labels = { new: '新建套餐', edit: '编辑套餐', detail: '套餐详情' };
    const label = Object.hasOwn(labels, view) ? labels[view] : null;
    add(page.label, label ? href(active, {}, ['view', 'package']) : null);
    if (label) add(label);
  } else if (active === 'package-data' && params.get('package')) {
    add(page.label, href(active, {}, ['package']));
    add('套餐详情');
  } else if (active === 'providers-reference' || active === 'providers-health') {
    const listRoute = '#/admin-2/' + channelManagementListRoute('providers-reference', params);
    const detail = active === 'providers-reference' && Boolean(params.get('connection'));
    add(page.areaLabel, active === 'providers-health' ? listRoute : null);
    add(page.label, detail ? listRoute : null);
    if (detail) add(names.connection || '连接不存在');
  } else if (active === 'provider-materials') {
    const provider = params.has('provider');
    add('基础资料', '#/admin-2/model-templates');
    add('服务商', provider || view ? href(active, {}, ['provider', 'view', 'tab', 'edit', 'returnTo', 'modelQ', 'modelPage']) : null);
    if (provider) add(names.provider || '服务商不存在', view === 'modelImport' ? href(active, { tab: 'models' }, ['view', 'edit']) : null);
    const label = { new: '新建服务商', import: '批量导入服务商资料', relations: '批量导入供应关系', modelImport: '批量导入并添加' };
    if (Object.hasOwn(label, view)) add(label[view]);
  } else if (active === 'listing-new' && params.has('service')) {
    add(page.label, href(active, {}, ['service', 'tab']));
    add('服务详情');
  } else if (active === 'model-templates') {
    add('基础资料', '#/admin-2/model-templates');
    const label = view === 'classification' ? CLASSIFICATION_KINDS[classificationKind(params)] : page.label;
    add(label, view && !['templates', 'classification'].includes(view) ? listHref : null);
    if (view === 'template') add(params.has('template') ? names.model || '模型资料不存在' : '新建模型资料');
    else if (view === 'templateImport') add('批量导入模型资料');
  } else if (active === 'model-prices' && params.has('service')) {
    add(page.label,href(active,{},['association','provider','service','edit','tab','add']));
    add('模型售卖');
  } else if (active === 'tariff-dictionary') {
    const tab = params.get('tab');
    add('基础资料', '#/admin-2/model-templates');
    add(TARIFF_KINDS[Object.hasOwn(TARIFF_KINDS, tab) ? tab : 'scenario']);
  } else if (active === 'deployments') {
    add('模型部署', params.has('deployment') || view === 'create' ? href(active, {}, ['deployment', 'view', 'tab']) : null);
    if (params.has('deployment')) add(names.deployment || '部署不存在', view === 'edit' ? href(active, { view: null, tab: 'overview' }) : null);
    if (view === 'create' || view === 'edit') add(view === 'edit' ? '更新部署配置' : '部署模型');
  } else if (active === 'customer-analysis-detail') {
    add('租户数据', href('customer-analysis', {}, ['customer', 'source']));
    add('租户详情');
  } else if (active === 'customer-usage-detail') {
    if (names.internal) {
      add('租户管理', '#/admin-2/tenants');
    } else {
      add('用户数据', href('user-analysis', {}, ['customer']));
    }
    add(names.customer || '租户不存在');
  } else if (active === 'projects') {
    const detail = params.has('project');
    add(page.label, detail ? adminProjectListHref(params) : null);
    if (detail) add(names.project || '项目不存在');
  } else if (active === 'organization-members') {
    add('租户管理', '#/admin-2/tenants');
    add(page.label);
  } else if (active === 'tenants') {
    const key = params.has('personal') ? 'personal' : 'enterprise';
    add(page.label,
      params.has(key) ? href(active, {}, [key, 'tab', 'create']) : null);
    if (params.has('create')) add('开通租户');
    if (params.has(key)) add(names[key] || '租户不存在');
  } else {
    if (page.areaLabel !== page.label) {
      const module = sections.flatMap(group => group.items).find(item => item.id === page.area);
      add(page.areaLabel, module ? `#/admin-2/${module.children[0][0]}` : null);
    }
    if (page.label !== page.group) add(page.label);
  }
  return crumbs;
}
