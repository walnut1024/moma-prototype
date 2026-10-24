import { useEffect, useRef, useState } from 'react';
import { Plus, CloudCog, Pencil, MoreHorizontal, Power, PowerOff, Trash2, ChevronDown } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { supplierDirectory } from './moma-provider.js';
import { Button } from '../components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent, CardFooter } from '../components/ui/card';
import { Textarea } from '../components/ui/textarea';
import { Popover, PopoverTrigger, PopoverContent } from '../components/ui/popover';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Field } from './ModelMetadataForm';
import { providerImpact, providerConnectionDraft, PROVIDER_TYPES } from './provider-management';
import { providerCode } from './model-operations';
import { Status, Notice, SearchBox, Modal, useOperations, ProviderFields, ConnectionFields, emptyProvider, emptyConnection } from './ModelOperationsUI';
import ProviderCatalogue, { CataloguePriceEditor } from './ProviderCatalogue';
import ProviderApiKeys from './ProviderApiKeys';
import './supplier-workbench.css';

function SupplierHeading({ title, description, children }) {
  return <div className="supplier-heading"><div><h1>{title}</h1>{description && <p>{description}</p>}</div><div className="supplier-actions">{children}</div></div>;
}

function SupplierSidebar({ providers, selected, onSelect }) {
  const [query, setQuery] = useState('');
  const matches = providers.filter(item => `${item.name} ${providerCode(item)}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <aside className="supplier-sidebar" aria-label="供应商列表">
    <div className="supplier-sidebar-heading"><h2>切换供应商</h2><span>{providers.length} 家</span></div>
    <SearchBox value={query} placeholder="搜索名称 / 英文编码" onChange={setQuery}/>
    <nav className="supplier-sidebar-options" aria-label="切换供应商">
      {matches.map(item => <Button key={item.id} variant="ghost" aria-pressed={item.id === selected} title={providerCode(item)} onClick={() => onSelect(item.id)}><span>{item.name}</span><small>{item.catalogModelIds?.length || 0} 个模型 · {item.status}</small></Button>)}
      {!matches.length && <p role="status">没有匹配的供应商</p>}
    </nav>
  </aside>;
}

function SupplierMore({ label, disabled, onStop }) {
  const [open, setOpen] = useState(false);
  return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button type="button" variant="ghost" size="icon-sm" aria-label={label}><MoreHorizontal/></Button></PopoverTrigger><PopoverContent align="end" className="supplier-action-menu"><Button type="button" variant="ghost" disabled={disabled} onClick={() => { setOpen(false); onStop(); }}><PowerOff data-icon="inline-start"/>停用</Button></PopoverContent></Popover>;
}

function CatalogueImport({ state, provider, ops, manageDictionary }) {
  const [mode, setMode] = useState(null), [text, setText] = useState('');
  const trigger = useRef(null);
  const close = () => { setMode(null); setText(''); ops.setError(''); requestAnimationFrame(() => trigger.current?.focus()); };
  const cancel = () => ops.proceed(close);
  const inputProps = { 'aria-label': '批量模型 ID', 'aria-invalid': Boolean(ops.error), 'aria-describedby': ops.error ? 'catalogue-import-error' : undefined, autoCapitalize: 'none', spellCheck: false, value: text, disabled: !ops.can, onChange: event => { setText(event.target.value); ops.setError(''); ops.dirty(true); } };
  return <>
    <DropdownMenu.Root modal={false}><DropdownMenu.Trigger asChild><Button ref={trigger} size="sm" disabled={!ops.can}><Plus data-icon="inline-start"/>添加模型<ChevronDown data-icon="inline-end"/></Button></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content align="end" sideOffset={4} className="supplier-import-menu" onCloseAutoFocus={event => { if (mode) event.preventDefault(); }}>
      <DropdownMenu.Item onSelect={() => { ops.setError(''); setMode('single'); }}>添加</DropdownMenu.Item>
      <DropdownMenu.Item onSelect={() => { ops.setError(''); setMode('batch'); }}>批量添加</DropdownMenu.Item>
    </DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
    {mode === 'single' && <CataloguePriceEditor adding state={state} provider={provider} ops={ops} close={close} manageDictionary={manageDictionary}/> }
    {mode === 'batch' && <Modal title="批量添加模型" description={provider.name} onClose={cancel}><form className="supplier-import-form" noValidate onSubmit={event => {
      event.preventDefault();
      if (ops.run('provider', { operation: 'catalogueImport', objectId: provider.id, values: { mode, text } })) close();
    }}>
      <Field label="上游 Model ID（每行一个）*" hint="最多 2000 个模型；空行、重复项和已存在的 Model ID 自动忽略。"><Textarea {...inputProps} rows={8} placeholder={'Model/Alpha\nModel/Beta'}/></Field>
      <p className="supplier-price-hint">添加后可在模型目录中配置目录价和采购折扣。</p>
      {ops.error && <p role="alert" id="catalogue-import-error" className="supplier-key-error">{ops.error}</p>}
      <div className="supplier-key-actions"><Button type="button" variant="outline" onClick={cancel}>取消</Button><Button type="submit" disabled={!ops.can}>批量添加</Button></div>
    </form></Modal>}
  </>;
}

function ProviderEditor({ provider, ops, done, cancel }) {
  const [value, setValue] = useState(() => provider ? { ...emptyProvider(), ...provider, code: providerCode(provider) } : emptyProvider());
  const [connections, setConnections] = useState(() => [{ ...emptyConnection(), id: crypto.randomUUID() }]), [saving, setSaving] = useState(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const change = next => { setValue(next); ops.setError(''); ops.dirty(true); };
  const changeConnections = next => { setConnections(next); ops.setError(''); ops.dirty(true); };
  const disabled = !ops.can || saving;
  return <Card className="supplier-card"><form className="supplier-editor supplier-registration" onSubmit={async event => {
    event.preventDefault();
    if (disabled) return;
    setSaving(true); ops.setError('');
    try {
      const prepared = [];
      if (!provider) for (const [index, connection] of connections.entries()) {
        try { prepared.push(await providerConnectionDraft(connection)); } catch (error) { throw new Error('连接 ' + (index + 1) + '：' + error.message); }
      }
      if (!active.current) return;
      const next = ops.run('providerRegistration', { providerId: provider?.id, provider: value, connections: prepared });
      if (next) done(next, provider?.id || next.audits[0].objectId);
    } catch (error) { if (active.current) ops.setError(error.message); }
    finally { if (active.current) setSaving(false); }
  }}>
    <CardHeader><CardTitle><h2>供应商资料</h2></CardTitle><CardDescription>{provider ? '维护供应商基本信息。' : '填写供应商资料与连接信息，创建后再导入模型目录。'}</CardDescription></CardHeader>
    <CardContent><ProviderFields value={value} editing={Boolean(provider)} disabled={disabled} onChange={change}>
      {!provider && <section className="mo-span supplier-connection-config" aria-label="连接信息配置">
        <div className="supplier-config-heading"><h3>连接信息配置 *</h3><Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => changeConnections([...connections, { ...emptyConnection(), id: crypto.randomUUID() }])}><Plus data-icon="inline-start"/>添加连接</Button></div>
        {connections.map((connection, index) => <section className="supplier-registration-connection" aria-label={'连接 ' + (index + 1)} key={connection.id}>
          <div className="supplier-config-heading"><h4>连接 {index + 1}</h4><Button type="button" variant="ghost" size="sm" disabled={disabled || connections.length === 1} aria-label={'移除连接 ' + (index + 1)} onClick={() => changeConnections(connections.filter(item => item.id !== connection.id))}><Trash2 data-icon="inline-start"/>移除连接</Button></div>
          <ConnectionFields prefix={'连接 ' + (index + 1) + ' '} value={connection} optionalKey={value.sourceType === 'selfHosted'} disabled={disabled} onChange={next => changeConnections(connections.map(item => item.id === connection.id ? next : item))}/>
        </section>)}
      </section>}
    </ProviderFields></CardContent>
    <CardFooter><span>保存后可在模型目录中添加或批量导入模型。</span><Button type="button" variant="outline" disabled={saving} onClick={cancel}>取消</Button><Button type="submit" disabled={disabled}>{saving ? '保存中…' : '保存供应商'}</Button></CardFooter>
  </form></Card>;
}

export default function ProviderManagement(props) {
  const { state } = props, ops = useOperations(props, 'providers'), { params, go } = ops;
  const [dialog, setDialog] = useState(null);
  const providers = supplierDirectory(state), defaultProvider = providers.find(item => item.id === 'provider-moma') || providers[0];
  const provider = providers.find(item => item.id === (params.get('provider') || defaultProvider?.id)), view = params.get('view'), tab = ['catalogue', 'api-keys', 'basic'].includes(params.get('tab')) ? params.get('tab') : 'catalogue';
  const detail = (id, nextTab = tab, saved = false) => go({ provider: id, view: null, tab: nextTab, endpoint: null, model: null, supply: null, q: null, page: null, status: null, connection: null, listQ: null, listPage: null }, { saved });
  const home = () => detail(provider?.id || defaultProvider?.id);
  const modal = (kind, item) => ops.proceed(() => setDialog({ kind, item }));
  const manageDictionary = () => ops.proceed(() => { location.hash = '#/admin-2/tariff-dictionary'; });
  let content;
  if (view === 'new' || view === 'profile' && provider) {
    content = <><SupplierHeading title={view === 'profile' ? '编辑供应商' : '添加供应商'} description={view === 'profile' ? provider.name : '登记供应商信息，建立模型服务接入。'}></SupplierHeading><ProviderEditor key={view === 'profile' ? provider.id : 'new'} provider={view === 'profile' ? provider : undefined} ops={ops} cancel={() => view === 'profile' ? detail(provider.id, 'basic') : home()} done={(next, id) => detail(id, view === 'profile' ? 'basic' : 'catalogue', true)}/></>;
  } else if (provider) {
    const descriptions = { basic: '供应商的主体资料和接入信息。' };
    content = <>
      <Tabs value={tab} onValueChange={tab => go({ tab, q: null, page: null })} className="supplier-detail-tabs">
        <Card className="supplier-card supplier-detail-card">
      <div className="supplier-context">
      <SupplierHeading title={<>{provider.name}<Status good={provider.status === '已启用'}>{provider.status}</Status></>} description={<><code>{providerCode(provider)}</code><span>{PROVIDER_TYPES[provider.sourceType]}</span></>}>
        {provider.status === '已启用' ? <SupplierMore label="供应商更多操作" disabled={!ops.can} onStop={() => modal('provider', provider)}/> : <Button variant="outline" size="sm" disabled={!ops.can} onClick={() => ops.run('provider', { operation: 'enableProvider', objectId: provider.id, values: {} })}><Power data-icon="inline-start"/>启用供应商</Button>}
      </SupplierHeading></div>

          <CardHeader><CardTitle><TabsList variant="line" aria-label="供应商详情"><TabsTrigger value="catalogue">模型目录</TabsTrigger><TabsTrigger value="api-keys">API Key</TabsTrigger><TabsTrigger value="basic">基本信息</TabsTrigger></TabsList></CardTitle>{tab === 'basic' && <CardDescription>{descriptions[tab]}</CardDescription>}<CardAction>
            {tab === 'catalogue' ? <CatalogueImport key={provider.id} state={state} provider={provider} ops={ops} manageDictionary={manageDictionary} onStop={ep => modal('connection', ep)}/> : tab === 'basic' ? <Button variant="outline" size="sm" disabled={!ops.can} onClick={() => go({ view: 'profile', tab: 'basic' })}><Pencil data-icon="inline-start"/>编辑资料</Button> : null}
          </CardAction></CardHeader>
          <CardContent><TabsContent value={tab}>
            {tab === 'catalogue' ? <ProviderCatalogue key={provider.id} state={state} provider={provider} ops={ops} manageDictionary={manageDictionary} onStop={ep => modal('connection', ep)}/> : tab === 'api-keys' ? <ProviderApiKeys key={provider.id} state={state} provider={provider} ops={ops}/> : tab === 'basic' ? <dl className="supplier-facts">{[['供应商名称', provider.name], ['英文编码', providerCode(provider)], ['供给类型', PROVIDER_TYPES[provider.sourceType] || '—'], ['联系人', provider.contact || '—'], ['联系人号码/邮箱', provider.contactInfo || '—'], ['备注', provider.description || '—']].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl> : null}
          </TabsContent></CardContent>
        </Card>
      </Tabs>
    </>;
  } else {
    content = <Notice error>{providers.length ? '该供应商不存在，请切换其他供应商。' : '尚未创建供应商，请先添加供应商。'}</Notice>;
  }
  const impact = dialog && providerImpact(state, dialog.kind === 'provider' ? dialog.item.id : dialog.item.providerId, dialog.kind === 'connection' ? dialog.item.id : null);
  return <div className="mo-workbench supplier-workbench">{params.get('onboarding') && <Notice>上架进度已保留。<Button variant="link" onClick={() => ops.go({ view: 'add', draft: params.get('onboarding'), onboarding: null, provider: null, tab: null, step: state.modelOnboardings.find(item => item.id === params.get('onboarding'))?.step || 'select' }, { base: 'listing' })}>返回上架流程</Button></Notice>}{view !== 'new' && <SupplierHeading title={<><CloudCog/>供应商</>}><Button size="sm" disabled={!ops.can} onClick={() => go({ view: 'new', provider: provider?.id || null })}><Plus data-icon="inline-start"/>添加供应商</Button></SupplierHeading>}{view !== 'new' && providers.length > 0 ? <div className="supplier-layout"><SupplierSidebar providers={providers} selected={provider?.id} onSelect={id => detail(id)}/><div className="supplier-body">{content}</div></div> : content}{ops.error && <Notice error>{ops.error}</Notice>}{ops.leaveDialog}{dialog && <Modal title={`停用${dialog.kind === 'provider' ? '供应商' : '接入'}：${dialog.item.name}`} description="停用会影响实际调用，其他供应商不会自动替换。" onClose={() => setDialog(null)}><Notice error>影响 {impact.supplies.length} 条模型供给，其中 {impact.exposed.length} 个已上架模型将失去可用供给。</Notice><ul>{[...new Set(impact.supplies.map(item => item.modelId))].map(id => <li key={id}>{state.models.find(item => item.id === id)?.name}</li>)}</ul><p className="mo-muted">已有订购影响人数：待接入订购关联数据。</p><div className="mo-footer"><Button variant="outline" onClick={() => setDialog(null)}>取消</Button><Button disabled={!ops.can} onClick={() => { if (ops.run('provider', { operation: dialog.kind === 'provider' ? 'disableProvider' : 'disableConnection', objectId: dialog.item.id, values: { confirmed: true } })) setDialog(null); }}>确认停用</Button></div>{ops.error && <Notice error>{ops.error}</Notice>}</Modal>}</div>;
}
