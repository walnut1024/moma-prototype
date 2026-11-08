import {descendantIds,roles,statuses,memberPhoneError,normalizeMemberPhone} from './organization-data.mjs';
import { AUTH_DATA_KEY, ADMIN_DATA_KEY, resolveUserIdentity, notifyLinkedState, serviceReferences, lifecycleAccess } from './service-access.mjs';
import { loadAdminState, serializeAdminState } from './admin-v2/store.js';
import { trackUserConfiguration } from './mock/application-data.js';
import {sharedRequests} from './business-facts.mjs';
import { parseIpAllowlist } from './api-key-utils.mjs';
import { directorySnapshot } from './service-directory.mjs';

export function tenantContext(storage = globalThis.localStorage) {
  const state = loadAdminState(storage);
  if (state.storageError) throw Error(state.storageError);
  const auth = JSON.parse(storage.getItem(AUTH_DATA_KEY) || 'null'), identity = resolveUserIdentity(state, auth);
  const link = auth.identityLinks.find(row => row.authUserId === identity.userId && row.spaceId === identity.spaceId);
  const member = state.memberships.find(row => row.id === link.backendMembershipId);
  return { state, identity, link, canManage: identity.spaceId === 'personal' || ['租户管理员','企业管理员'].includes(member?.role) };
}
export function tenantData(storage = globalThis.localStorage) {
  const {state,identity,link,canManage} = tenantContext(storage);
  const orders = state.orders.filter(row => row.tenantId === identity.tenantId);
  const plans = orders.filter(row => ['已开通','生效中'].includes(row.status)).map(order => ({ ...order, product: state.products.find(row => row.id === order.productId) })).filter(row => /Plan|预付费|订阅/.test(row.product?.billingMode || row.product?.name));
  const keys = state.apiKeys.filter(row => row.tenantId === identity.tenantId && (canManage || row.ownerId === link.backendUserId));
  for(const key of keys){const grant=state.grants.find(row=>row.subjectType==='key'&&row.subjectId===key.id&&row.status==='生效中');key.quota=grant?String(grant.used || 0)+' / '+grant.limit:'不限额度';key.quotaLimit=grant?.limit ?? null;key.quotaType=grant?({day:'日',week:'周',month:'月',total:'总额度'}[grant.period] || '总额度'):'不限额度';key.progress=grant?.limit?Math.min(100,(grant.used || 0)/grant.limit*100):0;}
  const references = directorySnapshot(storage).models.filter(row=>row.defaultCatalogue!==false);
  const requests=sharedRequests(state).filter(row=>row.tenantId===identity.tenantId).map(row=>Object.fromEntries(['id','requestId','modelId','publicModelId','serviceId','tenantId','keyId','httpStatus','usage','durationMs','ttftMs','createdAt','billingType','subscriptionId','source','stream'].filter(key=>Object.hasOwn(row,key)).map(key=>[key,row[key]])));
  return { revision:state.revision, identity,backendUserId:link.backendUserId, canManage, keys, orders, plans, services: references, projects:state.projects.filter(row=>row.tenantId===identity.tenantId), requests, models:state.models.filter(row=>requests.some(request=>request.modelId===row.id)||references.some(service=>service.modelKey===row.id)).map(({id,modelId,name,type})=>({id,modelId,name,type})), routes:(state.tenantRoutes || []).filter(row=>row.tenantId===identity.tenantId && (canManage || row.ownerId===link.backendUserId)),organization: organizationProjection(state,identity.tenantId), error:'' };
}
function save(state,next,identity,action,storage,raw) {
  if (storage.getItem(ADMIN_DATA_KEY)!==raw) throw Error('数据已变化，请刷新后重试');
  next.revision=state.revision+1;next.updatedAt=new Date().toISOString();
  next.audits.unshift({id:crypto.randomUUID(),createdAt:next.updatedAt,updatedAt:next.updatedAt,actor:identity.name,actorId:identity.userId,tenantId:identity.tenantId,action,objectId:identity.tenantId,result:'成功'});
  trackUserConfiguration(state,next);
  storage.setItem(ADMIN_DATA_KEY,serializeAdminState(next));notifyLinkedState();return next;
}
export function saveTenantKeys(rows, { billing='按量付费', subscriptionId, expectedRevision }, storage=globalThis.localStorage) {
  const context=tenantContext(storage), {state,identity}=context, raw=storage.getItem(ADMIN_DATA_KEY);
  if(state.revision!==expectedRevision)throw Error('数据已变化，请刷新后重试');
  const services=directorySnapshot(storage).models;
  return save(state,tenantKeyChanges(context,rows,{billing,subscriptionId},services),identity,'维护 API Key',storage,raw);
}
export function tenantKeyChanges({state,identity,link,canManage}, rows, {billing,subscriptionId}, services) {
  const scoped=state.apiKeys.filter(row=>row.tenantId===identity.tenantId && (canManage || row.ownerId===link.backendUserId) && (row.billingType || '按量付费')===billing && (row.subscriptionId || '')===(subscriptionId || ''));
  const ids=new Set(); const next=structuredClone(state);
  if(subscriptionId&&!state.orders.some(row=>row.id===subscriptionId&&row.tenantId===identity.tenantId&&['已开通','生效中'].includes(row.status)&&(!row.expiresAt || Date.parse(row.expiresAt)>Date.now())))throw Error('套餐归属或状态无效');
  const allowed=new Set(services.filter(item=>item.callable).map(item=>item.modelKey));
  const mapped=rows.map(row=>{
    if(!row.id || ids.has(row.id))throw Error('API Key ID 缺失或重复');ids.add(row.id);
    const existing=state.apiKeys.find(item=>item.id===row.id);
    if(existing && !scoped.some(item=>item.id===row.id))throw Error('无权修改其他客户或用户的 API Key');
    const name=String(row.name || '').trim();if(name.length<2 || name.length>80)throw Error('名称需为2至80个字符');
    const modelIds=row.models===null?[...allowed]:(row.models || []).map(code=>state.models.find(item=>item.modelId===code)?.id || code);
    if(modelIds.some(id=>!allowed.has(id) && !existing?.modelIds?.includes(id)))throw Error('选择了未授权模型');
    const quotaLimit=row.quotaEnabled===false?null:row.quotaLimit;
    if(quotaLimit!==null&&quotaLimit!==undefined&&(!Number.isSafeInteger(quotaLimit)||quotaLimit<0))throw Error('额度必须为非负整数');
    for(const field of ['tpmLimit','qpmLimit'])if(row[field]!=null&&(!Number.isSafeInteger(row[field])||row[field]<1))throw Error('TPM 和 QPM 上限必须为正整数');
    const project=state.projects.find(item=>item.tenantId===identity.tenantId && item.status==='正常');if(!project)throw Error('请先配置当前客户的项目空间');
    const grantId='tenant-grant:'+row.id;
    const grant=existing && next.grants.find(item=>item.subjectType==='key'&&item.subjectId===row.id&&(item.id===grantId||item.status==='生效中'));
    if(quotaLimit!==undefined){
      const period={'日':'day','周':'week','月':'month','总额度':'total','不限额度':'total'}[row.quotaType] || 'day';
      if(quotaLimit!==null){
        if(grant){if(grant.limit!==quotaLimit||grant.period!==period)Object.assign(grant,{limit:quotaLimit,period,used:0});Object.assign(grant,{modelIds,status:'生效中'});}
        else next.grants.push({id:grantId,subjectType:'key',subjectId:row.id,modelIds,period,limit:quotaLimit,used:0,status:'生效中'});
      }else for(const item of next.grants)if(item.subjectType==='key'&&item.subjectId===row.id)item.status='已停用';
    }
    return {...existing,id:row.id,keyId:existing?.keyId || row.id,name,description:String(row.desc || ''),tenantId:identity.tenantId,projectId:existing?.projectId || project.id,ownerId:existing?.ownerId || link.backendUserId,modelIds,status:row.enabled?'有效':'停用',billingType:billing,quotaType:row.quotaType,quotaLimit,tpmLimit:row.tpmLimit ?? null,qpmLimit:row.qpmLimit ?? null,...(subscriptionId?{subscriptionId}:{}),ipAllowlist:parseIpAllowlist((row.ips || []).join('\n')),secretPreview:row.secretPreview || (row.key?.startsWith('sk-')?row.key.slice(0,3)+'****'+row.key.slice(-4):existing?.secretPreview || '****'),credentialVersion:row.credentialVersion || existing?.credentialVersion || 1,createdAt:existing?.createdAt || new Date().toISOString(),updatedAt:new Date().toISOString()};
  });
  const removed=new Set(scoped.filter(row=>!ids.has(row.id)).map(row=>row.id));
  for(const grant of next.grants)if(grant.subjectType==='key'&&removed.has(grant.subjectId))grant.status='已停用';
  next.apiKeys=next.apiKeys.filter(row=>!scoped.some(item=>item.id===row.id)).concat(mapped);
  return next;
}
export function orderTenantServices(serviceIds,expectedRevision,storage=globalThis.localStorage) {
  const {state,identity}=tenantContext(storage),raw=storage.getItem(ADMIN_DATA_KEY);
  if(state.revision!==expectedRevision)throw Error('数据已变化，请刷新后重试');
  if(!serviceIds.length || new Set(serviceIds).size!==serviceIds.length)throw Error('请选择有效的模型服务');
  const next=structuredClone(state),publicRows=directorySnapshot(storage).models;
  for(const id of serviceIds){const service=serviceReferences(state).find(row=>row.id===id),row=publicRows.find(row=>row.id===id);
    if(!service || !row?.callable || !lifecycleAccess(state,service,identity.tenantId).allowed)throw Error('模型服务已下架或无权订购');
    if(state.orders.some(order=>order.tenantId===identity.tenantId&&order.serviceId===id&&['已开通','生效中'].includes(order.status)))throw Error('已订购该模型服务');
    const productId='service-product:'+id;if(!next.products.some(row=>row.id===productId))next.products.push({id:productId,code:productId,name:service.model.name,billingMode:'按量付费',modelIds:[service.modelId],serviceId:id,status:'已上架'});
    next.orders.push({id:crypto.randomUUID(),orderNo:'ORD-'+crypto.randomUUID().slice(0,8),tenantId:identity.tenantId,productId,serviceId:id,amount:0,entitlement:0,status:'生效中',priceSnapshot:row.salePrices,createdAt:new Date().toISOString(),timeline:['订单创建','服务开通']});
  }
  return save(state,next,identity,'订购模型服务',storage,raw);
}
export function organizationProjection(state,tenantId) {
  const root=state.organizations.find(row=>row.tenantId===tenantId&&!row.parentId);
  const id=row=>row===root?.id?'root':row;
  return {platformAccounts:state.users.filter(row=>row.invitable&&row.status==='正常').map(row=>({sourceUserId:row.id,name:row.name,account:row.login,phone:row.phone})),departments:state.organizations.filter(row=>row.tenantId===tenantId).map(row=>({...row,id:id(row.id),parentId:id(row.parentId),ownerId:state.memberships.find(member=>member.tenantId===tenantId&&member.userId===row.ownerId)?.id || null})),members:state.memberships.filter(row=>row.tenantId===tenantId).map(row=>{const user=state.users.find(item=>item.id===row.userId);return {...row,name:row.memberName ?? (user?.name || row.name || '未填写'),phone:row.memberPhone ?? (user?.phone || ''),account:user?.login || user?.email || user?.phone || row.userId,departmentId:id(row.organizationId || row.departmentId) || 'unassigned',role:row.role==='租户管理员'?'企业管理员':row.role,status:row.status==='正常'?'已加入':row.status==='停用'?'已停用':'待加入'};}),audit:state.audits.filter(row=>row.tenantId===tenantId).map(row=>({id:row.id,time:row.createdAt,actor:row.actor,description:row.action}))};
}
export function saveTenantOrganization(data,expectedRevision,storage=globalThis.localStorage) {
  const context=tenantContext(storage), {state,identity}=context, raw=storage.getItem(ADMIN_DATA_KEY);
  if(state.revision!==expectedRevision)throw Error('数据已变化，请刷新后重试');
  return save(state,tenantOrganizationChanges(context,data),identity,data.audit[0]?.description || '维护组织成员',storage,raw);
}
export function tenantOrganizationChanges({state,identity,link,canManage}, data) {
  if(!canManage || identity.spaceId==='personal')throw Error('只有企业管理员可以维护组织成员');
  const next=structuredClone(state),root=state.organizations.find(row=>row.tenantId===identity.tenantId&&!row.parentId);
  if(!root || !data.departments.some(row=>row.id==='root') || !data.members.some(row=>row.role==='企业管理员'&&row.status==='已加入'))throw Error('必须保留根部门和有效企业管理员');

  const before=organizationProjection(state,identity.tenantId);
  if(!data.members.some(row=>row.id===link.backendMembershipId&&row.status==='已加入'))throw Error('不能移除或停用当前登录成员');
  if(new Set(data.departments.map(row=>row.id)).size!==data.departments.length||new Set(data.members.map(row=>row.id)).size!==data.members.length)throw Error('组织或成员 ID 重复');
  for(const row of data.departments){if(row.id==='root'){if(row.name!==before.departments.find(item=>item.id==='root').name||row.parentId!==null)throw Error('根部门不可修改');}else if(!row.name?.trim()||row.name.length>30||!data.departments.some(item=>item.id===row.parentId)||descendantIds(data.departments,row.id).has(row.parentId))throw Error('部门名称或层级无效');}
  for(const row of data.members){const previous=before.members.find(item=>item.id===row.id);if(previous&&JSON.stringify(previous)===JSON.stringify(row))continue;if(!roles.includes(row.role)&&row.role!==previous?.role||!statuses.includes(row.status)||!row.name?.trim()||!row.account||!data.departments.some(item=>item.id===row.departmentId)&&row.departmentId!=='unassigned'||row.role==='部门管理员'&&!data.departments.some(item=>item.id===row.scopeId))throw Error('成员资料、角色或归属无效');if(previous&&row.account!==previous.account)throw Error('登录账号不能修改');if((!previous||row.phone!==previous.phone)&&memberPhoneError(row.phone))throw Error(memberPhoneError(row.phone));}
  for(const row of data.members){const previous=before.members.find(item=>item.id===row.id);if(previous&&row.phone===previous.phone&&row.account===previous.account)continue;if(data.members.some(item=>item.id!==row.id&&(row.phone&&normalizeMemberPhone(item.phone)===normalizeMemberPhone(row.phone)||item.account?.toLowerCase()===row.account.toLowerCase())))throw Error('企业中已存在相同手机号或账号');}
  for(const row of data.departments)if(row.ownerId&&!data.members.some(member=>member.id===row.ownerId&&member.status==='已加入'))throw Error('负责人必须是已加入成员');
  const departmentId=id=>id==='root'?root.id:id;
  for(const department of data.departments){if(state.organizations.some(row=>row.id===departmentId(department.id)&&row.tenantId!==identity.tenantId))throw Error('部门归属冲突');}
  for(const member of data.members){if(state.memberships.some(row=>row.id===member.id&&row.tenantId!==identity.tenantId))throw Error('成员归属冲突');}
  next.organizations=next.organizations.filter(row=>row.tenantId!==identity.tenantId).concat(data.departments.map(row=>({...row,id:departmentId(row.id),parentId:departmentId(row.parentId),tenantId:identity.tenantId,ownerId:data.members.find(member=>member.id===row.ownerId)?.userId || null,status:'正常'})));
  const members=data.members.map(row=>{
    const old=state.memberships.find(item=>item.id===row.id);
    const previous=before.members.find(item=>item.id===row.id);
    if(old&&JSON.stringify(previous)===JSON.stringify(row))return structuredClone(old);
    let userId=old?.userId || before.platformAccounts.find(account=>account.account===row.account)?.sourceUserId;
    if(!userId){
      userId='user:'+crypto.randomUUID();
      next.users.push({id:userId,name:row.name,phone:row.phone,login:row.account,status:'正常'});
    }
    return {...old,id:row.id,userId,tenantId:identity.tenantId,organizationId:departmentId(row.departmentId),
      scopeId:departmentId(row.scopeId),role:row.role==='企业管理员'?'租户管理员':row.role,
      status:row.status==='已加入'?'正常':row.status==='已停用'?'停用':'待加入',
      includeChildren:row.includeChildren,source:old?.source || row.source,
      memberName:row.name===previous?.name ? old?.memberName : row.name,
      memberPhone:row.phone===previous?.phone ? old?.memberPhone : row.phone};
  });
  next.organizations=next.organizations.map(row=>{if(row.tenantId!==identity.tenantId)return row;const source=data.departments.find(department=>departmentId(department.id)===row.id);return {...row,ownerId:members.find(member=>member.id===source.ownerId)?.userId || null};});
  next.memberships=next.memberships.filter(row=>row.tenantId!==identity.tenantId).concat(members);next.identityGeneration=(next.identityGeneration || 0)+1;
  return next;
}
export function recordTenantExperience(ticket,httpStatus,storage=globalThis.localStorage) {
  const {state,identity,link}=tenantContext(storage),raw=storage.getItem(ADMIN_DATA_KEY);
  if(ticket.owner!==identity.key)throw Error('当前身份已变化，请重新发送');
  if(state.requests.some(row=>row.requestId===ticket.requestId))return state;
  const service=serviceReferences(state).find(row=>row.id===ticket.serviceId);if(!service)throw Error('模型服务不存在');
  const next=structuredClone(state),at=new Date().toISOString();
  next.requests.push({id:ticket.requestId,requestId:ticket.requestId,tenantId:identity.tenantId,userId:link.backendUserId,modelId:ticket.modelId || service.modelId,serviceId:service.id,publicModelId:ticket.callId || service.callId,createdAt:ticket.startedAt || at,updatedAt:at,httpStatus,source:'网页端调用',resultSource:'mock-ui',billingType:'按量付费',usage:{},meteringStatus:'待确认',durationMs:Math.max(0,Date.now()-Date.parse(ticket.startedAt || at))});
  return save(state,next,identity,'模型在线体验',storage,raw);
}
export function saveTenantRoutes(rows,expectedRevision,storage=globalThis.localStorage) {
  const context=tenantContext(storage), {state,identity}=context, raw=storage.getItem(ADMIN_DATA_KEY);
  if(state.revision!==expectedRevision)throw Error('数据已变化，请刷新后重试');
  return save(state,tenantRouteChanges(context,rows,directorySnapshot(storage).models),identity,'维护智能路由',storage,raw);
}
export function tenantRouteChanges({state,identity,link,canManage}, rows, services) {
  const current=(state.tenantRoutes || []).filter(row=>row.tenantId===identity.tenantId&&(canManage||row.ownerId===link.backendUserId));
  const available=new Set(services.filter(row=>row.callable).map(row=>row.callId)),ids=new Set(),names=new Set();
  const normalized=rows.map(row=>{const previous=current.find(item=>item.id===row.id);if(!row.id||ids.has(row.id)||names.has(row.name)||String(row.name).length<2||String(row.name).length>50||!['效果优先','成本优先','平衡模式'].includes(row.strategy)||!row.models?.length||row.models.some(id=>!available.has(id)&&!previous?.models.includes(id)))throw Error('路由名称、策略或模型服务无效');ids.add(row.id);names.add(row.name);if((state.tenantRoutes || []).some(item=>item.id===row.id)&&!previous)throw Error('路由归属冲突');return {...row,tenantId:identity.tenantId,ownerId:previous?.ownerId || link.backendUserId};});
  const next=structuredClone(state);next.tenantRoutes=(next.tenantRoutes || []).filter(row=>!current.some(item=>item.id===row.id)).concat(normalized);
  return next;
}
