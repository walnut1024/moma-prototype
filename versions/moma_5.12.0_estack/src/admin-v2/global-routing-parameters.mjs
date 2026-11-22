export const routingParameters = [
  { key: 'timeout', label: '请求超时', unit: '秒', section: '请求超时', initial: 60, positive: true },
  { key: 'numRetries', label: '最多重试次数', unit: '次', section: '失败重试', initial: 2, integer: true },
  { key: 'retryAfter', label: '最短重试间隔', unit: '秒', section: '失败重试', initial: 0, integer: true },
  { key: 'allowedFails', label: '允许失败次数', unit: '次', section: '异常部署冷却', initial: 3, integer: true },
  { key: 'cooldownTime', label: '冷却时长', unit: '秒', section: '异常部署冷却', initial: 30 },
];

export const initialRoutingParameters = Object.fromEntries(routingParameters.map(field => [field.key, field.initial]));

export function parameterError(field, value) {
  if (!Number.isFinite(value) || value < 0 || (field.positive && !value) ||
      (field.integer && !Number.isSafeInteger(value))) {
    return field.label + (field.integer ? '须为非负整数' : field.positive ? '须大于 0' : '须为非负数');
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
  if (values.retry_policy !== undefined) return values.retry_policy;
  if (!values.retryConditions) return {};
  const result = { DefaultRetries: 0 };
  for (const [condition, keys] of [['429',['RateLimitErrorRetries']], ['超时',['TimeoutErrorRetries']],
    ['5xx',['InternalServerErrorRetries','ServiceUnavailableErrorRetries']]]) {
    for (const key of keys) result[key] = values.retryConditions.includes(condition) ? values.numRetries : 0;
  }
  return result;
}
const retryConditions = ['429', '超时', '5xx'];
export const globalPolicyDefaults = { strategy: 'simple-shuffle', retry_policy: undefined, max_fallbacks: undefined, retryConditions, failoverEnabled: true };
export const failoverFields = [
  ['numRetries', '最大重试次数', '次'], ['timeout', '请求超时时间', '秒'],
  ['allowedFails', '故障判定阈值', '次'], ['cooldownTime', '故障冷却时间', '秒'],
];
export function failoverValues(values) {
  return Object.fromEntries([...failoverFields.map(([key]) => key), 'retryConditions', 'failoverEnabled', 'retry_policy', 'max_fallbacks'].map(key => [key, values[key]]));
}
export function failoverError(values) {
  if (!values || typeof values.failoverEnabled !== 'boolean' || !Array.isArray(values.retryConditions)
    || values.retryConditions.some(value => !retryConditions.includes(value))
    || new Set(values.retryConditions).size !== values.retryConditions.length) return '故障转移参数无效';
  const policy = values.retry_policy;
  if (policy !== undefined && (!policy || typeof policy !== 'object' || Array.isArray(policy) ||
    Object.entries(policy).some(([key,n]) => !Object.hasOwn(retryTypes,key) || !Number.isSafeInteger(n) || n < 0))) return '异常重试次数须为非负整数';
  if (values.max_fallbacks !== undefined && (!Number.isSafeInteger(values.max_fallbacks) || values.max_fallbacks < 0)) return '最大降级次数须为非负整数';
  for (const [key] of failoverFields) {
    const error = parameterError(routingParameters.find(field => field.key === key), values[key]);
    if (error) return error;
  }
  return '';
}
