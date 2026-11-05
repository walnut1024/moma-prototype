import catalogues from './catalogues.json' with {type:'json'};
import config from './application.json' with { type: 'json' };
export const APPLICATION_CONFIG = config;
export function initialApplicationData(now = Date.now()) {
  const state = JSON.parse(JSON.stringify(config.initial), (_key, value) => typeof value === 'string' && /^@now:-?\d+$/.test(value) ? new Date(now + Number(value.slice(5))).toISOString() : value);
  for(const group of [config.personal,config.enterpriseOrganization])for(const [key,rows]of Object.entries(group))state[key].push(...structuredClone(rows));
  state.tariffDictionary=initialTariffDictionary();
  state.users.push(...catalogues['organization-data.mjs'].platformAccounts.map((row,index)=>({id:'platform-account-'+index,name:row.name,login:row.account,phone:row.phone || '',status:'正常',invitable:true,createdAt:state.updatedAt})));
  state.initialData = { id: config.id, version: config.version, builtinIds: Object.fromEntries(Object.entries(state).filter(([, value]) => Array.isArray(value)).map(([key, rows]) => [key, rows.map(row => row.id)])), userIds: {} };
  return state;
}
export const initialPersonalData = () => structuredClone(config.personal);
export const initialEnterpriseOrganization = () => structuredClone(config.enterpriseOrganization);
export const initialTariffDictionary = () => structuredClone(config.tariffDictionary);
export const initialOrganizationData = () => structuredClone(config.organization);
export function trackUserConfiguration(before, after) {
  if (!before.initialData) return;
  const userIds = structuredClone(before.initialData.userIds);
  for (const key of Object.keys(before.initialData.builtinIds)) {
    if(['audits','requests','identityEvents'].includes(key))continue;
    if (!Array.isArray(before[key]) || !Array.isArray(after[key])) continue;
    const originals = new Map(before[key].filter(row=>!row.id?.startsWith('usage-demo-')).map(row => [row.id, JSON.stringify(row)]));
    const rows=after[key].filter(row=>!row.id?.startsWith('usage-demo-')),remaining=new Set(rows.map(row=>row.id));
    const changes = rows.filter(row => originals.get(row.id) !== JSON.stringify(row)).map(row => row.id);
    const removed = [...originals.keys()].filter(id=>!remaining.has(id));
    if (changes.length || removed.length) userIds[key] = [...new Set([...(userIds[key] || []), ...changes, ...removed])];
  }
  after.initialData = { ...before.initialData, userIds };
}
export function validateApplicationConfig() {
  const state = initialApplicationData(0);
  for (const [key, rows] of Object.entries(state)) if (Array.isArray(rows) && (rows.some(row => !row.id) || new Set(rows.map(row => row.id)).size !== rows.length)) throw Error(`初始配置 ${key} ID 缺失或重复`);
  for (const key of state.apiKeys) if (!state.tenants.some(row => row.id === key.tenantId) || !state.projects.some(row => row.id === key.projectId && row.tenantId === key.tenantId)) throw Error('初始 API Key 客户或项目引用无效');
  for (const order of state.orders) if (!state.tenants.some(row => row.id === order.tenantId) || !state.products.some(row => row.id === order.productId)) throw Error('初始订单引用无效');
  for (const row of state.memberships) if (!state.users.some(user => user.id === row.userId) || !state.tenants.some(tenant => tenant.id === row.tenantId)) throw Error('初始成员身份引用无效');
  return config;
}
