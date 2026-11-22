import AdminStatus from './AdminStatus';
import AdminActionMenu from './AdminActionMenu';
import ChannelHealthDialog from './ChannelHealthDialog';
import { credentialRotationChannels } from './credential-rotation-scope';
import ChannelKeyPoolEditor from './ChannelKeyPoolEditor';
import { useEffect, useId, useRef, useState } from 'react';
import { IconPlus } from '@douyinfe/semi-icons';
import { Button, Input, Typography } from '@douyinfe/semi-ui';
import { CopyId, GridTable, Row, Cell, Modal, Notice } from './ModelOperationsUI';
import { supplierChannelResources, supplierChannelAssociations, supplierChannelCode, supplierChannelName, supplierKeyChannels } from './supplier-resources';
import { Field } from './ServiceUI';
import { PROVIDER_API_KEY_LIMIT, providerApiKeysDraft, providerApiKeyRows, providerApiKeyName, providerApiKeyId, maskProviderApiKey } from './provider-management';
import './supplier-key-pool.css';

const keyInput = (raw = '') => ({ id: crypto.randomUUID(), raw });

function KeyEditor({ provider, record, ops, close }) {
  const [inputs, setInputs] = useState(() => [keyInput()]);
  const [saving, setSaving] = useState(false);
  const [edited, setEdited] = useState(false), [discarding, setDiscarding] = useState(false);
  const formId = useId();
  const active = useRef(true), input = useRef(null);
  const limit = record ? 1 : Math.max(0, PROVIDER_API_KEY_LIMIT - (provider.apiKeys?.length || 0));
  const inputCount = inputs.filter(row => row.raw.trim()).length;
  const disabled = !ops.can || saving;
  const canSave = !disabled && inputCount > 0 && inputCount <= limit;
  useEffect(() => { active.current = true; const frame = requestAnimationFrame(() => input.current?.focus()); return () => { active.current = false; cancelAnimationFrame(frame); }; }, []);
  const updateInputs = next => {
    setInputs(next);
    setEdited(true);
    ops.dirty(true);
    ops.setError('');
  };
  const pasteKeys = (event, index) => {
    const text = event.clipboardData.getData('text');
    if (!/[\r\n]/.test(text)) return;
    event.preventDefault();
    const lines = text.split(/\r\n|\n|\r/).map(line => line.trim()).filter(Boolean);
    if (!lines.length) return;
    let nextIndex = index + 1;
    while (nextIndex < index + lines.length && inputs[nextIndex] && !inputs[nextIndex].raw.trim()) nextIndex++;
    const following = inputs.slice(nextIndex);
    if (index + lines.length + following.length > limit) {
      ops.setError(`该服务商还可添加 ${limit} 把密钥，请减少录入条数。`);
      return;
    }
    const pasted = lines.map((raw, offset) => offset === 0 ? { ...inputs[index], raw } : keyInput(raw));
    updateInputs([...inputs.slice(0, index), ...pasted, ...following]);
  };
  const resume = () => { setDiscarding(false); requestAnimationFrame(() => input.current?.focus()); };
  const cancel = () => { if (saving) return; if (discarding) resume(); else if (edited) setDiscarding(true); else close(); };
  const footer = discarding ? <>
    <Button theme="light" autoFocus onClick={resume}>继续编辑</Button>
    <Button type="danger" onClick={() => { setInputs([]); ops.dirty(false); close(); }}>放弃本次修改</Button>
  </> : <>
    <Button theme="light" disabled={saving} onClick={cancel}>取消</Button>
    <Button theme="solid" form={formId} htmlType="submit" disabled={!canSave}>
      {saving ? '保存中…' : '保存'}
    </Button>
  </>;
  const description = record ? [providerApiKeyId(record.apiKey), record.endpoints.length ? `影响 ${record.endpoints.length} 个绑定渠道` : null].filter(Boolean).join(' · ') : provider.name;
  return <Modal title={record ? '替换 API 密钥' : '添加 API 密钥'} description={description} onClose={cancel} footer={footer}
    className={record ? undefined : 'reference-add-keys-modal'}>
      <form id={formId} hidden={discarding} style={discarding ? { display: 'none' } : undefined} className="supplier-key-form" noValidate onSubmit={async event => {
        event.preventDefault();
        event.stopPropagation();
        if (!canSave) return;
        setSaving(true); ops.setError('');
        try {
          const { apiKeys } = await providerApiKeysDraft(inputs.map(row => row.raw));
          if (!active.current) return;
          if (record) {
            if (await ops.run('credentialReplace', {
              providerId: provider.id, keyId: record.apiKey.id, expectedFingerprint: record.apiKey.fingerprint,
              expectedEndpointIds: record.endpoints.map(endpoint => endpoint.id), newApiKey: apiKeys[0],
            })) close();
            return;
          }
          if (await ops.run('provider', { operation: 'addApiKeys', objectId: provider.id, values: { apiKeys, standalone: true } })) close();
        } catch (error) { if (active.current) ops.setError(error.message); }
        finally { if (active.current) setSaving(false); }
      }}>
        {!record && <Typography.Text type="secondary">
          {limit ? '每行一把密钥，可在输入框中粘贴多行。保存后仅展示脱敏值。' : `该服务商已达到 ${PROVIDER_API_KEY_LIMIT} 把密钥上限。`}
        </Typography.Text>}
        {inputs.map((row, index) => {
          const label = record ? 'API 密钥' : `API 密钥 ${index + 1}`;
          return <Field key={row.id} label={label} required={Boolean(record) || inputs.length === 1}>
            <Input ref={index === 0 ? input : undefined} aria-label={label} mode="password" autoComplete="new-password" maxLength={512}
              placeholder={record ? '请输入新的 API 密钥' : '请输入 API 密钥'} value={row.raw} disabled={disabled || !limit}
              onChange={raw => updateInputs(inputs.map(item => item.id === row.id ? { ...item, raw } : item))}
              onPaste={record ? undefined : event => pasteKeys(event, index)}
              suffix={!record && inputs.length > 1 ? <Button htmlType="button" theme="borderless" type="tertiary" size="small"
                aria-label={`移除第 ${index + 1} 把密钥`} disabled={disabled}
                onClick={() => updateInputs(inputs.filter(item => item.id !== row.id))}>移除</Button> : undefined}/>
          </Field>;
        })}
        {!record && <div><Button htmlType="button" theme="light" disabled={disabled || inputs.length >= limit}
          onClick={() => updateInputs([...inputs, keyInput()])}>添加一把密钥</Button></div>}
        {ops.error && <Notice error>{ops.error}</Notice>}
      </form>
      {discarding && <Notice>放弃未保存的密钥输入？</Notice>}
    </Modal>;
}

