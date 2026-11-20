import { resourceId } from './resource-id.mjs';
import { changeTenantRoute, visibleProjectRoutes } from './tenant-routing.mjs';
import { assertProjectAdministratorsPreserved, assertProjectDepartmentsPreserved, projectAccess, projectModelEnabled } from './project-access.mjs';
import { changeProjectKeys, maskedProjectKeys } from './project-keys.mjs';
import {descendantIds,roles,statuses,memberPhoneError,normalizeMemberPhone} from './organization-data.mjs';
import { AUTH_DATA_KEY, ADMIN_DATA_KEY, resolveUserIdentity, notifyLinkedState, serviceReferences, lifecycleAccess } from './service-access.mjs';
import { loadAdminState, serializeAdminState } from './admin-v2/store.js';
import { trackUserConfiguration } from './mock/application-data.js';
import {sharedRequests} from './business-facts.mjs';
import { directorySnapshot } from './service-directory.mjs';

export function tenantContext(storage = globalThis.localStorage) {
  const state = loadAdminState(storage);
  if (state.storageError) throw Error(state.storageError);
  const auth = JSON.parse(storage.getItem(AUTH_DATA_KEY) || 'null'), identity = resolveUserIdentity(state, auth);
  const link = auth.identityLinks.find(row => row.authUserId === identity.userId && row.spaceId === identity.spaceId);
  const member = state.memberships.find(row => row.id === link.backendMembershipId);
  return { state, identity, link, canManage: identity.spaceId === 'personal' || ['租户管理员','企业管理员'].includes(member?.role) };
}
function tenantRoutingServices(state, tenantId, services) {
  const at = Date.now();
  const ordered = new Set(state.orders.filter(row => row.tenantId === tenantId && ['已开通', '生效中'].includes(row.status) &&
    (!row.endAt || Date.parse(row.endAt) > at)).map(row => row.serviceId));
  const models = new Map(state.models.map(row => [row.id, row.templateId || row.id]));
  return services.map(row => ({ ...row, modelKey: models.get(row.modelKey) || row.modelKey, serviceModelId: row.modelKey,
    ordered: ordered.has(row.id), canOrder: row.callable && !ordered.has(row.id), callable: row.callable && ordered.has(row.id) }));
}

