import SupplierChannelBatchTest from './SupplierChannelBatchTest';
import DevelopmentNotes from './DevelopmentNotes';
import SupplyModelView, { SupplyModelSidebar } from './SupplyModelView';
import ProviderEditor from './SupplierProfileDialog';
import { supplyModelDirectory } from './supply-models';
import { useRef, useState } from 'react';
import { Plus, CloudCog, Pencil, MoreHorizontal, Power, PowerOff, Info } from 'lucide-react';
import { displayedCatalogueIds, supplierDirectory } from './moma-provider.js';
import { supplierChannelResources } from './supplier-resources';
import { Button } from '../components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent } from '../components/ui/card';
import { Textarea } from '../components/ui/textarea';
import { Popover, PopoverTrigger, PopoverContent } from '../components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Field } from './ModelMetadataForm';
import { providerImpact, PROVIDER_TYPES } from './provider-management';
import { providerCode } from './model-operations';
import { Status, Notice, SearchBox, Modal, useOperations } from './ModelOperationsUI';
import ProviderCatalogue from './ProviderCatalogue';
import ProviderApiKeys from './ProviderApiKeys';
import SupplierChannelConfiguration from './SupplierChannelConfiguration';
import { SupplierChannelDialog, SupplierModelEditor } from './SupplierResourceDialogs';
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
        const ids = displayedCatalogueIds(item, state), channelCount = supplierChannelResources(state, item).length;
        return <Button key={item.id} variant="ghost" aria-pressed={item.id === selected} title={providerCode(item)} onClick={() => onSelect(item.id)}><span>{item.name}</span><small>{ids.length} 款模型，{channelCount} 个渠道</small></Button>;
      })}
      {!matches.length && <p role="status">没有匹配的供应商</p>}
    </nav>
  </>;
}

function SupplierMore({ label, disabled, onStop }) {
  const [open, setOpen] = useState(false);
  return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button type="button" variant="ghost" size="icon-sm" aria-label={label}><MoreHorizontal/></Button></PopoverTrigger><PopoverContent align="end" className="supplier-action-menu"><Button type="button" variant="ghost" disabled={disabled} onClick={() => { setOpen(false); onStop(); }}><PowerOff data-icon="inline-start"/>停用</Button></PopoverContent></Popover>;
}

function CatalogueImport({ state, provider, libraryId, ops, mode, setMode }) {
  const [text, setText] = useState(''), [batchProviderId, setBatchProviderId] = useState(null);
  const batchProvider = state.providers.find(row => row.id === batchProviderId);
  const trigger = useRef(null);
  const channelTrigger = useRef(null);
  const close = savedModel => { if (typeof savedModel === 'string' && ops.params.get('perspective') !== 'suppliers') ops.go({ supplyModel: savedModel }, { saved: true }); const target = mode === 'channel' ? channelTrigger : trigger; setMode(null); setText(''); ops.setError(''); requestAnimationFrame(() => target.current?.focus()); };
  const cancel = () => ops.proceed(close);
  const inputProps = { 'aria-label': '批量模型 ID', 'aria-invalid': Boolean(ops.error), 'aria-describedby': ops.error ? 'catalogue-import-error' : undefined, autoCapitalize: 'none', spellCheck: false, value: text, disabled: !ops.can, onChange: event => { setText(event.target.value); ops.setError(''); ops.dirty(true); } };
  return <>
    <div className="supplier-row-actions supplier-create-actions">
    <Button ref={trigger} variant="outline" size="sm" disabled={!ops.can} onClick={() => { ops.setError(''); setMode('single'); }}><Plus data-icon="inline-start"/>添加模型</Button>
    <Button ref={channelTrigger} size="sm" disabled={!ops.can} onClick={() => { ops.setError(''); setMode('channel'); }}><Plus data-icon="inline-start"/>添加渠道</Button>
    </div>
    {mode === 'channel' && <SupplierChannelConfiguration state={state} provider={provider} libraryId={libraryId} ops={ops} close={close}/>}
    {mode === 'single' && <SupplierModelEditor state={state} provider={provider} ops={ops} close={close} onBatch={id => { setBatchProviderId(id); ops.setError(''); setMode('batch'); }}/>}
    {mode === 'batch' && batchProvider && <Modal title="批量添加模型" description={batchProvider.name} onClose={cancel}><form className="supplier-import-form" noValidate onSubmit={event => {
      event.preventDefault();
      if (ops.run('provider', { operation: 'catalogueImport', objectId: batchProvider.id, values: { mode, text } })) close();
    }}>
      <Field label="模型资料 ID / 编码（每行一个）*" hint="从模型资料库登记供应关系；最多 2000 个，空行与重复项自动忽略。"><Textarea {...inputProps} rows={8} placeholder={'glm-5.2\nbge-m3'}/></Field>
      <p className="supplier-price-hint">登记后可添加渠道，维护上游模型 ID 和采购价。</p>
      {ops.error && <p role="alert" id="catalogue-import-error" className="supplier-key-error">{ops.error}</p>}
      <div className="supplier-key-actions"><Button type="button" variant="outline" onClick={cancel}>取消</Button><Button type="submit" disabled={!ops.can}>批量添加</Button></div>
    </form></Modal>}
  </>;
}

