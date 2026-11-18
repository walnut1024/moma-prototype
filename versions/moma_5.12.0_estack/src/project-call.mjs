import { enterpriseTokenUsage } from './admin-v2/enterprise.js';
import { priceRequest, requestPrices } from './admin-v2/operations-analysis.js';
import { usageMeter, usageValue } from './admin-v2/usage-analysis.js';
import { projectModelEnabled } from './project-access.mjs';

export const PROJECT_CURRENCY = 'CNY';
const MICROS = 1_000_000;

export const formatRequestCharge = charge => (charge.micros / MICROS).toLocaleString('zh-CN', {
  style:'currency', currency:charge.currency, maximumFractionDigits:6,
});

export function chargeTotals(charges) {
  const totals = new Map();
  for (const charge of charges) {
    if (!charge) continue;
    totals.set(charge.currency, (totals.get(charge.currency) || 0) + charge.micros);
  }
  return [...totals].map(([currency,micros]) => formatRequestCharge({ currency,micros })).join(' / ');
}

export const projectCallErrors = {
  project_unavailable: [403, '该项目当前不可用'],
  project_model_not_enabled: [403, '该模型未在当前项目开通'],
  project_model_rate_limit_exceeded: [429, '已达到项目模型限流上限，请稍后重试'],
  project_budget_exceeded: [402, '已达到项目消费预算上限'],
  key_budget_exceeded: [402, '已达到 API Key 消费预算上限'],
  key_expired: [401, 'API Key 已过期'],
  budget_charge_unavailable: [503, '当前调用的人民币费用无法确认，不能执行预算校验'],
  project_token_usage_unavailable: [503, '当前调用的 Token 用量无法确认，不能执行 TPM 校验'],
};

export function parseBudgetAmount(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const amount = Math.round(Number(text) * MICROS);
  if (!/^\d+(\.\d{1,6})?$/.test(text) || !Number.isSafeInteger(amount) || amount <= 0) {
    throw Error('预算须为正数，最多保留 6 位小数');
  }
  return amount;
}

export function requestCharge(state, row, model, price = requestPrices(state, row).sale) {
  if (row.httpStatus < 200 || row.httpStatus >= 300 || !Number.isInteger(row.httpStatus) || row.billingStatus === 'not_billable') return null;
  const recorded = row.charge?.micros ?? (row.charge?.unit === 'micro' ? row.charge.amount : null);
  if (Number.isSafeInteger(recorded) && recorded >= 0 && /^[A-Z]{3}$/.test(row.charge.currency)) {
    return { micros:recorded, currency:row.charge.currency };
  }
  const value = usageValue(row, usageMeter(model, row).fields);
  const result = priceRequest(price, { ...row, value }, model);
  const micros = result && Math.round(result.amount * MICROS);
  return Number.isSafeInteger(micros) ? { micros, currency: result.currency } : null;
}

export function projectSpend(state, project, keyId, at = Date.now()) {
  let spent = 0, unpriced = 0;
  for (const row of state.requests) {
    if (row.tenantId !== project.tenantId || row.projectId !== project.id ||
        keyId && row.keyId !== keyId || !(Date.parse(row.createdAt) <= at) ||
        !(row.httpStatus >= 200 && row.httpStatus < 300) ||
        row.billingType === 'Token Plan' || row.billingStatus === 'not_billable') continue;
    const model = state.models.find(item => item.id === row.modelId) || { type: row.modelType };
    const charge = requestCharge(state, row, model);
    if (charge?.currency === PROJECT_CURRENCY) spent += charge.micros;
    else unpriced++;
  }
  return { spent, unpriced };
}

export function projectAccessError(project, modelId, key, at) {
  if (key?.expiresAt && !(Date.parse(key.expiresAt) > at)) return 'key_expired';
  if (!project || project.status !== '正常') return 'project_unavailable';
  if (!projectModelEnabled(project, modelId)) return 'project_model_not_enabled';
  return null;
}

export function planKeyBudgetExceeded(requests, key, units, excludeId) {
  if (!key?.planBudgetTokens) return false;
  const spent = requests.reduce((total, row) =>
    row.requestId !== excludeId && row.tenantId === key.tenantId && row.projectId === key.projectId &&
    row.keyId === key.id && row.httpStatus >= 200 && row.httpStatus < 300
      ? total + (row.planDeduction ?? row.planTokens ?? 0) : total, 0);
  return spent >= key.planBudgetTokens || units > key.planBudgetTokens - spent;
}

export function projectCallError(state, project, model, key, usage, charge, at = Date.now()) {
  const access = projectAccessError(project, model.id, key, at);
  if (access) return access;
  const limit = project.modelPermissions?.find(row => row.modelId === model.id);
  if (limit?.rpm || limit?.tpm) {
    const recent = state.requests.filter(row => {
      const time = Date.parse(row.admittedAt || row.createdAt);
      return row.tenantId === project.tenantId && row.projectId === project.id && row.modelId === model.id &&
        time > at - 60_000 && time <= at &&
        (row.admittedAt || (row.attempts ? row.attempts.some(attempt => attempt.dispatched) : row.httpStatus >= 200 && row.httpStatus < 300));
    });
    if (limit.rpm && recent.length >= limit.rpm) return 'project_model_rate_limit_exceeded';
    if (limit.tpm) {
      const tokenCount = rowUsage => rowUsage && (Number.isSafeInteger(rowUsage.input) || Number.isSafeInteger(rowUsage.output))
        ? enterpriseTokenUsage(model, rowUsage) : null;
      const counts = [...recent.map(row => tokenCount(row.usage)), tokenCount(usage)];
      if (counts.includes(null)) return 'project_token_usage_unavailable';
      if (counts.reduce((sum, tokens) => sum + tokens, 0) > limit.tpm) return 'project_model_rate_limit_exceeded';
    }
  }
  // Token Plan calls consume subscription entitlement. The subscription purchase belongs to the space.
  if (key?.billingType === 'Token Plan') {
    if (state.orders?.some(row => row.id === key.subscriptionId && row.packageId)) return null;
    return planKeyBudgetExceeded(state.requests,key,enterpriseTokenUsage(model,usage)) ? 'key_budget_exceeded' : null;
  }
  for (const [cap, keyId, code] of [
    [project.spendBudget?.stop && project.spendBudget.amountMicros, null, 'project_budget_exceeded'],
    [key?.budgetMicros, key?.id, 'key_budget_exceeded'],
  ]) {
    if (!cap) continue;
    const { spent } = projectSpend(state, project, keyId, at);
    if (spent >= cap) return code;
    if (charge?.currency !== PROJECT_CURRENCY) return 'budget_charge_unavailable';
    if (charge.micros > cap - spent) return code;
  }
  return null;
}

export function retainedProjectText(text) {
  return typeof text === 'string' && text
    ? text.slice(0, 8192).replace(/\b(?:sk-[\w-]{8,}|Bearer\s+[\w./+=-]+)/gi, '[已脱敏]')
    : undefined;
}

export function mockTextUsage(input, output) {
  // shortcut: local text metering approximates tokens from UTF-8 bytes; use provider usage with a real gateway.
  const count = text => Math.ceil(new TextEncoder().encode(text).length / 4);
  return { input: count(input), output: count(output), cached: 0 };
}
