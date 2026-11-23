import { useChannelText } from './channel-language';
import Table, { AdminPagination } from './AdminTable';
import { pendingGuidedOnboardings } from './guided-onboarding';
import ChannelDiscovery from './ChannelDiscovery';
import ChannelAdvancedFields from './ChannelAdvancedFields';
import { useEffect, useRef, useState } from 'react';
import { IconDelete, IconPlus } from '@douyinfe/semi-icons';
import { Button, Checkbox, Input, Select, Steps, TextArea, Typography } from '@douyinfe/semi-ui';
import SupplierCreationDialog from './SupplierCreationDialog';
import { Choice, Field } from './ServiceUI';
import { CopyId, Disclosure, Modal, Notice } from './ModelOperationsUI';
import { supplierDirectory } from './moma-provider';
import { libraryRecord } from './model-library';
import { MODEL_TYPES } from './model-management';
import SupplyModelPicker from './SupplyModelPicker';
import SupplierPriceFields from './SupplierPriceFields';
import { providerApiKeysDraft, providerApiKeyName, maskProviderApiKey } from './provider-management';
import { ONBOARDING_PROVIDER_PRESETS, resolveOnboardingProvider, resolveOnboardingModel, onboardingModelOptions, similarOnboardingProviders } from './onboarding-presets';
import { CHANNEL_INTERFACES, prepareChannelInterface, prepareChannelAdapterOptions } from './channel-interface';
import { workbenchProtocolLabel } from './workbench-protocol.js';
import { previewChannelModels, validateChannelRows } from './channel-onboarding';
import SupplierChannelBatchTest from './SupplierChannelBatchTest';
import { supplierChannelResources, supplierChannelName } from './supplier-resources';

