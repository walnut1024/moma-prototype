import { effectiveRoutingStrategy, failoverError, globalRoutingKeys, globalRoutingStrategies, globalRoutingValues } from '../src/admin-v2/global-routing-parameters.mjs';
import { assertPersonalProjects, customerProject } from '../src/personal-project.mjs';
import { isResourceId, resourceId } from '../src/resource-id.mjs';
import { activeTenantVersion, changeTenantRoute, isTenantRouteCall, keyTenantRoute, visibleProjectRoutes } from '../src/tenant-routing.mjs';
import { initialApplicationData } from '../src/mock/application-data.js';
import { billingPeriod } from '../src/admin-v2/mock-billing.js';
import { tenantServiceTransaction } from '../src/admin-v2/tenant-service-settings.mjs';
import { canMutate, commitAdminState, isGatewayRouteRemoval } from '../src/admin-v2/state-transaction.js';
import { gatewayRouteHeaderIssue } from '../src/admin-v2/gateway-route-headers.mjs';
import { orderActivationCommand, simulateRequest, applyAdjustment } from '../src/admin-v2/domain.js';
import { organizationManagementScope, scopedOrganization, tenantOrganizationChanges, projectRouting, projectRouteChanges } from '../src/tenant-data.mjs';
import { activeProjectMembers, experienceKeyId, projectAccess, projectRole, PROJECT_ADMIN, tenantProjectAdmin } from '../src/project-access.mjs';
import { changeProject, newProject } from '../src/project-configuration.mjs';
import { changeProjectKeys } from '../src/project-keys.mjs';
import { diagnosticCall, mockTextUsage, projectBudgetUsage, projectCallErrors, projectSpend, requestCharge } from '../src/project-call.mjs';
import { mergeProjectFacts, projectChargeWrites, projectFactWrite, readProjectFact, readProjectFacts } from './project-facts.js';
import { loadModelWorkspace, modelChanges } from './model-repository.js';
import { marketCatalogue } from './market.js';
import { invokeModelService, marketModelService } from './model-service-market.js';
import { addPackageOrders } from './market-packages.js';
import { receipt, save } from './model-commands.js';
import { addPrototypeAccounts } from './prototype-presets.js';
import { submitEnterpriseCertification, submitRealNameCertification } from '../src/auth-state.mjs';
import { activeCustomer } from '../src/service-access.mjs';
import { customerCredential, customerIdentity, customerSecretHash, dualDemoUserId, dualDemoAdminLogin, dualDemoTenantId } from './customer-identity.js';
import { readProjectSpacePolicy } from './project-space-policy.js';
import { trafficAdmission } from './traffic-calls.js';
import { normalizeMemberPhone } from '../src/organization-data.mjs';
import { allowsSpace, internalSpace } from '../src/operating-space.mjs';
import { invalidateInferenceConnections } from '../src/admin-v2/inference-connection-targets.js';

const collections = [
  'tenants', 'users', 'memberships', 'organizations', 'projects', 'apiKeys', 'grants',
  'orders', 'products', 'prices', 'bills', 'ledger', 'settlements', 'adjustments', 'announcements',
  'routes', 'limits', 'fallbacks', 'releases', 'caches', 'requests', 'alerts', 'incidents', 'integrations',
  'clusters', 'artifacts', 'deployments', 'admins', 'tenantRoutes', 'projectRoutes', 'identityEvents', 'customerApplications', 'audits',
];
const directCollections = new Set(['products','prices','orders','bills','settlements','adjustments','routes','alerts','incidents','integrations','clusters']);
const usageFields = usage => usage ? {input:usage.input_tokens,output:usage.output_tokens,cached:usage.cached_tokens,seconds:usage.seconds,characters:usage.characters,images:usage.images} : null;
const week = 7 * 86400000;
const encoder = new TextEncoder();
const issue = (status, code, message) => { throw Object.assign(new Error(message), { status, code }); };
const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(JSON.stringify(value)))), byte => byte.toString(16).padStart(2, '0')).join('');
const encoded = value => {
  const text = JSON.stringify(value);
  if (encoder.encode(text).length > 1_500_000) issue(413, 'SCOPE_TOO_LARGE', '工作区已达容量上限，请先核对历史记录');
  return text;
};
const conflict = () => issue(409, 'REVISION_CONFLICT', '工作区已有更新，请载入新版本；当前输入保留');
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9:_.-]{1,200}$/.test(value);
export const validCallMetadata = metadata => metadata === undefined || metadata && typeof metadata === 'object' &&
  !Array.isArray(metadata) && Object.keys(metadata).every(field=>field==='_user') &&
  (metadata._user === undefined || typeof metadata._user === 'string' && metadata._user.trim().length > 0 && metadata._user.length <= 128);
export const validCallModel = model => typeof model === 'string' &&
  (/^@preset\/[A-Za-z0-9_.:-]{2,50}$/.test(model) || /^project@[A-Za-z0-9][A-Za-z0-9_-]{1,49}$/.test(model) || /^[A-Za-z0-9][A-Za-z0-9._/:-]{0,199}$/.test(model));

const activeMarketOrders = async (db,tenantId) => (await db.prepare(`SELECT p.tenant_id AS tenantId,o.id AS callId
  FROM market_orders p JOIN offers o ON o.record_id=p.offer_id
  WHERE p.tenant_id=? AND p.cancelled_at IS NULL AND o.retired_at IS NULL`).bind(tenantId).all()).results;

async function referenceRow(db) {
  const row = await db.prepare('SELECT reference_json, application_revision, revision AS model_revision, (SELECT commit_seq FROM db_state WHERE id=1) AS commit_seq FROM model_workspace WHERE id=1').first();
  if (!row) issue(503, 'DATABASE_UNAVAILABLE', '业务工作区尚未初始化');
  return row;
}

export async function initializeApplication(db, tenantId) {
  const row = await referenceRow(db);
  if (row.application_revision) return;
  const initial = initialApplicationData();
  addPrototypeAccounts(initial);
  if (tenantId && !initial.tenants.some(tenant => tenant.id === tenantId)) return;
  const reference = JSON.parse(row.reference_json);
  for (const key of collections) {
    const byId = new Map((initial[key] || []).map(item => [item.id, item]));
    for (const item of reference[key] || []) byId.set(item.id, item);
    reference[key] = [...byId.values()];
  }
  const [update] = await db.batch([
    db.prepare('UPDATE model_workspace SET reference_json=?, application_revision=1 WHERE id=1 AND application_revision=0 AND (SELECT commit_seq FROM db_state WHERE id=1)=?').bind(encoded(reference), row.commit_seq),
    db.prepare('UPDATE db_state SET commit_seq=commit_seq+1 WHERE id=1 AND changes()=1'),
  ]);
  if (!update.meta.changes && !(await referenceRow(db)).application_revision) conflict();
}

async function applicationState(db, actor) {
  const [row, model] = await Promise.all([referenceRow(db), loadModelWorkspace(db, actor, { command: true, simulation: false })]);
  if (row.commit_seq !== model.commitSeq) conflict();
  const reference = JSON.parse(row.reference_json);
  const state = { ...reference, ...model, cloudOperations: false, revision: row.application_revision, identityGeneration: reference.identityGeneration || 0 };
  for (const key of collections) if (key !== 'admins') state[key] = reference[key] || [];
  state.admins = model.admins.map(account => ({ account:account.loginCode || account.id, ...(reference.admins || []).find(item => item.id === account.id), ...account }));
  return { row, reference, state };
}

export async function dualDemoIdentity(db, license) {
  const tenantId=dualDemoTenantId, memberId='member-'+dualDemoUserId;
  const row=await referenceRow(db);
  const state=JSON.parse(row.reference_json);
  const user=state.users.find(item=>item.id===dualDemoUserId);
  const member=state.memberships.find(item=>item.id===memberId);
  if (!user && !member) {
    if (!state.tenants.some(tenant=>tenant.id===tenantId && tenant.demo===true &&
        tenant.type==='企业' && activeCustomer(tenant))) return null;
    const at=new Date().toISOString();
    state.users.push({id:dualDemoUserId,login:dualDemoAdminLogin,name:'系统管理员',
      status:'正常',initialized:true,source:'内置演示',createdAt:at});
    const root=state.organizations.find(item=>item.tenantId===tenantId && item.parentId===null);
    state.memberships.push({id:memberId,tenantId,userId:dualDemoUserId,organizationId:root?.id,
      role:'租户管理员',status:'正常',createdAt:at});
    const [written]=await db.batch([
      db.prepare(`UPDATE model_workspace SET reference_json=?,application_revision=application_revision+1
        WHERE id=1 AND (SELECT commit_seq FROM db_state WHERE id=1)=?`).bind(encoded(state),row.commit_seq),
      db.prepare('UPDATE db_state SET commit_seq=commit_seq+1 WHERE id=1 AND changes()=1'),
    ]);
    if (!written.meta.changes) conflict();
  }
  return customerIdentity(db,dualDemoUserId,'id',null,license);
}

