import { initialTariffDictionary } from '../mock/application-data.js';

export const TARIFF_KINDS = { scenario: '计费项', unit: '计价单位', currency: '货币' };
export async function tariffDictionaryId(id) {
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
  return initialTariffDictionary();
}

export function tariffDictionaryEntries(state) {
  const saved = state.tariffDictionary.filter(item => item.kind !== 'scenario' || !removedScenarioNames.has(item.name));
  const ids = new Set(saved.map(item => item.id)), names = new Set(saved.map(item => item.kind + ':' + item.name.toLowerCase())), codes = new Set(saved.filter(item => item.kind === 'currency').map(item => item.code));
  return [...saved, ...tariffDictionarySeed().filter(item => !ids.has(item.id) && !names.has(item.kind + ':' + item.name.toLowerCase()) && (item.kind !== 'currency' || !codes.has(item.code)))];
}

export function normalizeTariffName(kind, input) {
  if (!Object.hasOwn(TARIFF_KINDS, kind)) throw new Error('请选择计费项、计价单位或货币');
  const name = typeof input === 'string' ? input.trim().replace(/[\t ]+/g, ' ') : '';
  if (!name || /[\r\n]/.test(name) || name.length > (kind === 'unit' ? 40 : 80)) throw new Error(`${TARIFF_KINDS[kind]}须为 1–${kind === 'unit' ? 40 : 80} 字，不能换行`);
  return name;
}

export function normalizeCurrency(input) {
  if (typeof input !== 'string' || !Intl.supportedValuesOf('currency').includes(input)) throw new Error('货币代码须为有效的三位大写 ISO 4217 代码，如 CNY、USD');
  return input;
}

export const tariffOptions = (state, kind) => tariffDictionaryEntries(state).filter(item => item.kind === kind && item.status === '已启用').map(item => kind === 'currency' ? item.code : item.name);

export function tariffScenarioUnit(state, name) {
  const scene = tariffDictionaryEntries(state).find(item => item.kind === 'scenario' && item.status === '已启用' && item.name === name);
  return tariffDictionaryEntries(state).find(item => item.kind === 'unit' && item.id === scene?.unitId && item.status === '已启用')?.name || '';
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

export function tariffDictionaryTransaction(state, data) {
  const current = tariffDictionaryEntries(state).find(item => item.id === data.id);
  if (current?.builtin) throw new Error('内置字典项只读，不可编辑、停用或删除');
  let change, label;
  if (data.operation === 'save') {
    if (data.id && !current) throw new Error('字典条目不存在，请重新载入');
    const kind = current?.kind || data.kind, name = normalizeTariffName(kind, data.name);
    if (kind === 'scenario' && removedScenarioNames.has(name)) throw new Error('该旧计费项已移除，请使用明确计量对象的名称，如输入 Token、视频输出时长');
    const englishName = typeof data.englishName === 'string' ? data.englishName.trim().replace(/[\t ]+/g, ' ') : '';
    if (!/^[\x20-\x7e]{1,80}$/.test(englishName) || !/[a-z]/i.test(englishName)) throw new Error('英文名称须为 1–80 个英文字符，至少包含一个字母，不能换行');
    const fields = { name, englishName, ...(kind === 'currency' ? { code: normalizeCurrency(data.code) } : {}) };
    if (tariffDictionaryEntries(state).some(item => item.id !== current?.id && item.kind === kind && (item.name.toLowerCase() === name.toLowerCase() || kind === 'currency' && item.code === fields.code))) throw new Error('同类字典名称或货币代码已存在，请编辑或启用已有条目');
    if (kind === 'scenario') {
      const description = data.description == null ? '' : data.description;
      if (typeof description !== 'string' || /[\r\n]/.test(description) || description.trim().length > 160) throw new Error('计费说明最多 160 字，不能换行');
      fields.description = description.trim();
      const unit = tariffDictionaryEntries(state).find(item => item.kind === 'unit' && item.id === data.unitId);
      if (!unit || unit.status !== '已启用' && current?.unitId !== unit.id) throw new Error('请选择已启用的计价单位');
      fields.unitId = unit.id;
    }
    if (!current && tariffDictionaryEntries(state).filter(item => item.kind === kind).length >= 200) throw new Error('每类字典最多维护 200 个条目');
    change = current ? { type: 'update', collection: 'tariffDictionary', id: current.id, changes: fields } : { type: 'add', collection: 'tariffDictionary', record: { id: `tariff-${crypto.randomUUID()}`, kind, ...fields, status: '已启用', builtin: false } };
    label = `保存${TARIFF_KINDS[kind]}`;
  } else if (data.operation === 'status') {
    if (!current || !['已启用', '已停用'].includes(data.status)) throw new Error('字典条目或状态无效');
    change = { type: 'update', collection: 'tariffDictionary', id: current.id, changes: { status: data.status } };
    label = `${data.status === '已启用' ? '启用' : '停用'}${TARIFF_KINDS[current.kind]}`;
  } else if (data.operation === 'delete') {
    if (!current) throw new Error('字典条目不存在，请重新载入');
    if (current.kind === 'unit' && tariffDictionaryEntries(state).some(item => item.kind === 'scenario' && item.unitId === current.id)) throw new Error('该计价单位仍被计费项引用，请先更换关联单位');
    change = { type: 'remove', collection: 'tariffDictionary', id: current.id };
    label = `删除自定义${TARIFF_KINDS[current.kind]}`;
  } else throw new Error('未知资费字典操作');
  return { type: 'batch', objectId: current?.id || change.record.id, label, changes: [change] };
}
