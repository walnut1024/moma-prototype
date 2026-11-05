import SupplierChannelBatchTest from './SupplierChannelBatchTest';
import SupplyModelView, { SupplyModelSidebar } from './SupplyModelView';
import ProviderEditor from './SupplierProfileDialog';
import { supplyModelDirectory } from './supply-models';
import { useRef, useState } from 'react';
import { Plus, CloudCog, Pencil, Power } from 'lucide-react';
import { MOMA_PROVIDER, supplierDirectory } from './moma-provider.js';
import { supplierChannelResources } from './supplier-resources';
import { Button } from '../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
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
    <nav className="supplier-sidebar-options" aria-label="供应商目录">
      {matches.map(item => {
        const groups = supplierModelChannelGroups(state, item), modelCount = groups.filter(row => row.modelId).length, channelCount = new Set(groups.flatMap(row => row.channels.map(channel => channel.endpointId)).filter(Boolean)).size;
        return <Button key={item.id} variant="ghost" aria-pressed={item.id === selected} title={providerCode(item)} onClick={() => onSelect(item.id)}><span>{item.name}{item.id===MOMA_PROVIDER.id && <Status>内置</Status>}</span><small>{modelCount} 款模型，{channelCount} 个渠道</small></Button>;
      })}
      {!matches.length && <p role="status">没有匹配的供应商</p>}
    </nav>
  </>;
}

