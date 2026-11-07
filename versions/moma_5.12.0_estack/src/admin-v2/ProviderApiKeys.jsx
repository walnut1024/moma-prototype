import AdminStatus from './AdminStatus';
import AdminActionMenu from './AdminActionMenu';
import ChannelHealthDialog from './ChannelHealthDialog';
import { credentialRotationOpening, credentialRotationChannels } from './credential-rotation-scope';
import ChannelKeyPoolEditor from './ChannelKeyPoolEditor';
import ChannelCredentialRotation from './ChannelCredentialRotation';
import KeyGroupCandidateDialog from './KeyGroupCandidateDialog';
import { useEffect, useId, useRef, useState } from 'react';
import { IconPlus } from '@douyinfe/semi-icons';
import { Button, Input, Typography } from '@douyinfe/semi-ui';
import { GridTable, Row, Cell, Modal, Notice } from './ModelOperationsUI';
import { supplierChannelResources, supplierChannelAssociations, supplierChannelCode, supplierChannelName, supplierKeyChannels } from './supplier-resources';
import { Field } from './ServiceUI';
import { providerApiKeysDraft, providerApiKeyRows, providerApiKeyName, providerApiKeyId, maskProviderApiKey } from './provider-management';
import { providerKeyGroups } from './provider-key-groups';
import './supplier-key-groups.css';

export function KeyEditor(props) {
  const [scope, setScope] = useState('');
  const [opening] = useState(() => props.state && props.record ? credentialRotationOpening(props.state, props.provider, props.record.apiKey.id) : { specificIds: [], sharedIds: [], route: 'plain' });
  if (opening.route === 'choose' && !scope) return <Modal title="选择密钥替换范围" description={props.provider.name} onClose={props.close} footer={<><Button theme="light" onClick={() => setScope('specific')}>替换指定渠道专属密钥</Button><Button onClick={() => setScope('group')}>轮换共享组主要密钥</Button></>}><p>此密钥同时用于 {opening.specificIds.length} 个专属绑定和 {opening.sharedIds.length} 个共享组引用，请明确本次替换范围。</p></Modal>;
  if (opening.route === 'specific' || scope === 'specific') return <ChannelCredentialRotation {...props} endpointIds={opening.specificIds}/>;
  if (opening.route === 'group' || scope === 'group') return <KeyGroupCandidateDialog state={props.state} provider={props.provider} group={props.group} ops={props.ops} close={props.close} excludedSpecificCount={opening.specificIds.length}/>;
  return <CredentialEditor {...props} record={props.record && props.state ? { ...props.record, endpoints: credentialRotationChannels(props.state, props.provider, props.record.apiKey.id) } : props.record}/>;
}

