import SupplierChannelBatchTest from './SupplierChannelBatchTest';
import SupplyModelView, { SupplyModelSidebar } from './SupplyModelView';
import ProviderEditor from './SupplierProfileDialog';
import { supplyModelDirectory } from './supply-models';
import { useRef, useState } from 'react';
import { CloudCog, Power } from 'lucide-react';
import { IconEdit, IconPlus } from '@douyinfe/semi-icons';
import { Button, Tabs } from '@douyinfe/semi-ui';
import { MOMA_PROVIDER, supplierDirectory } from './moma-provider.js';
import { supplierChannelResources } from './supplier-resources';
import { providerCode } from './model-operations';
import { Status, Notice, SearchBox, Modal, useOperations } from './ModelOperationsUI';
import SupplierModelCatalogue from './SupplierModelCatalogue';
import { supplierModelChannelGroups } from './supplier-model-channel-table';
import ProviderApiKeys from './ProviderApiKeys';
import SupplierAddDialog from './SupplierAddDialog';
import { SupplierChannelDialog } from './SupplierResourceDialogs';
import './supplier-workbench.css';

function SupplierHeading({ title, description, children }) {
  return <div className="supplier-heading"><div><h1>{title}</h1>{description && <p>{description}</p>}</div><div className="supplier-actions">{children}</div></div>;
}

