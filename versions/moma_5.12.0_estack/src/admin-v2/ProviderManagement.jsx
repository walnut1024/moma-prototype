import ModelResourceJsonPage from './ModelResourceJsonPage';
import AdminStatus from './AdminStatus';
import SupplierChannelBatchTest from './SupplierChannelBatchTest';
import SupplyModelView, { SupplyModelDirectory } from './SupplyModelView';
import { useLayoutEffect, useRef, useState } from 'react';
import { IconPlay, IconPlus } from '@douyinfe/semi-icons';
import { Button, Card, Empty, Space, Table, Tabs, Typography } from '@douyinfe/semi-ui';
import { supplierDirectory } from './moma-provider.js';
import { supplierChannelCode, supplierChannelName, supplierChannelReadiness, supplierChannelResources } from './supplier-resources';
import { CHANNEL_INTERFACES } from './channel-interface';
import { CopyId, Notice, Modal, useOperations } from './ModelOperationsUI';
import SupplierModelCatalogue from './SupplierModelCatalogue';
import ProviderDirectory from './ProviderDirectory';
import ProviderIntakeDrawer from './ProviderIntakeDrawer';
import ModelBatchImport from './ModelBatchImport';
import { channelManagementDirectory } from './supplier-model-channel-table';
import ProviderApiKeys from './ProviderApiKeys';
import { RemovalButton } from './ProviderRemovalDialog';
import SupplierAddDialog from './SupplierAddDialog';
import CreateChannelDrawer from './CreateChannelDrawer';
import { SupplierChannelDialog } from './SupplierResourceDialogs';
import ModelResourceTransfer from './ModelResourceTransfer';
import AdminPageHeading from './AdminPageHeading';
import { pages } from './navigation.mjs';
import { operationsReturn } from './model-pricing-workspace';
import { builtinProviderCatalogue } from '../mock/reference-workspace.js';
import './supplier-workbench.css';

function ProviderConnections({ state, provider, groups, ops, open }) {
  const connections = supplierChannelResources(state, provider);
  return <Table aria-label="服务商连接明细" className="supplier-connection-list" size="small" dataSource={connections} rowKey="id"
    scroll={{ x: 'max(100%, 920px)' }} pagination={false} empty="暂无连接" columns={[
      { title: '连接名称', width: 140, render: (_, endpoint) => supplierChannelName(provider, endpoint) },
      { title: '连接 ID', width: 260, render: (_, endpoint) => <CopyId copyAtStart value={endpoint.id} label="连接 ID"/> },
      ...(connections.some(endpoint => supplierChannelCode(endpoint) !== endpoint.id) ? [{ title: '连接编码', width: 180, render: (_, endpoint) => <CopyId copyAtStart value={supplierChannelCode(endpoint)} label="连接编码"/> }] : []),
      { title: 'Base URL', width: 230, render: (_, endpoint) => endpoint.baseUrl ? <CopyId copyAtStart value={endpoint.baseUrl} label="Base URL"/> : '—' },
      { title: '协议', dataIndex: 'protocol', width: 96, render: value => value || '—' },
      { title: '接口类型', width: 155, render: (_, endpoint) => CHANNEL_INTERFACES.find(row => row.id === endpoint.interfaceType)?.label || '—' },
      { title: '关联模型', width: 86, align: 'right', render: (_, endpoint) => groups.filter(group => group.modelId && group.channels.some(channel => channel.endpointId === endpoint.id)).length },
      { title: '连接状态', width: 105, render: (_, endpoint) => <AdminStatus value={endpoint.frozen ? '已冻结' : supplierChannelReadiness(endpoint, provider).label}/> },
      { title: '操作', width: 180, fixed: 'right', render: (_, endpoint) => <Space spacing={4}>
        <Button theme="borderless" size="small" onClick={event => open(endpoint.id, 'details', event)}
          aria-label={'详情 ' + supplierChannelName(provider, endpoint)}>详情</Button>
        <Button theme="borderless" size="small" disabled={!ops.can} onClick={event => open(endpoint.id, 'edit', event)}
          aria-label={'编辑 ' + supplierChannelName(provider, endpoint)}>编辑</Button>
        <RemovalButton state={state} ops={ops} target={{ providerId: provider.id, endpointId: endpoint.id }}
          label="删除" ariaLabel={'删除 ' + supplierChannelName(provider, endpoint)}/>
      </Space> },
    ]}/>
}

