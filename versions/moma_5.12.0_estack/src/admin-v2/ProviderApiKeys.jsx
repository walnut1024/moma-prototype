import ChannelHealthDialog from './ChannelHealthDialog';
import { credentialRotationOpening, credentialRotationChannels } from './credential-rotation-scope';
import ChannelKeyPoolEditor from './ChannelKeyPoolEditor';
import ChannelCredentialRotation from './ChannelCredentialRotation';
import KeyGroupCandidateDialog from './KeyGroupCandidateDialog';
import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, LoaderCircle, Plus, Radio } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Command, CommandInput, CommandList, CommandGroup, CommandItem, CommandEmpty } from '../components/ui/command';
import { GridTable, Row, Cell, MoreActions, Modal, Notice, Status } from './ModelOperationsUI';
import { supplierChannelResources, supplierChannelAssociations, supplierChannelCode, supplierChannelName, supplierKeyChannels } from './supplier-resources';
import { Choice, Field } from './ModelMetadataForm';
import { providerApiKeysDraft, providerApiKeyRows, providerApiKeyName, providerApiKeyId, maskProviderApiKey, providerModelConnectivityTest, MODEL_CONNECTIVITY_SCENARIOS } from './provider-management';
import { catalogueConnections } from './provider-model-connections';
import { providerCatalogueIds } from './moma-provider';
import { supplyConnectivityTest } from './model-operations';
import { connectionCredentialsReady } from './connection-state';
import { supplyModelUrl } from './model-management';
import { providerKeyGroups } from './provider-key-groups';
import './supplier-key-groups.css';

export function KeyEditor(props) {
  const [scope, setScope] = useState('');
  const [opening] = useState(() => props.state && props.record ? credentialRotationOpening(props.state, props.provider, props.record.apiKey.id) : { specificIds: [], sharedIds: [], route: 'plain' });
  if (opening.route === 'choose' && !scope) return <Modal title="选择密钥替换范围" description={props.provider.name} onClose={props.close}><p>此密钥同时用于 {opening.specificIds.length} 个专属绑定和 {opening.sharedIds.length} 个共享组引用，请明确本次替换范围。</p><div className="supplier-key-actions"><Button variant="outline" onClick={() => setScope('specific')}>替换指定渠道专属密钥</Button><Button onClick={() => setScope('group')}>轮换共享组主要密钥</Button></div></Modal>;
  if (opening.route === 'specific' || scope === 'specific') return <ChannelCredentialRotation {...props} endpointIds={opening.specificIds}/>;
  if (opening.route === 'group' || scope === 'group') return <KeyGroupCandidateDialog state={props.state} provider={props.provider} group={props.group} ops={props.ops} close={props.close} excludedSpecificCount={opening.specificIds.length}/>;
  return <CredentialEditor {...props} record={props.record && props.state ? { ...props.record, endpoints: credentialRotationChannels(props.state, props.provider, props.record.apiKey.id) } : props.record}/>;
}