async function marketFacts(db, tenantId, { includeOrders = true } = {}) {
  const scope = tenantId ? ' WHERE t.tenant_id=?' : '';
  const query = (sql, tail) => {
    const statement = db.prepare(sql + scope + tail);
    return tenantId ? statement.bind(tenantId) : statement;
  };
  const [requests, orders, modernOrders] = await db.batch([
    query(`SELECT t.tenant_id,t.request_id,t.created_at,t.offer_id,t.sale_price_id,o.id AS call_id,o.service_id,s.payload_json
      FROM market_calls t JOIN offers o ON o.record_id=t.offer_id JOIN simulation_records s ON s.kind='usage' AND s.id=t.usage_id`, ' ORDER BY t.created_at DESC LIMIT 400'),
    ...(includeOrders ? [query(`SELECT t.id,t.tenant_id,t.offer_id,t.created_at,t.cancelled_at,t.sale_price_id,o.service_id,o.id AS call_id,m.name,p.record_json AS price_json,s.name AS provider_name
      FROM market_orders t JOIN offers o ON o.record_id=t.offer_id JOIN materials m ON m.id=o.material_id
      LEFT JOIN suppliers s ON s.id=o.supplier_id LEFT JOIN price_versions p ON p.id=t.sale_price_id`, ' ORDER BY t.created_at DESC')] : []),
    ...(includeOrders ? [query(`SELECT t.id,t.tenant_id,t.service_id AS offer_id,t.created_at,t.cancelled_at,t.sale_price_id,
      t.service_id,n.call_id,json_extract(n.record_json,'$.name') AS name,t.sale_price_json AS price_json
      FROM model_service_orders t JOIN new_model_services n ON n.id=t.service_id`, ' ORDER BY t.created_at DESC')] : []),
  ]);
  return {
    orders: [...(orders?.results || []),...(modernOrders?.results || [])].sort((a,b)=>b.created_at-a.created_at).map(row => ({ id:row.id, orderNo:row.id, tenantId:row.tenant_id, serviceId:row.offer_id, marketOrder:true,
      billingType:'payg', status:row.cancelled_at?'已退订':'生效中', modelIds:[row.service_id], providerName:row.provider_name, serviceName:row.name,
      priceVersionId:row.sale_price_id, priceSnapshot:JSON.parse(row.price_json || 'null'), createdAt:new Date(row.created_at).toISOString(),
      timeline:['订单创建','服务开通',...(row.cancelled_at?['用户退订']:[])] })),
    requests: requests.results.filter(row=>row.created_at>=Date.now()-week).map(row=>{
      const fact=JSON.parse(row.payload_json), context=fact.operational, createdAt=new Date(row.created_at).toISOString();
      const attempts=(fact.attempts || []).map(item=>({...item,usage:usageFields(item.usage),error:item.status==='passed'?null:item.code}));
      return { id:row.request_id, requestId:row.request_id, tenantId:row.tenant_id, modelId:row.service_id, publicModelId:row.call_id,
        userId:fact.userId, modelType:context?.modelType, serviceId:context?.serviceId || row.offer_id,
        usage:usageFields(fact.usage), usageConfirmed:Boolean(fact.usage), attempts, providerId:context?.providerId || fact.providerId,
        endpointId:context?.endpointId, supplyId:context?.supplyId, procurementSnapshot:attempts.at(-1)?.procurementSnapshot,
        priceVersionId:row.sale_price_id, priceSnapshot:fact.priceSnapshot, charge:fact.saleTrial, routeVersion:fact.routeVersion,
        httpStatus:fact.status==='failed'?403:200, source:'网页端调用', billingType:'按量付费', billingStatus:fact.billingStatus,
        purpose:'customer', resultSource:'mock', createdAt, durationMs:Math.max(0,Date.parse(fact.endedAt)-Date.parse(fact.startedAt)) };
    }),
  };
}

const pick = (row, fields) => Object.fromEntries(fields.filter(field=>Object.hasOwn(row,field)).map(field=>[field,row[field]]));
const runtimeModel = ({id,name,modelId,type,usageUnit,capabilities,archivedAt,deletedAt}) =>
  ({id,name,modelId,type,usageUnit,capabilities:{context:capabilities?.context},archivedAt,deletedAt});
const safeKey = ({key:_key,secret:_secret,credentialDigest:_digest,...value}) => value;
const runtimeProjects = state => state.projects.map(row=>pick(row,['id','name','tenantId','status','modelPermissions']));
const withRequestScope = (state, row) => ({
  ...row, tenantName:state.tenants.find(item=>item.id===row.tenantId)?.name,
  projectName:state.projects.find(item=>item.id===row.projectId && item.tenantId===row.tenantId)?.name,
});
const operationalRequest = row => ({
  ...pick(row,['id','requestId','traceId','createdAt','startedAt','admittedAt','httpStatus','modelId','modelType','publicModelId','callId',
    'tenantId','tenantName','projectId','projectName','projectRouteId','routeMatch','purpose','userId','actorUserId','keyId','source',
    'providerId','channelId','endpointId','evidenceSource','status','finalStatus','requestStatus','isCanceled','isTimeout','streamInterrupted','finishReason',
    'stream','errorCode','error','errorSource','cacheHit','durationMs','firstPacketMs','ttftMs','taskStatus','routeVersion','releaseId','usageUnit','usageConfirmed']),
  providerId:row.providerId || row.procurementSnapshot?.providerId,
  usage:row.usage && pick(row.usage,['input','output','cached','seconds','characters','images']),
  attempts:row.attempts?.map(attempt=>({
    ...pick(attempt,['dispatched','endpointId','supplyId','serviceId','modelId','channelId','status','httpStatus','statusCode','startedAt','createdAt',
      'upstreamRequestId','upstreamModelId','durationMs','error','errorCode','code','errorSource','isTimeout',
      'fallback','fallbackReason','usageConfirmed','usageUnit']),
    providerId:attempt.providerId || attempt.procurementSnapshot?.providerId,
    usage:attempt.usage && pick(attempt.usage,['input','output','cached','seconds','characters','images']),
  })),
});

function maintenanceView(state, modelRevision, requests, audits) {
  const { currentRole, adminSession, revision, routes, limits, fallbacks, releases, caches, alerts, incidents,
    clusters, artifacts, deployments } = state;
  const deploymentIds=new Set(deployments.flatMap(({id,deploymentId})=>[id,deploymentId]));
  return { currentRole, adminSession, revision, modelRevision, routes, limits, fallbacks, releases, caches, alerts, incidents,
    clusters, artifacts, deployments, modelOnboardings:[],
    admins:state.admins.map(({id,name,role,status})=>({id,name,role,status})),
    tenants:state.tenants.map(({id,name,type})=>({id,name,type})),
    projects:runtimeProjects(state),
    models:state.models.map(runtimeModel), modelTemplates:state.modelTemplates.map(runtimeModel),
    providers:state.providers.map(({id,name})=>({id,name})),
    endpoints:state.endpoints.map(({id,endpointId,name,providerId,modelIds,status})=>({id,endpointId,name,providerId,modelIds,status})),
    gatewayKeyOptions:state.apiKeys.filter(row=>row.kind!=='experience' && row.status!=='已删除').map(({id,keyId,status,tenantId,projectId})=>({id,keyId,status,tenantId,projectId})),
    audits:audits.filter(row=>deploymentIds.has(row.objectId)).map(({id,action,actor,objectId,createdAt,result})=>({id,action,actor,objectId,createdAt,result})),
    requests:requests.map(operationalRequest),
  };
}

