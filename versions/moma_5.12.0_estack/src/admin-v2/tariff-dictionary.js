import { isResourceId } from '../resource-id.mjs';
import { initialTariffDictionary } from '../mock/application-data.js';
import { TARIFF_KINDS } from './tariff-kinds.mjs';
import { tariffUnitBase } from './tariff-metering.js';

export { TARIFF_KINDS };
export async function tariffDictionaryId(id) {
  if (['billing-item', 'billing-unit', 'currency'].some(type => isResourceId(id, type))) return id;
  // Keep stored references intact; derive a stable UUIDv5 for the compact list identifier.
  const namespace = Uint8Array.from('6ba7b8119dad11d180b400c04fd430c8'.match(/../g), hex => parseInt(hex, 16));
  const name = new TextEncoder().encode(`https://moma-prototype.pages.dev/tariff-dictionary/${id}`);
  const input = new Uint8Array(namespace.length + name.length);
  input.set(namespace); input.set(name, namespace.length);
  const uuid = new Uint8Array(await crypto.subtle.digest('SHA-1', input)).slice(0, 16);
  uuid[6] = uuid[6] & 0x0f | 0x50;
  uuid[8] = uuid[8] & 0x3f | 0x80;
  return btoa(String.fromCharCode(...uuid)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
const removedScenarioNames = new Set(['长视频生成', '输入', '输出', '缓存读取', '缓存写入', '图像生成', '视频生成', '语音识别', '语音合成', '向量生成', '重排']);
export function tariffDictionarySeed() {
  return initialTariffDictionary().map(item => {
    if (item.kind !== 'scenario') return item;
    const {status: _status, ...entry} = item;
    return entry;
  });
}

export function tariffDictionaryEntries(state) {
  const saved = state.tariffDictionary.filter(item => item.builtin && (item.kind !== 'scenario' || !removedScenarioNames.has(item.name)));
  const ids = new Set(saved.map(item => item.id)), names = new Set(saved.map(item => item.kind + ':' + item.name.toLowerCase())), codes = new Set(saved.filter(item => item.kind === 'currency').map(item => item.code));
  const seed = tariffDictionarySeed();
  return [...saved, ...seed.filter(item => !ids.has(item.id) && !names.has(item.kind + ':' + item.name.toLowerCase()) && (item.kind !== 'currency' || !codes.has(item.code)))].map(item => {
    if (item.kind !== 'scenario') return item;
    const {status: _status, ...entry} = item;
    return entry;
  });
}

export function normalizeTariffName(kind, input) {
  if (!Object.hasOwn(TARIFF_KINDS, kind)) throw new Error('请选择计费项、计费单位或货币');
  const name = typeof input === 'string' ? input.trim().replace(/[\t ]+/g, ' ') : '';
  if (!name || /[\r\n]/.test(name) || name.length > (kind === 'unit' ? 40 : 80)) throw new Error(`${TARIFF_KINDS[kind]}须为 1–${kind === 'unit' ? 40 : 80} 字，不能换行`);
  return name;
}

export function normalizeCurrency(input) {
  if (typeof input !== 'string' || !Intl.supportedValuesOf('currency').includes(input)) throw new Error('货币代码须为有效的三位大写 ISO 4217 代码，如 CNY、USD');
  return input;
}

export const tariffOptions = (state, kind) => tariffDictionaryEntries(state).filter(item => item.kind === kind && (kind === 'scenario' || item.status === '已启用')).map(item => kind === 'currency' ? item.code : item.name);

export function tariffScenarioUnit(state, name) {
  const scene = tariffDictionaryEntries(state).find(item => item.kind === 'scenario' && item.name === name);
  return tariffDictionaryEntries(state).find(item => item.kind === 'unit' && item.id === scene?.unitId && item.status === '已启用')?.name || '';
}

export function tariffScenarioUnits(state, name) {
  const unit = tariffScenarioUnit(state, name);
  if (!unit) return [];
  const base = tariffUnitBase(unit);
  if (!base || name.endsWith('（按秒）')) return [unit];
  return tariffOptions(state, 'unit').filter(option => tariffUnitBase(option) === base);
}

export function appendCommonTariffScenarios(rows, selected, state, currency) {
  const available = tariffOptions(state, 'scenario');
  if (!Array.isArray(selected) || !selected.length) throw new Error('请至少选择一个常用计费项');
  if (selected.some(name => !available.includes(name))) throw new Error('常用计费项已变化，请重新选择');
  const existing = new Set(rows.map(item => item.name.trim().toLowerCase()));
  const additions = available.filter(name => selected.includes(name) && !existing.has(name.toLowerCase()));
  if (!additions.length) throw new Error('所选计费项均已添加');
  const retained = rows.filter(item => item.name.trim() || item.listPrice !== '' && item.listPrice != null || item.unit || item.currency && item.currency !== currency);
  if (retained.length + additions.length > 100) throw new Error('每个模型最多配置 100 条计费项，请减少选择');
  return [...retained, ...additions.map(name => ({ name, unit: tariffScenarioUnit(state, name), currency, listPrice: '' }))];
}

export function commonTariffNames(names,modelType) {
  const common=/^(输入 Token|输出 Token|缓存读取 Token|缓存写入 Token)$/;
  const related={text:common,multimodal:/^(输入 Token|输出 Token|缓存读取 Token|缓存写入 Token|图像输入 Token|音频输入 Token|音频输出 Token)$/,audio:/音频|语音|字符|分钟/,image:/图片|图像|张/,video:/视频|秒/,embedding:/输入 Token|向量/,rerank:/重排|次|输入 Token/}[modelType];
  return related?names.filter(name=>related.test(name)):names;
}
