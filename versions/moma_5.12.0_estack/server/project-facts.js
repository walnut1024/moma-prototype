import { experienceKeyId, projectAccess } from '../src/project-access.mjs';
import { retainedProjectText } from '../src/project-call.mjs';
import { requestIdentity } from '../src/request-identity.mjs';
import { billingPeriod } from '../src/admin-v2/mock-billing.js';

const KIND = 'project-usage';
const prefix = tenantId => tenantId + '\u0001';
const key = (tenantId, requestId) => prefix(tenantId) + requestId;

export async function readProjectFact(db, tenantId, requestId) {
  const row = await db.prepare('SELECT payload_json FROM simulation_records WHERE kind=? AND id=?')
    .bind(KIND,key(tenantId,requestId)).first();
  return row && JSON.parse(row.payload_json);
}

export async function readProjectFacts(db, tenantId) {
  const { results } = await (tenantId
    ? db.prepare('SELECT payload_json FROM simulation_records WHERE kind=? AND id>=? AND id<?')
      .bind(KIND, prefix(tenantId), tenantId + '\u0002')
    : db.prepare('SELECT payload_json FROM simulation_records WHERE kind=?').bind(KIND)).all();
  return results.map(row => JSON.parse(row.payload_json));
}

export function projectFactWrite(db, fact, condition = '', ...bindings) {
  return db.prepare('INSERT INTO simulation_records(kind,id,payload_json) SELECT ?,?,?' + (condition ? ' WHERE ' + condition : ''))
    .bind(KIND,key(fact.tenantId,fact.requestId),JSON.stringify(fact),...bindings);
}

export function mergeProjectFacts(primary, fallback) {
  const merged = new Map(fallback.map(row => [requestIdentity(row), row]));
  for (const row of primary) {
    const id = requestIdentity(row);
    merged.set(id, { ...merged.get(id), ...row });
  }
  return [...merged.values()];
}

export async function projectCallContext(db, session, projectId, expectedSequence) {
  const { tenant, user } = session;
  const [row, requests] = await Promise.all([
    db.prepare('SELECT reference_json,(SELECT commit_seq FROM db_state WHERE id=1) AS seq FROM model_workspace WHERE id=1').first(),
    readProjectFacts(db, tenant.id),
  ]);
  if (row?.seq !== expectedSequence) throw Object.assign(Error('项目配置已变化，请重新调用'), { status:409, code:'REVISION_CONFLICT' });
  const state = JSON.parse(row.reference_json);
  const membership = (state.memberships || []).find(row => row.tenantId === tenant.id && row.userId === user.id && row.status === '正常');
  const identity = { tenantId:tenant.id, spaceId:tenant.type === '个人' ? 'personal' : tenant.id };
  const link = { backendUserId:user.id, backendMembershipId:membership?.id };
  const project = projectAccess(state,identity,link).projects.find(row=>row.id===projectId);
  if (!project) throw Object.assign(Error('该项目当前不可用'), { status:403, code:'project_unavailable' });
  return { project, state:{ ...state,
    requests:mergeProjectFacts(requests, (state.requests || []).filter(row => row.tenantId === tenant.id)) } };
}

export function projectChargeWrites(db, fact, at) {
  const amount = fact.charge?.micros ?? (fact.charge?.unit === 'micro' ? fact.charge.amount : null);
  if (fact.settlement === 'internal' || fact.billingStatus !== 'billable' || fact.billingType === 'Token Plan' || fact.charge?.currency !== 'CNY' ||
      !Number.isSafeInteger(amount) || amount < 0) return [];
  const period = billingPeriod(at);
  return [
    db.prepare('INSERT INTO market_charge_receipts(tenant_id,request_id,period) SELECT ?,?,? WHERE changes()=1')
      .bind(fact.tenantId,fact.requestId,period),
    db.prepare(`INSERT INTO market_monthly_charges(period,tenant_id,amount_micros) SELECT ?,?,? WHERE changes()=1
      ON CONFLICT(period,tenant_id) DO UPDATE SET amount_micros=amount_micros+excluded.amount_micros`)
      .bind(period,fact.tenantId,amount),
  ];
}

export function marketProjectFact({ project, user, usage, response, request, service, at, internal = false }) {
  const success = response.httpStatus !== 403;
  const meter = usage.usage || {};
  const charge = internal ? null : usage.saleTrial;
  const timestamp = new Date(at).toISOString();
  return {
    id:request.requestId, requestId:request.requestId, tenantId:project.tenantId, projectId:project.id,
    keyId:experienceKeyId(project.id), userId:user.id, actorUserId:user.id,
    modelId:service.modelId, modelType:service.model.type, serviceId:service.id, publicModelId:service.callId,
    traceId:usage.traceId, providerId:usage.operational?.providerId, endpointId:usage.operational?.endpointId,
    supplyId:usage.operational?.supplyId, routeVersion:usage.routeVersion, priceSnapshot:internal ? null : usage.priceSnapshot,
    createdAt:timestamp, updatedAt:timestamp, httpStatus:success ? 200 : 403, source:'网页端调用', billingType:'按量付费', purpose:'customer',
    usage:{ input:meter.input_tokens, output:meter.output_tokens, cached:meter.cached_tokens,
      seconds:meter.seconds, images:meter.images, characters:meter.characters },
    usageConfirmed:Boolean(usage.usage), durationMs:Math.max(0, Date.parse(usage.endedAt) - Date.parse(usage.startedAt)),
    billingStatus:usage.billingStatus,
    charge:charge || null,
    ...(internal && { settlement:'internal', departmentId:project.organizationId || null,
      internalCost:usage.cost ? { micros:usage.cost.amount, currency:usage.cost.currency } : null }),
    attempts:success ? (usage.attempts || []).map(attempt => ({
      ...attempt, serviceId:service.id, supplyId:attempt.bindingId, modelId:service.modelId,
      error:attempt.status === 'passed' ? null : attempt.code,
      usage:attempt.usage && { input:attempt.usage.input_tokens, output:attempt.usage.output_tokens,
        cached:attempt.usage.cached_tokens, seconds:attempt.usage.seconds, images:attempt.usage.images, characters:attempt.usage.characters },
    })) : [{dispatched:false,startedAt:timestamp,error:'Model.AccessDenied'}],
    ...(success ? { admittedAt:timestamp } : { error:'Model.AccessDenied' }),
    ...(project.retainContent === true ? {
      contentRetained:true, requestBody:retainedProjectText(request.textTurn?.question || request.messages[0].content),
      responseBody:retainedProjectText(response.choices[0]?.message?.content),
    } : {}),
  };
}
