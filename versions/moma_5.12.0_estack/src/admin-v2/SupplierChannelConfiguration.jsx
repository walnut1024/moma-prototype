import { SupplierKeyGroupField } from './SupplierKeyGroupField';
import SupplierChannelTest from './SupplierChannelTest';
import { catalogueChannels, modelApiExample } from './provider-channels';
import { useState } from 'react';
import { Input } from '../components/ui/input';
import SupplierCreationDialog from './SupplierCreationDialog';
import { Choice, Field } from './ModelMetadataForm';
import { Notice } from './ModelOperationsUI';
import { supplierDirectory } from './moma-provider';
import { libraryRecord } from './model-library';
import SupplyModelPicker from './SupplyModelPicker';
import SupplierPriceFields from './SupplierPriceFields';

export default function SupplierChannelConfiguration({ state, provider: initialProvider, libraryId = '', ops, close }) {
  const [value, setValue] = useState({ libraryId, providerId: initialProvider?.id || 'unselected', name: '', upstreamModelId: libraryRecord(state, libraryId)?.modelId || '', baseUrl: '', keyGroupId: 'default', scenarios: [] });
  const [saved, setSaved] = useState(null);
  const providers = supplierDirectory(state).filter(row => !row.id.startsWith('service-review-provider-'));
  const provider = providers.find(row => row.id === value.providerId), master = libraryRecord(state, value.libraryId);
  const disabled = !ops.can || !master || !provider;
  const set = patch => { setValue(current => ({ ...current, ...patch })); ops.dirty(true); ops.setError(''); };
  const changeContext = patch => ops.proceed(() => { setValue(current => ({ ...current, ...patch, name: '', baseUrl: '', keyGroupId: 'default', scenarios: [] })); ops.dirty(false); ops.setError(''); });
  const cancel = () => ops.proceed(close);
  if (saved) {
    const owner = state.providers.find(row => row.id === saved.providerId);
    const association = catalogueChannels(state, owner, saved.modelId).find(row => row.endpointId === saved.endpointId);
    return <SupplierChannelTest state={state} provider={owner} association={association} ops={ops} close={() => close(master.id)} />;
  }
  return <SupplierCreationDialog title="添加渠道" description="选择统一模型资料与供应商，配置新的供应渠道。" cancel={cancel} disabled={disabled} action="保存渠道" submit={() => { const next = ops.run('provider', { operation: 'supplierChannelCreate', objectId: provider.id, values: { ...value, protocol: ['text', 'multimodal', 'embedding', 'rerank'].includes(master.type) ? 'OpenAI' : '其他' } }); if (next) { const endpoint = next.endpoints.find(row => row.providerId === provider.id && row.name === value.name.trim() && !row.deletedAt); const owner = next.providers.find(row => row.id === provider.id); const association = owner.catalogConnections.find(row => row.endpointId === endpoint.id && !row.deletedAt); setSaved({ providerId: provider.id, endpointId: endpoint.id, modelId: association.modelId }); } }}>
        <div className="supplier-channel-fields"><Field label="模型 *"><SupplyModelPicker ops={ops} state={state} value={value.libraryId} disabled={!ops.can} onChange={libraryId => { if (libraryId !== value.libraryId) changeContext({ libraryId, upstreamModelId: libraryRecord(state, libraryId)?.modelId || '' }); }}/></Field><Field label="供应商 *"><Choice label="供应商" value={value.providerId} options={[['unselected', '请选择供应商'], ...providers.map(row => [row.id, row.name])]} disabled={!ops.can} onChange={providerId => { if (providerId !== value.providerId) changeContext({ providerId }); }}/></Field></div>
        <div className="supplier-channel-fields"><Field label="渠道名称 *"><Input aria-label="渠道名称" value={value.name} placeholder="请输入新渠道名称" maxLength={60} disabled={disabled} onChange={event => set({ name: event.target.value })}/></Field><Field label="渠道 ID"><Input aria-label="渠道 ID" value="保存后自动生成" readOnly/></Field></div>
        <div className="supplier-channel-fields"><Field label="上游模型 ID *"><Input aria-label="上游模型 ID" maxLength={200} value={value.upstreamModelId} disabled={disabled} onChange={event => set({ upstreamModelId: event.target.value })}/></Field>{provider ? <SupplierKeyGroupField ops={ops} state={state} provider={provider} value={value.keyGroupId} disabled={disabled} onChange={keyGroupId => set({ keyGroupId })}/> : <Field label="API 密钥组"><Input value="请先选择供应商" disabled readOnly/></Field>}</div>
        <Field label="API 地址 *"><Input aria-label="渠道 API 地址" maxLength={2048} placeholder={modelApiExample(master?.type)} value={value.baseUrl} disabled={disabled} onChange={event => set({ baseUrl: event.target.value })}/></Field>
        <SupplierPriceFields ops={ops} state={state} scenarios={value.scenarios} disabled={disabled} onChange={scenarios => set({ scenarios })}/>
        {ops.error && <Notice error>{ops.error}</Notice>}
  </SupplierCreationDialog>;
}
