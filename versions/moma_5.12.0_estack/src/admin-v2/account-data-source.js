import { APPLICATION_CONFIG } from '../mock/application-data.js';

const sampleTenantIds = new Set([
  ...APPLICATION_CONFIG.initial.tenants.map(tenant => tenant.id),
  ...APPLICATION_CONFIG.personal.tenants.map(tenant => tenant.id),
]);

const managedSourceLabels = {
  builtin: '内置演示',
  admin: '后台开通',
  registration: '用户注册',
};

const sourceLabels = {
  ...managedSourceLabels,
  sample: '导入样例',
  unknown: '未记录',
};

export function accountDataSource(tenant) {
  if (sampleTenantIds.has(tenant.id) || tenant.source === 'mock') return 'sample';
  if (tenant.source === '内置演示') return 'builtin';
  if (tenant.source === '后台创建') return 'admin';
  if (tenant.source === '手机号注册') return 'registration';
  return 'unknown';
}

export const accountDataSourceLabel = tenant => sourceLabels[accountDataSource(tenant)];
export const isManagedCustomerAccount = tenant => Object.hasOwn(managedSourceLabels, accountDataSource(tenant));
export const accountDataSourceOptions = [['all', '全部来源'], ...Object.entries(managedSourceLabels)];