function CredentialEditor({ provider, group, record, ops, close }) {
  const [value, setValue] = useState(''), [saving, setSaving] = useState(false), [pending, setPending] = useState(null), [accountRpm, setAccountRpm] = useState(record?.apiKey.accountRpm || '');
  const [edited, setEdited] = useState(false), [discarding, setDiscarding] = useState(false);
  const active = useRef(true), input = useRef(null);
  useEffect(() => { active.current = true; const frame = requestAnimationFrame(() => input.current?.focus()); return () => { active.current = false; cancelAnimationFrame(frame); }; }, []);
  const resume = () => { setDiscarding(false); setPending(null); requestAnimationFrame(() => input.current?.focus()); };
  const cancel = () => { if (saving) return; if (discarding) resume(); else if (edited) setDiscarding(true); else close(); };
  const save = async (apiKey, confirmed = false) => {
    const values = record ? { keyId: record.apiKey.id, expectedFingerprint: record.apiKey.fingerprint, apiKey, confirmed } : { apiKeys: [apiKey], groupId: group.id };
    if (await ops.run('provider', { operation: record ? 'editApiKey' : 'addApiKeys', objectId: provider.id, values })) close();
  };
  return <Modal title={record ? '替换 API 密钥' : '添加 API 密钥'} description={record ? providerApiKeyId(record.apiKey) : `${provider.name} · ${group.name}`} onClose={cancel}>
      <form hidden={discarding || Boolean(pending)} style={discarding || pending ? { display: 'none' } : undefined} className="supplier-key-form supplier-single-key-form" noValidate onSubmit={async event => {
        event.preventDefault(); event.stopPropagation(); if (saving || !ops.can) return;
        setSaving(true); ops.setError('');
        try {
          const draft = await providerApiKeysDraft([value]);
          if (!active.current) return;
          const apiKey = draft.apiKeys[0];
          if (accountRpm !== '' && (!Number.isSafeInteger(Number(accountRpm)) || Number(accountRpm) < 1)) throw new Error('账号 RPM 如填写必须为正整数');
          apiKey.accountRpm = accountRpm === '' ? null : Number(accountRpm);
          if (record?.endpoints.length && apiKey.fingerprint !== record.apiKey.fingerprint) setPending(apiKey);
          else await save(apiKey);
        } catch (error) { if (active.current) ops.setError(error.message); }
        finally { if (active.current) setSaving(false); }
      }}>
        <Field label="API 密钥" hint={record ? '输入新的密钥后替换当前密钥，原值不回显。' : '保存后自动生成 ID，仅展示脱敏值。'}><Input ref={input} aria-label="API 密钥" type="password" autoComplete="new-password" maxLength={512} placeholder={record ? '请输入新的 API 密钥' : '请输入 API 密钥'} value={value} disabled={!ops.can || saving} onChange={event => { setValue(event.target.value); setEdited(true); ops.dirty(true); ops.setError(''); }}/></Field>
        <Field label="账号请求上限（RPM）"><Input aria-label="密钥账号请求上限" type="number" min={1} value={accountRpm} disabled={!ops.can || saving} placeholder="未配置" onChange={event => { setAccountRpm(event.target.value); setEdited(true); ops.dirty(true); }}/></Field>
        {ops.error && <p role="alert" className="supplier-key-error">{ops.error}</p>}
        <div className="supplier-key-actions"><Button type="button" variant="outline" disabled={saving} onClick={cancel}>取消</Button><Button type="submit" disabled={!ops.can || saving}>{saving ? '保存中…' : record ? '替换' : '保存'}</Button></div>
      </form>
      {discarding ? <div><Notice>放弃未保存的密钥输入？已保存的密钥保留。</Notice><div className="supplier-key-actions"><Button type="button" variant="outline" autoFocus onClick={resume}>继续编辑</Button><Button type="button" onClick={() => { setValue(''); setPending(null); ops.dirty(false); close(); }}>放弃修改</Button></div></div> : pending && <div><p>此密钥已关联 {record.endpoints.length} 个接入地址。替换后关联模型需要重新验证，请确认后继续。</p>{ops.error && <Notice error>{ops.error}</Notice>}<div className="supplier-key-actions"><Button type="button" variant="outline" onClick={() => { setPending(null); requestAnimationFrame(() => input.current?.focus()); }}>返回替换</Button><Button type="button" disabled={!ops.can} onClick={async () => await save(pending, true)}>确认替换</Button></div></div>}
    </Modal>;
}

