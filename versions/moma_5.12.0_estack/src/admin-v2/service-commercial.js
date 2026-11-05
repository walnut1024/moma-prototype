import { activeCustomer } from '../service-access.mjs';
import { billingItemKey, parseSaleAmount } from './provider-catalogue-pricing.js';
import { tariffOptions, normalizeCurrency } from './tariff-dictionary.js';

export const scopeTenants = state => state.tenants.filter(activeCustomer);
export function serviceScope(state, value) {
  if (!value || !['all', 'selected'].includes(value.openScope) || !Array.isArray(value.tenantIds) || value.tenantIds.some(id => typeof id !== 'string')) throw Error('请选择有效的开放客户');
  if (value.openScope === 'selected' && (!value.tenantIds.length || value.tenantIds.some(id => !scopeTenants(state).some(row => row.id === id)))) throw Error('请选择至少一个有效客户；已停用或删除的客户不能加入开放范围');
  return { openScope: value.openScope, tenantIds: value.openScope === 'selected' ? [...new Set(value.tenantIds)] : [] };
}
export function retailItems(state, rows, previous = []) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 100) throw Error('请配置 1–100 个计费项');
  const items = rows.map(item => {
    if (!item || typeof item !== 'object' || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 100 || typeof item.unit !== 'string' || !item.unit.trim() || item.unit.length > 100) throw Error('请填写有效的计费项、计价单位和货币');
    if (typeof item.condition !== 'string' || item.condition.length > 200 || /[\r\n]/.test(item.condition)) throw Error('计费条件最多 200 字，不能换行');
    const row = { name: item.name.trim(), unit: item.unit.trim(), condition: item.condition.trim(), currency: normalizeCurrency(item.currency), amount: parseSaleAmount(item.amount, true) };
    // Stored price snapshots remain usable after a dictionary entry is retired.
    if (!previous.some(old => billingItemKey(old) === billingItemKey(row))) {
      for (const [kind, value] of [['scenario', row.name], ['unit', row.unit], ['currency', row.currency]]) if (!tariffOptions(state, kind).includes(value)) throw Error('新增计费项、计价单位和货币须从模型资料的已启用字典中选择');
    }
    return row;
  });
  if (new Set(items.map(billingItemKey)).size !== items.length) throw Error('计费项、条件与单位不能重复');
  return items;
}
