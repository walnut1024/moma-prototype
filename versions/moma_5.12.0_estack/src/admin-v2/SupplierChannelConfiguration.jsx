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
import { MODEL_TYPES } from './model-management';
import SupplyModelPicker from './SupplyModelPicker';
import SupplierPriceFields from './SupplierPriceFields';
import { providerApiKeysDraft, providerApiKeyRows } from './provider-management';
import { providerKeyGroups, providerKeyGroupKeys } from './provider-key-groups';
import { ONBOARDING_PROVIDER_PRESETS, resolveOnboardingProvider, resolveOnboardingModel, onboardingModelOptions } from './onboarding-presets';
import { CHANNEL_INTERFACES, prepareChannelInterface, prepareChannelAdapterOptions, modelTaskUrl } from './channel-interface';
import { channelDrafts, channelDraftIssue, validateChannelRows } from './channel-onboarding';
import SupplierChannelBatchTest from './SupplierChannelBatchTest';
import ChannelModelReferencePicker from './ChannelModelReferencePicker';
import SupplierProfileDialog from './SupplierProfileDialog';
import { supplierChannelResources, supplierChannelName } from './supplier-resources';

const presetFor = provider => ONBOARDING_PROVIDER_PRESETS.find(row => row.id === provider?.onboardingPresetId || row.code === provider?.code);
const modelRow = (state, libraryId = '') => ({ id: crypto.randomUUID(), libraryId, upstreamModelId: libraryRecord(state, libraryId)?.modelId || '', scenarios: [], source: libraryId ? 'reference' : 'manual', selected: true, confirmed: Boolean(libraryId) });
export default function SupplierChannelConfiguration({ state, provider: initialProvider, libraryId = '', endpoint: initialEndpoint, initialRows, ops, close }) {
  const [value, setValue] = useState({ providerId: initialProvider?.id || 'unselected', name: initialProvider ? `${initialProvider.name}渠道` : '', interfaceType: initialProvider?.defaultProtocol?.includes('Anthropic') ? 'anthropic' : initialProvider?.defaultProtocol?.includes('OpenAI') ? 'openai' : presetFor(initialProvider)?.interfaceType || 'unselected', baseUrl: presetFor(initialProvider)?.defaultBaseUrl || '', keyGroupId: 'default', authMode: 'group', capacity: '', timeoutSeconds: 60, taskUrls: {}, adapterOptions: {} });
  const [rows, setRows] = useState(() => initialRows?.length ? structuredClone(initialRows) : [modelRow(state, initialEndpoint ? '' : libraryId)]);
  const [endpointId, setEndpointId] = useState(initialEndpoint?.id || ''), [saved, setSaved] = useState(null), [priceRow, setPriceRow] = useState(null), [suggestedRoot, setSuggestedRoot] = useState('');
  const [draftId, setDraftId] = useState(''), [draftRevision, setDraftRevision] = useState(0), [showDrafts, setShowDrafts] = useState(false), [errors, setErrors] = useState([]), [page, setPage] = useState(1), [addingProvider, setAddingProvider] = useState(false);
  const [rawKey, setRawKey] = useState(''), [keyMetadata, setKeyMetadata] = useState(null), [keyError, setKeyError] = useState(''), [keyMode, setKeyMode] = useState('auto');
  const [saving, setSaving] = useState(false), saveLock = useRef(false), allowed = useRef(ops.can); allowed.current = ops.can;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { let current = true; setKeyMetadata(null); setKeyError(''); if (rawKey) providerApiKeysDraft([rawKey]).then(result => { if (current) setKeyMetadata({ ...result.apiKeys[0], version: 1 }); }).catch(error => { if (current) setKeyError(error.message); }); return () => { current = false; }; }, [rawKey]);
  useEffect(() => { if (!ops.can) { setRawKey(''); setKeyMetadata(null); } }, [ops.can]);
  const [nameError, setNameError] = useState(''), [discardProvider, setDiscardProvider] = useState(false);
  const parentDirty = useRef(false), childDirty = useRef(false), creationId = useRef(crypto.randomUUID()), nameInput = useRef(null), providerTrigger = useRef(null);
  const endpoint = state.endpoints.find(row => row.id === endpointId && !row.deletedAt), drafts = channelDrafts(state);
  const providers = supplierDirectory(state).filter(row => !row.id.startsWith('service-review-provider-'));
  let provider, providerIssue = '';
  try { provider = resolveOnboardingProvider(state, endpoint ? { providerId: endpoint.providerId } : { providerId: value.providerId === 'unselected' ? '' : value.providerId, providerPresetId: value.providerPresetId, newProvider: value.newProvider }); if (value.newProvider) provider.id = 'new-provider:' + creationId.current; } catch (error) { providerIssue = error.message; }
  const modelOptions = onboardingModelOptions(state);
  const resolvedModel = row => { try { return resolveOnboardingModel(state, row); } catch { return null; } };
  const masterFor = row => resolvedModel(row)?.record;
  const pickerValue = row => { const model = resolvedModel(row); return model?.isDraft && row.modelPresetId ? 'preset:' + row.modelPresetId : model?.record.id || ''; };
  const validationState = { ...state, modelTemplates: [...state.modelTemplates, ...modelOptions.filter(row => row.modelPresetId), ...rows.filter(row => row.newModel).map(row => masterFor(row)).filter(Boolean)] };
  const keys = provider ? providerApiKeyRows(state, provider).map(row => row.apiKey) : [], groups = providerKeyGroups(provider || {}, keys);
  const primaryKey = providerKeyGroupKeys(provider || {}, value.keyGroupId, true, keys)[0];
  const existingKeys = primaryKey && primaryKey.status !== 'disabled' && !primaryKey.revokedAt ? [primaryKey] : [];
  const previewKey = keyMetadata && { ...keyMetadata, id: 'pending:' + provider?.id + ':' + keyMetadata.fingerprint.slice(0, 16) };
  const useNewKey = !endpoint && value.authMode !== 'none' && (keyMode === 'new' || keyMode === 'auto' && !existingKeys.length);
  const previewProvider = useNewKey && provider ? { ...provider, apiKeys: previewKey ? [previewKey] : [] } : provider;
  const discoveryState = provider && !state.providers.some(row => row.id === provider.id) ? { ...validationState, providers: [...state.providers, previewProvider] } : validationState;
  const discoveryConfiguration = endpoint || { ...value, id: creationId.current, providerId: provider?.id, protocol: CHANNEL_INTERFACES.find(row => row.id === value.interfaceType)?.protocol, ...(useNewKey ? { authMode: 'specific', apiKeyId: previewKey?.id, apiKeys: previewKey ? [previewKey] : [], credentialVersion: keyMetadata?.fingerprint || '' } : {}) };
  const dirty = () => { ops.dirty(true); ops.setError(''); setErrors([]); setNameError(''); };
  const set = patch => { setValue(current => ({ ...current, ...patch })); dirty(); setSuggestedRoot(''); };
  const changeRows = next => { setRows(next); dirty(); };
  const setRow = (id, patch) => changeRows(rows.map(row => row.id === id ? { ...row, ...patch } : row));
  const setNewProviderName = name => { setValue(current => { const previousName = current.newProvider?.name.trim(), oldDefault = previousName ? previousName.slice(0, 54) + '渠道' : '新渠道'; return { ...current, newProvider: { name }, name: !current.name || current.name === oldDefault ? name.trim() ? name.trim().slice(0, 54) + '渠道' : '新渠道' : current.name }; }); dirty(); };
  const startNewModel = row => setRow(row.id, { libraryId: '', modelPresetId: '', newModel: { modelId: row.upstreamModelId.trim().toLowerCase(), name: row.upstreamModelId.trim(), type: 'text' }, source: 'manual', confirmed: true });
  const selectModel = (row, id, next = state) => { const model = onboardingModelOptions(next).find(item => item.id === id) || libraryRecord(next, id); setRow(row.id, { libraryId: model?.libraryId || (model?.modelPresetId ? '' : id), modelPresetId: model?.modelPresetId || '', newModel: null, upstreamModelId: row.upstreamModelId && row.upstreamModelId !== masterFor(row)?.modelId ? row.upstreamModelId : model?.modelId || '', scenarios: pickerValue(row) === id ? row.scenarios : [], source: 'reference', confirmed: true }); };
  const cancel = () => ops.proceed(close);
  const connection = () => ({ ...prepareChannelInterface({ interfaceType: value.interfaceType, baseUrl: value.baseUrl, taskUrls: value.taskUrls || {}, allowHttp: provider?.sourceType === 'selfHosted' }), adapterOptions: prepareChannelAdapterOptions(value.adapterOptions) });
  const restore = draft => ops.proceed(() => { setValue({ capacity: '', timeoutSeconds: 60, ...draft.value }); setRows(draft.rows); setRawKey(''); setKeyMode('auto'); setEndpointId(draft.endpointId); setDraftId(draft.id); setDraftRevision(draft.draftRevision); setShowDrafts(false); setErrors([]); setNameError(''); setPage(1); ops.dirty(false); ops.setError(channelDraftIssue(state, draft)); });
  const saveDraft = () => {
    const result = ops.run('channelDraftSave', { id: draftId || undefined, expectedRevision: draftRevision, value: endpoint ? { ...value, name: endpoint.name, providerId: endpoint.providerId } : value, rows, endpointId, step: 0 });
    if (result) { const draft = result.modelOnboardings.find(row => row.id === result.audits[0].objectId); setDraftId(draft.id); setDraftRevision(draft.draftRevision); }
  };
  const nameIssue = () => !value.name.trim() ? '请填写渠道名称' : supplierChannelResources(state, provider).some(row => supplierChannelName(provider, row) === value.name.trim()) ? '供应商的渠道名称不可重复' : '';
  const showNameError = message => { setErrors([]); setNameError(message); ops.setError(''); requestAnimationFrame(() => nameInput.current?.focus()); };
  useEffect(() => {
    if (endpointId || !/渠道名称.*重复/.test(ops.error || '')) return;
    setNameError(ops.error);
    const frame = requestAnimationFrame(() => nameInput.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [ops.error, endpointId]);
  const save = async () => {
    if (saveLock.current || !ops.can) return;
    saveLock.current = true; setSaving(true);
    try {
      if (!provider) throw new Error(providerIssue || '请选择供应商');
      if (!endpoint) { const issue = nameIssue(); if (issue) { showNameError(issue); return; } }
      const identityErrors = rows.filter(row => row.selected !== false && row.newModel).flatMap(row => { try { resolveOnboardingModel(state, row); return []; } catch (error) { return [{ rowId: row.id, field: 'newModel', message: error.message }]; } });
      const checked = [...identityErrors, ...validateChannelRows(validationState, rows.map(row => ({ ...row, libraryId: pickerValue(row) })), endpoint || { interfaceType: value.interfaceType })];
      if (checked.length) { setErrors(checked); const rowIndex = rows.findIndex(row => row.id === checked[0].rowId); if (rowIndex >= 0) setPage(Math.floor(rowIndex / 10) + 1); requestAnimationFrame(() => document.querySelector(`[data-channel-row="${checked[0].rowId}"]`)?.querySelector('button,input')?.focus()); return; }
      const models = rows.filter(row => row.selected !== false).map(({ libraryId, modelPresetId, newModel, upstreamModelId, scenarios }) => ({ ...(newModel ? { newModel } : modelPresetId ? { modelPresetId } : { libraryId }), upstreamModelId, scenarios }));
      const values = endpoint ? { endpointId: endpoint.id, models } : { ...value, ...connection(), models };
      let newApiKey;
      if (!endpoint && useNewKey) newApiKey = (await providerApiKeysDraft([rawKey])).apiKeys[0];
      if (!mounted.current || !allowed.current) return;
      const result = ops.run('channelQuickCreate', { ...(endpoint ? { providerId: provider.id } : value.newProvider ? { newProvider: value.newProvider } : value.providerPresetId ? { providerPresetId: value.providerPresetId } : { providerId: provider.id }), ...(newApiKey ? { newApiKey } : {}), values, ...(draftId ? { draftId, expectedDraftRevision: draftRevision } : {}) });
      if (!result) return;
      const channel = endpoint || result.endpoints.find(row => row.id === result.audits[0].objectId), owner = result.providers.find(row => row.id === channel.providerId), upstreamIds = new Set(models.map(row => row.upstreamModelId.trim()));
      const associations = owner.catalogConnections.filter(row => row.endpointId === channel.id && !row.deletedAt && upstreamIds.has(row.upstreamModelId));
      setSaved({ endpointId: channel.id, associationIds: associations.map(row => row.id), libraryId: owner.catalogModels.find(row => row.modelId === associations[0]?.modelId)?.libraryId || libraryId }); setRawKey(''); setPriceRow(null);
    } catch (error) { if (mounted.current) { ops.setError(error.message); setSuggestedRoot(error.suggestedBaseUrl || ''); } }
    finally { saveLock.current = false; if (mounted.current) setSaving(false); }
  };
  const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / 10))), selected = rows.filter(row => row.selected !== false);
  const rowError = id => errors.filter(error => error.rowId === id).map(error => error.message).join('；');
  const childOps = { ...ops, dirty: value => { childDirty.current = value; ops.dirty(parentDirty.current || value); }, run: (...args) => { const result = ops.run(...args); if (result) childDirty.current = false; ops.dirty(parentDirty.current || childDirty.current); return result; } };
  const closeProvider = () => { setAddingProvider(false); setDiscardProvider(false); childDirty.current = false; ops.dirty(parentDirty.current); ops.setError(''); requestAnimationFrame(() => providerTrigger.current?.focus()); };
  if (saved) return <SupplierChannelBatchTest state={state} provider={state.providers.find(row => row.id === state.endpoints.find(item => item.id === saved.endpointId)?.providerId)} endpointId={saved.endpointId} associationIds={saved.associationIds} ops={ops} close={() => close(saved.libraryId)} />;
  return <><SupplierCreationDialog title={endpoint ? '添加关联模型' : '添加渠道'} description="选择供应商和模型，填写连接信息，保存后测试并启用。" cancel={cancel} disabled={saving || !ops.can || !provider} action={saving ? '保存中…' : '保存接入'} submit={save} footer={<><Button type="button" variant="outline" disabled={saving || !ops.can || !(endpoint || value.newProvider || value.providerPresetId || providers.some(row => row.id === value.providerId)) || !(endpoint?.name || value.name.trim())} onClick={saveDraft}>保存草稿</Button></>}>
    <div className="supplier-row-actions"><ol className="supplier-onboarding-steps" aria-label="接入步骤">{['配置接入', '测试与启用'].map((label, index) => <li key={label} aria-current={index === 0 ? 'step' : undefined}><span>{index + 1}</span>{label}</li>)}</ol>{drafts.length > 0 && <Button type="button" variant="link" onClick={() => setShowDrafts(!showDrafts)}>继续草稿（{drafts.length}）</Button>}</div>
    {showDrafts && <div className="supplier-draft-list">{drafts.map(draft => <div key={draft.id}><div><strong>{draft.value.name}</strong><small>{draft.value.newProvider?.name || state.providers.find(row => row.id === draft.value.providerId)?.name || ONBOARDING_PROVIDER_PRESETS.find(row => row.id === draft.value.providerPresetId)?.name || '供应商已不存在'} · {draft.rows.length} 个模型</small></div><Button type="button" variant="link" onClick={() => restore(draft)}>继续编辑</Button><Button type="button" variant="link" disabled={saving || !ops.can} onClick={() => ops.run('channelDraftDiscard', { id: draft.id, expectedRevision: draft.draftRevision })}>放弃草稿</Button></div>)}</div>}
    {!endpoint && <>
      <div className="supplier-channel-fields"><Field label="供应商 *"><Choice label="供应商" value={value.newProvider ? 'new' : value.providerPresetId && !providers.some(row => row.id === provider?.id) ? 'preset:' + value.providerPresetId : provider?.id || value.providerId} options={[[ 'unselected', '请选择供应商' ], ['new', '新供应商'], ...providers.map(row => [row.id, row.name]), ...ONBOARDING_PROVIDER_PRESETS.filter(preset => !providers.some(row => row.onboardingPresetId === preset.id || row.code === preset.code)).map(row => ['preset:' + row.id, row.name + ' · 内置'])]} disabled={saving || !ops.can} onChange={selection => ops.proceed(() => {
        if (selection === 'new') {
          setValue(current => ({ ...current, providerId: '', providerPresetId: '', newProvider: { name: '' }, name: '新渠道', interfaceType: 'openai', baseUrl: '', keyGroupId: 'default', authMode: 'group', taskUrls: {}, adapterOptions: {} }));
          setRows(current => current.map(row => !row.libraryId && !row.modelPresetId && !row.upstreamModelId ? { ...row, newModel: { modelId: '', type: 'text' }, confirmed: true } : row));
          setRawKey(''); setKeyMode('auto'); dirty(); return;
        }
        const choice = selection.startsWith('preset:') ? { providerId: '', providerPresetId: selection.slice(7), newProvider: null } : { providerId: selection, providerPresetId: '', newProvider: null };
        let next; try { next = resolveOnboardingProvider(state, choice); } catch (error) { ops.setError(error.message); return; }
        const preset = presetFor(next), used = new Set(supplierChannelResources(state, next).map(row => supplierChannelName(next, row)));
        let name = next.name + '渠道', suffix = 2; while (used.has(name)) name = next.name + '渠道 ' + suffix++;
        setValue(current => ({ ...current, ...choice, name, interfaceType: next.defaultProtocol?.includes('Anthropic') ? 'anthropic' : next.defaultProtocol?.includes('OpenAI') ? 'openai' : preset?.interfaceType || 'unselected', baseUrl: preset?.defaultBaseUrl || '', keyGroupId: 'default', authMode: 'group', taskUrls: {}, adapterOptions: {} })); setRawKey(''); setKeyMode('auto'); dirty();
      })}/>{value.newProvider ? <><Input aria-label="新供应商名称" placeholder="供应商名称" value={value.newProvider.name} maxLength={100} disabled={saving || !ops.can} onChange={event => setNewProviderName(event.target.value)}/>{value.newProvider.name && providerIssue && <small role="alert" className="supplier-key-error">{providerIssue}</small>}</> : <Button ref={providerTrigger} type="button" variant="link" disabled={saving || !ops.can} onClick={() => { parentDirty.current = ops.hasUnsaved(); childDirty.current = false; setAddingProvider(true); }}>单独登记供应商</Button>}</Field><Field label="渠道名称 *"><Input ref={nameInput} aria-label="渠道名称" aria-invalid={Boolean(nameError)} aria-describedby={nameError ? 'supplier-channel-name-error' : undefined} value={value.name} maxLength={60} disabled={saving || !ops.can} onChange={event => set({ name: event.target.value })}/>{nameError && <small id="supplier-channel-name-error" role="alert" className="supplier-key-error">{nameError}</small>}</Field></div>
      <div className="supplier-channel-fields"><Field label="接口类型 *"><Choice label="接口类型" value={value.interfaceType} options={[[ 'unselected', '请选择接口类型' ], ...CHANNEL_INTERFACES.map(item => [item.id, item.label])]} disabled={saving || !ops.can} onChange={interfaceType => value.baseUrl ? ops.proceed(() => set({ interfaceType, baseUrl: '', taskUrls: {}, adapterOptions: {} })) : set({ interfaceType, baseUrl: '', taskUrls: {}, adapterOptions: {} })}/></Field><Field label={value.interfaceType === 'custom' ? '完整任务地址 *' : '服务根地址 *'}><Input aria-label="渠道 API 地址" maxLength={2048} placeholder={value.interfaceType === 'custom' ? 'https://gateway.example.com/完整接口路径' : 'https://gateway.example.com/v1'} value={value.baseUrl} disabled={saving || !ops.can} onChange={event => set({ baseUrl: event.target.value })}/></Field></div>
      {suggestedRoot && <Notice>识别到完整任务地址。<Button type="button" variant="link" onClick={() => set({ baseUrl: suggestedRoot })}>使用根地址 {suggestedRoot}</Button></Notice>}
      {provider?.sourceType === 'selfHosted' && <Field label="认证方式"><Choice label="认证方式" value={value.authMode} options={[[ 'group', 'API 密钥组' ], [ 'none', '无需认证' ]]} disabled={saving || !ops.can} onChange={authMode => { setRawKey(''); set({ authMode }); }}/></Field>}
      {provider && value.authMode !== 'none' && <div className="supplier-inline-key">{keys.length > 0 && <Field label="API 密钥"><Choice label="API 密钥来源" value={useNewKey ? 'new' : value.keyGroupId} options={[...groups.map(group => [group.id, group.name]), ['new', '输入新密钥']]} disabled={saving || !ops.can} onChange={selection => { setRawKey(''); setKeyMode(selection === 'new' ? 'new' : 'existing'); if (selection !== 'new') set({ keyGroupId: selection }); else dirty(); }}/></Field>}{useNewKey ? <Field label={keys.length ? '新 API 密钥 *' : 'API 密钥 *'}><Input type="password" autoComplete="new-password" aria-label="API 密钥" value={rawKey} placeholder="输入供应商提供的 API 密钥" maxLength={512} disabled={saving || !ops.can} onChange={event => { setRawKey(event.target.value); setKeyMetadata(null); dirty(); }}/><small className="supplier-price-hint">保存草稿不保留密钥，恢复后需重新输入。</small>{keyError && <small className="supplier-key-error" role="alert">{keyError}</small>}</Field> : !existingKeys.length && <Notice error>所选密钥组暂无可用的主要密钥，请输入新密钥或更换分组。</Notice>}</div>}
      <ChannelAdvancedFields value={value} onChange={set} disabled={saving || !ops.can}/>
    </>}
      {endpoint && <div className="supplier-onboarding-context"><strong>{provider?.name}</strong><span>{endpoint?.name || value.name}</span><code>{endpoint?.baseUrl || value.baseUrl}</code></div>}
      <details><summary>从上游发现或批量选择模型</summary><ChannelDiscovery state={discoveryState} provider={previewProvider} configuration={discoveryConfiguration} ops={{ ...ops, can: ops.can && (!useNewKey || Boolean(keyMetadata)) }} onAppend={discovered => { changeRows([...rows.filter(row => row.libraryId || row.modelPresetId || row.newModel || row.upstreamModelId), ...discovered]); }}/><ChannelModelReferencePicker state={state} rows={rows.filter(row => row.libraryId)} disabled={saving || !ops.can} reservedCount={rows.filter(row => !row.libraryId).length} onChange={next => changeRows([...rows.filter(row => !row.libraryId), ...next])}/></details>
      {rows.length > 1 && <div className="supplier-row-actions"><label><input type="checkbox" aria-label="选择全部模型行" disabled={saving || !ops.can} checked={rows.length > 0 && selected.length === rows.length} onChange={event => changeRows(rows.map(row => ({ ...row, selected: event.target.checked })))}/>全部 {rows.length} 项</label><span>已选 {selected.length}</span></div>}
      <div className="mo-table-scroll"><Table className={`supplier-onboarding-models${rows.length === 1 && selected.length === 1 ? ' supplier-onboarding-single' : ''}`}><TableHeader><TableRow><TableHead>选择</TableHead><TableHead>模型资料 / 来源</TableHead><TableHead>上游模型 ID / 请求地址</TableHead><TableHead>采购价</TableHead><TableHead>操作</TableHead></TableRow></TableHeader><TableBody>{rows.slice((currentPage - 1) * 10, currentPage * 10).map((row, index) => {
        let url = ''; try { url = modelTaskUrl(endpoint || connection(), masterFor(row)?.type); } catch { /* No request preview before the interface and model are valid. */ }
        return <TableRow key={row.id} data-channel-row={row.id}>
          <TableCell>{(rows.length > 1 || row.selected === false) && <input type="checkbox" aria-label={`选择模型行 ${(currentPage - 1) * 10 + index + 1}`} checked={row.selected !== false} disabled={saving || !ops.can} onChange={event => setRow(row.id, { selected: event.target.checked })}/>}</TableCell>
          <TableCell>{row.newModel ? <div className="supplier-inline-model"><Choice label={`第 ${(currentPage - 1) * 10 + index + 1} 行模型类型`} value={row.newModel.type} options={Object.entries(MODEL_TYPES)} disabled={saving || !ops.can} onChange={type => setRow(row.id, { newModel: { ...row.newModel, type }, scenarios: [] })}/><Button type="button" variant="link" disabled={saving || !ops.can} onClick={() => setRow(row.id, { newModel: null })}>从资料库选择</Button></div> : <SupplyModelPicker ops={ops} includePresets referenceModelIds={presetFor(provider)?.catalogModelIds} state={state} value={pickerValue(row)} disabled={saving || !ops.can} onCreateInline={() => startNewModel(row)} onChange={(id, next) => selectModel(row, id, next)}/>}
            <small>{row.newModel ? '新模型 · 资料待完善' : row.modelPresetId ? '内置目录' : row.source === 'reference' ? '资料库' : row.source === 'upstream' ? '上游发现' : row.libraryId ? '资料库' : '待选择'}</small>
            {(row.source === 'upstream' || row.source === 'reference' && !row.confirmed) && <label><input type="checkbox" checked={row.confirmed === true} disabled={saving || !ops.can} onChange={event => setRow(row.id, { confirmed: event.target.checked })}/>确认身份匹配</label>}
          </TableCell>
          <TableCell><Input aria-label={`第 ${(currentPage - 1) * 10 + index + 1} 行上游模型 ID`} placeholder={row.newModel ? '输入上游 Model ID' : ''} value={row.upstreamModelId} maxLength={row.newModel ? 80 : 200} aria-invalid={Boolean(rowError(row.id))} disabled={saving || !ops.can} onChange={event => { const upstreamModelId = event.target.value; setRow(row.id, { upstreamModelId, ...(row.newModel ? { newModel: { ...row.newModel, modelId: upstreamModelId.trim().toLowerCase(), name: upstreamModelId.trim() } } : {}) }); }}/>{url && <small className="supplier-request-preview" title={url}>{url}</small>}{rowError(row.id) && <small role="alert" className="supplier-key-error">{rowError(row.id)}</small>}</TableCell>
          <TableCell>{row.scenarios.length ? `${row.scenarios.length} 个计费项` : '待配置'}</TableCell>
          <TableCell><div className="supplier-row-actions"><Button type="button" variant="link" disabled={saving || !ops.can} onClick={() => setPriceRow(priceRow === row.id ? null : row.id)}>配置采购价</Button><Button type="button" variant="ghost" size="icon-sm" aria-label={`移除模型行 ${(currentPage - 1) * 10 + index + 1}`} disabled={saving || !ops.can || rows.length === 1} onClick={() => changeRows(rows.filter(item => item.id !== row.id))}><Trash2/></Button></div></TableCell>
        </TableRow>;
      })}</TableBody></Table></div>{rows.length > 10 && <Pagination count={rows.length} page={currentPage} setPage={setPage}/>}
      <Button type="button" variant="outline" disabled={saving || !ops.can || rows.length >= 50} onClick={() => { changeRows([...rows, modelRow(state)]); setPage(Math.ceil((rows.length + 1) / 10)); }}><Plus/>手动添加模型</Button>
      {rows.filter(row => row.id === priceRow).map(row => <SupplierPriceFields key={row.id} ops={ops} state={state} scenarios={row.scenarios} disabled={saving || !ops.can} onChange={scenarios => setRow(row.id, { scenarios })}/>)}
    {errors.filter(error => !error.rowId).map(error => <Notice error key={error.field}>{error.message}</Notice>)}{ops.error && !nameError && <Notice error>{ops.error}</Notice>}
  </SupplierCreationDialog>{addingProvider && <SupplierProfileDialog ops={childOps} cancel={() => childDirty.current ? setDiscardProvider(true) : closeProvider()} discardConfirmation={discardProvider ? { continueEditing: () => setDiscardProvider(false), discard: closeProvider } : null} done={(next, id) => { closeProvider(); set({ providerId: id, providerPresetId: '', newProvider: null, keyGroupId: 'default' }); setKeyMode('auto'); setRawKey(''); }}/>}</>;
}
