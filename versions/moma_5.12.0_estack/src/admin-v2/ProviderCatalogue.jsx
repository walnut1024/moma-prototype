import SupplyModelPicker from './SupplyModelPicker';
import { supplyModelRecord } from './supply-models';
import { Fragment, useRef, useState } from 'react';
import { PlugZap, BadgeDollarSign, Link, KeyRound, Pencil, Trash2, PackageMinus, Plus } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import { Button } from '../components/ui/button';
import { Table, TableHeader, TableBody, TableHead } from '../components/ui/table';
import { Row, Cell, Modal, Notice, SearchBox, CopyId } from './ModelOperationsUI';
import { displayedCatalogueIds, providerCatalogueModel } from './moma-provider';
import { catalogueChannels, channelAddresses } from './provider-channels';
import { catalogueMoneyDisplay } from './provider-catalogue-pricing';
import { supplierChannelResources, supplierChannelCode, supplierChannelName, supplierCredentialIssues } from './supplier-resources';
import { SupplierAssociationDialog, SupplierChannelDialog } from './SupplierResourceDialogs';
import SupplierChannelTest from './SupplierChannelTest';
import SupplierChannelConfiguration from './SupplierChannelConfiguration';

const pending = <span className="supplier-key-pending">待配置</span>;
const channelActions = [['test', '测试连接', PlugZap], ['price', '采购价', BadgeDollarSign], ['models', '添加关联模型', Plus], ['address', 'API 地址', Link], ['credentials', 'API 密钥', KeyRound], ['info', '渠道信息', Pencil], ['unlink', '删除', Trash2]];
function ChannelAddress({ value }) {
  const clipped = value.length > 42, origin = value.match(/^https?:\/\/[^/]+/)?.[0];
  return <div className="supplier-channel-address supplier-address-text" title={value}><span className="supplier-url-head">{clipped ? origin || value.slice(0, 20) : value}</span>{clipped && <span className="supplier-url-tail">…{value.slice(value.lastIndexOf('/', value.lastIndexOf('/') - 1))}</span>}</div>;
}