export default function ProviderManagement(props) {
  const { state } = props, ops = useOperations(props, 'providers'), { params, go } = ops;
  const [creating, setCreating] = useState(null), [creationLibraryId,setCreationLibraryId]=useState('');
  const supplierTrigger = useRef(null), creationTrigger = useRef(null);
  const providers = supplierDirectory(state).filter(row => !row.id.startsWith('service-review-provider-') || row.id === params.get('provider')), defaultProvider = providers.find(item => item.id === 'provider-moma') || providers[0];
  const provider = providers.find(item => item.id === (params.get('provider') || defaultProvider?.id)), view = params.get('view'), tab = ['catalogue', 'api-keys'].includes(params.get('tab')) ? params.get('tab') : 'catalogue';
  const detail = (id, nextTab = tab, saved = false) => go({ provider: id, view: null, perspective: 'suppliers', tab: nextTab, endpoint: null, model: null, supply: null, q: null, page: null, status: null, connection: null, resource: null, credentialChannel: null, listQ: null, listPage: null }, { saved });
  const perspective = params.get('perspective') || 'suppliers';
  const closeCreation = () => { setCreating(null); ops.setError(''); requestAnimationFrame(() => (creationTrigger.current || supplierTrigger.current)?.focus()); };
  const models = supplyModelDirectory(state, providers), selectedModel = models.find(row => row.id === params.get('supplyModel')) || (!params.has('supplyModel') ? models.find(row => row.code.toLowerCase() === 'glm-5.2') || models[0] : null);
  const startCreation = (mode, event, libraryId='') => { setCreationLibraryId(libraryId); creationTrigger.current = event?.currentTarget; ops.setError(''); setCreating(mode); };
  const closeResource = () => { go({ resource: null }); requestAnimationFrame(() => document.querySelector('.supplier-detail-tabs [role=tab][data-state=active]')?.focus()); };
  let content;
  if (provider) {
    content = <>
      <Tabs value={tab} onValueChange={tab => go({ tab, q: null, page: null })} className="supplier-detail-tabs">
        <Card className="supplier-card supplier-detail-card">
      <div className="supplier-context">
      <SupplierHeading title={<>{provider.name}<Status good={provider.status === '已启用'}>{provider.status}</Status></>} description={<><span className="shrink-0">供应商 ID</span><code title={provider.id}>{provider.id}</code></>}>
        <Button variant="ghost" size="icon-sm" aria-label="编辑供应商资料" title="编辑供应商资料" disabled={!ops.can} onClick={() => go({ view: 'profile', tab })}><Pencil/></Button>
        {provider.status !== '已启用' && <Button variant="outline" size="sm" disabled={!ops.can} onClick={async () => await ops.run('provider', { operation: 'enableProvider', objectId: provider.id, values: {} })}><Power data-icon="inline-start"/>启用供应商</Button>}
      </SupplierHeading></div>

          <CardHeader><CardTitle><TabsList variant="line" aria-label="供应商详情"><TabsTrigger value="catalogue">模型渠道</TabsTrigger><TabsTrigger value="api-keys">共享API密钥</TabsTrigger></TabsList></CardTitle></CardHeader>
          <CardContent><TabsContent value={tab}>
            {tab === 'catalogue' ? <SupplierModelCatalogue key={provider.id} state={state} provider={provider} ops={ops} onAddModel={event => startCreation('model',event)} onAddChannel={(event,libraryId) => startCreation('channel',event,libraryId)}/> : <ProviderApiKeys key={provider.id} state={state} provider={provider} ops={ops}/>}
          </TabsContent></CardContent>
        </Card>
      </Tabs>
    </>;
  } else {
    content = <Notice error>{providers.length ? '该供应商不存在，请切换其他供应商。' : '尚未创建供应商，请先添加供应商。'}</Notice>;
  }
  const viewSwitch = <Tabs className="supplier-perspective" value={perspective} onValueChange={perspective => go({ perspective, resource: null })}><TabsList aria-label="模型接入视图"><TabsTrigger value="suppliers">供应商</TabsTrigger><TabsTrigger value="models">模型</TabsTrigger></TabsList></Tabs>;
  const returnEndpoint = state.endpoints.find(row => row.id === params.get('returnTestEndpoint') && row.providerId === provider?.id && !row.deletedAt);
  let returnIds = []; try { const parsed = JSON.parse(params.get('returnTestAssociations') || '[]'); if (Array.isArray(parsed) && parsed.length <= 50 && parsed.every(id => typeof id === 'string')) returnIds = parsed; } catch { /* Invalid return context does not open an operation. */ }
  return <div className="mo-workbench supplier-workbench">{params.get('origin')?.startsWith('#/admin-2/listing') && <Notice><Button variant="link" onClick={() => ops.proceed(() => { location.hash = params.get('origin'); })}>返回服务配置</Button></Notice>}{params.get('onboarding') && <Notice>上架进度已保留。<Button variant="link" onClick={() => ops.go({ view: 'add', draft: params.get('onboarding'), onboarding: null, provider: null, tab: null, step: state.modelOnboardings.find(item => item.id === params.get('onboarding'))?.step || 'select' }, { base: 'listing' })}>返回上架流程</Button></Notice>}<SupplierHeading title={<><CloudCog/>模型接入</>} description="统一管理模型的供应来源：同一模型可由多家供应商、多个渠道提供，集中维护接入、密钥与价格。">{perspective === 'suppliers' && <Button ref={supplierTrigger} variant="outline" size="sm" disabled={!ops.can} onClick={() => startCreation('provider')}><Plus/>添加供应商</Button>}</SupplierHeading><div className="supplier-layout"><aside className="supplier-sidebar" aria-label={perspective === 'models' ? '已接入模型列表' : '供应商列表'}>{viewSwitch}{perspective === 'models' ? <SupplyModelSidebar models={models} selected={selectedModel} ops={ops}/> : <SupplierSidebar state={state} providers={providers} selected={provider?.id} onSelect={id => detail(id)}/>}</aside>{perspective === 'models' ? <SupplyModelView state={state} selected={selectedModel} ops={ops}/> : <div className="supplier-body">{content}</div>}</div>
    {['model','channel'].includes(creating) && <SupplierAddDialog state={state} provider={perspective==='suppliers'?provider:undefined} libraryId={creationLibraryId || (perspective==='models'?selectedModel?.master?.id:undefined)} mode={creating} ops={ops} close={closeCreation}/>}
    {(creating === 'provider' || view === 'new' || view === 'profile' && provider) && <ProviderEditor key={view === 'profile' ? provider.id : 'new'} provider={view === 'profile' ? provider : undefined} ops={ops} cancel={() => ops.proceed(() => { closeCreation(); if (view) go({ view: null }, { saved: true }); })} done={(next, id) => { closeCreation(); detail(id, view === 'profile' ? tab : 'catalogue', true); }}/>}
    {returnEndpoint && returnIds.length > 0 && <SupplierChannelBatchTest state={state} provider={provider} endpointId={returnEndpoint.id} associationIds={returnIds} ops={ops} close={() => ops.go({ returnTestEndpoint: null, returnTestAssociations: null })}/>}
    {ops.error && <Notice error>{ops.error}</Notice>}{ops.leaveDialog}{provider && params.get('resource') && (() => { const endpoint = supplierChannelResources(state, provider).find(row => row.id === params.get('resource')); return endpoint ? <SupplierChannelDialog key={endpoint.id} state={state} provider={provider} endpoint={endpoint} ops={ops} close={closeResource}/> : <Modal title="渠道不存在" onClose={closeResource}><Notice error>渠道已变化，请重新选择。</Notice></Modal>; })()}</div>;
}
