import { pages, sections } from './navigation.mjs';
import { TARIFF_KINDS } from './tariff-dictionary.js';

export function adminBreadcrumbs(active, params, names = {}) {
  const page = pages[active];
  const href = (id, patch = {}, omit = []) => {
    const next = new URLSearchParams(params);
    omit.forEach(key => next.delete(key));
    Object.entries(patch).forEach(([key, value]) => value == null ? next.delete(key) : next.set(key, value));
    return `#/admin-2/${id}${next.size ? '?' + next : ''}`;
  };
  const detailKeys = ['model', 'provider', 'view', 'tab', 'step', 'template', 'return', 'supply', 'endpoint', 'connection', 'deployment', 'chosen', 'draft', 'catalogue', 'origin', 'onboarding', 'returnModel', 'returnDraft', 'library', 'code'];
  const listingReturn = params.get('listingReturn');
  const listHref = active === 'listing' && /^#\/admin-2\/listing(?:\?|$)/.test(listingReturn || '') ? listingReturn : href(active, {}, [...detailKeys, 'listingReturn', 'returnListing', 'batchMode', 'materialTab']);
  const crumbs = [{ label: page.group }];
  const add = (label, target) => crumbs.push({ label, ...(target ? { href: target } : {}) });
  const view = params.get('view');
  if (active === 'package-production') {
    const labels = { new: '新增套餐', edit: '编辑套餐', detail: '套餐详情' };
    const label = Object.hasOwn(labels, view) ? labels[view] : null;
    add(page.label, label ? href(active, {}, ['view', 'package']) : null);
    if (label) add(label);
  } else if (active === 'package-data' && params.get('package')) {
    add(page.label, href(active, {}, ['package']));
    add('套餐详情');
  } else if (active === 'providers') {
    add('渠道接入');
  } else if (active === 'provider-materials') {
    const provider = params.has('provider');
    add('模型资料', '#/admin-2/model-templates');
    add('服务商', provider || view ? href(active, {}, ['provider', 'view', 'tab', 'edit', 'returnTo', 'modelQ', 'modelPage']) : null);
    if (provider) add(names.provider || '服务商不存在');
    const label = { new: '添加服务商', import: '批量导入服务商资料', relations: '批量导入供应关系', modelImport: '批量导入并登记' };
    if (Object.hasOwn(label, view)) add(label[view]);
  } else if (active === 'listing' && view === 'onboarding') {
    add(names.onboardingIntent==='reserve'?'准备备用供应':names.onboardingIntent==='activate'?'投入当前服务':'接入并上架模型');
  } else if (['listing', 'model-templates'].includes(active)) {
    if (active === 'model-templates') add('模型资料', '#/admin-2/model-templates');
    add(active === 'listing' ? '模型服务' : '模型', view && view !== 'templates' ? listHref : null);
    if (view === 'template') add(params.has('template') ? names.model || '模型资料不存在' : '新建模型资料');
    else if (['import', 'templateImport'].includes(view)) add(view === 'import' ? '批量导入模型' : '批量导入模型资料');
    else if (view === 'add') add('添加模型');
    else if (view === 'onboarding') add('接入模型');
    else if (view === 'supplier-batch') add('批量配置与上架');
  } else if (active === 'model-prices' && params.has('service')) {
    add(page.label,href(active,{},['association','provider','service','edit','tab']));
    add('服务售价详情');
  } else if (active === 'tariff-dictionary') {
    const tab = params.get('tab');
    add('模型资料', '#/admin-2/model-templates');
    add(TARIFF_KINDS[Object.hasOwn(TARIFF_KINDS, tab) ? tab : 'scenario']);
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
