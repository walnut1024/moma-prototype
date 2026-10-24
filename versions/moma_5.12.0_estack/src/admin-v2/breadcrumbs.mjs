import { pages, sections } from './navigation.mjs';

export function adminBreadcrumbs(active, params, names = {}) {
  const page = pages[active];
  const href = (id, patch = {}, omit = []) => {
    const next = new URLSearchParams(params);
    omit.forEach(key => next.delete(key));
    Object.entries(patch).forEach(([key, value]) => value == null ? next.delete(key) : next.set(key, value));
    return `#/admin-2/${id}${next.size ? '?' + next : ''}`;
  };
  const detailKeys = ['model', 'provider', 'view', 'tab', 'step', 'template', 'return', 'supply', 'endpoint', 'connection', 'deployment', 'chosen', 'draft', 'catalogue', 'origin', 'onboarding'];
  const listHref = href(active, {}, detailKeys);
  const crumbs = [{ label: page.group }];
  const add = (label, target) => crumbs.push({ label, ...(target ? { href: target } : {}) });
  const view = params.get('view');
  if (active === 'providers') {
    const workspace = href(active, { view: null, tab: view === 'profile' ? 'basic' : params.get('tab'), endpoint: null, q: null, page: null, listQ: null, listPage: null });
    add('供应商', view ? workspace : null);
    if (view === 'new') add('添加供应商');
    else if (view === 'profile') add('编辑供应商资料');
  } else if (['listing', 'model-templates'].includes(active)) {
    add(active === 'listing' ? '模型管理' : '模型资料', params.has('model') || view && view !== 'templates' ? listHref : null);
    if (view === 'template') add(params.has('template') ? '编辑模型资料' : '新建模型资料');
    else if (['import', 'templateImport'].includes(view)) add(view === 'import' ? '批量导入模型' : '批量导入模型资料');
    else if (view === 'add') add('添加模型');
    else if (params.has('model')) {
      add(names.model || '模型不存在', view ? href('listing', { view: null, step: null, supply: null, return: null }) : null);
      if (view) add(view === 'price' || params.get('step') === 'price' ? '配置售价' : '接入供应商');
    }
  } else if (active === 'deployments') {
    add('模型部署', params.has('deployment') || view === 'create' ? href(active, {}, ['deployment', 'view', 'tab']) : null);
    if (params.has('deployment')) add(names.deployment || '部署不存在', view === 'edit' ? href(active, { view: null, tab: 'overview' }) : null);
    if (view === 'create' || view === 'edit') add(view === 'edit' ? '更新部署配置' : '部署模型');
  } else if (active === 'customer-usage-detail') {
    add('用户数据', href('user-analysis', {}, ['customer']));
    add(names.customer || '客户不存在');
  } else if (active === 'tenants' || active === 'individual-users') {
    const key = active === 'tenants' ? 'enterprise' : 'user';
    add(page.label, params.has(key) ? href(active, {}, [key, 'tab', 'project']) : null);
    if (params.has(key)) add(names[key] || (key === 'enterprise' ? '企业不存在' : '用户不存在'));
  } else {
    if (page.areaLabel !== page.label) {
      const module = sections.flatMap(group => group.items).find(item => item.id === page.area);
      add(page.areaLabel, module ? `#/admin-2/${module.children[0][0]}` : null);
    }
    if (page.label !== page.group) add(page.label);
  }
  return crumbs;
}
