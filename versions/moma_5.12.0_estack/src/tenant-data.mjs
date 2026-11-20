import { assertPersonalProjects } from './personal-project.mjs';
import { resourceId } from './resource-id.mjs';
import { changeTenantRoute, tenantRouteVisible } from './tenant-routing.mjs';
import {descendantIds,roles,statuses,memberPhoneError,normalizeMemberPhone} from './organization-data.mjs';
import { AUTH_DATA_KEY, ADMIN_DATA_KEY, resolveUserIdentity, readLinkedState, notifyLinkedState, serviceReferences, lifecycleAccess, accessError, workspaceServiceOrdered } from './service-access.mjs';
import { siteSettlement } from './site-config.mjs';
import { loadAdminState, serializeAdminState } from './admin-v2/store.js';
import { trackUserConfiguration } from './mock/application-data.js';
import {sharedRequests} from './business-facts.mjs';
import { changeProjectKeys, maskedProjectKeys } from './project-keys.mjs';
import { directorySnapshot } from './service-directory.mjs';
import { projectAccess, requireProject, experienceKeyId, projectRole, projectModelEnabled } from './project-access.mjs';
import { activeProjectMembers, changeProject, newProject } from './project-configuration.mjs';
import { projectSpend, requestCharge, projectCallError, projectCallErrors, retainedProjectText } from './project-call.mjs';
import { prepareCustomerLogins, writeCustomerState } from './customer-identity.mjs';

export function tenantContext(storage = globalThis.localStorage) {
  const state = loadAdminState(storage);
  if (state.storageError) throw Error(state.storageError);
  const auth = JSON.parse(storage.getItem(AUTH_DATA_KEY) || 'null'), identity = resolveUserIdentity(state, auth, storage);
  const link = auth.identityLinks.find(row => row.authUserId === identity.userId && row.spaceId === identity.spaceId);
  const member = state.memberships.find(row => row.id === link.backendMembershipId);
  return { state, identity, link, canManage: identity.spaceId === 'personal' || ['租户管理员','企业管理员'].includes(member?.role) };
}

export function accountProjects(auth, spaces, storage = globalThis.localStorage) {
  const state = readLinkedState(storage);
  const projectsById = new Map(state.projects.map(row => [row.id, row]));
  return spaces.filter(space => space.id !== 'personal').flatMap(space => {
    let identity;
    try { identity = resolveUserIdentity(state, { ...auth, activeSpace:space.id }, storage); }
    catch { return []; }
    const link = auth.identityLinks.find(row => row.authUserId === identity.userId && row.spaceId === space.id);
    const member = state.memberships.find(row => row.id === link.backendMembershipId);
    return projectAccess(state, identity, link).projects
      .filter(row => row.status !== '已删除')
      .map(({ id, name, status, createdAt, role }) => ({
        id, name, status, createdAt, role, spaceId:space.id, tenantName:identity.tenantName,
        canExit:Boolean(projectRole(projectsById.get(id), member)),
      }));
  });
}
const tenantRequestFields = ['id','requestId','modelId','publicModelId','serviceId','tenantId','projectId','keyId','httpStatus','error','usage','durationMs','ttftMs','createdAt','updatedAt','billingType','subscriptionId','source','stream','finalStatus','isCanceled','isTimeout','streamInterrupted','finishReason','modelType','usageUnit','usageConfirmed'];
const tenantRequest = (row, includeContent = false) => ({
  ...Object.fromEntries(tenantRequestFields.filter(key => Object.hasOwn(row, key)).map(key => [key, row[key]])),
  ...(includeContent && row.projectId && row.contentRetained ? { requestBody: row.requestBody, responseBody: row.responseBody } : {}),
});
// The API simulator copies Key ownership into userId; only explicit callers count here.
const requestActor = row => row.actorUserId || (row.resultSource === 'mock-ui' || row.id?.startsWith('usage-demo-') ? row.userId : undefined);

