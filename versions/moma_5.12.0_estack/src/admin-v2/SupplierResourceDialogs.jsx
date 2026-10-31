import { useState } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import SupplierCreationDialog from './SupplierCreationDialog';
import { supplierDirectory } from './moma-provider';
import SupplyModelPicker from './SupplyModelPicker';
import { Choice, Field } from './ModelMetadataForm';
import { Modal, Notice } from './ModelOperationsUI';
import { supplierChannelCode } from './supplier-resources';
import ChannelCandidateEditor from './ChannelCandidateEditor';
import ProcurementVersionEditor from './ProcurementVersionEditor';

export function SupplierModelEditor({ state, provider, ops, close, onBatch }) {
  const [libraryId, setLibraryId] = useState(''), [providerId, setProviderId] = useState(provider?.id || 'unselected');
  const providers = supplierDirectory(state).filter(row => !row.id.startsWith('service-review-provider-'));
  const change = setter => value => { setter(value); ops.dirty(true); ops.setError(''); };
  return <SupplierCreationDialog title="添加模型" description="从统一模型资料库选择模型，并关联供应商。" cancel={() => ops.proceed(close)} disabled={!ops.can || !libraryId || !providers.some(row => row.id === providerId)} action="登记模型" submit={() => { if (ops.run('provider', { operation: 'supplierModelAdd', objectId: providerId, values: { libraryId } })) close(libraryId); }}>
    <div className="supplier-channel-fields"><Field label="模型 *"><SupplyModelPicker ops={ops} state={state} value={libraryId} disabled={!ops.can} onChange={change(setLibraryId)}/></Field><Field label="供应商 *"><Choice label="供应商" value={providerId} options={[[ 'unselected', '请选择供应商' ], ...providers.map(row => [row.id, row.name])]} disabled={!ops.can} onChange={change(setProviderId)}/></Field></div>
    <p className="supplier-price-hint">登记该供应商提供的模型，可稍后添加渠道。接入调用可直接使用「添加渠道」。{onBatch && <Button type="button" variant="link" disabled={!ops.can || !providers.some(row => row.id === providerId)} onClick={() => ops.proceed(() => onBatch(providerId))}>批量添加模型</Button>}</p>
    {ops.error && <Notice error>{ops.error}</Notice>}
  </SupplierCreationDialog>;
}


export function SupplierChannelDialog(props) {
  if (!props.endpoint) return <Modal title="渠道不存在" onClose={props.close}><Notice error>渠道已变化，请重新选择。</Notice></Modal>;
  return props.mode === 'info' ? <SupplierChannelInfo {...props}/> : <ChannelCandidateEditor {...props}/>;
}
function SupplierChannelInfo({ provider, endpoint, ops, close }) {
  const [name, setName] = useState(endpoint.name);
  return <Modal title="渠道信息" description={provider.name} onClose={() => ops.proceed(close)}><form className="supplier-resource-form" onSubmit={event => { event.preventDefault(); event.stopPropagation(); if (ops.run('provider', { operation: 'supplierChannelSave', objectId: provider.id, values: { mode: 'info', endpointId: endpoint.id, name } })) close(); }}><Field label="渠道 ID"><Input aria-label="渠道 ID" value={supplierChannelCode(endpoint)} readOnly/></Field><Field label="渠道名称 *"><Input aria-label="渠道名称" maxLength={60} value={name} disabled={!ops.can} onChange={event => { setName(event.target.value); ops.dirty(true); ops.setError(''); }}/></Field>{ops.error && <Notice error>{ops.error}</Notice>}<div className="supplier-key-actions"><Button variant="outline" type="button" onClick={() => ops.proceed(close)}>取消</Button><Button type="submit" disabled={!ops.can}>保存渠道信息</Button></div></form></Modal>;
}
export function SupplierAssociationDialog(props) { return <ProcurementVersionEditor {...props}/>; }