export async function applicationBootstrap(db, actor, configured = []) {
  const maintenance=actor.role==='运维人员';
  const [{ state, row }, facts, audits, activity, lastLogin, projectFacts, credentials, adminCredentials, spacePolicy] = await Promise.all([
    applicationState(db, actor), marketFacts(db, null, {includeOrders:!maintenance}),
    db.prepare("SELECT record_json FROM audit_events WHERE entity_type='application' ORDER BY created_at DESC,rowid DESC LIMIT 200").all(),
    maintenance ? null : db.prepare('SELECT id,user_id,created_at FROM tenant_login_events WHERE created_at>=? ORDER BY created_at DESC LIMIT 200').bind(Date.now()-week).all(),
    maintenance ? null : db.prepare('SELECT user_id,logged_at FROM customer_last_login').all(),
    readProjectFacts(db),
    maintenance ? null : db.prepare('SELECT user_id FROM customer_credentials').all(),
    maintenance ? null : db.prepare('SELECT id,login_name,role,access_hash IS NOT NULL AS saved FROM admin_accounts WHERE enabled=1').all(),
    maintenance ? null : readProjectSpacePolicy(db),
  ]);
  const events=[...audits.results.map(row=>JSON.parse(row.record_json)),...state.audits];
  const requests=mergeProjectFacts(projectFacts, [...facts.requests, ...state.requests])
    .map(({requestBody:_request,responseBody:_response,requestHash:_hash,rejection:_rejection,...fact}) => withRequestScope(state,fact));
  if(maintenance)return maintenanceView(state,row.model_revision,requests,events);
  const { cloudMockState: _snapshot, projectRoutes: _projectRoutes, announcements: _announcements, ...view } = state;
  if (actor.role === '平台管理员') {
    const savedPolicy = state.globalRoutingParameters;
    view.globalRoutingParameters = globalRoutingValues({
      retryAfter: state.globalRetryAfter,
      ...savedPolicy,
      strategy: effectiveRoutingStrategy(savedPolicy?.strategy),
    });
  } else {
    delete view.globalRoutingParameters;
  }
  delete view.globalRetryAfter;
  if(actor.role==='运营人员'){
    for(const key of ['routes','limits','fallbacks','releases','caches','clusters','artifacts','incidents','integrations'])delete view[key];
    view.deployments=[];
    view.alerts=[];
    view.admins=state.admins.map(({id,name,role,status})=>({id,name,role,status}));
  }
  const logins=activity.results.map(({id,user_id,created_at})=>({id,userId:user_id,type:'login',at:new Date(created_at).toISOString()}));
  const lastLoginByUser = new Map(lastLogin.results.map(({user_id,logged_at})=>[user_id,new Date(logged_at).toISOString()]));
  const accountIds=new Set([...configured,...credentials.results.map(row=>row.user_id)]);
  const activeAdmins=adminCredentials.results.filter(row=>row.saved || configured.includes(row.login_name || row.id));
  if (activeAdmins.some(row=>row.login_name===dualDemoAdminLogin && row.role==='平台管理员')) {
    accountIds.add(dualDemoUserId);
  }
  const activeTenants=new Map(state.tenants.filter(tenant=>activeCustomer(tenant) && allowsSpace(spacePolicy,tenant)).map(tenant=>[tenant.id,tenant]));
  const activeUsers=new Set([...activeTenants.values()].filter(tenant=>tenant.type==='个人' && spacePolicy.personalEnabled)
    .map(tenant=>tenant.ownerId));
  for (const membership of state.memberships) {
    const tenant=activeTenants.get(membership.tenantId);
    if (membership.status==='正常' && tenant && tenant.type!=='个人' &&
        (membership.userId!==dualDemoUserId || ['企业管理员','租户管理员'].includes(membership.role))) activeUsers.add(membership.userId);
  }
  return { ...view,apiKeys:state.apiKeys.map(safeKey),identityEvents:[...logins,...state.identityEvents],
    adminLoginIds:activeAdmins.map(admin=>admin.id),
    accountUserIds:state.users.filter(user=>user.status==='正常' && accountIds.has(user.id) && activeUsers.has(user.id)).map(user=>user.id),
    spacePolicy, customerOrderScope:'space',
    users:state.users.map(user=>({...user,lastLoginAt:lastLoginByUser.get(user.id)})),
    modelRevision:row.model_revision, audits:events, orders:[...facts.orders,...state.orders], requests };
}

function referenceWrite(before, after, reference) {
  const next = { ...reference, identityGeneration: after.identityGeneration || 0 };
  if (before.globalRoutingParameters !== after.globalRoutingParameters) {
    next.globalRoutingParameters = after.globalRoutingParameters;
    delete next.globalRetryAfter;
  }
  for (const key of collections) if (before[key] !== after[key]) next[key] = after[key];
  for (const key of ['requests','ledger','audits','identityEvents']) {
    const rows=next[key] || [], cutoff=Date.now()-week;
    next[key]=[...rows.filter(row=>row.prototypeFact && Date.parse(row.createdAt || row.at)>=cutoff).slice(0,key==='requests'?400:200),
      ...rows.filter(row=>!row.prototypeFact)];
  }
  return encoded(next);
}

function allowedKeyIp(key, address) {
  if (!key.ipAllowlist?.length) return true;
  const addressParts=address?.split('.');
  if (addressParts?.length!==4 || addressParts.some(part=>!/^\d{1,3}$/.test(part) || Number(part)>255)) return false;
  const ipv4=parts=>parts.reduce((value,part)=>value*256+Number(part),0);
  return key.ipAllowlist.some(entry=>{
    const [network,prefix='32']=entry.split('/'), block=2**(32-Number(prefix));
    return Math.floor(ipv4(addressParts)/block)===Math.floor(ipv4(network.split('.'))/block);
  });
}

export async function customerInvocation(db,credentialDigest,body,clientIp,privateSite,license) {
  const { row,state,reference }=await applicationState(db,{id:'customer-api',role:'客户'});
  const keys=state.apiKeys.filter(item=>item.credentialDigest===credentialDigest && item.kind!=='experience');
  const key=keys.length===1 ? keys[0] : null;
  if (key?.status!=='有效' || !key.tenantId || !key.projectId) issue(401,'auth_rejected','API Key 无效');
  if (key.expiresAt && !(Date.parse(key.expiresAt)>Date.now())) issue(401,'key_expired',projectCallErrors.key_expired[1]);
  if (!allowedKeyIp(key,clientIp)) issue(403,'ip_not_allowed','当前来源不在 API Key 的 IP 白名单内');
  const tenant=state.tenants.find(item=>item.id===key.tenantId);
  const savedPolicy=privateSite || license?.managed ? await readProjectSpacePolicy(db) : null;
  const policy=license?.managed ? { ...savedPolicy, operatingMode:license.commercial ? 'factory' : 'internal' } : savedPolicy;
  const internal=internalSpace(policy,tenant);
  if (!activeCustomer(tenant) || !allowsSpace(policy,tenant)) {
    issue(403,'customer_unavailable','当前客户空间不可用');
  }
  if (internal && key.billingType==='Token Plan') issue(403,'INTERNAL_SPACE','企业内用空间不使用套餐密钥');
  const {requestId,model,messages,metadata}=body;
  const answer='模拟调用已完成。';
  const requestHash=await hash([key.id,key.credentialVersion,model,messages,metadata?._user?.trim(),...(body.routing ? [body.routing] : [])]);
  const direct = await marketModelService(db,key.tenantId,model);
  if (direct) {
    const project = customerProject(state,state.projects.find(item=>item.id===key.projectId && item.tenantId===key.tenantId));
    const facts = await readProjectFacts(db,key.tenantId);
    const projectState = {...state,requests:mergeProjectFacts(facts,state.requests)};
    return invokeModelService(db,direct,{tenant:{...tenant,internal},user:{id:key.ownerId},project,projectState,
      body,requestHash,key,expectedSequence:row.commit_seq});
  }
  const route = isTenantRouteCall(model) && keyTenantRoute(state, key, model);
  const version = route?.enabled ? activeTenantVersion(route) : null;
  const input = messages.map(item => item.content).join('\n');
  const effectiveInput = version?.config.systemPrompt ? version.config.systemPrompt + '\n' + input : input;
  const cacheKey=await hash(version ? [version.config.systemPrompt, version.config.parameters, messages] : messages);
  const [facts,marketOrders]=await Promise.all([readProjectFacts(db,key.tenantId),activeMarketOrders(db,key.tenantId)]);
  const previous=facts.find(item=>item.requestId===requestId);
  if (previous && (previous.requestHash!==requestHash || previous.source!=='API 调用')) {
    issue(409,'REQUEST_ID_CONFLICT','调用标识已用于其他请求');
  }
  const simulationState={...state,requests:mergeProjectFacts(facts,state.requests)};
  const result=simulateRequest(simulationState,{requestId,keyId:key.id,modelId:model,
    metadata:{_user:metadata?._user?.trim()},marketOrders,cacheKey,internal,allowedModelTypes:['text','multimodal'],
    allowMissingCost:true,
    costTier:body.routing?.cost_tier,
    usage:mockTextUsage(effectiveInput,answer),
    content:{input,output:answer}});
  const respond=fact=>{
    if (fact.httpStatus>=400) issue(fact.httpStatus,fact.error,projectCallErrors[fact.error]?.[1] || '当前模型服务无法完成调用');
    const {input,output}=fact.usage;
    return {id:fact.requestId,object:'chat.completion',created:Math.floor(Date.parse(fact.createdAt)/1000),
      model:fact.callId,source:'mock',choices:[{index:0,message:{role:'assistant',content:answer},finish_reason:'stop'}],
      usage:{prompt_tokens:input,completion_tokens:output,total_tokens:input+output}};
  };
  if (result.duplicate) {
    if (!previous) issue(409,'REQUEST_ID_CONFLICT','调用标识已用于其他请求');
    return respond(result.request);
  }
  const fact={...result.request,requestHash};
  delete fact.userId;
  const at=Date.parse(fact.createdAt);
  const traffic = fact.httpStatus === 200
    ? await trafficAdmission(db, { callId: fact.callId, userId: key.ownerId, usage: fact.usage, at })
    : {};
  if (traffic.error) {
    Object.assign(fact, {
      httpStatus: 429, error: traffic.error, billingStatus: 'not_billable', usage: null, usageConfirmed: false,
      attempts: [{ dispatched: false, startedAt: fact.createdAt, error: traffic.error }], durationMs: 0, ttftMs: null,
      endpointId: null, supplyId: null, providerId: null, charge: null, internalCost: null,
    });
    for (const field of ['admittedAt','planTokens','requestBody','responseBody','contentRetained','procurementSnapshot','procurementVersionId']) delete fact[field];
  } else {
    Object.assign(fact, traffic.evidence);
  }
  const writes=traffic.error ? [] : result.changes.filter(change=>['grants','ledger','orders'].includes(change.collection));
  for (const change of writes.filter(item=>item.collection==='ledger')) {
    const entry=result.state.ledger.find(item=>item.id===change.record.id);
    if (entry) entry.prototypeFact=true;
  }
  const commitGuard='(SELECT commit_seq FROM db_state WHERE id=1)=?';
  try {
    const [insert]=await db.batch([
      projectFactWrite(db,fact,commitGuard,row.commit_seq),
      ...(writes.length ? [db.prepare('UPDATE model_workspace SET reference_json=?,application_revision=application_revision+1 WHERE id=1 AND changes()=1')
        .bind(referenceWrite(state,{...state,grants:result.state.grants,orders:result.state.orders,ledger:result.state.ledger},reference))] : []),
      ...projectChargeWrites(db,fact,at),
      db.prepare('UPDATE db_state SET commit_seq=commit_seq+1 WHERE id=1 AND changes()=1'),
    ]);
    if (insert.meta.changes) return respond(fact);
  } catch (error) {
    if (!/UNIQUE constraint/.test(String(error))) throw error;
  }
  const committed=await readProjectFact(db,key.tenantId,requestId);
  if (committed?.requestHash===requestHash && committed.source==='API 调用') return respond(committed);
  if (committed) issue(409,'REQUEST_ID_CONFLICT','调用标识已用于其他请求');
  conflict();
}

