import { withAdminSession } from './admin-session-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminSeed as baseCreateAdminSeed, commitAdminState, persistAdminAction, STORAGE_KEY } from '../src/admin-v2/store.js';
import { deploymentPreflight, deploymentGpu, deploymentUsesArtifact } from '../src/admin-v2/deployments.js';
const values = { name:'知识问答服务', deploymentId:'qwen-test-prod', modelId:'model-1', runtimeId:'artifact-vllm', weightId:'', weightPath:'/models/deepseek', clusterId:'cluster-nj-a', namespace:'inference', replicas:2, gpuPerReplica:2, tensorParallel:2, pipelineParallel:1, maxModelLen:'', gpuMemoryUtilization:0.9, startupTimeout:600 };
const act = (state, operation, data={}, deploymentId) => commitAdminState(state,{type:'deploymentOperation',operation,data,deploymentId});
function created(){let state=act(createAdminSeed(),'create',values);return {state,id:state.deployments[0].id};}
function running(){let {state,id}=created();state=act(state,'check',{},id);return {state,id};}
const clusterGpu = state => state.clusters.find(item=>item.id===values.clusterId).allocatedGpu;

test('create atomically reserves resources and keeps model publishing and prices separate',()=>{
 const seed=createAdminSeed(),before=structuredClone(seed),state=act(seed,'create',values);
 assert.deepEqual(seed,before);assert.equal(state.deployments[0].status,'部署中');assert.equal(state.deployments[0].readyReplicas,0);assert.equal(state.deployments[0].endpointId,null);assert.equal(clusterGpu(state),clusterGpu(seed)+4);
 for(const key of ['models','modelSupplies','modelSalePrices','prices','orders','ledger'])assert.deepEqual(state[key],seed[key]);
});
test('preflight rejects wrong model, base images, broken weights, malformed paths and parallelism',()=>{
 const seed=createAdminSeed();
 for(const data of [{modelId:'missing'},{runtimeId:'artifact-ds'},{runtimeId:'artifact-base'},{weightId:'artifact-vllm'},{weightPath:'/models/../secrets'},{weightPath:'/models/name;curl'},{tensorParallel:1},{replicas:1.5},{replicas:0},{gpuMemoryUtilization:0},{namespace:'Production!'},{startupTimeout:7201}]) assert.throws(()=>deploymentPreflight(seed,{...values,...data}));
 const unsupported=seed.models.find(model=>!['text','multimodal','embedding','rerank'].includes(model.type));assert.throws(()=>deploymentPreflight(seed,{...values,modelId:unsupported.id}),/不支持/);
 seed.artifacts.find(item=>item.id==='artifact-ds').modelId='another';assert.throws(()=>deploymentPreflight(seed,{...values,weightId:'artifact-ds'}),/不匹配/);
});
test('insufficient capacity and maintenance clusters never write partial reservations',()=>{
 const seed=createAdminSeed(),before=JSON.stringify(seed);assert.throws(()=>act(seed,'create',{...values,replicas:100}),/容量不足/);assert.throws(()=>act(seed,'create',{...values,clusterId:'cluster-nj-test'}),/运行中/);assert.equal(JSON.stringify(seed),before);
});
test('create checks unique DNS deployment codes and service names',()=>{
 const {state}=created();assert.throws(()=>act(state,'create',values),/已存在/);for(const data of [{deploymentId:'BAD_ID'},{deploymentId:''},{name:' '.repeat(5)}])assert.throws(()=>act(createAdminSeed(),'create',{...values,...data}));
});
test('readiness creates only one internal endpoint and records events without made-up metrics',()=>{
 let {state,id}=created();const count=state.endpoints.length;state=act(state,'check',{},id);const item=state.deployments.find(item=>item.id===id),endpoint=state.endpoints.find(ep=>ep.id===item.endpointId);assert.equal(item.readyReplicas,2);assert.equal(item.status,'运行中');assert.equal(state.endpoints.length,count+1);assert.equal(endpoint.capacity,null);assert.equal(endpoint.health,null);assert.equal(endpoint.providerId,'provider-self');assert.equal(item.events.length,2);assert.throws(()=>act(state,'check',{},id),/没有待检查/);
});
test('failed startup releases reservations exactly once and can retry after repair',()=>{
 let {state,id}=created();state.artifacts.find(item=>item.id==='artifact-vllm').validation='失败';state=act(state,'check',{},id);assert.equal(clusterGpu(state),36);assert.equal(state.deployments[0].status,'失败');assert.match(state.deployments[0].failureReason,/运行时/);assert.equal(state.deployments[0].endpointId,null);
 state=act(state,'stop',{},id);assert.equal(clusterGpu(state),36);assert.throws(()=>act(state,'stop',{},id),/已经停止/);state.artifacts.find(item=>item.id==='artifact-vllm').validation='通过';state=act(state,'start',{},id);assert.equal(clusterGpu(state),40);state=act(state,'check',{},id);assert.equal(state.deployments[0].status,'运行中');
});
test('stop and restart reuse endpoints and never double-release other cluster allocations',()=>{
 let {state,id}=running();const ep=state.deployments[0].endpointId,n=state.endpoints.length;state=act(state,'stop',{},id);assert.equal(clusterGpu(state),36);assert.equal(deploymentGpu(state.deployments[0]),0);assert.equal(state.endpoints.find(item=>item.id===ep).status,'停用');assert.throws(()=>act(state,'stop',{},id));state=act(state,'start',{},id);state=act(state,'check',{},id);assert.equal(state.endpoints.length,n);assert.equal(state.deployments[0].endpointId,ep);assert.equal(clusterGpu(state),40);
});
test('scale keeps readiness separate, enforces integer bounds and recomputes current capacity',()=>{
 let {state,id}=running();assert.throws(()=>act(state,'scale',{replicas:2},id),/未变化/);assert.throws(()=>act(state,'scale',{replicas:100},id),/容量不足/);assert.throws(()=>act(state,'scale',{replicas:-1},id));state=act(state,'scale',{replicas:3},id);assert.equal(state.deployments[0].status,'扩缩容中');assert.equal(state.deployments[0].readyReplicas,2);assert.equal(clusterGpu(state),42);assert.throws(()=>act(state,'scale',{replicas:4},id),/仅运行/);state=act(state,'check',{},id);assert.equal(state.deployments[0].readyReplicas,3);state=act(state,'scale',{replicas:1},id);assert.equal(clusterGpu(state),38);state=act(state,'check',{},id);assert.equal(state.deployments[0].readyReplicas,1);
});
test('update and rollback preserve stable configuration, endpoints and allocation',()=>{
 let {state,id}=running();const ep=state.deployments[0].endpointId;assert.throws(()=>act(state,'update',{},id),/未变化/);state=act(state,'update',{maxModelLen:4096},id);assert.equal(state.deployments[0].status,'更新中');assert.equal(state.deployments[0].previousConfig.maxModelLen,null);assert.equal(state.deployments[0].configRevision,2);assert.equal(state.endpoints.find(item=>item.id===ep).status,'停用');assert.equal(clusterGpu(state),40);state=act(state,'check',{},id);state=act(state,'rollback',{},id);assert.equal(state.deployments[0].maxModelLen,null);assert.equal(state.deployments[0].configRevision,3);state=act(state,'check',{},id);assert.equal(state.deployments[0].endpointId,ep);assert.equal(state.deployments[0].readyReplicas,2);
});
test('old records remain unchanged, require full configuration for startup, and allow safe stop/scale',()=>{
 const seed=createAdminSeed(),id='deployment-bge';let state=act(seed,'check',{},id);assert.equal(state.deployments.find(item=>item.id===id).status,'失败');assert.equal(clusterGpu(state),32);assert.equal(seed.deployments.find(item=>item.id===id).status,'部署中');assert.throws(()=>act(state,'start',{},id),/运行时/);
 state=act(seed,'update',{...values,modelId:'model-1',clusterId:'cluster-nj-a',replicas:4,gpuPerReplica:4,tensorParallel:4},'deployment-ds');assert.equal(state.deployments.find(item=>item.id==='deployment-ds').previousConfig,null);
});
test('runtime, weight and rollback artifact references prevent deletion',()=>{
 let {state,id}=running();state.artifacts.push({...state.artifacts.find(item=>item.id==='artifact-ds'),id:'artifact-new-weight'});state=act(state,'update',{weightId:'artifact-new-weight',weightPath:''},id);assert.equal(deploymentUsesArtifact(state.deployments[0],'artifact-new-weight'),true);assert.throws(()=>commitAdminState(state,{type:'update',collection:'artifacts',id:'artifact-new-weight',changes:{status:'已删除'}}),/引用/);
 state=act(state,'check',{},id);state=act(state,'update',{weightId:'',weightPath:'/models/new'},id);assert.equal(deploymentUsesArtifact(state.deployments[0],'artifact-new-weight'),true);assert.throws(()=>commitAdminState(state,{type:'update',collection:'artifacts',id:'artifact-new-weight',changes:{status:'已删除'}}),/引用/);
});
test('role restrictions, revision conflicts and failed storage preserve all data',()=>{
 const seed=createAdminSeed();for(const role of ['运营人员','财务人员','只读观察员'])assert.throws(()=>commitAdminState(seed,{type:'deploymentOperation',operation:'create',data:values},role),/无权/);assert.equal(commitAdminState(seed,{type:'deploymentOperation',operation:'create',data:values},'运维人员').deployments[0].status,'部署中');
 const action={type:'deploymentOperation',operation:'create',data:values};assert.throws(()=>persistAdminAction(seed,action,{getItem:()=>JSON.stringify({...seed,revision:99}),setItem:()=>assert.fail('must not save')}),/数据已变化/);assert.throws(()=>persistAdminAction(seed,action,{getItem:key=>{assert.equal(key,STORAGE_KEY);return JSON.stringify(seed)},setItem:()=>{throw new Error('quota')}}),/quota/);assert.equal(seed.deployments.length,3);
});

test('failed and stopped deployments can repair configuration and reserve only the new target',()=>{
 for(const status of ['失败','停止']) {let {state,id}=running();state=act(state,'stop',{},id);state.deployments[0].status=status;state=act(state,'update',{maxModelLen:4096},id);assert.equal(state.deployments[0].status,'更新中');assert.equal(clusterGpu(state),40);state=act(state,'check',{},id);assert.equal(state.deployments[0].status,'运行中');assert.equal(state.deployments[0].readyReplicas,2);}
 const seed=createAdminSeed();let state=act(seed,'check',{},'deployment-bge');state=act(state,'update',{...values,modelId:seed.deployments.find(item=>item.id==='deployment-bge').modelId},'deployment-bge');assert.equal(state.deployments.find(item=>item.id==='deployment-bge').status,'更新中');assert.equal(clusterGpu(state),36);
});

function createAdminSeed(...args) { return withAdminSession(baseCreateAdminSeed(...args)); }