export function ModelConnectivityTest({ state, provider, apiKey, endpoint: initialEndpoint, supply, catalogueModelId, ops, close }) {
  const modelEndpoints = catalogueModelId ? catalogueConnections(state, provider, catalogueModelId) : null;
  const endpoints = state.endpoints.filter(item => (!modelEndpoints || modelEndpoints.some(endpoint => endpoint.id === item.id)) && item.providerId === provider.id && (!apiKey || provider.apiKeys?.some(key => key.fingerprint === apiKey.fingerprint) || item.apiKeys?.some(key => key.fingerprint === apiKey.fingerprint)));
  const models = catalogueModelId ? providerCatalogueIds(provider).filter(id => id === catalogueModelId) : supply ? [supply.upstreamModelId] : providerCatalogueIds(provider).filter(id => !catalogueConnections(state, provider, id).length || catalogueConnections(state, provider, id).some(item => endpoints.some(endpoint => endpoint.id === item.id) && (!initialEndpoint || item.id === initialEndpoint.id)));
  const [modelId, setModelId] = useState(catalogueModelId || supply?.upstreamModelId || ''), [upstreamId, setUpstreamId] = useState(catalogueModelId || supply?.upstreamModelId || ''), [pickerOpen, setPickerOpen] = useState(false);
  const [prompt, setPrompt] = useState('请只回复 OK。');
  const [scenario, setScenario] = useState('success');
  const mapped = catalogueConnections(state, provider, modelId).filter(item => endpoints.some(endpoint => endpoint.id === item.id));
  const candidates = initialEndpoint ? [initialEndpoint] : mapped.length ? mapped : endpoints;
  const [endpointId, setEndpointId] = useState(initialEndpoint?.id || (endpoints.length === 1 ? endpoints[0].id : ''));
  const endpoint = candidates.find(item => item.id === endpointId);
  const [selectedKeyId, setSelectedKeyId] = useState('');
  const keys = endpoint?.apiKeys || [];
  const testKeyId = keys.some(key => key.id === selectedKeyId) ? selectedKeyId : keys.length === 1 ? keys[0].id : '';
  const credentialsReady = apiKey || supply || (testKeyId || connectionCredentialsReady(endpoint, provider) && !keys.length);
  const requestUrl = supply && supplyModelUrl(supply, state.models.find(item => item.id === supply.modelId));
  const [testing, setTesting] = useState(false), [result, setResult] = useState(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const chooseModel = id => {
    setModelId(id); setUpstreamId(id); setPickerOpen(false); setResult(null);
    const configured = catalogueConnections(state, provider, id).filter(item => endpoints.some(endpoint => endpoint.id === item.id));
    const choices = initialEndpoint ? [initialEndpoint] : configured.length ? configured : endpoints;
    setEndpointId(choices.length === 1 ? choices[0].id : '');
  };
  const start = () => {
    if (!ops.can || testing || !endpoint || !modelId || !upstreamId.trim() || !prompt.trim() || !credentialsReady) return;
    setTesting(true); setResult(null);
    timer.current = setTimeout(() => {
      try { const key = apiKey && [...(provider.apiKeys || []), ...(endpoint.apiKeys || [])].find(item => item.fingerprint === apiKey.fingerprint); setResult(supply ? supplyConnectivityTest(state, { modelId: supply.modelId, supplyId: supply.id, prompt, scenario }) : providerModelConnectivityTest(state, { providerId: provider.id, keyId: key?.id || testKeyId, endpointId, modelId, upstreamId, prompt, scenario })); }
      catch (error) { setResult({ result: '失败', title: '无法开始测试', message: error.message, upstreamId }); }
      setTesting(false);
    }, 800);
  };
  const cancel = () => { clearTimeout(timer.current); setTesting(false); setResult({ result: '已取消', title: '测试已取消', message: '本次测试已取消，可以调整配置后重新测试。', upstreamId }); };
  return <Modal wide title="模型连通性测试" description={provider.name + (apiKey ? ' · API 密钥 ' + maskProviderApiKey(apiKey.maskedKey) : ' · 使用已配置凭证')} onClose={close}><div className="supplier-model-test">
    <section className="supplier-test-config" aria-label="测试配置"><h3>测试配置</h3>
      <Field label="测试模型 *"><Popover open={pickerOpen} onOpenChange={setPickerOpen}><PopoverTrigger asChild><Button variant="outline" role="combobox" aria-label="选择测试模型" aria-expanded={pickerOpen} disabled={Boolean(supply || catalogueModelId) || testing || !ops.can || !models.length} className="supplier-test-model-trigger"><span>{modelId || '搜索并选择供应商模型'}</span><ChevronDown data-icon="inline-end"/></Button></PopoverTrigger><PopoverContent align="start" className="supplier-test-model-options"><Command><CommandInput aria-label="搜索测试模型" placeholder="搜索模型名称 / Model ID"/><CommandList><CommandEmpty>没有匹配的模型</CommandEmpty><CommandGroup>{models.map(id => <CommandItem key={id} value={id} onSelect={() => chooseModel(id)}>{id}{id === modelId && <Check data-icon="inline-end"/>}</CommandItem>)}</CommandGroup></CommandList></Command></PopoverContent></Popover></Field>
      {!models.length && <Notice error>供应商目录暂无模型，请先添加模型。</Notice>}
      <Field label="调用 Model ID *" hint="用于本次请求，不修改目录资料。"><Input aria-label="测试调用 Model ID" value={upstreamId} maxLength={200} disabled={Boolean(supply) || testing || !modelId || !ops.can} onChange={event => { setUpstreamId(event.target.value); setResult(null); }}/></Field>
      {candidates.length ? <Field label="接入地址 *"><Choice label="测试接入地址" value={endpointId} options={candidates.map(item => [item.id, requestUrl || item.baseUrl])} disabled={Boolean(initialEndpoint) || testing || !ops.can} onChange={id => { setEndpointId(id); setSelectedKeyId(''); setResult(null); }}/></Field> : <Notice error>请先在模型目录配置接入地址。</Notice>}
      {!supply && !catalogueModelId && modelId && !mapped.length && candidates.length > 0 && <small className="supplier-test-hint">该模型尚未关联地址，选择的地址仅用于本次测试。</small>}
      {!apiKey && !supply && endpoint && (keys.length ? <Field label="API 密钥 *"><Choice label="测试 API 密钥" value={testKeyId || 'choose'} options={[['choose', '请选择 API 密钥'], ...keys.map(key => [key.id, providerApiKeyName(key)])]} disabled={testing || !ops.can} onChange={id => { setSelectedKeyId(id); setResult(null); }}/></Field> : <Notice error={!credentialsReady}>{credentialsReady ? provider.sourceType === 'selfHosted' ? '此服务无需 API 密钥。' : '使用已配置的凭证引用。' : '当前 API 地址尚未关联凭证，请先通过 API 密钥操作完成配置。'}</Notice>)}
      <Field label="测试内容 *"><Textarea aria-label="模型测试内容" value={prompt} maxLength={2000} disabled={testing || !ops.can} onChange={event => { setPrompt(event.target.value); setResult(null); }}/></Field>
      <div className="supplier-test-protocol"><span>协议</span><b>{endpoint?.protocol || '—'}</b><span>最大输出</span><b>32 Tokens</b></div>
      {new URLSearchParams(location.hash.split('?')[1] || '').get('devtools') === '1' && <Field label="结果预览"><Choice label="模型测试结果预览" value={scenario} options={Object.entries(MODEL_CONNECTIVITY_SCENARIOS)} disabled={testing || !ops.can} onChange={value => { setScenario(value); setResult(null); }}/></Field>}
    </section>
    <section className="supplier-test-result" aria-label="测试结果" aria-live="polite"><h3>测试结果</h3>
      {testing ? <div className="supplier-test-empty" role="status"><LoaderCircle className="animate-spin"/><strong>正在测试</strong><p>目标模型：{upstreamId}</p></div> : result ? <div className="supplier-test-response"><Notice error={result.result === '失败'}><strong>{result.title}</strong><p>{result.message}</p>{result.hint && <p>{result.hint}</p>}</Notice><dl><div><dt>模型</dt><dd>{result.upstreamId || upstreamId}</dd></div><div><dt>HTTP 状态</dt><dd>{result.status ?? (result.response ? '未收到响应' : '—')}</dd></div><div><dt>响应耗时</dt><dd>{result.durationMs == null ? '—' : result.durationMs.toLocaleString('zh-CN') + ' ms'}</dd></div><div><dt>接入地址</dt><dd>{result.baseUrl || requestUrl || endpoint?.baseUrl || '—'}</dd></div></dl><div className="supplier-test-response-body"><h4>{result.result === '失败' ? '错误详情' : '模型响应'}</h4>{result.response ? <><p className="supplier-test-output">{result.response.choices?.[0]?.message.content || result.response.error?.message}</p><details><summary>响应详情</summary><pre>{JSON.stringify(result.response, null, 2)}</pre></details></> : <p>本次测试未产生响应。</p>}</div></div> : <div className="supplier-test-empty"><Radio/><strong>等待测试</strong><p>选择模型并填写测试内容，结果将在此显示。</p></div>}
    </section>
    <footer className="supplier-test-footer"><span>结果为交互预览，不发送真实模型请求或改变启用状态。</span><div className="supplier-key-actions"><Button variant="outline" onClick={close}>关闭</Button>{!models.length || !endpoints.length ? <Button disabled={!ops.can} onClick={() => { close(); ops.go({ tab: 'catalogue' }); }}>前往模型渠道</Button> : testing ? <Button variant="outline" onClick={cancel}>取消测试</Button> : <Button disabled={!ops.can || !endpoint || !modelId || !upstreamId.trim() || !prompt.trim() || !credentialsReady} onClick={start}>{result ? '重新测试' : '开始测试'}</Button>}</div></footer>
  </div></Modal>;
}

function KeyGroupEditor({ provider, group, ops, close, saved }) {
  const [name, setName] = useState(group?.name || '');
  return <Modal title={group ? '重命名密钥组' : '新建密钥组'} description={provider.name} onClose={() => ops.proceed(close)}><form className="supplier-key-form" noValidate onSubmit={async event => {
    event.preventDefault();
    const next = await ops.run('provider', { operation: 'keyGroupSave', objectId: provider.id, values: { groupId: group?.id, name } });
    if (next) { const current = next.providers.find(item => item.id === provider.id); const created = providerKeyGroups(current).find(item => group ? item.id === group.id : item.name === name.trim()); saved(created?.id); }
  }}>
    <Field label="密钥组名称 *"><Input autoFocus aria-label="密钥组名称" value={name} maxLength={60} disabled={!ops.can} onChange={event => { setName(event.target.value); ops.dirty(true); ops.setError(''); }}/></Field>
    {ops.error && <Notice error>{ops.error}</Notice>}
    <div className="supplier-key-actions"><Button type="button" variant="outline" onClick={() => ops.proceed(close)}>取消</Button><Button type="submit" disabled={!ops.can}>保存</Button></div>
  </form></Modal>;
}

export default function ProviderApiKeys({ state, provider, ops }) {
  const [editing, setEditing] = useState(null), [deleting, setDeleting] = useState(null), [keyAction, setKeyAction] = useState(null);
  const [groupEditing, setGroupEditing] = useState(null), [groupDeleting, setGroupDeleting] = useState(null);
  const [selectedGroupId, setSelectedGroupId] = useState('default');
  const trigger = useRef(null), addTrigger = useRef(null);
  const allRows = providerApiKeyRows(state, provider), resources = supplierChannelResources(state, provider);
  const groups = providerKeyGroups(provider, allRows.map(row => row.apiKey));
  const group = groups.find(item => item.id === selectedGroupId) || groups[0];
  const rows = group.keyIds.map(id => allRows.find(row => row.apiKey.id === id)).filter(Boolean);
  const returning = resources.find(row => row.id === ops.params.get('credentialChannel'));
  const groupChannels = id => resources.filter(channel => channel.authMode === 'group' && channel.keyGroupId === id || id === 'default' && channel.authMode === 'inherit');
  const affected = keyAction ? supplierKeyChannels(state, provider, keyAction.row.apiKey.id) : [];
  const deleteGroupChannels = groupDeleting ? groupChannels(groupDeleting.id) : [];
  const open = (event, callback) => { trigger.current = event.currentTarget; ops.setError(''); callback(); };
  const close = () => { setEditing(null); setDeleting(null); setKeyAction(null); setGroupEditing(null); setGroupDeleting(null); ops.setError(''); requestAnimationFrame(() => (trigger.current?.isConnected ? trigger.current : addTrigger.current)?.focus()); };
  const keyRecord = row => ({ ...row, endpoints: supplierKeyChannels(state, provider, row.apiKey.id) });
  return <>
    {returning && <div className="supplier-resource-notice"><Notice>为渠道 {supplierChannelCode(returning)} · {supplierChannelName(provider, returning)} 配置密钥组。<Button variant="link" onClick={() => ops.go({ tab: 'catalogue', resource: returning.id, credentialChannel: null })}>返回渠道配置</Button></Notice></div>}
    <div className="supplier-key-groups">
      <aside className="supplier-key-group-sidebar" aria-label="API 密钥组">
        <div className="supplier-key-group-heading"><h3>密钥组</h3><Button variant="link" size="sm" disabled={!ops.can} onClick={event => open(event, () => setGroupEditing({ group: null }))}><Plus data-icon="inline-start"/>新建组</Button></div>
        <nav className="supplier-key-group-options" aria-label="选择密钥组">{groups.map(item => <Button key={item.id} variant="ghost" aria-pressed={item.id === group.id} title={item.name} onClick={() => ops.proceed(() => { setSelectedGroupId(item.id); ops.setError(''); })}><span>{item.name}</span><small>{item.keyIds.length}</small></Button>)}</nav>
      </aside>
      <section className="supplier-key-group-content" aria-label={group.name}>
        <div className="supplier-key-group-toolbar"><h3>{group.name}</h3><div className="supplier-row-actions">{group.id !== 'default' && <><Button variant="link" size="sm" disabled={!ops.can} onClick={event => open(event, () => setGroupEditing({ group }))}>重命名</Button><Button variant="link" size="sm" disabled={!ops.can} onClick={event => open(event, () => setGroupDeleting(group))}>删除组</Button></>}<Button ref={addTrigger} size="sm" disabled={!ops.can} onClick={event => open(event, () => setEditing({ record: null, group }))}><Plus data-icon="inline-start"/>添加 API 密钥</Button></div></div>
        <GridTable className="supplier-key-table supplier-group-key-table" headings={['序号', '密钥 ID / 名称', 'API 密钥', '当前绑定渠道', '状态', '操作']} empty={!rows.length} emptyMessage="当前密钥组暂无密钥，请点击添加 API 密钥。">
          {rows.map((row, index) => { const channels = credentialRotationChannels(state, provider, row.apiKey.id); return <Row key={row.apiKey.id}><Cell><span>{index + 1}</span></Cell><Cell><code>{providerApiKeyId(row.apiKey)}</code><small>{providerApiKeyName(row.apiKey)}</small></Cell><Cell><code>{maskProviderApiKey(row.apiKey.maskedKey)}</code></Cell><Cell><Popover><PopoverTrigger asChild><Button variant="link" size="sm" aria-label={'查看密钥 ' + providerApiKeyId(row.apiKey) + ' 当前绑定渠道'}>{channels.length} 个</Button></PopoverTrigger><PopoverContent className="supplier-key-reference-popover" align="start"><strong>当前绑定渠道（{channels.length}）</strong>{channels.map(channel => <Button variant="link" key={channel.id} onClick={() => ops.go({ tab: 'catalogue', resource: channel.id })}>{supplierChannelCode(channel)} · {supplierChannelName(provider, channel)}</Button>)}{!channels.length && <p>暂无渠道绑定</p>}</PopoverContent></Popover></Cell><Cell><Status good={row.apiKey.status !== 'disabled' && !row.apiKey.revokedAt}>{row.apiKey.revokedAt ? '已撤销' : row.apiKey.status === 'disabled' ? '已停用' : '已配置'}</Status></Cell><Cell><div className="supplier-row-actions"><Button variant="link" aria-label={`检测密钥 ${row.apiKey.id}`} disabled={!ops.can || Boolean(row.apiKey.revokedAt) || row.apiKey.status === 'disabled'} onClick={event => open(event, () => setKeyAction({ kind: 'test', row }))}>检测</Button>

            <Button variant="link" size="sm" disabled={!ops.can} aria-label={(channels.some(channel => channel.authMode === 'pool') ? '管理密钥池：' : '替换：') + providerApiKeyId(row.apiKey)} onClick={event => open(event, () => channels.some(channel => channel.authMode === 'pool') ? setKeyAction({ kind: 'pool', row, group }) : setEditing({ record: keyRecord(row), group }))}>{channels.some(channel => channel.authMode === 'pool') ? '管理密钥池' : '替换'}</Button>
            <MoreActions label="密钥更多操作" disabled={!ops.can}><Button variant="link" size="sm" disabled={!ops.can || Boolean(row.apiKey.revokedAt) || !provider.apiKeys?.some(key => key.id === row.apiKey.id)} aria-label={(row.apiKey.status === 'disabled' ? '启用：' : '停用：') + providerApiKeyId(row.apiKey)} onClick={event => open(event, () => setKeyAction({ kind: 'toggle', row, group }))}>{row.apiKey.status === 'disabled' ? '启用' : '停用'}</Button><Button variant="link" size="sm" disabled={!ops.can} aria-label={'移除：' + providerApiKeyId(row.apiKey)} onClick={event => open(event, () => setDeleting({ ...keyRecord(row), group, nextKey: index === 0 ? rows[1]?.apiKey : null }))}>移除</Button><Button variant="link" size="sm" disabled={!ops.can || Boolean(row.apiKey.revokedAt)} onClick={event => open(event, () => setKeyAction({ kind: 'revoke', row, group }))} className="text-destructive">紧急撤销</Button></MoreActions>
          </div></Cell></Row>; })}
        </GridTable>
      </section>
    </div>
    {editing && <KeyEditor state={state} key={editing.record?.apiKey.id || 'new'} provider={provider} group={editing.group} record={editing.record} ops={ops} close={close}/>}
    {groupEditing && <KeyGroupEditor provider={provider} group={groupEditing.group} ops={ops} close={close} saved={id => { if (id) setSelectedGroupId(id); close(); }}/>}
    {groupDeleting && <Modal title="删除密钥组" description={groupDeleting.name} onClose={close}>{groupDeleting.keyIds.length ? <Notice error>请先移除组内全部 {groupDeleting.keyIds.length} 条 API 密钥，再删除密钥组。</Notice> : deleteGroupChannels.length ? <Notice error>该密钥组被 {deleteGroupChannels.length} 个渠道引用，请先更换这些渠道使用的密钥组。</Notice> : <p>确认删除此空密钥组？</p>}{deleteGroupChannels.length > 0 && <ul className="supplier-reference-list">{deleteGroupChannels.map(channel => <li key={channel.id}>{supplierChannelCode(channel)} · {supplierChannelName(provider, channel)}</li>)}</ul>}{ops.error && <Notice error>{ops.error}</Notice>}<div className="supplier-key-actions"><Button variant="outline" onClick={close}>取消</Button><Button variant="destructive" disabled={!ops.can || groupDeleting.keyIds.length > 0 || deleteGroupChannels.length > 0} onClick={async () => { if (await ops.run('provider', { operation: 'keyGroupDelete', objectId: provider.id, values: { groupId: groupDeleting.id, confirmed: true } })) { setSelectedGroupId('default'); close(); } }}>确认删除</Button></div></Modal>}
    {deleting && <Modal title="移除 API 密钥" description={providerApiKeyId(deleting.apiKey)} onClose={close}><p>确认移除此密钥？{deleting.nextKey ? '移除后本组下一条密钥将成为主要密钥。' : deleting.group.keyIds.length === 1 ? '移除后该密钥组将没有可用密钥。' : ''}{deleting.endpoints.length ? '影响 ' + deleting.endpoints.length + ' 个渠道，相关模型需要重新验证。' : ''}</p>{ops.error && <Notice error>{ops.error}</Notice>}<div className="supplier-key-actions"><Button variant="outline" onClick={close}>取消</Button><Button variant="destructive" disabled={!ops.can} onClick={async () => { if (await ops.run('provider', { operation: 'deleteApiKey', objectId: provider.id, values: { keyId: deleting.apiKey.id, expectedFingerprint: deleting.apiKey.fingerprint, confirmed: true } })) close(); }}>确认移除</Button></div></Modal>}
    {keyAction?.kind === 'test' && <ChannelHealthDialog state={state} provider={provider} apiKey={keyAction.row.apiKey} ops={ops} close={close}/>}
    {keyAction?.kind === 'pool' && <Modal title="选择渠道密钥池" onClose={close}><p>先添加新 API 密钥，再在对应渠道的密钥池中替换绑定并验证。</p>{affected.filter(row => row.authMode === 'pool').map(row => <Button key={row.id} variant="link" onClick={() => setKeyAction({ ...keyAction, kind: 'pool-edit', endpointId: row.id })}>{row.name}</Button>)}</Modal>}
    {keyAction?.kind === 'pool-edit' && <ChannelKeyPoolEditor state={state} provider={provider} endpoint={resources.find(row => row.id === keyAction.endpointId)} ops={ops} close={close}/>}
    {keyAction && !['pool', 'pool-edit', 'test'].includes(keyAction.kind) && <Modal title={keyAction.kind === 'revoke' ? '紧急撤销 API 密钥' : '变更 API 密钥状态'} description={providerApiKeyId(keyAction.row.apiKey)} onClose={close}><p>{keyAction.kind === 'revoke' ? '撤销后不能恢复；所有使用此凭证的新调用立即停止。' : ''}影响 {affected.length} 个渠道，以及 {affected.reduce((sum, channel) => sum + supplierChannelAssociations(state, provider, channel.id).length, 0)} 条模型关联。变更后相关调用需重新测试，服务价格和路由配置保留。</p><ul className="supplier-reference-list">{affected.map(channel => <li key={channel.id}><strong>{supplierChannelCode(channel)} · {supplierChannelName(provider, channel)}</strong><span>{supplierChannelAssociations(state, provider, channel.id).map(item => item.modelId).join('、') || '未关联模型'}</span></li>)}</ul>{ops.error && <Notice error>{ops.error}</Notice>}<div className="supplier-key-actions"><Button variant="outline" onClick={close}>取消</Button><Button disabled={!ops.can} onClick={async () => { if (keyAction.kind === 'revoke' ? await ops.run('credentialEmergencyRevoke', { providerId: provider.id, keyId: keyAction.row.apiKey.id, expectedFingerprint: keyAction.row.apiKey.fingerprint, confirmed: true }) : await ops.run('provider', { operation: 'toggleApiKey', objectId: provider.id, values: { groupId: keyAction.group.id, keyId: keyAction.row.apiKey.id, expectedFingerprint: keyAction.row.apiKey.fingerprint, enabled: keyAction.row.apiKey.status === 'disabled', confirmed: true } })) close(); }}>{keyAction.kind==='revoke'?'确认紧急撤销':'确认变更'}</Button></div></Modal>}
  </>;
}