function CredentialEditor({ provider, group, record, ops, close }) {
  const [value, setValue] = useState(''), [saving, setSaving] = useState(false), [pending, setPending] = useState(null), [accountRpm, setAccountRpm] = useState(record?.apiKey.accountRpm || '');
  const [edited, setEdited] = useState(false), [discarding, setDiscarding] = useState(false);
  const [invalidRpm, setInvalidRpm] = useState(false);
  const formId = useId();
  const active = useRef(true), input = useRef(null), rpmInput = useRef(null);
  useEffect(() => { active.current = true; const frame = requestAnimationFrame(() => input.current?.focus()); return () => { active.current = false; cancelAnimationFrame(frame); }; }, []);
  const resume = () => { setDiscarding(false); setPending(null); requestAnimationFrame(() => input.current?.focus()); };
  const cancel = () => { if (saving) return; if (discarding) resume(); else if (edited) setDiscarding(true); else close(); };
  const save = async (apiKey, confirmed = false) => {
    const values = record ? { keyId: record.apiKey.id, expectedFingerprint: record.apiKey.fingerprint, apiKey, confirmed } : { apiKeys: [apiKey], groupId: group.id };
    if (await ops.run('provider', { operation: record ? 'editApiKey' : 'addApiKeys', objectId: provider.id, values })) close();
  };
  const footer = discarding ? <>
    <Button theme="light" autoFocus onClick={resume}>继续编辑</Button>
    <Button type="danger" onClick={() => { setValue(''); setPending(null); ops.dirty(false); close(); }}>放弃本次修改</Button>
  </> : pending ? <>
    <Button theme="light" onClick={resume}>返回替换</Button>
    <Button theme="solid" disabled={!ops.can} onClick={async () => await save(pending, true)}>确认替换</Button>
  </> : <>
    <Button theme="light" disabled={saving} onClick={cancel}>取消</Button>
    <Button theme="solid" form={formId} htmlType="submit" disabled={!ops.can || saving}>
      {saving ? '保存中…' : record ? '替换' : '保存'}
    </Button>
  </>;
  return <Modal title={record ? '替换 API 密钥' : '添加 API 密钥'} description={record ? providerApiKeyId(record.apiKey) : `${provider.name} · ${group.name}`} onClose={cancel} footer={footer}>
      <form id={formId} hidden={discarding || Boolean(pending)} style={discarding || pending ? { display: 'none' } : undefined} className="supplier-key-form supplier-single-key-form" noValidate onSubmit={async event => {
        event.preventDefault(); event.stopPropagation(); if (saving || !ops.can) return;
        setSaving(true); ops.setError(''); setInvalidRpm(false);
        try {
          const draft = await providerApiKeysDraft([value]);
          if (!active.current) return;
          const apiKey = draft.apiKeys[0];
          if (accountRpm !== '' && (!Number.isSafeInteger(Number(accountRpm)) || Number(accountRpm) < 1)) {
            setInvalidRpm(true);
            requestAnimationFrame(() => rpmInput.current?.focus());
            return;
          }
          apiKey.accountRpm = accountRpm === '' ? null : Number(accountRpm);
          if (record?.endpoints.length && apiKey.fingerprint !== record.apiKey.fingerprint) setPending(apiKey);
          else await save(apiKey);
        } catch (error) { if (active.current) ops.setError(error.message); }
        finally { if (active.current) setSaving(false); }
      }}>
        <Field label="API 密钥 *" hint={record ? '输入新的密钥后替换当前密钥，原值不回显。' : '保存后自动生成 ID，仅展示脱敏值。'}><Input ref={input} aria-label="API 密钥" mode="password" autoComplete="new-password" maxLength={512} placeholder={record ? '请输入新的 API 密钥' : '请输入 API 密钥'} value={value} disabled={!ops.can || saving} onChange={value => { setValue(value); setEdited(true); ops.dirty(true); ops.setError(''); }}/></Field>
        <Field label="账号请求上限（RPM）" error={invalidRpm ? '账号 RPM 如填写必须为正整数' : undefined}><Input ref={rpmInput} aria-label="密钥账号请求上限" type="number" min={1} value={accountRpm} disabled={!ops.can || saving} placeholder="未配置" onChange={value => { setAccountRpm(value); setInvalidRpm(false); setEdited(true); ops.dirty(true); }}/></Field>
        {ops.error && <Notice error>{ops.error}</Notice>}
      </form>
      {discarding ? <Notice>放弃未保存的密钥输入？已保存的密钥保留。</Notice> : pending && <>
        <Typography.Paragraph>此密钥已关联 {record.endpoints.length} 个接入地址。替换后关联模型需要重新验证，请确认后继续。</Typography.Paragraph>
        {ops.error && <Notice error>{ops.error}</Notice>}
      </>}
    </Modal>;
}

