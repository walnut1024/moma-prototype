import { lifecycleAccess, assertOrderAccess, offerKey, salesCustomer } from '../service-access.mjs';
import { MODEL_ORDER_BILLING_TYPES } from '../model-order-display.mjs';
import { commitAdminState } from "./state-transaction.js";
import { usageTotal } from "./observability.js";
import { tenantModelAllowed, tenantQuotaEnabled, tenantQuotaError } from '../tenant-service-policy.mjs';
import { enterpriseGrant, enterpriseTokenUsage } from './enterprise.js';
import { supplyModelUrl, availableSupplies, activeSupplySalePrice, activeSupplyPrice, priceItems, procurementVersion } from "./model-management.js";
import { activeModelSalePrice, activeProviderPrice } from './service-workspace.js';
import { routingServices, routingChannels, serviceRoute, activeRouteVersion } from './service-routing.js';
import { channelProcurementSnapshot } from './channel-change-management.js';
import { platformPriceVersions } from './platform-service-client.js';
import { diagnosticCall, planDeduction, projectAccessError, projectCallError, projectCallErrors, requestCharge, retainedProjectText } from '../project-call.mjs';
import { activeTenantVersion, isTenantRouteCall, routeTargets, keyTenantRoute } from '../tenant-routing.mjs';
import { customerProject } from '../personal-project.mjs';
import { projectModelEnabled } from '../project-access.mjs';

const now = () => new Date().toISOString();
import { resourceId as id } from '../resource-id.mjs';

export function orderActivationCommand(state, orderId) {
  const order = state.orders.find(item => item.id === orderId);
  if (!order) throw new Error("订单不存在");
  if (order.status === "已开通") return null;
  if (order.status !== '待开通') throw new Error('仅待开通订单可以开通');
  assertOrderAccess(state, order);
  const product = state.products.find(item => item.id === order.productId);
  const billingType = order.billingType || product?.billingType;
  if (billingType && !Object.hasOwn(MODEL_ORDER_BILLING_TYPES, billingType)) throw new Error('该计费方式不支持开通');
  const payg = (order.billingType || product?.billingType) === 'payg' || product?.billingMode === '按量付费';
  if (!payg && (!Number.isFinite(order.entitlement) || order.entitlement <= 0)) throw new Error('订单额度未记录或无效，不能发放权益');
  const unit = order.quotaUnit || product?.quotaUnit || (product?.code?.startsWith('TOKEN-') ? 'Token' : null);
  if (!payg && !unit) throw new Error('订单额度单位未记录，不能发放权益');
  const sourceId = `entitlement:${order.id}`;
  const changes = [{ type: 'update', collection: 'orders', id: order.id, changes: { status: '已开通', timeline: [...(order.timeline ?? []), payg ? '服务开通' : '权益发放'] } }];
  if (!payg && !state.ledger.some(item => item.sourceId === sourceId)) changes.push({ type: 'add', collection: 'ledger', record: { id: id('ledger'), accountId: order.tenantId, sourceId, type: '订购权益', delta: order.entitlement, balance: order.entitlement, unit, reason: order.orderNo, status: '已完成' } });
  return { type: 'batch', objectId: order.orderNo, changes };
}

export function activateOrder(state, orderId) {
  const command = orderActivationCommand(state, orderId);
  return command ? commitAdminState(state, command, '平台管理员') : state;
}

