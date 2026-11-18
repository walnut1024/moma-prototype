import { useEffect, useState } from 'react';
import { Banner, Button, Descriptions } from '@douyinfe/semi-ui';
import { CopyId, Modal, Notice } from './ModelOperationsUI';
import { supplierChannelCode, supplierChannelName, supplierChannelReadiness } from './supplier-resources';
import ChannelCandidateEditor from './ChannelCandidateEditor';
import SupplierChannelBatchTest from './SupplierChannelBatchTest';
import SupplierChannelFields from './SupplierChannelFields';
import SupplierCreationDialog from './SupplierCreationDialog';
import { channelManagementDirectory, supplierModelChannelGroups } from './supplier-model-channel-table';
import { providerApiKeysDraft } from './provider-management';
import { connectionKeys, connectionCredentialsReady } from './connection-state';
import { providerKeyGroups } from './provider-key-groups';
import { CHANNEL_INTERFACES } from './channel-interface';

export function SupplierChannelDialog(props) {
  if (!props.endpoint) return <Modal title="渠道不存在" onClose={props.close}><Notice error>渠道已变化，请重新选择。</Notice></Modal>;
  if (props.mode === 'details') return <SupplierConnectionDetails {...props}/>;
  return props.mode === 'info' ? <SupplierChannelInfo {...props}/> : <ChannelCandidateEditor {...props}/>;
}
function SupplierConnectionDetails({ state, provider, endpoint, close }) {
  const models = channelManagementDirectory(state, [provider]).byProvider.get(provider.id).filter(group => group.modelId && group.channels.some(channel => channel.endpointId === endpoint.id));
  const authLabel = { none: '无需认证', inherit: '服务商默认密钥', group: '服务商密钥组', specific: '渠道专属密钥', pool: '密钥池' }[endpoint.authMode] || '当前密钥配置';
  return <Modal drawer wide title="连接详情" description={provider.name} onClose={close}
    footer={<Button onClick={close}>关闭</Button>}>
    <Descriptions align="left" data={[
      { key: '连接名称', value: supplierChannelName(provider, endpoint) },
      { key: '连接 ID', value: <CopyId value={endpoint.id} label="连接 ID"/> },
      { key: '连接编码', value: supplierChannelCode(endpoint) },
      { key: 'Base URL', value: endpoint.baseUrl ? <CopyId value={endpoint.baseUrl} label="Base URL"/> : '—' },
      { key: '协议', value: endpoint.protocol || '—' },
      { key: '接口类型', value: CHANNEL_INTERFACES.find(row => row.id === endpoint.interfaceType)?.label || '—' },
      { key: '连接状态', value: endpoint.frozen ? '已冻结' : supplierChannelReadiness(endpoint, provider).label },
      { key: '关联模型', value: models.length },
      { key: '认证方式', value: authLabel },
      { key: 'API 密钥组', value: providerKeyGroups(provider).find(group => group.id === endpoint.keyGroupId)?.name || '—', hidden: endpoint.authMode !== 'group' },
      { key: '密钥状态', value: connectionCredentialsReady(endpoint, provider) ? '已配置' : '未配置', hidden: endpoint.authMode === 'none' },
      { key: '请求超时（秒）', value: endpoint.timeoutSeconds ?? '—' },
      { key: '账号请求上限（RPM）', value: endpoint.capacity ?? '—' },
      { key: '配置版本', value: endpoint.configurationRevision || 0 },
    ]}/>
  </Modal>;
}
function SupplierChannelInfo(props) {
  const { state, provider, endpoint, association, ops, close } = props;
  const independent = endpoint.authMode === 'specific' || !endpoint.authMode && Boolean(connectionKeys(endpoint, provider, true).length || endpoint.credentialRef);
  const preserveCurrent = !independent && endpoint.authMode !== 'group';
  const currentName = association ? association.sourceName || association.name : supplierChannelName(provider, endpoint);
  const [value, setValue] = useState(() => ({
    name: currentName, modelId: association?.modelId || '',
    upstreamModelId: association?.upstreamModelId || '', baseUrl: endpoint.baseUrl,
    protocol: endpoint.protocol, interfaceType: endpoint.interfaceType || CHANNEL_INTERFACES.find(row=>row.protocol===endpoint.protocol)?.id || '', independent,
    keyGroupId: endpoint.authMode === 'group' ? endpoint.keyGroupId : preserveCurrent ? 'current' : providerKeyGroups(provider)[0]?.id || '',
  }));
  const [rawKey, setRawKey] = useState(''), [saving, setSaving] = useState(false), [panel, setPanel] = useState('configuration');
  const [base, setBase] = useState({ expectedUpdatedAt: endpoint.updatedAt, expectedProviderUpdatedAt: provider.updatedAt });
  const disabled = !ops.can || saving || Boolean(ops.conflict), addressChanged = value.baseUrl.trim() !== endpoint.baseUrl;
  const keyGroupChanged = !value.independent && Boolean(value.keyGroupId) && value.keyGroupId !== 'current'
    && (endpoint.authMode !== 'group' || endpoint.keyGroupId !== value.keyGroupId);
  const credentialsChanged = value.independent !== independent || keyGroupChanged || Boolean(value.independent && rawKey.trim());
  const connectionChanged = value.interfaceType !== (endpoint.interfaceType || CHANNEL_INTERFACES.find(row=>row.protocol===endpoint.protocol)?.id || '') || value.protocol !== endpoint.protocol || addressChanged || credentialsChanged;
  const prepareTest = connectionChanged || !endpoint.interfaceType;
  const currentKey = independent && connectionCredentialsReady(endpoint, provider) ? '已配置' : '';
  const needsKey = value.independent ? !rawKey.trim() && !currentKey : !value.keyGroupId;
  const candidate = endpoint.candidateConfiguration;
  const syncBase = next => setBase({
    expectedUpdatedAt: next.endpoints.find(row => row.id === endpoint.id).updatedAt,
    expectedProviderUpdatedAt: next.providers.find(row => row.id === provider.id).updatedAt,
  });
  const details = association
    ? { name: supplierChannelName(provider, endpoint), sourceName: value.name, associationId: association.id, modelId: association.modelId, upstreamModelId: value.upstreamModelId }
    : { name: value.name };
  const detailsChanged = value.name.trim() !== currentName || Boolean(association && value.upstreamModelId.trim() !== association.upstreamModelId);
  const models = supplierModelChannelGroups(state, provider).filter(row => row.modelId);
  useEffect(() => { if (!ops.can) setRawKey(''); }, [ops.can]);
  const set = patch => { setValue(current => ({ ...current, ...patch })); ops.dirty(true); ops.setError(''); };
  const cancel = () => { if (!saving) ops.proceed(() => { setRawKey(''); close(); }); };
  const openPanel = next => ops.proceed(() => { setRawKey(''); ops.setError(''); setPanel(next); });
  const testConnectivity = async () => {
    if (disabled) return;
    if (candidate) { openPanel('candidate'); return; }
    if (!prepareTest) { openPanel('test'); return; }
    setSaving(true);
    try {
      if (needsKey) throw Error(value.independent ? '请输入渠道专属密钥' : '请选择 API 密钥组');
      const newApiKey = value.independent && rawKey.trim() ? (await providerApiKeysDraft([rawKey])).apiKeys[0] : undefined;
      if (!ops.isCurrent()) throw Error('权限或数据已有变化，请重新核对');
      const next = await ops.run('supplierChannelEdit', {
        ...base, providerId: provider.id, endpointId: endpoint.id,
        ...(detailsChanged ? details : association ? { associationId: association.id, modelId: association.modelId } : {}),
        prepareConnection: true, baseUrl: value.baseUrl, protocol: value.protocol, interfaceType: value.interfaceType,
        ...(keyGroupChanged ? { keyGroupId: value.keyGroupId } : {}),
        ...(newApiKey ? { newApiKey } : {}),
      });
      if (!next) return;
      syncBase(next);
      ops.dirty(detailsChanged);
      setRawKey('');
      setPanel('candidate');
    } catch (error) { ops.setError(error.message); }
    finally { setSaving(false); }
  };
  const submit = async () => {
    if (disabled || connectionChanged || candidate) return;
    setSaving(true);
    try {
      if (!ops.isCurrent()) throw Error('权限或数据已有变化，请重新核对');
      if (await ops.run('supplierChannelEdit', { ...base, ...details, providerId: provider.id, endpointId: endpoint.id, baseUrl: endpoint.baseUrl })) close();
    } catch (error) { ops.setError(error.message); }
    finally { setSaving(false); }
  };
  if (panel === 'candidate') return <ChannelCandidateEditor {...props} mode="all" saveOnApply
    channelDetails={detailsChanged ? details : undefined}
    baseProviderUpdatedAt={base.expectedProviderUpdatedAt} onSharedKeySaved={syncBase}/>;
  if (panel === 'test') return <SupplierChannelBatchTest state={state} provider={provider} endpointId={endpoint.id} associationIds={[association.id]} ops={ops} close={close}/>;
  return <SupplierCreationDialog className="supplier-add-dialog supplier-channel-edit-drawer" drawer drawerSide="left"
    title="编辑模型渠道" description={provider.name} cancel={cancel} submit={submit} disabled={disabled || connectionChanged || Boolean(candidate)}
    action={saving ? '处理中…' : '保存'}
    footer={association && !candidate && !prepareTest && <Button theme="light" disabled={disabled} onClick={testConnectivity}>测试连接</Button>}>
    <SupplierChannelFields state={state} provider={provider} models={models} value={value} rawKey={rawKey} disabled={disabled || Boolean(candidate)} editing nameLabel={association ? "渠道名称" : "连接名称"} currentKey={currentKey} ops={ops} current={{ endpointId: endpoint.id, ...(preserveCurrent ? { name: '保留当前密钥配置', ready: connectionCredentialsReady(endpoint, provider) } : {}) }} onChange={set} onKeyChange={key => { setRawKey(key); ops.dirty(true); ops.setError(''); }}/>
    {connectionChanged && <Banner type="info" closeIcon={null} description="协议、地址或密钥发生变化后，需先测试连接再保存。"/>}
    {(prepareTest || candidate) && <Button theme="light" disabled={disabled || !candidate && needsKey} onClick={testConnectivity}>测试连接</Button>}
    {ops.error && <Notice error>{ops.error}</Notice>}
  </SupplierCreationDialog>;
}
