import { useState } from 'react';
import SupplierCreationDialog from './SupplierCreationDialog';
import { ProviderFields, emptyProvider, Notice } from './ModelOperationsUI';
import { providerCode } from './provider-management';

export default function SupplierProfileDialog({ provider, ops, done, cancel, discardConfirmation }) {
  const [value, setValue] = useState(() => provider ? { ...emptyProvider(), ...provider, code: providerCode(provider) } : emptyProvider());
  return <SupplierCreationDialog title={provider ? '编辑供应商' : '添加供应商'} description="登记供应商主体资料，渠道接入与密钥在添加后配置。" cancel={discardConfirmation ? discardConfirmation.continueEditing : cancel} cancelLabel={discardConfirmation ? '继续编辑' : '取消'} disabled={!discardConfirmation && !ops.can} action={discardConfirmation ? '放弃修改' : '保存供应商'} submit={async () => {
    if (discardConfirmation) { discardConfirmation.discard(); return; }
    const next = await ops.run('provider', { operation: provider ? 'profile' : 'create', objectId: provider?.id, values: value });
    if (next) done(next, provider?.id || next.audits[0].objectId);
  }}>{discardConfirmation ? <Notice>放弃未保存的供应商资料？</Notice> : <ProviderFields value={value} editing={Boolean(provider)} disabled={!ops.can} onChange={next => { setValue(next); ops.setError(''); ops.dirty(true); }}/>} {!discardConfirmation && ops.error && <Notice error>{ops.error}</Notice>}</SupplierCreationDialog>;
}
