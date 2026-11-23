import { useEffect, useId, useRef, useState } from 'react';
import { IconPlus } from '@douyinfe/semi-icons';
import { Button, Input, TextArea } from '@douyinfe/semi-ui';
import AdminStatus from './AdminStatus';
import AdminActionMenu from './AdminActionMenu';
import ChannelHealthDialog from './ChannelHealthDialog';
import ChannelKeyPoolEditor from './ChannelKeyPoolEditor';
import SupplierCreationDialog from './SupplierCreationDialog';
import { credentialRotationChannels } from './credential-rotation-scope';
import { CopyId, GridTable, Row, Cell, Modal, Notice } from './ModelOperationsUI';
import { supplierChannelCode, supplierChannelName, supplierKeyChannels } from './supplier-resources';
import { Field } from './ServiceUI';
import { PROVIDER_API_KEY_LIMIT, providerApiKeysDraft, providerApiKeyRows, providerApiKeyName, providerApiKeyId, maskProviderApiKey } from './provider-management';
import './supplier-key-pool.css';

function KeyEditor({ provider, record, ops, close }) {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  const adding = !record;
  const limit = adding ? Math.max(0, PROVIDER_API_KEY_LIMIT - (provider.apiKeys?.length || 0)) : 1;
  const inputs = adding ? value.split(/\r\n|[\r\n]/).filter(line => line.trim()) : [value];
  const limitError = !limit ? `该服务商已达到 ${PROVIDER_API_KEY_LIMIT} 把密钥上限。`
    : inputs.length > limit ? `该服务商还可添加 ${limit} 把密钥，请减少录入条数。` : undefined;
  const disabled = !ops.can || saving;
  const change = next => {
    setValue(next);
    ops.dirty(true);
    ops.setError('');
  };
  const save = async () => {
    setSaving(true);
    ops.setError('');
    try {
      const { apiKeys } = await providerApiKeysDraft(inputs);
      if (!active.current) return;
      if (!ops.isCurrent()) throw Error('权限或数据已有变化，请重新核对');
      const next = adding
        ? await ops.run('provider', { operation: 'addApiKeys', objectId: provider.id, values: { apiKeys, standalone: true } })
        : await ops.run('credentialReplace', {
          providerId: provider.id, keyId: record.apiKey.id, expectedFingerprint: record.apiKey.fingerprint,
          expectedEndpointIds: record.endpoints.map(endpoint => endpoint.id), newApiKey: apiKeys[0],
        });
      if (next) close();
    } catch (error) { if (active.current) ops.setError(error.message); }
    finally { if (active.current) setSaving(false); }
  };
  const description = adding ? provider.name : [
    providerApiKeyId(record.apiKey),
    record.endpoints.length ? `影响 ${record.endpoints.length} 个绑定连接，保存时验证。` : null,
  ].filter(Boolean).join(' · ');
  return <SupplierCreationDialog wide={adding} className={adding ? 'channel-directory-create-dialog' : undefined}
    title={adding ? '添加 API 密钥' : '替换 API 密钥'} description={description}
    cancel={() => !saving && ops.proceed(close)} submit={save} action={saving ? '保存中…' : '保存'}
    disabled={disabled || !value.trim() || Boolean(limitError)}>
    <Field label={adding ? '服务商 API 密钥' : '新 API 密钥'} required error={limitError}
      hint={adding ? '每行一把密钥，支持粘贴多行。保存后仅展示脱敏值。' : undefined}>
      {adding
        ? <TextArea aria-label="服务商 API 密钥" rows={4} autoComplete="off" spellCheck={false}
          autoFocus value={value} disabled={disabled || !limit} onChange={change}/>
        : <Input aria-label="新 API 密钥" mode="password" autoComplete="new-password" maxLength={512}
          autoFocus value={value} disabled={disabled} onChange={change}/>}
    </Field>
    {ops.error && <Notice error>{ops.error}</Notice>}
  </SupplierCreationDialog>;
}

