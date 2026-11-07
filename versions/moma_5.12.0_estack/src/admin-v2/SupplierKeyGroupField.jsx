import { useRef, useState } from 'react';
import { Info } from 'lucide-react';
import { Button, Tooltip } from '@douyinfe/semi-ui';
import { Choice } from './ModelMetadataForm';
import { providerApiKeyRows } from './provider-management';
import { providerKeyGroups, providerKeyGroupKeys } from './provider-key-groups';
import { KeyEditor } from './ProviderApiKeys';

export function SupplierKeyGroupField({ state, provider, value, disabled, onChange, current, ops, fixed = false, label = 'API 密钥组', actionLabel = '添加密钥', onSaved }) {
  const [editing, setEditing] = useState(false);
  const parentDirty = useRef(false), keyDirty = useRef(false), trigger = useRef(null);
  const keys = providerApiKeyRows(state, provider).map(row => row.apiKey);
  const groups = providerKeyGroups(provider, keys), group = groups.find(row => row.id === value);
  const selected = providerKeyGroupKeys(provider, value, true, keys);
  const ready = current && value === 'current' ? current.ready : selected.length && selected[0].status !== 'disabled';
  const close = () => { setEditing(false); ops.dirty(parentDirty.current); ops.setError(''); requestAnimationFrame(() => trigger.current?.focus()); };
  const keyOps = { ...ops,
    dirty: dirty => { keyDirty.current = dirty; ops.dirty(parentDirty.current || dirty); },
    run: async (...args) => { const result = await ops.run(...args); ops.dirty(parentDirty.current || !result && keyDirty.current); if (result) onSaved?.(result); return result; },
  };
  return <div className="supplier-key-group-field">
    <div className="supplier-key-group-label">{label}<Tooltip content="渠道使用所选组的主要密钥。组内第一位为主要密钥，可在服务商的「API 密钥」中管理分组。"><Button theme="borderless" aria-label="API 密钥组说明" icon={<Info aria-hidden="true"/>}/></Tooltip></div>
    <div className="supplier-key-group-control"><Choice label={label} value={value} options={[...(current ? [['current', current.name]] : []), ...groups.map(item => [item.id, item.name])]} disabled={disabled || fixed} onChange={onChange}/>{group && <Button ref={trigger} type="tertiary" theme="borderless" disabled={disabled} onClick={() => { parentDirty.current = ops.hasUnsaved(); keyDirty.current = false; ops.setError(''); setEditing(true); }}>{actionLabel}</Button>}</div>
    {!ready && <small className="supplier-key-pending">{selected.length ? '主要密钥已停用，请在服务商的 API 密钥中启用或更换主要密钥。' : '该组暂无 API 密钥，可先添加密钥或保存渠道后补充。'}</small>}
    {editing && group && <KeyEditor provider={provider} group={group} ops={keyOps} close={close}/>}
  </div>;
}
