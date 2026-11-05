import { useEffect, useState } from 'react';
import { Button } from '../components/ui/button';
import SupplierModelMultiSelect from './SupplierModelMultiSelect';
import { Field, Choice } from './ModelMetadataForm';
import { Notice } from './ModelOperationsUI';
import SupplierCreationDialog from './SupplierCreationDialog';
import { supplierModelRegistration, registeredSupplierModelIds, supplierModelSelection } from './supplier-model-registration';
import { supplierModelChannelGroups } from './supplier-model-channel-table';
import { supplierDirectory } from './moma-provider';
import { providerApiKeysDraft } from './provider-management';
import SupplierChannelFields from './SupplierChannelFields';

export default function SupplierAddDialog({ state, provider: fixedProvider, mode, libraryId, ops, close }) {
  const [providerId, setProviderId] = useState(fixedProvider?.id || ''), [libraryIds, setLibraryIds] = useState(() => supplierModelSelection(ops.params.get('selectedModels')).filter(id=>!fixedProvider || !registeredSupplierModelIds(state,fixedProvider).includes(id)).concat(libraryId ? [libraryId] : []).filter((id,index,ids)=>ids.indexOf(id)===index));
  const [value, setValue] = useState({ modelId: '', name: '', upstreamModelId: '', baseUrl: '', protocol: 'OpenAI', keyGroupId: 'default', independent: false, scenarios: [] });
  const [rawKey, setRawKey] = useState(''), [saving, setSaving] = useState(false);
  const provider = state.providers.find(row => row.id === providerId);
  const models = provider ? supplierModelChannelGroups(state, provider).filter(row => row.modelId) : [];
  const selected = value.modelId || models.find(row => row.master?.id === libraryId)?.modelId || '';
  const disabled = !ops.can || saving || Boolean(ops.conflict);
  useEffect(() => { if (!ops.can) setRawKey(''); }, [ops.can]);
  const dirty = () => { ops.dirty(true); ops.setError(''); };
  const set = patch => { setValue(current => ({ ...current, ...patch })); dirty(); };
  const cancel = () => { if (!saving) ops.proceed(() => { setRawKey(''); close(); }); };
  const submit = async () => {
    if (disabled) return;
    setSaving(true);
    try {
      if (!provider) throw Error('请选择供应商');
      let operation, data;
      if (mode === 'model') {
        supplierModelRegistration(state, provider, libraryIds);
        operation = 'supplierModelsRegister'; data = { providerId, libraryIds };
      } else {
        if (!value.scenarios.length) throw Error('请至少添加一项采购成本，并填写计费项、采购价和单位');
        operation = 'supplierChannelRegister';
        data = { providerId, modelId: selected, name: value.name, upstreamModelId: value.upstreamModelId, baseUrl: value.baseUrl, protocol: value.protocol, scenarios: value.scenarios, authMode: value.independent ? 'independent' : 'group', keyGroupId: value.keyGroupId };
        if (value.independent) data.apiKey = (await providerApiKeysDraft([rawKey])).apiKeys[0];
      }
      if (!ops.isCurrent()) throw Error('权限或数据已有变化，请重新核对');
      if (await ops.run(operation, data)) { setRawKey(''); ops.dirty(false); close(); }
    } catch (error) { ops.setError(error.message); }
    finally { setSaving(false); }
  };
  return <SupplierCreationDialog className={`supplier-add-dialog ${mode === 'model' ? 'supplier-add-model' : ''}`} title={mode === 'model' ? '接入新模型' : '接入新渠道'} description={provider?.name || '选择供应商后填写配置'} cancel={cancel} submit={submit} disabled={disabled} action={saving ? '保存中…' : mode === 'model' ? '接入所选模型' : '保存'}>
    {!fixedProvider && <Field label="供应商 *"><Choice label="供应商" value={providerId || 'unselected'} options={[[ 'unselected', '请选择供应商' ], ...supplierDirectory(state).map(item => [item.id, item.name])]} disabled={disabled} onChange={id => { setProviderId(id); const chosen = state.providers.find(row => row.id === id); setLibraryIds(chosen && libraryId && !registeredSupplierModelIds(state, chosen).includes(libraryId) ? [libraryId] : []); setValue(current => ({ ...current, modelId: '', keyGroupId: 'default' })); setRawKey(''); dirty(); }}/></Field>}
    {mode === 'model' ? <>
      <Field label="模型 *" hint="来自模型资料 → 模型，每次最多选择 5 个"><SupplierModelMultiSelect state={state} registered={provider ? registeredSupplierModelIds(state, provider) : []} value={libraryIds} disabled={disabled || !provider} onChange={ids => { setLibraryIds(ids); dirty(); }}/></Field>
      <Button type="button" variant="link" onClick={() => { const back=new URLSearchParams({provider:providerId,perspective:'suppliers',tab:'catalogue',addingModel:'1',selectedModels:JSON.stringify(libraryIds)}); ops.go({view:'templates',template:null,returnProvider:'#/admin-2/providers?'+back},{base:'model-templates',saved:true}); }}>维护模型资料</Button>
    </> : <>
      <SupplierChannelFields ops={ops} state={state} provider={provider} models={models} value={{ ...value, modelId: selected }} rawKey={rawKey} disabled={disabled} onChange={set} onKeyChange={key => { setRawKey(key); dirty(); }}/>
    </>}
    {ops.error && <Notice error>{ops.error}</Notice>}
  </SupplierCreationDialog>;
}
