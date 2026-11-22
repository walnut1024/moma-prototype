import { Choice, Field } from './ServiceUI';
import { maskProviderApiKey, providerApiKeyName } from './provider-management';

export default function SupplierApiKeyField({ provider, value, onChange, disabled, current }) {
  const keys = (provider.apiKeys || []).filter(key => key.scope !== 'channel' && key.status !== 'disabled' && !key.revokedAt);
  return <Field label="API 密钥">
    <Choice label="API 密钥" value={value || 'unselected'} disabled={disabled} onChange={id => onChange(id === 'unselected' ? '' : id)}
      options={[current ? ['current', '保留当前密钥配置'] : ['unselected', '请选择 API 密钥'],
        ...keys.map(key => [key.id, `${providerApiKeyName(key)}（${maskProviderApiKey(key.maskedKey)}）`])]}/>
  </Field>;
}
