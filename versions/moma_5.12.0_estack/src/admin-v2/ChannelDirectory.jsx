import { useLayoutEffect, useRef, useState } from 'react';
import ChannelDirectoryDiscovery from './ChannelDirectoryDiscovery';
import ChannelCapacityEditor from './ChannelCapacity';
import ChannelDirectoryCreation from './ChannelDirectoryCreation';
import ChannelManagementView from './ChannelManagementView';
import ChannelModelBatchAdd from './ChannelModelBatchAdd';
import { ChannelConnectionEditor, ChannelModelEditor } from './ChannelConnectionEditors';
import { Notice, useOperations } from './ModelOperationsUI';
import ProcurementVersionEditor from './ProcurementVersionEditor';
import ProviderRemovalDialog from './ProviderRemovalDialog';
import SupplierChannelBatchTest from './SupplierChannelBatchTest';
import SupplierChannelConfiguration from './SupplierChannelConfiguration';
import { connectionDirectoryRows } from './channel-connection-directory';
import { supplierDirectory } from './moma-provider.js';
import './channel-directory.css';

export function ChannelManagementNew(props) {
  const { state, workspaceTabs } = props;
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
    <ChannelManagementView state={state} connections={connections} ops={ops} open={open}
      focusTarget={focusTarget} workspaceTabs={workspaceTabs}/>
    {operation?.type === 'create' && <ChannelDirectoryCreation state={state} providers={providers} connections={connections} ops={ops} close={close} locate={locate} reference/>}
    {connection && operation.type === 'edit' && <ChannelConnectionEditor key={connection.id} state={state} connection={connection} ops={ops} close={close}/>}
    {connection && operation.type === 'discovery' && <ChannelDirectoryDiscovery state={state} connections={[connection]} ops={ops} close={close}
      append={chooseModels} initialConnectionId={operation.activeId} initialSelection={operation.selection} reference/>}
    {connection && operation.type === 'quickAdd' && <ChannelModelBatchAdd key={connection.id} state={state} channel={connection}
      ops={ops} close={finish}/>}
    {connection && operation.type === 'add' && <SupplierChannelConfiguration state={state} provider={connection.provider}
      endpoint={connection.endpoint} initialRows={operation.initialRows} ops={ops} close={close} onConnected={finish} directory reference
      cancelLabel="返回获取模型列表"/>}
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
    {connection && operation.type === 'remove' && (!operation.modelKey || model) && <ProviderRemovalDialog state={state} ops={ops} close={close} removed={close}
      title={model ? '删除上游模型' : '删除连接'} modelName={model?.modelName}
      target={{ providerId: connection.provider.id, endpointId: connection.id, ...(model ? { associationId: model.association.id } : {}) }}/>}
    {ops.error && <Notice error>{ops.error}</Notice>}{ops.leaveDialog}
  </div>;
}