export default function ProviderManagement(props) {
  const { state } = props, ops = useOperations(props, 'providers'), { params, go } = ops;
  const [creating, setCreating] = useState(() => params.get('addingModel')==='1' ? 'model' : null), [creationLibraryId,setCreationLibraryId]=useState('');
  const [createdEndpointId, setCreatedEndpointId] = useState('');
  const creationTrigger = useRef(null);
  const resourceTrigger = useRef(null);
  const modelListScroll = useRef(0);
  const providerId = params.get('provider');
  const providers = supplierDirectory(state).filter(row => !row.deletedAt && (!row.id.startsWith('service-review-provider-') || row.id === providerId));
  const provider = providers.find(item => item.id === providerId);
  const tabKey = params.get('tab');
  const tab = ['connections', 'api-keys'].includes(tabKey) ? tabKey : 'catalogue';
  const { byProvider, models } = channelManagementDirectory(state, providers);
  const providerGroups = byProvider.get(provider?.id) || [];
  const goCatalogue = (patch, options) => go({ resource: null, ...patch }, options);
  const detail = (id, options) => go({ provider: id, listQ: params.get('listQ'), listPage: params.get('listPage'),
    modelListQ: params.get('modelListQ'), modelListPage: params.get('modelListPage') }, { reset: true, ...options });
  const returnTo = operationsReturn(params.get('returnTo'));
  const perspective = params.get('perspective') === 'models' ? 'models' : 'suppliers';
  const closeCreation = () => { setCreating(null); if(params.has('addingModel')) go({addingModel:null,selectedModels:null},{saved:true}); ops.setError(''); requestAnimationFrame(() => (creationTrigger.current?.isConnected ? creationTrigger.current : document.getElementById('supplier-create-trigger'))?.focus()); };
  const requestedModel = params.get('supplyModel');
  const selectedModel = models.find(row => row.id === requestedModel);
  const modelList = perspective === 'models' && !requestedModel;
  useLayoutEffect(() => {
    if (!modelList) return;
    const frame = requestAnimationFrame(() => window.scrollTo(0, modelListScroll.current));
    return () => cancelAnimationFrame(frame);
  }, [modelList]);
  const openModel = id => goCatalogue({
    perspective: 'models', supplyModel: id, provider: null, material: null, view: null, tab: null,
  });
  const showSupplier = group => goCatalogue({
    perspective: null, provider: group.owner.id, tab: 'catalogue', material: group.id, channelView: null, supplyModel: null, view: null,
  });
  const changePerspective = next => goCatalogue({
    perspective: next === 'models' ? 'models' : null, supplyModel: null, provider: null, material: null, view: null, tab: null,
  }, { preserveScroll: true });
  const startCreation = (mode, event, libraryId='') => { setCreationLibraryId(libraryId); creationTrigger.current = event?.currentTarget; ops.setError(''); setCreating(mode); };
  const channelSaved = (next, endpointId) => {
    const owner = next.providers.find(row => row.id === next.endpoints.find(endpoint => endpoint.id === endpointId)?.providerId);
    const group = owner && channelManagementDirectory(next, [owner]).byProvider.get(owner.id).find(row => row.channels.some(channel => channel.endpointId === endpointId));
    goCatalogue({
      provider: owner?.id, perspective: 'suppliers', tab: 'catalogue', material: group?.id, supplyModel: null,
      endpoint: null, channelView: null, q: null, page: null, addingModel: null, selectedModels: null, credentialChannel: null,
    }, { saved: true });
    setCreating(null);
    setCreatedEndpointId(endpointId);
  };
  const closeResource = () => { go({ resource: null, resourceMode: null }, { preserveScroll: true }); requestAnimationFrame(() => (resourceTrigger.current?.isConnected ? resourceTrigger.current : document.querySelector('.supplier-detail-tabs .semi-tabs-tab-active'))?.focus()); };
  let content;
  if (perspective === 'models' && requestedModel) {
    content = <SupplyModelView key={selectedModel?.id || requestedModel} state={state} selected={selectedModel} ops={ops} onShowSupplier={showSupplier}/>;
  } else if (provider && params.get('view') === 'modelImport') {
    content = <section className="supplier-model-import">
      <Typography.Title heading={4} component="h2">批量新增</Typography.Title>
      <ModelBatchImport key={provider.id} kind="model" providerId={provider.id} state={state} ops={ops} transact={props.transact}
        builtinCatalogue={builtinProviderCatalogue(provider)} close={saved => go({ view: null }, { saved })}/>
    </section>;
  } else if (provider) {
    content = <Card className="supplier-detail-card" bodyStyle={{ padding: 0 }}>
      <div className="supplier-context">
      <div className="supplier-heading">
        <div>
          <Space wrap>
            <Typography.Title heading={4} component="h2">{provider.name}</Typography.Title>
            <AdminStatus value={provider.status}/>
          </Space>
          <Typography.Paragraph type="tertiary" size="small">Provider ID <CopyId copyAtStart value={provider.id} label="Provider ID"/></Typography.Paragraph>
        </div>
        <Space wrap><ModelResourceTransfer state={state} ops={ops} scope="channels"/>{provider.status !== '已启用' && <Button theme="light" size="small" disabled={!ops.can} icon={<IconPlay aria-hidden="true"/>} onClick={async () => await ops.run('provider', { operation: 'enableProvider', objectId: provider.id, values: {} })}>启用服务商</Button>}</Space>
      </div></div>

      <Tabs className="supplier-detail-tabs" type="line" lazyRender activeKey={tab} onChange={tab => go({ tab, q: null, page: null })} aria-label="服务商详情">
        <Tabs.TabPane tab="模型渠道" itemKey="catalogue">{tab === 'catalogue' ? <SupplierModelCatalogue key={provider.id} state={state} provider={provider} groups={providerGroups} ops={ops} onImport={() => go({ view: 'modelImport' })} onAddChannel={(event,libraryId) => startCreation('channel',event,libraryId)} createdEndpointId={createdEndpointId} onLocated={() => setCreatedEndpointId('')}/> : null}</Tabs.TabPane>
        <Tabs.TabPane tab="连接明细" itemKey="connections">{tab === 'connections' ? <ProviderConnections state={state} provider={provider} groups={providerGroups} ops={ops}
          open={(id, mode, event) => { resourceTrigger.current = event.currentTarget; go({ resource: id, resourceMode: mode === 'edit' ? 'edit' : null }, { preserveScroll: true }); }}/> : null}</Tabs.TabPane>
        <Tabs.TabPane tab="服务商 API 密钥池" itemKey="api-keys">{tab === 'api-keys' ? <ProviderApiKeys key={provider.id} state={state} provider={provider} ops={ops}/> : null}</Tabs.TabPane>
      </Tabs>
    </Card>;
  } else if (providerId) content = <Empty description="该服务商不存在，请返回服务商列表。"/>;
  else content = <ProviderDirectory state={state} providers={providers} byProvider={byProvider} ops={ops} onDetails={detail}/>;
  const returnEndpoint = state.endpoints.find(row => row.id === params.get('returnTestEndpoint') && row.providerId === provider?.id && !row.deletedAt);
  let returnIds = []; try { const parsed = JSON.parse(params.get('returnTestAssociations') || '[]'); if (Array.isArray(parsed) && parsed.length <= 50 && parsed.every(id => typeof id === 'string')) returnIds = parsed; } catch { /* Invalid return context does not open an operation. */ }
  if (params.get('resourceJson') === '1') return <ModelResourceJsonPage state={state} ops={ops} scope="channels"/>;
  return <div className="admin-page-stack supplier-workbench">
    {returnTo && <div><Button theme="borderless" onClick={() => ops.proceed(() => { location.hash = returnTo; })}>返回来源页面</Button></div>}
    {params.get('origin')?.startsWith('#/admin-2/listing') && <Notice><Button type="tertiary" theme="borderless" onClick={() => ops.proceed(() => { location.hash = params.get('origin'); })}>返回服务配置</Button></Notice>}
    {params.get('onboarding') && <Notice>上架进度已保留。<Button type="tertiary" theme="borderless" onClick={() => ops.go({ view: 'add', draft: params.get('onboarding'), onboarding: null, provider: null, tab: null, step: state.modelOnboardings.find(item => item.id === params.get('onboarding'))?.step || 'select' }, { base: 'listing' })}>返回上架流程</Button></Notice>}
    <AdminPageHeading title={pages.providers.label}>{!providerId && !requestedModel && <ModelResourceTransfer state={state} ops={ops} scope="channels"/>}{perspective === 'suppliers' && !providerId && <Space wrap>
      <Button id="supplier-create-trigger" theme="solid" disabled={!ops.can} icon={<IconPlus aria-hidden="true"/>} onClick={event => startCreation('provider', event)}>录入服务商</Button>
    </Space>}</AdminPageHeading>
    {(perspective === 'models' ? requestedModel : providerId) ? <div className="supplier-body">{content}</div>
      : <Tabs className="supplier-perspective" type="line" activeKey={perspective} onChange={changePerspective} keepDOM={false} tabPaneMotion={false} contentStyle={{ paddingBlock: 'var(--admin-section-gap) 0' }}>
        <Tabs.TabPane tab="服务商视图" itemKey="suppliers">{content}</Tabs.TabPane>
        <Tabs.TabPane tab="模型视图" itemKey="models">
          {modelList && <SupplyModelDirectory state={state} models={models} ops={ops} onDetails={id => {
            modelListScroll.current = window.scrollY;
            openModel(id);
          }}/>}
        </Tabs.TabPane>
      </Tabs>}
    {creating === 'provider' && <ProviderIntakeDrawer state={state} ops={ops} close={closeCreation} saved={id => { setCreating(null); detail(id, { saved: true }); }}/>} 
    {creating === 'channel' && <CreateChannelDrawer state={state} providers={providers}
      fixedProvider={provider} libraryId={creationLibraryId} ops={ops} close={closeCreation} saved={channelSaved}/>}
    {creating === 'model' && <SupplierAddDialog state={state} provider={provider} libraryId={creationLibraryId} mode="model" ops={ops} close={closeCreation}
      onChannelSaved={(next, { endpointId }) => channelSaved(next, endpointId)}/>}
    {returnEndpoint && returnIds.length > 0 && <SupplierChannelBatchTest state={state} provider={provider} endpointId={returnEndpoint.id} associationIds={returnIds} ops={ops} close={() => ops.go({ returnTestEndpoint: null, returnTestAssociations: null })}/>}
    {ops.error && <Notice error>{ops.error}</Notice>}{ops.leaveDialog}{provider && params.get('resource') && (() => { const endpoint = supplierChannelResources(state, provider).find(row => row.id === params.get('resource')); return endpoint ? <SupplierChannelDialog key={`${endpoint.id}:${params.get('resourceMode')}`} mode={params.get('resourceMode') === 'edit' ? 'all' : 'details'} state={state} provider={provider} endpoint={endpoint} ops={ops} close={closeResource}/> : <Modal title="渠道不存在" onClose={closeResource}><Notice error>渠道已变化，请重新选择。</Notice></Modal>; })()}</div>;
}
