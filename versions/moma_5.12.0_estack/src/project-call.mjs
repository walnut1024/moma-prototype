import { enterpriseTokenUsage } from './admin-v2/enterprise.js';
import { priceRequest, requestPrices } from './admin-v2/operations-analysis.js';
import { usageMeter, usageValue } from './admin-v2/usage-analysis.js';
import { projectModelEnabled } from './project-access.mjs';
import { activeProjectSpendBudget, projectBudgetStart } from './project-token-budget.mjs';

export const PROJECT_CURRENCY = 'CNY';
const MICROS = 1_000_000;

export const projectCallErrors = {
  project_unavailable: [403, '该项目当前不可用'],
  project_model_not_enabled: [403, '该模型未在当前项目开通'],
  project_model_rate_limit_exceeded: [429, '已达到项目模型限流上限，请稍后重试'],
  model_service_rate_limit_exceeded: [429, '已达到该模型服务的共享上限，请稍后重试'],
  user_model_rate_limit_exceeded: [429, '已达到账号在该模型服务的额度上限，请稍后重试'],
  project_budget_exceeded: [402, '已达到项目消费预算上限'],
  project_token_budget_exceeded: [402, '已达到项目 Token 预算上限'],
  project_rate_limit_exceeded: [429, '已达到项目速率上限，请稍后重试'],
  key_budget_exceeded: [402, '已达到 API Key 消费预算上限'],
  key_expired: [401, 'API Key 已过期'],
  budget_charge_unavailable: [503, '当前调用的人民币费用无法确认，不能执行预算校验'],
  project_token_usage_unavailable: [503, '当前调用的 Token 用量无法确认，不能执行 TPM 校验'],
  order_required: [403, '请先订购此模型服务'],
  enterprise_quota_exhausted: [402, '租户 Token 额度不足'],
  tenant_quota_expired: [402, '租户 Token 配额已到期'],
  tenant_model_rate_limit_exceeded: [429, '租户模型限流已触发'],
  plan_unavailable: [402, '套餐已失效或额度不足'],
  plan_model_unavailable: [403, '套餐不支持该模型'],
  plan_meter_unavailable: [503, '套餐缺少当前计费项的抵扣规则'],
  project_route_forbidden: [403, '当前 Key 无权调用此项目路由'],
  project_route_unavailable: [503, '项目路由没有可用模型服务'],
  tenant_route_forbidden: [403, '当前空间的路由未生效或不存在'],
  tenant_route_unavailable: [503, '当前路由没有符合项目、Key 和订购权限的可用模型服务'],
};

export const diagnosticCall = row => ['gateway-test', 'metering-test'].includes(row.purpose);

function recordedTokens(usage) {
  const input = usage?.input ?? 0, output = usage?.output ?? 0;
  const total = input + output;
  return [input, output, total].every(value => Number.isSafeInteger(value) && value >= 0) ? total : 0;
}

export function projectBudgetUsage(requests, project, at = Date.now()) {
  const { limit, period, tpm, rpm } = project.tokenBudget;
  const start = limit ? projectBudgetStart(period, at) : Infinity;
  let tokens = 0, minuteTokens = 0, minuteRequests = 0;
  for (const row of requests) {
    if (row.tenantId !== project.tenantId || row.projectId !== project.id || diagnosticCall(row)) continue;
    const time = Date.parse(row.createdAt);
    const success = row.httpStatus >= 200 && row.httpStatus < 300;
    const used = row.usageConfirmed === false ? 0 : recordedTokens(row.usage);
    if (success && time >= start && time <= at) tokens += used;
    if (!tpm && !rpm) continue;
    const admitted = row.admittedAt ? Date.parse(row.admittedAt) : success ? time : NaN;
    if (admitted > at - 60_000 && admitted <= at) {
      minuteRequests++;
      minuteTokens += used;
    }
  }
  return { tokens, minuteTokens, minuteRequests };
}

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
  if (row.settlement === 'internal' || row.httpStatus < 200 || row.httpStatus >= 300 || !Number.isInteger(row.httpStatus) || row.billingStatus === 'not_billable') return null;
  const recorded = row.charge?.micros ?? (row.charge?.unit === 'micro' ? row.charge.amount : null);
  if (Number.isSafeInteger(recorded) && recorded >= 0 && /^[A-Z]{3}$/.test(row.charge.currency)) {
    return { micros:recorded, currency:row.charge.currency };
  }
  const value = usageValue(row, usageMeter(model, row).fields);
  const result = priceRequest(price, { ...row, value }, model);
  const micros = result && Math.round(result.amount * MICROS);
  return Number.isSafeInteger(micros) ? { micros, currency: result.currency } : null;
}

export function projectSpend(state, project, keyId, at = Date.now(), internal = false) {
  let spent = 0, unpriced = 0;
  for (const row of state.requests) {
    if ((row.settlement === 'internal') !== internal || diagnosticCall(row) || row.tenantId !== project.tenantId || row.projectId !== project.id ||
        keyId && row.keyId !== keyId || !(Date.parse(row.createdAt) <= at) ||
        !(row.httpStatus >= 200 && row.httpStatus < 300) ||
        row.billingType === 'Token Plan' || row.billingStatus === 'not_billable') continue;
    const model = state.models.find(item => item.id === row.modelId) || { type: row.modelType };
    const charge = internal ? row.internalCost : requestCharge(state, row, model);
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
    !diagnosticCall(row) && row.requestId !== excludeId && row.tenantId === key.tenantId && row.projectId === key.projectId &&
    row.keyId === key.id && row.httpStatus >= 200 && row.httpStatus < 300
      ? total + (row.planDeduction ?? row.planTokens ?? 0) : total, 0);
  return spent >= key.planBudgetTokens || units > key.planBudgetTokens - spent;
}

