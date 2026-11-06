import ChannelHealthDialog from './ChannelHealthDialog';
import { channelModelHealth } from './channel-health';
import SupplyModelPicker from './SupplyModelPicker';
import { supplyModelRecord } from './supply-models';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { PlugZap, BadgeDollarSign, Link, KeyRound, Pencil, Trash2, PackageMinus, Plus, Copy, MoreHorizontal, FileText } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/checkbox';
import { Table, TableHeader, TableBody, TableHead } from '../components/ui/table';
import { FilterPagination, DEFAULT_PAGE_SIZE } from '../components/FilterControls';
import { Row, Cell, Modal, Notice, SearchBox } from './ModelOperationsUI';
import { displayedCatalogueIds } from './moma-provider';
import { catalogueChannels, channelAddresses, channelFingerprint, channelLinkedModels } from './provider-channels';
import { catalogueMoneyDisplay, cataloguePurchasePrice } from './provider-catalogue-pricing';
import { supplierChannelResources, supplierChannelCode, supplierChannelName, supplierCredentialIssues } from './supplier-resources';
import { SupplierChannelDialog } from './SupplierResourceDialogs';
import SupplierChannelTest from './SupplierChannelTest';
import SupplierChannelConfiguration from './SupplierChannelConfiguration';
import SupplierChannelDetails from './SupplierChannelDetails';
import ChannelDiscovery from './ChannelDiscovery';
import SupplierChannelBatchTest from './SupplierChannelBatchTest';
import { channelSelectionGroups, channelSelectionServiceImpact } from './channel-selection-impact';
import { catalogueMappingRows, channelRowsPage, channelSelectionId, channelStatus, filterChannelRows, selectChannelRows } from './channel-selection';

const pending = <span className="supplier-key-pending">待配置</span>;
const channelActions = [['price', '维护模型成本', BadgeDollarSign], ['models', '添加关联模型', Plus], ['discover', '检查模型变更', FileText], ['address', 'API 地址', Link], ['credentials', 'API 密钥', KeyRound], ['info', '渠道信息', Pencil], ['copyModel', '复制上游模型 ID', Copy], ['copyAddress', '复制请求地址', Copy], ['linkModel', '关联模型资料', Link], ['unlink', '删除模型关联', Trash2]];
const actionLabels = { test: '测试', enable: '启用', disable: '停用' };
function ChannelAddress({ value }) {
  const clipped = value.length > 42, origin = value.match(/^https?:\/\/[^/]+/)?.[0];
  return <div className="supplier-channel-address supplier-address-text" title={value}><span className="supplier-url-head">{clipped ? origin || value.slice(0, 20) : value}</span>{clipped && <span className="supplier-url-tail">…{value.slice(value.lastIndexOf('/', value.lastIndexOf('/') - 1))}</span>}</div>;
}
function ChannelActions({ disabled, id, endpointId, onAction }) {
  const [open, setOpen] = useState(false), trigger = useRef(null);
  return <div className="supplier-catalogue-actions">
    <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`模型渠道详情：${id} / ${endpointId}`} onClick={event => onAction('details', event.currentTarget)}><FileText aria-hidden="true"/></Button></TooltipTrigger><TooltipContent>详情</TooltipContent></Tooltip>
    <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" disabled={disabled} aria-label={`测试连接：${id} / ${endpointId}`} onClick={event => onAction('test', event.currentTarget)}><PlugZap aria-hidden="true"/></Button></TooltipTrigger><TooltipContent>测试连接</TooltipContent></Tooltip>
    <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button ref={trigger} variant="ghost" size="icon-sm" aria-label={`更多操作：${id} / ${endpointId}`}><MoreHorizontal aria-hidden="true"/></Button></PopoverTrigger><PopoverContent align="end" className="supplier-channel-action-menu">{channelActions.map(([kind, label, Icon]) => <Button key={kind} variant="ghost" disabled={disabled && !kind.startsWith('copy')} onClick={() => { setOpen(false); onAction(kind, trigger.current); }}><Icon aria-hidden="true"/>{label}</Button>)}</PopoverContent></Popover>
  </div>;
}

