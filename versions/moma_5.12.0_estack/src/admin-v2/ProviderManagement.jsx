import ModelResourceJsonPage from './ModelResourceJsonPage';
import AdminStatus from './AdminStatus';
import SupplierChannelBatchTest from './SupplierChannelBatchTest';
import SupplyModelView, { SupplyModelDirectory } from './SupplyModelView';
import ChannelDirectory from './ChannelDirectory';
import { useLayoutEffect, useRef, useState } from 'react';
import { IconPlay, IconPlus } from '@douyinfe/semi-icons';
import { Button, Card, Empty, Space, Tabs, Typography } from '@douyinfe/semi-ui';
import { supplierDirectory } from './moma-provider.js';
import { CopyId, Notice, useOperations } from './ModelOperationsUI';
import SupplierModelCatalogue from './SupplierModelCatalogue';
import ProviderDirectory from './ProviderDirectory';
import ProviderIntakeDrawer from './ProviderIntakeDrawer';
import ModelBatchImport from './ModelBatchImport';
import { channelManagementDirectory } from './supplier-model-channel-table';
import ProviderApiKeys from './ProviderApiKeys';
import SupplierAddDialog from './SupplierAddDialog';
import CreateChannelDrawer from './CreateChannelDrawer';
import ModelResourceTransfer from './ModelResourceTransfer';
import AdminPageHeading from './AdminPageHeading';
import { pages, providerManagementPerspective } from './navigation.mjs';
import { operationsReturn } from './model-pricing-workspace';
import { builtinProviderCatalogue } from '../mock/reference-workspace.js';
import './supplier-workbench.css';

