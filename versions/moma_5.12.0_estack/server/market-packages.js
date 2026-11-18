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
