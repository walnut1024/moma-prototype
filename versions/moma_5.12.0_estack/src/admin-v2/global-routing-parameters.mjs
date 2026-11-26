export const routingParameters = [
  { key: 'numRetries', label: '最大重试次数', initial: 2, integer: true },
  { key: 'retryAfter', label: '最短重试间隔', initial: 0, integer: true },
  { key: 'timeout', label: '请求超时时间', initial: 6000 },
  { key: 'allowedFails', label: '故障判定阈值', initial: 3, integer: true },
  { key: 'cooldownTime', label: '故障冷却时间', initial: 5 },
  { key: 'max_fallbacks', label: '最大降级次数', initial: 5, integer: true },
];

export const initialRoutingParameters = Object.fromEntries(routingParameters.map(field => [field.key, field.initial]));

function parameterError(field, value) {
  if (value != null && (!Number.isFinite(value) || value < 0 || (field.integer && !Number.isSafeInteger(value)))) {
    return field.label + (field.integer ? '须为非负整数' : '须为非负数');
  }
  return '';
}

export const retryTypes = {
  RateLimitErrorRetries: '上游限流', TimeoutErrorRetries: '请求超时',
  InternalServerErrorRetries: '上游内部错误', ServiceUnavailableErrorRetries: '上游服务不可用',
  BadRequestErrorRetries: '无效请求', AuthenticationErrorRetries: '身份验证失败',
  ContentPolicyViolationErrorRetries: '违反内容策略', NotFoundErrorRetries: '资源未找到',
  DefaultRetries: '其他异常',
};

export function savedRetryPolicy(values) {
  if (values.retry_policy != null) return values.retry_policy;
  if (!values.retryConditions) return {};
  const result = { DefaultRetries: 0 };
  for (const [condition, keys] of [['429',['RateLimitErrorRetries']], ['超时',['TimeoutErrorRetries']],
    ['5xx',['InternalServerErrorRetries','ServiceUnavailableErrorRetries']]]) {
    for (const key of keys) result[key] = values.retryConditions.includes(condition)
      ? values.numRetries ?? initialRoutingParameters.numRetries : 0;
  }
  return result;
}
const retryConditions = ['429', '超时', '5xx'];
export const globalRoutingStrategies = ['simple-shuffle', 'least-busy', 'latency-based-routing', 'usage-based-routing-v2'];
export const globalPolicyDefaults = { strategy: 'simple-shuffle' };
export const effectiveRoutingStrategy = value => globalRoutingStrategies.includes(value) ? value : globalPolicyDefaults.strategy;
export const failoverFields = [
  ['numRetries', '最大重试次数', '次'], ['timeout', '请求超时时间', '秒'],
  ['allowedFails', '故障判定阈值', '次'], ['cooldownTime', '故障冷却时间', '秒'], ['max_fallbacks', '最大降级次数', '次'],
];

const failoverKeys = [...failoverFields.map(([key]) => key), 'retryConditions', 'failoverEnabled', 'retry_policy'];
export const globalRoutingKeys = ['strategy', 'retryAfter', ...failoverKeys];

function configuredValues(values, keys) {
  const configured = Object.fromEntries(keys.filter(key => values[key] != null).map(key => [key, values[key]]));
  if (configured.retry_policy) {
    configured.retry_policy = Object.fromEntries(Object.entries(configured.retry_policy).filter(([, count]) => count != null));
  }
  return configured;
}

export function failoverValues(values) {
  return configuredValues(values, failoverKeys);
}

export function globalRoutingValues(values) {
  return configuredValues(values, globalRoutingKeys);
}

export function failoverError(values) {
  if (!values || typeof values !== 'object' || Array.isArray(values) ||
    (values.failoverEnabled !== undefined && typeof values.failoverEnabled !== 'boolean') ||
    (values.retryConditions !== undefined && (!Array.isArray(values.retryConditions)
      || values.retryConditions.some(value => !retryConditions.includes(value))
      || new Set(values.retryConditions).size !== values.retryConditions.length))) return '故障转移参数无效';
  const policy = values.retry_policy;
  if (policy != null && (typeof policy !== 'object' || Array.isArray(policy) ||
    Object.entries(policy).some(([key,n]) => !Object.hasOwn(retryTypes,key) || (n != null && (!Number.isSafeInteger(n) || n < 0))))) return '异常重试次数须为非负整数';
  for (const field of routingParameters) {
    const error = parameterError(field, values[field.key]);
    if (error) return error;
  }
  return '';
}