export function tenantData(storage = globalThis.localStorage) {
  const {state,identity,link,canManage} = tenantContext(storage);
  const orders = state.orders.filter(row => row.tenantId === identity.tenantId);
  const plans = orders.filter(row => ['已开通','生效中'].includes(row.status)).map(order => ({ ...order, product: state.products.find(row => row.id === order.productId) })).filter(row => /Plan|预付费|订阅/.test(row.product?.billingMode || row.product?.name));
  const keys = state.apiKeys.filter(row => row.tenantId === identity.tenantId && (canManage || row.ownerId === link.backendUserId));
  for(const key of keys){const grant=state.grants.find(row=>row.subjectType==='key'&&row.subjectId===key.id&&row.status==='生效中');key.quota=grant?String(grant.used || 0)+' / '+grant.limit:'不限额度';key.quotaLimit=grant?.limit ?? null;key.quotaType=grant?({day:'日',week:'周',month:'月',total:'总额度'}[grant.period] || '总额度'):'不限额度';key.progress=grant?.limit?Math.min(100,(grant.used || 0)/grant.limit*100):0;}
  const references = directorySnapshot(storage).models.filter(row=>row.defaultCatalogue!==false);
  const requests=sharedRequests(state).filter(row=>row.tenantId===identity.tenantId).map(row=>Object.fromEntries(['id','requestId','modelId','publicModelId','serviceId','tenantId','keyId','httpStatus','usage','durationMs','ttftMs','createdAt','billingType','subscriptionId','source','stream'].filter(key=>Object.hasOwn(row,key)).map(key=>[key,row[key]])));
  return { revision:state.revision, identity,backendUserId:link.backendUserId, canManage, keys, orders, plans, services: references, projects:state.projects.filter(row=>row.tenantId===identity.tenantId), requests, models:state.models.filter(row=>requests.some(request=>request.modelId===row.id)||references.some(service=>service.modelKey===row.id)).map(({id,modelId,name,type})=>({id,modelId,name,type})), routes:visibleProjectRoutes({state,identity,link}),organization: {...organizationProjection(state,identity.tenantId),...(!canManage ? {audit:[],platformAccounts:undefined} : {})}, error:'' };
}
function save(state,next,identity,action,storage,raw) {
  if (storage.getItem(ADMIN_DATA_KEY)!==raw) throw Error('数据已变化，请刷新后重试');
  next.revision=state.revision+1;next.updatedAt=new Date().toISOString();
  next.audits.unshift({id:resourceId('audit-event'),createdAt:next.updatedAt,updatedAt:next.updatedAt,actor:identity.name,actorId:identity.userId,tenantId:identity.tenantId,action,objectId:identity.tenantId,result:'成功'});
  trackUserConfiguration(state,next);
  storage.setItem(ADMIN_DATA_KEY,serializeAdminState(next));notifyLinkedState();return next;
}
export function saveTenantKeys(rows, { projectId, billing='按量付费', subscriptionId, expectedRevision }, storage=globalThis.localStorage) {
  const context=tenantContext(storage), {state,identity}=context, raw=storage.getItem(ADMIN_DATA_KEY);
  if(state.revision!==expectedRevision)throw Error('数据已变化，请刷新后重试');
  const services=directorySnapshot(storage).models.filter(row=>row.callable);
  const { next }=changeProjectKeys(context,maskedProjectKeys(rows),{projectId,billing,subscriptionId},services);
  return save(state,next,identity,'维护 API Key',storage,raw);
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
    next.orders.push({id:resourceId('order'),orderNo:'ORD-'+crypto.randomUUID().slice(0,8),tenantId:identity.tenantId,productId,serviceId:id,amount:0,entitlement:0,status:'生效中',priceSnapshot:row.salePrices,createdAt:new Date().toISOString(),timeline:['订单创建','服务开通']});
  }
  return save(state,next,identity,'订购模型服务',storage,raw);
}
export function organizationProjection(state,tenantId) {
  const root=state.organizations.find(row=>row.tenantId===tenantId&&!row.parentId);
  const id=row=>row===root?.id?'root':row;
  return {rootId:root?.id,platformAccounts:state.users.filter(row=>row.invitable&&row.status==='正常').map(row=>({sourceUserId:row.id,name:row.name,account:row.login,phone:row.phone})),departments:state.organizations.filter(row=>row.tenantId===tenantId).map(row=>({...row,id:id(row.id),parentId:id(row.parentId),ownerId:state.memberships.find(member=>member.tenantId===tenantId&&member.userId===row.ownerId)?.id || null})),members:state.memberships.filter(row=>row.tenantId===tenantId).map(row=>{const user=state.users.find(item=>item.id===row.userId);return {...row,name:row.memberName ?? (user?.name || row.name || '未填写'),phone:row.memberPhone ?? (user?.phone || ''),account:user?.login || user?.email || user?.phone || row.userId,departmentId:id(row.organizationId || row.departmentId) || 'unassigned',role:row.role==='租户管理员'?'企业管理员':row.role,status:row.status==='正常'?'已加入':row.status==='停用'?'已停用':'待加入'};}),audit:state.audits.filter(row=>row.tenantId===tenantId).map(row=>({id:row.id,time:row.createdAt,actor:row.actorRole ? row.actor + '（' + row.actorRole + '）' : row.actor,description:row.action,departmentIds:row.departmentIds}))};
}
export function saveTenantOrganization(data,expectedRevision,storage=globalThis.localStorage) {
  const context=tenantContext(storage), {state,identity}=context, raw=storage.getItem(ADMIN_DATA_KEY);
  if(state.revision!==expectedRevision)throw Error('数据已变化，请刷新后重试');
  return save(state,tenantOrganizationChanges(context,data),identity,data.audit[0]?.description || '维护组织成员',storage,raw);
}
export function organizationManagementScope({state,identity,link}) {
  const member = state.memberships.find(row=>row.id===link.backendMembershipId && row.tenantId===identity.tenantId && row.status==='正常');
  if (member?.role !== '部门管理员') return null;
  const departments = state.organizations.filter(row=>row.tenantId===identity.tenantId && row.status!=='停用');
  const scope = departments.find(row=>row.id===member.scopeId);
  if (!scope) return null;
  const ids = member.includeChildren ? descendantIds(departments,scope.id) : new Set([scope.id]);
  return new Set(departments.filter(row=>ids.has(row.id)).map(row=>row.parentId===null ? 'root' : row.id));
}
export function scopedOrganization(context) {
  const {state,identity,canManage}=context;
  if (identity.spaceId==='personal') return {departments:[],members:[],audit:[]};
  const full = organizationProjection(state,identity.tenantId);
  if (canManage) return full;
  const scope = organizationManagementScope(context);
  if (!scope) return { departments:full.departments, members:full.members.filter(row=>row.id===context.link.backendMembershipId), audit:[] };
  return { ...full, departments:full.departments.filter(row=>scope.has(row.id)),
    members:full.members.filter(row=>scope.has(row.departmentId)),
    audit:full.audit.filter(row=>row.departmentIds?.length && row.departmentIds.every(id=>scope.has(id))) };
}
export function tenantOrganizationChanges(context, data) {
  const {state,identity,canManage}=context;
  if (identity.spaceId==='personal') throw Error('个人空间不支持组织管理');
  if (canManage) return applyTenantOrganization(context,data);
  const scope = organizationManagementScope(context);
  if (!scope) throw Error('当前账号无组织管理权限');
  const visible = scopedOrganization(context);
  const members = new Map(visible.members.map(row=>[row.id,row]));
  if (JSON.stringify(data.departments)!==JSON.stringify(visible.departments)) throw Error('部门管理员不能变更组织架构');
  for (const row of data.members) {
    const old = members.get(row.id);
    if (old && JSON.stringify(row)===JSON.stringify(old)) continue;
    if ((old && old.role!=='普通成员') || row.role!=='普通成员' || !scope.has(row.departmentId)) {
      throw Error('只可管理授权部门内的普通成员');
    }
  }
  const present = new Set(data.members.map(row=>row.id));
  if (visible.members.some(row=>!present.has(row.id) && row.role!=='普通成员')) throw Error('不能移除组织管理员');
  const full = organizationProjection(state,identity.tenantId);
  const outside = full.members.filter(row=>!members.has(row.id));
  return applyTenantOrganization(context,{ ...full,members:[...outside,...data.members] });
}
function applyTenantOrganization({state,identity,link}, data) {
  if(identity.spaceId==='personal')throw Error('只有企业管理员可以维护组织成员');
  const next=structuredClone(state),root=state.organizations.find(row=>row.tenantId===identity.tenantId&&!row.parentId);
  if(!root || !data.departments.some(row=>row.id==='root') || !data.members.some(row=>row.role==='企业管理员'&&row.status==='已加入'))throw Error('必须保留根部门和有效企业管理员');

  const before=organizationProjection(state,identity.tenantId);
  if(!link.systemAdministrator && !data.members.some(row=>row.id===link.backendMembershipId&&row.status==='已加入'))throw Error('不能移除或停用当前登录成员');
  if(new Set(data.departments.map(row=>row.id)).size!==data.departments.length||new Set(data.members.map(row=>row.id)).size!==data.members.length)throw Error('组织或成员 ID 重复');
  for(const row of data.departments){if(row.id==='root'){if(row.name!==before.departments.find(item=>item.id==='root').name||row.parentId!==null)throw Error('根部门不可修改');}else if(!row.name?.trim()||row.name.length>30||!data.departments.some(item=>item.id===row.parentId)||descendantIds(data.departments,row.id).has(row.parentId))throw Error('部门名称或层级无效');}
  if(data.members.some(row=>row.status!=='待加入' && before.members.some(member=>member.id===row.id && member.status==='待加入')))
    throw Error('待加入成员须本人通过邀请链接确认');
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
    const username=String(row.account).trim().toLowerCase();
    const invited=next.users.find(account=>account.login?.toLowerCase()===username);
    let userId=old?.userId || before.platformAccounts.find(account=>account.account?.toLowerCase()===username)?.sourceUserId;
    if(!userId && invited?.status==='正常' && row.status==='待加入' && row.phone && normalizeMemberPhone(invited.phone)===normalizeMemberPhone(row.phone))userId=invited.id;
    if(!userId){
      if(invited)throw Error('该账号已存在，无法创建同名成员身份');
      userId=resourceId('user');
      next.users.push({id:userId,name:row.name,phone:row.phone,login:username,status:'正常'});
    }
    return {...old,id:row.id,userId,tenantId:identity.tenantId,organizationId:departmentId(row.departmentId),
      scopeId:departmentId(row.scopeId),role:row.role==='企业管理员'?'租户管理员':row.role,
      status:row.status==='已加入'?'正常':row.status==='已停用'?'停用':'待加入',
      includeChildren:row.includeChildren,source:old?.source || row.source,
      memberName:row.name===previous?.name ? old?.memberName : row.name,
      memberPhone:row.phone===previous?.phone ? old?.memberPhone : row.phone};
  });
  next.organizations=next.organizations.map(row=>{if(row.tenantId!==identity.tenantId)return row;const source=data.departments.find(department=>departmentId(department.id)===row.id);return {...row,ownerId:members.find(member=>member.id===source.ownerId)?.userId || null};});
  next.memberships=next.memberships.filter(row=>row.tenantId!==identity.tenantId).concat(members);
  assertProjectAdministratorsPreserved(state, next, identity.tenantId);
  assertProjectDepartmentsPreserved(state, next, identity.tenantId);
  next.identityGeneration=(next.identityGeneration || 0)+1;
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
export function saveTenantRoutes(input, expectedRevision, storage = globalThis.localStorage) {
  const context = tenantContext(storage), { state, identity } = context, raw = storage.getItem(ADMIN_DATA_KEY);
  if (state.revision !== expectedRevision) throw Error('数据已变化，请刷新后重试');
  const services = tenantRoutingServices(state, identity.tenantId, directorySnapshot(storage).models);
  return save(state, changeTenantRoute(context, input, services, resourceId('route')), identity, '维护智能路由', storage, raw);
}

