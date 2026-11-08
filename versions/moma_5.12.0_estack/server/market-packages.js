const userType=tenant=>tenant.type==='个人'?'individual':'enterprise';
const isCoding=p=>/coding/i.test(p.name+' '+p.displayName);
const fail=message=>{throw Error(message);};

export async function listedPackages(db,tenant) {
  const {results}=await db.prepare(`SELECT record_json FROM token_package_records WHERE collection='tokenPackages'
    AND json_extract(record_json,'$.status')='listed' AND json_extract(record_json,'$.deletedAt') IS NULL`).all();
  return results.map(row=>JSON.parse(row.record_json)).filter(row=>!tenant || row.userTypes.includes(userType(tenant)));
}

export function packageOffer(row) {
  const {id,revision,name,displayName,kind,price,quota,period,cycles,validDays,displayOrder,modelIds}=row;
  return {id,revision,name:displayName || name,kind,price,quota,period,cycles,validDays,displayOrder,modelIds,coding:isCoding(row)};
}

function packageExpiry(config,now) {
  const expiry=new Date(now);
  if(config.kind==='pack') expiry.setUTCDate(expiry.getUTCDate()+Number(config.validDays));
  else {
    const day=expiry.getUTCDate(), months={month:1,quarter:3,year:12}[config.period]*Number(config.cycles);
    expiry.setUTCDate(1);
    expiry.setUTCMonth(expiry.getUTCMonth()+months+1,0);
    expiry.setUTCDate(Math.min(day,expiry.getUTCDate()));
  }
  if(!Number.isFinite(expiry.getTime()) || expiry.getTime()<=now)fail('套餐有效期无效');
  return expiry.toISOString();
}

export async function addPackageOrders(db,state,tenant,operationId,items,available) {
  const packages=await listedPackages(db,tenant);
  const {results}=await db.prepare('SELECT id,record_json FROM token_package_model_factors').all();
  const factors=new Map(results.map(row=>[row.id,JSON.parse(row.record_json)]));
  const now=Date.now(),createdAt=new Date(now).toISOString();
  const orders=items.map(({id,revision},position)=>{
    const config=packages.find(row=>row.id===id && row.revision===revision);
    if(!config)fail('所选套餐已下架或内容有变化，请重新选择');
    if(config.limited && state.orders.filter(row=>row.packageId===id && row.tenantId===tenant.id).length>=Number(config.purchaseLimit)) fail('已达到该套餐的限购份数');
    const product=packageOffer(config), models=new Set(product.modelIds);
    const eligible=available.filter(row=>row.canOrder && models.has(row.modelKey));
    if(!eligible.length || !product.modelIds.every(modelId=>factors.get(modelId)?.rules?.length))fail('套餐当前没有可用的模型服务或抵扣规则');
    const orderId='plan:'+operationId+':'+position;
    return {
      id:orderId,orderNo:orderId,tenantId:tenant.id,userId:tenant.ownerId,accountType:userType(tenant),accountName:tenant.name,
      packageId:id,packageRevision:revision,product:{...product,billingMode:product.coding?'Coding Plan':'Token Plan'},
      billingType:product.coding?'coding':'plan',modelIds:[...new Set(eligible.map(row=>row.serviceModelId))],
      factorSnapshot:Object.fromEntries(product.modelIds.map(modelId=>[modelId,factors.get(modelId).rules])),
      amount:Number(config.price),entitlement:Number(config.quota)*10000,quotaUnit:'Token',used:0,status:'生效中',
      createdAt,expiresAt:packageExpiry(config,now),timeline:['模拟订单创建','权益发放'],
    };
  });
  return {...state,orders:[...orders,...state.orders],ledger:[...orders.map(order=>({
    id:'ledger:'+order.id,accountId:tenant.id,sourceId:'entitlement:'+order.id,type:'订购权益',delta:order.entitlement,
    balance:order.entitlement,unit:'Token',reason:order.orderNo,status:'已完成',createdAt,
  })),...state.ledger]};
}

export function deductMockPlan(state,request,model) {
  const plan=state.orders.find(row=>row.id===request.subscriptionId && row.tenantId===request.tenantId);
  if(!plan?.packageId)return;
  if(!['已开通','生效中'].includes(plan.status) || Date.parse(plan.expiresAt)<=Date.now())fail('套餐已失效');
  const rules=plan.factorSnapshot[model.templateId || model.id];
  if(!rules?.length || !plan.modelIds.includes(model.id))fail('套餐不支持该模型');
  const usage=request.usage, input=usage.input ?? 0;
  const quantity=(request.priceSnapshot?.items || []).filter(item=>item.unit==='百万 Token').map(item=>{
    const id=state.tariffDictionary.find(row=>row.kind==='scenario' && row.name===item.name)?.id;
    const factor=rules.find(row=>row.billingItemId===id && (row.lower==null || input>row.lower) && (row.upper==null || input<=row.upper))?.factor;
    const value=/缓存/.test(item.name)?usage.cached ?? 0:/输出/.test(item.name)?usage.output:/(总|用量)/.test(item.name)?input+(usage.output ?? 0):input;
    if(!Number.isFinite(value) || !Number.isFinite(Number(factor)) || Number(factor)<=0)fail('套餐缺少当前计费项的抵扣规则');
    return value*Number(factor);
  });
  if(!quantity.length)fail('套餐当前没有可抵扣的 Token 计量');
  const deduction=Math.ceil(quantity.reduce((sum,value)=>sum+value,0));
  if(!Number.isSafeInteger(deduction) || deduction<0 || plan.used+deduction>plan.entitlement)fail('套餐额度不足');
  plan.used+=deduction;
  request.planDeduction=deduction;
  state.ledger.unshift({id:'plan-usage:'+request.requestId,accountId:plan.id,sourceId:'request:'+request.requestId,type:'套餐抵扣',
    delta:-deduction,balance:plan.entitlement-plan.used,unit:'Token',status:'已完成',reason:request.requestId,
    prototypeFact:true,createdAt:request.createdAt});
}
