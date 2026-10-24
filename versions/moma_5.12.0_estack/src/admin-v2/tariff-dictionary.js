import { MOMA_BILLING_ITEMS } from './moma-billing-items.js';

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
  const scenario = [
    [1, '输入 Token', 'Input tokens', 1, '普通输入部分；缓存读取、写入按供应商规则分别配置。'],
    [2, '输出 Token', 'Output tokens', 1, '按模型生成的输出 Token 数量计费。'],
    [3, '缓存读取 Token', 'Cache read tokens', 1, '命中提示词缓存、从缓存读取的输入 Token。'],
    [4, '缓存写入 Token', 'Cache write tokens', 1, '写入提示词缓存的输入 Token；供应商单独收费时配置。'],
    [11, '缓存写入 Token（5 分钟）', 'Cache write tokens (5m)', 1, '缓存有效期为 5 分钟的写入 Token；有效期不是计量单位。'],
    [12, '缓存写入 Token（1 小时）', 'Cache write tokens (1h)', 1, '缓存有效期为 1 小时的写入 Token；有效期不是计量单位。'],
    [13, '图像输入 Token', 'Image input tokens', 1, '输入图片经模型分词后的 Token，适用于按 Token 计费的图像模型。'],
    [14, '图像输出 Token', 'Image output tokens', 1, '生成图片对应的输出 Token；与按张计费项按实际口径选择。'],
    [15, '音频输入 Token', 'Audio input tokens', 1, '输入音频对应的 Token，适用于实时语音等按 Token 计费的接口。'],
    [16, '音频输出 Token', 'Audio output tokens', 1, '模型生成音频对应的输出 Token。'],
    [9, '向量输入 Token', 'Embedding input tokens', 1, '按向量化请求的输入 Token 计费。'],
    [17, '重排输入 Token', 'Rerank input tokens', 1, '适用于按 Token 计费的重排接口，与按请求计费项按实际口径选择。'],
    [10, '重排请求数', 'Rerank requests', 6, '适用于按请求次数计费的重排服务，单次计量范围以供应商规则为准。'],
    [5, '图像输出（按张）', 'Image output (per image)', 2, '按生成或编辑后的图片数量计费；分辨率等规格可另建计费项。'],
    [6, '视频输出时长', 'Video output duration', 3, '按生成视频的时长计费；分辨率、是否含音频等规格可另建计费项。'],
    [18, '图像输入（按张）', 'Image input (per image)', 2, '按输入图片数量计费；免费张数、分辨率等条件以供应商报价为准。'],
    [19, '视频输入时长', 'Video input duration', 3, '按输入视频时长计费，适用的输出分辨率等条件以供应商报价为准。'],
    [20, '视频输入 Token', 'Video input tokens', 1, '按输入视频转换后的 Token 计费，与按时长计费区分。'],
    [21, 'Token 用量', 'Token usage', 1, '供应商未区分输入输出的 Token 单价，按报价条件使用。'],
    [22, '输入 TPM 预留', 'Reserved input TPM', 7, '按预留输入吞吐规格和月份计费，不是按量 Token 单价。'],
    [23, '输出 TPM 预留', 'Reserved output TPM', 7, '按预留输出吞吐规格和月份计费，不是按量 Token 单价。'],
    [24, '资源包', 'Resource package', 8, '按完整资源包计费，规格和有效期见适用条件。'],
    [25, '图像及视频输入 Token', 'Image and video input tokens', 1, '适用于供应商将图片和视频输入合并报价的 Token 计费项。'],
    [7, '音频输入时长', 'Audio input duration', 4, '适用于按音频时长收费的语音识别等接口。'],
    [8, '语音合成字符数', 'Speech synthesis characters', 5, '按待合成语音的文本字符数量计费。'],
  ];
  const unit = [[1, '百万 Token', 'Million tokens'], [2, '张', 'Image'], [3, '秒', 'Second'], [4, '分钟', 'Minute'], [5, '万字符', '10,000 characters'], [6, '千次', '1,000 requests'], [7, '千 TPM·月', '1,000 TPM-month'], [8, '包', 'Package']];
  const currency = [[1, '人民币', 'Chinese yuan', 'CNY'], [2, '美元', 'US dollar', 'USD']];
  return [...Object.entries({ scenario, unit, currency }).flatMap(([kind, entries]) => entries.map(([key, name, englishName, reference, description]) => ({ id: `tariff-${kind}-${key}`, kind, name, englishName, ...(kind === 'currency' ? { code: reference } : kind === 'scenario' ? { unitId: `tariff-unit-${reference}`, description } : {}), status: '已启用', builtin: true }))), ...MOMA_BILLING_ITEMS.map(item => ({ ...item }))];
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
