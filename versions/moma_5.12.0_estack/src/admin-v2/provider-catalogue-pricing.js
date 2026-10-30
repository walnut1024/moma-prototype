import { normalizeTariffName, normalizeCurrency } from './tariff-dictionary.js';

const scale = 1000000;
export const catalogueAmountInput = value => value == null ? '' : `${BigInt(value) / 1000000n}.${String(BigInt(value) % 1000000n).padStart(6, '0')}`.replace(/\.?0+$/, '');

export function catalogueMoneyDisplay(value) {
  if (value == null) return '—';
  const [whole, fraction = ''] = catalogueAmountInput(value).split('.');
  return `${BigInt(whole).toLocaleString('zh-CN')}.${fraction.padEnd(2, '0')}`;
}

function decimal(input, label, maximum = Number.MAX_SAFE_INTEGER) {
  if (input == null || input === '') return null;
  if (typeof input !== 'string' || !/^\d+(?:\.\d{1,6})?$/.test(input)) throw new Error(`${label}须为非负数，最多 6 位小数`);
  const [whole, fraction = ''] = input.split('.');
  const value = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0'));
  if (value > BigInt(maximum)) throw new Error(`${label}超出范围${maximum === scale ? '，须为 0–1' : ''}`);
  return Number(value);
}

export const normalizeCatalogueDiscount = input => decimal(input, '采购折扣系数', scale) ?? scale;

export function normalizeCataloguePrice(draft) {
  const discountFactor = normalizeCatalogueDiscount(draft.discountFactor);
  if (!Array.isArray(draft.scenarios) || draft.scenarios.length > 100) throw new Error('每个模型最多配置 100 条计费项');
  const seen = new Set();
  const scenarios = draft.scenarios.map(item => {
    const name = normalizeTariffName('scenario', item.name), unit = normalizeTariffName('unit', item.unit);
    const currency = normalizeCurrency(item.currency);
    const condition = item.condition == null ? '' : item.condition;
    if (typeof condition !== 'string' || /[\r\n]/.test(condition) || condition.trim().length > 160) throw new Error('适用条件最多 160 字，不能换行');
    const key = JSON.stringify([name, unit, currency, condition.trim()]);
    if (seen.has(key)) throw new Error('同一计费项、计价单位、货币和适用条件不可重复');
    seen.add(key);
    const purchasePrice = decimal(item.purchasePrice, '平台成本');
    return { name, unit, currency, ...(condition.trim() ? { condition: condition.trim() } : {}), listPrice: decimal(item.listPrice, '供应商目录价'), ...(purchasePrice == null ? {} : { purchasePrice }) };
  });
  return { modelId: draft.modelId, discountFactor, scenarios };
}

export function cataloguePriceDraft(entry) {
  return { discountFactor: catalogueAmountInput(entry?.discountFactor ?? scale), scenarios: (entry?.scenarios || []).map(item => ({ ...item, listPrice: catalogueAmountInput(item.listPrice), ...(item.purchasePrice == null ? {} : { purchasePrice: catalogueAmountInput(item.purchasePrice) }) })) };
}

export function cataloguePurchasePrice(listPrice, discountFactor, purchasePrice) {
  if (purchasePrice != null) {
    if (!Number.isSafeInteger(purchasePrice) || purchasePrice < 0) throw new Error('平台成本无效');
    return purchasePrice;
  }
  if (listPrice == null) return null;
  discountFactor ??= scale;
  if (!Number.isSafeInteger(listPrice) || listPrice < 0 || !Number.isSafeInteger(discountFactor) || discountFactor < 0 || discountFactor > scale) throw new Error('目录价或折扣系数无效');
  // Money stays in millionths of each row’s currency; round only after applying the discount.
  return Number((BigInt(listPrice) * BigInt(discountFactor) + 500000n) / 1000000n);
}

export function cataloguePurchasePriceInput(item, discountFactor) {
  return item.purchasePrice ?? catalogueAmountInput(cataloguePurchasePrice(decimal(item.listPrice, '供应商目录价'), normalizeCatalogueDiscount(discountFactor)));
}

export const billingItemKey = item => JSON.stringify([item.name, item.condition || "", item.unit, item.currency || "CNY"]);
export const parseSaleAmount = (value, required = true) => { const amount = decimal(value, "对外售价"); if (required && amount == null) throw new Error("适用售价必填；免费请填写 0"); return amount; };

export const saleItemsDraft = (cost, current = []) => cost.map(item => ({ name: item.name, condition: item.condition || '', unit: item.unit, currency: item.currency || 'CNY', amount: catalogueAmountInput(current.find(row => billingItemKey(row) === billingItemKey(item))?.amount) }));
export function markedUpItems(cost, percentage) {
  const ratio = decimal(percentage, '加价比例', 10000 * scale);
  if (ratio == null) throw new Error('请填写加价比例');
  if (!cost.length || cost.some(item => item.amount == null)) throw new Error('采购价缺失，不能按零成本计算');
  return cost.map(item => {
    const amount = (BigInt(item.amount) * (100000000n + BigInt(ratio)) + 50000000n) / 100000000n;
    if (amount > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('加价后的售价超出范围');
    return { ...item, amount: catalogueAmountInput(Number(amount)) };
  });
}
export function saleChange(current, draft) {
  if (current == null || draft == null || draft === '') return '—';
  try {
    const next = parseSaleAmount(draft);
    if (current === 0) return next === 0 ? '0.00%' : '免费 → 收费';
    const ratio = (next - current) / current * 100;
    return `${ratio > 0 ? '+' : ''}${ratio.toFixed(2)}%`;
  } catch { return '—'; }
}