export default function ProviderCatalogue({ state, provider, ops, entries }) {
  const [query, setQuery] = useState(''), [editing, setEditing] = useState(null), [libraryId, setLibraryId] = useState('');
  const trigger = useRef(null), ids = provider ? displayedCatalogueIds(provider, state) : [], resources = provider ? supplierChannelResources(state, provider) : [];
  const visible = entries || ids.filter(id => `${id} ${supplyModelRecord(state, provider, id)?.name || providerCatalogueModel(provider, id)?.name || ''}`.toLowerCase().includes(query.toLowerCase().trim())).map(modelId => ({ provider, modelId }));
  const credentialIssues = provider ? supplierCredentialIssues(state, provider, ids) : [];
  const open = (event, kind, modelId, associationId, owner) => ops.proceed(() => { trigger.current = event.currentTarget; ops.setError(''); setLibraryId(supplyModelRecord(state, owner, modelId)?.id || ''); setEditing({ kind, modelId, associationId, providerId: owner.id }); });
  const close = () => { setEditing(null); ops.setError(''); requestAnimationFrame(() => trigger.current?.isConnected && trigger.current.focus()); };
  const editingProvider = editing && state.providers.find(row => row.id === editing.providerId);
  const edited = editingProvider && catalogueChannels(state, editingProvider, editing.modelId).find(row => row.id === editing.associationId);
  return <TooltipProvider>
    {!entries && <div className="supplier-toolbar supplier-resource-toolbar"><SearchBox value={query} placeholder="搜索模型名称 / Model ID" onChange={setQuery}/></div>}
    {!entries && !resources.length && <div className="supplier-resource-notice"><Notice>当前供应商尚未配置供应渠道。创建渠道并关联模型后，才能进行连接测试及对外服务关联。</Notice></div>}
    {credentialIssues.map(({channel, modelIds}) => <div key={channel.id} className="supplier-resource-notice"><Notice error>已关联渠道「{supplierChannelCode(channel)} · {supplierChannelName(provider, channel)}」缺少可用 API 凭证，影响 {modelIds.length} 个模型。配置凭证后，请先测试并启用渠道，再检测和启用模型关联。<Button variant="link" onClick={() => ops.go({ tab: 'api-keys', credentialChannel: channel.id })}>前往配置密钥</Button></Notice></div>)}
    <div className="mo-table-scroll"><Table className="supplier-model-resource-table"><colgroup>{Array.from({ length: 8 }, (_, index) => <col key={index}/>)}</colgroup><TableHeader><Row>{[entries ? '供应商' : '模型名称', '渠道名称/ID', 'API 地址', '上游模型 ID', '计费项', '采购价', '计价单位', '操作'].map(label => <TableHead key={label} scope="col">{label}</TableHead>)}</Row></TableHeader><TableBody>
      {visible.map(({ provider, modelId: id }) => {
        const model = supplyModelRecord(state, provider, id) || providerCatalogueModel(provider, id), channels = catalogueChannels(state, provider, id).filter(row => row.endpointId);
        const rows = channels.length ? channels : [null], modelSpan = rows.reduce((sum, row) => sum + Math.max(1, row?.pricing.scenarios.length || 0), 0);
        return <Fragment key={provider.id + id}>{rows.map((association, channelIndex) => {
          const prices = association?.pricing.scenarios.length ? association.pricing.scenarios : [null], endpoint = association?.endpoint;
          return <Fragment key={association?.id || 'empty'}>{prices.map((price, index) => <Row key={index} data-supplier-model={id} data-resource-id={endpoint?.id} className={channelIndex === 0 && index === 0 ? 'supplier-model-start' : index === 0 ? 'supplier-channel-start' : 'supplier-billing-row'}>
            {(entries || channelIndex === 0) && index === 0 && <Cell rowSpan={entries ? prices.length : modelSpan} className="supplier-catalogue-identity">{entries ? <Button variant="link" className="supplier-owner-link" onClick={() => ops.go({ perspective: 'suppliers', provider: provider.id, tab: 'catalogue', resource: null })}>{provider.name}</Button> : <><strong>{model?.name || id}</strong>{model?.name !== (model?.modelId || id) && <code>{model?.modelId || id}</code>}<Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" disabled={!ops.can} aria-label={'关联模型资料：' + id} onClick={event => open(event, 'linkModel', id, null, provider)}><Link/></Button></TooltipTrigger><TooltipContent>{supplyModelRecord(state, provider, id)?.name || '关联模型资料'}</TooltipContent></Tooltip></>}</Cell>}
            {index === 0 && <><Cell rowSpan={prices.length} className="supplier-resource-name">{endpoint ? <><strong>{supplierChannelName(provider, endpoint)}</strong><code>{supplierChannelCode(endpoint)}</code></> : '—'}</Cell><Cell rowSpan={prices.length} className="supplier-catalogue-connection">{association ? channelAddresses(provider, association).map(address => <div className="supplier-protocol-address" key={address.protocol}><small>{address.protocol === 'OpenAI' ? 'OpenAI 兼容接口' : address.protocol}</small><ChannelAddress value={address.baseUrl}/></div>) : '—'}</Cell><Cell rowSpan={prices.length}>{association ? <CopyId value={association.upstreamModelId} label="上游模型 ID"/> : '—'}</Cell></>}
            {price ? <><Cell>{price.name}{price.condition && <small>{price.condition}</small>}</Cell><Cell className="supplier-price-number">{price.listPrice == null ? pending : `${price.currency === 'CNY' ? '¥' : price.currency + ' '}${catalogueMoneyDisplay(price.listPrice)}`}</Cell><Cell>{price.unit || '—'}</Cell></> : <Cell colSpan={3}>{association ? pending : <span className="supplier-key-pending">待配置渠道</span>}</Cell>}
            {index === 0 && <Cell rowSpan={prices.length} className="supplier-catalogue-operation-cell">{association && <div className="supplier-catalogue-actions">{channelActions.map(([kind, label, Icon]) => <Tooltip key={kind}><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" disabled={!ops.can} aria-label={label + '：' + id + ' / ' + association.endpointId} onClick={event => open(event, kind, id, association.id, provider)}><Icon aria-hidden="true"/></Button></TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>)}</div>}{!channels.length && <div className="supplier-catalogue-actions supplier-catalogue-model-actions"><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" disabled={!ops.can} aria-label={'移除供应模型：' + id} onClick={event => open(event, 'deleteModel', id, null, provider)}><PackageMinus aria-hidden="true"/></Button></TooltipTrigger><TooltipContent>移除供应模型</TooltipContent></Tooltip></div>}</Cell>}
          </Row>)}</Fragment>;
        })}</Fragment>;
      })}
    </TableBody></Table>{!visible.length && <div className="mo-empty" role="status">{ids.length ? '没有匹配的模型，请调整搜索条件。' : '尚未添加供应模型。'}</div>}</div>
    {editing?.kind === 'linkModel' && <Modal title="关联模型资料" description={editingProvider.name + ' · ' + editing.modelId} onClose={() => ops.proceed(close)}><SupplyModelPicker ops={ops} state={state} value={libraryId} disabled={!ops.can} onChange={id => { setLibraryId(id); ops.dirty(true); ops.setError(''); }}/><p>当前供应模型的全部渠道将归入所选模型。渠道配置、价格及已上线服务保持不变。</p>{ops.error && <Notice error>{ops.error}</Notice>}<div className="supplier-key-actions"><Button variant="outline" onClick={() => ops.proceed(close)}>取消</Button><Button disabled={!ops.can || !libraryId} onClick={() => { if (ops.run('provider', { operation: 'supplierModelLink', objectId: editingProvider.id, values: { modelId: editing.modelId, libraryId, confirmed: true } })) close(); }}>确认关联</Button></div></Modal>}
    {editing?.kind === 'price' && <SupplierAssociationDialog key={editing.modelId + editing.associationId} state={state} provider={editingProvider} modelId={editing.modelId} association={edited} ops={ops} close={close}/>}
    {['address', 'credentials', 'info'].includes(editing?.kind) && edited && <SupplierChannelDialog key={editing.kind + edited.endpointId} state={state} provider={editingProvider} endpoint={edited.endpoint} mode={editing.kind} ops={ops} close={close}/>}
    {editing?.kind === 'models' && edited && <SupplierChannelConfiguration state={state} provider={editingProvider} endpoint={edited.endpoint} ops={ops} close={close}/>}
    {editing?.kind === 'test' && edited && <SupplierChannelTest state={state} provider={editingProvider} association={edited} ops={ops} close={close}/>}
    {['unlink', 'deleteModel'].includes(editing?.kind) && <Modal title={editing.kind === 'unlink' ? '删除模型渠道' : '移除供应模型'} description={editing.kind === 'unlink' && edited ? `${editing.modelId} · ${supplierChannelName(editingProvider, edited.endpoint)}` : editing.modelId} onClose={close}><p>{editing.kind === 'unlink' ? '删除当前模型与此渠道的关联，渠道资源及其他模型的关联保留。' : '仅移除当前供应商的模型供应关系；模型资料、其他供应商的关系及价格历史保留。'}如仍被服务或路由引用，请先解除服务映射。</p>{editing.kind === 'unlink' && !edited && <Notice error>当前模型渠道已变化，请关闭后重新选择。</Notice>}{ops.error && <Notice error>{ops.error}</Notice>}<div className="supplier-key-actions"><Button variant="outline" onClick={close}>取消</Button><Button variant="destructive" disabled={!ops.can || editing.kind === 'unlink' && !edited} onClick={() => { if (ops.run('provider', { operation: editing.kind === 'unlink' ? 'supplierAssociationRemove' : 'catalogueRemove', objectId: editingProvider.id, values: { modelId: editing.modelId, endpointId: edited?.endpointId, associationId: edited?.id, confirmed: true } })) close(); }}>确认{editing.kind === 'unlink' ? '删除' : '移除供应模型'}</Button></div></Modal>}
  </TooltipProvider>;
}
