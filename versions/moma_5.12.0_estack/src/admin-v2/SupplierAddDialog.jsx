import { useEffect, useState } from 'react';
import { Button } from '@douyinfe/semi-ui';
import SupplierModelMultiSelect from './SupplierModelMultiSelect';
import { Field, Choice } from './ServiceUI';
import { Notice } from './ModelOperationsUI';
import SupplierCreationDialog from './SupplierCreationDialog';
import { supplierModelRegistration, registeredSupplierModelIds, supplierModelSelection } from './supplier-model-registration';
import { supplierModelChannelGroups } from './supplier-model-channel-table';
import { supplierDirectory } from './moma-provider';
import { libraryRecord } from './model-library';
import { providerApiKeysDraft } from './provider-management';
import SupplierChannelFields from './SupplierChannelFields';
import { supplierBaseUrls } from './supplier-resources';

export default function SupplierAddDialog({ state, provider: fixedProvider, mode, libraryId, modelLocked, ops, close, onChannelSaved }) {
  const [providerId, setProviderId] = useState(fixedProvider?.id || ''), [libraryIds, setLibraryIds] = useState(() => supplierModelSelection(ops.params.get('selectedModels')).filter(id=>!fixedProvider || !registeredSupplierModelIds(state,fixedProvider).includes(id)).concat(libraryId ? [libraryId] : []).filter((id,index,ids)=>ids.indexOf(id)===index));
  const [value, setValue] = useState({ modelId: '', name: '自营', upstreamModelId: '', baseUrl: supplierBaseUrls(state, fixedProvider)[0] || '', interfaceType: 'openai', protocol: 'OpenAI', keyGroupId: 'default', independent: false, scenarios: [] });
  const [rawKey, setRawKey] = useState(''), [saving, setSaving] = useState(false),[stage,setStage]=useState(mode),[registered,setRegistered]=useState(null);
  const provider = state.providers.find(row => row.id === providerId);
  const currentModel = modelLocked ? libraryRecord(state, libraryId) : null;
  const models = provider ? supplierModelChannelGroups(state, provider).filter(row =>
    row.modelId && (!modelLocked || row.master?.id===libraryId)) : [];
  const suppliers = fixedProvider ? [] : supplierDirectory(state).filter(row =>
    !modelLocked || registeredSupplierModelIds(state,row).includes(libraryId));
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
      if (!provider) throw Error('请选择服务商');
      let operation, data;
      if (stage === 'model') {
        supplierModelRegistration(state, provider, libraryIds);
        operation = 'supplierModelsRegister'; data = { providerId, libraryIds };
      } else {
        if (!models.some(row=>row.modelId===selected)) throw Error('请选择当前服务商已登记的模型');
        operation = 'supplierChannelRegister';
        data = { providerId, modelId: selected, name: value.name, upstreamModelId: value.upstreamModelId, baseUrl: value.baseUrl, protocol: value.protocol, interfaceType: value.interfaceType, scenarios: [], authMode: value.independent ? 'independent' : 'group', keyGroupId: value.keyGroupId };
        if (value.independent) data.apiKey = (await providerApiKeysDraft([rawKey])).apiKeys[0];
      }
      if (!ops.isCurrent()) throw Error('权限或数据已有变化，请重新核对');
      const next=await ops.run(operation,data);
      if (next) {
        setRawKey('');
        ops.dirty(false);
        if (stage==='model') setRegistered(libraryIds);
        else if (onChannelSaved) onChannelSaved(next,{
          providerId,endpointId:next.audits[0].objectId,modelId:selected,upstreamModelId:value.upstreamModelId.trim(),
        });
        else close();
      }
    } catch (error) { ops.setError(error.message); }
    finally { setSaving(false); }
  };
  return <SupplierCreationDialog className={`supplier-add-dialog ${stage === 'model' ? 'supplier-add-model' : ''}`} title={stage === 'model' ? '接入新模型' : '新增接入'} description={currentModel?.name || provider?.name || '选择服务商后填写配置'} cancelLabel={registered?'关闭':'取消'} cancel={cancel} submit={submit} disabled={disabled || modelLocked && !provider} footer={registered && <Button onClick={()=>{const group=models.find(row=>registered.includes(row.master?.id));setValue(current=>({...current,modelId:group?.modelId || ''}));setStage('channel');setRegistered(null);}}>继续接入渠道</Button>} action={registered?null:saving ? '保存中…' : stage === 'model' ? '接入所选模型' : '保存'}>
    {modelLocked && !suppliers.length && <Notice>请先在「渠道管理」登记该模型的供应服务商。</Notice>}
    {!fixedProvider && <Field label="服务商 *"><Choice label="服务商" value={providerId || 'unselected'} options={[[ 'unselected', '请选择服务商' ], ...suppliers.map(item => [item.id, item.name])]} disabled={disabled} onChange={id => { setProviderId(id); const chosen = state.providers.find(row => row.id === id); setLibraryIds(chosen && libraryId && !registeredSupplierModelIds(state, chosen).includes(libraryId) ? [libraryId] : []); setValue(current => ({ ...current, modelId: '', keyGroupId: 'default', baseUrl: supplierBaseUrls(state, chosen)[0] || '' })); setRawKey(''); dirty(); }}/></Field>}
    {registered?<Notice>已接入 {registered.length} 个模型。可继续配置渠道，或关闭后稍后维护。</Notice>:stage === 'model' ? <>
      <Field label="模型 *" hint="来自模型资料 → 模型，每次最多选择 5 个"><SupplierModelMultiSelect state={state} registered={provider ? registeredSupplierModelIds(state, provider) : []} value={libraryIds} disabled={disabled || !provider} onChange={ids => { setLibraryIds(ids); dirty(); }}/></Field>
      <Button theme="borderless" type="tertiary" onClick={() => { const back=new URLSearchParams({provider:providerId,perspective:'suppliers',tab:'catalogue',addingModel:'1',selectedModels:JSON.stringify(libraryIds)}); ops.go({view:'templates',template:null,returnProvider:'#/admin-2/providers?'+back},{base:'model-templates',saved:true}); }}>维护模型资料</Button>
    </> : <SupplierChannelFields hideModel={modelLocked} ops={ops} state={state} provider={provider} models={models} value={{ ...value, modelId: selected }} rawKey={rawKey} disabled={disabled} onChange={set} onKeyChange={key => { setRawKey(key); dirty(); }}/>}
    {ops.error && <Notice error>{ops.error}</Notice>}
  </SupplierCreationDialog>;
}