export function projectRouting(context) {
  const {state, identity, link} = context;
  const projects = projectAccess(state, identity, link).projects.map(({id, name, status, canEdit}) => ({ id, name, status, canEdit }));
  return {
    projects,
    routes: (state.projectRoutes || []).filter(row => row.tenantId === identity.tenantId && projects.some(project => project.id === row.projectId)),
    keys: state.apiKeys.filter(row => row.tenantId === identity.tenantId && row.status === '有效' && row.kind !== 'experience' && (!row.expiresAt || Date.parse(row.expiresAt) > Date.now()) &&
      projects.some(project => project.id === row.projectId && project.canEdit))
      .map(({id, name, projectId}) => ({id, name, projectId})),
  };
}

export function projectRouteChanges(context, input, {remove, operationId}, catalogue) {
  const {state, identity, link} = context;
  if (!input || input.id != null && typeof input.id !== 'string' || typeof input.projectId !== 'string') throw Error('项目路由配置无效');
  const routes = state.projectRoutes || [];
  const current = routes.find(route => route.id === input.id);
  const project = projectAccess(state, identity, link).projects.find(row => row.id === input.projectId);
  if (!project?.canEdit || current && (current.tenantId !== identity.tenantId || current.projectId !== project.id)) throw Error('无权维护该项目的路由');
  if ((remove || input.id) && !current) throw Error('项目路由已不存在');
  const next = structuredClone(state);
  if (remove) {
    next.projectRoutes = routes.filter(row => row.id !== current.id);
    return next;
  }
  const name = String(input.name ?? '').trim(), code = String(input.code ?? '').trim();
  if (name.length < 2 || name.length > 50 || !/^[A-Za-z0-9][A-Za-z0-9_-]{1,49}$/.test(code)) throw Error('请填写名称及 2–50 位策略标识，标识使用字母、数字、下划线或连字符');
  if (current && current.code !== code) throw Error('已创建的策略标识不可修改');
  if (routes.some(row=>row.id!==current?.id && row.tenantId===identity.tenantId && row.projectId===project.id && row.code===code)) {
    throw Error('策略标识已在当前项目使用');
  }
  const services = new Set(catalogue.filter(row => (row.canOrder || row.callable) && projectModelEnabled(project,row.modelKey)).map(row => row.id));
  if (!Array.isArray(input.rules) || input.rules.length > 20) throw Error('最多配置 20 条匹配规则');
  const matches = new Set();
  const rules = input.rules.map(rule => {
    const {field, service} = rule;
    const value = String(rule.value ?? '').trim();
    if (!['apikey','metadata._user'].includes(field) || !value || value.length > 128 || !services.has(service)) throw Error('请填写有效的匹配条件和目标模型服务');
    if (field === 'apikey' && !state.apiKeys.some(row => row.id === value && row.tenantId === identity.tenantId && row.projectId === project.id && row.status === '有效' && row.kind !== 'experience' && (!row.expiresAt || Date.parse(row.expiresAt) > Date.now()))) throw Error('请选择当前项目的有效 API Key');
    const match = JSON.stringify([field,value]);
    if (matches.has(match)) throw Error('匹配条件不能重复');
    matches.add(match);
    return {field,value,service};
  });
  const fallback = input.fallback;
  const primary = new Set([input.defaultService,...rules.map(row=>row.service)]);
  if (!services.has(input.defaultService) || !Array.isArray(fallback) || fallback.length > 5 ||
      new Set(fallback).size !== fallback.length || fallback.some(id => !services.has(id) || primary.has(id))) throw Error('请选择默认模型服务。备用模型最多 5 个，须可调用且不能与目标重复');
  const record = {id:current?.id ?? 'project-route-'+operationId, tenantId:identity.tenantId, projectId:project.id,
    name, code, rules, defaultService:input.defaultService, fallback:[...fallback]};
  next.projectRoutes = current ? routes.map(row => row.id === current.id ? record : row) : [...routes,record];
  return next;
}
