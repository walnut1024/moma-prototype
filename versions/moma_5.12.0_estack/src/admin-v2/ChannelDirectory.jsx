import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button, Checkbox, Space, Table, Typography } from '@douyinfe/semi-ui';
import { cloudAdminRequest } from './admin-client.mjs';
import AdminStatus from './AdminStatus';
import ChannelDirectoryDiscovery from './ChannelDirectoryDiscovery';
import ChannelCapacityEditor from './ChannelCapacity';
import ChannelDirectoryCreation from './ChannelDirectoryCreation';
import ChannelManagementView from './ChannelManagementView';
import ChannelModelBatchAdd from './ChannelModelBatchAdd';
import { ChannelConnectionEditor, ChannelModelEditor } from './ChannelConnectionEditors';
import { Modal, Notice, useOperations } from './ModelOperationsUI';
import ProcurementVersionEditor from './ProcurementVersionEditor';
import ProviderRemovalDialog from './ProviderRemovalDialog';
import SupplierChannelBatchTest from './SupplierChannelBatchTest';
import SupplierChannelConfiguration from './SupplierChannelConfiguration';
import { channelChangeImpact } from './channel-change-management';
import { channelStatus } from './channel-selection';
import { channelCheckCurrent } from './provider-channels';
import { connectionRecoveryIssue } from './connection-state';
import { connectionDirectoryRows } from './channel-connection-directory';
import { routingServices } from './service-routing';
import { supplierDirectory } from './moma-provider.js';
import './channel-directory.css';

function ConnectionOperation({ connection, action, state, ops, close, retest }) {
  const { id, endpoint, provider, models } = connection;
  const enabling = action === 'enable';
  const title = enabling ? '启用渠道' : '停用渠道';
  const impact = channelChangeImpact(state, provider.id, id);
  const [catalogue, setCatalogue] = useState(null);
  const [loadError, setLoadError] = useState('');
  useEffect(() => {
    if (enabling) return;
    const request = new AbortController();
    cloudAdminRequest('/model-services-new', { signal: request.signal })
      .then(({ rows }) => { if (!request.signal.aborted) setCatalogue(rows); })
      .catch(error => { if (!request.signal.aborted) setLoadError(error.message); });
    return () => request.abort();
  }, [enabling, id]);
  const channelIds = new Set(models.map(model => model.association.id));
  const linked = (catalogue || []).filter(service => service.channels?.some(channel =>
    channel.enabled && !channel.simulated && channelIds.has(channel.channelId)));
  const routed = routingServices(state).filter(service => impact.services.some(reference => reference.id === service.id));
  const services = [...new Map([...routed, ...linked].map(service => [service.id, service])).values()];
  const target = { providerId: provider.id, endpointId: id, expectedUpdatedAt: endpoint.updatedAt, expectedImpactRevision: impact.revision };
  const [expected] = useState(target);
  const [confirmed, setConfirmed] = useState(false);
  const [associationIds, setAssociationIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const stale = JSON.stringify(expected) !== JSON.stringify(target);
  const recovery = enabling && connectionRecoveryIssue(endpoint);
  const blocked = !enabling ? false : endpoint.frozen ? '请先解除渠道冻结。'
    : endpoint.candidateConfiguration ? '请先处理渠道的候选配置。'
    : endpoint.serverTestJobs?.some(job => !job.receivedAt && !job.canceledAt) ? '请先完成渠道检测。'
    : provider.status !== '已启用' ? '请先启用服务商。'
    : !models.length ? '请先接入模型。' : recovery;
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
        disabled={busy || !ops.can || !confirmed || stale || Boolean(blocked) || (!enabling && !catalogue)}
        onClick={submit}>{associationIds.length ? '启用渠道及所选模型' : '确认' + title}</Button></Space>}>
    <Table size="small" rowKey="id" pagination={false} dataSource={[connection]} columns={[
      { title: '渠道名称 / ID', render: (_, row) => <div className="channel-identity"><strong>{row.name}</strong>
        <Typography.Text size="small" ellipsis={{ showTooltip: true }}>{row.id}</Typography.Text></div> },
      { title: '服务商', render: () => provider.name },
      { title: '状态', render: (_, row) => <AdminStatus value={row.status === '已启用' ? row.status : '已停用'}/> },
      { title: '已接入模型', render: () => models.length + ' 款' },
    ]}/>
    {!enabling && <><Typography.Paragraph>停用后，以下模型服务将无法通过该渠道调用。</Typography.Paragraph>
      {loadError ? <Notice error>加载受影响的模型服务失败，请重新打开抽屉。{loadError}</Notice>
        : !catalogue ? <Typography.Text>正在加载模型服务…</Typography.Text>
        : <Table size="small" rowKey="id" pagination={false} dataSource={services} empty="暂无受影响的模型服务" columns={[
          { title: '模型服务名称', dataIndex: 'name' },
          { title: '模型 ID', render: (_, service) => service.callId || '—' },
        ]}/>}</>}
    {blocked && <Notice error>{blocked}</Notice>}
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
    {stale && <Notice error>渠道或关联服务已变化，请关闭后重新核对。</Notice>}
    <Checkbox checked={confirmed} disabled={busy || stale || !ops.can}
      onChange={event => setConfirmed(event.target.checked)}>{enabling ? '我已核对渠道及接入模型' : '我已核对受影响的模型服务'}</Checkbox>
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
    {connection && operation.type === 'quickAdd' && <ChannelModelBatchAdd key={connection.id} state={state} channel={connection}
      ops={ops} close={finish} manual={event => open(event, 'add', connection.id, null, operation)}/>}
    {connection && operation.type === 'add' && <SupplierChannelConfiguration state={state} provider={connection.provider}
      endpoint={connection.endpoint} initialRows={operation.initialRows} ops={ops} close={close} onConnected={finish} directory reference
      cancelLabel={operation.back?.type === 'discovery' ? '返回获取模型列表' : operation.back ? '返回添加渠道模型' : undefined}/>}
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