export default function ReferenceProviderApiKeys({ state, provider, ops }) {
  const [editing, setEditing] = useState(null), [deleting, setDeleting] = useState(null), [keyAction, setKeyAction] = useState(null);
  const trigger = useRef(null), addTriggerId = useId();
  const resources = supplierChannelResources(state, provider);
  const rows = providerApiKeyRows(state, provider).filter(({ apiKey }) => apiKey.scope !== 'channel');
  const affected = keyAction?.row ? supplierKeyChannels(state, provider, keyAction.row.apiKey.id) : [];
  const open = (target, callback) => { trigger.current = target; ops.setError(''); callback(); };
  const close = () => { setEditing(null); setDeleting(null); setKeyAction(null); ops.setError(''); requestAnimationFrame(() => (trigger.current?.isConnected ? trigger.current : document.getElementById(addTriggerId))?.focus()); };
  const keyRecord = row => ({ ...row, endpoints: supplierKeyChannels(state, provider, row.apiKey.id) });
  return <>
    <div className="supplier-key-pool-toolbar"><Button id={addTriggerId} size="small" disabled={!ops.can} icon={<IconPlus size="small" aria-hidden="true"/>} onClick={event => open(event.currentTarget, () => setEditing({ record: null }))}>添加 API 密钥</Button></div>
    <GridTable className="supplier-key-table supplier-flat-key-table" headings={['密钥名称 / ID', 'API 密钥', '当前绑定渠道', '状态', '操作']} empty={!rows.length} emptyMessage="暂无 API 密钥">
          {rows.map(row => { const channels = credentialRotationChannels(state, provider, row.apiKey.id); return <Row key={row.apiKey.id}><Cell><span>{providerApiKeyName(row.apiKey)}</span><small><CopyId copyAtStart value={row.apiKey.id} displayValue={providerApiKeyId(row.apiKey)} label="密钥 ID"/></small></Cell><Cell><code>{maskProviderApiKey(row.apiKey.maskedKey)}</code></Cell><Cell><AdminActionMenu label={'查看密钥 ' + providerApiKeyId(row.apiKey) + ' 当前绑定渠道'}
              items={channels.length ? channels.map(channel => ({
                node: 'item', name: supplierChannelCode(channel) + ' · ' + supplierChannelName(provider, channel),
                onClick: () => ops.go({ connection: channel.id, tab: null, modelQ: null }),
              })) : [{ node: 'title', name: '暂无渠道绑定' }]}>{channels.length} 个</AdminActionMenu></Cell><Cell><AdminStatus value={row.apiKey.revokedAt ? '已撤销' : row.apiKey.status === 'disabled' ? '已停用' : '已配置'}/></Cell><Cell><div className="supplier-row-actions"><Button theme="borderless" type="tertiary" aria-label={`测试连接 ${row.apiKey.id}`} disabled={!ops.can || !channels.length || Boolean(row.apiKey.revokedAt) || row.apiKey.status === 'disabled'} onClick={event => open(event.currentTarget, () => setKeyAction({ kind: 'test', row }))}>测试连接</Button>

            <Button theme="borderless" type="tertiary" size="small" disabled={!ops.can} aria-label={(channels.length ? '管理密钥池：' : '替换：') + providerApiKeyId(row.apiKey)} onClick={event => open(event.currentTarget, () => channels.length ? setKeyAction({ kind: 'pool', row }) : setEditing({ record: { ...row, endpoints: channels } }))}>{channels.length ? '管理密钥池' : '替换'}</Button>
            <AdminActionMenu label={'密钥更多操作 ' + providerApiKeyId(row.apiKey)} disabled={!ops.can} items={[
              { node: 'item', name: row.apiKey.status === 'disabled' ? '启用' : '停用',
                disabled: Boolean(row.apiKey.revokedAt) || !provider.apiKeys?.some(key => key.id === row.apiKey.id),
                onClick: button => open(button, () => setKeyAction({ kind: 'toggle', row })) },
              { node: 'item', name: '移除',
                onClick: button => open(button, () => setDeleting(keyRecord(row))) },
              { node: 'item', name: '紧急撤销', type: 'danger', disabled: Boolean(row.apiKey.revokedAt),
                onClick: button => open(button, () => setKeyAction({ kind: 'revoke', row })) },
            ]}/>
          </div></Cell></Row>; })}
    </GridTable>
    {editing && <KeyEditor key={editing.record?.apiKey.id || 'new'} provider={provider} record={editing.record} ops={ops} close={close}/>}
    {deleting && <Modal title="移除 API 密钥" description={providerApiKeyId(deleting.apiKey)} onClose={close} footer={<><Button theme="light" onClick={close}>取消</Button><Button type="danger" disabled={!ops.can} onClick={async () => { if (await ops.run('provider', { operation: 'deleteApiKey', objectId: provider.id, values: { keyId: deleting.apiKey.id, expectedFingerprint: deleting.apiKey.fingerprint, confirmed: true } })) close(); }}>确认移除</Button></>}><p>确认移除此密钥？{deleting.endpoints.length ? '影响 ' + deleting.endpoints.length + ' 个渠道，相关模型需要重新验证。' : ''}</p>{ops.error && <Notice error>{ops.error}</Notice>}</Modal>}
    {keyAction?.kind === 'test' && <ChannelHealthDialog state={state} provider={provider} apiKey={keyAction.row.apiKey} ops={ops} close={close}/>}
    {keyAction?.kind === 'pool' && <Modal title="选择渠道密钥池" onClose={close}><p>先添加新 API 密钥，再在对应渠道的密钥池中替换绑定并验证。</p>{credentialRotationChannels(state, provider, keyAction.row.apiKey.id).map(row => <Button key={row.id} theme="borderless" type="tertiary" onClick={() => setKeyAction({ ...keyAction, kind: 'pool-edit', endpointId: row.id })}>{row.name}</Button>)}</Modal>}
    {keyAction?.kind === 'pool-edit' && <ChannelKeyPoolEditor state={state} provider={provider} endpoint={resources.find(row => row.id === keyAction.endpointId)} ops={ops} close={close} directory/>}
    {keyAction && !['pool', 'pool-edit', 'test'].includes(keyAction.kind) && <Modal title={keyAction.kind === 'revoke' ? '紧急撤销 API 密钥' : '变更 API 密钥状态'} description={providerApiKeyId(keyAction.row.apiKey)} onClose={close} footer={<><Button theme="light" onClick={close}>取消</Button><Button theme="solid" type={keyAction.kind === 'revoke' ? 'danger' : 'primary'} disabled={!ops.can} onClick={async () => { if (keyAction.kind === 'revoke' ? await ops.run('credentialEmergencyRevoke', { providerId: provider.id, keyId: keyAction.row.apiKey.id, expectedFingerprint: keyAction.row.apiKey.fingerprint, confirmed: true }) : await ops.run('provider', { operation: 'toggleApiKey', objectId: provider.id, values: { keyId: keyAction.row.apiKey.id, expectedFingerprint: keyAction.row.apiKey.fingerprint, enabled: keyAction.row.apiKey.status === 'disabled', confirmed: true } })) close(); }}>{keyAction.kind==='revoke'?'确认紧急撤销':'确认变更'}</Button></>}><p>{keyAction.kind === 'revoke' ? '撤销后不能恢复；所有使用此凭证的新调用立即停止。' : ''}影响 {affected.length} 个渠道，以及 {affected.reduce((sum, channel) => sum + supplierChannelAssociations(state, provider, channel.id).length, 0)} 条模型关联。变更后相关调用需重新测试，服务价格和路由配置保留。</p><ul className="supplier-reference-list">{affected.map(channel => <li key={channel.id}><strong>{supplierChannelCode(channel)} · {supplierChannelName(provider, channel)}</strong><span>{supplierChannelAssociations(state, provider, channel.id).map(item => item.modelId).join('、') || '未关联模型'}</span></li>)}</ul>{ops.error && <Notice error>{ops.error}</Notice>}</Modal>}
  </>;
}