export function simulateRequest(state, input) {
  const key = state.apiKeys.find(row => row.id === input.keyId && row.kind !== 'experience');
  if (isTenantRouteCall(input.modelId)) return simulateTenantRoute(state, input, key);
  const code = input.modelId.startsWith('project@') ? input.modelId.slice('project@'.length) : null;
  const route = code && (state.projectRoutes || []).find(row => row.code === code &&
    row.projectId === key?.projectId && row.tenantId === key?.tenantId);
  if (!route) return simulateModelRequest(state, { ...input, routeError:code ? 'project_route_forbidden' : undefined });
  const services = new Map(routingServices(state).map(service => [service.id, service]));
  const ruleIndex = route.rules.findIndex(rule => rule.value === (rule.field === 'apikey' ? key.id : input.metadata?._user));
  const match = route.rules[ruleIndex];
  const routeMatch = match ? { field:match.field, ruleIndex } : { field:'default' };
  const targets = [...new Set([match?.service || route.defaultService, ...route.fallback])];
  const previous = state.requests.find(row => row.tenantId === key.tenantId && row.requestId === input.requestId && row.projectRouteId === route.id);
  if (previous) return simulateModelRequest(state, { ...input, modelId:previous.callId, projectRouteId:route.id });
  let result;
  let attempts = [];
  for (const id of targets) {
    const service = services.get(id);
    if (!service) continue;
    result = simulateModelRequest(state, { ...input, modelId:service.callId, projectRouteId:route.id, routeMatch, priorAttempts:attempts,
      forceTimeout:input.forceTimeout && !attempts.some(attempt=>attempt.dispatched) });
    attempts = result.request.attempts || attempts;
    if (result.duplicate || result.request.httpStatus < 400 || ![
      'model_unavailable', 'model_not_authorized', 'model_forbidden', 'project_model_not_enabled',
      'provider_unavailable', 'provider_price_unavailable', 'model_price_unavailable', 'no_available_endpoint',
      'project_model_rate_limit_exceeded', 'project_token_usage_unavailable', 'fallback_unavailable',
      'order_required', 'plan_model_unavailable', 'plan_meter_unavailable', 'task_unsupported',
    ].includes(result.request.error)) return result;
  }
  return result || simulateModelRequest(state, { ...input, projectRouteId:route.id, routeMatch, routeError:'project_route_unavailable' });
}

function simulateTenantRoute(state, input, key) {
  const project = customerProject(state, state.projects.find(row => row.id === key?.projectId && row.tenantId === key?.tenantId));
  const route = keyTenantRoute(state, key, input.modelId);
  const version = activeTenantVersion(route);
  if (!version) return simulateModelRequest(state, { ...input, routeError: 'tenant_route_forbidden' });
  const tenantRouteId = route.id;
  const previous = state.requests.find(row => row.tenantId === key.tenantId && row.requestId === input.requestId && row.tenantRouteId === tenantRouteId);
  if (previous) return simulateModelRequest(state, { ...input, modelId: previous.callId || input.modelId,
    tenantRouteId, tenantRouteVersion: previous.tenantRouteVersion });

  const orders = new Set((input.marketOrders || []).filter(row => row.tenantId === key.tenantId).map(row => row.callId));
  const services = routingServices(state).filter(service => project && key.modelIds.includes(service.modelId) &&
    projectModelEnabled(project, service.modelId) &&
    lifecycleAccess(state, service, key.tenantId, { commercialOrder: !input.internal && orders.has(service.callId) }).allowed &&
    (input.internal ? salesCustomer(service.model,key.tenantId) : input.marketOrders === undefined || orders.has(service.callId))).map(service => {
    const { model, mode, modelId } = service;
    const price = mode === 'standard' ? activeModelSalePrice(state, modelId) : activeProviderPrice(state, modelId, offerKey(service));
    return { ...service, name: model.name, modelKey: model.templateId || model.id, type: model.type, capabilities: model.capabilities,
      callable: true, salePrices: priceItems(price, model).map(row => ({ ...row, effectiveAt: price.effectiveAt, expiresAt: price.expiresAt })) };
  });
  const trace = { tenantRouteId, tenantRouteVersion: version.number };
  const targets = routeTargets(version.config, services, route.callId, { inputTokens: input.usage?.input, costTier: input.costTier });
  let result;
  for (const target of targets) {
    const attempts = result?.request.attempts || [];
    result = simulateModelRequest(state, { ...input, ...trace, modelId: target.callId, priorAttempts: attempts,
      forceTimeout: input.forceTimeout && !attempts.some(attempt => attempt.dispatched) });
    if (result.duplicate || !['no_available_endpoint', 'fallback_unavailable', 'model_unavailable', 'provider_unavailable',
      'model_price_unavailable', 'provider_price_unavailable'].includes(result.request.error)) return result;
  }
  return result || simulateModelRequest(state, { ...input, ...trace, routeError: 'tenant_route_unavailable' });
}

