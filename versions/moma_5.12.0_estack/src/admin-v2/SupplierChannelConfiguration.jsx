import ChannelDiscovery from './ChannelDiscovery';
import ChannelAdvancedFields from './ChannelAdvancedFields';
import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table';
import SupplierCreationDialog from './SupplierCreationDialog';
import { Choice, Field } from './ModelMetadataForm';
import { Notice, Pagination } from './ModelOperationsUI';
import { supplierDirectory } from './moma-provider';
import { libraryRecord } from './model-library';
import SupplyModelPicker from './SupplyModelPicker';
import SupplierPriceFields from './SupplierPriceFields';
import { SupplierKeyGroupField } from './SupplierKeyGroupField';
import { CHANNEL_INTERFACES, prepareChannelInterface, prepareChannelAdapterOptions, modelTaskUrl } from './channel-interface';
import { channelDrafts, channelDraftIssue, validateChannelRows } from './channel-onboarding';
import SupplierChannelBatchTest from './SupplierChannelBatchTest';
import ChannelModelReferencePicker from './ChannelModelReferencePicker';
import SupplierProfileDialog from './SupplierProfileDialog';
import { supplierChannelResources, supplierChannelName } from './supplier-resources';

const modelRow = (state, libraryId = '') => ({ id: crypto.randomUUID(), libraryId, upstreamModelId: libraryRecord(state, libraryId)?.modelId || '', scenarios: [], source: 'manual', selected: true, confirmed: false });
export default function SupplierChannelConfiguration({ state, provider: initialProvider, libraryId = '', endpoint: initialEndpoint, initialRows, ops, close }) {
  const [value, setValue] = useState({ providerId: initialProvider?.id || 'unselected', name: '', interfaceType: initialProvider?.defaultProtocol?.includes('Anthropic') ? 'anthropic' : initialProvider?.defaultProtocol?.includes('OpenAI') ? 'openai' : 'unselected', baseUrl: '', keyGroupId: 'default', authMode: 'group', capacity: '', timeoutSeconds: 60, taskUrls: {}, adapterOptions: {} });
  const [rows, setRows] = useState(() => initialRows?.length ? structuredClone(initialRows) : [modelRow(state, initialEndpoint ? '' : libraryId)]);
  const [endpointId, setEndpointId] = useState(initialEndpoint?.id || ''), [step, setStep] = useState(initialEndpoint ? 1 : 0), [saved, setSaved] = useState(null), [priceRow, setPriceRow] = useState(null), [suggestedRoot, setSuggestedRoot] = useState('');
  const [draftId, setDraftId] = useState(''), [draftRevision, setDraftRevision] = useState(0), [showDrafts, setShowDrafts] = useState(false), [errors, setErrors] = useState([]), [page, setPage] = useState(1), [addingProvider, setAddingProvider] = useState(false);
  const [nameError, setNameError] = useState(''), [discardProvider, setDiscardProvider] = useState(false);
  const parentDirty = useRef(false), childDirty = useRef(false), creationId = useRef(crypto.randomUUID()), nameInput = useRef(null), providerTrigger = useRef(null);
  const endpoint = state.endpoints.find(row => row.id === endpointId && !row.deletedAt), drafts = channelDrafts(state);
  const providers = supplierDirectory(state).filter(row => !row.id.startsWith('service-review-provider-'));
  const provider = providers.find(row => row.id === (endpoint?.providerId || value.providerId));
  const dirty = () => { ops.dirty(true); ops.setError(''); setErrors([]); setNameError(''); };
  const set = patch => { setValue(current => ({ ...current, ...patch })); dirty(); setSuggestedRoot(''); };
  const changeRows = next => { setRows(next); dirty(); };
  const setRow = (id, patch) => changeRows(rows.map(row => row.id === id ? { ...row, ...patch } : row));
  const cancel = () => ops.proceed(close);
  const connection = () => ({ ...prepareChannelInterface({ interfaceType: value.interfaceType, baseUrl: value.baseUrl, taskUrls: value.taskUrls || {}, allowHttp: provider?.sourceType === 'selfHosted' }), adapterOptions: prepareChannelAdapterOptions(value.adapterOptions) });
  const restore = draft => ops.proceed(() => { setValue({ capacity: '', timeoutSeconds: 60, ...draft.value }); setRows(draft.rows); setStep(draft.step); setEndpointId(draft.endpointId); setDraftId(draft.id); setDraftRevision(draft.draftRevision); setShowDrafts(false); setErrors([]); setNameError(''); setPage(1); ops.dirty(false); ops.setError(channelDraftIssue(state, draft)); });
  const saveDraft = () => {
    const result = ops.run('channelDraftSave', { id: draftId || undefined, expectedRevision: draftRevision, value: endpoint ? { ...value, name: endpoint.name, providerId: endpoint.providerId } : value, rows, endpointId, step });
    if (result) { const draft = result.modelOnboardings.find(row => row.id === result.audits[0].objectId); setDraftId(draft.id); setDraftRevision(draft.draftRevision); }
  };
  const nameIssue = () => !value.name.trim() ? '请填写渠道名称' : supplierChannelResources(state, provider).some(row => supplierChannelName(provider, row) === value.name.trim()) ? '供应商的渠道名称不可重复' : '';
  const showNameError = message => { setStep(0); setErrors([]); setNameError(message); ops.setError(''); requestAnimationFrame(() => nameInput.current?.focus()); };
  useEffect(() => {
    if (endpointId || !/渠道名称.*重复/.test(ops.error || '')) return;
    setStep(0); setNameError(ops.error);
    const frame = requestAnimationFrame(() => nameInput.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [ops.error, endpointId]);
  const next = () => { try { if (!provider) throw new Error('请选择供应商'); const issue = nameIssue(); if (issue) { showNameError(issue); return; } setNameError(''); connection(); setStep(1); ops.setError(''); } catch (error) { ops.setError(error.message); setSuggestedRoot(error.suggestedBaseUrl || ''); } };
  const save = () => {
    try {
      if (!provider) throw new Error('供应商已变化，请重新选择');
      if (!endpoint) { const issue = nameIssue(); if (issue) { showNameError(issue); return; } }
      const checked = validateChannelRows(state, rows, endpoint || { interfaceType: value.interfaceType });
      if (checked.length) { setErrors(checked); const rowIndex = rows.findIndex(row => row.id === checked[0].rowId); if (rowIndex >= 0) setPage(Math.floor(rowIndex / 10) + 1); requestAnimationFrame(() => document.querySelector(`[data-channel-row="${checked[0].rowId}"]`)?.querySelector('button,input')?.focus()); return; }
      const models = rows.filter(row => row.selected !== false).map(({ libraryId, upstreamModelId, scenarios }) => ({ libraryId, upstreamModelId, scenarios }));
      const values = endpoint ? { endpointId: endpoint.id, models } : { ...value, ...connection(), models };
      const result = draftId ? ops.run('channelDraftCommit', { id: draftId, expectedRevision: draftRevision, values }) : ops.run('provider', { operation: endpoint ? 'supplierModelsAdd' : 'supplierChannelCreate', objectId: provider.id, values });
      if (!result) return;
      const channel = endpoint || result.endpoints.find(row => row.providerId === provider.id && row.name === value.name.trim() && !row.deletedAt), owner = result.providers.find(row => row.id === provider.id), upstreamIds = new Set(models.map(row => row.upstreamModelId.trim()));
      setSaved({ endpointId: channel.id, associationIds: owner.catalogConnections.filter(row => row.endpointId === channel.id && !row.deletedAt && upstreamIds.has(row.upstreamModelId)).map(row => row.id) }); setStep(2); setPriceRow(null);
    } catch (error) { ops.setError(error.message); }
  };
  const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / 10))), selected = rows.filter(row => row.selected !== false);
  const rowError = id => errors.filter(error => error.rowId === id).map(error => error.message).join('；');
  const childOps = { ...ops, dirty: value => { childDirty.current = value; ops.dirty(parentDirty.current || value); }, run: (...args) => { const result = ops.run(...args); if (result) childDirty.current = false; ops.dirty(parentDirty.current || childDirty.current); return result; } };
  const closeProvider = () => { setAddingProvider(false); setDiscardProvider(false); childDirty.current = false; ops.dirty(parentDirty.current); ops.setError(''); requestAnimationFrame(() => providerTrigger.current?.focus()); };
  if (saved) return <SupplierChannelBatchTest state={state} provider={provider} endpointId={saved.endpointId} associationIds={saved.associationIds} ops={ops} close={() => close(libraryId)} />;
  return <><SupplierCreationDialog title={endpoint ? '添加关联模型' : '添加渠道'} description="配置连接、选择模型并测试，确认后单独启用。" cancel={cancel} disabled={!ops.can || !provider} action={step === 0 ? '下一步' : '保存并测试'} submit={step === 0 ? next : save} footer={<><Button type="button" variant="outline" disabled={!ops.can || !provider || !(endpoint?.name || value.name.trim())} onClick={saveDraft}>保存草稿</Button>{step === 1 && !endpoint && <Button type="button" variant="outline" onClick={() => { setStep(0); ops.setError(''); }}>上一步</Button>}</>}>
    <div className="supplier-row-actions"><ol className="supplier-onboarding-steps" aria-label="接入步骤">{['配置连接', '选择模型', '测试与启用'].map((label, index) => <li key={label} aria-current={index === step ? 'step' : undefined}><span>{index + 1}</span>{label}</li>)}</ol>{drafts.length > 0 && <Button type="button" variant="link" onClick={() => setShowDrafts(!showDrafts)}>继续草稿（{drafts.length}）</Button>}</div>
    {showDrafts && <div className="supplier-draft-list">{drafts.map(draft => <div key={draft.id}><div><strong>{draft.value.name}</strong><small>{state.providers.find(row => row.id === draft.value.providerId)?.name || '供应商已不存在'} · {draft.rows.length} 个模型</small></div><Button type="button" variant="link" onClick={() => restore(draft)}>继续编辑</Button><Button type="button" variant="link" disabled={!ops.can} onClick={() => ops.run('channelDraftDiscard', { id: draft.id, expectedRevision: draft.draftRevision })}>放弃草稿</Button></div>)}</div>}
    {step === 0 ? <>
      <div className="supplier-channel-fields"><Field label="供应商 *"><Choice label="供应商" value={value.providerId} options={[[ 'unselected', '请选择供应商' ], ...providers.map(row => [row.id, row.name])]} disabled={!ops.can} onChange={providerId => ops.proceed(() => { setValue(current => ({ ...current, providerId, name: '', interfaceType: 'unselected', baseUrl: '', keyGroupId: 'default', authMode: 'group', taskUrls: {}, adapterOptions: {} })); setRows(current => current.map(row => ({ ...row, upstreamModelId: libraryRecord(state, row.libraryId)?.modelId || '', scenarios: [] }))); dirty(); })}/><Button ref={providerTrigger} type="button" variant="link" disabled={!ops.can} onClick={() => { parentDirty.current = ops.hasUnsaved(); childDirty.current = false; setAddingProvider(true); }}>添加供应商</Button></Field><Field label="渠道名称 *"><Input ref={nameInput} aria-label="渠道名称" aria-invalid={Boolean(nameError)} aria-describedby={nameError ? 'supplier-channel-name-error' : undefined} value={value.name} maxLength={60} disabled={!ops.can} onChange={event => set({ name: event.target.value })}/>{nameError && <small id="supplier-channel-name-error" role="alert" className="supplier-key-error">{nameError}</small>}</Field></div>
      <div className="supplier-channel-fields"><Field label="接口类型 *"><Choice label="接口类型" value={value.interfaceType} options={[[ 'unselected', '请选择接口类型' ], ...CHANNEL_INTERFACES.map(item => [item.id, item.label])]} disabled={!ops.can} onChange={interfaceType => value.baseUrl ? ops.proceed(() => set({ interfaceType, baseUrl: '', taskUrls: {}, adapterOptions: {} })) : set({ interfaceType, baseUrl: '', taskUrls: {}, adapterOptions: {} })}/></Field><Field label="渠道 ID"><Input aria-label="渠道 ID" value="保存后自动生成" readOnly/></Field></div>
      <Field label={value.interfaceType === 'custom' ? '完整任务地址 *' : '服务根地址 *'}><Input aria-label="渠道 API 地址" maxLength={2048} placeholder={value.interfaceType === 'custom' ? 'https://gateway.example.com/完整接口路径' : 'https://gateway.example.com/v1'} value={value.baseUrl} disabled={!ops.can} onChange={event => set({ baseUrl: event.target.value })}/></Field>
      {suggestedRoot && <Notice>识别到完整任务地址。<Button type="button" variant="link" onClick={() => set({ baseUrl: suggestedRoot })}>使用根地址 {suggestedRoot}</Button></Notice>}
      {provider?.sourceType === 'selfHosted' && <Field label="认证方式"><Choice label="认证方式" value={value.authMode} options={[[ 'group', 'API 密钥组' ], [ 'none', '无需认证' ]]} disabled={!ops.can} onChange={authMode => set({ authMode })}/></Field>}
      {provider && value.authMode !== 'none' && <SupplierKeyGroupField ops={ops} state={state} provider={provider} value={value.keyGroupId} disabled={!ops.can} onChange={keyGroupId => set({ keyGroupId })}/>}
      <ChannelAdvancedFields value={value} onChange={set} disabled={!ops.can}/>
    </> : <>
      <div className="supplier-onboarding-context"><strong>{provider?.name}</strong><span>{endpoint?.name || value.name}</span><code>{endpoint?.baseUrl || value.baseUrl}</code></div>
      <ChannelDiscovery state={state} provider={provider} configuration={endpoint || { ...value, id: creationId.current, providerId: provider?.id, protocol: CHANNEL_INTERFACES.find(row => row.id === value.interfaceType)?.protocol }} ops={ops} onAppend={discovered => { changeRows([...rows.filter(row => row.libraryId || row.upstreamModelId), ...discovered]); }}/><ChannelModelReferencePicker state={state} rows={rows.filter(row => row.libraryId)} disabled={!ops.can} reservedCount={rows.filter(row => !row.libraryId).length} onChange={next => changeRows([...rows.filter(row => !row.libraryId), ...next])}/>
      <div className="supplier-row-actions"><label><input type="checkbox" aria-label="选择全部模型行" checked={rows.length > 0 && selected.length === rows.length} onChange={event => changeRows(rows.map(row => ({ ...row, selected: event.target.checked })))}/>全部 {rows.length} 项</label><span>已选 {selected.length}</span></div>
      <div className="mo-table-scroll"><Table className="supplier-onboarding-models"><TableHeader><TableRow><TableHead>选择</TableHead><TableHead>模型资料 / 来源</TableHead><TableHead>上游模型 ID / 请求地址</TableHead><TableHead>采购价</TableHead><TableHead>操作</TableHead></TableRow></TableHeader><TableBody>{rows.slice((currentPage - 1) * 10, currentPage * 10).map((row, index) => {
        let url = ''; try { url = modelTaskUrl(endpoint || connection(), libraryRecord(state, row.libraryId)?.type); } catch { /* No request preview before the interface and model are valid. */ }
        return <TableRow key={row.id} data-channel-row={row.id}><TableCell><input type="checkbox" aria-label={`选择模型行 ${(currentPage - 1) * 10 + index + 1}`} checked={row.selected !== false} onChange={event => setRow(row.id, { selected: event.target.checked })}/></TableCell><TableCell><SupplyModelPicker ops={ops} state={state} value={row.libraryId} disabled={!ops.can} onChange={libraryId => setRow(row.id, { libraryId, upstreamModelId: row.upstreamModelId || libraryRecord(state, libraryId)?.modelId || '', scenarios: row.libraryId === libraryId ? row.scenarios : [], confirmed: true })}/><small>{row.source === 'reference' ? '参考目录' : row.source === 'upstream' ? '上游发现' : '手动录入'}</small>{row.source !== 'manual' && <label><input type="checkbox" checked={row.confirmed === true} onChange={event => setRow(row.id, { confirmed: event.target.checked })}/>确认身份匹配</label>}</TableCell><TableCell><Input aria-label={`第 ${(currentPage - 1) * 10 + index + 1} 行上游模型 ID`} value={row.upstreamModelId} maxLength={200} aria-invalid={Boolean(rowError(row.id))} disabled={!ops.can} onChange={event => setRow(row.id, { upstreamModelId: event.target.value })}/>{url && <small className="supplier-request-preview" title={url}>{url}</small>}{rowError(row.id) && <small role="alert" className="supplier-key-error">{rowError(row.id)}</small>}</TableCell><TableCell>{row.scenarios.length ? `${row.scenarios.length} 个计费项` : '待配置'}</TableCell><TableCell><div className="supplier-row-actions"><Button type="button" variant="link" disabled={!ops.can} onClick={() => setPriceRow(priceRow === row.id ? null : row.id)}>配置采购价</Button><Button type="button" variant="ghost" size="icon-sm" aria-label={`移除模型行 ${(currentPage - 1) * 10 + index + 1}`} disabled={!ops.can || rows.length === 1} onClick={() => changeRows(rows.filter(item => item.id !== row.id))}><Trash2/></Button></div></TableCell></TableRow>;
      })}</TableBody></Table></div><Pagination count={rows.length} page={currentPage} setPage={setPage}/>
      <Button type="button" variant="outline" disabled={!ops.can || rows.length >= 50} onClick={() => { changeRows([...rows, modelRow(state)]); setPage(Math.ceil((rows.length + 1) / 10)); }}><Plus/>手动添加模型</Button>
      {rows.filter(row => row.id === priceRow).map(row => <SupplierPriceFields key={row.id} ops={ops} state={state} scenarios={row.scenarios} disabled={!ops.can} onChange={scenarios => setRow(row.id, { scenarios })}/>)}
    </>}
    {errors.filter(error => !error.rowId).map(error => <Notice error key={error.field}>{error.message}</Notice>)}{ops.error && !nameError && <Notice error>{ops.error}</Notice>}
  </SupplierCreationDialog>{addingProvider && <SupplierProfileDialog ops={childOps} cancel={() => childDirty.current ? setDiscardProvider(true) : closeProvider()} discardConfirmation={discardProvider ? { continueEditing: () => setDiscardProvider(false), discard: closeProvider } : null} done={(next, id) => { closeProvider(); set({ providerId: id, keyGroupId: 'default' }); }}/>}</>;
}
