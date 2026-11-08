import { initialApplicationData } from '../src/mock/application-data.js';
import { billingPeriod } from '../src/admin-v2/mock-billing.js';
import { canMutate, commitAdminState } from '../src/admin-v2/state-transaction.js';
import { orderActivationCommand, simulateRequest, applyAdjustment } from '../src/admin-v2/domain.js';
import { organizationProjection, tenantKeyChanges, tenantOrganizationChanges, tenantRouteChanges } from '../src/tenant-data.mjs';
import { loadModelWorkspace, modelChanges } from './model-repository.js';
import { marketCatalogue } from './market.js';
import { addPackageOrders, deductMockPlan } from './market-packages.js';
import { receipt, save } from './model-commands.js';
import { addPrototypeAccounts } from './prototype-presets.js';
import { routingServices } from '../src/admin-v2/service-routing.js';

const collections = [
  'tenants', 'users', 'memberships', 'organizations', 'projects', 'apiKeys', 'grants',
  'orders', 'products', 'prices', 'bills', 'ledger', 'settlements', 'adjustments', 'announcements',
  'routes', 'limits', 'fallbacks', 'releases', 'caches', 'requests', 'alerts', 'incidents', 'integrations',
  'clusters', 'artifacts', 'deployments', 'admins', 'tenantRoutes', 'identityEvents', 'customerApplications', 'audits',
];
const directCollections = new Set(['products','prices','orders','bills','settlements','adjustments','announcements','routes','limits','fallbacks','releases','caches','alerts','incidents','integrations','clusters','artifacts']);
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
    const byId = new Map(initial[key].map(item => [item.id, item]));
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
  state.admins = model.admins.map(account => ({ ...(reference.admins || []).find(item => item.id === account.id), ...account }));
  return { row, reference, state };
}

