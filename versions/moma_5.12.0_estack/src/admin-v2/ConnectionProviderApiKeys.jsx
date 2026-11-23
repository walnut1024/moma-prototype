import AdminStatus from './AdminStatus';
import AdminActionMenu from './AdminActionMenu';
import ChannelHealthDialog from './ChannelHealthDialog';
import { credentialRotationChannels } from './credential-rotation-scope';
import ChannelKeyPoolEditor from './ChannelKeyPoolEditor';
import { useEffect, useId, useRef, useState } from 'react';
import { IconPlus } from '@douyinfe/semi-icons';
import { Button, Input } from '@douyinfe/semi-ui';
import { CopyId, GridTable, Row, Cell, Modal, Notice } from './ModelOperationsUI';
import { supplierChannelResources, supplierChannelAssociations, supplierChannelCode, supplierChannelName, supplierKeyChannels } from './supplier-resources';
import { Field } from './ServiceUI';
import { providerApiKeysDraft, providerApiKeyRows, providerApiKeyName, providerApiKeyId, maskProviderApiKey } from './provider-management';
import './supplier-key-pool.css';

function KeyEditor({ provider, record, ops, close }) {
  const [value, setValue] = useState(''), [saving, setSaving] = useState(false), [accountRpm, setAccountRpm] = useState('');
  const [edited, setEdited] = useState(false), [discarding, setDiscarding] = useState(false);
  const [invalidRpm, setInvalidRpm] = useState(false);
  const formId = useId();
  const active = useRef(true), input = useRef(null), rpmInput = useRef(null);
  useEffect(() => { active.current = true; const frame = requestAnimationFrame(() => input.current?.focus()); return () => { active.current = false; cancelAnimationFrame(frame); }; }, []);
  const resume = () => { setDiscarding(false); requestAnimationFrame(() => input.current?.focus()); };
  const cancel = () => { if (saving) return; if (discarding) resume(); else if (edited) setDiscarding(true); else close(); };
  const footer = discarding ? <>
    <Button theme="light" autoFocus onClick={resume}>继续编辑</Button>
    <Button type="danger" onClick={() => { setValue(''); ops.dirty(false); close(); }}>放弃本次修改</Button>
  </> : <>
    <Button theme="light" disabled={saving} onClick={cancel}>取消</Button>
    <Button theme="solid" form={formId} htmlType="submit" disabled={!ops.can || saving || !value.trim()}>
      {saving ? '保存中…' : '保存'}
    </Button>
  </>;
  const description = record ? [providerApiKeyId(record.apiKey), record.endpoints.length ? `影响 ${record.endpoints.length} 个绑定连接` : null].filter(Boolean).join(' · ') : provider.name;
  return <Modal title={record ? '替换上游 API 密钥' : '添加上游 API 密钥'} description={description} onClose={cancel} footer={footer}>
      <form id={formId} hidden={discarding} style={discarding ? { display: 'none' } : undefined} className="supplier-key-form supplier-single-key-form" noValidate onSubmit={async event => {
        event.preventDefault(); event.stopPropagation(); if (saving || !ops.can) return;
        setSaving(true); ops.setError(''); setInvalidRpm(false);
        try {
          const draft = await providerApiKeysDraft([value]);
          if (!active.current) return;
          const apiKey = draft.apiKeys[0];
          if (record) {
            if (await ops.run('credentialReplace', {
              providerId: provider.id, keyId: record.apiKey.id, expectedFingerprint: record.apiKey.fingerprint,
              expectedEndpointIds: record.endpoints.map(endpoint => endpoint.id), newApiKey: apiKey,
            })) close();
            return;
          }
          if (accountRpm !== '' && (!Number.isSafeInteger(Number(accountRpm)) || Number(accountRpm) < 1)) {
            setInvalidRpm(true);
            requestAnimationFrame(() => rpmInput.current?.focus());
            return;
          }
          apiKey.accountRpm = accountRpm === '' ? null : Number(accountRpm);
          if (await ops.run('provider', { operation: 'addApiKeys', objectId: provider.id, values: { apiKeys: [apiKey], standalone: true } })) close();
        } catch (error) { if (active.current) ops.setError(error.message); }
        finally { if (active.current) setSaving(false); }
      }}>
        <Field label="上游 API 密钥 *" hint={record ? undefined : '保存后自动生成 ID，仅展示脱敏值。'}><Input ref={input} aria-label="上游 API 密钥" mode="password" autoComplete="new-password" maxLength={512} placeholder={record ? '请输入新的上游 API 密钥' : '请输入上游 API 密钥'} value={value} disabled={!ops.can || saving} onChange={value => { setValue(value); setEdited(true); ops.dirty(true); ops.setError(''); }}/></Field>
        {!record && <Field label="账号请求上限（RPM）" error={invalidRpm ? '账号 RPM 如填写必须为正整数' : undefined}><Input ref={rpmInput} aria-label="密钥账号请求上限" type="number" min={1} value={accountRpm} disabled={!ops.can || saving} placeholder="未配置" onChange={value => { setAccountRpm(value); setInvalidRpm(false); setEdited(true); ops.dirty(true); }}/></Field>}
        {ops.error && <Notice error>{ops.error}</Notice>}
      </form>
      {discarding && <Notice>放弃未保存的密钥输入？</Notice>}
    </Modal>;
}