function scopedUsageReport(state, { rows, keys, projects, identity, backendUserId, canManage, settlement }) {
  const canFilterUser = canManage && identity.spaceId !== 'personal';
  const users = new Set();
  const models = new Map(state.models.map(model => [model.id, model]));
  const records = [];
  for (const row of rows) {
    const userId = requestActor(row);
    if (userId && canFilterUser) users.add(userId);
    records.push({
      ...tenantRequest(row), projectId: row.projectId, userId: canFilterUser || userId === backendUserId ? userId : undefined,
      modelType: row.modelType, usageUnit: row.usageUnit, usageConfirmed: row.usageConfirmed, cacheHit: row.cacheHit === true,
      usageStatus: row.usageStatus, planTokens: row.planTokens, settlement:row.settlement,
      charge: (settlement === 'internal' ? row.settlement === 'internal' : row.settlement !== 'internal')
        ? requestCharge(state, row, models.get(row.modelId) || { type: row.modelType }) : null,
    });
  }
  const members = new Set(state.memberships.filter(member => member.tenantId === identity.tenantId).map(member => member.userId));
  members.add(backendUserId);
  const usersById = new Map(state.users.filter(user => users.has(user.id) && members.has(user.id)).map(user => [user.id, user.name]));
  return {
    records, canFilterUser, asOf: new Date(),
    projects,
    keys: keys.map(({ id, name, projectId, billingType }) => ({ id, name, projectId, billingType })),
    users: [...users].map(id => ({ id, name: usersById.get(id) || id })),
  };
}

function tenantRoutingServices(state, services) {
  const models = new Map(state.models.map(row => [row.id, row.templateId || row.id]));
  return services.map(row => ({ ...row, modelKey: models.get(row.modelKey) || row.modelKey, serviceModelId: row.modelKey,
    canOrder: row.orderable }));
}