function ProviderChoice({value,options,disabled,onChange}) {
  const groups=[['已有服务商',options.filter(([id])=>!['new','unselected'].includes(id) && !id.startsWith('preset:'))],['从模板新增',options.filter(([id])=>id.startsWith('preset:'))],['自定义新增',options.filter(([id])=>id==='new')]];
  return <Select aria-label="服务商" value={value} disabled={disabled} onChange={value=>onChange(value)}><Select.Option value="unselected">请选择服务商</Select.Option>{groups.map(([label,rows])=>rows.length>0 && <Select.OptGroup key={label} label={label}>{rows.map(([id,name])=><Select.Option key={id} value={id}>{name}</Select.Option>)}</Select.OptGroup>)}</Select>;
}
const presetFor = provider => ONBOARDING_PROVIDER_PRESETS.find(row => row.id === provider?.onboardingPresetId || row.code === provider?.code);
const modelRow = (state, libraryId = '') => ({ id: crypto.randomUUID(), libraryId, upstreamModelId: '', scenarios: [], source: libraryId ? 'reference' : 'manual', selected: true, confirmed: Boolean(libraryId) });
export default function SupplierChannelConfiguration({ state, provider: initialProvider, libraryId = '', endpoint: initialEndpoint, initialRows, ops, close, draft, guidedStep: initialStep, onStepChange, onConnected, directory = false, cancelLabel, reference = false }) {
  const t = useChannelText();
  const guided = initialStep !== undefined;
  const [guidedStep, setGuidedStep] = useState(initialStep);
  useEffect(()=>{onStepChange?.(guidedStep);},[guidedStep,onStepChange]);
  const [value, setValue] = useState(() => draft ? { ...structuredClone(draft.value), authMode: draft.value.authMode === 'none' ? 'none' : 'specific' } : { providerId: initialProvider?.id || 'unselected', name: initialProvider ? `${initialProvider.name}连接` : '', interfaceType: initialProvider?.defaultProtocol?.includes('Anthropic') ? 'anthropic' : initialProvider?.defaultProtocol?.includes('OpenAI') ? 'openai' : presetFor(initialProvider)?.interfaceType || 'unselected', baseUrl: initialProvider?.baseUrl || presetFor(initialProvider)?.defaultBaseUrl || '', apiKeyId: '', authMode: 'specific', capacity: '', timeoutSeconds: 60, taskUrls: {}, adapterOptions: {} });
  const [intent,setIntent]=useState(draft?.intent || 'onboard');
  const [rows, setRows] = useState(() => draft ? structuredClone(draft.rows) : initialRows?.length ? structuredClone(initialRows) : [modelRow(state, initialEndpoint ? '' : libraryId)]);
  const [endpointId, setEndpointId] = useState(draft?.endpointId || initialEndpoint?.id || ''), [saved, setSaved] = useState(null), [priceRow, setPriceRow] = useState(null), [suggestedRoot, setSuggestedRoot] = useState('');
  const [discovering, setDiscovering] = useState(false);
  const [pasting, setPasting] = useState(false), [pasted, setPasted] = useState(''), [pasteError, setPasteError] = useState('');
  const [approvedScope, setApprovedScope] = useState(false);
  const [draftId] = useState(draft?.id || ''), [draftRevision] = useState(draft?.draftRevision || 0), [errors, setErrors] = useState([]), [page, setPage] = useState(1);
  const [rawKey, setRawKey] = useState(''), [keyMetadata, setKeyMetadata] = useState(null), [keyError, setKeyError] = useState(''), [keyMode, setKeyMode] = useState('auto');
  const [saving, setSaving] = useState(false), saveLock = useRef(false), allowed = useRef(ops.can); allowed.current = ops.can;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { let current = true; setKeyMetadata(null); setKeyError(''); if (rawKey) providerApiKeysDraft([rawKey]).then(result => { if (current) setKeyMetadata({ ...result.apiKeys[0], version: 1 }); }).catch(error => { if (current) setKeyError(error.message); }); return () => { current = false; }; }, [rawKey]);
  useEffect(() => { if (!ops.can) { setRawKey(''); setKeyMetadata(null); } }, [ops.can]);
  const [nameError, setNameError] = useState('');
  const creationId = useRef(crypto.randomUUID()), nameInput = useRef(null);
  const endpoint = state.endpoints.find(row => row.id === endpointId && !row.deletedAt);
  const providers = supplierDirectory(state).filter(row => !row.id.startsWith('service-review-provider-'));
  let provider, providerIssue = '';
  try { provider = resolveOnboardingProvider(state, endpoint ? { providerId: endpoint.providerId } : { providerId: value.providerId === 'unselected' ? '' : value.providerId, providerPresetId: value.providerPresetId, newProvider: value.newProvider }); if (value.newProvider) provider.id = 'new-provider:' + creationId.current; } catch (error) { providerIssue = error.message; }
  const modelOptions = onboardingModelOptions(state);
  const resolvedModel = row => { try { return resolveOnboardingModel(state, row); } catch { return null; } };
  const masterFor = row => resolvedModel(row)?.record;
  const duplicates=guided ? pendingGuidedOnboardings(state).filter(task=>task.draft.id!==draftId && (task.master?.id===resolvedModel(rows[0])?.record.id || task.draft.rows[0]?.newModel?.modelId && task.draft.rows[0].newModel.modelId===rows[0]?.newModel?.modelId)) : [];
  const pickerValue = row => { const model = resolvedModel(row); return model?.isDraft && row.modelPresetId ? 'preset:' + row.modelPresetId : model?.record.id || ''; };
  const validationState = { ...state, modelTemplates: [...state.modelTemplates, ...modelOptions.filter(row => row.modelPresetId), ...rows.filter(row => row.newModel).map(row => masterFor(row)).filter(Boolean)] };
  const keys = (provider?.apiKeys || []).filter(key => key.scope !== 'channel' && key.status !== 'disabled' && !key.revokedAt);
  const apiKeyId = value.apiKeyId || keys[0]?.id || '';
  const previewKey = keyMetadata && { ...keyMetadata, id: 'pending:' + provider?.id + ':' + keyMetadata.fingerprint.slice(0, 16) };
  const useNewKey = !endpoint && value.authMode !== 'none' && (keyMode === 'new' || keyMode === 'auto' && !apiKeyId);
  const previewProvider = useNewKey && provider ? { ...provider, apiKeys: previewKey ? [previewKey] : [] } : provider;
  const discoveryState = provider && !state.providers.some(row => row.id === provider.id) ? { ...validationState, providers: [...state.providers, previewProvider] } : validationState;
  const discoveryConfiguration = endpoint || { ...value, id: creationId.current, apiKeyId, providerId: provider?.id, protocol: CHANNEL_INTERFACES.find(row => row.id === value.interfaceType)?.protocol, ...(useNewKey ? { authMode: 'specific', apiKeyId: previewKey?.id, apiKeys: previewKey ? [previewKey] : [], credentialVersion: keyMetadata?.fingerprint || '' } : {}) };
  const dirty = () => { ops.dirty(true); ops.setError(''); setErrors([]); setNameError(''); };
  const set = patch => { setValue(current => ({ ...current, ...patch })); dirty(); setSuggestedRoot(''); };
  const changeRows = next => { setRows(next); setApprovedScope(false); dirty(); };
  const setRow = (id, patch) => changeRows(rows.map(row => row.id === id ? { ...row, ...patch } : row));
  const setNewProviderName = name => { setValue(current => { const previousName = current.newProvider?.name.trim(), oldDefault = previousName ? previousName.slice(0, 54) + '连接' : '新连接'; return { ...current, newProvider: { name }, name: !current.name || current.name === oldDefault ? name.trim() ? name.trim().slice(0, 54) + '连接' : '新连接' : current.name }; }); dirty(); };
  const startNewModel = row => setRow(row.id, { libraryId: '', modelPresetId: '', newModel: { modelId: row.upstreamModelId.trim().toLowerCase(), name: row.upstreamModelId.trim(), type: 'text' }, source: 'manual', confirmed: true });
  const selectModel = (row, id, next = state) => {
    const model = onboardingModelOptions(next).find(item => item.id === id) || libraryRecord(next, id);
    const sameModel = pickerValue(row) === id;
    setRow(row.id, {
      libraryId: model?.libraryId || (model?.modelPresetId ? '' : id), modelPresetId: model?.modelPresetId || '', newModel: null,
      upstreamModelId: sameModel || initialEndpoint && (row.source === 'upstream' || directory && row.pasted) ? row.upstreamModelId : '',
      scenarios: sameModel ? row.scenarios : [], source: 'reference', confirmed: true,
    });
  };
  const cancel = () => ops.proceed(close);
  const pasteRows = () => {
    try {
      const ids = pasted.split(/[\s,，]+/u).filter(Boolean);
      const preview = previewChannelModels(state, provider.id, ids, { endpointId: endpoint.id, complete: false, source: 'reference' });
      const existing = rows.filter(row => row.libraryId || row.modelPresetId || row.newModel || row.upstreamModelId);
      const present = new Set(existing.map(row => row.upstreamModelId.trim()));
      const archived = new Set(state.modelData?.archivedCatalogueIds || []);
      const additions = preview.rows.filter(row => row.status !== '已存在' && !present.has(row.upstreamModelId)).map(row => ({
        ...row, pasted: true, selected: true, libraryId: archived.has(libraryRecord(state, row.libraryId)?.id) ? '' : row.libraryId,
      }));
      if (!additions.length) throw Error('这些标识已在当前连接或草稿中，请输入其他模型');
      if (existing.length + additions.length > 50) throw Error('每批最多接入 50 款模型');
      changeRows([...existing, ...additions]);
      setPage(Math.floor(existing.length / 10) + 1);
      setPasting(false); setPasted(''); setPasteError('');
    } catch (error) { setPasteError(error.message); }
  };
  const connection = () => ({ ...prepareChannelInterface({ interfaceType: value.interfaceType, baseUrl: value.baseUrl, taskUrls: value.taskUrls || {}, allowHttp: provider?.sourceType === 'selfHosted' }), adapterOptions: prepareChannelAdapterOptions(value.adapterOptions) });
  const nextStep = () => {
    try {
      const selected = resolveOnboardingModel(state, rows[0]);
      if (duplicates.length && intent === 'onboard') throw new Error('该模型已有接入任务，请继续已有任务');
      if (state.models.some(model => model.id === selected.record.id || model.templateId === selected.record.id) && intent === 'onboard') throw new Error('该模型已有服务，请选择准备备用或投入当前服务');
      setGuidedStep(1);
    } catch (error) { ops.setError(error.message); }
  };
  const nameIssue = () => !value.name.trim() ? '请填写连接名称' : supplierChannelResources(state, provider).some(row => supplierChannelName(provider, row) === value.name.trim()) ? '服务商的连接名称不可重复' : '';
  const showNameError = message => { setErrors([]); setNameError(message); ops.setError(''); requestAnimationFrame(() => nameInput.current?.focus()); };
  useEffect(() => {
    if (endpointId || !/连接名称.*重复/.test(ops.error || '')) return;
    setNameError(ops.error);
    const frame = requestAnimationFrame(() => nameInput.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [ops.error, endpointId]);
  const save = async () => {
    if (saveLock.current || !ops.can || directory && initialEndpoint && !approvedScope) return;
    saveLock.current = true; setSaving(true);
    try {
      if (!provider) throw new Error(providerIssue || '请选择服务商');
      if (initialEndpoint && !endpoint) throw new Error('连接已变化，请重新选择');
      if (!endpoint) { const issue = nameIssue(); if (issue) { showNameError(issue); return; } }
      const identityErrors = rows.filter(row => row.selected !== false && row.newModel).flatMap(row => { try { resolveOnboardingModel(state, row); return []; } catch (error) { return [{ rowId: row.id, field: 'newModel', message: error.message }]; } });
      const checked = [...identityErrors, ...validateChannelRows(validationState, rows.map(row => ({ ...row, libraryId: pickerValue(row) })), endpoint || { interfaceType: value.interfaceType })];
      if (checked.length) { setErrors(checked); const rowIndex = rows.findIndex(row => row.id === checked[0].rowId); if (rowIndex >= 0) setPage(Math.floor(rowIndex / 10) + 1); requestAnimationFrame(() => document.querySelector(`[data-channel-row="${checked[0].rowId}"]`)?.querySelector('input, button, .semi-select')?.focus()); return; }
      const models = rows.filter(row => row.selected !== false).map(({ libraryId, modelPresetId, newModel, upstreamModelId, scenarios }) => ({ ...(newModel ? { newModel } : modelPresetId ? { modelPresetId } : { libraryId }), upstreamModelId, scenarios }));
      const values = endpoint ? { endpointId: endpoint.id, models } : { ...value, ...connection(), apiKeyId, models };
      let newApiKey;
      if (!endpoint && useNewKey) newApiKey = (await providerApiKeysDraft([rawKey])).apiKeys[0];
      if (!mounted.current || !allowed.current) return;
      const result = await ops.run(guided && !draftId ? 'guidedChannelCreate' : 'channelQuickCreate', { ...(guided && !draftId ? { task: { value, rows, endpointId, intent } } : {}), ...(endpoint ? { providerId: provider.id } : value.newProvider ? { newProvider: value.newProvider } : value.providerPresetId ? { providerPresetId: value.providerPresetId } : { providerId: provider.id }), ...(newApiKey ? { newApiKey } : {}), values, ...(draftId ? { draftId, expectedDraftRevision: draftRevision } : {}) });
      if (!result) return;
      const channel = endpoint || result.endpoints.find(row => row.id === result.audits[0].objectId), owner = result.providers.find(row => row.id === channel.providerId), upstreamIds = new Set(models.map(row => row.upstreamModelId.trim()));
      const associations = owner.catalogConnections.filter(row => row.endpointId === channel.id && !row.deletedAt && upstreamIds.has(row.upstreamModelId));
      if (guided) onConnected(result, draftId || result.modelOnboardings.find(row => row.createdEndpointId === channel.id && row.guided && row.createdAssociationIds?.includes(associations[0]?.id))?.id);
      else if (initialEndpoint && onConnected) onConnected(result, channel.id);
      else setSaved({ endpointId: channel.id, associationIds: associations.map(row => row.id), libraryId: owner.catalogModels.find(row => row.modelId === associations[0]?.modelId)?.libraryId || libraryId });
      setRawKey(''); setPriceRow(null);
    } catch (error) { if (mounted.current) { ops.setError(error.message); setSuggestedRoot(error.suggestedBaseUrl || ''); } }
    finally { saveLock.current = false; if (mounted.current) setSaving(false); }
  };
  const chooseProvider = selection => { const apply=() => {
        setEndpointId('');
        if (selection === 'new') {
          setValue(current => ({ ...current, providerId: '', providerPresetId: '', newProvider: { name: '' }, name: '新连接', interfaceType: 'openai', baseUrl: '', apiKeyId: '', authMode: 'specific', taskUrls: {}, adapterOptions: {} }));
          setRawKey(''); setKeyMode('auto'); dirty(); return;
        }
        const choice = selection.startsWith('preset:') ? { providerId: '', providerPresetId: selection.slice(7), newProvider: null } : { providerId: selection, providerPresetId: '', newProvider: null };
        let next; try { next = resolveOnboardingProvider(state, choice); } catch (error) { ops.setError(error.message); return; }
        const preset = presetFor(next), used = new Set(supplierChannelResources(state, next).map(row => supplierChannelName(next, row)));
        let name = next.name + '连接', suffix = 2; while (used.has(name)) name = next.name + '连接 ' + suffix++;
        setValue(current => ({ ...current, ...choice, name, interfaceType: next.defaultProtocol?.includes('Anthropic') ? 'anthropic' : next.defaultProtocol?.includes('OpenAI') ? 'openai' : preset?.interfaceType || 'unselected', baseUrl: preset?.defaultBaseUrl || '', apiKeyId: '', authMode: 'specific', taskUrls: {}, adapterOptions: {} })); setRawKey(''); setKeyMode('auto'); dirty();
      };
      if(value.providerId!=='unselected'&&value.providerId || value.providerPresetId || value.newProvider || value.baseUrl || rawKey)ops.proceed(apply);else apply();
  };
  const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / 10))), selected = rows.filter(row => row.selected !== false);
  const rowError = id => errors.filter(error => error.rowId === id).map(error => error.message).join('；');
  const supplierField = <Field label="服务商 *"><ProviderChoice label="服务商" value={value.newProvider ? 'new' : value.providerPresetId && !providers.some(row => row.id === provider?.id) ? 'preset:' + value.providerPresetId : provider?.id || value.providerId} options={[[ 'unselected', '请选择服务商' ], ['new', '新服务商'], ...providers.map(row => [row.id, row.name]), ...ONBOARDING_PROVIDER_PRESETS.filter(preset => !providers.some(row => row.onboardingPresetId === preset.id || row.code === preset.code)).map(row => ['preset:' + row.id, row.name + ' · 内置'])]} disabled={saving || !ops.can} onChange={chooseProvider}/>{value.newProvider ? <><Input aria-label="新服务商名称" placeholder="服务商名称" value={value.newProvider.name} maxLength={100} disabled={saving || !ops.can} onChange={value => setNewProviderName(value)}/>{value.newProvider.name && providerIssue && <small role="alert" className="supplier-key-error">{providerIssue}</small>}</> : null}</Field>;
  const pageRows = rows.slice((currentPage - 1) * 10, currentPage * 10);
  const modelColumns = [
    { title: '选择', dataIndex: 'selected', width: 56, render: (_, row, index) => (rows.length > 1 || row.selected === false) ? <Checkbox aria-label={`选择模型行 ${(currentPage - 1) * 10 + index + 1}`} checked={row.selected !== false} disabled={saving || !ops.can} onChange={event => setRow(row.id, { selected: event.target.checked })}/> : null },
    { title: '模型', dataIndex: 'model', render: (_, row, index) => <>{row.newModel ? <div className="supplier-inline-model"><Choice label={`第 ${(currentPage - 1) * 10 + index + 1} 行模型类型`} value={row.newModel.type} options={Object.entries(MODEL_TYPES)} disabled={saving || !ops.can} onChange={type => setRow(row.id, { newModel: { ...row.newModel, type }, scenarios: [] })}/><Button type="tertiary" theme="borderless" disabled={saving || !ops.can} onClick={() => setRow(row.id, { newModel: null })}>从资料库选择</Button></div> : <SupplyModelPicker ops={ops} includePresets referenceModelIds={presetFor(provider)?.catalogModelIds} state={state} value={pickerValue(row)} disabled={saving || !ops.can} onCreateInline={() => startNewModel(row)} onChange={(id, next) => selectModel(row, id, next)}/>}
      <small>{row.newModel ? '新模型 · 资料待完善' : row.modelPresetId ? '内置目录' : row.source === 'reference' ? '资料库' : row.source === 'upstream' ? '上游发现' : row.libraryId ? '资料库' : '待选择'}</small>
      {(row.source === 'upstream' || row.source === 'reference' && !row.confirmed) && <Checkbox aria-label={`确认身份匹配：第 ${(currentPage - 1) * 10 + index + 1} 行`} checked={row.confirmed === true} disabled={saving || !ops.can} onChange={event => setRow(row.id, { confirmed: event.target.checked })}>确认身份匹配</Checkbox>}</> },
    { title: '上游模型 ID', dataIndex: 'upstreamModelId', render: (_, row, index) => <><Input aria-label={`第 ${(currentPage - 1) * 10 + index + 1} 行上游模型 ID`} placeholder="填写上游模型 ID" value={row.upstreamModelId} maxLength={row.newModel ? 80 : 200} aria-invalid={Boolean(rowError(row.id))} disabled={saving || !ops.can} onChange={upstreamModelId => setRow(row.id, { upstreamModelId, ...(row.newModel ? { newModel: { ...row.newModel, modelId: upstreamModelId.trim().toLowerCase(), name: upstreamModelId.trim() } } : {}) })}/>{rowError(row.id) && <small role="alert" className="supplier-key-error">{rowError(row.id)}</small>}</> },
    { title: '服务商成本价（选填）', dataIndex: 'scenarios', width: 110, render: (_, row) => row.scenarios.length ? `${row.scenarios.length} 个计费项` : '待配置' },
    { title: '操作', dataIndex: 'actions', width: 150, render: (_, row, index) => <div className="supplier-row-actions">{!reference && <Button type="tertiary" theme="borderless" disabled={saving || !ops.can} onClick={() => setPriceRow(priceRow === row.id ? null : row.id)}>配置服务商成本价</Button>}<Button icon={<IconDelete aria-hidden="true"/>} theme="borderless" size="small" aria-label={`移除模型行 ${(currentPage - 1) * 10 + index + 1}`} disabled={saving || !ops.can || rows.length === 1} onClick={() => changeRows(rows.filter(item => item.id !== row.id))}/></div> },
  ].filter(column => !reference || column.dataIndex !== 'scenarios');
  const modelFields = !guided && <section className="supplier-combined-models"><div className="supplier-model-entry-heading"><Typography.Title heading={5} component="h3">{initialEndpoint ? '选择模型' : '模型'}</Typography.Title><div className="supplier-row-actions">
      {!reference && initialEndpoint && <Button theme="light" disabled={saving || !ops.can || !endpoint} onClick={() => setDiscovering(true)}>从上游获取</Button>}
      {!reference && directory && initialEndpoint && <>
        <Button theme="light" disabled={saving || !ops.can || !endpoint} onClick={() => setPasting(true)}>粘贴模型列表</Button>
        <Button theme="borderless" disabled={saving || !ops.can || !rows.some(row => row.upstreamModelId || row.libraryId || row.modelPresetId || row.newModel)}
          onClick={() => ops.proceed(() => { changeRows([modelRow(state)]); setPage(1); })}>清空模型草稿</Button>
      </>}
      {!(reference && initialRows?.length) && <Button theme="light" disabled={saving || !ops.can || rows.length >= 50} icon={<IconPlus size="small" aria-hidden="true"/>} onClick={() => { changeRows([...rows, modelRow(state)]); setPage(Math.ceil((rows.length + 1) / 10)); }}>{initialEndpoint ? '手工添加' : '添加模型'}</Button>}</div></div>
      {reference && initialEndpoint && <Typography.Paragraph type="tertiary">
        下拉选项读取<Typography.Text link={{ href: '#/admin-2/model-templates', target: '_blank', rel: 'noopener' }}>基础资料 → 模型</Typography.Text>
        中维护的模型{modelOptions.some(option => option.source === 'reference') ? '，并包含内置参考模型。' : '。'}
      </Typography.Paragraph>}
      {rows.length > 1 && <div className="supplier-row-actions"><Checkbox aria-label="选择全部模型行" disabled={saving || !ops.can} checked={rows.length > 0 && selected.length === rows.length} indeterminate={selected.length > 0 && selected.length < rows.length} onChange={event => changeRows(rows.map(row => ({ ...row, selected: event.target.checked })))}>全部 {rows.length} 项</Checkbox><span>已选 {selected.length}</span></div>}
      <div className="mo-table-scroll"><Table size="small" className={`supplier-onboarding-models${rows.length === 1 && selected.length === 1 ? ' supplier-onboarding-single' : ''}`} rowKey="id" columns={modelColumns} dataSource={pageRows} pagination={false} onRow={row => ({ 'data-channel-row': row.id })}/></div>{rows.length > 10 && <AdminPagination total={rows.length} currentPage={currentPage} onPageChange={setPage}/>}

      {rows.filter(row => row.id === priceRow).map(row => <SupplierPriceFields key={row.id} ops={ops} state={state} scenarios={row.scenarios} disabled={saving || !ops.can} onChange={scenarios => setRow(row.id, { scenarios })}/>)}
    </section>;
  const chooseChannel = id => { setEndpointId(id === 'new' ? '' : id); setRows(current=>current.map(row=>{const master=masterFor(row),matches=provider.catalogConnections?.filter(item=>item.endpointId===id && !item.deletedAt && provider.catalogModels.some(record=>record.modelId===item.modelId && libraryRecord(state,record.libraryId)?.id===master?.id)) || [];return {...row,upstreamModelId:!guided && row.upstreamModelId ? row.upstreamModelId : matches.length===1?matches[0].upstreamModelId:''};}));dirty(); };
  if (saved) return <SupplierChannelBatchTest state={state} provider={state.providers.find(row => row.id === state.endpoints.find(item => item.id === saved.endpointId)?.providerId)} endpointId={saved.endpointId} associationIds={saved.associationIds} ops={ops} close={() => close(saved.libraryId)} />;
  const discoveryDescription = initialEndpoint ? [initialProvider?.name, initialEndpoint.name].filter(Boolean).join(' / ') : '';
  return <><SupplierCreationDialog wide drawer={Boolean(initialEndpoint)} drawerSide={reference ? "right" : "left"} embedded={guided} title={guided ? guidedStep === 0 ? '选择模型' : '接通供应' : initialEndpoint ? '添加上游模型' : '新模型&连接'} description={discoveryDescription || '选择服务商和模型，填写连接信息，保存后测试并启用。'} cancel={cancel} cancelLabel={cancelLabel || (guided ? '退出接入' : '取消')} disabled={saving || !ops.can || directory && initialEndpoint && !approvedScope || (guidedStep===0 ? !rows.every(row=>Boolean(resolvedModel(row))) : !provider)} action={saving ? '保存中…' : guidedStep === 0 ? '下一步：接通供应' : guided ? endpoint ? '复用供应并继续' : '保存连接并进入测试' : initialEndpoint ? '确认接入' : '保存模型及连接'} submit={guidedStep === 0 ? nextStep : save} footer={guidedStep === 1 && <Button theme="light" onClick={() => setGuidedStep(0)}>上一步</Button>}>
    {!guided && !initialEndpoint && <div className="supplier-row-actions"><Steps className="supplier-onboarding-steps" current={0} aria-label="接入步骤"><Steps.Step title="配置接入"/><Steps.Step title="测试与启用"/></Steps></div>}
    {!guided && initialProvider && !initialEndpoint && <div className="supplier-onboarding-context"><span>服务商</span><strong>{initialProvider.name}</strong></div>}
    {initialEndpoint && endpoint && <div className="supplier-onboarding-context"><span>{reference ? t('服务地址') : '复用的服务地址'}</span><CopyId copyAtStart value={endpoint.baseUrl} label={reference ? t('服务地址') : '服务地址'}/></div>}
    {modelFields}
    {!guided && !initialProvider && supplierField}
    {!guided && !initialEndpoint && <Typography.Title heading={5} component="h3">连接</Typography.Title>}
    {!guided && !initialEndpoint && provider && !provider.isDraft && <Field label="模型连接"><Choice label="模型连接" value={endpointId || 'new'} options={[[ 'new', '新建连接' ], ...supplierChannelResources(state, provider).map(row=>[row.id,supplierChannelName(provider,row)])]} disabled={saving || !ops.can} onChange={chooseChannel}/></Field>}
    {!guided && endpoint && !initialEndpoint && <div className="supplier-onboarding-context"><span>{endpoint.protocol}</span><CopyId copyAtStart value={endpoint.baseUrl} label="服务地址（Base URL）"/></div>}
    {(!endpoint || guidedStep === 0) && <>
      {guidedStep !== 0 && <div className="supplier-channel-fields">{guided && supplierField}{!guided && <Field label="连接名称 *" error={nameError}><Input ref={nameInput} aria-label="连接名称" value={value.name} maxLength={60} disabled={saving || !ops.can} onChange={value => set({ name: value })}/></Field>}</div>}
      {guidedStep !== 0 && !endpoint && <>
      {guided && <Field label="连接名称 *" error={nameError}><Input ref={nameInput} aria-label="连接名称" value={value.name} maxLength={60} disabled={saving || !ops.can} onChange={value => set({ name: value })}/></Field>}
      <div className="supplier-channel-fields"><Field label="接口类型 *"><Choice label="接口类型" value={value.interfaceType} options={[[ 'unselected', '请选择接口类型' ], ...CHANNEL_INTERFACES.map(item => [item.id, workbenchProtocolLabel(item.label)])]} disabled={saving || !ops.can} onChange={interfaceType => value.baseUrl ? ops.proceed(() => set({ interfaceType, baseUrl: '', taskUrls: {}, adapterOptions: {} })) : set({ interfaceType, baseUrl: '', taskUrls: {}, adapterOptions: {} })}/></Field><Field label={value.interfaceType === 'custom' ? '完整任务地址 *' : '服务地址（Base URL） *'}><Input aria-label="服务地址" maxLength={2048} placeholder={value.interfaceType === 'custom' ? 'https://gateway.example.com/完整接口路径' : 'https://gateway.example.com/v1'} value={value.baseUrl} disabled={saving || !ops.can} onChange={value => set({ baseUrl: value })}/></Field></div>
      {suggestedRoot && <Notice>识别到完整任务地址。<Button type="tertiary" theme="borderless" onClick={() => set({ baseUrl: suggestedRoot })}>使用建议的服务地址 {suggestedRoot}</Button></Notice>}
      {provider?.sourceType === 'selfHosted' && <Field label="认证方式"><Choice label="认证方式" value={value.authMode} options={[[ 'specific', 'API 密钥' ], [ 'none', '无需认证' ]]} disabled={saving || !ops.can} onChange={authMode => { setRawKey(''); set({ authMode }); }}/></Field>}
      {provider && value.authMode !== 'none' && <div className="supplier-inline-key">{keys.length > 0 && <Field label="API 密钥"><Choice label="API 密钥来源" value={useNewKey ? 'new' : apiKeyId} options={[...keys.map(key => [key.id, providerApiKeyName(key) + '（' + maskProviderApiKey(key.maskedKey) + '）']), ['new', '输入新密钥']]} disabled={saving || !ops.can} onChange={selection => { setRawKey(''); setKeyMode(selection === 'new' ? 'new' : 'existing'); if (selection !== 'new') set({ apiKeyId: selection }); else dirty(); }}/></Field>}{useNewKey ? <Field label={keys.length ? '新 API 密钥 *' : 'API 密钥 *'}><Input mode="password" autoComplete="new-password" aria-label="API 密钥" value={rawKey} placeholder="输入服务商提供的 API 密钥" maxLength={512} disabled={saving || !ops.can} onChange={value => { setRawKey(value); setKeyMetadata(null); dirty(); }}/><small className="supplier-price-hint">保存后仅展示脱敏值。</small>{keyError && <small className="supplier-key-error" role="alert">{keyError}</small>}</Field> : !keys.some(key => key.id === apiKeyId) && <Notice error>请选择可用的 API 密钥或输入新密钥。</Notice>}</div>}
      <ChannelAdvancedFields value={value} onChange={set} disabled={saving || !ops.can}/>
      </>}
    </>}
      {guidedStep===1 && (value.newProvider || value.providerPresetId) && similarOnboardingProviders(state,value.newProvider?.name || provider?.name).length>0 && <Notice>可能已有同一服务商，请核对主体后选择复用。{similarOnboardingProviders(state,value.newProvider?.name || provider?.name).map(row=><Button key={row.id} type="tertiary" theme="borderless" onClick={()=>chooseProvider(row.id)}>{row.name} · {row.code || row.id}</Button>)}</Notice>}
      {guidedStep === 1 && provider && !provider.isDraft && <Field label="模型连接"><Choice label="模型连接" value={endpointId || 'new'} options={[[ 'new', '新建连接' ], ...supplierChannelResources(state, provider).map(row => [row.id, supplierChannelName(provider, row)])]} disabled={!ops.can} onChange={chooseChannel}/></Field>}
      {guidedStep===0 && duplicates.length>0 && <Notice>该模型已有未完成任务。{duplicates.map(task=><Button key={task.draft.id} type="tertiary" theme="borderless" onClick={()=>ops.proceed(()=>ops.go({view:'onboarding',draft:task.draft.id,step:String(task.step),section:null},{saved:true}))}>继续 {task.model?.name || task.master?.name || task.draft.rows[0]?.newModel?.name}</Button>)}</Notice>}
      {guidedStep === 0 && rows.map(row => <div className="onboarding-source-model" key={row.id}>
        <Field label="模型 *">{row.newModel ? <div className="supplier-inline-model"><Choice label="新模型类型" value={row.newModel.type} options={Object.entries(MODEL_TYPES)} disabled={!ops.can} onChange={type => setRow(row.id, { newModel: { ...row.newModel, type }, scenarios: [] })}/><Button type="tertiary" theme="borderless" disabled={!ops.can} onClick={() => setRow(row.id, { newModel: null })}>从资料库选择</Button></div> : <SupplyModelPicker ops={ops} includePresets referenceModelIds={presetFor(provider)?.catalogModelIds} state={state} value={pickerValue(row)} disabled={!ops.can} onCreateInline={() => startNewModel(row)} onChange={(id, next) => selectModel(row, id, next)}/>}</Field>

        {row.newModel && <><Field label="模型展示名称 *"><Input aria-label="新模型展示名称" value={row.newModel.name || ''} maxLength={100} onChange={value=>setRow(row.id,{newModel:{...row.newModel,name:value}})}/></Field><Field label="模型编码 *"><Input aria-label="新模型编码" value={row.newModel.modelId} maxLength={80} onChange={value=>setRow(row.id,{newModel:{...row.newModel,modelId:value}})}/></Field></>}
        {masterFor(row) && <p className="onboarding-reference">{row.newModel ? '新模型，稍后完善对外资料' : `已引用 ${masterFor(row).name} · ${MODEL_TYPES[masterFor(row).type]}`}</p>}
      </div>)}
      {guidedStep===0 && rows.some(row=>{const master=masterFor(row);return master && state.models.some(model=>model.id===master.id || model.templateId===master.id);}) && <Field label="本次目标 *"><Choice label="新增供应目标" value={intent} options={[[ 'onboard','请选择本次目标' ],['reserve','准备备用供应'],['activate','投入当前服务']]} onChange={value=>{setIntent(value);dirty();}}/></Field>}
      {guidedStep===1 && rows.map(row=>{const existing=endpoint && provider?.catalogConnections?.find(item=>item.endpointId===endpoint.id && !item.deletedAt && item.upstreamModelId===row.upstreamModelId && provider.catalogModels.some(record=>record.modelId===item.modelId && libraryRecord(state,record.libraryId)?.id===masterFor(row)?.id));return <section key={row.id} className="onboarding-form-section"><Field label="上游模型 ID *"><Input aria-label="上游模型 ID" value={row.upstreamModelId} maxLength={200} onChange={value=>setRow(row.id,{upstreamModelId:value})}/></Field><Typography.Title heading={5} component="h3">采购条件</Typography.Title>{existing?<p>复用已有模型关联，原采购报价保持不变。保存后核对当前采购条件。</p>:<SupplierPriceFields state={state} ops={ops} scenarios={row.scenarios} disabled={!ops.can} onChange={scenarios=>setRow(row.id,{scenarios})}/>}</section>;})}
    {!guided && !initialEndpoint && <Disclosure title="自动发现模型"><ChannelDiscovery state={discoveryState} provider={previewProvider} configuration={discoveryConfiguration} ops={{ ...ops, can: ops.can && (!useNewKey || Boolean(keyMetadata)) }} onAppend={discovered => { changeRows([...rows.filter(row => row.libraryId || row.modelPresetId || row.newModel || row.upstreamModelId), ...discovered]); }}/></Disclosure>}
    {initialEndpoint && <Notice>确认接入后，上游模型进入待验证状态。</Notice>}
    {directory && initialEndpoint && <Checkbox checked={approvedScope} disabled={saving || !ops.can || !selected.length}
      onChange={event => setApprovedScope(event.target.checked)}>已核对所选 {selected.length} 款模型属于采购范围</Checkbox>}
    {errors.filter(error => guided || !error.rowId).map(error => <Notice error key={error.rowId + ':' + error.field}>{error.message}</Notice>)}{ops.error && !nameError && <Notice error>{ops.error}</Notice>}
  </SupplierCreationDialog>
  {pasting && <Modal wide title="粘贴模型列表" description={discoveryDescription} onClose={() => setPasting(false)}
    footer={<><Button onClick={() => setPasting(false)}>返回</Button><Button theme="solid" disabled={!ops.can || !endpoint || !pasted.trim()} onClick={pasteRows}>带入接入草稿</Button></>}>
    <Field label="上游模型 ID"><TextArea aria-label="粘贴上游模型 ID" maxLength={10500} autosize={{ minRows: 5, maxRows: 12 }}
      placeholder="可用换行、逗号或空格分隔" value={pasted} onChange={value => { setPasted(value); setPasteError(''); }}/></Field>
    {pasteError && <Notice error>{pasteError}</Notice>}
  </Modal>}
  {discovering && endpoint && <Modal wide title="上游模型候选" description={discoveryDescription}
    onClose={() => setDiscovering(false)} footer={<Button onClick={() => setDiscovering(false)}>取消</Button>}>
    <Notice>按该服务商的采购范围勾选需要接入的模型。</Notice>
    <ChannelDiscovery state={state} provider={provider} configuration={endpoint} ops={ops} mode="attach" onAppend={discovered => {
      const retained = rows.filter(row => row.libraryId || row.modelPresetId || row.newModel || row.upstreamModelId);
      const ids = new Set(retained.map(row => row.upstreamModelId.trim()));
      const additions = discovered.filter(row => !ids.has(row.upstreamModelId));
      if (retained.length + additions.length > 50) throw Error('每批最多接入 50 款模型');
      changeRows([...retained, ...additions]);
      setDiscovering(false);
    }}/>
  </Modal>}
  </>;
}
