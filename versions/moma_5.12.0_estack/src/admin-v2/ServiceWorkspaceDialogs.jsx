import ModelFieldLabel from './ModelFieldLabel';
import { useState } from 'react';
import { Plus, Trash2, Search } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Checkbox } from '../components/ui/checkbox';
import { Choice, Field } from './ModelMetadataForm';
import { CatalogueModelPicker } from './CatalogueModelPicker';
import { Modal, Notice, GridTable, Row, Cell, ScopeFields } from './ModelOperationsUI';
import { servicePriceIdentity, commercialTaskKey, commercialTaskBase, activeModelSalePrice, unifiedBillingDraft, availableServiceChannels, serviceAssociationChannels, serviceChannelCosts, serviceChannelId, providerServices, activeProviderPrice } from './service-workspace';
import { displayedCatalogueIds, supplierDirectory } from './moma-provider';
import { channelUrl } from './provider-channels';
import { modelCode, modelSupplies, priceItems, displayTime } from './model-management';
import { itemMoney } from './SupplyPriceEditor';


function ConflictNotice({ops}) {
  return ops.conflict && <Notice error>其他页面的数据已变化，当前输入保留。载入后请重新打开配置核对。<Button type="button" variant="link" onClick={ops.reload}>载入最新数据</Button></Notice>;
}

