import { useState } from 'react';
import { Button, Input, Table, Typography } from '@douyinfe/semi-ui';
import { IconPlus, IconDelete } from '@douyinfe/semi-icons';
import { Choice, Notice } from './ServiceUI';
import { tariffOptions, tariffScenarioUnit } from './tariff-dictionary';
import { retailItems } from './service-commercial';
import { currentServiceCosts, servicePriceIdentity, commercialTaskBase, activeModelSalePrice, unifiedBillingDraft, providerServices, activeProviderPrice } from './service-workspace';
import { priceItems } from './model-management';
import { itemMoney } from './SupplyPriceEditor';

export function RetailPriceFields({state,rows,setRows,ops,prefix,readOnly=false,onEdit,identity,purchaseCosts=[]}) {
  const update=(index,patch)=>setRows(rows.map((item,i)=>i===index?{...item,...patch}:item));
  const options=(kind,value)=>[['unselected','请选择'],...tariffOptions(state,kind).map(name=>[name,name]),...(value && !tariffOptions(state,kind).includes(value)?[[value,value+'（已保存）']]:[])];
  const text=value=>value==null || value===''?'—':value;
  return <div className="ss-body"><div className="ss-section-bar">{readOnly?<Button disabled={!ops.can} onClick={onEdit}>编辑售价</Button>:<Button icon={<IconPlus aria-hidden="true"/>} disabled={!ops.can || rows.length>=100} onClick={()=>setRows([...rows,{name:'',condition:'',unit:'',currency:'CNY',amount:''}])}>添加计费项</Button>}</div>
    <Table rowKey="index" pagination={false} scroll={{x:identity?1060:820}} empty={readOnly?'尚未配置售价。':'请添加对外计费项，0 表示免费，金额必填。'} dataSource={rows.map((item,index)=>({...item,index}))} columns={[
      ...(identity?[{title:'服务商',width:140,render:(_,item)=>({children:identity.supplierName,props:{rowSpan:item.index===0?rows.length:0}})},{title:'对外调用标识',width:200,render:(_,item)=>({children:identity.callId || '待配置',props:{rowSpan:item.index===0?rows.length:0}})}]:[]),
      {title:'计费项',width:210,render:(_,item)=>readOnly?<div>{text(item.name)}{item.condition && <Typography.Paragraph type="tertiary">{item.condition}</Typography.Paragraph>}</div>:<div className="ss-field-stack"><Choice label={`${prefix}第 ${item.index+1} 项计费项`} filter value={item.name || 'unselected'} disabled={!ops.can} options={options('scenario',item.name)} onChange={name=>update(item.index,{name:name==='unselected'?'':name,unit:tariffScenarioUnit(state,name) || item.unit})}/>{item.condition && <Typography.Paragraph type="tertiary">{item.condition}</Typography.Paragraph>}</div>},
      {title:'售价',width:170,render:(_,item)=><div>{readOnly?text(item.amount):<Input aria-label={`${prefix}第 ${item.index+1} 项金额`} inputMode="decimal" placeholder="必填；0 为免费" value={item.amount} disabled={!ops.can} onChange={amount=>update(item.index,{amount})}/>} {!readOnly && purchaseCosts.map(channel=>{const cost=channel.items.find(row=>row.name===item.name && (row.condition || '')===(item.condition || ''));return cost && <Typography.Paragraph type="tertiary" key={channel.name}>{channel.name}采购：{itemMoney(cost)} / {cost.unit}</Typography.Paragraph>;})}</div>},
      {title:'计价单位',width:180,render:(_,item)=>readOnly?text(item.unit):<Choice label={`${prefix}第 ${item.index+1} 项单位`} filter value={item.unit || 'unselected'} options={options('unit',item.unit)} disabled={!ops.can} onChange={unit=>update(item.index,{unit:unit==='unselected'?'':unit})}/>},
      {title:'货币',width:130,render:(_,item)=>readOnly?text(item.currency):<Choice label={`${prefix}第 ${item.index+1} 项货币`} filter value={item.currency} options={options('currency',item.currency)} disabled={!ops.can} onChange={currency=>update(item.index,{currency})}/>},
      ...(!readOnly?[{title:'操作',width:90,render:(_,item)=><Button theme="borderless" type="danger" icon={<IconDelete aria-hidden="true"/>} aria-label={`移除${prefix}第 ${item.index+1} 项`} disabled={!ops.can} onClick={()=>setRows(rows.filter((_,i)=>i!==item.index))}/>}]:[]),
    ]}/>
  </div>;
}
export function CommercialDialog({state,model,ops,close,providerId='',readOnly=false,onEdit}) {
  const initial=()=>({callId:providerId?providerServices(model).find(row=>row.providerId===providerId)?.callId || '':model.modelId,items:providerId?priceItems(activeProviderPrice(state,model.id,providerId),model).map(item=>({...item,condition:item.condition || '',amount:item.amount==null?'':String(item.amount/1000000)})):unifiedBillingDraft(state,model).items});
  const [value,setValue]=useState(()=>structuredClone(initial())),[base,setBase]=useState(()=>commercialTaskBase(state,model,'price',providerId));
  const [preview,setPreview]=useState(false),[publishing,setPublishing]=useState(false);
  const current=providerId?activeProviderPrice(state,model.id,providerId):activeModelSalePrice(state,model.id);
  const change=items=>{if(publishing)return;setValue(row=>({...row,items}));setPreview(false);ops.dirty(true);ops.setError('');};
  const publish=async()=>{if(publishing)return;setPublishing(true);try{if(await ops.run('commercialPublish',{kind:'price',providerId,value,expectedBase:base,confirmed:true},model.id)){setPreview(false);ops.dirty(false);close();}}finally{setPublishing(false);}};
  const scope=model.openScope==='all'?'全部客户':state.tenants.filter(row=>model.tenantIds?.includes(row.id)).map(row=>row.name).join('、') || '未选择客户';
  return <section className="ss-body" aria-label={providerId?'服务商平台售价':'统一平台售价'}>
    {ops.conflict && <Notice error>其他页面的数据已变化，当前输入保留。载入后请重新打开配置核对。<Button onClick={ops.reload}>载入最新数据</Button></Notice>}
    {base!==commercialTaskBase(state,model,'price',providerId) && <Notice error>配置已变化，当前输入保留。<Button theme="borderless" disabled={!ops.can} onClick={()=>{setBase(commercialTaskBase(state,model,'price',providerId));setPreview(false);ops.dirty(true);}}>按当前配置重新核对</Button></Notice>}
    <RetailPriceFields state={state} purchaseCosts={currentServiceCosts(state,model,providerId)} identity={servicePriceIdentity(state,model,providerId)} readOnly={readOnly} onEdit={onEdit} rows={readOnly?initial().items:value.items} setRows={change} ops={{...ops,can:ops.can && !publishing}} prefix="平台售价"/>
    {preview && <Notice><Typography.Title heading={5}>平台售价变更预览</Typography.Title><Typography.Paragraph>当前售价{current?' v'+current.version:'未配置'}：</Typography.Paragraph>{priceItems(current,model).map((row,index)=><Typography.Paragraph key={index}>{row.name}：{itemMoney(row)} / {row.unit}</Typography.Paragraph>)}<Typography.Paragraph>发布后售价：</Typography.Paragraph>{value.items.map((row,index)=><Typography.Paragraph key={index}>{row.name}：{row.currency} {row.amount==='' || row.amount==null?'未填写':row.amount} / {row.unit}</Typography.Paragraph>)}<Typography.Paragraph>适用客户：{scope}。发布成功后立即用于后续新请求，含已有订购客户；已开始请求及历史保持原价。仅发布本次售价，其他配置保持不变。</Typography.Paragraph><Button disabled={!ops.can || publishing} loading={publishing} onClick={publish}>确认发布售价</Button></Notice>}
    {ops.error && <Notice error>{ops.error}</Notice>}
    {!readOnly && <div className="ss-footer"><Button disabled={publishing} onClick={close}>取消</Button><Button disabled={!ops.can || publishing} onClick={()=>{try{retailItems(state,value.items,current?.items);ops.setError('');setPreview(true);}catch(issue){setPreview(false);ops.setError(issue.message);}}}>预览变更</Button></div>}
  </section>;
}