function simulateModelRequest(state, { requestId, keyId, modelId:requestedModelId, usage = { input:1000, cached:0, output:200 },
  forceTimeout = false, cacheKey = 'demo-prompt', requirements = {}, purpose = 'customer',
  projectRouteId, routeMatch, routeError, tenantRouteId, tenantRouteVersion, priorAttempts = [], content, marketOrders,
  allowedModelTypes, internal = false, allowMissingCost = false }) {
  const startedAt = Date.now(), services = routingServices(state);
  const selectedService=services.find(item=>item.callId && item.callId===requestedModelId);
  const modelId=selectedService?.modelId || state.models.find(item=>item.id===requestedModelId || item.modelId===requestedModelId)?.id || requestedModelId;
  const service = selectedService || services.find(item => item.mode === 'standard' && item.modelId === modelId);

  const key = state.apiKeys.find(item => item.id === keyId && item.kind !== 'experience'), model = state.models.find(item => item.id === modelId), tenant = key && state.tenants.find(item => item.id === key.tenantId), project = key && customerProject(state, state.projects.find(item => item.id === key.projectId && item.tenantId === key.tenantId)), grant = key && state.grants.find(item => item.subjectId === key.id && item.status === '生效中'), route = state.routes.find(item => item.modelId === modelId && item.status === "已生效");
  const quantity = ['text','multimodal','embedding','rerank'].includes(model?.type) ? enterpriseTokenUsage(model,usage) : usageTotal(usage);
  const commercialOrder = !internal && Boolean(marketOrders?.some(row => row.tenantId === key?.tenantId && row.callId === service?.callId));
  const diagnostic = diagnosticCall({ purpose });
  const costOptional = allowMissingCost && !internal && !diagnostic;
  const access = lifecycleAccess(state, service || (model && { model }), key?.tenantId, { commercialOrder });
  const previous = state.requests.find(item => item.requestId === requestId && (marketOrders === undefined || item.tenantId === key?.tenantId));
  if (previous) {
    const sameRequest=previous.keyId===keyId&&previous.tenantId===key?.tenantId&&previous.projectId===key?.projectId&&previous.modelId===modelId&&previous.serviceId===(service?.id || null)&&previous.projectRouteId===projectRouteId&&previous.tenantRouteId===tenantRouteId;
    if(!sameRequest)return {state,request:{requestId,httpStatus:409,error:'request_id_conflict',attempts:[{dispatched:false,error:'request_id_conflict'}]},changes:[],duplicate:true};
    const error = projectAccessError(project, modelId, key, startedAt);
    const entitled = internal || marketOrders === undefined || key?.billingType === 'Token Plan' ||
      marketOrders.some(row => row.tenantId === key?.tenantId && row.callId === service?.callId);
    const authorized=entitled&&access.allowed&&(!internal || salesCustomer(model,tenant.id))&&key?.status==='有效'&&key.modelIds.includes(modelId)&&tenant&&tenant.status!=='停用'&&!error;
    return { state, request: authorized ? previous : { requestId, httpStatus: error ? projectCallErrors[error][0] : 403, error: error || access.code || 'auth_rejected' }, changes: [], duplicate: true };
  }
  const routeConfig = service && activeRouteVersion(serviceRoute(state,service.id))?.config;
  const mapped = routeConfig?.channels.filter(item => item.enabled && (!item.backup || routeConfig.autoFailover)).sort((a,b)=>Number(Boolean(a.backup))-Number(Boolean(b.backup))).map(item => item.supplyId);
  const serviceCandidates = service && new Set(routingChannels(state, service, startedAt, { runtime: true, allowMissingCost: costOptional })
    .filter(item => item.available).map(item => item.id));
  let candidates = availableSupplies(state, modelId, requirements).filter(supply => !service || mapped?.includes(supply.id) && serviceCandidates.has(supply.id) && (service.mode !== 'provider' || supply.provider?.id === service.providerId)).filter(supply => {
    if (costOptional) return true;
    const items = priceItems(activeSupplyPrice(state, supply.id, startedAt), model);
    return items.length && items.every(item => item.amount != null);
  });
  if (mapped) candidates = mapped.flatMap(supplyId => candidates.filter(supply => supply.id === supplyId));
  const candidateIds = candidates.map(supply => supply.endpointId);
  const procurementSnapshots = new Map(candidates.map(supply => {
    const cost = activeSupplyPrice(state, supply.id, startedAt);
    if (costOptional) {
      try { platformPriceVersions(cost, model, '服务商成本价', startedAt); }
      catch { return [supply.id, null]; }
    }
    const association = supply.provider?.catalogConnections?.find(row => !row.deletedAt && (supply.channelId ? row.id===supply.channelId : row.endpointId===supply.endpointId && row.upstreamModelId===supply.upstreamModelId));
    const quote = association && channelProcurementSnapshot(association, startedAt);
    return [supply.id, { ...quote, versionId: quote?.versionId || procurementVersion(cost) || null, version: quote?.version ?? cost?.version ?? null, selectedAt: new Date(startedAt).toISOString(), items: structuredClone(priceItems(cost, model)), providerId: supply.provider.id, endpointId: supply.endpointId, supplyId: supply.id, configurationRevision: supply.endpoint.configurationRevision || 0 }];
  }));
  const recent=state.requests.filter(row=>!diagnosticCall(row) && row.keyId===keyId&&Date.parse(row.admittedAt || row.createdAt)>startedAt-60000&&Date.parse(row.admittedAt || row.createdAt)<=startedAt && (row.admittedAt || row.httpStatus===200));
  const keyRateExceeded=key?.qpmLimit!=null&&recent.length>=key.qpmLimit || key?.tpmLimit!=null&&recent.reduce((total,row)=>total+enterpriseTokenUsage(state.models.find(item=>item.id===row.modelId),row.usage || {}),0)+quantity>key.tpmLimit;
  const tenantGrant = enterpriseGrant(state, key?.tenantId), tenantQuantity = enterpriseTokenUsage(model, usage);
  const quotaError = tenantQuotaError(tenantGrant,tenantQuantity,startedAt,internal);
  let httpStatus = 200, error = "", endpointId = service || !route ? candidates[0]?.endpointId : route.targets.find(target => candidateIds.includes(target.endpointId))?.endpointId;
  const accessCode = projectAccessError(project, modelId, key, startedAt);
  if (!key || key.status !== "有效" || !tenant || tenant.status === "停用" || !project) [httpStatus, error] = [401, "auth_rejected"];
  else if (routeError) [httpStatus,error] = [projectCallErrors[routeError][0],routeError];
  else if (accessCode) [httpStatus, error] = [projectCallErrors[accessCode][0], accessCode];
  else if (!key.modelIds.includes(modelId)) [httpStatus, error] = [403, "model_not_authorized"];
  else if (!tenantModelAllowed(tenant,tenantGrant,modelId)) [httpStatus, error] = [403, 'enterprise_model_not_authorized'];
  else if (quotaError) [httpStatus, error] = [projectCallErrors[quotaError][0], quotaError];
  else if (!access.allowed) [httpStatus, error] = [403, access.code];
  else if (internal && !salesCustomer(model,tenant.id)) [httpStatus,error]=[403,'model_forbidden'];
  else if (allowedModelTypes && !allowedModelTypes.includes(model.type)) [httpStatus,error]=[422,'task_unsupported'];
  else if (!internal && marketOrders && key.billingType !== 'Token Plan' &&
      !marketOrders.some(row => row.tenantId === tenant.id && row.callId === service?.callId)) [httpStatus,error]=[403,'order_required'];
  else if (model.serviceMode==='provider' && !service) [httpStatus,error]=[403,'provider_service_required'];
  else if (service?.mode === 'provider' && !activeProviderPrice(state,modelId,offerKey(service),startedAt)) [httpStatus,error]=[503,'provider_price_unavailable'];
  else if (service?.mode === 'standard' && !activeModelSalePrice(state,modelId,startedAt)) [httpStatus,error]=[503,'model_price_unavailable'];
  else if (!grant && key.quotaLimit != null || grant && grant.limit - grant.used < quantity) [httpStatus, error] = [402, "quota_exhausted"];
  else if (keyRateExceeded || state.limits.some(item => item.scopeType === "key" && item.scopeId === key.id && item.status === "已启用")) [httpStatus, error] = [429, "rate_limit_exceeded"];
  else if (!endpointId) [httpStatus, error] = [503, "no_available_endpoint"];
  const attempts = [...priorAttempts], cache = state.caches.find(item => item.status === "已启用"), cutoff = cache ? Date.now() - cache.ttl * 1000 : 0, cacheHit = Boolean(cache && state.requests.some(item => !diagnosticCall(item) && item.httpStatus === 200 && item.keyId === keyId && item.modelId === modelId && item.cacheKey === cacheKey && Date.parse(item.createdAt) >= Math.max(cutoff, Date.parse(cache.invalidatedAt || 0))));
  if (cacheHit && usage.input) usage = { ...usage, cached: usage.input };
  const saleFor = supply => supply && (model.serviceMode === 'standard' ? activeModelSalePrice(state,modelId,startedAt) : model.serviceMode==='provider' ? activeProviderPrice(state,modelId,offerKey(service),startedAt) : activeSupplySalePrice(state, modelId, supply.id,startedAt));
  const at = new Date(startedAt).toISOString();
  const chargeFor = price => requestCharge(state, { httpStatus:200, createdAt:at, modelId, modelType:model.type, usage, priceSnapshot:price }, model, price);
  const meteredPrice = supply => internal ? activeSupplyPrice(state, supply?.id, startedAt) : saleFor(supply);
  if (!error) {
    const price = meteredPrice(candidates.find(supply => supply.endpointId === endpointId));
    const policy = projectCallError(state, project, model, key, usage, chargeFor(price), startedAt, internal);
    if (policy) [httpStatus, error] = [projectCallErrors[policy][0], policy];
  }
  let plan;
  if (!error && marketOrders && key.billingType === 'Token Plan') {
    plan = planDeduction(state, { requestId, tenantId:tenant.id, keyId, subscriptionId:key.subscriptionId,
      usage, priceSnapshot:saleFor(candidates.find(supply => supply.endpointId === endpointId)) }, model, startedAt);
    if (plan.error) [httpStatus,error]=[projectCallErrors[plan.error][0],plan.error];
  }
  if (!error && forceTimeout) {
    const first = candidates.find(supply => supply.endpointId === endpointId);
    attempts.push({ dispatched:true, startedAt:at, serviceId:service?.id, modelId, providerId:first.provider?.id, endpointId, supplyId:first.id,
      requestUrl:supplyModelUrl(first, model) || null, durationMs:3000, error:'upstream_timeout', procurementSnapshot:structuredClone(procurementSnapshots.get(first.id)),
      configurationRevision:first.endpoint.configurationRevision || 0 });
    const fallback = !service && state.fallbacks.find(item => item.routeId === route?.id && item.status === "已启用");
    const next = service ? routeConfig.autoFailover && candidates.find(supply => supply.endpointId !== endpointId)?.endpointId : fallback?.chain.find(candidate => candidate !== endpointId && candidateIds.includes(candidate));
    if (next) {
      const price = meteredPrice(candidates.find(supply => supply.endpointId === next));
      const policy = projectCallError(state, project, model, key, usage, chargeFor(price), startedAt, internal);
      if (policy) [httpStatus, error] = [projectCallErrors[policy][0], policy];
      else endpointId = next;
    } else [httpStatus, error] = [504, "fallback_unavailable"];
  }
  const fulfilledSupply = candidates.find(supply => supply.endpointId === endpointId);
  const procurementSnapshot = fulfilledSupply && structuredClone(procurementSnapshots.get(fulfilledSupply.id));
  attempts.push({ dispatched:!error, startedAt:new Date().toISOString(), serviceId:service?.id, modelId, providerId:fulfilledSupply?.provider?.id,
    ...(fulfilledSupply && !error && { requestUrl:supplyModelUrl(fulfilledSupply, model) || null }),
    endpointId:endpointId || null, durationMs:error ? 0 : 680, error:error || null, ...(error ? {} : {usage}), ...(fulfilledSupply ?
      { supplyId:fulfilledSupply.id, procurementSnapshot:structuredClone(procurementSnapshot),
        configurationRevision:fulfilledSupply.endpoint.configurationRevision || 0 } : {}) });
  const request = { id: id("request"), requestId, tenantId: key?.tenantId || null, projectId: key?.projectId || null, keyId: key?.id || keyId, modelId, versionId: model?.defaultVersionId || null, endpointId: endpointId || null, releaseId: state.releases.find(item => item.status === "当前生效")?.id || null, source: "API 调用", attempts, usage:httpStatus===200 ? usage : null, usageConfirmed:httpStatus===200, cacheKey, cacheHit, httpStatus, ttftMs: httpStatus === 200 && model?.capabilities?.streaming ? 220 : null, durationMs:attempts.reduce((sum,item)=>sum+item.durationMs,0), createdAt: now(), updatedAt: now() };
  const changes = [{ type: "add", collection: "requests", record: request }];
  const price = saleFor(fulfilledSupply);
  request.error = error || null;
  if (projectRouteId) Object.assign(request,{projectRouteId,routeMatch});
  if (tenantRouteId) Object.assign(request,{tenantRouteId,tenantRouteVersion});
  if (attempts.some(attempt => attempt.dispatched)) request.admittedAt = attempts.find(attempt=>attempt.dispatched).startedAt;
  if (internal) Object.assign(request, {settlement:'internal', departmentId:project?.organizationId || null,
    internalCost:httpStatus===200 && !diagnostic ? chargeFor(meteredPrice(fulfilledSupply)) : null});
  else if (httpStatus === 200 && !diagnostic && key?.billingType !== 'Token Plan') request.charge = chargeFor(price);
  if (httpStatus === 200 && !diagnostic && key?.billingType === 'Token Plan') {
    if (plan) request.planTokens = plan.deduction;
    else if (grant && tenantQuantity) request.planTokens = tenantQuantity;
  }
  if (!diagnostic && request.admittedAt && project?.retainContent === true && content) {
    request.contentRetained = true;
    request.requestBody = retainedProjectText(content.input);
    request.responseBody = retainedProjectText(content.output);
  }
  request.modelType = model?.type || null;
  request.purpose = purpose;
  request.billingStatus = httpStatus === 200 && !diagnostic ? "billable" : "not_billable";
  request.serviceId = service?.id || null;
  request.serviceMode = service?.mode || null;
  request.routeVersion = service ? activeRouteVersion(serviceRoute(state,service.id))?.version || null : null;
  request.userId=key?.ownerId;request.billingType=key?.billingType;request.subscriptionId=key?.subscriptionId;
  request.callId=service?.callId || model?.modelId || requestedModelId;
  request.publicModelId=request.callId;
  request.providerId=fulfilledSupply?.provider?.id || null;
  request.supplyId = fulfilledSupply?.id || null;
  request.priceVersionId = price?.id || null;
  request.priceSnapshot = price ? structuredClone(price) : null;
  request.procurementVersionId = procurementSnapshot?.versionId || null;
  request.procurementSnapshot = procurementSnapshot || null;
  request.configurationRevision = fulfilledSupply?.endpoint.configurationRevision || 0;
  if (httpStatus === 200 && !diagnostic && grant) {
    const nextUsed = grant.used + quantity;
    changes.push({ type: "update", collection: "grants", id: grant.id, changes: { used: nextUsed } }, { type: "add", collection: "ledger", record: { id: id("ledger"), accountId: key.id, sourceId: `request:${requestId}`, type: "调用扣减", delta: -quantity, balance: grant.limit - nextUsed, reason: requestId, status: "已完成" } });
  }
  if (httpStatus === 200 && !diagnostic && tenantQuotaEnabled(tenantGrant,internal) && tenantQuantity) changes.push({ type: 'update', collection: 'grants', id: tenantGrant.id, changes: { used: tenantGrant.used + tenantQuantity } }, { type: 'add', collection: 'ledger', record: { id: id('enterprise-ledger'), accountId: tenant.id, sourceId: `enterprise-request:${requestId}`, type: '企业额度扣减', delta: -tenantQuantity, balance: tenantGrant.limit - tenantGrant.used - tenantQuantity, reason: requestId, status: '已完成' } });
  if (httpStatus === 200 && !diagnostic && plan) changes.push(
    { type:'update', collection:'orders', id:plan.plan.id, changes:{used:plan.plan.used + plan.deduction} },
    { type:'add', collection:'ledger', record:{ id:id('plan-ledger'), accountId:plan.plan.id, sourceId:`request:${requestId}`,
      type:'套餐抵扣', delta:-plan.deduction, balance:plan.plan.entitlement - plan.plan.used - plan.deduction,
      unit:'Token', status:'已完成', reason:requestId } });
  return { state: commitAdminState(state, { type: "batch", objectId: requestId, changes }, "平台管理员"), request, changes, duplicate: false };
}

export function applyAdjustment(state, adjustmentId, approved, reason) {
  const adjustment = state.adjustments.find(item => item.id === adjustmentId), bill = adjustment && state.bills.find(item => item.id === adjustment.billId);
  if (!adjustment || !bill) throw new Error("调账或账单不存在");
  if (["已执行", "已拒绝"].includes(adjustment.status)) return state;
  if (!reason?.trim()) throw new Error("审批意见必填");
  if (Math.abs(adjustment.amount) > bill.amount) throw new Error("调账金额不能超过账单应收");
  const changes = [{ type: "update", collection: "adjustments", id: adjustment.id, changes: { status: approved ? "已执行" : "已拒绝", approvalReason: reason } }];
  if (approved) changes.push({ type: "add", collection: "ledger", record: { id: id("ledger"), accountId: bill.tenantId, sourceId: `adjustment:${adjustment.id}`, type: "账单冲正", delta: -adjustment.amount, balance: 0, reason, status: "已完成" } });
  return commitAdminState(state, { type: "batch", objectId: adjustment.adjustmentNo, changes }, "平台管理员");
}