export function RetailPriceFields({rows,setRows,ops,prefix,readOnly=false,onEdit,identity}) {
  const update=(index,patch)=>setRows(rows.map((item,i)=>i===index?{...item,...patch}:item));
  return <>
    <div className="sm-price-toolbar">{readOnly?<Button type="button" variant="outline" disabled={!ops.can} onClick={onEdit}>编辑售价</Button>:<Button type="button" variant="outline" disabled={!ops.can || rows.length>=100} onClick={()=>setRows([...rows,{name:'',condition:'',unit:'',currency:'CNY',amount:''}])}><Plus/>添加计费项</Button>}</div>
    <GridTable className="sm-price-form" headings={identity?['供应商名称',<ModelFieldLabel key="request-model" name="对外调用标识"/>,'计费项','售价','货币','计价单位','操作']:['计费项','平台售价','货币','计价单位','操作']} empty={!rows.length} emptyMessage={readOnly?"尚未配置售价。":"请添加对外计费项，0 表示免费，金额必填。"}>{rows.map((item,index)=><Row key={index}>
      {identity && <><Cell><span className="sm-price-value">{identity.supplierName}</span></Cell><Cell><code className="sm-price-value">{identity.callId || '待配置'}</code></Cell></>}
      <Cell>{readOnly?<span className="sm-price-value">{item.name ?? '—'}</span>:<Input aria-label={`${prefix}第 ${index+1} 项名称`} value={item.name} disabled={!ops.can} onChange={event=>update(index,{name:event.target.value})}/>}</Cell>
      <Cell className="sm-price-amount">{readOnly?<span className="sm-price-value">{item.amount === '' || item.amount == null?'—':item.amount}</span>:<div className="sm-price-money"><Input aria-label={`${prefix}第 ${index+1} 项金额`} inputMode="decimal" placeholder="必填；0 为免费" value={item.amount} disabled={!ops.can} onChange={event=>update(index,{amount:event.target.value})}/></div>}</Cell>
      <Cell>{readOnly?<span className="sm-price-value">{item.currency || '—'}</span>:<Choice label={`${prefix}第 ${index+1} 项货币`} value={item.currency} options={[[ 'CNY','CNY'],['USD','USD']]} disabled={!ops.can} onChange={currency=>update(index,{currency})}/>}</Cell>
      <Cell>{readOnly?<span className="sm-price-value">{item.unit ?? '—'}</span>:<Input aria-label={`${prefix}第 ${index+1} 项单位`} value={item.unit} disabled={!ops.can} onChange={event=>update(index,{unit:event.target.value})}/>}</Cell>
      <Cell>{readOnly?<span className="sm-price-value">—</span>:<Button type="button" variant="ghost" size="icon" aria-label={`移除${prefix}第 ${index+1} 项`} disabled={!ops.can} onClick={()=>setRows(rows.filter((_,i)=>i!==index))}><Trash2/></Button>}</Cell>
    </Row>)}</GridTable>
  </>;
}
export function CommercialDialog({state,model,ops,close,kind='price',providerId='',readOnly=false,onEdit}) {
  const key= commercialTaskKey(kind,providerId);
  const initial=()=>kind==='scope'?{openScope:model.openScope,tenantIds:model.tenantIds || []}:{callId:providerId?providerServices(model).find(row=>row.providerId===providerId)?.callId || '':model.modelId,items:providerId?priceItems(activeProviderPrice(state,model.id,providerId),model).map(item=>({...item,condition:item.condition || '',amount:item.amount==null?'':String(item.amount/1000000)})):unifiedBillingDraft(state,model)};
  const [value,setValue]=useState(()=>structuredClone(kind==='price'?{...(initial()),callId:initial().callId}:initial()));
  const [base,setBase]=useState(()=>commercialTaskBase(state,model,kind,providerId));
  const [preview,setPreview]=useState(false);
  const title=kind==='scope'?'客户范围':providerId?'供应商平台售价':'统一平台售价';
  const change=patch=>{setValue(row=>({...row,...patch}));setPreview(false);ops.dirty(true);ops.setError('');};
  const publish=async ()=>{
    const next=await ops.run('commercialPublish',{kind,providerId,value,expectedBase:base,confirmed:true},model.id);
    if(next){setPreview(false);setBase(commercialTaskBase(next,next.models.find(row=>row.id===model.id),kind,providerId));}
  };
  const receipt=model.commercialPublications?.[key];
  const names=ids=>state.tenants.filter(row=>ids.includes(row.id)).map(row=>row.name).join('、') || '未选择客户';
  const scopeText=v=>v.openScope==='all'?'全部客户':names(v.tenantIds || []);
  const selected=v=>v.openScope==='all'?state.tenants.map(row=>row.id):v.tenantIds || [];
  const added=selected(value).filter(id=>!selected(model).includes(id)), removed=selected(model).filter(id=>!selected(value).includes(id));
  const current=providerId?activeProviderPrice(state,model.id,providerId):activeModelSalePrice(state,model.id);
  const content=<form noValidate onSubmit={event=>{event.preventDefault();setPreview(true);}}>
    <ConflictNotice ops={ops}/>
    {(base!==commercialTaskBase(state,model,kind,providerId)) && <Notice error>配置已变化，当前输入保留。<Button type="button" variant="link" disabled={!ops.can} onClick={()=>{setBase(commercialTaskBase(state,model,kind,providerId));setPreview(false);ops.dirty(true);}}>按当前配置重新核对</Button></Notice>}
    {receipt && <Notice>{title}已生效 · {displayTime(receipt.publishedAt)}{' · v'+(kind==='price' && current?current.version:receipt.version)}{providerId && model.serviceProviders?.find(row=>row.providerId===providerId)?.pendingPublication?'；本供应商服务尚待平台验证':model.listingStatus!=='已上架'?'；服务尚未上架':''}</Notice>}
    {kind==='scope'?<ScopeFields state={state} {...value} disabled={!ops.can} onChange={(openScope,tenantIds)=>change({openScope,tenantIds})}/>:<>
      <RetailPriceFields identity={servicePriceIdentity(state,model,providerId)} readOnly={readOnly} onEdit={onEdit} rows={readOnly?initial().items:value.items} setRows={items=>change({items})} ops={ops} prefix="平台售价"/>
    </>}
    {preview && <section className="mo-notice"><div><h3>{title}变更预览</h3>{kind==='scope'?<><p>当前：{scopeText(model)}</p><p>发布后：{scopeText(value)}</p><p>新增：{added.length?names(added):'无'}；移除：{removed.length?names(removed):'无'}</p><p>移出的客户将不能继续发起新调用，已有订购不豁免。</p></>:<><p>当前售价{current?' v'+current.version:'未配置'}：</p>{priceItems(current,model).map((row,i)=><p key={i}>{row.name}：{itemMoney(row)} / {row.unit}</p>)}<p>发布后售价：</p>{value.items.map((row,i)=><p key={i}>{row.name}：{row.currency} {row.amount || '未填写'} / {row.unit}</p>)}<p>适用客户：{scopeText(model)}。发布成功后立即用于后续新请求，含已有订购客户；已开始请求及历史保持原价。</p></>}<p>仅发布本次{title}，其他配置保持不变。</p><Button type="button" disabled={!ops.can} onClick={publish}>确认发布{kind==='scope'?'客户范围':'售价'}</Button></div></section>}
    {ops.error && <Notice error>{ops.error}</Notice>}
    <div className="mo-footer sm-price-footer">{!readOnly && <><Button type="button" variant="outline" onClick={close}>{kind==='price'?'取消':'关闭'}</Button><Button type="submit" disabled={!ops.can}>预览变更</Button></>}</div>
  </form>;
  return kind==='price'?<section className="sm-inline-price" aria-label={title}><h3>{providerId?state.providers.find(row=>row.id===providerId)?.name+" · ":""}{title}</h3>{content}</section>:<Modal wide drawer title={title} description={model.name} onClose={close}>{content}</Modal>;
}
export function UnifiedPriceDialog(props) { return <CommercialDialog {...props}/>; }
export function ServiceIdentityDialog({model, providerId, ops, close}) {
  const entry = providerServices(model).find(row => row.providerId === providerId);
  const [callId, setCallId] = useState(entry?.callId || ''), [revision] = useState(model.updatedAt);
  return <Modal title="配置对外调用标识" onClose={close}><form onSubmit={async event => { event.preventDefault(); if (await ops.run('configureServiceIdentity', { providerId, callId, expectedUpdatedAt: revision }, model.id)) close(); }}>
    <Field label={<ModelFieldLabel name="对外调用标识" required/>}><Input aria-label="对外调用标识" autoFocus value={callId} required maxLength={200} disabled={!ops.can || model.listingStatus === '已上架' && Boolean(entry?.callId)} onChange={event => { setCallId(event.target.value); ops.dirty(true); ops.setError(''); }}/></Field>
    {model.listingStatus === '已上架' && entry?.callId && <p>先下架服务，再修改对外调用标识。</p>}
    {ops.error && <Notice error>{ops.error}</Notice>}
    <div className="mo-footer"><Button type="button" variant="outline" onClick={close}>取消</Button><Button type="submit" disabled={!ops.can || !callId.trim() || model.listingStatus === '已上架' && Boolean(entry?.callId)}>保存对外调用标识</Button></div>
  </form></Modal>;
}
export function AssociateUnifiedChannelsDialog({state,model,ops,close}) {
  const [query,setQuery]=useState(''), [providerId,setProviderId]=useState('all'), [catalogueId,setCatalogueId]=useState('all'), [selected,setSelected]=useState([]), [confirmed,setConfirmed]=useState(false), [revision]=useState(model.updatedAt);
  const candidates=serviceAssociationChannels(state), linked=modelSupplies(state,model.id);
  const providers=[...new Map(candidates.map(channel=>[channel.provider.id,channel.provider])).values()];
  const models=[...new Set(candidates.filter(channel=>providerId==='all' || channel.provider.id===providerId).map(channel=>channel.catalogueModelId))];
  const rows=candidates.filter(channel=>(providerId==='all' || channel.provider.id===providerId) && (catalogueId==='all' || channel.catalogueModelId===catalogueId) && [channel.name,serviceChannelId(channel),channel.provider.name,channel.catalogueModelId].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  const chosen=candidates.filter(channel=>selected.includes(channel.selectionId));
  const submit=async event=>{
    event.preventDefault();
    const groups=[];
    for (const channel of chosen) {
      let group=groups.find(item=>item.providerId===channel.provider.id && item.catalogueModelId===channel.catalogueModelId);
      if (!group) {group={providerId:channel.provider.id,catalogueModelId:channel.catalogueModelId,channelIds:[]};groups.push(group);}
      group.channelIds.push(channel.id);
    }
    if (await ops.run('associateServiceChannelsBatch',{groups,confirmedIdentity:confirmed,expectedUpdatedAt:revision},model.id)) close();
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
  const body=<form id="service-channel-association" noValidate onSubmit={async event=>{event.preventDefault();if(await ops.run('associateServiceChannels',{providerId,catalogueModelId:catalogueId,channelIds:selected,confirmedIdentity:confirmed,expectedUpdatedAt:revision,context},model.id))close();}}>
    <div className="mo-form-grid"><Field label="供应商 *"><Choice label="关联渠道供应商" value={providerId || 'none'} options={[[ 'none','请选择供应商'],...suppliers.map(item=>[item.id,item.name])]} disabled={!ops.can || Boolean(fixedProviderId)} onChange={id=>{setProviderId(id==='none'?'':id);setCatalogueId('');setSelected([]);setConfirmed(false);mark();}}/></Field><Field label="供应模型 *"><CatalogueModelPicker provider={provider} modelIds={provider?displayedCatalogueIds(provider,state):[]} value={catalogueId} disabled={!ops.can || !provider} onChange={id=>{setCatalogueId(id);setSelected([]);setConfirmed(false);mark();}}/></Field></div>
    <p className="mo-muted">选择供应管理中已有的渠道，不会新建供应商或渠道。</p>
    <ConflictNotice ops={ops}/>
    <GridTable className="sm-associate-table" headings={['选择','渠道 ID / 名称','上游模型标识','API 地址','采购价','状态']} empty={!candidates.length} emptyMessage={catalogueId?'暂无渠道，请先在供应管理维护。':'选择供应商及供应模型后查看渠道。'}>{candidates.map(channel=>{const exists=linked.some(item=>item.endpointId===channel.endpointId);return <Row key={channel.id}><Cell><Checkbox aria-label={`关联渠道 ${channel.name}`} disabled={!ops.can || exists || Boolean(channel.reason)} checked={selected.includes(channel.id)} onCheckedChange={checked=>{setSelected(checked===true?[...selected,channel.id]:selected.filter(id=>id!==channel.id));setConfirmed(false);mark();}}/></Cell><Cell><strong>{channel.name}</strong><small>{serviceChannelId(channel)}</small></Cell><Cell><code>{channel.upstreamModelId}</code></Cell><Cell><code title={channelUrl(provider,channel)}>{channelUrl(provider,channel)}</code></Cell><Cell><div className="sm-billing-items">{serviceChannelCosts(channel).map((item,index)=><div key={index}><span>{item.name}{item.condition && <small>{item.condition}</small>}</span><span>{itemMoney(item)}<small>{item.unit}</small></span></div>)}</div></Cell><Cell>{exists?'已关联':channel.reason || '可关联'}</Cell></Row>;})}</GridTable>
    <label className="mo-check"><Checkbox checked={confirmed} disabled={!ops.can || !selected.length} onCheckedChange={checked=>{setConfirmed(checked===true);mark();}}/>已核对上游模型与当前模型的身份及能力一致</label>
    <p className="mo-muted">保存仅建立渠道关联，不会自动上架或参与调度。</p>
    {ops.error && <Notice error>{ops.error}</Notice>}
    <div className="mo-footer"><Button type="button" variant="outline" onClick={close}>取消</Button><Button type="submit" disabled={!ops.can || !selected.length || !confirmed}>保存关联</Button></div>
  </form>;
  return <Modal wide title="关联渠道" description={`${model.name} · ${modelCode(model)}`} onClose={close}>{body}</Modal>;
}