function safeAction(action) {
  for (const [key, value] of Object.entries(action || {})) {
    if (['__proto__','prototype','constructor'].includes(key)) issue(400,'INVALID_INPUT','数据字段无效');
    if (/^(?:secret|password|authorization|credential|keyInput|keyInputs|apiKey|key)$/i.test(key) && value) {
      issue(400, 'INVALID_INPUT', '请使用密钥掩码，不得提交明文凭证');
    }
    if (value && typeof value === 'object') safeAction(value);
  }
}

function adminAction(state, actor, action) {
  if(['enterprise','individual','adminAccount','deploymentOperation'].includes(action.type)) {
    if(!canMutate(actor.role,action))issue(403,'FORBIDDEN','当前账号无权执行该操作');
    return action;
  }
  if (action.type === 'activateOrder' && canMutate(actor.role, { type: 'update', collection: 'orders' })) return orderActivationCommand(state, action.id);
  const rows = action.type === 'batch' ? action.changes : [action];
  const removingGatewayRoute = isGatewayRouteRemoval(action);
  if (!Array.isArray(rows) || !rows.length || rows.length > 200 ||
      rows.some(row => !row || (!['add','update'].includes(row.type) && !removingGatewayRoute &&
        !(action.type === 'batch' && row.type === 'remove' && row.collection === 'clusters'))
        || !directCollections.has(row.collection) || !canMutate(actor.role,row)
        || (row.type==='add' ? !validId(row.record?.id) : !validId(row.id)
          || row.type==='update' && (!row.changes || Array.isArray(row.changes) || Object.hasOwn(row.changes,'id'))))) {
    issue(403, 'FORBIDDEN', '当前账号无权执行该操作');
  }
  for (const row of rows) {
    if (row.collection !== 'routes' || row.type === 'remove') continue;
    const headers = (row.type === 'add' ? row.record : row.changes).requestHeaders;
    if (headers == null) continue;
    const entries = typeof headers === 'object' && !Array.isArray(headers) && Object.keys(headers).length === 1
      ? headers.entries : undefined;
    const headerIssue = gatewayRouteHeaderIssue(entries);
    if (headerIssue) issue(422, 'BUSINESS_BLOCKED', headerIssue);
  }
  return action;
}