export default function ProviderManagement(props) {
  const { state, page } = props, ops = useOperations(props, page), { params, go } = ops;
  const channelFirst = page === 'providers-new';
  const [creating, setCreating] = useState(() => params.get('addingModel')==='1' ? 'model' : null), [creationLibraryId,setCreationLibraryId]=useState('');
  const [createdEndpointId, setCreatedEndpointId] = useState('');
  const creationTrigger = useRef(null);
  const modelListScroll = useRef(0);
  const providerId = params.get('provider');
  const providers = supplierDirectory(state).filter(row => !row.deletedAt && (!row.id.startsWith('service-review-provider-') || row.id === providerId));
  const provider = providers.find(item => item.id === providerId);
  const tab = params.get('tab') === 'api-keys' ? 'api-keys' : 'catalogue';
  const { byProvider, models } = channelManagementDirectory(state, providers);
  const providerGroups = byProvider.get(provider?.id) || [];
  const detail = (id, options) => go({ provider: id, listQ: params.get('listQ'), listPage: params.get('listPage'),
    modelListQ: params.get('modelListQ'), modelListPage: params.get('modelListPage'), channelStatus: params.get('channelStatus'),
    ...(channelFirst ? { channelProvider: params.get('channelProvider') } : {}) }, { reset: true, ...options });
  const returnTo = operationsReturn(params.get('returnTo'));
  const perspective = providerManagementPerspective(page, params);
  const closeCreation = () => { setCreating(null); if(params.has('addingModel')) go({addingModel:null,selectedModels:null},{saved:true}); ops.setError(''); requestAnimationFrame(() => (creationTrigger.current?.isConnected ? creationTrigger.current : document.getElementById('supplier-create-trigger'))?.focus()); };
  const requestedModel = params.get('supplyModel');
  const selectedModel = models.find(row => row.id === requestedModel);
  const modelList = perspective === 'models' && !requestedModel;
  const connectionDetail = channelFirst && modelList && params.has('connection');
  useLayoutEffect(() => {
    if (!modelList) return;
    const frame = requestAnimationFrame(() => window.scrollTo(0, modelListScroll.current));
    return () => cancelAnimationFrame(frame);
  }, [modelList]);
  const openModel = id => go({
    perspective: 'models', supplyModel: id, provider: null, material: null, view: null, tab: null,
  });
  const showSupplier = group => go({
    perspective: null, provider: group.owner.id, tab: 'catalogue', material: group.id, channelView: null, supplyModel: null, view: null,
  });
  const changePerspective = next => go({
    perspective: next === 'models' ? 'models' : channelFirst ? 'suppliers' : null, supplyModel: null, provider: null, material: null, view: null, tab: null,
    connection: null, modelQ: null,
  }, { preserveScroll: true });
  const startCreation = (mode, event, libraryId='') => { setCreationLibraryId(libraryId); creationTrigger.current = event?.currentTarget; ops.setError(''); setCreating(mode); };
  const channelSaved = (next, endpointId) => {
    const owner = next.providers.find(row => row.id === next.endpoints.find(endpoint => endpoint.id === endpointId)?.providerId);
    const group = owner && channelManagementDirectory(next, [owner]).byProvider.get(owner.id).find(row => row.channels.some(channel => channel.endpointId === endpointId));
    go({
      provider: owner?.id, perspective: 'suppliers', tab: 'catalogue', material: group?.id, supplyModel: null,
      endpoint: null, channelView: null, q: null, page: null, addingModel: null, selectedModels: null, credentialChannel: null,
    }, { saved: true });
    setCreating(null);
    setCreatedEndpointId(endpointId);
  };
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
        <Tabs.TabPane tab="服务商 API 密钥池" itemKey="api-keys">{tab === 'api-keys' ? <ProviderApiKeys key={provider.id} state={state} provider={provider} ops={ops}/> : null}</Tabs.TabPane>
      </Tabs>
    </Card>;
  } else if (providerId) content = <Empty description="该服务商不存在，请返回服务商列表。"/>;
  else content = <ProviderDirectory state={state} providers={providers} byProvider={byProvider} ops={ops} onDetails={detail}/>;
  const returnEndpoint = state.endpoints.find(row => row.id === params.get('returnTestEndpoint') && row.providerId === provider?.id && !row.deletedAt);
  let returnIds = []; try { const parsed = JSON.parse(params.get('returnTestAssociations') || '[]'); if (Array.isArray(parsed) && parsed.length <= 50 && parsed.every(id => typeof id === 'string')) returnIds = parsed; } catch { /* Invalid return context does not open an operation. */ }
  if (params.get('resourceJson') === '1') return <ModelResourceJsonPage state={state} ops={ops} scope="channels" readOnly={channelFirst}/>;
  const supplierTab = <Tabs.TabPane key="suppliers" tab="服务商视图" itemKey="suppliers">{content}</Tabs.TabPane>;
  const modelTab = <Tabs.TabPane key="models" tab={channelFirst ? '渠道视图' : '模型视图'} itemKey="models">
    {modelList && (channelFirst ? <ChannelDirectory state={state} providers={providers} ops={ops}/> : <SupplyModelDirectory state={state} models={models} ops={ops} onDetails={id => {
      modelListScroll.current = window.scrollY;
      openModel(id);
    }}/>)}
  </Tabs.TabPane>;
  return <div className="admin-page-stack supplier-workbench">
    {returnTo && <div><Button theme="borderless" onClick={() => ops.proceed(() => { location.hash = returnTo; })}>返回来源页面</Button></div>}
    {params.get('origin')?.startsWith('#/admin-2/listing') && <Notice><Button type="tertiary" theme="borderless" onClick={() => ops.proceed(() => { location.hash = params.get('origin'); })}>返回服务配置</Button></Notice>}
    {params.get('onboarding') && <Notice>上架进度已保留。<Button type="tertiary" theme="borderless" onClick={() => ops.go({ view: 'add', draft: params.get('onboarding'), onboarding: null, provider: null, tab: null, step: state.modelOnboardings.find(item => item.id === params.get('onboarding'))?.step || 'select' }, { base: 'listing' })}>返回上架流程</Button></Notice>}
    {!connectionDetail && <AdminPageHeading title={pages[page].label}>{!providerId && !requestedModel && <ModelResourceTransfer state={state} ops={ops} scope="channels" reviewFields={channelFirst}/>}{perspective === 'suppliers' && !providerId && <Space wrap>
      <Button id="supplier-create-trigger" theme="solid" disabled={!ops.can} icon={<IconPlus aria-hidden="true"/>} onClick={event => startCreation('provider', event)}>录入服务商</Button>
    </Space>}</AdminPageHeading>}
    {(perspective === 'models' ? requestedModel : providerId) ? <div className="supplier-body">{content}</div>
      : <Tabs className="supplier-perspective" type="line" activeKey={perspective} onChange={changePerspective} keepDOM={false} tabPaneMotion={false}
        tabBarStyle={connectionDetail ? { display: 'none' } : undefined}
        contentStyle={{ paddingBlock: connectionDetail ? 0 : 'var(--admin-section-gap) 0' }}>
        {channelFirst ? [modelTab, supplierTab] : [supplierTab, modelTab]}
      </Tabs>}
    {creating === 'provider' && <ProviderIntakeDrawer state={state} ops={ops} close={closeCreation} saved={id => { setCreating(null); detail(id, { saved: true }); }}/>} 
    {creating === 'channel' && <CreateChannelDrawer state={state} providers={providers}
      fixedProvider={provider} libraryId={creationLibraryId} ops={ops} close={closeCreation} saved={channelSaved}/>}
    {creating === 'model' && <SupplierAddDialog state={state} provider={provider} libraryId={creationLibraryId} mode="model" ops={ops} close={closeCreation}
      onChannelSaved={(next, { endpointId }) => channelSaved(next, endpointId)}/>}
    {returnEndpoint && returnIds.length > 0 && <SupplierChannelBatchTest state={state} provider={provider} endpointId={returnEndpoint.id} associationIds={returnIds} ops={ops} close={() => ops.go({ returnTestEndpoint: null, returnTestAssociations: null })}/>}
    {ops.error && <Notice error>{ops.error}</Notice>}{ops.leaveDialog}</div>;
}