function modelRateError(state, tenantId, projectId, model, limit, usage, at, exceededCode) {
  if (limit?.rpm || limit?.tpm) {
    const recent = state.requests.flatMap(row => {
      const time = Date.parse(row.admittedAt || row.createdAt);
      if (diagnosticCall(row) || row.tenantId!==tenantId || projectId && row.projectId!==projectId ||
          !(time>at-60_000 && time<=at)) return [];
      const attempts=row.attempts?.filter(attempt=>attempt.dispatched && (attempt.modelId || row.modelId)===model.id);
      if (attempts?.length) return [{usage:row.modelId===model.id ? row.usage : attempts.at(-1).usage}];
      return !row.attempts?.length && row.modelId===model.id && (row.admittedAt || row.httpStatus>=200 && row.httpStatus<300)
        ? [{usage:row.usage}] : [];
    });
    if (limit.rpm && recent.length >= limit.rpm) return exceededCode;
    if (limit.tpm) {
      const tokenCount = rowUsage => rowUsage && (Number.isSafeInteger(rowUsage.input) || Number.isSafeInteger(rowUsage.output))
        ? enterpriseTokenUsage(model, rowUsage) : null;
      const counts = [...recent.map(row => tokenCount(row.usage)), tokenCount(usage)];
      if (counts.includes(null)) return 'project_token_usage_unavailable';
      if (counts.reduce((sum, tokens) => sum + tokens, 0) > limit.tpm) return exceededCode;
    }
  }
  return '';
}

export function projectCallError(state, project, model, key, usage, charge, at = Date.now(), internal = false) {
  const access = projectAccessError(project, model.id, key, at);
  if (access) return access;
  const tenant = state.tenants?.find(row=>row.id===project.tenantId);
  const tenantRate = modelRateError(state,project.tenantId,undefined,model,
    tenant?.modelRules?.find(row=>row.modelId===model.id),usage,at,'tenant_model_rate_limit_exceeded');
  if (tenantRate) return tenantRate;
  const projectRate = modelRateError(state,project.tenantId,project.id,model,
    project.modelPermissions?.find(row=>row.modelId===model.id),usage,at,'project_model_rate_limit_exceeded');
  if (projectRate) return projectRate;
  const budget = project.tokenBudget;
  if (budget && (budget.limit || budget.tpm || budget.rpm)) {
    const { tokens, minuteTokens, minuteRequests } = projectBudgetUsage(state.requests, project, at);
    const quantity = recordedTokens(usage);
    if (budget.limit && quantity > 0 && quantity > budget.limit - tokens) return 'project_token_budget_exceeded';
    if (budget.rpm && minuteRequests >= budget.rpm ||
        budget.tpm && quantity > 0 && quantity > budget.tpm - minuteTokens) return 'project_rate_limit_exceeded';
  }
  // Token Plan calls consume subscription entitlement. The subscription purchase belongs to the space.
  if (key?.billingType === 'Token Plan') {
    if (state.orders?.some(row => row.id === key.subscriptionId && row.packageId)) return null;
    return planKeyBudgetExceeded(state.requests,key,enterpriseTokenUsage(model,usage)) ? 'key_budget_exceeded' : null;
  }
  const spendBudget = activeProjectSpendBudget(project);
  for (const [cap, keyId, code] of [
    [spendBudget?.stop && spendBudget.amountMicros, null, 'project_budget_exceeded'],
    [key?.budgetMicros, key?.id, 'key_budget_exceeded'],
  ]) {
    if (!cap) continue;
    const { spent } = projectSpend(state, project, keyId, at, internal);
    if (spent >= cap) return code;
    if (charge?.currency !== PROJECT_CURRENCY) return 'budget_charge_unavailable';
    if (charge.micros > cap - spent) return code;
  }
  return null;
}

export function planDeduction(state, request, model, at = Date.now()) {
  const plan = state.orders.find(row => row.id === request.subscriptionId && row.tenantId === request.tenantId);
  if (!plan?.packageId || !['已开通','生效中'].includes(plan.status) || !(Date.parse(plan.expiresAt) > at)) {
    return { error:'plan_unavailable' };
  }
  const rules = plan.factorSnapshot[model.templateId || model.id];
  if (!rules?.length || !plan.modelIds.includes(model.id)) return { error:'plan_model_unavailable' };
  const usage = request.usage, input = usage.input ?? 0;
  const quantities = (request.priceSnapshot?.items || []).filter(item => item.unit === '百万 Token').map(item => {
    const id = state.tariffDictionary.find(row => row.kind === 'scenario' && row.name === item.name)?.id;
    const factor = Number(rules.find(row => row.billingItemId === id &&
      (row.lower == null || input > row.lower) && (row.upper == null || input <= row.upper))?.factor);
    const value = /缓存/.test(item.name) ? usage.cached ?? 0 : /输出/.test(item.name) ? usage.output :
      /(总|用量)/.test(item.name) ? input + (usage.output ?? 0) : input;
    return factor > 0 ? value * factor : NaN;
  });
  const deduction = Math.ceil(quantities.reduce((sum, value) => sum + value, 0));
  if (!quantities.length || !Number.isSafeInteger(deduction) || deduction < 0) return { error:'plan_meter_unavailable' };
  if (plan.used + deduction > plan.entitlement) return { error:'plan_unavailable' };
  if (planKeyBudgetExceeded(state.requests, state.apiKeys.find(key => key.id === request.keyId), deduction, request.requestId)) {
    return { error:'key_budget_exceeded' };
  }
  return { plan, deduction };
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
