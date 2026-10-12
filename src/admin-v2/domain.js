import { MODEL_ORDER_BILLING_TYPES } from '../model-order-display.mjs';
import { commitAdminState } from "./store.js";
import { usageTotal } from "./observability.js";
import { enterpriseGrant, enterpriseTokenUsage } from './enterprise.js';
import { availableSupplies, activeSupplySalePrice } from "./model-management.js";

const now = () => new Date().toISOString();
const id = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export function orderActivationCommand(state, orderId) {
  const order = state.orders.find(item => item.id === orderId);
  if (!order) throw new Error("订单不存在");
  if (order.status === "已开通") return null;
  if (order.status !== '待开通') throw new Error('仅待开通订单可以开通');
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

export function simulateRequest(state, { requestId, keyId, modelId, usage = { input: 1000, cached: 0, output: 200 }, forceTimeout = false, cacheKey = "demo-prompt", requirements = {} }) {
  if (state.requests.some(item => item.requestId === requestId)) return { state, request: state.requests.find(item => item.requestId === requestId), duplicate: true };
  const key = state.apiKeys.find(item => item.id === keyId), model = state.models.find(item => item.id === modelId), tenant = key && state.tenants.find(item => item.id === key.tenantId), project = key && state.projects.find(item => item.id === key.projectId), grant = key && state.grants.find(item => item.subjectId === key.id), route = state.routes.find(item => item.modelId === modelId && item.status === "已生效");
  const candidates = availableSupplies(state, modelId, requirements), candidateIds = candidates.map(supply => supply.endpointId);
  const tenantGrant = enterpriseGrant(state, key?.tenantId), tenantQuantity = enterpriseTokenUsage(model, usage);
  let httpStatus = 200, error = "", endpointId = route ? route.targets.find(target => candidateIds.includes(target.endpointId))?.endpointId : candidates[0]?.endpointId;
  if (!key || key.status !== "有效" || !tenant || tenant.status === "停用" || !project || project.status === "停用") [httpStatus, error] = [401, "auth_rejected"];
  else if (!key.modelIds.includes(modelId)) [httpStatus, error] = [403, "model_not_authorized"];
  else if (tenantGrant && !tenantGrant.modelIds.includes(modelId)) [httpStatus, error] = [403, 'enterprise_model_not_authorized'];
  else if (tenantGrant && tenantGrant.limit - tenantGrant.used < tenantQuantity) [httpStatus, error] = [402, 'enterprise_quota_exhausted'];
  else if (!model || model.callsEnabled === false) [httpStatus, error] = [403, "model_call_disabled"];
  else if (model.openScope === 'selected' && !model.tenantIds.includes(key.tenantId)) [httpStatus, error] = [403, "model_scope_rejected"];
  else if (!grant || grant.limit - grant.used < usageTotal(usage)) [httpStatus, error] = [402, "quota_exhausted"];
  else if (state.limits.some(item => item.scopeType === "key" && item.scopeId === key.id && item.status === "已启用")) [httpStatus, error] = [429, "rate_limit_exceeded"];
  else if (!endpointId) [httpStatus, error] = [503, "no_available_endpoint"];
  const attempts = [], cache = state.caches.find(item => item.status === "已启用"), cutoff = cache ? Date.now() - cache.ttl * 1000 : 0, cacheHit = Boolean(cache && state.requests.some(item => item.httpStatus === 200 && item.keyId === keyId && item.modelId === modelId && item.cacheKey === cacheKey && Date.parse(item.createdAt) >= Math.max(cutoff, Date.parse(cache.invalidatedAt || 0))));
  if (cacheHit && usage.input) usage = { ...usage, cached: usage.input };
  if (!error && forceTimeout) {
    attempts.push({ endpointId, durationMs: 3000, error: "upstream_timeout" });
    const fallback = state.fallbacks.find(item => item.routeId === route?.id && item.status === "已启用"), next = fallback?.chain.find(candidate => candidate !== endpointId && candidateIds.includes(candidate));
    if (next) endpointId = next; else [httpStatus, error] = [504, "fallback_unavailable"];
  }
  attempts.push({ endpointId: endpointId || null, durationMs: error ? 0 : 680, error: error || null });
  const request = { id: id("request"), requestId, tenantId: key?.tenantId || null, projectId: key?.projectId || null, keyId: key?.id || keyId, modelId, versionId: model?.defaultVersionId || null, endpointId: endpointId || null, releaseId: state.releases.find(item => item.status === "当前生效")?.id || null, source: "API 调用", attempts, usage, cacheKey, cacheHit, httpStatus, ttftMs: httpStatus === 200 && model?.capabilities.streaming ? 220 : null, durationMs: httpStatus === 200 ? attempts.reduce((sum, item) => sum + item.durationMs, 0) : 0, createdAt: now(), updatedAt: now() };
  const changes = [{ type: "add", collection: "requests", record: request }];
  const fulfilledSupply = candidates.find(supply => supply.endpointId === endpointId);
  const price = fulfilledSupply && activeSupplySalePrice(state, modelId, fulfilledSupply.id);
  request.supplyId = fulfilledSupply?.id || null;
  request.priceVersionId = price?.id || null;
  request.priceSnapshot = price ? { ...price } : null;
  if (httpStatus === 200 && grant) {
    const quantity = usageTotal(usage), nextUsed = grant.used + quantity;
    changes.push({ type: "update", collection: "grants", id: grant.id, changes: { used: nextUsed } }, { type: "add", collection: "ledger", record: { id: id("ledger"), accountId: key.id, sourceId: `request:${requestId}`, type: "调用扣减", delta: -quantity, balance: grant.limit - nextUsed, reason: requestId, status: "已完成" } });
    if (tenantGrant && tenantQuantity) changes.push({ type: 'update', collection: 'grants', id: tenantGrant.id, changes: { used: tenantGrant.used + tenantQuantity } }, { type: 'add', collection: 'ledger', record: { id: id('enterprise-ledger'), accountId: tenant.id, sourceId: `enterprise-request:${requestId}`, type: '企业额度扣减', delta: -tenantQuantity, balance: tenantGrant.limit - tenantGrant.used - tenantQuantity, reason: requestId, status: '已完成' } });
  }
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