export async function applicationCommand(db, actor, body, key, configuredAdmins, license) {
  const { operationId, expectedRevision, action } = body;
  if (!validId(operationId) || key !== operationId || !Number.isSafeInteger(expectedRevision) || typeof action?.type !== 'string') issue(400, 'INVALID_INPUT', '操作标识或修订号无效');
  safeAction(action);
  const digest = await hash(body), replay = await receipt(db, actor, key, digest, operationId);
  if (replay) return replay;
  const { row, reference, state } = await applicationState(db, actor);
  if (state.revision !== expectedRevision || !row.application_revision) conflict();
  let next, cancellation, invocationFact, projectAudit, initialCredential;
  const savedPolicy=await readProjectSpacePolicy(db);
  const policy=license?.managed ? { ...savedPolicy, operatingMode:license.commercial ? 'factory' : 'internal' } : savedPolicy;
  const commerceCollections = ['products','orders','bills','ledger','settlements','adjustments'];
  const changes = Array.isArray(action.changes) ? action.changes : [action];
  if (license && !license.commerceWritable && (['activateOrder','cancelMarketOrder','generateBills','adjustment','individual'].includes(action.type) ||
      (license.commercial && action.type === 'enterprise') ||
      (action.type === 'simulateInvocation' && action.data?.purpose === 'metering-test') ||
      changes.some(change => commerceCollections.includes(change?.collection)))) {
    issue(403,'LICENSE_REQUIRED','商业运营授权不可用');
  }
  try {
    if (action.type === 'saveGlobalRoutingParameters') {
      if (actor.role !== '平台管理员') issue(403, 'FORBIDDEN', '仅系统管理员可配置全局路由');
      const values = action.values;
      if (!values || typeof values !== 'object' || Array.isArray(values) ||
          Object.keys(values).some(key => !globalRoutingKeys.includes(key))) {
        issue(400, 'INVALID_INPUT', '路由参数格式无效');
      }
      if (failoverError(values) || Object.hasOwn(values, 'strategy') && !globalRoutingStrategies.includes(values.strategy)) {
        issue(400, 'INVALID_INPUT', '路由策略或故障转移参数无效');
      }
      const strategy = values.strategy ?? effectiveRoutingStrategy(state.globalRoutingParameters?.strategy);
      next = { ...state, revision: state.revision + 1, globalRoutingParameters: globalRoutingValues({ ...values, strategy }),
        audits: [{ action: '修改全局路由设置', objectId: 'global-routing', result: '成功', createdAt: new Date().toISOString() }, ...state.audits] };
    } else if (action.type==='cancelMarketOrder' && canMutate(actor.role,{type:'update',collection:'orders'})) {
      if(!validId(action.id)) throw Error('订单标识无效');
      cancellation=await db.prepare(`SELECT id,cancelled_at,0 AS independent FROM market_orders WHERE id=?
        UNION ALL SELECT id,cancelled_at,1 FROM model_service_orders WHERE id=? LIMIT 1`).bind(action.id,action.id).first();
      if(!cancellation) throw Error('订单不存在');
      if(cancellation.cancelled_at)return {operationId,revision:state.revision};
      next={...state,revision:state.revision+1,audits:[{action:'退订模型服务',objectId:action.id,result:'成功',createdAt:new Date().toISOString()},...state.audits]};
    } else if (action.type==='generateBills' && canMutate(actor.role,{type:'update',collection:'bills'})) {
      const period=billingPeriod(), tenantId=action.tenantId ?? null;
      if (tenantId!==null && (!validId(tenantId) || !state.tenants.some(row=>row.id===tenantId))) throw Error('账单客户不存在');
      const [totals,projectCharges] = await db.batch([
        db.prepare('SELECT tenant_id,amount_micros FROM market_monthly_charges WHERE period=? AND (? IS NULL OR tenant_id=?)').bind(period,tenantId,tenantId),
        db.prepare(`WITH amounts AS (
          SELECT r.tenant_id,json_extract(s.payload_json,'$.projectId') AS projectId,
            COALESCE(json_extract(s.payload_json,'$.charge.micros'),json_extract(s.payload_json,'$.charge.amount')) AS micros
          FROM market_charge_receipts r JOIN simulation_records s
          ON s.kind='project-usage' AND s.id=r.tenant_id||char(1)||r.request_id
          WHERE r.period=? AND (? IS NULL OR r.tenant_id=?) AND json_extract(s.payload_json,'$.billingStatus')='billable'
            AND json_extract(s.payload_json,'$.charge.currency')='CNY'
        ) SELECT tenant_id,projectId,SUM(micros) AS amountMicros FROM amounts
          WHERE projectId IS NOT NULL AND typeof(micros)='integer' AND micros>=0
          GROUP BY tenant_id,projectId ORDER BY projectId`).bind(period,tenantId,tenantId),
      ]);
      const changes=[];
      for(const {tenant_id:tenantId,amount_micros:micros} of totals.results){
        const bill=state.bills.find(row=>row.tenantId===tenantId && row.period===period);
        const amount=Math.round(micros/10000)/100;
        const projectBreakdown=projectCharges.results.filter(row=>row.tenant_id===tenantId).map(({projectId,amountMicros})=>({
          projectId, amountMicros, projectName:state.projects.find(row=>row.tenantId===tenantId && row.id===projectId)?.name,
        }));
        const unassignedMicros=micros-projectBreakdown.reduce((sum,row)=>sum+row.amountMicros,0);
        const values={amount,amountMicros:micros,
          ...(unassignedMicros>=0 ? {projectBreakdown,unassignedMicros} : {})};
        if(!bill)changes.push({type:'add',collection:'bills',record:{id:resourceId('bill'),billNo:'BILL-'+period.replace('-','')+'-'+tenantId,
          tenantId,period,...values,discount:0,paid:0,status:'待出账'}});
        else if(bill.status==='待出账' && Object.entries(values).some(([field,value])=>JSON.stringify(bill[field])!==JSON.stringify(value))) {
          changes.push({type:'update',collection:'bills',id:bill.id,changes:values});
        }
      }
      next=changes.length?commitAdminState(state,{type:'batch',label:'生成模拟账单',changes},actor.role):state;
    } else if (action.type === 'adjustment' && actor.role === '平台管理员') {
      next = applyAdjustment(state, action.id, action.approved === true, action.reason);
    } else if (action.type === 'simulateInvocation' && ['平台管理员', '运维人员'].includes(actor.role)) {
      const { requestId,keyId,modelId,forceTimeout,purpose,metadata } = action.data || {};
      if (![requestId,keyId].every(validId) || !validCallModel(modelId) || !validCallMetadata(metadata) ||
          forceTimeout!==undefined && typeof forceTimeout!=='boolean' || !diagnosticCall({purpose})) throw Error('模拟调用配置无效');
      const keyRecord=state.apiKeys.find(item=>item.id===keyId && item.kind!=='experience' && item.status!=='已删除');
      if (!keyRecord?.tenantId || !keyRecord.projectId) throw Error('请选择已归属项目的 API Key');
      const requestHash=await hash([actor.id,keyId,modelId,forceTimeout===true,purpose,metadata?._user?.trim()]);
      const [existing,marketOrders] = await Promise.all([readProjectFacts(db,keyRecord.tenantId),activeMarketOrders(db,keyRecord.tenantId)]);
      const previous=existing.find(item=>item.requestId===requestId);
      if (previous) {
        if (previous.requestHash!==requestHash) issue(409,'REQUEST_ID_CONFLICT','调用标识已用于其他请求');
        return {operationId,revision:state.revision,request:operationalRequest(withRequestScope(state,previous))};
      }
      const simulationState={...state,requests:mergeProjectFacts(existing,state.requests)};
      const result=simulateRequest(simulationState,{requestId,keyId,modelId,forceTimeout:forceTimeout===true,
        purpose,metadata:{_user:metadata?._user?.trim()},marketOrders});
      if (result.duplicate) issue(409,'REQUEST_ID_CONFLICT','调用标识已用于其他请求');
      invocationFact={...result.request,requestHash};
      next={...state,revision:result.state.revision,audits:result.state.audits};
    } else {
      let command;
      if (action.type==='tenantServiceSettings') {
        if (actor.role!=='平台管理员') issue(403,'FORBIDDEN','只有系统管理员可以配置租户服务');
        if (!validId(action.tenantId) || Object.values(action.ids || {}).some(id=>!validId(id))) issue(400,'INVALID_INPUT','租户或配置标识无效');
        const tenant = state.tenants.find(row=>row.id===action.tenantId);
        if (!tenant || !allowsSpace(policy,tenant)) issue(403,'FORBIDDEN','目标租户不在当前使用范围内');
        if (action.operation==='quota' && (!license?.commerceWritable || internalSpace(policy,tenant))) {
          issue(403,'LICENSE_REQUIRED','预付费配额仅开放给商业租户');
        }
        const result=tenantServiceTransaction({...state,spacePolicy:policy},action);
        command={type:'batch',objectId:action.tenantId,...result};
      } else {
        command = adminAction(state, actor, action);
      }
      if (policy.operatingMode==='internal' && (action.type==='individual' || action.type==='enterprise' &&
          (action.operation==='create' || action.tenantId!==policy.internalTenantId))) {
        issue(403,'INTERNAL_SPACE','企业内用站点仅管理本企业');
      }
      if (action.type==='enterprise' && action.operation==='toggle-key' &&
          internalSpace(policy,state.tenants.find(tenant=>tenant.id===action.tenantId))) {
        issue(403,'FORBIDDEN','企业内用项目请在用户控制台管理');
      }
      const openingPersonal=action.type==='individual' && action.operation==='create';
      const openingEnterprise=action.type==='enterprise' && ['create','add-admin'].includes(action.operation);
      if (openingPersonal && (!policy.personalEnabled || ![action.ids?.tenant,action.ids?.project].every(validId) ||
          action.data?.accountMode==='existing' && (!validId(action.data.userId) || action.data.userId===dualDemoUserId ||
            !configuredAdmins.includes(action.data.userId) &&
            !await db.prepare('SELECT 1 FROM customer_credentials WHERE user_id=?').bind(action.data.userId).first()))) {
        issue(422,'BUSINESS_BLOCKED','个人空间需开放且关联已激活的登录账号');
      }
      if ((openingPersonal || openingEnterprise) && action.data?.accountMode==='new' && (openingPersonal || action.loginProof!==undefined)) {
        const {salt,digest:proof}=action.loginProof || {};
        if (!/^[a-f0-9-]{36}$/.test(salt || '') || !/^[a-f0-9]{64}$/.test(proof || '') || !validId(action.ids?.user)) {
          issue(400,'INVALID_INPUT','管理员密码凭证无效');
        }
        initialCredential=db.prepare('INSERT INTO customer_credentials(user_id,salt,digest) VALUES(?,?,?)')
          .bind(action.ids.user,salt,proof);
      }
      if (openingPersonal) command = {...command,createdBy:actor.name};
      next = command ? commitAdminState(state, command, actor.role) : state;
      if (initialCredential) {
        const user=next.users.find(item=>item.id===action.ids.user);
        const loginValues=account=>[account.login?.trim().toLowerCase(),account.email?.trim().toLowerCase(),normalizeMemberPhone(account.phone || '')].filter(Boolean);
        const values=new Set(loginValues(user));
        if (state.users.some(item=>loginValues(item).some(value=>values.has(value))) ||
            await db.prepare('SELECT 1 FROM admin_accounts WHERE LOWER(id) IN (SELECT value FROM json_each(?)) OR LOWER(login_name) IN (SELECT value FROM json_each(?))')
              .bind(JSON.stringify([...values]),JSON.stringify([...values])).first()) {
          issue(409,'LOGIN_CONFLICT','登录信息已存在，请选择已有账号');
        }
      }
      if (action.type==='enterprise' && action.operation==='toggle-key') {
        const updated=next.apiKeys.find(item=>item.id===action.keyId && item.tenantId===action.tenantId);
        if (updated?.projectId) projectAudit={tenantId:updated.tenantId,projectId:updated.projectId,objectId:updated.id,
          action:updated.status==='有效'?'启用 API Key':'停用 API Key'};
      }
    }
  } catch (error) {
    if (error.status) throw error;
    issue(422, 'BUSINESS_BLOCKED', error.message);
  }
  if (next === state) return { operationId, revision: state.revision };
  const audit=next.audits[0];
  next.audits=state.audits;
  const statements=[db.prepare('UPDATE model_workspace SET reference_json=?,application_revision=application_revision+1 WHERE id=1').bind(referenceWrite(state,next,reference))];
  if (initialCredential) statements.push(initialCredential);
  if (invocationFact) statements.push(projectFactWrite(db, invocationFact));
  if (cancellation) statements.push(db.prepare(cancellation.independent
    ? 'UPDATE model_service_orders SET cancelled_at=? WHERE id=? AND cancelled_at IS NULL'
    : 'UPDATE market_orders SET cancelled_at=? WHERE id=? AND cancelled_at IS NULL').bind(Date.now(),action.id));
  if (action.type==='adminAccount') {
    const withSecret=['create','resetPassword'].includes(action.operation);
    if(withSecret && !/^[a-f0-9]{64}$/.test(action.loginDigest || ''))issue(400,'INVALID_INPUT','缺少演示账号密码摘要');
    const {results}=await db.prepare('SELECT id FROM admin_accounts WHERE access_hash IS NOT NULL').all();
    const configured=new Set([...results.map(row=>row.id),...(withSecret?[action.id]:[])]);
    if (!next.admins.some(account => account.role==='平台管理员' && account.status==='已启用' &&
      (configured.has(account.id) || configuredAdmins.includes(account.loginCode || account.id)))) {
      issue(422, 'BUSINESS_BLOCKED', '须保留至少一个可登录的系统管理员');
    }
    const changed = next.admins.filter(account => JSON.stringify(account) !== JSON.stringify(state.admins.find(item => item.id === account.id)));
    for(const account of changed)statements.push(db.prepare(`INSERT INTO admin_accounts(id,name,role,enabled,login_name,access_hash) VALUES(?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name,role=excluded.role,enabled=excluded.enabled,
        login_name=COALESCE(excluded.login_name,admin_accounts.login_name),access_hash=COALESCE(excluded.access_hash,admin_accounts.access_hash),
        revision=admin_accounts.revision+1`).bind(account.id,account.name,account.role,Number(account.status==='已启用'),
        account.account || null,withSecret?action.loginDigest:null));
    if(action.operation==='resetPassword')statements.push(db.prepare('UPDATE admin_sessions SET revoked_at=? WHERE actor_id=? AND id<>? AND revoked_at IS NULL').bind(Date.now(),action.id,actor.session_id));
  }
  if (action.type === 'deploymentOperation') {
    next.endpoints = invalidateInferenceConnections(state, next);
    if (JSON.stringify(state.endpoints) !== JSON.stringify(next.endpoints)) {
      statements.push(...modelChanges(db, { ...state, revision: row.model_revision }, { ...next, revision: row.model_revision+1 }));
    }
  }
  const { action: label, objectId, result, createdAt } = audit;
  return save(db, actor, state, key, operationId, digest, 'application.'+action.type,
    { operationId, revision: next.revision, ...(invocationFact ? {request:operationalRequest(withRequestScope(state,invocationFact))} : {}) }, statements,
    { id: resourceId('audit-event'), actor: actor.role, actorId: actor.id, action: label, objectId, result, createdAt,
      ...(projectAudit ? {projectAudit} : {}) }, 'application');
}

