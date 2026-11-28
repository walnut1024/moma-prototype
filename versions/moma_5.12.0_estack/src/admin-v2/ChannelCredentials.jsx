import { Space, Tag, Typography } from './xa24/HaloUI.jsx';
import AdminStatus from './AdminStatus';
import { Choice, Field } from './ServiceUI';
import { useChannelText } from './channel-language';
import { connectionKeys } from './connection-state';
import { maskProviderApiKey } from './provider-management';

const strategies = [
  ['priority', '按优先级', '优先使用排序靠前的可用密钥。'],
  ['random', '随机', '从可用密钥中随机选择。'],
  ['roundRobin', '轮询', '按顺序轮流选择可用密钥。'],
];
export const channelKeyStrategyLabel = value => strategies.find(([id]) => id === value)?.[1] || strategies[0][1];

export function ChannelKeyStrategyField({ value, onChange, disabled }) {
  const t = useChannelText();
  const label = t('密钥选择策略');
  return <Field label={label} hint={t((strategies.find(([id]) => id === value) || strategies[0])[2])}>
    <Choice label={label} value={value} disabled={disabled}
      options={strategies.map(([id, name]) => [id, t(name)])} onChange={onChange}/>
  </Field>;
}

export function channelKeyMode(endpoint) {
  if (endpoint.authMode === 'pool') return '一个连接使用多把密钥';
  if (endpoint.authMode === 'group') return '上游 API 密钥组';
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
