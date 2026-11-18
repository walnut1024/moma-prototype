import { pages, sections } from './navigation.mjs';
import { TARIFF_KINDS } from './tariff-dictionary.js';

export function adminBreadcrumbs(active, params, names = {}) {
  const page = pages[active];
  if (['providers', 'listing', 'model-market', 'model-prices'].includes(active) && params.get('resourceJson') === '1') {
    const origin = new URLSearchParams(params);
    origin.delete('resourceJson');
    origin.delete('resourceTarget');
    const crumbs = adminBreadcrumbs(active, origin, names);
    return [...crumbs.slice(0, -1), { ...crumbs.at(-1), href: `#/admin-2/${active}${origin.size ? '?' + origin : ''}` }, { label: '维护 JSON' }];
  }
  const href = (id, patch = {}, omit = []) => {
    const next = new URLSearchParams(params);
    omit.forEach(key => next.delete(key));
    Object.entries(patch).forEach(([key, value]) => value == null ? next.delete(key) : next.set(key, value));
    return `#/admin-2/${id}${next.size ? '?' + next : ''}`;
  };
  const detailKeys = ['model', 'provider', 'view', 'tab', 'step', 'template', 'return', 'supply', 'endpoint', 'connection', 'deployment', 'chosen', 'draft', 'catalogue', 'origin', 'onboarding', 'returnModel', 'returnDraft', 'library', 'code'];
  const listingReturn = params.get('listingReturn');
  const listHref = active === 'listing' && /^#\/admin-2\/listing(?:\?|$)/.test(listingReturn || '') ? listingReturn : href(active, {}, [...detailKeys, 'listingReturn', 'returnListing', 'batchMode', 'materialTab']);
  const currentHref = href(active);
  const group = sections.find(section => section.id === page.groupId);
  const groupHome = group.home || group.items[0].children[0][0];
  const crumbs = [];
  const add = (label, target) => crumbs.push({ label, ...(target && target !== currentHref ? { href: target } : {}) });
  add(page.group, group.direct || ['models', 'commerce'].includes(group.id) ? null : `#/admin-2/${groupHome}`);
  const view = active === 'listing' && params.get('view') === 'add' ? null : params.get('view');
  if (active === 'package-production') {
    const labels = { new: '新增套餐', edit: '编辑套餐', detail: '套餐详情' };
    const label = Object.hasOwn(labels, view) ? labels[view] : null;
    add(page.label, label ? href(active, {}, ['view', 'package']) : null);
    if (label) add(label);
  } else if (active === 'package-data' && params.get('package')) {
    add(page.label, href(active, {}, ['package']));
    add('套餐详情');
  } else if (active === 'providers') {
    const modelView = params.get('perspective') === 'models';
    const provider = params.has('provider') && !modelView;
    const model = modelView && params.has('supplyModel');
    const keys = ['listQ', 'listPage', 'modelListQ', 'modelListPage'];
    const list = new URLSearchParams();
    for (const key of keys) if (params.has(key)) list.set(key, params.get(key));
    add(page.label, provider || modelView ? '#/admin-2/providers' + (list.size ? '?' + list : '') : null);
    if (modelView) {
      list.set('perspective', 'models');
      add('模型', model ? '#/admin-2/providers?' + list : null);
      if (model) add('模型详情');
    }
    if (provider) add(names.provider || '服务商不存在', view === 'modelImport' ? href(active, {}, ['view']) : null);
    if (provider && view === 'modelImport') add('批量新增');
  } else if (active === 'provider-materials') {
    const provider = params.has('provider');
    add('模型资料', '#/admin-2/model-templates');
    add('服务商', provider || view ? href(active, {}, ['provider', 'view', 'tab', 'edit', 'returnTo', 'modelQ', 'modelPage']) : null);
    if (provider) add(names.provider || '服务商不存在', view === 'modelImport' ? href(active, { tab: 'models' }, ['view', 'edit']) : null);
    const label = { new: '添加服务商', import: '批量导入服务商资料', relations: '批量导入供应关系', modelImport: '批量导入并登记' };
    if (Object.hasOwn(label, view)) add(label[view]);
  } else if (active === 'listing' && view === 'onboarding') {
    add(names.onboardingIntent==='reserve'?'准备备用供应':names.onboardingIntent==='activate'?'投入当前服务':'接入并上架模型');
  } else if (['listing', 'model-templates'].includes(active)) {
    if (active === 'model-templates') add('模型资料', '#/admin-2/model-templates');
    const modelDetail = active === 'listing' && !view && params.has('model');
    const serviceHome = modelDetail ? href(active, { perspective: params.get('perspective') || 'models' }, [
      'model', 'panel', 'tab', 'service', 'mapping', 'routeProvider', 'providerEdit', 'providerAdd',
      'identityProvider', 'providerChannels', 'providerAssociate', 'listingReturn', 'returnTo', 'view', 'sourceLibrary',
    ]) : null;
    add(page.label, modelDetail ? serviceHome : view && view !== 'templates' ? listHref : null);
    if (modelDetail) add(names.model || '未找到指定模型');
    else if (view === 'template') add(params.has('template') ? names.model || '模型资料不存在' : '新建模型资料');
    else if (['import', 'templateImport'].includes(view)) add(view === 'import' ? '批量导入模型' : '批量导入模型资料');
    else if (view === 'onboarding') add('接入模型');
    else if (view === 'supplier-batch') add('批量配置与上架');
  } else if (active === 'model-prices' && params.has('service')) {
    add(page.label,href(active,{},['association','provider','service','edit','tab','add']));
    add('销售配置');
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
  } else if (active === 'tenants' || active === 'users') {
    const key = active === 'tenants' ? params.has('personal') ? 'personal' : 'enterprise' : 'user';
    add(page.label, params.has(key) ? href(active, {}, [key, 'tab', 'project', 'create']) : null);
    if (params.has('create')) add('开通租户');
    if (params.has(key)) add(names[key] || (key === 'user' ? '用户不存在' : '租户不存在'));
  } else {
    if (page.areaLabel !== page.label) {
      const module = sections.flatMap(group => group.items).find(item => item.id === page.area);
      add(page.areaLabel, module ? `#/admin-2/${module.children[0][0]}` : null);
    }
    if (page.label !== page.group) add(page.label);
  }
  return crumbs;
}