export default function ProviderCatalogue({ state, provider, ops, entries, modelIds, endpointId, associationId }) {
  const [query, setQuery] = useState(ops.params.get('channelQ') || ''), [editing, setEditing] = useState(()=>{const owner=state.providers.find(row=>row.id===ops.params.get('channelProvider')),association=owner?.catalogConnections?.find(row=>row.id===ops.params.get('channelDetails'));return association?{kind:'details',modelId:association.modelId,associationId:association.id,providerId:owner.id}:null;}), [libraryId, setLibraryId] = useState('');
  const [page, setPage] = useState(Number(ops.params.get('channelPage')) || 1), [size, setSize] = useState(Number(ops.params.get('channelSize')) || DEFAULT_PAGE_SIZE), [selection, setSelection] = useState([]), [batch, setBatch] = useState(null), [allowHighCost, setAllowHighCost] = useState(false);
  const [testGroupIndex, setTestGroupIndex] = useState(0);
  const trigger = useRef(null), ids = provider ? displayedCatalogueIds(provider, state) : [], resources = provider ? supplierChannelResources(state, provider) : [];
  const allRows = catalogueMappingRows(state, provider, entries).filter(row => (!modelIds || modelIds.includes(row.modelId)) && (!endpointId || row.association?.endpoint?.id === endpointId) && (!associationId || row.association?.id === associationId)), filtered = filterChannelRows(allRows, query), current = channelRowsPage(filtered, page, size);
  const pageRows = current.rows.filter(row => row.association), filteredRows = filtered.filter(row => row.association), selectedIds = new Set(selection.map(channelSelectionId));
  const selectedPageCount = pageRows.filter(row => selectedIds.has(row.selectionId)).length;
  const pageChecked = pageRows.length > 0 && selectedPageCount === pageRows.length ? true : selectedPageCount ? 'indeterminate' : false;
  const credentialIssues = provider ? supplierCredentialIssues(state, provider, ids) : [];
  const open = (target, kind, modelId, associationId, owner) => ops.proceed(() => { trigger.current = target; ops.setError(''); setLibraryId(supplyModelRecord(state, owner, modelId)?.id || ''); setEditing({ kind, modelId, associationId, providerId: owner.id }); });
  const close = () => { ops.go({channelDetails:null,channelProvider:null},{saved:true,preserveScroll:true}); setEditing(null); ops.setError(''); requestAnimationFrame(() => trigger.current?.isConnected && trigger.current.focus()); };
  const closeEditor = () => editing?.returnToDetails ? setEditing({ ...editing, kind: 'details', returnToDetails: false }) : close();
  const cost=(owner,association,details=false)=>{
    const back=new URLSearchParams(location.hash.split('?')[1]);back.set('channelQ',query);back.set('channelPage',String(current.page));back.set('channelSize',String(size));back.set('channelProvider',owner.id);
    if(details)back.set('channelDetails',association.id);else back.delete('channelDetails');
    ops.go({provider:owner.id,association:association.id,returnTo:'#/admin-2/providers?'+back},{base:'model-costs',reset:true});
  };
  const editingProvider = editing && state.providers.find(row => row.id === editing.providerId);
  const edited = editingProvider && catalogueChannels(state, editingProvider, editing.modelId).find(row => row.id === editing.associationId);
  const copy = async (value, label) => { try { await navigator.clipboard.writeText(value); toast.success(`${label}已复制`); } catch { ops.setError('复制失败，请查看完整内容后重试'); } };
  const act = (row, kind, target) => {
    if(kind==='price')return cost(row.provider,row.association);
    if (kind === 'copyModel') return copy(row.association.upstreamModelId, '上游模型 ID');
    if (kind === 'copyAddress') return copy(channelAddresses(row.provider, row.association).map(item => item.baseUrl).join('\n'), '请求地址');
    open(target, kind, row.modelId, row.association?.id, row.provider);
  };
  const beginBatch = action => { setAllowHighCost(false); setTestGroupIndex(0); ops.setError(''); setBatch({ action, selections: structuredClone(selection) }); };
  const batchRows = batch ? batch.selections.map(item => allRows.find(row => row.selectionId === channelSelectionId(item))) : [];
  const stale = batch && batchRows.some((row, index) => !row?.association || channelFingerprint(row.association) !== batch.selections[index].expectedFingerprint);
  const highCost = batchRows.filter(row => ['image', 'video', 'audio'].includes(row?.model?.type));
  const notReady = batch?.action === 'enable' && batchRows.some(row => !row || !['可用', '未启用', '已停用'].includes(channelStatus(row.provider, row.association)));
  const relatedServices = [...new Map(batchRows.filter(Boolean).flatMap(row => channelLinkedModels(state, row.provider, row.association)).map(model => [model.id, model])).values()];
  const serviceImpact = batch && ['enable', 'disable'].includes(batch.action) ? channelSelectionServiceImpact(state, batch.selections) : [];
  const testGroups = batch?.action === 'test' ? channelSelectionGroups(batch.selections) : [];
  const testGroup = testGroups[Math.min(testGroupIndex, testGroups.length - 1)];
  const queuedBatchTest = Boolean(batch?.action === 'test' && testGroup);
  return <TooltipProvider>
    <div className="supplier-toolbar supplier-resource-toolbar"><SearchBox value={query} placeholder="搜索模型 / 渠道 / 上游 ID" onChange={value => { setQuery(value); setPage(1); }}/></div>
    {!entries && !resources.length && <div className="supplier-resource-notice"><Notice>当前供应商尚未配置供应渠道。创建渠道并关联模型后，才能进行连接测试及对外服务关联。</Notice></div>}
    {credentialIssues.map(({channel, modelIds}) => <div key={channel.id} className="supplier-resource-notice"><Notice error>已关联渠道「{supplierChannelCode(channel)} · {supplierChannelName(provider, channel)}」缺少可用 API 密钥，影响 {modelIds.length} 个模型。<Button variant="link" onClick={() => ops.go({ tab: 'api-keys', credentialChannel: channel.id })}>前往配置密钥</Button></Notice></div>)}
    {selection.length > 0 && <div className="supplier-selection-toolbar" role="group" aria-label="批量渠道操作"><span>已选 {selection.length} 项</span><Button variant="outline" size="sm" disabled={!ops.can} onClick={() => beginBatch('test')}>测试所选</Button><Button variant="outline" size="sm" disabled={!ops.can} onClick={() => beginBatch('enable')}>启用所选</Button><Button variant="outline" size="sm" disabled={!ops.can} onClick={() => beginBatch('disable')}>停用所选</Button>{filteredRows.length > pageRows.length && <Button variant="link" size="sm" disabled={!ops.can} onClick={() => setSelection(selectChannelRows(selection, filteredRows, true))}>选择全部筛选结果（{filteredRows.length}）</Button>}<Button variant="link" size="sm" onClick={() => setSelection([])}>清空选择</Button></div>}
    {!batch && ops.error && <Notice error>{ops.error}</Notice>}
    <div className="mo-table-scroll"><Table className="supplier-model-resource-table supplier-selectable-table" style={{ minWidth: 1250 }}><colgroup>{[40, 120, 115, 175, 125, 110, 100, 90, 100, 132].map((width, index) => <col key={index} style={{ width }}/>)}</colgroup><TableHeader><Row><TableHead scope="col"><Checkbox className="supplier-selection-checkbox" aria-label="选择当前页" checked={pageChecked} disabled={!ops.can || !pageRows.length} onCheckedChange={checked => setSelection(selectChannelRows(selection, pageRows, checked === true))}/></TableHead>{[entries ? '供应商' : '模型名称', '渠道名称/ID', '请求地址', '上游模型 ID', '接入状态', '采购条件', '操作'].map(label => <TableHead key={label} scope="col" colSpan={label==='采购条件'?3:1}>{label}</TableHead>)}</Row></TableHeader><TableBody>
      {current.rows.map(row => {
        const { provider: owner, modelId, model, association } = row, endpoint = association?.endpoint;
        const prices = association?.pricing.scenarios.length ? association.pricing.scenarios : [null];
        return <Row key={row.selectionId} data-supplier-model={modelId} data-resource-id={endpoint?.id} className="supplier-channel-start">
          <><Cell>{association && <Checkbox className="supplier-selection-checkbox" aria-label={`选择渠道模型 ${owner.name} / ${association.upstreamModelId} / ${supplierChannelCode(endpoint)}`} checked={selectedIds.has(row.selectionId)} disabled={!ops.can} onCheckedChange={checked => setSelection(selectChannelRows(selection, [row], checked === true))}/>}</Cell><Cell className="supplier-catalogue-identity">{entries ? <Button variant="link" className="supplier-owner-link" onClick={() => ops.go({ perspective: 'suppliers', provider: owner.id, tab: 'catalogue', resource: null })}>{owner.name}</Button> : <><strong>{model?.name || modelId}</strong>{model?.name !== (model?.modelId || modelId) && <code>{model?.modelId || modelId}</code>}</>}</Cell><Cell className="supplier-resource-name">{endpoint ? <><strong>{supplierChannelName(owner, endpoint)}</strong><code>{supplierChannelCode(endpoint)}</code></> : '—'}</Cell><Cell className="supplier-catalogue-connection">{association ? channelAddresses(owner, association).map((address, addressIndex) => <div className="supplier-protocol-address" key={addressIndex}><small>{address.protocol === 'OpenAI' ? 'OpenAI 兼容接口' : address.protocol}</small><ChannelAddress value={address.baseUrl}/></div>) : '—'}</Cell><Cell>{association ? <code title={association.upstreamModelId}>{association.upstreamModelId}</code> : '—'}</Cell><Cell className="supplier-channel-status">{channelStatus(owner, association)}{association && <Button variant="link" onClick={event => open(event.currentTarget, 'health', modelId, association.id, owner)}>健康：{channelModelHealth(owner, association).label}</Button>}</Cell></>
          <Cell colSpan={3}>{association && prices[0]?<div className="supplier-purchase-items">{prices.map((price,index)=><div key={index}><span>{price.name}{price.condition && <small>{price.condition}</small>}</span><strong>{price.listPrice==null && price.purchasePrice==null?pending:`${price.currency==='CNY'?'¥':price.currency+' '}${catalogueMoneyDisplay(cataloguePurchasePrice(price.listPrice,association.pricing.discountFactor,price.purchasePrice))}`}</strong><span>{price.unit || '—'}</span></div>)}</div>:association?pending:'待配置渠道'}</Cell>
          <Cell className="supplier-catalogue-operation-cell">{association ? <ChannelActions disabled={!ops.can} id={modelId} endpointId={association.endpointId} onAction={(kind, target) => act(row, kind, target)}/> : <div className="supplier-catalogue-actions supplier-catalogue-model-actions"><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" disabled={!ops.can} aria-label={'关联模型资料：' + modelId} onClick={event => open(event.currentTarget, 'linkModel', modelId, null, owner)}><Link aria-hidden="true"/></Button></TooltipTrigger><TooltipContent>关联模型资料</TooltipContent></Tooltip><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" disabled={!ops.can} aria-label={'移除供应模型：' + modelId} onClick={event => open(event.currentTarget, 'deleteModel', modelId, null, owner)}><PackageMinus aria-hidden="true"/></Button></TooltipTrigger><TooltipContent>移除供应模型</TooltipContent></Tooltip></div>}</Cell>
        </Row>;
      })}
    </TableBody></Table>{!filtered.length && <div className="mo-empty" role="status">{allRows.length ? '没有匹配的模型，请调整搜索条件。' : '尚未添加供应模型。'}</div>}</div>
    <FilterPagination total={filtered.length} page={current.page} size={size} onPageChange={setPage} onSizeChange={value => { setSize(value); setPage(1); }}/>
    {editing?.kind === 'health' && edited && <ChannelHealthDialog state={state} provider={editingProvider} endpoint={edited.endpoint} associationId={edited.id} ops={ops} close={closeEditor}/>}
    {editing?.kind === 'details' && edited && <SupplierChannelDetails state={state} provider={editingProvider} association={edited} ops={ops} close={close} onEdit={(kind, target) => { if(kind==='price'){cost(editingProvider,edited,true);return;} trigger.current = target; setEditing({ ...editing, kind, returnToDetails: true }); }}/>}
    {editing?.kind === 'linkModel' && <Modal title="关联模型资料" description={editingProvider.name + ' · ' + editing.modelId} onClose={() => ops.proceed(close)}><SupplyModelPicker ops={ops} state={state} value={libraryId} disabled={!ops.can} onChange={id => { setLibraryId(id); ops.dirty(true); ops.setError(''); }}/><p>当前供应模型的全部渠道将归入所选模型。渠道配置、价格及已上线服务保持不变。</p>{ops.error && <Notice error>{ops.error}</Notice>}<div className="supplier-key-actions"><Button variant="outline" onClick={() => ops.proceed(close)}>取消</Button><Button disabled={!ops.can || !libraryId} onClick={async () => { if (await ops.run('provider', { operation: 'supplierModelLink', objectId: editingProvider.id, values: { modelId: editing.modelId, libraryId, confirmed: true } })) close(); }}>确认关联</Button></div></Modal>}
    {['address', 'credentials', 'info'].includes(editing?.kind) && edited && <SupplierChannelDialog key={editing.kind + edited.endpointId} state={state} provider={editingProvider} endpoint={edited.endpoint} mode={editing.kind} ops={ops} close={closeEditor}/>}
    {editing?.kind === 'discover' && edited && <Modal wide title="检查模型变更" description={`${editingProvider.name} · ${supplierChannelName(editingProvider, edited.endpoint)}`} onClose={closeEditor}><ChannelDiscovery mode="changes" state={state} provider={editingProvider} configuration={edited.endpoint} ops={ops} onAppend={rows => { setEditing({ ...editing, kind: 'models', initialRows: rows }); ops.dirty(true); }}/><div className="supplier-key-actions"><Button type="button" variant="outline" onClick={closeEditor}>关闭</Button></div></Modal>}
    {editing?.kind === 'models' && edited && <SupplierChannelConfiguration key={edited.endpointId} initialRows={editing.initialRows} state={state} provider={editingProvider} endpoint={edited.endpoint} ops={ops} close={closeEditor}/>}
    {editing?.kind === 'test' && edited && <SupplierChannelTest state={state} provider={editingProvider} association={edited} ops={ops} close={closeEditor}/>}
    {['unlink', 'deleteModel'].includes(editing?.kind) && <Modal title={editing.kind === 'unlink' ? '删除模型渠道' : '移除供应模型'} description={editing.kind === 'unlink' && edited ? `${editing.modelId} · ${supplierChannelName(editingProvider, edited.endpoint)}` : editing.modelId} onClose={close}><p>{editing.kind === 'unlink' ? '删除当前模型与此渠道的关联，渠道资源及其他模型的关联保留。' : '仅移除当前供应商的模型供应关系；模型资料、其他供应商的关系及价格历史保留。'}如仍被服务或路由引用，请先解除服务映射。</p>{editing.kind === 'unlink' && !edited && <Notice error>当前模型渠道已变化，请关闭后重新选择。</Notice>}{ops.error && <Notice error>{ops.error}</Notice>}<div className="supplier-key-actions"><Button variant="outline" onClick={close}>取消</Button><Button variant="destructive" disabled={!ops.can || editing.kind === 'unlink' && !edited} onClick={async () => { if (await ops.run('provider', { operation: editing.kind === 'unlink' ? 'supplierAssociationRemove' : 'catalogueRemove', objectId: editingProvider.id, values: { modelId: editing.modelId, endpointId: edited?.endpointId, associationId: edited?.id, confirmed: true } })) close(); }}>确认{editing.kind === 'unlink' ? '删除' : '移除供应模型'}</Button></div></Modal>}
    {queuedBatchTest && !stale && <SupplierChannelBatchTest key={`${testGroup.providerId}:${testGroup.endpointId}:${testGroupIndex}`} state={state} provider={state.providers.find(row => row.id === testGroup.providerId)} endpointId={testGroup.endpointId} associationIds={testGroup.selections.map(row => row.associationId)} ops={ops} close={() => setBatch(null)} navigation={<div className="supplier-row-actions"><span>固定选择 {batch.selections.length} 项 · 第 {testGroupIndex + 1} / {testGroups.length} 组 · 本组 {testGroup.selections.length} 项</span><Button type="button" variant="outline" disabled={testGroupIndex === 0} onClick={() => setTestGroupIndex(index => index - 1)}>上一组</Button><Button type="button" variant="outline" disabled={testGroupIndex >= testGroups.length - 1} onClick={() => setTestGroupIndex(index => index + 1)}>下一组</Button></div>}/>}
    {batch && (!queuedBatchTest || stale) && <Modal title={`批量${actionLabels[batch.action]}模型渠道`} description={`固定选择 ${batch.selections.length} 条模型关联`} onClose={() => setBatch(null)}><div className="supplier-batch-confirmation">
      <p>涉及 {new Set(batch.selections.map(item => item.providerId)).size} 家供应商、{new Set(batch.selections.map(item => item.endpointId)).size} 个渠道。</p>
      {batch.action === 'test' ? <><p>所选配置已变化，请取消后重新选择。</p>{highCost.length > 0 && <label><Checkbox checked={allowHighCost} onCheckedChange={value => setAllowHighCost(value === true)}/>包含 {highCost.length} 项图片、视频或语音任务的配置检查</label>}</> : <>
        <p>{batch.action === 'enable' ? '将启用渠道及所选映射；未选模型不会自动恢复。采购价待补的映射不能用于正式服务。' : '将停用所选映射，保留渠道资源、服务关联与历史。请求仅在既有允许范围内回退。'}</p>
        {serviceImpact.length > 0 ? <><p>影响 {serviceImpact.length} 项已发布服务路由：</p><ul>{serviceImpact.map(service => <li key={service.id}><strong>{service.name}</strong> · <code>{service.callId}</code> · 路由 v{service.routeVersion}{batch.action === 'disable' ? service.unavailable ? <span> · 所选供给停用后无可用替代，新请求将不可用</span> : <span> · 剩余可用供给：{service.remaining.map(row => `${row.provider} / ${row.channel}`).join('、')}</span> : <span> · 恢复仅覆盖当前选择，不增加服务的允许供给</span>}</li>)}</ul></> : relatedServices.length > 0 && <><p>关联 {relatedServices.length} 项模型服务：</p><ul>{relatedServices.map(model => <li key={model.id}>{model.name}</li>)}</ul></>}
      </>}
      {stale && <Notice error>选中配置已变化或不存在，请取消并重新选择。</Notice>}{notReady && <Notice error>所选条目尚未全部通过当前配置验证，本次不能启用。</Notice>}{ops.error && <Notice error>{ops.error}</Notice>}
      <div className="supplier-key-actions"><Button variant="outline" onClick={() => setBatch(null)}>取消</Button><Button disabled={!ops.can || stale || notReady || batch.action === 'test'} onClick={async () => { if (await ops.run('supplierSelection', { action: batch.action, selections: batch.selections, confirmed: true, allowHighCost })) { setSelection([]); setBatch(null); } }}>{batch.action === 'test' ? '确认配置检查' : `确认${actionLabels[batch.action]}`}</Button></div>
    </div></Modal>}
  </TooltipProvider>;
}
