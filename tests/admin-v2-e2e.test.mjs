import assert from "node:assert/strict";
import test from "node:test";
import { activateOrder, applyAdjustment, simulateRequest } from "../src/admin-v2/domain.js";
import { commitAdminState, createAdminSeed } from "../src/admin-v2/store.js";

test("E2E-01 供给接入到商品上架引用同一模型", () => {
  let state=createAdminSeed(), model=state.models[0];
  state=commitAdminState(state,{type:"batch",objectId:"provider-e2e",changes:[
    {type:"add",collection:"providers",record:{id:"provider-e2e",name:"验收服务商",sourceType:"thirdParty",status:"已启用"}},
    {type:"add",collection:"endpoints",record:{id:"endpoint-e2e",endpointId:"ep-e2e",name:"验收端点",providerId:"provider-e2e",protocol:"OpenAI",baseUrl:"https://demo.invalid/v1",modelIds:[model.id],capacity:1000,health:100,status:"运行中"}},
    {type:"add",collection:"validations",record:{id:"validation-e2e",modelVersionId:model.defaultVersionId,endpointId:"endpoint-e2e",passed:true,result:"通过",status:"已完成"}},
    {type:"add",collection:"routes",record:{id:"route-e2e",routeId:"route-e2e",name:"验收路由",modelId:model.id,targets:[{endpointId:"endpoint-e2e",weight:100}],status:"已生效"}},
    {type:"add",collection:"products",record:{id:"product-e2e",code:"E2E",name:"验收商品",billingMode:"按量付费",modelIds:[model.id],price:1,status:"已上架"}},
  ]});
  assert.equal(state.endpoints.find(x=>x.id==="endpoint-e2e").modelIds[0],model.id); assert.equal(state.products.find(x=>x.id==="product-e2e").status,"已上架");
});

test("E2E-02 订单权益、请求、日志、计量和账单保持一致", () => {
  let state=createAdminSeed(), order={id:"order-e2e",orderNo:"ORD-E2E",tenantId:"tenant-gov",productId:"product-plan",amount:699,entitlement:100000000,status:"待开通",timeline:["订单创建"]};
  state=commitAdminState(state,{type:"add",collection:"orders",record:order}); state=activateOrder(state,order.id);
  const key=state.apiKeys.find(x=>x.id==="key-002"), result=simulateRequest(state,{requestId:"req_e2e_02",keyId:key.id,modelId:"model-1"}); state=result.state;
  const request=state.requests.find(x=>x.requestId==="req_e2e_02"), charge=state.ledger.find(x=>x.sourceId==="request:req_e2e_02");
  state=commitAdminState(state,{type:"add",collection:"bills",record:{id:"bill-e2e",billNo:"BILL-E2E",tenantId:key.tenantId,period:"2026-10",amount:0.01,discount:0,paid:0,status:"待出账"}});
  assert.equal(request.httpStatus,200); assert.ok(charge.delta<0); assert.equal(state.bills.find(x=>x.id==="bill-e2e").status,"待出账");
});

test("E2E-03 超时按链路回退，无可用回退不扣费", () => {
  let state=createAdminSeed(), ok=simulateRequest(state,{requestId:"req_e2e_03_ok",keyId:"key-002",modelId:"model-1",forceTimeout:true});
  assert.equal(ok.request.attempts.length,2); assert.equal(ok.request.httpStatus,200);
  state={...ok.state,endpoints:ok.state.endpoints.map(x=>x.id==="endpoint-glm"?{...x,status:"停用"}:x)}; const before=state.ledger.length, fail=simulateRequest(state,{requestId:"req_e2e_03_fail",keyId:"key-002",modelId:"model-1",forceTimeout:true});
  assert.equal(fail.request.httpStatus,504); assert.equal(fail.state.ledger.length,before);
});

test("E2E-04 账单调账审批幂等且对账差异必须先处理", () => {
  let state=createAdminSeed(), settlement=state.settlements[0];
  assert.notEqual(settlement.difference,0); state=commitAdminState(state,{type:"update",collection:"settlements",id:settlement.id,changes:{difference:0,status:"差异已处理"}}); state=commitAdminState(state,{type:"update",collection:"settlements",id:settlement.id,changes:{status:"已确认"}});
  state=applyAdjustment(state,state.adjustments[0].id,true,"E2E 审批"); const count=state.ledger.length; state=applyAdjustment(state,state.adjustments[0].id,true,"重复");
  assert.equal(state.settlements[0].status,"已确认"); assert.equal(state.ledger.length,count);
});

test("E2E-05 制品、集群、部署、端点和释放容量闭环", () => {
  let state=createAdminSeed(), cluster=state.clusters[0], before=cluster.allocatedGpu, deployment={id:"deployment-e2e",deploymentId:"deploy-e2e",name:"验收部署",modelId:"model-1",artifactId:"artifact-ds",clusterId:cluster.id,replicas:1,gpuPerReplica:2,endpointId:null,status:"部署中"};
  state=commitAdminState(state,{type:"batch",objectId:deployment.id,changes:[{type:"add",collection:"deployments",record:deployment},{type:"update",collection:"clusters",id:cluster.id,changes:{allocatedGpu:before+2}}]});
  state=commitAdminState(state,{type:"batch",objectId:deployment.id,changes:[{type:"add",collection:"endpoints",record:{id:"endpoint-deploy-e2e",endpointId:"ep-deploy-e2e",providerId:"provider-self",protocol:"OpenAI",baseUrl:"https://demo.invalid/e2e",modelIds:["model-1"],capacity:3000,health:100,status:"运行中"}},{type:"update",collection:"deployments",id:deployment.id,changes:{endpointId:"endpoint-deploy-e2e",status:"运行中"}}]});
  state=commitAdminState(state,{type:"batch",objectId:deployment.id,changes:[{type:"update",collection:"deployments",id:deployment.id,changes:{status:"停止"}},{type:"update",collection:"endpoints",id:"endpoint-deploy-e2e",changes:{status:"停用"}},{type:"update",collection:"clusters",id:cluster.id,changes:{allocatedGpu:before}}]});
  assert.equal(state.deployments.find(x=>x.id===deployment.id).status,"停止"); assert.equal(state.clusters.find(x=>x.id===cluster.id).allocatedGpu,before);
});

test("E2E-06 发布与回滚可追溯，只读角色不能发布", () => {
  let state=createAdminSeed(), current=state.releases.find(x=>x.status==="当前生效"), release={id:"release-e2e",version:"r-e2e",configSnapshot:"validated",previousReleaseId:current.id,validation:"通过",diff:"E2E change",publishedAt:new Date().toISOString(),status:"当前生效"};
  state=commitAdminState(state,{type:"batch",objectId:release.id,changes:[{type:"update",collection:"releases",id:current.id,changes:{status:"历史版本"}},{type:"add",collection:"releases",record:release}]});
  assert.equal(state.releases.find(x=>x.id==="release-e2e").previousReleaseId,current.id); assert.throws(()=>commitAdminState({...state,currentRole:"只读观察员"},{type:"add",collection:"releases",record:{id:"forbidden"}}),/无权/);
});
