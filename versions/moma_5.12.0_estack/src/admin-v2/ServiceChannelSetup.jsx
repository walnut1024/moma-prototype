import { useState } from 'react';
import { Button } from '../components/ui/button';
import { Modal, Notice } from './ModelOperationsUI';
import { Choice, Field } from './ModelMetadataForm';
import SupplierProfileDialog from './SupplierProfileDialog';
import SupplierAddDialog from './SupplierAddDialog';
import SupplierChannelBatchTest from './SupplierChannelBatchTest';
import { supplierDirectory } from './moma-provider';
import { registeredSupplierModelIds } from './supplier-model-registration';
import { supplierChannelAssociations } from './supplier-resources';
import { libraryRecord } from './model-library';

export default function ServiceChannelSetup({ state, service, ops, close, onRoute }) {
  const [providerId, setProviderId] = useState(service.providerId || ''), [stage, setStage] = useState(service.providerId ? 'channel' : 'provider'), [creating, setCreating] = useState(false), [saved, setSaved] = useState(null);
  const provider = state.providers.find(row => row.id === providerId), master = libraryRecord(state, service.modelId);
  const cancel = () => ops.proceed(close);
  if (!master || stage !== 'provider' && !provider) return <Modal title="接入信息已变化" onClose={cancel}><Notice error>模型资料或供应商已变化，请关闭后重新选择。</Notice></Modal>;
  if (creating) return <SupplierProfileDialog ops={ops} cancel={() => ops.proceed(() => setCreating(false))} done={(next, id) => {setProviderId(id);setCreating(false);}}/>;
  if (stage === 'provider') return <Modal title="选择渠道供应商" description={master.name} onClose={cancel}><Field label="供应商"><Choice label="渠道供应商" value={providerId || 'none'} options={[['none','请选择供应商'],...supplierDirectory(state).map(row=>[row.id,row.name])]} disabled={!ops.can} onChange={id=>setProviderId(id==='none'?'':id)}/></Field><Button variant="link" disabled={!ops.can} onClick={()=>setCreating(true)}>新增供应商</Button><div className="mo-footer"><Button variant="outline" onClick={cancel}>取消</Button><Button disabled={!ops.can || !provider} onClick={()=>setStage('channel')}>继续接入</Button></div></Modal>;
  if (!saved) return <SupplierAddDialog modelLocked state={state} provider={provider} libraryId={master.id} mode={registeredSupplierModelIds(state,provider).includes(master.id)?'channel':'model'} ops={ops} close={cancel} onSaved={(next, record)=>{const current=next.providers.find(row=>row.id===record.providerId);const association=supplierChannelAssociations(next,current,record.endpointId).find(row=>row.modelId===record.modelId);setSaved({...record,associationIds:[association.id]});}}/>;
  return <Modal wide title="检测并启用渠道" description={`${master.name} · ${provider.name}`} onClose={cancel}><SupplierChannelBatchTest state={state} provider={provider} endpointId={saved.endpointId} associationIds={saved.associationIds} ops={ops} close={cancel} embedded continueLabel="返回配置路由" onContinue={onRoute}/></Modal>;
}
