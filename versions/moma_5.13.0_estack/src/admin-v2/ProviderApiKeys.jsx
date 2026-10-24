import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, LoaderCircle, Plus, Radio } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/checkbox';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Command, CommandInput, CommandList, CommandGroup, CommandItem, CommandEmpty } from '../components/ui/command';
import { ConnectionApiKeys, emptyConnection, GridTable, Row, Cell, Modal, Notice } from './ModelOperationsUI';
import { Choice, Field } from './ModelMetadataForm';
import { providerApiKeysDraft, providerConnectionDraft, maskProviderApiKey, providerModelConnectivityTest, MODEL_CONNECTIVITY_SCENARIOS } from './provider-management';
import { catalogueConnections, connectionCatalogueIds } from './provider-model-connections';
import { providerCatalogueIds } from './moma-provider';
import { supplyConnectivityTest } from './model-operations';
import { supplyModelUrl } from './model-management';

function KeyEditor({ state, provider, endpoint: initialEndpoint, chooseScope, ops, close }) {
  const endpoints = state.endpoints.filter(item => item.providerId === provider.id);
  const [scope, setScope] = useState(initialEndpoint?.id || 'supplier');
  const endpoint = endpoints.find(item => item.id === scope);
  const [value, setValue] = useState(() => ({ ...emptyConnection(), ...initialEndpoint }));
  const [saving, setSaving] = useState(false), [confirmed, setConfirmed] = useState(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const affected = endpoint && (connectionCatalogueIds(state, provider, endpoint.id).length || state.modelSupplies.some(item => item.endpointId === endpoint.id && item.status !== '已移除'));
  const change = next => { setValue(next); setConfirmed(false); ops.dirty(true); ops.setError(''); };
  const cancel = () => ops.proceed(close);
  return <Modal title={endpoint ? '配置 API Key' : '添加 API Key'} description={chooseScope ? provider.name : endpoint?.baseUrl || provider.name} onClose={cancel}><form className="supplier-key-form" noValidate onSubmit={async event => {
    event.preventDefault();
    if (saving || !ops.can) return;
    if (affected && !confirmed) { ops.setError('请确认 API Key 变更对关联模型的影响'); return; }
    setSaving(true); ops.setError('');
    try {
      const draft = endpoint ? await providerConnectionDraft(value) : await providerApiKeysDraft(value.keyInputs.map(item => item.value));
      if (active.current && ops.run('provider', { operation: endpoint ? 'connectionKeys' : 'addApiKeys', objectId: provider.id, values: { apiKeys: draft.apiKeys, credentialRef: draft.credentialRef, endpointId: endpoint?.id, confirmed } })) close();
    } catch (error) { if (active.current) ops.setError(error.message); }
    finally { if (active.current) setSaving(false); }
  }}>
    {chooseScope && <Field label="适用范围"><Choice label="适用范围" value={scope} options={[[ 'supplier', '供应商通用'], ...endpoints.map(item => [item.id, item.baseUrl])]} disabled={!ops.can || saving} onChange={id => { const next = endpoints.find(item => item.id === id); setScope(id); change({ ...emptyConnection(), ...next, keyInputs: value.keyInputs }); }}/></Field>}
    {endpoint && provider.apiKeys?.length > 0 && <fieldset className="supplier-key-pool"><legend>选用已有 API Key</legend>{provider.apiKeys.map(key => <label className="supplier-check" key={key.id}><Checkbox disabled={!ops.can || saving} checked={(value.apiKeys || []).some(item => item.fingerprint === key.fingerprint)} onCheckedChange={checked => change({ ...value, apiKeys: checked === true ? [...(value.apiKeys || []), key] : (value.apiKeys || []).filter(item => item.fingerprint !== key.fingerprint) })}/><code>{maskProviderApiKey(key.maskedKey)}</code></label>)}</fieldset>}
    <ConnectionApiKeys value={value} onChange={change} optionalKey={provider.sourceType === 'selfHosted'} disabled={!ops.can || saving}/>
    {endpoint && <Notice>{provider.sourceType === 'selfHosted' ? '自有推理服务可不配置 API Key。' : '未配置凭证时可保存，接入保持待配置，无法检查启用。'}密钥变更后需重新检查关联模型。</Notice>}
    {affected && <label className="supplier-check"><Checkbox checked={confirmed} disabled={saving} onCheckedChange={checked => setConfirmed(checked === true)}/>我已确认关联模型需要重新验证</label>}
    {ops.error && <p role="alert" className="supplier-key-error">{ops.error}</p>}
    <div className="supplier-key-actions"><Button type="button" variant="outline" disabled={saving} onClick={cancel}>取消</Button><Button type="submit" disabled={!ops.can || saving}>{saving ? '保存中…' : '保存 API Key'}</Button></div>
  </form></Modal>;
}

export function ModelConnectivityTest({ state, provider, apiKey, endpoint: initialEndpoint, supply, ops, close }) {
  const endpoints = state.endpoints.filter(item => item.providerId === provider.id);
  const models = supply ? [supply.upstreamModelId] : providerCatalogueIds(provider).filter(id => !initialEndpoint || !catalogueConnections(state, provider, id).length || catalogueConnections(state, provider, id).some(item => item.id === initialEndpoint.id));
  const [modelId, setModelId] = useState(supply?.upstreamModelId || ''), [upstreamId, setUpstreamId] = useState(supply?.upstreamModelId || ''), [pickerOpen, setPickerOpen] = useState(false);
  const [prompt, setPrompt] = useState('请只回复 OK。');
  const [scenario, setScenario] = useState('success');
  const mapped = catalogueConnections(state, provider, modelId);
  const candidates = initialEndpoint ? [initialEndpoint] : mapped.length ? mapped : endpoints;
  const [endpointId, setEndpointId] = useState(initialEndpoint?.id || (endpoints.length === 1 ? endpoints[0].id : ''));
  const endpoint = candidates.find(item => item.id === endpointId);
  const requestUrl = supply && supplyModelUrl(supply, state.models.find(item => item.id === supply.modelId));
  const [testing, setTesting] = useState(false), [result, setResult] = useState(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const chooseModel = id => {
    setModelId(id); setUpstreamId(id); setPickerOpen(false); setResult(null);
    const configured = catalogueConnections(state, provider, id);
    const choices = initialEndpoint ? [initialEndpoint] : configured.length ? configured : endpoints;
    setEndpointId(choices.length === 1 ? choices[0].id : '');
  };
  const start = () => {
    if (!ops.can || testing || !endpoint || !modelId || !upstreamId.trim() || !prompt.trim()) return;
    setTesting(true); setResult(null);
    timer.current = setTimeout(() => {
      try { setResult(supply ? supplyConnectivityTest(state, { modelId: supply.modelId, supplyId: supply.id, prompt, scenario }) : providerModelConnectivityTest(state, { providerId: provider.id, keyId: apiKey.id, endpointId, modelId, upstreamId, prompt, scenario })); }
      catch (error) { setResult({ result: '失败', title: '无法开始测试', message: error.message, upstreamId }); }
      setTesting(false);
    }, 800);
  };
  const cancel = () => { clearTimeout(timer.current); setTesting(false); setResult({ result: '已取消', title: '测试已取消', message: '本次测试已取消，可以调整配置后重新测试。', upstreamId }); };
  return <Modal wide title="模型连通性测试" description={provider.name + (apiKey ? ' · API Key ' + maskProviderApiKey(apiKey.maskedKey) : ' · 使用已配置凭证')} onClose={close}><div className="supplier-model-test">
    <section className="supplier-test-config" aria-label="测试配置"><h3>测试配置</h3>
      <Field label="测试模型 *"><Popover open={pickerOpen} onOpenChange={setPickerOpen}><PopoverTrigger asChild><Button variant="outline" role="combobox" aria-label="选择测试模型" aria-expanded={pickerOpen} disabled={Boolean(supply) || testing || !ops.can || !models.length} className="supplier-test-model-trigger"><span>{modelId || '搜索并选择供应商模型'}</span><ChevronDown data-icon="inline-end"/></Button></PopoverTrigger><PopoverContent align="start" className="supplier-test-model-options"><Command><CommandInput aria-label="搜索测试模型" placeholder="搜索模型名称 / Model ID"/><CommandList><CommandEmpty>没有匹配的模型</CommandEmpty><CommandGroup>{models.map(id => <CommandItem key={id} value={id} onSelect={() => chooseModel(id)}>{id}{id === modelId && <Check data-icon="inline-end"/>}</CommandItem>)}</CommandGroup></CommandList></Command></PopoverContent></Popover></Field>
      {!models.length && <Notice error>供应商目录暂无模型，请先添加模型。</Notice>}
      <Field label="调用 Model ID *" hint="用于本次请求，不修改目录资料。"><Input aria-label="测试调用 Model ID" value={upstreamId} maxLength={200} disabled={Boolean(supply) || testing || !modelId || !ops.can} onChange={event => { setUpstreamId(event.target.value); setResult(null); }}/></Field>
      {candidates.length ? <Field label="接入地址 *"><Choice label="测试接入地址" value={endpointId} options={candidates.map(item => [item.id, requestUrl || item.baseUrl])} disabled={Boolean(initialEndpoint) || testing || !ops.can} onChange={id => { setEndpointId(id); setResult(null); }}/></Field> : <Notice error>请先在模型目录配置接入地址。</Notice>}
      {!supply && modelId && !mapped.length && candidates.length > 0 && <small className="supplier-test-hint">该模型尚未关联地址，选择的地址仅用于本次测试。</small>}
      <Field label="测试内容 *"><Textarea aria-label="模型测试内容" value={prompt} maxLength={2000} disabled={testing || !ops.can} onChange={event => { setPrompt(event.target.value); setResult(null); }}/></Field>
      <div className="supplier-test-protocol"><span>协议</span><b>{endpoint?.protocol || '—'}</b><span>最大输出</span><b>32 Tokens</b></div>
      <Field label="结果预览"><Choice label="模型测试结果预览" value={scenario} options={Object.entries(MODEL_CONNECTIVITY_SCENARIOS)} disabled={testing || !ops.can} onChange={value => { setScenario(value); setResult(null); }}/></Field>
    </section>
    <section className="supplier-test-result" aria-label="测试结果" aria-live="polite"><h3>测试结果</h3>
      {testing ? <div className="supplier-test-empty" role="status"><LoaderCircle className="animate-spin"/><strong>正在测试</strong><p>目标模型：{upstreamId}</p></div> : result ? <div className="supplier-test-response"><Notice error={result.result === '失败'}><strong>{result.title}</strong><p>{result.message}</p>{result.hint && <p>{result.hint}</p>}</Notice><dl><div><dt>模型</dt><dd>{result.upstreamId || upstreamId}</dd></div><div><dt>HTTP 状态</dt><dd>{result.status ?? (result.response ? '未收到响应' : '—')}</dd></div><div><dt>响应耗时</dt><dd>{result.durationMs == null ? '—' : result.durationMs.toLocaleString('zh-CN') + ' ms'}</dd></div><div><dt>接入地址</dt><dd>{result.baseUrl || requestUrl || endpoint?.baseUrl || '—'}</dd></div></dl><div className="supplier-test-response-body"><h4>{result.result === '失败' ? '错误详情' : '模型响应'}</h4>{result.response ? <><p className="supplier-test-output">{result.response.choices?.[0]?.message.content || result.response.error?.message}</p><details><summary>响应详情</summary><pre>{JSON.stringify(result.response, null, 2)}</pre></details></> : <p>本次测试未产生响应。</p>}</div></div> : <div className="supplier-test-empty"><Radio/><strong>等待测试</strong><p>选择模型并填写测试内容，结果将在此显示。</p></div>}
    </section>
    <footer className="supplier-test-footer"><span>结果为交互预览，不发送真实模型请求或改变启用状态。</span><div className="supplier-key-actions"><Button variant="outline" onClick={close}>关闭</Button>{!models.length || !endpoints.length ? <Button disabled={!ops.can} onClick={() => { close(); ops.go({ tab: 'catalogue' }); }}>前往模型目录</Button> : testing ? <Button variant="outline" onClick={cancel}>取消测试</Button> : <Button disabled={!ops.can || !endpoint || !modelId || !upstreamId.trim() || !prompt.trim()} onClick={start}>{result ? '重新测试' : '开始测试'}</Button>}</div></footer>
  </div></Modal>;
}

export default function ProviderApiKeys({ state, provider, ops }) {
  const [editing, setEditing] = useState(null), trigger = useRef(null);
  const [testing, setTesting] = useState(null);
  const endpoints = state.endpoints.filter(item => item.providerId === provider.id && item.apiKeys?.length);
  const edit = (event, endpoint, chooseScope = false) => { trigger.current = event.currentTarget; ops.setError(''); setEditing({ endpoint, chooseScope }); };
  const close = () => { setEditing(null); setTesting(null); ops.setError(''); requestAnimationFrame(() => trigger.current?.focus()); };
  const test = (event, apiKey, endpoint) => { trigger.current = event.currentTarget; setTesting({ apiKey, endpoint }); };
  return <>
    <div className="supplier-toolbar supplier-key-toolbar"><Button size="sm" disabled={!ops.can} onClick={event => edit(event, null, true)}><Plus data-icon="inline-start"/>添加 API Key</Button></div>
    <GridTable className="supplier-key-table" headings={['适用范围 / 接入地址', 'API Key', '操作']} empty={!endpoints.length && !provider.apiKeys?.length} emptyMessage="暂无 API Key，请点击添加。">
      {provider.apiKeys?.map(key => <Row key={'supplier-' + key.id}><Cell>供应商通用</Cell><Cell><code>{maskProviderApiKey(key.maskedKey)}</code></Cell><Cell><Button variant="outline" size="sm" disabled={!ops.can} aria-label={'连通性测试：' + maskProviderApiKey(key.maskedKey)} onClick={event => test(event, key)}>连通性测试</Button></Cell></Row>)}
      {endpoints.map(endpoint => endpoint.apiKeys.map(key => <Row key={endpoint.id + '-' + key.id}>
      <Cell><code className="supplier-url">{endpoint.baseUrl}</code></Cell>
      <Cell><code>{maskProviderApiKey(key.maskedKey)}</code>{endpoint.credentialRef && <small>已配置凭证引用</small>}</Cell>
      <Cell><div className="supplier-row-actions"><Button variant="outline" size="sm" disabled={!ops.can} aria-label={'连通性测试：' + maskProviderApiKey(key.maskedKey) + '，' + endpoint.baseUrl} onClick={event => test(event, key, endpoint)}>连通性测试</Button><Button variant="outline" size="sm" disabled={!ops.can} aria-label={'配置 API Key：' + endpoint.baseUrl} onClick={event => edit(event, endpoint)}>配置 API Key</Button></div></Cell>
    </Row>))}</GridTable>
    {editing && <KeyEditor key={editing.endpoint?.id || 'provider'} state={state} provider={provider} endpoint={editing.endpoint} chooseScope={editing.chooseScope} ops={ops} close={close}/>}
    {testing && <ModelConnectivityTest state={state} provider={provider} apiKey={testing.apiKey} endpoint={testing.endpoint} ops={ops} close={close}/>}
  </>;
}