export function tenantData(storage = globalThis.localStorage, { usageReport = false } = {}) {
  const {state,identity,link,canManage} = tenantContext(storage);
  const {projects, canCreate: canCreateProject} = projectAccess(state, identity, link);
  const projectById = new Map(projects.map(project => [project.id, project]));
  const orders = state.orders.filter(row => row.tenantId === identity.tenantId).map(order =>
    ({ ...order, productName:state.products.find(product => product.id === order.productId)?.name }));
  const plans = orders.filter(row => ['已开通','生效中'].includes(row.status)).map(order => ({ ...order, product: state.products.find(row => row.id === order.productId) })).filter(row => /Plan|预付费|订阅/.test(row.product?.billingMode || row.product?.name));
  const visibleKeys = state.apiKeys.filter(row => row.tenantId === identity.tenantId &&
    (canManage || (projectById.has(row.projectId) && (projectById.get(row.projectId).canManage || row.ownerId === link.backendUserId))));
  const keys = visibleKeys.filter(row => row.kind !== 'experience' && row.status !== '已删除');
  for(const key of keys){const grant=state.grants.find(row=>row.subjectType==='key'&&row.subjectId===key.id&&row.status==='生效中');key.quota=grant?String(grant.used || 0)+' / '+grant.limit:'不限额度';key.quotaLimit=grant?.limit ?? null;key.quotaType=grant?({day:'日',week:'周',month:'月',total:'总额度'}[grant.period] || '总额度'):'不限额度';key.progress=grant?.limit?Math.min(100,(grant.used || 0)/grant.limit*100):0;}
  const directory = directorySnapshot(storage).models;
  const references = directory.filter(row=>row.defaultCatalogue!==false);
  const visibleKeyIds = new Set(keys.map(key => key.id));
  const rows = sharedRequests(state).filter(row => row.tenantId === identity.tenantId && (canManage ||
    ((!row.projectId || projectById.has(row.projectId)) && (projectById.get(row.projectId)?.canManage ||
      requestActor(row) === link.backendUserId || visibleKeyIds.has(row.keyId)))));
  const routeProjects = projects.map(({id, name, status, canEdit}) => ({id, name, status, canEdit}));
  const requests = rows.map(row => tenantRequest(row, projectById.get(row.projectId)?.canManage === true));
  const models = state.models.filter(row=>requests.some(request=>request.modelId===row.id)||directory.some(service=>service.modelKey===row.id)).map(({id,modelId,name,type})=>({id,modelId,name,type}));
  const settlement = siteSettlement(storage);
  const report = usageReport ? scopedUsageReport(state, { rows, keys, projects, identity, backendUserId: link.backendUserId, canManage, settlement }) : undefined;
  if (report) {
    const reportedKeyIds = new Set(report.records.map(row => row.keyId));
    report.keys.push(...visibleKeys.filter(key => (key.kind === 'experience' || key.status === '已删除') && reportedKeyIds.has(key.id))
      .map(({id, name, projectId, billingType}) => ({id, name, projectId, billingType})));
    const productModels = new Map(state.products.map(product => [product.id, product.modelIds]));
    report.subscribedModelIds = settlement === 'internal' ? [...new Set(directory.filter(service => service.serviceAvailable).map(service => service.modelKey))] : [...new Set(orders
      .filter(order => ['已开通', '生效中'].includes(order.status) && (!order.endAt || Date.parse(order.endAt) > report.asOf.getTime()))
      .flatMap(order => order.modelIds ?? productModels.get(order.productId) ?? []).filter(Boolean))];
    const visibleModelIds = new Set([...references.map(service => service.modelKey), ...report.records.map(row => row.modelId), ...report.subscribedModelIds]);
    report.models = state.models.filter(model => visibleModelIds.has(model.id))
      .map(({ id, modelId, name, type, usageUnit }) => ({ id, modelId, name, type, usageUnit }));
  }
  const projectRouting = {
    projects: routeProjects,
    routes: (state.projectRoutes || []).filter(row => row.tenantId === identity.tenantId && routeProjects.some(project => project.id === row.projectId)),
    keys: state.apiKeys.filter(row => row.tenantId === identity.tenantId && row.status === '有效' && row.kind !== 'experience' &&
      routeProjects.some(project => project.id === row.projectId && project.canEdit))
      .map(({ id, name, projectId }) => ({ id, name, projectId })),
  };
  const members = activeProjectMembers(state, identity.tenantId);
  const projectMembers = Object.fromEntries(projects.map(project => [project.id, members.flatMap(member => {
    const role = projectRole(project, member);
    return role || project.canManage ? [{ id: member.id, name: member.name, role,
      departmentId: member.organizationId || member.departmentId, self: member.id === link.backendMembershipId }] : [];
  })]));
  const projectBudgets = Object.fromEntries(projects.filter(row => row.canManage && row.spendBudget?.amountMicros)
    .map(project => [project.id, projectSpend(state, project)]));
  const projectAudits = state.audits.filter(row => row.tenantId === identity.tenantId && projectById.get(row.projectId)?.canManage)
    .map(({ id, projectId, createdAt, actor, action, objectId, result }) => ({ id, projectId, createdAt, actor, action, objectId, result }));
  const logKeys = visibleKeys.map(({ id, projectId, name, secretPreview, kind }) => ({ id, projectId, name, secretPreview, kind }));
  return { revision:state.revision, identity,backendUserId:link.backendUserId, canManage, canCreateProject, keys, logKeys, orders, plans, settlement, services: references,
    projectServices: directory.filter(row => row.serviceAvailable), projects, requests, models, report, projectMembers, projectBudgets, projectAudits, projectRouting,
    routeServices:tenantRoutingServices(state,directory), routes:(state.tenantRoutes || []).filter(row=>tenantRouteVisible(row,identity.tenantId,link.backendUserId,canManage)),organization: organizationProjection(state,identity.tenantId), error:'' };
}
function save(state,next,identity,action,storage,raw,projectId,objectId,login) {
  if (storage.getItem(ADMIN_DATA_KEY)!==raw) throw Error('数据已变化，请刷新后重试');
  if (JSON.stringify(state.projects) !== JSON.stringify(next.projects)) assertPersonalProjects(state, next);
  next.revision=state.revision+1;next.updatedAt=new Date().toISOString();
  const actions = Array.isArray(action) ? action : [{ action, objectId }];
  next.audits.unshift(...actions.map(entry => ({ id:resourceId('audit-event'), createdAt:next.updatedAt, updatedAt:next.updatedAt,
    actor:identity.name, actorId:identity.userId, tenantId:identity.tenantId, action:entry.action,
    objectId:entry.objectId || projectId || identity.tenantId, ...(projectId ? {projectId} : {}), result:'成功' })));
  trackUserConfiguration(state,next);
  writeCustomerState(storage,raw,serializeAdminState(next),login);notifyLinkedState();return next;
}
export function createTenantProject(input, { expectedRevision, identityKey }, storage=globalThis.localStorage) {
  const {state,identity,link}=tenantContext(storage),raw=storage.getItem(ADMIN_DATA_KEY);
  if (identity.key !== identityKey) throw Error('当前使用空间已变化，请重新新建项目');
  if (state.revision !== expectedRevision) throw Error('数据已变化，请重新打开表单后重试');
  const project = newProject({ state, identity, link }, input, resourceId('project'));
  save(state, {...state, projects: [...state.projects, project], audits: [...state.audits]}, identity,
    '创建项目', storage, raw, project.id);
  return project;
}

