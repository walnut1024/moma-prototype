import { useRef, useState } from 'react';
import { Plus, CircleHelp } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import ModelFieldLabel from './ModelFieldLabel';
import { GridTable, Row, Cell, Modal, Notice, SearchBox, Pagination, CopyId, Status } from './ModelOperationsUI';
import { catalogueMoneyDisplay } from './provider-catalogue-pricing';
import { modelSupplyGroups, supplierModelChannelGroups, supplierModelChannelRows, supplierChannelInterface } from './supplier-model-channel-table';
import { channelStatus } from './channel-selection';
import { supplierChannelResources, supplierChannelName } from './supplier-resources';
import { SupplierChannelDialog } from './SupplierResourceDialogs';
import SupplierChannelBatchTest from './SupplierChannelBatchTest';
import { channelLinkedModels } from './provider-channels';
import { supplierDeletionBlock } from './provider-channels';

export default function SupplierModelCatalogue({ state, provider, ops, onAddModel, onAddChannel, modelEntries }) {
  const [query, setQuery] = useState(''), [page, setPage] = useState(1), [resource, setResource] = useState(null), [deleting, setDeleting] = useState(null);
  const trigger = useRef(null);
  const ownerId=resource?.providerId || deleting?.providerId;
  const owner=ownerId?state.providers.find(row=>row.id===ownerId):provider;
  const groups = modelEntries?modelSupplyGroups(state,modelEntries):supplierModelChannelGroups(state, provider), search = query.trim().toLowerCase();
  const filtered = groups.filter(group => `${group.name} ${group.modelId || ''} ${group.channels.map(channel => `${channel.name || channel.endpoint?.name || ''} ${channel.upstreamModelId || ''} ${channel.endpointId || ''}`).join(' ')}`.toLowerCase().includes(search));
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / 10)));
  const endpoint = (owner?supplierChannelResources(state, owner):[]).find(row => row.id === resource?.endpointId);
  const association = resource?.associationId && groups.flatMap(group => group.channels).find(row => row.id === resource.associationId);
  const open = (event, setter, value) => { trigger.current = event.currentTarget; ops.setError(''); setter(value); };
  const close = () => { setResource(null); setDeleting(null); ops.setError(''); requestAnimationFrame(() => (trigger.current?.isConnected ? trigger.current : document.querySelector('.supplier-resource-toolbar input'))?.focus()); };
  const blocked = !ops.can || Boolean(ops.conflict);
  const stopping=resource?.kind==='stop' && association;
  const affected=stopping ? channelLinkedModels(state,owner,stopping) : [];
  const deletionGroup = deleting && groups.find(row => (row.owner || provider)?.id===owner?.id && row.modelIds?.includes(deleting.modelId));
  const deletionChannel = deleting?.endpointId && (deleting.modelId ? deletionGroup?.channels.find(row => row.id === deleting.channelId && row.endpointId === deleting.endpointId) : supplierChannelResources(state, owner).some(row => row.id === deleting.endpointId) ? { id: deleting.endpointId, endpointId: deleting.endpointId } : null);
  const deletion = deleting && (deleting.endpointId ? deletionChannel : deletionGroup) ? supplierDeletionBlock(state, owner, deleting.modelId, deletionChannel) : { message: '该模型或渠道已变化，请关闭后重新选择。', models: [] };
  const remove = async () => {
    if (deletion.message || blocked) return;
    const operation = deleting.endpointId ? deleting.modelId ? 'supplierCatalogueChannelDelete' : 'supplierChannelDelete' : 'catalogueRemove';
    if (await ops.run('provider', { operation, objectId: owner.id, values: { modelId: deleting.modelId, endpointId: deleting.endpointId, associationId: deleting.channelId, confirmed: true } })) close();
  };
  const purchaseHeading = <span className="supplier-price-heading">渠道采购价<Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon-sm" aria-label="渠道采购价说明"><CircleHelp/></Button></TooltipTrigger><TooltipContent>当前平台采购供应商的价格，用于成本及利润分析</TooltipContent></Tooltip></span>;
  return <TooltipProvider>
    <div className="supplier-toolbar supplier-resource-toolbar"><SearchBox value={query} placeholder="搜索模型 / 渠道" onChange={value => { setQuery(value); setPage(1); }}/>{!modelEntries && <><Button size="sm" disabled={blocked} onClick={onAddModel}><Plus/>接入新模型</Button><Button size="sm" variant="outline" disabled={blocked} onClick={onAddChannel}><Plus/>接入新渠道</Button></>}</div>
    <GridTable className="supplier-model-channel-table" headings={[modelEntries?'供应商':'模型名称','渠道','状态',<ModelFieldLabel key="upstream" name="上游模型标识"/>,'上游 API 地址','计费项',purchaseHeading,'计费单位','操作']} empty={!filtered.length} emptyMessage="暂无匹配的模型或渠道。">
      {filtered.slice((currentPage - 1) * 10, currentPage * 10).flatMap(group => supplierModelChannelRows(group).map(({ channel, price, channelSpan, modelSpan }, index) => {
        const groupOwner=group.owner || provider;
        const api = supplierChannelInterface(groupOwner, channel), status = channelStatus(groupOwner, channel);
        const enabled=channel?.enabled && ['运行中','需关注'].includes(channel.endpoint.status);
        return <Row key={`${groupOwner.id}:${group.id}:${channel?.id || 'empty'}:${index}`}>
          {modelSpan > 0 && <Cell className="supplier-identity-cell" rowSpan={modelSpan}>{modelEntries?<Button variant="link" onClick={()=>ops.go({perspective:'suppliers',provider:groupOwner.id,tab:'catalogue'})}>{groupOwner.name}</Button>:<strong>{group.name}</strong>}</Cell>}
          {channelSpan > 0 && <><Cell rowSpan={channelSpan}>{channel?.endpointId ? <strong>{supplierChannelName(groupOwner,channel.endpoint)}</strong> : '待添加渠道'}</Cell><Cell rowSpan={channelSpan}><Status good={status === '可用'}>{status}</Status></Cell><Cell rowSpan={channelSpan}>{channel?.upstreamModelId ? <CopyId value={channel.upstreamModelId} label="上游模型标识"/> : '—'}</Cell><Cell rowSpan={channelSpan}>{api.url ? <CopyId value={api.url} label="API 地址"/> : '—'}</Cell></>}
          <Cell>{price?.name || '—'}{price?.condition && <small>{price.condition}</small>}</Cell>
          <Cell className="supplier-price-number">{price?.purchasePrice == null ? '未配置' : `${price.currency || ''} ${catalogueMoneyDisplay(price.purchasePrice)}`}</Cell><Cell>{price?.unit || '—'}</Cell>
          {channelSpan > 0 && <Cell className="supplier-action-cell" rowSpan={channelSpan}><div className="supplier-row-actions">{channel?.endpointId ? <><Button variant="link" disabled={blocked} onClick={event => open(event,setResource,{providerId:groupOwner.id,endpointId:channel.endpointId,associationId:channel.unlinked?null:channel.id,kind:'edit'})}>编辑</Button><Button variant="link" disabled={blocked || channel.unlinked} title={channel.unlinked?'请先关联模型后测试连接':undefined} onClick={event => open(event,setResource,{providerId:groupOwner.id,endpointId:channel.endpointId,associationId:channel.id,kind:'test'})}>测试连接</Button>{!channel.unlinked && <Button variant="link" disabled={blocked} onClick={event=>open(event,setResource,{providerId:groupOwner.id,endpointId:channel.endpointId,associationId:channel.id,kind:enabled?'stop':'test'})}>{enabled?'停用供给':'启用供给'}</Button>}<Button variant="link" disabled={blocked} onClick={event => open(event,setDeleting,{providerId:groupOwner.id,modelId:channel.modelId || group.modelId,channelId:channel.id,endpointId:channel.endpointId,name:supplierChannelName(groupOwner,channel.endpoint)})}>删除渠道</Button></> : <><Button variant="link" disabled={blocked} onClick={event => modelEntries?ops.go({perspective:'suppliers',provider:groupOwner.id,tab:'catalogue'}):onAddChannel(event,group.master?.id)}>接入新渠道</Button><Button variant="link" disabled={blocked} onClick={event => open(event,setDeleting,{providerId:groupOwner.id,modelId:group.modelId,name:group.name})}>删除模型</Button></>}</div></Cell>}
        </Row>;
      }))}
    </GridTable><Pagination count={filtered.length} page={currentPage} setPage={setPage}/>
    {endpoint && resource.kind === 'edit' && <SupplierChannelDialog key={endpoint.id+':'+(association?.id || '')} state={state} provider={owner} endpoint={endpoint} association={association || undefined} mode="info" ops={ops} close={close}/>}
    {endpoint && resource.kind === 'test' && (endpoint.interfaceType ? <SupplierChannelBatchTest state={state} provider={owner} endpointId={endpoint.id} associationIds={[association.id]} ops={ops} close={close}/> : <SupplierChannelDialog key={endpoint.id} state={state} provider={owner} endpoint={endpoint} association={association} mode="info" ops={ops} close={close}/>)}
    {stopping && <Modal title="停用模型供给" description={owner.name+' · '+endpoint.name} onClose={close}><p>停用后，该模型供给不再承接新请求，其他渠道、价格和历史保留。</p>{affected.length>0 && <Notice error>关联服务：{affected.map(row=>row.name).join('、')}。请先替换这些服务的路由或停止服务；确认停用将使仍在使用该供给的请求无法完成。</Notice>}<div className="mo-footer"><Button variant="outline" onClick={close}>取消</Button><Button disabled={blocked} onClick={async()=>{if(await ops.run('provider',{operation:'channelDisable',objectId:owner.id,values:{modelId:stopping.modelId,channelId:stopping.id,confirmed:true}}))close();}}>确认停用供给</Button></div>{ops.error && <Notice error>{ops.error}</Notice>}</Modal>}
    {deleting && <Modal title={deletion.message ? '暂不能删除' : deleting.endpointId ? '删除渠道' : '删除模型'} description={`${owner.name} · ${deleting.name}`} onClose={close}>
      {deletion.message ? <><Notice error>{deletion.message}</Notice>{deletion.models.length > 0 && <div><p>先在以下服务处理路由、映射或供应商引用：</p>{deletion.models.map(model=><Button key={model.id} variant="link" onClick={()=>ops.proceed(()=>{close();ops.go({model:model.id,panel:'routing',routeProvider:owner.id,mapping:model.serviceMode==='provider'?`provider:${model.id}:${owner.id}`:`standard:${model.id}`},{base:'listing'});})}>前往 {model.name} → 路由及映射</Button>)}</div>}</> : <p>{deleting.endpointId ? deleting.modelId ? '确认删除当前模型的此渠道？其他模型共用的渠道会保留；未被其他模型使用的渠道资源一并删除。' : '确认删除此未关联模型的渠道？' : '确认删除当前供应商的模型登记？模型资料及其他供应商的登记会保留。'}历史计费与调用记录保留。</p>}
      {ops.error && <Notice error>{ops.error}</Notice>}<div className="mo-footer"><Button type="button" variant="outline" onClick={close}>{deletion.message ? '我知道了' : '取消'}</Button>{!deletion.message && <Button type="button" variant="destructive" disabled={blocked} onClick={remove}>确认删除</Button>}</div>
    </Modal>}
  </TooltipProvider>;
}
