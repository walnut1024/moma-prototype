import { useState } from 'react';
import { Plus, Trash2, Search } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Checkbox } from '../components/ui/checkbox';
import { Choice, Field } from './ModelMetadataForm';
import { CatalogueModelPicker } from './CatalogueModelPicker';
import { Modal, Notice, GridTable, Row, Cell, CopyId } from './ModelOperationsUI';
import { activeModelSalePrice, modelSaleRevision, unifiedBillingDraft, availableServiceChannels, serviceAssociationChannels, serviceChannelCosts, serviceChannelId, providerServices, activeProviderPrice, providerPriceRevision } from './service-workspace';
import { displayedCatalogueIds, supplierDirectory } from './moma-provider';
import { channelUrl } from './provider-channels';
import { modelCode, modelSupplies, priceItems, displayTime } from './model-management';
import { itemMoney } from './SupplyPriceEditor';

function ConflictNotice({ops}) {
  return ops.conflict && <Notice error>其他页面的数据已变化，当前输入保留。载入后请重新打开配置核对。<Button type="button" variant="link" onClick={ops.reload}>载入最新数据</Button></Notice>;
}

function RetailPriceFields({rows,setRows,ops,prefix}) {
  const update=(index,patch)=>setRows(rows.map((item,i)=>i===index?{...item,...patch}:item));
  return <>
    <Button type="button" variant="outline" disabled={!ops.can || rows.length>=100} onClick={()=>setRows([...rows,{name:'',condition:'',unit:'',currency:'CNY',amount:''}])}><Plus/>添加计费项</Button>
    <GridTable className="sm-price-form" headings={['计费项','适用条件','计价单位','货币','平台售价','操作']} empty={!rows.length} emptyMessage="请添加对外计费项，0 表示免费，金额必填。">{rows.map((item,index)=><Row key={index}>
      {['name','condition','unit'].map((key,i)=><Cell key={key}><Input aria-label={`${prefix}第 ${index+1} 项${['名称','条件','单位'][i]}`} value={item[key]} disabled={!ops.can} onChange={event=>update(index,{[key]:event.target.value})}/></Cell>)}
      <Cell><Choice label={`${prefix}第 ${index+1} 项货币`} value={item.currency} options={[[ 'CNY','CNY'],['USD','USD']]} disabled={!ops.can} onChange={currency=>update(index,{currency})}/></Cell>
      <Cell><Input aria-label={`${prefix}第 ${index+1} 项金额`} inputMode="decimal" placeholder="必填；0 为免费" value={item.amount} disabled={!ops.can} onChange={event=>update(index,{amount:event.target.value})}/></Cell>
      <Cell><Button type="button" variant="ghost" size="icon" aria-label={`移除${prefix}第 ${index+1} 项`} disabled={!ops.can} onClick={()=>setRows(rows.filter((_,i)=>i!==index))}><Trash2/></Button></Cell>
    </Row>)}</GridTable>
  </>;
}
export function UnifiedPriceDialog({state,model,ops,close}) {
  const [rows,setRows]=useState(()=>unifiedBillingDraft(state,model)), [revision]=useState(()=>modelSaleRevision(state,model.id)), [modelRevision]=useState(model.updatedAt);
  const set=value=>{setRows(value);ops.dirty(true);ops.setError('');};
  const current=activeModelSalePrice(state,model.id), history=state.modelSalePrices.filter(price=>price.modelId===model.id && price.scope==='model');
  return <Modal wide drawer title="统一服务定价" description={`${model.name} · ${modelCode(model)}`} onClose={close}><form noValidate onSubmit={event=>{event.preventDefault();if(ops.run('unifiedPrice',{items:rows,expectedSaleVersion:revision,expectedUpdatedAt:modelRevision},model.id))close();}}>
    <p className="mo-muted">所有渠道共用这一套对外售价。计费项独立定义，供应商成本变化不会自动改价。</p>
    <ConflictNotice ops={ops}/>
    <RetailPriceFields rows={rows} setRows={set} ops={ops} prefix="统一售价"/>
    {ops.error && <Notice error>{ops.error}</Notice>}
    <details className="sm-price-history"><summary>统一售价历史{current?` · 当前 v${current.version}`:''}</summary>{history.sort((a,b)=>b.version-a.version).map(price=><div key={price.id}><strong>v{price.version} · {displayTime(price.effectiveAt)}</strong>{priceItems(price,model).map((item,index)=><p key={index}>{item.name}{item.condition?`（${item.condition}）`:''}：{itemMoney(item)} / {item.unit}</p>)}</div>)}</details>
    <div className="mo-footer"><Button type="button" variant="outline" onClick={close}>取消</Button><Button type="submit" disabled={!ops.can || !rows.length}>确认保存统一售价</Button></div>
  </form></Modal>;
}
export function ProviderServiceDialog({state,model,providerId,ops,close}) {
  const provider=state.providers.find(item=>item.id===providerId), entry=providerServices(model).find(item=>item.providerId===providerId) || {code:'',callId:''};
  const [callId,setCallId]=useState(entry.callId || `${modelCode(model)}-${entry.code}`), [rows,setRows]=useState(()=>priceItems(activeProviderPrice(state,model.id,providerId),model).map(item=>({...item,condition:item.condition || '',amount:item.amount==null?'':String(item.amount/1000000)})));
  const [revision]=useState(model.updatedAt), [priceRevision]=useState(()=>providerPriceRevision(state,model.id,providerId));
  const mark=()=>{ops.dirty(true);ops.setError('');};
  return <Modal wide drawer title="Provider 配置" description={model.name} onClose={close}><form noValidate onSubmit={event=>{event.preventDefault();if(ops.run('configureServiceProvider',{providerId,callId,items:rows,expectedUpdatedAt:revision,expectedSaleVersion:priceRevision},model.id))close();}}>
    <div className="mo-form-grid"><Field label="供应商"><span>{provider?.name || '供应商已不存在'}</span></Field><Field label="Provider 标识"><code>{entry.code}</code></Field><Field label="对外调用 ID *"><Input aria-label="Provider 对外调用 ID" value={callId} disabled={!ops.can || Boolean(model.listingStatus==='已上架' && entry.callId)} onChange={event=>{setCallId(event.target.value);mark();}}/></Field></div>
    <p className="mo-muted">同一 Provider 下的渠道共用此售价。渠道映射及调度在“渠道与路由”配置。</p>
    <ConflictNotice ops={ops}/>
    <RetailPriceFields rows={rows} setRows={value=>{setRows(value);mark();}} ops={ops} prefix="Provider 售价"/>
    {ops.error && <Notice error>{ops.error}</Notice>}
    <div className="mo-footer"><Button type="button" variant="outline" onClick={close}>取消</Button><Button type="submit" disabled={!ops.can || !rows.length}>保存 Provider 配置</Button></div>
  </form></Modal>;
}
export function AssociateUnifiedChannelsDialog({state,model,ops,close}) {
  const [query,setQuery]=useState(''), [providerId,setProviderId]=useState('all'), [catalogueId,setCatalogueId]=useState('all'), [selected,setSelected]=useState([]), [confirmed,setConfirmed]=useState(false), [revision]=useState(model.updatedAt);
  const candidates=serviceAssociationChannels(state), linked=modelSupplies(state,model.id);
  const providers=[...new Map(candidates.map(channel=>[channel.provider.id,channel.provider])).values()];
  const models=[...new Set(candidates.filter(channel=>providerId==='all' || channel.provider.id===providerId).map(channel=>channel.catalogueModelId))];
  const rows=candidates.filter(channel=>(providerId==='all' || channel.provider.id===providerId) && (catalogueId==='all' || channel.catalogueModelId===catalogueId) && [channel.name,serviceChannelId(channel),channel.provider.name,channel.catalogueModelId].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  const chosen=candidates.filter(channel=>selected.includes(channel.selectionId));
  const submit=event=>{
    event.preventDefault();
    const groups=[];
    for (const channel of chosen) {
      let group=groups.find(item=>item.providerId===channel.provider.id && item.catalogueModelId===channel.catalogueModelId);
      if (!group) {group={providerId:channel.provider.id,catalogueModelId:channel.catalogueModelId,channelIds:[]};groups.push(group);}
      group.channelIds.push(channel.id);
    }
    if (ops.run('associateServiceChannelsBatch',{groups,confirmedIdentity:confirmed,expectedUpdatedAt:revision},model.id)) close();
  };
  return <Modal wide title="关联渠道" description={`${model.name} · 从供应管理选择已有渠道`} onClose={close}><form id="service-channel-association" className="sm-unified-association" noValidate onSubmit={submit}>
    <div className="sm-association-filters"><label className="sm-search"><Search aria-hidden="true"/><Input aria-label="搜索已有渠道" placeholder="渠道名称 / ID / 供应商" value={query} onChange={event=>setQuery(event.target.value)}/></label><Choice label="筛选供应商" value={providerId} options={[[ 'all','全部供应商'],...providers.map(provider=>[provider.id,provider.name])]} onChange={id=>{setProviderId(id);setCatalogueId('all');}}/><Choice label="筛选供应模型" value={catalogueId} options={[[ 'all','全部供应模型'],...models.map(id=>[id,id])]} onChange={setCatalogueId}/></div>
    <ConflictNotice ops={ops}/>
    <GridTable className="sm-unified-associate-table" headings={['选择','渠道 ID / 名称','供应商','供应模型','状态']} empty={!rows.length} emptyMessage={candidates.length?'没有匹配的渠道，请调整搜索或筛选。':'暂无供应渠道，请先在供应管理配置。'}>{rows.map(channel=>{
      const exists=linked.some(item=>item.endpointId===channel.endpointId), checked=selected.includes(channel.selectionId);
      return <Row key={channel.selectionId}><Cell><Checkbox aria-label={`关联渠道 ${channel.name} ${serviceChannelId(channel)}`} disabled={!ops.can || exists || Boolean(channel.reason) || !checked && selected.length>=20} checked={checked} onCheckedChange={value=>{setSelected(value===true?[...selected,channel.selectionId]:selected.filter(id=>id!==channel.selectionId));setConfirmed(false);ops.dirty(true);ops.setError('');}}/></Cell><Cell><strong>{channel.name}</strong><small>{serviceChannelId(channel)}</small></Cell><Cell>{channel.provider.name}</Cell><Cell><code>{channel.catalogueModelId}</code><small>上游：{channel.upstreamModelId}</small></Cell><Cell>{exists?'已关联':channel.reason || '可关联'}</Cell></Row>;
    })}</GridTable>
    <label className="mo-check"><Checkbox checked={confirmed} disabled={!ops.can || !selected.length} onCheckedChange={value=>{setConfirmed(value===true);ops.dirty(true);ops.setError('');}}/>已核对所选渠道的模型身份及能力</label>
    {ops.error && <Notice error>{ops.error}</Notice>}
    <div className="mo-footer"><span aria-live="polite">已选择 {selected.length} 个渠道（最多 20 个）；关联后请在“渠道与路由”配置调度。</span><Button type="button" variant="outline" onClick={close}>取消</Button><Button type="submit" disabled={!ops.can || !chosen.length || chosen.length!==selected.length || !confirmed}>确认关联</Button></div>
  </form></Modal>;
}
export function AssociateChannelsDialog({state,model,ops,close,context,providerId:fixedProviderId}) {
  const [providerId,setProviderId]=useState(fixedProviderId || ''), [catalogueId,setCatalogueId]=useState(''), [selected,setSelected]=useState([]), [confirmed,setConfirmed]=useState(false), [revision]=useState(model.updatedAt);
  const suppliers=supplierDirectory(state).filter(item=>model.serviceMode==='standard' || providerServices(model).some(entry=>entry.providerId===item.id));
  const provider=suppliers.find(item=>item.id===providerId), candidates=availableServiceChannels(state,provider,catalogueId), linked=modelSupplies(state,model.id);
  const mark=()=>{ops.dirty(true);ops.setError('');};
  const body=<form id="service-channel-association" noValidate onSubmit={event=>{event.preventDefault();if(ops.run('associateServiceChannels',{providerId,catalogueModelId:catalogueId,channelIds:selected,confirmedIdentity:confirmed,expectedUpdatedAt:revision,context},model.id))close();}}>
    <div className="mo-form-grid"><Field label="供应商 *"><Choice label="关联渠道供应商" value={providerId || 'none'} options={[[ 'none','请选择供应商'],...suppliers.map(item=>[item.id,item.name])]} disabled={!ops.can || Boolean(fixedProviderId)} onChange={id=>{setProviderId(id==='none'?'':id);setCatalogueId('');setSelected([]);setConfirmed(false);mark();}}/></Field><Field label="供应模型 *"><CatalogueModelPicker provider={provider} modelIds={provider?displayedCatalogueIds(provider,state):[]} value={catalogueId} disabled={!ops.can || !provider} onChange={id=>{setCatalogueId(id);setSelected([]);setConfirmed(false);mark();}}/></Field></div>
    <p className="mo-muted">选择供应管理中已有的渠道，不会新建供应商或渠道。</p>
    <ConflictNotice ops={ops}/>
    <GridTable className="sm-associate-table" headings={['选择','渠道 ID / 名称','上游 Model ID','API 地址','供应商售价','状态']} empty={!candidates.length} emptyMessage={catalogueId?'暂无渠道，请先在供应管理维护。':'选择供应商及供应模型后查看渠道。'}>{candidates.map(channel=>{const exists=linked.some(item=>item.endpointId===channel.endpointId);return <Row key={channel.id}><Cell><Checkbox aria-label={`关联渠道 ${channel.name}`} disabled={!ops.can || exists || Boolean(channel.reason)} checked={selected.includes(channel.id)} onCheckedChange={checked=>{setSelected(checked===true?[...selected,channel.id]:selected.filter(id=>id!==channel.id));setConfirmed(false);mark();}}/></Cell><Cell><strong>{channel.name}</strong><small>{serviceChannelId(channel)}</small></Cell><Cell><code>{channel.upstreamModelId}</code></Cell><Cell><CopyId value={channelUrl(provider,channel)} label="API 地址"/></Cell><Cell><div className="sm-billing-items">{serviceChannelCosts(channel).map((item,index)=><div key={index}><span>{item.name}{item.condition && <small>{item.condition}</small>}</span><span>{itemMoney(item)}<small>{item.unit}</small></span></div>)}</div></Cell><Cell>{exists?'已关联':channel.reason || '可关联'}</Cell></Row>;})}</GridTable>
    <label className="mo-check"><Checkbox checked={confirmed} disabled={!ops.can || !selected.length} onCheckedChange={checked=>{setConfirmed(checked===true);mark();}}/>已核对上游模型与当前模型的身份及能力一致</label>
    <p className="mo-muted">保存仅建立渠道关联，不会自动上架或参与调度。</p>
    {ops.error && <Notice error>{ops.error}</Notice>}
    <div className="mo-footer"><Button type="button" variant="outline" onClick={close}>取消</Button><Button type="submit" disabled={!ops.can || !selected.length || !confirmed}>保存关联</Button></div>
  </form>;
  return <Modal wide title="关联渠道" description={`${model.name} · ${modelCode(model)}`} onClose={close}>{body}</Modal>;
}