export function updateTenantProject(projectId, action, input, { expectedRevision, identityKey }, storage = globalThis.localStorage) {
  const { state, identity, link } = tenantContext(storage), raw = storage.getItem(ADMIN_DATA_KEY);
  if (identity.key !== identityKey || state.revision !== expectedRevision) throw Error('项目或身份已变化，请刷新后重试');
  const services = action === 'models' ? directorySnapshot(storage).models.filter(row => row.serviceAvailable) : [];
  const { projects, audit } = changeProject({ state, identity, link }, projectId, action, input, services);
  return save(state, { ...state, projects, audits:[...state.audits] }, identity, [audit], storage, raw, projectId);
}
export function saveTenantKeys(rows, { projectId, billing='按量付费', subscriptionId, expectedRevision }, storage=globalThis.localStorage) {
  const {state,identity,link}=tenantContext(storage),raw=storage.getItem(ADMIN_DATA_KEY);
  if(state.revision!==expectedRevision)throw Error('数据已变化，请刷新后重试');
  const services = directorySnapshot(storage).models.filter(row => row.serviceAvailable);
  const { next, actions } = changeProjectKeys({state,identity,link}, maskedProjectKeys(rows), {projectId,billing,subscriptionId}, services);
  return actions.length ? save(state, next, identity, actions, storage, raw, projectId) : state;
}
export function orderTenantServices(serviceIds, { expectedRevision, identityKey }, storage=globalThis.localStorage) {
  const {state,identity,canManage}=tenantContext(storage),raw=storage.getItem(ADMIN_DATA_KEY);
  if (siteSettlement(storage) !== 'customer' || !canManage) throw Error('请由当前空间的管理员订购模型服务');
  if (identity.key !== identityKey || state.revision !== expectedRevision) throw Error('使用空间或数据已变化，请重新确认订购');
  if (!Array.isArray(serviceIds) || !serviceIds.length || new Set(serviceIds).size !== serviceIds.length) throw Error('请选择有效的模型服务');
  const next=structuredClone(state),publicRows=directorySnapshot(storage).models;
  for(const id of serviceIds){const service=serviceReferences(state).find(row=>row.id===id),row=publicRows.find(row=>row.id===id);
    if (!service || !row?.orderable) throw Error('模型服务已下架或无权订购');
    if (workspaceServiceOrdered(state, identity.tenantId, service)) throw Error('已订购该模型服务');
    const code='service-product:'+id;
    const product=next.products.find(row=>row.serviceId===id && (row.id===code || row.code===code));
    const productId=product?.id || resourceId('product');
    if (!product) next.products.push({id:productId,code,name:service.model.name,
      billingMode:'按量付费',billingType:'payg',modelIds:[service.modelId],serviceId:id,status:'已上架'});
    const at = new Date().toISOString();
    next.orders.push({id:resourceId('order'),orderNo:'ORD-'+crypto.randomUUID().slice(0,8),tenantId:identity.tenantId,productId,
      serviceId:id,modelIds:[service.modelId],billingType:'payg',amount:0,status:'生效中',priceSnapshot:row.salePrices,
      createdAt:at,activatedAt:at,timeline:['订单创建','服务开通']});
  }
  return save(state,next,identity,'订购模型服务',storage,raw);
}
export function organizationProjection(state,tenantId) {
  const root=state.organizations.find(row=>row.tenantId===tenantId&&!row.parentId);
  const id=row=>row===root?.id?'root':row;
  return {rootId:root?.id,platformAccounts:state.users.filter(row=>row.invitable&&row.status==='正常').map(row=>({sourceUserId:row.id,name:row.name,account:row.login,phone:row.phone})),departments:state.organizations.filter(row=>row.tenantId===tenantId).map(row=>({...row,id:id(row.id),parentId:id(row.parentId),ownerId:state.memberships.find(member=>member.tenantId===tenantId&&member.userId===row.ownerId)?.id || null})),members:state.memberships.filter(row=>row.tenantId===tenantId).map(row=>{const user=state.users.find(item=>item.id===row.userId);return {...row,name:user?.name || row.name || '未填写',phone:user?.phone || '',account:user?.login || user?.email || user?.phone || row.userId,departmentId:id(row.organizationId || row.departmentId) || 'unassigned',role:row.role==='租户管理员'?'企业管理员':row.role,status:row.status==='正常'?'已加入':row.status==='停用'?'已停用':'待加入'};}),audit:state.audits.filter(row=>row.tenantId===tenantId).map(row=>({id:row.id,time:row.createdAt,actor:row.actor,description:row.action}))};
}
export function saveTenantOrganization(data,expectedRevision,storage=globalThis.localStorage) {
  const {state,identity,link,canManage}=tenantContext(storage),raw=storage.getItem(ADMIN_DATA_KEY);
  if(!canManage || identity.spaceId==='personal')throw Error('只有企业管理员可以维护组织成员');
  if(state.revision!==expectedRevision)throw Error('数据已变化，请刷新后重试');
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
  const members=data.members.map(row=>{const old=state.memberships.find(item=>item.id===row.id);if(old&&JSON.stringify(before.members.find(item=>item.id===row.id))===JSON.stringify(row))return structuredClone(old);const userId=old?.userId || before.platformAccounts?.find(account=>account.account===row.account)?.sourceUserId || resourceId('user');const user=next.users.find(item=>item.id===userId);const profile={name:row.name,phone:row.phone,login:row.account};if(user){if(old)Object.assign(user,profile);}else next.users.push({id:userId,...profile,status:'正常'});return {...old,...row,userId,tenantId:identity.tenantId,organizationId:departmentId(row.departmentId),scopeId:departmentId(row.scopeId),role:row.role==='企业管理员'?'租户管理员':row.role,status:row.status==='已加入'?'正常':row.status==='已停用'?'停用':'待加入'};});
  next.organizations=next.organizations.map(row=>{if(row.tenantId!==identity.tenantId)return row;const source=data.departments.find(department=>departmentId(department.id)===row.id);return {...row,ownerId:members.find(member=>member.id===source.ownerId)?.userId || null};});
  next.memberships=next.memberships.filter(row=>row.tenantId!==identity.tenantId).concat(members);next.identityGeneration=(next.identityGeneration || 0)+1;
  const joined = members.filter(member => member.status === '正常' &&
    !state.memberships.some(old => old.id === member.id && old.status === '正常'));
  const login = prepareCustomerLogins(next, joined.map(member => ({ tenantId:member.tenantId, userId:member.userId, memberId:member.id })), storage);
  return save(state,next,identity,data.audit[0]?.description || '维护组织成员',storage,raw,undefined,undefined,login);
}
export function recordTenantExperience(ticket,httpStatus,storage=globalThis.localStorage,content={}) {
  const {state,identity,link}=tenantContext(storage),raw=storage.getItem(ADMIN_DATA_KEY);
  if(ticket.owner!==identity.key || ticket.sessionGeneration!==identity.generation)throw Error('当前身份已变化，请重新发送');
  const project = requireProject(projectAccess(state, identity, link).projects, ticket.projectId);
  const keyId = experienceKeyId(project.id);
  const previous = state.requests.find(row => row.requestId === ticket.requestId);
  if (previous) {
    if (previous.tenantId !== identity.tenantId || previous.projectId !== project.id || previous.keyId !== keyId ||
      previous.actorUserId !== link.backendUserId || previous.serviceId !== ticket.serviceId) throw Error('请求标识已用于其他调用');
    return state;
  }
  const service=serviceReferences(state).find(row=>row.id===ticket.serviceId);if(!service)throw Error('模型服务不存在');
  const settlement = siteSettlement(storage);
  if (settlement !== ticket.settlement || (settlement === 'customer' && !workspaceServiceOrdered(state, identity.tenantId, service))) {
    throw Error('站点或订购权益已变化，请重新发送');
  }
  const access = lifecycleAccess(state, service.model.lifecycleStopReason === 'operator'
    ? { ...service, model: { ...service.model, listingStatus: '已上架', visibility: '公开', callsEnabled: true } }
    : service, identity.tenantId);
  if (!access.allowed) throw accessError(access.code, access.reason);
  const next=structuredClone(state),at=new Date().toISOString();
  const success = httpStatus >= 200 && httpStatus < 300;
  const usage = success ? ticket.usage ?? {} : {};
  const charge = success ? ticket.charge ?? null : null;
  const error = projectCallError(state, project, service.model, null, usage, charge, Date.parse(at));
  if (error && success) throw accessError(error, projectCallErrors[error][1]);
  const key = next.apiKeys.find(row => row.id === keyId);
  if (key && (key.kind !== 'experience' || key.projectId !== project.id || key.tenantId !== identity.tenantId || key.status !== '有效')) throw Error('项目体验凭证不可用');
  if (!key) next.apiKeys.push({id:keyId,keyId,name:'在线体验',kind:'experience',tenantId:identity.tenantId,
    projectId:project.id,modelIds:[],status:'有效',billingType:'按量付费',createdAt:at,updatedAt:at});
  const contentRetained = project.retainContent === true && ticket.retainContent === true;
  next.requests.push({id:ticket.requestId,requestId:ticket.requestId,tenantId:identity.tenantId,projectId:project.id,keyId,userId:link.backendUserId,actorUserId:link.backendUserId,modelId:service.modelId,modelType:service.model.type,serviceId:service.id,publicModelId:service.callId,createdAt:ticket.startedAt || at,updatedAt:at,httpStatus,source:'网页端调用',resultSource:'mock-ui',billingType:'按量付费',usage,charge,
    ...(settlement ? { settlement } : {}),
    ...(settlement === 'internal' && project.organizationId ? { departmentId:project.organizationId } : {}),
    ...(success ? { admittedAt: at } : { billingStatus: 'not_billable' }),
    ...(contentRetained ? {contentRetained, requestBody:retainedProjectText(content.input), responseBody:retainedProjectText(content.output)} : {}),
    meteringStatus:Object.keys(usage).length ? '模拟计量' : '待确认',durationMs:Math.max(0,Date.now()-Date.parse(ticket.startedAt || at))});
  return save(state,next,identity,[],storage,raw,project.id);
}
export function saveTenantRoutes(input, expectedRevision, storage = globalThis.localStorage) {
  const context = tenantContext(storage), { state, identity } = context, raw = storage.getItem(ADMIN_DATA_KEY);
  if (state.revision !== expectedRevision) throw Error('数据已变化，请刷新后重试');
  const services = tenantRoutingServices(state, directorySnapshot(storage).models);
  return save(state, changeTenantRoute(context, input, services, resourceId('tenant-route')), identity, '维护智能路由', storage, raw);
}