function SupplierSidebar({ state, providers, selected, onSelect }) {
  const [query, setQuery] = useState('');
  const matches = providers.filter(item => `${item.name} ${providerCode(item)}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <>
    <SearchBox value={query} placeholder="搜索名称 / 英文编码" onChange={setQuery}/>
    <nav className="supplier-sidebar-options" aria-label="服务商目录">
      {matches.map(item => {
        const groups = supplierModelChannelGroups(state, item), modelCount = groups.filter(row => row.modelId).length, channelCount = new Set(groups.flatMap(row => row.channels.map(channel => channel.endpointId)).filter(Boolean)).size;
        return <Button key={item.id} theme="borderless" aria-pressed={item.id === selected} title={providerCode(item)} onClick={() => onSelect(item.id)}><span>{item.name}{item.id===MOMA_PROVIDER.id && <Status>内置</Status>}</span><small>{modelCount} 款模型，{channelCount} 个渠道</small></Button>;
      })}
      {!matches.length && <p role="status">没有匹配的服务商</p>}
    </nav>
  </>;
}

export default function ProviderManagement(props) {
  const { state } = props, ops = useOperations(props, 'providers'), { params, go } = ops;
  const [creating, setCreating] = useState(() => params.get('addingModel')==='1' ? 'model' : null), [creationLibraryId,setCreationLibraryId]=useState('');
  const supplierTrigger = useRef(null), creationTrigger = useRef(null);
  const providers = supplierDirectory(state).filter(row => !row.id.startsWith('service-review-provider-') || row.id === params.get('provider')), defaultProvider = providers.find(item => item.id === 'provider-moma') || providers[0];
  const provider = providers.find(item => item.id === (params.get('provider') || defaultProvider?.id)), view = params.get('view'), tab = ['catalogue', 'api-keys'].includes(params.get('tab')) ? params.get('tab') : 'catalogue';
  const detail = (id, nextTab = tab, saved = false) => go({ provider: id, view: null, perspective: 'suppliers', tab: nextTab, endpoint: null, model: null, supply: null, q: null, page: null, status: null, connection: null, resource: null, credentialChannel: null, listQ: null, listPage: null }, { saved });
  const perspective = params.get('perspective') || 'suppliers';
  const closeCreation = () => { setCreating(null); if(params.has('addingModel')) go({addingModel:null,selectedModels:null},{saved:true}); ops.setError(''); requestAnimationFrame(() => (creationTrigger.current || supplierTrigger.current)?.focus()); };
  const models = supplyModelDirectory(state, providers), selectedModel = models.find(row => row.id === params.get('supplyModel')) || (!params.has('supplyModel') ? models.find(row => row.code.toLowerCase() === 'glm-5.2') || models[0] : null);
  const startCreation = (mode, event, libraryId='') => { setCreationLibraryId(libraryId); creationTrigger.current = event?.currentTarget; ops.setError(''); setCreating(mode); };
  const closeResource = () => { go({ resource: null }); requestAnimationFrame(() => document.querySelector('.supplier-detail-tabs .semi-tabs-tab-active')?.focus()); };
  let content;
  if (provider) {
    content = <div className="supplier-card supplier-detail-card">
      <div className="supplier-context">
      <SupplierHeading title={<>{provider.name}<Status good={provider.status === '已启用'}>{provider.status}</Status></>} description={<><span className="shrink-0">服务商 ID</span><code title={provider.id}>{provider.id}</code></>}>
        <Button icon={<IconEdit aria-hidden="true"/>} theme="borderless" aria-label="编辑服务商资料" title="编辑服务商资料" disabled={!ops.can} onClick={() => go({ view: 'profile', tab })}/>
        {provider.status !== '已启用' && <Button theme="light" size="small" disabled={!ops.can} icon={<Power aria-hidden="true"/>} onClick={async () => await ops.run('provider', { operation: 'enableProvider', objectId: provider.id, values: {} })}>启用服务商</Button>}
      </SupplierHeading></div>

      <Tabs className="supplier-detail-tabs" type="line" lazyRender activeKey={tab} onChange={tab => go({ tab, q: null, page: null })} aria-label="服务商详情">
        <Tabs.TabPane tab="模型渠道" itemKey="catalogue">{tab === 'catalogue' ? <SupplierModelCatalogue key={provider.id} state={state} provider={provider} ops={ops} onAddModel={event => startCreation('model',event)} onAddChannel={(event,libraryId) => startCreation('channel',event,libraryId)}/> : null}</Tabs.TabPane>
        <Tabs.TabPane tab="API 密钥池" itemKey="api-keys">{tab === 'api-keys' ? <ProviderApiKeys key={provider.id} state={state} provider={provider} ops={ops}/> : null}</Tabs.TabPane>
      </Tabs>
    </div>;
  } else {
    content = <Notice error>{providers.length ? '该服务商不存在，请切换其他服务商。' : '尚未创建服务商，请先添加服务商。'}</Notice>;
  }
  const viewSwitch = <Tabs className="supplier-perspective" type="button" activeKey={perspective} onChange={perspective => go({ perspective, resource: null })} aria-label="渠道接入视图"><Tabs.TabPane tab="服务商" itemKey="suppliers"/><Tabs.TabPane tab="模型" itemKey="models"/></Tabs>;
  const returnEndpoint = state.endpoints.find(row => row.id === params.get('returnTestEndpoint') && row.providerId === provider?.id && !row.deletedAt);
  let returnIds = []; try { const parsed = JSON.parse(params.get('returnTestAssociations') || '[]'); if (Array.isArray(parsed) && parsed.length <= 50 && parsed.every(id => typeof id === 'string')) returnIds = parsed; } catch { /* Invalid return context does not open an operation. */ }
  return <div className="mo-workbench supplier-workbench">{params.get('origin')?.startsWith('#/admin-2/listing') && <Notice><Button type="tertiary" theme="borderless" onClick={() => ops.proceed(() => { location.hash = params.get('origin'); })}>返回服务配置</Button></Notice>}{params.get('onboarding') && <Notice>上架进度已保留。<Button type="tertiary" theme="borderless" onClick={() => ops.go({ view: 'add', draft: params.get('onboarding'), onboarding: null, provider: null, tab: null, step: state.modelOnboardings.find(item => item.id === params.get('onboarding'))?.step || 'select' }, { base: 'listing' })}>返回上架流程</Button></Notice>}<SupplierHeading title={<><CloudCog/>渠道接入</>} description="统一管理模型的供应来源：同一模型可由多家服务商、多个渠道提供，维护接入和上游密钥，成本在模型成本维护。">{perspective === 'suppliers' && <Button ref={supplierTrigger} theme="light" size="small" disabled={!ops.can} icon={<IconPlus size="small" aria-hidden="true"/>} onClick={() => startCreation('provider')}>添加服务商</Button>}</SupplierHeading><div className="supplier-layout"><aside className="supplier-sidebar" aria-label={perspective === 'models' ? '已接入模型列表' : '服务商列表'}>{viewSwitch}{perspective === 'models' ? <SupplyModelSidebar models={models} selected={selectedModel} ops={ops}/> : <SupplierSidebar state={state} providers={providers} selected={provider?.id} onSelect={id => detail(id)}/>}</aside>{perspective === 'models' ? <SupplyModelView state={state} selected={selectedModel} ops={ops}/> : <div className="supplier-body">{content}</div>}</div>
    {['model','channel'].includes(creating) && <SupplierAddDialog state={state} provider={perspective==='suppliers'?provider:undefined} libraryId={creationLibraryId || (perspective==='models'?selectedModel?.master?.id:undefined)} mode={creating} ops={ops} close={closeCreation}/>}
    {(creating === 'provider' || view === 'new' || view === 'profile' && provider) && <ProviderEditor key={view === 'profile' ? provider.id : 'new'} provider={view === 'profile' ? provider : undefined} ops={ops} cancel={() => ops.proceed(() => { closeCreation(); if (view) go({ view: null }, { saved: true }); })} done={(next, id) => { closeCreation(); detail(id, view === 'profile' ? tab : 'catalogue', true); }}/>}
    {returnEndpoint && returnIds.length > 0 && <SupplierChannelBatchTest state={state} provider={provider} endpointId={returnEndpoint.id} associationIds={returnIds} ops={ops} close={() => ops.go({ returnTestEndpoint: null, returnTestAssociations: null })}/>}
    {ops.error && <Notice error>{ops.error}</Notice>}{ops.leaveDialog}{provider && params.get('resource') && (() => { const endpoint = supplierChannelResources(state, provider).find(row => row.id === params.get('resource')); return endpoint ? <SupplierChannelDialog key={endpoint.id} state={state} provider={provider} endpoint={endpoint} ops={ops} close={closeResource}/> : <Modal title="渠道不存在" onClose={closeResource}><Notice error>渠道已变化，请重新选择。</Notice></Modal>; })()}</div>;
}
