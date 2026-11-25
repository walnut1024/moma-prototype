import { activeModelServiceSalePrice, matchingModelServicePrices } from '../src/admin-v2/model-service-sale.mjs';
import { contextRoutingEnabled } from '../src/admin-v2/model-services-new.js';
import { registeredServiceUpstreams } from '../src/admin-v2/service-model-mappings.js';
import { priceRequest } from '../src/admin-v2/operations-analysis.js';
import { platformPriceVersions } from '../src/admin-v2/platform-service-client.js';
import { enterpriseGrant, enterpriseTokenUsage } from '../src/admin-v2/enterprise.js';
import { marketCardsForService, marketCardModelId, marketCardVisible } from '../src/market-cards.mjs';
import { diagnosticCall, mockTextUsage, projectAccessError, projectCallError, projectCallErrors } from '../src/project-call.mjs';
import { tenantModelAllowed, tenantQuotaEnabled, tenantQuotaError } from '../src/tenant-service-policy.mjs';
import { resourceId } from '../src/resource-id.mjs';
import { loadModelWorkspace } from './model-repository.js';
import { modelServiceSupply } from './model-service-sales.js';
import { marketProjectFact, projectChargeWrites, projectFactWrite, readProjectFact } from './project-facts.js';
import { trafficAdmission } from './traffic-calls.js';

const fail = (status, code, message) => { throw Object.assign(new Error(message), {status, code}); };
const commitSequence = '(SELECT commit_seq FROM db_state WHERE id=1)';
const selectServices = `SELECT n.id AS service_id,n.record_json AS service_json,n.revision AS service_revision,
    s.record_json AS sale_json,p.id AS order_id,p.created_at AS order_created_at,${commitSequence} AS commit_seq
  FROM new_model_services n
  LEFT JOIN model_service_sales s ON s.service_id=n.id
  LEFT JOIN model_service_orders p ON p.service_id=n.id AND p.tenant_id=? AND p.cancelled_at IS NULL
  WHERE n.deleted_at IS NULL AND COALESCE(json_extract(n.record_json,'$.controlledOfferId'),'')=''
    AND NOT EXISTS(SELECT 1 FROM offers o WHERE o.id=n.call_id OR o.record_id=n.id)`;

function readModelService(row) {
  return {
    row,
    service: JSON.parse(row.service_json),
    sale: JSON.parse(row.sale_json),
  };
}

export async function marketModelService(db, tenantId, callId) {
  const row = await db.prepare(selectServices + ' AND n.call_id=?').bind(tenantId, callId).first();
  return row && readModelService(row);
}

async function commerceWorkspace(db, tenant) {
  return loadModelWorkspace(db, {id:tenant?.id || 'model-service-market',role:'客户'}, {command:true,simulation:false});
}

function saleIncludes(sale, tenant) {
  return sale?.stage === 'formal' || sale?.stage === 'gray' && sale.grayTenantIds.includes(tenant?.id);
}

function visibleCards(cards, serviceId, audience) {
  return marketCardsForService(cards, serviceId).filter(({card}) => marketCardVisible(card,serviceId,audience));
}

function commerceReadiness(workspace, entry, tenant, at, {contextTokens = null,runtime = false,upstreams} = {}) {
  const { service, sale, row } = entry;
  const allowed = saleIncludes(sale, tenant);
  const internal = tenant?.internal === true;
  const stage = sale?.stage || 'unlisted';
  const authorized = internal
    ? allowed && tenantModelAllowed(tenant,tenant.grant || enterpriseGrant(workspace,tenant.id),service.id)
    : Boolean(row.order_id) && ['gray','formal','paused'].includes(stage);
  const price = activeModelServiceSalePrice(sale,at);
  const routes = service.listed && price ? modelServiceSupply(workspace,service,at,contextTokens,{runtime,upstreams}) : [];
  let prices = null;
  if (routes.length && routes.every(route => route.costPrices?.length)) {
    try {
      const amounts = platformPriceVersions(price,service,'销售价格',at);
      if (routes.every(route=>matchingModelServicePrices(route.costPrices,amounts))) prices = amounts;
    } catch { /* Inactive or unsupported price. */ }
  }
  return {stage, allowed, authorized, price, prices, routes};
}