function tenantContext(state, {tenant,user:sessionUser,admin}) {
  const row = state.tenants.find(item => item.id === tenant.id);
  const user = state.users.find(item => item.id === sessionUser.id && item.status === '正常');
  const membership = state.memberships.find(item => item.userId === user?.id && item.tenantId === tenant.id && item.status === '正常');
  const personal = row?.type === '个人';
  if (admin && activeCustomer(row)) {
    return { state, canManage:true, link:{ systemAdministrator:true },
      identity:{ userId:admin.id, tenantId:row.id, tenantName:row.name, name:admin.name,
        spaceId:personal ? 'personal' : row.id, key:'admin:' + admin.id + ':' + row.id } };
  }
  if(!activeCustomer(row) || !user || (personal ? row.ownerId!==user.id : !membership))issue(403,'FORBIDDEN','当前账号无权进入该空间');
  const identity = { userId: user.id, tenantId: tenant.id, tenantName:tenant.name, name: membership?.memberName || user.name || tenant.name, spaceId: personal ? 'personal' : tenant.id,
    key: (user?.id || 'tenant') + ':' + tenant.id, generation: state.identityGeneration };
  return { state, identity, link: { backendUserId: user?.id, backendMembershipId: membership?.id },
    canManage: Boolean(user && (personal || ['企业管理员','租户管理员'].includes(membership?.role))) };
}

function tenantSessionGuard(session, now) {
  if (session.admin) {
    return { sql:`EXISTS(SELECT 1 FROM admin_sessions s JOIN admin_accounts a ON a.id=s.actor_id
      WHERE s.id=? AND s.actor_id=? AND s.expires_at>? AND s.revoked_at IS NULL AND a.enabled=1 AND a.role='平台管理员')`,
      values:[session.admin.session_id,session.admin.id,now] };
  }
  return { sql:'EXISTS(SELECT 1 FROM market_sessions WHERE token_hash=? AND tenant_id=? AND expires_at>?)',
    values:[session.hash,session.tenant.id,now] };
}

export async function issueCustomerInvitation(db,session,membershipId) {
  if(!session.admin && !['企业管理员','租户管理员','部门管理员'].includes(session.tenant.role))issue(403,'FORBIDDEN','只有企业管理员可以发出邀请');
  if(!validId(membershipId))issue(400,'INVALID_INPUT','成员标识无效');
  if (!session.admin && session.tenant.role === '部门管理员') {
    const {state} = await applicationState(db,{id:session.tenant.id,role:'客户'});
    const context = tenantContext(state,session);
    const {members} = scopedOrganization(context);
    if (!members.some(row => row.id === membershipId && row.role === '普通成员')) issue(403,'FORBIDDEN','成员不在管理范围内');
  }
  const token=crypto.randomUUID(), now=Date.now(), expiresAt=now+7*86400000;
  const sessionGuard = tenantSessionGuard(session, now);
  const [written]=await db.batch([
    db.prepare(`INSERT INTO customer_invitations(membership_id,token_hash,tenant_id,user_id,expires_at)
      SELECT ?,?,?,json_extract(m.value,'$.userId'),? FROM model_workspace w,json_each(w.reference_json,'$.memberships') m
      WHERE w.id=1 AND json_extract(m.value,'$.id')=? AND json_extract(m.value,'$.tenantId')=? AND json_extract(m.value,'$.status')='待加入'
        AND (SELECT commit_seq FROM db_state WHERE id=1)=?
        AND ${sessionGuard.sql}
      ON CONFLICT(membership_id) DO UPDATE SET token_hash=excluded.token_hash,tenant_id=excluded.tenant_id,user_id=excluded.user_id,expires_at=excluded.expires_at`)
      .bind(membershipId,await customerSecretHash(token),session.tenant.id,expiresAt,membershipId,session.tenant.id,
        session.commitSeq,...sessionGuard.values),
    db.prepare('DELETE FROM customer_invitations WHERE membership_id IN (SELECT membership_id FROM customer_invitations WHERE expires_at<=? LIMIT 100)').bind(now),
  ]);
  if(!written.meta.changes)issue(409,'INVITATION_UNAVAILABLE','成员状态或空间已变化，请刷新后重试');
  return {token,expiresAt};
}

async function customerInvitation(db,token) {
  if(typeof token!=='string' || !/^[a-f0-9-]{36}$/.test(token))issue(404,'INVITATION_NOT_FOUND','邀请无效或已过期');
  const tokenHash=await customerSecretHash(token);
  const [invitation,row]=await Promise.all([
    db.prepare(`SELECT i.*,EXISTS(SELECT 1 FROM customer_credentials WHERE user_id=i.user_id) AS password_managed
      FROM customer_invitations i WHERE i.token_hash=? AND i.expires_at>?`).bind(tokenHash,Date.now()).first(),
    referenceRow(db),
  ]);
  if(!invitation)issue(404,'INVITATION_NOT_FOUND','邀请无效或已过期');
  const reference=JSON.parse(row.reference_json);
  const tenant=reference.tenants.find(tenant=>tenant.id===invitation.tenant_id);
  const member=reference.memberships.find(member=>member.id===invitation.membership_id && member.tenantId===tenant?.id &&
    member.userId===invitation.user_id && member.status==='待加入');
  const user=reference.users.find(user=>user.id===member?.userId && user.status==='正常');
  if(!activeCustomer(tenant) || tenant.type==='个人' || !user)issue(404,'INVITATION_NOT_FOUND','邀请无效或已过期');
  const needsPassword=!invitation.password_managed && !user.initialized && !user.invitable && isResourceId(user.id,'user');
  return {invitation,row,reference,tenant,member,user,tokenHash,needsPassword};
}

export async function inspectCustomerInvitation(db,token) {
  const {invitation,tenant,member,user,needsPassword}=await customerInvitation(db,token);
  return {tenant:{id:tenant.id,name:tenant.name},username:user.login,name:member.memberName || user.name,
    role:member.role==='租户管理员'?'企业管理员':member.role,needsPassword,expiresAt:invitation.expires_at};
}

export async function acceptCustomerInvitation(db,session,{token,password,consent}) {
  const {row,reference,tenant,member,user,tokenHash,needsPassword}=await customerInvitation(db,token);
  if(session && session.user.id!==user.id)issue(403,'FORBIDDEN','请使用受邀账号接受邀请');
  if(!session && !needsPassword)issue(401,'TENANT_SESSION_REQUIRED','请先登录受邀账号');
  if(!session && consent!==true)issue(400,'INVALID_INPUT','请确认协议并设置登录密码');
  const credential=session?null:await customerCredential(password);
  const now=Date.now(), createdAt=new Date(now).toISOString();
  const next={...reference,identityGeneration:(reference.identityGeneration || 0)+1,
    memberships:reference.memberships.map(item=>item.id===member.id?{...item,status:'正常',updatedAt:createdAt}:item),
    users:credential?reference.users.map(item=>item.id===user.id?{...item,initialized:true,updatedAt:createdAt}:item):reference.users,
    audits:[{id:resourceId('audit-event'),tenantId:tenant.id,actorId:user.id,actor:member.memberName || user.name,
      action:'接受组织邀请',objectId:member.id,result:'成功',createdAt,prototypeFact:true},...reference.audits]};
  const [written]=await db.batch([
    db.prepare(`UPDATE model_workspace SET reference_json=?,application_revision=application_revision+1 WHERE id=1
      AND application_revision=? AND (SELECT commit_seq FROM db_state WHERE id=1)=?
      AND EXISTS (SELECT 1 FROM customer_invitations WHERE token_hash=? AND expires_at>?)
      AND (? IS NULL OR EXISTS (SELECT 1 FROM market_sessions WHERE token_hash=? AND user_id=? AND expires_at>?))`)
      .bind(referenceWrite(reference,next,reference),row.application_revision,row.commit_seq,tokenHash,now,
        session?.hash || null,session?.hash || null,user.id,now),
    ...(credential?[db.prepare('INSERT INTO customer_credentials(user_id,salt,digest) SELECT ?,?,? WHERE changes()=1')
      .bind(user.id,credential.salt,credential.digest)]:[]),
    db.prepare('DELETE FROM customer_invitations WHERE changes()=1 AND token_hash=?').bind(tokenHash),
    db.prepare('UPDATE db_state SET commit_seq=commit_seq+1 WHERE id=1 AND changes()=1'),
  ]);
  if(!written.meta.changes)conflict();
  return {userId:user.id,tenant:{id:tenant.id,name:tenant.name,type:tenant.type}};
}

export async function adminTenantSession(db, actor, tenantId, license) {
  const [row, policy] = await Promise.all([referenceRow(db), readProjectSpacePolicy(db)]);
  const { tenants, grants } = JSON.parse(row.reference_json);
  const tenant = tenants?.find(item => item.id === tenantId);
  const internal = !license.commercial;
  if (!activeCustomer(tenant) || !allowsSpace(policy,tenant) || (internal && !internalSpace(policy,tenant))) {
    issue(403,'FORBIDDEN','目标租户不可管理');
  }
  return { admin:actor, user:actor, tenant:{ ...tenant, grant:grants?.find(grant=>grant.subjectType==='tenant' && grant.subjectId===tenantId), internal:internal || internalSpace(policy,tenant) }, spaces:[], commitSeq:row.commit_seq };
}

