import { tariffOptions, tariffScenarioUnit } from './tariff-dictionary';
import { retailItems, serviceScope, scopeTenants } from './service-commercial';
import ModelFieldLabel from './ModelFieldLabel';
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Choice, Field } from './ModelMetadataForm';
import { Modal, Notice, GridTable, Row, Cell, ScopeFields } from './ModelOperationsUI';
import { currentServiceCosts, servicePriceIdentity, commercialTaskKey, commercialTaskBase, activeModelSalePrice, unifiedBillingDraft, providerServices, activeProviderPrice } from './service-workspace';
import { priceItems, displayTime } from './model-management';
import { itemMoney } from './SupplyPriceEditor';


function ConflictNotice({ops}) {
  return ops.conflict && <Notice error>其他页面的数据已变化，当前输入保留。载入后请重新打开配置核对。<Button type="button" variant="link" onClick={ops.reload}>载入最新数据</Button></Notice>;
}

export function RetailPriceFields({state,rows,setRows,ops,prefix,readOnly=false,onEdit,identity,purchaseCosts=[]}) {
  const update=(index,patch)=>setRows(rows.map((item,i)=>i===index?{...item,...patch}:item));
  const options=(kind,value)=>[['unselected','请选择'],...tariffOptions(state,kind).map(name=>[name,name]),...(value && !tariffOptions(state,kind).includes(value)?[[value,value+'（已保存）']]:[])];
  return <>
    <div className="sm-price-toolbar">{readOnly?<Button type="button" variant="outline" disabled={!ops.can} onClick={onEdit}>编辑售价</Button>:<Button type="button" variant="outline" disabled={!ops.can || rows.length>=100} onClick={()=>setRows([...rows,{name:'',condition:'',unit:'',currency:'CNY',amount:''}])}><Plus/>添加计费项</Button>}</div>
    <GridTable className={`sm-price-form${identity?' sm-price-identity':''}${readOnly?' is-readonly':''}`} headings={identity?['供应商名称',<ModelFieldLabel key="request-model" name="对外调用标识"/>,'计费项','售价','货币','计价单位',...(!readOnly?['操作']:[])]:['计费项','平台售价','货币','计价单位',...(!readOnly?['操作']:[])]} empty={!rows.length} emptyMessage={readOnly?"尚未配置售价。":"请添加对外计费项，0 表示免费，金额必填。"}>{rows.map((item,index)=><Row key={index}>
      {identity && index===0 && <><Cell rowSpan={rows.length}><span className="sm-price-value">{identity.supplierName}</span></Cell><Cell rowSpan={rows.length}><code className="sm-price-value">{identity.callId || '待配置'}</code></Cell></>}
      <Cell>{readOnly?<span className="sm-price-value">{item.name ?? '—'}{item.condition && <small>{item.condition}</small>}</span>:<Choice label={`${prefix}第 ${index+1} 项计费项`} value={item.name || 'unselected'} disabled={!ops.can} options={options('scenario',item.name)} onChange={name=>update(index,{name:name==='unselected'?'':name,unit:tariffScenarioUnit(state,name) || item.unit})}/>} {!readOnly && <Input aria-label={`${prefix}第 ${index+1} 项适用条件`} placeholder="适用条件（选填）" value={item.condition || ''} maxLength={200} disabled={!ops.can} onChange={event=>update(index,{condition:event.target.value})}/>}</Cell>
      <Cell className="sm-price-amount">{readOnly?<span className="sm-price-value">{item.amount === '' || item.amount == null?'—':item.amount}</span>:<div className="sm-price-money"><Input aria-label={`${prefix}第 ${index+1} 项金额`} inputMode="decimal" placeholder="必填；0 为免费" value={item.amount} disabled={!ops.can} onChange={event=>update(index,{amount:event.target.value})}/></div>}{!readOnly && purchaseCosts.map(channel=>{const cost=channel.items.find(row=>row.name===item.name && (row.condition || '')===(item.condition || ''));return cost && <small className="sm-purchase-reference" key={channel.name}>{channel.name}采购：{itemMoney(cost)} / {cost.unit}</small>;})}</Cell>
      <Cell>{readOnly?<span className="sm-price-value">{item.currency || '—'}</span>:<Choice label={`${prefix}第 ${index+1} 项货币`} value={item.currency} options={options('currency',item.currency)} disabled={!ops.can} onChange={currency=>update(index,{currency})}/>}</Cell>
      <Cell>{readOnly?<span className="sm-price-value">{item.unit ?? '—'}</span>:<Choice label={`${prefix}第 ${index+1} 项单位`} value={item.unit || 'unselected'} options={options('unit',item.unit)} disabled={!ops.can} onChange={unit=>update(index,{unit:unit==='unselected'?'':unit})}/>}</Cell>
      {!readOnly && <Cell><Button type="button" variant="ghost" size="icon" aria-label={`移除${prefix}第 ${index+1} 项`} disabled={!ops.can} onClick={()=>setRows(rows.filter((_,i)=>i!==index))}><Trash2/></Button></Cell>}
    </Row>)}</GridTable>
  </>;
}
export function CommercialDialog({state,model,ops,close,kind='price',providerId='',readOnly=false,onEdit,drawerSide='left'}) {
  const key= commercialTaskKey(kind,providerId);
  const initial=()=>kind==='scope'?{openScope:model.openScope,tenantIds:model.tenantIds || []}:{callId:providerId?providerServices(model).find(row=>row.providerId===providerId)?.callId || '':model.modelId,items:providerId?priceItems(activeProviderPrice(state,model.id,providerId),model).map(item=>({...item,condition:item.condition || '',amount:item.amount==null?'':String(item.amount/1000000)})):unifiedBillingDraft(state,model)};
  const [value,setValue]=useState(()=>structuredClone(kind==='price'?{...(initial()),callId:initial().callId}:initial()));
  const [base,setBase]=useState(()=>commercialTaskBase(state,model,kind,providerId));
  const [preview,setPreview]=useState(false),[publishing,setPublishing]=useState(false);
  const title=kind==='scope'?'开放范围':providerId?'供应商平台售价':'统一平台售价';
  const change=patch=>{if(publishing)return;setValue(row=>({...row,...patch}));setPreview(false);ops.dirty(true);ops.setError('');};
  const publish=async ()=>{
    if(publishing)return;setPublishing(true);try{
    const next=await ops.run('commercialPublish',{kind,providerId,value,expectedBase:base,confirmed:true},model.id);
    if(next){setPreview(false);ops.dirty(false);close();}
    }finally{setPublishing(false);}
  };
  const receipt=model.commercialPublications?.[key];
  const names=ids=>state.tenants.filter(row=>ids.includes(row.id)).map(row=>row.name).join('、') || '未选择客户';
  const scopeText=v=>v.openScope==='all'?'全部客户':names(v.tenantIds || []);
  const selected=v=>v.openScope==='all'?scopeTenants(state).map(row=>row.id):v.tenantIds || [];
  const added=selected(value).filter(id=>!selected(model).includes(id)), removed=selected(model).filter(id=>!selected(value).includes(id));
  const current=providerId?activeProviderPrice(state,model.id,providerId):activeModelSalePrice(state,model.id);
  const content=<form noValidate onSubmit={event=>{event.preventDefault();try{if(kind==='scope')serviceScope(state,value);else retailItems(state,value.items,current?.items);ops.setError('');setPreview(true);}catch(issue){setPreview(false);ops.setError(issue.message);}}}>
    <ConflictNotice ops={ops}/>
    {(base!==commercialTaskBase(state,model,kind,providerId)) && <Notice error>配置已变化，当前输入保留。<Button type="button" variant="link" disabled={!ops.can} onClick={()=>{setBase(commercialTaskBase(state,model,kind,providerId));setPreview(false);ops.dirty(true);}}>按当前配置重新核对</Button></Notice>}
    {receipt && <Notice>{title}已生效 · {displayTime(receipt.publishedAt)}{providerId && model.serviceProviders?.find(row=>row.providerId===providerId)?.pendingPublication?'；本供应商服务尚待平台验证':model.listingStatus!=='已上架'?'；服务尚未上架':''}</Notice>}
    {kind==='scope'?<ScopeFields state={state} {...value} disabled={!ops.can || publishing} onChange={(openScope,tenantIds)=>change({openScope,tenantIds})}/>:<>
      <RetailPriceFields state={state} purchaseCosts={currentServiceCosts(state,model,providerId)} identity={servicePriceIdentity(state,model,providerId)} readOnly={readOnly} onEdit={onEdit} rows={readOnly?initial().items:value.items} setRows={items=>change({items})} ops={{...ops,can:ops.can && !publishing}} prefix="平台售价"/>
    </>}
    {preview && <section className="mo-notice"><div><h3>{title}变更预览</h3>{kind==='scope'?<><p>当前：{scopeText(model)}</p><p>发布后：{scopeText(value)}</p><p>新增：{added.length?names(added):'无'}；移除：{removed.length?names(removed):'无'}</p><p>移出的客户将不能继续发起新调用，已有订购不豁免。</p></>:<><p>当前售价{current?' v'+current.version:'未配置'}：</p>{priceItems(current,model).map((row,i)=><p key={i}>{row.name}：{itemMoney(row)} / {row.unit}</p>)}<p>发布后售价：</p>{value.items.map((row,i)=><p key={i}>{row.name}：{row.currency} {row.amount === '' || row.amount == null ? '未填写' : row.amount} / {row.unit}</p>)}<p>适用客户：{scopeText(model)}。发布成功后立即用于后续新请求，含已有订购客户；已开始请求及历史保持原价。</p></>}<p>仅发布本次{title}，其他配置保持不变。</p><Button type="button" disabled={!ops.can || publishing} onClick={publish}>确认发布{kind==='scope'?'开放范围':'售价'}</Button></div></section>}
    {ops.error && <Notice error>{ops.error}</Notice>}
    {!readOnly && <div className="mo-footer sm-price-footer"><Button type="button" variant="outline" disabled={publishing} onClick={close}>{kind==='price'?'取消':'关闭'}</Button><Button type="submit" disabled={!ops.can || publishing}>预览变更</Button></div>}
  </form>;
  return kind==='price'?<section className="sm-inline-price" aria-label={title}><h3>{providerId?state.providers.find(row=>row.id===providerId)?.name+" · ":""}{title}</h3>{content}</section>:<Modal wide drawer drawerSide={drawerSide} className="sm-scope-drawer" title={title} description={model.name} onClose={()=>{if(!publishing)close();}}>{content}</Modal>;
}
export function UnifiedPriceDialog(props) { return <CommercialDialog {...props}/>; }
export function ServiceIdentityDialog({model, providerId, ops, close}) {
  const entry = providerServices(model).find(row => row.providerId === providerId), original=providerId?entry?.callId || '':model.modelId;
  const [callId, setCallId] = useState(original), [revision] = useState(model.updatedAt),[confirm,setConfirm]=useState(false);
  const changing=Boolean(original && original!==callId.trim()),blocked=Boolean(original) && (model.listingStatus==='已上架' || (providerId?entry?.callsEnabled!==false:model.callsEnabled===true));
  return <Modal title="编辑调用标识" description={model.name} onClose={close}><form onSubmit={async event => {event.preventDefault();if(changing && !confirm){setConfirm(true);return;}if(await ops.run(providerId?'configureServiceIdentity':'configureServiceModelIdentity',{providerId,callId,expectedUpdatedAt:revision,confirmed:true},model.id))close();}}>
    <Field label={<ModelFieldLabel name="对外调用标识" required/>}><Input aria-label="对外调用标识" autoFocus value={callId} required maxLength={200} disabled={!ops.can || blocked} onChange={event=>{setCallId(event.target.value);setConfirm(false);ops.dirty(true);ops.setError('');}}/></Field>
    {blocked && <Notice>先下架并停用当前服务，再修改对外调用标识。</Notice>}
    {changing && <Notice>原标识：{original}。保存后，客户需将调用参数改为新标识；原标识不再接受新请求。订购、配置和历史记录保留。</Notice>}
    {confirm && <p>请确认客户已完成调用标识迁移，再保存为 <code>{callId}</code>。</p>}
    {ops.error && <Notice error>{ops.error}</Notice>}
    <div className="mo-footer"><Button type="button" variant="outline" onClick={close}>取消</Button><Button type="submit" disabled={!ops.can || !callId.trim() || callId.trim()===original || blocked}>{confirm?'确认修改调用标识':changing?'核对变更':'保存调用标识'}</Button></div>
  </form></Modal>;
}