export default function ConnectionProviderApiKeys({ state, provider, ops }) {
  const [editing, setEditing] = useState(null), [deleting, setDeleting] = useState(null), [keyAction, setKeyAction] = useState(null);
  const trigger = useRef(null), addTriggerId = useId();
  const resources = supplierChannelResources(state, provider);
  const rows = providerApiKeyRows(state, provider).filter(({ apiKey }) => apiKey.scope !== 'channel');
  const affected = keyAction?.row ? supplierKeyChannels(state, provider, keyAction.row.apiKey.id) : [];
  const open = (target, callback) => { trigger.current = target; ops.setError(''); callback(); };
  const close = () => { setEditing(null); setDeleting(null); setKeyAction(null); ops.setError(''); requestAnimationFrame(() => (trigger.current?.isConnected ? trigger.current : document.getElementById(addTriggerId))?.focus()); };
  const keyRecord = row => ({ ...row, endpoints: supplierKeyChannels(state, provider, row.apiKey.id) });
  return <>
    <div className="supplier-key-pool-toolbar"><Button id={addTriggerId} size="small" disabled={!ops.can} icon={<IconPlus size="small" aria-hidden="true"/>} onClick={event => open(event.currentTarget, () => setEditing({ record: null }))}>添加上游 API 密钥</Button></div>
    <GridTable className="supplier-key-table supplier-flat-key-table" headings={['密钥名称 / ID', '上游 API 密钥', '当前绑定连接', '状态', '操作']} empty={!rows.length} emptyMessage="暂无上游 API 密钥">
          {rows.map(row => { const channels = credentialRotationChannels(state, provider, row.apiKey.id); return <Row key={row.apiKey.id}><Cell><span>{providerApiKeyName(row.apiKey)}</span><small><CopyId copyAtStart value={row.apiKey.id} displayValue={providerApiKeyId(row.apiKey)} label="密钥 ID"/></small></Cell><Cell><code>{maskProviderApiKey(row.apiKey.maskedKey)}</code></Cell><Cell><AdminActionMenu label={'查看密钥 ' + providerApiKeyId(row.apiKey) + ' 当前绑定连接'}
              items={channels.length ? channels.map(channel => ({
                node: 'item', name: supplierChannelCode(channel) + ' · ' + supplierChannelName(provider, channel),
                onClick: () => ops.go({ connection: channel.id, tab: null, modelQ: null }),
              })) : [{ node: 'title', name: '暂无连接绑定' }]}>{channels.length} 个</AdminActionMenu></Cell><Cell><AdminStatus value={row.apiKey.revokedAt ? '已撤销' : row.apiKey.status === 'disabled' ? '已停用' : '已配置'}/></Cell><Cell><div className="supplier-row-actions"><Button theme="borderless" type="tertiary" aria-label={`测试连接 ${row.apiKey.id}`} disabled={!ops.can || !channels.length || Boolean(row.apiKey.revokedAt) || row.apiKey.status === 'disabled'} onClick={event => open(event.currentTarget, () => setKeyAction({ kind: 'test', row }))}>测试连接</Button>

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
    {deleting && <Modal title="删除上游 API 密钥" description={providerApiKeyId(deleting.apiKey)} onClose={close} footer={<><Button theme="light" onClick={close}>取消</Button><Button type="danger" disabled={!ops.can} onClick={async () => { if (await ops.run('provider', { operation: 'deleteApiKey', objectId: provider.id, values: { keyId: deleting.apiKey.id, expectedFingerprint: deleting.apiKey.fingerprint, confirmed: true } })) close(); }}>确认移除</Button></>}><p>确认移除此密钥？{deleting.endpoints.length ? '影响 ' + deleting.endpoints.length + ' 个连接，相关模型需要重新验证。' : ''}</p>{ops.error && <Notice error>{ops.error}</Notice>}</Modal>}
    {keyAction?.kind === 'test' && <ChannelHealthDialog state={state} provider={provider} apiKey={keyAction.row.apiKey} ops={ops} close={close}/>}
    {keyAction?.kind === 'pool' && <Modal title="选择连接密钥池" onClose={close}><p>先添加新上游 API 密钥，再在对应连接的密钥池中替换绑定并验证。</p>{credentialRotationChannels(state, provider, keyAction.row.apiKey.id).map(row => <Button key={row.id} theme="borderless" type="tertiary" onClick={() => setKeyAction({ ...keyAction, kind: 'pool-edit', endpointId: row.id })}>{row.name}</Button>)}</Modal>}
    {keyAction?.kind === 'pool-edit' && <ChannelKeyPoolEditor state={state} provider={provider} endpoint={resources.find(row => row.id === keyAction.endpointId)} ops={ops} close={close} directory/>}
    {keyAction && !['pool', 'pool-edit', 'test'].includes(keyAction.kind) && <Modal title={keyAction.kind === 'revoke' ? '紧急撤销上游 API 密钥' : '变更上游 API 密钥状态'} description={providerApiKeyId(keyAction.row.apiKey)} onClose={close} footer={<><Button theme="light" onClick={close}>取消</Button><Button theme="solid" type={keyAction.kind === 'revoke' ? 'danger' : 'primary'} disabled={!ops.can} onClick={async () => { if (keyAction.kind === 'revoke' ? await ops.run('credentialEmergencyRevoke', { providerId: provider.id, keyId: keyAction.row.apiKey.id, expectedFingerprint: keyAction.row.apiKey.fingerprint, confirmed: true }) : await ops.run('provider', { operation: 'toggleApiKey', objectId: provider.id, values: { keyId: keyAction.row.apiKey.id, expectedFingerprint: keyAction.row.apiKey.fingerprint, enabled: keyAction.row.apiKey.status === 'disabled', confirmed: true } })) close(); }}>{keyAction.kind==='revoke'?'确认紧急撤销':'确认变更'}</Button></>}><p>{keyAction.kind === 'revoke' ? '撤销后不能恢复；所有使用此凭证的新调用立即停止。' : ''}影响 {affected.length} 个连接，以及 {affected.reduce((sum, channel) => sum + supplierChannelAssociations(state, provider, channel.id).length, 0)} 条模型关联。变更后相关调用需重新测试，服务价格和路由配置保留。</p><ul className="supplier-reference-list">{affected.map(channel => <li key={channel.id}><strong>{supplierChannelCode(channel)} · {supplierChannelName(provider, channel)}</strong><span>{supplierChannelAssociations(state, provider, channel.id).map(item => item.modelId).join('、') || '未关联模型'}</span></li>)}</ul>{ops.error && <Notice error>{ops.error}</Notice>}</Modal>}
  </>;
}
