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
  const [rawKey, setRawKey] = useState(''), [saving, setSaving] = useState(false),[stage,setStage]=useState(mode),[registered,setRegistered]=useState(null),[endpointId,setEndpointId]=useState('');
  const provider = state.providers.find(row => row.id === providerId);
  const models = provider ? supplierModelChannelGroups(state, provider).filter(row => row.modelId) : [];
  const connections=state.endpoints.filter(row=>row.providerId===providerId && !row.deletedAt && !row.candidateConfiguration);
  const reused=connections.find(row=>row.id===endpointId);
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
        operation = 'supplierChannelRegister';
        data = { providerId, modelId: selected, name: value.name, upstreamModelId: value.upstreamModelId, baseUrl: value.baseUrl, protocol: value.protocol, scenarios: [], authMode: value.independent ? 'independent' : 'group', keyGroupId: value.keyGroupId };
        if(reused)data={providerId,modelId:selected,upstreamModelId:value.upstreamModelId,scenarios:[],endpointId:reused.id,expectedEndpointUpdatedAt:reused.updatedAt};
        else if (value.independent) data.apiKey = (await providerApiKeysDraft([rawKey])).apiKeys[0];
      }
      if (!ops.isCurrent()) throw Error('权限或数据已有变化，请重新核对');
      const next=await ops.run(operation,data);
      if(next){setRawKey('');ops.dirty(false);if(stage==='model')setRegistered(libraryIds);else close();}
    } catch (error) { ops.setError(error.message); }
    finally { setSaving(false); }
  };
  return <SupplierCreationDialog className={`supplier-add-dialog ${stage === 'model' ? 'supplier-add-model' : ''}`} title={stage === 'model' ? '接入新模型' : '接入新渠道'} description={provider?.name || '选择服务商后填写配置'} cancelLabel={registered?'关闭':'取消'} cancel={cancel} submit={submit} disabled={disabled} footer={registered && <Button type="button" onClick={()=>{const group=models.find(row=>registered.includes(row.master?.id));setValue(current=>({...current,modelId:group?.modelId || ''}));setStage('channel');setRegistered(null);}}>继续接入渠道</Button>} action={registered?null:saving ? '保存中…' : stage === 'model' ? '接入所选模型' : '保存'}>
    {!fixedProvider && <Field label="服务商 *"><Choice label="服务商" value={providerId || 'unselected'} options={[[ 'unselected', '请选择服务商' ], ...supplierDirectory(state).map(item => [item.id, item.name])]} disabled={disabled} onChange={id => { setProviderId(id);setEndpointId(''); const chosen = state.providers.find(row => row.id === id); setLibraryIds(chosen && libraryId && !registeredSupplierModelIds(state, chosen).includes(libraryId) ? [libraryId] : []); setValue(current => ({ ...current, modelId: '', keyGroupId: 'default' })); setRawKey(''); dirty(); }}/></Field>}
    {registered?<Notice>已接入 {registered.length} 个模型。可继续配置渠道，或关闭后稍后维护。</Notice>:stage === 'model' ? <>
      <Field label="模型 *" hint="来自模型资料 → 模型，每次最多选择 5 个"><SupplierModelMultiSelect state={state} registered={provider ? registeredSupplierModelIds(state, provider) : []} value={libraryIds} disabled={disabled || !provider} onChange={ids => { setLibraryIds(ids); dirty(); }}/></Field>
      <Button type="button" variant="link" onClick={() => { const back=new URLSearchParams({provider:providerId,perspective:'suppliers',tab:'catalogue',addingModel:'1',selectedModels:JSON.stringify(libraryIds)}); ops.go({view:'templates',template:null,returnProvider:'#/admin-2/providers?'+back},{base:'model-templates',saved:true}); }}>维护模型资料</Button>
    </> : <>
      <Field label="连接方式"><Choice label="连接方式" value={endpointId || 'new'} options={[[ 'new','新建连接'],...connections.filter(row=>!models.find(item=>item.modelId===selected)?.channels.some(channel=>channel.endpointId===row.id)).map(row=>[row.id,'复用：'+row.name])]} disabled={disabled} onChange={id=>{setEndpointId(id==='new'?'':id);const endpoint=connections.find(row=>row.id===id);if(endpoint)set({name:endpoint.name,baseUrl:endpoint.baseUrl,protocol:endpoint.protocol});else dirty();setRawKey('');}}/></Field>
      {reused && <Notice>复用当前服务商的连接和密钥，新增当前模型的上游标识。</Notice>}
      <SupplierChannelFields connectionReadOnly={Boolean(reused)} ops={ops} state={state} provider={provider} models={models} value={{ ...value, modelId: selected }} rawKey={rawKey} disabled={disabled} onChange={set} onKeyChange={key => { setRawKey(key); dirty(); }}/>
    </>}
    {ops.error && <Notice error>{ops.error}</Notice>}
  </SupplierCreationDialog>;
}