export default function ReferenceProviderApiKeys({ state, connection, ops }) {
  const { provider } = connection;
  const [dialog, setDialog] = useState(null);
  const trigger = useRef(null), addTriggerId = useId();
  const rows = providerApiKeyRows(state, provider).filter(({ apiKey }) => apiKey.scope !== 'channel');
  const open = (event, value) => {
    trigger.current = event.currentTarget;
    ops.setError('');
    setDialog(value);
  };
  const close = () => {
    setDialog(null);
    ops.setError('');
    requestAnimationFrame(() => (trigger.current?.isConnected ? trigger.current : document.getElementById(addTriggerId))?.focus());
  };
  const replace = (event, row, endpoints) => {
    const pools = endpoints.filter(endpoint => endpoint.authMode === 'pool' || endpoint.candidateConfiguration?.config.authMode === 'pool');
    const record = { ...row, endpoints };
    if (!pools.length) open(event, { kind: 'replace', record });
    else if (pools.length === 1) open(event, { kind: 'pool', record, endpointId: pools[0].id });
    else open(event, { kind: 'choosePool', record, pools });
  };
  const poolEndpoint = dialog?.kind === 'pool' && state.endpoints.find(endpoint => endpoint.id === dialog.endpointId && !endpoint.deletedAt);
  const deleting = dialog?.kind === 'delete' ? dialog.record : null;
  return <>
    <div className="supplier-key-pool-toolbar">
      <Button id={addTriggerId} size="small" theme="solid" disabled={!ops.can} icon={<IconPlus size="small" aria-hidden="true"/>}
        onClick={event => open(event, { kind: 'add' })}>添加 API 密钥</Button>
    </div>
    <GridTable className="supplier-key-table supplier-flat-key-table"
      headings={['密钥名称 / ID', 'API 密钥', '当前绑定连接', '状态', '操作']} empty={!rows.length} emptyMessage="暂无 API 密钥">
      {rows.map(row => {
        const { apiKey } = row;
        const keyId = providerApiKeyId(apiKey);
        const channels = credentialRotationChannels(state, provider, apiKey.id);
        return <Row key={apiKey.id}>
          <Cell><span>{providerApiKeyName(apiKey)}</span><small><CopyId copyAtStart value={apiKey.id} displayValue={keyId} label="密钥 ID"/></small></Cell>
          <Cell><code>{maskProviderApiKey(apiKey.maskedKey)}</code></Cell>
          <Cell><AdminActionMenu label={`查看密钥 ${keyId} 当前绑定连接`} items={channels.length ? channels.map(channel => ({
            node: 'item', name: supplierChannelCode(channel) + ' · ' + supplierChannelName(provider, channel),
            onClick: () => ops.go({ connection: channel.id, tab: null, modelQ: null }),
          })) : [{ node: 'title', name: '暂无连接绑定' }]}>{channels.length} 个</AdminActionMenu></Cell>
          <Cell><AdminStatus value={apiKey.revokedAt ? '已撤销' : apiKey.status === 'disabled' ? '已停用' : '已配置'}/></Cell>
          <Cell><div className="supplier-row-actions">
            <Button theme="borderless" type="tertiary" size="small" aria-label={`测试连接 ${apiKey.id}`}
              disabled={!ops.can || !channels.length || Boolean(apiKey.revokedAt) || apiKey.status === 'disabled'}
              onClick={event => open(event, { kind: 'test', apiKey })}>测试连接</Button>
            <Button theme="borderless" type="tertiary" size="small" disabled={!ops.can || Boolean(apiKey.revokedAt)}
              aria-label={`替换 ${keyId}`} onClick={event => replace(event, row, channels)}>替换</Button>
            <Button theme="borderless" type="danger" size="small" disabled={!ops.can} aria-label={`删除 ${keyId}`}
              onClick={event => open(event, { kind: 'delete', record: { ...row, endpoints: supplierKeyChannels(state, provider, apiKey.id) } })}>删除</Button>
          </div></Cell>
        </Row>;
      })}
    </GridTable>
    {(dialog?.kind === 'add' || dialog?.kind === 'replace') &&
      <KeyEditor provider={provider} record={dialog.record} ops={ops} close={close}/>}
    {deleting && <Modal title="删除 API 密钥" description={providerApiKeyId(deleting.apiKey)} onClose={close} footer={<>
      <Button theme="light" onClick={close}>取消</Button>
      <Button type="danger" disabled={!ops.can} onClick={async () => {
        const { id, fingerprint } = deleting.apiKey;
        if (await ops.run('provider', { operation: 'deleteApiKey', objectId: provider.id,
          values: { keyId: id, expectedFingerprint: fingerprint, confirmed: true } })) close();
      }}>确认删除</Button>
    </>}>
      <p>确认删除此密钥？{deleting.endpoints.length > 0 && `影响 ${deleting.endpoints.length} 个连接，相关模型需要重新验证。`}</p>
      {ops.error && <Notice error>{ops.error}</Notice>}
    </Modal>}
    {dialog?.kind === 'test' && <ChannelHealthDialog state={state} provider={provider} apiKey={dialog.apiKey} ops={ops} close={close}/>}
    {dialog?.kind === 'choosePool' && <Modal title="选择替换连接" onClose={close}>
      <p>选择要替换密钥的连接。共享密钥的各连接分别验证和应用。</p>
      {dialog.pools.map(endpoint => <Button key={endpoint.id} theme="borderless" type="tertiary"
        onClick={() => setDialog({ kind: 'pool', record: dialog.record, endpointId: endpoint.id })}>
        {supplierChannelName(provider, endpoint)}
      </Button>)}
    </Modal>}
    {poolEndpoint && <ChannelKeyPoolEditor state={state} provider={provider} endpoint={poolEndpoint} ops={ops} close={close}
      directory replaceKeyId={dialog.record.apiKey.id}/>}
  </>;
}