export async function catalogueModelServices(db, tenant, cards, audience, display, license) {
  const {results} = await db.prepare(selectServices + ' ORDER BY n.created_at,n.id').bind(tenant?.id || '').all();
  const entries = results.map(readModelService).filter(({service,sale,row}) =>
    service.listed && (sale || row.order_id || display && visibleCards(cards,service.id,audience).length));
  if (!entries.length) return [];
  const workspace = await commerceWorkspace(db,tenant), at = Date.now();
  const upstreams = new Map(registeredServiceUpstreams(workspace).map(row=>[row.id,row]));
  return entries.flatMap(entry => {
    const {service,row} = entry;
    const linked = visibleCards(cards,service.id,audience);
    const {stage, allowed, authorized, price, prices, routes} = commerceReadiness(workspace,entry,tenant,at,{upstreams});
    const internal = tenant?.internal === true;
    const canOrder = Boolean(tenant && !internal && allowed && license?.commerceWritable !== false && prices && linked.length);
    const callable = Boolean(prices && authorized);
    if (display ? !linked.length : !callable && !canOrder) return [];
    const upstream = routes[0]?.channel, provider = upstream?.provider;
    // A card supplies presentation. On order and project screens, use the service name even when no card is visible.
    const projections = display ? linked : [linked[0] || {}];
    return projections.map(({card,cardId}) => {
      const modelKey = card ? marketCardModelId(cardId,card) || cardId : service.id;
      return {
        id:service.id, model_service_id:service.id, serviceModelId:service.id, projectServiceId:service.id,
        independentService:true, model_id:modelKey, modelKey, card_id:cardId, canonical_slug:card ? card.content.canonical_slug || modelKey : service.callId,
        call_id:service.callId, callId:service.callId, name:service.name, type:service.type,
        provider_id:provider?.id, providerId:provider?.id, providerName:provider?.name,
        provider:upstream ? `${provider?.name || ''}（${upstream.name || upstream.upstreamModelId}）` : '',
        description:card?.content.description || service.description || '',
        profile:{...serviceProfile(service),...card?.content.profile,tasks:serviceProfile(service).tasks || []},
        capabilities:card?.content.capabilities || {},
        ...(internal && {internal:true}),
        salePrices:internal ? [] : (allowed || authorized ? prices || [] : []).map(({amount,currency,unit,effectiveAt,expiresAt}) =>
          ({amount,currency,unit,effectiveAt,expiresAt})),
        salePriceId:!internal && prices && (allowed || authorized) ? price.id : undefined,
        canOrder, callable, stage, ordered:!internal && Boolean(row.order_id), orderedAt:internal ? null : row.order_created_at,
      };
    });
  });
}

export async function modelServiceOrders(db, tenantId) {
  const {results} = await db.prepare(`SELECT p.id,p.service_id AS offerId,n.call_id AS callId,p.created_at AS createdAt,
    CASE WHEN p.cancelled_at IS NOT NULL THEN 'cancelled' WHEN n.deleted_at IS NOT NULL THEN 'withdrawn'
      ELSE COALESCE(json_extract(s.record_json,'$.stage'),'unlisted') END AS stage
    FROM model_service_orders p JOIN new_model_services n ON n.id=p.service_id
    LEFT JOIN model_service_sales s ON s.service_id=n.id WHERE p.tenant_id=?`).bind(tenantId).all();
  return results;
}

export async function marketModelServiceOrders(db, tenant, ids) {
  const {results} = await db.prepare(selectServices + ' AND n.id IN (SELECT value FROM json_each(?))')
    .bind(tenant.id,JSON.stringify(ids)).all();
  return new Map(results.map(row => [row.service_id,readModelService(row)]));
}

export async function prepareModelServiceOrders(db, tenant, entries, cards, audience, at) {
  if (!entries.length) return [];
  const workspace = await commerceWorkspace(db,tenant);
  const upstreams = new Map(registeredServiceUpstreams(workspace).map(row=>[row.id,row]));
  return entries.map(entry => {
    const { service } = entry;
    const {allowed,price,prices} = commerceReadiness(workspace,entry,tenant,at,{upstreams});
    if (!service.listed) fail(409,'MODEL_UNAVAILABLE','模型服务已停服');
    if (entry.sale?.stage === 'paused') fail(409,'MODEL_UNAVAILABLE','此模型服务已停售');
    if (!allowed || !visibleCards(cards,service.id,audience).length) {
      fail(403,'MODEL_FORBIDDEN','该模型服务当前不可在模型广场订购');
    }
    if (!prices) fail(409,'MODEL_UNAVAILABLE','模型服务暂不可订购');
    return {id:resourceId('order'),offerId:service.id,priceId:price.id,price};
  });
}