export function saveProjectRoute(input, { expectedRevision, remove = false }, storage = globalThis.localStorage) {
  const {state,identity,link} = tenantContext(storage);
  const raw = storage.getItem(ADMIN_DATA_KEY);
  if (state.revision !== expectedRevision) throw Error('数据已变化，请刷新后重试');
  const routes = state.projectRoutes || [];
  const current = routes.find(route => route.id === input.id);
  const project = projectAccess(state, identity, link).projects.find(row => row.id === input.projectId);
  if (!project?.canEdit || current && (current.tenantId !== identity.tenantId || current.projectId !== project.id)) throw Error('无权维护该项目的路由');
  if (remove && !current) throw Error('项目路由已不存在');
  const next = structuredClone(state);
  if (remove) {
    next.projectRoutes = routes.filter(row => row.id !== current.id);
    return save(state,next,identity,'删除项目路由',storage,raw,project.id,current.id);
  }
  const name = String(input.name ?? '').trim(), code = String(input.code ?? '').trim();
  if (name.length < 2 || name.length > 50 || !/^[A-Za-z0-9][A-Za-z0-9_-]{1,49}$/.test(code)) throw Error('请填写名称及 2–50 位策略标识，标识使用字母、数字、下划线或连字符');
  if (current && current.code !== code) throw Error('已创建的策略标识不可修改');
  const catalogue = directorySnapshot(storage).models;
  if (routes.some(row => row.id !== current?.id && row.tenantId === identity.tenantId && row.code === code) ||
      (state.tenantRoutes || []).some(row => row.tenantId === identity.tenantId && row.id === code) ||
      catalogue.some(row => row.callId === code)) throw Error('策略标识已被使用');
  const services = new Set(catalogue.filter(row => row.serviceAvailable && projectModelEnabled(project, row.modelKey)).map(row => row.id));
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
  const record = {id:current?.id ?? resourceId('project-route'), tenantId:identity.tenantId, projectId:project.id,
    name, code, rules, defaultService:input.defaultService, fallback:[...fallback]};
  next.projectRoutes = current ? routes.map(row => row.id === current.id ? record : row) : [...routes,record];
  return save(state,next,identity,current?'编辑项目路由':'创建项目路由',storage,raw,project.id,record.id);
}
