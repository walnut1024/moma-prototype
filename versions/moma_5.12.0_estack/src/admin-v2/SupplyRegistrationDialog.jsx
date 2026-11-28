import { useChannelText } from './channel-language';
import { useState } from 'react';
import { Button, Typography } from './xa24/HaloUI.jsx';
import { AdminModal } from './AdminOverlay';
import { Choice, Field, Notice } from './ServiceUI';
import SupplierModelMultiSelect from './SupplierModelMultiSelect';
import { registeredSupplierModelIds } from './supplier-model-registration';
import { materialProviders } from './provider-materials';

export default function SupplyRegistrationDialog({ state, ops, provider, model, close }) {
  const translateLabel = useChannelText();
  const [providerId, setProviderId] = useState(provider?.id || '');
  const [selected, setSelected] = useState([]);
  const [saving, setSaving] = useState(false);
  const providers = materialProviders(state);
  const current = provider || providers.find(row => row.id === providerId);
  const registered = current ? registeredSupplierModelIds(state, current) : [];
  const libraryIds = model ? [model.id] : selected;
  const exists = libraryIds.some(id => registered.includes(id));
  const submit = async () => {
    setSaving(true);
    try { if (await ops.run('supplierModelsRegister', { providerId, libraryIds })) close(); }
    finally { setSaving(false); }
  };
  return <AdminModal visible centered title={model ? '添加供应服务商' : '添加供应模型'} width="min(660px, calc(100vw - 32px))" onCancel={() => !saving && close()}
    footer={<><Button onClick={close} disabled={saving}>{translateLabel("取消")}</Button><Button theme="solid" loading={saving}
      disabled={!ops.can || saving || !current || !libraryIds.length || exists} onClick={submit}>添加</Button></>}>
    {model ? <>
      <Typography.Paragraph>{model.name}</Typography.Paragraph>
      <Field label="服务商" required>
        <Choice label="服务商" placeholder={translateLabel("请选择服务商")} filter value={providerId || undefined}
          options={providers.map(row => [row.id, registeredSupplierModelIds(state, row).includes(model.id) ? row.name + '（已关联）' : row.name])}
          disabled={saving} onChange={value => { setProviderId(value); ops.setError(''); }}/>
      </Field>
    </> : <SupplierModelMultiSelect state={state} value={selected} registered={registered} onChange={setSelected} disabled={saving || !ops.can}/>}
    {ops.error && <Notice error>{ops.error}</Notice>}
  </AdminModal>;
}
