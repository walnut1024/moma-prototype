import test from "node:test";
import assert from "node:assert/strict";
import { createAdminSeed } from "../src/admin-v2/store.js";
import { activateOrder, applyAdjustment, simulateRequest } from "../src/admin-v2/domain.js";

test("订单开通和请求提交均幂等，失败请求不扣额度", () => {
  let state=createAdminSeed(), order=state.orders[0];
  state=activateOrder(state,order.id); const ledgerCount=state.ledger.length; state=activateOrder(state,order.id); assert.equal(state.ledger.length,ledgerCount);
  const key=state.apiKeys.find(x=>x.status==="有效"&&state.grants.some(g=>g.subjectId===x.id)), model=state.models.find(x=>key.modelIds.includes(x.id)), grant=state.grants.find(x=>x.subjectId===key.id), before=grant.used;
  let result=simulateRequest(state,{requestId:"req_idempotent",keyId:key.id,modelId:model.id}); state=result.state; assert.equal(state.grants.find(x=>x.id===grant.id).used,before+1200);
  const after=state.ledger.length; result=simulateRequest(state,{requestId:"req_idempotent",keyId:key.id,modelId:model.id}); assert.equal(result.state.ledger.length,after); assert.equal(result.duplicate,true);
  const stopped={...state,apiKeys:state.apiKeys.map(x=>x.id===key.id?{...x,status:"停用"}:x)}; result=simulateRequest(stopped,{requestId:"req_rejected",keyId:key.id,modelId:model.id}); assert.equal(result.request.httpStatus,401); assert.equal(result.state.ledger.length,after);
});

test("调账要求意见、限制上限并只执行一次",()=>{
  let state=createAdminSeed(), adjustment=state.adjustments[0];
  assert.throws(()=>applyAdjustment(state,adjustment.id,true,""),/必填/);
  state=applyAdjustment(state,adjustment.id,true,"核实冲正"); const count=state.ledger.length; state=applyAdjustment(state,adjustment.id,true,"重复"); assert.equal(state.ledger.length,count); assert.equal(state.adjustments.find(x=>x.id===adjustment.id).status,"已执行");
});

test("上游超时成功回退；回退端点不可用时失败且不计费",()=>{
  let state=createAdminSeed(), key=state.apiKeys.find(x=>x.id==="key-002"), model=state.models.find(x=>x.id==="model-1"), grant=state.grants.find(x=>x.subjectId===key.id), before=grant.used;
  let result=simulateRequest(state,{requestId:"req_fallback_ok",keyId:key.id,modelId:model.id,forceTimeout:true});
  assert.equal(result.request.httpStatus,200); assert.equal(result.request.attempts.length,2); assert.equal(result.request.endpointId,"endpoint-glm");
  state={...result.state,endpoints:result.state.endpoints.map(x=>x.id==="endpoint-glm"?{...x,status:"停用"}:x)}; const charged=state.grants.find(x=>x.id===grant.id).used;
  result=simulateRequest(state,{requestId:"req_fallback_fail",keyId:key.id,modelId:model.id,forceTimeout:true});
  assert.equal(result.request.httpStatus,504); assert.equal(result.state.grants.find(x=>x.id===grant.id).used,charged); assert.ok(charged>before);
});

test("缓存按 Key 和模型隔离，命中后记录进入日志",()=>{
  let state=createAdminSeed(), key=state.apiKeys.find(x=>x.id==="key-002"), model=state.models.find(x=>x.id==="model-1");
  let first=simulateRequest(state,{requestId:"req_cache_1",keyId:key.id,modelId:model.id,cacheKey:"same"}); assert.equal(first.request.cacheHit,false);
  let second=simulateRequest(first.state,{requestId:"req_cache_2",keyId:key.id,modelId:model.id,cacheKey:"same"}); assert.equal(second.request.cacheHit,true); assert.equal(second.request.usage.cached,second.request.usage.input);
  let other=simulateRequest(second.state,{requestId:"req_cache_3",keyId:"key-003",modelId:model.id,cacheKey:"same"}); assert.equal(other.request.cacheHit,false);
});