function KeyGroupEditor({ provider, group, ops, close, saved }) {
  const formId = useId();
  const [name, setName] = useState(group?.name || '');
  return <Modal title={group ? '重命名密钥组' : '新建密钥组'} description={provider.name} onClose={() => ops.proceed(close)} footer={<><Button theme="light" onClick={() => ops.proceed(close)}>取消</Button><Button form={formId} htmlType="submit" theme="solid" disabled={!ops.can}>保存</Button></>}><form id={formId} className="supplier-key-form" noValidate onSubmit={async event => {
    event.preventDefault();
    const next = await ops.run('provider', { operation: 'keyGroupSave', objectId: provider.id, values: { groupId: group?.id, name } });
    if (next) { const current = next.providers.find(item => item.id === provider.id); const created = providerKeyGroups(current).find(item => group ? item.id === group.id : item.name === name.trim()); saved(created?.id); }
  }}>
    <Field label="密钥组名称 *"><Input autoFocus aria-label="密钥组名称" value={name} maxLength={60} disabled={!ops.can} onChange={value => { setName(value); ops.dirty(true); ops.setError(''); }}/></Field>
    {ops.error && <Notice error>{ops.error}</Notice>}
  </form></Modal>;
}

export default function ProviderApiKeys({ state, provider, ops }) {
  const [reordering,setReordering]=useState(false);
  const [editing, setEditing] = useState(null), [deleting, setDeleting] = useState(null), [keyAction, setKeyAction] = useState(null);
  const [groupEditing, setGroupEditing] = useState(null), [groupDeleting, setGroupDeleting] = useState(null);
  const [selectedGroupId, setSelectedGroupId] = useState('default');
  const trigger = useRef(null), addTriggerId = useId();
  const allRows = providerApiKeyRows(state, provider), resources = supplierChannelResources(state, provider);
  const groups = providerKeyGroups(provider, allRows.map(row => row.apiKey));
  const group = groups.find(item => item.id === selectedGroupId) || groups[0];
  const rows = group.keyIds.map(id => allRows.find(row => row.apiKey.id === id)).filter(Boolean);
  const returning = resources.find(row => row.id === ops.params.get('credentialChannel'));
  const groupChannels = id => resources.filter(channel => channel.authMode === 'group' && channel.keyGroupId === id || id === 'default' && channel.authMode === 'inherit');
  const candidate = provider.keyGroupCandidates?.find(row=>row.groupId===group.id);
  const affected = keyAction?.row ? supplierKeyChannels(state, provider, keyAction.row.apiKey.id) : [];
  const deleteGroupChannels = groupDeleting ? groupChannels(groupDeleting.id) : [];
  const open = (target, callback) => { trigger.current = target; ops.setError(''); callback(); };
  const close = () => { setEditing(null); setDeleting(null); setKeyAction(null); setGroupEditing(null); setGroupDeleting(null); ops.setError(''); requestAnimationFrame(() => (trigger.current?.isConnected ? trigger.current : document.getElementById(addTriggerId))?.focus()); };
  const keyRecord = row => ({ ...row, endpoints: supplierKeyChannels(state, provider, row.apiKey.id) });
  const move = async (event,row,direction) => {
    if(reordering)return;
    trigger.current=event.currentTarget;ops.setError('');setReordering(true);
    try { const next=await ops.run('keyGroupPriority',{providerId:provider.id,groupId:group.id,keyId:row.apiKey.id,direction,expectedKeyIds:group.keyIds,expectedGroupVersion:provider.keyGroupRevisions?.[group.id] || 0});if(next?.providers.find(item=>item.id===provider.id).keyGroupCandidates?.some(item=>item.groupId===group.id))setKeyAction({kind:'priority',group}); }
    finally {setReordering(false);}
  };
  return <>
    {returning && <div className="supplier-resource-notice"><Notice>为渠道 {supplierChannelCode(returning)} · {supplierChannelName(provider, returning)} 配置密钥组。<Button theme="borderless" type="tertiary" onClick={() => ops.go({ tab: 'catalogue', resource: returning.id, credentialChannel: null })}>返回渠道配置</Button></Notice></div>}
    <div className="supplier-key-groups">
      <aside className="supplier-key-group-sidebar" aria-label="API 密钥组">
        <div className="supplier-key-group-heading"><Typography.Title heading={5} component="h3">密钥组</Typography.Title><Button theme="borderless" type="tertiary" size="small" disabled={!ops.can} icon={<IconPlus size="small" aria-hidden="true"/>} onClick={event => open(event.currentTarget, () => setGroupEditing({ group: null }))}>新建组</Button></div>
        <nav className="supplier-key-group-options" aria-label="选择密钥组">{groups.map(item => <Button key={item.id} type={item.id === group.id ? 'primary' : 'tertiary'} theme={item.id === group.id ? 'light' : 'borderless'} aria-pressed={item.id === group.id} title={item.name} onClick={() => ops.proceed(() => { setSelectedGroupId(item.id); ops.setError(''); })}><span>{item.name}</span><small>{item.keyIds.length}</small></Button>)}</nav>
      </aside>
      <section className="supplier-key-group-content" aria-label={group.name}>
        <div className="supplier-key-group-toolbar"><Typography.Title heading={5} component="h3">{group.name}</Typography.Title><div className="supplier-row-actions">{group.id !== 'default' && <><Button theme="borderless" type="tertiary" size="small" disabled={!ops.can} onClick={event => open(event.currentTarget, () => setGroupEditing({ group }))}>重命名</Button><Button theme="borderless" type="tertiary" size="small" disabled={!ops.can} onClick={event => open(event.currentTarget, () => setGroupDeleting(group))}>删除组</Button></>}<Button id={addTriggerId} size="small" disabled={!ops.can} icon={<IconPlus size="small" aria-hidden="true"/>} onClick={event => open(event.currentTarget, () => setEditing({ record: null, group }))}>添加 API 密钥</Button></div></div>
        {candidate && <Notice>此组有待处理的密钥{candidate.priorityChange?'优先级调整':'轮换'}。<Button theme="borderless" type="tertiary" disabled={!ops.can} onClick={event=>open(event.currentTarget,()=>setKeyAction({kind:'priority',group}))}>继续处理</Button></Notice>}
        <GridTable className="supplier-key-table supplier-group-key-table" headings={['优先级', '密钥名称 / ID', 'API 密钥', '当前绑定渠道', '状态', '操作']} empty={!rows.length} emptyMessage="当前密钥组暂无密钥，请点击添加 API 密钥。">
          {rows.map((row, index) => { const channels = credentialRotationChannels(state, provider, row.apiKey.id); return <Row key={row.apiKey.id}><Cell><span>{index + 1}</span></Cell><Cell><span>{providerApiKeyName(row.apiKey)}</span><small><code>{providerApiKeyId(row.apiKey)}</code></small></Cell><Cell><code>{maskProviderApiKey(row.apiKey.maskedKey)}</code></Cell><Cell><AdminActionMenu label={'查看密钥 ' + providerApiKeyId(row.apiKey) + ' 当前绑定渠道'}
              items={channels.length ? channels.map(channel => ({
                node: 'item', name: supplierChannelCode(channel) + ' · ' + supplierChannelName(provider, channel),
                onClick: () => ops.go({ tab: 'catalogue', resource: channel.id }),
              })) : [{ node: 'title', name: '暂无渠道绑定' }]}>{channels.length} 个</AdminActionMenu></Cell><Cell><AdminStatus value={row.apiKey.revokedAt ? '已撤销' : row.apiKey.status === 'disabled' ? '已停用' : '已配置'}/></Cell><Cell><div className="supplier-row-actions"><Button theme="borderless" type="tertiary" aria-label={`检测密钥 ${row.apiKey.id}`} disabled={!ops.can || Boolean(row.apiKey.revokedAt) || row.apiKey.status === 'disabled'} onClick={event => open(event.currentTarget, () => setKeyAction({ kind: 'test', row }))}>检测</Button>

            <Button theme="borderless" type="tertiary" size="small" disabled={!ops.can} aria-label={(channels.some(channel => channel.authMode === 'pool') ? '管理密钥池：' : '替换：') + providerApiKeyId(row.apiKey)} onClick={event => open(event.currentTarget, () => channels.some(channel => channel.authMode === 'pool') ? setKeyAction({ kind: 'pool', row, group }) : setEditing({ record: keyRecord(row), group }))}>{channels.some(channel => channel.authMode === 'pool') ? '管理密钥池' : '替换'}</Button>
            <Button theme="borderless" type="tertiary" size="small" aria-label={'上移 '+providerApiKeyName(row.apiKey)} disabled={!ops.can || reordering || Boolean(ops.conflict) || Boolean(candidate) || index===0} onClick={event=>move(event,row,'up')}>上移</Button><Button theme="borderless" type="tertiary" size="small" aria-label={'下移 '+providerApiKeyName(row.apiKey)} disabled={!ops.can || reordering || Boolean(ops.conflict) || Boolean(candidate) || index===rows.length-1} onClick={event=>move(event,row,'down')}>下移</Button>
            <AdminActionMenu label={'密钥更多操作 ' + providerApiKeyId(row.apiKey)} disabled={!ops.can} items={[
              { node: 'item', name: row.apiKey.status === 'disabled' ? '启用' : '停用',
                disabled: Boolean(row.apiKey.revokedAt) || !provider.apiKeys?.some(key => key.id === row.apiKey.id),
                onClick: button => open(button, () => setKeyAction({ kind: 'toggle', row, group })) },
              { node: 'item', name: '移除',
                onClick: button => open(button, () => setDeleting({ ...keyRecord(row), group, nextKey: index === 0 ? rows[1]?.apiKey : null })) },
              { node: 'item', name: '紧急撤销', type: 'danger', disabled: Boolean(row.apiKey.revokedAt),
                onClick: button => open(button, () => setKeyAction({ kind: 'revoke', row, group })) },
            ]}/>
          </div></Cell></Row>; })}
        </GridTable>
      </section>
    </div>
    {editing && <KeyEditor state={state} key={editing.record?.apiKey.id || 'new'} provider={provider} group={editing.group} record={editing.record} ops={ops} close={close}/>}
    {groupEditing && <KeyGroupEditor provider={provider} group={groupEditing.group} ops={ops} close={close} saved={id => { if (id) setSelectedGroupId(id); close(); }}/>}
    {groupDeleting && <Modal title="删除密钥组" description={groupDeleting.name} onClose={close} footer={<><Button theme="light" onClick={close}>取消</Button><Button type="danger" disabled={!ops.can || groupDeleting.keyIds.length > 0 || deleteGroupChannels.length > 0} onClick={async () => { if (await ops.run('provider', { operation: 'keyGroupDelete', objectId: provider.id, values: { groupId: groupDeleting.id, confirmed: true } })) { setSelectedGroupId('default'); close(); } }}>确认删除</Button></>}>{groupDeleting.keyIds.length ? <Notice error>请先移除组内全部 {groupDeleting.keyIds.length} 条 API 密钥，再删除密钥组。</Notice> : deleteGroupChannels.length ? <Notice error>该密钥组被 {deleteGroupChannels.length} 个渠道引用，请先更换这些渠道使用的密钥组。</Notice> : <p>确认删除此空密钥组？</p>}{deleteGroupChannels.length > 0 && <ul className="supplier-reference-list">{deleteGroupChannels.map(channel => <li key={channel.id}>{supplierChannelCode(channel)} · {supplierChannelName(provider, channel)}</li>)}</ul>}{ops.error && <Notice error>{ops.error}</Notice>}</Modal>}
    {deleting && <Modal title="移除 API 密钥" description={providerApiKeyId(deleting.apiKey)} onClose={close} footer={<><Button theme="light" onClick={close}>取消</Button><Button type="danger" disabled={!ops.can} onClick={async () => { if (await ops.run('provider', { operation: 'deleteApiKey', objectId: provider.id, values: { keyId: deleting.apiKey.id, expectedFingerprint: deleting.apiKey.fingerprint, confirmed: true } })) close(); }}>确认移除</Button></>}><p>确认移除此密钥？{deleting.nextKey ? '移除后本组下一条密钥将成为主要密钥。' : deleting.group.keyIds.length === 1 ? '移除后该密钥组将没有可用密钥。' : ''}{deleting.endpoints.length ? '影响 ' + deleting.endpoints.length + ' 个渠道，相关模型需要重新验证。' : ''}</p>{ops.error && <Notice error>{ops.error}</Notice>}</Modal>}
    {keyAction?.kind === 'test' && <ChannelHealthDialog state={state} provider={provider} apiKey={keyAction.row.apiKey} ops={ops} close={close}/>}
    {keyAction?.kind === 'priority' && <KeyGroupCandidateDialog state={state} provider={provider} group={keyAction.group} ops={ops} close={close}/>}
    {keyAction?.kind === 'pool' && <Modal title="选择渠道密钥池" onClose={close}><p>先添加新 API 密钥，再在对应渠道的密钥池中替换绑定并验证。</p>{affected.filter(row => row.authMode === 'pool').map(row => <Button key={row.id} theme="borderless" type="tertiary" onClick={() => setKeyAction({ ...keyAction, kind: 'pool-edit', endpointId: row.id })}>{row.name}</Button>)}</Modal>}
    {keyAction?.kind === 'pool-edit' && <ChannelKeyPoolEditor state={state} provider={provider} endpoint={resources.find(row => row.id === keyAction.endpointId)} ops={ops} close={close}/>}
    {keyAction && !['pool', 'pool-edit', 'test', 'priority'].includes(keyAction.kind) && <Modal title={keyAction.kind === 'revoke' ? '紧急撤销 API 密钥' : '变更 API 密钥状态'} description={providerApiKeyId(keyAction.row.apiKey)} onClose={close} footer={<><Button theme="light" onClick={close}>取消</Button><Button theme="solid" type={keyAction.kind === 'revoke' ? 'danger' : 'primary'} disabled={!ops.can} onClick={async () => { if (keyAction.kind === 'revoke' ? await ops.run('credentialEmergencyRevoke', { providerId: provider.id, keyId: keyAction.row.apiKey.id, expectedFingerprint: keyAction.row.apiKey.fingerprint, confirmed: true }) : await ops.run('provider', { operation: 'toggleApiKey', objectId: provider.id, values: { groupId: keyAction.group.id, keyId: keyAction.row.apiKey.id, expectedFingerprint: keyAction.row.apiKey.fingerprint, enabled: keyAction.row.apiKey.status === 'disabled', confirmed: true } })) close(); }}>{keyAction.kind==='revoke'?'确认紧急撤销':'确认变更'}</Button></>}><p>{keyAction.kind === 'revoke' ? '撤销后不能恢复；所有使用此凭证的新调用立即停止。' : ''}影响 {affected.length} 个渠道，以及 {affected.reduce((sum, channel) => sum + supplierChannelAssociations(state, provider, channel.id).length, 0)} 条模型关联。变更后相关调用需重新测试，服务价格和路由配置保留。</p><ul className="supplier-reference-list">{affected.map(channel => <li key={channel.id}><strong>{supplierChannelCode(channel)} · {supplierChannelName(provider, channel)}</strong><span>{supplierChannelAssociations(state, provider, channel.id).map(item => item.modelId).join('、') || '未关联模型'}</span></li>)}</ul>{ops.error && <Notice error>{ops.error}</Notice>}</Modal>}
  </>;
}