export async function tenantWorkspace(db, session) {
  const actor = { id: session.tenant.id, role: '客户' };
  const [{ state }, catalogue, facts, projectFacts] = await Promise.all([
    applicationState(db, actor), marketCatalogue(db, session), marketFacts(db, actor.id), readProjectFacts(db, actor.id),
  ]);
  const context=tenantContext(state,session);
  const {identity,canManage}=context;
  const own = item => item.tenantId === actor.id;
  const access = projectAccess(state, identity, context.link);
  const projects = access.projects;
  const accountProjects = identity.spaceId === 'personal' ? [] : session.spaces.flatMap(space => {
    if (space.type === '个人') return [];
    const tenant = state.tenants.find(row => row.id === space.id);
    const member = state.memberships.find(row => row.tenantId === space.id && row.userId === identity.userId && row.status === '正常');
    if (!activeCustomer(tenant) || !member) return [];
    return state.projects.flatMap(row => {
      if (row.tenantId !== tenant.id || row.status === '已删除') return [];
      const role = projectRole(row,member);
      return role ? [{
        ...pick(row,['id','name','status','createdAt']),role,tenantId:tenant.id,tenantName:tenant.name,
        canExit:role === PROJECT_ADMIN || tenantProjectAdmin(member),
      }] : [];
    });
  });
  const byProject = new Map(projects.map(project => [project.id, project]));
  const effectiveKeys = state.apiKeys.filter(row => own(row) && (canManage || byProject.has(row.projectId) &&
    (byProject.get(row.projectId).canManage || row.ownerId === identity.userId)));
  const internal=session.tenant.internal===true;
  const orders = internal ? [] : [...facts.orders, ...state.orders.filter(own)];
  const billable = internal || !canManage ? [] : (await db.prepare('SELECT request_id,period FROM market_charge_receipts WHERE tenant_id=? ORDER BY period DESC')
    .bind(actor.id).all()).results;
  const billed = new Map(billable.map(({request_id,period})=>[request_id,period]));
  const plans = orders.filter(row=>['已开通','生效中'].includes(row.status) && (!row.expiresAt || Date.parse(row.expiresAt)>Date.now())).map(row => ({
    ...row, product:row.product || state.products.find(item=>item.id===row.productId),
  })).filter(row => /Plan|预付费|订阅/.test(row.product?.billingMode || row.product?.name));
  const keys = effectiveKeys.filter(row => row.status !== '已删除' && row.kind !== 'experience').map(item => {
    const value=safeKey(item);
    const grant=state.grants.find(row=>row.subjectType==='key' && row.subjectId===item.id && row.status==='生效中');
    return {...value,quota:grant?String(grant.used || 0)+' / '+grant.limit:'不限额度',
      quotaLimit:grant?.limit ?? null,quotaType:grant?({day:'日',week:'周',month:'月',total:'总额度'}[grant.period] || '总额度'):'不限额度',
      progress:grant?.limit?Math.min(100,(grant.used || 0)/grant.limit*100):0};
  });
  const keyIds=new Set(keys.map(key=>key.id));
  const allRequests = mergeProjectFacts(projectFacts, [...facts.requests, ...state.requests.filter(own)]);
  const modelById = new Map(state.models.map(model => [model.id, model]));
  const visible = allRequests.filter(row => !diagnosticCall(row) && (canManage || (!row.projectId || byProject.has(row.projectId)) &&
    (byProject.get(row.projectId)?.canManage || (row.actorUserId || (!row.projectId && row.userId)) === identity.userId || keyIds.has(row.keyId))));
  const requests = visible.map(row => ({
    ...pick(row,['id','requestId','modelId','publicModelId','serviceId','tenantId','projectId','projectRouteId','routeMatch','keyId','httpStatus','error','usage','durationMs','ttftMs','createdAt','updatedAt','billingType','subscriptionId','source','stream','purpose']),
    ...(row.contentRetained && byProject.get(row.projectId)?.canManage ? pick(row,['requestBody','responseBody']) : {}),
  }));
  const logKeys = effectiveKeys.map(row => pick(row,['id','name','projectId','billingType','secretPreview']));
  for (const project of projects) if (visible.some(row => row.keyId === experienceKeyId(project.id))) {
    logKeys.push({ id:experienceKeyId(project.id), name:'在线体验', projectId:project.id, billingType:'按量付费', kind:'experience' });
  }
  const activeMembers = activeProjectMembers(state,actor.id);
  const projectMembers = Object.fromEntries(projects.map(project => [project.id, activeMembers.flatMap(member => {
    const role = projectRole(project, member);
    return role || project.canManage ? [{ id:member.id, name:member.name, role,
      departmentId:member.organizationId || member.departmentId, self:member.id === context.link.backendMembershipId }] : [];
  })]));
  const projectAudits = state.audits.filter(row => own(row) && byProject.get(row.projectId)?.canManage)
    .map(row => pick(row,['id','projectId','createdAt','actor','action','objectId','result']));
  const budgetAt = Date.now();
  const projectBudgets = Object.fromEntries(projects.filter(row => row.canManage && (row.spendBudget?.amountMicros || row.tokenBudget?.limit))
    .map(project => [project.id, {
      ...(project.spendBudget?.amountMicros && projectSpend({ ...state, requests:allRequests }, project, null, budgetAt, internal)),
      ...(project.tokenBudget?.limit && { tokens:projectBudgetUsage(allRequests, project, budgetAt).tokens }),
    }]));
  const projectServices = catalogue.services.filter(service => service.canOrder || service.callable);
  const ids = new Set([...keys.flatMap(row=>row.modelIds || []), ...requests.map(row => row.modelId), ...catalogue.services.map(row => row.serviceModelId)]);
  const models = [
    ...state.models.filter(row=>ids.has(row.id)).map(row=>pick(row,['id','modelId','name','type','usageUnit'])),
    ...catalogue.services.filter(row=>row.independentService).map(row=>({id:row.id,modelId:row.callId,name:row.name,type:row.type})),
  ];
  const report = {
    asOf:new Date(), models, keys:logKeys.map(row=>pick(row,['id','name','projectId','billingType'])),
    records:visible.map(row => ({ ...pick(row,['id','requestId','tenantId','projectId','modelId','modelType','publicModelId',
      'usageUnit','usage','usageConfirmed','usageStatus','cacheHit','httpStatus','billingType','keyId','createdAt','updatedAt','planTokens']),
      charge:internal ? row.internalCost ?? null : row.billingType==='Token Plan' ? null : requestCharge(state,row,modelById.get(row.modelId) || {type:row.modelType}),
      ...(billed.has(row.requestId) && {billPeriod:billed.get(row.requestId)}) })),
    bills:internal || !canManage ? [] : state.bills.filter(own)
      .map(row=>pick(row,['id','billNo','period','amount','amountMicros','status','projectBreakdown','unassignedMicros'])),
  };
  const publicOrders=rows=>rows.map(({factorSnapshot:_rules,...item})=>item);
  const customer=state.tenants.find(row=>row.id===actor.id), user=state.users.find(row=>row.id===identity.userId);
  const organization=scopedOrganization(context);
  const canManageOrganization=identity.spaceId!=='personal' && (canManage || Boolean(organizationManagementScope(context)));
  const visibleProjects = projects.map(({memberRoles:_roles,...project}) => {
    if (!project.canManage) {
      delete project.spendBudget;
      delete project.tokenBudget;
      if (project.modelPermissions) project.modelPermissions = project.modelPermissions.map(({modelId}) => ({modelId}));
    }
    return project;
  });
  return { identity,canManageOrganization, systemAdministrator:Boolean(session.admin), profile:user && {id:user.id,account:user.login,name:user.nickname || user.name || customer.name,type:customer.type,status:customer.status,
    phone:user.phone,realNameCertification:user.realNameCertification,passwordManaged:session.passwordManaged},
    applications:user ? state.customerApplications.filter(application=>application.applicantUserId===user.id) : [],
    backendUserId:identity.userId,canManage,internal, revision:state.revision, orders:publicOrders(orders), plans:publicOrders(plans), keys, requests, logKeys,
    services: catalogue.services, projectServices, canCreateProject:access.canCreate,
    projects:visibleProjects, accountProjects, projectRouting:projectRouting(context),
    routes: visibleProjectRoutes(context),
    models, organization, projectMembers, projectAudits, projectBudgets, report };
}

function organizationAuditDepartments(state,next,context) {
  const before=scopedOrganization(context);
  const after=scopedOrganization({...context,state:next});
  const changed = new Set();
  for (const field of ['members','departments']) {
    const previous = new Map(before[field].map(row=>[row.id,row]));
    const current = new Map(after[field].map(row=>[row.id,row]));
    for (const id of new Set([...previous.keys(),...current.keys()])) {
      const old=previous.get(id), row=current.get(id);
      if (JSON.stringify(old)!==JSON.stringify(row)) {
        for (const value of [old,row]) if (value) changed.add(field==='members' ? value.departmentId : value.id);
      }
    }
  }
  return [...changed];
}

