import { useLayoutEffect, useRef, useState } from 'react';
import { Button, Checkbox, Space, Table, Typography } from '@douyinfe/semi-ui';
import AdminStatus from './AdminStatus';
import ChannelDirectoryDiscovery from './ChannelDirectoryDiscovery';
import ChannelCapacityEditor from './ChannelCapacity';
import ChannelDirectoryCreation from './ChannelDirectoryCreation';
import ChannelManagementView from './ChannelManagementView';
import { ChannelConnectionEditor, ChannelModelEditor } from './ChannelConnectionEditors';
import { Modal, Notice, useOperations } from './ModelOperationsUI';
import ProcurementVersionEditor from './ProcurementVersionEditor';
import ProviderRemovalDialog from './ProviderRemovalDialog';
import SupplierChannelBatchTest from './SupplierChannelBatchTest';
import SupplierChannelConfiguration from './SupplierChannelConfiguration';
import { channelChangeImpact } from './channel-change-management';
import { channelStatus } from './channel-selection';
import { channelCheckCurrent } from './provider-channels';
import { connectionRecoveryIssue, connectionTestPassed } from './connection-state';
import { connectionDirectoryRows } from './channel-connection-directory';
import { routingServices } from './service-routing';
import { supplierDirectory } from './moma-provider.js';
import './channel-directory.css';