function serviceProfile(service) {
  if (service.type === 'text' || service.type === 'multimodal') {
    return {tasks:['对话'], inputModalities:service.type === 'text' ? ['文本'] : ['文本','图片'], outputModalities:['文本']};
  }
  if (service.type === 'video') return {tasks:['文生视频'],inputModalities:['文本'],outputModalities:['视频']};
  if (service.type === 'image') return {tasks:['文生图'],inputModalities:['文本'],outputModalities:['图片']};
  return {};
}

function priceAmount(price, usage, model, createdAt) {
  const quoted = priceRequest(price,{modelType:model.type,createdAt,usage,usageConfirmed:true,
    value:{complete:true,total:(usage.input || 0)+(usage.output || 0)}},model);
  if (!quoted) return null;
  const micros = Math.round(quoted.amount * 1000000);
  return Number.isSafeInteger(micros) && micros >= 0 ? {amount:micros,micros,unit:'micro',currency:quoted.currency,versionId:price.id} : null;
}

function selectedRoute(routes) {
  const preferred = routes.filter(row => row.priority === routes[0].priority);
  const total = preferred.reduce((sum,row) => sum + row.weight,0);
  let point = Math.random() * total;
  return preferred.find(row => (point -= row.weight) < 0) || preferred[0];
}

function callError(code) {
  const [status,message] = projectCallErrors[code];
  fail(status,code,message);
}

function keyUsagePolicy(state, key, model, quantity, at) {
  if (!key) return {};
  const grant = state.grants.find(row=>row.subjectId===key.id && row.status==='生效中');
  if (!grant && key.quotaLimit != null || grant && grant.limit - grant.used < quantity) {
    return {error:[402,'quota_exhausted','API Key 额度不足']};
  }
  if (key.qpmLimit != null || key.tpmLimit != null) {
    const recent = state.requests.filter(row=>!diagnosticCall(row) && row.keyId===key.id && (row.admittedAt || row.httpStatus===200) &&
      Date.parse(row.admittedAt || row.createdAt)>at-60000 && Date.parse(row.admittedAt || row.createdAt)<=at);
    const tokens = recent.reduce((sum,row)=>sum+enterpriseTokenUsage(state.models.find(item=>item.id===row.modelId) ||
      {type:row.modelType},row.usage || {}),0);
    if (key.qpmLimit != null && recent.length>=key.qpmLimit || key.tpmLimit != null && tokens+quantity>key.tpmLimit) {
      return {error:[429,'rate_limit_exceeded','已达到 API Key 调用速率上限']};
    }
  }
  if ((state.limits || []).some(row=>row.scopeType==='key' && row.scopeId===key.id && row.status==='已启用')) {
    return {error:[429,'rate_limit_exceeded','已达到 API Key 调用速率上限']};
  }
  return {grant};
}