async function marketFacts(db, tenantId, { includeOrders = true } = {}) {
  const scope = tenantId ? ' WHERE t.tenant_id=?' : '';
  const query = (sql, tail) => {
    const statement = db.prepare(sql + scope + tail);
    return tenantId ? statement.bind(tenantId) : statement;
  };
  const [requests, orders] = await db.batch([
    query(`SELECT t.tenant_id,t.request_id,t.created_at,t.offer_id,t.sale_price_id,o.id AS call_id,o.service_id,s.payload_json
      FROM market_calls t JOIN offers o ON o.record_id=t.offer_id JOIN simulation_records s ON s.kind='usage' AND s.id=t.usage_id`, ' ORDER BY t.created_at DESC LIMIT 400'),
    ...(includeOrders ? [query(`SELECT t.id,t.tenant_id,t.offer_id,t.created_at,t.cancelled_at,t.sale_price_id,o.service_id,o.id AS call_id,m.name,p.record_json AS price_json,s.name AS provider_name
      FROM market_orders t JOIN offers o ON o.record_id=t.offer_id JOIN materials m ON m.id=o.material_id
      LEFT JOIN suppliers s ON s.id=o.supplier_id LEFT JOIN price_versions p ON p.id=t.sale_price_id`, ' ORDER BY t.created_at DESC')] : []),
  ]);
  return {
    orders: (orders?.results || []).map(row => ({ id:row.id, orderNo:row.id, tenantId:row.tenant_id, serviceId:row.offer_id, marketOrder:true,
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

function maintenanceView(state, modelRevision, requests, audits) {
  const { currentRole, adminSession, revision, routes, limits, fallbacks, releases, caches, alerts, incidents,
    clusters, artifacts, deployments } = state;
  const deploymentIds=new Set(deployments.flatMap(({id,deploymentId})=>[id,deploymentId]));
  return { currentRole, adminSession, revision, modelRevision, routes, limits, fallbacks, releases, caches, alerts, incidents,
    clusters, artifacts, deployments, modelOnboardings:[],
    admins:state.admins.map(({id,name,role,status})=>({id,name,role,status})),
    tenants:state.tenants.map(({id,name,type})=>({id,name,type})),
    models:state.models.map(runtimeModel), modelTemplates:state.modelTemplates.map(runtimeModel),
    providers:state.providers.map(({id,name})=>({id,name})),
    endpoints:state.endpoints.map(({id,endpointId,name,providerId,modelIds,status})=>({id,endpointId,name,providerId,modelIds,status})),
    gatewayKeyOptions:state.apiKeys.map(({id,keyId,status})=>({id,keyId,status})),
    gatewayModelOptions:routingServices(state).map(({callId})=>callId).filter(Boolean),
    audits:audits.filter(row=>deploymentIds.has(row.objectId)).map(({id,action,actor,objectId,createdAt,result})=>({id,action,actor,objectId,createdAt,result})),
    requests:requests.map(row=>({
      ...pick(row,['id','requestId','createdAt','startedAt','httpStatus','modelId','modelType','publicModelId','callId','tenantId','userId','keyId','source',
        'providerId','channelId','endpointId','evidenceSource','status','finalStatus','requestStatus','isCanceled','isTimeout','streamInterrupted','finishReason',
        'stream','errorCode','error','errorMessage','errorSource','cacheHit','durationMs','firstPacketMs','ttftMs','taskStatus','routeVersion','releaseId','usageUnit','usageConfirmed']),
      providerId:row.providerId || row.procurementSnapshot?.providerId,
      usage:row.usage && pick(row.usage,['input','output','cached','seconds','characters','images']),
      attempts:(row.attempts || []).map(attempt=>({
        ...pick(attempt,['dispatched','endpointId','channelId','status','httpStatus','statusCode','startedAt','createdAt','upstreamRequestId','upstreamModelId',
          'durationMs','error','errorCode','code','errorMessage','message','errorSource','isTimeout','fallback','fallbackReason','usageConfirmed','usageUnit']),
        providerId:attempt.providerId || attempt.procurementSnapshot?.providerId,
        usage:attempt.usage && pick(attempt.usage,['input','output','cached','seconds','characters','images']),
      })),
    })),
  };
}

export async function applicationBootstrap(db, actor) {
  const maintenance=actor.role==='运维人员';
  const [{ state, row }, facts, audits, activity] = await Promise.all([
    applicationState(db, actor), marketFacts(db, null, {includeOrders:!maintenance}),
    db.prepare("SELECT record_json FROM audit_events WHERE entity_type='application' ORDER BY created_at DESC,rowid DESC LIMIT 200").all(),
    maintenance ? null : db.prepare('SELECT id,user_id,created_at FROM tenant_login_events WHERE created_at>=? ORDER BY created_at DESC LIMIT 200').bind(Date.now()-week).all(),
  ]);
  const events=[...audits.results.map(row=>JSON.parse(row.record_json)),...state.audits];
  const requests=[...facts.requests,...state.requests];
  if(maintenance)return maintenanceView(state,row.model_revision,requests,events);
  const { cloudMockState: _snapshot, ...view } = state;
  const logins=activity.results.map(({id,user_id,created_at})=>({id,userId:user_id,type:'login',at:new Date(created_at).toISOString()}));
  return { ...view,identityEvents:[...logins,...state.identityEvents],
    users:state.users.map(user=>({...user,lastLoginAt:logins.find(row=>row.userId===user.id)?.at || user.lastLoginAt})),
    modelRevision:row.model_revision, audits:events, orders:[...facts.orders,...state.orders], requests };
}

function referenceWrite(before, after, reference) {
  const next = { ...reference, identityGeneration: after.identityGeneration || 0 };
  for (const key of collections) if (before[key] !== after[key]) next[key] = after[key];
  for (const key of ['requests','ledger','audits','identityEvents']) {
    const rows=next[key] || [], cutoff=Date.now()-week;
    next[key]=[...rows.filter(row=>row.prototypeFact && Date.parse(row.createdAt || row.at)>=cutoff).slice(0,key==='requests'?400:200),
      ...rows.filter(row=>!row.prototypeFact)];
  }
  return encoded(next);
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
  if (!Array.isArray(rows) || !rows.length || rows.length > 200 ||
      rows.some(row => !row || !['add','update'].includes(row.type) || !directCollections.has(row.collection) || !canMutate(actor.role,row)
        || (row.type==='add' ? !validId(row.record?.id) : !validId(row.id) || !row.changes || Array.isArray(row.changes) || Object.hasOwn(row.changes,'id')))) {
    issue(403, 'FORBIDDEN', '当前账号无权执行该操作');
  }
  return action;
}

export async function applicationCommand(db, actor, body, key, configuredAdmins) {
  const { operationId, expectedRevision, action } = body;
  if (!validId(operationId) || key !== operationId || !Number.isSafeInteger(expectedRevision) || typeof action?.type !== 'string') issue(400, 'INVALID_INPUT', '操作标识或修订号无效');
  safeAction(action);
  const digest = await hash(body), replay = await receipt(db, actor, key, digest, operationId);
  if (replay) return replay;
  const { row, reference, state } = await applicationState(db, actor);
  if (state.revision !== expectedRevision || !row.application_revision) conflict();
  let next, cancellation;
  try {
    if (action.type==='cancelMarketOrder' && canMutate(actor.role,{type:'update',collection:'orders'})) {
      if(!validId(action.id)) throw Error('订单标识无效');
      cancellation=await db.prepare('SELECT id,cancelled_at FROM market_orders WHERE id=?').bind(action.id).first();
      if(!cancellation) throw Error('订单不存在');
      if(cancellation.cancelled_at)return {operationId,revision:state.revision};
      next={...state,revision:state.revision+1,audits:[{action:'退订模型服务',objectId:action.id,result:'成功',createdAt:new Date().toISOString()},...state.audits]};
    } else if (action.type==='generateBills' && canMutate(actor.role,{type:'update',collection:'bills'})) {
      const period=billingPeriod();
      const {results}=await db.prepare('SELECT tenant_id,amount_micros FROM market_monthly_charges WHERE period=?').bind(period).all();
      const changes=[];
      for(const {tenant_id:tenantId,amount_micros:micros} of results){
        const bill=state.bills.find(row=>row.tenantId===tenantId && row.period===period);
        const amount=Math.round(micros/10000)/100;
        if(!bill)changes.push({type:'add',collection:'bills',record:{id:crypto.randomUUID(),billNo:'BILL-'+period.replace('-','')+'-'+tenantId,
          tenantId,period,amount,discount:0,paid:0,status:'待出账'}});
        else if(bill.status==='待出账' && bill.amount!==amount)changes.push({type:'update',collection:'bills',id:bill.id,changes:{amount}});
      }
      next=changes.length?commitAdminState(state,{type:'batch',label:'生成模拟账单',changes},actor.role):state;
    } else if (action.type === 'adjustment' && actor.role === '平台管理员') {
      next = applyAdjustment(state, action.id, action.approved === true, action.reason);
    } else if (action.type === 'simulateInvocation' && ['平台管理员', '运维人员'].includes(actor.role)) {
      const { requestId, keyId, modelId, forceTimeout, purpose } = action.data || {};
      if (![requestId,keyId].every(validId) || typeof modelId!=='string' || !/^[A-Za-z0-9][A-Za-z0-9._/:-]{0,199}$/.test(modelId) || !['gateway-test','metering-test'].includes(purpose)) throw Error('模拟调用配置无效');
      const result = simulateRequest(state, { requestId, keyId, modelId, forceTimeout: forceTimeout === true, purpose });
      next = result.state;
      if (next!==state) {
        const fact=next.requests.find(item=>item.requestId===requestId);
        fact.prototypeFact=true;
        if(fact.httpStatus===200 && fact.subscriptionId)deductMockPlan(next,fact,state.models.find(row=>row.id===fact.modelId));
        for(const entry of next.ledger) if(entry.sourceId?.endsWith('request:'+requestId))entry.prototypeFact=true;
      }
    } else {
      const command = adminAction(state, actor, action);
      next = command ? commitAdminState(state, command, actor.role) : state;
    }
  } catch (error) {
    if (error.status) throw error;
    issue(422, 'BUSINESS_BLOCKED', error.message);
  }
  if (next === state) return { operationId, revision: state.revision };
  const audit=next.audits[0];
  next.audits=state.audits;
  const statements=[db.prepare('UPDATE model_workspace SET reference_json=?,application_revision=application_revision+1 WHERE id=1').bind(referenceWrite(state,next,reference))];
  if(cancellation)statements.push(db.prepare('UPDATE market_orders SET cancelled_at=? WHERE id=? AND cancelled_at IS NULL').bind(Date.now(),action.id));
  if (action.type==='adminAccount') {
    const withSecret=['create','resetPassword'].includes(action.operation);
    if(withSecret && !/^[a-f0-9]{64}$/.test(action.loginDigest || ''))issue(400,'INVALID_INPUT','缺少演示账号密码摘要');
    const {results}=await db.prepare('SELECT id FROM admin_accounts WHERE access_hash IS NOT NULL').all();
    const configured=new Set([...configuredAdmins,...results.map(row=>row.id),...(withSecret?[action.id]:[])]);
    if (!next.admins.some(account => account.role==='平台管理员' && account.status==='已启用' && configured.has(account.id))) {
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
  if (action.type === 'deploymentOperation' && JSON.stringify(state.endpoints) !== JSON.stringify(next.endpoints)) {
    statements.push(...modelChanges(db, { ...state, revision: row.model_revision }, { ...next, revision: row.model_revision+1 }));
  }
  const { action: label, objectId, result, createdAt } = audit;
  return save(db, actor, state, key, operationId, digest, 'application.'+action.type,
    { operationId, revision: next.revision }, statements,
    { id: crypto.randomUUID(), actor: actor.role, actorId: actor.id, action: label, objectId, result, createdAt }, 'application');
}

function tenantContext(state, tenant) {
  const row = state.tenants.find(item => item.id === tenant.id);
  const user = state.users.find(item => item.id === row?.ownerId && item.status === '正常');
  const membership = state.memberships.find(item => item.userId === user?.id && item.tenantId === tenant.id && item.status === '正常');
  const personal = row?.type === '个人';
  const identity = { userId: user?.id || null, tenantId: tenant.id, name: user?.name || tenant.name, spaceId: personal ? 'personal' : tenant.id,
    key: (user?.id || 'tenant') + ':' + tenant.id, generation: state.identityGeneration };
  return { state, identity, link: { backendUserId: user?.id, backendMembershipId: membership?.id },
    canManage: Boolean(user && (personal || ['企业管理员','租户管理员'].includes(membership?.role))) };
}

export async function tenantWorkspace(db, session) {
  const actor = { id: session.tenant.id, role: '客户' };
  const [{ state }, catalogue, facts] = await Promise.all([applicationState(db, actor), marketCatalogue(db, session), marketFacts(db, actor.id)]);
  const { identity, canManage } = tenantContext(state, session.tenant);
  const own = item => item.tenantId === actor.id;
  const orders = [...facts.orders, ...state.orders.filter(own)];
  const plans = orders.filter(row=>['已开通','生效中'].includes(row.status) && (!row.expiresAt || Date.parse(row.expiresAt)>Date.now())).map(row => ({
    ...row, product:row.product || state.products.find(item=>item.id===row.productId),
  })).filter(row => /Plan|预付费|订阅/.test(row.product?.billingMode || row.product?.name));
  const keys = state.apiKeys.filter(item => own(item) && (canManage || item.ownerId === identity.userId)).map(item => {
    const { key: _key, secret: _secret, ...value } = item;
    const grant=state.grants.find(row=>row.subjectType==='key' && row.subjectId===item.id && row.status==='生效中');
    return {...value,quota:grant?String(grant.used || 0)+' / '+grant.limit:'不限额度',
      quotaLimit:grant?.limit ?? null,quotaType:grant?({day:'日',week:'周',month:'月',total:'总额度'}[grant.period] || '总额度'):'不限额度',
      progress:grant?.limit?Math.min(100,(grant.used || 0)/grant.limit*100):0};
  });
  const requests = [...facts.requests, ...state.requests.filter(own)].map(row =>
    Object.fromEntries(['id','requestId','modelId','publicModelId','serviceId','tenantId','keyId','httpStatus','usage','durationMs','ttftMs','createdAt','billingType','subscriptionId','source','stream'].filter(field => Object.hasOwn(row, field)).map(field => [field, row[field]])));
  const ids = new Set([...keys.flatMap(row=>row.modelIds || []), ...requests.map(row => row.modelId), ...catalogue.services.map(row => row.serviceModelId)]);
  const publicOrders=rows=>rows.map(({factorSnapshot:_rules,...item})=>item);
  const customer=state.tenants.find(row=>row.id===actor.id), user=state.users.find(row=>row.id===identity.userId);
  return { identity,profile:{account:user?.login || customer.id,name:user?.nickname || user?.name || customer.name,type:customer.type,status:customer.status},
    backendUserId:identity.userId,canManage, revision:state.revision, orders:publicOrders(orders), plans:publicOrders(plans), keys, requests,
    services: catalogue.services, projects: state.projects.filter(own), routes: state.tenantRoutes.filter(row => own(row) && (canManage || row.ownerId === identity.userId)),
    models: state.models.filter(row => ids.has(row.id)).map(({ id, modelId, name, type }) => ({ id, modelId, name, type })),
    organization: identity.spaceId === 'personal' ? { departments: [], members: [], audit: [] } : organizationProjection(state, actor.id) };
}

export async function tenantCommand(db, session, body) {
  const { operationId, expectedRevision, action, data } = body, tenant = session.tenant;
  if (body.tenantId !== tenant.id) issue(409, 'TENANT_CHANGED', '客户空间已变化，请重新打开操作');
  if (!validId(operationId) || !Number.isSafeInteger(expectedRevision) || !['keys','organization','routes','subscribe'].includes(action)) issue(400, 'INVALID_INPUT', '客户操作或修订号无效');
  safeAction(data);
  const digest = await hash(body), replay = await db.prepare('SELECT tenant_id,request_hash FROM tenant_operations WHERE id=?').bind(operationId).first();
  if (replay) {
    if (replay.tenant_id !== tenant.id || replay.request_hash !== digest) issue(409, 'IDEMPOTENCY_CONFLICT', '同一操作标识不能用于不同请求');
    return { operationId };
  }
  const [{ row, state, reference }, catalogue] = await Promise.all([applicationState(db, { id: tenant.id, role: '客户' }), marketCatalogue(db, session)]);
  if (state.revision !== expectedRevision || !row.application_revision) conflict();
  const context = tenantContext(state, tenant);
  if (!context.identity.userId) issue(403, 'FORBIDDEN', '该客户尚未关联可用的账号');
  const services=catalogue.services.map(service=>({...service,materialId:service.modelKey,modelKey:service.serviceModelId}));
  let next, retiredIds=[];
  try {
    if(action==='subscribe') {
      if(!context.canManage)throw Error('仅可为当前客户办理订购');
      const items=data?.items;
      if(!Array.isArray(items) || !items.length || items.length>10 || new Set(items.map(row=>row?.id)).size!==items.length ||
          items.some(row=>!validId(row?.id) || !Number.isSafeInteger(row.revision) || row.revision<1))throw Error('请选择有效的套餐及版本');
      next=await addPackageOrders(db,state,{...tenant,ownerId:context.identity.userId},operationId,items,catalogue.services);
    } else if (action === 'keys') {
      if (!Array.isArray(data?.rows) || data.rows.length > 100 || !['按量付费','Token Plan'].includes(data.billing) ||
          (data.billing === 'Token Plan') !== Boolean(data.subscriptionId) ||
          data.rows.some(item => !validId(item?.id) || item.secretPreview && !/^(?:[\w-]{0,8})\*{4,5}(?:[\w-]{0,4})$/.test(item.secretPreview))) throw Error('密钥配置无效');
      const existingIds=new Set(state.apiKeys.map(key=>key.id));
      const newIds=data.rows.map(key=>key.id).filter(id=>!existingIds.has(id));
      if(newIds.length && await db.prepare('SELECT 1 FROM retired_tenant_keys WHERE id IN (SELECT value FROM json_each(?)) LIMIT 1')
        .bind(JSON.stringify(newIds)).first())throw Error('已删除的 API Key ID 不能再次使用');
      const plan=data.subscriptionId && state.orders.find(row=>row.id===data.subscriptionId && row.tenantId===tenant.id);
      const planServices=plan?.packageId ? services.map(row=>({...row,callable:row.canOrder && plan.product.modelIds.includes(row.materialId)})) : services;
      next=tenantKeyChanges(context,data.rows,data,planServices);
      const remaining=new Set(next.apiKeys.map(key=>key.id));
      retiredIds=[...existingIds].filter(id=>!remaining.has(id));
    } else if (action === 'organization') {
      if(!Array.isArray(data?.departments) || !Array.isArray(data?.members) || data.departments.length>100 || data.members.length>200 ||
         [...data.departments,...data.members].some(item=>!validId(item?.id)))throw Error('组织或成员配置无效');
      next = tenantOrganizationChanges(context, { ...data, audit: [] });
    } else {
      if(!Array.isArray(data?.rows) || data.rows.length>100 || data.rows.some(item=>!validId(item?.id)))throw Error('路由配置无效');
      next = tenantRouteChanges(context, data.rows, services);
    }
  } catch (error) { issue(422, 'BUSINESS_BLOCKED', error.message); }
  const now = Date.now(), actionName = { keys: '维护 API Key', organization: '维护组织成员', routes: '维护智能路由', subscribe:'订购 Token Plan' }[action];
  next.audits = [{ id: operationId, tenantId: tenant.id, actorId: context.identity.userId, actor: context.identity.name,
    action:actionName,result:'成功',createdAt:new Date(now).toISOString(),prototypeFact:true },...state.audits];
  const [written] = await db.batch([
    db.prepare(`UPDATE model_workspace SET reference_json=?,application_revision=application_revision+1 WHERE id=1 AND application_revision=?
      AND (SELECT commit_seq FROM db_state WHERE id=1)=?
      AND EXISTS(SELECT 1 FROM market_sessions WHERE token_hash=? AND tenant_id=? AND expires_at>?)`)
      .bind(referenceWrite(state,next,reference),expectedRevision,row.commit_seq,session.hash,tenant.id,now),
    db.prepare('INSERT INTO tenant_operations(id,tenant_id,request_hash,created_at) SELECT ?,?,?,? WHERE changes()=1').bind(operationId,tenant.id,digest,now),
    db.prepare('UPDATE db_state SET commit_seq=commit_seq+1 WHERE id=1 AND changes()=1'),
    ...(retiredIds.length ? [db.prepare('INSERT INTO retired_tenant_keys(id) SELECT value FROM json_each(?) WHERE changes()=1')
      .bind(JSON.stringify(retiredIds))] : []),
    db.prepare('DELETE FROM tenant_operations WHERE id IN (SELECT id FROM tenant_operations WHERE created_at<? LIMIT 100)').bind(now-week),
  ]);
  if (!written.meta.changes) {
    const committed=await db.prepare('SELECT tenant_id,request_hash FROM tenant_operations WHERE id=?').bind(operationId).first();
    if (committed?.tenant_id !== tenant.id || committed.request_hash !== digest) conflict();
  }
  return { operationId };
}
