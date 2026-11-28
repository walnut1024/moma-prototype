import { useChannelText } from './channel-language';
import { useId } from 'react';
import { InputNumber, Table, Tag } from './xa24/HaloUI.jsx';
import { failoverFields, initialRoutingParameters, retryTypes, savedRetryPolicy } from './global-routing-parameters.mjs';

import './failover-fields.css';

const parameterNames = { numRetries: 'num_retries', retryAfter: 'retry_after', timeout: 'timeout',
  allowedFails: 'allowed_fails', cooldownTime: 'cooldown_time', max_fallbacks: 'max_fallbacks' };

const retryStatus = {
  RateLimitErrorRetries: '429 · 请求受到限流',
  TimeoutErrorRetries: '408 · 也可能是 SDK 等待超时，未收到 HTTP 响应',
  InternalServerErrorRetries: '5xx · 常见为 500，且被归类为内部错误',
  ServiceUnavailableErrorRetries: '503 · 服务暂时不可用',
  BadRequestErrorRetries: '400 · 参数或请求格式有误',
  AuthenticationErrorRetries: '401 · 上游 API 密钥无效',
  ContentPolicyViolationErrorRetries: '400 · 错误详情表明触发内容策略',
  NotFoundErrorRetries: '404 · 模型或资源不存在',
  DefaultRetries: '无固定状态码 · 未命中已配置的具体重试规则',
};

export default function FailoverFields({ values, change, disabled, showRetryInterval = false }) {
  const t = useChannelText();
  const formId = useId();
  const policy = savedRetryPolicy(values);
  const fields = [...failoverFields];
  if (showRetryInterval) fields.splice(1, 0, ['retryAfter', '最短重试间隔', '秒']);
  function updateRetry(key, count) {
    const next = { ...policy };
    if (count === '' || count == null) delete next[key];
    else next[key] = count;
    change({ retry_policy: Object.keys(next).length || values.retryConditions ? next : undefined });
  }
  function parameter([key, label, unit]) {
    const inputId = formId + '-' + key;
    const value = values[key];
    const fromLegacySwitch = key === 'max_fallbacks' && values.failoverEnabled === false;
    const fallback = fromLegacySwitch ? 0 : initialRoutingParameters[key];
    const sourceLabel = fromLegacySwitch ? t('旧设置', 'Legacy setting') : t('默认', 'Default');
    const hint = value === 0 && ['timeout','cooldownTime'].includes(key)
      ? t('参考 Router 构造时回落到 {value} 秒。', 'The reference Router normalizes zero to {value} seconds at construction.').replace('{value}', initialRoutingParameters[key])
      : key === 'allowedFails' && value == null
        ? t('参考 Router 未显式设置时采用故障率规则。', 'The reference Router uses its error-rate rule when no threshold is configured.')
        : '';
    return <div className="fp-parameter" key={key}>
      <div>{disabled ? t(label) : <label htmlFor={inputId}>{t(label)}</label>}<code>{parameterNames[key]}</code>
        {hint && <small id={inputId + '-hint'}>{hint}</small>}</div>
      {disabled ? <strong aria-label={t(label)}>{value ?? fallback} <small>{t(unit)}{value == null && ' · ' + sourceLabel}</small></strong> :
        <InputNumber id={inputId} aria-describedby={hint ? inputId + '-hint' : undefined}
          min={0} value={value ?? ''} placeholder={sourceLabel + ' ' + fallback} suffix={t(unit)}
          onChange={number => change({ [key]: number === '' || number == null ? undefined : number })}/>}
    </div>;
  }
  const rows = Object.entries(retryTypes).map(([key,label]) => {
    const [status, detail] = retryStatus[key].split(' · ');
    return {key,label:t(label),status:t(status),detail:t(detail)};
  });
  return <div className="failover-policy">
    <p>{t('原型默认值参考 LiteLLM 1.110.2。', 'Prototype defaults reference LiteLLM 1.110.2.')}</p>
    {!disabled && <p>{t('留空使用默认值。填 0 会保存为显式配置。',
      'Leave a field blank to use its default. Zero is saved as an explicit value.')}</p>}
    <div className="fp-groups">
      <section><h3>{t('请求与重试')}</h3>{fields.filter(([key]) => ['numRetries','retryAfter','timeout'].includes(key)).map(parameter)}</section>
      <section><h3>{t('故障判定与降级')}</h3>{fields.filter(([key]) => ['allowedFails','cooldownTime','max_fallbacks'].includes(key)).map(parameter)}</section>
    </div>
    <h3 className="fp-title">{t('异常重试规则')} <code>retry_policy</code></h3>
    <p>{t('清空某个异常的次数会移除该项设置，填 0 会保存 0 次。',
      'Clearing the retry count removes that setting. Entering zero saves a retry count of zero.')}</p>
    <Table className="fp-retry-table" size="small" rowKey="key" pagination={false} dataSource={rows}
      scroll={{ x: 'max(100%, 840px)' }} columns={[
      {title:t('异常类型'), width:284, render:(_,row) => <div>{row.label}<code>{row.key}</code></div>},
      {title:t('典型 HTTP 状态码'), width:144, render:(_,row) => <Tag>{row.status}</Tag>},
      {title:t('判断依据'), width:292, render:(_,row) => row.detail},
      {title:t('重试次数'), width:120, render:(_,row) => disabled
        ? <span aria-label={row.key}>{policy[row.key] == null ? t('未指定') : policy[row.key] + ' ' + t('次')}</span>
        : <InputNumber aria-label={row.key} min={0} step={1} value={policy[row.key] ?? ''} placeholder={t('未指定')}
            onChange={value => updateRetry(row.key,value)}/>}
    ]}/>
  </div>;
}