export async function invokeModelService(db, entry, {
  tenant, user, project, projectState, body, requestHash, key = null, experienceOutput, sessionHash, expectedSequence,
}) {
  const {row,service} = entry;
  if (row.commit_seq !== expectedSequence) fail(409,'REVISION_CONFLICT','服务配置已变化，请重试');
  if (!service.listed) fail(409,'MODEL_UNAVAILABLE','模型服务已停服');
  const source = key ? 'API 调用' : '网页端调用';
  const internal = tenant.internal === true;
  const at = Date.now(), timestamp = new Date(at).toISOString();
  const status = projectAccessError(project,service.id,key,at);
  if (status) callError(status);
  if (key && !key.modelIds?.includes(service.id)) fail(403,'model_not_authorized','当前 API Key 未授权此模型服务');
  if (key?.billingType === 'Token Plan') callError('plan_model_unavailable');
  if (!tenantModelAllowed(tenant,tenant.grant || enterpriseGrant(projectState,tenant.id),service.id)) {
    fail(403,'enterprise_model_not_authorized','当前客户未获此模型服务授权');
  }
  if (!internal && !row.order_id) callError('order_required');

  const workspace = await commerceWorkspace(db,tenant);
  const input = body.messages.map(message => message.content).join('\n');
  const output = '模拟调用已完成。';
  const inputTokens = mockTextUsage(input,'').input;
  const {authorized,price,prices,routes,stage} = commerceReadiness(workspace,entry,tenant,at,
    {contextTokens:contextRoutingEnabled(service) ? inputTokens : null,runtime:true});
  if (!authorized || !prices) fail(409,'CALL_UNAVAILABLE','当前模型服务或价格不可用');
  const task = body.task || 'text', profile = serviceProfile(service);
  if (!profile.tasks?.includes({text:'对话',image:'文生图',video:'文生视频',voice:'语音识别'}[task]) ||
    (body.images && !profile.inputModalities?.includes('图片'))) fail(422,'TASK_UNSUPPORTED','所选模型不支持当前任务');

  const replay = async () => {
    const result = await db.prepare(`SELECT service_id,request_hash,response_json FROM model_service_calls
      WHERE tenant_id=? AND request_id=?`).bind(tenant.id,body.requestId).first();
    if (!result) return null;
    if (result.request_hash !== requestHash || result.service_id !== service.id) {
      fail(409,'REQUEST_ID_CONFLICT','调用标识已用于其他请求');
    }
    return JSON.parse(result.response_json);
  };
  const verifyNoReceipt = async () => {
    const prior = await readProjectFact(db,tenant.id,body.requestId);
    if (prior) fail(409,prior.requestHash === requestHash && prior.source === source ? 'CALL_RECEIPT_EXPIRED' : 'REQUEST_ID_CONFLICT',
      prior.requestHash === requestHash && prior.source === source ? '此调用已保存，调用响应已过期' : '调用标识已用于其他请求');
  };
  const previous = await replay();
  if (previous) return previous;
  await verifyNoReceipt();

  const supply = selectedRoute(routes), channel = supply.channel;
  const denied = !key && body.simulateDenied;
  const experience = !key && !denied ? await experienceOutput(db,body) : null;
  const answer = experience?.answer || output;
  const meter = task === 'text' ? mockTextUsage(input,answer) : task === 'image'
    ? {images:body.imageCount || 1} : {seconds:5};
  const actualUsage = task === 'text'
    ? {input_tokens:meter.input,output_tokens:meter.output,total_tokens:meter.input+meter.output,cached_tokens:meter.cached || 0}
    : meter;
  const model = {id:service.id,name:service.name,type:service.type};
  const cost = denied ? null : priceAmount(supply.costPrice,meter,model,timestamp);
  const retail = denied || internal ? null : priceAmount(price,meter,model,timestamp);
  if (!denied && (!cost || !internal && !retail)) fail(409,'CALL_UNAVAILABLE','当前模型服务计量或价格不可用');
  const operational = {providerId:channel.provider?.id,endpointId:channel.endpointId,supplyId:channel.id};
  const response = {
    id:body.requestId, object:'chat.completion', created:Math.floor(at/1000), model:service.callId, source:'mock',
    choices:denied ? [] : [{index:0,message:{role:'assistant',content:answer},finish_reason:'stop'}],
    usage:denied ? null : key && task === 'text' ? {prompt_tokens:meter.input,completion_tokens:meter.output,total_tokens:meter.input+meter.output} : actualUsage,
    ...(key ? {} : {traceId:body.requestId,experience,
      ...(denied && {httpStatus:403,invocationError:{code:'Model.AccessDenied',message:'当前账号暂无该模型的调用权限，请订购模型或切换其他可用模型。'}}),
    }),
  };
  const usage = { operational, traceId:body.requestId, routeVersion:row.service_revision, priceSnapshot:price, cost, saleTrial:retail,
    usage:denied ? null : actualUsage, startedAt:timestamp, endedAt:timestamp, billingStatus:denied ? 'not_billable' : internal ? 'not_applicable' : 'billable',
    attempts:denied ? [] : [{dispatched:true,status:'passed',startedAt:timestamp,providerId:operational.providerId,endpointId:operational.endpointId,
      bindingId:channel.id,channelId:channel.endpointId,upstreamModelId:channel.upstreamModelId,usage:actualUsage,procurementSnapshot:supply.procurementSnapshot}],
  };
  const fact = {
    ...marketProjectFact({project,user,usage,response,request:body,service:{id:service.id,modelId:service.id,callId:service.callId,model},at,internal}),
    requestHash, source, resultSource:'mock', callId:service.callId, ...(key && { keyId:key.id }),
    ...(!internal && {priceVersionId:price.id}),
    ...(denied ? {} : {procurementSnapshot:supply.procurementSnapshot,procurementVersionId:supply.costPrice.id,
      publicAtCall:!internal && stage === 'formal'}),
  };
  const grant = enterpriseGrant(projectState,tenant.id);
  const quantity = denied ? 0 : enterpriseTokenUsage(model,fact.usage);
  const keyPolicy = denied ? {} : keyUsagePolicy(projectState,key,model,quantity,at);
  if (!denied) {
    if (keyPolicy.error) fail(...keyPolicy.error);
    const quotaError = tenantQuotaError(grant,quantity,at,internal);
    if (quotaError) callError(quotaError);
    const error = projectCallError(projectState,project,model,key,fact.usage,fact.internalCost || retail,at,internal);
    if (error) callError(error);
    const traffic = await trafficAdmission(db,{serviceId:service.id,userId:user.id,usage:fact.usage,at});
    if (traffic.error) callError(traffic.error);
    Object.assign(fact,traffic.evidence);
  }

  const history = body.textTurn && !key ? JSON.stringify({...body.textTurn,modelName:service.name,
    provider:channel.provider?.name}) : null;
  const guard = `${commitSequence}=?` + (!key ? ` AND
    EXISTS(SELECT 1 FROM market_sessions WHERE token_hash=? AND tenant_id=? AND expires_at>?)` : '');
  const deductions = [...new Set([tenantQuotaEnabled(grant,internal) && grant,keyPolicy.grant].filter(Boolean))];
  const grantWrite = deductions.length && quantity ? [
    db.prepare(`UPDATE model_workspace SET reference_json=json_set(reference_json,${deductions.map(()=> '?,?').join(',')}),
      application_revision=application_revision+1 WHERE id=1 AND changes()=1`)
      .bind(...deductions.flatMap(row=>['$.grants['+projectState.grants.indexOf(row)+'].used',row.used+quantity])),
  ] : [];
  try {
    const [insert] = await db.batch([
      db.prepare(`INSERT INTO model_service_calls(tenant_id,request_id,request_hash,service_id,sale_price_id,response_json,
        created_at,history_user_id,history_json) SELECT ?,?,?,?,?,?,?,?,? WHERE ${guard}
        AND NOT EXISTS(SELECT 1 FROM market_charge_receipts WHERE tenant_id=? AND request_id=?)`)
        .bind(tenant.id,body.requestId,requestHash,service.id,internal ? null : price.id,JSON.stringify(response),at,
          history ? user.id : null,history,row.commit_seq,...(!key ? [sessionHash,tenant.id,at] : []),tenant.id,body.requestId),
      projectFactWrite(db,fact,'changes()=1'),
      ...projectChargeWrites(db,fact,at),
      ...grantWrite,
      db.prepare('UPDATE db_state SET commit_seq=commit_seq+1 WHERE id=1 AND changes()=1'),
      db.prepare(`DELETE FROM model_service_calls WHERE changes()=1 AND rowid IN (
        SELECT rowid FROM model_service_calls WHERE created_at<?
        UNION ALL SELECT rowid FROM (SELECT rowid FROM model_service_calls ORDER BY created_at DESC,rowid DESC LIMIT 100 OFFSET 400)
      )`).bind(at-7*86400000),
    ]);
    if (insert.meta.changes) return response;
  } catch (error) {
    if (!/UNIQUE constraint/.test(String(error))) throw error;
  }
  const committed = await replay();
  if (committed) return committed;
  await verifyNoReceipt();
  if (await db.prepare('SELECT 1 FROM market_charge_receipts WHERE tenant_id=? AND request_id=?').bind(tenant.id,body.requestId).first()) {
    fail(409,'CALL_RECEIPT_EXPIRED','此调用已计入月账单，明细已过期');
  }
  fail(409,'REVISION_CONFLICT','服务配置已变化，请重新调用');
}
