import { useChannelText } from './channel-language';
import { useEffect, useId, useRef, useState } from 'react';
import { IconPlus } from './xa24/HaloIcons.jsx';
import { Button, TextArea } from './xa24/HaloUI.jsx';
import AdminActionMenu from './AdminActionMenu';
import SupplierCreationDialog from './SupplierCreationDialog';
import { credentialRotationChannels } from './credential-rotation-scope';
import { CopyId, GridTable, Row, Cell, Modal, Notice } from './ModelOperationsUI';
import { supplierChannelCode, supplierChannelName, supplierKeyChannels } from './supplier-resources';
import { Field } from './ServiceUI';
import { UPSTREAM_API_KEY_LIMIT, providerApiKeysDraft, providerApiKeyRows, maskProviderApiKey } from './provider-management';
import './supplier-key-pool.css';

function KeyEditor({ provider, keyCount, ops, close }) {
  const translateLabel = useChannelText();
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  const limit = Math.max(0, UPSTREAM_API_KEY_LIMIT - keyCount);
  const inputs = value.split(/\r\n|[\r\n]/).filter(line => line.trim());
  const limitError = !limit ? `该服务商已达到 ${UPSTREAM_API_KEY_LIMIT} 把密钥上限。`
    : inputs.length > limit ? `该服务商还可添加 ${limit} 把密钥，请减少添加条数。` : undefined;
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
      const next = await ops.run('provider', { operation: 'addApiKeys', objectId: provider.id, values: { apiKeys, standalone: true } });
      if (next) close();
    } catch (error) { if (active.current) ops.setError(error.message); }
    finally { if (active.current) setSaving(false); }
  };
  return <SupplierCreationDialog wide className="channel-directory-create-dialog"
    title="添加上游 API 密钥" description={provider.name}
    cancel={() => !saving && ops.proceed(close)} submit={save} action={saving ? '保存中…' : '保存'}
    disabled={disabled || !value.trim() || Boolean(limitError)}>
    <Field label="上游 API 密钥" required error={limitError}
      hint={translateLabel('每行一把密钥，密钥池最多 {limit} 把。支持粘贴多行，保存后仅展示脱敏值。').replace('{limit}', UPSTREAM_API_KEY_LIMIT)}>
      <TextArea aria-label={translateLabel("上游 API 密钥")} rows={4} autoComplete="off" spellCheck={false}
        autoFocus value={value} disabled={disabled || !limit} onChange={change}/>
    </Field>
    {ops.error && <Notice error>{ops.error}</Notice>}
  </SupplierCreationDialog>;
}

export default function ReferenceProviderApiKeys({ state, connection, ops }) {
  const translateLabel = useChannelText();
  const { provider } = connection;
  const [dialog, setDialog] = useState(null);
  const trigger = useRef(null), addTriggerId = useId();
  const rows = providerApiKeyRows(state, provider);
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
  const deleting = dialog?.kind === 'delete' ? dialog.record : null;
  return <>
    <div className="supplier-key-pool-toolbar">
      <Button id={addTriggerId} size="small" theme="solid" disabled={!ops.can} icon={<IconPlus size="small" aria-hidden="true"/>}
        onClick={event => open(event, { kind: 'add' })}>{translateLabel("添加上游 API 密钥")}</Button>
    </div>
    <GridTable className="supplier-key-table supplier-flat-key-table"
      headings={['密钥 ID', '上游 API 密钥', '当前绑定连接', '操作']} empty={!rows.length} emptyMessage="暂无上游 API 密钥">
      {rows.map(row => {
        const { apiKey } = row;
        const keyId = apiKey.id;
        const channels = credentialRotationChannels(state, provider, apiKey.id);
        return <Row key={apiKey.id}>
          <Cell><CopyId copyAtStart ellipsis value={keyId} label="密钥 ID"/></Cell>
          <Cell><code>{maskProviderApiKey(apiKey.maskedKey)}</code></Cell>
          <Cell><AdminActionMenu label={`查看密钥 ${keyId} 当前绑定连接`} items={channels.length ? channels.map(channel => ({
            node: 'item', name: supplierChannelCode(channel) + ' · ' + supplierChannelName(provider, channel),
            onClick: () => ops.go({ connection: channel.id, tab: null, modelQ: null }),
          })) : [{ node: 'title', name: '暂无连接绑定' }]}>{channels.length} 个</AdminActionMenu></Cell>
          <Cell><Button theme="borderless" type="danger" size="small" disabled={!ops.can} aria-label={`删除 ${keyId}`}
            onClick={event => open(event, { kind: 'delete', record: { ...row, endpoints: supplierKeyChannels(state, provider, apiKey.id) } })}>{translateLabel("删除")}</Button></Cell>
        </Row>;
      })}
    </GridTable>
    {dialog?.kind === 'add' && <KeyEditor provider={provider} keyCount={rows.length} ops={ops} close={close}/>}
    {deleting && <Modal title="删除上游 API 密钥" description={deleting.apiKey.id} onClose={close} footer={<>
      <Button theme="light" onClick={close}>{translateLabel("取消")}</Button>
      <Button type="danger" disabled={!ops.can} onClick={async () => {
        const { id, fingerprint } = deleting.apiKey;
        if (await ops.run('provider', { operation: 'deleteApiKey', objectId: provider.id,
          values: { keyId: id, expectedFingerprint: fingerprint, confirmed: true } })) close();
      }}>确认删除</Button>
    </>}>
      <p>确认删除此密钥？{deleting.endpoints.length > 0 && `影响 ${deleting.endpoints.length} 个连接，相关模型需要重新验证。`}</p>
      {ops.error && <Notice error>{ops.error}</Notice>}
    </Modal>}
  </>;
}
