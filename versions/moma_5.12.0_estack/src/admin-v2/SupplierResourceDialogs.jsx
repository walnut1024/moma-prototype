import { useEffect, useState } from 'react';
import { Button } from '../components/ui/button';
import { Modal, Notice } from './ModelOperationsUI';
import { supplierChannelName } from './supplier-resources';
import ChannelCandidateEditor from './ChannelCandidateEditor';
import SupplierChannelFields from './SupplierChannelFields';
import SupplierCreationDialog from './SupplierCreationDialog';
import { supplierModelChannelGroups } from './supplier-model-channel-table';
import { providerApiKeysDraft } from './provider-management';
import { cataloguePriceDraft, cataloguePurchasePrice } from './provider-catalogue-pricing';
import { connectionKeys, connectionCredentialsReady } from './connection-state';
import { providerKeyGroups } from './provider-key-groups';

export function SupplierChannelDialog(props) {
  if (!props.endpoint) return <Modal title="渠道不存在" onClose={props.close}><Notice error>渠道已变化，请重新选择。</Notice></Modal>;
  return props.mode === 'info' ? <SupplierChannelInfo {...props}/> : <ChannelCandidateEditor {...props}/>;
}
function SupplierChannelInfo(props) {
  const { state, provider, endpoint, association, ops, close } = props;
  const independent = endpoint.authMode === 'specific' || !endpoint.authMode && Boolean(connectionKeys(endpoint, provider, true).length || endpoint.credentialRef);
  const preserveCurrent = !independent && endpoint.authMode !== 'group';
  const [value, setValue] = useState(() => ({ name: supplierChannelName(provider, endpoint), modelId: association?.modelId || '', upstreamModelId: association?.upstreamModelId || '', baseUrl: endpoint.baseUrl, protocol:endpoint.protocol, independent, keyGroupId: endpoint.authMode === 'group' ? endpoint.keyGroupId : preserveCurrent ? 'current' : providerKeyGroups(provider)[0]?.id || '', scenarios: cataloguePriceDraft({ scenarios: (association?.pricing?.scenarios || []).map(item => ({ ...item, listPrice: cataloguePurchasePrice(item.listPrice, association.pricing.discountFactor, item.purchasePrice), purchasePrice: undefined })) }).scenarios }));
  const [rawKey, setRawKey] = useState(''), [saving, setSaving] = useState(false), [connection, setConnection] = useState(false);
  const [base, setBase] = useState({ expectedUpdatedAt: endpoint.updatedAt, expectedProviderUpdatedAt: provider.updatedAt });
  const disabled = !ops.can || saving || Boolean(ops.conflict), addressChanged = value.baseUrl.trim() !== endpoint.baseUrl;
  const keyGroupChanged = !value.independent && value.keyGroupId !== 'current' && (endpoint.authMode !== 'group' || endpoint.keyGroupId !== value.keyGroupId);
  const protocolChanged=value.protocol!==endpoint.protocol || !endpoint.interfaceType;
  const connectionChanged = protocolChanged || addressChanged || keyGroupChanged || Boolean(rawKey.trim());
  const currentKey = independent && (connectionKeys(endpoint, provider, true).length || endpoint.credentialRef) ? '已配置' : '';
  const models = supplierModelChannelGroups(state, provider).filter(row => row.modelId);
  useEffect(() => { if (!ops.can) setRawKey(''); }, [ops.can]);
  const set = patch => { setValue(current => ({ ...current, ...patch })); ops.dirty(true); ops.setError(''); };
  const cancel = () => { if (!saving) ops.proceed(() => { setRawKey(''); close(); }); };
  const submit = async () => {
    if (disabled) return;
    setSaving(true);
    try {
      if (value.independent && !rawKey.trim() && !currentKey) throw Error('请输入独立API密钥');
      const newApiKey = value.independent && rawKey.trim() ? (await providerApiKeysDraft([rawKey])).apiKeys[0] : undefined;
      if (!ops.isCurrent()) throw Error('权限或数据已有变化，请重新核对');
      if (await ops.run('supplierChannelEdit', { ...base, providerId: provider.id, endpointId: endpoint.id, name: value.name, baseUrl: value.baseUrl, protocol:value.protocol, ...(keyGroupChanged ? { keyGroupId: value.keyGroupId } : {}), ...(newApiKey ? { newApiKey } : {}), ...(association ? { associationId: association.id, modelId: association.modelId, upstreamModelId: value.upstreamModelId } : {}) })) {
        setRawKey(''); ops.dirty(false);
        if (connectionChanged) setConnection(true); else close();
      }
    } catch (error) { ops.setError(error.message); }
    finally { setSaving(false); }
  };
  if (connection) return <ChannelCandidateEditor {...props} mode="all"/>;
  return <SupplierCreationDialog className="supplier-add-dialog mo-drawer mo-drawer-left supplier-channel-edit-drawer" title="编辑渠道" description={provider.name} cancel={cancel} submit={submit} disabled={disabled} action={saving ? '保存中…' : '保存'}>
    <Notice>连接、协议及密钥由此渠道关联的 {provider.catalogConnections?.filter(row=>row.endpointId===endpoint.id).length || 1} 个模型共用；上游模型标识仅修改当前模型，采购成本在模型成本中维护。</Notice>
    <SupplierChannelFields state={state} provider={provider} models={models} value={value} rawKey={rawKey} disabled={disabled} editing currentKey={currentKey} ops={ops} current={preserveCurrent ? { name: '保留当前密钥配置', ready: connectionCredentialsReady(endpoint, provider) } : null} onSharedKeySaved={next => setBase({ expectedUpdatedAt: next.endpoints.find(row => row.id === endpoint.id).updatedAt, expectedProviderUpdatedAt: next.providers.find(row => row.id === provider.id).updatedAt })} onChange={set} onKeyChange={key => { setRawKey(key); ops.dirty(true); ops.setError(''); }}>
      {!endpoint.interfaceType && <Notice>请确认上游协议和 API 地址，保存后测试连接配置。</Notice>}
    </SupplierChannelFields>
    {connectionChanged && <Notice>协议、地址或密钥变更须测试后应用，验证前继续使用当前配置。</Notice>}
    {endpoint.candidateConfiguration && <Button type="button" variant="outline" disabled={disabled} onClick={() => ops.proceed(() => { setRawKey(''); setConnection(true); })}>继续验证连接配置</Button>}
    {ops.error && <Notice error>{ops.error}</Notice>}
  </SupplierCreationDialog>;
}