export async function tenantCommand(db, session, body) {
  const { operationId, expectedRevision, action, data } = body, tenant = session.tenant;
  if (body.tenantId !== tenant.id) issue(409, 'TENANT_CHANGED', '客户空间已变化，请重新打开操作');
  if (!validId(operationId) || !Number.isSafeInteger(expectedRevision) ||
      !['keys','organization','routes','projectRoute','projectCreate','projectUpdate','subscribe','certifyPersonal','certifyEnterprise'].includes(action)) issue(400, 'INVALID_INPUT', '客户操作或修订号无效');
  safeAction(data);
  const digest = await hash([session.admin ? 'admin:' + session.admin.id : session.user.id,body]), replay = await db.prepare('SELECT tenant_id,request_hash FROM tenant_operations WHERE id=?').bind(operationId).first();
  if (replay) {
    if (replay.tenant_id !== tenant.id || replay.request_hash !== digest) issue(409, 'IDEMPOTENCY_CONFLICT', '同一操作标识不能用于不同请求');
    return { operationId };
  }
  const [{ row, state, reference }, catalogue] = await Promise.all([applicationState(db, { id: tenant.id, role: '客户' }),
    ['keys','routes','projectRoute','subscribe'].includes(action) || action === 'projectUpdate' && data?.type === 'models' ? marketCatalogue(db, session) : null]);
  if (state.revision !== expectedRevision || session.commitSeq!==row.commit_seq || !row.application_revision) conflict();
  if (tenant.internal && (action==='subscribe' || action==='keys' && data?.billing==='Token Plan')) {
    issue(403,'INTERNAL_SPACE','企业内用空间不使用订购套餐');
  }
  const context = tenantContext(state, session);
  const services=(catalogue?.services || []).map(service=>({...service,materialId:service.modelKey,modelKey:service.serviceModelId}));
  let next, retiredIds=[], revokedInvitations=[], projectAudits=[];
  try {
    if(action==='certifyPersonal' || action==='certifyEnterprise'){
      const accountState={currentUserId:session.user.id,accounts:state.users,applications:state.customerApplications};
      if(action==='certifyPersonal'){
        const result=submitRealNameCertification(accountState,data);
        next={...state,users:result.accounts};
      }else{
        const id=data?.applicationId;
        if(id!=null && !validId(id))throw Error('认证申请标识无效');
        const result=submitEnterpriseCertification(accountState,data,id);
        if(!id)result.applications.at(-1).id=operationId;
        next={...state,customerApplications:result.applications};
      }
    } else if(action==='subscribe') {
      if(!context.canManage)throw Error('仅可为当前客户办理订购');
      const items=data?.items;
      if(!Array.isArray(items) || !items.length || items.length>10 || new Set(items.map(row=>row?.id)).size!==items.length ||
          items.some(row=>!validId(row?.id) || !Number.isSafeInteger(row.revision) || row.revision<1))throw Error('请选择有效的套餐及版本');
      next=await addPackageOrders(db,state,{...tenant,ownerId:context.identity.userId},operationId,items,catalogue.services);
    } else if (action === 'projectCreate') {
      const project = { ...newProject(context, data, 'project-' + operationId), createdBy:context.identity.name };
      next = { ...state, projects:[...state.projects, project] };
      projectAudits = [{ projectId:project.id, action:'创建项目', objectId:project.id }];
    } else if (action === 'projectUpdate') {
      if (!validId(data?.projectId)) throw Error('项目 ID 无效');
      const { projects, audit } = changeProject(context, data.projectId, data.type, data.input, services.filter(row => row.canOrder || row.callable));
      next = { ...state, projects };
      projectAudits = [audit];
    } else if (action === 'keys') {
      if (!validId(data?.projectId) || !Array.isArray(data?.rows) || data.rows.length > 100 || !['按量付费','Token Plan'].includes(data.billing) ||
          (data.billing === 'Token Plan') !== Boolean(data.subscriptionId) ||
          data.rows.some(item => !validId(item?.id) || item.secretPreview && !/^(?:[\w-]{0,8})\*{4,5}(?:[\w-]{0,4})$/.test(item.secretPreview))) throw Error('密钥配置无效');
      const existingIds=new Set(state.apiKeys.map(key=>key.id));
      const newIds=data.rows.map(key=>key.id).filter(id=>!existingIds.has(id));
      if(newIds.length && await db.prepare('SELECT 1 FROM retired_tenant_keys WHERE id IN (SELECT value FROM json_each(?)) LIMIT 1')
        .bind(JSON.stringify(newIds)).first())throw Error('已删除的 API Key ID 不能再次使用');
      const plan=data.subscriptionId && state.orders.find(row=>row.id===data.subscriptionId && row.tenantId===tenant.id);
      const eligible = services.filter(row => row.canOrder || row.callable);
      const planServices=plan?.packageId ? eligible.filter(row=>plan.modelIds.includes(row.serviceModelId)) : eligible;
      const changes=changeProjectKeys(context,data.rows,data,planServices);
      next=changes.next;
      projectAudits=changes.actions.map(entry=>({...entry,projectId:data.projectId}));
      retiredIds=changes.actions.filter(entry=>entry.action==='删除 API Key').map(entry=>entry.objectId);
    } else if (action === 'organization') {
      if(!Array.isArray(data?.departments) || !Array.isArray(data?.members) || data.departments.length>100 || data.members.length>1000 ||
         [...data.departments,...data.members].some(item=>!validId(item?.id)))throw Error('组织或成员配置无效');
      next = tenantOrganizationChanges(context, { ...data, audit: [] });
      const pending=new Set(next.memberships.filter(member=>member.tenantId===tenant.id && member.status==='待加入').map(member=>member.id));
      revokedInvitations=state.memberships.filter(member=>member.tenantId===tenant.id && member.status==='待加入' && !pending.has(member.id)).map(member=>member.id);
    } else if (action === 'projectRoute') {
      const routeServices = services.filter(row=>!row.independentService && row.projectServiceId).map(row=>({...row,id:row.projectServiceId}));
      next = projectRouteChanges(context, data?.route, {remove:data?.remove === true, operationId}, routeServices);
      projectAudits = [{ projectId:data.route.projectId, action:data.remove ? '删除项目路由' : data.route.id ? '编辑项目路由' : '创建项目路由',
        objectId:data.route.id || 'project-route-' + operationId }];
    } else {
      if (!data || data.id != null && !validId(data.id)) throw Error('路由配置无效');
      next = changeTenantRoute(context, data, catalogue.services.filter(row=>!row.independentService), 'route-' + operationId);
      projectAudits = [{ projectId:data.projectId, action:'维护智能路由', objectId:data.id || 'route-' + operationId }];
    }
    assertPersonalProjects(state, next);
  } catch (error) { issue(422, 'BUSINESS_BLOCKED', error.message); }
  const now = Date.now(), actionName = { keys: '维护 API Key', organization: '维护组织成员', routes: '维护智能路由', projectRoute: '维护项目路由',
    subscribe:'订购 Token Plan',certifyPersonal:'提交个人实名认证',certifyEnterprise:'提交企业认证' }[action];
  const audits = projectAudits.length ? projectAudits : action === 'keys' ? [] : [{action:actionName,prototypeFact:true,
    ...(action==='organization' && {departmentIds:organizationAuditDepartments(state,next,context)})}];
  next.audits = [...audits.map((entry,index)=>({ id:index ? operationId + ':' + index : operationId, tenantId:tenant.id,
    actorId:context.identity.userId, actor:context.identity.name, ...(session.admin && {actorRole:'系统管理员'}), result:'成功', createdAt:new Date(now).toISOString(), ...entry })),
    ...state.audits];
  const sessionGuard = tenantSessionGuard(session, now);
  const [written] = await db.batch([
    db.prepare(`UPDATE model_workspace SET reference_json=?,application_revision=application_revision+1 WHERE id=1 AND application_revision=?
      AND (SELECT commit_seq FROM db_state WHERE id=1)=?
      AND ${sessionGuard.sql}`)
      .bind(referenceWrite(state,next,reference),expectedRevision,row.commit_seq,...sessionGuard.values),
    db.prepare('INSERT INTO tenant_operations(id,tenant_id,request_hash,created_at) SELECT ?,?,?,? WHERE changes()=1').bind(operationId,tenant.id,digest,now),
    db.prepare('UPDATE db_state SET commit_seq=commit_seq+1 WHERE id=1 AND changes()=1'),
    ...(retiredIds.length ? [db.prepare('INSERT INTO retired_tenant_keys(id) SELECT value FROM json_each(?) WHERE changes()=1')
      .bind(JSON.stringify(retiredIds))] : []),
    ...(revokedInvitations.length ? [db.prepare('DELETE FROM customer_invitations WHERE changes()=1 AND tenant_id=? AND membership_id IN (SELECT value FROM json_each(?))')
      .bind(tenant.id,JSON.stringify(revokedInvitations))] : []),
    db.prepare('DELETE FROM tenant_operations WHERE id IN (SELECT id FROM tenant_operations WHERE created_at<? LIMIT 100)').bind(now-week),
  ]);
  if (!written.meta.changes) {
    const committed=await db.prepare('SELECT tenant_id,request_hash FROM tenant_operations WHERE id=?').bind(operationId).first();
    if (committed?.tenant_id !== tenant.id || committed.request_hash !== digest) conflict();
  }
  return { operationId };
}
