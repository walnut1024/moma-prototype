import { Button, Typography } from '@douyinfe/semi-ui';
import { Choice } from './ServiceUI';
import { providerApiKeyRows } from './provider-management';
import { providerKeyGroups, providerKeyGroupKeys } from './provider-key-groups';

export function SupplierKeyGroupField({ state, provider, value, disabled, onChange, current, ops, fixed = false, label = 'API 密钥组', channelId }) {
  const keys = providerApiKeyRows(state, provider).map(row => row.apiKey);
  const groups = providerKeyGroups(provider, keys), selected = providerKeyGroupKeys(provider, value, true, keys);
  const available = selected.filter(key=>key.status!=='disabled' && !key.revokedAt), primary=selected[0];
  const ready = current && value === 'current' ? current.ready : primary && primary.status!=='disabled' && !primary.revokedAt;
  return <div className="supplier-key-group-field">
    <div className="supplier-key-group-label">{label}</div>
    <div className="supplier-key-group-control"><Choice label={label} value={value} options={[...(current?.name ? [['current', current.name]] : []), ...groups.map(item => [item.id, item.name])]} disabled={disabled || fixed} onChange={onChange}/>
      <Button type="tertiary" theme="borderless" disabled={disabled} onClick={()=>ops.go({provider:provider.id,tab:'api-keys',keyGroup:value==='current'?'default':value,credentialChannel:channelId || current?.endpointId || null},{base:'providers',reset:true})}>管理密钥池</Button>
    </div>
    {value!=='current' && <Typography.Text type="tertiary">可用 {available.length} / {selected.length} · 主要密钥：{primary ? (primary.maskedKey || '••••••••') + (ready ? '（可用）' : '（不可用）') : '未配置'}</Typography.Text>}
    {!ready && <small className="supplier-key-pending">{selected.length ? '主要密钥不可用，请到密钥池启用或更换。' : '该组暂无可用密钥，请先到密钥池配置。'}</small>}
  </div>;
}