function ConnectionOperation({ connection, action, state, ops, close, retest }) {
  const { id, endpoint, provider, models } = connection;
  const enabling = action === 'enable';
  const title = enabling ? '启用连接' : '停用连接';
  const impact = channelChangeImpact(state, provider.id, id);
  const services = routingServices(state).filter(service => impact.services.some(reference => reference.id === service.id));
  const target = { providerId: provider.id, endpointId: id, expectedUpdatedAt: endpoint.updatedAt, expectedImpactRevision: impact.revision };
  const [expected] = useState(target);
  const [confirmed, setConfirmed] = useState(false);
  const [associationIds, setAssociationIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const stale = JSON.stringify(expected) !== JSON.stringify(target);
  const recovery = enabling && connectionRecoveryIssue(endpoint);
  const result = () => {
    if (endpoint.frozen || endpoint.candidateConfiguration || endpoint.serverTestJobs?.some(job => !job.receivedAt && !job.canceledAt)) return '请先处理冻结、候选配置或未完成检测';
    if (!enabling) return '可提交';
    if (provider.status !== '已启用') return '服务商停用';
    if (!models.length) return '请先接入模型';
    return recovery || (connectionTestPassed(endpoint) ? '可提交' : '当前配置待测试');
  };
  const submit = async () => {
    setBusy(true);
    try {
      const next = await ops.run('channelDirectoryOperate', { targets: [expected], action, ...(enabling ? { associationIds } : {}), confirmed });
      if (next) close();
    } finally { setBusy(false); }
  };
  return <Modal drawer wide title={title} description={connection.name} onClose={() => !busy && close()}
    footer={<Space><Button disabled={busy} onClick={close}>取消</Button>
      <Button theme="solid" type={enabling ? 'primary' : 'danger'} loading={busy}
        disabled={busy || !ops.can || !confirmed || stale || Boolean(recovery)}
        onClick={submit}>{associationIds.length ? '启用连接及所选模型' : '确认' + title}</Button></Space>}>
    <Typography.Paragraph>{enabling ? '启用前需新增模型渠道并通过当前连接测试。' : '停用后，以下模型无法通过所选连接调用。恢复连接后，保留各模型原有启停设置。'}</Typography.Paragraph>
    <Table size="small" rowKey="id" pagination={false} dataSource={[connection]} columns={[
      { title: '连接名称', dataIndex: 'name' },
      { title: '服务商', render: () => provider.name },
      { title: '当前状态', render: (_, row) => <AdminStatus value={row.status}/> },
      { title: '已接入模型', render: () => models.map(model => model.modelName).join('、') || '—' },
      { title: '准备结果', render: result },
    ]}/>
    {services.length > 0 && <Typography.Paragraph>涉及 {services.length} 项服务 · {services.map(service => service.name || service.callId || service.id).join('、')}</Typography.Paragraph>}
    {enabling && endpoint.activationSource === 'automatic' && <Notice>
      {endpoint.activationReason || '自动停用'} · {endpoint.activationChangedAt &&
        new Date(endpoint.activationChangedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
      {recovery && <Button theme="borderless" disabled={!ops.can || busy} onClick={event => retest(event, id)}>复测当前配置</Button>}
    </Notice>}
    {enabling && <Table size="small" rowKey="key" pagination={false} dataSource={models} columns={[
      { title: '模型', dataIndex: 'modelName' },
      { title: '状态', render: (_, row) => <AdminStatus value={channelStatus(provider, row.association)}/> },
      { title: '同时启用', render: (_, { association }) => <Checkbox aria-label={'同时启用 ' + association.upstreamModelId}
        checked={associationIds.includes(association.id)}
        disabled={!ops.can || busy || stale || Boolean(recovery) || association.enabled || !channelCheckCurrent(association) || association.health?.result !== '通过'}
        onChange={event => {
          setAssociationIds(ids => event.target.checked ? [...ids, association.id] : ids.filter(id => id !== association.id));
          setConfirmed(false);
        }}/> },
    ]}/>}
    {stale && <Notice error>连接或关联服务已变化，请关闭后重新核对。</Notice>}
    <Checkbox checked={confirmed} disabled={busy || stale || !ops.can}
      onChange={event => setConfirmed(event.target.checked)}>我已核对模型及关联服务</Checkbox>
    {ops.error && <Notice error>{ops.error}</Notice>}
  </Modal>;
}

export function ChannelManagementNew(props) {
  const { state } = props;
  const ops = useOperations(props, 'providers-reference');
  const [operation, setOperation] = useState(null);
  const routeConnection = ops.params.get('connection');
  const routeTab = ops.params.get('tab');
  const { setError } = ops;
  useLayoutEffect(() => {
    setOperation(null);
    setError('');
  }, [routeConnection, routeTab, setError]);
  const focusTarget = useRef(null), trigger = useRef(null);
  const providers = supplierDirectory(state).filter(row => !row.deletedAt && !row.id.startsWith('service-review-provider-'));
  const connections = connectionDirectoryRows(state, providers);
  const connection = operation && connections.find(row => row.id === operation.connectionId);
  const model = connection?.models.find(row => row.key === operation.modelKey);
  const open = (event, type, connectionId, modelKey, back) => ops.proceed(() => {
    if (event && !back) trigger.current = event.currentTarget;
    ops.setError('');
    setOperation({ type, connectionId, modelKey, back });
  });
  const finish = () => {
    setOperation(null);
    ops.setError('');
    ops.dirty(false);
    requestAnimationFrame(() => (trigger.current?.isConnected ? trigger.current : focusTarget.current?.querySelector('input'))?.focus({ preventScroll: true }));
  };
  const close = () => {
    if (!operation?.back) return finish();
    ops.setError('');
    ops.dirty(false);
    setOperation(operation.back);
  };
  const locate = (id, newTab = false) => {
    if (newTab) {
      window.open('#/admin-2/providers-reference?' + new URLSearchParams({ connection: id }), '_blank', 'noopener');
      return;
    }
    finish();
    ops.go({ connection: id, tab: null, modelQ: null, keyGroup: null }, { saved: true });
  };
  const chooseModels = (_, connectionId, initialRows, selection) => ops.proceed(() => {
    setOperation({ type: 'add', connectionId, initialRows, back: { ...operation, activeId: connectionId, selection } });
  });
  return <div className="admin-page-stack supplier-workbench channel-management-new">
    <ChannelManagementView state={state} connections={connections} ops={ops} open={open} focusTarget={focusTarget}/>
    {operation?.type === 'create' && <ChannelDirectoryCreation state={state} providers={providers} connections={connections} ops={ops} close={close} locate={locate} reference/>}
    {connection && operation.type === 'edit' && <ChannelConnectionEditor key={connection.id} state={state} connection={connection} ops={ops} close={close}/>}
    {connection && operation.type === 'discovery' && <ChannelDirectoryDiscovery state={state} connections={[connection]} ops={ops} close={close}
      append={chooseModels} initialConnectionId={operation.activeId} initialSelection={operation.selection} reference/>}
    {connection && operation.type === 'add' && <SupplierChannelConfiguration state={state} provider={connection.provider}
      endpoint={connection.endpoint} initialRows={operation.initialRows} ops={ops} close={close} onConnected={finish} directory reference
      cancelLabel={operation.back ? '返回获取模型列表' : undefined}/>}
    {model && operation.type === 'model' && <ChannelModelEditor key={model.key} model={model} connection={connection} ops={ops} close={close}/>}
    {model && operation.type === 'capacity' && <ChannelCapacityEditor key={model.key} provider={connection.provider}
      association={model.association} modelName={model.modelName} ops={ops} close={close}/>}
    {model && operation.type === 'cost' && <ProcurementVersionEditor directory key={model.key} state={state} provider={connection.provider}
      association={model.association} modelName={model.modelName} ops={ops} close={close}/>}
    {connection && ['test', 'testConnection'].includes(operation.type) && (!operation.modelKey || model) &&
      <SupplierChannelBatchTest state={state} provider={connection.provider}
        endpointId={connection.id} associationIds={(model ? [model] : connection.models).map(row => row.association.id)}
        title={model ? '测试模型' : operation.type === 'testConnection' ? '测试连接' : '批量测试'}
        ops={ops} close={close} testOnly directory reference={operation.type === 'test'}/>}
    {connection && ['enable', 'disable'].includes(operation.type) && <ConnectionOperation connection={connection} action={operation.type}
      state={state} ops={ops} close={close} retest={(event, id) => open(event, 'test', id, null, operation)}/>}
    {connection && operation.type === 'remove' && (!operation.modelKey || model) && <ProviderRemovalDialog state={state} ops={ops} close={close} removed={close}
      title={model ? '删除模型渠道' : '删除连接'}
      target={{ providerId: connection.provider.id, endpointId: connection.id, ...(model ? { associationId: model.association.id, keepEndpoint: true } : {}) }}/>}
    {ops.error && <Notice error>{ops.error}</Notice>}{ops.leaveDialog}
  </div>;
}
