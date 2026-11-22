import { Button, Input, Space, Tag, Typography } from '@douyinfe/semi-ui';
import AdminStatus from './AdminStatus';
import { Choice, Field } from './ServiceUI';
import { useChannelText } from './channel-language';
import { connectionKeys } from './connection-state';
import { maskProviderApiKey, PROVIDER_API_KEY_LIMIT } from './provider-management';

const strategies = [
  ['priority', '按优先级', '优先使用排序靠前的可用密钥。'],
  ['random', '随机', '从可用密钥中随机选择。'],
  ['roundRobin', '轮询', '按顺序轮流选择可用密钥。'],
];
export const channelKeyStrategyLabel = value => strategies.find(([id]) => id === value)?.[1] || strategies[0][1];
export const newChannelKeyInput = () => ({ id: crypto.randomUUID(), raw: '' });

export function ChannelKeyStrategyField({ value, onChange, disabled }) {
  const t = useChannelText();
  const label = t('密钥选择策略');
  return <Field label={label} hint={t((strategies.find(([id]) => id === value) || strategies[0])[2])}>
    <Choice label={label} value={value} disabled={disabled}
      options={strategies.map(([id, name]) => [id, t(name)])} onChange={onChange}/>
  </Field>;
}

export function channelKeyMode(endpoint) {
  if (endpoint.authMode === 'pool') return '一个渠道使用多把密钥';
  if (endpoint.authMode === 'group') return '服务商密钥组';
  if (endpoint.authMode === 'inherit') return '服务商默认密钥';
  if (endpoint.authMode === 'none') return '无需认证';
  if (endpoint.authMode === 'pending') return '待配置密钥';
  return '单密钥';
}

export function ChannelKeySummary({ endpoint, provider, difference }) {
  const t = useChannelText();
  const keys = connectionKeys(endpoint, provider, true);
  if (!keys.length) return endpoint.authMode === 'none' ? t('无需认证') : '—';
  return <Space vertical align="start" spacing={4}>
    {keys.map(key => {
      const disabled = key.status === 'disabled' || endpoint.authMode === 'pool' &&
        (endpoint.poolPaused || endpoint.keyPool?.some(row => row.keyId === key.id && !row.enabled));
      return <Space key={key.id} wrap spacing={8}>
        <Typography.Text>{maskProviderApiKey(key.maskedKey)}</Typography.Text>
        {key.revokedAt ? <AdminStatus value="已撤销" label={t('已撤销')}/> :
          disabled && <AdminStatus value="已停用" label={t('已停用')}/>}
        {difference && !difference.otherIds.has(key.id) && <Tag size="small" color={difference.color}>{t(difference.label)}</Tag>}
      </Space>;
    })}
  </Space>;
}

export function ChannelPoolFields({ endpoint, provider, pool, disabled, update, setError }) {
  const t = useChannelText();
  const { rows, inputs, strategy } = pool;
  const keys = connectionKeys(endpoint, provider, true);
  const full = rows.length + inputs.length >= PROVIDER_API_KEY_LIMIT;
  const paste = (event, index) => {
    const text = event.clipboardData.getData('text');
    if (!/[\r\n]/.test(text)) return;
    event.preventDefault();
    const lines = text.split(/\r\n|\n|\r/).map(line => line.trim()).filter(Boolean);
    if (!lines.length) return;
    const remaining = inputs.slice(index + 1);
    while (lines.length > 1 && remaining.length && !remaining[0].raw.trim() &&
      remaining.length + index + lines.length + rows.length > PROVIDER_API_KEY_LIMIT) remaining.shift();
    if (index + lines.length + remaining.length + rows.length > PROVIDER_API_KEY_LIMIT) {
      setError(t('一个渠道最多配置 20 把密钥'));
      return;
    }
    update({ inputs: [...inputs.slice(0, index), ...lines.map(raw => ({ ...newChannelKeyInput(), raw })), ...remaining] });
  };
  return <>
    <Field label={t('API 密钥')}>
      <Space vertical align="start" spacing={4}>
        {rows.map((row, index) => {
          const key = keys.find(item => item.id === row.keyId);
          return <Space key={row.keyId} wrap spacing={8}>
            <Typography.Text>{key ? maskProviderApiKey(key.maskedKey) : '—'}</Typography.Text>
            {key?.revokedAt ? <AdminStatus value="已撤销" label={t('已撤销')}/> :
              (!row.enabled || key?.status === 'disabled') && <AdminStatus value="已停用" label={t('已停用')}/>}
            <Button size="small" theme="borderless" disabled={disabled} aria-label={t('移除现有密钥') + ' ' + (index + 1)}
              onClick={() => update({ rows: rows.filter(item => item.keyId !== row.keyId) })}>{t('移除')}</Button>
          </Space>;
        })}
        {!rows.length && '—'}
      </Space>
    </Field>
    {inputs.map((item, index) => {
      const label = t('新 API 密钥') + ' ' + (index + 1);
      return <Field key={item.id} label={label}>
        <Input mode="password" autoComplete="new-password" aria-label={label} value={item.raw} maxLength={512} disabled={disabled}
          onPaste={event => paste(event, index)} onChange={raw => update({ inputs: inputs.map(row => row.id === item.id ? { ...row, raw } : row) })}
          suffix={<Button size="small" theme="borderless" disabled={disabled} aria-label={t('移除新密钥') + ' ' + (index + 1)}
            onClick={() => update({ inputs: inputs.filter(row => row.id !== item.id) })}>{t('移除')}</Button>}/>
      </Field>;
    })}
    <Button theme="light" disabled={disabled || full}
      onClick={() => update({ inputs: [...inputs, newChannelKeyInput()] })}>{t('添加一把密钥')}</Button>
    <ChannelKeyStrategyField value={strategy} onChange={value => update({ strategy: value })} disabled={disabled}/>
  </>;
}
