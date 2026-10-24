import countries from './data/enterprise-countries.json' with { type: 'json' };
import chinaRegions from './data/enterprise-china.json' with { type: 'json' };

export { countries, chinaRegions };
// GB/T 4754—2017, including amendment 1: the complete 20 sections.
export const industries = [
  ['A', '农、林、牧、渔业'], ['B', '采矿业'], ['C', '制造业'],
  ['D', '电力、热力、燃气及水生产和供应业'], ['E', '建筑业'],
  ['F', '批发和零售业'], ['G', '交通运输、仓储和邮政业'], ['H', '住宿和餐饮业'],
  ['I', '信息传输、软件和信息技术服务业'], ['J', '金融业'], ['K', '房地产业'],
  ['L', '租赁和商务服务业'], ['M', '科学研究和技术服务业'],
  ['N', '水利、环境和公共设施管理业'], ['O', '居民服务、修理和其他服务业'],
  ['P', '教育'], ['Q', '卫生和社会工作'], ['R', '文化、体育和娱乐业'],
  ['S', '公共管理、社会保障和社会组织'], ['T', '国际组织'],
];

export function changeEnterpriseLocation(form, key, value) {
  return { ...form, [key]: value, ...(key === 'countryRegion' ? { province: '', city: '' } : key === 'province' ? { city: '' } : {}) };
}