export default function ProviderManagement(props) {
  const { state } = props, ops = useOperations(props, 'providers'), { params, go } = ops;
  const [dialog, setDialog] = useState(null), [creating, setCreating] = useState(null);
  const supplierTrigger = useRef(null);
  const providers = supplierDirectory(state).filter(row => !row.id.startsWith('service-review-provider-') || row.id === params.get('provider')), defaultProvider = providers.find(item => item.id === 'provider-moma') || providers[0];
  const provider = providers.find(item => item.id === (params.get('provider') || defaultProvider?.id)), view = params.get('view'), tab = ['catalogue', 'api-keys', 'basic'].includes(params.get('tab')) ? params.get('tab') : 'catalogue';
  const detail = (id, nextTab = tab, saved = false) => go({ provider: id, view: null, perspective: 'suppliers', tab: nextTab, endpoint: null, model: null, supply: null, q: null, page: null, status: null, connection: null, resource: null, credentialChannel: null, listQ: null, listPage: null }, { saved });
  const perspective = params.get('perspective') || (params.has('provider') || params.has('tab') || view ? 'suppliers' : 'models');
  const closeCreation = () => { setCreating(null); ops.setError(''); requestAnimationFrame(() => supplierTrigger.current?.focus()); };
  const models = supplyModelDirectory(state, providers), selectedModel = models.find(row => row.id === params.get('supplyModel')) || (!params.has('supplyModel') ? models.find(row => row.code.toLowerCase() === 'glm-5.2') || models[0] : null);
  const startCreation = mode => { ops.setError(''); setCreating(mode); };
  const closeResource = () => { go({ resource: null }); requestAnimationFrame(() => document.querySelector('.supplier-detail-tabs [role=tab][data-state=active]')?.focus()); };
  const modal = (kind, item) => ops.proceed(() => setDialog({ kind, item }));
  let content;
  if (provider) {
    const descriptions = { basic: '供应商的主体资料和接入信息。' };
    content = <>
      <Tabs value={tab} onValueChange={tab => go({ tab, q: null, page: null })} className="supplier-detail-tabs">
        <Card className="supplier-card supplier-detail-card">
      <div className="supplier-context">
      <SupplierHeading title={<>{provider.name}<Status good={provider.status === '已启用'}>{provider.status}</Status></>} description={<><span className="shrink-0">供应商 ID</span><code title={provider.id}>{provider.id}</code></>}>
        {provider.status === '已启用' ? <SupplierMore label="供应商更多操作" disabled={!ops.can} onStop={() => modal('provider', provider)}/> : <Button variant="outline" size="sm" disabled={!ops.can} onClick={() => ops.run('provider', { operation: 'enableProvider', objectId: provider.id, values: {} })}><Power data-icon="inline-start"/>启用供应商</Button>}
      </SupplierHeading></div>

          <CardHeader><CardTitle><TabsList variant="line" aria-label="供应商详情"><span className="supplier-catalogue-tab"><TabsTrigger value="catalogue">模型及渠道</TabsTrigger><TooltipProvider><Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon-sm" aria-label="渠道说明"><Info aria-hidden="true"/></Button></TooltipTrigger><TooltipContent>渠道是访问供应商服务的一组接入配置，包含接口类型、API 地址和认证方式。一个渠道可关联多个模型，各自维护上游模型 ID 和采购价。</TooltipContent></Tooltip></TooltipProvider></span><TabsTrigger value="api-keys">API 密钥</TabsTrigger><TabsTrigger value="basic">基本信息</TabsTrigger></TabsList></CardTitle>{tab === 'basic' && <CardDescription>{descriptions[tab]}</CardDescription>}<CardAction>
            {tab === 'basic' ? <Button variant="outline" size="sm" disabled={!ops.can} onClick={() => go({ view: 'profile', tab: 'basic' })}><Pencil data-icon="inline-start"/>编辑资料</Button> : null}
          </CardAction></CardHeader>
          <CardContent><TabsContent value={tab}>
            {tab === 'catalogue' ? <ProviderCatalogue key={provider.id} state={state} provider={provider} ops={ops}/> : tab === 'api-keys' ? <ProviderApiKeys key={provider.id} state={state} provider={provider} ops={ops}/> : tab === 'basic' ? <dl className="supplier-facts">{[['供应商名称', provider.name], ['英文编码', providerCode(provider)], ['供给类型', PROVIDER_TYPES[provider.sourceType] || '—'], ['接口协议', provider.defaultProtocol || 'OpenAI Chat Completions'], ['默认 API 地址', provider.baseUrl || '—'], ['联系人', provider.contact || '—'], ['联系人号码/邮箱', provider.contactInfo || '—'], ['备注', provider.description || '—']].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl> : null}
          </TabsContent></CardContent>
        </Card>
      </Tabs>
    </>;
  } else {
    content = <Notice error>{providers.length ? '该供应商不存在，请切换其他供应商。' : '尚未创建供应商，请先添加供应商。'}</Notice>;
  }
  const viewSwitch = <Tabs className="supplier-perspective" value={perspective} onValueChange={perspective => go({ perspective, resource: null })}><TabsList aria-label="供应管理视图"><TabsTrigger value="models">模型</TabsTrigger><TabsTrigger value="suppliers">供应商</TabsTrigger></TabsList></Tabs>;
  const returnEndpoint = state.endpoints.find(row => row.id === params.get('returnTestEndpoint') && row.providerId === provider?.id && !row.deletedAt);
  let returnIds = []; try { const parsed = JSON.parse(params.get('returnTestAssociations') || '[]'); if (Array.isArray(parsed) && parsed.length <= 50 && parsed.every(id => typeof id === 'string')) returnIds = parsed; } catch { /* Invalid return context does not open an operation. */ }
  const impact = dialog && providerImpact(state, dialog.kind === 'provider' ? dialog.item.id : dialog.item.providerId, dialog.kind === 'connection' ? dialog.item.id : null);
  return <div className="mo-workbench supplier-workbench">{params.get('origin')?.startsWith('#/admin-2/listing') && <Notice><Button variant="link" onClick={() => ops.proceed(() => { location.hash = params.get('origin'); })}>返回服务配置</Button></Notice>}{params.get('onboarding') && <Notice>上架进度已保留。<Button variant="link" onClick={() => ops.go({ view: 'add', draft: params.get('onboarding'), onboarding: null, provider: null, tab: null, step: state.modelOnboardings.find(item => item.id === params.get('onboarding'))?.step || 'select' }, { base: 'listing' })}>返回上架流程</Button></Notice>}<SupplierHeading title={<><CloudCog/>供应管理<DevelopmentNotes area="供应管理"/></>} description="统一管理模型的供应来源：同一模型可由多家供应商、多个渠道提供，集中维护接入、密钥与价格。"><Button ref={supplierTrigger} variant="outline" size="sm" disabled={!ops.can} onClick={() => startCreation('provider')}><Plus/>添加供应商</Button><CatalogueImport key={perspective + (provider?.id || '')} state={state} provider={perspective === 'suppliers' ? provider : undefined} libraryId={perspective === 'models' ? selectedModel?.master?.id : undefined} ops={ops} mode={creating} setMode={setCreating}/></SupplierHeading><div className="supplier-layout"><aside className="supplier-sidebar" aria-label={perspective === 'models' ? '供应模型列表' : '供应商列表'}>{viewSwitch}{perspective === 'models' ? <SupplyModelSidebar models={models} selected={selectedModel} ops={ops}/> : <SupplierSidebar state={state} providers={providers} selected={provider?.id} onSelect={id => detail(id)}/>}</aside>{perspective === 'models' ? <SupplyModelView state={state} selected={selectedModel} ops={ops}/> : <div className="supplier-body">{content}</div>}</div>
    {(creating === 'provider' || view === 'new' || view === 'profile' && provider) && <ProviderEditor key={view === 'profile' ? provider.id : 'new'} provider={view === 'profile' ? provider : undefined} ops={ops} cancel={() => ops.proceed(() => { closeCreation(); if (view) go({ view: null }, { saved: true }); })} done={(next, id) => { closeCreation(); detail(id, view === 'profile' ? 'basic' : 'catalogue', true); }}/>}
    {returnEndpoint && returnIds.length > 0 && <SupplierChannelBatchTest state={state} provider={provider} endpointId={returnEndpoint.id} associationIds={returnIds} ops={ops} close={() => ops.go({ returnTestEndpoint: null, returnTestAssociations: null })}/>}
    {ops.error && <Notice error>{ops.error}</Notice>}{ops.leaveDialog}{provider && params.get('resource') && (() => { const endpoint = supplierChannelResources(state, provider).find(row => row.id === params.get('resource')); return endpoint ? <SupplierChannelDialog key={endpoint.id} state={state} provider={provider} endpoint={endpoint} ops={ops} close={closeResource}/> : <Modal title="渠道不存在" onClose={closeResource}><Notice error>渠道已变化，请重新选择。</Notice></Modal>; })()}{dialog && <Modal title={`停用${dialog.kind === 'provider' ? '供应商' : '接入'}：${dialog.item.name}`} description="停用会影响实际调用，其他供应商不会自动替换。" onClose={() => setDialog(null)}><Notice error>影响 {impact.supplies.length} 条模型供给，其中 {impact.exposed.length} 个已上架模型将失去可用供给。</Notice><ul>{[...new Set(impact.supplies.map(item => item.modelId))].map(id => <li key={id}>{state.models.find(item => item.id === id)?.name}</li>)}</ul><p className="mo-muted">已有订购影响人数：待接入订购关联数据。</p><div className="mo-footer"><Button variant="outline" onClick={() => setDialog(null)}>取消</Button><Button disabled={!ops.can} onClick={() => { if (ops.run('provider', { operation: dialog.kind === 'provider' ? 'disableProvider' : 'disableConnection', objectId: dialog.item.id, values: { confirmed: true } })) setDialog(null); }}>确认停用</Button></div>{ops.error && <Notice error>{ops.error}</Notice>}</Modal>}</div>;
}
